// Navigation reflects the server session. Each privileged API also enforces its role.
async function initializeInternalAccess(requiredRole) {
    try {
        const session = await getValidatedInternalSession();
        if (!session) { window.location.replace('login.html'); return; }
        if (!userHasRequiredRole(session, requiredRole)) { window.location.replace(getInternalHomePage(session.role)); return; }
        const name = document.getElementById('currentInternalUser');
        if (name) name.textContent = session.name + ' (' + session.role + ')';
        document.getElementById('adminNavItem')?.classList.toggle('d-none', session.role !== 'Admin');
        document.getElementById('logoutButton')?.addEventListener('click', async function () {
            try { await clearInternalSession(); window.location.replace('login.html'); }
            catch (error) { alert(error.message); }
        });
    } catch (error) { document.getElementById('currentInternalUser').textContent = error.message; }
}
async function refreshAccountNavigation() {
    if (document.getElementById('currentInternalUser')) return;
    let text = 'Login'; let href = 'login.html'; let member = false;
    try {
        const staff = await getValidatedInternalSession();
        if (staff) { text = staff.name + ' (' + staff.role + ')'; href = getInternalHomePage(staff.role); }
        else if (typeof loadCurrentCustomerFromApi === 'function') {
            const customer = await loadCurrentCustomerFromApi();
            if (customer) { text = getCustomerFullName(customer); href = 'account.html'; member = true; }
        }
    } catch (_) { /* Login remains available if the API is offline. */ }
    document.querySelectorAll('.site-navbar a[data-account-link], .site-navbar a[href="login.html"], #siteFooter a[data-account-link]').forEach(link => {
        link.dataset.accountLink = 'true'; link.textContent = text; link.href = href;
    });
    document.querySelectorAll('[data-customer-only]').forEach(element => element.classList.toggle('d-none', !member));
}
window.addEventListener('pageshow', refreshAccountNavigation);
window.addEventListener('storage', event => { if (event.key === 'accountChanged') location.reload(); });
