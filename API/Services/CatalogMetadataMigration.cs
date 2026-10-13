using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Conservative upgrade from the pre-enrichment seed. No heuristic overwrites of
// short/custom descriptions; matching ISBN and prior-seed fingerprint is required.
public static class CatalogMetadataMigration
{
    private static readonly Dictionary<string, string> aliases = new()
    {
        ["F. Scott Fitzgerald, Francis Scott Fitzgerald"] = "F. Scott Fitzgerald",
        ["Leo Tolstoy, Lev Tolstoi"] = "Leo Tolstoy",
        ["Helen Fielding, Хелен Филдинг"] = "Helen Fielding"
    };

    public static bool Apply(BookstoreState state, string savedJson, string seedPath)
    {
        var seeds = SeedCatalog.Load(seedPath).Books.ToDictionary(book => book.Isbn);
        var baseline = JsonSerializer.Deserialize<Dictionary<string, string>>(
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "SeedData", "description-baseline.json")))!;
        using var saved = JsonDocument.Parse(savedJson);
        var missingBio = saved.RootElement.GetProperty("books").EnumerateArray()
            .Where(book => !book.TryGetProperty("authorBio", out _))
            .Select(book => book.GetProperty("id").GetInt32()).ToHashSet();
        var changed = false;
        foreach (var book in state.Books)
        {
            if (aliases.TryGetValue(book.Author, out var author))
            {
                book.Author = author;
                changed = true;
            }
            if (!seeds.TryGetValue(book.Isbn, out var seed) || seed.Id != book.Id) continue;
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(book.Description ?? ""))).ToLowerInvariant();
            if (baseline.TryGetValue(book.Isbn, out var priorHash) && hash == priorHash &&
                book.Description != seed.Description)
            {
                book.Description = seed.Description;
                changed = true;
            }
            // An explicitly saved empty bio can be an intentional Admin edit.
            if (missingBio.Contains(book.Id) && book.AuthorBio != seed.AuthorBio)
            {
                book.AuthorBio = seed.AuthorBio;
                changed = true;
            }
        }
        return changed;
    }
}
