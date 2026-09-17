// Admin behavior: everything employee.js does, plus adding/editing/deleting
// listings, editing price, toggling Active/Inactive status, and reporting stats.

const LOW_STOCK_THRESHOLD = 3;

const bookList = loadBooksFromStorage();
const inventoryTableBody = document.getElementById('inventoryTableBody');

function renderInventory() {
    inventoryTableBody.innerHTML = '';

    bookList.forEach(function (book) {
        const outOfStock = isBookOutOfStock(book);

        const row = document.createElement('tr');
        row.dataset.title = book.title.toLowerCase();
        row.innerHTML = `
            <td><img src="${book.image}" alt="${book.title}" style="width: 40px; height: 55px; object-fit: contain;"></td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.genre}</td>
            <td>
                <div class="input-group input-group-sm" style="max-width: 150px;">
                    <span class="input-group-text">$</span>
                    <input type="number" min="0" step="0.01" class="form-control price-input" value="${book.price}">
                    <button type="button" class="btn btn-outline-secondary update-price-btn">Update</button>
                </div>
            </td>
            <td>
                <div class="input-group input-group-sm" style="max-width: 160px;">
                    <input type="number" min="0" class="form-control inventory-input" value="${book.inventory}">
                    <button type="button" class="btn btn-outline-secondary update-inventory-btn">Update</button>
                </div>
            </td>
            <td>
                <button type="button" class="btn btn-sm ${book.status === 'Active' ? 'btn-success' : 'btn-outline-secondary'} toggle-status-btn">
                    ${book.status}
                </button>
            </td>
            <td>
                <span class="badge ${outOfStock ? 'bg-danger' : 'bg-success'}">${outOfStock ? 'Out of Stock' : 'In Stock'}</span>
                <button type="button" class="btn btn-sm ${outOfStock ? 'btn-success' : 'btn-outline-danger'} toggle-stock-btn mt-1 d-block">
                    ${outOfStock ? 'Mark In Stock' : 'Mark Out of Stock'}
                </button>
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-primary edit-book-btn mb-1">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger delete-book-btn">Delete</button>
            </td>
        `;

        row.querySelector('.update-price-btn').addEventListener('click', function () {
            const input = row.querySelector('.price-input');
            const newPrice = parseFloat(input.value);
            if (!isNaN(newPrice) && newPrice >= 0) {
                book.price = newPrice;
                saveBooksToStorage(bookList);
                renderInventory();
                renderStats();
            }
        });

        row.querySelector('.update-inventory-btn').addEventListener('click', function () {
            const input = row.querySelector('.inventory-input');
            const newInventory = parseInt(input.value, 10);
            if (!isNaN(newInventory) && newInventory >= 0) {
                book.inventory = newInventory;
                saveBooksToStorage(bookList);
                renderInventory();
                renderStats();
            }
        });

        row.querySelector('.toggle-status-btn').addEventListener('click', function () {
            book.status = book.status === 'Active' ? 'Inactive' : 'Active';
            saveBooksToStorage(bookList);
            renderInventory();
            renderStats();
        });

        const toggleStockButton = row.querySelector('.toggle-stock-btn');
        toggleStockButton.disabled = book.inventory <= 0;
        toggleStockButton.addEventListener('click', function () {
            book.manualStockOverride = book.manualStockOverride === true ? null : true;
            saveBooksToStorage(bookList);
            renderInventory();
            renderStats();
        });

        row.querySelector('.edit-book-btn').addEventListener('click', function () {
            openBookForm(book);
        });

        row.querySelector('.delete-book-btn').addEventListener('click', function () {
            if (confirm('Delete "' + book.title + '"? This cannot be undone.')) {
                const index = bookList.findIndex(function (b) { return b.id === book.id; });
                if (index !== -1) {
                    bookList.splice(index, 1);
                    saveBooksToStorage(bookList);
                    renderInventory();
                    renderStats();
                }
            }
        });

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

titleSearchInput.addEventListener('input', applyTitleFilter);

// --- Add / Edit book form ---

const bookFormModalEl = document.getElementById('bookFormModal');
const bookFormModal = new bootstrap.Modal(bookFormModalEl);
const bookFormModalTitle = document.getElementById('bookFormModalTitle');
const bookForm = document.getElementById('bookForm');
const bookFormError = document.getElementById('bookFormError');

const bookFormId = document.getElementById('bookFormId');
const bookFormTitle = document.getElementById('bookFormTitle');
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

document.getElementById('saveBookButton').addEventListener('click', function () {
    const title = bookFormTitle.value.trim();
    const author = bookFormAuthor.value.trim();
    const genre = bookFormGenre.value.trim();
    const isbn = bookFormIsbn.value.trim();
    const price = parseFloat(bookFormPrice.value);
    const inventory = parseInt(bookFormInventory.value, 10);
    const image = bookFormImage.value.trim();
    const status = bookFormStatus.value;

    if (!title || !author || !genre || !isbn || !image || isNaN(price) || price < 0 || isNaN(inventory) || inventory < 0) {
        bookFormError.textContent = 'Please fill out every field with valid values.';
        bookFormError.classList.remove('d-none');
        return;
    }

    const existingId = bookFormId.value ? parseInt(bookFormId.value, 10) : null;

    if (existingId !== null) {
        const book = bookList.find(function (b) { return b.id === existingId; });
        if (book) {
            book.title = title;
            book.author = author;
            book.genre = genre;
            book.isbn = isbn;
            book.price = price;
            book.inventory = inventory;
            book.image = image;
            book.status = status;
        }
    } else {
        const nextId = bookList.reduce(function (max, b) { return Math.max(max, b.id); }, 0) + 1;
        bookList.push(new Book(nextId, isbn, title, author, genre, price, inventory, status, image));
    }

    saveBooksToStorage(bookList);
    renderInventory();
    renderStats();
    bookFormModal.hide();
});

// --- Reporting ---

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
        return !isBookOutOfStock(book) && book.inventory > 0 && book.inventory <= LOW_STOCK_THRESHOLD;
    });

    const outOfStockBooks = bookList.filter(isBookOutOfStock);

    const orders = loadOrdersFromStorage();
    const ordersPlaced = orders.length;
    const revenue = orders.reduce(function (sum, order) { return sum + (order.total || 0); }, 0);

    const titleCounts = {};
    orders.forEach(function (order) {
        (order.items || []).forEach(function (item) {
            titleCounts[item.title] = (titleCounts[item.title] || 0) + (item.quantity || 1);
        });
    });
    const bestSellers = Object.entries(titleCounts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);

    statsSummaryRow.innerHTML =
        statCard('Total Inventory Value', currencyFormatter.format(totalInventoryValue)) +
        statCard('Low Stock Items', lowStockBooks.length) +
        statCard('Out of Stock Items', outOfStockBooks.length) +
        statCard('Orders Placed', ordersPlaced) +
        statCard('Revenue', currencyFormatter.format(revenue));

    lowStockList.innerHTML = lowStockBooks.length
        ? lowStockBooks.map(function (book) {
            return `<li class="list-group-item d-flex justify-content-between">
                <span>${book.title}</span><span class="text-muted">${book.inventory} left</span>
            </li>`;
        }).join('')
        : '<li class="list-group-item text-muted">No low-stock items.</li>';

    bestSellersList.innerHTML = bestSellers.length
        ? bestSellers.map(function ([title, quantity]) {
            return `<li class="list-group-item d-flex justify-content-between">
                <span>${title}</span><span class="text-muted">${quantity} sold</span>
            </li>`;
        }).join('')
        : '<li class="list-group-item text-muted">No orders yet.</li>';
}

renderInventory();
renderStats();
