// Customer accounts: sign up, log in, log out, the signed-in customer, and the
// account page (account info, password, order history and returns, saved cards).
// The API keeps the session in an HttpOnly cookie, so this file never stores
// passwords or tokens in the browser.

// --- API helpers ---

async function readCustomerApiError(response) {
    try {
        const result = await response.json();
        const validation = result.errors
            ? Object.values(result.errors).flat().join(' ') : '';
        return result.error || validation || result.title || 'HTTP ' + response.status;
    } catch (error) {
        return 'HTTP ' + response.status;
    }
}

// Errors carry the HTTP status; 401 means the customer is no longer logged in.
async function sendCustomerRequest(method, path, body) {
    const options = { method: method, cache: 'no-store', headers: {} };

    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch('/api/customers/' + path, options);

    if (!response.ok) {
        const error = new Error(await readCustomerApiError(response));
        error.status = response.status;
        throw error;
    }

    return response.status === 204 ? null : response.json();
}

function postCustomerRequest(path, body) {
    return sendCustomerRequest('POST', path, body);
}

// --- Account actions ---

// Creates the account and logs the new customer in.
function registerCustomerInApi(details) {
    return postCustomerRequest('register', details);
}

function logInCustomerInApi(email, password) {
    return postCustomerRequest('login', { email: email, password: password });
}

function logOutCustomerInApi() {
    return postCustomerRequest('logout', {});
}

// The signed-in customer's profile, or null when nobody is logged in.
async function loadCurrentCustomerFromApi() {
    const response = await fetch('/api/customers/me', { cache: 'no-store' });

    if (response.status === 204) {
        return null;
    }

    if (!response.ok) {
        throw new Error(await readCustomerApiError(response));
    }

    return response.json();
}

function getCustomerFullName(customer) {
    return customer.firstName + ' ' + customer.lastName;
}

// --- Account info and password ---

function updateCustomerProfileInApi(details) {
    return sendCustomerRequest('PUT', 'me', details);
}

function changeCustomerPasswordInApi(currentPassword, newPassword) {
    return postCustomerRequest('me/password', {
        currentPassword: currentPassword,
        newPassword: newPassword
    });
}

// --- Order history, returns, and cancellations ---

// Orders placed while logged in, newest first.
function loadCustomerOrdersFromApi() {
    return sendCustomerRequest('GET', 'me/orders');
}

// details: { type: 'Return' | 'Cancellation', reason, comments }. Resolves to
// the updated order with its refund receipt.
function refundCustomerOrderInApi(orderId, details) {
    return postCustomerRequest('me/orders/' + orderId + '/refund', details);
}

// --- Saved payment methods ---
// Each change resolves to the full updated list, default card first.

function loadPaymentMethodsFromApi() {
    return sendCustomerRequest('GET', 'me/payment-methods');
}

// card: { brand, last4, expMonth, expYear, nameOnCard, makeDefault }. Never
// send the full card number.
function addPaymentMethodInApi(card) {
    return postCustomerRequest('me/payment-methods', card);
}

function makeDefaultPaymentMethodInApi(cardId) {
    return postCustomerRequest('me/payment-methods/' + cardId + '/default');
}

function removePaymentMethodInApi(cardId) {
    return sendCustomerRequest('DELETE', 'me/payment-methods/' + cardId);
}

// Card entry checks and display helpers are in payment-cards.js.

// --- Favorites ---
// Each call resolves to the customer's favorite book IDs, in saved order.

function loadFavoriteIdsFromApi() {
    return sendCustomerRequest('GET', 'me/favorites');
}

function addFavoriteInApi(bookId) {
    return sendCustomerRequest('PUT', 'me/favorites/' + bookId);
}

function removeFavoriteInApi(bookId) {
    return sendCustomerRequest('DELETE', 'me/favorites/' + bookId);
}
