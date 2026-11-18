namespace Team7Books.Api.Services;

public static class LocalEnvironment
{
    public static string ApiDirectory()
    {
        // dotnet run --project and direct DLL launches can have different working directories.
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                if (File.Exists(Path.Combine(dir.FullName, "Team7Books.Api.csproj"))) return dir.FullName;
                var api = Path.Combine(dir.FullName, "API");
                if (File.Exists(Path.Combine(api, "Team7Books.Api.csproj"))) return api;
            }
        return AppContext.BaseDirectory;
    }
    public static Dictionary<string, string?> Read(string apiDirectory)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var path = Path.Combine(apiDirectory, ".env");
        if (!File.Exists(path)) return values;
        foreach (var line in File.ReadLines(path))
        {
            var text = line.Trim();
            if (text.Length == 0 || text.StartsWith('#')) continue;
            if (text.StartsWith("export ")) text = text[7..].TrimStart();
            var split = text.IndexOf('=');
            if (split < 1) continue;
            var name = text[..split].Trim();
            var value = text[(split + 1)..].Trim();
            if (value.Length >= 2 && ((value[0] == '\'' && value[^1] == '\'') || (value[0] == '"' && value[^1] == '"'))) value = value[1..^1];
            values[name.Replace("__", ":")] = value;
        }
        return values;
    }
}
