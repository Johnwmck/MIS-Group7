using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Rules for customers returning or cancelling their own orders. Client/scripts/
// account.js shows the same reasons in its form; keep the two lists in step.
public static class OrderRefundPolicy
{
    public const int WindowDays = 30;
    public const int MaxCommentsLength = 500;
    public const string Return = "Return";
    public const string Cancellation = "Cancellation";
    public const string OtherReason = "Other";

    public static readonly IReadOnlyDictionary<string, string[]> ReasonsByType = new Dictionary<string, string[]>
    {
        [Return] = new[]
        {
            "Damaged or defective", "Wrong item received", "No longer needed",
            "Ordered by mistake", "Found a better price", "Arrived too late", OtherReason
        },
        [Cancellation] = new[]
        {
            "Ordered by mistake", "No longer needed", "Found a better price",
            "Shipping takes too long", OtherReason
        }
    };

    // The last moment the order can be returned or cancelled.
    public static DateTimeOffset GetDeadline(Order order) => order.Date.AddDays(WindowDays);

    public static string? NormalizeComments(string? comments) =>
        string.IsNullOrWhiteSpace(comments) ? null : comments.Trim();

    public static string GetError(string? type, string? reason, string? comments)
    {
        if (type is null || !ReasonsByType.TryGetValue(type, out var reasons))
            return "Choose whether to return or cancel the order.";
        if (reason is null || !reasons.Contains(reason)) return "Choose a reason from the list.";

        var trimmed = NormalizeComments(comments);
        if (reason == OtherReason && trimmed is null) return "Describe your reason when you choose Other.";
        return trimmed is not null && trimmed.Length > MaxCommentsLength
            ? $"Keep comments to {MaxCommentsLength} characters or fewer."
            : "";
    }

    // The receipt refunds exactly what was paid. Pre-tax orders refund no tax.
    public static OrderRefund Create(Order order, OrderRefundRequest request, DateTimeOffset now) => new()
    {
        Type = request.Type!,
        Reason = request.Reason!,
        Comments = NormalizeComments(request.Comments),
        Date = now,
        Subtotal = order.Subtotal ?? order.Total,
        Tax = order.Tax ?? 0,
        Total = order.Total
    };
}
