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
    user: null,

    fetchUser: async function () {
        try {
            const res = await fetch(`${this.serverUrl}/api/auth/me`, { cache: 'no-cache' });
            if (res.ok) {
                this.user = await res.json();
            } else {
                this.user = null;
            }
        } catch (e) {
            this.user = null;
        }
    },

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

        const updateHudName = (hn) => {
            if (hn && typeof S !== 'undefined' && S && S.players && S.cur !== undefined) {
                const curCiv = S.players[S.cur].civ;
                const sPlayer = S.players[S.cur];
                const p = MP.players.find(x => x.civ === curCiv);

                const civDef = typeof CIV_BY_KEY !== 'undefined' ? CIV_BY_KEY[curCiv] : null;
                const nationName = civDef ? civDef.n : curCiv;

                let abName = sPlayer.ability || 'basis';
                let abDesc = '';
                if (civDef && civDef.abilities) {
                    const abDef = civDef.abilities.find(a => a.k === abName);
                    if (abDef) {
                        abName = abDef.n;
                        abDesc = abDef.e;
                    }
                }
                const abBadge = ` <span title="${abDesc.replace(/"/g, '&quot;')}" style="cursor:help; background:rgba(0,0,0,0.1); border:1px solid rgba(0,0,0,0.2); border-radius:4px; padding:1px 6px; font-size:11px; margin-left:6px; display:inline-block; vertical-align:middle; line-height:1.2">${abName}</span>`;

                let displayName = nationName;
                if (sPlayer.kind === 'bot') {
                    displayName += ' <span style="opacity:0.75;font-weight:normal;">(· Bot)</span>';
                } else if (p && p.name) {
                    displayName += ` <span style="opacity:0.75;font-weight:normal;">(${p.name})</span>`;
                    if (p.mmr) {
                        displayName += ` <span style="opacity:0.6;font-size:11px;background:rgba(0,0,0,0.2);padding:1px 4px;border-radius:3px;margin-left:4px">[${p.mmr} MMR]</span>`;
                    }
                }

                const finalHtml = displayName + abBadge;
                if (hn.innerHTML !== finalHtml) {
                    hn.innerHTML = finalHtml;
                }
            }
        };

        if (!this._hudObserver) {
            this._hudObserver = new MutationObserver(() => {
                const hn = document.getElementById('hud-name');
                if (hn) updateHudName(hn);
            });
            const target = document.getElementById('hud-name');
            if (target) {
                this._hudObserver.observe(target, { childList: true, characterData: true, subtree: true });
            }
        }

        // Trigger initial hit
        const hn = document.getElementById('hud-name');
        if (hn) updateHudName(hn);
    },

    updatePersistentLog: function () {
        if (!this.active || typeof S === 'undefined' || !S || !S.log) return;
        const plc = document.getElementById('mp-persistent-log-container');
        const pl = document.getElementById('mp-persistent-log-content');
        if (pl && plc && typeof logHtml === 'function') {
            const isScrolledToBottom = pl.scrollHeight - pl.clientHeight <= pl.scrollTop + 10;
            plc.style.display = 'block';
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
                MP.renderLobby = null; closeModal();

                // Clever trick: Tell the native random map generator that EVERY other player across the network is a Bot!
                // This tricks the native UI to instantly autocomplete them and ONLY present the single local player queue 
                // for placement! This enables seamless simultaneous decentralized drafting!
                data.cfg.players = MP.players.map(p => {
                    return p.index === MP.lobbyIndex ? p : { ...p, kind: 'bot' };
                });

                window.placeReveal = function () {
                    // Suppress revealing the map locally since we must wait for server resolution!
                    document.body.classList.add('mp-waiting');
                    if (MP.placementFinished) window.toast("Warten auf andere Spieler...");
                }

                const origPlaceSeat = window.placeSeat;
                window.placeSeat = function (plan, seat, o, cell) {
                    if (seat.idx === MP.lobbyIndex) {
                        MP.placementFinished = true;
                        MP.socket.emit('placement:action', { o, cell }, res => {
                            if (res && res.error) window.toast(res.error);
                        });
                        document.body.classList.add('mp-waiting');
                        window.toast('Warten auf andere Spieler...');
                    }
                    return origPlaceSeat(plan, seat, o, cell);
                };

                const origRandom = Math.random;
                // Force seed predictability
                Math.random = () => (data.seed / (Math.pow(2, 31)));
                try {
                    window.startPlacement(data.cfg);
                } finally {
                    Math.random = origRandom;
                }
            });

            this.socket.on('game:start', data => {
                S = data.state;
                MP.playerIndex = data.yourIndex;
                MP.lastTurn = S.cur;

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



        renderMainMenuAuth: async function () {
        await this.fetchUser();
        if (!this.user) {
            window.location.href = '/';
            return;
        }
        const authContainer = $('mp-main-auth-container');
        if (!authContainer) return;
        authContainer.innerHTML = `
            <div style="background:rgba(128,128,128,0.15); padding:8px; border-radius:4px; margin-bottom:15px; text-align:center; font-size:14px;">
                Eingeloggt als <b>${this.user.username}</b> 
                (<b>${this.user.mmr} MMR</b>, ${this.user.gamesPlayed} Spiele) 
                <span style="opacity:0.5; margin:0 6px;">|</span> 
                <a href="/" style="text-decoration:underline; cursor:pointer;">Portal / Abmelden</a>
            </div>
        `;
        if (this.renderLobby) this.renderLobby();
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

// ── Inject Multiplayer Button and Auth Bar ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const mNew = $('m-new');
    if (mNew) {
        // Multiplaxer Button
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = 'Multiplayer';
        btn.onclick = () => MP.showLobby();
        mNew.parentNode.insertBefore(btn, $('m-continue'));

        // Auth Container for Main Menu
        const authDiv = document.createElement('div');
        authDiv.id = 'mp-main-auth-container';
        // Insert right above the action boxes
        const menuActions = document.querySelector('.menu-actions');
        if (menuActions && menuActions.parentNode) {
            menuActions.parentNode.insertBefore(authDiv, menuActions);
        }

        // Render it
        MP.renderMainMenuAuth();
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
        #mp-persistent-log-container {
            position: fixed; right: 10px; top: 60px; width: 320px;
            background: rgba(255,255,240,0.95); pointer-events: auto;
            border: 2px solid #a89f91; border-radius: 6px; z-index: 50;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 13px; display: none; color: #333; overflow: hidden;
        }
        #mp-persistent-log-header {
            background:#a89f91; color:white; padding:6px 10px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; user-select:none;
        }
        #mp-persistent-log-content {
            max-height: 40vh; overflow-y: auto; padding: 10px; display: block;
        }
        #mp-persistent-log-content .logline { margin-bottom: 4px; }
        #mp-persistent-log-content .rolls { padding-left: 10px; opacity: 0.8; font-size: 12px; }
    `;
    document.head.appendChild(style);

    const pLog = document.createElement('div');
    pLog.id = 'mp-persistent-log-container';
    pLog.innerHTML = `
        <div id="mp-persistent-log-header">
            <span>Spiel-Log</span>
            <span id="mp-log-toggle-icon">▼</span>
        </div>
        <div id="mp-persistent-log-content"></div>
    `;
    document.body.appendChild(pLog);

    document.getElementById('mp-persistent-log-header').addEventListener('click', () => {
        const content = document.getElementById('mp-persistent-log-content');
        const icon = document.getElementById('mp-log-toggle-icon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.innerText = '▼';
        } else {
            content.style.display = 'none';
            icon.innerText = '▲';
        }
    });

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
    useFreePick: (state, pi, tech) => ({ type: 'freePick', params: { tech } }),
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
