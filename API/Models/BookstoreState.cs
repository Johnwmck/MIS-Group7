using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

// Books, orders, and customer accounts are saved together so purchases cannot
// persist partially.
public class BookstoreState
{
    [JsonRequired]
    public int Version { get; set; } = 1;
    [JsonRequired]
    public List<Book> Books { get; set; } = new();
    [JsonRequired]
    public List<Order> Orders { get; set; } = new();
    [JsonRequired]
    public int NextBookId { get; set; }
    [JsonRequired]
    public int NextOrderId { get; set; } = 1;
    // Not required, so files saved before customer accounts existed still load.
    public List<Customer> Customers { get; set; } = new();
    public int NextCustomerId { get; set; } = 1;
}
