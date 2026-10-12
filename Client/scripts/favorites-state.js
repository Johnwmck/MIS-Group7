// Saved favorite books, the navbar favorites count, and the shared heart button.
// Favorites stay in this browser, like cart selections.

const FAVORITES_STORAGE_KEY = 'savedFavorites';

// --- Saved favorites ---

// Favorites store book IDs only; current book details come from the catalog.
function loadFavoritesFromStorage() {
    return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || [];
}

function saveFavoritesToStorage(bookIds) {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(bookIds));
}

function isFavoriteBook(bookId) {
    return loadFavoritesFromStorage().includes(bookId);
}

function removeFavoriteBook(bookId) {
    const remainingIds = loadFavoritesFromStorage().filter(function (id) {
        return id !== bookId;
    });

    saveFavoritesToStorage(remainingIds);
}

function toggleFavoriteBook(bookId) {
    if (isFavoriteBook(bookId)) {
        removeFavoriteBook(bookId);
        return;
    }

    const bookIds = loadFavoritesFromStorage();
    bookIds.push(bookId);
    saveFavoritesToStorage(bookIds);
}

// --- Reconciliation after catalog changes ---

// Drop favorites whose books were deleted. Inactive books stay saved.
function reconcileFavorites(books) {
    const bookIds = loadFavoritesFromStorage();
    const remainingIds = bookIds.filter(function (bookId) {
        return books.some(function (book) {
            return book.id === bookId;
        });
    });

    if (remainingIds.length !== bookIds.length) {
        saveFavoritesToStorage(remainingIds);
    }

    return remainingIds;
}

// --- Navbar count and heart buttons ---

const FAVORITE_HEART_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314" />
    </svg>
`;

function showFavoriteButtonState(button, favorite) {
    const title = button.dataset.bookTitle;

    button.classList.toggle('is-favorite', favorite);
    button.setAttribute('aria-pressed', favorite);
    button.setAttribute('aria-label', favorite
        ? 'Remove ' + title + ' from favorites'
        : 'Add ' + title + ' to favorites');
}

// Reread storage so every heart on the page and the navbar count agree.
function updateFavoriteDisplays() {
    const bookIds = loadFavoritesFromStorage();
    const favoritesCount = document.getElementById('favoritesCount');

    if (favoritesCount) {
        favoritesCount.textContent = bookIds.length;
    }

    document.querySelectorAll('.favorite-button').forEach(function (button) {
        showFavoriteButtonState(button, bookIds.includes(Number(button.dataset.bookId)));
    });
}

function createFavoriteButton(book) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'favorite-button';
    button.dataset.bookId = book.id;
    button.dataset.bookTitle = book.title;
    button.innerHTML = FAVORITE_HEART_ICON;
    showFavoriteButtonState(button, isFavoriteBook(book.id));

    button.addEventListener('click', function (event) {
        // Book cards open the detail modal on click; the heart must not.
        event.stopPropagation();
        toggleFavoriteBook(book.id);
        updateFavoriteDisplays();
    });

    return button;
}

// --- Page initialization ---

window.addEventListener('pageshow', updateFavoriteDisplays);

// Another tab changed the list.
window.addEventListener('storage', function (event) {
    if (event.key === FAVORITES_STORAGE_KEY) {
        updateFavoriteDisplays();
    }
});
