using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Team7Books.Api.Models;
namespace Team7Books.Api.Services;

public sealed class ModelFailure(string code, string message, int status = 503) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

// OpenAI-compatible streaming transport. No bookstore rules or browser secrets here.
public sealed class MisModelClient(HttpClient http, IConfiguration config)
{
    public string Model => config["MIS_LLM_MODEL"] ?? "qwen3.8-27b";
    private string? Key => LocalKeySetup.GetKey(config); // IConfiguration is case-insensitive, including MIS_LLM_KeY.
    public bool Configured => LocalKeySetup.HasKey(Key);
    public int TimeoutSeconds => Math.Clamp(int.TryParse(config["MIS_LLM_TIMEOUT_SECONDS"], out var value) ? value : 150, 5, 300);
    public AssistantStatus Status() => new(Configured, Model, Configured
        ? "MIS configured. Model access is checked on each request." : "MIS_LLM_KEY is missing. Add an authorized key to API/.env or the server environment.");
    private static readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public async Task<ModelMessage> ChatAsync(List<ModelMessage> messages, List<object> tools, CancellationToken cancellation)
    {
        if (!Configured) throw new ModelFailure("missing_key", "The MIS assistant is not configured. Add an authorized MIS_LLM_KEY on the server; browsing and checkout still work.");
        var key = Key!;
        if (key.Length > 4096 || key.Any(c => char.IsWhiteSpace(c) || char.IsControl(c)))
            throw new ModelFailure("configuration", "The configured MIS key must be one token without spaces or control characters. Check the server configuration.");
        var endpoint = (config["MIS_LLM_ENDPOINT"] ?? "https://local-llm.uamishub.com/v1").TrimEnd('/');
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || ((uri.Scheme != "https" && !uri.IsLoopback) || uri.UserInfo.Length > 0 || uri.Query.Length > 0))
            throw new ModelFailure("configuration", "The MIS endpoint must use HTTPS (loopback HTTP is allowed for tests).");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(TimeoutSeconds));
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint + "/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Content = JsonContent.Create(new {
            model = Model, messages, tools = tools.Count > 0 ? tools : null,
            stream = true, temperature = .2,
            max_tokens = Math.Clamp(int.TryParse(config["MIS_LLM_MAX_TOKENS"], out var tokens) ? tokens : 1800, 128, 4096),
            chat_template_kwargs = new { enable_thinking = false }
        }, options: json);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
                throw (int)response.StatusCode switch {
                    401 => new ModelFailure("unauthorized", "MIS rejected the configured credential. Check the server's authorized key.", 503),
                    403 or 404 => new ModelFailure("model_access", "The MIS key may be pending or lack access to this model. Confirm qwen3.8-27b access with the university; regenerating the key is not the recommended fix.", 503),
                    429 => new ModelFailure("busy", "MIS is busy or rate limited. Please retry shortly.", 503),
                    _ => new ModelFailure("unavailable", "The MIS service is unavailable. Please retry shortly.")
                };
            using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(timeout.Token));
            return await ReadStreamAsync(reader, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        { throw new ModelFailure("timeout", "The MIS response timed out. No assistant cart changes were applied. Try a shorter request.", 504); }
        catch (HttpRequestException) { throw new ModelFailure("unavailable", "Cannot reach the MIS service. Check the server connection and retry."); }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException) { throw new ModelFailure("invalid_response", "MIS returned an incomplete or invalid response. No assistant cart changes were applied. Please retry."); }
    }

    // Assemble complete SSE events and indexed tool-call fragments before returning anything.
    // Incomplete/length-limited streams never authorize actions.
    public static async Task<ModelMessage> ReadStreamAsync(TextReader reader, CancellationToken cancellation)
    {
        var text = new StringBuilder();
        var calls = new SortedDictionary<int, (StringBuilder Id, StringBuilder Name, StringBuilder Args)>();
        var data = new StringBuilder();
        var bytes = 0; string? finish = null; bool done = false;
        void Event()
        {
            var payload = data.ToString().Trim(); data.Clear();
            if (payload.Length == 0) return;
            if (payload == "[DONE]") { done = true; return; }
            using var doc = JsonDocument.Parse(payload);
            if (doc.RootElement.TryGetProperty("error", out _)) throw new JsonException();
            if (!doc.RootElement.TryGetProperty("choices", out var choices)) return;
            foreach (var choice in choices.EnumerateArray())
            {
                if (choice.TryGetProperty("index", out var index) && index.GetInt32() != 0) continue;
                if (choice.TryGetProperty("finish_reason", out var reason) && reason.ValueKind == JsonValueKind.String) finish = reason.GetString();
                if (!choice.TryGetProperty("delta", out var delta)) continue;
                if (delta.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.String) text.Append(content.GetString());
                if (delta.TryGetProperty("tool_calls", out var tools)) foreach (var tool in tools.EnumerateArray())
                {
                    var i = tool.GetProperty("index").GetInt32();
                    if (i is < 0 or > 15) throw new JsonException();
                    if (!calls.TryGetValue(i, out var call)) call = (new(), new(), new());
                    if (tool.TryGetProperty("id", out var id)) call.Id.Append(id.GetString());
                    if (tool.TryGetProperty("function", out var fn))
                    {
                        if (fn.TryGetProperty("name", out var n)) call.Name.Append(n.GetString());
                        if (fn.TryGetProperty("arguments", out var a)) call.Args.Append(a.GetString());
                    }
                    if (call.Args.Length > 16000 || call.Name.Length > 100 || call.Id.Length > 200) throw new JsonException();
                    calls[i] = call;
                }
            }
        }
        while (await reader.ReadLineAsync(cancellation) is { } line)
        {
            bytes += line.Length;
            if (bytes > 256000 || text.Length > 16000 || line.Length > 32000) throw new JsonException();
            if (line.Length == 0) { Event(); if (done) break; }
            else if (line.StartsWith("data:")) data.AppendLine(line[5..].TrimStart());
        }
        if (data.Length > 0) Event();
        if (!done || finish is not ("stop" or "tool_calls") || (calls.Count > 0 && finish != "tool_calls")) throw new JsonException();
        var result = new ModelMessage { Role = "assistant", Content = text.ToString() };
        foreach (var call in calls.Values)
        {
            using var args = JsonDocument.Parse(call.Args.ToString());
            if (args.RootElement.ValueKind != JsonValueKind.Object || call.Id.Length == 0 || call.Name.Length == 0) throw new JsonException();
            (result.ToolCalls ??= new()).Add(new ModelToolCall { Id = call.Id.ToString(), Function = new() { Name = call.Name.ToString(), Arguments = call.Args.ToString() } });
        }
        return result;
    }
}
