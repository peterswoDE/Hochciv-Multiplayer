const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

const sendMail = async (to, subject, text, html) => {
    // Outside production (local/staging) always log mails, so codes and links can be read from the console
    if (process.env.NODE_ENV !== 'production' || !process.env.SMTP_HOST) {
        console.log('\n--- SIMULATED EMAIL ---');
        console.log(`To: ${to}\nSubject: ${subject}\nText:\n${text}`);
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
