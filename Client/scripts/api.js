// Same-origin API access. No browser catalog or order fallback.

async function resetDemoInApi() {
    const response = await fetch('/api/demo/reset', { method: 'POST' });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || result.title || 'Unable to reset demo data.');
    }
}

async function loadBooksFromApi() {
    const response = await fetch('/api/books');

    if (!response.ok) {
        throw new Error('Failed to load books: HTTP ' + response.status);
    }

    const books = await response.json();

    if (!Array.isArray(books)) {
        throw new Error('The API did not return a book array.');
    }

    return books;
}

// --- Server orders and purchase submission ---

async function loadOrdersFromApi() {
    const response = await fetch('/api/orders', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load orders: HTTP ' + response.status);
    const orders = await response.json();
    if (!Array.isArray(orders)) throw new Error('The API did not return an order array.');
    return orders;
}

async function createOrderInApi(request) {
    let response;
    let result;
    try {
        response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        result = await response.json();
    } catch (cause) {
        const error = new Error('The purchase result could not be confirmed. Check order history before retrying.');
        error.uncertain = true;
        throw error;
    }
    if (!response.ok) {
        const validation = result.errors
            ? Object.values(result.errors).flat().join(' ') : '';
        const error = new Error(result.error || validation || result.title || 'HTTP ' + response.status);
        // A server failure might occur after the transaction committed.
        error.uncertain = response.status >= 500;
        throw error;
    }
    if (!result || !Number.isInteger(result.id) || !Array.isArray(result.items) ||
        !Number.isFinite(result.total)) {
        const error = new Error('The purchase response was incomplete. Check order history before retrying.');
        error.uncertain = true;
        throw error;
    }
    return result;
}

async function loadBookFromApi(bookId) {
    const response = await fetch('/api/books/' + bookId);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error || result.title || 'HTTP ' + response.status
        );
    }

    return result;
}

async function updateBookInApi(book) {
    const response = await fetch('/api/books/' + book.id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(book)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error || result.title || 'HTTP ' + response.status
        );
    }

    return result;
}

async function createBookInApi(book) {
    const response = await fetch('/api/books', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(book)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error || result.title || 'HTTP ' + response.status
        );
    }

    return result;
}

async function deleteBookInApi(bookId) {
    const response = await fetch('/api/books/' + bookId, {
        method: 'DELETE'
    });

    if (!response.ok) {
        const result = await response.json();

        throw new Error(
            result.error || result.title || 'HTTP ' + response.status
        );
    }
}

