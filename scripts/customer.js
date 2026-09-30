// Customer catalog browsing, cart entry points, and checkout routing.

// --- Page state and primary DOM references ---

const bookContainer = document.getElementById('bookContainer');
const customerBestSellers = document.getElementById('customerBestSellers');
const customerBestSellersEmpty = document.getElementById('customerBestSellersEmpty');
const modalBookQuantity = document.getElementById('modalBookQuantity');

let bookList = loadBooksFromStorage();

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

        openBookDetails(book);
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
    document.getElementById('modalBookAuthor').textContent =
        'Author: ' + book.author;
    document.getElementById('modalBookGenre').textContent =
        'Genre: ' + book.genre;
    document.getElementById('modalBookPrice').textContent =
        'Price: ' + currencyFormatter.format(book.price);
    document.getElementById('modalBookDescription').textContent =
        book.description || 'No description available yet.';

    const bookOutOfStock = book.status !== 'Active' || isBookOutOfStock(book);
    modalBookQuantity.value = 1;
    modalBookQuantity.max = book.inventory;
    modalBookQuantity.disabled = bookOutOfStock;
    const inventoryText = document.getElementById('modalBookInventory');
    inventoryText.textContent = getCustomerAvailability(book);
    inventoryText.classList.toggle('text-danger', bookOutOfStock);

    document.getElementById('addToCartButton').disabled = bookOutOfStock;
    document.getElementById('buyNowButton').disabled = bookOutOfStock;
}

// --- Catalog search, filtering, and sorting ---

const searchFieldSelect = document.getElementById('searchFieldSelect');
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
    const field = searchFieldSelect.value;
    const query = searchInput.value.trim().toLowerCase();
    const selectedGenre = genreFilterSelect.value;
    const selectedSort = sortSelect.value;

    let visibleBooks = bookList.filter(function (book) {
        return book.status === 'Active';
    });

    if (query) {
        visibleBooks = visibleBooks.filter(function (book) {
            const fieldValue = String(book[field] || '').toLowerCase();
            return fieldValue.includes(query);
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

// --- Customer Best Sellers ---

function renderCustomerBestSellers() {
    const orders = loadOrdersFromStorage();
    const rankedItems = getBestSellingItems(orders);

    const recommendations = rankedItems
        .map(function (item) {
            let book = null;

            if (item.bookId !== null) {
                book = bookList.find(function (book) {
                    return book.id === item.bookId;
                });
            }

            if (!book) {
                book = bookList.find(function (book) {
                    return book.title === item.title;
                });
            }

            if (!book || book.status !== 'Active') {
                return null;
            }

            return {
                book: book,
                quantitySold: item.quantity
            };
        })
        .filter(function (recommendation) {
            return recommendation !== null;
        })
        .slice(0, 5);

    customerBestSellers.innerHTML = '';

    recommendations.forEach(function (recommendation) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className =
            'list-group-item list-group-item-action ' +
            'd-flex justify-content-between align-items-center';

        const title = document.createElement('span');
        title.textContent = recommendation.book.title;

        const sales = document.createElement('span');
        sales.className = 'badge bg-primary rounded-pill';
        sales.textContent =
            recommendation.quantitySold + ' sold';

        button.append(title, sales);

        button.addEventListener('click', function () {
            openBookDetails(recommendation.book);
        });

        customerBestSellers.appendChild(button);
    });

    customerBestSellersEmpty.classList.toggle(
        'd-none',
        recommendations.length > 0
    );
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
searchFieldSelect.addEventListener('change', renderCatalog);
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

function addBookToCart(bookId, quantityToAdd = 1) {
    const cartItems = loadCartFromStorage();
    const existingItem = cartItems.find(function (item) {
        return item.bookId === bookId;
    });

    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const quantity = currentQuantity + quantityToAdd;
    const error = setCartQuantity(bookId, quantity);

    if (error) {
        showCartToast(error, 'warning');
        return;
    }

    updateCartCount();
    const message = quantityToAdd === 1
        ? 'Book added to your cart.'
        : quantityToAdd + ' copies added to your cart.';

    showCartToast(message, 'success');
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

    const quantity = modalBookQuantity.valueAsNumber;
    const error = getCartQuantityError(currentBook, quantity);

    if (error) {
        refreshCustomerCatalog();
        showCartToast(error, 'warning');
        return;
    }

    saveCheckoutState('buyNow', [{
        bookId: currentBook.id,
        quantity: quantity,
        price: currentBook.price
    }]);

    window.location.href = 'checkout.html';
});

// --- Page refresh and initialization ---

function refreshCustomerCatalog() {
    bookList = loadBooksFromStorage();
    renderCustomerBestSellers();
    populateGenreFilter();
    renderCatalog();

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

populateGenreFilter();
renderCustomerBestSellers();
renderCatalog();
updateCartCount();
