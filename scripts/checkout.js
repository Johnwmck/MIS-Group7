const checkoutBackLink = document.getElementById('checkoutBackLink');
const checkoutMessage = document.getElementById('checkoutMessage');
const checkoutContent = document.getElementById('checkoutContent');
const checkoutForm = document.getElementById('checkoutForm');
const placeOrderButton = document.getElementById('placeOrderButton');
const checkoutItems = document.getElementById('checkoutItems');
const checkoutTotal = document.getElementById('checkoutTotal');
const customerNameInput = document.getElementById('customerName');
const customerEmailInput = document.getElementById('customerEmail');
const orderConfirmation = document.getElementById('orderConfirmation');
const confirmationCustomerName = document.getElementById('confirmationCustomerName');
const confirmationOrderId = document.getElementById('confirmationOrderId');
const confirmationTotal = document.getElementById('confirmationTotal');

let checkoutState = loadCheckoutState();

function showCheckoutMessage(message) {
    checkoutMessage.textContent = message;
    checkoutMessage.classList.toggle('d-none', message.length === 0);
}

function hasValidCheckoutState(state) {
    if (!state) {
        return false;
    }

    if (state.mode !== 'cart' && state.mode !== 'buyNow') {
        return false;
    }

    if (!Array.isArray(state.items) || state.items.length === 0) {
        return false;
    }

    return state.items.every(function (item) {
        return Number.isInteger(item.bookId) &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0 &&
            typeof item.price === 'number' &&
            Number.isFinite(item.price) &&
            item.price >= 0;
    });
}

function cartMatchesCheckout(items) {
    const currentCart = loadCartFromStorage();

    if (currentCart.length !== items.length) {
        return false;
    }

    return items.every(function (checkoutItem) {
        return currentCart.some(function (cartItem) {
            return cartItem.bookId === checkoutItem.bookId && cartItem.quantity === checkoutItem.quantity;
        });
    });
}

function invalidateCheckout(message) {
    clearCheckoutState();
    checkoutState = null;

    checkoutContent.classList.add('d-none');
    orderConfirmation.classList.add('d-none');
    placeOrderButton.disabled = true;

    showCheckoutMessage(message);
}

function renderCheckoutReview() {
    checkoutContent.classList.add('d-none');
    orderConfirmation.classList.add('d-none');
    checkoutItems.innerHTML = '';
    placeOrderButton.disabled = true;

    if (!hasValidCheckoutState(checkoutState)) {
        checkoutBackLink.href = 'index.html';
        showCheckoutMessage(
            'There is no active checkout to review. Please return to the catalog.'
        );
        return;
    }

    checkoutBackLink.href =
        checkoutState.mode === 'cart' ? 'cart.html' : 'index.html';

    const books = loadBooksFromStorage();
    let total = 0;

    for (const item of checkoutState.items) {
        const book = books.find(function (book) {
            return book.id === item.bookId;
        });

        if (!book) {
            showCheckoutMessage(
                'A book in this checkout is no longer in the catalog. Please return and review your selection.'
            );
            return;
        }

        const subtotal = item.price * item.quantity;
        total += subtotal;

        const row = document.createElement('tr');

        const titleCell = document.createElement('td');
        titleCell.textContent = book.title;

        const quantityCell = document.createElement('td');
        quantityCell.textContent = item.quantity;

        const priceCell = document.createElement('td');
        priceCell.textContent = currencyFormatter.format(item.price);

        const subtotalCell = document.createElement('td');
        subtotalCell.textContent = currencyFormatter.format(subtotal);

        row.append(
            titleCell,
            quantityCell,
            priceCell,
            subtotalCell
        );

        checkoutItems.appendChild(row);
    }

    checkoutTotal.textContent =
        'Total: ' + currencyFormatter.format(total);

    showCheckoutMessage('');
    checkoutContent.classList.remove('d-none');

    placeOrderButton.disabled = false;
}

checkoutForm.addEventListener('submit', function (event) {
    event.preventDefault();

    if (!hasValidCheckoutState(checkoutState)) {
        invalidateCheckout(
            'This checkout is no longer active. Please return and review your selection.'
        );
        return;
    }

    const customerInfo = {
        name: customerNameInput.value,
        email: customerEmailInput.value
    };

    const customerError = getCustomerInformationError(customerInfo);

    if (customerError) {
        showCheckoutMessage(customerError);
        return;
    }

    if (checkoutState.mode === 'cart' && !cartMatchesCheckout(checkoutState.items)) {
        invalidateCheckout('Your cart changed during checkout. Please return to your cart and review it again.');
        return;
    }

    // Prevent a rapid second submission while the transaction runs.
    placeOrderButton.disabled = true;

    const checkoutMode = checkoutState.mode;
    const result = purchaseBooks(checkoutState.items, customerInfo);

    if (result.error) {
        invalidateCheckout(result.error + ' Please return and review your selection.');
        return;
    }

    let reconciliationMessages = [];

    if (checkoutMode === 'cart') {
        saveCartToStorage([]);
    } else {
        const reconciliationResult = reconcileCart();
        reconciliationMessages = reconciliationResult.messages;
    }

    clearCheckoutState();
    checkoutState = null;

    checkoutContent.classList.add('d-none');

    confirmationCustomerName.textContent = result.order.customerName;
    confirmationOrderId.textContent = result.order.id;
    confirmationTotal.textContent = currencyFormatter.format(result.order.total);

    orderConfirmation.classList.remove('d-none');

    if (reconciliationMessages.length > 0) {
        showCheckoutMessage(
            'Your saved cart was updated after this purchase. ' +
            reconciliationMessages.join(' ')
        );
    } else {
        showCheckoutMessage('');
    }
});

renderCheckoutReview();

// Re-read session state when the browser restores this page from its
// back-forward cache instead of performing a normal page load.
window.addEventListener('pageshow', function (event) {
    if (!event.persisted) {
        return;
    }

    checkoutState = loadCheckoutState();
    renderCheckoutReview();
});