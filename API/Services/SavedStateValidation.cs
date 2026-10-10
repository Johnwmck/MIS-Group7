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
        }
        // --- Safe next-ID counters ---
        // Deleted books need not exist in the catalog, but IDs referenced by
        // historical orders must never be reassigned to another book.
        Require(state.NextBookId > highestReferencedBookId &&
            state.NextOrderId > orderIds.DefaultIfEmpty(0).Max(), "ID counters would reuse existing IDs.");
    }
}
