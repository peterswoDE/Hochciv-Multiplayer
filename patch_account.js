const fs = require('fs');
let code = fs.readFileSync('client/account.js', 'utf8');
const addMfaCode = `
    // --- 2FA / MFA Setup ---
    const btnSetupTotp = document.getElementById('btn-setup-totp');
    const btnDisableTotp = document.getElementById('btn-disable-totp');
    const btnSetupPasskey = document.getElementById('btn-setup-passkey');
    const totpModal = document.getElementById('totp-setup-modal');
    
    if (currentUser && currentUser.totpEnabled) {
        btnSetupTotp.style.display = 'none';
        btnDisableTotp.style.display = 'inline-block';
    }

    btnSetupTotp.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/mfa/setup-totp', { method: 'POST' });
            const data = await res.json();
            if (data.qrCodeUrl) {
                document.getElementById('totp-qr').src = data.qrCodeUrl;
                document.getElementById('totp-secret-text').textContent = data.secret;
                document.getElementById('totp-verify-input').value = '';
                document.getElementById('totp-setup-msg').textContent = '';
                totpModal.style.display = 'flex';
            }
        } catch (e) {}
    });

    document.getElementById('btn-verify-totp').addEventListener('click', async () => {
        const token = document.getElementById('totp-verify-input').value;
        const res = await fetch('/api/mfa/verify-totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.ok) {
            totpModal.style.display = 'none';
            btnSetupTotp.style.display = 'none';
            btnDisableTotp.style.display = 'inline-block';
            alert('2FA erfolgreich aktiviert!');
        } else {
            document.getElementById('totp-setup-msg').textContent = data.error || 'Falscher Code';
        }
    });

    btnDisableTotp.addEventListener('click', async () => {
        if (!confirm('2FA wirklich deaktivieren?')) return;
        const res = await fetch('/api/mfa/disable-totp', { method: 'POST' });
        if ((await res.json()).ok) {
            btnSetupTotp.style.display = 'inline-block';
            btnDisableTotp.style.display = 'none';
            alert('2FA deaktiviert.');
        }
    });

    async function loadPasskeys() {
        const res = await fetch('/api/mfa/passkeys');
        const pks = await res.json();
        const list = document.getElementById('passkeys-list');
        if (pks.length === 0) {
            list.innerHTML = 'Keine Passkeys registriert.';
            return;
        }
        list.innerHTML = pks.map(pk => '<div>Passkey hinzugefügt am ' + new Date(pk.createdAt).toLocaleDateString() + ' <button onclick="deletePasskey(\\'' + pk.id + '\\')" style="margin-left:10px; color:red; background:none; border:none; cursor:pointer;">Löschen</button></div>').join('');
    }

    window.deletePasskey = async function(id) {
        if(!confirm('Passkey löschen?')) return;
        await fetch('/api/mfa/passkey/' + id, { method: 'DELETE' });
        loadPasskeys();
    };

    btnSetupPasskey.addEventListener('click', async () => {
        try {
            const { startRegistration } = window.SimpleWebAuthnBrowser;
            const res = await fetch('/api/mfa/passkey/generate-registration', { method: 'POST' });
            const options = await res.json();
            
            let attResp;
            try {
                attResp = await startRegistration(options);
            } catch (error) {
                if (error.name === 'InvalidStateError') {
                    alert('Dieser Passkey ist bereits registriert.');
                } else {
                    alert('Registrierung abgebrochen oder fehlgeschlagen.');
                }
                return;
            }

            const verifyRes = await fetch('/api/mfa/passkey/verify-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(attResp),
            });
            const vData = await verifyRes.json();
            if (vData.ok) {
                alert('Passkey erfolgreich hinzugefügt!');
                loadPasskeys();
            } else {
                alert('Fehler: ' + vData.error);
            }
        } catch (e) {
            console.error(e);
        }
    });

    loadPasskeys();
`;
code = code.replace(/\/\/ --- Admin Functions ---/, addMfaCode + '\n\n    // --- Admin Functions ---');
fs.writeFileSync('client/account.js', code);
