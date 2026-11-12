using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

// The logged-in customer's account page: account info and password, order
// history with returns and cancellations, and saved payment methods. Every
// action works only on the account in the login cookie; 401 when logged out.
[ApiController]
[Route("api/customers/me")]
public class CustomerAccountController : ControllerBase
{
    private readonly BookstoreStore store;
    private readonly IPasswordHasher<Customer> passwordHasher;

    public CustomerAccountController(BookstoreStore store, IPasswordHasher<Customer> passwordHasher)
    {
        this.store = store;
        this.passwordHasher = passwordHasher;
    }

    // --- Account info and password ---

    [HttpPut]
    public async Task<ActionResult<CustomerProfile>> UpdateProfile([FromBody] UpdateCustomerRequest request)
    {
        var error = CustomerValidation.GetProfileError(request.FirstName, request.LastName, request.Email, request.Phone);
        if (error != "") return BadRequest(new { error });

        Customer updated;
        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();

            var email = CustomerValidation.NormalizeEmail(request.Email);
            if (candidate.Customers.Any(other => other.Id != customer.Id && other.Email == email))
                return Conflict(new { error = "Another account already uses this email." });

            // Past orders keep the name and email used at checkout.
            customer.FirstName = request.FirstName!.Trim();
            customer.LastName = request.LastName!.Trim();
            customer.Email = email;
            customer.Phone = CustomerValidation.NormalizePhone(request.Phone);
            store.Commit(candidate);
            updated = customer;
        }

