// Customer catalog browsing, cart entry points, and checkout routing.

// --- Page state and primary DOM references ---

const bookContainer = document.getElementById('bookContainer');
const customerBestSellers = document.getElementById('customerBestSellers');
const customerBestSellersEmpty = document.getElementById('customerBestSellersEmpty');
const modalBookQuantity = document.getElementById('modalBookQuantity');

let customerBusy = false;

const catalogLoadMessage = document.getElementById('catalogLoadMessage');

let bookList = [];

let selectedBook = null;

// --- Book cards and detail modal ---

function openBookDetails(book) {
    selectedBook = book;
    updateBookModal(book);

    const modalElement = document.getElementById('bookModal');
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function createBookCard(book) {
    const col = document.createElement('div');
    col.className = 'col';

    const outOfStock = isBookOutOfStock(book);

    col.innerHTML = `
        <div class="card h-100${outOfStock ? ' out-of-stock' : ''}" role="button">
            <div class="position-relative">
                <img src="${book.image}" class="card-img-top" alt="${book.title}">
                ${outOfStock
            ? '<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>'
            : ''}
            </div>
            <div class="card-body">
                <h5 class="card-title">${book.title}</h5>
                <p class="card-text mb-1">${book.author}</p>
                <p class="card-text fw-bold">${currencyFormatter.format(book.price)}</p>
                <p class="card-text small">${getCustomerAvailability(book)}</p>
                <button type="button" class="btn btn-primary btn-sm quick-add-button"
                    ${outOfStock || customerBusy ? 'disabled' : ''}>
                    Add to Cart
                </button>
            </div>
        </div>
    `;

    col.querySelector('.card').addEventListener('click', function (event) {
        if (event.target.closest('.quick-add-button')) {
            return;
        }

        openBookDetails(book);
    });

    const quickAddButton = col.querySelector('.quick-add-button');
    quickAddButton.dataset.bookId = book.id;

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
    document.getElementById('modalBookAuthor').textContent =
        'Author: ' + book.author;
    document.getElementById('modalBookGenre').textContent =
        'Genre: ' + book.genre;
    document.getElementById('modalBookPrice').textContent =
        'Price: ' + currencyFormatter.format(book.price);
    document.getElementById('modalBookDescription').textContent =
        book.description || 'No description available yet.';
    const series = document.getElementById('modalBookSeries');
    series.textContent = book.seriesName
        ? book.seriesName + (book.seriesOrder == null ? '' : ' — Reading sequence ' + book.seriesOrder)
        : '';
    series.classList.toggle('d-none', !book.seriesName);

    const bookOutOfStock = book.status !== 'Active' || isBookOutOfStock(book);
    modalBookQuantity.value = 1;
    modalBookQuantity.max = book.inventory;
    modalBookQuantity.disabled = bookOutOfStock || customerBusy;
    const inventoryText = document.getElementById('modalBookInventory');
    inventoryText.textContent = getCustomerAvailability(book);
    inventoryText.classList.toggle('text-danger', bookOutOfStock);
    document.getElementById('addToCartButton').disabled = bookOutOfStock || customerBusy;
    document.getElementById('buyNowButton').disabled = bookOutOfStock || customerBusy;
}

// --- Catalog search, filtering, and sorting ---

const searchInput = document.getElementById('searchInput');
const genreFilterSelect = document.getElementById('genreFilterSelect');
const sortSelect = document.getElementById('sortSelect');
const catalogEmptyMessage = document.getElementById('catalogEmptyMessage');

function populateGenreFilter() {
    const previousGenre = genreFilterSelect.value;

    const genres = Array.from(
        new Set(
            bookList
                .filter(function (book) {
                    return book.status === 'Active';
                })
                .map(function (book) {
                    return book.genre;
                })
        )
    ).sort(function (a, b) {
        return a.localeCompare(b);
    });

    genreFilterSelect.innerHTML = '';

    const allGenresOption = document.createElement('option');
    allGenresOption.value = '';
    allGenresOption.textContent = 'All Genres';
    genreFilterSelect.appendChild(allGenresOption);

    genres.forEach(function (genre) {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilterSelect.appendChild(option);
    });

    if (genres.includes(previousGenre)) {
        genreFilterSelect.value = previousGenre;
    }
}

function getVisibleCatalogBooks() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedGenre = genreFilterSelect.value;
    const selectedSort = sortSelect.value;

    let visibleBooks = bookList.filter(function (book) {
        return book.status === 'Active';
    });

    if (query) {
        const searchFields = ['title', 'author', 'genre', 'isbn'];
        visibleBooks = visibleBooks.filter(function (book) {
            return searchFields.some(function (field) {
                return String(book[field] || '').toLowerCase().includes(query);
            });
        });
    }

    if (selectedGenre) {
        visibleBooks = visibleBooks.filter(function (book) {
            return book.genre === selectedGenre;
        });
    }

    if (selectedSort === 'title-asc') {
        visibleBooks.sort(function (a, b) {
            return a.title.localeCompare(b.title);
        });
    } else if (selectedSort === 'title-desc') {
        visibleBooks.sort(function (a, b) {
            return b.title.localeCompare(a.title);
        });
    } else if (selectedSort === 'price-asc') {
        visibleBooks.sort(function (a, b) {
            return a.price - b.price;
        });
    } else if (selectedSort === 'price-desc') {
        visibleBooks.sort(function (a, b) {
            return b.price - a.price;
        });
    }

    return visibleBooks;
}

