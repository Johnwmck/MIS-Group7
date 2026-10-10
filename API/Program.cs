using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// --- API services and one shared persistent store ---

builder.Services.AddControllers();
builder.Services.AddSingleton<Team7Books.Api.Services.BookstoreStore>();

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

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = clientFiles
});

app.UseRouting();

app.UseAuthorization();
// This middleware alone does not enforce roles. Prototype login is browser-only;
// protected API endpoints still need server authentication before production.

app.MapControllers();

app.Run();
