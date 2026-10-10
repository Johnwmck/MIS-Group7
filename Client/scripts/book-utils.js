// Shared currency formatting and catalog availability display.

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});

const LOW_STOCK_THRESHOLD = 5;
const SALES_TAX_RATE = 0.10;

function isValidBookPrice(price) {
    return Number.isFinite(price) && price >= 0 && price === Number(price.toFixed(2));
}

// Preview only; the API calculates and saves the authoritative purchase totals.
function calculatePurchaseTotals(subtotal) {
    const subtotalCents = Math.round((subtotal + Number.EPSILON) * 100);
    const taxCents = Math.round(subtotalCents * SALES_TAX_RATE);
    return {
        subtotal: subtotalCents / 100, taxRate: SALES_TAX_RATE,
        tax: taxCents / 100, total: (subtotalCents + taxCents) / 100
    };
}

function formatPurchaseTotals(totals) {
    return 'Subtotal: ' + currencyFormatter.format(totals.subtotal) +
        ' · Sales tax (' + Math.round(totals.taxRate * 100) + '%): ' +
        currencyFormatter.format(totals.tax) +
        ' · Total: ' + currencyFormatter.format(totals.total);
}

// Dedicated customer-facing rows keep tax visible before and after purchase.
function renderPurchaseTotals(prefix, totals) {
    document.getElementById(prefix + 'Subtotal').textContent = currencyFormatter.format(totals.subtotal);
    document.getElementById(prefix + 'TaxLabel').textContent =
        'Sales tax (' + Math.round(totals.taxRate * 100) + '%)';
    document.getElementById(prefix + 'Tax').textContent = currencyFormatter.format(totals.tax);
    document.getElementById(prefix + 'Total').textContent = currencyFormatter.format(totals.total);
}

function getOrderTotals(order) {
    // Older completed orders were not taxed. Do not recalculate history.
    return {
        subtotal: order.subtotal ?? order.total ?? 0,
        taxRate: order.taxRate ?? 0, tax: order.tax ?? 0, total: order.total ?? 0
    };
}

// --- Stock display rules ---

function isBookOutOfStock(book) {
    // Inventory reaching zero always wins. The manual override can only make
    // an otherwise available book unavailable.
    return book.manualStockOverride === true || book.inventory <= 0;
}

function isBookLowStock(book) {
    return book.inventory <= LOW_STOCK_THRESHOLD;
}

function getCustomerAvailability(book) {
    if (book.status !== 'Active') return 'Unavailable';
    if (isBookOutOfStock(book)) return 'Out of stock';
    if (isBookLowStock(book)) return 'Only ' + book.inventory + ' left';
    return 'In stock';
}

