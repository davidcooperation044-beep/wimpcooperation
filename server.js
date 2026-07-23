require('dotenv').config({ path: '.env.local' });

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const { createClient } = require('@supabase/supabase-js');
const { sendWelcomeEmail, sendRejectionEmail } = require('./utils/email');

const app = express();

const PORT = process.env.PORT || 3000;

// ================================
// Supabase
// ================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY
) {
    throw new Error('Missing Supabase environment variables.');
}

const supabaseAdmin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
);

const supabaseAuth = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// ================================
// Express
// ================================

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 2
    }
}));
// ================================
// Helper Functions
// ================================

function generatePassword(length = 12) {

    const chars =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

    let password = '';

    for (let i = 0; i < length; i++) {

        password += chars.charAt(
            Math.floor(Math.random() * chars.length)
        );

    }

    return password;

}

async function resolvePortalUser(authId) {

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .select('*')
        .eq('id', authId)
        .maybeSingle();

    if (error) {

        console.error(error);
        return null;

    }

    if (!data) return null;

    if (data.status !== 'active')
        return null;

    return data;

}

function requireAuth(role = null) {

    return (req, res, next) => {

        if (!req.session.user) {

            return res.status(401).json({
                message: 'Not authenticated.'
            });

        }

        if (
            role &&
            req.session.user.role !== role
        ) {

            return res.status(403).json({
                message: 'Forbidden.'
            });

        }

        next();

    };

}
// ================================
// Authentication Routes
// ================================

app.post('/api/login', async (req, res) => {

    try {

        const { email, password } = req.body;

        if (!email || !password) {

            return res.status(400).json({
                message: 'Email and password are required.'
            });

        }

        const { data, error } =
            await supabaseAuth.auth.signInWithPassword({

                email,
                password

            });

        if (error || !data.user) {

            return res.status(401).json({
                message: error?.message || 'Invalid email or password.'
            });

        }

        const portalUser =
            await resolvePortalUser(data.user.id);

        if (!portalUser) {

            return res.status(403).json({
                message: 'No active portal account found.'
            });

        }

        req.session.user = {

            id: portalUser.id,
            email: portalUser.email,
            role: portalUser.role,
            job_title: portalUser.job_title || null

        };

        res.json({
            user: req.session.user
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to login.'
        });

    }

});

app.post('/api/logout', (req, res) => {

    req.session.destroy(() => {

        res.json({
            message: 'Logged out successfully.'
        });

    });

});

app.get('/api/user', (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({
            message: 'Not authenticated.'
        });

    }

    res.json({
        user: req.session.user
    });

});

// ================================
// Admin Routes
// ================================

// Dashboard Statistics
app.get('/api/admin/stats', requireAuth('admin'), async (req, res) => {

    try {

        const [
            { count: pendingApplications },
            { count: activeWorkers },
            { count: activeAffiliates }
        ] = await Promise.all([

            supabaseAdmin
                .from('applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'new'),

            supabaseAdmin
                .from('portal_users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'worker')
                .eq('status', 'active'),

            supabaseAdmin
                .from('portal_users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'affiliate')
                .eq('status', 'active')

        ]);

        res.json({

            pendingApplications:
                pendingApplications || 0,

            activeWorkers:
                activeWorkers || 0,

            activeAffiliates:
                activeAffiliates || 0

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to load dashboard.'
        });

    }

});

// Staff List
app.get('/api/admin/staff', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .select('*')
        .order('created_at', {
            ascending: false
        });

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        staff: data
    });

});

// Update Staff
app.patch('/api/admin/staff/:id', requireAuth('admin'), async (req, res) => {

    const updates = {};

    if (req.body.role)
        updates.role = req.body.role;

    if (req.body.status)
        updates.status = req.body.status;

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        staff: data
    });

});

// Application List
app.get('/api/admin/applications', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('applications')
        .select('*')
        .order('created_at', {
            ascending: false
        });

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        applications: data
    });

});
// ================================
// Application Approval Routes
// ================================

app.patch('/api/admin/applications/:id/accept', requireAuth('admin'), async (req, res) => {

    try {

        const { id } = req.params;

        // Load application
        const { data: application, error: appError } =
            await supabaseAdmin
                .from('applications')
                .select('*')
                .eq('id', id)
                .single();

        if (appError || !application) {

            return res.status(404).json({
                message: 'Application not found.'
            });

        }

        if (application.status === 'accepted') {

            return res.status(400).json({
                message: 'Application already accepted.'
            });

        }

        // Determine portal role
        let portalRole = 'worker';

        if (
            application.role_interest &&
            application.role_interest.toLowerCase() === 'affiliate'
        ) {
            portalRole = 'affiliate';
        }

        // Generate temporary password
        const password = generatePassword();

        // Create Supabase Auth user
        const { data: authData, error: authError } =
            await supabaseAdmin.auth.admin.createUser({

                email: application.email,

                password,

                email_confirm: true

            });

        if (authError) {

            return res.status(500).json({
                message: authError.message
            });

        }

        // Create portal user
        const { error: portalError } =
            await supabaseAdmin
                .from('portal_users')
                .insert({

                    id: authData.user.id,

                    email: application.email,

                    role: portalRole,

                    job_title: application.role_interest,

                    status: 'active'

                });

        if (portalError) {

            // Roll back auth account
            await supabaseAdmin.auth.admin.deleteUser(
                authData.user.id
            );

            return res.status(500).json({
                message: portalError.message
            });

        }

        // Remove the application record now that the applicant has
        // been hired — the portal_users row is the new source of truth.
        await supabaseAdmin
            .from('applications')
            .delete()
            .eq('id', id);

        // Send welcome email — isolate this so a mail failure doesn't
        // masquerade as a failure to accept the application (the hire
        // above has already succeeded at this point).
        let emailSent = true;
        try {

            await sendWelcomeEmail(
                application.email,
                password,
                application.role_interest
            );

        } catch (emailErr) {

            emailSent = false;
            console.error('Application accepted but welcome email failed:', emailErr);

        }

        res.json({
            message: emailSent
                ? 'Application accepted successfully.'
                : 'Application accepted, but the welcome email failed to send. Check server logs.',
            emailSent
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to accept application.'
        });

    }

});

