using System.Text.Json.Serialization;

namespace Team7Books.Api.Models;

// --- Chat request from the browser widget ---

// One turn of the conversation. The browser keeps the transcript and sends it
// back on every request, so the server stays stateless.
public class AssistantMessage
{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

public class AssistantChatRequest
{
    public List<AssistantMessage> Messages { get; set; } = new();
}

// --- Reply to the browser ---

// Compact book summary for the chat's book cards. Deliberately narrower than
// Book so the model's tool results and the UI cards share one shape.
public record AssistantBookCard(
    int Id,
    string Title,
    string Author,
    string Genre,
    decimal Price,
    decimal? SalePrice,
    string Availability,
    string Image);

// Something the browser must do after reading the reply. The cart and the
// current page live in the browser, so the server can only ask for these.
public class AssistantAction
{
    public string Type { get; set; } = string.Empty;      // "addToCart" | "navigate"
    public int? BookId { get; set; }
    public int? Quantity { get; set; }
    public string? Title { get; set; }
    public string? Url { get; set; }
    public string? Label { get; set; }
}

public class AssistantReply
{
    public string Reply { get; set; } = string.Empty;
    // "ollama" when a local model answered, "fallback" for the built-in bot.
    public string Mode { get; set; } = "fallback";
    public List<AssistantBookCard> Books { get; set; } = new();
    public List<AssistantAction> Actions { get; set; } = new();
}

public record AssistantStatus(bool ModelAvailable, string Model, string Detail);

// One help-page FAQ entry, served from the same text the assistant answers with.
public record FaqEntry(string Id, string Question, string Answer);

// --- Ollama /api/chat wire format ---
// Only the fields this project uses; everything else is ignored on read.

public class OllamaMessage
{
    [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
    [JsonPropertyName("content")] public string Content { get; set; } = string.Empty;
    [JsonPropertyName("tool_calls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<OllamaToolCall>? ToolCalls { get; set; }
}

public class OllamaToolCall
{
    [JsonPropertyName("function")] public OllamaFunctionCall Function { get; set; } = new();
}

public class OllamaFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    // Ollama sends parsed JSON here; a few models send a JSON string instead.
    [JsonPropertyName("arguments")] public System.Text.Json.JsonElement Arguments { get; set; }
}

public class OllamaChatRequest
{
    [JsonPropertyName("model")] public string Model { get; set; } = string.Empty;
    [JsonPropertyName("messages")] public List<OllamaMessage> Messages { get; set; } = new();
    [JsonPropertyName("tools")] public List<object> Tools { get; set; } = new();
    [JsonPropertyName("stream")] public bool Stream { get; set; } = false;
    [JsonPropertyName("keep_alive")] public string KeepAlive { get; set; } = "5m";
    [JsonPropertyName("options")] public Dictionary<string, object> Options { get; set; } = new();
}

public class OllamaChatResponse
{
    [JsonPropertyName("message")] public OllamaMessage Message { get; set; } = new();
    [JsonPropertyName("done")] public bool Done { get; set; }
}
