// Shared internal-page routing, session validation, and authorization.

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
