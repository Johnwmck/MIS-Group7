// Customer account page: order history with returns and cancellations, saved
// payment methods, and account info. Logged-out visitors go to login.html.
// Depends on customer-accounts.js, payment-cards.js, book-utils.js, reporting.js
// (order rows, dates, status labels, receipt numbers), auth.js (navbar name),
// and Bootstrap.

// --- Return policy (matches API/Services/OrderRefundPolicy.cs) ---

const RETURN_WINDOW_DAYS = 30;
const OTHER_REFUND_REASON = 'Other';
const REFUND_REASONS = {
    Return: [
        'Damaged or defective', 'Wrong item received', 'No longer needed',
        'Ordered by mistake', 'Found a better price', 'Arrived too late', OTHER_REFUND_REASON
    ],
    Cancellation: [
        'Ordered by mistake', 'No longer needed', 'Found a better price',
        'Shipping takes too long', OTHER_REFUND_REASON
    ]
};

// --- Page DOM references ---

const accountLoadMessage = document.getElementById('accountLoadMessage');
const accountContent = document.getElementById('accountContent');
const accountFirstName = document.getElementById('accountFirstName');
const accountLogoutButton = document.getElementById('accountLogoutButton');
const logoutError = document.getElementById('logoutError');

const orderMessage = document.getElementById('orderMessage');
const orderHistoryStatus = document.getElementById('orderHistoryStatus');
const orderHistoryEmpty = document.getElementById('orderHistoryEmpty');
const accountOrderList = document.getElementById('accountOrderList');

const refundModalElement = document.getElementById('refundModal');
const refundModal = bootstrap.Modal.getOrCreateInstance(refundModalElement);
const refundForm = document.getElementById('refundForm');
const refundModalTitle = document.getElementById('refundModalTitle');
const refundSummary = document.getElementById('refundSummary');
const refundItems = document.getElementById('refundItems');
const refundReasonLabel = document.getElementById('refundReasonLabel');
const refundReasonSelect = document.getElementById('refundReasonSelect');
const refundCommentsInput = document.getElementById('refundCommentsInput');
const refundCommentsHint = document.getElementById('refundCommentsHint');
const refundError = document.getElementById('refundError');
const refundSubmitButton = document.getElementById('refundSubmitButton');

const paymentMessage = document.getElementById('paymentMessage');
const paymentStatus = document.getElementById('paymentStatus');
const paymentEmpty = document.getElementById('paymentEmpty');
const paymentList = document.getElementById('paymentList');
const addCardForm = document.getElementById('addCardForm');
const cardNameInput = document.getElementById('cardNameInput');
const cardNumberInput = document.getElementById('cardNumberInput');
const cardBrandHint = document.getElementById('cardBrandHint');
const cardMonthSelect = document.getElementById('cardMonthSelect');
const cardYearSelect = document.getElementById('cardYearSelect');
const cardDefaultInput = document.getElementById('cardDefaultInput');
const addCardError = document.getElementById('addCardError');
const addCardButton = document.getElementById('addCardButton');

const profileForm = document.getElementById('profileForm');
const profileFirstName = document.getElementById('profileFirstName');
const profileLastName = document.getElementById('profileLastName');
const profileEmail = document.getElementById('profileEmail');
const profilePhone = document.getElementById('profilePhone');
const memberSince = document.getElementById('memberSince');
const profileMessage = document.getElementById('profileMessage');
const profileSaveButton = document.getElementById('profileSaveButton');

const passwordForm = document.getElementById('passwordForm');
const passwordFormEmail = document.getElementById('passwordFormEmail');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
const passwordMessage = document.getElementById('passwordMessage');
const passwordSaveButton = document.getElementById('passwordSaveButton');

// --- Page state ---

let accountCustomer = null;
let accountOrders = [];
let ordersLoading = false;
// The order the return/cancel form is open for: { order, type, trigger, done }.
let refundTarget = null;
let refundBusy = false;
let paymentMethods = [];
let paymentBusy = false;

// --- Shared helpers ---

// kind is 'success', 'danger', or 'warning'. An empty message hides the alert.
function showAlert(element, message, kind) {
    element.textContent = message;
    element.classList.remove('alert-success', 'alert-danger', 'alert-warning');
    element.classList.add('alert-' + (kind || 'danger'));
    element.classList.toggle('d-none', message === '');
}

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
});

function formatLongDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : longDateFormatter.format(date);
}

