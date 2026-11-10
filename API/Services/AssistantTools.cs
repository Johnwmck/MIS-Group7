using System.Text.Json;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// What one tool call produced: text for the model, plus book cards and browser
// actions that are carried through to the final reply.
public sealed class ToolOutcome
{
    public string Content { get; init; } = string.Empty;
    public List<AssistantBookCard> Books { get; init; } = new();
    public AssistantAction? Action { get; init; }
}

// The assistant's tools over the live store. Catalog and order reads happen
// here under the store lock; cart and navigation tools only validate and
// return an action for the browser, which owns both.
public sealed class AssistantTools
{
    private readonly BookstoreStore store;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public AssistantTools(BookstoreStore store) { this.store = store; }

    // --- Tool definitions in Ollama's (OpenAI-style) function format ---

    public static readonly List<object> Definitions = new()
    {
        Function("search_books",
            "Search the bookstore catalog for in-stock books. Use before recommending any title. Returns at most a few matches with id, price, and availability.",
            new
            {
                type = "object",
                properties = new
                {
                    query = new { type = "string", description = "Words from the title, author, series, or topic. Leave empty to browse a genre." },
                    genre = new { type = "string", description = "Optional genre filter such as Fantasy, Mystery, Romance, Science Fiction, Nonfiction." },
                    max_price = new { type = "number", description = "Optional maximum price in US dollars." },
                    limit = new { type = "integer", description = "How many results to return, 1-6. Default 4." }
                }
            }),
        Function("list_genres",
            "List the genres available in the catalog with how many in-stock books each has.",
            new { type = "object", properties = new { } }),
        Function("get_book_details",
            "Get the full description, author bio, series, price, and stock for one book by its id.",
            new
            {
                type = "object",
                properties = new { book_id = new { type = "integer", description = "The book id from search_books." } },
                required = new[] { "book_id" }
            }),
        Function("lookup_order",
            "Look up an order's status. Requires BOTH the order number and the email address used at checkout.",
            new
            {
                type = "object",
                properties = new
                {
                    order_id = new { type = "integer", description = "The order number." },
                    email = new { type = "string", description = "The email address used when the order was placed." }
                },
                required = new[] { "order_id", "email" }
            }),
        Function("add_to_cart",
            "Add a book to the customer's shopping cart. Give the book id (from search_books or a 'Books shown' note) or the exact title.",
            new
            {
                type = "object",
                properties = new
                {
                    book_id = new { type = "integer", description = "The book id, if known." },
                    title = new { type = "string", description = "The book's title, used when the id is not known." },
                    quantity = new { type = "integer", description = "Copies to add. Default 1." }
                }
            }),
        Function("navigate",
            "Offer the customer a button to open a page of the store.",
            new
            {
                type = "object",
                properties = new
                {
                    page = new { type = "string", @enum = new[] { "home", "catalog", "cart", "checkout", "favorites", "help", "book" }, description = "Which page to open." },
                    book_id = new { type = "integer", description = "Required when page is \"book\"." }
                },
                required = new[] { "page" }
            })
    };

    private static object Function(string name, string description, object parameters) =>
        new { type = "function", function = new { name, description, parameters } };

    // --- Dispatch ---

    public ToolOutcome Execute(string name, JsonElement arguments)
    {
        try
        {
            return name switch
            {
                "search_books" => SearchTool(arguments),
                "list_genres" => ListGenresTool(),
                "get_book_details" => BookDetailsTool(arguments),
                "lookup_order" => LookupOrderTool(arguments),
                "add_to_cart" => AddToCartTool(arguments),
                "navigate" => NavigateTool(arguments),
                _ => new ToolOutcome { Content = Error($"Unknown tool '{name}'.") }
            };
        }
        catch (Exception error) when (error is JsonException or FormatException or InvalidOperationException)
        {
            return new ToolOutcome { Content = Error("The tool arguments were not valid: " + error.Message) };
        }
    }

    private static string Error(string message) => JsonSerializer.Serialize(new { error = message }, JsonOptions);

    // --- Tool implementations ---

