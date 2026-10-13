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

    let booksRequest = null;
    let latestBooks = [];
    let refreshAgain = false;
    let previewOpen = false;
    let hovered = false;
    let dismissed = false;
    let checkoutBusy = false;
    preview.id = 'navbarCartPreview';
    cartNavLink.setAttribute('aria-controls', preview.id);
    cartNavLink.setAttribute('aria-expanded', 'false');

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
        quantity.textContent = item.quantity + ' x ' + currencyFormatter.format(getBookPrice(book));

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-outline-danger cart-preview-remove';
        removeButton.textContent = item.quantity > 1 ? 'Remove 1' : 'Remove';
        removeButton.setAttribute('aria-label',
            (item.quantity > 1 ? 'Remove one copy of ' : 'Remove ') + book.title);

        removeButton.addEventListener('click', function (event) {
            removeOneCopy(book.id);
            cartCount.textContent = getCartItemCount(loadCartFromStorage());
            drawCartPreview(latestBooks);

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
        lineTotal.textContent = currencyFormatter.format(getBookPrice(book) * item.quantity);

        row.append(cover, details, lineTotal);
        return row;
    }

    // Checkout needs current prices and stock, so this asks the API again
    // instead of trusting the copy the preview was drawn from.
    async function startCheckout(button) {
        if (checkoutBusy) return;
        checkoutBusy = true;
        try {
            const books = await loadBooksFromApi();
            const cartItems = loadCartFromStorage();
            const needsReview = cartItems.length === 0 || cartItems.some(function (item) {
                const book = books.find(function (book) { return book.id === item.bookId; });
                return getCartQuantityError(book, item.quantity) !== '';
            });

            // Review changed selections without silently editing the saved cart.
            if (needsReview) {
                window.location.href = 'cart.html';
                return;
            }

            saveCheckoutState('cart', cartItems.map(function (item) {
                const book = books.find(function (book) { return book.id === item.bookId; });
                return { bookId: item.bookId, quantity: item.quantity, price: getBookPrice(book) };
            }));
            sessionStorage.removeItem('purchaseUncertain');
            window.location.href = 'checkout.html';
        } catch (error) {
            showPreviewMessage('Unable to start checkout. Saved selections are unchanged. Open the cart to retry.');
        } finally {
            // Navigation can retain this JS/DOM in the back-forward cache.
            // Release both guards on every exit, including successful redirects.
            checkoutBusy = false;
            if (button.isConnected) button.disabled = false;
        }
    }

    // --- Preview totals and fresh-data rendering ---

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
        // Share an in-flight request, but schedule a fresh read if reopened or
        // changed meanwhile. An older response must not redraw a newer request.
        if (booksRequest) { refreshAgain = true; return; }
        showPreviewMessage('Loading current prices and availability...');
        booksRequest = loadBooksFromApi();
        try {
            const books = await booksRequest;
            if (!refreshAgain && previewOpen) {
                latestBooks = books;
                drawCartPreview(books);
            }
        } catch (error) {
            if (!refreshAgain && previewOpen)
                showPreviewMessage('Unable to refresh cart. Your selections are preserved. Open the cart to retry.');
        } finally {
            booksRequest = null;
            if (refreshAgain) {
                refreshAgain = false;
                if (previewOpen) renderCartPreview();
            }
        }
    }

    function drawCartPreview(books) {
        const list = document.createElement('ul');
        list.className = 'list-group list-group-flush cart-preview-items';
        let subtotal = 0;
        let needsReview = false;

        // Reread after the request: the cart may have changed while it was loading.
        loadCartFromStorage().forEach(function (item) {
            const book = books.find(function (book) {
                return book.id === item.bookId;
            });

            const error = getCartQuantityError(book, item.quantity);
            if (error) {
                needsReview = true;
                const warning = document.createElement('li');
                warning.className = 'list-group-item text-danger small';
                warning.textContent = (book ? book.title + ': ' : '') + error;
                list.appendChild(warning);
                return;
            }

            subtotal += getBookPrice(book) * item.quantity;
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

        if (needsReview) {
            const warning = document.createElement('p');
            warning.className = 'small text-danger mt-2 mb-0';
            warning.textContent = 'Selections changed. Totals above cover available items only; review your cart before checkout.';
            summary.appendChild(warning);
        }
        const checkoutButton = document.createElement('button');
        checkoutButton.type = 'button';
        checkoutButton.className = 'btn btn-success btn-sm w-100 mt-2';
        checkoutButton.textContent = needsReview ? 'Review Cart' : 'Checkout';

        checkoutButton.addEventListener('click', function () {
            checkoutButton.disabled = true;
            if (needsReview) window.location.href = 'cart.html';
            else startCheckout(checkoutButton);
        });

        summary.appendChild(checkoutButton);

        preview.replaceChildren(list, summary);
    }

    // --- Hover/focus access and history restoration ---

    function updateOpenState() {
        const nextOpen = !dismissed && (hovered || cartMenu.contains(document.activeElement));
        cartMenu.classList.toggle('is-open', nextOpen);
        cartNavLink.setAttribute('aria-expanded', String(nextOpen));
        if (nextOpen && !previewOpen) {
            previewOpen = true;
            renderCartPreview();
        } else if (!nextOpen) previewOpen = false;
    }
    cartMenu.addEventListener('mouseenter', () => { dismissed = false; hovered = true; updateOpenState(); });
    cartMenu.addEventListener('mouseleave', () => { hovered = false; updateOpenState(); });
    // Internal focus transitions must not redraw buttons mid-click.
    cartMenu.addEventListener('focusin', event => {
        if (!cartMenu.contains(event.relatedTarget)) dismissed = false;
        updateOpenState();
    });
    cartMenu.addEventListener('focusout', () => setTimeout(updateOpenState, 0));
    cartMenu.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            dismissed = true; hovered = false; previewOpen = false;
            cartMenu.classList.remove('is-open');
            cartNavLink.setAttribute('aria-expanded', 'false');
            event.preventDefault();
            cartNavLink.focus();
        }
    });
    document.addEventListener('click', event => {
        if (!cartMenu.contains(event.target)) { dismissed = true; hovered = false; updateOpenState(); }
    });
    function selectionChanged() {
        cartCount.textContent = getCartItemCount(loadCartFromStorage());
        if (previewOpen && !preview.contains(document.activeElement)) renderCartPreview();
    }
    window.addEventListener('pageshow', function (event) {
        if (!event.persisted) return;
        checkoutBusy = false;
        preview.querySelectorAll('button').forEach(button => { button.disabled = false; });
        // Close retained UI; its next hover/focus will request current API data.
        dismissed = false;
        hovered = false;
        previewOpen = false;
        cartMenu.classList.remove('is-open');
        cartNavLink.setAttribute('aria-expanded', 'false');
        cartCount.textContent = getCartItemCount(loadCartFromStorage());
    });
    window.addEventListener('storage', selectionChanged);
    window.addEventListener('cartchanged', selectionChanged);
})();
