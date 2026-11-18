// Staff identity is owned and revalidated by the API. Browser storage never authorizes a request.
const INTERNAL_USERS_STORAGE_KEY = 'internalUsers'; // Old prototype data is ignored.
async function staffRequest(method, path = '', body) {
    const response = await fetch('/api/staff' + path, {
        method, cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Staff request failed (HTTP ' + response.status + ').');
    }
    return response.status === 204 ? null : response.json();
}
async function getValidatedInternalSession() { return staffRequest('GET', '/me'); }
function userHasRequiredRole(user, role) { return user && (user.role === role || user.role === 'Admin'); }
function getInternalHomePage(role) { return role === 'Admin' ? 'admin.html' : 'employee.html'; }
function clearInternalSession() { return staffRequest('POST', '/logout'); }
