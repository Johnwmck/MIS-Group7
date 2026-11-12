using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

// Customer sign-up, login, and logout. The session is an HttpOnly cookie that
// holds only the customer's ID and email; each request rechecks the saved account.
// CustomerAccountController serves the logged-in customer's account page.
[ApiController]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly BookstoreStore store;
    private readonly IPasswordHasher<Customer> passwordHasher;

    public CustomersController(BookstoreStore store, IPasswordHasher<Customer> passwordHasher)
    {
        this.store = store;
        this.passwordHasher = passwordHasher;
    }

    // --- Account creation ---

    [HttpPost("register")]
    public async Task<ActionResult<CustomerProfile>> Register([FromBody] RegisterCustomerRequest request)
    {
        var error = CustomerValidation.GetProfileError(request.FirstName, request.LastName, request.Email, request.Phone);
        if (error == "") error = CustomerValidation.GetPasswordError(request.Password);
        if (error != "") return BadRequest(new { error });

        var customer = new Customer
        {
            FirstName = request.FirstName!.Trim(),
            LastName = request.LastName!.Trim(),
            Email = CustomerValidation.NormalizeEmail(request.Email),
            Phone = CustomerValidation.NormalizePhone(request.Phone),
            CreatedAt = DateTimeOffset.UtcNow
        };
        // Hash outside the lock; it is deliberately slow.
        customer.PasswordHash = passwordHasher.HashPassword(customer, request.Password!);

        lock (store.SyncRoot)
        {
            if (store.Customers.Any(existing => existing.Email == customer.Email))
                return Conflict(new { error = "An account with this email already exists. Log in instead." });
            if (store.NextCustomerId == int.MaxValue)
                return BadRequest(new { error = "No further customer IDs are available." });

            customer.Id = store.NextCustomerId;
            var candidate = store.CreateSnapshot();
            candidate.Customers.Add(customer);
            candidate.NextCustomerId++;
            store.Commit(candidate);
        }

        await CustomerSession.SignInAsync(HttpContext, customer);
        return CreatedAtAction(nameof(GetCurrent), null, CustomerProfile.From(customer));
    }

    // --- Login and logout ---

    [HttpPost("login")]
    public async Task<ActionResult<CustomerProfile>> Login([FromBody] SignInCustomerRequest request)
    {
        var email = CustomerValidation.NormalizeEmail(request.Email);
        Customer? customer;
        lock (store.SyncRoot)
        {
            customer = store.Customers.Find(existing => existing.Email == email);
        }

        // One message for both a wrong email and a wrong password.
        if (customer is null || string.IsNullOrEmpty(request.Password) ||
            passwordHasher.VerifyHashedPassword(customer, customer.PasswordHash, request.Password) ==
                PasswordVerificationResult.Failed)
        {
            return Unauthorized(new { error = "The email or password is incorrect." });
        }

        await CustomerSession.SignInAsync(HttpContext, customer);
        return Ok(CustomerProfile.From(customer));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await CustomerSession.SignOutAsync(HttpContext);
        return NoContent();
    }

    // --- Signed-in customer ---
    // 204 when nobody is signed in, so every page can check without an error.

    [HttpGet("me")]
    public async Task<ActionResult<CustomerProfile>> GetCurrent()
    {
        if (User.Identity?.IsAuthenticated != true) return NoContent();

        Customer? customer;
        lock (store.SyncRoot)
        {
            customer = CustomerSession.Find(User, store.Customers);
        }
        if (customer is null)
        {
            // The account no longer exists, for example after Reset Demo Data.
            await CustomerSession.SignOutAsync(HttpContext);
            return NoContent();
        }
        return Ok(CustomerProfile.From(customer));
    }
}
