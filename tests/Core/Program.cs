using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

var passed = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS " + message); passed++; }
var now = DateTimeOffset.UtcNow;
var b = new Book { Id = 1, Price = 10.05m };
var publicOffer = new Promotion { Id = 1, Name = "Public", BookIds = new() { 1 }, PercentOff = 10, StartsAt = now.AddDays(-1), EndsAt = now.AddDays(1) };
var memberOffer = new Promotion { Id = 2, Name = "Member", BookIds = new() { 1 }, PercentOff = 20, MembersOnly = true, StartsAt = now.AddDays(-1), EndsAt = now.AddDays(1) };
var offers = new[] { publicOffer, memberOffer };
Check(PricingService.Price(b, PricingService.Best(b, offers, false, now)) == 9.05m, "public cent rounding away from zero");
Check(PricingService.Price(b, PricingService.Best(b, offers, true, now)) == 8.04m, "best member offer does not stack");
Check(PricingService.Best(b, offers, true, publicOffer.EndsAt) is null, "exclusive promotion end");
Check(PricingService.Best(b, offers, true, publicOffer.StartsAt) == memberOffer, "inclusive promotion start");
Check(PricingService.MaxRedemption(199, 4.99m) == 0 && PricingService.MaxRedemption(199, 5) == 100 && PricingService.MaxRedemption(-20, 100) == 0, "rewards bounded to balance and merchandise in full blocks");
Check(PricingService.Money((10.05m - 5m) * .10m) == .51m, "tax after redemption rounds once");
string Event(object delta, string? finish = null) => "data: " + JsonSerializer.Serialize(new { choices = new[] { new { index = 0, delta, finish_reason = finish } } }) + "\n\n";
var stream = Event(new { content = "Hello " }) + Event(new { content = "reader" }) + Event(new { }, "stop") + "data: [DONE]\n\n";
var text = await MisModelClient.ReadStreamAsync(new StringReader(stream), default);
Check(text.Content == "Hello reader", "streamed text assembles");
stream = Event(new { tool_calls = new[] { new { index = 0, id = "call_1", function = new { name = "add_to_cart", arguments = "{\"book" } } } }) +
    Event(new { tool_calls = new[] { new { index = 0, function = new { arguments = "_id\":9,\"quantity\":2}" } } } }) + Event(new { }, "tool_calls") + "data: [DONE]\n\n";
