// Customer cart display, quantity management, and checkout routing.

// --- Page state and DOM references ---

const cartCount = document.getElementById('cartCount');
const cartMessages = document.getElementById('cartMessages');
const cartEmptyMessage = document.getElementById('cartEmptyMessage');
const cartContents = document.getElementById('cartContents');
const cartTableBody = document.getElementById('cartTableBody');
const checkoutButton = document.getElementById('checkoutButton');
let cartBusy = false;

function setCartBusy(busy) {
    cartBusy = busy;
    checkoutButton.disabled = busy || loadCartFromStorage().length === 0;
    cartTableBody.querySelectorAll('input, button').forEach(function (control) {
        control.disabled = busy;
    });
}

// --- Cart feedback and rendering ---

function showCartMessage(message, success = false) {
    cartMessages.textContent = message;
    cartMessages.classList.toggle('d-none', message.length === 0);
    cartMessages.classList.toggle('alert-success', success);
    cartMessages.classList.toggle('alert-warning', !success);
}

async function renderCart(extraMessages = []) {
    if (cartBusy) return null;
    setCartBusy(true);
    showCartMessage('Loading cart...');
    try {
        const books = await loadBooksFromApi();
        const result = await reconcileCart(books);
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
                if (cartBusy) return;
                removeCartItem(item.bookId);
                renderCart();
            });

            removeCell.appendChild(removeButton);
            row.appendChild(removeCell);

            cartTableBody.appendChild(row);
        });

        renderPurchaseTotals('cart', calculatePurchaseTotals(total));
        return { cartItems: cartItems, books: books, messages: result.messages };
    } catch (error) {
        cartTableBody.innerHTML = '';
        cartContents.classList.add('d-none');
        cartEmptyMessage.classList.add('d-none');
        cartCount.textContent = getCartItemCount(loadCartFromStorage());
        showCartMessage('Unable to load your cart. Your saved cart is preserved. ' +
            'Check the connection and refresh. ' + error.message);
        return null;
    } finally {
        setCartBusy(false);
        if (cartContents.classList.contains('d-none')) checkoutButton.disabled = true;
    }
}

// --- Quantity controls ---

function createQuantityControls(item, book) {
    const container = document.createElement('div');

    container.innerHTML = `
        <div class="input-group input-group-sm flex-nowrap">
            <button type="button" class="btn btn-outline-primary">&minus;</button>
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

    async function applyQuantity(quantity) {
        if (cartBusy) return;
        setCartBusy(true);
        let messages = [];
        try {
            const error = await setCartQuantity(item.bookId, quantity);
            if (error) messages.push(error);
        } catch (error) {
            showCartMessage('Unable to change quantity. Your cart is preserved. ' + error.message);
            return;
        } finally {
            setCartBusy(false);
        }
        await renderCart(messages);
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

// --- Checkout routing ---

// Do not silently replace a custom quantity that the customer has not applied yet.
checkoutButton.addEventListener('click', async function () {
    if (cartBusy) return;
    const hasUnappliedQuantity = Array.from(
        cartTableBody.querySelectorAll('input')
    ).some(function (input) {
        return input.valueAsNumber !== Number(input.dataset.savedQuantity);
    });

    if (hasUnappliedQuantity) {
        showCartMessage(
            'Press Enter to apply your typed quantity before checking out.'
        );
        return;
    }

    const state = await renderCart();

    if (!state || state.cartItems.length === 0 || state.messages.length > 0) {
        return;
    }

    const checkoutItems = state.cartItems.map(function (item) {
        const book = state.books.find(function (book) {
            return book.id === item.bookId;
        });

        return {
            bookId: item.bookId,
            quantity: item.quantity,
            price: book.price
        };
    });

    saveCheckoutState('cart', checkoutItems);
    sessionStorage.removeItem('purchaseUncertain');
    window.location.href = 'checkout.html';
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        renderCart();
    }
});

// --- Page initialization ---

renderCart();
