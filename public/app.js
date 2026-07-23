const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const loginButton = document.querySelector('#login-button');
const userBadge = document.querySelector('#user-badge');
const logoutButton = document.querySelector('#logout-button');

async function getCurrentUser() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      throw new Error('Not authenticated.');
    }
    return response.json();
  } catch (error) {
    return null;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!loginButton) return;
  loginButton.disabled = true;
  loginButton.textContent = 'Signing in...';
  loginError.textContent = '';

  const email = document.querySelector('#email').value;
  const password = document.querySelector('#password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.message || 'Login failed.');
    }

    const { user } = await response.json();
    if (user.role === 'admin') {
      window.location.href = '/admin.html';
    } else if (user.role === 'worker') {
      window.location.href = '/worker.html';
    } else if (user.role === 'affiliate') {
      window.location.href = '/affiliate.html';
    } else {
      window.location.href = '/';
    }
  } catch (error) {
    loginError.textContent = error.message || 'Login failed.';
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Sign in';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  window.location.href = '/login.html';
}

async function initializePage() {
  const page = document.body.dataset.page;

  if (page === 'home') {
    const user = await getCurrentUser();
    if (user) {
      window.location.href = user.user.role === 'admin' ? '/admin.html' : user.user.role === 'worker' ? '/worker.html' : '/affiliate.html';
    }
    return;
  }

  if (page === 'login') {
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
    return;
  }

  const authUser = await getCurrentUser();
  if (!authUser || !authUser.user) {
    window.location.href = '/login.html';
    return;
  }

  if (userBadge) {
    userBadge.textContent = `${authUser.user.name} • ${authUser.user.role}`;
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }

  if (page === 'admin') {
    const statsElement = document.querySelector('#admin-stats');
    const response = await fetch('/api/admin/stats');
    if (response.ok) {
      const stats = await response.json();
      statsElement.innerHTML = `
        <div class="top-card-grid">
          <div class="dashboard-card"><h3>Pending applications</h3><p class="large-number">${stats.pendingApplications}</p></div>
          <div class="dashboard-card"><h3>Active workers</h3><p class="large-number">${stats.activeWorkers}</p></div>
          <div class="dashboard-card"><h3>Active affiliates</h3><p class="large-number">${stats.activeAffiliates}</p></div>
        </div>
      `;
    }
  }

  if (page === 'worker') {
    const tasksBody = document.querySelector('#worker-tasks tbody');
    const response = await fetch('/api/worker/tasks');
    if (response.ok) {
      const data = await response.json();
      tasksBody.innerHTML = data.tasks.map((task) => `
        <tr>
          <td>${task.title}</td>
          <td>${task.status.replace('_', ' ')}</td>
          <td>${task.due_date || '—'}</td>
          <td>${task.project_ref || '—'}</td>
        </tr>
      `).join('');
    }
  }

  if (page === 'affiliate') {
    const referralsBody = document.querySelector('#referrals-body');
    const commissionsBody = document.querySelector('#commissions-body');
    const pendingTotalEl = document.querySelector('#pending-total');
    const paidTotalEl = document.querySelector('#paid-total');
    const referralCodeEl = document.querySelector('#referral-code');

    const response = await fetch('/api/affiliate/data');
    if (response.ok) {
      const data = await response.json();
      const pendingTotal = data.commissions.filter((row) => row.status === 'pending').reduce((sum, row) => sum + Number(row.amount), 0);
      const paidTotal = data.commissions.filter((row) => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount), 0);

      pendingTotalEl.textContent = `$${pendingTotal.toFixed(2)}`;
      paidTotalEl.textContent = `$${paidTotal.toFixed(2)}`;
      referralCodeEl.textContent = data.referrals[0]?.code || 'No referral code assigned';

      referralsBody.innerHTML = data.referrals.map((row) => `
        <tr><td>${row.code}</td><td>${row.clicks}</td><td>${row.conversions}</td></tr>
      `).join('');

      commissionsBody.innerHTML = data.commissions.map((row) => `
        <tr><td>$${Number(row.amount).toFixed(2)}</td><td>${row.status}</td><td>${row.payout_date || '—'}</td></tr>
      `).join('');
    }
  }
}



// <-- ADD THIS HERE
if (page === 'admin-staff') {

    const body = document.getElementById('staff-body');

    const response = await fetch('/api/admin/staff');

    if (!response.ok) {
        body.innerHTML = '<tr><td colspan="4">Unable to load staff.</td></tr>';
        return;
    }

    const { staff } = await response.json();

    body.innerHTML = staff.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${user.status}</td>
            <td>
                <button onclick="editStaff('${user.id}')">Edit</button>
            </td>
        </tr>
    `).join('');
}

if (page === 'admin-applications') {

    const body = document.getElementById('applications-body');

    const response = await fetch('/api/admin/applications');

    if (!response.ok) {
        body.innerHTML = '<tr><td colspan="6">Unable to load applications.</td></tr>';
        return;
    }

    const { applications } = await response.json();

    body.innerHTML = applications.map(app => `
        <tr>
            <td>${app.name}</td>
            <td>${app.role_interest || '-'}</td>
            <td>${app.status}</td>
            <td>${app.cv_storage_path
                ? `<a href="${app.cv_storage_path}" target="_blank">Download</a>`
                : '-'}</td>
            <td>
                <button onclick="acceptApplication('${app.id}')">Accept</button>
                <button onclick="rejectApplication('${app.id}')">Reject</button>
            </td>
        </tr>
    `).join('');
}

} // <-- end initializePage()

async function updateRole(...) {
    ...
}

async function updateStatus(...) {
    ...
}


initializePage();
