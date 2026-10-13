// Shared internal table paging. Filter before slicing; page changes never
// mutate catalog data, so row actions retain the displayed book revisions.
function createInventoryPager(getBooks, getQuery, isBusy, onChange, table) {
    const size = 32;
    let page = 1;
    let genreOptions = '';
    const filters = document.createElement('div');
    filters.className = 'row g-2 mb-3';
    filters.innerHTML = `
        <div class="col-sm-6">
            <label class="form-label" for="inventoryGenreFilter">Genre</label>
            <select id="inventoryGenreFilter" class="form-select"><option value="">All genres</option></select>
        </div>
        <div class="col-sm-6">
            <label class="form-label" for="inventorySort">Sort by</label>
            <select id="inventorySort" class="form-select">
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
                <option value="author-asc">Author A–Z</option>
                <option value="price-asc">Regular price low–high</option>
                <option value="price-desc">Regular price high–low</option>
                <option value="inventory-asc">Inventory low–high</option>
                <option value="inventory-desc">Inventory high–low</option>
            </select>
        </div>`;
    table.closest('.table-responsive').before(filters);
    const genre = filters.querySelector('#inventoryGenreFilter');
    const sort = filters.querySelector('#inventorySort');
    for (const select of [genre, sort]) select.addEventListener('change', () => { page = 1; onChange(); });
    const controls = document.createElement('div');
    controls.className = 'd-flex flex-wrap justify-content-between align-items-center gap-2 my-3';
    controls.setAttribute('aria-label', 'Inventory pagination');
    const summary = document.createElement('span');
    summary.setAttribute('aria-live', 'polite');
    const previous = document.createElement('button');
    const next = document.createElement('button');
    for (const button of [previous, next]) {
        button.type = 'button';
        button.className = 'btn btn-outline-primary btn-sm';
    }
    previous.textContent = 'Previous';
    next.textContent = 'Next';
    controls.append(summary, previous, next);
    table.closest('.table-responsive').after(controls);
    previous.addEventListener('click', () => { if (!isBusy() && page > 1) { page--; onChange(); } });
    next.addEventListener('click', () => { if (!isBusy()) { page++; onChange(); } });
    return {
        reset() { page = 1; },
        getVisibleBooks() {
            const query = getQuery().trim().toLowerCase();
            const books = getBooks();
            const genres = [...new Set(books.map(book => book.genre))].sort((a, b) => a.localeCompare(b));
            if (genreOptions !== JSON.stringify(genres)) {
                genreOptions = JSON.stringify(genres);
                const selected = genre.value;
                genre.replaceChildren(new Option('All genres', ''));
                genres.forEach(value => genre.appendChild(new Option(value, value)));
                genre.value = genres.includes(selected) ? selected : '';
            }
            genre.disabled = isBusy();
            sort.disabled = isBusy();
            const matching = books.filter(book =>
                (!genre.value || book.genre === genre.value) &&
                ['title', 'author', 'genre', 'isbn'].some(field =>
                    String(book[field] || '').toLowerCase().includes(query))
            ).sort((a, b) => {
                let order;
                switch (sort.value) {
                    case 'title-desc': order = b.title.localeCompare(a.title); break;
                    case 'author-asc': order = a.author.localeCompare(b.author); break;
                    case 'price-asc': order = a.price - b.price; break;
                    case 'price-desc': order = b.price - a.price; break;
                    case 'inventory-asc': order = a.inventory - b.inventory; break;
                    case 'inventory-desc': order = b.inventory - a.inventory; break;
                    default: order = a.title.localeCompare(b.title);
                }
                return order || a.title.localeCompare(b.title) || a.id - b.id;
            });
            const pages = Math.max(1, Math.ceil(matching.length / size));
            page = Math.min(Math.max(1, page), pages);
            const start = (page - 1) * size;
            summary.textContent = matching.length
                ? 'Showing ' + (start + 1) + '–' + Math.min(start + size, matching.length) +
                    ' of ' + matching.length + ' books (page ' + page + ' of ' + pages + ')'
                : 'Showing 0 of 0 matching books';
            previous.disabled = isBusy() || page === 1;
            next.disabled = isBusy() || page === pages;
            return matching.slice(start, start + size);
        }
    };
}
