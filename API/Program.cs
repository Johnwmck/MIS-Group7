using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

var app = builder.Build();

// Configure the HTTP request pipeline.

if(!app.Environment.IsDevelopment())
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
