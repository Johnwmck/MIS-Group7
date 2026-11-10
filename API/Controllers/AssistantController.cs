using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

// Customer-facing assistant endpoints used by scripts/assistant.js and help.html.
// No authentication: the assistant only reads public catalog data, and order
// lookups require the order's email, which is checked in AssistantTools.
[ApiController]
[Route("api/assistant")]
public class AssistantController : ControllerBase
{
    private const int MaxMessages = 40;
    private const int MaxMessageLength = 2000;

    private readonly AssistantService assistant;

    public AssistantController(AssistantService assistant) { this.assistant = assistant; }

    // --- Chat turn ---

    [HttpPost("chat")]
    public async Task<ActionResult<AssistantReply>> Chat([FromBody] AssistantChatRequest request, CancellationToken cancellation)
    {
        var messages = request?.Messages;
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

        return Ok(await assistant.RespondAsync(messages, cancellation));
    }

    // --- Widget status badge ---

    [HttpGet("status")]
    public async Task<ActionResult<AssistantStatus>> Status(CancellationToken cancellation) =>
        Ok(await assistant.GetStatusAsync(cancellation));

    // --- FAQ content for help.html ---

    [HttpGet("faq")]
    public ActionResult<IReadOnlyList<FaqEntry>> Faq() => Ok(AssistantKnowledge.Faqs);
}
