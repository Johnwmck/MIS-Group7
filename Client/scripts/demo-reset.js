// Demo reset orchestration. Depends on API, cart, checkout, and internal-user helpers.

// --- Demo reset ---

function resetBrowserDemoData() {
    localStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem(INTERNAL_USERS_STORAGE_KEY);

    clearCheckoutState();
    // Keep an unconfirmed-purchase marker: resetting selections must not
    // authorize a blind retry. Old catalog/order keys are unused and untouched.
    // Preserve the current Admin session so the person running the reset
    // remains signed in when the seeded Admin account is restored on reload.
}

// Reset the server first. Never clear selections when the reset fails.
async function resetDemoState() {
    await resetDemoInApi();
    resetBrowserDemoData();
    // Confirmed server reset removed any possibly completed orders.
    sessionStorage.removeItem('purchaseUncertain');
}

