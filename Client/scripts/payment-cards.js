// Card entry and display shared by checkout and the account page. The full card
// number is checked here and never leaves the browser: only the card type, last
// four digits, expiration, and name on card are sent to the API.

// --- Accepted cards ---

// Card types the store accepts and their valid number lengths.
const ACCEPTED_CARD_LENGTHS = {
    'Visa': [13, 16, 19],
    'Mastercard': [16],
    'American Express': [15],
    'Discover': [16, 19]
};
const CARD_BRAND_HINT = 'Visa, Mastercard, American Express, or Discover.';

function detectCardBrand(digits) {
    if (/^4/.test(digits)) return 'Visa';
    if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(digits)) return 'Mastercard';
    if (/^3[47]/.test(digits)) return 'American Express';
    if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
    return null;
}

// The standard card-number checksum (Luhn), which catches most typos.
function passesLuhnCheck(digits) {
    let sum = 0;
    for (let index = 0; index < digits.length; index++) {
        let digit = Number(digits[digits.length - 1 - index]);
        if (index % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

// --- Card entry fields ---

function fillCardExpirationChoices(monthSelect, yearSelect) {
    for (let month = 1; month <= 12; month++) {
        monthSelect.appendChild(new Option(String(month).padStart(2, '0'), String(month)));
    }
    const thisYear = new Date().getFullYear();
    for (let year = thisYear; year <= thisYear + 15; year++) {
        yearSelect.appendChild(new Option(String(year), String(year)));
    }
}

// Names the detected card type under the number field as the customer types.
function watchCardBrand(numberInput, hintElement) {
    numberInput.addEventListener('input', function () {
        const brand = detectCardBrand(numberInput.value.replace(/[\s-]/g, ''));
        hintElement.textContent = brand ? brand + ' card.' : CARD_BRAND_HINT;
    });
}

// fields: { name, number, month, year } form controls. Returns { card } with
// only what the API accepts, or { error, field } for the customer to fix.
function readCardFields(fields) {
    const name = fields.name.value.trim();
    const digits = fields.number.value.replace(/[\s-]/g, '');
    const month = Number(fields.month.value);
    const year = Number(fields.year.value);

    if (!name) return { error: 'Enter the name on the card.', field: fields.name };
    if (!/^\d+$/.test(digits)) {
        return { error: 'Enter the card number using digits only.', field: fields.number };
    }
    const brand = detectCardBrand(digits);
    if (!brand) {
        return { error: 'We accept Visa, Mastercard, American Express, and Discover.', field: fields.number };
    }
    if (!ACCEPTED_CARD_LENGTHS[brand].includes(digits.length) || !passesLuhnCheck(digits)) {
        return { error: 'That card number is not valid. Check it and try again.', field: fields.number };
    }
    if (!month) return { error: 'Choose the expiration month.', field: fields.month };
    if (!year) return { error: 'Choose the expiration year.', field: fields.year };
    if (isPaymentMethodExpired({ expMonth: month, expYear: year }, new Date())) {
        return { error: 'This card has expired.', field: fields.month };
    }

    return {
        card: { brand: brand, last4: digits.slice(-4), expMonth: month, expYear: year, nameOnCard: name }
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
