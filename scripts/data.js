// Shared bookstore data and shared data-access utilities.
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});

function Book(id, isbn, title, author, genre, price, inventory, status, image) {
    this.id = id;
    this.isbn = isbn;
    this.title = title;
    this.author = author;
    this.genre = genre;
    this.price = price;
    this.inventory = inventory;
    this.status = status;
    this.image = image;
}

const book1 = new Book(
    1,
    "978-0-06-112008-4",
    "To Kill a Mockingbird",
    "Harper Lee",
    "Fiction",
    14.99,
    12,
    "Active",
    "https://www.publicdomainpictures.net/pictures/450000/velka/to-kill-a-mocking-bird.jpg"
);

const book2 = new Book(
    2,
    "978-0-7432-7356-5",
    "The Great Gatsby",
    "F. Scott Fitzgerald",
    "Fiction",
    12.99,
    8,
    "Active",
    "https://upload.wikimedia.org/wikipedia/commons/7/7a/The_Great_Gatsby_Cover_1925_Retouched.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original"
);

const book3 = new Book(
    3,
    "978-0-451-52493-5",
    "1984",
    "George Orwell",
    "Dystopian",
    13.99,
    15,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLizTdo9rzGAFXg5k38NcZuRCAQOhZwQM0uumd1PWf8Q&s=10"
);

const book4 = new Book(
    4,
    "978-0-14-143951-8",
    "Pride and Prejudice",
    "Jane Austen",
    "Romance",
    11.99,
    6,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqEvzk6pwMNEwGhN_25NUNCxDEtUO7V-D3cNReQql-5g&s=10"
);

const book5 = new Book(
    5,
    "978-0-618-00221-3",
    "The Hobbit",
    "J.R.R. Tolkien",
    "Fantasy",
    16.99,
    20,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRW3XBTLpA1w-lUnSutCjB7uew8ya-IZPyMu0i1vaOZQA&s=10"
);

const book6 = new Book(
    6,
    "978-0-7434-7356-5",
    "The Shining",
    "Stephen King",
    "Horror",
    17.99,
    4,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_eDx1iq7N2pKSvgAM-uxmMSAQFNOdCW0Nb1F68qPHkw&s=10"
);

const book7 = new Book(
    7,
    "978-0-06-231609-7",
    "Sapiens",
    "Yuval Noah Harari",
    "History",
    19.99,
    9,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyymOkEE0K_RDiM-qStT10_qzHXM__di2y4JRcuktPBQ&s=10"
);

const book8 = new Book(
    8,
    "978-1-5011-1110-5",
    "It",
    "Stephen King",
    "Horror",
    21.99,
    0,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQOXs0ayvY49350KMpPXOFymDq580_W_18Enr41UMTlKw&s=10"
);

const book9 = new Book(
    9,
    "978-0-345-39180-3",
    "The Hitchhiker's Guide to the Galaxy",
    "Douglas Adams",
    "Science Fiction",
    15.99,
    11,
    "Active",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7yDUFL36bi4f_ibWRtLTf6gyQzs7-IpltzRANajT6ew&s=10"
);

const book10 = new Book(
    10,
    "978-0-14-312774-1",
    "The Wright Brothers",
    "David McCullough",
    "History",
    18.99,
    7,
    "Inactive",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrVJQTwiF5IaW_y4EmdOaCpBgWAvWy5U93LHtpMrBX_A&s=10"
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



