// Customer display, search, filter, etc. Updating what the customer sees.

const bookContainer = document.getElementById('bookContainer');

let bookList = loadBooksFromStorage();

let selectedBook = null;


function createBookCard(book) {
    const col = document.createElement('div');
    col.className = "col";
    col.dataset.title = book.title.toLowerCase();
    col.dataset.author = book.author.toLowerCase();
    col.dataset.genre = book.genre.toLowerCase();

    const outOfStock = isBookOutOfStock(book);

    col.innerHTML = `
        <div class="card h-100${outOfStock ? ' out-of-stock' : ''}" role="button">
            <div class="position-relative">
                <img src="${book.image}" class="card-img-top" alt="${book.title}">
                ${outOfStock ? '<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>' : ''}
            </div>
            <div class="card-body">
                <h5 class="card-title">${book.title}</h5>
                <p class="card-text mb-1">${book.author}</p>
                <p class="card-text fw-bold">${currencyFormatter.format(book.price)}</p>
                <p class="card-text small">${getCustomerAvailability(book)}</p>
                <button type="button" class="btn btn-primary btn-sm quick-add-button"
                    ${outOfStock ? 'disabled' : ''}>
                    Add to Cart
                </button>
            </div>
        </div>
    `;

    col.querySelector('.card').addEventListener('click', function (event) {
        if (event.target.closest('.quick-add-button')) {
            return;
        }

        selectedBook = book;
        updateBookModal(book);

        const modalElement = document.getElementById('bookModal');
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
    });

    const quickAddButton = col.querySelector('.quick-add-button');

    quickAddButton.addEventListener('click', function (event) {
        event.stopPropagation();
        addBookToCart(book.id);
    });

    bookContainer.appendChild(col);
}

function updateBookModal(book) {
    document.getElementById('modalBookTitle').textContent = book.title;
    document.getElementById('modalBookImage').src = book.image;
    document.getElementById('modalBookImage').alt = book.title;
    document.getElementById('modalBookAuthor').textContent = "Author: " + book.author;
    document.getElementById('modalBookGenre').textContent = "Genre: " + book.genre;
    document.getElementById('modalBookPrice').textContent = "Price: " + (currencyFormatter.format(book.price));
    document.getElementById('modalBookDescription').textContent = book.description || 'No description available yet.';

    const bookOutOfStock = book.status !== 'Active' || isBookOutOfStock(book);
    const inventoryText = document.getElementById('modalBookInventory');
    inventoryText.textContent = getCustomerAvailability(book);
    inventoryText.classList.toggle('text-danger', bookOutOfStock);

    document.getElementById('addToCartButton').disabled = bookOutOfStock;
    document.getElementById('buyNowButton').disabled = bookOutOfStock;
}


function renderCatalog() {
    bookContainer.innerHTML = "";
    for (let i = 0; i < bookList.length; i++) {
        if (bookList[i].status === "Active") {
            createBookCard(bookList[i]);
        }
    }
}

const searchFieldSelect = document.getElementById('searchFieldSelect');
const searchInput = document.getElementById('searchInput');

function applySearchFilter() {
    const field = searchFieldSelect.value;
    const query = searchInput.value.trim().toLowerCase();
    Array.from(bookContainer.children).forEach(function (col) {
        col.classList.toggle('d-none', !col.dataset[field].includes(query));
    });
}

searchInput.addEventListener('input', applySearchFilter);
searchFieldSelect.addEventListener('change', applySearchFilter);



const cartToastEl = document.getElementById("cartToast");
const cartToastBody = document.getElementById("cartToastBody");
const cartToast = new bootstrap.Toast(cartToastEl);

function showCartToast(message, variant) {
    cartToastEl.classList.remove("text-bg-warning", "text-bg-success");
    cartToastEl.classList.add(variant === "success" ? "text-bg-success" : "text-bg-warning");
    cartToastBody.textContent = message;
    cartToast.show();
}

function updateCartCount() {
    const cartItems = loadCartFromStorage();
    document.getElementById('cartCount').textContent =
        getCartItemCount(cartItems);
}

function addBookToCart(bookId) {
    const cartItems = loadCartFromStorage();
    const existingItem = cartItems.find(function (item) {
        return item.bookId === bookId;
    });

    const quantity = existingItem ? existingItem.quantity + 1 : 1;
    const error = setCartQuantity(bookId, quantity);

    if (error) {
        showCartToast(error, 'warning');
        return;
    }

    updateCartCount();
    showCartToast('Book added to your cart.', 'success');
}

const addToCartButton = document.getElementById("addToCartButton");

addToCartButton.addEventListener("click", function () {
    if (selectedBook) {
        addBookToCart(selectedBook.id);
    }
});

const buyNowButton = document.getElementById('buyNowButton');

buyNowButton.addEventListener('click', function () {
    if (!selectedBook) {
        return;
    }

    // Reload the current catalog state rather than relying on the copy that
    // was selected when the modal originally opened.
    const books = loadBooksFromStorage();
    const currentBook = books.find(function (book) {
        return book.id === selectedBook.id;
    });

    const error = getCartQuantityError(currentBook, 1);

    if (error) {
        refreshCustomerCatalog();
        showCartToast(error, 'warning');
        return;
    }

    saveCheckoutState('buyNow', [{
        bookId: currentBook.id,
        quantity: 1,
        price: currentBook.price
    }]);

    window.location.href = 'checkout.html';
});

function refreshCustomerCatalog() {
    bookList = loadBooksFromStorage();
    renderCatalog();
    applySearchFilter();

    if (selectedBook) {
        selectedBook = bookList.find(function (book) { return book.id === selectedBook.id; });
        if (selectedBook && selectedBook.status === 'Active') {
            updateBookModal(selectedBook);
        } else {
            bootstrap.Modal.getOrCreateInstance(document.getElementById('bookModal')).hide();
            selectedBook = null;
        }
    }
}

// Reload after back/forward navigation, including pages restored from browser cache.
window.addEventListener('pageshow', function () {
    refreshCustomerCatalog();
    const result = reconcileCart();
    updateCartCount();
    if (result.messages.length > 0) {
        showCartToast(result.messages.join(' '), 'warning');
    }
});

renderCatalog();
updateCartCount();
