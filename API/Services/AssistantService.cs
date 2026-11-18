using System.Text.Json;
using Team7Books.Api.Models;
namespace Team7Books.Api.Services;

public sealed class AssistantService(MisModelClient model, AssistantTools tools)
{
    public AssistantStatus GetStatus() => model.Status();
    public async Task<AssistantReply> RespondAsync(AssistantChatRequest request, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(model.TimeoutSeconds));
        tools.Request = request;
        var messages = new List<ModelMessage> { new() { Role = "system", Content = AssistantKnowledge.BuildSystemPrompt(DateTimeOffset.UtcNow) } };
        messages.AddRange(request.Messages.TakeLast(16).Select(m => new ModelMessage { Role = m.Role, Content = m.Content }));
        var reply = new AssistantReply { RequestId = request.RequestId };
        var seenCalls = new Dictionary<string, ToolOutcome>();
        var additions = new HashSet<int>();
        string? toolError = null;
        var catalogIntent = System.Text.RegularExpressions.Regex.IsMatch(request.Messages[^1].Content,
            @"\b(recommend|suggest|cheaper|another author|collection|series|find.*book)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var askedForCatalog = false;
        try
        {
            for (var round = 0; round < 6; round++)
            {
                var message = await model.ChatAsync(messages, round < 5 ? AssistantTools.Definitions : new(), deadline.Token);
                messages.Add(message);
                if (message.ToolCalls is null || message.ToolCalls.Count == 0)
                {
                    if (catalogIntent && reply.Books.Count == 0 && !askedForCatalog && round < 5 && toolError is null)
                    {
                        askedForCatalog = true;
                        messages.Add(new() { Role = "system", Content = "Use the appropriate catalog tool before answering this recommendation request. Do not invent titles." });
                        continue;
                    }
                    reply.Reply = message.Content.Length > 2000 ? message.Content[..2000] : message.Content;
                    break;
                }
                if (round == 5) throw new ModelFailure("tool_limit", "The assistant could not finish within its tool limit. No cart actions were applied. Try a more specific request.");
                foreach (var call in message.ToolCalls)
                {
                    using var doc = JsonDocument.Parse(call.Function.Arguments);
                    var signature = call.Function.Name + ":" + doc.RootElement.GetRawText();
                    if (!seenCalls.TryGetValue(signature, out var outcome))
                    {
                        outcome = tools.Execute(call.Function.Name, doc.RootElement);
                        seenCalls[signature] = outcome;
                        reply.Notes.AddRange(outcome.Notes);
                        using var result = JsonDocument.Parse(outcome.Content);
                        toolError = result.RootElement.TryGetProperty("error", out var errorText) ? errorText.GetString() : null;
                        foreach (var b in outcome.Books) if (!reply.Books.Any(old => old.Id == b.Id)) reply.Books.Add(b);
                        var actions = outcome.Actions.Concat(outcome.Action is null ? Array.Empty<AssistantAction>() : new[] { outcome.Action });
                        foreach (var action in actions)
                            if (action.Type != "addToCart" || (action.BookId.HasValue && additions.Add(action.BookId.Value))) reply.Actions.Add(action);
                    }
                    messages.Add(new() { Role = "tool", ToolCallId = call.Id, Content = outcome.Content });
                }
            }
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        { throw new ModelFailure("timeout", "The assistant timed out. No cart changes were applied. Please retry a shorter request.", 504); }
        catch (JsonException) { throw new ModelFailure("invalid_response", "The assistant returned invalid tool arguments. No cart changes were applied. Please retry."); }
        if (reply.Actions.Any(a => a.Type == "addToCart"))
            reply.Reply = "Checking your requested additions against current stock…"; // The browser replaces this with actual cart results.
        else if (toolError is not null)
            reply.Reply = toolError;
        else if (catalogIntent)
            reply.Reply = reply.Books.Count > 0 ? "Here are verified catalog matches in the order shown below. " + string.Join(" ", reply.Notes) : "I couldn't verify a matching catalog book. Try a title, author, genre, or a more specific budget.";
        else if (System.Text.RegularExpressions.Regex.IsMatch(reply.Reply, @"\b(added|adding)\b[^.!?]*\bcart\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            reply.Reply = "Nothing was added. Please specify a title and quantity, or use a book's Add button.";
        if (string.IsNullOrWhiteSpace(reply.Reply)) reply.Reply = reply.Books.Count > 0 ? "Here are matching catalog books." : "Please clarify the title or store question so I can help.";
        return reply;
    }
}
