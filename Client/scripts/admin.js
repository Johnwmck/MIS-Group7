// Admin behavior: everything employee.js does, plus adding/editing/deleting
// listings, editing price, toggling Active/Inactive status, and reporting stats.

// --- Page state and inventory DOM references ---

let bookList = [];
let adminBusy = false;

const adminMessage = document.getElementById('adminMessage');
const inventoryTableBody = document.getElementById('inventoryTableBody');

// --- API loading and updates ---

function showAdminMessage(message, isError = false) {
    adminMessage.textContent = message;
    adminMessage.classList.toggle('d-none', message.length === 0);
    adminMessage.classList.toggle('alert-danger', isError);
    adminMessage.classList.toggle('alert-info', !isError);
}

function setAdminBusy(busy) {
    adminBusy = busy;

    document.getElementById('addBookButton').disabled = busy;
    document.getElementById('saveBookButton').disabled = busy;
    document.getElementById('resetCatalogButton').disabled = busy;

    renderInventory();
}

async function loadAdminCatalog() {
    setAdminBusy(true);
    showAdminMessage('Loading catalog...');

    try {
        bookList = await loadBooksFromApi();
        renderStats();
        showAdminMessage('');
    } catch (error) {
        bookList = [];
        statsSummaryRow.innerHTML = '';
        lowStockList.innerHTML = '';
        bestSellersList.innerHTML = '';

        showAdminMessage(
            'Unable to load the catalog. ' + error.message,
            true
        );
    } finally {
        setAdminBusy(false);
    }
}

async function runAdminBookAction(action, successMessage) {
    if (adminBusy) {
        return false;
    }

    setAdminBusy(true);
    showAdminMessage('Saving...');

    try {
        await action();

        bookList = await loadBooksFromApi();
        renderStats();
        showAdminMessage(successMessage);

        return true;
    } catch (error) {
        const message =
            'The operation could not be confirmed. ' +
            error.message +
            ' Refresh before retrying.';

        showAdminMessage(message, true);

        if (bookFormModalElement.classList.contains('show')) {
            bookFormError.textContent = message;
            bookFormError.classList.remove('d-none');
        }

        return false;
    } finally {
        setAdminBusy(false);
    }
}

async function updateAdminBookField(bookId, field, value) {
    await runAdminBookAction(async function () {
        const book = await loadBookFromApi(bookId);
        book[field] = value;
        await updateBookInApi(book);
    }, 'Book updated.');
}

// --- Inventory and catalog management ---

