namespace Team7Books.Api.Services;

// Seasonal "Thrills & Chills" sale: a fixed percentage off a curated set of
// thriller and horror titles while the promotion window is open. Books carry
// their regular price; this is the single place that decides the sale price,
// so catalog responses and purchase totals always agree.
public static class HalloweenPromotion
{
    public const decimal DiscountRate = 0.10m;

    // Inclusive start, exclusive end (UTC). Outside the window nothing is discounted.
    public static readonly DateTimeOffset StartsAt = new(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);
    public static readonly DateTimeOffset EndsAt = new(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);

    // Seed catalog IDs: Stephen King, Thomas Harris, Anne Rice, gothic classics,
    // and popular psychological/crime thrillers.
    private static readonly HashSet<int> BookIds = new()
    {
        135, 205, 309, 412, 393, 136,   // The Shining, It, The Stand, Misery, Carrie, Doctor Sleep
        500, 499, 501,                  // The Silence of the Lambs, Red Dragon, Hannibal
        447, 550, 166, 121,             // Interview with the Vampire, World War Z, Dracula, Frankenstein
        266, 334, 407, 521, 61, 43,     // Sharp Objects, Dark Places, The Silent Patient,
                                        // The Woman in the Window, The Girl on the Train,
                                        // The Girl with the Dragon Tattoo
        199, 39, 203, 483, 384, 389     // And Then There Were None, The Da Vinci Code, Jurassic Park,
                                        // The Cuckoo's Calling, In Cold Blood, The Devil in the White City
    };

    public static bool IsActive(DateTimeOffset now) => now >= StartsAt && now < EndsAt;

    // Null when the book is not on sale right now.
    public static decimal? GetSalePrice(int bookId, decimal price)
    {
        if (!IsActive(DateTimeOffset.UtcNow) || !BookIds.Contains(bookId)) return null;
        return decimal.Round(price * (1 - DiscountRate), 2, MidpointRounding.AwayFromZero);
    }
}
