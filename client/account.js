/**
 * The account page (account.html): profile, security (2FA, linked accounts), game history and
 * bot accounts. Admins find a link to the admin page (admin.html, admin.js). Shared helpers –
 * esc, tx, the section navigation, the game result dialog – are in account-common.js.
 */
const PROVIDER_LABEL = { google: 'Google', discord: 'Discord' };
const OK = 'var(--ok)', BAD = 'var(--red)';

document.addEventListener('DOMContentLoaded', async () => {
    HC_I18N.apply(document);
    let currentUser = null;
    // Declared before the first await: loadHistory() can resolve while init is still running
    let historyGames = [];
    let myBots = [];               // last loaded bot list (loadBots runs before init is done)

    const openFromHash = ACC.tabs();
    openFromHash();                       // again below, once "Meine Bots" may be visible

    // --- Init & Auth Check ---
    currentUser = await ACC.me();
    if (!currentUser) {
        window.location.href = '/';       // not logged in: back to the game (login is there)
        return;
    }
    ACC.drawWho(currentUser);
    document.getElementById('input-email').value = currentUser.email || '';
    document.getElementById('display-username').textContent = currentUser.username || '-';
    document.getElementById('display-email').textContent = currentUser.email || '';
    document.getElementById('display-mmr').textContent = currentUser.mmr != null ? currentUser.mmr : '-';
    document.getElementById('display-games').textContent = currentUser.gamesPlayed != null ? currentUser.gamesPlayed : '-';
    document.getElementById('acc-avatar').textContent = (currentUser.username || '?').charAt(0).toUpperCase();

    loadHistory();
    loadBlocked();

    // Bot accounts: bot creators and admins (utils/bots.js)
    if (currentUser.canCreateBots) {
        document.querySelectorAll('.bots-tab').forEach(el => el.hidden = false);
        loadBots();
    }
    // Admins: the way to the admin page
    if (ACC.isAdmin(currentUser)) document.querySelectorAll('.admin-link').forEach(el => el.hidden = false);
    openFromHash();

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

    // --- Re-confirmation for sensitive changes ---
    // The server answers 403 { reauthRequired, methods } when the last login is too long ago
    // (utils/auth.js requireRecentAuth): ask for password / authenticator code, then retry once.
    function askReauth(methods) {
        const form = document.getElementById('reauth-form');
        const msg = document.getElementById('reauth-msg');
        const pw = document.getElementById('reauth-password');
        const code = document.getElementById('reauth-totp');
        const viaOAuth = !methods.password && !methods.totp;
        document.getElementById('reauth-password-group').style.display = methods.password ? 'block' : 'none';
        document.getElementById('reauth-totp-group').style.display = methods.totp ? 'block' : 'none';
        document.getElementById('reauth-oauth-group').style.display = viaOAuth ? 'block' : 'none';
        document.getElementById('reauth-google').style.display = currentUser.googleLinked ? 'inline-flex' : 'none';
        document.getElementById('reauth-discord').style.display = currentUser.discordLinked ? 'inline-flex' : 'none';
        document.getElementById('reauth-submit').style.display = viaOAuth ? 'none' : 'inline-flex';
        document.getElementById('reauth-google').onclick = () => window.location.href = '/api/auth/google';
        document.getElementById('reauth-discord').onclick = () => window.location.href = '/api/auth/discord';
        pw.value = '';
        code.value = '';
        msg.textContent = '';
        ACC.openModal('reauth-modal');
        (methods.password ? pw : code).focus();

        return new Promise(resolve => {
            const close = ok => {
                ACC.closeModal('reauth-modal');
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
        window.location.href = `/api/auth/${provider}`;
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
    const say = (id, text, color) => {
        const el = document.getElementById(id);
        el.textContent = text;
        el.style.color = color || '';
    };

    document.getElementById('form-email').addEventListener('submit', async (e) => {
        e.preventDefault();
        say('msg-email', tx('Speichert...'));
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
            say('msg-email', tx('Wir haben dir einen Code an die neue Adresse geschickt. Gib ihn unten ein.'), OK);
            document.getElementById('input-email-pw').value = '';
            document.getElementById('input-email-code').value = '';
            say('msg-email-confirm', '');
            formEmailConfirm.style.display = 'block';
        } else {
            say('msg-email', txs(json.error || 'Fehler beim Speichern.'), BAD);
        }
    });

    formEmailConfirm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetch('/api/account/confirm-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: document.getElementById('input-email-code').value.trim() })
        });
        const json = await res.json();
        if (res.ok) {
            currentUser.email = json.email;
            document.getElementById('input-email').value = json.email;
            document.getElementById('display-email').textContent = json.email;
            formEmailConfirm.style.display = 'none';
            say('msg-email', tx('E-Mail erfolgreich aktualisiert!'), OK);
        } else {
            say('msg-email-confirm', txs(json.error || 'Fehler beim Bestätigen.'), BAD);
        }
    });

    document.getElementById('form-password').addEventListener('submit', async (e) => {
        e.preventDefault();
        say('msg-password', tx('Speichert...'));
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
            say('msg-password', tx('Passwort erfolgreich aktualisiert!'), OK);
            e.target.reset();
        } else {
            say('msg-password', txs(json.error || 'Fehler beim Speichern.'), BAD);
        }
    });

    document.getElementById('form-delete-account').addEventListener('submit', async (e) => {
        e.preventDefault();
        const confirmName = document.getElementById('input-delete-confirm').value.trim();
        if (confirmName !== currentUser.username) return say('msg-delete', tx('Der Benutzername stimmt nicht.'), BAD);
        if (!confirm(tx('Konto wirklich endgültig löschen?'))) return;
        say('msg-delete', tx('Löscht...'));
        const res = await authFetch('/api/account/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: confirmName })
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) window.location.href = '/';
        else say('msg-delete', txs(json.error || 'Fehler beim Löschen.'), BAD);
    });

    // --- History ---
    async function loadHistory() {
        const tbody = document.querySelector('#table-history tbody');
        try {
            const res = await fetch('/api/account/history');
            historyGames = await res.json();
            if (historyGames.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="acc-empty">${tx('Keine vergangenen Spiele gefunden.')}</td></tr>`;
                return;
            }
            tbody.innerHTML = historyGames.map((g, idx) => {
                const date = new Date(g.matchDate).toLocaleString(HC_I18N.locale());
                const players = g.participants.map(p => nameLink(p.name, p.dbUserId)).join(', ');
                const winners = g.participants.filter(p => p.isWinner);
                const isWinner = winners.some(p => p.dbUserId === currentUser.id);
                return `
                    <tr class="clickable${isWinner ? ' won' : ''}" onclick="showGameDetails(${idx})">
                        <td>${esc(date)}</td>
                        <td>${esc(g.durationRounds)}</td>
                        <td>${isWinner ? `<b>${tx('Du!')}</b> 🏆` : esc(winners.map(p => p.name).join(', ') || '-')}</td>
                        <td style="font-size:13px">${players}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" class="acc-empty">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }

    window.showGameDetails = idx => ACC.gameDetails(historyGames[idx], currentUser);

    // --- 2FA / MFA Setup ---
    const btnSetupTotp = document.getElementById('btn-setup-totp');
    const btnSetupPasskey = document.getElementById('btn-setup-passkey');
    const btnEnableEmailOtp = document.getElementById('btn-enable-email-otp');

    if (btnSetupTotp) btnSetupTotp.addEventListener('click', async () => {
        try {
            const res = await authFetch('/api/mfa/setup-totp', { method: 'POST' });
            const data = await res.json();
            if (data.qrCodeUrl) {
                document.getElementById('totp-qr').src = data.qrCodeUrl;
                document.getElementById('totp-secret-text').textContent = data.secret;
                document.getElementById('totp-verify-input').value = '';
                document.getElementById('totp-setup-msg').textContent = '';
                ACC.openModal('totp-setup-modal');
                document.getElementById('totp-verify-input').focus();
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
            ACC.closeModal('totp-setup-modal');
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
        if (btnEnableEmailOtp) btnEnableEmailOtp.style.display = tokens.some(t => t.type === 'email') ? 'none' : '';

        if (tokens.length === 0) {
            list.innerHTML = `<div class="acc-empty-row">${tx('Keine MFA-Methoden aktiv.')}</div>`;
            return;
        }
        list.innerHTML = tokens.map(t => {
            let deleteCall = '';
            const id = t.id ? `'${esc(t.id)}'` : 'null';
            if (t.type === 'totp') deleteCall = `deleteToken('totp', ${id})`;
            else if (t.type === 'email') deleteCall = `deleteToken('email', null)`;
            else if (t.type === 'passkey') deleteCall = `deleteToken('passkey', ${id})`;
            return `<div><span>✓ ${esc(txs(t.name))}</span>
                <button class="btn small error" onclick="${deleteCall}">${tx('Löschen')}</button></div>`;
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

    // --- Blocked players (chat, utils/reports.js) ---
    async function loadBlocked() {
        const ul = document.getElementById('blocked-list');
        try {
            const res = await fetch('/api/account/blocks');
            const data = await res.json();
            renderBlocked(data.list || []);
        } catch (_) {
            ul.innerHTML = `<li class="acc-empty-row">${tx('Fehler beim Laden.')}</li>`;
        }
    }
    function renderBlocked(list) {
        const ul = document.getElementById('blocked-list');
        ul.innerHTML = list.length ? list.map(b => `<li><span><strong>${esc(b.name)}</strong>
            <small>${b.at ? new Date(b.at).toLocaleDateString(HC_I18N.locale()) : ''}</small></span>
            <button class="btn small" data-unblock="${esc(b.key)}">${tx('Entblocken')}</button></li>`).join('')
            : `<li class="acc-empty-row">${tx('Du hast niemanden blockiert.')}</li>`;
    }
    document.getElementById('blocked-list').addEventListener('click', async e => {
        const btn = e.target.closest('[data-unblock]');
        if (!btn) return;
        btn.disabled = true;
        const res = await fetch('/api/account/blocks/' + encodeURIComponent(btn.dataset.unblock), { method: 'DELETE' }).catch(() => null);
        if (res && res.ok) renderBlocked((await res.json()).list || []);
        else { btn.disabled = false; alert(tx('Netzwerkfehler.')); }
    });

    // --- Bot accounts (routes/bots.js): create, new token, hand over, delete ---
    async function loadBots() {
        const all = document.getElementById('bots-all').checked;
        const tbody = document.querySelector('#table-bots tbody');
        try {
            const res = await fetch('/api/bots' + (all ? '?all=1' : ''));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            myBots = data.bots;
            document.getElementById('bots-count').textContent = data.limit == null
                ? tx('Du hast %s Bots (ohne Obergrenze).', data.own)
                : tx('Du hast %s von %s Bots.', data.own, data.limit);
            document.getElementById('bots-all-row').style.display = ACC.isAdmin(currentUser) ? 'flex' : 'none';
            tbody.innerHTML = myBots.length ? myBots.map(b => {
                const id = esc(b.id);
                const status = b.disabled ? `<br><small style="color:var(--red);">${esc(txs(b.disabled))}</small>` : '';
                return `<tr>
                    <td>${nameLink(b.username, b.id)}${status}</td>
                    <td>${b.owner ? esc(b.owner.username) : '–'}</td>
                    <td>${esc(b.mmr)}</td>
                    <td>${esc(b.gamesPlayed)}</td>
                    <td>
                        <button class="btn small" data-bot-token="${id}">${tx('Neues Token')}</button>
                        <button class="btn small" data-bot-transfer="${id}">${tx('Übergeben')}</button>
                        <button class="btn small error" data-bot-delete="${id}">${tx('Löschen')}</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="5" class="acc-empty">${tx('Noch keine Bots.')}</td></tr>`;
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="acc-empty">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }
    function showBotToken(name, token) {
        document.getElementById('bot-token-title').textContent = tx('Token für %s', name);
        document.getElementById('bot-token-value').textContent = token;
        document.getElementById('bot-token-box').style.display = 'block';
    }
    const botMsg = (text, okay) => say('msg-bots', text, okay ? OK : BAD);
    const postJson = (url, body) => authFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    document.getElementById('bots-all').addEventListener('change', loadBots);
    document.getElementById('btn-bot-token-copy').addEventListener('click', () => {
        const token = document.getElementById('bot-token-value').textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(token) : Promise.reject()).then(
            () => botMsg(tx('Token kopiert.'), true), () => botMsg(tx('Kopieren ging nicht – bitte von Hand markieren.')));
    });
    document.getElementById('form-bot-create').addEventListener('submit', async e => {
        e.preventDefault();
        const input = document.getElementById('input-bot-name');
        const res = await postJson('/api/bots', { username: input.value.trim() }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) return botMsg(data.error ? txs(data.error) : tx('Netzwerkfehler.'));
        input.value = '';
        botMsg(tx('Bot %s erstellt.', data.bot.username), true);
        showBotToken(data.bot.username, data.token);
        loadBots();
    });
    document.getElementById('table-bots').addEventListener('click', async e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.botToken || btn.dataset.botTransfer || btn.dataset.botDelete;
        const bot = myBots.find(b => b.id === id);
        if (!bot) return;
        let res, data = {};
        if (btn.dataset.botToken) {
            if (!confirm(tx('Neues Token für %s? Das alte funktioniert dann nicht mehr.', bot.username))) return;
            res = await postJson(`/api/bots/${encodeURIComponent(id)}/token`).catch(() => null);
        } else if (btn.dataset.botTransfer) {
            const to = prompt(tx('An wen soll %s gehen? Benutzername:', bot.username));
            if (!to) return;
            res = await postJson(`/api/bots/${encodeURIComponent(id)}/transfer`, { username: to.trim() }).catch(() => null);
        } else {
            const typed = prompt(tx('Bot „%s“ endgültig löschen? Gib zur Bestätigung seinen Namen ein:', bot.username));
            if (typed === null) return;
            if (typed.trim() !== bot.username) return botMsg(tx('Der Name stimmt nicht – nichts gelöscht.'));
            res = await fetch(`/api/bots/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
        }
        if (res) data = await res.json().catch(() => ({}));
        if (!res || !res.ok) botMsg(data.error ? txs(data.error) : tx('Netzwerkfehler.'));
        else {
            botMsg(tx('Erledigt.'), true);
            if (data.token) showBotToken(bot.username, data.token);
        }
        loadBots();
    });
});
