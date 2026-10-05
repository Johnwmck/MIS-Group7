using Microsoft.AspNetCore.Mvc;
using Team7Books.Api.Models;

namespace Team7Books.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    private static readonly List<Book> books = new List<Book>
    {
        new Book
        {
            Id = 1,
            Isbn = "978-0-06-112008-4",
            Title = "To Kill a Mockingbird",
            Author = "Harper Lee",
            Genre = "Fiction",
            Price = 14.99m,
            Inventory = 12,
            Status = "Active",
            Image = "https://www.publicdomainpictures.net/pictures/450000/velka/to-kill-a-mocking-bird.jpg",
            Description = "A young girl observes courage and injustice as her father defends a Black man accused of a crime in a small Alabama town.",
            ManualStockOverride = null
        },
        new Book
        {
            Id = 2,
            Isbn = "978-0-7432-7356-5",
            Title = "The Great Gatsby",
            Author = "F. Scott Fitzgerald",
            Genre = "Fiction",
            Price = 12.99m,
            Inventory = 8,
            Status = "Active",
            Image = "https://upload.wikimedia.org/wikipedia/commons/7/7a/The_Great_Gatsby_Cover_1925_Retouched.jpg",
            Description = "A mysterious millionaire pursues a lost love amid the wealth and social ambition of the Jazz Age.",
            ManualStockOverride = null
        }
    };

    private static readonly object booksLock = new object();
    private static int nextBookId = books.Max(book => book.Id) + 1;

    [HttpGet]
    public ActionResult<List<Book>> Get()
    {
        lock (booksLock)
        {
            return Ok(books.ToList());
        }
    }

    [HttpGet("{id:int}")]
    public ActionResult<Book> GetById(int id)
    {
        lock (booksLock)
        {
            var book = books.Find(book => book.Id == id);

            if (book == null)
            {
                return NotFound(new { error = "Book not found." });
            }

            return Ok(book);
        }
    }

    [HttpPost]
    public ActionResult<Book> Create([FromBody] Book newBook)
    {
        var error = GetBookValidationError(newBook);

        if (error != "")
        {
            return BadRequest(new { error });
        }

        lock (booksLock)
        {
            newBook.Id = nextBookId;
            nextBookId++;

            books.Add(newBook);

            return CreatedAtAction(
                nameof(GetById),
                new { id = newBook.Id },
                newBook
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

        var error = GetBookValidationError(updatedBook);

        if (error != "")
        {
            return BadRequest(new { error });
        }

        lock (booksLock)
        {
            var index = books.FindIndex(book => book.Id == id);

            if (index == -1)
            {
                return NotFound(new { error = "Book not found." });
            }

            books[index] = updatedBook;

            return Ok(updatedBook);
        }
    }

    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        lock (booksLock)
        {
            var book = books.Find(book => book.Id == id);

            if (book == null)
            {
                return NotFound(new { error = "Book not found." });
            }

            books.Remove(book);

            return NoContent();
        }
    }

    private static string GetBookValidationError(Book book)
    {
        if (
            string.IsNullOrWhiteSpace(book.Title) ||
            string.IsNullOrWhiteSpace(book.Author) ||
            string.IsNullOrWhiteSpace(book.Isbn) ||
            string.IsNullOrWhiteSpace(book.Genre) ||
            string.IsNullOrWhiteSpace(book.Image)
        )
        {
            return "Required book information is missing.";
        }

        if (book.Price < 0 || book.Inventory < 0)
        {
            return "Price and inventory cannot be negative.";
        }

        if (book.Status != "Active" && book.Status != "Inactive")
        {
            return "Status must be Active or Inactive.";
        }

        return "";
    }
}