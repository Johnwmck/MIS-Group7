// API-backed checkout review and server order submission.

// --- Page state and DOM references ---

const checkoutBackLink = document.getElementById('checkoutBackLink');
const checkoutMessage = document.getElementById('checkoutMessage');
const checkoutContent = document.getElementById('checkoutContent');
const checkoutForm = document.getElementById('checkoutForm');
const placeOrderButton = document.getElementById('placeOrderButton');
const checkoutItems = document.getElementById('checkoutItems');
const orderConfirmation = document.getElementById('orderConfirmation');
const paymentMethodGroup = document.getElementById('paymentMethodGroup');
const paymentMethodSelect = document.getElementById('paymentMethodSelect');
const newCardFields = document.getElementById('newCardFields');
const cardNameInput = document.getElementById('cardNameInput');
const cardNumberInput = document.getElementById('cardNumberInput');
const cardMonthSelect = document.getElementById('cardMonthSelect');
const cardYearSelect = document.getElementById('cardYearSelect');
const saveCardGroup = document.getElementById('saveCardGroup');
const saveCardInput = document.getElementById('saveCardInput');
const manageCardsLink = document.getElementById('manageCardsLink');
const guestPaymentNote = document.getElementById('guestPaymentNote');
// The saved-card list's last choice, for entering a different card.
const NEW_CARD_CHOICE = 'new';

