// Customer catalog page: search, filters, sorting, and pages of book cards.
// Depends on book-cards.js for the cards and their cart actions.

// --- Page state and primary DOM references ---

const bookContainer = document.getElementById('bookContainer');
const catalogLoadMessage = document.getElementById('catalogLoadMessage');

// Eight rows of four on a desktop-width catalog.
const CATALOG_PAGE_SIZE = 32;

let bookList = [];

// --- Catalog search, filtering, and sorting ---

const searchInput = document.getElementById('searchInput');
const genreFilterSelect = document.getElementById('genreFilterSelect');
const sortSelect = document.getElementById('sortSelect');
const catalogEmptyMessage = document.getElementById('catalogEmptyMessage');

// --- Catalog view in the address ---
// Search, genre, sort, and page live in the address so Back from a book
// returns to the same view, and the home page can link to a genre or a search.

const catalogParams = new URLSearchParams(window.location.search);

let catalogPage = parseInt(catalogParams.get('page'), 10) || 1;
// Genre options arrive with the catalog, so the requested genre is applied then.
let requestedGenre = catalogParams.get('genre') || '';

searchInput.value = catalogParams.get('search') || '';

if (Array.from(sortSelect.options).some(function (option) {
    return option.value === catalogParams.get('sort');
})) {
    sortSelect.value = catalogParams.get('sort');
}

function saveCatalogView() {
    const url = new URL(window.location.href);
    const view = {
        search: searchInput.value.trim(),
        genre: genreFilterSelect.value,
        sort: sortSelect.value,
        page: catalogPage > 1 ? String(catalogPage) : ''
    };

    Object.keys(view).forEach(function (name) {
        if (view[name]) {
            url.searchParams.set(name, view[name]);
        } else {
            url.searchParams.delete(name);
        }
    });

    history.replaceState(null, '', url);
}

function populateGenreFilter() {
    const previousGenre = genreFilterSelect.value || requestedGenre;
    requestedGenre = '';

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
    const selectedSort = sortSelect.value || 'title-asc';

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
            return getBookPrice(a) - getBookPrice(b);
        });
    } else if (selectedSort === 'price-desc') {
        visibleBooks.sort(function (a, b) {
            return getBookPrice(b) - getBookPrice(a);
        });
    }

    return visibleBooks;
}

// --- Catalog pages ---

const catalogPagination = document.getElementById('catalogPagination');
const catalogPageSummary = document.getElementById('catalogPageSummary');

// First, last, and the pages around the open one; null marks a gap.
function getCatalogPageNumbers(pageCount) {
    const pages = [];

    for (let page = 1; page <= pageCount; page += 1) {
        if (page === 1 || page === pageCount || Math.abs(page - catalogPage) <= 2) {
            pages.push(page);
        } else if (pages[pages.length - 1] !== null) {
            pages.push(null);
        }
    }

    return pages;
}

function createCatalogPageItem(label, page, enabled, ariaLabel) {
    const item = document.createElement('li');
    item.className = 'page-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-link';
    button.textContent = label;
    button.disabled = !enabled;

    if (ariaLabel) {
        button.setAttribute('aria-label', ariaLabel);
    }

    if (page === catalogPage) {
        item.classList.add('active');
        button.setAttribute('aria-current', 'page');
    } else if (!enabled) {
        item.classList.add('disabled');
    }

    button.addEventListener('click', function () {
        showCatalogPage(page);
    });

    item.appendChild(button);
    return item;
}

function renderCatalogPagination(bookCount, pageCount) {
    const firstBook = (catalogPage - 1) * CATALOG_PAGE_SIZE + 1;
    const lastBook = Math.min(catalogPage * CATALOG_PAGE_SIZE, bookCount);

    catalogPageSummary.textContent = bookCount === 0
        ? ''
        : 'Showing ' + firstBook + '–' + lastBook + ' of ' + bookCount + ' books';
    catalogPagination.innerHTML = '';

    // One page needs no controls.
    if (pageCount <= 1) {
        return;
    }

    catalogPagination.appendChild(
        createCatalogPageItem('Previous', catalogPage - 1, catalogPage > 1, 'Previous page')
    );

    getCatalogPageNumbers(pageCount).forEach(function (page) {
        catalogPagination.appendChild(page === null
            ? createCatalogPageItem('…', null, false)
            : createCatalogPageItem(String(page), page, true, 'Page ' + page));
    });

    catalogPagination.appendChild(
        createCatalogPageItem('Next', catalogPage + 1, catalogPage < pageCount, 'Next page')
    );
}

// --- Catalog rendering and filter events ---

function renderCatalog() {
    const visibleBooks = getVisibleCatalogBooks();
    const pageCount = Math.max(1, Math.ceil(visibleBooks.length / CATALOG_PAGE_SIZE));

    // Filters and catalog changes can leave the open page past the end.
    catalogPage = Math.min(Math.max(1, catalogPage), pageCount);
    saveCatalogView();

    const firstIndex = (catalogPage - 1) * CATALOG_PAGE_SIZE;

    bookContainer.innerHTML = '';

    visibleBooks.slice(firstIndex, firstIndex + CATALOG_PAGE_SIZE).forEach(function (book) {
        bookContainer.appendChild(createBookCard(book));
    });

    catalogEmptyMessage.classList.toggle(
        'd-none',
        visibleBooks.length > 0
    );

    renderCatalogPagination(visibleBooks.length, pageCount);
}

function showCatalogPage(page) {
    catalogPage = page;
    renderCatalog();
    document.getElementById('catalogHeading').scrollIntoView();
}

// A new search, filter, or sort starts again from the first page.
function restartCatalog() {
    catalogPage = 1;
    renderCatalog();
}

searchInput.addEventListener('input', restartCatalog);
genreFilterSelect.addEventListener('change', restartCatalog);
sortSelect.addEventListener('change', restartCatalog);

// --- Page refresh and initialization ---

async function refreshCustomerCatalog() {
    if (customerBusy) {
        return;
    }
    setCustomerBusy(true);
    catalogLoadMessage.textContent = 'Loading catalog...';
    catalogLoadMessage.classList.remove('d-none', 'alert-danger');
    catalogLoadMessage.classList.add('alert-info');
    catalogEmptyMessage.classList.add('d-none');

    try {
        bookList = await loadBooksFromApi();
        const reconciliation = await reconcileCart(bookList);
        if (reconciliation.messages.length > 0) {
            showCartToast(reconciliation.messages.join(' '), 'warning');
        }

        reconcileFavorites(bookList);
        updateFavoriteDisplays();

        populateGenreFilter();
        renderCatalog();

        catalogLoadMessage.textContent = '';
        catalogLoadMessage.classList.add('d-none');
    } catch (error) {
        bookList = [];
        bookContainer.innerHTML = '';
        catalogEmptyMessage.classList.add('d-none');
        renderCatalogPagination(0, 1);

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
