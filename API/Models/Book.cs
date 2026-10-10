using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

public class Book
{
    public int Id { get; set; }
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
    public bool? ManualStockOverride { get; set; }
    public string? SeriesName { get; set; }
    public decimal? SeriesOrder { get; set; }
}