let checkoutState = loadCheckoutState();
// The logged-in customer, or null for guest checkout.
let checkoutCustomer = null;
let checkoutBusy = false;
let checkoutReady = false;
let purchaseUncertain = sessionStorage.getItem('purchaseUncertain') === 'true';
let checkoutQuote = null;
const rewardsSelect = document.getElementById('rewardsSelect');
const retryPurchaseButton = document.getElementById('retryPurchaseButton');
retryPurchaseButton.hidden = !sessionStorage.getItem('pendingPurchase');
async function loadCheckoutQuote() {
    const response = await fetch('/api/orders/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: checkoutState.items, redeemPoints: Number(rewardsSelect.value) || 0 }) });
    const quote = await response.json();
    if (!response.ok) throw new Error(quote.error || 'Unable to price checkout.');
    checkoutQuote = quote;
    const chosen = Number(rewardsSelect.value) || 0;
    rewardsSelect.replaceChildren(new Option('Keep my points', '0'));
    for (let points = 100; points <= quote.maxRedeemPoints; points += 100) rewardsSelect.append(new Option(points + ' points: $' + points / 20 + ' off', String(points)));
    rewardsSelect.value = String(chosen);
    document.getElementById('rewardsChoice').classList.toggle('d-none', !quote.customerId);
    document.getElementById('checkoutRewardsBalance').textContent = quote.balance + ' available points';
    document.getElementById('checkoutSavings').textContent = 'Offers save ' + currencyFormatter.format(quote.promotionSavings) +
        ' · Rewards save ' + currencyFormatter.format(quote.rewardDiscount) + (quote.customerId ? ' · Earn ' + quote.pointsEarned + ' points after this order' : ' · Join free to earn points');
    renderPurchaseTotals('checkout', quote);
    return quote;
}
rewardsSelect.addEventListener('change', async () => {
    if (checkoutBusy) return;
    checkoutBusy = true; rewardsSelect.disabled = true;
    placeOrderButton.disabled = true; checkoutReady = false;
    try { await loadCheckoutQuote(); checkoutReady = !purchaseUncertain; showCheckoutMessage('Review your updated total before ordering.'); }
    catch (error) { showCheckoutMessage(error.message); }
    finally { checkoutBusy = false; rewardsSelect.disabled = false; placeOrderButton.disabled = !checkoutReady; }
});

// --- Validation and feedback ---

function showCheckoutMessage(message) {
    checkoutMessage.textContent = message;
    checkoutMessage.classList.toggle('d-none', message.length === 0);
}

function hasValidCheckoutState(state) {
    return state && (state.mode === 'cart' || state.mode === 'buyNow') &&
        Array.isArray(state.items) && state.items.length > 0 &&
        state.items.every(function (item) {
            return item && Number.isInteger(item.bookId) &&
                Number.isInteger(item.quantity) && item.quantity > 0 &&
                Number.isFinite(item.price) && item.price >= 0;
        });
}

function cartMatchesCheckout(items) {
    const cart = loadCartFromStorage();
    return cart.length === items.length && items.every(function (item) {
        return cart.some(function (entry) {
            return entry && entry.bookId === item.bookId && entry.quantity === item.quantity;
        });
    });
}

// --- Checkout review ---

async function renderCheckoutReview() {
    if (checkoutBusy) return;
    checkoutBusy = true;
    checkoutReady = false;
    checkoutContent.classList.add('d-none');
    orderConfirmation.classList.add('d-none');
    checkoutItems.innerHTML = '';
    placeOrderButton.disabled = true;

    try {
        if (!hasValidCheckoutState(checkoutState)) {
            checkoutBackLink.href = 'index.html';
            showCheckoutMessage('There is no active checkout to review. Please return to the catalog.');
            return;
        }
        checkoutBackLink.href = checkoutState.mode === 'cart' ? 'cart.html' : 'index.html';
        showCheckoutMessage('Loading checkout...');
        const books = await loadBooksFromApi();
        if (checkoutState.mode === 'cart' && !cartMatchesCheckout(checkoutState.items)) {
            showCheckoutMessage('Your cart changed. Please return to your cart and review it again.');
            return;
        }

        // Validate all items before updating the review snapshot.
        const reviewedItems = [];
        for (const item of checkoutState.items) {
            const book = books.find(function (book) { return book.id === item.bookId; });
            const error = getCartQuantityError(book, item.quantity);
            if (error) {
                showCheckoutMessage(error + ' Please return and review your selection.');
                return;
            }
            reviewedItems.push({ bookId: book.id, quantity: item.quantity, price: getBookPrice(book) });
        }
        const pricesChanged = reviewedItems.some(function (item, index) {
            return item.price !== checkoutState.items[index].price;
        });
        saveCheckoutState(checkoutState.mode, reviewedItems, checkoutState.requestKey || crypto.randomUUID());
        checkoutState = loadCheckoutState();

        let total = 0;
        reviewedItems.forEach(function (item) {
            const book = books.find(function (book) { return book.id === item.bookId; });
            const subtotal = item.price * item.quantity;
            total += subtotal;
            const row = document.createElement('tr');
            [book.title + (book.promotionName ? ' — ' + book.promotionName : ''), item.quantity, currencyFormatter.format(item.price),
            currencyFormatter.format(subtotal)].forEach(function (value) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });
            checkoutItems.appendChild(row);
        });
        await loadCheckoutQuote();
        checkoutContent.classList.remove('d-none');
        checkoutReady = !purchaseUncertain;
        placeOrderButton.disabled = !checkoutReady;
        showCheckoutMessage(purchaseUncertain
            ? 'A previous purchase could not be confirmed. Use Retry confirmation to safely recover its result.'
            : pricesChanged ? 'Prices were updated to the current catalog. Please review before placing your order.' : '');
    } catch (error) {
        showCheckoutMessage('Unable to load checkout. Your selection and cart are preserved. ' +
            'Check the connection and refresh. ' + error.message);
    } finally {
        checkoutBusy = false;
    }
}

// --- Payment and the logged-in customer ---
// Every order needs a card. Guests and customers without saved cards enter one
// here; customers with saved cards pick one or choose "Use a new card". A
// logged-in customer's order is linked to their account by the server.

function isUsingNewCard() {
    return paymentMethodGroup.classList.contains('d-none') ||
        paymentMethodSelect.value === NEW_CARD_CHOICE;
}

function updateCardFields() {
    newCardFields.classList.toggle('d-none', !isUsingNewCard());
}

