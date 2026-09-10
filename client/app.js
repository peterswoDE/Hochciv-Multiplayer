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
        showView(viewLanding);
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
                sessionStorage.removeItem('hochciv_guest');
                await fetchMe();
            } else {
                showError('login-error', data.error || 'Login fehlgeschlagen.');
            }
        } catch (err) {
            showError('login-error', 'Netzwerkfehler');
        }
    });

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

    // Forgot Password Mock
    document.getElementById('link-forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Bitte kontaktiere den Administrator, um dein Passwort zurückzusetzen.');
    });

    // Init
    fetchMe();
});
