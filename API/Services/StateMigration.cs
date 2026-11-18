using Microsoft.AspNetCore.Identity;
using Team7Books.Api.Models;
namespace Team7Books.Api.Services;

public static class StateMigration
{
    public static bool Apply(BookstoreState state, IConfiguration config, bool development, bool createStaff = true)
    {
        if (state.Version != 1) return false;
        state.Version = 2;
        // Version 1 could serialize a derived seasonal price. Discard only that cache.
        foreach (var book in state.Books) { book.SalePrice = null; book.MemberPrice = null; book.PromotionName = null; book.MemberEligible = false; book.MemberOfferApplied = false; }
        var hasher = new PasswordHasher<StaffAccount>();
        if (createStaff) foreach (var (name, username, role, fallback) in new[] {
            ("Demo Administrator", "admin", "Admin", "admin123"), ("Demo Employee", "employee", "Employee", "employee123") })
        {
            var password = config["BOOKSTORE_" + role.ToUpperInvariant() + "_PASSWORD"];
            if (string.IsNullOrWhiteSpace(password))
            {
                if (!development) throw new InvalidOperationException("Set BOOKSTORE_ADMIN_PASSWORD and BOOKSTORE_EMPLOYEE_PASSWORD before first startup outside Development.");
                password = fallback;
            }
            var account = new StaffAccount { Id = state.NextStaffId++, Name = name, Username = username, Role = role };
            account.PasswordHash = hasher.HashPassword(account, password);
            state.Staff.Add(account);
        }
        void Offer(string name, decimal percent, int[] ids, DateTimeOffset start, DateTimeOffset end, bool member = false)
        {
            var eligible = ids.Where(id => state.Books.Any(b => b.Id == id)).ToList();
            if (eligible.Count > 0) state.Promotions.Add(new Promotion { Id = state.NextPromotionId++, Name = name, PercentOff = percent,
                BookIds = eligible, StartsAt = start, EndsAt = end, MembersOnly = member });
        }
        Offer("Merry & Bright", 20, new[] {169,201,272,273,284,308,544,545,1,2,3,4,5,6,7,8,9,10,11,12,54,55,56,57,58,59,60,34,49,50,70,71,72,73,75,146,211,114,102,414}, new(2026,11,10,0,0,0,TimeSpan.Zero), new(2026,12,26,0,0,0,TimeSpan.Zero));
        Offer("Member bookshelf", 15, state.Books.Select(b => b.Id).ToArray(), new(2026,11,1,0,0,0,TimeSpan.Zero), new(2027,1,1,0,0,0,TimeSpan.Zero), true);
        return true;
    }
}
