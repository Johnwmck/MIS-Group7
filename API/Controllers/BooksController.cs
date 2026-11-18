using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    // --- Shared store dependency ---
    private readonly BookstoreStore store;

    public BooksController(BookstoreStore store) { this.store = store; }

    // --- Catalog reads ---

    [HttpGet]
    public ActionResult<List<Book>> Get()
    {
        lock (store.SyncRoot)
        {
            return Ok(store.Books.Select(CopyBook).ToList());
        }
    }

    [HttpGet("{id:int}")]
    public ActionResult<Book> GetById(int id)
    {
        lock (store.SyncRoot)
        {
            var book = store.Books.Find(book => book.Id == id);

            if (book == null)
            {
                return NotFound(new { error = "Book not found." });
            }

            return Ok(CopyBook(book));
        }
    }

    // --- Validated catalog mutations ---
    // Each mutation uses a detached candidate; Commit saves before publishing.

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public ActionResult<Book> Create([FromBody] Book newBook)
    {
        newBook.Isbn = CatalogValidation.NormalizeIsbn(newBook.Isbn).ToUpperInvariant();
        var error = CatalogValidation.GetError(newBook);

        if (error != "")
        {
            return BadRequest(new { error });
        }

        lock (store.SyncRoot)
        {
            if (store.NextBookId == int.MaxValue)
                return BadRequest(new { error = "No further book IDs are available." });
            var candidate = store.CreateSnapshot();
            newBook.SalePrice = null; newBook.MemberPrice = null; newBook.PromotionName = null;
            newBook.MemberEligible = false; newBook.MemberOfferApplied = false;
            newBook.Id = candidate.NextBookId++;
            newBook.Revision = Guid.NewGuid();
            candidate.Books.Add(newBook);
            store.Commit(candidate);

            return CreatedAtAction(
                nameof(GetById),
                new { id = newBook.Id },
                CopyBook(newBook)
            );
        }
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin,Employee")]
    public ActionResult<Book> Update(int id, [FromBody] Book updatedBook)
    {
        if (id != updatedBook.Id)
        {
            return BadRequest(new { error = "The URL and book IDs must match." });
        }

        updatedBook.Isbn = CatalogValidation.NormalizeIsbn(updatedBook.Isbn).ToUpperInvariant();
        var error = CatalogValidation.GetError(updatedBook);

        if (error != "")
        {
            return BadRequest(new { error });
        }

        lock (store.SyncRoot)
        {
            var index = store.Books.FindIndex(book => book.Id == id);

            if (index == -1)
            {
                return NotFound(new { error = "Book not found." });
            }

            // Compare under the same lock as purchases. A GET before PUT alone
            // cannot prevent an intervening sale from making the form stale.
            if (updatedBook.Revision != store.Books[index].Revision)
                return Conflict(new { error = "This book changed since you opened it. Refresh and reopen the edit form before saving." });

            if (!User.IsInRole("Admin"))
            {
                // Employees can adjust inventory/availability only, regardless of posted fields.
                var existing = store.Books[index];
                existing = System.Text.Json.JsonSerializer.Deserialize<Book>(System.Text.Json.JsonSerializer.Serialize(existing))!;
                existing.Inventory = updatedBook.Inventory;
                existing.ManualStockOverride = updatedBook.ManualStockOverride;
                existing.Status = updatedBook.Status;
                updatedBook = existing;
            }
            updatedBook.SalePrice = null; updatedBook.MemberPrice = null; updatedBook.PromotionName = null;
            updatedBook.MemberEligible = false; updatedBook.MemberOfferApplied = false;
            var candidate = store.CreateSnapshot();
            updatedBook.Revision = Guid.NewGuid();
            candidate.Books[index] = updatedBook;
            store.Commit(candidate);

            return Ok(CopyBook(updatedBook));
        }
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public IActionResult Delete(int id)
    {
        lock (store.SyncRoot)
        {
            var book = store.Books.Find(book => book.Id == id);

            if (book == null)
            {
                return NotFound(new { error = "Book not found." });
            }

            var candidate = store.CreateSnapshot();
            candidate.Books.RemoveAll(book => book.Id == id);
            foreach (var promotion in candidate.Promotions.Where(p => p.BookIds.Contains(id)))
            {
                promotion.BookIds.Remove(id);
                if (promotion.BookIds.Count == 0) promotion.Active = false;
                promotion.Revision = Guid.NewGuid();
            }
            store.Commit(candidate);

            return NoContent();
        }
    }

    // --- Response snapshots ---
    // Responses are detached from mutable inventory before the lock is released.
    private Book CopyBook(Book book) => PricingService.View(book, store.Promotions,
        CustomerSession.Find(User, store.Customers) is not null, DateTimeOffset.UtcNow);
}
