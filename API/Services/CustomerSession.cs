using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// The customer login cookie is HttpOnly and holds only the customer's ID and
// email. Every request looks the account up again instead of trusting the cookie.
public static class CustomerSession
{
    public static Task SignInAsync(HttpContext context, Customer customer)
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, customer.Id.ToString(CultureInfo.InvariantCulture)),
            new Claim(ClaimTypes.Email, customer.Email)
        }, CookieAuthenticationDefaults.AuthenticationScheme);

        return context.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
    }

    public static Task SignOutAsync(HttpContext context) =>
        context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

    // The logged-in customer in the given list (live state or a candidate
    // snapshot), or null. Call while holding the store's SyncRoot. Matching the
    // email too keeps an old cookie from opening a different account that later
    // reused the same ID after a reset, and ends other sessions after an email change.
    public static Customer? Find(ClaimsPrincipal user, IEnumerable<Customer> customers)
    {
        if (user.Identity?.IsAuthenticated != true) return null;

        var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = user.FindFirst(ClaimTypes.Email)?.Value;
        if (!int.TryParse(idClaim, NumberStyles.None, CultureInfo.InvariantCulture, out var customerId) || email is null)
            return null;

        return customers.FirstOrDefault(customer => customer.Id == customerId && customer.Email == email);
    }
}
