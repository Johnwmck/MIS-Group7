// Customer home page: seasonal promotion banner, Best Sellers, and one carousel
// row per leading genre. Depends on book-cards.js and reporting.js. The full
// catalog is catalog.html.

// --- Page state and DOM references ---

const customerBestSellers = document.getElementById('customerBestSellers');
const customerBestSellersEmpty = document.getElementById('customerBestSellersEmpty');
const bestSellersCarousel = document.getElementById('bestSellersCarousel');
const bestSellersControls = document.getElementById('bestSellersControls');
const genreRows = document.getElementById('genreRows');
const homeLoadMessage = document.getElementById('homeLoadMessage');
const brandHero = document.getElementById('brandHero');
const promoBanner = document.getElementById('promoBanner');
const promoCovers = document.getElementById('promoCovers');
const promoBookCount = document.getElementById('promoBookCount');
const promoPicksSection = document.getElementById('promoPicksSection');
const promoPicks = document.getElementById('promoPicks');
const promoPicksControls = document.getElementById('promoPicksControls');

const BOOKS_PER_ROW = 12;
const BOOKS_PER_SLIDE = 4;
const GENRE_ROW_COUNT = 4;
const PROMO_COVER_COUNT = 5;

let bookList = [];

// --- Carousel rows ---

// One slide per four books. An entry may carry a badge, such as copies sold.
function fillBookCarousel(carouselInner, entries) {
    carouselInner.innerHTML = '';

    for (let start = 0; start < entries.length; start += BOOKS_PER_SLIDE) {
        const slide = document.createElement('div');
        slide.className = 'carousel-item' + (start === 0 ? ' active' : '');

        const row = document.createElement('div');
        row.className = 'row row-cols-2 row-cols-md-4 g-4';

        entries.slice(start, start + BOOKS_PER_SLIDE).forEach(function (entry) {
            const col = createBookCard(entry.book);

            if (entry.badge) {
                const badge = document.createElement('span');

                badge.className = 'badge bg-primary position-absolute top-0 end-0 m-2';
                badge.textContent = entry.badge;
                col.querySelector('.position-relative').appendChild(badge);
            }

            row.appendChild(col);
        });

        slide.appendChild(row);
        carouselInner.appendChild(slide);
    }
}

function createCarouselStep(carouselId, direction, label) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'btn btn-outline-primary carousel-step';
    button.dataset.bsTarget = '#' + carouselId;
    button.dataset.bsSlide = direction;
    button.setAttribute('aria-label', label);
    button.textContent = direction === 'prev' ? '‹' : '›';
    return button;
}

// --- Best Sellers ---

function renderBestSellers(recommendations) {
    fillBookCarousel(customerBestSellers, recommendations.map(function (recommendation) {
        return {
            book: recommendation.book,
            badge: recommendation.quantitySold + ' sold'
        };
    }));

    bestSellersCarousel.classList.toggle('d-none', recommendations.length === 0);
    // A single slide has nowhere to move.
    bestSellersControls.classList.toggle('d-none', recommendations.length <= BOOKS_PER_SLIDE);
    customerBestSellersEmpty.classList.toggle('d-none', recommendations.length > 0);
}

// --- Seasonal promotion ---
// The API decides which books are on sale (salePrice); the banner and its row
// appear only while at least one active book is discounted.

function renderPromotion() {
    const saleBooks = bookList.filter(function (book) {
        return book.status === 'Active' && isBookOnSale(book);
    });
    const promotionActive = saleBooks.length > 0;

    brandHero.classList.toggle('d-none', promotionActive);
    promoBanner.classList.toggle('d-none', !promotionActive);
    promoPicksSection.classList.toggle('d-none', !promotionActive);
    if (!promotionActive) return;

    promoBookCount.textContent = saleBooks.length;

    // Books a customer can buy now lead the row, Horror first for the season.
    const orderedBooks = saleBooks.slice().sort(function (a, b) {
        return isBookOutOfStock(a) - isBookOutOfStock(b) ||
            (b.genre === 'Horror') - (a.genre === 'Horror');
    });

    fillBookCarousel(promoPicks, orderedBooks.map(function (book) {
        return { book: book };
    }));
    promoPicksControls.classList.toggle('d-none', orderedBooks.length <= BOOKS_PER_SLIDE);

    // Covers spread evenly across the sale list so the fan mixes authors.
    const coverCount = Math.min(PROMO_COVER_COUNT, orderedBooks.length);
    const step = coverCount > 1 ? (orderedBooks.length - 1) / (coverCount - 1) : 0;
    const coverBooks = Array.from({ length: coverCount }, function (_, index) {
        return orderedBooks[Math.round(index * step)];
    });

    promoCovers.innerHTML = '';
    coverBooks.forEach(function (book, index) {
        const cover = document.createElement('img');
        cover.className = 'promo-cover';
        cover.src = book.image;
        cover.alt = '';
        const offset = index - (coverBooks.length - 1) / 2;
        cover.style.setProperty('--fan-index', offset);
        cover.style.setProperty('--fan-lift', Math.abs(offset));
        promoCovers.appendChild(cover);
    });
}

// --- Genre rows ---

