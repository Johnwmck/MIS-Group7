using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Only one API process may own a state file. All mutations prepare a detached
// candidate, persist it, then publish it under the shared lock.
public sealed class BookstoreStore : IDisposable
{
    // --- Storage configuration and current state ---
    private static readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string statePath;
    private readonly string seedPath;
    private readonly FileStream ownership;
    private BookstoreState state;
    private readonly IConfiguration configuration;
    private readonly bool development;
    public List<Promotion> Promotions => state.Promotions;
    public List<RewardEntry> Rewards => state.Rewards;
    public List<StaffAccount> Staff => state.Staff;
    public object SyncRoot { get; } = new();
    public List<Book> Books => state.Books;
    public List<Order> Orders => state.Orders;
    public int NextBookId => state.NextBookId;
    public int NextOrderId => state.NextOrderId;
    public List<Customer> Customers => state.Customers;
    public int NextCustomerId => state.NextCustomerId;

    // --- Startup loading and exclusive file ownership ---
    // Saved state wins over seeds. A bad saved file must never trigger a reset.

    public BookstoreStore(IWebHostEnvironment environment, IConfiguration configuration)
    {
        this.configuration = configuration;
        development = environment.IsDevelopment();
        statePath = Path.GetFullPath(configuration["Bookstore:StatePath"] ??
            Path.Combine(environment.ContentRootPath, "App_Data", "bookstore-state.json"));
        seedPath = Path.GetFullPath(configuration["Bookstore:SeedPath"] ??
            Path.Combine(AppContext.BaseDirectory, "SeedData", "Team7_SeedBooks.csv"));
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        ownership = new FileStream(statePath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        try
        {
            if (File.Exists(statePath))
            {
                var savedJson = File.ReadAllText(statePath);
                using (var document = JsonDocument.Parse(savedJson))
                {
                    if (document.RootElement.TryGetProperty("version", out var version) && version.GetInt32() == 2)
                        foreach (var name in new[] { "customers", "promotions", "rewards", "staff", "nextCustomerId", "nextPromotionId", "nextStaffId" })
                            if (!document.RootElement.TryGetProperty(name, out _)) throw new InvalidDataException("Saved bookstore state is missing a version 2 field. It was not reset.");
                }
                state = JsonSerializer.Deserialize<BookstoreState>(savedJson, json)
                    ?? throw new InvalidDataException("Saved bookstore state is empty.");
                SavedStateValidation.Validate(state);
                var migrated = StateMigration.Apply(state, configuration, development);
                if (CatalogMetadataMigration.Apply(state, savedJson, seedPath) | migrated)
                {
                    SavedStateValidation.Validate(state);
                    WriteState(state);
                }
            }
            else
            {
                state = SeedCatalog.Load(seedPath);
                StateMigration.Apply(state, configuration, development);
                SavedStateValidation.Validate(state);
                WriteState(state);
            }
        }
        catch { ownership.Dispose(); throw; }
    }

    // --- Snapshot preparation and durable commit ---
    // Called only while SyncRoot is held. Deep-copy prevents failed saves from
    // changing the catalog, orders, or ID counters visible to other requests.
    public BookstoreState CreateSnapshot() =>
        JsonSerializer.Deserialize<BookstoreState>(JsonSerializer.Serialize(state, json), json)!;

    // Caller holds SyncRoot through validation, disk replacement, and publication.
    public void Commit(BookstoreState candidate)
    {
        SavedStateValidation.Validate(candidate);
        try { WriteState(candidate); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new StatePersistenceException("Unable to save bookstore data. No changes were applied.", error);
        }
        state = candidate;
    }

    // --- Explicit demo reset ---

    public void Reset()
    {
        lock (SyncRoot)
        {
            var clean = SeedCatalog.Load(seedPath);
            StateMigration.Apply(clean, configuration, development, createStaff: false);
            // Staff identities remain so the authorized operator stays signed in.
            clean.Staff = CreateSnapshot().Staff;
            clean.NextStaffId = state.NextStaffId;
            Commit(clean);
        }
    }

    // --- Atomic disk persistence ---
    // Keep the temporary file beside the state file for same-filesystem replacement.
    // Flush first; neither partial JSON nor failed writes should become live state.
    private void WriteState(BookstoreState candidate)
    {
        var temporary = statePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(stream, candidate, json);
                stream.Flush(flushToDisk: true);
            }
            if (File.Exists(statePath)) File.Replace(temporary, statePath, null);
            else File.Move(temporary, statePath);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    // --- Process-lifetime cleanup ---

    public void Dispose() => ownership.Dispose();
}

public sealed class StatePersistenceException : Exception
{
    public StatePersistenceException(string message, Exception inner) : base(message, inner) { }
}
