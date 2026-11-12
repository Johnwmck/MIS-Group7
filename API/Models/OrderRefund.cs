namespace Team7Books.Api.Models;

// The refund receipt saved when a customer returns or cancels an order. Whole
// orders only, so the refund always equals what the customer paid. The original
// sale stays in order history unchanged; this record is added beside it.
public class OrderRefund
{
    // "Return" or "Cancellation".
    public string Type { get; init; } = string.Empty;
    // One of OrderRefundPolicy.Reasons.
    public string Reason { get; init; } = string.Empty;
    // Required when the reason is "Other"; otherwise optional.
    public string? Comments { get; init; }
    public DateTimeOffset Date { get; init; }
    public decimal Subtotal { get; init; }
    public decimal Tax { get; init; }
    public decimal Total { get; init; }
}
