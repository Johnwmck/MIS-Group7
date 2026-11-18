using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

// Customer-facing assistant endpoints used by scripts/assistant.js and help.html.
// Account tools derive identity from the validated cookie, never model arguments.
[ApiController]
[Route("api/assistant")]
public class AssistantController : ControllerBase
{
    private const int MaxMessages = 40;
    private const int MaxMessageLength = 2000;

    private readonly AssistantService assistant;

    public AssistantController(AssistantService assistant) { this.assistant = assistant; }

    // --- Chat turn ---

    [HttpPost("chat"), RequestSizeLimit(100000)]
    public async Task<ActionResult<AssistantReply>> Chat([FromBody] AssistantChatRequest request, CancellationToken cancellation)
    {
        var messages = request.Messages;
        if (messages is null || messages.Count == 0)
            return BadRequest(new { error = "At least one message is required." });
        if (messages.Count > MaxMessages)
            return BadRequest(new { error = $"Send at most {MaxMessages} messages." });
        if (messages.Any(message => message is null || message.Role is not ("user" or "assistant")))
            return BadRequest(new { error = "Message roles must be 'user' or 'assistant'." });
        if (messages.Any(message => message.Content is null || message.Content.Length > MaxMessageLength))
            return BadRequest(new { error = $"Messages must be {MaxMessageLength} characters or fewer." });
        if (messages[^1].Role != "user" || string.IsNullOrWhiteSpace(messages[^1].Content))
            return BadRequest(new { error = "The last message must be a non-empty customer message." });

        if (request.RequestId == Guid.Empty || request.Cart is null || request.Cart.Count > 100 ||
            request.Cart.Any(i => i is null || i.BookId < 1 || i.Quantity < 1 || i.Quantity > 1000))
            return BadRequest(new { error = "Invalid conversation request ID or cart context." });
        try { return Ok(await assistant.RespondAsync(request, cancellation)); }
        catch (ModelFailure error) { return StatusCode(error.Status, new { error = error.Message, code = error.Code }); }
    }

    // --- Widget status badge ---

    [HttpGet("status")]
    public ActionResult<AssistantStatus> Status() => Ok(assistant.GetStatus());

    // --- FAQ content for help.html ---

    [HttpGet("faq")]
    public ActionResult<IReadOnlyList<FaqEntry>> Faq() => Ok(AssistantKnowledge.Faqs);
}
