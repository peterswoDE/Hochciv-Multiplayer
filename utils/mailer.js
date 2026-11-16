const nodemailer = require('nodemailer');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: SMTP_PORT,
    // Port 465 is TLS from the start; on the others STARTTLS is required, so a man in the middle
    // can't strip it and read the login and the codes (SMTP_REQUIRE_TLS=off for a server without TLS)
    requireTLS: SMTP_PORT !== 465 && process.env.SMTP_REQUIRE_TLS !== 'off',
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

const sendMail = async (to, subject, text, html) => {
    // Outside production (local) mails are logged, so codes and links can be read from the console.
    // In production without SMTP (e.g. staging) too – but with the one-time codes hidden, unless
    // MAIL_LOG_CODES=on: whoever reads the logs could otherwise use anybody's reset or 2FA code.
    const local = process.env.NODE_ENV !== 'production';
    if (local || !process.env.SMTP_HOST) {
        const shown = local || process.env.MAIL_LOG_CODES === 'on' ? text : String(text).replace(/\b\d{6}\b/g, '••••••');
        console.log('\n--- SIMULATED EMAIL ---');
        console.log(`To: ${to}\nSubject: ${subject}\nText:\n${shown}`);
        console.log('-----------------------\n');
    }
    // If SMTP is not configured, logging is all we do
    if (!process.env.SMTP_HOST) return true;

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Hochciv Server" <noreply@hochciv.local>',
            to,
            subject,
            text,
            html
        });
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = {
    sendMail
};