app.patch('/api/admin/applications/:id/reject', requireAuth('admin'), async (req, res) => {

    try {

        const { id } = req.params;

        const { data: application, error } =
            await supabaseAdmin
                .from('applications')
                .select('*')
                .eq('id', id)
                .single();

        if (error || !application) {

            return res.status(404).json({
                message: 'Application not found.'
            });

        }

        // Remove the application record now that it's been declined.
        await supabaseAdmin
            .from('applications')
            .delete()
            .eq('id', id);

        let emailSent = true;
        try {

            await sendRejectionEmail(
                application.email
            );

        } catch (emailErr) {

            emailSent = false;
            console.error('Application rejected but rejection email failed:', emailErr);

        }

        res.json({
            message: emailSent
                ? 'Application rejected successfully.'
                : 'Application rejected, but the notification email failed to send. Check server logs.',
            emailSent
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to reject application.'
        });

    }

});
// ================================
// Worker Routes
// ================================

app.get('/api/worker/tasks', requireAuth('worker'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('worker_tasks')
        .select('*')
        .eq('assigned_to', req.session.user.id)
        .order('due_date', {
            ascending: true
        });

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        tasks: data || []
    });

});

// ================================
// Admin Task Routes
// ================================

app.get('/api/admin/tasks', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('worker_tasks')
        .select('*')
        .order('due_date', {
            ascending: true
        });

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        tasks: data || []
    });

});

app.patch('/api/admin/tasks/:id/complete', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;

    const { error } = await supabaseAdmin
        .from('worker_tasks')
        .update({
            status: 'complete'
        })
        .eq('id', id);

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        message: 'Task marked complete.'
    });

});

// ================================
// Admin Commission Routes
// ================================

app.get('/api/admin/commissions', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('affiliate_commissions')
        .select('*')
        .order('created_at', {
            ascending: false
        });

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        commissions: data || []
    });

});

app.patch('/api/admin/commissions/:id/paid', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;

    const { error } = await supabaseAdmin
        .from('affiliate_commissions')
        .update({
            status: 'paid',
            payout_date: new Date().toISOString().slice(0, 10)
        })
        .eq('id', id);

    if (error) {

        console.error(error);

        return res.status(500).json({
            message: error.message
        });

    }

    res.json({
        message: 'Commission marked as paid.'
    });

});

app.get('/api/affiliate/data', requireAuth('affiliate'), async (req, res) => {

    const affiliateId = req.session.user.id;

    const [
        { data: commissions, error: commissionError },
        { data: referrals, error: referralError }
    ] = await Promise.all([

        supabaseAdmin
            .from('affiliate_commissions')
            .select('*')
            .eq('affiliate_id', affiliateId)
            .order('created_at', {
                ascending: false
            }),

        supabaseAdmin
            .from('affiliate_referrals')
            .select('*')
            .eq('affiliate_id', affiliateId)

    ]);

    if (commissionError || referralError) {

        return res.status(500).json({
            message: 'Unable to load affiliate data.'
        });

    }

    res.json({

        commissions: commissions || [],

        referrals: referrals || []

    });

});

// ================================
// Protected Pages
// ================================

app.get('/admin.html', requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin-staff.html', requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-staff.html'));
});

app.get('/admin-applications.html', requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-applications.html'));
});

app.get('/admin-tasks.html', requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-tasks.html'));
});

app.get('/admin-commissions.html', requireAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-commissions.html'));
});

app.get('/worker.html', requireAuth('worker'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'worker.html'));
});

app.get('/affiliate.html', requireAuth('affiliate'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'affiliate.html'));
});

// ================================
// Public Pages
// ================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/logout.html', (req, res) => {

    req.session.destroy(() => {

        res.sendFile(
            path.join(__dirname, 'public', 'logout.html')
        );

    });

});

// ================================
// Static Files
// ================================

app.use(
    express.static(
        path.join(__dirname, 'public')
    )
);

// ================================
// Start Server
// ================================

app.listen(PORT, () => {

    console.log(
        `Server running on http://localhost:${PORT}`
    );

});
