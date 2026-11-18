using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

public static class PricingService
{
    public const decimal TaxRate = .10m;
    public const string RewardsRule = "Earn 1 point per whole dollar of merchandise after discounts and rewards, excluding tax. Redeem 100 points for $5, in whole 100-point increments, up to your available balance and merchandise subtotal. The best eligible public or member offer applies per book; percentage offers do not stack. Rewards apply before 10% sales tax. New points become available after the purchase completes.";
    public static decimal Money(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);
    public static Promotion? Best(Book book, IEnumerable<Promotion> promotions, bool member, DateTimeOffset now) =>
        promotions.Where(p => p.Active && now >= p.StartsAt && now < p.EndsAt &&
            (!p.MembersOnly || member) && p.BookIds.Contains(book.Id))
        .OrderByDescending(p => p.PercentOff).ThenBy(p => p.MembersOnly).ThenBy(p => p.Id).FirstOrDefault();
    public static decimal Price(Book book, Promotion? promotion) =>
        promotion is null ? book.Price : Money(book.Price * (1 - promotion.PercentOff / 100));
    public static Book View(Book book, IEnumerable<Promotion> promotions, bool member, DateTimeOffset now)
    {
        var copy = System.Text.Json.JsonSerializer.Deserialize<Book>(System.Text.Json.JsonSerializer.Serialize(book))!;
        var offer = Best(book, promotions, member, now);
        var memberOffer = Best(book, promotions, true, now);
        var price = Price(book, offer);
        copy.SalePrice = price < book.Price ? price : null;
        var memberPrice = Price(book, memberOffer);
        copy.MemberPrice = memberPrice < Price(book, Best(book, promotions, false, now)) ? memberPrice : null;
        copy.PromotionName = offer?.Name;
        copy.MemberEligible = member;
        copy.MemberOfferApplied = offer?.MembersOnly == true;
        return copy;
    }
    public static string Error(Promotion p, IEnumerable<Book> books)
    {
        if (string.IsNullOrWhiteSpace(p.Name) || p.Name.Length > 100) return "Use a promotion name of 1–100 characters.";
        if (p.PercentOff <= 0 || p.PercentOff > 100 || !CatalogValidation.IsMoney(p.PercentOff)) return "Discount must be greater than 0 and at most 100%, with at most two decimals.";
        if (p.StartsAt == default || p.EndsAt <= p.StartsAt) return "End date must follow start date.";
        if (p.BookIds is null || p.BookIds.Count == 0 || p.BookIds.Distinct().Count() != p.BookIds.Count || p.BookIds.Any(id => !books.Any(b => b.Id == id))) return "Choose one or more distinct catalog books.";
        return "";
    }
    public static int Balance(IEnumerable<RewardEntry> ledger, int customerId) => ledger.Where(e => e.CustomerId == customerId).Sum(e => e.Points);
    public static int MaxRedemption(int balance, decimal merchandise) => Math.Max(0, Math.Min(balance / 100, (int)Math.Min(int.MaxValue / 100, decimal.Floor(merchandise / 5)))) * 100;
}
