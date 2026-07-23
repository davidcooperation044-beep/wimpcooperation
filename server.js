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

app.get('/api/admin/stats', requireAuth('admin'), async (req, res) => {
  const [{ count: activeWorkers }, { count: activeAffiliates }] = await Promise.all([
    supabaseAdmin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'worker').eq('status', 'active'),
    supabaseAdmin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'affiliate').eq('status', 'active')
  ]);

  // No applications table exists yet in supabase/migrations — add one and
  // query it here once applications are tracked in the database.
  res.json({
    pendingApplications: 0,
    activeWorkers: activeWorkers || 0,
    activeAffiliates: activeAffiliates || 0
  });
});

app.get('/api/worker/tasks', requireAuth('worker'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('worker_tasks')
    .select('id, title, status, due_date, project_ref')
    .eq('assigned_to', req.session.user.id)
    .order('due_date', { ascending: true });

  if (error) {
    console.warn('Unable to load worker tasks:', error.message);
    return res.status(500).json({ message: 'Unable to load tasks.' });
  }

  res.json({ tasks: data || [] });
});

app.get('/api/affiliate/data', requireAuth('affiliate'), async (req, res) => {
  const affiliateId = req.session.user.id;

  const [{ data: userReferrals, error: referralsError }, { data: userCommissions, error: commissionsError }] = await Promise.all([
    supabaseAdmin.from('affiliate_referrals').select('code, clicks, conversions').eq('affiliate_id', affiliateId),
    supabaseAdmin.from('affiliate_commissions').select('id, amount, status, payout_date').eq('affiliate_id', affiliateId).order('payout_date', { ascending: false })
  ]);

  if (referralsError || commissionsError) {
    console.warn('Unable to load affiliate data:', referralsError?.message || commissionsError?.message);
    return res.status(500).json({ message: 'Unable to load affiliate data.' });
  }

  res.json({ referrals: userReferrals || [], commissions: userCommissions || [] });
});

app.get('/admin.html', requireAuth('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const adminSubPages = ['admin-applications.html', 'admin-staff.html', 'admin-tasks.html', 'admin-commissions.html'];
adminSubPages.forEach((page) => {
  app.get(`/${page}`, requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', page));
  });
});

app.get('/worker.html', requireAuth('worker'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'worker.html'));
});

app.get('/affiliate.html', requireAuth('affiliate'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'affiliate.html'));
});

app.get('/logout.html', (req, res) => {
  req.session.destroy(() => {
    res.sendFile(path.join(__dirname, 'public', 'logout.html'));
  });
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

app.get('/api/admin/applications', requireAuth('admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  res.json({ applications: data });
});

app.get('/api/admin/staff', requireAuth('admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('portal_users')
    .select('id,email,role,status,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Unable to load staff.'
    });
  }

  res.json({
    staff: data
  });
});

