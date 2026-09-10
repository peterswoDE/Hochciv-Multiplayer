document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;

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

        // Admin mode
        if (data.role === 'admin') {
            document.querySelectorAll('.admin-tab').forEach(el => el.style.display = 'block');
            loadAdminData();
            setInterval(loadAdminData, 10000); // refresh every 10s
        }

    } catch (e) {
        window.location.href = '/'; // redirect to portal if not logged in
        return;
    }

    // --- Profile Forms ---
    document.getElementById('form-email').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-email');
        msg.textContent = 'Speichert...';
        msg.style.color = 'black';

        const res = await fetch('/api/account/update-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById('input-email').value })
        });
        const json = await res.json();
        if (res.ok) {
            msg.textContent = 'E-Mail erfolgreich aktualisiert!';
            msg.style.color = 'green';
        } else {
            msg.textContent = json.error || 'Fehler beim Speichern.';
            msg.style.color = 'red';
        }
    });

    document.getElementById('form-password').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg-password');
        msg.textContent = 'Speichert...';
        msg.style.color = 'black';

        const res = await fetch('/api/account/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                currentPassword: document.getElementById('input-current-pw').value,
                newPassword: document.getElementById('input-new-pw').value
            })
        });
        const json = await res.json();
        if (res.ok) {
            msg.textContent = 'Passwort erfolgreich aktualisiert!';
            msg.style.color = 'green';
            e.target.reset();
        } else {
            msg.textContent = json.error || 'Fehler beim Speichern.';
            msg.style.color = 'red';
        }
    });

    // --- History ---
    async function loadHistory() {
        const tbody = document.querySelector('#table-history tbody');
        try {
            const res = await fetch('/api/account/history');
            const games = await res.json();
            
            if (games.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">Keine vergangenen Spiele gefunden.</td></tr>';
                return;
            }

            tbody.innerHTML = games.map(g => {
                const date = new Date(g.matchDate).toLocaleString('de-DE');
                const players = g.participants.map(p => p.name).join(', ');
                const isWinner = g.winnerUsername === currentUser.username;
                return `
                    <tr style="background: ${isWinner ? 'rgba(0,255,0,0.05)' : 'transparent'}">
                        <td>${date}</td>
                        <td>${g.durationRounds}</td>
                        <td>${g.winnerUsername ? (isWinner ? '<b>Du!</b>' : g.winnerUsername) : '-'}</td>
                        <td style="font-size:13px">${players}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4">Fehler beim Laden.</td></tr>';
        }
    }

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
                btn.textContent = 'Deaktivieren';
                btn.classList.add('error');
            } else {
                btn.textContent = 'Aktivieren';
                btn.classList.remove('error');
            }
            document.getElementById('admin-registration').checked = mData.registrationEnabled;

            // Lobbies
            const lRes = await fetch('/api/admin/lobbies');
            const lobbies = await lRes.json();
            const lBody = document.querySelector('#table-admin-lobbies tbody');
            lBody.innerHTML = lobbies.length === 0 ? '<tr><td colspan="4">Keine Lobbys aktiv.</td></tr>' : lobbies.map(l => `
                <tr>
                    <td><b>${l.joinCode}</b></td>
                    <td>${l.status}</td>
                    <td>${l.players.length} Spieler</td>
                    <td>
                        <button onclick="adminAction('lobby', '${l.id}', 'broadcast')" class="btn small">Rundruf</button>
                        <button onclick="adminAction('lobby', '${l.id}', 'close')" class="btn small error">Schließen</button>
                    </td>
                </tr>
            `).join('');

            // Users
            const uRes = await fetch('/api/admin/users');
            const users = await uRes.json();
            const uBody = document.querySelector('#table-admin-users tbody');
            uBody.innerHTML = users.map(u => {
                let badges = '';
                if (u.role === 'admin') badges += '<span class="badge admin">Admin</span> ';
                if (u.isBanned) badges += '<span class="badge banned">Banned</span> ';
                return `
                <tr>
                    <td>${u.username} <br><small>${u.email}</small></td>
                    <td>${badges || '-'}</td>
                    <td>${u.gamesPlayed}</td>
                    <td>${u.mmr}</td>
                    <td>
                        <button onclick="adminAction('user', '${u.id}', '${u.isBanned ? 'unban' : 'ban'}')" class="btn small ${u.isBanned ? '' : 'error'}">${u.isBanned ? 'Entbannen' : 'Bannen'}</button>
                        <button onclick="adminAction('user', '${u.id}', 'force_password')" class="btn small">PW Reset</button>
                    </td>
                </tr>
            `}).join('');
            
        } catch (e) {
            console.error(e);
        }
    }

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
            const msg = prompt('Nachricht an Lobby senden:');
            if (!msg) return;
            payload.message = msg;
        } else if (action === 'force_password') {
            const pwd = prompt('Neues Passwort eingeben:');
            if (!pwd) return;
            payload.newPassword = pwd;
        } else {
            if (!confirm(`Sicher, dass du '${action}' ausführen möchtest?`)) return;
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
            alert('Fehler: ' + (err.error || 'Unbekannt'));
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
});
