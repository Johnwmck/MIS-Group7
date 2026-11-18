// Saved cart selections and validation against current API books.
// Depends on api.js and book-utils.js.

const CART_STORAGE_KEY = 'savedCart';

// --- Saved selections ---

// Cart entries store book IDs and quantities, then resolve current book data
// from the catalog whenever the cart is displayed or purchased.
function loadCartFromStorage() {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : (saved.items || []);
}

function saveCartToStorage(cartItems) {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cartItems, assistantReceipts: saved.assistantReceipts || {} }));
}

// --- Post-purchase cleanup of the current shared cart ---

function subtractPurchasedCartItems(purchasedItems) {
    const purchasedQuantities = new Map();
    purchasedItems.forEach(function (item) {
        purchasedQuantities.set(item.bookId,
            (purchasedQuantities.get(item.bookId) || 0) + item.quantity);
    });
    // Read shared storage after purchase confirmation. Preserve additions from
    // other tabs while the request was in flight, including extra copies.
    const remaining = loadCartFromStorage().map(function (item) {
        return { bookId: item.bookId,
            quantity: Math.max(0, item.quantity - (purchasedQuantities.get(item.bookId) || 0)) };
    }).filter(function (item) { return item.quantity > 0; });
    saveCartToStorage(remaining);
}

function getCartItemCount(cartItems) {
    let count = 0;

    cartItems.forEach(function (item) {
        count += item.quantity;
    });

    return count;
}

// --- Selection validation against current API inventory ---

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

// --- Reconciliation after catalog/inventory changes ---
// Optional preloaded books avoid another request when the page already has
// current API data. No browser catalog is used as a fallback.
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


// Cart changes and action receipts share one localStorage write. A restored or retried
// chat turn cannot add twice, even if navigation happens immediately after the write.
async function applyAssistantCartActions(actions, requestId, operation = {}) {
    const check = () => {
        if (operation.signal?.aborted || (operation.valid && !operation.valid())) throw new DOMException('Cancelled', 'AbortError');
    };
    const run = async () => {
        check();
        const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
        const receipts = saved.assistantReceipts || {};
        if (receipts[requestId]) return receipts[requestId];
        const books = await loadBooksFromApi(operation.signal);
        check();
        if (operation.validate) await operation.validate();
        check();
        // Re-read after the API call to preserve intervening manual additions.
        const latest = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
        if (latest.assistantReceipts?.[requestId]) return latest.assistantReceipts[requestId];
        const cart = loadCartFromStorage();
        const results = [], seen = new Set();
        for (const action of actions) {
            if (seen.has(action.bookId)) continue; seen.add(action.bookId);
            const book = books.find(b => b.id === action.bookId);
            const item = cart.find(i => i.bookId === action.bookId);
            const quantity = (item?.quantity || 0) + action.quantity;
            const error = getCartQuantityError(book, quantity);
            if (error) { results.push('Could not add ' + (book?.title || 'this book') + ': ' + error); continue; }
            if (item) item.quantity = quantity; else cart.push({ bookId: book.id, quantity });
            results.push('Added ' + action.quantity + ' × ' + book.title + ' to your cart.');
        }
        const updated = { ...(latest.assistantReceipts || {}), [requestId]: results };
        check();
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cart, assistantReceipts: updated }));
        window.dispatchEvent(new Event('cartchanged'));
        const count = document.getElementById('cartCount'); if (count) count.textContent = getCartItemCount(cart);
        return results;
    };
    return navigator.locks ? navigator.locks.request('team7-cart', run) : run();
}
