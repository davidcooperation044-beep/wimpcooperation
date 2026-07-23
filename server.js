require('dotenv').config({ path: '.env.local' });
const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables in .env.local');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace-with-a-secure-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));

const workerTasks = [
  { id: 't1', title: 'Review order history', status: 'pending', due_date: '2026-08-10', project_ref: 'PX-102' },
  { id: 't2', title: 'Update asset inventory', status: 'in_progress', due_date: '2026-08-14', project_ref: 'INV-57' }
];

const referrals = [
  { code: 'WIMPY-A1', clicks: 312, conversions: 21, affiliateId: '3' }
];

const commissions = [
  { id: 'c1', affiliateId: '3', amount: 420.0, status: 'pending', payout_date: '2026-08-21' },
  { id: 'c2', affiliateId: '3', amount: 160.0, status: 'paid', payout_date: '2026-07-19' }
];

async function resolvePortalUserByAuthId(authId) {
  const { data, error } = await supabaseAdmin
    .from('portal_users')
    .select('role, status, email')
    .eq('id', authId)
    .maybeSingle();

  if (error) {
    console.warn('Unable to query portal_users by auth id:', error.message);
    return null;
  }

  if (!data || data.status !== 'active') return null;
  return data;
}

function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
    if (role && req.session.user.role !== role) {
      return res.redirect('/');
    }
    next();
  };
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const { data: sessionData, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !sessionData?.user) {
    console.warn('Supabase login failed:', authError);
    return res.status(401).json({ message: authError?.message || 'Invalid email or password.' });
  }

  const authUserId = sessionData.user.id;
  if (!authUserId) {
    console.warn('Supabase login returned no user id:', sessionData);
    return res.status(500).json({ message: 'Authentication succeeded but user id is missing.' });
  }

  const portalUser = await resolvePortalUserByAuthId(authUserId);
  if (!portalUser) {
    return res.status(403).json({ message: 'No active portal user found for this account.' });
  }

  req.session.user = {
    id: authUserId,
    name: portalUser.email || email,
    email,
    role: portalUser.role
  };

  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully.' });
  });
});

app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }
  res.json({ user: req.session.user });
});

app.get('/api/admin/stats', requireAuth('admin'), (req, res) => {
  res.json({ pendingApplications: 14, activeWorkers: 28, activeAffiliates: 7 });
});

app.get('/api/worker/tasks', requireAuth('worker'), (req, res) => {
  res.json({ tasks: workerTasks.filter((task) => task.assigned_to !== false) });
});

app.get('/api/affiliate/data', requireAuth('affiliate'), (req, res) => {
  const affiliateId = req.session.user.id;
  const userReferrals = referrals.filter((row) => row.affiliateId === affiliateId);
  const userCommissions = commissions.filter((row) => row.affiliateId === affiliateId);
  res.json({ referrals: userReferrals, commissions: userCommissions });
});

app.get('/admin.html', requireAuth('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/worker.html', requireAuth('worker'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'worker.html'));
});

app.get('/affiliate.html', requireAuth('affiliate'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'affiliate.html'));
});

app.get('/logout.html', requireAuth(), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logout.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