// The genres with the most books a customer can buy now.
function getLeadingGenres(books) {
    const bookCounts = new Map();

    books.forEach(function (book) {
        bookCounts.set(book.genre, (bookCounts.get(book.genre) || 0) + 1);
    });

    return Array.from(bookCounts.keys()).sort(function (a, b) {
        if (bookCounts.get(a) !== bookCounts.get(b)) {
            return bookCounts.get(b) - bookCounts.get(a);
        }

        return a.localeCompare(b);
    }).slice(0, GENRE_ROW_COUNT);
}

// Standalone books and the first book of each series lead the row, so one
// long series cannot fill it.
function getGenreRowBooks(genre, books) {
    const genreBooks = books.filter(function (book) {
        return book.genre === genre;
    });
    const seriesLeads = new Map();

    function getReadingOrder(book) {
        return book.seriesOrder == null ? Number.MAX_VALUE : book.seriesOrder;
    }

    genreBooks.forEach(function (book) {
        if (!book.seriesName) return;

        const lead = seriesLeads.get(book.seriesName);

        if (!lead || getReadingOrder(book) < getReadingOrder(lead)) {
            seriesLeads.set(book.seriesName, book);
        }
    });

    function leadsRow(book) {
        return !book.seriesName || seriesLeads.get(book.seriesName) === book;
    }

    return genreBooks.filter(leadsRow).concat(genreBooks.filter(function (book) {
        return !leadsRow(book);
    })).slice(0, BOOKS_PER_ROW);
}

function createGenreRow(genre, books, index) {
    const carouselId = 'genreCarousel' + index;
    const headingId = 'genreRowHeading' + index;

    const section = document.createElement('section');
    section.className = 'mb-4';
    section.setAttribute('aria-labelledby', headingId);

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center mb-2';

    const titles = document.createElement('div');
    const heading = document.createElement('h2');
    heading.className = 'h3 mb-0';
    heading.id = headingId;
    heading.textContent = genre;
    const seeAll = document.createElement('a');
    seeAll.className = 'small';
    seeAll.href = 'catalog.html?genre=' + encodeURIComponent(genre);
    seeAll.textContent = 'See all ' + genre;
    titles.append(heading, seeAll);
    header.appendChild(titles);

    // A single slide has nowhere to move.
    if (books.length > BOOKS_PER_SLIDE) {
        const controls = document.createElement('div');

        controls.append(
            createCarouselStep(carouselId, 'prev', 'Previous ' + genre + ' books'),
            createCarouselStep(carouselId, 'next', 'Next ' + genre + ' books')
        );
        header.appendChild(controls);
    }

    const carousel = document.createElement('div');
    carousel.id = carouselId;
    carousel.className = 'carousel slide book-row-carousel';
    carousel.dataset.bsInterval = 'false';
    carousel.setAttribute('aria-label', genre + ' books');

    const carouselInner = document.createElement('div');
    carouselInner.className = 'carousel-inner book-grid';
    fillBookCarousel(carouselInner, books.map(function (book) {
        return { book: book };
    }));
    carousel.appendChild(carouselInner);

    section.append(header, carousel);
    return section;
}

function renderGenreRows() {
    const sellableBooks = bookList.filter(function (book) {
        return book.status === 'Active' && !isBookOutOfStock(book);
    });

    genreRows.innerHTML = '';

    getLeadingGenres(sellableBooks).forEach(function (genre, index) {
        genreRows.appendChild(createGenreRow(genre, getGenreRowBooks(genre, sellableBooks), index));
    });
}

// --- Page refresh and initialization ---

async function refreshHomePage() {
    if (customerBusy) {
        return;
    }
    setCustomerBusy(true);
    homeLoadMessage.textContent = 'Loading books...';
    homeLoadMessage.classList.remove('d-none', 'alert-danger');
    homeLoadMessage.classList.add('alert-info');

    renderBestSellers([]);
    customerBestSellersEmpty.textContent = 'Loading Best Sellers...';

    try {
        bookList = await loadBooksFromApi();
        const reconciliation = await reconcileCart(bookList);
        if (reconciliation.messages.length > 0) {
            showCartToast(reconciliation.messages.join(' '), 'warning');
        }

        reconcileFavorites(bookList);
        updateFavoriteDisplays();

        renderPromotion();
        renderGenreRows();
        try {
            renderBestSellers(getCustomerBestSellers(
                await loadOrdersFromApi(), bookList, BOOKS_PER_ROW
            ));
            customerBestSellersEmpty.textContent = 'No best-selling books are available yet.';
        } catch (error) {
            renderBestSellers([]);
            customerBestSellersEmpty.textContent = 'Unable to load Best Sellers. Refresh to retry.';
        }

        homeLoadMessage.textContent = '';
        homeLoadMessage.classList.add('d-none');
    } catch (error) {
        bookList = [];
        renderPromotion();
        genreRows.innerHTML = '';
        renderBestSellers([]);
        customerBestSellersEmpty.textContent = 'Best Sellers are unavailable right now.';

        homeLoadMessage.textContent =
            'Unable to load books. Check that the API is running, then refresh.';

        homeLoadMessage.classList.remove('d-none', 'alert-info');
        homeLoadMessage.classList.add('alert-danger');

        console.error(error);
    } finally {
        setCustomerBusy(false);
    }
}

window.addEventListener('pageshow', async function () {
    await refreshHomePage();

    updateCartCount();
});
