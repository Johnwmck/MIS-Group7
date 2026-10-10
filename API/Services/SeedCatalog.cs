using System.Globalization;
using Microsoft.VisualBasic.FileIO;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

public static class SeedCatalog
{
    public static BookstoreState Load(string path)
    {
        using var csv = new TextFieldParser(path);
        csv.SetDelimiters(",");
        csv.HasFieldsEnclosedInQuotes = true;
        csv.TrimWhiteSpace = false;
        var expected = new[] { "id", "isbn", "title", "author", "genre", "price",
            "inventory", "status", "image", "description", "manualStockOverride",
            "seriesName", "seriesOrder" };
        if (!(csv.ReadFields() ?? Array.Empty<string>()).SequenceEqual(expected))
            throw new InvalidDataException("Seed CSV headers do not match the catalog schema.");

        var state = new BookstoreState();
        var ids = new HashSet<int>();
        var isbns = new HashSet<string>();
        while (!csv.EndOfData)
        {
            var fields = csv.ReadFields()!;
            if (fields.Length != expected.Length)
                throw new InvalidDataException("Seed CSV has an incorrect field count.");
            var book = new Book
            {
                Id = int.Parse(fields[0], CultureInfo.InvariantCulture),
                Isbn = fields[1],
                Title = fields[2],
                Author = fields[3],
                Genre = fields[4],
                Price = decimal.Parse(fields[5], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture),
                Inventory = int.Parse(fields[6], CultureInfo.InvariantCulture),
                Status = fields[7],
                Image = fields[8],
                Description = fields[9],
                ManualStockOverride = fields[10] == "" ? null : bool.Parse(fields[10]),
                SeriesName = fields[11] == "" ? null : fields[11],
                SeriesOrder = fields[12] == "" ? null :
                    decimal.Parse(fields[12], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture)
            };
            if (book.Id < 1 || !ids.Add(book.Id) || !isbns.Add(book.Isbn) ||
                CatalogValidation.GetError(book) != "")
                throw new InvalidDataException($"Seed CSV contains invalid book {book.Id}.");
            state.Books.Add(book);
        }
        if (state.Books.Count == 0) throw new InvalidDataException("Seed catalog is empty.");
        state.NextBookId = checked(state.Books.Max(book => book.Id) + 1);
        return state;
    }
}
