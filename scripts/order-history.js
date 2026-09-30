// Shared Employee/Admin order history, search, and CSV export.

// --- Page state and DOM references ---

const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryEmpty = document.getElementById('orderHistoryEmpty');
const orderSearchInput = document.getElementById('orderSearchInput');
const orderExportButton = document.getElementById('orderExportButton');

let displayedOrders = [];

// --- Order display formatting ---

function formatOrderDate(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return 'Date unavailable';
    }

    return date.toLocaleString();
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

    const orderDate = document.createElement('span');
    orderDate.className = 'text-muted';
    orderDate.textContent = formatOrderDate(order.date);

    cardHeader.append(orderId, orderDate);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const customer = document.createElement('p');
    customer.className = 'mb-3';

    const customerName = order.customerName || 'Guest customer';
    const customerEmail = order.customerEmail || 'Email not recorded';

    customer.textContent = customerName + ' - ' + customerEmail;
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
    orderTotal.textContent =
        'Order Total: ' +
        currencyFormatter.format(
            typeof order.total === 'number' ? order.total : 0
        );

    cardBody.appendChild(orderTotal);
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

        return orderIdMatches ||
            customerNameMatches ||
            customerEmailMatches ||
            bookTitleMatches;
    });
}

// --- CSV transformation and download formatting ---

function escapeCsvValue(value) {
    const stringValue = String(value ?? '');
    const escapedValue = stringValue.replace(/"/g, '""');

    return '"' + escapedValue + '"';
}

function preserveExcelText(value) {
    const stringValue = String(value ?? '');

    if (!stringValue) {
        return '';
    }

    const escapedValue = stringValue.replace(/"/g, '""');
    return '="' + escapedValue + '"';
}

function buildOrderCsv(orders) {
    // Flatten each nested order item into its own spreadsheet row while
    // repeating the order and customer columns for filtering in Excel.
    const rows = [
        [
            'Order ID',
            'Date',
            'Customer Name',
            'Customer Email',
            'Book ID',
            'Title',
            'Quantity',
            'Unit Price',
            'Line Total',
            'Order Total'
        ]
    ];

    orders.forEach(function (order) {
        const items = Array.isArray(order.items) && order.items.length > 0
            ? order.items
            : [null];

        items.forEach(function (item) {
            const quantity = !item
                ? ''
                : Number.isInteger(item.quantity) && item.quantity > 0
                    ? item.quantity
                    : 1;

            const unitPrice = item && typeof item.price === 'number'
                ? item.price
                : '';

            const lineTotal = quantity !== '' && unitPrice !== ''
                ? quantity * unitPrice
                : '';

            rows.push([
                preserveExcelText(order.id),
                formatOrderDate(order.date),
                order.customerName || '',
                order.customerEmail || '',
                item ? item.bookId || '' : '',
                item ? preserveExcelText(item.title) : '',
                quantity,
                unitPrice,
                lineTotal,
                typeof order.total === 'number' ? order.total : ''
            ]);
        });
    });

    return rows
        .map(function (row) {
            return row.map(escapeCsvValue).join(',');
        })
        .join('\r\n');
}

// --- Order-history rendering ---

function renderOrderHistory(orders) {
    displayedOrders = orders;
    orderHistoryList.innerHTML = '';

    orders.forEach(function (order) {
        orderHistoryList.appendChild(createOrderCard(order));
    });

    if (orders.length === 0) {
        orderHistoryEmpty.textContent = orderHistory.length === 0
            ? 'No completed orders are available.'
            : 'No orders match your search.';
    }

    orderHistoryEmpty.classList.toggle('d-none', orders.length > 0);
    orderExportButton.disabled = orders.length === 0;
}

const orderHistory = loadOrdersFromStorage()
    .slice()
    .sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

// --- Page events and initialization ---

orderSearchInput.addEventListener('input', function () {
    const matchingOrders = getMatchingOrders(
        orderHistory,
        orderSearchInput.value
    );

    renderOrderHistory(matchingOrders);
});

orderExportButton.addEventListener('click', function () {
    if (displayedOrders.length === 0) {
        return;
    }

    const csv = buildOrderCsv(displayedOrders);
    const blob = new Blob(
        ['\uFEFF', csv],
        { type: 'text/csv;charset=utf-8;' }
    );

    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');

    downloadLink.href = downloadUrl;
    downloadLink.download = 'order-history.csv';
    downloadLink.click();

    URL.revokeObjectURL(downloadUrl);
});

renderOrderHistory(orderHistory);
