using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Runs one assistant turn: builds the prompt, loops the local model through
// its tool calls, and collects book cards and browser actions for the reply.
// Any model failure (not installed, not running, timeout, bad output) falls
// back to the scripted FallbackAssistant so the widget always answers.
public sealed class AssistantService
{
    private const int MaxHistoryMessages = 12;
    private const int MaxMessageLength = 1500;
    private const int MaxToolRounds = 5;

    private readonly OllamaClient ollama;
    private readonly AssistantTools tools;
    private readonly FallbackAssistant fallback;
    private readonly ILogger<AssistantService> logger;

    public AssistantService(OllamaClient ollama, AssistantTools tools, FallbackAssistant fallback, ILogger<AssistantService> logger)
    {
        this.ollama = ollama;
        this.tools = tools;
        this.fallback = fallback;
        this.logger = logger;
    }

    public Task<AssistantStatus> GetStatusAsync(CancellationToken cancellation) => ollama.GetStatusAsync(cancellation);

    public async Task<AssistantReply> RespondAsync(List<AssistantMessage> history, CancellationToken cancellation)
    {
        history = TrimHistory(history);
        try
        {
            return await RespondWithModelAsync(history, cancellation);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or NotSupportedException)
        {
            // The browser's own cancellation should not produce a fallback answer.
            if (cancellation.IsCancellationRequested) throw;
            logger.LogInformation("Assistant falling back to the scripted bot: {Reason}", error.Message);
            return fallback.Answer(history);
        }
    }

    // --- Model loop ---

    private async Task<AssistantReply> RespondWithModelAsync(List<AssistantMessage> history, CancellationToken cancellation)
    {
        var messages = new List<OllamaMessage>
        {
            new() { Role = "system", Content = AssistantKnowledge.BuildSystemPrompt(DateTimeOffset.Now) }
        };
        messages.AddRange(history.Select(turn => new OllamaMessage { Role = turn.Role, Content = turn.Content }));

        var reply = new AssistantReply { Mode = "ollama" };
        var seenBooks = new HashSet<int>();
        var nudgedToAct = false;
        var nudgedToSearch = false;

        for (var round = 0; round <= MaxToolRounds; round++)
        {
            // After the final allowed round, hide the tools so the model must answer in words.
            var definitions = round < MaxToolRounds ? AssistantTools.Definitions : new List<object>();
            var message = await ollama.ChatAsync(messages, definitions, cancellation);
            messages.Add(message);

            if (message.ToolCalls is null || message.ToolCalls.Count == 0)
            {
                // Small models often say "I've added it" without calling add_to_cart, which
                // leaves the cart unchanged. Give the model one chance to make the real call.
                if (!nudgedToAct && round < MaxToolRounds
                    && !reply.Actions.Any(action => action.Type == "addToCart")
                    && ClaimsCartAdd(message.Content))
                {
                    nudgedToAct = true;
                    messages.Add(new OllamaMessage
                    {
                        Role = "system",
                        Content = "You said a book was added to the cart, but you did not call add_to_cart, so nothing was added. Call add_to_cart now with the book id (from the [Books shown] note) or exact title, then confirm."
                    });
                    continue;
                }
                // Likewise "Let me look up some titles" with no search_books call: without the
                // search, the next answer comes from the model's memory and names books we don't sell.
                if (!nudgedToSearch && round < MaxToolRounds && reply.Books.Count == 0 && AnnouncesSearch(message.Content))
                {
                    nudgedToSearch = true;
                    messages.Add(new OllamaMessage
                    {
                        Role = "system",
                        Content = "You said you would search, but you did not call search_books. Call search_books now (use a genre or keywords), then recommend only the books it returns."
                    });
                    continue;
                }
                reply.Reply = CleanReply(message.Content);
                break;
            }

            foreach (var call in message.ToolCalls)
            {
                var name = call.Function.Name;
                var arguments = NormalizeArguments(call.Function.Arguments);
                logger.LogDebug("Assistant tool call {Tool} {Arguments}", name, arguments.GetRawText());

                var outcome = tools.Execute(name, arguments);
                foreach (var card in outcome.Books)
                {
                    if (seenBooks.Add(card.Id)) reply.Books.Add(card);
                }
                if (outcome.Action is not null) reply.Actions.Add(outcome.Action);

                messages.Add(new OllamaMessage { Role = "tool", Content = outcome.Content });
            }
        }

        // Still claiming an add that never happened, even after the nudge: be honest instead.
        if (!reply.Actions.Any(action => action.Type == "addToCart") && ClaimsCartAdd(reply.Reply))
        {
            reply.Reply = "Sorry, I couldn't add that to your cart. Tell me the exact title and I'll try again, or use the Add to Cart button on the book.";
        }

        if (string.IsNullOrWhiteSpace(reply.Reply))
        {
            // The model acted but said nothing; describe the outcome ourselves.
            reply.Reply = SummarizeActions(reply);
        }
        if (string.IsNullOrWhiteSpace(reply.Reply))
            throw new NotSupportedException("The model returned an empty reply.");

        // Cards only matter for recommendations; drop them when the model answered a policy question.
        if (reply.Books.Count > 0 && reply.Actions.Count == 0 && !MentionsAnyBook(reply.Reply, reply.Books))
            reply.Books.Clear();
        return reply;
    }

