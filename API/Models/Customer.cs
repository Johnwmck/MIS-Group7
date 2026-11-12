namespace Team7Books.Api.Models;

// A saved customer account. PasswordHash never leaves the server; API
// responses use CustomerProfile instead.
public class Customer
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    // Saved trimmed and lowercase, so sign-in ignores letter case.
    public string Email { get; set; } = string.Empty;
    // Optional; null when the customer leaves it blank.
    public string? Phone { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    // Saved cards. Accounts saved before payment methods existed load with none.
    public List<PaymentMethod> PaymentMethods { get; set; } = new();
    // Card IDs are never reused, so a checkout page left open cannot pick a
    // different card that took a removed card's ID.
    public int NextPaymentMethodId { get; set; } = 1;
    // Favorite book IDs in the order they were saved. Favorites belong to the
    // account, so only logged-in customers have them.
    public List<int> FavoriteBookIds { get; set; } = new();
}
