// Shared bookstore data and shared data-access utilities.
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});

function Book(id, isbn, title, author, genre, price, inventory, status, image, manualStockOverride = null, description = "") {
    this.id = id;
    this.isbn = isbn;
    this.title = title;
    this.author = author;
    this.genre = genre;
    this.price = price;
    this.inventory = inventory;
    this.status = status;
    this.image = image;
    this.description = description;
    // null = automatic (based on inventory), true = forced out of stock
    this.manualStockOverride = manualStockOverride;
}

function isBookOutOfStock(book) {
    // Inventory reaching zero always wins; the manual override can only make an otherwise available book unavailable.
    return book.manualStockOverride === true || book.inventory <= 0;
}

// Customer display only; internal inventory tables continue to show exact counts.
const CUSTOMER_LOW_STOCK_THRESHOLD = 5;

function getCustomerAvailability(book) {
    if (book.status !== 'Active') return 'Unavailable';
    if (isBookOutOfStock(book)) return 'Out of stock';
    if (book.inventory <= CUSTOMER_LOW_STOCK_THRESHOLD) return 'Only ' + book.inventory + ' left';
    return 'In stock';
}

// Seed data for books
const book1 = new Book(
    1,
    "978-0-06-112008-4",
    "To Kill a Mockingbird",
    "Harper Lee",
    "Fiction",
    14.99,
    12,
    "Active",
    "https://www.publicdomainpictures.net/pictures/450000/velka/to-kill-a-mocking-bird.jpg",
    null,
    "A young girl observes courage and injustice as her father defends a Black man accused of a crime in a small Alabama town."
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
    "https://upload.wikimedia.org/wikipedia/commons/7/7a/The_Great_Gatsby_Cover_1925_Retouched.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original",
    null,
    "A mysterious millionaire pursues a lost love amid the wealth and social ambition of the Jazz Age."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLizTdo9rzGAFXg5k38NcZuRCAQOhZwQM0uumd1PWf8Q&s=10",
    null,
    "A man living under a totalitarian government begins to question a world ruled by surveillance and control."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqEvzk6pwMNEwGhN_25NUNCxDEtUO7V-D3cNReQql-5g&s=10",
    null,
    "Elizabeth Bennet and Mr. Darcy navigate first impressions, family expectations, and their growing affection."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRW3XBTLpA1w-lUnSutCjB7uew8ya-IZPyMu0i1vaOZQA&s=10",
    null,
    "Bilbo Baggins leaves his quiet home to join a company of dwarves on a dangerous quest to reclaim their treasure."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_eDx1iq7N2pKSvgAM-uxmMSAQFNOdCW0Nb1F68qPHkw&s=10",
    null,
    "A family spends the winter caring for an isolated hotel, where a sinister presence threatens their safety."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyymOkEE0K_RDiM-qStT10_qzHXM__di2y4JRcuktPBQ&s=10",
    null,
    "An exploration of human history, tracing how shared ideas and changing societies shaped our species."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQOXs0ayvY49350KMpPXOFymDq580_W_18Enr41UMTlKw&s=10",
    null,
    "Childhood friends confront a terrifying presence that haunts their hometown and returns to threaten them as adults."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7yDUFL36bi4f_ibWRtLTf6gyQzs7-IpltzRANajT6ew&s=10",
    null,
    "After Earth is destroyed, Arthur Dent finds himself on an absurd adventure across the galaxy."
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
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrVJQTwiF5IaW_y4EmdOaCpBgWAvWy5U93LHtpMrBX_A&s=10",
    null,
    "The story of Wilbur and Orville Wright and the persistence behind their pioneering work in powered flight."
);

const book11 = new Book(
    11,
    "978-0-06-085052-4",
    "Brave New World",
    "Aldous Huxley",
    "Dystopian",
    13.99,
    10,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg",
    null,
    "A tightly controlled future society trades personal freedom for engineered happiness and social stability."
);

const book12 = new Book(
    12,
    "978-1-4516-7331-9",
    "Fahrenheit 451",
    "Ray Bradbury",
    "Dystopian",
    12.99,
    5,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg",
    null,
    "A fireman tasked with burning books begins to question his role and the society that forbids reading."
);

const book13 = new Book(
    13,
    "978-0-316-76948-0",
    "The Catcher in the Rye",
    "J.D. Salinger",
    "Fiction",
    14.99,
    0,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780316769488-L.jpg",
    null,
    "Holden Caulfield wanders New York City while struggling with grief, growing up, and the adult world."
);

const book14 = new Book(
    14,
    "978-0-14-243724-7",
    "Moby-Dick",
    "Herman Melville",
    "Classic",
    11.99,
    6,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg",
    null,
    "A sailor joins a whaling voyage led by Captain Ahab, whose obsession with a white whale puts the crew in danger."
);