    private ToolOutcome SearchTool(JsonElement args)
    {
        var query = GetString(args, "query");
        var genre = GetString(args, "genre");
        var maxPrice = GetDecimal(args, "max_price");
        var limit = Math.Clamp(GetInt(args, "limit") ?? 4, 1, 6);

        var books = SearchBooks(query, genre, maxPrice, limit);
        if (books.Count == 0)
            return new ToolOutcome { Content = JsonSerializer.Serialize(new { results = Array.Empty<object>(), note = "No in-stock books matched. Try fewer words or a different genre." }, JsonOptions) };

        var cards = books.Select(ToCard).ToList();
        var results = books.Select(book => new
        {
            id = book.Id,
            title = book.Title,
            author = book.Author,
            genre = book.Genre,
            price = EffectivePrice(book),
            onSale = book.SalePrice is not null,
            availability = DescribeAvailability(book),
            series = book.SeriesName,
            summary = Truncate(book.Description, 160)
        });
        return new ToolOutcome { Content = JsonSerializer.Serialize(new { results }, JsonOptions), Books = cards };
    }

    private ToolOutcome ListGenresTool()
    {
        List<object> genres;
        lock (store.SyncRoot)
        {
            genres = store.Books
                .Where(IsPurchasable)
                .GroupBy(book => book.Genre)
                .OrderByDescending(group => group.Count())
                .Select(group => (object)new { genre = group.Key, inStockBooks = group.Count() })
                .ToList();
        }
        return new ToolOutcome { Content = JsonSerializer.Serialize(new { genres }, JsonOptions) };
    }

    private ToolOutcome BookDetailsTool(JsonElement args)
    {
        var id = GetInt(args, "book_id");
        var book = id is null ? null : FindBook(id.Value);
        if (book is null) return new ToolOutcome { Content = Error("No book with that id is in the catalog.") };

        var details = new
        {
            id = book.Id,
            title = book.Title,
            author = book.Author,
            genre = book.Genre,
            isbn = book.Isbn,
            price = EffectivePrice(book),
            regularPrice = book.Price,
            onSale = book.SalePrice is not null,
            availability = DescribeAvailability(book),
            series = book.SeriesName,
            seriesOrder = book.SeriesOrder,
            description = Truncate(book.Description, 600),
            aboutTheAuthor = Truncate(book.AuthorBio, 300)
        };
        return new ToolOutcome { Content = JsonSerializer.Serialize(details, JsonOptions), Books = new() { ToCard(book) } };
    }

    private ToolOutcome LookupOrderTool(JsonElement args)
    {
        var id = GetInt(args, "order_id");
        var email = GetString(args, "email");
        if (id is null || string.IsNullOrWhiteSpace(email))
            return new ToolOutcome { Content = Error("Both the order number and the email address are required.") };

        var order = FindOrder(id.Value, email);
        if (order is null)
            return new ToolOutcome { Content = Error("No order matches that order number and email. Ask the customer to double-check both.") };

        return new ToolOutcome { Content = JsonSerializer.Serialize(DescribeOrder(order), JsonOptions) };
    }

