const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const loginButton = document.getElementById('loginButton');
function showLoginError(message) { loginError.textContent = message; loginError.classList.toggle('d-none', !message); }
(async function () {
    try {
        const staff = await getValidatedInternalSession();
        if (staff) location.replace(getInternalHomePage(staff.role));
        else if (await loadCurrentCustomerFromApi()) location.replace('account.html');
    } catch (_) { /* The form can retry. */ }
})();
loginForm.addEventListener('submit', async function (event) {
    event.preventDefault(); showLoginError(''); loginButton.disabled = true;
    try {
        const identifier = usernameInput.value.trim();
        if (identifier.includes('@')) {
            await logInCustomerInApi(identifier, passwordInput.value);
            location.replace('index.html');
        } else {
            const staff = await staffRequest('POST', '/login', { username: identifier, password: passwordInput.value });
            sessionStorage.removeItem('assistantHistory');
            localStorage.setItem('accountChanged', crypto.randomUUID());
            location.replace(getInternalHomePage(staff.role));
        }
    } catch (error) { showLoginError(error.message); }
    finally { loginButton.disabled = false; }
});
