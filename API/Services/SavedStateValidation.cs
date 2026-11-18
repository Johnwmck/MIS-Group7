using System.ComponentModel.DataAnnotations;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

public static class SavedStateValidation
{
    // Used on startup and before commits. Historical order snapshots are checked
    // against their own item data, not today's catalog prices or availability.
    public static void Validate(BookstoreState state)
    {
        void Require(bool valid, string message)
        {
            if (!valid) throw new InvalidDataException("Invalid saved bookstore state: " + message + " It was not reset.");
        }
        // --- State shape and current catalog ---
        Require(state.Version is 1 or 2, "unsupported format version.");
        Require(state.Books is not null && state.Orders is not null, "missing collections.");
        var bookIds = new HashSet<int>();
        foreach (var book in state.Books!)
            Require(book is not null && book.Id > 0 && bookIds.Add(book.Id) &&
                CatalogValidation.GetError(book) == "", "invalid or duplicate catalog book.");

        // --- Historical order identities, items, and monetary consistency ---
        var orderIds = new HashSet<int>();
        var highestReferencedBookId = bookIds.DefaultIfEmpty(0).Max();
        foreach (var order in state.Orders!)
        {
            Require(order is not null && order.Id > 0 && orderIds.Add(order.Id), "invalid or duplicate order ID.");
            Require(order!.Date != default && order.Date.Offset == TimeSpan.Zero &&
                !string.IsNullOrWhiteSpace(order.CustomerName) &&
                !string.IsNullOrWhiteSpace(order.CustomerEmail) &&
                new EmailAddressAttribute().IsValid(order.CustomerEmail),
                $"invalid customer or UTC date in order {order.Id}.");
            Require(order.Items is not null && order.Items.Count > 0, $"missing items in order {order.Id}.");
            var itemIds = new HashSet<int>();
            decimal subtotal = 0;
            try
            {
                foreach (var item in order.Items!)
                {
                    Require(item is not null && item.BookId > 0 && itemIds.Add(item.BookId) &&
                        item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.Title) &&
                        CatalogValidation.IsMoney(item.Price), $"invalid item in order {order.Id}.");
                    highestReferencedBookId = Math.Max(highestReferencedBookId, item!.BookId);
                    subtotal += item.Price * item.Quantity;
                }
                Require(CatalogValidation.IsMoney(order.RewardDiscount) && order.RewardDiscount <= subtotal &&
                    order.PointsRedeemed >= 0 && order.PointsRedeemed % 100 == 0 &&
                    order.RewardDiscount == order.PointsRedeemed / 100 * 5m && order.PointsEarned >= 0,
                    $"invalid rewards in order {order.Id}.");
                subtotal -= order.RewardDiscount;
                Require(CatalogValidation.IsMoney(order.Total), $"invalid total in order {order.Id}.");
                // Pre-tax snapshots have all three fields absent/null. Their
                // original total must still match the recorded item prices.
                if (order.Subtotal is null && order.Tax is null && order.TaxRate is null)
                    Require(order.Total == subtotal, $"legacy total mismatch in order {order.Id}.");
                else
                {
                    Require(order.Subtotal is not null && order.Tax is not null && order.TaxRate is not null,
                        $"incomplete tax fields in order {order.Id}.");
                    Require(order.Subtotal == subtotal && order.TaxRate == 0.10m &&
                        CatalogValidation.IsMoney(order.Tax!.Value) &&
                        order.Tax == decimal.Round(subtotal * order.TaxRate!.Value, 2, MidpointRounding.AwayFromZero) &&
                        order.Total == subtotal + order.Tax, $"tax/total mismatch in order {order.Id}.");
                }
            }
            catch (OverflowException error)
            {
                throw new InvalidDataException($"Saved order {order.Id} overflows monetary calculations. It was not reset.", error);
            }

            // Account link, saved-card snapshot, and refund receipt are optional.
            // A refund must repay exactly what the order charged.
            Require(order.CustomerId is null or > 0 &&
                (order.PaymentMethod is null ||
                    (!string.IsNullOrWhiteSpace(order.PaymentMethod) && order.PaymentMethod.Length <= 100)),
                $"invalid account or payment details in order {order.Id}.");
            if (order.Refund is { } refund)
            {
                Require(OrderRefundPolicy.GetError(refund.Type, refund.Reason, refund.Comments) == "" &&
                    refund.Comments == OrderRefundPolicy.NormalizeComments(refund.Comments) &&
                    refund.Date.Offset == TimeSpan.Zero && refund.Date >= order.Date &&
                    refund.Subtotal == (order.Subtotal ?? order.Total) &&
                    refund.Tax == (order.Tax ?? 0) && refund.Total == order.Total,
                    $"invalid refund receipt in order {order.Id}.");
            }
        }
        // --- Safe next-ID counters ---
        // Deleted books need not exist in the catalog, but IDs referenced by
        // historical orders must never be reassigned to another book.
        Require(state.NextBookId > highestReferencedBookId &&
            state.NextOrderId > orderIds.DefaultIfEmpty(0).Max(), "ID counters would reuse existing IDs.");