function renderPaymentChoices(cards) {
    const now = new Date();
    paymentMethodSelect.innerHTML = '';

    cards.forEach(function (card) {
        const expired = isPaymentMethodExpired(card, now);
        const option = new Option(
            describePaymentMethod(card) + ' (expires ' + formatCardExpiry(card) + ')' +
            (expired ? ' - expired' : card.isDefault ? ' - default' : ''),
            String(card.id));
        // When the default is expired the browser selects the first enabled choice.
        option.disabled = expired;
        option.selected = card.isDefault && !expired;
        paymentMethodSelect.appendChild(option);
    });
    paymentMethodSelect.appendChild(new Option('Use a new card', NEW_CARD_CHOICE));

    // Without saved cards the card fields show on their own.
    paymentMethodGroup.classList.toggle('d-none', cards.length === 0);
    updateCardFields();
}

paymentMethodSelect.addEventListener('change', updateCardFields);

// The saved card ID, or the typed card's details. Returns { error, field }
// when the typed card needs fixing.
function readCheckoutPayment() {
    if (!isUsingNewCard()) {
        return { payment: { paymentMethodId: Number(paymentMethodSelect.value) } };
    }

    const entry = readCardFields({
        name: cardNameInput, number: cardNumberInput, cvv: document.getElementById('cardCvvInput'), month: cardMonthSelect, year: cardYearSelect
    });
    if (entry.error) return entry;

    return {
        payment: {
            newCard: entry.card,
            saveNewCard: Boolean(checkoutCustomer) && saveCardInput.checked
        }
    };
}

async function loadCheckoutCustomer() {
    try {
        checkoutCustomer = await loadCurrentCustomerFromApi();
    } catch (error) {
        checkoutCustomer = null;
    }
    if (!checkoutCustomer) return;

    const nameInput = document.getElementById('customerName');
    const emailInput = document.getElementById('customerEmail');
    if (!nameInput.value) nameInput.value = getCustomerFullName(checkoutCustomer);
    if (!emailInput.value) emailInput.value = checkoutCustomer.email;
    if (!cardNameInput.value) cardNameInput.value = getCustomerFullName(checkoutCustomer);
    guestPaymentNote.classList.add('d-none');
    saveCardGroup.classList.remove('d-none');
    manageCardsLink.classList.remove('d-none');

    let cards = [];
    try {
        cards = await loadPaymentMethodsFromApi();
    } catch (error) {
        // The customer can still enter a card.
    }
    renderPaymentChoices(cards);
}

// --- Server purchase submission and confirmation ---

checkoutForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (checkoutBusy || !checkoutReady || purchaseUncertain) return;
    if (!hasValidCheckoutState(checkoutState) ||
        JSON.stringify(loadCheckoutState()) !== JSON.stringify(checkoutState) ||
        (checkoutState.mode === 'cart' && !cartMatchesCheckout(checkoutState.items))) {
        checkoutReady = false;
        placeOrderButton.disabled = true;
        showCheckoutMessage('Your selection changed. Return and review it before purchasing.');
        return;
    }
    const customerInfo = {
        name: document.getElementById('customerName').value,
        email: document.getElementById('customerEmail').value
    };
    const customerError = getCustomerInformationError(customerInfo);
    if (customerError) { showCheckoutMessage(customerError); return; }
    const paymentResult = readCheckoutPayment();
    if (paymentResult.error) {
        showCheckoutMessage(paymentResult.error);
        paymentResult.field.focus();
        return;
    }

    checkoutBusy = true;
    placeOrderButton.disabled = true;
    showCheckoutMessage('Placing order...');
    let order;
    try {
        // Survives a refresh/navigation while the request is still in flight.
        sessionStorage.setItem('purchaseUncertain', 'true');
        const request = Object.assign({
            requestKey: checkoutState.requestKey,
            redeemPoints: Number(rewardsSelect.value) || 0,
            expectedTotal: checkoutQuote.total,
            expectedCustomerId: checkoutQuote.customerId,
            customerName: customerInfo.name.trim(),
            customerEmail: customerInfo.email.trim(),
            items: checkoutState.items
        }, paymentResult.payment);
        sessionStorage.setItem('pendingPurchase', JSON.stringify({ request, mode: checkoutState.mode, context: localStorage.getItem('accountChanged') }));
        order = await createOrderInApi(request);
    } catch (error) {
        purchaseUncertain = Boolean(error.uncertain);
        if (purchaseUncertain) sessionStorage.setItem('purchaseUncertain', 'true');
        else { sessionStorage.removeItem('purchaseUncertain'); sessionStorage.removeItem('pendingPurchase'); }
        retryPurchaseButton.hidden = !purchaseUncertain;
        checkoutReady = false;
        checkoutBusy = false;
        showCheckoutMessage(error.message + (purchaseUncertain
            ? ' Your selection is preserved. Retry confirmation safely using the same checkout request.'
            : ' Your selection is preserved. Refresh or return to review it again.'));
        return;
    }

    await confirmPurchase(order, paymentResult.payment, checkoutState.mode);
});

