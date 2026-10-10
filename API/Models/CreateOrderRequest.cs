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
}
