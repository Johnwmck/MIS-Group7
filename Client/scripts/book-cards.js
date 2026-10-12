// Shared customer book cards and their cart actions, used by the home page
// carousels and the catalog page. Depends on book-utils.js, api.js,
// cart-state.js, favorites-state.js, and Bootstrap (toasts).

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
        if (event.target.closest('.quick-add-button, .favorite-button')) {
            return;
        }

        openBookDetails(book);
    });

    const favoriteButton = createFavoriteButton(book);
    favoriteButton.classList.add('position-absolute', 'top-0', 'start-0', 'm-2');
    col.querySelector('.position-relative').appendChild(favoriteButton);

    const quickAddButton = col.querySelector('.quick-add-button');
    // Remembered so the button stays off after a busy period ends.
    quickAddButton.dataset.outOfStock = outOfStock;

    quickAddButton.addEventListener('click', function (event) {
        event.stopPropagation();
        addBookToCart(book.id);
    });

    return col;
}

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

// Every card on the page waits while one cart change is checked with the API.
function setCustomerBusy(busy) {
    customerBusy = busy;
    document.querySelectorAll('.quick-add-button').forEach(function (button) {
        button.disabled = busy || button.dataset.outOfStock === 'true';
    });
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