// --- Catalog rendering and filter events ---

function renderCatalog() {
    const visibleBooks = getVisibleCatalogBooks();

    bookContainer.innerHTML = '';

    visibleBooks.forEach(function (book) {
        createBookCard(book);
    });

    catalogEmptyMessage.classList.toggle(
        'd-none',
        visibleBooks.length > 0
    );
}

searchInput.addEventListener('input', renderCatalog);
genreFilterSelect.addEventListener('change', renderCatalog);
sortSelect.addEventListener('change', renderCatalog);

// --- Cart feedback and Add to Cart ---

const cartToastElement = document.getElementById('cartToast');
const cartToastBody = document.getElementById('cartToastBody');
const cartToast = new bootstrap.Toast(cartToastElement);

function showCartToast(message, variant) {
    cartToastElement.classList.remove('text-bg-warning', 'text-bg-success');
    cartToastElement.classList.add(
        variant === 'success' ? 'text-bg-success' : 'text-bg-warning'
    );
    cartToastBody.textContent = message;
    cartToast.show();
}

function updateCartCount() {
    const cartItems = loadCartFromStorage();
    document.getElementById('cartCount').textContent =
        getCartItemCount(cartItems);
}

function setCustomerBusy(busy) {
    customerBusy = busy;
    bookContainer.querySelectorAll('.quick-add-button').forEach(function (button) {
        const book = bookList.find(function (book) {
            return book.id === Number(button.dataset.bookId);
        });
        button.disabled = busy || !book || isBookOutOfStock(book);
    });
    modalBookQuantity.disabled = busy || !selectedBook ||
        selectedBook.status !== 'Active' || isBookOutOfStock(selectedBook);
    addToCartButton.disabled = modalBookQuantity.disabled;
    buyNowButton.disabled = modalBookQuantity.disabled;
}

async function addBookToCart(bookId, quantityToAdd = 1) {
    if (customerBusy) {
        return;
    }
    setCustomerBusy(true);
    try {
        if (!Number.isInteger(quantityToAdd) || quantityToAdd < 1) {
            showCartToast('Please choose a whole-number quantity of at least 1.', 'warning');
            return;
        }
        const cartItems = loadCartFromStorage();
        const existingItem = cartItems.find(function (item) {
            return item.bookId === bookId;
        });

        const currentQuantity = existingItem ? existingItem.quantity : 0;
        const quantity = currentQuantity + quantityToAdd;
        const error = await setCartQuantity(bookId, quantity);

        if (error) {
            showCartToast(error, 'warning');
            return;
        }

        updateCartCount();
        const message = quantityToAdd === 1
            ? 'Book added to your cart.'
            : quantityToAdd + ' copies added to your cart.';

        showCartToast(message, 'success');
    } catch (error) {
        showCartToast('Unable to update your cart. ' + error.message, 'warning');
    } finally {
        setCustomerBusy(false);
    }
}

