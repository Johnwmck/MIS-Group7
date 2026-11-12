// Favorite books, the navbar Favorites link and count, and the shared heart
// button. Favorites belong to a customer account and are saved by the API, so
// only logged-in customers see the hearts and the Favorites link. Depends on
// customer-accounts.js.

// Favorites saved in this browser before they moved to accounts.
const LEGACY_FAVORITES_STORAGE_KEY = 'savedFavorites';

// --- Loaded favorites ---

// Book IDs for the logged-in customer, in saved order.
let favoriteBookIds = [];
// True once a logged-in customer's favorites have loaded.
let favoritesAvailable = false;
// The load error, if the API could not be reached.
let favoritesLoadError = null;

// Moves favorites saved in this browser into the customer's account, once.
async function importLegacyFavorites() {
    let legacyIds = [];
    try {
        legacyIds = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_STORAGE_KEY)) || [];
    } catch (error) {
        legacyIds = [];
    }

    for (const bookId of legacyIds) {
        if (!Number.isInteger(bookId) || favoriteBookIds.includes(bookId)) continue;
        try {
            favoriteBookIds = await addFavoriteInApi(bookId);
        } catch (error) {
            // Deleted books cannot be favorited; skip them.
        }
    }
    localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
}

async function loadFavorites() {
    favoritesLoadError = null;
    try {
        const customer = await loadCurrentCustomerFromApi();
        favoritesAvailable = Boolean(customer);
        favoriteBookIds = customer ? await loadFavoriteIdsFromApi() : [];
        if (customer && localStorage.getItem(LEGACY_FAVORITES_STORAGE_KEY)) {
            await importLegacyFavorites();
        }
    } catch (error) {
        favoritesAvailable = false;
        favoriteBookIds = [];
        favoritesLoadError = error;
    }
    updateFavoriteDisplays();
}

// Pages that need the list wait on this before reading favoriteBookIds.
let favoritesReady = loadFavorites();

function isFavoriteBook(bookId) {
    return favoriteBookIds.includes(bookId);
}

async function removeFavoriteBook(bookId) {
    favoriteBookIds = await removeFavoriteInApi(bookId);
    updateFavoriteDisplays();
}

async function toggleFavoriteBook(bookId) {
    favoriteBookIds = isFavoriteBook(bookId)
        ? await removeFavoriteInApi(bookId)
        : await addFavoriteInApi(bookId);
}

// --- Reconciliation after catalog changes ---

// Favorites whose books are still in the catalog. The API leaves out deleted
// books too; inactive books stay saved.
function reconcileFavorites(books) {
    return favoriteBookIds.filter(function (bookId) {
        return books.some(function (book) {
            return book.id === bookId;
        });
    });
}

// --- Navbar link and heart buttons ---

const FAVORITE_HEART_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314" />
    </svg>
`;

function showFavoriteButtonState(button, favorite) {
    const title = button.dataset.bookTitle;

    button.hidden = !favoritesAvailable;
    button.classList.toggle('is-favorite', favorite);
    button.setAttribute('aria-pressed', favorite);
    button.setAttribute('aria-label', favorite
        ? 'Remove ' + title + ' from favorites'
        : 'Add ' + title + ' to favorites');
}

// Every heart on the page, the navbar link, and its count follow the loaded list.
function updateFavoriteDisplays() {
    const favoritesCount = document.getElementById('favoritesCount');

    if (favoritesCount) {
        favoritesCount.textContent = favoriteBookIds.length;
    }

    document.querySelectorAll('.site-navbar a[href="favorites.html"]').forEach(function (link) {
        link.classList.toggle('d-none', !favoritesAvailable);
    });

    document.querySelectorAll('.favorite-button').forEach(function (button) {
        showFavoriteButtonState(button, favoriteBookIds.includes(Number(button.dataset.bookId)));
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

    button.addEventListener('click', async function (event) {
        // Book cards open the detail modal on click; the heart must not.
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;

        try {
            await toggleFavoriteBook(book.id);
        } catch (error) {
            // A 401 means the customer logged out elsewhere; reload either way
            // so the hearts match the account.
            await loadFavorites();
        } finally {
            button.disabled = false;
            updateFavoriteDisplays();
        }
    });

    return button;
}

// --- Page initialization ---

// Back/forward can restore an old copy of the page; reload the account's list.
window.addEventListener('pageshow', function (event) {
    if (event.persisted) favoritesReady = loadFavorites();
});