        // The cookie holds the email, so renew it in case the email changed.
        await CustomerSession.SignInAsync(HttpContext, updated);
        return Ok(CustomerProfile.From(updated));
    }

    [HttpPost("password")]
    public IActionResult ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var error = CustomerValidation.GetPasswordError(request.NewPassword);
        if (error != "") return BadRequest(new { error });

        Customer? customer;
        lock (store.SyncRoot)
        {
            customer = CustomerSession.Find(User, store.Customers);
        }
        if (customer is null) return NotLoggedIn();

        // Hashing is deliberately slow, so verify and hash outside the lock.
        if (string.IsNullOrEmpty(request.CurrentPassword) ||
            passwordHasher.VerifyHashedPassword(customer, customer.PasswordHash, request.CurrentPassword) ==
                PasswordVerificationResult.Failed)
        {
            return BadRequest(new { error = "Your current password is incorrect." });
        }
        var newHash = passwordHasher.HashPassword(customer, request.NewPassword!);

        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var saved = CustomerSession.Find(User, candidate.Customers);
            if (saved is null) return NotLoggedIn();
            // Another request changed the password after the check above.
            if (saved.PasswordHash != customer.PasswordHash)
                return Conflict(new { error = "Your password was just changed elsewhere. Refresh and try again." });

            saved.PasswordHash = newHash;
            store.Commit(candidate);
        }
        return NoContent();
    }

    // --- Order history, returns, and cancellations ---

    [HttpGet("orders")]
    public ActionResult<List<Order>> GetOrders()
    {
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            if (customer is null) return NotLoggedIn();

            return Ok(store.Orders
                .Where(order => order.CustomerId == customer.Id)
                .OrderByDescending(order => order.Id)
                .ToList());
        }
    }

    // Returns or cancels a whole order within the return window. The books go
    // back into stock and the order gains a refund receipt; nothing is deleted.
    [HttpPost("orders/{id:int}/refund")]
    public ActionResult<Order> RefundOrder(int id, [FromBody] OrderRefundRequest request)
    {
        var error = OrderRefundPolicy.GetError(request.Type, request.Reason, request.Comments);
        if (error != "") return BadRequest(new { error });

        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();

            // Another customer's order answers the same as a missing one.
            var order = candidate.Orders.Find(order => order.Id == id && order.CustomerId == customer.Id);
            if (order is null) return NotFound(new { error = "Order not found." });
            if (order.Refund is not null)
            {
                var done = order.Refund.Type == OrderRefundPolicy.Return ? "returned" : "cancelled";
                return Conflict(new { error = $"Order #{id} was already {done}." });
            }

            var now = DateTimeOffset.UtcNow;
            if (now > OrderRefundPolicy.GetDeadline(order))
                return Conflict(new { error = $"Order #{id} is past its {OrderRefundPolicy.WindowDays}-day return window." });

            // Books deleted from the catalog since the sale are skipped.
            foreach (var item in order.Items)
            {
                var book = candidate.Books.Find(book => book.Id == item.BookId);
                if (book is null) continue;
                if (book.Inventory > int.MaxValue - item.Quantity)
                    return Conflict(new { error = $"{book.Title} cannot be restocked. Please contact the store." });

                book.Inventory += item.Quantity;
                // Staff views opened before the return must refresh before editing.
                book.Revision = Guid.NewGuid();
            }

            order.Refund = OrderRefundPolicy.Create(order, request, now);
            store.Commit(candidate);
            return Ok(order);
        }
    }

    // --- Saved payment methods ---
    // Each change returns the full updated list, default card first.

    [HttpGet("payment-methods")]
    public ActionResult<List<PaymentMethod>> GetPaymentMethods()
    {
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            if (customer is null) return NotLoggedIn();
            return Ok(SortedCards(customer));
        }
    }

    [HttpPost("payment-methods")]
    public ActionResult<List<PaymentMethod>> AddPaymentMethod([FromBody] AddPaymentMethodRequest request)
    {
        var error = PaymentMethodValidation.GetNewCardError(request, DateTimeOffset.UtcNow);
        if (error != "") return BadRequest(new { error });

        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();

            var saveError = PaymentMethodValidation.GetSaveError(customer);
            if (saveError != "") return BadRequest(new { error = saveError });
            if (PaymentMethodValidation.FindSame(customer, request) is not null)
                return Conflict(new { error = "This card is already saved." });

            PaymentMethodValidation.AddCard(customer, request);
            store.Commit(candidate);
            return Ok(SortedCards(customer));
        }
    }

    [HttpPost("payment-methods/{id:int}/default")]
    public ActionResult<List<PaymentMethod>> MakeDefaultPaymentMethod(int id)
    {
        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();
            if (!customer.PaymentMethods.Any(card => card.Id == id))
                return NotFound(new { error = "That card is no longer saved. Refresh to see your cards." });

            customer.PaymentMethods.ForEach(card => card.IsDefault = card.Id == id);
            store.Commit(candidate);
            return Ok(SortedCards(customer));
        }
    }

    [HttpDelete("payment-methods/{id:int}")]
    public ActionResult<List<PaymentMethod>> RemovePaymentMethod(int id)
    {
        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();

            var card = customer.PaymentMethods.Find(card => card.Id == id);
            if (card is null) return NotFound(new { error = "That card is no longer saved. Refresh to see your cards." });

            customer.PaymentMethods.Remove(card);
            // Keep one default while any card remains: the oldest saved card.
            if (card.IsDefault && customer.PaymentMethods.Count > 0)
                customer.PaymentMethods.MinBy(other => other.Id)!.IsDefault = true;
            store.Commit(candidate);
            return Ok(SortedCards(customer));
        }
    }

    // --- Favorites ---
    // Book IDs in the order they were saved. Each change returns the full list.

    [HttpGet("favorites")]
    public ActionResult<List<int>> GetFavorites()
    {
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            if (customer is null) return NotLoggedIn();
            return Ok(CurrentFavorites(customer, store.Books));
        }
    }

    [HttpPut("favorites/{bookId:int}")]
    public ActionResult<List<int>> AddFavorite(int bookId)
    {
        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();
            if (!candidate.Books.Any(book => book.Id == bookId))
                return NotFound(new { error = "That book is no longer in the catalog." });

            if (!customer.FavoriteBookIds.Contains(bookId))
            {
                // Forget favorites whose books were deleted before checking the limit.
                customer.FavoriteBookIds = CurrentFavorites(customer, candidate.Books);
                if (customer.FavoriteBookIds.Count >= CustomerValidation.MaxFavorites)
                    return BadRequest(new { error = $"You can save up to {CustomerValidation.MaxFavorites} favorites." });

                customer.FavoriteBookIds.Add(bookId);
                store.Commit(candidate);
            }
            return Ok(CurrentFavorites(customer, candidate.Books));
        }
    }

    [HttpDelete("favorites/{bookId:int}")]
    public ActionResult<List<int>> RemoveFavorite(int bookId)
    {
        lock (store.SyncRoot)
        {
            var candidate = store.CreateSnapshot();
            var customer = CustomerSession.Find(User, candidate.Customers);
            if (customer is null) return NotLoggedIn();

            if (customer.FavoriteBookIds.Remove(bookId)) store.Commit(candidate);
            return Ok(CurrentFavorites(customer, candidate.Books));
        }
    }

    // --- Helpers ---

    // Saved favorites whose books are still in the catalog (inactive books stay).
    private static List<int> CurrentFavorites(Customer customer, IEnumerable<Book> books)
    {
        var catalogIds = books.Select(book => book.Id).ToHashSet();
        return customer.FavoriteBookIds.Where(catalogIds.Contains).ToList();
    }

    private ActionResult NotLoggedIn() =>
        Unauthorized(new { error = "Your session has ended. Please log in again." });

    private static List<PaymentMethod> SortedCards(Customer customer) =>
        customer.PaymentMethods
            .OrderByDescending(card => card.IsDefault)
            .ThenBy(card => card.Id)
            .ToList();
}
