// Customer book page: cover, purchase controls, description, and similar books.

// --- Page state and DOM references ---

const SIMILAR_BOOK_LIMIT = 8;

const bookId = Number(new URLSearchParams(window.location.search).get('id'));

const bookMessage = document.getElementById('bookMessage');
const bookContent = document.getElementById('bookContent');
const bookQuantity = document.getElementById('bookQuantity');
const addToCartButton = document.getElementById('addToCartButton');
const buyNowButton = document.getElementById('buyNowButton');

let currentBook = null;
let bookBusy = false;

function showBookMessage(message, isError = false) {
    bookMessage.textContent = message;
    bookMessage.classList.toggle('d-none', message.length === 0);
    bookMessage.classList.toggle('alert-danger', isError);
    bookMessage.classList.toggle('alert-info', !isError);
}

function setBookBusy(busy) {
    bookBusy = busy;
    const unavailable = !currentBook || isBookOutOfStock(currentBook);

    bookQuantity.disabled = busy || unavailable;
    addToCartButton.disabled = busy || unavailable;
    buyNowButton.disabled = busy || unavailable;
}

// --- Book details and purchase controls ---

function renderBookDetails(book) {
    document.title = book.title + ' - Team 7 Books';
    document.getElementById('bookGenre').textContent = book.genre;
    document.getElementById('bookTitle').textContent = book.title;
    document.getElementById('bookByline').textContent = 'by ' + book.author;

    const cover = document.getElementById('bookCover');
    cover.src = book.image;
    cover.alt = 'Cover of ' + book.title;
    document.getElementById('bookDescription').textContent =
        book.description || 'No description available yet.';

    document.getElementById('bookPrice').textContent = currencyFormatter.format(book.price);
    const availability = document.getElementById('bookAvailability');
    availability.textContent = getCustomerAvailability(book);
    availability.classList.toggle('text-danger', isBookOutOfStock(book));
    bookQuantity.value = 1;
    bookQuantity.max = book.inventory;
    document.getElementById('bookFavoriteSlot').replaceChildren(createFavoriteButton(book));
}

// --- Similar books ---

// The rest of the series comes first, then the author's other books, then the
// same genre. Only books a customer can buy now are suggested, as with Best Sellers.
function getSimilarBooks(book, books) {
    function getMatchRank(other) {
        if (book.seriesName && other.seriesName === book.seriesName) return 3;
        if (other.author === book.author) return 2;
        if (other.genre === book.genre) return 1;
        return 0;
    }

    function getSeriesOrder(other) {
        return other.seriesOrder == null ? Number.MAX_VALUE : other.seriesOrder;
    }

    return books.filter(function (other) {
        return other.id !== book.id && other.status === 'Active' &&
            !isBookOutOfStock(other) && getMatchRank(other) > 0;
    }).sort(function (a, b) {
        if (getMatchRank(a) !== getMatchRank(b)) {
            return getMatchRank(b) - getMatchRank(a);
        }

        // Keep the rest of a series in reading order.
        if (getMatchRank(a) === 3 && getSeriesOrder(a) !== getSeriesOrder(b)) {
            return getSeriesOrder(a) - getSeriesOrder(b);
        }

        // Otherwise prefer the nearest catalog entries so suggestions vary by book.
        const distance = Math.abs(a.id - book.id) - Math.abs(b.id - book.id);
        return distance !== 0 ? distance : a.id - b.id;
    }).slice(0, SIMILAR_BOOK_LIMIT);
}

function createSimilarBookCard(book) {
    const col = document.createElement('div');
    col.className = 'col';

    const card = document.createElement('div');
    card.className = 'card h-100';

    const cover = document.createElement('img');
    cover.src = book.image;
    cover.alt = '';
    cover.className = 'card-img-top';

    const favoriteButton = createFavoriteButton(book);
    favoriteButton.classList.add('position-absolute', 'top-0', 'start-0', 'm-2');

    const body = document.createElement('div');
    body.className = 'card-body';

    // The stretched link makes the whole card open the book; the heart sits above it.
    const title = document.createElement('h3');
    title.className = 'card-title h6';
    const link = document.createElement('a');
    link.className = 'stretched-link text-decoration-none text-reset';
    link.href = 'book.html?id=' + book.id;
    link.textContent = book.title;
    title.appendChild(link);

    const author = document.createElement('p');
    author.className = 'card-text book-author';
    author.textContent = book.author;

    const price = document.createElement('p');
    price.className = 'card-text fw-bold mb-0';
    price.textContent = currencyFormatter.format(book.price);

    body.append(title, author, price);
    card.append(cover, favoriteButton, body);
    col.appendChild(card);
    return col;
}

