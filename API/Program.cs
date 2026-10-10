using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSingleton<Team7Books.Api.Services.BookstoreStore>();

var app = builder.Build();
// Fail startup on corrupt saved data; never silently overwrite it with seeds.
app.Services.GetRequiredService<Team7Books.Api.Services.BookstoreStore>();
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (Team7Books.Api.Services.StatePersistenceException error)
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = error.Message });
    }
});

// Configure the HTTP request pipeline.

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

app.MapControllers();

app.Run();
