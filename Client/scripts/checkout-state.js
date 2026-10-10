// Temporary checkout selections and customer input validation.

const CHECKOUT_STORAGE_KEY = 'checkoutState';

// --- Temporary checkout state ---

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

// --- Customer input validation ---

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

