// Shared Employee/Admin order history, search, and CSV export.

// --- Page state and DOM references ---

const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryEmpty = document.getElementById('orderHistoryEmpty');
const orderSearchInput = document.getElementById('orderSearchInput');
const orderExportButton = document.getElementById('orderExportButton');

let displayedOrders = [];

// --- Report refresh and page events ---

let orderHistory = [];
let ordersLoading = false;

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
        displayedOrders = getMatchingOrders(orderHistory, orderSearchInput.value);
        renderOrderHistory(displayedOrders, orderHistory.length > 0,
            { orderHistoryList, orderHistoryEmpty, orderExportButton });
    } catch (error) {
        orderHistoryEmpty.textContent = 'Unable to load order history. Refresh to retry. ' + error.message;
    } finally {
        ordersLoading = false;
    }
}

// --- Page events and initialization ---

orderSearchInput.addEventListener('input', function () {
    if (ordersLoading || orderHistory.length === 0) return;
    const matchingOrders = getMatchingOrders(
        orderHistory,
        orderSearchInput.value
    );

    displayedOrders = matchingOrders;
    renderOrderHistory(displayedOrders, orderHistory.length > 0,
        { orderHistoryList, orderHistoryEmpty, orderExportButton });
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
