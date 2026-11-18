using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;
namespace Team7Books.Api.Controllers;

[ApiController, Route("api/promotions")]
public class PromotionsController(BookstoreStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Current()
    {
        lock (store.SyncRoot)
        {
            var now = DateTimeOffset.UtcNow;
            return Ok(new { promotions = store.Promotions.Where(p => p.Active && now >= p.StartsAt && now < p.EndsAt).ToList(),
                member = CustomerSession.Find(User, store.Customers) is not null, rewards = PricingService.RewardsRule });
        }
    }
    [HttpGet("manage"), Authorize(Roles = "Admin")]
    public IActionResult All() { lock(store.SyncRoot) return Ok(store.Promotions.ToList()); }
    [HttpPost, Authorize(Roles = "Admin")]
    public IActionResult Create(Promotion p) => Save(null, p);
    [HttpPut("{id:int}"), Authorize(Roles = "Admin")]
    public IActionResult Update(int id, Promotion p) => Save(id, p);
    private IActionResult Save(int? id, Promotion p)
    {
        lock (store.SyncRoot)
        {
            var error = PricingService.Error(p, store.Books);
            if (error != "") return BadRequest(new { error });
            var state = store.CreateSnapshot();
            var existing = id.HasValue ? state.Promotions.Find(p => p.Id == id) : null;
            if (id.HasValue && existing is null) return NotFound();
            if (existing is not null && existing.Revision != p.Revision) return Conflict(new { error = "This promotion changed. Reload before saving." });
            p.Id = id ?? state.NextPromotionId++; p.Revision = Guid.NewGuid(); p.Name = p.Name.Trim();
            p.StartsAt = p.StartsAt.ToUniversalTime(); p.EndsAt = p.EndsAt.ToUniversalTime();
            if (existing is not null) state.Promotions.Remove(existing);
            state.Promotions.Add(p);
            store.Commit(state);
            return Ok(p);
        }
    }
}
