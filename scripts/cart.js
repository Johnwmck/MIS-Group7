const cartCount = document.getElementById('cartCount');
const cartMessages = document.getElementById('cartMessages');
const cartEmptyMessage = document.getElementById('cartEmptyMessage');
const cartContents = document.getElementById('cartContents');
const cartTableBody = document.getElementById('cartTableBody');
const cartTotal = document.getElementById('cartTotal');
const checkoutButton = document.getElementById('checkoutButton');
const checkoutConfirmModalEl = document.getElementById('checkoutConfirmModal');
const checkoutConfirmModal = new bootstrap.Modal(checkoutConfirmModalEl);
const checkoutSummaryItems = document.getElementById('checkoutSummaryItems');
const checkoutSummaryTotal = document.getElementById('checkoutSummaryTotal');
const confirmCheckoutButton = document.getElementById('confirmCheckoutButton');

// Only this page's current review; the persistent cart remains the source of quantities.
let checkoutSelection = [];

function showCartMessage(message, success = false) {
    cartMessages.textContent = message;
    cartMessages.classList.toggle('d-none', message.length === 0);
    cartMessages.classList.toggle('alert-success', success);
    cartMessages.classList.toggle('alert-warning', !success);
}

function renderCart(extraMessages = []) {
    const result = reconcileCart();
    const books = loadBooksFromStorage();
    const cartItems = result.cartItems;

    cartCount.textContent = getCartItemCount(cartItems);
    showCartMessage(extraMessages.concat(result.messages).join(' '));
    checkoutButton.disabled = cartItems.length === 0;

    cartEmptyMessage.classList.toggle('d-none', cartItems.length > 0);
    cartContents.classList.toggle('d-none', cartItems.length === 0);
    cartTableBody.innerHTML = '';

    let total = 0;

    cartItems.forEach(function (item) {
        const book = books.find(function (book) {
            return book.id === item.bookId;
        });

        const subtotal = book.price * item.quantity;
        total += subtotal;

        const row = document.createElement('tr');
        const values = [
            book.title,
            currencyFormatter.format(book.price),
            item.quantity,
            currencyFormatter.format(subtotal),
        ];

        values.forEach(function (value, index) {
            const cell = document.createElement('td');

            if (index === 0) {
                const details = document.createElement('div');
                details.className = 'd-flex align-items-center gap-2';
                const cover = document.createElement('img');
                cover.src = book.image;
                cover.alt = book.title;
                cover.width = 40;
                cover.height = 55;
                cover.style.objectFit = 'contain';
                const text = document.createElement('div');
                const title = document.createElement('div');
                title.textContent = book.title;
                const author = document.createElement('small');
                author.className = 'text-muted';
                author.textContent = book.author;
                text.append(title, author);
                details.append(cover, text);
                cell.appendChild(details);
            } else if (index === 2) {
                cell.appendChild(createQuantityControls(item, book));
            } else {
                cell.textContent = value;
            }

            row.appendChild(cell);
        });

        const removeCell = document.createElement('td');
        const removeButton = document.createElement('button');

        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-outline-danger';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', 'Remove ' + book.title);

        removeButton.addEventListener('click', function () {
            removeCartItem(item.bookId);
            renderCart();
        });

        removeCell.appendChild(removeButton);
        row.appendChild(removeCell);

        cartTableBody.appendChild(row);
    });

    cartTotal.textContent = 'Total: ' + currencyFormatter.format(total);
    return { cartItems: cartItems, books: books, messages: result.messages };
}

