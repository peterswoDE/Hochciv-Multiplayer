
// Unregister broken service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
            console.log('Unregistered SW');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Views
    const viewLoading = document.getElementById('view-loading');
    const viewLanding = document.getElementById('view-landing');
    const viewAuth = document.getElementById('view-auth');
    const viewDashboard = document.getElementById('view-dashboard');

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');

    // Forms
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const formActivate = document.getElementById('form-activate');
    const formResetRequest = document.getElementById('form-reset-request');
    const formResetConfirm = document.getElementById('form-reset-confirm');

    // Dashboard Elements
    const dashUsername = document.getElementById('dash-username');
    const dashMmr = document.getElementById('dash-mmr');
    const dashGames = document.getElementById('dash-games');
    const btnLogout = document.getElementById('btn-logout');

    let currentUser = null;

    // --- View Management ---
    function showView(view) {
        viewLoading.classList.remove('active');
        if (viewLanding) viewLanding.classList.remove('active');
        viewAuth.classList.remove('active');
        viewDashboard.classList.remove('active');
        view.classList.add('active');
    }

    function switchAuthTab(targetId) {
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === targetId);
        });
        authForms.forEach(form => {
            form.classList.toggle('active', form.id === targetId);
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchAuthTab(btn.dataset.target));
    });

    // Landing Buttons
    if (document.getElementById('btn-guest')) {
        document.getElementById('btn-guest').addEventListener('click', () => {
            sessionStorage.setItem('hochciv_guest', 'true');
            window.location.href = '/game';
        });
    }
    if (document.getElementById('btn-show-login')) {
        document.getElementById('btn-show-login').addEventListener('click', () => {
            showView(viewAuth);
        });
    }

    // --- API Interactions ---
    async function fetchMe() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                if (data.username) {
                    currentUser = data;
                    if (window.self !== window.top) {
                        window.parent.location.reload();
                        return;
                    }
                    dashUsername.innerText = data.username;
                    dashMmr.innerText = data.mmr || 1200;
                    dashGames.innerText = data.gamesPlayed || 0;
                    showView(viewDashboard);
                    return;
                }
            }
        } catch (e) {
            console.error('Error fetching profile:', e);
        }
        showView(viewLanding ? viewLanding : viewAuth);
    }

    function showError(elementId, msg) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerText = msg;
            el.style.display = 'block';
        }
    }

    function clearErrors() {
        document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
    }

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
                    const emailSection = document.getElementById('mfa-email-section');
                    
                    if (data.methods.totp) totpSection.style.display = 'block';
                    else totpSection.style.display = 'none';
                    
                    if (data.methods.passkey) passkeySection.style.display = 'block';
                    else passkeySection.style.display = 'none';

                    if (data.methods.email) emailSection.style.display = 'block';
                    else emailSection.style.display = 'none';
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

    const btnRequestEmailOtp = document.getElementById('btn-request-email-otp');
    if (btnRequestEmailOtp) btnRequestEmailOtp.addEventListener('click', async () => {
        clearErrors();
        btnRequestEmailOtp.disabled = true;
        btnRequestEmailOtp.textContent = 'Wird gesendet...';
        try {
            const res = await fetch('/api/auth/login/email-otp/request', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.ok) {
                btnRequestEmailOtp.style.display = 'none';
                document.getElementById('mfa-email-input-container').style.display = 'block';
            } else {
                showError('mfa-error', data.error || 'Fehler beim Senden.');
                btnRequestEmailOtp.disabled = false;
                btnRequestEmailOtp.textContent = 'Code per E-Mail anfordern';
            }
        } catch (e) {
            showError('mfa-error', 'Netzwerkfehler');
            btnRequestEmailOtp.disabled = false;
            btnRequestEmailOtp.textContent = 'Code per E-Mail anfordern';
        }
    });

    const btnSubmitEmailOtp = document.getElementById('btn-submit-mfa-email');
    if (btnSubmitEmailOtp) btnSubmitEmailOtp.addEventListener('click', async () => {
        clearErrors();
        const code = document.getElementById('mfa-email-code').value;
        if (!code) return;
        try {
            const res = await fetch('/api/auth/login/email-otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
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

    // --- Direct Passwordless Passkey Logic ---
    const btnDirectPasskey = document.getElementById('btn-login-passkey-direct');
    if (btnDirectPasskey) {
        btnDirectPasskey.addEventListener('click', async () => {
            clearErrors();
            try {
                const { startAuthentication } = window.SimpleWebAuthnBrowser;
                const res = await fetch('/api/auth/login/passkey/options-passwordless', { method: 'POST' });
                if (!res.ok) throw new Error('Options failed');
                const options = await res.json();
                
                let asseResp;
                try {
                    asseResp = await startAuthentication(options);
                } catch (error) {
                    showError('login-error', 'Authentifizierung abgebrochen.');
                    return;
                }

                const verifyRes = await fetch('/api/auth/login/passkey/verify-passwordless', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(asseResp),
                });
                const vData = await verifyRes.json();
                if (verifyRes.ok && !vData.error) {
                    sessionStorage.removeItem('hochciv_guest');
                    await fetchMe();
                } else {
                    showError('login-error', vData.error || 'Verifizierung fehlgeschlagen');
                }
            } catch (e) {
                showError('login-error', 'Ein Fehler ist aufgetreten.');
            }
        });
    }

    formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            
            if (res.ok && !data.error) {
                // Show activate form
                document.getElementById('act-username').value = username;
                authForms.forEach(f => f.classList.remove('active'));
                formActivate.classList.add('active');
            } else {
                showError('reg-error', data.error || 'Registrierung fehlgeschlagen.');
            }
        } catch (err) {
            showError('reg-error', 'Netzwerkfehler');
        }
    });

    formActivate.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        const username = document.getElementById('act-username').value;
        const code = document.getElementById('act-code').value;

        try {
            const res = await fetch('/api/auth/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, code })
            });
            const data = await res.json();
            
            if (res.ok && !data.error) {
                sessionStorage.removeItem('hochciv_guest');
                await fetchMe();
            } else {
                showError('act-error', data.error || 'Aktivierung fehlgeschlagen.');
            }
        } catch (err) {
            showError('act-error', 'Netzwerkfehler');
        }
    });

    btnLogout.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            currentUser = null;
            sessionStorage.removeItem('hochciv_guest');
            showView(viewLanding);
            switchAuthTab('form-login');
        } catch (e) {
            console.error(e);
        }
    });

    
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


    // Init
    fetchMe();
});
