using Team7Books.Api.Models;

namespace Team7Books.Api.Services;

// Everything the assistant is allowed to say about store policy, in one place.
// These are DEMO placeholders for the prototype, not real Team 7 Books terms.
// Edit this file to change what both the chat assistant and help.html say.
public static class AssistantKnowledge
{
    public const string StoreName = "Team 7 Books";
    public const string SupportEmail = "help@team7books.example";
    public const string SupportPhone = "(205) 555-0107";

    // --- FAQ entries (also rendered as the accordion on help.html) ---

    public static readonly IReadOnlyList<FaqEntry> Faqs = new List<FaqEntry>
    {
        new("shipping", "How much is shipping and how long does it take?",
            "Standard shipping is $4.99, or free on orders of $35 or more, and arrives in 3-5 business days. " +
            "Expedited shipping is $12.99 and arrives in 1-2 business days. Orders placed before 2 PM Central " +
            "ship the same business day. We currently ship within the United States only."),

        new("tracking", "How do I check the status of my order?",
            "Ask the assistant to look up your order with your order number and the email address used at " +
            "checkout, for example: \"Where is order 12? My email is me@example.com\". You will see the " +
            "order date, items, and total. Shipping confirmations with tracking are emailed within one business day."),

        new("returns", "What is your return policy?",
            "Orders can be returned within 30 days of purchase for a full refund to the original payment method. " +
            "If you were logged in when you ordered, open your account, choose Order History, select Return Order, " +
            "and tell us why; a refund receipt appears in your order history right away. Refunds post 5-7 business " +
            "days later. For guest orders, email " + SupportEmail + " with your order number."),

        new("exchanges", "Can I exchange a book?",
            "Yes. Within 30 days of delivery you can exchange a book for another title of equal or lesser value. " +
            "Email " + SupportEmail + " with your order number and the title you want instead, and we will send " +
            "a prepaid label and ship the replacement once the original is on its way back."),

        new("cancel", "Can I cancel or change an order?",
            "If you were logged in when you ordered, you can cancel the order within 30 days from your account: " +
            "choose Order History, select Cancel Order, and tell us why. You get a full refund and a cancellation " +
            "receipt in your order history. Orders cannot be changed after they are placed. The assistant cannot " +
            "cancel orders itself; for guest orders, email " + SupportEmail + " or call " + SupportPhone + "."),

        new("tax", "Is sales tax charged?",
            "A 10% sales tax is added to every order at checkout and shown as a separate line on the order summary."),

        new("payment", "What payment methods do you accept?",
            "We accept Visa, Mastercard, American Express, and Discover, and every order needs a card at checkout. " +
            "This is a demo store, so nothing is ever charged. Logged-in customers can save cards under Payment " +
            "Methods in their account, or save the card they enter at checkout, and pick a saved card next time. " +
            "Only the card type, last four digits, and expiration date are kept, never the full number."),

        new("ordering", "How do I place an order?",
            "Browse the Catalog or search from the top of any page, open a book, and choose Add to Cart or Buy Now. " +
            "Open your Cart to review quantities, then choose Checkout, enter your name, email, and a card (or pick " +
            "a saved card if you are logged in), and select Place Order. You will see an order number on the " +
            "confirmation screen."),

        new("favorites", "How do favorites work?",
            "Select the heart on any book to save it to your Favorites. Open the Favorites link in the navigation " +
            "bar to add saved books to your cart or remove them. Favorites are stored in this browser only."),

        new("stock", "A book says \"Out of stock\". When will it be back?",
            "Out-of-stock titles are usually restocked within 2-3 weeks. Save the book to your Favorites and check " +
            "back, or email " + SupportEmail + " to ask about a specific title."),

        new("sale", "Do you run sales or promotions?",
            "Yes. Seasonal promotions discount a selection of titles, and discounted books show the sale price " +
            "next to the regular price in the catalog. The Merry & Bright holiday sale takes 20% off every " +
            "children's book, the Harry Potter and Hunger Games series, and selected fantasy favorites through " +
            "December 25. The Thrills & Chills sale takes 10% off selected thriller and horror titles every October."),

        new("contact", "How do I contact customer service?",
            "Email " + SupportEmail + " or call " + SupportPhone + ", Monday through Friday, 9 AM to 5 PM Central. " +
            "These are demo contact details for the prototype and are not a live support line."),
    };

    public static string FaqText()
    {
        var lines = Faqs.Select(faq => $"- {faq.Question}\n  {faq.Answer}");
        return string.Join("\n", lines);
    }

    // --- System prompt for the local model ---

    public static string BuildSystemPrompt(DateTimeOffset now) =>
$@"You are the shopping assistant for {StoreName}, a small independent online bookstore. Today is {now:dddd, MMMM d, yyyy}.

What you do:
- Answer questions about shipping, returns, exchanges, order status, tax, payment, and how to use the site, using ONLY the store policies below. Never invent policies, prices, or dates.
- Help customers find books: search the catalog with the search_books tool before recommending anything, and only recommend titles that the tool returned. Mention the price and whether the book is in stock. If the catalog has nothing suitable, say so and suggest a related genre.
- Light book talk is welcome (what a book is about, similar authors), but keep it brief and bring it back to the catalog.
- Add books to the customer's cart with add_to_cart when asked. Earlier replies end with a ""[Books shown: #id Title; ...]"" note: use those ids (""the first one"" means the first listed). If no id is known, pass the title. Confirm what you added.
- Look up an order with lookup_order ONLY when the customer gives both the order number and the email on the order. If either is missing, ask for it. Never guess an order number.
- Send customers to a page with the navigate tool when they ask to go somewhere (cart, checkout, catalog, favorites, help, or a specific book). The button appears automatically under your reply; never write links or URLs yourself.

Rules:
- You cannot cancel, change, or refund orders, process payments, or change inventory. Direct those requests to {SupportEmail} or {SupportPhone}.
- Politely decline topics unrelated to books or this store.
- Be warm and concise: usually 1-3 short sentences, or a short list of books. Plain text only: no markdown headings, tables, or code. Prices in US dollars.
- Do not describe the tools or mention that you are an AI model unless asked.

Store policies (demo prototype; no real orders or payments):
{FaqText()}";
}