const book15 = new Book(
    15,
    "978-1-4000-7998-8",
    "War and Peace",
    "Leo Tolstoy",
    "Classic",
    18.99,
    3,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9781400079988-L.jpg",
    null,
    "The lives of several Russian families intertwine through love, loss, and the upheaval of the Napoleonic wars."
);

const book16 = new Book(
    16,
    "978-0-06-231500-7",
    "The Alchemist",
    "Paulo Coelho",
    "Fiction",
    16.99,
    14,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780062315007-L.jpg",
    null,
    "A young shepherd follows a dream of treasure and discovers lessons about purpose and possibility along the way."
);

const book17 = new Book(
    17,
    "978-0-441-17271-9",
    "Dune",
    "Frank Herbert",
    "Science Fiction",
    9.99,
    8,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg",
    null,
    "On a desert planet that supplies a vital resource, a young heir becomes caught in a struggle for power and survival."
);

const book18 = new Book(
    18,
    "978-0-439-70818-0",
    "Harry Potter and the Sorcerer's Stone",
    "J.K. Rowling",
    "Fantasy",
    8.99,
    25,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780439708180-L.jpg",
    null,
    "A boy discovers that he is a wizard and enters a school where friendship, magic, and hidden dangers await."
);

const book19 = new Book(
    19,
    "978-0-307-47427-8",
    "The Da Vinci Code",
    "Dan Brown",
    "Thriller",
    10.99,
    0,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780307474278-L.jpg",
    null,
    "A murder investigation sends a symbologist and a cryptologist through a trail of art, codes, and historical mysteries."
);

const book20 = new Book(
    20,
    "978-0-399-59050-4",
    "Educated",
    "Tara Westover",
    "Memoir",
    15.99,
    9,
    "Active",
    "https://covers.openlibrary.org/b/isbn/9780399590504-L.jpg",
    null,
    "A memoir about growing up in an isolated family and pursuing an education that opens a different world."
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
    book10,
    book11,
    book12,
    book13,
    book14,
    book15,
    book16,
    book17,
    book18,
    book19,
    book20
];

function loadBooksFromStorage() {
    let books = JSON.parse(localStorage.getItem('savedBooks'));
    if (!books) {
        books = initialBooks;
        saveBooksToStorage(books);
    }

    // Older cached data (saved before prices were stored as plain numbers) may have `price` saved as a formatted string like "$14.99". Coerce it back to a number so currencyFormatter doesn't produce "$NaN".
    let neededFix = false;
    books.forEach(function (book) {
        // Match identity as well as ID: Admin can reuse IDs after deleting books.
        // Preserve existing descriptions, including an intentionally empty string.
        if (typeof book.description !== 'string') {
            const seed = initialBooks.find(function (candidate) {
                return candidate.id === book.id && candidate.isbn === book.isbn && candidate.title === book.title;
            });
            book.description = seed ? seed.description : '';
            neededFix = true;
        }
        if (typeof book.price !== 'number') {
            book.price = parseFloat(String(book.price).replace(/[^0-9.]/g, ''));
            neededFix = true;
        }
    });
    if (neededFix) {
        saveBooksToStorage(books);
    }

    return books;
}

function saveBooksToStorage(books) {
    localStorage.setItem('savedBooks', JSON.stringify(books));
}

// Orders are only written once the checkout flow saves them; until then this returns an empty list so reporting (e.g. admin stats) degrades gracefully.
function loadOrdersFromStorage() {
    return JSON.parse(localStorage.getItem('savedOrders')) || [];
}

function saveOrdersToStorage(orders) {
    localStorage.setItem('savedOrders', JSON.stringify(orders));
}

const CHECKOUT_STORAGE_KEY = 'checkoutState';

function saveCheckoutState(mode, items) {
    const checkoutState = {
        mode: mode,
        items: items.map(function (item) {
            return {
                bookId: item.bookId,
                quantity: item.quantity,
                price: item.price
            };
        }),
        createdAt: new Date().toISOString()
    };

    sessionStorage.setItem(
        CHECKOUT_STORAGE_KEY,
        JSON.stringify(checkoutState)
    );
}

function loadCheckoutState() {
    const savedState = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : null;
}

function clearCheckoutState() {
    sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
}

// Cart entries store book IDs and quantities
function loadCartFromStorage() {
    return JSON.parse(localStorage.getItem('savedCart')) || [];
}

function saveCartToStorage(cartItems) {
    localStorage.setItem('savedCart', JSON.stringify(cartItems));
}

function getCartItemCount(cartItems) {
    let count = 0;

    cartItems.forEach(function (item) {
        count += item.quantity;
    });

    return count;
}

