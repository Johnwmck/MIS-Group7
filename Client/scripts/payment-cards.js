// Card entry and display shared by checkout and the account page. The full card
// number is checked here and never leaves the browser: only the card type, last
// four digits, expiration, and name on card are sent to the API.

// --- Card entry fields ---

function fillCardExpirationChoices(monthSelect, yearSelect) {
    for (let month = 1; month <= 12; month++) {
        monthSelect.appendChild(new Option(String(month).padStart(2, '0'), String(month)));
    }
    const thisYear = new Date().getFullYear();
    for (let year = thisYear; year <= thisYear + 20; year++) {
        yearSelect.appendChild(new Option(String(year), String(year)));
    }
}

// fields: { name, number, cvv, month, year } form controls. Returns { card } with
// only what the API accepts, or { error, field } for the customer to fix.
function readCardFields(fields) {
    const name = fields.name.value.trim();
    const digits = fields.number.value.replace(/[\s-]/g, '');
    const month = Number(fields.month.value);
    const year = Number(fields.year.value);

    if (!name) return { error: 'Enter the name on the card.', field: fields.name };
    if (!/^\d{16}$/.test(digits)) {
        return { error: 'Enter any 16 digits for the demo card number.', field: fields.number };
    }
    if (!/^\d{3}$/.test(fields.cvv.value.trim())) {
        return { error: 'Enter any 3 digits for the demo CVV.', field: fields.cvv };
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) return { error: 'Choose the expiration month.', field: fields.month };
    if (!Number.isInteger(year) || year < new Date().getFullYear() || year > new Date().getFullYear() + 20) return { error: 'Choose the expiration year.', field: fields.year };
    if (isPaymentMethodExpired({ expMonth: month, expYear: year }, new Date())) {
        return { error: 'This card has expired.', field: fields.month };
    }

    return {
        card: { brand: 'Demo card', last4: digits.slice(-4), expMonth: month, expYear: year, nameOnCard: name }
    };
}

// --- Saved-card display ---

function describePaymentMethod(card) {
    return card.brand + ' ending in ' + card.last4;
}

function formatCardExpiry(card) {
    return String(card.expMonth).padStart(2, '0') + '/' + String(card.expYear).slice(-2);
}

// Cards work through the last day of their expiration month.
function isPaymentMethodExpired(card, now) {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return card.expYear < year || (card.expYear === year && card.expMonth < month);
}