    private ToolOutcome AddToCartTool(JsonElement args)
    {
        var id = GetInt(args, "book_id");
        var title = GetString(args, "title");
        var quantity = GetInt(args, "quantity") ?? 1;
        var book = id is null ? null : FindBook(id.Value);

        // Small models often lose ids between turns; a title is enough when it is unambiguous.
        if (book is null && !string.IsNullOrWhiteSpace(title))
        {
            var matches = SearchBooks(title, null, null, 3);
            var exact = matches.Where(match => match.Title.Equals(title.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
            if (exact.Count == 1) book = exact[0];
            else if (matches.Count == 1) book = matches[0];
            else if (matches.Count > 1)
                return new ToolOutcome
                {
                    Content = JsonSerializer.Serialize(new
                    {
                        error = "Several books match that title. Ask the customer which one, or call add_to_cart with one of these ids.",
                        candidates = matches.Select(match => new { id = match.Id, title = match.Title, author = match.Author })
                    }, JsonOptions)
                };
        }
        if (book is null)
            return new ToolOutcome { Content = Error("No book matched. Call search_books with the title to find its id, then add_to_cart again.") };

        var error = GetAddToCartError(book, quantity);
        if (error != "") return new ToolOutcome { Content = Error(error) };

        return new ToolOutcome
        {
            Content = JsonSerializer.Serialize(new
            {
                added = true,
                title = book.Title,
                quantity,
                unitPrice = EffectivePrice(book),
                note = "The book is being added to the customer's cart in their browser. Confirm it briefly."
            }, JsonOptions),
            Books = new() { ToCard(book) },
            Action = new AssistantAction { Type = "addToCart", BookId = book.Id, Quantity = quantity, Title = book.Title }
        };
    }

    private ToolOutcome NavigateTool(JsonElement args)
    {
        var page = GetString(args, "page") ?? "";
        var bookId = GetInt(args, "book_id");
        var target = ResolvePage(page, bookId);
        if (target is null) return new ToolOutcome { Content = Error("That page does not exist. Choose home, catalog, cart, checkout, favorites, help, or book with a book_id.") };

        return new ToolOutcome
        {
            Content = JsonSerializer.Serialize(new { offered = true, page = target.Value.Label, note = "A button to open the page is shown to the customer. Tell them to use it." }, JsonOptions),
            Action = new AssistantAction { Type = "navigate", Url = target.Value.Url, Label = target.Value.Label, BookId = bookId }
        };
    }

    // --- Shared catalog/order helpers (also used by the fallback bot) ---

    public static bool IsPurchasable(Book book) =>
        book.Status == "Active" && book.ManualStockOverride != true && book.Inventory > 0;

    public static decimal EffectivePrice(Book book) => book.SalePrice ?? book.Price;

    public static string DescribeAvailability(Book book)
    {
        if (book.Status != "Active") return "Unavailable";
        if (book.ManualStockOverride == true || book.Inventory <= 0) return "Out of stock";
        if (book.Inventory <= 5) return "Only " + book.Inventory + " left";
        return "In stock";
    }

    public static AssistantBookCard ToCard(Book book) =>
        new(book.Id, book.Title, book.Author, book.Genre, book.Price, book.SalePrice, DescribeAvailability(book), book.Image);

    public static string GetAddToCartError(Book book, int quantity)
    {
        if (!IsPurchasable(book)) return $"{book.Title} is currently unavailable.";
        if (quantity < 1) return "The quantity must be at least 1.";
        if (quantity > book.Inventory) return $"Only {book.Inventory} copies of {book.Title} are in stock.";
        return "";
    }

    public Book? FindBook(int id)
    {
        lock (store.SyncRoot)
        {
            var book = store.Books.Find(book => book.Id == id);
            return book is null ? null : Copy(book);
        }
    }

    // The email must match: order numbers are sequential and easy to guess.
    public Order? FindOrder(int id, string email)
    {
        lock (store.SyncRoot)
        {
            var order = store.Orders.Find(order => order.Id == id);
            if (order is null) return null;
            return string.Equals(order.CustomerEmail.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase)
                ? order : null;
        }
    }

    public static object DescribeOrder(Order order) => new
    {
        orderNumber = order.Id,
        placed = order.Date.ToString("MMMM d, yyyy"),
        // The prototype never ships anything; the status is derived from age so the demo feels real.
        status = DescribeOrderStatus(order.Date),
        customerName = order.CustomerName,
        items = order.Items.Select(item => new { item.Title, item.Quantity, item.Price }),
        subtotal = order.Subtotal ?? order.Total,
        tax = order.Tax ?? 0,
        total = order.Total
    };

    public static string DescribeOrderStatus(DateTimeOffset placed)
    {
        var age = DateTimeOffset.UtcNow - placed;
        if (age < TimeSpan.FromHours(4)) return "Processing";
        if (age < TimeSpan.FromDays(1)) return "Shipped (demo tracking: on its way)";
        if (age < TimeSpan.FromDays(5)) return "In transit, arriving in 3-5 business days from the ship date";
        return "Delivered";
    }

    // Case-insensitive word matching with a simple score: title and author hits
    // outrank genre, series, and description hits.
    public List<Book> SearchBooks(string? query, string? genre, decimal? maxPrice, int limit)
    {
        var words = Tokenize(query);
        var genreFilter = (genre ?? "").Trim();

        List<Book> candidates;
        lock (store.SyncRoot)
        {
            candidates = store.Books.Where(IsPurchasable).Select(Copy).ToList();
        }

        var scored = new List<(Book book, int score)>();
        foreach (var book in candidates)
        {
            if (maxPrice is not null && EffectivePrice(book) > maxPrice.Value) continue;
            if (genreFilter != "" && !book.Genre.Contains(genreFilter, StringComparison.OrdinalIgnoreCase) &&
                !genreFilter.Contains(book.Genre, StringComparison.OrdinalIgnoreCase)) continue;

            var score = 0;
            if (words.Count == 0)
            {
                score = 1;
            }
            else
            {
                foreach (var word in words)
                {
                    if (book.Title.Contains(word, StringComparison.OrdinalIgnoreCase)) score += 5;
                    if (book.Author.Contains(word, StringComparison.OrdinalIgnoreCase)) score += 4;
                    if ((book.SeriesName ?? "").Contains(word, StringComparison.OrdinalIgnoreCase)) score += 3;
                    if (book.Genre.Contains(word, StringComparison.OrdinalIgnoreCase)) score += 2;
                    if (book.Description.Contains(word, StringComparison.OrdinalIgnoreCase)) score += 1;
                }
                if (score == 0) continue;
                // Whole-phrase title match beats scattered word hits.
                if (book.Title.Contains(query!.Trim(), StringComparison.OrdinalIgnoreCase)) score += 6;
            }
            scored.Add((book, score));
        }

        return scored
            .OrderByDescending(entry => entry.score)
            .ThenBy(entry => entry.book.Title)
            .Take(limit)
            .Select(entry => entry.book)
            .ToList();
    }

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "by", "with", "about", "book", "books",
        "novel", "novels", "some", "any", "good", "great", "best", "me", "i", "want", "like", "find", "search",
        "recommend", "recommendation", "recommendations", "suggest", "looking", "please", "can", "you", "do",
        "have", "is", "are", "there", "my", "your", "under", "less", "than", "cheap", "something", "new", "read"
    };

    public static List<string> Tokenize(string? text) =>
        (text ?? "")
            .Split(new[] { ' ', ',', '.', '?', '!', '"', '\'', ':', ';', '(', ')' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(word => word.Length > 1 && !StopWords.Contains(word))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    public (string Url, string Label)? ResolvePage(string page, int? bookId)
    {
        switch (page.Trim().ToLowerInvariant())
        {
            case "home": case "index": return ("index.html", "Home");
            case "catalog": case "browse": case "shop": return ("catalog.html", "Catalog");
            case "cart": return ("cart.html", "Cart");
            case "checkout": return ("cart.html", "Cart & Checkout");  // checkout needs a reviewed cart first
            case "favorites": case "favourites": return ("favorites.html", "Favorites");
            case "help": case "faq": case "support": return ("help.html", "Help & Support");
            case "book":
                var book = bookId is null ? null : FindBook(bookId.Value);
                return book is null ? null : ("book.html?id=" + book.Id, book.Title);
            default: return null;
        }
    }

    private static Book Copy(Book book) => new()
    {
        Id = book.Id, Revision = book.Revision, Isbn = book.Isbn, Title = book.Title, Author = book.Author,
        Genre = book.Genre, Price = book.Price, Inventory = book.Inventory, Status = book.Status, Image = book.Image,
        Description = book.Description, AuthorBio = book.AuthorBio, ManualStockOverride = book.ManualStockOverride,
        SeriesName = book.SeriesName, SeriesOrder = book.SeriesOrder
    };

    private static string Truncate(string text, int max)
    {
        text = (text ?? "").Trim();
        return text.Length <= max ? text : text[..max].TrimEnd() + "…";
    }

    // --- Lenient argument readers: small models send numbers as strings and vice versa ---

    private static string? GetString(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.Null => null,
            _ => value.GetRawText()
        };
    }

    private static int? GetInt(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return number;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var real)) return (int)Math.Round(real);
        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed)) return parsed;
        return null;
    }

    private static decimal? GetDecimal(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)) return number;
        if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString()?.TrimStart('$'), out var parsed)) return parsed;
        return null;
    }
}
