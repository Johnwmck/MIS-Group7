using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;
namespace Team7Books.Api.Controllers;

[ApiController, Route("api/staff")]
public class StaffController(BookstoreStore store) : ControllerBase
{
    private readonly PasswordHasher<StaffAccount> hasher = new();
    [HttpPost("login")]
    public async Task<IActionResult> Login(StaffLogin request)
    {
        StaffAccount? a;
        lock (store.SyncRoot) a = store.Staff.FirstOrDefault(a => a.Username.Equals(request.Username?.Trim(), StringComparison.OrdinalIgnoreCase) && a.Active);
        if (a is null || string.IsNullOrEmpty(request.Password) || request.Password.Length > 128 ||
            hasher.VerifyHashedPassword(a, a.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new { error = "The username or password is incorrect." });
        await StoreSession.SignIn(HttpContext, a);
        return Ok(StaffProfile.From(a));
    }
    [HttpGet("me")]
    public IActionResult Me()
    {
        lock (store.SyncRoot) return StoreSession.Staff(User, store) is { } a ? Ok(StaffProfile.From(a)) : NoContent();
    }
    [HttpPost("logout")]
    public async Task<IActionResult> Logout() { await CustomerSession.SignOutAsync(HttpContext); return NoContent(); }
    [HttpGet, Authorize(Roles = "Admin")]
    public IActionResult List() { lock(store.SyncRoot) return Ok(store.Staff.Select(StaffProfile.From).ToList()); }
    [HttpPost, Authorize(Roles = "Admin")]
    public IActionResult Create(StaffEdit request) => Save(null, request);
    [HttpPut("{id:int}"), Authorize(Roles = "Admin")]
    public IActionResult Update(int id, StaffEdit request) => Save(id, request);
    private IActionResult Save(int? id, StaffEdit request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100 || string.IsNullOrWhiteSpace(request.Username) ||
            !System.Text.RegularExpressions.Regex.IsMatch(request.Username, @"^[a-zA-Z0-9._-]{1,50}$") ||
            ((!id.HasValue || !string.IsNullOrEmpty(request.Password)) && CustomerValidation.GetPasswordError(request.Password) != ""))
            return BadRequest(new { error = "Enter a name, a username of 1–50 letters/numbers/._-, and an 8–128 character password (leave blank on edits to keep it)." });
        lock (store.SyncRoot)
        {
            var state = store.CreateSnapshot();
            if (state.Staff.Any(a => a.Id != id && a.Username.Equals(request.Username, StringComparison.OrdinalIgnoreCase)))
                return Conflict(new { error = "That username is already in use." });
            var a = id.HasValue ? state.Staff.Find(a => a.Id == id) : new StaffAccount { Id = state.NextStaffId++ };
            if (a is null || a.Role == "Admin") return BadRequest(new { error = "That account cannot be edited here." });
            a.Name = request.Name.Trim(); a.Username = request.Username.ToLowerInvariant(); a.Active = request.Active;
            a.SessionStamp = Guid.NewGuid();
            if (!string.IsNullOrEmpty(request.Password)) a.PasswordHash = hasher.HashPassword(a, request.Password);
            if (!id.HasValue) state.Staff.Add(a);
            store.Commit(state);
            return Ok(StaffProfile.From(a));
        }
    }
}
