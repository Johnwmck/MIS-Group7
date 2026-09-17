// Customer display, search, filter, etc. Updating what the customer sees.

const bookContainer = document.getElementById('bookContainer');

const bookList = loadBooksFromStorage();

let selectedBook = null;

let cart = [];

function createBookCard(book) {
    const col = document.createElement('div');
    col.className = "col";
    col.dataset.title = book.title.toLowerCase();
    col.dataset.author = book.author.toLowerCase();
    col.dataset.genre = book.genre.toLowerCase();

    const outOfStock = isBookOutOfStock(book);

    col.innerHTML = `
        <div class="card h-100${outOfStock ? ' out-of-stock' : ''}" role="button" data-bs-toggle="modal" data-bs-target="#bookModal">
            <div class="position-relative">
                <img src="${book.image}" class="card-img-top" alt="${book.title}">
                ${outOfStock ? '<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>' : ''}
            </div>
            <div class="card-body">
                <h5 class="card-title">${book.title}</h5>
                <p class="card-text mb-1">${book.author}</p>
                <p class="card-text fw-bold">${currencyFormatter.format(book.price)}</p>
            </div>
        </div>
    `;

    col.querySelector('.card').addEventListener('click', function () {
        selectedBook = book;
        updateBookModal(book)
    });

    bookContainer.appendChild(col);
}

function updateBookModal(book) {
    document.getElementById('modalBookTitle').textContent = book.title;
    document.getElementById('modalBookImage').src = book.image;
    document.getElementById('modalBookImage').alt = book.title;
    document.getElementById('modalBookAuthor').textContent = "Author: " + book.author;
    document.getElementById('modalBookGenre').textContent = "Genre: " + book.genre;
    document.getElementById('modalBookPrice').textContent = "Price: " + (currencyFormatter.format(book.price));

    const bookOutOfStock = isBookOutOfStock(book);
    const inventoryText = document.getElementById('modalBookInventory');
    inventoryText.textContent = bookOutOfStock ? "Out of stock" : "In stock: " + book.inventory;
    inventoryText.classList.toggle('text-danger', bookOutOfStock);

    document.getElementById('addToCartButton').disabled = bookOutOfStock;
    document.getElementById('buyNowButton').disabled = bookOutOfStock;
}


function renderCatalog() {
    bookContainer.innerHTML = "";
    for (let i = 0; i < bookList.length; i++) {
        if (bookList[i].status === "Active") {
            createBookCard(bookList[i]);
        }
    }
}

const searchFieldSelect = document.getElementById('searchFieldSelect');
const searchInput = document.getElementById('searchInput');

function applySearchFilter() {
    const field = searchFieldSelect.value;
    const query = searchInput.value.trim().toLowerCase();
    Array.from(bookContainer.children).forEach(function (col) {
        col.classList.toggle('d-none', !col.dataset[field].includes(query));
    });
}

searchInput.addEventListener('input', applySearchFilter);
searchFieldSelect.addEventListener('change', applySearchFilter);



function purchaseCart(cart) {
    for (let i = cart.length - 1; i >= 0; i--) {
        const selection = cart[i];
        if (selection.inventory > 0) {
            selection.inventory -= 1;
            console.log("Purchased: " + selection.title + ". Remaining inventory: " + selection.inventory);
            cart.splice(i, 1);
        }
        else {
            console.log("Sorry, " + selection.title + " is out of stock.");
        }
    }
    renderCart();
    renderCatalog();
    saveBooksToStorage(bookList)
    if (selectedBook != null) {
        updateBookModal(selectedBook)
    }
}

const cartItemsContainer = document.getElementById("cartItems");
const cartEmptyMessage = document.getElementById("cartEmptyMessage");
const cartTotal = document.getElementById("cartTotal");
const checkoutButton = document.getElementById("checkoutButton");

function groupCart(cartItemsList) {
    const grouped = [];
    cartItemsList.forEach(function (book) {
        const existing = grouped.find(function (item) { return item.book.id === book.id; });
        if (existing) {
            existing.quantity += 1;
        } else {
            grouped.push({ book: book, quantity: 1 });
        }
    });
    return grouped;
}

function saveOrder(cartItemsList) {
    const grouped = groupCart(cartItemsList);
    const items = grouped.map(function (item) {
        return {
            bookId: item.book.id,
            title: item.book.title,
            price: item.book.price,
            quantity: item.quantity
        };
    });
    const total = items.reduce(function (sum, item) {
        return sum + item.price * item.quantity;
    }, 0);

    const order = {
        id: Date.now(),
        date: new Date().toISOString(),
        items: items,
        total: total
    };

    const orders = loadOrdersFromStorage();
    orders.push(order);
    saveOrdersToStorage(orders);
}

const cartToastEl = document.getElementById("cartToast");
const cartToastBody = document.getElementById("cartToastBody");
const cartToast = new bootstrap.Toast(cartToastEl);

function showCartToast(message, variant) {
    cartToastEl.classList.remove("text-bg-warning", "text-bg-success");
    cartToastEl.classList.add(variant === "success" ? "text-bg-success" : "text-bg-warning");
    cartToastBody.textContent = message;
    cartToast.show();
}

