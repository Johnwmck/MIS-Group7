// Shared bookstore data ONLY. Functions go elsewhere
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});

function Book(id, isbn, title, author, genre, price, inventory, status) {
    this.id = id;
    this.isbn = isbn;
    this.title = title;
    this.author = author;
    this.genre = genre;
    this.price = price;
    this.inventory = inventory;
    this.status = status;
}

const book1 = new Book(
    1,
    "978-0-06-112008-4",
    "To Kill a Mockingbird",
    "Harper Lee",
    "Fiction",
    14.99,
    12,
    "Active"
);

const book2 = new Book(
    2,
    "978-0-7432-7356-5",
    "The Great Gatsby",
    "F. Scott Fitzgerald",
    "Fiction",
    12.99,
    8,
    "Active"
);

const book3 = new Book(
    3,
    "978-0-451-52493-5",
    "1984",
    "George Orwell",
    "Dystopian",
    13.99,
    15,
    "Active"
);

const book4 = new Book(
    4,
    "978-0-14-143951-8",
    "Pride and Prejudice",
    "Jane Austen",
    "Romance",
    11.99,
    6,
    "Active"
);

const book5 = new Book(
    5,
    "978-0-618-00221-3",
    "The Hobbit",
    "J.R.R. Tolkien",
    "Fantasy",
    16.99,
    20,
    "Active"
);

const book6 = new Book(
    6,
    "978-0-7434-7356-5",
    "The Shining",
    "Stephen King",
    "Horror",
    17.99,
    4,
    "Active"
);

const book7 = new Book(
    7,
    "978-0-06-231609-7",
    "Sapiens",
    "Yuval Noah Harari",
    "History",
    19.99,
    9,
    "Active"
);

const book8 = new Book(
    8,
    "978-1-5011-1110-5",
    "It",
    "Stephen King",
    "Horror",
    21.99,
    0,
    "Active"
);

const book9 = new Book(
    9,
    "978-0-345-39180-3",
    "The Hitchhiker's Guide to the Galaxy",
    "Douglas Adams",
    "Science Fiction",
    15.99,
    11,
    "Active"
);

const book10 = new Book(
    10,
    "978-0-14-312774-1",
    "The Wright Brothers",
    "David McCullough",
    "History",
    18.99,
    7,
    "Inactive"
);

const initialBooks = [
    book1,
    book2,
    book3,
    book4,
    book5,
    book6,
    book7,
    book8,
    book9,
    book10
];

function loadBooksFromStorage() {
    let books = JSON.parse(localStorage.getItem('savedBooks'));
    if (!books) {
        books = initialBooks;
        saveBooksToStorage(books);
    }
    return books;
}

function saveBooksToStorage(books) {
    localStorage.setItem('savedBooks', JSON.stringify(books));
}



