// Shared internal-page routing, session validation, and UI role checks.
// Browser-only prototype guard; this does not authorize requests to the API.

// --- Role routing and session validation ---

function getInternalHomePage(role) {
    return role === 'Admin'
        ? 'admin.html'
        : 'employee.html';
}

function getValidatedInternalSession() {
    const session = loadInternalSession();

    if (!session) {
        return null;
    }

    const users = loadInternalUsersFromStorage();

    // Re-check persistent account state so a disabled or deleted user cannot
    // keep using an older session.
    const currentUser = users.find(function (user) {
        return user.id === session.userId &&
            user.username === session.username &&
            user.role === session.role &&
            user.active;
    });

    if (!currentUser) {
        clearInternalSession();
        return null;
    }

    return session;
}

function requireInternalRole(requiredRole) {
    const session = getValidatedInternalSession();

    if (!session) {
        window.location.replace('login.html');
        return null;
    }

    if (!userHasRequiredRole(session, requiredRole)) {
        window.location.replace(
            getInternalHomePage(session.role)
        );

        return null;
    }

    return session;
}

// --- Protected-page initialization and logout ---

function initializeInternalAccess(requiredRole) {
    const session = requireInternalRole(requiredRole);

    if (!session) {
        return;
    }

    const currentUserName = document.getElementById(
        'currentInternalUser'
    );

    const logoutButton = document.getElementById('logoutButton');
    const adminNavItem = document.getElementById('adminNavItem');

    if (currentUserName) {
        currentUserName.textContent =
            session.name + ' (' + session.role + ')';
    }

    if (adminNavItem) {
        adminNavItem.classList.toggle(
            'd-none',
            session.role !== 'Admin'
        );
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', function () {
            clearInternalSession();
            window.location.replace('login.html');
        });
    }
}

// Public pages show who is logged in: staff link to their portal, customers to
// their account page (account.html), and everyone else sees Login. Internal
// pages retain their existing account display and logout controls.
async function refreshAccountNavigation() {
    if (document.getElementById('currentInternalUser')) return;
    const links = document.querySelectorAll(
        '.site-primary-nav a[data-account-link], .site-primary-nav a[href="login.html"]'
    );
    const session = getValidatedInternalSession();
    let text = 'Login';
    let href = 'login.html';
    let customerLoggedIn = false;

    if (session) {
        text = session.name + ' (' + session.role + ')';
        href = getInternalHomePage(session.role);
    } else if (typeof loadCurrentCustomerFromApi === 'function') {
        try {
            const customer = await loadCurrentCustomerFromApi();
            if (customer) {
                text = getCustomerFullName(customer);
                href = 'account.html';
                customerLoggedIn = true;
            }
        } catch (error) {
            // Keep showing Login if the API cannot be reached.
        }
    }

    links.forEach(function (link) {
        link.dataset.accountLink = 'true';
        link.textContent = text;
        link.href = href;
    });

    // Customer-only links, such as Favorites in the footer.
    document.querySelectorAll('[data-customer-only]').forEach(function (element) {
        element.classList.toggle('d-none', !customerLoggedIn);
    });
}
window.addEventListener('pageshow', refreshAccountNavigation);
window.addEventListener('storage', refreshAccountNavigation);
