using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Team7Books.Api.Models;
namespace Team7Books.Api.Services;

public static class StoreSession
{
    public static StaffAccount? Staff(ClaimsPrincipal user, BookstoreStore store) =>
        store.Staff.FirstOrDefault(a => a.Active && a.Id.ToString() == user.FindFirstValue(ClaimTypes.NameIdentifier) &&
            user.IsInRole(a.Role) && a.SessionStamp.ToString() == user.FindFirstValue("stamp"));
    public static bool IsValid(ClaimsPrincipal user, BookstoreStore store) =>
        CustomerSession.Find(user, store.Customers) is not null || Staff(user, store) is not null;
    public static Task SignIn(HttpContext context, StaffAccount a) => context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, a.Id.ToString()),
            new Claim(ClaimTypes.Role, a.Role), new Claim("stamp", a.SessionStamp.ToString()) },
            CookieAuthenticationDefaults.AuthenticationScheme)));
}
