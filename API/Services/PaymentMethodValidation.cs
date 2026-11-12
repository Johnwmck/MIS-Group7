using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Saved-card rules shared by the account API, checkout, and saved-state loading.
// Each check returns "" when valid, otherwise a message the customer can act on.
public static class PaymentMethodValidation
{
    public const int MaxSavedCards = 10;
    public const int MaxNameLength = 60;
    public const int MaxYearsAhead = 20;
    public static readonly string[] Brands = { "Visa", "Mastercard", "American Express", "Discover" };

    // A card being added must also be unexpired and not absurdly far out.
    public static string GetNewCardError(AddPaymentMethodRequest request, DateTimeOffset now)
    {
        var error = GetCardError(request.Brand, request.Last4, request.ExpMonth, request.ExpYear, request.NameOnCard);
        if (error != "") return error;
        if (IsExpired(request.ExpMonth!.Value, request.ExpYear!.Value, now)) return "This card has expired.";
        if (request.ExpYear > now.Year + MaxYearsAhead) return "Enter a valid expiration year.";
        return "";
    }

    // Saved cards may expire over time, so this does not check the date.
    public static string GetCardError(string? brand, string? last4, int? expMonth, int? expYear, string? nameOnCard)
    {
        if (brand is null || !Brands.Contains(brand))
            return "We accept Visa, Mastercard, American Express, and Discover.";
        if (last4 is null || last4.Length != 4 || !last4.All(char.IsAsciiDigit))
            return "Enter a valid card number.";
        if (expMonth is null or < 1 or > 12) return "Enter a valid expiration month.";
        if (expYear is null or < 2000 or > 2100) return "Enter a valid expiration year.";
        if (string.IsNullOrWhiteSpace(nameOnCard)) return "Name on card is required.";
        return nameOnCard.Trim().Length > MaxNameLength
            ? $"Name on card must be {MaxNameLength} characters or fewer."
            : "";
    }

    // Cards work through the last day of their expiration month.
    public static bool IsExpired(int expMonth, int expYear, DateTimeOffset now) =>
        expYear < now.Year || (expYear == now.Year && expMonth < now.Month);

    public static bool IsExpired(PaymentMethod method, DateTimeOffset now) =>
        IsExpired(method.ExpMonth, method.ExpYear, now);

    // Saved on orders and shown on receipts.
    public static string Describe(PaymentMethod method) => Describe(method.Brand, method.Last4);

    public static string Describe(string brand, string last4) => $"{brand} ending in {last4}";

    // --- Saving cards (account page and checkout) ---
    // Callers validate the card with GetNewCardError, hold the store lock, and commit.

    // A saved card with the same type, last four digits, and expiration, or null.
    public static PaymentMethod? FindSame(Customer customer, AddPaymentMethodRequest card) =>
        customer.PaymentMethods.Find(saved => saved.Brand == card.Brand && saved.Last4 == card.Last4 &&
            saved.ExpMonth == card.ExpMonth && saved.ExpYear == card.ExpYear);

    // Why this account cannot save another card, or "".
    public static string GetSaveError(Customer customer)
    {
        if (customer.PaymentMethods.Count >= MaxSavedCards)
            return $"You can save up to {MaxSavedCards} cards. Remove one first.";
        return customer.NextPaymentMethodId == int.MaxValue ? "No further card IDs are available." : "";
    }

    // The first saved card always becomes the default.
    public static PaymentMethod AddCard(Customer customer, AddPaymentMethodRequest request)
    {
        var makeDefault = request.MakeDefault || customer.PaymentMethods.Count == 0;
        if (makeDefault) customer.PaymentMethods.ForEach(card => card.IsDefault = false);

        var added = new PaymentMethod
        {
            Id = customer.NextPaymentMethodId++,
            Brand = request.Brand!,
            Last4 = request.Last4!,
            ExpMonth = request.ExpMonth!.Value,
            ExpYear = request.ExpYear!.Value,
            NameOnCard = request.NameOnCard!.Trim(),
            IsDefault = makeDefault
        };
        customer.PaymentMethods.Add(added);
        return added;
    }
}
