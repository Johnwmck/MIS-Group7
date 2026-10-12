// Navbar cart preview: hovering or focusing the Cart link lists the saved cart
// and its totals, lets one copy be removed at a time, and can start checkout.
// Depends on api.js, book-utils.js, cart-state.js, and checkout-state.js. The
// cart page still owns reconciliation and other quantity changes.

(function () {
    const cartMenu = document.querySelector('.cart-menu');
    if (!cartMenu) return;

    const cartNavLink = cartMenu.querySelector('a');
    const cartCount = document.getElementById('cartCount');

    const preview = document.createElement('div');
    preview.className = 'cart-preview card';
    cartMenu.appendChild(preview);

    // One catalog request per page view; the preview rereads the cart each time.
    let booksRequest = null;

    function showPreviewMessage(message) {
        const text = document.createElement('p');

        text.className = 'card-body text-muted mb-0';
        text.textContent = message;
        preview.replaceChildren(text);
    }

    // Taking a copy out never needs an inventory check, unlike adding one.
    function removeOneCopy(bookId) {
        const cartItems = loadCartFromStorage();
        const item = cartItems.find(function (item) {
            return item.bookId === bookId;
        });

        if (!item) return;

        if (item.quantity > 1) {
            item.quantity -= 1;
            saveCartToStorage(cartItems);
        } else {
            removeCartItem(bookId);
        }
    }

    function createPreviewItem(item, book) {
        const row = document.createElement('li');
        row.className = 'list-group-item d-flex align-items-center gap-2';

        const cover = document.createElement('img');
        cover.src = book.image;
        cover.alt = '';
        cover.width = 32;
        cover.height = 44;
        cover.style.objectFit = 'contain';

        const details = document.createElement('div');
        details.className = 'flex-grow-1';
        const title = document.createElement('div');
        title.className = 'small fw-semibold';
        title.textContent = book.title;

        const quantityRow = document.createElement('div');
        quantityRow.className = 'd-flex align-items-center gap-2 small';
        const quantity = document.createElement('span');
        quantity.className = 'text-muted';
        quantity.textContent = item.quantity + ' x ' + currencyFormatter.format(book.price);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-outline-danger cart-preview-remove';
        removeButton.textContent = item.quantity > 1 ? 'Remove 1' : 'Remove';
        removeButton.setAttribute('aria-label',
            (item.quantity > 1 ? 'Remove one copy of ' : 'Remove ') + book.title);

        removeButton.addEventListener('click', function (event) {
            removeOneCopy(book.id);
            cartCount.textContent = getCartItemCount(loadCartFromStorage());
            renderCartPreview();

            // A keyboard press loses its button in the redraw; returning focus
            // to the Cart link keeps the preview open.
            if (event.detail === 0) {
                cartNavLink.focus();
            }
        });

        quantityRow.append(quantity, removeButton);
        details.append(title, quantityRow);

        const lineTotal = document.createElement('span');
        lineTotal.className = 'small';
        lineTotal.textContent = currencyFormatter.format(book.price * item.quantity);

        row.append(cover, details, lineTotal);
        return row;
    }

    // Checkout needs current prices and stock, so this asks the API again
    // instead of trusting the copy the preview was drawn from.
    async function startCheckout() {
        let books;
        try {
            books = await loadBooksFromApi();
        } catch (error) {
            showPreviewMessage('Unable to start checkout. Open the cart to retry.');
            return;
        }

        const cartItems = loadCartFromStorage();
        const needsReview = cartItems.length === 0 || cartItems.some(function (item) {
            const book = books.find(function (book) {
                return book.id === item.bookId;
            });

            return getCartQuantityError(book, item.quantity) !== '';
        });

        // The cart page explains and fixes anything that changed, so nothing
        // is altered here.
        if (needsReview) {
            window.location.href = 'cart.html';
            return;
        }

        saveCheckoutState('cart', cartItems.map(function (item) {
            const book = books.find(function (book) {
                return book.id === item.bookId;
            });

            return {
                bookId: item.bookId,
                quantity: item.quantity,
                price: book.price
            };
        }));

        sessionStorage.removeItem('purchaseUncertain');
        window.location.href = 'checkout.html';
    }

    function createTotalRow(label, amount, emphasized) {
        const row = document.createElement('div');
        row.className = 'd-flex justify-content-between' + (emphasized ? ' fw-bold' : ' small');

        const name = document.createElement('span');
        name.textContent = label;
        const value = document.createElement('span');
        value.textContent = currencyFormatter.format(amount);

        row.append(name, value);
        return row;
    }

    async function renderCartPreview() {
        if (loadCartFromStorage().length === 0) {
            showPreviewMessage('Your cart is empty.');
            return;
        }

        if (!booksRequest) {
            showPreviewMessage('Loading cart...');
            booksRequest = loadBooksFromApi();
        }

        let books;
        try {
            books = await booksRequest;
        } catch (error) {
            booksRequest = null;
            showPreviewMessage('Unable to load your cart. Open the cart to retry.');
            return;
        }

        const list = document.createElement('ul');
        list.className = 'list-group list-group-flush cart-preview-items';
        let subtotal = 0;

        // Reread after the request: the cart may have changed while it was loading.
        loadCartFromStorage().forEach(function (item) {
            const book = books.find(function (book) {
                return book.id === item.bookId;
            });

            // The cart page reports and removes entries whose books are gone.
            if (!book) return;

            subtotal += book.price * item.quantity;
            list.appendChild(createPreviewItem(item, book));
        });

        if (list.children.length === 0) {
            showPreviewMessage('Your cart is empty.');
            return;
        }

        const totals = calculatePurchaseTotals(subtotal);
        const summary = document.createElement('div');
        summary.className = 'card-body border-top';
        summary.append(
            createTotalRow('Subtotal', totals.subtotal, false),
            createTotalRow('Sales tax (' + Math.round(totals.taxRate * 100) + '%)', totals.tax, false),
            createTotalRow('Total', totals.total, true)
        );

        const viewCartLink = document.createElement('a');
        viewCartLink.className = 'btn btn-primary btn-sm w-100 mt-2';
        viewCartLink.href = 'cart.html';
        viewCartLink.textContent = 'View Cart';
        summary.appendChild(viewCartLink);

        const checkoutButton = document.createElement('button');
        checkoutButton.type = 'button';
        checkoutButton.className = 'btn btn-success btn-sm w-100 mt-2';
        checkoutButton.textContent = 'Checkout';

        checkoutButton.addEventListener('click', function () {
            checkoutButton.disabled = true;
            startCheckout();
        });

        summary.appendChild(checkoutButton);

        preview.replaceChildren(list, summary);
    }

    cartMenu.addEventListener('mouseenter', renderCartPreview);

    // Clicking inside the preview focuses a button; rebuilding the preview then
    // would replace that button mid-click and cancel the click.
    cartMenu.addEventListener('focusin', function (event) {
        if (!preview.contains(event.target)) {
            renderCartPreview();
        }
    });
})();
