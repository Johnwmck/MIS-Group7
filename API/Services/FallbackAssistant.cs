using System.Text.RegularExpressions;
using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Keyword-driven stand-in used when Ollama is not running. It answers the same
// FAQs and can search, add to cart, look up orders, and offer page links, so
// the demo works on any machine without a model installed.
public sealed partial class FallbackAssistant
{
    private readonly AssistantTools tools;

    public FallbackAssistant(AssistantTools tools) { this.tools = tools; }

    private static readonly Regex OrderNumberPattern = OrderNumberRegex();
    private static readonly Regex EmailPattern = EmailRegex();
    private static readonly Regex AddToCartPattern = AddToCartRegex();
    private static readonly Regex BookIdPattern = BookIdRegex();
    private static readonly Regex PricePattern = PriceRegex();

    [GeneratedRegex(@"\border\s*(?:#|number|no\.?|id)?\s*#?\s*(\d{1,9})\b", RegexOptions.IgnoreCase)]
    private static partial Regex OrderNumberRegex();
    [GeneratedRegex(@"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();
    [GeneratedRegex(@"\b(?:add|put)\b\s+(?:(\d{1,2})\s+(?:copies\s+of\s+|x\s*)?)?(.+?)\s+(?:to|in|into)\s+(?:my\s+|the\s+)?(?:cart|basket)", RegexOptions.IgnoreCase)]
    private static partial Regex AddToCartRegex();
    [GeneratedRegex(@"(?:\bid\b\s*:?\s*|#)(\d{1,9})\b", RegexOptions.IgnoreCase)]
    private static partial Regex BookIdRegex();
    [GeneratedRegex(@"(?:under|below|less than|max(?:imum)?|up to|cheaper than)\s*\$?\s*(\d+(?:\.\d{1,2})?)", RegexOptions.IgnoreCase)]
    private static partial Regex PriceRegex();

    public AssistantReply Answer(List<AssistantMessage> history)
    {
        var message = history.LastOrDefault(turn => turn.Role == "user")?.Content.Trim() ?? "";
        var lower = message.ToLowerInvariant();

        if (message == "" || IsGreeting(lower)) return Reply(HelpMenu());

        // --- Order lookup: needs an order number and an email ---
        var orderMatch = OrderNumberPattern.Match(message);
        var emailMatch = EmailPattern.Match(message);
        var asksAboutOrder = lower.Contains("order") || lower.Contains("track") || lower.Contains("where is my");
        if (orderMatch.Success || (asksAboutOrder && emailMatch.Success))
        {
            // An order number without a "#" or the word order is too ambiguous to act on.
            if (!orderMatch.Success)
                return Reply("I can look that up. What is the order number? It's on your confirmation screen and email.");
            if (!emailMatch.Success)
            {
                // The email may have been given in an earlier turn.
                var earlier = history.Where(turn => turn.Role == "user").Reverse().Skip(1)
                    .Select(turn => EmailPattern.Match(turn.Content)).FirstOrDefault(match => match.Success);
                if (earlier is null)
                    return Reply($"To look up order #{orderMatch.Groups[1].Value}, please also tell me the email address used at checkout.");
                emailMatch = earlier;
            }
            return LookupOrder(int.Parse(orderMatch.Groups[1].Value), emailMatch.Value);
        }
        if (asksAboutOrder && (lower.Contains("status") || lower.Contains("track") || lower.Contains("where")))
            return Reply("I can check an order for you. Please send the order number and the email address used at checkout, for example: \"order 12, me@example.com\".");

        // --- Add to cart ---
        var addMatch = AddToCartPattern.Match(message);
        if (addMatch.Success) return AddToCart(addMatch);

        // --- Navigation ---
        var navigation = DetectNavigation(lower);
        if (navigation is not null) return navigation;

        // --- Policy FAQs ---
        var faq = MatchFaq(lower);
        if (faq is not null) return Reply(faq.Answer);

        // --- Catalog search / recommendations ---
        return Search(message, lower);
    }

    // --- Handlers ---

    private AssistantReply LookupOrder(int orderId, string email)
    {
        var order = tools.FindOrder(orderId, email);
        if (order is null)
            return Reply($"I couldn't find order #{orderId} for {email}. Please double-check both the order number and the email address used at checkout.");

        var items = string.Join(", ", order.Items.Select(item => $"{item.Title} ×{item.Quantity}"));
        return Reply(
            $"Order #{order.Id} for {order.CustomerName}, placed {order.Date:MMMM d, yyyy}.\n" +
            $"Status: {AssistantTools.DescribeOrderStatus(order.Date)}.\n" +
            $"Items: {items}.\n" +
            $"Total: {order.Total:C}" + (order.Tax is not null ? $" (includes {order.Tax:C} sales tax)." : "."));
    }

    private AssistantReply AddToCart(Match match)
    {
        var quantity = match.Groups[1].Success ? int.Parse(match.Groups[1].Value) : 1;
        var what = match.Groups[2].Value.Trim().Trim('"', '\'');

        Book? book = null;
        var idMatch = BookIdPattern.Match(what);
        if (idMatch.Success) book = tools.FindBook(int.Parse(idMatch.Groups[1].Value));

        if (book is null)
        {
            var matches = tools.SearchBooks(what, null, null, 4);
            if (matches.Count == 0)
                return Reply($"I couldn't find \"{what}\" in the catalog. Try the title or author, or open the Catalog to browse.",
                    actions: new() { Navigate("catalog") });
            // Act only on a clear winner; otherwise ask.
            var exact = matches.Where(candidate => candidate.Title.Equals(what, StringComparison.OrdinalIgnoreCase)).ToList();
            if (exact.Count == 1) book = exact[0];
            else if (matches.Count == 1) book = matches[0];
            else
                return Reply("Which one did you mean? Reply with the book id, for example \"add #" + matches[0].Id + " to my cart\".",
                    books: matches.Select(AssistantTools.ToCard).ToList());
        }

        var error = AssistantTools.GetAddToCartError(book, quantity);
        if (error != "") return Reply(error, books: new() { AssistantTools.ToCard(book) });

        return Reply($"Added {quantity} × {book.Title} ({AssistantTools.EffectivePrice(book):C}) to your cart.",
            books: new() { AssistantTools.ToCard(book) },
            actions: new()
            {
                new AssistantAction { Type = "addToCart", BookId = book.Id, Quantity = quantity, Title = book.Title },
                Navigate("cart")
            });
    }

    private AssistantReply? DetectNavigation(string lower)
    {
        var wantsToGo = lower.Contains("take me") || lower.Contains("go to") || lower.Contains("open ") ||
                        lower.Contains("show me my") || lower.Contains("where is the") || lower.Contains("how do i get to") ||
                        lower.StartsWith("checkout") || lower == "cart" || lower == "help";
        if (!wantsToGo) return null;

        foreach (var (keyword, page, text) in new[]
        {
            ("checkout", "checkout", "Here's your cart. Review it and choose Checkout when you're ready."),
            ("cart", "cart", "Here's your cart."),
            ("favorite", "favorites", "Here are your favorites."),
            ("favourite", "favorites", "Here are your favorites."),
            ("catalog", "catalog", "Here's the catalog."),
            ("browse", "catalog", "Here's the catalog."),
            ("help", "help", "Here's the help page."),
            ("home", "home", "Here's the home page.")
        })
        {
            if (lower.Contains(keyword)) return Reply(text, actions: new() { Navigate(page) });
        }
        return null;
    }

    private AssistantReply Search(string message, string lower)
    {
        decimal? maxPrice = null;
        var priceMatch = PricePattern.Match(message);
        if (priceMatch.Success && decimal.TryParse(priceMatch.Groups[1].Value, out var parsed)) maxPrice = parsed;

        var words = AssistantTools.Tokenize(message);
        var query = string.Join(' ', words);
        var results = tools.SearchBooks(query, null, maxPrice, 4);

        if (results.Count == 0 && words.Count > 0)
            return Reply("I couldn't find anything in stock matching that. " + HelpMenu(), actions: new() { Navigate("catalog") });
        if (results.Count == 0) return Reply(HelpMenu());

        var intro = lower.Contains("recommend") || lower.Contains("suggest")
            ? "Here are some titles you might like:"
            : "Here's what I found" + (maxPrice is null ? ":" : $" under {maxPrice:C}:");
        return Reply(intro + "\nSay \"add #<id> to my cart\" to add one.", books: results.Select(AssistantTools.ToCard).ToList());
    }

    // --- FAQ keyword matching ---

    private static readonly (string[] Keywords, string FaqId)[] FaqKeywords =
    {
        (new[] { "shipping", "ship", "deliver", "delivery", "how long", "arrive" }, "shipping"),
        (new[] { "return", "refund", "money back" }, "returns"),
        (new[] { "exchange", "swap" }, "exchanges"),
        (new[] { "cancel", "change my order", "modify" }, "cancel"),
        (new[] { "tax" }, "tax"),
        (new[] { "payment", "pay", "credit card", "card", "paypal" }, "payment"),
        (new[] { "how do i order", "how to order", "place an order", "how do i buy", "how to buy", "purchase" }, "ordering"),
        (new[] { "favorite", "favourite", "heart", "wishlist" }, "favorites"),
        (new[] { "out of stock", "restock", "back in stock", "sold out" }, "stock"),
        (new[] { "sale", "promotion", "discount", "coupon", "deal" }, "sale"),
        (new[] { "contact", "phone", "email", "hours", "customer service", "support", "talk to" }, "contact"),
        (new[] { "track", "status" }, "tracking")
    };

    private static FaqEntry? MatchFaq(string lower)
    {
        foreach (var (keywords, faqId) in FaqKeywords)
        {
            if (keywords.Any(keyword => lower.Contains(keyword)))
                return AssistantKnowledge.Faqs.First(faq => faq.Id == faqId);
        }
        return null;
    }

    private static bool IsGreeting(string lower) =>
        lower is "hi" or "hello" or "hey" or "help" or "hi!" or "hello!" or "hey!" || lower.StartsWith("hi ") || lower.StartsWith("hello ");

    private static string HelpMenu() =>
        $"Hi! I'm the {AssistantKnowledge.StoreName} assistant. I can:\n" +
        "• Find books — try \"recommend a fantasy book under $15\"\n" +
        "• Add to your cart — \"add Dune to my cart\"\n" +
        "• Check an order — \"order 12, me@example.com\"\n" +
        "• Explain shipping, returns, exchanges, tax, and how to order";

    // --- Reply helpers ---

    private AssistantAction Navigate(string page)
    {
        var target = tools.ResolvePage(page, null)!.Value;
        return new AssistantAction { Type = "navigate", Url = target.Url, Label = target.Label };
    }

    private static AssistantReply Reply(string text, List<AssistantBookCard>? books = null, List<AssistantAction>? actions = null) =>
        new() { Reply = text, Mode = "fallback", Books = books ?? new(), Actions = actions ?? new() };
}
