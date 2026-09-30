const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

const existingSession = getValidatedInternalSession();

if (existingSession) {
    window.location.replace(
        getInternalHomePage(existingSession.role)
    );
}

loginForm.addEventListener('submit', function (event) {
    event.preventDefault();

    loginError.classList.add('d-none');
    loginError.textContent = '';

    const result = authenticateInternalUser(
        usernameInput.value,
        passwordInput.value
    );

    if (result.error) {
        loginError.textContent = result.error;
        loginError.classList.remove('d-none');
        return;
    }

    const session = saveInternalSession(result.user);
    window.location.replace(getInternalHomePage(session.role));
});