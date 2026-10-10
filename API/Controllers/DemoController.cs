using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

// Local prototype only; replace with server authorization before deployment.
[ApiController]
[Route("api/demo")]
public class DemoController : ControllerBase
{
    private readonly BookstoreStore store;
    public DemoController(BookstoreStore store) { this.store = store; }

    [HttpPost("reset")]
    public IActionResult Reset()
    {
        store.Reset();
        return NoContent();
    }
}