const addToCartButton = document.getElementById('addToCartButton');

addToCartButton.addEventListener('click', function () {
    if (!selectedBook) {
        return;
    }

    addBookToCart(
        selectedBook.id,
        modalBookQuantity.valueAsNumber
    );
});

// --- Buy Now checkout routing ---

const buyNowButton = document.getElementById('buyNowButton');

buyNowButton.addEventListener('click', async function () {
    if (!selectedBook || customerBusy) {
        return;
    }
    const bookId = selectedBook.id;
    const quantity = modalBookQuantity.valueAsNumber;
    setCustomerBusy(true);
    try {
        // Reload the current catalog state rather than relying on the copy that
        // was selected when the modal originally opened.
        const currentBook = await loadBookFromApi(bookId);
        const error = getCartQuantityError(currentBook, quantity);

        if (error) {
            showCartToast(error, 'warning');
            return;
        }

        saveCheckoutState('buyNow', [{
            bookId: currentBook.id,
            quantity: quantity,
            price: currentBook.price
        }]);

        sessionStorage.removeItem('purchaseUncertain');
        window.location.href = 'checkout.html';
    } catch (error) {
        showCartToast('Unable to start checkout. ' + error.message, 'warning');
    } finally {
        setCustomerBusy(false);
    }
});

// --- Page refresh and initialization ---

async function refreshCustomerCatalog() {
    if (customerBusy) {
        return;
    }
    setCustomerBusy(true);
    catalogLoadMessage.textContent = 'Loading catalog...';
    catalogLoadMessage.classList.remove('d-none', 'alert-danger');
    catalogLoadMessage.classList.add('alert-info');

    customerBestSellers.closest('section').classList.remove('d-none');
    customerBestSellers.innerHTML = '';
    customerBestSellersEmpty.textContent = 'Loading Best Sellers...';
    customerBestSellersEmpty.classList.remove('d-none');
    catalogEmptyMessage.classList.add('d-none');

    try {
        bookList = await loadBooksFromApi();
        const reconciliation = await reconcileCart(bookList);
        if (reconciliation.messages.length > 0) {
            showCartToast(reconciliation.messages.join(' '), 'warning');
        }

        populateGenreFilter();
        renderCatalog();
        try {
            renderCustomerBestSellers(
                await loadOrdersFromApi(), bookList,
                customerBestSellers, customerBestSellersEmpty, openBookDetails
            );
            customerBestSellersEmpty.textContent = 'No best-selling books are available yet.';
        } catch (error) {
            customerBestSellers.innerHTML = '';
            customerBestSellersEmpty.textContent = 'Unable to load Best Sellers. Refresh to retry.';
            customerBestSellersEmpty.classList.remove('d-none');
        }

        if (selectedBook) {
            selectedBook = bookList.find(function (book) {
                return book.id === selectedBook.id;
            });

            if (selectedBook && selectedBook.status === 'Active') {
                updateBookModal(selectedBook);
            } else {
                bootstrap.Modal.getOrCreateInstance(
                    document.getElementById('bookModal')
                ).hide();

                selectedBook = null;
            }
        }

        catalogLoadMessage.textContent = '';
        catalogLoadMessage.classList.add('d-none');
    } catch (error) {
        bookList = [];
        selectedBook = null;
        bookContainer.innerHTML = '';
        catalogEmptyMessage.classList.add('d-none');

        bootstrap.Modal.getOrCreateInstance(
            document.getElementById('bookModal')
        ).hide();

        catalogLoadMessage.textContent =
            'Unable to load the catalog. Check that the API is running, then refresh.';

        catalogLoadMessage.classList.remove('d-none', 'alert-info');
        catalogLoadMessage.classList.add('alert-danger');

        console.error(error);
    } finally {
        setCustomerBusy(false);
    }
}

window.addEventListener('pageshow', async function () {
    await refreshCustomerCatalog();

    updateCartCount();
});