function renderInventory() {
    inventoryTableBody.innerHTML = '';

    bookList.forEach(function (book) {
        const outOfStock = isBookOutOfStock(book);
        const statusButtonClass = book.status === 'Active'
            ? 'btn-success'
            : 'btn-outline-secondary';
        const stockBadgeClass = outOfStock ? 'bg-danger' : 'bg-success';
        const stockButtonClass = outOfStock
            ? 'btn-success'
            : 'btn-outline-danger';

        const row = document.createElement('tr');
        row.dataset.title = book.title.toLowerCase();
        row.innerHTML = `
            <td>
                <img src="${book.image}" alt="${book.title}"
                    style="width: 40px; height: 55px; object-fit: contain;">
            </td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.genre}</td>
            <td>
                <div class="input-group input-group-sm" style="max-width: 230px;">
                    <span class="input-group-text">$</span>
                    <input type="number" min="0" step="0.01"
                        class="form-control price-input" value="${book.price}"
                        style="min-width: 70px;">
                    <button type="button"
                        class="btn btn-outline-secondary update-price-btn">
                        Update
                    </button>
                </div>
            </td>
            <td>
                <div class="input-group input-group-sm" style="max-width: 110px;">
                    <input type="number" min="0"
                        class="form-control inventory-input" value="${book.inventory}"
                        style="min-width: 40px;">
                    <button type="button"
                        class="btn btn-outline-secondary update-inventory-btn">
                        Update
                    </button>
                </div>
            </td>
            <td>
                <button type="button"
                    class="btn btn-sm ${statusButtonClass} toggle-status-btn">
                    ${book.status}
                </button>
            </td>
            <td>
                <span class="badge ${stockBadgeClass}">
                    ${outOfStock ? 'Out of Stock' : 'In Stock'}
                </span>
                <button type="button"
                    class="btn btn-sm ${stockButtonClass} toggle-stock-btn mt-1 d-block">
                    ${outOfStock ? 'Mark In Stock' : 'Mark Out of Stock'}
                </button>
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-primary edit-book-btn mb-1">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger delete-book-btn">Delete</button>
            </td>
        `;

        row.querySelector('.update-price-btn').addEventListener('click', function () {
            const price = row.querySelector('.price-input').valueAsNumber;

            if (!Number.isFinite(price) || price < 0) {
                showAdminMessage('Price must be zero or greater.', true);
                return;
            }

            updateAdminBookField(book.id, 'price', price);
        });

        row.querySelector('.update-inventory-btn').addEventListener('click', function () {
            const inventory = row.querySelector('.inventory-input').valueAsNumber;

            if (!Number.isInteger(inventory) || inventory < 0) {
                showAdminMessage(
                    'Inventory must be a whole number of zero or greater.',
                    true
                );
                return;
            }

            updateAdminBookField(book.id, 'inventory', inventory);
        });

        row.querySelector('.toggle-status-btn').addEventListener('click', function () {
            const status = book.status === 'Active' ? 'Inactive' : 'Active';
            updateAdminBookField(book.id, 'status', status);
        });

        const toggleStockButton = row.querySelector('.toggle-stock-btn');
        toggleStockButton.disabled = book.inventory <= 0;

        toggleStockButton.addEventListener('click', function () {
            const override = book.manualStockOverride === true ? null : true;
            updateAdminBookField(book.id, 'manualStockOverride', override);
        });

        row.querySelector('.edit-book-btn').addEventListener('click', function () {
            openBookForm(book);
        });

        row.querySelector('.delete-book-btn').addEventListener('click', function () {
            if (!confirm('Delete "' + book.title + '"? This cannot be undone.')) {
                return;
            }

            runAdminBookAction(async function () {
                await deleteBookInApi(book.id);
            }, 'Book deleted.');
        });

        if (adminBusy) {
            row.querySelectorAll('input, button').forEach(function (control) {
                control.disabled = true;
            });
        }

        inventoryTableBody.appendChild(row);
    });

    applyTitleFilter();
}

const titleSearchInput = document.getElementById('titleSearchInput');

function applyTitleFilter() {
    const query = titleSearchInput.value.trim().toLowerCase();
    Array.from(inventoryTableBody.children).forEach(function (row) {
        row.classList.toggle('d-none', !row.dataset.title.includes(query));
    });
}

const resetCatalogButton = document.getElementById('resetCatalogButton');

// Reset all persistent demo data while preserving the current Admin session.
resetCatalogButton.addEventListener('click', function () {
    const confirmed = window.confirm(
        'Reset this browser’s demo orders, cart, checkout, accounts, and legacy catalog? ' +
        'The API catalog will not change.'
    );

    if (!confirmed) {
        return;
    }

    resetDemoData();
    window.location.reload();
});

titleSearchInput.addEventListener('input', applyTitleFilter);

// --- Add/Edit book form ---

const bookFormModalElement = document.getElementById('bookFormModal');
const bookFormModal = new bootstrap.Modal(bookFormModalElement);
const bookFormModalTitle = document.getElementById('bookFormModalTitle');
const bookForm = document.getElementById('bookForm');
const bookFormError = document.getElementById('bookFormError');

const bookFormId = document.getElementById('bookFormId');
const bookFormTitle = document.getElementById('bookFormTitle');
const bookFormDescription = document.getElementById('bookFormDescription');
const bookFormAuthor = document.getElementById('bookFormAuthor');
const bookFormGenre = document.getElementById('bookFormGenre');
const bookFormIsbn = document.getElementById('bookFormIsbn');
const bookFormPrice = document.getElementById('bookFormPrice');
const bookFormInventory = document.getElementById('bookFormInventory');
const bookFormImage = document.getElementById('bookFormImage');
const bookFormStatus = document.getElementById('bookFormStatus');

