using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;
using Team7Books.Api.Services;

namespace Team7Books.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    private readonly BookstoreStore store;

    public BooksController(BookstoreStore store) { this.store = store; }

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

    [HttpPost]
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
            newBook.Id = candidate.NextBookId++;
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

            var candidate = store.CreateSnapshot();
            candidate.Books[index] = updatedBook;
            store.Commit(candidate);

            return Ok(CopyBook(updatedBook));
        }
    }

    [HttpDelete("{id:int}")]
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
            store.Commit(candidate);

            return NoContent();
        }
    }

    // Responses are detached from mutable inventory before the lock is released.
    private static Book CopyBook(Book book) => new()
    {
        Id = book.Id,
        Isbn = book.Isbn,
        Title = book.Title,
        Author = book.Author,
        Genre = book.Genre,
        Price = book.Price,
        Inventory = book.Inventory,
        Status = book.Status,
        Image = book.Image,
        Description = book.Description,
        ManualStockOverride = book.ManualStockOverride,
        SeriesName = book.SeriesName,
        SeriesOrder = book.SeriesOrder
    };

}