var tool = await MisModelClient.ReadStreamAsync(new StringReader(stream), default);
Check(tool.ToolCalls![0].Function.Arguments == "{\"book_id\":9,\"quantity\":2}", "fragmented tool arguments assemble only after completion");
foreach (var invalid in new[] { stream.Replace("data: [DONE]\n\n", ""), stream.Replace("tool_calls\"}", "length\"}"),
    Event(new { tool_calls = new[] { new { index = 0, id = "bad", function = new { name = "add_to_cart", arguments = "{broken" } } } }) + Event(new { }, "tool_calls") + "data: [DONE]\n\n" })
{
    try { await MisModelClient.ReadStreamAsync(new StringReader(invalid), default); throw new Exception("Accepted incomplete stream"); }
    catch (JsonException) { Check(true, "truncated, length-limited or malformed stream rejected"); }
}
var root = Path.GetFullPath(args.Length > 0 ? args[0] : Directory.GetCurrentDirectory());
var temporary = Path.Combine(Path.GetTempPath(), "team7-core-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(temporary);
try
{
    var statePath = Path.Combine(temporary, "state.json");
    var seed = Path.Combine(root, "Seed Data", "Team7_SeedBooks.csv");
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Bookstore:StatePath"] = statePath, ["Bookstore:SeedPath"] = seed }).Build();
    var env = new TestEnvironment { ContentRootPath = Path.Combine(root, "API") };
    var legacy = SeedCatalog.Load(seed);
    var first = legacy.Books[0]; first.Description = "Custom preserved description"; first.Inventory = 42; first.SeriesOrder = .5m;
    legacy.Orders.Add(new Order { Id = 1, Date = now.AddYears(-1), CustomerName = "Historical Guest", CustomerEmail = "old@example.com",
        Items = new[] { new OrderItem { BookId = first.Id, Title = "Original paid title", Price = 3.25m, Quantity = 2 } }, Total = 6.50m });
    legacy.NextOrderId = 2;
    File.WriteAllText(statePath, JsonSerializer.Serialize(legacy, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    using (var store = new BookstoreStore(env, config))
    {
        Check(store.Books[0].Description == first.Description && store.Books[0].Inventory == 42 && store.Books[0].Isbn == first.Isbn && store.Books[0].SeriesOrder == .5m, "legacy migration preserves custom catalog metadata and exact ISBN");
        Check(store.Orders[0].Total == 6.50m && store.Orders[0].Tax is null && store.Orders[0].Items[0].Price == 3.25m && store.Orders[0].PointsEarned == 0, "untaxed historical receipts retain original price and total without retroactive rewards");
        Check(store.Promotions.Count == 2 && store.Staff.Count == 2, "legacy membership/staff migration");
        var before = File.ReadAllText(statePath);
        File.Move(statePath, statePath + ".backup"); Directory.CreateDirectory(statePath);
        try { lock(store.SyncRoot) { var state = store.CreateSnapshot(); state.Books[0].Inventory = 1; store.Commit(state); } throw new Exception("Save unexpectedly succeeded"); }
        catch (StatePersistenceException) { Check(store.Books[0].Inventory == 42, "failed atomic replacement leaves live state unchanged"); }
        Directory.Delete(statePath); File.Move(statePath + ".backup", statePath);
        Check(File.ReadAllText(statePath) == before, "failed save preserves previous durable file");
    }
    using (var restarted = new BookstoreStore(env, config)) Check(restarted.Books[0].Inventory == 42 && restarted.Promotions.Count == 2, "migrated state survives restart without duplicate seed offers");
    // Exercise the actual local saved snapshot on a copy, without exposing or touching personal state.
    var local = Path.Combine(root, "API", "App_Data", "bookstore-state.json");
    if (File.Exists(local))
    {
        File.Copy(local, statePath, true);
        var original = JsonSerializer.Deserialize<BookstoreState>(File.ReadAllText(local), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        using var migrated = new BookstoreStore(env, config);
        Check(migrated.Books.Select(b => (b.Id,b.Isbn,b.SeriesOrder,b.Inventory)).SequenceEqual(original.Books.Select(b => (b.Id,b.Isbn,b.SeriesOrder,b.Inventory))) &&
            JsonSerializer.Serialize(migrated.Orders) == JsonSerializer.Serialize(original.Orders), "copy of existing local snapshot retains catalog identities, stock, series and order history");
    }
    File.WriteAllText(statePath, "{broken");
    try { using var broken = new BookstoreStore(env, config); throw new Exception("Corruption was accepted"); }
    catch (JsonException) { Check(File.ReadAllText(statePath) == "{broken", "corruption stops startup without replacing data"); }
    var dotenv = Path.Combine(temporary, ".env"); File.WriteAllText(dotenv, "MIS_LLM_KeY='placeholder'\nMIS_LLM_MODEL=test\n");
    Check(LocalEnvironment.Read(temporary)["MIS_LLM_KEY"] == "placeholder", "handout key spelling and quoted dotenv values supported");
    LocalKeySetup.SaveKey(temporary, "test-key-for-local-checks");
    var defaults = LocalEnvironment.Read(temporary);
    Check(defaults["MIS_LLM_KEY"] == "test-key-for-local-checks" && defaults["MIS_LLM_MODEL"] == "test", "secure key setup preserves other dotenv settings and replaces handout alias");
    if (!OperatingSystem.IsWindows()) Check(File.GetUnixFileMode(dotenv) == (UnixFileMode.UserRead | UnixFileMode.UserWrite), "saved dotenv permits only owner read/write");
    var originalKey = Environment.GetEnvironmentVariable("MIS_LLM_KEY");
    try
    {
        Environment.SetEnvironmentVariable("MIS_LLM_KEY", "environment-test-key");
        var layered = new ConfigurationBuilder().AddInMemoryCollection(defaults).AddEnvironmentVariables().Build();
        Check(layered["MIS_LLM_KEY"] == "environment-test-key", "real environment takes precedence over dotenv");
    }
    finally { Environment.SetEnvironmentVariable("MIS_LLM_KEY", originalKey); }
    Check(AssistantTools.DuplicateChoice("only missing entries") == false && AssistantTools.DuplicateChoice("include extra copies") == true && AssistantTools.DuplicateChoice("yes") is null, "duplicate choices come from the customer and ambiguous yes stays unresolved");
    Check(AssistantTools.HasCartIntent("Can you add two copies?") && !AssistantTools.HasCartIntent("How do I add books?") && !AssistantTools.HasCartIntent("Do not add books"), "assistant actions require affirmative intent");
}
finally { Directory.Delete(temporary, true); }
Console.WriteLine($"{passed} core checks passed.");

sealed class TestEnvironment : IWebHostEnvironment
{
    public string EnvironmentName { get; set; } = "Development";
    public string ApplicationName { get; set; } = "Checks";
    public string WebRootPath { get; set; } = "";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string ContentRootPath { get; set; } = "";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
