using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

public class OrderItem
{
    public int BookId { get; init; }
    public string Title { get; init; } = string.Empty;
    [JsonRequired]
    public decimal Price { get; init; }
    public int Quantity { get; init; }
}
