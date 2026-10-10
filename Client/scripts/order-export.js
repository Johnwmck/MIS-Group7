// Order CSV transformation and download. Catalog import/export is not implemented here.
// Depends on reporting.js for readable order dates.

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
            'Order Total (including tax)',
            'Order Subtotal',
            'Sales Tax Rate',
            'Sales Tax'
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
                typeof order.total === 'number' ? order.total : '',
                getOrderTotals(order).subtotal,
                getOrderTotals(order).taxRate,
                getOrderTotals(order).tax
            ]);
        });
    });

    return rows
        .map(function (row) {
            return row.map(escapeCsvValue).join(',');
        })
        .join('\r\n');
}

function downloadOrderCsv(orders) {
    const csv = buildOrderCsv(orders);
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
}

