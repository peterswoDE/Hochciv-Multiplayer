/**
 * The admin page (admin.html): overview (server status, global switches, lobbies), running and
 * finished games, statistics, users, chat reports with the word filter, and – for super admins –
 * the OAuth providers. Shared helpers (esc, tx, navigation, game result dialog) are in
 * account-common.js. Players without the admin role are sent to their account page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    HC_I18N.apply(document);
    let currentUser = null;
    let adminUsers = [];           // last loaded user list (adminDeleteUser, adminBotLimit, filter)

    // Each section loads when it is opened; the overview also every 10 seconds while it is open
    let current = null;
    const LOAD = {
        'tab-admin-dashboard': () => loadDashboard(),
        'tab-admin-running': () => loadAdminRunning(),
        'tab-admin-games': () => loadAdminGames(false),
        'tab-admin-stats': () => GAMESTATS.render(document.getElementById('admin-stats-body'), { admin: true }),
        'tab-admin-users': () => loadUsers(),
        'tab-admin-reports': () => { loadAdminReports(false); loadAdminWords(); },
        'tab-admin-oauth': () => loadOAuthConfig(),
    };
    const openFromHash = ACC.tabs(id => {
        current = id;
        if (currentUser && LOAD[id]) LOAD[id]();
    });

    currentUser = await ACC.me();
    if (!currentUser) { window.location.href = '/'; return; }
    if (!ACC.isAdmin(currentUser)) { window.location.href = 'account.html'; return; }
    ACC.drawWho(currentUser);
    document.querySelectorAll('.admin-tab').forEach(el => el.hidden = false);
    if (currentUser.role === 'superadmin') document.querySelectorAll('.superadmin-tab').forEach(el => el.hidden = false);
    openFromHash();
    setInterval(() => { if (current === 'tab-admin-dashboard' && !document.hidden) loadDashboard(); }, 10000);
    loadReportCount();
    setInterval(loadReportCount, 60000);

    const post = (url, body) => fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const fail = async res => {
        const err = res ? await res.json().catch(() => ({})) : {};
        alert(tx('Fehler: %s', err.error ? txs(err.error) : tx('Unbekannt')));
    };

    // --- Overview: metrics, global switches, lobbies ---
    const LIVE_STATUS = { placement: tx('Startplättchen'), draft: tx('Draft'), playing: tx('Läuft'), finished: tx('Beendet') };
    async function loadDashboard() {
        try {
            const mData = await (await fetch('/api/admin/metrics')).json();
            document.getElementById('admin-lobbies-count').textContent = mData.lobbiesActive;
            document.getElementById('admin-players-count').textContent = mData.playersOnline;
            const mins = Math.floor(mData.uptime / 60);
            document.getElementById('admin-uptime').textContent = mins < 120 ? mins + ' min' : Math.floor(mins / 60) + ' h';
            const btn = document.getElementById('btn-toggle-maintenance');
            window._maintenanceMode = mData.maintenanceMode;
            btn.textContent = mData.maintenanceMode ? tx('Deaktivieren') : tx('Aktivieren');
            btn.classList.toggle('error', !!mData.maintenanceMode);
            document.getElementById('admin-registration').checked = mData.registrationEnabled;

            const lobbies = await (await fetch('/api/admin/lobbies')).json();
            document.querySelector('#table-admin-lobbies tbody').innerHTML = lobbies.length === 0
                ? `<tr><td colspan="4" class="acc-empty">${tx('Keine Lobbys aktiv.')}</td></tr>`
                : lobbies.map(l => `
                <tr>
                    <td><b>${esc(l.joinCode)}</b></td>
                    <td>${esc(({ lobby: tx('Lobby'), ...LIVE_STATUS })[l.status] || l.status)}</td>
                    <td>${tx('%s Spieler', l.players.length)}</td>
                    <td>
                        <button onclick="adminAction('lobby', '${esc(l.id)}', 'broadcast')" class="btn small">${tx('Rundruf')}</button>
                        <button onclick="adminAction('lobby', '${esc(l.id)}', 'close')" class="btn small error">${tx('Schließen')}</button>
                    </td>
                </tr>`).join('');
        } catch (e) {
            console.error(e);
        }
    }

    window.toggleConfig = async (key, val) => { await post('/api/admin/config', { [key]: val }); };
    window.toggleMaintenance = async () => {
        await post('/api/admin/config', { maintenanceMode: !window._maintenanceMode });
        loadDashboard();
    };

    // --- Running games (live and Rundenspiele) with their game version ---
    const ASYNC_STATUS = { setup: tx('Spielersuche'), placement: tx('Startplättchen'), draft: tx('Draft'), playing: tx('Läuft') };
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
            lBody.innerHTML = data.live.length === 0 ? `<tr><td colspan="7" class="acc-empty">${tx('Keine laufenden Live-Spiele.')}</td></tr>`
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
            rBody.innerHTML = data.rundenspiele.length === 0 ? `<tr><td colspan="7" class="acc-empty">${tx('Keine laufenden Rundenspiele.')}</td></tr>`
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
            vBody.innerHTML = `<tr><td colspan="3" class="acc-empty">${tx('Fehler beim Laden.')}</td></tr>`;
            lBody.innerHTML = rBody.innerHTML = `<tr><td colspan="7" class="acc-empty">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }
    document.getElementById('btn-admin-running-reload').addEventListener('click', loadAdminRunning);

    // --- Finished games ---
    let adminGames = [];
    let adminGamesQuery = '';
    const winnerNames = g => g.participants.filter(p => p.isWinner).map(p => p.name);

    async function loadAdminGames(append) {
        const tbody = document.querySelector('#table-admin-games tbody');
        const moreBtn = document.getElementById('btn-admin-games-more');
        if (!append) {
            adminGames = [];
            tbody.innerHTML = `<tr><td colspan="6" class="acc-empty">${tx('Lade Spiele …')}</td></tr>`;
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
                <tr class="clickable" onclick="showAdminGameDetails(${start + i})">
                    <td>${esc(new Date(g.matchDate).toLocaleString(HC_I18N.locale()))}</td>
                    <td>${esc(type)}</td>
                    <td>${esc(g.durationRounds)}</td>
                    <td>${esc(winnerNames(g).join(', ') || '-')}</td>
                    <td style="font-size:13px">${g.participants.map(p => nameLink(p.name, p.dbUserId) + (p.isBot ? ` (${tx('Bot')})` : '')).join(', ')}</td>
                    <td>${esc(g.version || '-')}</td>
                </tr>`;
            }).join('');
            if (append) tbody.insertAdjacentHTML('beforeend', rows);
            else tbody.innerHTML = rows || `<tr><td colspan="6" class="acc-empty">${adminGamesQuery ? tx('Keine Spiele gefunden.') : tx('Noch keine Spiele.')}</td></tr>`;
            moreBtn.style.display = adminGames.length < data.total ? 'inline-flex' : 'none';
        } catch (e) {
            if (!append) tbody.innerHTML = `<tr><td colspan="6" class="acc-empty">${tx('Fehler beim Laden.')}</td></tr>`;
        }
    }

    window.showAdminGameDetails = idx => ACC.gameDetails(adminGames[idx], currentUser);
    document.getElementById('btn-admin-games-more').addEventListener('click', () => loadAdminGames(true));
    document.getElementById('form-admin-games-search').addEventListener('submit', e => {
        e.preventDefault();
        adminGamesQuery = document.getElementById('admin-games-q').value.trim();
        loadAdminGames(false);
    });

    // --- Users ---
    async function loadUsers() {
        try {
            adminUsers = await (await fetch('/api/admin/users')).json();
            drawUsers();
        } catch (e) {
            console.error(e);
        }
    }

    function drawUsers() {
        const q = document.getElementById('admin-users-q').value.trim().toLowerCase();
        const users = q ? adminUsers.filter(u => (u.username + ' ' + (u.email || '')).toLowerCase().includes(q)) : adminUsers;
        document.getElementById('admin-users-total').textContent = q ? `(${users.length} / ${adminUsers.length})` : `(${adminUsers.length})`;
        const uBody = document.querySelector('#table-admin-users tbody');
        uBody.innerHTML = users.length === 0 ? `<tr><td colspan="5" class="acc-empty">${tx('Keine Nutzer gefunden.')}</td></tr>` : users.map(u => {
            const id = esc(u.id);
            const isBotUser = u.accountType === 'bot';
            let badges = '';
            if (u.isBanned) badges += `<span class="badge banned">${tx('Gesperrt')}</span> `;
            if (isBotUser) {
                badges += `<span class="badge bot">${tx('Bot')}</span> `;
                if (u.botDisabled) badges += `<br><small style="color:var(--red);">${esc(txs(u.botDisabled))}</small>`;
            }
            // bot accounts: whose bot it is; bot creators: how many bots, and the limit
            const sub = isBotUser ? tx('Besitzer: %s', u.owner ? u.owner.username : '–') : (u.email || '');
            const botLimit = !u.bots ? '' : `<br><small>${u.bots.limit == null ? tx('%s Bots (ohne Obergrenze)', u.bots.count) : tx('%s von %s Bots', u.bots.count, u.bots.limit)}</small>
                    ${u.bots.limit == null ? '' : `<button onclick="adminBotLimit('${id}')" class="btn small">${tx('Bot-Limit')}</button>`}`;
            const roleSelect = isBotUser ? '' : `
                    <select onchange="adminChangeRole('${id}', this.value)" style="padding:4px 6px; font-size:13px;">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>${tx('User')}</option>
                        <option value="botcreator" ${u.role === 'botcreator' ? 'selected' : ''}>${tx('Bot-Ersteller')}</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>${tx('Super Admin')}</option>
                    </select>`;
            return `
            <tr>
                <td><b>${esc(u.username)}</b><br><small>${esc(sub)}</small></td>
                <td>${roleSelect} ${badges} ${botLimit}</td>
                <td>${esc(u.gamesPlayed)}</td>
                <td>${esc(u.mmr)}</td>
                <td>
                    <div class="acc-btns" style="gap:4px;">
                        <button onclick="adminAction('user', '${id}', '${u.isBanned ? 'unban' : 'ban'}')" class="btn small ${u.isBanned ? '' : 'error'}">${u.isBanned ? tx('Entbannen') : tx('Bannen')}</button>
                        ${isBotUser ? '' : `<button onclick="adminAction('user', '${id}', 'force_password')" class="btn small">${tx('PW Reset')}</button>
                        <button onclick="toggleAdminUserMfa('${id}')" class="btn small">${tx('MFA Verwalten')}</button>`}
                        ${u.id === currentUser.id ? '' : `<button onclick="adminDeleteUser('${id}')" class="btn small error">${tx('Konto löschen')}</button>`}
                    </div>
                    <div id="admin-user-mfa-${id}" class="acc-sub-panel" style="display:none;"></div>
                </td>
            </tr>`;
        }).join('');
    }
    document.getElementById('admin-users-q').addEventListener('input', drawUsers);

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
                return `<div><span>${esc(txs(t.name))}</span>
                    <button class="link-btn" onclick="adminDeleteUserMfa('${esc(id)}', '${esc(t.type)}', ${tokenId})">${tx('Löschen')}</button></div>`;
            }).join('');
        } catch (e) {
            container.innerHTML = `<span style="color:var(--red);">${tx('Fehler beim Laden.')}</span>`;
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
        if (res.ok) loadUsers();
        else fail(res);
    };

    window.adminChangeRole = async (id, role) => {
        if (!confirm(tx('Sicher, dass du die Rolle auf „%s“ ändern möchtest?', role))) {
            drawUsers();      // reset the dropdown
            return;
        }
        const res = await post(`/api/admin/users/${id}/action`, { action: 'set_role', role });
        if (res.ok) loadUsers();
        else { fail(res); drawUsers(); }
    };

    // How many bots a bot creator may own; empty = the default again
    window.adminBotLimit = async (id) => {
        const u = adminUsers.find(x => x.id === id);
        if (!u || !u.bots) return;
        const value = prompt(tx('Wie viele Bots darf %s besitzen? (leer = Standard)', u.username), String(u.bots.limit));
        if (value === null) return;
        const res = await post(`/api/admin/users/${encodeURIComponent(id)}/action`,
            { action: 'set_bot_limit', botLimit: value.trim() === '' ? null : Number(value) });
        if (res.ok) loadUsers();
        else fail(res);
    };

    window.adminAction = async (type, id, action) => {
        const payload = { action };
        if (action === 'broadcast') {
            const msg = prompt(tx('Nachricht an Lobby senden:'));
            if (!msg) return;
            payload.message = msg;
        } else if (action === 'force_password') {
            const pwd = prompt(tx('Neues Passwort eingeben:'));
            if (!pwd) return;
            payload.newPassword = pwd;
        } else if (!confirm(tx('Sicher, dass du „%s“ ausführen möchtest?', action))) return;

        const endpoint = type === 'lobby' ? `/api/admin/lobbies/${id}/action` : `/api/admin/users/${id}/action`;
        const res = await post(endpoint, payload);
        if (!res.ok) return fail(res);
        if (type === 'lobby') loadDashboard();
        else loadUsers();
    };

    // --- Chat reports (routes/admin.js /reports) ---
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
            document.getElementById('btn-admin-reports-more').style.display = adminReports.length < data.total ? 'inline-flex' : 'none';
            box.innerHTML = adminReports.map(renderReport).join('')
                || `<p class="acc-desc" style="margin:0;">${status === 'open' ? tx('Keine offenen Meldungen.') : tx('Noch keine erledigten Meldungen.')}</p>`;
            box.querySelectorAll('.report-chat').forEach(el => {
                const hit = el.querySelector('.reported');
                if (hit) el.scrollTop = hit.offsetTop - el.clientHeight / 2;
            });
        } catch (err) {
            box.innerHTML = `<p style="color:var(--red);">${tx('Fehler beim Laden.')}</p>`;
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
            ? `<button class="btn small error" onclick="reportAction(${i}, 'ban')">${tx('Konto sperren')}</button>`
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
        const res = await post(`/api/admin/reports/${encodeURIComponent(r.id)}`,
            { status: action, note: note ? note.value : undefined }).catch(() => null);
        if (!res || !res.ok) return fail(res);
        loadAdminReports(false);
    };
    document.getElementById('admin-reports-status').addEventListener('change', () => loadAdminReports(false));
    document.getElementById('btn-admin-reports-reload').addEventListener('click', () => loadAdminReports(false));
    document.getElementById('btn-admin-reports-more').addEventListener('click', () => loadAdminReports(true));

    // --- The chat word filter (routes/admin.js /words) ---
    function renderAdminWords(list) {
        const tbody = document.querySelector('#table-admin-words tbody');
        tbody.innerHTML = list.length ? list.map(w => `<tr>
            <td><strong>${esc(w.word)}</strong></td>
            <td>${w.kind === 'allow' ? tx('Erlauben') : tx('Sperren')}</td>
            <td>${w.kind === 'allow' ? '–' : (w.match === 'part' ? tx('auch als Wortteil') : tx('nur als ganzes Wort'))}</td>
            <td>${esc(w.addedBy || '')}</td>
            <td><button class="btn small" data-word="${esc(w.id)}" title="${tx('Entfernen')}">✕</button></td>
        </tr>`).join('') : `<tr><td colspan="5" class="acc-empty">${tx('Noch keine eigenen Wörter – es gelten die eingebauten Listen.')}</td></tr>`;
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
        el.style.color = okay ? 'var(--ok)' : 'var(--red)';
    };
    document.getElementById('admin-word-kind').addEventListener('change', e => {
        document.getElementById('admin-word-match').disabled = e.target.value === 'allow';
    });
    document.getElementById('form-admin-word').addEventListener('submit', async e => {
        e.preventDefault();
        const input = document.getElementById('admin-word');
        const res = await post('/api/admin/words', {
            word: input.value, kind: document.getElementById('admin-word-kind').value, match: document.getElementById('admin-word-match').value,
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
        const res = await post('/api/admin/words/check', { text: document.getElementById('admin-wordcheck').value }).catch(() => null);
        const data = res && res.ok ? await res.json() : null;
        if (!data) { out.textContent = tx('Netzwerkfehler.'); out.style.color = 'var(--red)'; return; }
        out.textContent = data.words.length ? tx('Würde gesperrt: %s', data.words.join(', ')) : tx('Kein Treffer – der Text würde gesendet.');
        out.style.color = data.words.length ? 'var(--red)' : 'var(--ok)';
    });

    // --- OAuth Config (Super Admin) ---
    let oauthLoaded = false;
    async function loadOAuthConfig() {
        if (oauthLoaded) return;          // keep what is being typed when the section is opened again
        try {
            const res = await fetch('/api/admin/oauth');
            if (!res.ok) return;
            const data = await res.json();
            oauthLoaded = true;

            // Callback URLs exactly as the server sends them to Google/Discord (from BASE_URL)
            const baseUrl = data.callbackBase || window.location.origin;
            const cbGoogle = document.getElementById('oauth-callback-google');
            const cbDiscord = document.getElementById('oauth-callback-discord');
            if (cbGoogle) cbGoogle.value = `${baseUrl}/api/auth/google/callback`;
            if (cbDiscord) cbDiscord.value = `${baseUrl}/api/auth/discord/callback`;
            if (cbDiscord && baseUrl !== window.location.origin) {
                const warn = document.createElement('div');
                warn.style.cssText = 'color:var(--red); font-weight:bold; margin-top:6px;';
                warn.textContent = tx('Achtung: Der Server verwendet %s, die Seite läuft aber unter %s.', baseUrl, window.location.origin) + ' ' +
                    tx('BASE_URL in der .env des Servers setzen, sonst schlägt der Login fehl (redirect_uri).');
                cbDiscord.parentNode.after(warn);
            }
            if (data.google) {
                document.getElementById('oauth-google-clientid').value = data.google.clientId || '';
                document.getElementById('oauth-google-secret').value = data.google.clientSecret || '';
                document.getElementById('oauth-google-enabled').checked = data.google.enabled || false;
            }
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

    // "Kopieren" next to a callback URL
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.copy);
        input.select();
        (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).then(() => {
            btn.textContent = '✓ ' + tx('Kopiert');
            setTimeout(() => { btn.textContent = tx('Kopieren'); }, 1500);
        }, () => { });           // not allowed: the URL is selected, Ctrl+C works
    }));

    window.saveOAuthConfig = async (provider) => {
        const msg = document.getElementById(`oauth-${provider}-msg`);
        msg.textContent = tx('Speichert...');
        msg.style.color = '';
        const botTokenEl = document.getElementById(`oauth-${provider}-bottoken`);
        const body = {
            clientId: document.getElementById(`oauth-${provider}-clientid`).value,
            clientSecret: document.getElementById(`oauth-${provider}-secret`).value,
            enabled: document.getElementById(`oauth-${provider}-enabled`).checked,
        };
        if (botTokenEl) body.botToken = botTokenEl.value;
        try {
            const res = await post(`/api/admin/oauth/${provider}`, body);
            if (res.ok) {
                msg.textContent = tx('Gespeichert! Strategien neu geladen.');
                msg.style.color = 'var(--ok)';
            } else {
                const err = await res.json();
                msg.textContent = txs(err.error || 'Fehler beim Speichern.');
                msg.style.color = 'var(--red)';
            }
        } catch (e) {
            msg.textContent = tx('Netzwerkfehler.');
            msg.style.color = 'var(--red)';
        }
    };
});