function createQuantityControls(item, book) {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="input-group input-group-sm flex-nowrap">
            <button type="button" class="btn btn-outline-primary">−</button>
            <input type="number" class="form-control" min="1" step="1"
                style="min-width: 75px;">
            <button type="button" class="btn btn-outline-primary">+</button>
        </div>
        <small class="text-muted">Press Enter to apply a typed quantity.</small>
    `;

    const buttons = container.querySelectorAll('button');
    const decreaseButton = buttons[0];
    const increaseButton = buttons[1];
    const input = container.querySelector('input');

    input.value = item.quantity;
    input.dataset.savedQuantity = item.quantity;
    input.max = book.inventory;
    input.setAttribute('aria-label', 'Quantity for ' + book.title);
    decreaseButton.setAttribute('aria-label', 'Decrease quantity for ' + book.title);
    increaseButton.setAttribute('aria-label', 'Increase quantity for ' + book.title);

    function applyQuantity(quantity) {
        const error = setCartQuantity(item.bookId, quantity);

        if (error) {
            renderCart([error]);
            return;
        }

        renderCart();
    }

    decreaseButton.addEventListener('click', function () {
        applyQuantity(input.valueAsNumber - 1);
    });

    increaseButton.addEventListener('click', function () {
        applyQuantity(input.valueAsNumber + 1);
    });

    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyQuantity(input.valueAsNumber);
        }
    });

    return container;
}

// Do not silently replace a custom quantity that the customer has not applied yet.
checkoutButton.addEventListener('click', function () {
    const hasUnappliedQuantity = Array.from(cartTableBody.querySelectorAll('input')).some(function (input) {
        return input.valueAsNumber !== Number(input.dataset.savedQuantity);
    });
    if (hasUnappliedQuantity) {
        showCartMessage('Press Enter to apply your typed quantity before checking out.');
        return;
    }

    const state = renderCart();
    if (state.cartItems.length === 0 || state.messages.length > 0) return;

    checkoutSelection = state.cartItems.map(function (item) {
        const book = state.books.find(function (book) { return book.id === item.bookId; });
        return { bookId: item.bookId, quantity: item.quantity, price: book.price };
    });

    checkoutSummaryItems.innerHTML = '';
    let total = 0;
    checkoutSelection.forEach(function (item) {
        const book = state.books.find(function (book) { return book.id === item.bookId; });
        const row = document.createElement('div');
        row.className = 'd-flex justify-content-between gap-3 mb-2';
        const title = document.createElement('span');
        title.textContent = book.title + ' × ' + item.quantity;
        const subtotal = document.createElement('span');
        subtotal.textContent = currencyFormatter.format(item.price * item.quantity);
        row.append(title, subtotal);
        checkoutSummaryItems.appendChild(row);
        total += item.price * item.quantity;
    });
    checkoutSummaryTotal.textContent = 'Total: ' + currencyFormatter.format(total);
    confirmCheckoutButton.disabled = false;
    checkoutConfirmModal.show();
});

confirmCheckoutButton.addEventListener('click', function () {
    if (checkoutSelection.length === 0) return;
    confirmCheckoutButton.disabled = true;

    // Another page may have changed the cart while this review was open.
    const currentCart = loadCartFromStorage();
    const cartMatches = currentCart.length === checkoutSelection.length && checkoutSelection.every(function (entry) {
        return currentCart.some(function (item) {
            return item.bookId === entry.bookId && item.quantity === entry.quantity;
        });
    });
    const result = cartMatches
        ? purchaseBooks(checkoutSelection)
        : { error: 'Your cart changed during review. Please review it again.' };

    // Consume the review on either outcome so a second click cannot repeat a purchase.
    checkoutSelection = [];
    checkoutConfirmModal.hide();
    if (result.error) {
        renderCart([result.error]);
        return;
    }

    saveCartToStorage([]);
    renderCart();
    showCartMessage('Order ' + result.order.id + ' placed! Thank you for shopping with Team 7 Books.', true);
});

checkoutConfirmModalEl.addEventListener('hidden.bs.modal', function () {
    checkoutSelection = [];
    confirmCheckoutButton.disabled = true;
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        checkoutSelection = [];
        checkoutConfirmModal.hide();
        renderCart();
    }
});

renderCart();
