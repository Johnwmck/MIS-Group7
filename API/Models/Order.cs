using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

// A completed sale snapshot; catalog edits must not rewrite order history.
public class Order
{
    public int Id { get; init; }
    public DateTimeOffset Date { get; init; }
    public string CustomerName { get; init; } = string.Empty;
    public string CustomerEmail { get; init; } = string.Empty;
    public IReadOnlyList<OrderItem> Items { get; init; } = Array.Empty<OrderItem>();
    [JsonRequired]
    public decimal Total { get; init; }
    // Nullable keeps pre-tax historical orders readable without changing past sales.
    public decimal? Subtotal { get; init; }
    public decimal? TaxRate { get; init; }
    public decimal? Tax { get; init; }
    // Set by the server when a logged-in customer checks out, so the order shows
    // in their account. Null for guest orders and orders saved before accounts.
    public int? CustomerId { get; init; }
    // The saved card chosen at checkout, as text such as "Visa ending in 4242",
    // so later card changes cannot rewrite the receipt. Null when none was chosen.
    public string? PaymentMethod { get; init; }
    // Added once if the customer returns or cancels the order; null otherwise.
    public OrderRefund? Refund { get; set; }
}
