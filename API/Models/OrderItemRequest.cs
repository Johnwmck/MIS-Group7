using System.ComponentModel.DataAnnotations;

namespace Team7Books.Api.Models;

public class OrderItemRequest
{
    // IDs identify catalog records; quantity is the requested number of copies.
    [Range(1, int.MaxValue)]
    public int BookId { get; set; }

    [Range(1, int.MaxValue)]
    public int Quantity { get; set; }

    // A review check, not price authority. Nullable distinguishes missing from free.
    [Required]
    [Range(typeof(decimal), "0", "79228162514264337593543950335")]
    public decimal? Price { get; set; }
}