function renderSimilarBooks(book, books) {
    const similarBooks = getSimilarBooks(book, books);
    const container = document.getElementById('similarBooks');

    container.innerHTML = '';

    similarBooks.forEach(function (similarBook) {
        container.appendChild(createSimilarBookCard(similarBook));
    });

    document.getElementById('similarBooksEmpty').classList.toggle('d-none', similarBooks.length > 0);
}

// --- Cart feedback and Add to Cart ---

const cartToastElement = document.getElementById('cartToast');
const cartToastBody = document.getElementById('cartToastBody');
const cartToast = new bootstrap.Toast(cartToastElement);

function showCartToast(message, variant) {
    cartToastElement.classList.remove('text-bg-warning', 'text-bg-success');
    cartToastElement.classList.add(
        variant === 'success' ? 'text-bg-success' : 'text-bg-warning'
    );
    cartToastBody.textContent = message;
    cartToast.show();
}

function updateCartCount() {
    document.getElementById('cartCount').textContent =
        getCartItemCount(loadCartFromStorage());
}

addToCartButton.addEventListener('click', async function () {
    if (!currentBook || bookBusy) {
        return;
    }
    const bookId = currentBook.id;
    const quantityToAdd = bookQuantity.valueAsNumber;
    setBookBusy(true);
    try {
        if (!Number.isInteger(quantityToAdd) || quantityToAdd < 1) {
            showCartToast('Please choose a whole-number quantity of at least 1.', 'warning');
            return;
        }
        const existingItem = loadCartFromStorage().find(function (item) {
            return item.bookId === bookId;
        });

        const currentQuantity = existingItem ? existingItem.quantity : 0;
        const error = await setCartQuantity(bookId, currentQuantity + quantityToAdd);

        if (error) {
            showCartToast(error, 'warning');
            return;
        }

        updateCartCount();
        const message = quantityToAdd === 1
            ? 'Book added to your cart.'
            : quantityToAdd + ' copies added to your cart.';

        showCartToast(message, 'success');
    } catch (error) {
        showCartToast('Unable to update your cart. ' + error.message, 'warning');
    } finally {
        setBookBusy(false);
    }
});

// --- Buy Now checkout routing ---

buyNowButton.addEventListener('click', async function () {
    if (!currentBook || bookBusy) {
        return;
    }
    const bookId = currentBook.id;
    const quantity = bookQuantity.valueAsNumber;
    setBookBusy(true);
    try {
        // Reload the current catalog state rather than relying on the copy that
        // was loaded when the page originally opened.
        const latestBook = await loadBookFromApi(bookId);
        const error = getCartQuantityError(latestBook, quantity);

        if (error) {
            showCartToast(error, 'warning');
            return;
        }

        saveCheckoutState('buyNow', [{
            bookId: latestBook.id,
            quantity: quantity,
            price: latestBook.price
        }]);

        sessionStorage.removeItem('purchaseUncertain');
        window.location.href = 'checkout.html';
    } catch (error) {
        showCartToast('Unable to start checkout. ' + error.message, 'warning');
    } finally {
        setBookBusy(false);
    }
});

// --- Page refresh and initialization ---

async function refreshBookPage() {
    if (bookBusy) {
        return;
    }
    setBookBusy(true);
    showBookMessage('Loading book...');

    try {
        const books = await loadBooksFromApi();

        reconcileFavorites(books);
        updateFavoriteDisplays();
        updateCartCount();

        // Inactive books are hidden from customers, as in the catalog.
        currentBook = books.find(function (book) {
            return book.id === bookId && book.status === 'Active';
        }) || null;

        if (!currentBook) {
            bookContent.classList.add('d-none');
            showBookMessage('This book is not available. It may have been removed from the catalog.', true);
            return;
        }

        renderBookDetails(currentBook);
        renderSimilarBooks(currentBook, books);
        bookContent.classList.remove('d-none');
        showBookMessage('');
    } catch (error) {
        currentBook = null;
        bookContent.classList.add('d-none');
        showBookMessage('Unable to load this book. Check that the API is running, then refresh.', true);

        console.error(error);
    } finally {
        setBookBusy(false);
    }
}

window.addEventListener('pageshow', refreshBookPage);