function getCartQuantityError(book, quantity) {
    if (!book) {
        return 'This book is no longer in the catalog.';
    }

    if (book.status !== 'Active' || isBookOutOfStock(book)) {
        return 'This book is currently unavailable.';
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        return 'Please choose a whole-number quantity of at least 1.';
    }

    if (quantity > book.inventory) {
        return 'The requested quantity exceeds the available stock.';
    }

    return '';

}

function setCartQuantity(bookId, quantity) {
    const books = loadBooksFromStorage();
    const book = books.find(function (book) {
        return book.id === bookId;
    });

    const error = getCartQuantityError(book, quantity);
    if (error) {
        return error;
    }

    const cartItems = loadCartFromStorage();
    const existingItem = cartItems.find(function (item) {
        return item.bookId === bookId;
    });

    if (existingItem) {
        existingItem.quantity = quantity;
    } else {
        cartItems.push({ bookId: bookId, quantity: quantity });
    }

    saveCartToStorage(cartItems);
    return '';
}

function reconcileCart() {
    const books = loadBooksFromStorage();
    const cartItems = loadCartFromStorage();
    const updatedItems = [];
    const messages = [];

    cartItems.forEach(function (item) {
        const book = books.find(function (book) {
            return book.id === item.bookId;
        });

        if (!book) {
            messages.push('A book was removed from your cart because it is no longer in the catalog.');
            return;
        }

        if (book.status !== 'Active' || isBookOutOfStock(book)) {
            messages.push(book.title + ' was removed because it is unavailable.');
            return;
        }

        const quantity = Math.min(item.quantity, book.inventory);

        if (quantity < item.quantity) {
            messages.push(book.title + ': quantity reduced to ' + quantity + ' because stock changed.');
        }

        updatedItems.push({ bookId: item.bookId, quantity: quantity });
    });

    if (messages.length > 0) {
        saveCartToStorage(updatedItems);
    }

    return { cartItems: updatedItems, messages: messages };
}

function removeCartItem(bookId) {
    const cartItems = loadCartFromStorage();

    const remainingItems = cartItems.filter(function (item) {
        return item.bookId !== bookId;
    });

    saveCartToStorage(remainingItems);
}

function getCustomerInformationError(customerInfo) {
    if (!customerInfo || typeof customerInfo.name !== 'string') {
        return 'Customer name is required.';
    }

    if (typeof customerInfo.email !== 'string') {
        return 'Customer email is required.';
    }

    const name = customerInfo.name.trim();
    const email = customerInfo.email.trim();

    if (!name) {
        return 'Customer name is required.';
    }

    if (!email) {
        return 'Customer email is required.';
    }

    const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!basicEmailPattern.test(email)) {
        return 'Please enter a valid email address.';
    }

    return '';
}

// Authoritative checkout transaction. Validate the complete request before
// changing inventory or saving an order.
function purchaseBooks(selection, customerInfo) {
    if (!Array.isArray(selection) || selection.length === 0) {
        return { error: 'There are no books to purchase.' };
    }

    const customerError = getCustomerInformationError(customerInfo);

    if (customerError) {
        return { error: customerError };
    }

    const books = loadBooksFromStorage();
    const items = [];

    // Validate every item before changing any inventory or saving an order.
    for (const entry of selection) {
        if (!entry || !Number.isInteger(entry.bookId)) {
            return {
                error: 'The checkout selection contains an invalid book.'
            };
        }

        const book = books.find(function (book) { return book.id === entry.bookId; });
        const error = getCartQuantityError(book, entry.quantity);
        if (error) {
            const label = book ? book.title : 'Book ' + entry.bookId;
            return { error: label + ': ' + error };
        }
        if (items.some(function (item) { return item.bookId === entry.bookId; })) {
            return { error: 'The selection contains a duplicate book. Please review your cart.' };
        }
        if (book.price !== entry.price) {
            return { error: book.title + ': the price changed. Please review the current price.' };
        }

        items.push({
            bookId: book.id,
            title: book.title,
            price: book.price,
            quantity: entry.quantity
        });
    }

    // Preserve the Sprint 1 reporting fields while expanding the order snapshot.
    const order = {
        id: Date.now(),
        date: new Date().toISOString(),
        customerName: customerInfo.name.trim(),
        customerEmail: customerInfo.email.trim(),
        items: items,
        total: Math.round(items.reduce(function (sum, item) {
            return sum + item.price * item.quantity;
        }, 0) * 100) / 100
    };
    const orders = loadOrdersFromStorage();
    orders.push(order);

    items.forEach(function (item) {
        const book = books.find(function (book) { return book.id === item.bookId; });
        book.inventory -= item.quantity;
    });

    // Separate localStorage keys are a prototype limitation, not a server transaction.
    saveBooksToStorage(books);
    saveOrdersToStorage(orders);
    return { error: '', order: order };
}
