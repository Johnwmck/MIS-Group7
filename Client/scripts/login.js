// Login page for everyone. Customers log in with their email through the API;
// staff log in with a username against the browser prototype accounts. Anyone
// already logged in goes straight to their portal or to account.html.

// --- Page DOM references ---

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const loginButton = document.getElementById('loginButton');

function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.toggle('d-none', message === '');
}

// --- Existing-session routing ---

const existingSession = getValidatedInternalSession();

if (existingSession) {
    window.location.replace(
        getInternalHomePage(existingSession.role)
    );
} else {
    redirectLoggedInCustomer();
}

async function redirectLoggedInCustomer() {
    try {
        if (await loadCurrentCustomerFromApi()) {
            window.location.replace('account.html');
        }
    } catch (error) {
        // Leave the login form showing if the API cannot be reached.
    }
}

// --- Login submission ---

loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showLoginError('');

    const identifier = usernameInput.value.trim();

    // Customer accounts use email addresses; staff usernames cannot contain "@".
    if (identifier.includes('@')) {
        loginButton.disabled = true;

        try {
            await logInCustomerInApi(identifier, passwordInput.value);
            window.location.replace('index.html');
        } catch (error) {
            showLoginError(error.message);
            loginButton.disabled = false;
        }

        return;
    }

    const result = authenticateInternalUser(identifier, passwordInput.value);

    if (result.error) {
        showLoginError(result.error);
        return;
    }

    const session = saveInternalSession(result.user);
    window.location.replace(getInternalHomePage(session.role));
});
