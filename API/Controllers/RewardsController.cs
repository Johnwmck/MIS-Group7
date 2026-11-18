using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Services;
namespace Team7Books.Api.Controllers;
[ApiController, Route("api/rewards"), Authorize(Roles = "Admin")]
public class RewardsController(BookstoreStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        lock (store.SyncRoot) return Ok(new {
            accounts = store.Customers.Select(c => new { c.Id, name = c.FirstName + " " + c.LastName, balance = PricingService.Balance(store.Rewards, c.Id) }).ToList(),
            ledger = store.Rewards.OrderByDescending(e => e.Date).ToList()
        });
    }
}
