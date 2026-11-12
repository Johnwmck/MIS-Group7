// Shared Employee/Admin order history, search, status filter, and CSV export.

// --- Page state and DOM references ---

const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryEmpty = document.getElementById('orderHistoryEmpty');
const orderSearchInput = document.getElementById('orderSearchInput');
const orderExportButton = document.getElementById('orderExportButton');
// All / Returns / Orders buttons; only the Admin page has them.
const orderStatusFilterInputs = document.querySelectorAll('input[name="orderStatusFilter"]');

let displayedOrders = [];

// --- Loaded collection and refresh ---

let orderHistory = [];
let ordersLoading = false;

function getOrderStatusFilter() {
    const checked = document.querySelector('input[name="orderStatusFilter"]:checked');
    return checked ? checked.value : 'all';
}

// Applies the search box and the status filter, then redraws the list. Export
// uses the same displayed orders.
function showFilteredOrders() {
    const filter = getOrderStatusFilter();
    const searching = orderSearchInput.value.trim() !== '';
    displayedOrders = filterOrdersByStatus(getMatchingOrders(orderHistory, orderSearchInput.value), filter);

    renderOrderHistory(displayedOrders, orderHistory.length > 0, {
        orderHistoryList,
        orderHistoryEmpty,
        orderExportButton,
        emptyMessage: searching ? '' : getStatusFilterEmptyMessage(filter)
    });
}

// Clear prior results while loading; a failed request must not leave stale
// orders exportable as if they were the latest server history.
async function refreshOrderHistory() {
    if (ordersLoading) return;
    ordersLoading = true;
    displayedOrders = [];
    orderHistory = [];
    orderHistoryList.innerHTML = '';
    orderExportButton.disabled = true;
    orderHistoryEmpty.textContent = 'Loading orders...';
    orderHistoryEmpty.classList.remove('d-none');
    try {
        orderHistory = (await loadOrdersFromApi()).slice().sort(function (a, b) {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        showFilteredOrders();
    } catch (error) {
        orderHistoryEmpty.textContent = 'Unable to load order history. Refresh to retry. ' + error.message;
    } finally {
        ordersLoading = false;
    }
}

// --- Page events and initialization ---

orderSearchInput.addEventListener('input', function () {
    if (ordersLoading || orderHistory.length === 0) return;
    showFilteredOrders();
});

orderStatusFilterInputs.forEach(function (input) {
    input.addEventListener('change', function () {
        if (ordersLoading || orderHistory.length === 0) return;
        showFilteredOrders();
    });
});

orderExportButton.addEventListener('click', function () {
    if (displayedOrders.length === 0) {
        return;
    }

    downloadOrderCsv(displayedOrders);
});

refreshOrderHistory();
window.addEventListener('pageshow', function (event) {
    if (event.persisted) refreshOrderHistory();
});
