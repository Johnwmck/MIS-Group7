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
        Require(state.Version == 1, "unsupported format version.");
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
                !string.IsNullOrWhiteSpace(customer.PasswordHash) &&
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
