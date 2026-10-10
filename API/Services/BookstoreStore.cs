using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Only one API process may own a state file. All mutations prepare a detached
// candidate, persist it, then publish it under the shared lock.
public sealed class BookstoreStore : IDisposable
{
    private static readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string statePath;
    private readonly string seedPath;
    private readonly FileStream ownership;
    private BookstoreState state;
    public object SyncRoot { get; } = new();
    public List<Book> Books => state.Books;
    public List<Order> Orders => state.Orders;
    public int NextBookId => state.NextBookId;
    public int NextOrderId => state.NextOrderId;

    public BookstoreStore(IWebHostEnvironment environment, IConfiguration configuration)
    {
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
                state = JsonSerializer.Deserialize<BookstoreState>(File.ReadAllText(statePath), json)
                    ?? throw new InvalidDataException("Saved bookstore state is empty.");
                SavedStateValidation.Validate(state);
            }
            else
            {
                state = SeedCatalog.Load(seedPath);
                SavedStateValidation.Validate(state);
                WriteState(state);
            }
        }
        catch { ownership.Dispose(); throw; }
    }

    // Called only while SyncRoot is held. Deep-copy prevents failed saves from
    // changing the catalog, orders, or ID counters visible to other requests.
    public BookstoreState CreateSnapshot() =>
        JsonSerializer.Deserialize<BookstoreState>(JsonSerializer.Serialize(state, json), json)!;

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

    public void Reset()
    {
        lock (SyncRoot) { Commit(SeedCatalog.Load(seedPath)); }
    }

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

    public void Dispose() => ownership.Dispose();
}

public sealed class StatePersistenceException : Exception
{
    public StatePersistenceException(string message, Exception inner) : base(message, inner) { }
}
