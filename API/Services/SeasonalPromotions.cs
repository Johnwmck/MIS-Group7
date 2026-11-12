namespace Team7Books.Api.Services;

// A seasonal sale: a fixed percentage off a curated set of titles while its
// window is open. Inclusive start, exclusive end (UTC).
public sealed record SeasonalPromotion(
    string Name,
    decimal DiscountRate,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    IReadOnlySet<int> BookIds)
{
    public bool IsActive(DateTimeOffset now) => now >= StartsAt && now < EndsAt;
}

// Every seasonal promotion the store has run, past and upcoming. Books carry
// their regular price; this is the single place that decides the sale price,
// so catalog responses and purchase totals always agree. Windows must not
// overlap: the first active promotion wins.
public static class SeasonalPromotions
{
    // Halloween "Thrills & Chills": 10% off thriller and horror titles.
    // Seed catalog IDs: Stephen King, Thomas Harris, Anne Rice, gothic classics,
    // and popular psychological/crime thrillers.
    public static readonly SeasonalPromotion Halloween = new(
        "Thrills & Chills",
        0.10m,
        new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero),
        new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero),
        new HashSet<int>
        {
            135, 205, 309, 412, 393, 136,   // The Shining, It, The Stand, Misery, Carrie, Doctor Sleep
            500, 499, 501,                  // The Silence of the Lambs, Red Dragon, Hannibal
            447, 550, 166, 121,             // Interview with the Vampire, World War Z, Dracula, Frankenstein
            266, 334, 407, 521, 61, 43,     // Sharp Objects, Dark Places, The Silent Patient,
                                            // The Woman in the Window, The Girl on the Train,
                                            // The Girl with the Dragon Tattoo
            199, 39, 203, 483, 384, 389     // And Then There Were None, The Da Vinci Code, Jurassic Park,
                                            // The Cuckoo's Calling, In Cold Blood, The Devil in the White City
        });

    // Christmas "Merry & Bright": 20% off every Children's title, the Harry
    // Potter and Hunger Games series, and selected family-friendly fantasy.
    // Runs from launch through Christmas Day.
    public static readonly SeasonalPromotion Christmas = new(
        "Merry & Bright",
        0.20m,
        new DateTimeOffset(2026, 11, 10, 0, 0, 0, TimeSpan.Zero),
        new DateTimeOffset(2026, 12, 26, 0, 0, 0, TimeSpan.Zero),
        new HashSet<int>
        {
            // Children's (the whole genre)
            169, 201, 272, 273, 284, 308, 544, 545,
            // Harry Potter 1-7 and The Cursed Child
            1, 2, 3, 4, 5, 6, 7, 8,
            // The Hunger Games, including The Ballad of Songbirds and Snakes
            9, 10, 11, 12,
            // Select fantasy: The Chronicles of Narnia
            54, 55, 56, 57, 58, 59, 60,
            // The Hobbit, The Two Towers, The Return of the King
            34, 49, 50,
            // Percy Jackson and the Olympians 1-5
            70, 71, 72, 73, 75,
            // A Wrinkle in Time, The Princess Bride, The Golden Compass,
            // Eragon, Artemis Fowl
            146, 211, 114, 102, 414
        });

    private static readonly SeasonalPromotion[] All = { Halloween, Christmas };

    // The promotion running right now, or null between seasons.
    public static SeasonalPromotion? Current(DateTimeOffset now) =>
        All.FirstOrDefault(promotion => promotion.IsActive(now));

    // Null when the book is not on sale right now.
    public static decimal? GetSalePrice(int bookId, decimal price)
    {
        var promotion = Current(DateTimeOffset.UtcNow);
        if (promotion is null || !promotion.BookIds.Contains(bookId)) return null;
        return decimal.Round(price * (1 - promotion.DiscountRate), 2, MidpointRounding.AwayFromZero);
    }
}
