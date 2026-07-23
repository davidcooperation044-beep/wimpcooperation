require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const { sendWelcomeEmail } = require('./utils/email');
const {
    sendWelcomeEmail,
    sendRejectionEmail
} = require('./utils/email');

const app = express();

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
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
async function resolvePortalUser(authId) {

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .select('*')
        .eq('id', authId)
        .single();

    if (error) return null;

    if (data.status !== 'active')
        return null;

    return data;

}
function requireAuth(role) {

    return (req, res, next) => {

        if (!req.session.user) {
            return res.status(401).json({
                message: 'Not authenticated.'
            });
        }

        if (role && req.session.user.role !== role) {
            return res.status(403).json({
                message: 'Forbidden.'
            });
        }

        next();

    };

}
function generatePassword() {
    return crypto
        .randomBytes(12)
        .toString('base64')
        .replace(/[+/=]/g, '')
        .slice(0, 12);
}

app.post('/api/login', async (req, res) => {

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
        role: portalUser.role
    };

    res.json({
        user: req.session.user
    });

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
            pendingApplications: pendingApplications || 0,
            activeWorkers: activeWorkers || 0,
            activeAffiliates: activeAffiliates || 0
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to load dashboard.'
        });

    }

});
app.get('/api/admin/staff', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .select('*')
        .order('created_at', { ascending: false });

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
app.patch('/api/admin/staff/:id', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;
    const { role, status } = req.body;

    const updates = {};

    if (role) updates.role = role;
    if (status) updates.status = status;

    const { data, error } = await supabaseAdmin
        .from('portal_users')
        .update(updates)
        .eq('id', id)
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
app.get('/api/admin/applications', requireAuth('admin'), async (req, res) => {

    const { data, error } = await supabaseAdmin
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false });

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

app.patch('/api/admin/applications/:id/accept', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;

    try {

        // Find application
        const { data: application, error } = await supabaseAdmin
            .from('applications')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !application) {
            return res.status(404).json({
                message: 'Application not found.'
            });
        }

        if (application.status === 'accepted') {
            return res.status(400).json({
                message: 'Application already accepted.'
            });
        }

        // Generate password
        const password = generatePassword();

        // Create Auth user
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
        const { error: portalError } = await supabaseAdmin
            .from('portal_users')
            .insert({

                id: authData.user.id,

                email: application.email,

                role: application.role_interest,

                status: 'active'

            });

        if (portalError) {

            return res.status(500).json({
                message: portalError.message
            });

        }

        // Update application
        await supabaseAdmin
            .from('applications')
            .update({

                status: 'accepted',

                reviewed_by: req.session.user.id

            })
            .eq('id', id);

        res.json({

            message: 'Application accepted.',

            credentials: {

                email: application.email,

                password

            }

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to accept application.'
        });

    }

});

app.patch('/api/admin/applications/:id/accept', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;

    // Get the application
    const { data: application, error: appError } = await supabaseAdmin
        .from('applications')
        .select('*')
        .eq('id', id)
        .single();

    if (appError) {
        return res.status(500).json({
            message: appError.message
        });
    }

    // Update application status
    const { error: updateError } = await supabaseAdmin
        .from('applications')
        .update({
            status: 'accepted',
            reviewed_by: req.session.user.id
        })
        .eq('id', id);

    if (updateError) {
        return res.status(500).json({
            message: updateError.message
        });
    }

    // Create portal user ONLY for job applications
    if (application.type === 'job_application') {

        const role =
            application.role_interest === 'affiliate'
                ? 'affiliate'
                : 'worker';

        await supabaseAdmin
            .from('portal_users')
            .upsert({
                id: application.user_id,
                email: application.email,
                role: role,
                status: 'active'
            });
        await sendWelcomeEmail(
    application.email,
    password,
    application.role_interest
);

    }

    res.json({
        success: true
    });

});

app.patch('/api/admin/applications/:id/accept', requireAuth('admin'), async (req, res) => {

    try {

        const { id } = req.params;

        // Get application
        const { data: application, error: appError } = await supabaseAdmin
            .from('applications')
            .select('*')
            .eq('id', id)
            .single();

        if (appError || !application) {
            return res.status(404).json({
                message: 'Application not found.'
            });
        }

        // Generate a temporary password
        const password = crypto
            .randomBytes(12)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 12);

        // Determine the role
        const role =
            application.role_interest ||
            (application.type === 'job_application'
                ? 'worker'
                : 'affiliate');

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
        const { error: portalError } = await supabaseAdmin
            .from('portal_users')
            .insert({

                id: authData.user.id,

                email: application.email,

                role,

                status: 'active'

            });

        if (portalError) {

            // Roll back the auth user if portal insert fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

            return res.status(500).json({
                message: portalError.message
            });

        }

        // Update application
        await supabaseAdmin
            .from('applications')
            .update({

                status: 'accepted',

                reviewed_by: req.session.user.id

            })
            .eq('id', id);

        // Send email
        await sendWelcomeEmail(
            application.email,
            password,
            role
        );

        res.json({
            message: 'Application accepted successfully.'
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: 'Unable to accept application.'
        });

    }

});

app.patch('/api/admin/applications/:id/reject', requireAuth('admin'), async (req, res) => {

    const { id } = req.params;

    const { data, error } = await supabaseAdmin
        .from('applications')
        .update({
            status: 'rejected',
            reviewed_by: req.session.user.id
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return res.status(500).json({
            message: error.message
        });
    }

    res.json({
        application: data
    });

});

app.patch('/api/admin/applications/:id/reject', requireAuth('admin'), async (req, res) => {

    try {

        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('applications')
            .update({

                status: 'rejected',

                reviewed_by: req.session.user.id

            })
            .eq('id', id);

        if (error) {

            return res.status(500).json({
                message: error.message
            });

        }

        res.json({
            message: 'Application rejected successfully.'
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
        .order('due_date', { ascending: true });

    if (error) {
        console.error(error);

        return res.status(500).json({
            message: error.message
        });
    }

    res.json({
        tasks: data
    });

});
// ================================
// Affiliate Routes
// ================================

app.get('/api/affiliate/data', requireAuth('affiliate'), async (req, res) => {

    const affiliateId = req.session.user.id;

    const { data: commissions } = await supabaseAdmin
        .from('affiliate_commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false });

    const { data: referrals } = await supabaseAdmin
        .from('affiliate_referrals')
        .select('*')
        .eq('affiliate_id', affiliateId);

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
        res.sendFile(path.join(__dirname, 'public', 'logout.html'));
    });

});
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});



