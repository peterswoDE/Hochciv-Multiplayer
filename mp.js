const MP = {
    active: false,
    socket: null,
    sessionId: null,
    playerIndex: null,
    joinCode: null,
    password: null,
    lastTurn: null,
    serverUrl: 'http://localhost:3000',

    connect: function () {
        if (this.socket) return Promise.resolve();
        return new Promise((resolve) => {
            this.socket = io(this.serverUrl);
            this.socket.on('connect', resolve);

            this.socket.on('player:joined', data => toast(`${data.name} ist beigetreten.`));
            this.socket.on('player:left', data => toast(`${data.name} hat das Spiel verlassen.`));

            this.socket.on('game:start', data => {
                S = data.state;
                MP.playerIndex = data.yourIndex;
                MP.lastTurn = S.cur;
                closeModal();
                startGameScreen();
            });

            this.socket.on('state:update', data => {
                S = data.state;
                // If it's a new turn for us, trigger UI events
                if (S.cur === MP.playerIndex && MP.lastTurn !== S.cur && !S.over) {
                    MP.lastTurn = S.cur;
                    humanTurnStart();
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

    showLobby: function () {
        let mode = 'menu';
        const render = () => {
            let h = '';
            if (mode === 'menu') {
                h = `
          <button class="btn wide primary" style="margin-bottom:10px" onclick="MP.setMode('host')">Neues Spiel hosten (Server)</button>
          <button class="btn wide" onclick="MP.setMode('join')">Einem Spiel beitreten</button>
        `;
            } else if (mode === 'join') {
                h = `
          <label class="row"><span>Beitrittscode</span><input type="text" id="mp-c" style="width:100px;text-transform:uppercase"></label>
          <label class="row"><span>Passwort</span><input type="number" id="mp-p" style="width:100px"></label>
          <label class="row"><span>Dein Name</span><input type="text" id="mp-n" value="Spieler"></label>
          <label class="row"><span>Zivilisation</span>
            <select id="mp-civ">${CIVS.map(c => `<option value="${c.k}">${c.n}</option>`).join('')}</select>
          </label>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.join()">Beitreten</button>
        `;
            } else if (mode === 'host') {
                h = `
          <label class="row"><span>Dein Name</span><input type="text" id="mp-hn" value="Host"></label>
          <label class="row"><span>Zivilisation</span>
            <select id="mp-hciv">${CIVS.map(c => `<option value="${c.k}">${c.n}</option>`).join('')}</select>
          </label>
          <p class="sub">Spieleinstellungen (Karte, Ereignisse, etc.) werden aus dem lokalen Setup-Menü übernommen.</p>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.host()">Hosten</button>
        `;
            } else if (mode === 'waiting') {
                h = `
          <h3>Lobby</h3>
          <p class="sub">Code: <b>${this.joinCode}</b> · Passwort: <b>${this.password}</b></p>
          <p class="sub">Warte auf weitere Spieler...</p>
          ${this.playerIndex === 0 ? '<button class="btn wide primary" onclick="MP.startGame()">Spiel starten</button>' : ''}
        `;
            }
            modal('Multiplayer', h);
        };
        this.setMode = (m) => { mode = m; render(); };
        render();
    },

    join: async function () {
        const joinCode = $('mp-c').value.trim();
        const password = $('mp-p').value.trim();
        const name = $('mp-n').value.trim();
        const civ = $('mp-civ').value;

        if (!joinCode || !password) return toast('Bitte Code und Passwort eingeben.');

        try {
            toast('Verbinde...');
            const res = await fetch(`${this.serverUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, player: { name, civ } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error || 'Fehler beim Beitritt.');

            this.sessionId = data.sessionId;
            this.playerIndex = data.playerIndex;
            this.joinCode = joinCode;
            this.password = password;

            await this.connect();

            this.socket.emit('session:connect', {
                sessionId: this.sessionId,
                playerIndex: this.playerIndex,
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                if (ack.status === 'playing') toast('Das Spiel hat bereits begonnen, warte auf Zustand...');
                else {
                    this.active = true;
                    this.setMode('waiting');
                }
            });
        } catch (e) {
            toast('Server nicht erreichbar.');
        }
    },

    host: async function () {
        const name = $('mp-hn').value.trim();
        const civ = $('mp-hciv').value;

        // Create local config from settings
        const config = {
            seed: Math.floor(Math.random() * 2 ** 31) | 0,
            duel: false, // Could read from setupMode
            events: $('setup-events') ? $('setup-events').checked : false,
            eventMode: $('setup-evmode') ? $('setup-evmode').value : 'hard',
            wonders: $('setup-wonders') ? $('setup-wonders').checked : false,
            difficulty: $('setup-diff') ? $('setup-diff').value : 'prinz',
            mapKey: $('setup-map') && $('setup-map').value === 'zufall' ? 'random' : '0'
        };

        try {
            toast('Erstelle Sitzung...');
            const res = await fetch(`${this.serverUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, host: { name, civ } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error || 'Fehler beim Hosten.');

            this.sessionId = data.sessionId;
            this.joinCode = data.joinCode;
            this.password = data.password;
            this.playerIndex = 0; // Host is always 0

            await this.connect();

            this.socket.emit('session:connect', {
                sessionId: this.sessionId,
                playerIndex: this.playerIndex,
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                this.active = true;
                this.setMode('waiting');
            });
        } catch (e) {
            toast('Server nicht erreichbar.');
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
