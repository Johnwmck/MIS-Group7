using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Shared by catalog requests, CSV seeds, and saved-state validation.
public static class CatalogValidation
{
    // --- ISBN normalization and checksum validation ---
    public static string NormalizeIsbn(string? isbn) =>
        (isbn ?? "").Trim().Replace("-", "").Replace(" ", "");

    public static bool IsValidIsbn(string? value)
    {
        var isbn = NormalizeIsbn(value);
        if (isbn.Length == 13 && isbn.All(char.IsAsciiDigit) &&
            (isbn.StartsWith("978") || isbn.StartsWith("979")))
            return isbn.Select((digit, index) => (digit - '0') * (index % 2 == 0 ? 1 : 3)).Sum() % 10 == 0;
        if (isbn.Length == 10 && isbn.Take(9).All(char.IsAsciiDigit) &&
            (char.IsAsciiDigit(isbn[9]) || isbn[9] is 'X' or 'x'))
            return isbn.Select((digit, index) =>
                (digit is 'X' or 'x' ? 10 : digit - '0') * (10 - index)).Sum() % 11 == 0;
        return false;
    }

    // --- Money and complete catalog-record validation ---
    // Check exact decimal values; reject fractional cents instead of rounding input.
    public static bool IsMoney(decimal value) =>
        value >= 0 && value == decimal.Round(value, 2);

    public static string GetError(Book book)
    {
        if (book.Revision == Guid.Empty)
            return "The book revision is invalid. Reload the current catalog.";
        if (string.IsNullOrWhiteSpace(book.Title) || string.IsNullOrWhiteSpace(book.Author) ||
            string.IsNullOrWhiteSpace(book.Genre) || string.IsNullOrWhiteSpace(book.Image))
            return "Required book information is missing.";
        if (!IsValidIsbn(book.Isbn))
            return "ISBN must be a valid ISBN-10 or ISBN-13, including its check digit.";
        if (!IsMoney(book.Price))
            return "Price must be nonnegative with no more than two decimal places.";
        if (book.Inventory < 0)
            return "Inventory cannot be negative.";
        if (book.SeriesOrder < 0 ||
            (book.SeriesOrder is not null && string.IsNullOrWhiteSpace(book.SeriesName)))
            return "Series order must be nonnegative and requires a series name.";
        if (book.Status != "Active" && book.Status != "Inactive")
            return "Status must be Active or Inactive.";
        return "";
    }
}