function openBookForm(book) {
    bookFormError.classList.add('d-none');
    if (book) {
        bookFormModalTitle.textContent = 'Edit Book';
        bookFormId.value = book.id;
        bookFormTitle.value = book.title;
        bookFormAuthor.value = book.author;
        bookFormDescription.value = book.description;
        bookFormGenre.value = book.genre;
        bookFormIsbn.value = book.isbn;
        bookFormPrice.value = book.price;
        bookFormInventory.value = book.inventory;
        bookFormImage.value = book.image;
        bookFormStatus.value = book.status;
    } else {
        bookFormModalTitle.textContent = 'Add Book';
        bookForm.reset();
        bookFormId.value = '';
    }
    bookFormModal.show();
}

document.getElementById('addBookButton').addEventListener('click', function () {
    openBookForm(null);
});

document.getElementById('saveBookButton').addEventListener('click', async function () {
    if (adminBusy) {
        return;
    }

    const values = {
        title: bookFormTitle.value.trim(),
        author: bookFormAuthor.value.trim(),
        description: bookFormDescription.value.trim(),
        genre: bookFormGenre.value.trim(),
        isbn: bookFormIsbn.value.trim(),
        price: bookFormPrice.valueAsNumber,
        inventory: bookFormInventory.valueAsNumber,
        image: bookFormImage.value.trim(),
        status: bookFormStatus.value
    };

    const invalid =
        !values.title ||
        !values.author ||
        !values.genre ||
        !values.isbn ||
        !values.image ||
        !Number.isFinite(values.price) ||
        values.price < 0 ||
        !Number.isInteger(values.inventory) ||
        values.inventory < 0;

    if (invalid) {
        bookFormError.textContent =
            'Complete all required fields. Price must be nonnegative, ' +
            'and inventory must be a nonnegative whole number.';
        bookFormError.classList.remove('d-none');
        return;
    }

    bookFormError.classList.add('d-none');

    const existingId = bookFormId.value
        ? Number(bookFormId.value)
        : null;

    const succeeded = await runAdminBookAction(async function () {
        if (existingId !== null) {
            const book = await loadBookFromApi(existingId);
            Object.assign(book, values);
            await updateBookInApi(book);
        } else {
            await createBookInApi({
                ...values,
                id: 0,
                manualStockOverride: null
            });
        }
    }, existingId === null ? 'Book created.' : 'Book updated.');

    if (succeeded) {
        bookFormModal.hide();
    }
});

// --- Reporting dashboard ---

const statsSummaryRow = document.getElementById('statsSummaryRow');
const lowStockList = document.getElementById('lowStockList');
const bestSellersList = document.getElementById('bestSellersList');

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

function renderStats() {
    const totalInventoryValue = bookList.reduce(function (sum, book) {
        return sum + book.price * book.inventory;
    }, 0);

    const lowStockBooks = bookList.filter(function (book) {
        return book.status === 'Active' &&
            (isBookOutOfStock(book) || isBookLowStock(book));
    }).sort(function (a, b) {
        return a.title.localeCompare(b.title);
    });

    const outOfStockBooks = bookList.filter(isBookOutOfStock);

    const orders = loadOrdersFromStorage();
    const ordersPlaced = orders.length;
    const revenue = orders.reduce(function (sum, order) { return sum + (order.total || 0); }, 0);

    const bestSellers = getBestSellingItems(orders, 5);

    statsSummaryRow.innerHTML =
        statCard('Total Inventory Value', currencyFormatter.format(totalInventoryValue)) +
        statCard('Low Stock Items', lowStockBooks.length) +
        statCard('Out of Stock Items', outOfStockBooks.length) +
        statCard('Orders Placed', ordersPlaced) +
        statCard('Revenue', currencyFormatter.format(revenue));

    lowStockList.innerHTML = lowStockBooks.length
        ? lowStockBooks.map(function (book) {
            return `<li class="list-group-item d-flex justify-content-between">
                <span>${book.title}</span>
                <span class="text-muted">
                    ${isBookOutOfStock(book) ? 'Out of stock &middot; ' : ''}${book.inventory} left
                </span>
            </li>`;
        }).join('')
        : '<li class="list-group-item text-muted">No low-stock items.</li>';

    bestSellersList.innerHTML = bestSellers.length
        ? bestSellers.map(function (item) {
            return `<li class="list-group-item d-flex justify-content-between">
                <span>${item.title}</span><span class="text-muted">${item.quantity} sold</span>
            </li>`;
        }).join('')
        : '<li class="list-group-item text-muted">No orders yet.</li>';
}

// --- Page initialization ---

loadAdminCatalog();
