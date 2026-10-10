// Saved cart selections and validation against current API books.
// Depends on api.js and book-utils.js.

const CART_STORAGE_KEY = 'savedCart';

// --- Cart persistence and validation ---

// Cart entries store book IDs and quantities, then resolve current book data
// from the catalog whenever the cart is displayed or purchased.
function loadCartFromStorage() {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
}

function saveCartToStorage(cartItems) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
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

async function setCartQuantity(bookId, quantity) {
    const books = await loadBooksFromApi();
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

async function reconcileCart(books = null) {
    // Fetch before reading or changing cart state. A failed request preserves it.
    books = books || await loadBooksFromApi();
    const cartItems = loadCartFromStorage();
    const updatedItems = [];
    const messages = [];

    cartItems.forEach(function (item) {
        if (!item || !Number.isInteger(item.bookId) ||
            !Number.isInteger(item.quantity) || item.quantity < 1) {
            messages.push('An invalid cart entry was removed.');
            return;
        }
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

