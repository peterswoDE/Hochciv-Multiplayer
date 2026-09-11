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
    // If SMTP is not configured, we just log it to output so the user can test locally without an email server
    if (!process.env.SMTP_HOST) {
        console.log('\n--- SIMULATED EMAIL ---');
        console.log(`To: ${to}\nSubject: ${subject}\nText:\n${text}`);
        console.log('-----------------------\n');
        return true;
    }

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
