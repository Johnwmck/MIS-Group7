using System.ComponentModel.DataAnnotations;

namespace Team7Books.Api.Models;

// Customer input only. IDs, dates, titles, and totals are assigned by the server.
public class CreateOrderRequest
{
    [Required]
    public string CustomerName { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string CustomerEmail { get; set; } = string.Empty;

    [Required]
    [MinLength(1)]
    public List<OrderItemRequest> Items { get; set; } = new();

    // Payment is required: exactly one of PaymentMethodId (a saved card of the
    // logged-in customer) or NewCard (a card typed at checkout).
    public int? PaymentMethodId { get; set; }

    // Only the card type, last four digits, expiration, and name; never the full number.
    public AddPaymentMethodRequest? NewCard { get; set; }

    // Also save NewCard to the logged-in customer's account with the order.
    public bool SaveNewCard { get; set; }
}
