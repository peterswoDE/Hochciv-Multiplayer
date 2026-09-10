const fs = require('fs');
let content = fs.readFileSync('client/app.js', 'utf8');

// 1. Add form variables
content = content.replace(
    "const formActivate = document.getElementById('form-activate');",
    "const formActivate = document.getElementById('form-activate');\n    const formResetRequest = document.getElementById('form-reset-request');\n    const formResetConfirm = document.getElementById('form-reset-confirm');"
);

// 2. Replace the forgot password mock with actual implementations
const replaceBlock = `
    // Forgot Password Flow
    document.getElementById('link-forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        formResetRequest.classList.add('active');
    });

    document.getElementById('btn-back-to-login').addEventListener('click', () => {
        switchAuthTab('form-login');
    });

    document.getElementById('btn-cancel-reset').addEventListener('click', () => {
        switchAuthTab('form-login');
    });

    formResetRequest.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const email = document.getElementById('reset-email').value;

        try {
            const res = await fetch('/api/auth/reset-password/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            
            if (res.ok && !data.error) {
                document.getElementById('reset-conf-email').value = email;
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                formResetConfirm.classList.add('active');
            } else {
                showError('reset-req-error', data.error || 'Fehler beim Senden.');
            }
        } catch (err) {
            showError('reset-req-error', 'Netzwerkfehler');
        }
    });

    formResetConfirm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const email = document.getElementById('reset-conf-email').value;
        const code = document.getElementById('reset-conf-code').value;
        const newPassword = document.getElementById('reset-conf-pw').value;

        try {
            const res = await fetch('/api/auth/reset-password/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, newPassword })
            });
            const data = await res.json();
            
            if (res.ok && !data.error) {
                alert('Dein Passwort wurde erfolgreich aktualisiert.');
                switchAuthTab('form-login');
            } else {
                showError('reset-conf-error', data.error || 'Fehler beim Zurücksetzen.');
            }
        } catch (err) {
            showError('reset-conf-error', 'Netzwerkfehler');
        }
    });
`;

content = content.replace(
    /\/\/ Forgot Password Mock[\s\S]*?alert\('Bitte kontaktiere den Administrator, um dein Passwort zurückzusetzen\.'\);\s*\}\);/,
    replaceBlock
);
// Also try to match the broken encoding string if it was corrupted:
content = content.replace(
    /\/\/ Forgot Password Mock[\s\S]*?alert\('Bitte kontaktiere den Administrator, um dein Passwort zur.*?ckzusetzen\.'\);\s*\}\);/,
    replaceBlock
);

fs.writeFileSync('client/app.js', content, 'utf8');
