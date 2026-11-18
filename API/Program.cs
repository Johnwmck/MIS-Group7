using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.FileProviders;
using Team7Books.Api.Models;

var apiDirectory = Team7Books.Api.Services.LocalEnvironment.ApiDirectory();
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = apiDirectory });
// File defaults are deliberately lower priority than real environment/command line values.
builder.Configuration.AddInMemoryCollection(Team7Books.Api.Services.LocalEnvironment.Read(apiDirectory))
    .AddEnvironmentVariables().AddCommandLine(args);
if (!Team7Books.Api.Services.LocalKeySetup.EnsureKey(builder.Configuration, builder.Environment.IsDevelopment(), apiDirectory))
{
    Environment.ExitCode = 1;
    return;
}
// An interactive entry becomes a real environment variable for this process.
builder.Configuration.AddEnvironmentVariables().AddCommandLine(args);

// --- API services and one shared persistent store ---

builder.Services.AddControllers();
builder.Services.AddAuthorization();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<Team7Books.Api.Services.BookstoreStore>();

// --- Customer accounts: hashed passwords and a login cookie ---
builder.Services.AddSingleton<IPasswordHasher<Customer>, PasswordHasher<Customer>>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "Team7Books.Customer";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        // API callers get status codes, not redirects to a login page.
        options.Events.OnValidatePrincipal = context =>
        {
            var store = context.HttpContext.RequestServices.GetRequiredService<Team7Books.Api.Services.BookstoreStore>();
            lock (store.SyncRoot)
                if (!Team7Books.Api.Services.StoreSession.IsValid(context.Principal!, store)) context.RejectPrincipal();
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });

// Provider transport is independent of catalog and account services.
builder.Services.AddHttpClient<Team7Books.Api.Services.MisModelClient>(client => client.Timeout = Timeout.InfiniteTimeSpan);
builder.Services.AddScoped<Team7Books.Api.Services.AssistantTools>();
builder.Services.AddScoped<Team7Books.Api.Services.AssistantService>();

var app = builder.Build();
// Fail startup on corrupt saved data; never silently overwrite it with seeds.
app.Services.GetRequiredService<Team7Books.Api.Services.BookstoreStore>();
// --- Persistence failure responses ---
// Only confirmed save failures become 503 here; other exceptions are not hidden.
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (Team7Books.Api.Services.StatePersistenceException error)
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = error.Message });
    }
});

// --- Same-origin client hosting and request routing ---

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

var clientPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "Client"));

var clientFiles = new PhysicalFileProvider(clientPath);

app.UseDefaultFiles(new DefaultFilesOptions
{
    FileProvider = clientFiles
});

// no-cache = revalidate via ETag on every load, so a page and its scripts
// never mix old and new versions after a change.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = clientFiles,
    OnPrepareResponse = context =>
        context.Context.Response.Headers.CacheControl = "no-cache"
});

app.UseRouting();

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        if (context.Request.Method is not ("GET" or "HEAD" or "OPTIONS") &&
            context.Request.Headers.Origin is var origin && origin.Count > 0 &&
            (!Uri.TryCreate(origin.ToString(), UriKind.Absolute, out var uri) || uri.Authority != context.Request.Host.Value || uri.Scheme != context.Request.Scheme))
        {
            context.Response.StatusCode = 403;
            await context.Response.WriteAsJsonAsync(new { error = "Use this store's own page to submit changes." });
            return;
        }
    }
    await next(context);
});
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/api/session-context", (HttpContext context) => {
    context.Response.Headers.CacheControl = "no-store";
    var user = context.User;
    var identity = user.Identity?.IsAuthenticated == true
        ? string.Join("|", user.Claims.OrderBy(c => c.Type).Select(c => c.Type + "=" + c.Value)) : "guest";
    return Results.Ok(new { context = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(identity))) });
});


app.MapControllers();

app.Run();
