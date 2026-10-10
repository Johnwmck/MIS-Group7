// Browser-only prototype accounts and login sessions; not server authorization.

const INTERNAL_USERS_STORAGE_KEY = 'internalUsers';
const INTERNAL_SESSION_STORAGE_KEY = 'internalSession';

// --- Internal user persistence and authentication ---

const initialInternalUsers = [
    {
        id: 1,
        name: 'Demo Administrator',
        username: 'admin',
        password: 'admin123',
        role: 'Admin',
        active: true
    },
    {
        id: 2,
        name: 'Demo Employee',
        username: 'employee',
        password: 'employee123',
        role: 'Employee',
        active: true
    }
];

// These plain-text credentials are intentionally limited to the browser
// prototype. A production API must own credential storage and verification.

function loadInternalUsersFromStorage() {
    const savedUsers = localStorage.getItem(INTERNAL_USERS_STORAGE_KEY);

    if (savedUsers) {
        return JSON.parse(savedUsers);
    }

    const seededUsers = initialInternalUsers.map(function (user) {
        return { ...user };
    });

    saveInternalUsersToStorage(seededUsers);
    return seededUsers;
}

function saveInternalUsersToStorage(users) {
    localStorage.setItem(
        INTERNAL_USERS_STORAGE_KEY,
        JSON.stringify(users)
    );
}

function authenticateInternalUser(username, password) {
    const normalizedUsername = username.trim().toLowerCase();
    const users = loadInternalUsersFromStorage();

    const user = users.find(function (user) {
        return user.username.toLowerCase() === normalizedUsername && user.password === password;
    });

    if (!user) {
        return {
            error: 'The username or password is incorrect.',
            user: null
        };
    }

    if (!user.active) {
        return {
            error: 'This account is currently disabled.',
            user: null
        };
    }

    return {
        error: '',
        user: user
    };
}

function saveInternalSession(user) {
    const session = {
        userId: user.id,
        name: user.name,
        username: user.username,
        role: user.role
    };

    sessionStorage.setItem(
        INTERNAL_SESSION_STORAGE_KEY,
        JSON.stringify(session)
    );

    return session;
}

function loadInternalSession() {
    const savedSession = sessionStorage.getItem(INTERNAL_SESSION_STORAGE_KEY);

    return savedSession ? JSON.parse(savedSession) : null;
}

function clearInternalSession() {
    sessionStorage.removeItem(INTERNAL_SESSION_STORAGE_KEY);
}

function userHasRequiredRole(session, requiredRole) {
    if (!session) {
        return false;
    }

    if (requiredRole === 'Employee') {
        return session.role === 'Employee' || session.role === 'Admin';
    }

    return session.role === requiredRole;
}

