// Shared customer-page footer: brand, shop links, customer service details,
// and staff login. Fills <footer id="siteFooter"> so every customer page
// shows the same footer from one copy of the markup.

function renderSiteFooter() {
    const footer = document.getElementById('siteFooter');

    if (!footer) {
        return;
    }

    footer.innerHTML = `
        <div class="container py-5">
            <div class="row g-4">
                <div class="col-12 col-lg-4">
                    <a class="navbar-brand mb-3" href="index.html">
                        <img src="images/logo.jpg" alt="Team 7 Books" class="navbar-logo">
                    </a>
                    <p class="mb-0">
                        Curated fiction, nonfiction, and everything between,
                        from a small independent bookstore.
                    </p>
                </div>

                <nav class="col-6 col-md-4 col-lg-2" aria-label="Shop">
                    <h2 class="site-footer-heading">Shop</h2>
                    <ul class="list-unstyled site-footer-links mb-0">
                        <li><a href="index.html">Home</a></li>
                        <li><a href="catalog.html">Catalog</a></li>
                        <li><a href="favorites.html">Favorites</a></li>
                        <li><a href="cart.html">Cart</a></li>
                    </ul>
                </nav>

                <div class="col-6 col-md-4 col-lg-4">
                    <h2 class="site-footer-heading">Customer Service</h2>
                    <ul class="list-unstyled site-footer-links mb-0">
                        <li><a href="mailto:help@team7books.example">help@team7books.example</a></li>
                        <li><a href="tel:+12055550107">(205) 555-0107</a></li>
                        <li class="small text-muted">Demo contact information; not a live support service.</li>
                    </ul>
                </div>

                <nav class="col-12 col-md-4 col-lg-2" aria-label="Staff">
                    <h2 class="site-footer-heading">Staff</h2>
                    <ul class="list-unstyled site-footer-links mb-0">
                        <li><a href="login.html">Internal Login</a></li>
                    </ul>
                </nav>
            </div>
        </div>

        <div class="site-footer-bottom">
            <div class="container d-flex flex-column flex-md-row justify-content-between gap-1 py-3">
                <span>&copy; ${new Date().getFullYear()} Team 7 Books. All rights reserved.</span>
                <span>Demo prototype &mdash; no real orders or payments are processed.</span>
            </div>
        </div>
    `;
}

renderSiteFooter();
