// Customer sign-up. The API saves the account with a hashed password and logs
// the new customer in, then this page returns to the home page.

// --- Page DOM references ---

const signupForm = document.getElementById('signupForm');
const firstNameInput = document.getElementById('firstNameInput');
const lastNameInput = document.getElementById('lastNameInput');
const emailInput = document.getElementById('emailInput');
const phoneInput = document.getElementById('phoneInput');
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const signupError = document.getElementById('signupError');
const signupButton = document.getElementById('signupButton');

function showSignupError(message) {
    signupError.textContent = message;
    signupError.classList.toggle('d-none', message === '');
}

// A logged-in customer already has an account; show it instead.
loadCurrentCustomerFromApi()
    .then(function (customer) {
        if (customer) window.location.replace('account.html');
    })
    .catch(function () {
        // Keep the form available if the API cannot be reached.
    });

// --- Sign-up submission ---

signupForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    showSignupError('');

    if (passwordInput.value !== confirmPasswordInput.value) {
        showSignupError('The passwords do not match.');
        confirmPasswordInput.focus();
        return;
    }

    signupButton.disabled = true;

    try {
        await registerCustomerInApi({
            firstName: firstNameInput.value.trim(),
            lastName: lastNameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim() || null,
            password: passwordInput.value
        });
        window.location.replace('index.html');
    } catch (error) {
        showSignupError(error.message);
        signupButton.disabled = false;
    }
});
