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
    public Guid RequestId { get; set; }
    public List<CartSelection> Cart { get; set; } = new();
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
    string Image,
    decimal? MemberPrice = null,
    bool MemberEligible = false,
    bool MemberOfferApplied = false,
    decimal? SeriesOrder = null);

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
    // MIS provider response; failures are explicit HTTP errors.
    public string Mode { get; set; } = "mis";
    public Guid RequestId { get; set; }
    public List<AssistantBookCard> Books { get; set; } = new();
    public List<AssistantAction> Actions { get; set; } = new();
    public List<string> Notes { get; set; } = new();
}

public record AssistantStatus(bool ModelAvailable, string Model, string Detail);

// One help-page FAQ entry, served from the same text the assistant answers with.
public record FaqEntry(string Id, string Question, string Answer);

// OpenAI-compatible wire messages; streamed arguments are kept as JSON strings.
public class ModelMessage
{
    [JsonPropertyName("role")] public string Role { get; set; } = "";
    [JsonPropertyName("content")] public string Content { get; set; } = "";
    [JsonPropertyName("tool_calls"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ModelToolCall>? ToolCalls { get; set; }
    [JsonPropertyName("tool_call_id"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ToolCallId { get; set; }
}
public class ModelToolCall
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "function";
    [JsonPropertyName("function")] public ModelFunctionCall Function { get; set; } = new();
}
public class ModelFunctionCall
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("arguments")] public string Arguments { get; set; } = "{}";
}

public record CartSelection(int BookId, int Quantity);