// A 401 means the session ended (expired cookie or Reset Demo Data).
function redirectIfLoggedOut(error) {
    if (error.status !== 401) return false;
    window.location.replace('login.html');
    return true;
}

// Builds an element with text content only, so order data is never parsed as HTML.
function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createButton(className, text, onClick) {
    const button = createElement('button', className, text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

// Label/amount rows under the items; the last row is the bold total.
function createTotalsBlock(rows) {
    const block = createElement('div', 'order-totals pt-3');
    rows.forEach(function (row, index) {
        const line = createElement('div', index === rows.length - 1 ? 'fw-bold' : '');
        line.append(createElement('span', '', row[0]), createElement('span', '', row[1]));
        block.appendChild(line);
    });
    return block;
}

function getOrderItems(order) {
    return Array.isArray(order.items) ? order.items : [];
}

function formatTaxLabel(prefix, taxRate) {
    return prefix + ' (' + Math.round(taxRate * 100) + '%)';
}

// --- Order history ---

function getRefundDeadline(order) {
    return new Date(new Date(order.date).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function canRefundOrder(order, now) {
    return !order.refund && now <= getRefundDeadline(order);
}

function createCardHeader(titleText, badge, dateValue) {
    const header = createElement('div', 'card-header');
    const title = createElement('div', 'd-flex align-items-center gap-2');
    title.append(createElement('strong', '', titleText), badge);
    header.append(title, createElement('span', 'text-muted', formatOrderDate(dateValue)));
    return header;
}

function createAccountOrderCard(order, now) {
    const card = createElement('article', 'card mb-3 account-order');
    const status = getOrderStatusLabel(order);
    const badge = createElement('span', 'badge ' + (order.refund ? 'text-bg-secondary' : 'text-bg-success'), status);

    const body = createElement('div', 'card-body');
    getOrderItems(order).forEach(function (item) {
        body.appendChild(createOrderItemRow(item));
    });
    const totals = getOrderTotals(order);
    body.appendChild(createTotalsBlock([
        ['Subtotal', currencyFormatter.format(totals.subtotal)],
        [formatTaxLabel('Sales tax', totals.taxRate), currencyFormatter.format(totals.tax)],
        ['Total', currencyFormatter.format(totals.total)]
    ]));
    if (order.paymentMethod) {
        body.appendChild(createElement('p', 'text-muted small text-end mb-0 mt-2', 'Paid with ' + order.paymentMethod));
    }

    const footer = createElement('div', 'card-footer d-flex flex-wrap justify-content-between align-items-center gap-2');
    const deadline = formatLongDate(getRefundDeadline(order));
    if (order.refund) {
        footer.appendChild(createElement('span', 'text-muted',
            status + ' on ' + formatLongDate(order.refund.date) + '. See receipt ' +
            getRefundReceiptNumber(order) + '.'));
    } else if (canRefundOrder(order, now)) {
        footer.appendChild(createElement('span', 'text-muted', 'Return or cancel by ' + deadline));
        const actions = createElement('div', 'd-flex gap-2');
        const returnButton = createButton('btn btn-sm btn-outline-primary', 'Return Order', function () {
            openRefundForm(order, 'Return', returnButton);
        });
        const cancelButton = createButton('btn btn-sm btn-outline-danger', 'Cancel Order', function () {
            openRefundForm(order, 'Cancellation', cancelButton);
        });
        returnButton.setAttribute('aria-label', 'Return order #' + order.id);
        cancelButton.setAttribute('aria-label', 'Cancel order #' + order.id);
        actions.append(returnButton, cancelButton);
        footer.appendChild(actions);
    } else {
        footer.appendChild(createElement('span', 'text-muted',
            'The ' + RETURN_WINDOW_DAYS + '-day return window closed on ' + deadline + '.'));
    }

    card.append(createCardHeader('Order #' + order.id, badge, order.date), body, footer);
    return card;
}

// The new receipt that a return or cancellation adds to the history.
function createRefundReceiptCard(order) {
    const refund = order.refund;
    const card = createElement('article', 'card mb-3 account-receipt');
    const title = (refund.type === 'Return' ? 'Return' : 'Cancellation') + ' Receipt ' +
        getRefundReceiptNumber(order);

    const body = createElement('div', 'card-body');
    body.appendChild(createElement('p', 'mb-2',
        'For order #' + order.id + ', placed ' + formatLongDate(order.date) + '.'));
    getOrderItems(order).forEach(function (item) {
        body.appendChild(createOrderItemRow(item));
    });
    body.appendChild(createTotalsBlock([
        ['Subtotal refunded', currencyFormatter.format(refund.subtotal)],
        [formatTaxLabel('Sales tax refunded', getOrderTotals(order).taxRate), currencyFormatter.format(refund.tax)],
        ['Total refunded', currencyFormatter.format(refund.total)]
    ]));
    body.appendChild(createElement('p', 'text-muted small text-end mt-2 mb-3',
        'Refunded to ' + (order.paymentMethod || 'your original payment method') + '.'));

    const details = createElement('dl', 'row small mb-0');
    details.append(
        createElement('dt', 'col-sm-3', 'Reason'),
        createElement('dd', 'col-sm-9 mb-1', refund.reason));
    if (refund.comments) {
        details.append(
            createElement('dt', 'col-sm-3', 'Comments'),
            createElement('dd', 'col-sm-9 mb-0 text-break', refund.comments));
    }
    body.appendChild(details);

    card.append(createCardHeader(title, createElement('span', 'badge text-bg-dark', 'Refund'), refund.date), body);
    return card;
}

// Orders and their refund receipts, newest first, so a new receipt is on top.
function renderOrders() {
    const now = new Date();
    const entries = [];

    accountOrders.forEach(function (order) {
        entries.push({
            date: new Date(order.date),
            render: function () { return createAccountOrderCard(order, now); }
        });
        if (order.refund) {
            entries.push({
                date: new Date(order.refund.date),
                render: function () { return createRefundReceiptCard(order); }
            });
        }
    });
    entries.sort(function (a, b) { return b.date - a.date; });

    accountOrderList.innerHTML = '';
    entries.forEach(function (entry) {
        accountOrderList.appendChild(entry.render());
    });
    orderHistoryStatus.classList.add('d-none');
    orderHistoryEmpty.classList.toggle('d-none', accountOrders.length > 0);
}

async function refreshOrders() {
    if (ordersLoading) return;
    ordersLoading = true;
    accountOrderList.innerHTML = '';
    orderHistoryEmpty.classList.add('d-none');
    orderHistoryStatus.textContent = 'Loading orders...';
    orderHistoryStatus.classList.remove('d-none');

    try {
        accountOrders = await loadCustomerOrdersFromApi();
        renderOrders();
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        orderHistoryStatus.textContent = 'Unable to load your orders. Refresh to retry. ' + error.message;
    } finally {
        ordersLoading = false;
    }
}

// --- Return / cancel form ---

function openRefundForm(order, type, trigger) {
    const isReturn = type === 'Return';
    const totals = getOrderTotals(order);
    refundTarget = { order: order, type: type, trigger: trigger, done: false };

    refundModalTitle.textContent = (isReturn ? 'Return' : 'Cancel') + ' Order #' + order.id;
    refundReasonLabel.textContent = isReturn
        ? 'Why are you returning this order?'
        : 'Why are you cancelling this order?';
    refundSubmitButton.textContent = isReturn ? 'Submit Return' : 'Cancel Order';
    refundSummary.textContent = 'You will be refunded ' + currencyFormatter.format(totals.total) +
        (totals.tax > 0 ? ', including ' + currencyFormatter.format(totals.tax) + ' sales tax,' : '') +
        ' to ' + (order.paymentMethod || 'your original payment method') + '.';

    refundItems.innerHTML = '';
    getOrderItems(order).forEach(function (item) {
        refundItems.appendChild(createElement('li', '', item.quantity + ' × ' + item.title));
    });

    refundReasonSelect.innerHTML = '';
    refundReasonSelect.appendChild(new Option('Choose a reason', ''));
    REFUND_REASONS[type].forEach(function (reason) {
        refundReasonSelect.appendChild(new Option(reason, reason));
    });
    refundCommentsInput.value = '';
    updateRefundCommentsHint();
    showAlert(refundError, '');
    refundModal.show();
}

// Comments are required only for "Other".
function updateRefundCommentsHint() {
    const required = refundReasonSelect.value === OTHER_REFUND_REASON;
    refundCommentsInput.required = required;
    refundCommentsHint.textContent = required ? '(required)' : '(optional)';
}

refundReasonSelect.addEventListener('change', updateRefundCommentsHint);

refundModalElement.addEventListener('shown.bs.modal', function () {
    refundReasonSelect.focus();
});

// After a refund the order card is redrawn, so focus moves to the success
// message; otherwise it returns to the button that opened the form.
refundModalElement.addEventListener('hidden.bs.modal', function () {
    if (refundTarget && refundTarget.done) {
        orderMessage.focus();
    } else if (refundTarget && refundTarget.trigger.isConnected) {
        refundTarget.trigger.focus();
    }
    refundTarget = null;
});

refundForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (refundBusy || !refundTarget) return;

    const target = refundTarget;
    const reason = refundReasonSelect.value;
    const comments = refundCommentsInput.value.trim();

    if (!reason) {
        showAlert(refundError, 'Choose a reason from the list.');
        refundReasonSelect.focus();
        return;
    }
    if (reason === OTHER_REFUND_REASON && !comments) {
        showAlert(refundError, 'Describe your reason when you choose Other.');
        refundCommentsInput.focus();
        return;
    }

    refundBusy = true;
    refundSubmitButton.disabled = true;
    showAlert(refundError, '');

    try {
        const updated = await refundCustomerOrderInApi(target.order.id, {
            type: target.type,
            reason: reason,
            comments: comments || null
        });
        accountOrders = accountOrders.map(function (order) {
            return order.id === updated.id ? updated : order;
        });
        renderOrders();
        showAlert(orderMessage, 'Order #' + updated.id + ' was ' +
            getOrderStatusLabel(updated).toLowerCase() + '. Your refund receipt ' +
            getRefundReceiptNumber(updated) + ' is now at the top of your order history.', 'success');
        target.done = true;
        refundModal.hide();
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        showAlert(refundError, error.message);
        // Already refunded, past the window, or gone: show the server's current history.
        if (error.status === 404 || error.status === 409) refreshOrders();
    } finally {
        refundBusy = false;
        refundSubmitButton.disabled = false;
    }
});

// --- Saved payment methods ---
// Card checks are shared with checkout in payment-cards.js.

// Returns { card } to send, or { error, field } to fix.
function readNewCardForm() {
    const result = readCardFields({
        name: cardNameInput, number: cardNumberInput, month: cardMonthSelect, year: cardYearSelect
    });
    if (result.card) result.card.makeDefault = cardDefaultInput.checked;
    return result;
}

function setPaymentBusy(busy) {
    paymentBusy = busy;
    addCardButton.disabled = busy;
    paymentList.querySelectorAll('button').forEach(function (button) {
        button.disabled = busy;
    });
}

function createPaymentCard(card, now) {
    const label = describePaymentMethod(card);
    const column = createElement('div', 'col-sm-6');
    const box = createElement('div', 'card h-100 payment-card');
    const body = createElement('div', 'card-body d-flex flex-column');

    const top = createElement('div', 'd-flex justify-content-between align-items-start gap-2 mb-2');
    const badges = createElement('div', 'd-flex gap-1');
    if (card.isDefault) badges.appendChild(createElement('span', 'badge text-bg-dark', 'Default'));
    if (isPaymentMethodExpired(card, now)) badges.appendChild(createElement('span', 'badge text-bg-warning', 'Expired'));
    top.append(createElement('strong', '', card.brand), badges);

    const actions = createElement('div', 'd-flex gap-2 mt-auto');
    if (!card.isDefault) {
        const defaultButton = createButton('btn btn-sm btn-outline-primary', 'Make Default', function () {
            changePaymentMethods(function () { return makeDefaultPaymentMethodInApi(card.id); },
                label + ' is now your default card.');
        });
        defaultButton.setAttribute('aria-label', 'Make ' + label + ' your default card');
        actions.appendChild(defaultButton);
    }
    const removeButton = createButton('btn btn-sm btn-outline-danger', 'Remove', function () {
        changePaymentMethods(function () { return removePaymentMethodInApi(card.id); },
            label + ' was removed.');
    });
    removeButton.setAttribute('aria-label', 'Remove ' + label);
    actions.appendChild(removeButton);

    body.append(
        top,
        createElement('div', 'payment-card-number mb-1', '•••• ' + card.last4),
        createElement('div', 'text-muted small mb-3', card.nameOnCard + ' · Expires ' + formatCardExpiry(card)),
        actions);
    box.appendChild(body);
    column.appendChild(box);
    return column;
}

function renderPaymentMethods() {
    const now = new Date();
    paymentList.innerHTML = '';
    paymentMethods.forEach(function (card) {
        paymentList.appendChild(createPaymentCard(card, now));
    });
    paymentStatus.classList.add('d-none');
    paymentEmpty.classList.toggle('d-none', paymentMethods.length > 0);
}

async function refreshPaymentMethods() {
    paymentStatus.textContent = 'Loading saved cards...';
    paymentStatus.classList.remove('d-none');

    try {
        paymentMethods = await loadPaymentMethodsFromApi();
        renderPaymentMethods();
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        paymentStatus.textContent = 'Unable to load your saved cards. Refresh to retry. ' + error.message;
    }
}

// Runs one change to the saved cards; the API answers with the updated list.
async function changePaymentMethods(request, successMessage) {
    if (paymentBusy) return;
    setPaymentBusy(true);
    showAlert(paymentMessage, '');

    try {
        paymentMethods = await request();
        renderPaymentMethods();
        showAlert(paymentMessage, successMessage, 'success');
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        showAlert(paymentMessage, error.message, 'danger');
        if (error.status === 404) refreshPaymentMethods();
    } finally {
        setPaymentBusy(false);
    }
}

watchCardBrand(cardNumberInput, cardBrandHint);

addCardForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (paymentBusy) return;
    showAlert(addCardError, '');

    const result = readNewCardForm();
    if (result.error) {
        showAlert(addCardError, result.error);
        result.field.focus();
        return;
    }

    setPaymentBusy(true);
    try {
        paymentMethods = await addPaymentMethodInApi(result.card);
        renderPaymentMethods();
        // Clear the form so the card number does not stay on screen.
        addCardForm.reset();
        cardBrandHint.textContent = CARD_BRAND_HINT;
        showAlert(paymentMessage, describePaymentMethod(result.card) + ' was saved.', 'success');
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        showAlert(addCardError, error.message);
    } finally {
        setPaymentBusy(false);
    }
});