        Require(state.Orders.Where(o => o.RequestKey.HasValue).Select(o => o.RequestKey).Distinct().Count() ==
            state.Orders.Count(o => o.RequestKey.HasValue), "duplicate checkout key.");
        Require(state.Promotions is not null && state.Rewards is not null && state.Staff is not null && state.Customers is not null, "missing membership collections.");
        Require(state.Promotions!.Select(p => p.Id).Distinct().Count() == state.Promotions!.Count &&
            state.NextPromotionId > state.Promotions.Select(p => p.Id).DefaultIfEmpty(0).Max(), "invalid promotion IDs.");
        foreach (var p in state.Promotions)
            Require(p.Id > 0 && !string.IsNullOrWhiteSpace(p.Name) && p.Name.Length <= 100 && p.PercentOff > 0 && p.PercentOff <= 100 &&
                CatalogValidation.IsMoney(p.PercentOff) && p.StartsAt != default && p.EndsAt > p.StartsAt && p.BookIds is not null &&
                p.BookIds.All(id => id > 0) && p.BookIds.Distinct().Count() == p.BookIds.Count, "invalid promotion.");
        Require(state.Staff!.Select(a => a.Id).Distinct().Count() == state.Staff!.Count &&
            state.Staff.Select(a => a.Username).Distinct(StringComparer.OrdinalIgnoreCase).Count() == state.Staff!.Count &&
            state.NextStaffId > state.Staff.Select(a => a.Id).DefaultIfEmpty(0).Max(), "invalid staff IDs.");
        foreach (var a in state.Staff) Require(a.Id > 0 && a.Role is "Admin" or "Employee" && !string.IsNullOrWhiteSpace(a.PasswordHash) &&
            !string.IsNullOrWhiteSpace(a.Name) && !string.IsNullOrWhiteSpace(a.Username) && a.SessionStamp != Guid.Empty, "invalid staff account.");
        Require(state.Rewards!.Select(e => (e.OrderId, e.Kind)).Distinct().Count() == state.Rewards!.Count, "duplicate reward entry.");
        foreach (var e in state.Rewards)
        {
            var o = state.Orders.SingleOrDefault(o => o.Id == e.OrderId && o.CustomerId == e.CustomerId);
            Require(o is not null && state.Customers!.Any(c => c.Id == e.CustomerId) && e.Date != default, "orphaned reward entry.");
            Require(e.Kind switch { "Earn" => e.Points == o!.PointsEarned, "Redeem" => e.Points == -o!.PointsRedeemed,
                "RefundEarn" => o!.Refund is not null && e.Points == -o.PointsEarned,
                "RefundRedeem" => o!.Refund is not null && e.Points == o.PointsRedeemed, _ => false }, "reward entry mismatch.");
        }
        foreach (var o in state.Orders.Where(o => o.RequestKey.HasValue && o.CustomerId.HasValue))
        {
            Require(o.PointsEarned == decimal.Floor(o.Subtotal ?? 0), "earned points mismatch.");
            foreach (var kind in new[] { "Earn", "Redeem" })
                Require(state.Rewards!.Count(e => e.OrderId == o.Id && e.Kind == kind) == 1, "missing purchase ledger entry.");
            if (o.Refund is not null) foreach (var kind in new[] { "RefundEarn", "RefundRedeem" })
                Require(state.Rewards!.Count(e => e.OrderId == o.Id && e.Kind == kind) == 1, "missing refund ledger entry.");
        }
        // --- Customer accounts ---
        // Emails are saved normalized, so one email can hold only one account.
        Require(state.Customers is not null, "missing customer accounts.");
        var customerIds = new HashSet<int>();
        var customerEmails = new HashSet<string>(StringComparer.Ordinal);
        foreach (var customer in state.Customers!)
        {
            Require(customer is not null && customer.Id > 0 && customerIds.Add(customer.Id),
                "invalid or duplicate customer ID.");
            Require(CustomerValidation.GetProfileError(customer!.FirstName, customer.LastName,
                    customer.Email, customer.Phone) == "" &&
                customer.Email == CustomerValidation.NormalizeEmail(customer.Email) &&
                customerEmails.Add(customer.Email) &&
                customer.SessionStamp != Guid.Empty && !string.IsNullOrWhiteSpace(customer.PasswordHash) &&
                customer.CreatedAt != default && customer.CreatedAt.Offset == TimeSpan.Zero,
                $"invalid or duplicate details in customer account {customer.Id}.");

            // Saved cards: valid details, unique IDs, one default, and a card ID
            // counter that cannot reuse an ID.
            Require(customer.PaymentMethods is not null &&
                customer.PaymentMethods.Count <= PaymentMethodValidation.MaxSavedCards,
                $"invalid saved cards in customer account {customer.Id}.");
            var cardIds = new HashSet<int>();
            foreach (var card in customer.PaymentMethods!)
                Require(card is not null && card.Id > 0 && cardIds.Add(card.Id) &&
                    PaymentMethodValidation.GetCardError(card.Brand, card.Last4, card.ExpMonth, card.ExpYear,
                        card.NameOnCard) == "" &&
                    card.NameOnCard == card.NameOnCard.Trim(),
                    $"invalid or duplicate saved card in customer account {customer.Id}.");
            Require((customer.PaymentMethods.Count == 0 || customer.PaymentMethods.Count(card => card.IsDefault) == 1) &&
                customer.NextPaymentMethodId > cardIds.DefaultIfEmpty(0).Max(),
                $"invalid default card or card ID counter in customer account {customer.Id}.");

            // Favorites may name books deleted since; responses leave those out.
            Require(customer.FavoriteBookIds is not null &&
                customer.FavoriteBookIds.Count <= CustomerValidation.MaxFavorites &&
                customer.FavoriteBookIds.All(bookId => bookId > 0) &&
                customer.FavoriteBookIds.Distinct().Count() == customer.FavoriteBookIds.Count,
                $"invalid favorites in customer account {customer.Id}.");
        }
        Require(state.NextCustomerId > customerIds.DefaultIfEmpty(0).Max(),
            "customer ID counter would reuse an existing ID.");
    }
}
