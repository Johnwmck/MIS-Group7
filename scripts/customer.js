// Customer display, search, filter, etc. Updating what the customer sees.

const bookContainer = document.getElementById('bookContainer');

const bookList = loadBooksFromStorage();



function createBookCard(book) {
    const col = document.createElement('div');
    col.className = "col";

    col.innerHTML = `
        <div class="card h-100" role="button" data-bs-toggle="modal" data-bs-target="#bookModal">
            <img src="${book.image}" class="card-img-top" alt="${book.title}">
            <div class="card-body">
                <h5 class="card-title">${book.title}</h5>
                <p class="card-text">${book.author}</p>
            </div>
        </div>
    `;

    col.querySelector('.card').addEventListener('click', function () {
        document.getElementById('modalBookTitle').textContent = book.title;
        document.getElementById('modalBookImage').src = book.image;
        document.getElementById('modalBookImage').alt = book.title;
        document.getElementById('modalBookAuthor').textContent = "Author: " + book.author;
        document.getElementById('modalBookGenre').textContent = "Genre: " + book.genre;
        document.getElementById('modalBookPrice').textContent = "Price: " + (currencyFormatter.format(book.price));
        document.getElementById('modalBookInventory').textContent = "In stock: " + book.inventory;
    });

    bookContainer.appendChild(col);
}


for (let i = 0; i < bookList.length; i++) {
    if (bookList[i].status === "Active") {
        createBookCard(bookList[i]);
    }
}

const resetCatalogButton = document.getElementById("resetCatalogButton");

resetCatalogButton.addEventListener("click", function () {
    localStorage.removeItem("savedBooks");
    location.reload();
});