// Admin-only Employee account display and management.

// --- Page state and DOM references ---

const internalUsersTableBody = document.getElementById(
    'internalUsersTableBody'
);

const addEmployeeButton = document.getElementById('addEmployeeButton');

const userFormModalElement = document.getElementById('userFormModal');
const userFormModal = new bootstrap.Modal(userFormModalElement);

const userFormModalTitle = document.getElementById('userFormModalTitle');
const userForm = document.getElementById('userForm');
const userFormId = document.getElementById('userFormId');
const userFormName = document.getElementById('userFormName');
const userFormUsername = document.getElementById('userFormUsername');
const userFormPassword = document.getElementById('userFormPassword');
const userFormPasswordHelp = document.getElementById(
    'userFormPasswordHelp'
);
const userFormError = document.getElementById('userFormError');
const saveUserButton = document.getElementById('saveUserButton');

// --- Account table rendering ---

function createUserStatusBadge(user) {
    const badge = document.createElement('span');

    badge.className = user.active
        ? 'badge text-bg-success'
        : 'badge text-bg-secondary';

    badge.textContent = user.active ? 'Active' : 'Disabled';

    return badge;
}

function createUserActions(user) {
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2';

    if (user.role === 'Admin') {
        const protectedLabel = document.createElement('span');
        protectedLabel.className = 'text-muted small';
        protectedLabel.textContent = 'Protected account';

        actions.appendChild(protectedLabel);
        return actions;
    }

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn-sm btn-outline-primary edit-user-button';
    editButton.textContent = 'Edit';
    editButton.dataset.userId = user.id;

    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = user.active
        ? 'btn btn-sm btn-outline-danger toggle-user-status-button'
        : 'btn btn-sm btn-outline-success toggle-user-status-button';

    statusButton.textContent = user.active ? 'Disable' : 'Enable';
    statusButton.dataset.userId = user.id;

    actions.append(editButton, statusButton);
    return actions;
}

function renderInternalUsers() {
    const users = loadInternalUsersFromStorage();

    internalUsersTableBody.innerHTML = '';

    users.forEach(function (user) {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = user.name;

        const usernameCell = document.createElement('td');
        usernameCell.textContent = user.username;

        const roleCell = document.createElement('td');
        roleCell.textContent = user.role;

        const statusCell = document.createElement('td');
        statusCell.appendChild(createUserStatusBadge(user));

        const actionsCell = document.createElement('td');
        actionsCell.appendChild(createUserActions(user));

        row.append(
            nameCell,
            usernameCell,
            roleCell,
            statusCell,
            actionsCell
        );

        internalUsersTableBody.appendChild(row);
    });
}

// --- Add/Edit Employee form ---

function showUserFormError(message) {
    userFormError.textContent = message;
    userFormError.classList.remove('d-none');
}

function openUserForm(user) {
    userForm.reset();
    userFormError.textContent = '';
    userFormError.classList.add('d-none');

    if (user) {
        userFormModalTitle.textContent = 'Edit Employee';
        userFormId.value = user.id;
        userFormName.value = user.name;
        userFormUsername.value = user.username;
        userFormPassword.value = '';

        userFormPasswordHelp.textContent =
            'Leave blank to keep the current password.';
    } else {
        userFormModalTitle.textContent = 'Add Employee';
        userFormId.value = '';

        userFormPasswordHelp.textContent =
            'A password is required for new accounts.';
    }

    userFormModal.show();
}

function getNextInternalUserId(users) {
    if (users.length === 0) {
        return 1;
    }

    return Math.max.apply(
        null,
        users.map(function (user) {
            return user.id;
        })
    ) + 1;
}

function saveEmployeeFromForm() {
    const users = loadInternalUsersFromStorage();

    const idValue = userFormId.value;
    const employeeId = idValue ? Number(idValue) : null;

    const name = userFormName.value.trim();
    const username = userFormUsername.value.trim();
    const password = userFormPassword.value;

    userFormError.textContent = '';
    userFormError.classList.add('d-none');

    if (!name || !username) {
        showUserFormError('Employee name and username are required.');
        return;
    }

    const usernamePattern = /^[a-zA-Z0-9._-]+$/;

    if (!usernamePattern.test(username)) {
        showUserFormError(
            'Username may only contain letters, numbers, periods, underscores, and hyphens.'
        );
        return;
    }

    const duplicateUsername = users.some(function (user) {
        return user.id !== employeeId &&
            user.username.toLowerCase() === username.toLowerCase();
    });

    if (duplicateUsername) {
        showUserFormError('That username is already in use.');
        return;
    }

    if (!employeeId && password.length < 6) {
        showUserFormError(
            'New employee passwords must contain at least 6 characters.'
        );
        return;
    }

    if (employeeId && password && password.length < 6) {
        showUserFormError(
            'A replacement password must contain at least 6 characters.'
        );
        return;
    }

    if (employeeId) {
        const employee = users.find(function (user) {
            return user.id === employeeId;
        });

        if (!employee || employee.role !== 'Employee') {
            showUserFormError('That employee account cannot be edited.');
            return;
        }

        employee.name = name;
        employee.username = username;

        if (password) {
            employee.password = password;
        }
    } else {
        users.push({
            id: getNextInternalUserId(users),
            name: name,
            username: username,
            password: password,
            role: 'Employee',
            active: true
        });
    }

    saveInternalUsersToStorage(users);
    renderInternalUsers();
    userFormModal.hide();
}

// --- Account-management events ---

addEmployeeButton.addEventListener('click', function () {
    openUserForm(null);
});

saveUserButton.addEventListener('click', function () {
    saveEmployeeFromForm();
});

userForm.addEventListener('submit', function (event) {
    event.preventDefault();
    saveEmployeeFromForm();
});

internalUsersTableBody.addEventListener('click', function (event) {
    const editButton = event.target.closest('.edit-user-button');

    if (editButton) {
        const userId = Number(editButton.dataset.userId);
        const users = loadInternalUsersFromStorage();

        const employee = users.find(function (user) {
            return user.id === userId &&
                user.role === 'Employee';
        });

        if (employee) {
            openUserForm(employee);
        }

        return;
    }

    const statusButton = event.target.closest(
        '.toggle-user-status-button'
    );

    if (!statusButton) {
        return;
    }

    const userId = Number(statusButton.dataset.userId);
    const users = loadInternalUsersFromStorage();

    const employee = users.find(function (user) {
        return user.id === userId &&
            user.role === 'Employee';
    });

    if (!employee) {
        return;
    }

    employee.active = !employee.active;

    saveInternalUsersToStorage(users);
    renderInternalUsers();
});

// --- Page initialization ---

renderInternalUsers();
