using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

public class Book
{
    // --- Catalog identity and optimistic concurrency ---
    public int Id { get; set; }
    // Opaque concurrency token. New tokens also prevent edits surviving a demo reset.
    // Existing saved books without this field receive a token when loaded.
    public Guid Revision { get; set; } = Guid.NewGuid();
    // --- Listing details, pricing, and inventory ---
    public string Isbn { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Author { get; set; } = string.Empty;
    public string Genre { get; set; } = string.Empty;
    [JsonRequired]
    public decimal Price { get; set; }
    [JsonRequired]
    public int Inventory { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Image { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    // null/false = automatic availability; true = forced out of stock.
    // Zero physical inventory always remains unavailable.
    public bool? ManualStockOverride { get; set; }
    // Optional reading-sequence metadata; decimals allow prequels/interstitial books.
    public string? SeriesName { get; set; }
    public decimal? SeriesOrder { get; set; }
}
