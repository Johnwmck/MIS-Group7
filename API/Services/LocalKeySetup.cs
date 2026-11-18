using System.Text;
namespace Team7Books.Api.Services;

// Interactive developer convenience only. Hosts and redirected processes must never
// wait for terminal input. A key is neither echoed nor included in diagnostic output.
public static class LocalKeySetup
{
    public static string? GetKey(IConfiguration config) => Environment.GetEnvironmentVariable("MIS_LLM_KEY") ?? Environment.GetEnvironmentVariable("MIS_LLM_KeY") ?? config["MIS_LLM_KEY"];
    public static bool HasKey(string? key) => !string.IsNullOrWhiteSpace(key) &&
        !key.StartsWith("your-", StringComparison.OrdinalIgnoreCase);

    public static bool EnsureKey(IConfiguration configuration, bool development, string apiDirectory)
    {
        if (HasKey(GetKey(configuration))) return true;
        if (!development || Console.IsInputRedirected || Console.IsOutputRedirected)
        {
            Console.WriteLine("MIS assistant key is not configured. Set MIS_LLM_KEY in the server environment or API/.env. The store can run; assistant requests will explain the missing setup.");
            return true;
        }
        Console.WriteLine("The MIS assistant needs an authorized university API key before this local launch can continue.");
        Console.WriteLine("Input is hidden. Press Enter with no key, or Ctrl+C, to cancel startup.");
        Console.Write("MIS API key (hidden): ");
        var key = ReadSecret();
        if (string.IsNullOrWhiteSpace(key))
        {
            Console.WriteLine("Startup cancelled. No key was saved.");
            return false;
        }
        if (key.Length > 4096 || key.Any(c => char.IsControl(c) || char.IsWhiteSpace(c)))
        {
            Console.WriteLine("Startup cancelled: the key must be one non-empty token without spaces or control characters.");
            return false;
        }
        Environment.SetEnvironmentVariable("MIS_LLM_KEY", key);
        Console.Write("Save for future launches in API/.env (plaintext, with owner-only permissions on macOS/Linux)? [y/N]: ");
        var save = Console.ReadLine();
        if (string.Equals(save?.Trim(), "y", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(save?.Trim(), "yes", StringComparison.OrdinalIgnoreCase))
        {
            try { SaveKey(apiDirectory, key); Console.WriteLine("Key saved in the Git-ignored API/.env."); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            { Console.WriteLine("Could not save API/.env. The key is active for this process only; configure it again for the next launch."); }
        }
        else Console.WriteLine("Key set for this API process only.");
        return true;
    }

    private static string? ReadSecret()
    {
        var value = new StringBuilder();
        var oldControlC = Console.TreatControlCAsInput;
        try
        {
            Console.TreatControlCAsInput = true;
            while (true)
            {
                var pressed = Console.ReadKey(intercept: true);
                if (pressed.Key == ConsoleKey.Enter) { Console.WriteLine(); return value.ToString().Trim(); }
                if (pressed.Key == ConsoleKey.C && pressed.Modifiers.HasFlag(ConsoleModifiers.Control)) { Console.WriteLine(); return null; }
                if (pressed.Key == ConsoleKey.Backspace) { if (value.Length > 0) value.Length--; continue; }
                if (!char.IsControl(pressed.KeyChar) && value.Length < 4097) value.Append(pressed.KeyChar);
            }
        }
        finally { Console.TreatControlCAsInput = oldControlC; }
    }

    public static void SaveKey(string apiDirectory, string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Any(c => char.IsControl(c) || char.IsWhiteSpace(c)))
            throw new ArgumentException("Invalid key token.");
        var path = Path.Combine(apiDirectory, ".env");
        if (File.Exists(path) && File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
            throw new IOException("A linked environment file cannot be replaced.");
        var lines = File.Exists(path) ? File.ReadAllLines(path).ToList() : new List<string>();
        // Retain all other settings and comments. Replace either supported spelling.
        lines.RemoveAll(line =>
        {
            var text = line.Trim();
            if (text.StartsWith("export ")) text = text[7..].TrimStart();
            var separator = text.IndexOf('=');
            return separator > 0 && text[..separator].Trim().Equals("MIS_LLM_KEY", StringComparison.OrdinalIgnoreCase);
        });
        lines.Add("MIS_LLM_KEY=\"" + key + "\"");
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using (var stream = new FileStream(temporary, options))
            {
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false), leaveOpen: true))
                    foreach (var line in lines) writer.WriteLine(line);
                stream.Flush(flushToDisk: true);
            }
            File.Move(temporary, path, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
