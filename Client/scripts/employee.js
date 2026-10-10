// Employee inventory operations. Catalog details, pricing, and listing status remain Admin responsibilities.

// --- Page state and DOM references ---

let bookList = [];
let inventoryBusy = false;

const inventoryMessage = document.getElementById('inventoryMessage');
const inventoryTableBody = document.getElementById('inventoryTableBody');

// --- Inventory table ---

function renderInventory() {
    inventoryTableBody.innerHTML = '';

    bookList.forEach(function (book) {
        const outOfStock = isBookOutOfStock(book);
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
                <span class="badge ${stockBadgeClass}">
                    ${outOfStock ? 'Out of Stock' : 'In Stock'}
                </span>
            </td>
            <td>
                <button type="button"
                    class="btn btn-sm ${stockButtonClass} toggle-stock-btn">
                    ${outOfStock ? 'Mark In Stock' : 'Mark Out of Stock'}
                </button>
            </td>
        `;

        row.querySelector('.update-inventory-btn').addEventListener('click', function () {
            const input = row.querySelector('.inventory-input');
            const newInventory = input.valueAsNumber;

            if (!Number.isInteger(newInventory) || newInventory < 0) {
                showInventoryMessage(
                    'Inventory must be a whole number of zero or greater.',
                    true
                );
                return;
            }

            saveEmployeeBookChange(book.id, 'inventory', newInventory);
        });

        const toggleStockButton = row.querySelector('.toggle-stock-btn');
        // A manual override cannot make zero inventory purchasable.
        toggleStockButton.disabled = book.inventory <= 0;
        toggleStockButton.addEventListener('click', function () {
            const newOverride =
                book.manualStockOverride === true ? null : true;

            saveEmployeeBookChange(book.id, 'manualStockOverride', newOverride);
        });

        if (inventoryBusy) {
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

titleSearchInput.addEventListener('input', applyTitleFilter);

// --- API feedback, catalog loading, and inventory updates ---

function showInventoryMessage(message, isError = false) {
    inventoryMessage.textContent = message;
    inventoryMessage.classList.toggle('d-none', message.length === 0);
    inventoryMessage.classList.toggle('alert-danger', isError);
    inventoryMessage.classList.toggle('alert-info', !isError);
}

async function loadInventory() {
    inventoryBusy = true;
    showInventoryMessage('Loading inventory...');

    try {
        bookList = await loadBooksFromApi();
        showInventoryMessage('');
    } catch (error) {
        bookList = [];
        showInventoryMessage(
            'Unable to load inventory. ' + error.message,
            true
        );
    } finally {
        inventoryBusy = false;
        renderInventory();
    }
}

async function saveEmployeeBookChange(bookId, field, value) {
    // Absolute inventory inputs belong to the displayed revision. A fresh GET
    // supplies details but must not erase the original concurrency check.
    if (inventoryBusy) {
        return;
    }

    inventoryBusy = true;
    renderInventory();
    showInventoryMessage('Saving...');
    const revision = bookList.find(function (book) { return book.id === bookId; })?.revision;

    try {
        const currentBook = await loadBookFromApi(bookId);
        currentBook[field] = value;
        currentBook.revision = revision;

        const savedBook = await updateBookInApi(currentBook);

        bookList = bookList.map(function (book) {
            return book.id === savedBook.id ? savedBook : book;
        });

        showInventoryMessage('Saved changes to ' + savedBook.title + '.');
    } catch (error) {
        showInventoryMessage(
            'The update could not be confirmed. ' +
            error.message +
            ' Refresh before retrying.',
            true
        );
    } finally {
        inventoryBusy = false;
        renderInventory();
    }
}

loadInventory();
