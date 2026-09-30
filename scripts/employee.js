// Employee inventory operations. Catalog details, pricing, and listing status remain Admin responsibilities.

// --- Page state and DOM references ---

const bookList = loadBooksFromStorage();
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
            const newInventory = parseInt(input.value, 10);
            if (!Number.isNaN(newInventory) && newInventory >= 0) {
                book.inventory = newInventory;
                saveBooksToStorage(bookList);
                renderInventory();
            }
        });

        const toggleStockButton = row.querySelector('.toggle-stock-btn');
        // A manual override cannot make zero inventory purchasable.
        toggleStockButton.disabled = book.inventory <= 0;
        toggleStockButton.addEventListener('click', function () {
            book.manualStockOverride = book.manualStockOverride === true ? null : true;
            saveBooksToStorage(bookList);
            renderInventory();
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

// --- Page initialization ---

renderInventory();
