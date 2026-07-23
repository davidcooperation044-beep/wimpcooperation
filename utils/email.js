const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWelcomeEmail(email, password, role) {

    await resend.emails.send({

        from: process.env.FROM_EMAIL,

        to: email,

        subject: 'Welcome to Wimpy Portal',

        html: `
            <h2>Congratulations!</h2>

            <p>Your application has been accepted.</p>

            <p><strong>Role:</strong> ${role}</p>

            <p><strong>Email:</strong> ${email}</p>

            <p><strong>Password:</strong> ${password}</p>

            <p>
                Login here:
                <br>
                <a href="${process.env.APP_URL}/login.html">
               Wimpy Portal
            </a>
            </p>

            <p>Please change your password after your first login.</p>
        `

    });

}

module.exports = {
    sendWelcomeEmail
};



async function sendRejectionEmail(email) {

    await resend.emails.send({

        from: process.env.FROM_EMAIL,

        to: email,

        subject: 'Your Wimpy Application',

        html: `
            <h2>Thank you for your application</h2>

            <p>
                We appreciate your interest in joining Wimpy.
            </p>

            <p>
                After reviewing your application, we have decided
                not to proceed at this time.
            </p>

            <p>
                We encourage you to apply again in the future.
            </p>
        `

    });

}

module.exports = {
    sendWelcomeEmail,
    sendRejectionEmail
};
