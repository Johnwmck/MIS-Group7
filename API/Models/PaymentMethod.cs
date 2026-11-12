namespace Team7Books.Api.Models;

// A saved card, kept for display and for choosing at checkout. This demo store
// charges nothing: the browser checks the full card number and sends only the
// card type, last four digits, and expiration, so the number is never stored.
public class PaymentMethod
{
    public int Id { get; set; }
    // One of PaymentMethodValidation.Brands, such as "Visa".
    public string Brand { get; set; } = string.Empty;
    public string Last4 { get; set; } = string.Empty;
    public int ExpMonth { get; set; }
    public int ExpYear { get; set; }
    public string NameOnCard { get; set; } = string.Empty;
    // Exactly one saved card is the default; checkout selects it first.
    public bool IsDefault { get; set; }
}
