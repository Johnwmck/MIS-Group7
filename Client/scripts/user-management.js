// Admin employee management. Passwords and changes go only to the authenticated API.
const internalUsersTableBody = document.getElementById('internalUsersTableBody');
const userForm = document.getElementById('userForm');
const userFormModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('userFormModal'));
let managedUsers = [];
let userBusy = false;
function userError(text) {
    const box = document.getElementById('userFormError'); box.textContent = text; box.classList.toggle('d-none', !text);
}
async function renderInternalUsers() {
    try {
        managedUsers = await staffRequest('GET'); internalUsersTableBody.replaceChildren();
        managedUsers.forEach(user => {
            const row = document.createElement('tr');
            [user.name, user.username, user.role, user.active ? 'Active' : 'Disabled'].forEach(value => {
                const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
            });
            const cell = document.createElement('td');
            if (user.role === 'Admin') cell.textContent = 'Protected account';
            else {
                const edit = document.createElement('button'); edit.className = 'btn btn-sm btn-outline-primary me-2'; edit.textContent = 'Edit'; edit.onclick = () => openUserForm(user);
                const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-outline-secondary'; toggle.textContent = user.active ? 'Disable' : 'Enable';
                toggle.onclick = async () => {
                    toggle.disabled = true;
                    try { await staffRequest('PUT', '/' + user.id, { ...user, active: !user.active, password: null }); await renderInternalUsers(); }
                    catch (error) { alert(error.message); toggle.disabled = false; }
                };
                cell.append(edit, toggle);
            }
            row.append(cell); internalUsersTableBody.append(row);
        });
    } catch (error) { internalUsersTableBody.textContent = error.message; }
}
function openUserForm(user) {
    userForm.reset(); userError('');
    document.getElementById('userFormId').value = user?.id || '';
    document.getElementById('userFormName').value = user?.name || '';
    document.getElementById('userFormUsername').value = user?.username || '';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormModalTitle').textContent = user ? 'Edit Employee' : 'Add Employee';
    document.getElementById('userFormPasswordHelp').textContent = '8–128 characters. Leave blank when editing to keep the password.';
    userFormModal.show();
}
async function saveEmployeeFromForm() {
    if (userBusy) return; userBusy = true;
    const id = Number(document.getElementById('userFormId').value) || null;
    try {
        await staffRequest(id ? 'PUT' : 'POST', id ? '/' + id : '', {
            name: document.getElementById('userFormName').value,
            username: document.getElementById('userFormUsername').value,
            password: document.getElementById('userFormPassword').value || null,
            active: managedUsers.find(u => u.id === id)?.active ?? true
        });
        await renderInternalUsers(); userFormModal.hide();
    } catch (error) { userError(error.message); }
    finally { userBusy = false; }
}
document.getElementById('addEmployeeButton').onclick = () => openUserForm(null);
document.getElementById('saveUserButton').onclick = saveEmployeeFromForm;
userForm.onsubmit = event => { event.preventDefault(); saveEmployeeFromForm(); };
renderInternalUsers();
