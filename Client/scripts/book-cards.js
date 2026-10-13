// Shared customer book tiles (cover, title, author, price) and the cart
// feedback helpers, used by the home page carousels and the catalog page.
// Depends on book-utils.js, api.js, cart-state.js, favorites-state.js, and
// Bootstrap (toasts).

// --- Shared busy state ---

let customerBusy = false;

// --- Book cards ---

// Details, quantity, and Buy Now live on the book page.
function openBookDetails(book) {
    window.location.href = 'book.html?id=' + book.id;
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
                ${isBookOnSale(book)
            ? '<span class="badge promo-badge position-absolute bottom-0 start-0 m-2">10% off</span>'
            : ''}
            </div>
            <div class="card-body">
                <h3 class="card-title h6">${book.title}</h3>
                <p class="card-text book-author">${book.author}</p>
                <p class="card-text fw-bold">${formatBookPriceHtml(book)}</p>
            </div>
        </div>
    `;

    col.querySelector('.card').addEventListener('click', function (event) {
        if (event.target.closest('.favorite-button')) {
            return;
        }

        openBookDetails(book);
    });

    const favoriteButton = createFavoriteButton(book);
    favoriteButton.classList.add('position-absolute', 'top-0', 'start-0', 'm-2');
    col.querySelector('.position-relative').appendChild(favoriteButton);

    return col;
}

// --- Cart feedback ---

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

// Set while a page loads books or checks the cart with the API, so a second
// refresh waits its turn.
function setCustomerBusy(busy) {
    customerBusy = busy;
}