// --- Account info and password ---

function showProfile(customer) {
    accountCustomer = customer;
    accountFirstName.textContent = customer.firstName;
    profileFirstName.value = customer.firstName;
    profileLastName.value = customer.lastName;
    profileEmail.value = customer.email;
    profilePhone.value = customer.phone || '';
    passwordFormEmail.value = customer.email;
    memberSince.textContent = formatLongDate(customer.createdAt);
}

profileForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    profileSaveButton.disabled = true;
    showAlert(profileMessage, '');

    try {
        const customer = await updateCustomerProfileInApi({
            firstName: profileFirstName.value.trim(),
            lastName: profileLastName.value.trim(),
            email: profileEmail.value.trim(),
            phone: profilePhone.value.trim() || null
        });
        showProfile(customer);
        refreshAccountNavigation();
        showAlert(profileMessage, 'Your account info was saved.', 'success');
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        showAlert(profileMessage, error.message, 'danger');
    } finally {
        profileSaveButton.disabled = false;
    }
});

passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showAlert(passwordMessage, '');

    if (newPasswordInput.value !== confirmNewPasswordInput.value) {
        showAlert(passwordMessage, 'The new passwords do not match.', 'danger');
        confirmNewPasswordInput.focus();
        return;
    }

    passwordSaveButton.disabled = true;
    try {
        await changeCustomerPasswordInApi(currentPasswordInput.value, newPasswordInput.value);
        passwordForm.reset();
        passwordFormEmail.value = accountCustomer.email;
        showAlert(passwordMessage, 'Your password was changed.', 'success');
    } catch (error) {
        if (redirectIfLoggedOut(error)) return;
        showAlert(passwordMessage, error.message, 'danger');
    } finally {
        passwordSaveButton.disabled = false;
    }
});

accountLogoutButton.addEventListener('click', async function () {
    accountLogoutButton.disabled = true;
    showAlert(logoutError, '');

    try {
        await logOutCustomerInApi();
        window.location.replace('login.html');
    } catch (error) {
        showAlert(logoutError, 'Unable to log out. ' + error.message);
        accountLogoutButton.disabled = false;
    }
});

// --- Page initialization ---

async function initializeAccountPage() {
    let customer;
    try {
        customer = await loadCurrentCustomerFromApi();
    } catch (error) {
        showAlert(accountLoadMessage,
            'Unable to load your account. Check the connection and refresh. ' + error.message, 'warning');
        return;
    }

    if (!customer) {
        window.location.replace('login.html');
        return;
    }

    showAlert(accountLoadMessage, '');
    showProfile(customer);
    accountContent.classList.remove('d-none');
    refreshOrders();
    refreshPaymentMethods();
}

fillCardExpirationChoices(cardMonthSelect, cardYearSelect);
initializeAccountPage();

// Back/forward can restore an old copy of the page; reload the account data.
window.addEventListener('pageshow', function (event) {
    if (event.persisted) initializeAccountPage();
});
