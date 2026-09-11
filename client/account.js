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

    let historyGames = [];

    // --- History ---
    async function loadHistory() {
        const tbody = document.querySelector('#table-history tbody');
        try {
            const res = await fetch('/api/account/history');
            historyGames = await res.json();
            
            if (historyGames.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">Keine vergangenen Spiele gefunden.</td></tr>';
                return;
            }

            tbody.innerHTML = historyGames.map((g, idx) => {
                const date = new Date(g.matchDate).toLocaleString('de-DE');
                const players = g.participants.map(p => p.name).join(', ');
                const isWinner = g.winnerUsername && g.winnerUsername === currentUser.username;
                return `
                    <tr style="background: ${isWinner ? 'rgba(0,255,0,0.05)' : 'transparent'}; cursor:pointer;" onclick="showGameDetails(${idx})" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='${isWinner ? 'rgba(0,255,0,0.05)' : 'transparent'}'">
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

    window.showGameDetails = function(idx) {
        const g = historyGames[idx];
        if (!g) return;

        const sorted = [...g.participants].sort((a, b) => (b.points || 0) - (a.points || 0));

        let tafel = `<table style="width:100%; border-collapse: collapse; margin:10px 0; text-align:left;">
            <tr style="border-bottom:2px solid #ccc;">
                <th style="padding:8px;">Spieler</th>
                <th style="padding:8px;">Nation</th>
                <th style="padding:8px;">Bev.</th>
                <th style="padding:8px;">Wunder</th>
                <th style="padding:8px;">Techs</th>
                <th style="padding:8px;">Punkte</th>
                <th style="padding:8px;">MMR &Delta;</th>
            </tr>`;

        tafel += sorted.map(x => {
            const isWinner = g.winnerUsername && (x.name === g.winnerUsername || x.dbUsername === g.winnerUsername);
            const pop = x.scoreDetails ? x.scoreDetails.pop : '-';
            const won = x.scoreDetails ? x.scoreDetails.wonders : '-';
            const tech = x.scoreDetails ? x.scoreDetails.techs : '-';
            
            const mmrShift = x.mmrShift != null ? (x.mmrShift > 0 ? `+${x.mmrShift}` : `${x.mmrShift}`) : '-';
            const mmrColor = x.mmrShift > 0 ? 'green' : (x.mmrShift < 0 ? 'red' : 'inherit');

            return `<tr style="border-bottom:1px solid #eee; ${isWinner ? 'font-weight:bold; background:rgba(0,255,0,0.05);' : ''}">
                <td style="padding:8px;">${x.name} ${x.isBot ? '(Bot)' : ''}</td>
                <td style="padding:8px;">${x.civ || '-'}</td>
                <td style="padding:8px;">${pop}</td>
                <td style="padding:8px;">${won}</td>
                <td style="padding:8px;">${tech}</td>
                <td style="padding:8px;"><b>${x.points || 0}</b></td>
                <td style="padding:8px; color:${mmrColor}; font-weight:bold;">${mmrShift}</td>
            </tr>`;
        }).join('');
        tafel += '</table>';

        const dateStr = new Date(g.matchDate).toLocaleString('de-DE');
        
        document.getElementById('hm-title').innerHTML = `Spielauswertung <span style="font-size:14px; color:#666; font-weight:normal; margin-left:10px;">(${dateStr})</span>`;
        document.getElementById('hm-body').innerHTML = tafel;
        
        document.getElementById('history-modal').style.display = 'flex';
    };

    // --- 2FA / MFA Setup ---
    const btnSetupTotp = document.getElementById('btn-setup-totp');
    const btnSetupPasskey = document.getElementById('btn-setup-passkey');
    const btnEnableEmailOtp = document.getElementById('btn-enable-email-otp');
    const totpModal = document.getElementById('totp-setup-modal');
    
    if(btnSetupTotp) btnSetupTotp.addEventListener('click', async () => {
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

    const btnVerifyTotp = document.getElementById('btn-verify-totp');
    if(btnVerifyTotp) btnVerifyTotp.addEventListener('click', async () => {
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
            alert('2FA erfolgreich aktiviert!');
            loadTokens();
        } else {
            document.getElementById('totp-setup-msg').textContent = data.error || 'Falscher Code';
        }
    });

    if (btnEnableEmailOtp) btnEnableEmailOtp.addEventListener('click', async () => {
        const res = await fetch('/api/mfa/toggle-email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        if ((await res.json()).ok) {
            btnEnableEmailOtp.style.display = 'none';
            alert('E-Mail OTP aktiviert.');
            loadTokens();
        }
    });

    async function loadTokens() {
        const res = await fetch('/api/mfa/tokens');
        if(!res.ok) return;
        const tokens = await res.json();
        const list = document.getElementById('mfa-tokens-list');
        if(!list) return;
        
        // Hide setup buttons if token of that type is already active
        if(btnSetupTotp) btnSetupTotp.style.display = tokens.some(t => t.type === 'totp') ? 'none' : 'inline-block';
        if(btnEnableEmailOtp) btnEnableEmailOtp.style.display = tokens.some(t => t.type === 'email') ? 'none' : 'inline-block';

        if (tokens.length === 0) {
            list.innerHTML = 'Keine MFA-Methoden aktiv.';
            return;
        }
        list.innerHTML = tokens.map(t => {
            let deleteCall = '';
            if (t.type === 'totp') deleteCall = `deleteToken('totp', null)`;
            else if (t.type === 'email') deleteCall = `deleteToken('email', null)`;
            else if (t.type === 'passkey') deleteCall = `deleteToken('passkey', '${t.id}')`;
            return `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:5px;">
                <span>${t.name}</span>
                <button onclick="${deleteCall}" style="color:red; background:none; border:none; cursor:pointer;">Löschen</button>
            </div>
            `;
        }).join('');
    }

    window.deleteToken = async function(type, id) {
        if(!confirm(type === 'totp' ? 'Authenticator App wirklich entfernen?' : (type === 'email' ? 'E-Mail OTP deaktivieren?' : 'Passkey löschen?'))) return;
        
        if (type === 'passkey') {
            await fetch('/api/mfa/passkey/' + id, { method: 'DELETE' });
        } else if (type === 'totp') {
            await fetch('/api/mfa/disable-totp', { method: 'POST' });
        } else if (type === 'email') {
            await fetch('/api/mfa/toggle-email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
        }
        loadTokens();
    };

    if(btnSetupPasskey) btnSetupPasskey.addEventListener('click', async () => {
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
                loadTokens();
            } else {
                alert('Fehler: ' + vData.error);
            }
        } catch (e) {
            console.error(e);
            alert('Ein Fehler ist aufgetreten.');
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
                if (u.isBanned) badges += '<span class="badge banned">Banned</span> ';
                return `
                <tr>
                    <td>${u.username} <br><small>${u.email}</small></td>
                    <td>
                        <select onchange="adminChangeRole('${u.id}', this.value)" style="margin-right:8px; padding:2px; border-radius:4px; font-size:12px; background:var(--bg); border:1px solid #ccc; color:var(--text);">
                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        ${badges}
                    </td>
                    <td>${u.gamesPlayed}</td>
                    <td>${u.mmr}</td>
                    <td>
                        <button onclick="adminAction('user', '${u.id}', '${u.isBanned ? 'unban' : 'ban'}')" class="btn small ${u.isBanned ? '' : 'error'}">${u.isBanned ? 'Entbannen' : 'Bannen'}</button>
                        <button onclick="adminAction('user', '${u.id}', 'force_password')" class="btn small">PW Reset</button>
                        <button onclick="toggleAdminUserMfa('${u.id}')" class="btn small" style="margin-top: 4px;">MFA Verwalten</button>
                        <div id="admin-user-mfa-${u.id}" style="display:none; margin-top: 10px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 4px; font-size: 13px;"></div>
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
        container.innerHTML = 'Lade...';
        
        try {
            const res = await fetch(`/api/admin/users/${id}/mfa`);
            if (!res.ok) throw new Error();
            const tokens = await res.json();
            
            if (tokens.length === 0) {
                container.innerHTML = 'Keine MFA-Tokens aktiv.';
                return;
            }
            
            container.innerHTML = tokens.map(t => {
                const tokenId = t.id ? `'${t.id}'` : 'null';
                return `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #ddd; padding-bottom:3px;">
                    <span>${t.name}</span>
                    <button onclick="adminDeleteUserMfa('${id}', '${t.type}', ${tokenId})" style="color:red; background:none; border:none; cursor:pointer;">Löschen</button>
                </div>
                `;
            }).join('');
            
        } catch(e) {
            container.innerHTML = '<span style="color:red;">Fehler beim Laden</span>';
        }
    };

    window.adminDeleteUserMfa = async (userId, type, tokenId) => {
        if (!confirm('Diesen MFA-Token wirklich löschen?')) return;
        
        let url = `/api/admin/users/${userId}/mfa/${type}`;
        if (tokenId) url += `/${tokenId}`;
        
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
            // Reload just the MFA container
            document.getElementById(`admin-user-mfa-${userId}`).style.display = 'none';
            window.toggleAdminUserMfa(userId);
        } else {
            alert('Fehler beim Löschen');
        }
    };

    window.adminChangeRole = async (id, role) => {
        if (!confirm(`Sicher, dass du die Rolle auf '${role}' ändern möchtest?`)) {
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
            alert('Fehler: ' + (err.error || 'Unbekannt'));
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
