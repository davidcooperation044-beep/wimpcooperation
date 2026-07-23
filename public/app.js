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
async function loadApplications() {

    const body = document.getElementById('applications-body');

    if (!body) return;

    try {

        const { applications } = await api('/api/admin/applications');

        body.innerHTML = '';

        if (applications.length === 0) {

            body.innerHTML = `
                <tr>
                    <td colspan="6">No applications found.</td>
                </tr>
            `;

            return;
        }

        applications.forEach(app => {

            body.innerHTML += `
                <tr>

                    <td>${app.name}</td>

                    <td>${app.email}</td>

                    <td>${app.role_interest || app.type}</td>

                    <td>${app.status}</td>

                    <td>
                        ${
                            app.cv_storage_path
                            ? `<a href="${app.cv_storage_path}" target="_blank">View CV</a>`
                            : '-'
                        }
                    </td>

                    <td>

                        <button onclick="acceptApplication('${app.id}')">
                            Accept
                        </button>

                        <button onclick="rejectApplication('${app.id}')">
                            Reject
                        </button>

                    </td>

                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

        body.innerHTML = `
            <tr>
                <td colspan="6">
                    Failed to load applications.
                </td>
            </tr>
        `;

    }

}
async function loadWorkerTasks() {

    const body = document.querySelector('#worker-tasks tbody');

    if (!body) return;

    try {

        const { tasks } = await api('/api/worker/tasks');

        body.innerHTML = '';

        if (tasks.length === 0) {

            body.innerHTML = `
                <tr>
                    <td colspan="4">No tasks assigned.</td>
                </tr>
            `;

            return;
        }

        tasks.forEach(task => {

            body.innerHTML += `
                <tr>

                    <td>${task.title}</td>

                    <td>${task.status}</td>

                    <td>${task.due_date || '-'}</td>

                    <td>${task.project_ref || '-'}</td>

                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

        body.innerHTML = `
            <tr>
                <td colspan="4">
                    Failed to load tasks.
                </td>
            </tr>
        `;

    }

}
async function loadAffiliateDashboard() {

    const referralsBody = document.getElementById('referrals-body');
    const commissionsBody = document.getElementById('commissions-body');
    const pendingTotal = document.getElementById('pending-total');
    const paidTotal = document.getElementById('paid-total');
    const referralCode = document.getElementById('referral-code');

    if (!referralsBody || !commissionsBody) return;

    try {

        const { referrals, commissions } =
            await api('/api/affiliate/data');

        const pending = commissions
            .filter(c => c.status === 'pending')
            .reduce((sum, c) => sum + Number(c.amount), 0);

        const paid = commissions
            .filter(c => c.status === 'paid')
            .reduce((sum, c) => sum + Number(c.amount), 0);

        pendingTotal.textContent = `$${pending.toFixed(2)}`;
        paidTotal.textContent = `$${paid.toFixed(2)}`;

        referralCode.textContent =
            referrals.length
                ? referrals[0].code
                : 'No referral code';

        referralsBody.innerHTML = '';

        referrals.forEach(ref => {

            referralsBody.innerHTML += `
                <tr>
                    <td>${ref.code}</td>
                    <td>${ref.clicks}</td>
                    <td>${ref.conversions}</td>
                </tr>
            `;

        });

        commissionsBody.innerHTML = '';

        commissions.forEach(com => {

            commissionsBody.innerHTML += `
                <tr>
                    <td>$${Number(com.amount).toFixed(2)}</td>
                    <td>${com.status}</td>
                    <td>${com.payout_date || '-'}</td>
                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

    }

}

async function loadTasks() {

    const body = document.getElementById('tasks-body');

    if (!body) return;

    try {

        const { tasks } = await api('/api/admin/tasks');

        body.innerHTML = '';

        if (tasks.length === 0) {

            body.innerHTML = `
                <tr>
                    <td colspan="6">No tasks found.</td>
                </tr>
            `;

            return;
        }

        tasks.forEach(task => {

            body.innerHTML += `
                <tr>

                    <td>${task.title}</td>

                    <td>${task.assigned_to || '-'}</td>

                    <td>${task.status}</td>

                    <td>${task.due_date || '-'}</td>

                    <td>${task.project_ref || '-'}</td>

                    <td>
                        <button onclick="completeTask('${task.id}')">
                            Complete
                        </button>
                    </td>

                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

        body.innerHTML = `
            <tr>
                <td colspan="6">
                    Failed to load tasks.
                </td>
            </tr>
        `;

    }

}
async function loadCommissions() {

    const body = document.getElementById('commissions-body');

    if (!body) return;

    try {

        const { commissions } = await api('/api/admin/commissions');

        body.innerHTML = '';

        if (commissions.length === 0) {

            body.innerHTML = `
                <tr>
                    <td colspan="6">
                        No commissions found.
                    </td>
                </tr>
            `;

            return;

        }

        commissions.forEach(com => {

            body.innerHTML += `
                <tr>

                    <td>${com.affiliate_id}</td>

                    <td>$${Number(com.amount).toFixed(2)}</td>

                    <td>${com.status}</td>

                    <td>${com.created_at
                        ? new Date(com.created_at).toLocaleDateString()
                        : '-'}</td>

                    <td>${com.payout_date || '-'}</td>

                    <td>

                        <button onclick="markCommissionPaid('${com.id}')">

                            Mark Paid

                        </button>

                    </td>

                </tr>
            `;

        });

    } catch (err) {

        console.error(err);

        body.innerHTML = `
            <tr>
                <td colspan="6">
                    Failed to load commissions.
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
        await loadApplications();
        break;
    case 'admin-tasks':
    await loadTasks();
    break;

    case 'admin-commissions':
    await loadCommissions();
    break;

    case 'worker':
    await loadWorkerTasks();
    break;

   case 'affiliate':
    await loadAffiliateDashboard();
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
async function markCommissionPaid(id) {

    try {

        await api(`/api/admin/commissions/${id}/paid`, {
            method: 'PATCH'
        });

        await loadCommissions();

        alert('Commission marked as paid.');

    } catch (err) {

        alert(err.message);

    }

}
async function acceptApplication(id) {

    try {

        await api(`/api/admin/applications/${id}/accept`, {
            method: 'PATCH'
        });

        await loadApplications();

        alert('Application accepted.');

    } catch (err) {

        alert(err.message);

    }

}

async function rejectApplication(id) {

    try {

        await api(`/api/admin/applications/${id}/reject`, {
            method: 'PATCH'
        });

        await loadApplications();

        alert('Application rejected.');

    } catch (err) {

        alert(err.message);

    }

}
