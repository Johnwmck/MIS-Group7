// Customer favorites list: saved books with add-to-cart and remove actions.

// --- Page state and DOM references ---

const cartCount = document.getElementById('cartCount');
const favoritesMessages = document.getElementById('favoritesMessages');
const favoritesEmptyMessage = document.getElementById('favoritesEmptyMessage');
const favoritesContents = document.getElementById('favoritesContents');
const favoritesTableBody = document.getElementById('favoritesTableBody');
let favoritesBusy = false;

// Add to Cart stays disabled for books that cannot be bought right now.
function setFavoritesBusy(busy) {
    favoritesBusy = busy;
    favoritesTableBody.querySelectorAll('button').forEach(function (button) {
        button.disabled = busy || button.dataset.unavailable === 'true';
    });
}

// --- Favorites feedback and rendering ---

function showFavoritesMessage(message, success = false) {
    favoritesMessages.textContent = message;
    favoritesMessages.classList.toggle('d-none', message.length === 0);
    favoritesMessages.classList.toggle('alert-success', success);
    favoritesMessages.classList.toggle('alert-warning', !success);
}

function createFavoriteRow(book) {
    const row = document.createElement('tr');
    const unavailable = book.status !== 'Active' || isBookOutOfStock(book);

    const bookCell = document.createElement('td');
    const details = document.createElement('div');
    details.className = 'd-flex align-items-center gap-2';
    const cover = document.createElement('img');
    cover.src = book.image;
    cover.alt = book.title;
    cover.width = 40;
    cover.height = 55;
    cover.style.objectFit = 'contain';
    const text = document.createElement('div');
    const title = document.createElement('a');
    title.className = 'd-block';
    title.href = 'book.html?id=' + book.id;
    title.textContent = book.title;
    const author = document.createElement('small');
    author.className = 'text-muted';
    author.textContent = book.author;
    text.append(title, author);
    details.append(cover, text);
    bookCell.appendChild(details);

    const priceCell = document.createElement('td');
    priceCell.textContent = currencyFormatter.format(getBookPrice(book));

    const availabilityCell = document.createElement('td');
    availabilityCell.textContent = getCustomerAvailability(book);
    availabilityCell.classList.toggle('text-danger', unavailable);

    const addCell = document.createElement('td');
    const addButton = document.createElement('button');

    addButton.type = 'button';
    addButton.className = 'btn btn-sm btn-primary';
    addButton.textContent = 'Add to Cart';
    addButton.dataset.unavailable = unavailable;
    addButton.setAttribute('aria-label', 'Add to Cart: ' + book.title);

    addButton.addEventListener('click', function () {
        addFavoriteToCart(book);
    });

    addCell.appendChild(addButton);

    const removeCell = document.createElement('td');
    const removeButton = document.createElement('button');

    removeButton.type = 'button';
    removeButton.className = 'btn btn-sm btn-outline-danger';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', 'Remove ' + book.title);

    removeButton.addEventListener('click', function () {
        if (favoritesBusy) return;
        removeFavoriteBook(book.id);
        renderFavorites();
    });

    removeCell.appendChild(removeButton);

    row.append(bookCell, priceCell, availabilityCell, addCell, removeCell);
    return row;
}

async function renderFavorites() {
    if (favoritesBusy) return;
    setFavoritesBusy(true);
    showFavoritesMessage('Loading favorites...');
    try {
        const books = await loadBooksFromApi();
        const favoriteIds = reconcileFavorites(books);

        updateFavoriteDisplays();
        cartCount.textContent = getCartItemCount(loadCartFromStorage());
        favoritesEmptyMessage.classList.toggle('d-none', favoriteIds.length > 0);
        favoritesContents.classList.toggle('d-none', favoriteIds.length === 0);
        favoritesTableBody.innerHTML = '';

        favoriteIds.forEach(function (bookId) {
            const book = books.find(function (book) {
                return book.id === bookId;
            });

            favoritesTableBody.appendChild(createFavoriteRow(book));
        });

        showFavoritesMessage('');
    } catch (error) {
        favoritesTableBody.innerHTML = '';
        favoritesContents.classList.add('d-none');
        favoritesEmptyMessage.classList.add('d-none');
        showFavoritesMessage('Unable to load your favorites. Your saved favorites are preserved. ' +
            'Check the connection and refresh. ' + error.message);
    } finally {
        setFavoritesBusy(false);
    }
}

// --- Add to Cart ---

async function addFavoriteToCart(book) {
    if (favoritesBusy) return;
    setFavoritesBusy(true);
    try {
        const existingItem = loadCartFromStorage().find(function (item) {
            return item.bookId === book.id;
        });
        const quantity = (existingItem ? existingItem.quantity : 0) + 1;
        const error = await setCartQuantity(book.id, quantity);

        if (error) {
            showFavoritesMessage(error);
            return;
        }

        cartCount.textContent = getCartItemCount(loadCartFromStorage());
        showFavoritesMessage(book.title + ' added to your cart.', true);
    } catch (error) {
        showFavoritesMessage('Unable to update your cart. ' + error.message);
    } finally {
        setFavoritesBusy(false);
    }
}

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        renderFavorites();
    }
});

// --- Page initialization ---

renderFavorites();
