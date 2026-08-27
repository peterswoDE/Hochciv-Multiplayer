const MP = {
    active: false,
    socket: null,
    sessionId: null,
    lobbyIndex: null,
    playerIndex: null,
    joinCode: null,
    password: null,
    lastTurn: null,
    hostIndex: 0,
    players: [],
    gameConfig: {},
    serverUrl: "",

    getClientId: function () {
        let id = sessionStorage.getItem('mp-clientId');
        if (!id) {
            id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('mp-clientId', id);
        }
        return id;
    },

    animDeinZug: function () {
        if (!this.active || document.getElementById('mp-turn-popup')) return;
        const d = document.createElement('div');
        d.id = 'mp-turn-popup';
        d.textContent = 'DU BIST AM ZUG!';
        d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:8vmin;color:white;font-weight:bold;text-shadow:0 0 20px #000, 0 0 10px #702010;z-index:9999;animation: mpAnimPop 2s forwards;pointer-events:none;text-align:center;line-height:1.2;';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 2100);
    },

    updateHudDelayed: function () {
        if (!this.active) return;

        if (!this._hudObserver) {
            this._hudObserver = new MutationObserver(() => {
                const hn = document.getElementById('hud-name');
                if (hn && typeof S !== 'undefined' && S && S.players && S.cur !== undefined) {
                    const curCiv = S.players[S.cur].civ;
                    const p = MP.players.find(x => x.civ === curCiv);
                    if (p && !hn.innerHTML.includes('opacity:0.75')) {
                        hn.innerHTML = hn.innerHTML + ` <span style="opacity:0.75;font-weight:normal;">(${p.name})</span>`;
                    }
                }
            });
            const target = document.getElementById('hud-name');
            if (target) {
                this._hudObserver.observe(target, { childList: true, characterData: true, subtree: true });
            }
        }

        // Trigger initial hit
        const hn = document.getElementById('hud-name');
        if (hn && typeof S !== 'undefined' && S && S.players && S.cur !== undefined) {
            const curCiv = S.players[S.cur].civ;
            const p = MP.players.find(x => x.civ === curCiv);
            if (p && !hn.innerHTML.includes('opacity:0.75')) {
                hn.innerHTML = hn.innerHTML + ` <span style="opacity:0.75;font-weight:normal;">(${p.name})</span>`;
            }
        }
    },

    updatePersistentLog: function () {
        if (!this.active || typeof S === 'undefined' || !S || !S.log) return;
        const pl = document.getElementById('mp-persistent-log');
        if (pl && typeof logHtml === 'function') {
            const isScrolledToBottom = pl.scrollHeight - pl.clientHeight <= pl.scrollTop + 10;
            pl.style.display = 'block';
            pl.innerHTML = logHtml(S.log.slice(-100)); // Show most recent 100 log lines locally out of ui.js format
            if (isScrolledToBottom) pl.scrollTop = pl.scrollHeight;
        }
    },

    connect: function () {
        if (this.socket) return Promise.resolve();
        return new Promise((resolve) => {
            this.socket = io(this.serverUrl);

            this.socket.on('connect', () => {
                // Auto re-authenticate if we disconnect and reconnect mid-session
                if (MP.active && MP.sessionId) {
                    MP.socket.emit('session:connect', {
                        sessionId: MP.sessionId,
                        playerIndex: MP.lobbyIndex,
                        password: MP.password
                    });
                }
                resolve();
            });

            this.socket.on('player:joined', data => {
                MP.players = data.players;
                if (data.newHostIndex !== undefined) MP.hostIndex = data.newHostIndex;
                toast(`${data.name} ist beigetreten.`);
                if (MP.renderLobby) MP.renderLobby();
            });
            this.socket.on('player:left', data => {
                MP.players = data.players;
                if (data.newHostIndex !== undefined) MP.hostIndex = data.newHostIndex;
                toast(`${data.name} hat das Spiel verlassen.`);
                if (MP.renderLobby) MP.renderLobby();
            });
            this.socket.on('lobby:player:updated', players => {
                MP.players = players;
                if (MP.renderLobby) MP.renderLobby();
            });
            this.socket.on('session:kicked', (data) => {
                MP.active = false;
                toast(data && data.reason ? data.reason : 'Du wurdest vom Host gekickt.');
                MP.setMode('menu'); // Snap directly to menu instead of waiting to reload
            });
            this.socket.on('lobby:config:update', (newConfig) => {
                MP.gameConfig = newConfig;
                if (MP.renderLobby) MP.renderLobby(); // Re-render to update checkboxes if second player
            });

            this.socket.on('placement:start', data => {
                MP.renderLobby = null;
                closeModal();

                // Reconstruct local placeState matching `data.plan` initialized by server.
                data.cfg.players = MP.players; // UI needs the rich player array.
                window.placeState = {
                    cfg: data.cfg,
                    plan: data.plan,
                    rnd: null,
                    queue: data.queue,
                    at: data.at,
                    o: 0, cell: null, done: false
                };

                MP.patchPlacementUI();
                show('screen-place');
                placeStep();
            });

            this.socket.on('placement:update', data => {
                if (window.placeState && !window.placeState.done) {
                    const st = window.placeState;
                    const seat = st.queue[st.at];
                    if (seat) {
                        try {
                            placeSeat(st.plan, seat, data.o, data.cell);
                        } catch (e) { }
                    }
                    st.at = data.at;
                    placeStep();
                }
            });

            this.socket.on('game:start', data => {
                S = data.state;
                MP.playerIndex = data.yourIndex;
                MP.lastTurn = S.cur;

                // Clean up placement UI blocking if coming from placement
                window.placeState = null;
                document.body.classList.remove('mp-waiting');

                MP.syncTurnBlocker();
                MP.renderLobby = null; // Prevent Lobby from opening mid-game on reconnects
                closeModal();
                startGameScreen();
            });


            this.socket.on('state:update', data => {
                S = data.state;
                MP.syncTurnBlocker();
                MP.updateHudDelayed();
                MP.updatePersistentLog();
                // If it's a new turn for us, trigger UI events
                if (S.cur === MP.playerIndex && MP.lastTurn !== S.cur && !S.over) {
                    MP.lastTurn = S.cur;
                    humanTurnStart();
                    MP.animDeinZug();
                } else {
                    MP.lastTurn = S.cur;
                    redraw();
                }
                if (S.over) {
                    gameOver();
                }
            });

            this.socket.on('game:over', winData => {
                S.over = winData;
                gameOver();
            });
        });
    },

    syncTurnBlocker: function () {
        if (S && S.cur !== MP.playerIndex && !S.over) {
            document.body.classList.add('mp-waiting');
        } else {
            document.body.classList.remove('mp-waiting');
        }
    },

    patchPlacementUI: function () {
        if (this._placementPatched) return;
        this._placementPatched = true;

        // Suppress Hotseat modal and track Turns natively
        const origPlaceStep = window.placeStep;
        window.placeStep = function () {
            const st = window.placeState;
            // Native UI finishes when everything is placed, this triggers placeReveal!
            if (!st || st.at >= st.queue.length) {
                document.body.classList.remove('mp-waiting');
                return origPlaceStep();
            }

            st.o = 0; st.cell = null;
            window.drawPlace();

            const seat = window.placeSeatNow();
            if (seat && seat.idx === MP.playerIndex) {
                // Active player's turn to place
                const modal = document.getElementById('modal');
                if (modal) window.closeModal();
                document.body.classList.remove('mp-waiting');
                window.toast('Du bist am Zug, dein Plättchen zu legen!');
            } else if (seat) {
                // Someone else's turn
                const modal = document.getElementById('modal');
                if (modal) window.closeModal();
                document.body.classList.add('mp-waiting');
                const civ = window.seatCiv(seat);
                window.toast(`Warte auf ${civ.n}...`);
            }
        };

        // Redirect Placement Actions to Multiplayer Socket
        const origPlaceConfirm = window.placeConfirm;
        window.placeConfirm = function () {
            const st = window.placeState;
            // If already completed (st.done is true), prevent single-player local map creation. Wait for game:start!
            if (!st || st.done) {
                window.toast('Sychronisiere Spielstart...');
                return;
            }

            const seat = window.placeSeatNow();
            if (!seat) return;
            if (seat.idx !== MP.playerIndex) return window.toast('Du bist nicht am Zug!');
            if (st.cell == null) return window.toast('Erst die Hauptstadt setzen.');

            // Basic validity check natively to avoid round trips for obvious mistakes
            const opts = window.placeOptions(st.plan, seat, st.o);
            if (!opts[st.cell]) return window.toast('Nur auf Land – und nicht zu nah an einem fremden Plättchen.');

            // Emit async to server. DO NOT artificially advance st.at until packet returns to keep determinism.
            MP.socket.emit('placement:action', { o: st.o, cell: st.cell }, res => {
                if (res && res.error) window.toast(res.error);
            });
        };
    },

    showLobby: function () {
        let mode = 'menu';
        const render = () => {
            if (this._publicListTimer) clearInterval(this._publicListTimer);
            let h = '';
            if (mode === 'menu') {
                h = `
          <button class="btn wide primary" style="margin-bottom:10px" onclick="MP.setMode('host')">Neues Spiel hosten (Server)</button>
          <button class="btn wide" onclick="MP.setMode('public-list')">Öffentliche Lobbys suchen</button>
          <button class="btn wide ghost" style="margin-top:10px" onclick="MP.setMode('join')">Privatem Spiel beitreten</button>
        `;
            } else if (mode === 'join') {
                const savedName = localStorage.getItem('mp-name') || 'Spieler';
                h = `
          <label class="row"><span>Beitrittscode</span><input type="text" id="mp-c" style="width:100px;text-transform:uppercase"></label>
          <label class="row"><span>Passwort</span><input type="number" id="mp-p" style="width:100px"></label>
          <label class="row"><span>Dein Name</span><input type="text" id="mp-n" value="${savedName}"></label>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.join()">Beitreten</button>
        `;
            } else if (mode === 'host') {
                const savedName = localStorage.getItem('mp-name') || 'Host';
                h = `
          <label class="row"><span>Dein Name</span><input type="text" id="mp-hn" value="${savedName}"></label>
          <label class="row" style="margin-top:10px"><span>Öffentlich</span><input type="checkbox" id="mp-is-public" checked></label>
          <p class="sub">Nach dem Hosten kannst du die Zivilisation, deren Fähigkeiten und weitere Einstellungen in der Lobby festlegen.</p>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.host()">Hosten</button>
        `;
            } else if (mode === 'public-list') {
                const savedName = localStorage.getItem('mp-name') || 'Spieler';
                h = `
          <label class="row" style="margin-bottom:15px"><span>Dein Name</span><input type="text" id="mp-pln" value="${savedName}"></label>
          <h3 style="margin-bottom:10px">Öffentliche Lobbys</h3>
          <div id="mp-pl-container">Lade...</div>
          <button class="btn wide ghost" style="margin-top:20px" onclick="MP.setMode('menu')">Zurück</button>
        `;

                const fetchList = () => {
                    fetch(`${this.serverUrl}/api/public-sessions`)
                        .then(r => r.json())
                        .then(list => {
                            const c = $('mp-pl-container');
                            if (!c) return;
                            if (list.length === 0) {
                                c.innerHTML = '<p class="sub">Keine öffentlichen Lobbys gefunden.</p>';
                                return;
                            }
                            c.innerHTML = '<table style="width:100%; text-align:left; border-collapse:collapse;">' +
                                list.map(l => `
                                <tr style="border-bottom:1px solid #ccc;">
                                    <td style="padding: 8px 4px;"><b>${l.hostName}</b><br><small>${l.playersCount}/${l.maxPlayers} Spieler</small></td>
                                    <td style="padding: 8px 4px; text-align:right;">
                                        <button class="btn small primary" onclick="MP.joinPublic('${l.joinCode}', '${l.password}')">Beitreten</button>
                                    </td>
                                </tr>
                            `).join('') + '</table>';
                        })
                        .catch(() => {
                            const c = $('mp-pl-container');
                            if (c) c.innerHTML = '<p class="sub error">Fehler beim Laden.</p>';
                        });
                };

                fetchList();
                this._publicListTimer = setInterval(fetchList, 5000);
            } else if (mode === 'waiting') {
                const isHost = this.lobbyIndex === this.hostIndex;
                let trs = this.players.map(p => {
                    const isMe = p.index === this.lobbyIndex;
                    const isPlayerHost = p.index === this.hostIndex;
                    const civOpts = '<option value="random" ' + (p.civ === 'random' ? 'selected' : '') + '>Zufall</option>' + CIVS.map(c => `<option value="${c.k}" ${p.civ === c.k ? 'selected' : ''}>${c.n}</option>`).join('');
                    const civDef = CIVS.find(c => c.k === (p.civ || 'griechenland'));
                    let abOpts = '';
                    if (p.civ === 'random') {
                        abOpts = '<option value="random" selected>Zufall</option>';
                    } else if (civDef) {
                        abOpts = '<option value="random" ' + (p.ability === 'random' ? 'selected' : '') + '>Zufall</option>' + civDef.abilities.map(a => `<option value="${a.k}" ${p.ability === a.k ? 'selected' : ''}>${a.n}</option>`).join('');
                    }

                    return `
                    <tr>
                        <td><b>${p.name}</b> ${isPlayerHost ? '(Host)' : ''}</td>
                        <td style="padding: 4px;">
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-civ-${p.index}" ${isMe ? '' : 'disabled'} style="${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${civOpts}</select>
                            <br/>
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-ab-${p.index}" ${isMe ? '' : 'disabled'} style="margin-top: 4px; font-size: 13px; ${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${abOpts}</select>
                        </td>
                        <td>${p.connected ? 'Verbunden' : 'Wartet'}</td>
                        <td style="text-align:right">${isHost && !isMe ? `<button class="btn small error" onclick="MP.kickPlayer(${p.index})">Kick</button>` : ''}</td>
                    </tr>
                `}).join('');

                h = `
          <h3>Lobby <span class="sub" style="float:right">Code: <b>${this.joinCode}</b> · Passwort: <b>${this.password}</b></span></h3>
          <table style="width:100%; text-align:left; border-collapse:collapse; margin-bottom:15px;">
            <tr style="border-bottom:1px solid #ccc;opacity:0.7"><th>Spieler</th><th>Ziv</th><th>Status</th><th></th></tr>
            ${trs}
          </table>

          <h4>Spieleinstellungen</h4>
          <div style="background:#f4ebd8; padding:10px; border-radius:4px; margin-bottom:15px; pointer-events:${isHost ? 'all' : 'none'}; opacity:${isHost ? 1 : 0.4}; filter:${isHost ? 'none' : 'grayscale(100%)'}">
              <label class="row"><span>Karte</span>
                <select id="mp-set-map" onchange="MP.updateLobbyConfig()">
                  <option value="0" ${this.gameConfig.mapKey === '0' ? 'selected' : ''}>Originalkarte (12 × 18)</option>
                  <option value="gross" ${this.gameConfig.mapKey === 'gross' ? 'selected' : ''}>Große Karte (15 × 24)</option>
                  <option value="random" ${this.gameConfig.mapKey === 'random' ? 'selected' : ''}>Zufall</option>
                </select>
              </label>
              <label class="row"><span>Mit Ereignissen</span>
                <input type="checkbox" id="mp-set-events" onchange="MP.updateLobbyConfig()" ${this.gameConfig.events ? 'checked' : ''}>
              </label>
              ${this.gameConfig.events ? `
              <label class="row"><span>Ereignisstärke</span>
                <select id="mp-set-evmode" onchange="MP.updateLobbyConfig()">
                  <option value="hard" ${this.gameConfig.eventMode === 'hard' ? 'selected' : ''}>Hart (jede Runde)</option>
                  <option value="easy" ${this.gameConfig.eventMode === 'easy' ? 'selected' : ''}>Leicht (selten)</option>
                </select>
              </label>` : ''}
              <label class="row"><span>Mit Weltwundern</span>
                <input type="checkbox" id="mp-set-wonders" onchange="MP.updateLobbyConfig()" ${this.gameConfig.wonders ? 'checked' : ''}>
              </label>
              <label class="row"><span>Schwierigkeit (Bots)</span>
                <select id="mp-set-diff" onchange="MP.updateLobbyConfig()">
                  ${DIFFICULTIES.map(d => `<option value="${d.k}" ${this.gameConfig.difficulty === d.k ? 'selected' : ''}>${d.n}</option>`).join('')}
                </select>
              </label>
          </div>

          ${isHost ? '<button class="btn wide primary" onclick="MP.startGame()">Spiel starten</button>' : ''}
        `;
            }
            modal('Multiplayer', h);
        };
        this.setMode = (m) => { mode = m; render(); };
        this.renderLobby = render; // Export render method to dynamically update when lobby state changes
        render();
    },

    updateLobbyConfig: function () {
        if (this.lobbyIndex !== this.hostIndex) return;
        const evModeEl = $('mp-set-evmode');
        const newConfig = {
            mapKey: $('mp-set-map').value,
            events: $('mp-set-events').checked,
            eventMode: evModeEl ? evModeEl.value : (this.gameConfig.eventMode || 'hard'),
            wonders: $('mp-set-wonders').checked,
            difficulty: $('mp-set-diff').value,
        };
        this.socket.emit('lobby:config', newConfig);
    },

    updateLobbyPlayer: function () {
        if (this.lobbyIndex == null) return;
        const civSelect = $(`mp-p-civ-${this.lobbyIndex}`);
        const abSelect = $(`mp-p-ab-${this.lobbyIndex}`);
        if (!civSelect || !abSelect) return;
        this.socket.emit('lobby:player:update', {
            civ: civSelect.value,
            ability: abSelect.value
        });
    },

    kickPlayer: function (playerIndex) {
        if (confirm('Diesen Spieler unwiderruflich kicken?')) {
            this.socket.emit('session:kick', { playerIndex });
        }
    },

    join: async function () {
        const joinCode = $('mp-c').value.trim();
        const password = $('mp-p').value.trim();
        const name = $('mp-n').value.trim();
        localStorage.setItem('mp-name', name);

        if (!joinCode || !password) return toast('Bitte Code und Passwort eingeben.');

        try {
            toast('Verbinde...');
            const res = await fetch(`${this.serverUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, player: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error || 'Fehler beim Beitritt.');

            this.sessionId = data.sessionId;
            this.lobbyIndex = data.playerIndex;
            this.joinCode = joinCode;
            this.password = password;

            await this.connect();

            this.socket.emit('session:connect', {
                sessionId: this.sessionId,
                playerIndex: this.lobbyIndex,
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);

                this.active = true;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                const credBox = $('mp-cred-box');
                if (credBox) credBox.textContent = `Code: ${this.joinCode}  PW: ${this.password}`;

                if (ack.status === 'playing') {
                    toast('Spiel läuft, lade Zustand...');
                }
                else {
                    this.setMode('waiting');
                }
            });
        } catch (e) {
            console.error(e);
            toast('Server nicht erreichbar: ' + e.message);
        }
    },

    joinPublic: async function (joinCode, password) {
        const nameInput = $('mp-pln');
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) return toast('Bitte Namen eingeben.');

        localStorage.setItem('mp-name', name);

        try {
            toast('Verbinde...');
            const res = await fetch(`${this.serverUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, player: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error || 'Fehler beim Beitritt.');

            this.sessionId = data.sessionId;
            this.lobbyIndex = data.playerIndex;
            this.joinCode = joinCode;
            this.password = password;

            await this.connect();

            this.socket.emit('session:connect', {
                sessionId: this.sessionId,
                playerIndex: this.lobbyIndex,
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);

                this.active = true;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                const credBox = $('mp-cred-box');
                if (credBox) credBox.textContent = `Code: ${this.joinCode}  PW: ${this.password}`;

                if (ack.status === 'playing') {
                    toast('Spiel läuft, lade Zustand...');
                }
                else {
                    this.setMode('waiting');
                }
            });
        } catch (e) {
            console.error(e);
            toast('Server nicht erreichbar: ' + e.message);
        }
    },

    host: async function () {
        const name = $('mp-hn').value.trim();
        const isPublicCheckbox = $('mp-is-public');
        const isPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;
        localStorage.setItem('mp-name', name);

        // Create local config with valid defaults (since Singleplayer UI is bypassed)
        const config = {
            seed: Math.floor(Math.random() * 2 ** 31) | 0,
            isPublic: isPublic,
            duel: false, // Could read from setupMode if needed
            events: false,
            eventMode: 'hard',
            wonders: false,
            difficulty: 'prinz',
            mapKey: '0'
        };

        try {
            toast('Erstelle Sitzung...');
            const res = await fetch(`${this.serverUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, host: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error || 'Fehler beim Hosten.');

            this.sessionId = data.sessionId;
            this.joinCode = data.joinCode;
            this.password = data.password;
            this.lobbyIndex = 0; // Host is always 0
            this.gameConfig = config;

            await this.connect();

            this.socket.emit('session:connect', {
                sessionId: this.sessionId,
                playerIndex: this.lobbyIndex,
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                this.active = true;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || config;
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                const credBox = $('mp-cred-box');
                if (credBox) credBox.textContent = `Code: ${this.joinCode}  PW: ${this.password}`;

                this.setMode('waiting');
            });
        } catch (e) {
            console.error(e);
            toast('Server nicht erreichbar: ' + e.message);
        }
    },

    startGame: function () {
        this.socket.emit('game:start', {}, (ack) => {
            if (ack.error) toast(ack.error);
        });
    }
};

// ── Inject Multiplayer Button ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const mNew = $('m-new');
    if (mNew) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = 'Multiplayer';
        btn.onclick = () => MP.showLobby();
        mNew.parentNode.insertBefore(btn, $('m-continue'));
    }

    // Inject Turn Blocker CSS rules
    const style = document.createElement('style');
    style.textContent = `
        .mp-waiting .actionbar { pointer-events: none !important; opacity: 0.5 !important; filter: grayscale(100%); }
        .mp-waiting #sheet { pointer-events: none !important; }
        .mp-waiting .sheet-close { opacity: 0 !important; }
        .mp-waiting-toast {
            display: none; position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
            background: #904030; color: white; padding: 6px 14px; border-radius: 4px; z-index: 1000; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        }
        .mp-waiting .mp-waiting-toast { display: block; }
        @keyframes mpAnimPop {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
            80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
        }
        #mp-persistent-log {
            position: fixed; right: 10px; top: 60px; width: 320px; max-height: 50vh;
            overflow-y: auto; background: rgba(255,255,240,0.95); pointer-events: auto;
            border: 2px solid #a89f91; padding: 10px; border-radius: 6px; z-index: 50;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 13px; display: none; color: #333;
        }
        #mp-persistent-log .logline { margin-bottom: 4px; }
        #mp-persistent-log .rolls { padding-left: 10px; opacity: 0.8; font-size: 12px; }
    `;
    document.head.appendChild(style);

    const pLog = document.createElement('div');
    pLog.id = 'mp-persistent-log';
    document.body.appendChild(pLog);

    // Inject Turn Blocker active toast
    const waitToast = document.createElement('div');
    waitToast.className = 'mp-waiting-toast';
    waitToast.textContent = 'Warte auf deinen Zug...';
    document.body.appendChild(waitToast);

    // Inject Credentials Box into Game Screen HUD Bar
    const headerHud = document.querySelector('.hud');
    if (headerHud && !$('mp-cred-wrapper')) {
        const wrap = document.createElement('div');
        wrap.id = 'mp-cred-wrapper';
        wrap.style.cssText = 'flex-grow: 1; display: flex; justify-content: center; align-items: center;';
        wrap.innerHTML = `
          <span class="res" style="cursor:text; user-select:text; padding: 4px 10px;" title="Lobby Zugangsdaten">
            <i style="font-style:normal; margin-right:4px;">🌐</i> 
            <b id="mp-cred-box" style="font-family:monospace; font-size:14px;"></b>
          </span>
        `;
        headerHud.insertBefore(wrap, document.querySelector('.hud-res'));
    }
});

// ── Monkey Patch Engine Actions ─────────────────────────────────────────────
const ACTIONS = {
    doResearch: (state, pi, tech) => ({ type: 'research', params: { tech } }),
    useFreeTech: (state, pi, tech) => ({ type: 'freeTech', params: { tech } }),
    useBackPick: (state, pi, tech) => ({ type: 'backPick', params: { tech } }),
    copyTech: (state, pi, tech, mode) => ({ type: 'copyTech', params: { tech, mode } }),
    foundCity: (state, pi, r, c) => ({ type: 'foundCity', params: { r, c } }),
    growCity: (state, pi, city, mode) => ({ type: 'growCity', params: { cityId: city.id, mode } }),
    sacrifice: (state, pi, city) => ({ type: 'sacrifice', params: { cityId: city.id } }),
    buildArmy: (state, pi, city) => ({ type: 'buildArmy', params: { cityId: city.id } }),
    moveArmy: (state, army, r, c) => ({ type: 'moveArmy', params: { armyId: army.id, r, c } }),
    buyPower: (state, pi, n) => ({ type: 'buyPower', params: { n } }),
    buildRoad: (state, pi, r, c, target) => ({ type: 'buildRoad', params: { r, c, target } }),
    buyTile: (state, pi, r, c) => ({ type: 'buyTile', params: { r, c } }),
    coverPop: (state, pi, kind, amount) => ({ type: 'coverPop', params: { kind, amount } }),
    uncoverPop: (state, pi, kind, amount) => ({ type: 'uncoverPop', params: { kind, amount } }),
    buildWonder: (state, pi, city, wonder) => ({ type: 'buildWonder', params: { cityId: city.id, wonder } }),
    nuke: (state, pi, r, c) => ({ type: 'nuke', params: { r, c } })
};

for (const [fnName, makePayload] of Object.entries(ACTIONS)) {
    const orig = window[fnName];
    if (!orig) continue; // safety check
    window[fnName] = function (state, ...args) {
        if (MP.active) {
            const pi = fnName === 'moveArmy' ? args[0].owner : args[0];
            if (pi !== MP.playerIndex) return 'Du bist nicht am Zug (oder nicht deine Armee).';

            // 1) Test local execution for validation / Optimistic UI
            const err = orig(state, ...args);
            if (err) return err;

            // 2) Validation passed, send command definitively to authoritative server
            MP.socket.emit('action', makePayload(state, ...args));
            return null;
        }
        return orig(state, ...args);
    };
}

// ── Monkey Patch Turn Button ────────────────────────────────────────────────
const patchTurnButton = setInterval(() => {
    const aEnd = $('a-end');
    if (aEnd && aEnd.onclick) {
        clearInterval(patchTurnButton);
        const origEnd = aEnd.onclick;
        aEnd.onclick = () => {
            if (MP.active) {
                if (MP.playerIndex !== S.cur) return toast('Du bist nicht am Zug!');
                // Keep warnings check from original ui.js
                const warn = pendingWarnings(S, S.cur);
                if (warn.length && !ui.confirmedEnd) {
                    ui.confirmedEnd = true;
                    return toast(warn[0] + ' Nochmal tippen zum Bestätigen.');
                }
                ui.confirmedEnd = false; ui.army = null; ui.sel = null; ui.mode = null;
                closeSheet();

                MP.socket.emit('action', { type: 'endTurn' });
                toast('Warte auf Server...');
            } else {
                origEnd();
            }
        };
    }
}, 100);
