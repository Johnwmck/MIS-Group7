using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Cryptography;
using System.Text.Json;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    // --- Purchase policy and shared store ---
    private const decimal SalesTaxRate = PricingService.TaxRate;
    private readonly BookstoreStore store;

    public OrdersController(BookstoreStore store) { this.store = store; }

    // --- Completed-order reads ---

    [HttpGet, Authorize(Roles = "Admin,Employee")]
    public ActionResult<List<Order>> Get()
    {
        lock (store.SyncRoot)
        {
            return Ok(store.Orders.OrderByDescending(order => order.Id).ToList());
        }
    }

    [HttpGet("{id:int}"), Authorize]
    public ActionResult<Order> GetById(int id)
    {
        lock (store.SyncRoot)
        {
            var order = store.Orders.Find(order => order.Id == id);
            return order is null || (!User.IsInRole("Admin") && !User.IsInRole("Employee") && order.CustomerId != CustomerSession.Find(User, store.Customers)?.Id) || (!User.IsInRole("Admin") && !User.IsInRole("Employee") && order.CustomerId is null)
                ? NotFound(new { error = "Order not found." })
                : Ok(order);
        }
    }

    [HttpGet("best-sellers")]
    public IActionResult BestSellers()
    {
        lock(store.SyncRoot) return Ok(store.Orders.Where(o => o.Refund is null).SelectMany(o => o.Items)
            .GroupBy(i => i.BookId).Select(g => new { bookId = g.Key, quantity = g.Sum(i => (long)i.Quantity) }).ToList());
    }

    [HttpPost("quote")]
    public IActionResult Quote(QuoteRequest request)
    {
        if (request.Items is null || request.Items.Count is 0 or > 100 || request.Items.Any(i => i is null || i.Quantity is < 1 or > 1000) ||
            request.Items.Select(i => i.BookId).Distinct().Count() != request.Items.Count)
            return BadRequest(new { error = "Choose valid, distinct books and quantities." });
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            decimal merchandise = 0, regular = 0;
            var lines = new List<object>();
            foreach (var i in request.Items)
            {
                var b = store.Books.Find(b => b.Id == i.BookId);
                if (b is null || !AssistantTools.IsPurchasable(b) || b.Inventory < i.Quantity)
                    return Conflict(new { error = "A selected book is unavailable or exceeds stock. Return to your cart." });
                var p = PricingService.Best(b, store.Promotions, customer is not null, DateTimeOffset.UtcNow);
                var price = PricingService.Price(b, p);
                if (b.Price > 1_000_000m || merchandise + price * i.Quantity > 1_000_000m)
                    return BadRequest(new { error = "The demo checkout limit is $1,000,000 in merchandise." });
                merchandise += price * i.Quantity; regular += b.Price * i.Quantity;
                lines.Add(new { bookId = b.Id, quantity = i.Quantity, price, regularPrice = b.Price, promotionName = p?.Name });
            }
            var balance = customer is null ? 0 : PricingService.Balance(store.Rewards, customer.Id);
            var max = PricingService.MaxRedemption(balance, merchandise);
            if (request.RedeemPoints < 0 || request.RedeemPoints % 100 != 0 || request.RedeemPoints > max)
                return Conflict(new { error = "That redemption exceeds the available balance or merchandise subtotal. Choose fewer points." });
            var discount = request.RedeemPoints / 100 * 5m;
            var subtotal = merchandise - discount;
            var tax = PricingService.Money(subtotal * PricingService.TaxRate);
            return Ok(new { items = lines, customerId = customer?.Id, balance, maxRedeemPoints = max, merchandiseSubtotal = merchandise,
                promotionSavings = regular - merchandise, rewardDiscount = discount, subtotal, taxRate = PricingService.TaxRate, tax,
                total = subtotal + tax, pointsEarned = customer is null ? 0 : (int)decimal.Floor(subtotal) });
        }
    }
    // --- All-or-nothing purchase submission ---

    [HttpPost]
    public ActionResult<Order> Create([FromBody] CreateOrderRequest request)
    {
        if (request.RequestKey == Guid.Empty) return BadRequest(new { error = "A checkout request key is required." });
        if (request.Items?.Count > 100 || request.Items?.Any(i => i.Quantity > 1000) == true)
            return BadRequest(new { error = "Use at most 100 books and 1000 copies per book in one order." });
        // Annotations handle field shape; these checks cover cross-item rules.
        if (string.IsNullOrWhiteSpace(request.CustomerName) ||
            string.IsNullOrWhiteSpace(request.CustomerEmail) ||
            request.Items is null || request.Items.Count == 0 ||
            request.Items.Any(item => item is null))
        {
            return BadRequest(new { error = "Customer information and order items are required." });
        }
        if (request.Items.Select(item => item.BookId).Distinct().Count() != request.Items.Count)
        {
            return BadRequest(new { error = "The selection contains a duplicate book." });
        }
        // Every order is paid with exactly one card: a saved card or one typed at checkout.
        if ((request.PaymentMethodId is null) == (request.NewCard is null))
        {
            return BadRequest(new { error = "Choose a saved card or enter a card to pay." });
        }

        // Catalog reads, validation, inventory changes, and order insertion share
        // one lock with catalog CRUD. No partial purchase can become visible.
        lock (store.SyncRoot)
        {
            var customer = CustomerSession.Find(User, store.Customers);
            var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request)));
            var prior = store.Orders.Find(o => o.RequestKey == request.RequestKey);
            if (prior is not null)
            {
                if (prior.CustomerId != customer?.Id || prior.RequestFingerprint != fingerprint)
                    return Conflict(new { error = "This checkout key already belongs to a different request. Review a new checkout." });
                return Ok(prior);
            }
            // A confirmed retry above returns the original receipt even if the card expired since.
            if (request.NewCard is not null)
            {
                var cardError = PaymentMethodValidation.GetNewCardError(request.NewCard, DateTimeOffset.UtcNow);
                if (cardError != "") return BadRequest(new { error = cardError });
            }
            if (request.ExpectedCustomerId != customer?.Id)
                return Conflict(new { error = "Your signed-in account changed. Refresh checkout before purchasing." });
            var now = DateTimeOffset.UtcNow;
            var items = new List<OrderItem>();
            decimal total = 0;
            // Stage historical item snapshots without changing live inventory.
            foreach (var entry in request.Items)
            {
                if (entry.BookId < 1 || entry.Quantity < 1 || entry.Price is null ||
                    !CatalogValidation.IsMoney(entry.Price.Value))
                    return BadRequest(new { error = "Book IDs, quantities, and reviewed prices are invalid." });

                var book = store.Books.Find(book => book.Id == entry.BookId);
                if (book is null)
                    return Conflict(new { error = $"Book {entry.BookId} is no longer in the catalog." });
                if (book.Status != "Active" || book.ManualStockOverride == true || book.Inventory <= 0)
                    return Conflict(new { error = $"{book.Title} is currently unavailable." });
                if (entry.Quantity > book.Inventory)
                    return Conflict(new { error = $"{book.Title}: the requested quantity exceeds available stock." });
                // Charge the promotional price when one applies.
                var promotion = PricingService.Best(book, store.Promotions, customer is not null, now);
                var unitPrice = PricingService.Price(book, promotion);
                if (entry.Price != unitPrice)
                    return Conflict(new { error = $"{book.Title}: the price changed. Refresh checkout to review it." });

                if (book.Price > 1_000_000m || total + unitPrice * entry.Quantity > 1_000_000m)
                    return BadRequest(new { error = "The demo checkout limit is $1,000,000 in merchandise." });
                try { total += unitPrice * entry.Quantity; }
                catch (OverflowException)
                {
                    return BadRequest(new { error = "The order total is too large." });
                }
                items.Add(new OrderItem
                {
                    BookId = book.Id,
                    Title = book.Title,
                    Price = unitPrice,
                    RegularPrice = book.Price,
                    PromotionName = promotion?.Name,
                    Quantity = entry.Quantity
                });
            }

            // Orders placed while logged in belong to that account. A saved card
            // must belong to the same account; only a logged-in customer can
            // save the card typed at checkout.
            if (request.SaveNewCard && customer is null)
                return BadRequest(new { error = "Log in to save a card to your account." });

            string paymentMethod;
            var saveCard = false;
            if (request.PaymentMethodId is not null)
            {
                var card = customer?.PaymentMethods.Find(card => card.Id == request.PaymentMethodId);
                if (card is null)
                    return Conflict(new { error = "That saved card is no longer available. Choose another payment method." });
                if (PaymentMethodValidation.IsExpired(card, DateTimeOffset.UtcNow))
                    return Conflict(new { error = $"Your {PaymentMethodValidation.Describe(card)} has expired. Choose another payment method." });
                paymentMethod = PaymentMethodValidation.Describe(card);
            }
            else
            {
                var newCard = request.NewCard!;
                paymentMethod = PaymentMethodValidation.Describe(newCard.Brand!, newCard.Last4!);
                // A card that is already saved is simply used, not saved twice.
                saveCard = request.SaveNewCard && PaymentMethodValidation.FindSame(customer!, newCard) is null;
                var saveError = saveCard ? PaymentMethodValidation.GetSaveError(customer!) : "";
                if (saveError != "")
                    return BadRequest(new { error = saveError + " Or uncheck \"Save this card\" to pay without saving it." });
            }

            if (store.NextOrderId == int.MaxValue)
                return BadRequest(new { error = "No further order IDs are available." });

            // Round tax once on the full subtotal, not per item. Save the result
            // with the order so future policy changes cannot rewrite history.
            var balance = customer is null ? 0 : PricingService.Balance(store.Rewards, customer.Id);
            if (request.RedeemPoints < 0 || request.RedeemPoints % 100 != 0 || request.RedeemPoints > PricingService.MaxRedemption(balance, total))
                return Conflict(new { error = "Review your rewards: use whole 100-point increments within your available balance and merchandise subtotal." });
            var rewardDiscount = request.RedeemPoints / 100 * 5m;
            decimal subtotal;
            decimal tax;
            decimal grandTotal;
            try
            {
                subtotal = PricingService.Money(total - rewardDiscount);
                tax = decimal.Round(subtotal * SalesTaxRate, 2, MidpointRounding.AwayFromZero);
                grandTotal = subtotal + tax;
            }
            catch (OverflowException)
            {
                return BadRequest(new { error = "The order total is too large." });
            }
            if (request.ExpectedTotal != grandTotal)
                return Conflict(new { error = "The total changed. Refresh checkout to review current discounts and tax." });
            var earned = customer is null ? 0 : (int)Math.Min(int.MaxValue, decimal.Floor(subtotal));
            var order = new Order
            {
                Id = store.NextOrderId,
                RequestKey = request.RequestKey,
                RequestFingerprint = fingerprint,
                RewardDiscount = rewardDiscount,
                PromotionSavings = items.Sum(i => ((i.RegularPrice ?? i.Price) - i.Price) * i.Quantity),
                PointsRedeemed = request.RedeemPoints,
                PointsEarned = earned,
                Date = DateTimeOffset.UtcNow,
                CustomerName = request.CustomerName.Trim(),
                CustomerEmail = request.CustomerEmail.Trim(),
                Items = items.AsReadOnly(),
                Subtotal = subtotal,
                TaxRate = SalesTaxRate,
                Tax = tax,
                Total = grandTotal,
                CustomerId = customer?.Id,
                PaymentMethod = paymentMethod
            };
            // Save order and inventory together; new revisions invalidate
            // Admin/Employee views opened before this purchase.
            var candidate = store.CreateSnapshot();
            candidate.Orders.Add(order);
            if (customer is not null)
            {
                candidate.Rewards.Add(new(customer.Id, order.Id, "Redeem", -request.RedeemPoints, now));
                candidate.Rewards.Add(new(customer.Id, order.Id, "Earn", earned, now));
            }
            foreach (var item in items)
            {
                var purchasedBook = candidate.Books.Find(book => book.Id == item.BookId)!;
                purchasedBook.Inventory -= item.Quantity;
                purchasedBook.Revision = Guid.NewGuid();
            }
            candidate.NextOrderId++;
            // The typed card is saved in the same commit, so it is saved only if the order is.
            if (saveCard)
            {
                var account = candidate.Customers.Find(saved => saved.Id == customer!.Id)!;
                PaymentMethodValidation.AddCard(account, request.NewCard!);
            }
            store.Commit(candidate);
            return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
        }
    }
}

public record QuoteRequest(List<CartSelection> Items, int RedeemPoints);