const checkoutConfirmModalEl = document.getElementById("checkoutConfirmModal");
const checkoutConfirmModal = new bootstrap.Modal(checkoutConfirmModalEl);
const checkoutSummaryItems = document.getElementById("checkoutSummaryItems");
const checkoutSummaryTotal = document.getElementById("checkoutSummaryTotal");
const confirmCheckoutButton = document.getElementById("confirmCheckoutButton");

checkoutButton.addEventListener("click", function () {
    const grouped = groupCart(cart);
    let total = 0;
    checkoutSummaryItems.innerHTML = grouped.map(function (item) {
        total += item.book.price * item.quantity;
        return `<div class="d-flex justify-content-between">
            <span>${item.book.title}${item.quantity > 1 ? " x" + item.quantity : ""}</span>
            <span>${currencyFormatter.format(item.book.price * item.quantity)}</span>
        </div>`;
    }).join("");
    checkoutSummaryTotal.textContent = "Total: " + currencyFormatter.format(total);
    checkoutConfirmModal.show();
});

confirmCheckoutButton.addEventListener("click", function () {
    saveOrder(cart);
    purchaseCart(cart);
    checkoutConfirmModal.hide();
    showCartToast("Order placed! Thank you for shopping with Team 7 Books.", "success");
});

function renderCart() {
    cartItemsContainer.innerHTML = "";

    if (cart.length === 0) {
        cartEmptyMessage.classList.remove("d-none");
        cartTotal.classList.add("d-none");
        checkoutButton.classList.add("d-none");
        return;
    }

    cartEmptyMessage.classList.add("d-none");
    cartTotal.classList.remove("d-none");
    checkoutButton.classList.remove("d-none");

    const grouped = groupCart(cart);

    let total = 0;
    grouped.forEach(function (item) {
        total += item.book.price * item.quantity;

        const row = document.createElement("div");
        row.className = "d-flex justify-content-between align-items-center mb-2";
        row.innerHTML = `
            <div class="d-flex align-items-center">
                <img src="${item.book.image}" alt="${item.book.title}" class="me-2" style="width: 40px; height: 55px; object-fit: contain;">
                <div>
                    <div>${item.book.title}${item.quantity > 1 ? " x" + item.quantity : ""}</div>
                    <small class="text-muted">${currencyFormatter.format(item.book.price)} each</small>
                </div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" data-id="${item.book.id}">Remove</button>
        `;
        row.querySelector("button").addEventListener("click", function () {
            const index = cart.findIndex(function (b) { return b.id === item.book.id; });
            if (index !== -1) {
                cart.splice(index, 1);
                renderCart();
            }
        });
        cartItemsContainer.appendChild(row);
    });

    cartTotal.textContent = "Total: " + currencyFormatter.format(total);
}

const addToCartButton = document.getElementById("addToCartButton");

addToCartButton.addEventListener("click", function () {
    const cartChecker = cart.filter(function (book) {
        return book.id === selectedBook.id
    });

    const quantityInCart = cartChecker.length;


    if (quantityInCart < selectedBook.inventory) {
        cart.push(selectedBook);
        console.log("Book added to cart: " + selectedBook.title + " with quantity: " + (selectedBook.inventory - quantityInCart));
        renderCart();
        showCartToast("\"" + selectedBook.title + "\" was added to your cart.", "success");
    }
    else {
        console.log(selectedBook.title + " not added to cart because cart quantity would go over " + selectedBook.inventory + " . Cart has " + quantityInCart + ".")
        showCartToast("You already have all " + selectedBook.inventory + " available copies of \"" + selectedBook.title + "\" in your cart.", "warning");
    }
});

const buyNowButton = document.getElementById("buyNowButton");
buyNowButton.addEventListener("click", function () {
    const cartChecker = cart.filter(function (book) {
        return book.id === selectedBook.id
    });

    const quantityInCart = cartChecker.length;

    if (selectedBook.inventory > 0 && quantityInCart >= selectedBook.inventory) {
        const index = cart.findIndex(function (b) { return b.id === selectedBook.id; });
        if (index !== -1) {
            cart.splice(index, 1);
            renderCart();
        }
        console.log("Book bought now: " + selectedBook.title + " with quantity: " + selectedBook.inventory + ". One copy removed from cart to compensate!");
        selectedBook.inventory -= 1;
        saveBooksToStorage(bookList)
        renderCatalog()
        updateBookModal(selectedBook)
        showCartToast("\"" + selectedBook.title + "\" was purchased. One copy was removed from your cart to keep it within the remaining inventory.", "success");
    }
    else if (selectedBook.inventory > 0) {
        console.log("Book bought now: " + selectedBook.title + " with quantity: " + selectedBook.inventory);
        selectedBook.inventory -= 1;
        renderCart();
        saveBooksToStorage(bookList)
        renderCatalog()
        updateBookModal(selectedBook)
        showCartToast("\"" + selectedBook.title + "\" was purchased successfully.", "success");
    }

    else {
        console.log("Sorry, " + selectedBook.title + " is out of stock.");
    }

});

renderCatalog();

const resetCatalogButton = document.getElementById("resetCatalogButton");

resetCatalogButton.addEventListener("click", function () {
    localStorage.removeItem("savedBooks");
    location.reload();
});
