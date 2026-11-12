// Shared sales calculations and report rendering.
// Depends on book-utils.js and api.js. Page state and DOM targets are passed in.

// --- Order reporting ---

// Aggregate sold quantities by identity, retaining historical snapshot titles.
function getBestSellingItems(orders, limit) {
    const salesByBook = {};

    // Returned and cancelled orders are not sales.
    orders.filter(function (order) { return !order.refund; }).forEach(function (order) {
        const orderItems = Array.isArray(order.items)
            ? order.items
            : [];

        orderItems.forEach(function (item) {
            const hasBookId = Number.isInteger(item.bookId);
            const key = hasBookId
                ? 'book-' + item.bookId
                : 'title-' + item.title;

            if (!salesByBook[key]) {
                salesByBook[key] = {
                    bookId: hasBookId ? item.bookId : null,
                    title: item.title || 'Unknown title',
                    quantity: 0
                };
            }

            // Guard reporting against an incomplete item response.
            const quantity = Number.isInteger(item.quantity) && item.quantity > 0
                ? item.quantity
                : 1;

            salesByBook[key].quantity += quantity;
        });
    });

    const rankedItems = Object.values(salesByBook).sort(function (a, b) {
        if (b.quantity !== a.quantity) {
            return b.quantity - a.quantity;
        }

        return a.title.localeCompare(b.title);
    });

    if (Number.isInteger(limit) && limit >= 0) {
        return rankedItems.slice(0, limit);
    }

    return rankedItems;
}

// --- Order display and search ---

function formatOrderDate(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return 'Date unavailable';
    }

    return date.toLocaleString();
}

// --- Returns and cancellations ---
// A customer can return or cancel a whole order from their account; the order
// then carries a refund receipt (order.refund).

function getOrderStatusLabel(order) {
    if (!order.refund) return 'Completed';
    return order.refund.type === 'Return' ? 'Returned' : 'Cancelled';
}

// Refund receipts are numbered after their order: order 12 has receipt R-12.
function getRefundReceiptNumber(order) {
    return 'R-' + order.id;
}

function createOrderItemRow(item) {
    const quantity = Number.isInteger(item.quantity) ? item.quantity : 1;
    const unitPrice = typeof item.price === 'number' ? item.price : 0;
    const lineTotal = quantity * unitPrice;

    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-start border-bottom py-2';

    const itemDetails = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'fw-semibold';
    title.textContent = item.title || 'Unknown title';

    const quantityAndPrice = document.createElement('div');
    quantityAndPrice.className = 'text-muted small';
    quantityAndPrice.textContent = quantity + ' x ' + currencyFormatter.format(unitPrice);

    itemDetails.append(title, quantityAndPrice);

    const total = document.createElement('span');
    total.textContent = currencyFormatter.format(lineTotal);

    row.append(itemDetails, total);
    return row;
}

function createOrderCard(order) {
    const card = document.createElement('article');
    card.className = 'card mb-3';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header d-flex justify-content-between flex-wrap gap-2';

    const orderId = document.createElement('strong');
    orderId.textContent = 'Order #' + (order.id || 'Unknown');

    const orderTitle = document.createElement('span');
    orderTitle.append(orderId);

    if (order.refund) {
        const status = document.createElement('span');
        status.className = 'badge text-bg-secondary ms-2';
        status.textContent = getOrderStatusLabel(order);
        orderTitle.append(status);
    }

    const orderDate = document.createElement('span');
    orderDate.className = 'text-muted';
    orderDate.textContent = formatOrderDate(order.date);

    cardHeader.append(orderTitle, orderDate);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const customer = document.createElement('p');
    customer.className = 'mb-3';

    const customerName = order.customerName || 'Guest customer';
    const customerEmail = order.customerEmail || 'Email not recorded';

    customer.textContent = customerName + ' - ' + customerEmail +
        (order.paymentMethod ? ' - Paid with ' + order.paymentMethod : '');
    cardBody.appendChild(customer);

    const items = Array.isArray(order.items) ? order.items : [];

    items.forEach(function (item) {
        cardBody.appendChild(createOrderItemRow(item));
    });

    if (items.length === 0) {
        const missingItems = document.createElement('p');
        missingItems.className = 'text-muted';
        missingItems.textContent = 'No item details are available for this order.';
        cardBody.appendChild(missingItems);
    }

    const orderTotal = document.createElement('div');
    orderTotal.className = 'text-end fw-bold pt-3';
    orderTotal.textContent = formatPurchaseTotals(getOrderTotals(order));

    cardBody.appendChild(orderTotal);

    if (order.refund) {
        const refund = order.refund;
        const refundNote = document.createElement('div');
        refundNote.className = 'refund-note mt-3';
        refundNote.textContent = getOrderStatusLabel(order) + ' on ' + formatOrderDate(refund.date) +
            ' · Receipt ' + getRefundReceiptNumber(order) +
            ' · Refunded ' + currencyFormatter.format(refund.total) +
            ' · Reason: ' + refund.reason +
            (refund.comments ? ' (' + refund.comments + ')' : '');
        cardBody.appendChild(refundNote);
    }

    card.append(cardHeader, cardBody);

    return card;
}

