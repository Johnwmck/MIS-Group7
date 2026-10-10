using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    // --- Purchase policy and shared store ---
    private const decimal SalesTaxRate = 0.10m;
    private readonly BookstoreStore store;

    public OrdersController(BookstoreStore store) { this.store = store; }

    // --- Completed-order reads ---

    [HttpGet]
    public ActionResult<List<Order>> Get()
    {
        lock (store.SyncRoot)
        {
            return Ok(store.Orders.OrderByDescending(order => order.Id).ToList());
        }
    }

    [HttpGet("{id:int}")]
    public ActionResult<Order> GetById(int id)
    {
        lock (store.SyncRoot)
        {
            var order = store.Orders.Find(order => order.Id == id);
            return order is null
                ? NotFound(new { error = "Order not found." })
                : Ok(order);
        }
    }

    // --- All-or-nothing purchase submission ---

    [HttpPost]
    public ActionResult<Order> Create([FromBody] CreateOrderRequest request)
    {
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

        // Catalog reads, validation, inventory changes, and order insertion share
        // one lock with catalog CRUD. No partial purchase can become visible.
        lock (store.SyncRoot)
        {
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
                if (entry.Price != book.Price)
                    return Conflict(new { error = $"{book.Title}: the price changed. Refresh checkout to review it." });

                try { total += book.Price * entry.Quantity; }
                catch (OverflowException)
                {
                    return BadRequest(new { error = "The order total is too large." });
                }
                items.Add(new OrderItem
                {
                    BookId = book.Id,
                    Title = book.Title,
                    Price = book.Price,
                    Quantity = entry.Quantity
                });
            }

            if (store.NextOrderId == int.MaxValue)
                return BadRequest(new { error = "No further order IDs are available." });

            // Round tax once on the full subtotal, not per item. Save the result
            // with the order so future policy changes cannot rewrite history.
            decimal subtotal;
            decimal tax;
            decimal grandTotal;
            try
            {
                subtotal = decimal.Round(total, 2, MidpointRounding.AwayFromZero);
                tax = decimal.Round(subtotal * SalesTaxRate, 2, MidpointRounding.AwayFromZero);
                grandTotal = subtotal + tax;
            }
            catch (OverflowException)
            {
                return BadRequest(new { error = "The order total is too large." });
            }
            var order = new Order
            {
                Id = store.NextOrderId,
                Date = DateTimeOffset.UtcNow,
                CustomerName = request.CustomerName.Trim(),
                CustomerEmail = request.CustomerEmail.Trim(),
                Items = items.AsReadOnly(),
                Subtotal = subtotal,
                TaxRate = SalesTaxRate,
                Tax = tax,
                Total = grandTotal
            };
            // Save order and inventory together; new revisions invalidate
            // Admin/Employee views opened before this purchase.
            var candidate = store.CreateSnapshot();
            candidate.Orders.Add(order);
            foreach (var item in items)
            {
                var purchasedBook = candidate.Books.Find(book => book.Id == item.BookId)!;
                purchasedBook.Inventory -= item.Quantity;
                purchasedBook.Revision = Guid.NewGuid();
            }
            candidate.NextOrderId++;
            store.Commit(candidate);
            return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
        }
    }
}
