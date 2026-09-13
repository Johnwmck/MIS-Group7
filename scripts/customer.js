// Customer display, search, filter, etc. Updating what the customer sees.

const bookContainer = document.getElementById('bookContainer');

const bookList = loadBooksFromStorage();

function createBookCard(book) {
    const bookCard = document.createElement('div');
    bookCard.className = "bookCard";
    bookCard.innerHTML = `
        <p>${book.title}</p>
        <p>${book.author}</p>
        <p>${book.genre}</p>
        <p>${book.price}</p>
        <p>${book.status}</p>
        <br>
    `;
    bookContainer.appendChild(bookCard);
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