// --- Order searching ---

function getMatchingOrders(orders, query) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
        return orders;
    }

    return orders.filter(function (order) {
        const orderIdMatches = String(order.id || '')
            .toLowerCase()
            .includes(normalizedQuery);

        const customerNameMatches = String(order.customerName || '')
            .toLowerCase()
            .includes(normalizedQuery);

        const customerEmailMatches = String(order.customerEmail || '')
            .toLowerCase()
            .includes(normalizedQuery);

        const items = Array.isArray(order.items) ? order.items : [];

        const bookTitleMatches = items.some(function (item) {
            return String(item.title || '')
                .toLowerCase()
                .includes(normalizedQuery);
        });

        // "returned", "cancelled", or a receipt number such as R-12.
        const refundMatches = Boolean(order.refund) && (
            getOrderStatusLabel(order).toLowerCase().includes(normalizedQuery) ||
            getRefundReceiptNumber(order).toLowerCase().includes(normalizedQuery));

        return orderIdMatches ||
            customerNameMatches ||
            customerEmailMatches ||
            bookTitleMatches ||
            refundMatches;
    });
}

// --- Order status filter (Admin's All / Returns / Orders) ---

// 'returns' keeps returned and cancelled orders; 'orders' keeps the rest.
function filterOrdersByStatus(orders, filter) {
    if (filter === 'returns') return orders.filter(function (order) { return order.refund; });
    if (filter === 'orders') return orders.filter(function (order) { return !order.refund; });
    return orders;
}

function getStatusFilterEmptyMessage(filter) {
    if (filter === 'returns') return 'No orders have been returned or cancelled.';
    if (filter === 'orders') return 'Every order has been returned or cancelled.';
    return '';
}

// emptyMessage (optional) replaces "No orders match your search." when the
// list is empty for another reason, such as the status filter.
function renderOrderHistory(orders, hasOrders, { orderHistoryList, orderHistoryEmpty, orderExportButton, emptyMessage }) {
    orderHistoryList.innerHTML = '';

    orders.forEach(function (order) {
        orderHistoryList.appendChild(createOrderCard(order));
    });

    if (orders.length === 0) {
        orderHistoryEmpty.textContent = !hasOrders
            ? 'No completed orders are available.'
            : emptyMessage || 'No orders match your search.';
    }

    orderHistoryEmpty.classList.toggle('d-none', orders.length > 0);
    orderExportButton.disabled = orders.length === 0;
}

// --- Customer recommendations ---

// Best-selling books a customer can buy now, most copies sold first. The page
// decides how to display them.
function getCustomerBestSellers(orders, books, limit) {
    // Rank all sales first; resolve/filter current sellable books before taking
    // the limit, so deleted/inactive titles do not leave avoidable recommendation gaps.
    const rankedItems = getBestSellingItems(orders);

    return rankedItems
        .map(function (item) {
            let book = null;

            if (item.bookId !== null) {
                book = books.find(function (book) {
                    return book.id === item.bookId;
                });
            }

            if (!book && item.bookId === null) {
                book = books.find(function (book) {
                    return book.title === item.title;
                });
            }

            if (!book || book.status !== 'Active' || isBookOutOfStock(book)) {
                return null;
            }

            return {
                book: book,
                quantitySold: item.quantity
            };
        })
        .filter(function (recommendation) {
            return recommendation !== null;
        })
        .slice(0, limit);
}

