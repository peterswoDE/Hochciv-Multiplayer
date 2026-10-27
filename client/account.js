/** Escape text for use inside HTML (usernames, e-mails, player names, …). */
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Player name that opens the player profile (client/profile.js) when it belongs to an account. */
const nameLink = (name, userId) => window.PROFILE ? PROFILE.link(name, userId) : esc(name);

const PROVIDER_LABEL = { google: 'Google', discord: 'Discord' };
/* The page in the player's language (client/i18n.js): tx() for texts, txs() for server messages. */
const tx = (de, ...args) => HC_I18N.t(de, ...args);
const txs = msg => HC_I18N.tr(msg);

document.addEventListener('DOMContentLoaded', async () => {
    HC_I18N.apply(document);
    let currentUser = null;
    // Declared before the first await: loadHistory() can resolve while init is still running
    let historyGames = [];
    let adminUsers = [];           // last loaded admin user list (adminDeleteUser)

    // --- Tab Logic ---
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    // --- Init & Auth Check ---
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('Not logged in');
        const data = await res.json();
        if (!data.username) throw new Error('Not logged in');

        currentUser = data;
        document.getElementById('input-email').value = data.email || '';
        document.getElementById('display-username').textContent = data.username || '-';

        // Load History
        loadHistory();
        loadBlocked();

        // Admin mode
        if (data.role === 'admin' || data.role === 'superadmin') {
            document.querySelectorAll('.admin-tab').forEach(el => el.style.display = 'block');
            loadAdminData();
            setInterval(loadAdminData, 10000); // refresh every 10s
            loadReportCount();
            setInterval(loadReportCount, 60000);
        }

        // Super Admin mode — show OAuth settings tab
        if (data.role === 'superadmin') {
            document.querySelectorAll('.superadmin-tab').forEach(el => el.style.display = 'block');
            loadOAuthConfig();
        }

        // Check OAuth status to enable link buttons
        try {
            const oauthRes = await fetch('/api/auth/oauth-status');
            if (oauthRes.ok) {
                const oauthStatus = await oauthRes.json();
                for (const provider of ['google', 'discord']) {
                    const btn = document.getElementById(`btn-link-${provider}`);
                    if (!btn || !oauthStatus[provider]) continue;
                    btn.removeAttribute('disabled');
                    btn.onclick = () => currentUser[`${provider}Linked`] ? unlinkProvider(provider) : linkProvider(provider);
                }
                renderLinkButtons();
            }
        } catch (e) {
            console.error('Failed to load OAuth status for link buttons', e);
        }

    } catch (e) {
        window.location.href = '/'; // redirect to portal if not logged in
        return;
    }

    // --- Re-confirmation for sensitive changes ---
    // The server answers 403 { reauthRequired, methods } when the last login is too long ago
    // (utils/auth.js requireRecentAuth): ask for password / authenticator code, then retry once.
    function askReauth(methods) {
        const modal = document.getElementById('reauth-modal');
        const form = document.getElementById('reauth-form');
        const msg = document.getElementById('reauth-msg');
        const pw = document.getElementById('reauth-password');
        const code = document.getElementById('reauth-totp');
        const viaOAuth = !methods.password && !methods.totp;
        document.getElementById('reauth-password-group').style.display = methods.password ? 'block' : 'none';
        document.getElementById('reauth-totp-group').style.display = methods.totp ? 'block' : 'none';
        document.getElementById('reauth-oauth-group').style.display = viaOAuth ? 'block' : 'none';
        document.getElementById('reauth-google').style.display = currentUser.googleLinked ? 'inline-block' : 'none';
        document.getElementById('reauth-discord').style.display = currentUser.discordLinked ? 'inline-block' : 'none';
        document.getElementById('reauth-submit').style.display = viaOAuth ? 'none' : 'inline-block';
        document.getElementById('reauth-google').onclick = () => window.top.location.href = '/api/auth/google';
        document.getElementById('reauth-discord').onclick = () => window.top.location.href = '/api/auth/discord';
        pw.value = '';
        code.value = '';
        msg.textContent = '';
        modal.style.display = 'flex';
        (methods.password ? pw : code).focus();

        return new Promise(resolve => {
            const close = ok => {
                modal.style.display = 'none';
                form.onsubmit = null;
                resolve(ok);
            };
            document.getElementById('reauth-cancel').onclick = () => close(false);
            form.onsubmit = async e => {
                e.preventDefault();
                const body = pw.value ? { password: pw.value } : { token: code.value.trim() };
                const res = await fetch('/api/account/reauth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (res.ok) return close(true);
                msg.textContent = txs((await res.json().catch(() => ({}))).error || 'Bestätigung fehlgeschlagen.');
            };
        });
    }

    /** fetch() that handles the re-confirmation prompt; resolves with the final Response. */
    async function authFetch(url, options) {
        const res = await fetch(url, options);
        if (res.status !== 403) return res;
        const data = await res.clone().json().catch(() => ({}));
        if (!data.reauthRequired || !(await askReauth(data.methods || {}))) return res;
        return fetch(url, options);
    }

    /**
     * Linking a new Google/Discord account needs a recent login (utils/oauth.js). Confirm first –
     * after the redirect the server could only reject the link.
     */
    async function linkProvider(provider) {
        const res = await authFetch('/api/account/recent-auth');
        if (!res.ok) return;
        // Top-level navigation: Google refuses to show its login inside the account iframe
        window.top.location.href = `/api/auth/${provider}`;
    }


    /** A linked provider's button unlinks it, an unlinked one links it. */
    function renderLinkButtons() {
        for (const provider of ['google', 'discord']) {
            const btn = document.getElementById(`btn-link-${provider}`);
            if (!btn || btn.disabled) continue;
            const label = PROVIDER_LABEL[provider];
            btn.textContent = currentUser[`${provider}Linked`] ? '✓ ' + tx('%s verknüpft – Verknüpfung lösen', label) : tx('%s verknüpfen', label);
        }
    }

    async function unlinkProvider(provider) {
        const label = PROVIDER_LABEL[provider];
        const extra = provider === 'discord'
            ? '\n' + tx('In der Discord-Activity spielst du danach mit einem eigenen, neuen Konto.') : '';
        if (!confirm(tx('Verknüpfung mit %s lösen? Du kannst dich dann nicht mehr mit %s anmelden.', label, label) + extra)) return;
        const res = await fetch(`/api/account/unlink/${provider}`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return alert(txs(json.error || 'Fehler beim Lösen der Verknüpfung.'));
        currentUser.googleLinked = json.googleLinked;
        currentUser.discordLinked = json.discordLinked;
        renderLinkButtons();
    }

    // --- Profile Forms ---
    const formEmailConfirm = document.getElementById('form-email-confirm');

    document.getElementById('form-email').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-email');
        msg.textContent = tx('Speichert...');
        msg.style.color = 'black';

        const res = await authFetch('/api/account/update-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('input-email').value,
                currentPassword: document.getElementById('input-email-pw').value
            })
        });
        const json = await res.json();
        if (res.ok) {
            msg.textContent = tx('Wir haben dir einen Code an die neue Adresse geschickt. Gib ihn unten ein.');
            msg.style.color = 'green';
            document.getElementById('input-email-pw').value = '';
            document.getElementById('input-email-code').value = '';
            document.getElementById('msg-email-confirm').textContent = '';
            formEmailConfirm.style.display = 'block';
        } else {
            msg.textContent = txs(json.error || 'Fehler beim Speichern.');
            msg.style.color = 'red';
        }
    });

    formEmailConfirm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-email-confirm');
        const res = await fetch('/api/account/confirm-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: document.getElementById('input-email-code').value.trim() })
        });
        const json = await res.json();
        if (res.ok) {
            currentUser.email = json.email;
            document.getElementById('input-email').value = json.email;
            formEmailConfirm.style.display = 'none';
            const m = document.getElementById('msg-email');
            m.textContent = tx('E-Mail erfolgreich aktualisiert!');
            m.style.color = 'green';
        } else {
            msg.textContent = txs(json.error || 'Fehler beim Bestätigen.');
            msg.style.color = 'red';
        }
    });

    document.getElementById('form-password').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-password');
        msg.textContent = tx('Speichert...');
        msg.style.color = 'black';

        const res = await authFetch('/api/account/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPassword: document.getElementById('input-current-pw').value,
                newPassword: document.getElementById('input-new-pw').value
            })
        });
        const json = await res.json();
        if (res.ok) {
            msg.textContent = tx('Passwort erfolgreich aktualisiert!');
            msg.style.color = 'green';
            e.target.reset();
        } else {
            msg.textContent = txs(json.error || 'Fehler beim Speichern.');
            msg.style.color = 'red';
        }
    });

    document.getElementById('form-delete-account').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-delete');
        const confirmName = document.getElementById('input-delete-confirm').value.trim();
        if (confirmName !== currentUser.username) {
            msg.textContent = tx('Der Benutzername stimmt nicht.');
            msg.style.color = 'red';
            return;
        }
        if (!confirm(tx('Konto wirklich endgültig löschen?'))) return;
        msg.textContent = tx('Löscht...');
        msg.style.color = 'black';

        const res = await authFetch('/api/account/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: confirmName })
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
            window.top.location.href = '/';
        } else {
            msg.textContent = txs(json.error || 'Fehler beim Löschen.');
            msg.style.color = 'red';
        }
    });

    // --- History ---
    async function loadHistory() {
        const tbody = document.querySelector('#table-history tbody');
        try {
            const res = await fetch('/api/account/history');
            historyGames = await res.json();

            if (historyGames.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4">${tx('Keine vergangenen Spiele gefunden.')}</td></tr>`;
                return;
            }

            tbody.innerHTML = historyGames.map((g, idx) => {
                const date = new Date(g.matchDate).toLocaleString(HC_I18N.locale());
                const players = g.participants.map(p => nameLink(p.name, p.dbUserId)).join(', ');
                const winners = g.participants.filter(p => p.isWinner);
                const isWinner = winners.some(p => p.dbUserId === currentUser.id);
                return `
                    <tr style="background: ${isWinner ? 'rgba(0,255,0,0.05)' : 'transparent'}; cursor:pointer;" onclick="showGameDetails(${idx})" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='${isWinner ? 'rgba(0,255,0,0.05)' : 'transparent'}'">
                        <td>${esc(date)}</td>
                        <td>${esc(g.durationRounds)}</td>
                        <td>${isWinner ? `<b>${tx('Du!')}</b>` : esc(winners.map(p => p.name).join(', ') || '-')}</td>
                        <td style="font-size:13px">${players}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }

    window.showGameDetails = idx => openGameDetails(historyGames[idx]);

    function openGameDetails(g) {
        if (!g) return;

        const sorted = [...g.participants].sort((a, b) => (b.points || 0) - (a.points || 0));

        let tafel = `<table style="width:100%; border-collapse: collapse; margin:10px 0; text-align:left;">
            <tr style="border-bottom:2px solid #ccc;">
                <th style="padding:8px;">${tx('Spieler')}</th>
                <th style="padding:8px;">${tx('Nation')}</th>
                <th style="padding:8px;">${tx('Bev.')}</th>
                <th style="padding:8px;">${tx('Wunder')}</th>
                <th style="padding:8px;">${tx('Techs')}</th>
                <th style="padding:8px;">${tx('Punkte')}</th>
                <th style="padding:8px;">MMR &Delta;</th>
            </tr>`;

        tafel += sorted.map(x => {
            const isWinner = x.isWinner || (g.winnerUsername && (x.name === g.winnerUsername || x.dbUsername === g.winnerUsername));
            const pop = x.scoreDetails ? x.scoreDetails.pop : '-';
            const won = x.scoreDetails ? x.scoreDetails.wonders : '-';
            const tech = x.scoreDetails ? x.scoreDetails.techs : '-';

            const mmrShift = x.mmrShift != null ? (x.mmrShift > 0 ? `+${x.mmrShift}` : `${x.mmrShift}`) : '-';
            const mmrColor = x.mmrShift > 0 ? 'green' : (x.mmrShift < 0 ? 'red' : 'inherit');

            return `<tr style="border-bottom:1px solid #eee; ${isWinner ? 'font-weight:bold; background:rgba(0,255,0,0.05);' : ''}">
                <td style="padding:8px;">${nameLink(x.name, x.dbUserId)} ${x.isBot ? `(${tx('Bot')})` : ''}</td>
                <td style="padding:8px;">${esc(x.civ || '-')}</td>
                <td style="padding:8px;">${esc(pop)}</td>
                <td style="padding:8px;">${esc(won)}</td>
                <td style="padding:8px;">${esc(tech)}</td>
                <td style="padding:8px;"><b>${esc(x.points || 0)}</b></td>
                <td style="padding:8px; color:${mmrColor}; font-weight:bold;">${esc(mmrShift)}</td>
            </tr>`;
        }).join('');
        tafel += '</table>';

        const dateStr = new Date(g.matchDate).toLocaleString(HC_I18N.locale());

        document.getElementById('hm-title').innerHTML = `${tx('Spielauswertung')} <span style="font-size:14px; color:#666; font-weight:normal; margin-left:10px;">(${dateStr})</span>`;
        document.getElementById('hm-body').innerHTML = tafel;

        document.getElementById('history-modal').style.display = 'flex';
    }

    // --- Admin: game overview ---
    let adminGames = [];
    let adminGamesQuery = '';
    const ASYNC_STATUS = { setup: tx('Spielersuche'), placement: tx('Startplättchen'), draft: tx('Draft'), playing: tx('Läuft') };
    const winnerNames = g => g.participants.filter(p => p.isWinner).map(p => p.name);

    // --- Admin: running games (live and Rundenspiele) with their game version ---
    const LIVE_STATUS = { placement: tx('Startplättchen'), draft: tx('Draft'), playing: tx('Läuft') };
    // "12.10.2026, 14:03 (vor 3 T.)" – how long ago, so stuck games stand out
    function whenAgo(t) {
        const d = new Date(t), mins = Math.floor((Date.now() - d.getTime()) / 60000);
        const ago = mins < 60 ? tx('vor %s Min.', Math.max(0, mins)) : mins < 1440 ? tx('vor %s Std.', Math.floor(mins / 60)) : tx('vor %s T.', Math.floor(mins / 1440));
        return `${esc(d.toLocaleString(HC_I18N.locale()))} <small>(${ago})</small>`;
    }

    async function loadAdminRunning() {
        const vBody = document.querySelector('#table-admin-versions tbody');
        const lBody = document.querySelector('#table-admin-live tbody');
        const rBody = document.querySelector('#table-admin-running tbody');
        try {
            const res = await fetch('/api/admin/running');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            vBody.innerHTML = Object.entries(data.versions).map(([v, n]) => `
                <tr>
                    <td><b>${esc(v)}</b>${v === data.current ? ` <small>(${tx('aktuell')})</small>` : n.live + n.rundenspiele === 0 ? ` <small>(${tx('keine Spiele mehr')})</small>` : ''}</td>
                    <td>${esc(n.live)}</td>
                    <td>${esc(n.rundenspiele)}</td>
                </tr>`).join('');

            document.getElementById('admin-live-total').textContent = `(${data.live.length})`;
            lBody.innerHTML = data.live.length === 0 ? `<tr><td colspan="7">${tx('Keine laufenden Live-Spiele.')}</td></tr>`
                : data.live.map(g => `
                <tr>
                    <td><b>${esc(g.joinCode)}</b></td>
                    <td>${esc(g.version)}</td>
                    <td>${esc(LIVE_STATUS[g.status] || g.status)}</td>
                    <td>${esc(g.round || '-')}</td>
                    <td>${esc(g.turn || '-')}</td>
                    <td style="font-size:13px">${g.players.map(p => esc(p.name) + (p.kind !== 'human' ? ` (${tx('KI')})` : p.connected ? '' : ` <small>(${tx('getrennt')})</small>`)).join(', ')}</td>
                    <td>${whenAgo(g.lastActivity)}</td>
                </tr>`).join('');

            document.getElementById('admin-async-total').textContent = `(${data.rundenspiele.length})`;
            rBody.innerHTML = data.rundenspiele.length === 0 ? `<tr><td colspan="7">${tx('Keine laufenden Rundenspiele.')}</td></tr>`
                : data.rundenspiele.map(g => `
                <tr>
                    <td><b>${esc(g.joinCode)}</b>${g.ranked ? ` <small>(${tx('gewertet')})</small>` : ''}${g.isPublic ? ` <small>(${tx('öffentlich')})</small>` : ''}</td>
                    <td>${esc(g.version)}</td>
                    <td>${esc(ASYNC_STATUS[g.status] || g.status)}</td>
                    <td>${esc(g.round || '-')}</td>
                    <td>${esc(g.waitingFor ? txs(g.waitingFor) : '-')}</td>
                    <td style="font-size:13px">${g.players.map(p => nameLink(p.name, p.userId) + (p.isBot ? ` (${tx('Bot')})` : p.replaced ? ` (${tx('KI')})` : '')).join(', ')}</td>
                    <td>${whenAgo(g.waitSince)}</td>
                </tr>`).join('');
        } catch (e) {
            vBody.innerHTML = `<tr><td colspan="3">${tx('Fehler beim Laden.')}</td></tr>`;
            lBody.innerHTML = rBody.innerHTML = `<tr><td colspan="7">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }

    document.querySelector('[data-target="tab-admin-running"]').addEventListener('click', loadAdminRunning);
    document.getElementById('btn-admin-running-reload').addEventListener('click', loadAdminRunning);

    async function loadAdminGames(append) {
        const tbody = document.querySelector('#table-admin-games tbody');
        const moreBtn = document.getElementById('btn-admin-games-more');
        if (!append) {
            adminGames = [];
            tbody.innerHTML = `<tr><td colspan="6">${tx('Lade Spiele …')}</td></tr>`;
        }
        try {
            const params = new URLSearchParams({ offset: adminGames.length });
            if (adminGamesQuery) params.set('q', adminGamesQuery);
            const res = await fetch('/api/admin/games?' + params);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const start = adminGames.length;
            adminGames = adminGames.concat(data.finished);
            document.getElementById('admin-games-total').textContent = `(${data.total})`;
            const rows = data.finished.map((g, i) => {
                const ranked = g.participants.some(p => p.mmrShift != null);
                const type = (g.participants.some(p => p.async) ? tx('Runden') : tx('Live')) + (ranked ? ', ' + tx('gewertet') : '');
                return `
                <tr style="cursor:pointer;" onclick="showAdminGameDetails(${start + i})" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">
                    <td>${esc(new Date(g.matchDate).toLocaleString(HC_I18N.locale()))}</td>
                    <td>${esc(type)}</td>
                    <td>${esc(g.durationRounds)}</td>
                    <td>${esc(winnerNames(g).join(', ') || '-')}</td>
                    <td style="font-size:13px">${g.participants.map(p => nameLink(p.name, p.dbUserId) + (p.isBot ? ` (${tx('Bot')})` : '')).join(', ')}</td>
                    <td>${esc(g.version || '-')}</td>
                </tr>`;
            }).join('');
            if (append) tbody.insertAdjacentHTML('beforeend', rows);
            else tbody.innerHTML = rows || `<tr><td colspan="6">${adminGamesQuery ? tx('Keine Spiele gefunden.') : tx('Noch keine Spiele.')}</td></tr>`;
            moreBtn.style.display = adminGames.length < data.total ? 'inline-block' : 'none';
        } catch (e) {
            if (!append) tbody.innerHTML = `<tr><td colspan="6">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }

    window.showAdminGameDetails = idx => openGameDetails(adminGames[idx]);

    const adminGamesTab = document.querySelector('[data-target="tab-admin-games"]');
    adminGamesTab.addEventListener('click', () => loadAdminGames(false));
    document.getElementById('btn-admin-games-more').addEventListener('click', () => loadAdminGames(true));
    document.getElementById('form-admin-games-search').addEventListener('submit', e => {
        e.preventDefault();
        adminGamesQuery = document.getElementById('admin-games-q').value.trim();
        loadAdminGames(false);
    });

    // --- 2FA / MFA Setup ---
    const btnSetupTotp = document.getElementById('btn-setup-totp');
    const btnSetupPasskey = document.getElementById('btn-setup-passkey');
    const btnEnableEmailOtp = document.getElementById('btn-enable-email-otp');
    const totpModal = document.getElementById('totp-setup-modal');

    if (btnSetupTotp) btnSetupTotp.addEventListener('click', async () => {
        try {
            const res = await authFetch('/api/mfa/setup-totp', { method: 'POST' });
            const data = await res.json();
            if (data.qrCodeUrl) {
                document.getElementById('totp-qr').src = data.qrCodeUrl;
                document.getElementById('totp-secret-text').textContent = data.secret;
                document.getElementById('totp-verify-input').value = '';
                document.getElementById('totp-setup-msg').textContent = '';
                totpModal.style.display = 'flex';
            }
        } catch (e) { }
    });

    const btnVerifyTotp = document.getElementById('btn-verify-totp');
    if (btnVerifyTotp) btnVerifyTotp.addEventListener('click', async () => {
        const token = document.getElementById('totp-verify-input').value;
        const res = await authFetch('/api/mfa/verify-totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.ok) {
            totpModal.style.display = 'none';
            btnSetupTotp.style.display = 'none';
            alert(tx('2FA erfolgreich aktiviert!'));
            loadTokens();
        } else {
            document.getElementById('totp-setup-msg').textContent = txs(data.error || 'Falscher Code');
        }
    });

    if (btnEnableEmailOtp) btnEnableEmailOtp.addEventListener('click', async () => {
        const res = await authFetch('/api/mfa/toggle-email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        if ((await res.json()).ok) {
            btnEnableEmailOtp.style.display = 'none';
            alert(tx('E-Mail OTP aktiviert.'));
            loadTokens();
        }
    });

    async function loadTokens() {
        const res = await fetch('/api/mfa/tokens');
        if (!res.ok) return;
        const tokens = await res.json();
        const list = document.getElementById('mfa-tokens-list');
        if (!list) return;

        // Hide email setup button if email OTP is already active
        if (btnEnableEmailOtp) btnEnableEmailOtp.style.display = tokens.some(t => t.type === 'email') ? 'none' : 'inline-block';

        if (tokens.length === 0) {
            list.innerHTML = tx('Keine MFA-Methoden aktiv.');
            return;
        }
        list.innerHTML = tokens.map(t => {
            let deleteCall = '';
            const id = t.id ? `'${esc(t.id)}'` : 'null';
            if (t.type === 'totp') deleteCall = `deleteToken('totp', ${id})`;
            else if (t.type === 'email') deleteCall = `deleteToken('email', null)`;
            else if (t.type === 'passkey') deleteCall = `deleteToken('passkey', ${id})`;
            return `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:5px;">
                <span>${esc(txs(t.name))}</span>
                <button onclick="${deleteCall}" style="color:red; background:none; border:none; cursor:pointer;">${tx('Löschen')}</button>
            </div>
            `;
        }).join('');
    }

    window.deleteToken = async function (type, id) {
        if (!confirm(type === 'totp' ? tx('Authenticator App wirklich entfernen?') : (type === 'email' ? tx('E-Mail OTP deaktivieren?') : tx('Passkey löschen?')))) return;

        if (type === 'passkey') {
            await authFetch('/api/mfa/passkey/' + encodeURIComponent(id), { method: 'DELETE' });
        } else if (type === 'totp') {
            await authFetch('/api/mfa/totp/' + encodeURIComponent(id || 'null'), { method: 'DELETE' });
        } else if (type === 'email') {
            await authFetch('/api/mfa/toggle-email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
        }
        loadTokens();
    };

    if (btnSetupPasskey) btnSetupPasskey.addEventListener('click', async () => {
        try {
            const { startRegistration } = window.SimpleWebAuthnBrowser;
            const res = await authFetch('/api/mfa/passkey/generate-registration', { method: 'POST' });
            const options = await res.json();
            if (!res.ok) return alert(txs(options.error || 'Fehler beim Vorbereiten des Passkeys.'));
            // passkeys belong to one address (BASE_URL) – say so instead of letting the browser fail
            const rpId = options.rp && options.rp.id;
            const problem = PASSKEY.problem(rpId);
            if (problem) return alert(problem);

            let attResp;
            try {
                attResp = await startRegistration({ optionsJSON: options });
            } catch (error) {
                console.error(error);
                alert(PASSKEY.errorText(error, rpId, tx('Registrierung abgebrochen oder fehlgeschlagen.')));
                return;
            }

            const verifyRes = await authFetch('/api/mfa/passkey/verify-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(attResp),
            });
            const vData = await verifyRes.json();
            if (vData.ok) {
                alert(tx('Passkey erfolgreich hinzugefügt!'));
                loadTokens();
            } else {
                alert(tx('Fehler: %s', txs(vData.error)));
            }
        } catch (e) {
            console.error(e);
            alert(tx('Ein Fehler ist aufgetreten.'));
        }
    });

    loadTokens();

    // --- Admin Functions ---
    async function loadAdminData() {
        try {
            // Metrics
            const mRes = await fetch('/api/admin/metrics');
            const mData = await mRes.json();
            document.getElementById('admin-lobbies-count').textContent = mData.lobbiesActive;
            document.getElementById('admin-players-count').textContent = mData.playersOnline;
            document.getElementById('admin-uptime').textContent = Math.floor(mData.uptime / 60) + ' min';
            const btn = document.getElementById('btn-toggle-maintenance');
            window._maintenanceMode = mData.maintenanceMode;
            if (mData.maintenanceMode) {
                btn.textContent = tx('Deaktivieren');
                btn.classList.add('error');
            } else {
                btn.textContent = tx('Aktivieren');
                btn.classList.remove('error');
            }
            document.getElementById('admin-registration').checked = mData.registrationEnabled;

            // Lobbies
            const lRes = await fetch('/api/admin/lobbies');
            const lobbies = await lRes.json();
            const lBody = document.querySelector('#table-admin-lobbies tbody');
            lBody.innerHTML = lobbies.length === 0 ? `<tr><td colspan="4">${tx('Keine Lobbys aktiv.')}</td></tr>` : lobbies.map(l => `
                <tr>
                    <td><b>${esc(l.joinCode)}</b></td>
                    <td>${esc(({ lobby: tx('Lobby'), ...LIVE_STATUS })[l.status] || l.status)}</td>
                    <td>${tx('%s Spieler', l.players.length)}</td>
                    <td>
                        <button onclick="adminAction('lobby', '${esc(l.id)}', 'broadcast')" class="btn small">${tx('Rundruf')}</button>
                        <button onclick="adminAction('lobby', '${esc(l.id)}', 'close')" class="btn small error">${tx('Schließen')}</button>
                    </td>
                </tr>
            `).join('');

            // Users
            const uRes = await fetch('/api/admin/users');
            const users = await uRes.json();
            adminUsers = users;
            const uBody = document.querySelector('#table-admin-users tbody');
            uBody.innerHTML = users.map(u => {
                const id = esc(u.id);
                let badges = '';
                if (u.isBanned) badges += `<span class="badge banned">${tx('Gesperrt')}</span> `;
                return `
                <tr>
                    <td>${esc(u.username)} <br><small>${esc(u.email)}</small></td>
                    <td>
                        <select onchange="adminChangeRole('${id}', this.value)" style="margin-right:8px; padding:2px; border-radius:4px; font-size:12px; background:var(--bg); border:1px solid #ccc; color:var(--text);">
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>${tx('User')}</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>${tx('Super Admin')}</option>
                        </select>
                        ${badges}
                    </td>
                    <td>${esc(u.gamesPlayed)}</td>
                    <td>${esc(u.mmr)}</td>
                    <td>
                        <button onclick="adminAction('user', '${id}', '${u.isBanned ? 'unban' : 'ban'}')" class="btn small ${u.isBanned ? '' : 'error'}">${u.isBanned ? tx('Entbannen') : tx('Bannen')}</button>
                        <button onclick="adminAction('user', '${id}', 'force_password')" class="btn small">${tx('PW Reset')}</button>
                        <button onclick="toggleAdminUserMfa('${id}')" class="btn small" style="margin-top: 4px;">${tx('MFA Verwalten')}</button>
                        ${u.id === currentUser.id ? '' : `<button onclick="adminDeleteUser('${id}')" class="btn small btn-primary" style="margin-top: 4px;">${tx('Konto löschen')}</button>`}
                        <div id="admin-user-mfa-${id}" style="display:none; margin-top: 10px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 4px; font-size: 13px;"></div>
                    </td>
                </tr>
            `}).join('');

        } catch (e) {
            console.error(e);
        }
    }

    window.toggleAdminUserMfa = async (id) => {
        const container = document.getElementById(`admin-user-mfa-${id}`);
        if (!container) return;

        if (container.style.display === 'block') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = tx('Lade...');

        try {
            const res = await fetch(`/api/admin/users/${id}/mfa`);
            if (!res.ok) throw new Error();
            const tokens = await res.json();

            if (tokens.length === 0) {
                container.innerHTML = tx('Keine MFA-Tokens aktiv.');
                return;
            }

            container.innerHTML = tokens.map(t => {
                const tokenId = t.id ? `'${esc(t.id)}'` : 'null';
                return `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #ddd; padding-bottom:3px;">
                    <span>${esc(txs(t.name))}</span>
                    <button onclick="adminDeleteUserMfa('${esc(id)}', '${esc(t.type)}', ${tokenId})" style="color:red; background:none; border:none; cursor:pointer;">${tx('Löschen')}</button>
                </div>
                `;
            }).join('');

        } catch (e) {
            container.innerHTML = `<span style="color:red;">${tx('Fehler beim Laden.')}</span>`;
        }
    };

    window.adminDeleteUserMfa = async (userId, type, tokenId) => {
        if (!confirm(tx('Diesen MFA-Token wirklich löschen?'))) return;

        let url = `/api/admin/users/${userId}/mfa/${type}`;
        if (tokenId) url += `/${tokenId}`;

        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
            // Reload just the MFA container
            document.getElementById(`admin-user-mfa-${userId}`).style.display = 'none';
            window.toggleAdminUserMfa(userId);
        } else {
            alert(tx('Fehler beim Löschen.'));
        }
    };

    // The name is looked up in adminUsers, not put into the onclick attribute
    window.adminDeleteUser = async (id) => {
        const u = adminUsers.find(x => x.id === id);
        if (!u) return;
        const typed = prompt(tx('Konto „%s“ endgültig löschen? Das lässt sich nicht rückgängig machen.', u.username) + '\n' +
            tx('Gib zur Bestätigung den Benutzernamen ein:'));
        if (typed === null) return;
        if (typed.trim() !== u.username) return alert(tx('Der Benutzername stimmt nicht – nichts gelöscht.'));
        const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) {
            loadAdminData();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(tx('Fehler: %s', err.error ? txs(err.error) : tx('Unbekannt')));
        }
    };

    window.adminChangeRole = async (id, role) => {
        if (!confirm(tx('Sicher, dass du die Rolle auf „%s“ ändern möchtest?', role))) {
            loadAdminData(); // Reset dropdown visually
            return;
        }
        const res = await fetch(`/api/admin/users/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_role', role })
        });
        if (res.ok) {
            loadAdminData();
        } else {
            const err = await res.json();
            alert(tx('Fehler: %s', err.error ? txs(err.error) : tx('Unbekannt')));
        }
    };

    window.toggleConfig = async (key, val) => {
        await fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: val })
        });
    };

    window.adminAction = async (type, id, action) => {
        let payload = { action };

        if (action === 'broadcast') {
            const msg = prompt(tx('Nachricht an Lobby senden:'));
            if (!msg) return;
            payload.message = msg;
        } else if (action === 'force_password') {
            const pwd = prompt(tx('Neues Passwort eingeben:'));
            if (!pwd) return;
            payload.newPassword = pwd;
        } else {
            if (!confirm(tx('Sicher, dass du „%s“ ausführen möchtest?', action))) return;
        }

        const endpoint = type === 'lobby' ? `/api/admin/lobbies/${id}/action` : `/api/admin/users/${id}/action`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            loadAdminData();
        } else {
            const err = await res.json();
            alert(tx('Fehler: %s', err.error ? txs(err.error) : tx('Unbekannt')));
        }
    };

    window.toggleMaintenance = async () => {
        const newVal = !window._maintenanceMode;
        await fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maintenanceMode: newVal })
        });
        loadAdminData();
    };

    // --- Blocked players (chat, utils/reports.js) ---
    async function loadBlocked() {
        const ul = document.getElementById('blocked-list');
        try {
            const res = await fetch('/api/account/blocks');
            const data = await res.json();
            renderBlocked(data.list || []);
        } catch (_) {
            ul.innerHTML = `<li>${tx('Fehler beim Laden.')}</li>`;
        }
    }
    function renderBlocked(list) {
        const ul = document.getElementById('blocked-list');
        ul.innerHTML = list.length ? list.map(b => `<li><span><strong>${esc(b.name)}</strong>
            <small style="color:#888;">${b.at ? new Date(b.at).toLocaleDateString(HC_I18N.locale()) : ''}</small></span>
            <button class="btn small" data-unblock="${esc(b.key)}">${tx('Entblocken')}</button></li>`).join('')
            : `<li style="color:#666;">${tx('Du hast niemanden blockiert.')}</li>`;
    }
    document.getElementById('blocked-list').addEventListener('click', async e => {
        const btn = e.target.closest('[data-unblock]');
        if (!btn) return;
        btn.disabled = true;
        const res = await fetch('/api/account/blocks/' + encodeURIComponent(btn.dataset.unblock), { method: 'DELETE' }).catch(() => null);
        if (res && res.ok) renderBlocked((await res.json()).list || []);
        else { btn.disabled = false; alert(tx('Netzwerkfehler.')); }
    });

    // --- Admin: chat reports (routes/admin.js /reports) ---
    let adminReports = [];
    const fmtTime = t => new Date(t).toLocaleString(HC_I18N.locale(), { dateStyle: 'short', timeStyle: 'short' });
    const chatText = m => (m.kind === 'emote' ? m.emote : m.text);

    async function loadReportCount() {
        try {
            const res = await fetch('/api/admin/reports?status=open&offset=0');
            if (!res.ok) return;
            const data = await res.json();
            document.getElementById('admin-reports-badge').textContent = data.open ? String(data.open) : '';
        } catch (_) { }
    }

    async function loadAdminReports(more) {
        const box = document.getElementById('admin-reports-list');
        const status = document.getElementById('admin-reports-status').value;
        if (!more) adminReports = [];
        try {
            const res = await fetch(`/api/admin/reports?status=${status}&offset=${adminReports.length}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            adminReports = adminReports.concat(data.reports);
            document.getElementById('admin-reports-total').textContent = `(${data.total})`;
            document.getElementById('admin-reports-badge').textContent = data.open ? String(data.open) : '';
            document.getElementById('btn-admin-reports-more').style.display = adminReports.length < data.total ? 'inline-block' : 'none';
            box.innerHTML = adminReports.map(renderReport).join('')
                || `<p style="color:#666;">${status === 'open' ? tx('Keine offenen Meldungen.') : tx('Noch keine erledigten Meldungen.')}</p>`;
            box.querySelectorAll('.report-chat').forEach(el => {
                const hit = el.querySelector('.reported');
                if (hit) el.scrollTop = hit.offsetTop - el.clientHeight / 2;
            });
        } catch (err) {
            box.innerHTML = `<p style="color:red;">${tx('Fehler beim Laden.')}</p>`;
        }
    }

    function renderReport(r, i) {
        const acc = r.reportedAccount;
        const where = r.source === 'async' ? tx('Rundenspiel') : tx('Live-Spiel');
        const chat = (r.context || []).map(m => {
            const cls = m.id === r.message.id ? 'reported' : (m.name === r.reportedName ? 'by-reported' : '');
            return `<div class="${cls}"><time>${fmtTime(m.t)}</time><strong>${esc(m.name)}</strong> ${esc(chatText(m))}</div>`;
        }).join('');
        const statusTxt = { resolved: tx('Erledigt'), dismissed: tx('Verworfen') }[r.status];
        const closed = r.status !== 'open'
            ? `<p class="report-meta">${esc(statusTxt)} ${tx('von %s', esc(r.handledBy || '?'))}, ${r.handledAt ? fmtTime(r.handledAt) : ''}${r.note ? ' – ' + esc(r.note) : ''}</p>` : '';
        const ban = acc && !acc.isBanned
            ? `<button class="btn small" onclick="reportAction(${i}, 'ban')">${tx('Konto sperren')}</button>`
            : (acc && acc.isBanned ? `<span class="badge banned">${tx('Gesperrt')}</span>` : '');
        const actions = r.status === 'open'
            ? `<input type="text" id="report-note-${i}" maxlength="1000" placeholder="${tx('Notiz (freiwillig)')}">
               <button class="btn small btn-primary" onclick="reportAction(${i}, 'resolved')">${tx('Erledigt')}</button>
               <button class="btn small" onclick="reportAction(${i}, 'dismissed')">${tx('Verwerfen')}</button>${ban}`
            : `<button class="btn small" onclick="reportAction(${i}, 'open')">${tx('Wieder öffnen')}</button>${ban}`;
        return `<div class="report-card">
            <div class="report-head">
                <strong>${esc(r.reportedName)}</strong>${acc ? '' : ` <small>${tx('(Gast)')}</small>`}
                <span class="report-meta">${tx('gemeldet von %s', esc(r.reporterName))} · ${fmtTime(r.createdAt)} · ${esc(where)}</span>
            </div>
            <div><strong>${tx('Nachricht:')}</strong> ${esc(chatText(r.message))}</div>
            ${r.reason ? `<div><strong>${tx('Grund:')}</strong> ${esc(r.reason)}</div>` : ''}
            ${r.auto ? `<div><strong>${tx('Gefunden:')}</strong> ${esc((r.matches || []).join(', '))} · ${esc(r.penalty === 'game'
                ? tx('Folge: keine Texte mehr in diesem Spiel (2. Verstoß)') : tx('Folge: 5 Minuten keine Texte'))}</div>` : ''}
            <div class="report-chat">${chat}</div>
            ${closed}
            <div class="report-actions">${actions}</div>
        </div>`;
    }

    window.reportAction = async (i, action) => {
        const r = adminReports[i];
        if (!r) return;
        if (action === 'ban') {
            if (!r.reportedAccount) return;
            await window.adminAction('user', r.reportedAccount.id, 'ban');
            return loadAdminReports(false);
        }
        const note = document.getElementById(`report-note-${i}`);
        const res = await fetch(`/api/admin/reports/${encodeURIComponent(r.id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: action, note: note ? note.value : undefined }),
        }).catch(() => null);
        if (!res || !res.ok) {
            const err = res ? await res.json().catch(() => ({})) : {};
            return alert(tx('Fehler: %s', err.error ? txs(err.error) : tx('Unbekannt')));
        }
        loadAdminReports(false);
    };

    document.querySelector('[data-target="tab-admin-reports"]').addEventListener('click', () => { loadAdminReports(false); loadAdminWords(); });

    // --- Admin: the chat word filter (routes/admin.js /words) ---
    function renderAdminWords(list) {
        const tbody = document.querySelector('#table-admin-words tbody');
        tbody.innerHTML = list.length ? list.map(w => `<tr>
            <td><strong>${esc(w.word)}</strong></td>
            <td>${w.kind === 'allow' ? tx('Erlauben') : tx('Sperren')}</td>
            <td>${w.kind === 'allow' ? '–' : (w.match === 'part' ? tx('auch als Wortteil') : tx('nur als ganzes Wort'))}</td>
            <td>${esc(w.addedBy || '')}</td>
            <td><button class="btn small" data-word="${esc(w.id)}" title="${tx('Entfernen')}">✕</button></td>
        </tr>`).join('') : `<tr><td colspan="5">${tx('Noch keine eigenen Wörter – es gelten die eingebauten Listen.')}</td></tr>`;
    }
    async function loadAdminWords() {
        try {
            const res = await fetch('/api/admin/words');
            if (res.ok) renderAdminWords((await res.json()).list || []);
        } catch (_) { }
    }
    const wordMsg = (text, okay) => {
        const el = document.getElementById('msg-admin-word');
        el.textContent = text;
        el.style.color = okay ? 'green' : 'red';
    };
    document.getElementById('admin-word-kind').addEventListener('change', e => {
        document.getElementById('admin-word-match').disabled = e.target.value === 'allow';
    });
    document.getElementById('form-admin-word').addEventListener('submit', async e => {
        e.preventDefault();
        const input = document.getElementById('admin-word');
        const res = await fetch('/api/admin/words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: input.value, kind: document.getElementById('admin-word-kind').value, match: document.getElementById('admin-word-match').value }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) return wordMsg(data.error ? txs(data.error) : tx('Netzwerkfehler.'), false);
        input.value = '';
        wordMsg(tx('Gespeichert. Der Filter gilt sofort.'), true);
        renderAdminWords(data.list || []);
    });
    document.querySelector('#table-admin-words tbody').addEventListener('click', async e => {
        const btn = e.target.closest('[data-word]');
        if (!btn) return;
        const res = await fetch('/api/admin/words/' + encodeURIComponent(btn.dataset.word), { method: 'DELETE' }).catch(() => null);
        if (res && res.ok) renderAdminWords((await res.json()).list || []);
    });
    document.getElementById('form-admin-wordcheck').addEventListener('submit', async e => {
        e.preventDefault();
        const out = document.getElementById('msg-admin-wordcheck');
        const res = await fetch('/api/admin/words/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: document.getElementById('admin-wordcheck').value }),
        }).catch(() => null);
        const data = res && res.ok ? await res.json() : null;
        if (!data) { out.textContent = tx('Netzwerkfehler.'); out.style.color = 'red'; return; }
        out.textContent = data.words.length ? tx('Würde gesperrt: %s', data.words.join(', ')) : tx('Kein Treffer – der Text würde gesendet.');
        out.style.color = data.words.length ? 'var(--red)' : 'green';
    });
    document.getElementById('admin-reports-status').addEventListener('change', () => loadAdminReports(false));
    document.getElementById('btn-admin-reports-reload').addEventListener('click', () => loadAdminReports(false));
    document.getElementById('btn-admin-reports-more').addEventListener('click', () => loadAdminReports(true));

    // --- OAuth Config (Super Admin) ---
    async function loadOAuthConfig() {
        try {
            const res = await fetch('/api/admin/oauth');
            if (!res.ok) return;
            const data = await res.json();

            // Callback URLs exactly as the server sends them to Google/Discord (from BASE_URL)
            const baseUrl = data.callbackBase || window.location.origin;
            const cbGoogle = document.getElementById('oauth-callback-google');
            const cbDiscord = document.getElementById('oauth-callback-discord');
            if (cbGoogle) cbGoogle.textContent = `Google: ${baseUrl}/api/auth/google/callback`;
            if (cbDiscord) cbDiscord.textContent = `Discord: ${baseUrl}/api/auth/discord/callback`;
            if (cbDiscord && baseUrl !== window.location.origin) {
                const warn = document.createElement('div');
                warn.style.cssText = 'color:#c0392b; font-weight:bold; margin-top:6px;';
                warn.textContent = tx('Achtung: Der Server verwendet %s, die Seite läuft aber unter %s.', baseUrl, window.location.origin) + ' ' +
                    tx('BASE_URL in der .env des Servers setzen, sonst schlägt der Login fehl (redirect_uri).');
                cbDiscord.after(warn);
            }

            // Populate Google fields
            if (data.google) {
                document.getElementById('oauth-google-clientid').value = data.google.clientId || '';
                document.getElementById('oauth-google-secret').value = data.google.clientSecret || '';
                document.getElementById('oauth-google-enabled').checked = data.google.enabled || false;
            }
            // Populate Discord fields
            if (data.discord) {
                document.getElementById('oauth-discord-clientid').value = data.discord.clientId || '';
                document.getElementById('oauth-discord-secret').value = data.discord.clientSecret || '';
                document.getElementById('oauth-discord-bottoken').value = data.discord.botToken || '';
                document.getElementById('oauth-discord-enabled').checked = data.discord.enabled || false;
            }
        } catch (e) {
            console.error('Failed to load OAuth config', e);
        }
    }

    window.saveOAuthConfig = async (provider) => {
        const msg = document.getElementById(`oauth-${provider}-msg`);
        msg.textContent = tx('Speichert...');
        msg.style.color = 'black';

        const clientId = document.getElementById(`oauth-${provider}-clientid`).value;
        const clientSecret = document.getElementById(`oauth-${provider}-secret`).value;
        const enabled = document.getElementById(`oauth-${provider}-enabled`).checked;
        const botTokenEl = document.getElementById(`oauth-${provider}-bottoken`);
        const body = { clientId, clientSecret, enabled };
        if (botTokenEl) body.botToken = botTokenEl.value;

        try {
            const res = await fetch(`/api/admin/oauth/${provider}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                msg.textContent = tx('Gespeichert! Strategien neu geladen.');
                msg.style.color = 'green';
            } else {
                const err = await res.json();
                msg.textContent = txs(err.error || 'Fehler beim Speichern.');
                msg.style.color = 'red';
            }
        } catch (e) {
            msg.textContent = tx('Netzwerkfehler.');
            msg.style.color = 'red';
        }
    };
});
