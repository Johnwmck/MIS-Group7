using System.Net.Http.Json;
using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Thin HTTP wrapper around a local Ollama server's chat endpoint. Configured by
// the "Assistant" section of appsettings.json. Any failure surfaces as an
// exception so AssistantService can fall back to the scripted bot.
public sealed class OllamaClient
{
    private readonly HttpClient http;
    private readonly ILogger<OllamaClient> logger;

    public string Model { get; }
    public string BaseUrl { get; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public OllamaClient(HttpClient http, IConfiguration configuration, ILogger<OllamaClient> logger)
    {
        this.http = http;
        this.logger = logger;
        var section = configuration.GetSection("Assistant");
        BaseUrl = (section["OllamaUrl"] ?? "http://localhost:11434").TrimEnd('/');
        Model = section["Model"] ?? "qwen2.5:7b";
        var timeout = section.GetValue<int?>("TimeoutSeconds") ?? 45;
        http.Timeout = TimeSpan.FromSeconds(timeout);
    }

    // --- One non-streamed chat round, with tool definitions ---

    public async Task<OllamaMessage> ChatAsync(List<OllamaMessage> messages, List<object> tools, CancellationToken cancellation)
    {
        var request = new OllamaChatRequest
        {
            Model = Model,
            Messages = messages,
            Tools = tools,
            Stream = false,
            // Keep the model loaded between questions; a cold load adds ~30-40 seconds.
            KeepAlive = "30m",
            Options = new Dictionary<string, object>
            {
                // Low temperature keeps tool arguments and policy answers steady.
                ["temperature"] = 0.2,
                // Enough room for the system prompt, a trimmed history, and tool results.
                ["num_ctx"] = 8192
            }
        };

        using var response = await http.PostAsJsonAsync(BaseUrl + "/api/chat", request, JsonOptions, cancellation);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellation);
            logger.LogWarning("Ollama returned HTTP {Status}: {Body}", (int)response.StatusCode, body);
            throw new HttpRequestException($"Ollama returned HTTP {(int)response.StatusCode}.");
        }

        var result = await response.Content.ReadFromJsonAsync<OllamaChatResponse>(JsonOptions, cancellation);
        return result?.Message ?? throw new HttpRequestException("Ollama returned an empty response.");
    }

    // --- Availability check for the widget badge ---
    // True only when the server answers and the configured model is pulled.

    public async Task<AssistantStatus> GetStatusAsync(CancellationToken cancellation)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            using var response = await http.GetAsync(BaseUrl + "/api/tags", timeout.Token);
            if (!response.IsSuccessStatusCode)
                return new AssistantStatus(false, Model, "Ollama answered with HTTP " + (int)response.StatusCode + ".");

            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(timeout.Token), cancellationToken: timeout.Token);
            var names = document.RootElement.TryGetProperty("models", out var models) && models.ValueKind == JsonValueKind.Array
                ? models.EnumerateArray()
                    .Select(model => model.TryGetProperty("name", out var name) ? name.GetString() ?? "" : "")
                    .ToList()
                : new List<string>();

            // "qwen2.5:7b" and "qwen2.5:7b-instruct" are different pulls, so match exactly
            // or on the bare name when no tag was configured.
            var available = names.Any(name =>
                string.Equals(name, Model, StringComparison.OrdinalIgnoreCase) ||
                (!Model.Contains(':') && name.StartsWith(Model + ":", StringComparison.OrdinalIgnoreCase)));

            return available
                ? new AssistantStatus(true, Model, "Local model ready.")
                : new AssistantStatus(false, Model, $"Ollama is running but '{Model}' is not pulled. Run: ollama pull {Model}");
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException)
        {
            return new AssistantStatus(false, Model, "Ollama is not running at " + BaseUrl + ".");
        }
    }
}