// --- Admin dashboard ---

function statCard(label, value) {
    return `
        <div class="col">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="fs-4 fw-bold">${value}</div>
                    <div class="text-muted small">${label}</div>
                </div>
            </div>
        </div>
    `;
}

async function renderStats(books, { statsSummaryRow, lowStockList, bestSellersList }) {
    // Catalog stats can remain available when order loading fails. Sales metrics
    // must show Unavailable rather than report a misleading zero.
    const totalInventoryValue = books.reduce(function (sum, book) {
        return sum + book.price * book.inventory;
    }, 0);

    const lowStockBooks = books.filter(function (book) {
        return book.status === 'Active' &&
            (isBookOutOfStock(book) || isBookLowStock(book));
    }).sort(function (a, b) {
        // Fewest copies first; titles break ties.
        if (a.inventory !== b.inventory) {
            return a.inventory - b.inventory;
        }

        return a.title.localeCompare(b.title);
    });

    const outOfStockBooks = books.filter(isBookOutOfStock);

    let orders = [];
    let reportError = false;
    statsSummaryRow.innerHTML = statCard('Sales reports', 'Loading...');
    bestSellersList.innerHTML = '';
    try {
        orders = await loadOrdersFromApi();
    } catch (error) {
        reportError = true;
    }
    // Returned and cancelled orders were refunded in full, so they leave the
    // sales totals and count as refunds instead.
    const keptOrders = orders.filter(function (order) { return !order.refund; });
    const ordersPlaced = orders.length;
    const revenue = keptOrders.reduce(function (sum, order) { return sum + getOrderTotals(order).subtotal; }, 0);
    const taxCollected = keptOrders.reduce(function (sum, order) { return sum + getOrderTotals(order).tax; }, 0);
    const charged = keptOrders.reduce(function (sum, order) { return sum + getOrderTotals(order).total; }, 0);
    const refunded = orders.reduce(function (sum, order) {
        return sum + (order.refund ? order.refund.total : 0);
    }, 0);

    const bestSellers = getBestSellingItems(orders, 5);

    statsSummaryRow.innerHTML =
        statCard('Total Inventory Value', currencyFormatter.format(totalInventoryValue)) +
        statCard('Low Stock Items', lowStockBooks.length) +
        statCard('Out of Stock Items', outOfStockBooks.length) +
        statCard('Orders Placed', reportError ? 'Unavailable' : ordersPlaced) +
        statCard('Revenue (before tax, after refunds)', reportError ? 'Unavailable' : currencyFormatter.format(revenue)) +
        statCard('Sales Tax Collected (after refunds)', reportError ? 'Unavailable' : currencyFormatter.format(taxCollected)) +
        statCard('Total Charged (including tax, after refunds)', reportError ? 'Unavailable' : currencyFormatter.format(charged)) +
        statCard('Refunds Issued', reportError ? 'Unavailable' : currencyFormatter.format(refunded));

    lowStockList.innerHTML = lowStockBooks.length
        ? lowStockBooks.map(function (book) {
            return `<li class="list-group-item d-flex justify-content-between">
                <span class="low-stock-title">${book.title}</span>
                <span class="text-muted">
                    ${isBookOutOfStock(book) ? 'Out of stock &middot; ' : ''}${book.inventory} left
                </span>
            </li>`;
        }).join('')
        : '<li class="list-group-item text-muted">No low-stock items.</li>';

    bestSellersList.innerHTML = reportError
        ? '<li class="list-group-item text-danger">Unable to load sales reports. Refresh to retry.</li>'
        : bestSellers.length
            ? bestSellers.map(function (item) {
                return `<li class="list-group-item d-flex justify-content-between">
                <span>${item.title}</span><span class="text-muted">${item.quantity} sold</span>
            </li>`;
            }).join('')
            : '<li class="list-group-item text-muted">No orders yet.</li>';
}

