using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

// Books and orders are saved together so purchases cannot persist partially.
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
}