async function confirmPurchase(order, payment, mode) {
    const pending = JSON.parse(sessionStorage.getItem('pendingPurchase') || 'null');
    const customer = await loadCurrentCustomerFromApi();
    if ((customer?.id ?? null) !== (order.customerId ?? null) ||
        (!order.customerId && pending?.context !== localStorage.getItem('accountChanged'))) {
        showCheckoutMessage('Purchase confirmation is preserved for the original identity. Sign back in to recover it.');
        return;
    }
    // --- Confirmed success and local cleanup ---
    // The server has committed. Cleanup failure must never look like purchase failure.
    checkoutReady = false;
    checkoutContent.classList.add('d-none');
    document.getElementById('confirmationCustomerName').textContent = order.customerName;
    document.getElementById('confirmationOrderId').textContent = order.id;
    renderPurchaseTotals('confirmation', getOrderTotals(order));
    document.getElementById('confirmationRewards').textContent = 'Offer savings: ' + currencyFormatter.format(order.promotionSavings || 0) + ' · Rewards redeemed: ' + currencyFormatter.format(order.rewardDiscount || 0) + ' · Points earned: ' + (order.pointsEarned || 0);
    // The typed card number is no longer needed.
    cardNumberInput.value = '';
    const confirmationPayment = document.getElementById('confirmationPayment');
    confirmationPayment.textContent = order.paymentMethod
        ? 'Demo card: ' + order.paymentMethod + '.' +
            (payment.saveNewCard ? ' The card is saved to your account.' : '')
        : '';
    confirmationPayment.classList.toggle('d-none', !order.paymentMethod);
    document.getElementById('confirmationHistoryLink').classList.toggle('d-none', !order.customerId);
    orderConfirmation.classList.remove('d-none');
    checkoutState = null;
    try {
        clearCheckoutState();
        sessionStorage.removeItem('purchaseUncertain');
        sessionStorage.removeItem('pendingPurchase');
        retryPurchaseButton.hidden = true;
        if (mode === 'cart') subtractPurchasedCartItems(order.items);
        const reconciliation = mode === 'buyNow' ? await reconcileCart() : { messages: [] };
        showCheckoutMessage(reconciliation.messages.join(' '));
    } catch (error) {
        showCheckoutMessage('Your order was placed. Saved-cart cleanup could not finish; review your cart before buying again.');
    } finally {
        checkoutBusy = false;
    }
}

// --- Page initialization and back-forward-cache restoration ---

fillCardExpirationChoices(cardMonthSelect, cardYearSelect);
loadCheckoutCustomer().then(renderCheckoutReview);
window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        checkoutState = loadCheckoutState();
        renderCheckoutReview();
    }
});

retryPurchaseButton.addEventListener('click', async () => {
    if (checkoutBusy) return;
    const pending = JSON.parse(sessionStorage.getItem('pendingPurchase') || 'null');
    if (!pending) return;
    const currentCustomer = await loadCurrentCustomerFromApi();
    if ((currentCustomer?.id ?? null) !== pending.request.expectedCustomerId || (!currentCustomer && pending.context !== localStorage.getItem('accountChanged'))) {
        showCheckoutMessage('An uncertain purchase belongs to a different account. Sign back into that account to retry confirmation. The original request is preserved.');
        return;
    }
    checkoutBusy = true; retryPurchaseButton.disabled = true;
    try { const order = await createOrderInApi(pending.request); await confirmPurchase(order, pending.request, pending.mode); }
    catch (error) { showCheckoutMessage(error.message + ' The same request is preserved for retry.'); }
    finally { checkoutBusy = false; retryPurchaseButton.disabled = false; }
});
