using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.FileProviders;
using Team7Books.Api.Models;

var builder = WebApplication.CreateBuilder(args);

// --- API services and one shared persistent store ---

builder.Services.AddControllers();
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

// --- Customer assistant: local Ollama model with a scripted fallback ---
builder.Services.AddHttpClient<Team7Books.Api.Services.OllamaClient>();
builder.Services.AddSingleton<Team7Books.Api.Services.AssistantTools>();
builder.Services.AddSingleton<Team7Books.Api.Services.FallbackAssistant>();
builder.Services.AddSingleton<Team7Books.Api.Services.AssistantService>();

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

app.UseAuthentication();
app.UseAuthorization();
// Customer logins use the server cookie above. Staff login is still
// browser-only; protected staff endpoints need server authentication before
// production.

app.MapControllers();

app.Run();