    // True when a statement (not a question) says something was added to the cart.
    private static bool ClaimsCartAdd(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return false;
        var sentences = System.Text.RegularExpressions.Regex.Split(content, @"(?<=[.!?])\s+");
        return sentences.Any(sentence =>
            !sentence.TrimEnd().EndsWith('?')
            && System.Text.RegularExpressions.Regex.IsMatch(sentence, @"\b(added|adding)\b[^.?!]*\bcart\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }

    // True when the reply promises a catalog search ("I'll look up some titles") instead of doing one.
    private static bool AnnouncesSearch(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return false;
        var sentences = System.Text.RegularExpressions.Regex.Split(content, @"(?<=[.!?])\s+");
        return sentences.Any(sentence =>
            !sentence.TrimEnd().EndsWith('?')
            && System.Text.RegularExpressions.Regex.IsMatch(sentence, @"\b(let me|let's|let us|i'll|i will|i'm going to)\b[^.?!]*\b(search|look up|look for|find|check)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }

    // Models sometimes write markdown links or URLs despite instructions; the
    // navigate action already renders a real button, so keep only the words.
    private static string CleanReply(string content)
    {
        // The model sometimes writes the "[Books shown: #id Title; ...]" history note meant only
        // for it, often as its whole book list. Drop it if the titles are already in the reply,
        // otherwise turn it into a plain list of titles.
        var notePattern = @"\[Books shown:([^\]]*)\]";
        var outsideNote = System.Text.RegularExpressions.Regex.Replace(content, notePattern, "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var text = System.Text.RegularExpressions.Regex.Replace(content, @"(^[ \t]*[-*•][ \t]*)?" + notePattern, match =>
        {
            var titles = match.Groups[2].Value.Split(';')
                .Select(entry => System.Text.RegularExpressions.Regex.Replace(entry, @"^\s*#?\d+\s*", "").Trim())
                .Where(title => title.Length > 0)
                .ToList();
            if (titles.Count == 0 || titles.Any(title => outsideNote.Contains(title, StringComparison.OrdinalIgnoreCase)))
                return "";
            return "\n- " + string.Join("\n- ", titles) + "\n";
        }, System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Multiline);
        text = System.Text.RegularExpressions.Regex.Replace(text, @"^\s*[-*•]\s*$\n?", "", System.Text.RegularExpressions.RegexOptions.Multiline);
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\n{3,}", "\n\n");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\[([^\]]+)\]\([^)]*\)", "$1");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"^#{1,6}\s*", "", System.Text.RegularExpressions.RegexOptions.Multiline);
        // A line that is only "[Go to Cart]" is the model drawing its own button.
        text = System.Text.RegularExpressions.Regex.Replace(text, @"^\s*\[[^\]\n]+\]\s*$\n?", "", System.Text.RegularExpressions.RegexOptions.Multiline);
        return text.Trim();
    }

    private static string SummarizeActions(AssistantReply reply)
    {
        var add = reply.Actions.FirstOrDefault(action => action.Type == "addToCart");
        if (add is not null) return $"Added {add.Quantity} × {add.Title} to your cart.";
        var go = reply.Actions.FirstOrDefault(action => action.Type == "navigate");
        if (go is not null) return $"Use the button below to open {go.Label}.";
        if (reply.Books.Count > 0) return "Here are some titles that match:";
        return "";
    }

    private static bool MentionsAnyBook(string text, List<AssistantBookCard> books) =>
        books.Any(book => text.Contains(book.Title, StringComparison.OrdinalIgnoreCase) ||
                          text.Contains(book.Author, StringComparison.OrdinalIgnoreCase));

    // Some models return arguments as a JSON string rather than an object.
    private static JsonElement NormalizeArguments(JsonElement arguments)
    {
        if (arguments.ValueKind == JsonValueKind.String)
        {
            try
            {
                using var document = JsonDocument.Parse(arguments.GetString() ?? "{}");
                return document.RootElement.Clone();
            }
            catch (JsonException) { }
        }
        return arguments;
    }

    // --- History hygiene ---

    private static List<AssistantMessage> TrimHistory(List<AssistantMessage> history)
    {
        var trimmed = history
            .Where(turn => turn.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(turn.Content))
            .Select(turn => new AssistantMessage
            {
                Role = turn.Role,
                Content = turn.Content.Length > MaxMessageLength ? turn.Content[..MaxMessageLength] : turn.Content
            })
            .ToList();
        if (trimmed.Count > MaxHistoryMessages)
            trimmed = trimmed.Skip(trimmed.Count - MaxHistoryMessages).ToList();
        // The conversation should open with the customer, not a dangling assistant turn.
        while (trimmed.Count > 0 && trimmed[0].Role != "user") trimmed.RemoveAt(0);
        return trimmed;
    }
}
