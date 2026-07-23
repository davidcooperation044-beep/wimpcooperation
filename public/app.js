const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const loginButton = document.querySelector('#login-button');
const userBadge = document.querySelector('#user-badge');
const logoutButton = document.querySelector('#logout-button');

async function api(url, options = {}) {
    const response = await fetch(url, options);

    let data = {};
    try {
        data = await response.json();
    } catch (_) {}

    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return data;
}

async function getCurrentUser() {
    try {
        return await api('/api/user');
    } catch {
        return null;
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    loginError.textContent = '';

    try {
        const email = document.querySelector('#email').value;
        const password = document.querySelector('#password').value;

        const { user } = await api('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        switch (user.role) {
            case 'admin':
                location.href = '/admin.html';
                break;
            case 'worker':
                location.href = '/worker.html';
                break;
            case 'affiliate':
                location.href = '/affiliate.html';
                break;
            default:
                location.href = '/';
        }

    } catch (err) {
        loginError.textContent = err.message;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign In';
    }
}

async function logout() {
    await api('/api/logout', {
        method: 'POST'
    });

    location.href = '/login.html';
}

async function loadAdminDashboard() {

    const statsElement = document.querySelector('#admin-stats');

    if (!statsElement) return;

    try {

        const stats = await api('/api/admin/stats');

        statsElement.innerHTML = `
            <div class="top-card-grid">

                <div class="dashboard-card">
                    <h3>Pending Applications</h3>
                    <p class="large-number">${stats.pendingApplications}</p>
                </div>

                <div class="dashboard-card">
                    <h3>Active Workers</h3>
                    <p class="large-number">${stats.activeWorkers}</p>
                </div>

                <div class="dashboard-card">
                    <h3>Active Affiliates</h3>
                    <p class="large-number">${stats.activeAffiliates}</p>
                </div>

            </div>
        `;

    } catch (err) {

        statsElement.innerHTML = `
            <div class="dashboard-card">
                Failed to load dashboard.
            </div>
        `;

        console.error(err);

    }

}
async function loadStaff() {

    const body = document.getElementById('staff-body');

    if (!body) return;

    try {

        const { staff } = await api('/api/admin/staff');

        body.innerHTML = '';

        if (staff.length === 0) {

            body.innerHTML = `
                <tr>
                    <td colspan="5">No staff found.</td>
                </tr>
            `;

            return;
        }

        staff.forEach(user => {

            body.innerHTML += `
                <tr>

                    <td>${user.email}</td>

                    <td>

                        <select
                            onchange="updateRole('${user.id}', this.value)">

                            <option value="admin"
                                ${user.role === 'admin' ? 'selected' : ''}>
                                Admin
                            </option>

                            <option value="worker"
                                ${user.role === 'worker' ? 'selected' : ''}>
                                Worker
                            </option>

                            <option value="affiliate"
                                ${user.role === 'affiliate' ? 'selected' : ''}>
                                Affiliate
                            </option>

                        </select>

                    </td>

                    <td>

                        <select
                            onchange="updateStatus('${user.id}', this.value)">

                            <option value="active"
                                ${user.status === 'active' ? 'selected' : ''}>
                                Active
                            </option>

                            <option value="deactivated"
                                ${user.status === 'deactivated' ? 'selected' : ''}>
                                Deactivated
                            </option>

                        </select>

                    </td>

                    <td>${new Date(user.created_at).toLocaleDateString()}</td>

                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

        body.innerHTML = `
            <tr>
                <td colspan="5">
                    Failed to load staff.
                </td>
            </tr>
        `;

    }

}
async function initializePage() {

    const page = document.body.dataset.page;

    // Home page
    if (page === 'home') {
        const auth = await getCurrentUser();

        if (auth) {
            switch (auth.user.role) {
                case 'admin':
                    location.href = '/admin.html';
                    break;
                case 'worker':
                    location.href = '/worker.html';
                    break;
                case 'affiliate':
                    location.href = '/affiliate.html';
                    break;
            }
        }

        return;
    }

    // Login page
    if (page === 'login') {
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginSubmit);
        }
        return;
    }

    

    // Protected pages
    const auth = await getCurrentUser();

    if (!auth || !auth.user) {
        location.href = '/login.html';
        return;
    }

    // Header
    if (userBadge) {
        userBadge.textContent =
            `${auth.user.name} • ${auth.user.role}`;
    }

    if (logoutButton) {
        logoutButton.onclick = logout;
    }

    // Load page-specific data
    switch (page) {

    case 'admin':
        await loadAdminDashboard();
        break;

    case 'admin-staff':
        await loadStaff();
        break;

    case 'admin-applications':
        break;

    case 'admin-tasks':
        break;

    case 'admin-commissions':
        break;

    case 'worker':
        break;

    case 'affiliate':
        break;

}

}

initializePage();
async function updateRole(id, role) {
    try {
        await api(`/api/admin/staff/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role })
        });

        await loadStaff();

    } catch (err) {
        alert(err.message);
    }
}
async function updateStatus(id, status) {
    try {
        await api(`/api/admin/staff/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        await loadStaff();

    } catch (err) {
        alert(err.message);
    }
}
