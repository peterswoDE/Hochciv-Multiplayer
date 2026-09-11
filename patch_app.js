const fs = require('fs');
let code = fs.readFileSync('client/app.js', 'utf8');

const newLoginLogic = `
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok && !data.error) {
                if (data.mfaRequired) {
                    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                    document.getElementById('form-mfa').classList.add('active');
                    document.getElementById('form-mfa').style.display = 'block';
                    
                    const totpSection = document.getElementById('mfa-totp-section');
                    const passkeySection = document.getElementById('mfa-passkey-section');
                    
                    if (data.methods.totp) totpSection.style.display = 'block';
                    else totpSection.style.display = 'none';
                    
                    if (data.methods.passkey) passkeySection.style.display = 'block';
                    else passkeySection.style.display = 'none';
                } else {
                    sessionStorage.removeItem('hochciv_guest');
                    await fetchMe();
                }
            } else {
                showError('login-error', data.error || 'Login fehlgeschlagen.');
            }
        } catch (err) {
            showError('login-error', 'Netzwerkfehler');
        }
    });

    // --- MFA Logic ---
    document.getElementById('form-mfa').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const token = document.getElementById('mfa-totp-code').value;
        if (!token) return;

        try {
            const res = await fetch('/api/auth/login/totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await res.json();
            if (res.ok && !data.error) {
                sessionStorage.removeItem('hochciv_guest');
                await fetchMe();
            } else {
                showError('mfa-error', data.error || 'Falscher Code');
            }
        } catch (err) {
            showError('mfa-error', 'Netzwerkfehler');
        }
    });

    document.getElementById('btn-submit-mfa-passkey').addEventListener('click', async () => {
        try {
            const { startAuthentication } = window.SimpleWebAuthnBrowser;
            const res = await fetch('/api/auth/login/passkey/options', { method: 'POST' });
            if (!res.ok) throw new Error('Options failed');
            const options = await res.json();
            
            let asseResp;
            try {
                asseResp = await startAuthentication(options);
            } catch (error) {
                showError('mfa-error', 'Authentifizierung abgebrochen.');
                return;
            }

            const verifyRes = await fetch('/api/auth/login/passkey/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(asseResp),
            });
            const vData = await verifyRes.json();
            if (verifyRes.ok && !vData.error) {
                sessionStorage.removeItem('hochciv_guest');
                await fetchMe();
            } else {
                showError('mfa-error', vData.error || 'Fehler');
            }
        } catch (e) {
            showError('mfa-error', 'Ein Fehler ist aufgetreten.');
        }
    });
`;

code = code.replace(/formLogin\.addEventListener\('submit', async \(e\) => \{[\s\S]*?\}\);/, newLoginLogic);
fs.writeFileSync('client/app.js', code);
`;
