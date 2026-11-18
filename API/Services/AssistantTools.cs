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
    public List<AssistantAction> Actions { get; init; } = new();
    public List<string> Notes { get; init; } = new();
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

    private readonly IHttpContextAccessor context;
    public AssistantChatRequest Request { get; set; } = new();
    private System.Security.Claims.ClaimsPrincipal User => context.HttpContext?.User ?? new();
    public AssistantTools(BookstoreStore store, IHttpContextAccessor context) { this.store = store; this.context = context; }
    private bool Member => CustomerSession.Find(User, store.Customers) is not null;

    // --- Tool definitions in OpenAI-compatible function format ---

    public static readonly List<object> Definitions = new()
    {
        Function("store_information", "Get current promotions, member benefits, rewards rules, store policies and the signed-in customer's points balance.", new { type = "object", properties = new { } }),
        Function("get_series", "Get every catalog entry in a named series, in decimal reading order, including unavailable books. Clarify ambiguous series names.", new { type = "object", properties = new { name = new { type = "string" } }, required = new[] { "name" } }),
        Function("add_series", "Prepare the requested collection for the cart in reading order. Unavailable entries are skipped and reported. Ask whether to add duplicates if any entries are already in the cart.", new { type = "object", properties = new { name = new { type = "string" }, include_duplicates = new { type = "boolean" }, quantity = new { type = "integer", description = "Copies of each entry, default 1." } }, required = new[] { "name" } }),
        Function("search_books",
            "Search the bookstore catalog for in-stock books. Use before recommending any title. Returns at most a few matches with id, price, and availability.",
            new
            {
                type = "object",
                properties = new
                {
                    query = new { type = "string", description = "Words from the title, author, series, or topic. Leave empty to browse a genre." },
                    genre = new { type = "string", description = "Optional genre filter such as Fantasy, Mystery, Romance, Science Fiction, Nonfiction." },
                    exclude_author = new { type = "string", description = "Exclude this author for another-author follow-ups." },
                    exclude_ids = new { type = "array", items = new { type = "integer" }, description = "Exclude previously shown book ids." },
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
            "Read the signed-in customer's own order by number. Identity comes from the authenticated session, never supplied email or customer ID.",
            new
            {
                type = "object",
                properties = new
                {
                    order_id = new { type = "integer", description = "The order number." },
                    email = new { type = "string", description = "The email address used when the order was placed." }
                },
                required = new[] { "order_id" }
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
            if (arguments.ValueKind != JsonValueKind.Object) return new() { Content = Error("Tool arguments must be an object.") };
            if (name is "add_to_cart" or "add_series" && !HasCartIntent(Request.Messages.LastOrDefault()?.Content ?? "") && !IsDuplicateClarification())
                return new() { Content = Error("Ask the customer to explicitly request cart additions first.") };
            return name switch
            {
                "store_information" => StoreInformation(),
                "get_series" => SeriesTool(arguments, false),
                "add_series" => SeriesTool(arguments, true),
                "search_books" => SearchTool(arguments),
                "list_genres" => ListGenresTool(),
                "get_book_details" => BookDetailsTool(arguments),
                "lookup_order" => LookupOrderTool(arguments),
                "add_to_cart" => AddToCartTool(arguments),
                "navigate" => NavigateTool(arguments),
                _ => new ToolOutcome { Content = Error("That action is not supported. I can help find books, prepare cart additions, or explain store benefits.") }
            };
        }
        catch (Exception error) when (error is JsonException or FormatException or InvalidOperationException)
        {
            return new ToolOutcome { Content = Error("The tool arguments were not valid. Use the declared field types and whole-number quantities.") };
        }
    }

    public static bool HasCartIntent(string text)
    {
        const System.Text.RegularExpressions.RegexOptions flags = System.Text.RegularExpressions.RegexOptions.IgnoreCase;
        if (System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(how|why|should I|don't|do not|not to|never)\b", flags)) return false;
        return System.Text.RegularExpressions.Regex.IsMatch(text.Trim(), @"^(please\s+)?(add|put|include)\b|\b(can|could|would|will) you (please )?(add|put|include)\b|^yes\b|^I (want|would like) (you )?to (add|put|include)\b", flags);
    }

    public static bool? DuplicateChoice(string text)
    {
        const System.Text.RegularExpressions.RegexOptions flags = System.Text.RegularExpressions.RegexOptions.IgnoreCase;
        if (System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(skip|exclude|without|no) (the )?(duplicates|extra copies)\b|\b(only|just) (the )?missing\b", flags)) return false;
        if (System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(duplicates|extra copies|another copy)\b", flags) &&
            !System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(don't|do not|not)\b", flags)) return true;
        return null;
    }
    private bool IsDuplicateClarification()
    {
        var latest = Request.Messages.LastOrDefault()?.Content ?? "";
        var previous = Request.Messages.SkipLast(1).LastOrDefault(m => m.Role == "assistant")?.Content ?? "";
        var priorRequest = Request.Messages.SkipLast(1).LastOrDefault(m => m.Role == "user")?.Content ?? "";
        return !System.Text.RegularExpressions.Regex.IsMatch(latest, @"\b(how|why|should|what)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase) &&
            DuplicateChoice(latest).HasValue && previous.Contains("already in your cart", StringComparison.OrdinalIgnoreCase) && HasCartIntent(priorRequest);
    }

    private static string Error(string message) => JsonSerializer.Serialize(new { error = message }, JsonOptions);

    // --- Tool implementations ---

    private ToolOutcome SearchTool(JsonElement args)
    {
        var query = GetString(args, "query");
        var genre = GetString(args, "genre");
        var maxPrice = GetDecimal(args, "max_price");
        var limit = Math.Clamp(GetInt(args, "limit") ?? 4, 1, 6);

        var excluded = GetString(args, "exclude_author");
        var ids = args.TryGetProperty("exclude_ids", out var list) && list.ValueKind == JsonValueKind.Array ?
            list.EnumerateArray().Select(v => v.GetInt32()).ToHashSet() : new HashSet<int>();
        var books = SearchBooks(query, genre, maxPrice, 1000)
            .Where(b => (string.IsNullOrWhiteSpace(excluded) || !b.Author.Contains(excluded, StringComparison.OrdinalIgnoreCase)) && !ids.Contains(b.Id)).Take(limit).ToList();
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
        Order? order;
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            if (customer is null) return new() { Content = Error("Sign in to read your own order history. Guest orders cannot be looked up by email.") };
            order = store.Orders.Find(o => o.Id == id && o.CustomerId == customer.Id);
        }
        if (order is null) return new() { Content = Error("Order not found in your account.") };

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

            else if (matches.Count > 0)
                return new ToolOutcome
                {
                    Books = matches.Select(ToCard).ToList(),
                    Content = JsonSerializer.Serialize(new
                    {
                        error = "Several books match that title. Which exact title would you like?",
                        candidates = matches.Select(match => new { id = match.Id, title = match.Title, author = match.Author })
                    }, JsonOptions)
                };
        }
        if (book is null)
            return new ToolOutcome { Content = Error("No book matched. Call search_books with the title to find its id, then add_to_cart again.") };

        if (args.TryGetProperty("quantity", out var q) && GetInt(args, "quantity") is null)
            return new() { Content = Error("Quantity must be a whole number.") };
        var inCart = Request.Cart.FirstOrDefault(i => i.BookId == book.Id)?.Quantity ?? 0;
        var error = quantity < 1 || quantity > 1000 ? "Quantity must be 1–1000." : GetAddToCartError(book, quantity + inCart);
        if (error != "") return new ToolOutcome { Content = Error(error) };

        return new ToolOutcome
        {
            Content = JsonSerializer.Serialize(new
            {
                prepared = true,
                title = book.Title,
                quantity,
                unitPrice = EffectivePrice(book),
                note = "Prepared only. The browser will validate inventory and confirm whether this was added."
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

    private ToolOutcome StoreInformation()
    {
        lock (store.SyncRoot)
        {
            var now = DateTimeOffset.UtcNow;
            var c = CustomerSession.Find(User, store.Customers);
            return new() { Content = JsonSerializer.Serialize(new { member = c is not null,
                balance = c is null ? (int?)null : PricingService.Balance(store.Rewards, c.Id),
                rules = PricingService.RewardsRule, policies = AssistantKnowledge.Faqs,
                promotions = store.Promotions.Where(p => p.Active && now >= p.StartsAt && now < p.EndsAt).Select(p => new { p.Name, p.PercentOff, p.MembersOnly, p.StartsAt, p.EndsAt,
                    eligibleBooks = p.BookIds.Count, sampleBooks = store.Books.Where(b => p.BookIds.Contains(b.Id)).Take(6).Select(b => new { b.Id, b.Title }) }) }, JsonOptions) };
        }
    }

    private ToolOutcome SeriesTool(JsonElement args, bool add)
    {
        var name = GetString(args, "name");
        if (string.IsNullOrWhiteSpace(name)) return new() { Content = Error("Specify a series name.") };
        List<Book> books;
        lock (store.SyncRoot)
        {
            var names = store.Books.Where(b => b.SeriesName?.Contains(name, StringComparison.OrdinalIgnoreCase) == true).Select(b => b.SeriesName!).Distinct().ToList();
            if (names.Count != 1) return new() { Content = JsonSerializer.Serialize(new { error = "Clarify the series name.", candidates = names }, JsonOptions) };
            books = store.Books.Where(b => b.SeriesName == names[0]).OrderBy(b => b.SeriesOrder ?? decimal.MaxValue).ThenBy(b => b.Id).Select(Copy).ToList();
        }
        var cards = books.Select(ToCard).ToList();
        var duplicates = books.Where(b => Request.Cart.Any(i => i.BookId == b.Id)).ToList();
        // The customer's words resolve duplication; a model flag cannot grant permission.
        bool? include = DuplicateChoice(Request.Messages.LastOrDefault()?.Content ?? "");
        if (add && duplicates.Count > 0 && include is null)
            return new() { Books = cards, Content = JsonSerializer.Serialize(new { error = "Some of these books are already in your cart. Would you like extra copies, or only the missing entries?", alreadyInCart = duplicates.Select(b => b.Title) }, JsonOptions) };
        var quantity = GetInt(args, "quantity") ?? 1;
        if (quantity < 1 || quantity > 1000 || (args.TryGetProperty("quantity", out _) && GetInt(args, "quantity") is null)) return new() { Content = Error("Use a whole-number quantity of 1–1000.") };
        var actions = new List<AssistantAction>();
        var skipped = new List<string>();
        foreach (var b in books)
        {
            var old = Request.Cart.FirstOrDefault(i => i.BookId == b.Id)?.Quantity ?? 0;
            if (add && old > 0 && include == false) { skipped.Add(b.Title + ": already in cart"); continue; }
            var error = GetAddToCartError(b, old + quantity);
            if (error != "") { skipped.Add(b.Title + ": " + error); continue; }
            if (add) actions.Add(new() { Type = "addToCart", BookId = b.Id, Quantity = quantity, Title = b.Title });
        }
        return new() { Books = cards, Actions = actions, Notes = skipped, Content = JsonSerializer.Serialize(new {
            entries = books.Select(b => new { b.Id, b.Title, b.SeriesOrder, price = EffectivePrice(b), availability = DescribeAvailability(b) }),
            skipped, prepared = actions.Count, note = "Only catalog entries are included. Browser confirmation is required for additions." }, JsonOptions) };
    }

    // --- Shared catalog/order helpers ---

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
        new(book.Id, book.Title, book.Author, book.Genre, book.Price, book.SalePrice, DescribeAvailability(book), book.Image, book.MemberPrice, book.MemberEligible, book.MemberOfferApplied, book.SeriesOrder);

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

    public static object DescribeOrder(Order order) => new
    {
        orderNumber = order.Id,
        placed = order.Date.ToString("MMMM d, yyyy"),
        // No fabricated fulfillment state.
        status = DescribeOrderStatus(order),
        customerName = order.CustomerName,
        items = order.Items.Select(item => new { item.Title, item.Quantity, item.Price }),
        subtotal = order.Subtotal ?? order.Total,
        tax = order.Tax ?? 0,
        total = order.Total
    };

    public static string DescribeOrderStatus(Order order)
    {
        if (order.Refund is { } refund)
        {
            var done = refund.Type == OrderRefundPolicy.Return ? "Returned" : "Cancelled";
            return $"{done} on {refund.Date:MMMM d, yyyy}; {refund.Total:C} recorded as a demo refund";
        }
        return "Completed demo purchase; no shipping or payment processing.";
    }

    // Case-insensitive word matching with a simple score: title and author hits
    // outrank genre, series, and description hits.
    public List<Book> SearchBooks(string? query, string? genre, decimal? maxPrice, int limit)
    {
        var genreFilter = NormalizeGenre((genre ?? "").Trim());

        List<Book> candidates;
        lock (store.SyncRoot)
        {
            candidates = store.Books.Where(IsPurchasable).Select(Copy).ToList();
        }

        // Resolve the requested genre against the catalog's real genres. An exact name wins
        // ("Science Fiction" must not also pull in "Fiction"); a partial name like "Fiction"
        // keeps every genre containing it; a genre we don't have ("Dystopian") becomes search words.
        var catalogGenres = candidates.Select(book => book.Genre).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var allowedGenres = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (genreFilter != "")
        {
            var exact = catalogGenres.FirstOrDefault(name => name.Equals(genreFilter, StringComparison.OrdinalIgnoreCase));
            if (exact is not null) allowedGenres.Add(exact);
            else allowedGenres.UnionWith(catalogGenres.Where(name => name.Contains(genreFilter, StringComparison.OrdinalIgnoreCase)));
            if (allowedGenres.Count == 0)
            {
                query = $"{query} {genreFilter.Replace('-', ' ')}".Trim();
                genreFilter = "";
            }
        }

        // "best sci-fi books" should browse Science Fiction, not keyword-match "sci" and "fi"
        // against every description. Pull a genre named in the query out into the filter.
        if (genreFilter == "" && !string.IsNullOrWhiteSpace(query))
        {
            var detected = DetectGenre(query, candidates.Select(book => book.Genre).Distinct());
            if (detected is not null)
            {
                genreFilter = detected.Value.Genre;
                allowedGenres.Add(detected.Value.Genre);
                query = query.Remove(detected.Value.Index, detected.Value.Length);
            }
        }
        var words = Tokenize(query);

        var scored = new List<(Book book, int score)>();
        foreach (var book in candidates)
        {
            if (maxPrice is not null && EffectivePrice(book) > maxPrice.Value) continue;
            if (allowedGenres.Count > 0 && !allowedGenres.Contains(book.Genre)) continue;

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
        "have", "is", "are", "there", "my", "your", "under", "less", "than", "cheap", "something", "new", "read",
        "all", "top", "popular", "similar", "what", "else", "would", "next", "enjoy", "everyone", "should", "must"
    };

    // Everyday names for catalog genres; the catalog's own genre names are matched too.
    private static readonly Dictionary<string, string> GenreAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["sci-fi"] = "Science Fiction", ["scifi"] = "Science Fiction", ["sci fi"] = "Science Fiction",
        ["ya"] = "Young Adult", ["teen"] = "Young Adult",
        ["kids"] = "Children's", ["children"] = "Children's", ["childrens"] = "Children's",
        ["biography"] = "Memoir & Biography", ["memoir"] = "Memoir & Biography", ["biographies"] = "Memoir & Biography",
        ["classic"] = "Classics", ["mysteries"] = "Mystery", ["thrillers"] = "Thriller",
        ["self-help"] = "Psychology & Self-Help", ["self help"] = "Psychology & Self-Help",
        ["funny"] = "Humor", ["scary"] = "Horror"
    };

    private static string NormalizeGenre(string genre) =>
        GenreAliases.TryGetValue(genre, out var mapped) ? mapped : genre;

    // Finds a genre (or alias) written as whole words in the query; longest match wins.
    private static (string Genre, int Index, int Length)? DetectGenre(string query, IEnumerable<string> genres)
    {
        var names = genres.Select(genre => (Phrase: genre, Genre: genre))
            .Concat(GenreAliases.Select(alias => (Phrase: alias.Key, Genre: alias.Value)))
            .OrderByDescending(entry => entry.Phrase.Length);
        foreach (var (phrase, genre) in names)
        {
            var match = System.Text.RegularExpressions.Regex.Match(query, @"(?<![\w-])" + System.Text.RegularExpressions.Regex.Escape(phrase) + @"(?![\w-])", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (match.Success) return (genre, match.Index, match.Length);
        }
        return null;
    }

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
            case "account": return ("account.html", "My Account");
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

    private Book Copy(Book book) => PricingService.View(book, store.Promotions, Member, DateTimeOffset.UtcNow);

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
