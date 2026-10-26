/** Escape text for use inside HTML (names come from other players). */
const escHtml = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Older game versions served at /<version>/ for Rundenspiele started on them (GAME_DIRS in
   engine-adapter.js), and the version of this page. */
const OLD_VERSIONS = ['v88', 'v87', 'v83'];
const APP_VERSION_HERE = typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;

const MP = {
    active: false,
    socket: null,
    sessionId: null,
    lobbyIndex: null,
    playerIndex: null,      // own index in the game state (live and Rundenspiel)
    joinCode: null,
    password: null,
    lastTurn: null,
    hostIndex: 0,
    players: [],
    gameConfig: {},
    serverUrl: "",
    user: null,
    asyncId: null,          // id of the open asynchronous game ("Rundenspiel"), else null
    lastTurnKey: null,
    WIN_BONUS: 10,          // points for the winner on top of victoryScore – same as utils/score.js

    /** Send a game action to the server – live lobby or asynchronous game. */
    sendAction: function (payload, cb) {
        if (this.asyncId) {
            this.socket.emit('async:action', { id: this.asyncId, type: payload.type, params: payload.params }, res => {
                if (res && res.error) { toast(res.error); ASYNC.reload(); }
                if (cb) cb(res);
            });
        } else {
            this.socket.emit('action', payload, cb);
        }
    },

    /** A new authoritative state arrived: redraw, start our turn if it just began. */
    applyState: function (state) {
        S = state;
        MP.syncTurnBlocker();
        MP.updateHudDelayed();
        MP.updatePersistentLog();
        MP.updatePlayerList();
        // round + player: also correct when the same player moves again (everyone else bots)
        const key = S.round + ':' + S.cur;
        if (S.cur === MP.playerIndex && MP.lastTurnKey !== key && !S.over) {
            MP.lastTurnKey = key;
            MP.lastTurn = S.cur;
            humanTurnStart();
            MP.animDeinZug();
        } else {
            MP.lastTurnKey = key;
            MP.lastTurn = S.cur;
            redraw();
        }
        if (S.over) gameOver();
    },

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
        MAPACCOUNT.onUser(this.user);
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
                // Match by seat (state player .slot = lobby index); fall back to civ for old states
                const p = MP.players.find(x => sPlayer.slot != null ? x.index === sPlayer.slot : x.civ === curCiv);

                const civDef = typeof CIV_BY_KEY !== 'undefined' ? CIV_BY_KEY[curCiv] : null;
                const nationName = civDef ? civDef.n : curCiv;

                // abilInfos (v83) knows both the lobby ability and the two drafted in Marathon
                let abils = typeof abilInfos === 'function' ? abilInfos(sPlayer) : null;
                if (!abils) {
                    const abDef = civDef && civDef.abilities ? civDef.abilities.find(a => a.k === (sPlayer.ability || 'basis')) : null;
                    abils = [abDef || { n: sPlayer.ability || 'basis', e: '' }];
                }
                const abBadge = abils.map(a => ` <span title="${(a.e || '').replace(/"/g, '&quot;')}" style="cursor:help; background:rgba(0,0,0,0.1); border:1px solid rgba(0,0,0,0.2); border-radius:4px; padding:1px 6px; font-size:11px; margin-left:6px; display:inline-block; vertical-align:middle; line-height:1.2">${a.n}</span>`).join('');

                let displayName = nationName;
                if (sPlayer.kind === 'bot' || sPlayer.kind === 'ki') {
                    displayName += ` <span style="opacity:0.75;font-weight:normal;">(· ${sPlayer.kind === 'ki' ? 'KI' : 'Bot'})</span>`;
                } else if (p && p.name) {
                    displayName += ` <span style="opacity:0.75;font-weight:normal;">(${escHtml(p.name)})</span>`;
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

    /** Lobby player (name, account) of a state player – `slot` is the lobby / seat index. */
    lobbyPlayerOf: function (sp) {
        const list = this.players || [];
        return list.find(p => p.index === sp.slot) || list.find(p => p.civ === sp.civ) || null;
    },

    /** KI level for the lobby setting; older lobbies still hold a bot difficulty (see kiLevelFor in engine-adapter.js). */
    kiLevel: function (k) {
        if (KI_LEVELS.some(l => l.k === k)) return k;
        return { siedler: 'leicht', haeuptling: 'leicht', prinz: 'leicht', koenig: 'mittel', david: 'schwer' }[k] || KI_DEFAULT_LEVEL;
    },

    /** How many empires the lobby's map allows (mapLimits in the game's engine.js). */
    lobbyLimits: function () {
        const c = this.gameConfig || {};
        const key = c.mapKey === 'random' ? 'plaettchen' : c.mapKey;
        return typeof mapLimits === 'function' ? mapLimits(key, c.customMap) : { min: 2, max: 4, marathon: key === 'marathon' };
    },
    /**
     * Empires in all (T) and KI seats (K) of the lobby. Lobbies from before the extension: 4, or –
     * "Nur Menschen" – exactly the humans. The server checks the same at the start.
     */
    lobbyCounts: function () {
        const c = this.gameConfig || {}, lim = this.lobbyLimits();
        const humans = (this.players || []).length;
        let total = Number.isInteger(c.playerCount) ? c.playerCount : (c.noKi ? humans : Math.max(4, humans));
        total = Math.max(lim.min, Math.min(lim.max, total));
        const ki = Math.max(0, Math.min(total - 1, Number.isInteger(c.kiCount) ? c.kiCount : 0));
        return { total, ki, humans, lim };
    },

    /**
     * Lobby row for the custom map: the host picks one of "Meine Karten" (map editor) or a
     * file; everyone sees its name and size. The server checks the map again (checkCustomMap).
     */
    customMapRow: function (isHost) {
        const cur = this.gameConfig.customMap;
        const info = cur ? `<b>${esc(cur.name)}</b> (${cur.rows.length} × ${cur.rows[0].length})` : '<i>noch keine gewählt</i>';
        if (!isHost) return `<p class="hint" style="margin:4px 0 8px">Eigene Karte: ${info}</p>`;
        const list = typeof myMaps !== 'undefined' ? myMaps : [];
        const opts = list.map(m => `<option value="${esc(m.name)}" ${cur && cur.name === m.name ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
        return `<label class="row"><span>Meine Karten</span>
              <select id="mp-set-custom" onchange="MP.pickCustomMap(this.value)">
                ${cur && !list.some(m => m.name === cur.name) ? `<option selected>${esc(cur.name)}</option>` : ''}
                ${opts || (cur ? '' : '<option value="">– keine gespeichert –</option>')}
              </select></label>
            <p class="hint" style="margin:4px 0 8px">Eigene Karte: ${info} ·
              <a href="#" onclick="MP.customMapByCode(); return false">Code eingeben</a> ·
              <a href="#" onclick="MP.importCustomMap(); return false">aus Datei laden</a>
              – Karten baust du im Karteneditor (Hauptmenü).</p>`;
    },
    /** A published map (6-character code) becomes the lobby's map. */
    customMapByCode: function () {
        const code = prompt('Kartencode (6 Zeichen):');
        if (!code) return;
        MAPACCOUNT.account.load(code).then(r => {
            this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: r.map }, res => {
                if (res && res.error) return toast(res.error);
                toast(`Karte „${r.map.name}"${r.author ? ' von ' + r.author : ''} gewählt.`);
            });
        }).catch(e => toast(e.message));
    },
    pickCustomMap: function (name) {
        const m = typeof myMap === 'function' ? myMap(name) : null;
        if (m) this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: m }, res => { if (res && res.error) toast(res.error); });
    },
    importCustomMap: function () {
        importMapFile(m => {
            const r = checkCustomMap(m);
            if (r.error) return;                      // importMapFile already says why
            this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: r.map }, res => { if (res && res.error) toast(res.error); });
        });
    },

    /** HTML for a player's name: opens the player profile (client/profile.js) if it has an account. */
    nameLink: function (name, userId) {
        return window.PROFILE ? PROFILE.link(name, userId) : esc(name);
    },

    /** In-game player list (collapsible like the game log): turn, nation, connection, profile. */
    updatePlayerList: function () {
        const box = document.getElementById('mp-players-container');
        const list = document.getElementById('mp-players-content');
        if (!box || !list) return;
        if (!this.active || typeof S === 'undefined' || !S || !S.players) { box.style.display = 'none'; return; }
        box.style.display = '';
        list.innerHTML = S.players.map((sp, i) => {
            const lp = this.lobbyPlayerOf(sp) || {};
            const civ = typeof civOf === 'function' ? civOf(sp) : { n: sp.civ, color: '#999' };
            const bot = lp.isBot || sp.kind === 'bot' || sp.kind === 'ki';
            const name = lp.name || civ.n;
            const status = bot ? `<span class="mp-pl-tag">${sp.kind === 'bot' ? 'Bot' : 'KI'}</span>`
                : lp.connected === false ? '<span class="mp-pl-tag off" title="Nicht verbunden">offline</span>' : '';
            return `<div class="mp-pl-row${S.cur === i && !S.over ? ' cur' : ''}">
                <span class="mp-pl-dot" style="background:${esc(civ.color)}"></span>
                <span class="mp-pl-name">${this.nameLink(name, lp.userId)}${i === this.playerIndex ? ' <small>(du)</small>' : ''}</span>
                ${status}
                <span class="mp-pl-civ">${esc(civ.n)}</span>
              </div>`;
        }).join('');
    },

    /** End of game: the engine lists nations – add the players behind them, with profile links. */
    addGameOverPlayers: function () {
        const body = document.getElementById('ov-body');
        if (!body || !S || !S.over || !S.players || document.getElementById('mp-go-players')) return;
        const o = S.over;
        const winners = o.winners || [o.winner];
        // The same points the server stores (utils/score.js): victoryScore for every empire, the
        // winner gets WIN_BONUS on top. Engines without victoryScore: only the claims are scored.
        const score = pi => {
            if (typeof victoryScore === 'function') { try { return victoryScore(S, pi); } catch (e) { /* below */ } }
            return (o.score || []).find(x => x.pi === pi);
        };
        const rows = S.players.map((sp, i) => {
            const lp = this.lobbyPlayerOf(sp) || {};
            const civ = typeof civOf === 'function' ? civOf(sp) : { n: sp.civ };
            const sc = score(i), won = winners.includes(i);
            return { i, won, name: lp.name || civ.n, userId: lp.userId, bot: lp.isBot, civ: civ.n,
                points: sc ? sc.total + (won ? this.WIN_BONUS : 0) : null };
        }).filter(r => S.players[r.i].kind !== 'barbar')
            .sort((a, b) => (b.points || 0) - (a.points || 0));
        const scored = rows.some(r => r.points != null);
        const pts = r => r.points == null ? '–'
            : r.won ? `${r.points} <small>(inkl. +${this.WIN_BONUS} Sieg)</small>` : r.points;
        const html = `<div id="mp-go-players"><table class="tbl" style="margin:10px 0">
            <tr><th>Spieler</th><th>Reich</th>${scored ? '<th>Punkte</th>' : ''}</tr>
            ${rows.map(r => `<tr${r.won ? ' style="font-weight:700"' : ''}>
                <td>${this.nameLink(r.name, r.userId)}${r.bot ? ' <small>(Bot)</small>' : ''}</td>
                <td>${esc(r.civ)}</td>${scored ? `<td>${pts(r)}</td>` : ''}</tr>`).join('')}
            </table></div>`;
        const tip = body.querySelector('.tip');
        if (tip) tip.insertAdjacentHTML('beforebegin', html);
        else body.insertAdjacentHTML('beforeend', html);
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
        // The server reads the login only when the socket opens. A socket from before a login or
        // logout would seat the player under the wrong account (or none: game missing from the
        // history), so outside a running game it is replaced.
        const userId = this.user ? this.user.id : null;
        if (this.socket && (this.socketUserId === userId || this.active)) return Promise.resolve();
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.socketUserId = userId;
        return new Promise((resolve) => {
            this.socket = io(this.serverUrl);

            this.socket.on('connect', () => {
                // Auto re-authenticate if we disconnect and reconnect mid-session
                if (MP.active && MP.asyncId) {
                    ASYNC.reload();
                } else if (MP.active && MP.sessionId) {
                    MP.socket.emit('session:connect', {
                        sessionId: MP.sessionId,
                        clientId: MP.getClientId(),
                        password: MP.password
                    }, ack => {
                        if (ack && ack.playerIndex !== undefined) MP.lobbyIndex = ack.playerIndex;
                    });
                }
                resolve();
            });

            this.socket.on('player:joined', data => {
                MP.players = data.players;
                if (data.newHostIndex !== undefined) MP.hostIndex = data.newHostIndex;
                toast(`${data.name} ist beigetreten.`);
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
            });
            this.socket.on('player:left', data => {
                MP.players = data.players;
                if (data.newHostIndex !== undefined) MP.hostIndex = data.newHostIndex;
                toast(`${data.name} hat das Spiel verlassen.`);
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
            });
            this.socket.on('lobby:player:updated', players => {
                MP.players = players;
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
            });
            this.socket.on('session:kicked', (data) => {
                MP.active = false;
                toast(data && data.reason ? data.reason : 'Du wurdest vom Host gekickt.');
                MP.setMode('menu'); // Snap directly to menu instead of waiting to reload
            });
            this.socket.on('session:index', data => {
                MP.lobbyIndex = data.playerIndex;
                if (data.hostIndex !== undefined) MP.hostIndex = data.hostIndex;
                if (MP.renderLobby) MP.renderLobby();
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
                // KI seats stay KI: the server places them with kiPlaceSeat, so the preview matches.
                data.cfg.players = MP.players.map(p => {
                    return p.index === MP.lobbyIndex ? p : { ...p, kind: p.kind === 'ki' ? 'ki' : 'bot' };
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

            // Marathon (v83): the server runs the ability draft; we draw Hochciv's own draft
            // screen from its preview state V and draft D (see drawDraft/draftChoose patches).
            this.socket.on('draft:update', data => {
                if (!data || typeof drawDraft !== 'function') return;
                MP.renderLobby = null; closeModal();
                document.body.classList.remove('mp-waiting');
                draftState = { cfg: null, V: data.V, D: data.D };
                if (!$('screen-draft').classList.contains('show')) show('screen-draft');
                drawDraft();
            });

            this.socket.on('game:start', data => {
                if (MP.asyncId) return;
                S = data.state;
                MP.playerIndex = data.yourIndex;
                MP.lastTurn = S.cur;
                MP.lastTurnKey = S.round + ':' + S.cur;

                window.placeState = null;
                if (typeof draftState !== 'undefined') draftState = null;
                document.body.classList.remove('mp-waiting');

                MP.syncTurnBlocker();
                MP.renderLobby = null; // Prevent Lobby from opening mid-game on reconnects
                closeModal();
                startGameScreen();
            });


            this.socket.on('state:update', data => {
                if (MP.asyncId) return;
                MP.applyState(data.state);
            });

            // Asynchronous games: the full view (status, seats, state / placement / draft)
            this.socket.on('async:update', view => {
                if (view && view.id === MP.asyncId) ASYNC.apply(view);
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

        const authContainer = $('mp-main-auth-container');
        if (!authContainer) return;

        if (this.user) {
            authContainer.innerHTML = `
                <div style="color: rgba(255,255,255,0.9); font-size: 14px; display: flex; align-items: center; gap: 15px;">
                    <span>Eingeloggt als <b>${escHtml(this.user.username)}</b> (${escHtml(this.user.mmr)} MMR, ${escHtml(this.user.gamesPlayed)} Spiele)</span>
                    <button class="btn small" onclick="MP.showAccountModal()" style="margin:0; padding: 6px 12px; font-size: 13px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); box-shadow: none;">Account & Admin</button>
                    <button class="btn small" onclick="MP.logout()" style="margin:0; padding: 6px 12px; font-size: 13px; background: #c9302c; color: white; border: 1px solid #ac2925; box-shadow: none;">Abmelden</button>
                </div>
            `;
        } else {
            authContainer.innerHTML = `
                <div style="color: rgba(255,255,255,0.9); font-size: 14px; display: flex; align-items: center; gap: 15px;">
                    <span>Gast <span style="opacity:0.7">(Ranked gesperrt)</span></span>
                    <button class="btn small" onclick="MP.showAuthModal()" style="margin:0; padding: 6px 12px; font-size: 13px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); box-shadow: none;">Anmelden</button>
                </div>
            `;
        }

        if (this.renderLobby) this.renderLobby();
    },

    showAuthModal: function () {
        if (typeof modal === 'function') {
            modal('Anmelden', '<iframe src="/client/index.html?modal=true" style="width:100%; height:75vh; min-height:550px; border:none; background:transparent;"></iframe>');
            document.getElementById('overlay').classList.add('wide');
        }
    },

    showAccountModal: function () {
        if (typeof modal === 'function') {
            modal('Account Übersicht', '<iframe src="/client/account.html?modal=true" style="width:100%; height:80vh; min-height:600px; border:none; background:transparent;"></iframe>');
            document.getElementById('overlay').classList.add('wide');
        }
    },

    logout: async function () {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            sessionStorage.removeItem('hochciv_guest');
            window.location.reload();
        } catch (e) {
            console.error('Logout failed', e);
        }
    },

    showLobby: async function () {
        await this.fetchUser();
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
                                    <td style="padding: 8px 4px;"><b>${escHtml(l.hostName)}</b><br><small>${escHtml(l.playersCount)}/${escHtml(l.maxPlayers)} Spieler</small></td>
                                    <td style="padding: 8px 4px; text-align:right;">
                                        <button class="btn small primary" data-code="${escHtml(l.joinCode)}" data-pw="${escHtml(l.password)}" onclick="MP.joinPublic(this.dataset.code, this.dataset.pw)">Beitreten</button>
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
                const cnt = this.lobbyCounts();
                const randomAll = !!this.gameConfig.randomCivs;   // the host deals every nation
                // Marathon (v83): abilities are drafted before the first turn – no choice here
                const isMarathon = this.lobbyLimits().marathon;
                let trs = this.players.map(p => {
                    const isMe = p.index === this.lobbyIndex;
                    const isPlayerHost = p.index === this.hostIndex;
                    const civOpts = randomAll ? '<option value="random" selected>Zufall (für alle)</option>'
                        : '<option value="random" ' + (p.civ === 'random' ? 'selected' : '') + '>Zufall</option>' + CIVS.map(c => `<option value="${c.k}" ${p.civ === c.k ? 'selected' : ''}>${c.n}</option>`).join('');
                    const civDef = CIVS.find(c => c.k === (p.civ || 'griechenland'));
                    let abOpts = '';
                    if (p.civ === 'random') {
                        abOpts = '<option value="random" selected>Zufall</option>';
                    } else if (civDef) {
                        abOpts = '<option value="random" ' + (p.ability === 'random' ? 'selected' : '') + '>Zufall</option>' + civDef.abilities.map(a => `<option value="${a.k}" ${p.ability === a.k ? 'selected' : ''}>${a.n}</option>`).join('');
                    }

                    return `
                    <tr>
                        <td><b>${escHtml(p.name)}</b> ${isPlayerHost ? '(Host)' : ''} ${p.mmr ? `<span style="font-size:11px; opacity:0.6">[${escHtml(p.mmr)} MMR]</span>` : ''}</td>
                        <td style="padding: 4px;">
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-civ-${p.index}" ${isMe && !randomAll ? '' : 'disabled'} style="${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${civOpts}</select>
                            <br/>
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-ab-${p.index}" ${isMe && !randomAll ? '' : 'disabled'} style="margin-top: 4px; font-size: 13px; ${isMarathon || randomAll ? 'display:none;' : ''} ${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${abOpts}</select>
                            ${isMarathon ? '<small style="display:block; margin-top:4px; font-size:11px; opacity:0.7">Fähigkeiten: Draft vor dem ersten Zug</small>' : ''}
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
                  <option value="random" ${this.gameConfig.mapKey === 'random' ? 'selected' : ''}>Plättchenkarte (2–8 Reiche)</option>
                  ${typeof marathonMap === 'function' ? `<option value="marathon" ${isMarathon ? 'selected' : ''}>Marathon (24 × 36)</option>` : ''}
                  ${typeof checkCustomMap === 'function' ? `<option value="eigene" ${this.gameConfig.mapKey === 'eigene' ? 'selected' : ''}>Eigene Karte</option>` : ''}
                </select>
              </label>
              ${this.gameConfig.mapKey === 'eigene' ? this.customMapRow(isHost) : ''}
              ${isMarathon ? `<p class="hint" style="margin:4px 0 8px">Marathon: vier Reiche auf einer neuen Zufallskarte, Technologien kosten je Zeitalter das Zwei- bis Fünffache. Vor dem ersten Zug sehen alle Karte und Starttechnologien und draften je zwei Fähigkeiten (Schlangenreihenfolge, auch fremde). Bots draften nicht.</p>` : ''}
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
              <label class="row"><span>Reiche insgesamt</span>
                <select id="mp-set-total" onchange="MP.updateLobbyConfig()">
                  ${Array.from({ length: cnt.lim.max - cnt.lim.min + 1 }, (_, i) => cnt.lim.min + i).map(k => `<option value="${k}" ${k === cnt.total ? 'selected' : ''}>${k}${k === 2 ? ' (1 gegen 1)' : ''}</option>`).join('')}
                </select>
              </label>
              <label class="row"><span>davon KI (feste Plätze)</span>
                <select id="mp-set-ki" onchange="MP.updateLobbyConfig()">
                  ${Array.from({ length: cnt.total }, (_, k) => `<option value="${k}" ${k === cnt.ki ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </label>
              <p class="hint" style="margin:4px 0 8px">${cnt.humans > cnt.total - cnt.ki
                ? `⚠ ${cnt.humans} Spieler in der Lobby – Platz ist für ${cnt.total - cnt.ki} Menschen.`
                : `Bis zu ${cnt.total - cnt.ki} Menschen. ${cnt.total - cnt.humans > 0 ? `Beim Start spielt die KI ${cnt.total - cnt.humans} ${cnt.total - cnt.humans === 1 ? 'Reich' : 'Reiche'}.` : 'Ohne KI.'}`}</p>
              <label class="row"><span>Zufällige Nationen für alle</span>
                <input type="checkbox" id="mp-set-random" onchange="MP.updateLobbyConfig()" ${this.gameConfig.randomCivs ? 'checked' : ''}>
              </label>
              <label class="row"${cnt.total - cnt.humans > 0 ? '' : ' hidden'}><span>KI-Stufe</span>
                <select id="mp-set-diff" onchange="MP.updateLobbyConfig()">
                  ${KI_LEVELS.map(d => `<option value="${d.k}" ${this.kiLevel(this.gameConfig.difficulty) === d.k ? 'selected' : ''}>${d.n}</option>`).join('')}
                </select>
              </label>
              <label class="row" style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                <span><b>🔥 Gewertetes Spiel</b> <br><small style="font-size:10px;color:#777">(min 2 H-Spieler, KI auf schwer)</small></span>
                <input type="checkbox" id="mp-set-ranked" onchange="MP.updateLobbyConfig()" ${this.gameConfig.ranked ? 'checked' : ''} ${!this.user ? 'disabled' : ''}>
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
        // Force the hardest KI level if Ranked is checked
        let diff = $('mp-set-diff').value;
        const isRanked = $('mp-set-ranked') && $('mp-set-ranked').checked;
        if (isRanked) {
            diff = KI_LEVELS[KI_LEVELS.length - 1].k;
            // Temporarily force UI visual to match
            if ($('mp-set-diff')) $('mp-set-diff').value = diff;
        }

        const mapKey = $('mp-set-map').value;
        const newConfig = {
            mapKey,
            events: $('mp-set-events').checked,
            eventMode: evModeEl ? evModeEl.value : (this.gameConfig.eventMode || 'hard'),
            wonders: $('mp-set-wonders').checked,
            difficulty: diff,
            ranked: isRanked,
            // empires in all and KI seats; "noKi" of older lobbies is replaced by them
            playerCount: $('mp-set-total') ? +$('mp-set-total').value : undefined,
            kiCount: $('mp-set-ki') ? +$('mp-set-ki').value : undefined,
            randomCivs: !!($('mp-set-random') && $('mp-set-random').checked),
            noKi: false,
        };
        // a map with fewer empires: keep the numbers within what it allows
        const old = this.gameConfig;
        this.gameConfig = Object.assign({}, old, newConfig, { customMap: newConfig.customMap || old.customMap });
        const cnt = this.lobbyCounts();
        this.gameConfig = old;
        newConfig.playerCount = cnt.total;
        newConfig.kiCount = cnt.ki;
        // Switching to "Eigene Karte" without a map yet: take the newest one from the library
        if (mapKey === 'eigene' && !this.gameConfig.customMap && typeof myMaps !== 'undefined' && myMaps[0])
            newConfig.customMap = myMaps[0];
        this.socket.emit('lobby:config', newConfig, res => { if (res && res.error) toast(res.error); });
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
                clientId: this.getClientId(),
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;

                this.active = true;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                const credBox = $('mp-cred-box');
                if (credBox) credBox.textContent = `Code: ${this.joinCode}  PW: ${this.password}`;

                if (ack.status === 'playing' || ack.status === 'draft') {
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
                clientId: this.getClientId(),
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;

                this.active = true;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                const credBox = $('mp-cred-box');
                if (credBox) credBox.textContent = `Code: ${this.joinCode}  PW: ${this.password}`;

                if (ack.status === 'playing' || ack.status === 'draft') {
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
            difficulty: KI_DEFAULT_LEVEL,   // KI level of the computer seats
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
                clientId: this.getClientId(),
                password: this.password
            }, (ack) => {
                if (ack.error) return toast(ack.error);
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;
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
        authDiv.style.position = 'absolute';
        authDiv.style.top = '0';
        authDiv.style.left = '0';
        authDiv.style.right = '0';
        authDiv.style.padding = '12px 24px';
        authDiv.style.background = 'rgba(0, 0, 0, 0.4)';
        authDiv.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        authDiv.style.display = 'flex';
        authDiv.style.justifyContent = 'flex-end';
        authDiv.style.alignItems = 'center';
        authDiv.style.zIndex = '1000';
        authDiv.style.backdropFilter = 'blur(5px)';

        const screenMenu = $('screen-menu');
        if (screenMenu) {
            screenMenu.appendChild(authDiv);
        }

        // Legal Footer for Main Menu
        const mVersion = $('m-version');
        if (mVersion && mVersion.parentNode) {
            const footer = document.createElement('p');
            footer.id = 'mp-legal-footer';
            footer.style.textAlign = 'center';
            footer.style.fontSize = '0.8rem';
            footer.style.marginTop = '20px';
            footer.innerHTML = `
              &copy; 2026 Hochciv Multiplayer. Alle Rechte vorbehalten. | 
              <a href="/datenschutzerklaerung.html" target="_blank" style="color:inherit">Datenschutzerklärung</a> |
              <a href="/nutzungsbedingungen.html" target="_blank" style="color:inherit">Nutzungsbedingungen</a> |
              <a href="/impressum.html" target="_blank" style="color:inherit">Impressum</a>
            `;
            mVersion.parentNode.appendChild(footer);
        }

        // Render it
        MP.renderMainMenuAuth();
    }

    // Inject Turn Blocker CSS rules
    const style = document.createElement('style');
    style.textContent = `
        /* Not your turn: the actions are blocked – looking stays possible (own tech tree, world, log) */
        .mp-waiting .actionbar > button:not(#a-tech):not(#a-info):not(#a-log) { pointer-events: none !important; opacity: 0.5 !important; filter: grayscale(100%); }
        .mp-no-viewer .mp-waiting #a-tech { pointer-events: none !important; opacity: 0.5 !important; filter: grayscale(100%); }
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
            transition: width 0.2s, height 0.2s, border-radius 0.2s;
        }
        #mp-persistent-log-container.mp-log-minimized {
            width: 44px !important;
            height: 44px !important;
            border-radius: 50% !important;
            border: none !important;
            background: #a89f91 !important;
            cursor: pointer !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            padding: 0 !important;
        }
        #mp-persistent-log-container.mp-log-minimized #mp-persistent-log-header,
        #mp-persistent-log-container.mp-log-minimized #mp-persistent-log-content {
            display: none !important;
        }
        #mp-persistent-log-container.mp-log-minimized::before {
            content: "📝";
            font-size: 20px;
        }
        #mp-persistent-log-header {
            background:#a89f91; color:white; padding:6px 10px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; user-select:none;
        }
        #mp-persistent-log-content {
            max-height: 40vh; overflow-y: auto; padding: 10px; display: block;
        }
        #mp-persistent-log-content .logline { margin-bottom: 4px; }
        #mp-persistent-log-content .rolls { padding-left: 10px; opacity: 0.8; font-size: 12px; }
        #mp-players-container {
            position: fixed; left: 10px; top: 60px; width: 240px;
            background: rgba(255,255,240,0.95); pointer-events: auto;
            border: 2px solid #a89f91; border-radius: 6px; z-index: 50;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 13px; color: #333; overflow: hidden;
            transition: width 0.2s, height 0.2s, border-radius 0.2s;
        }
        #mp-players-container.mp-log-minimized {
            width: 44px !important; height: 44px !important; border-radius: 50% !important;
            border: none !important; background: #a89f91 !important; cursor: pointer !important;
            display: flex !important; justify-content: center !important; align-items: center !important; padding: 0 !important;
        }
        #mp-players-container.mp-log-minimized > * { display: none !important; }
        #mp-players-container.mp-log-minimized::before { content: "👥"; font-size: 20px; }
        #mp-players-container[style*="display: none"] { display: none !important; }
        #mp-players-header {
            background:#a89f91; color:white; padding:6px 10px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; user-select:none;
        }
        #mp-players-content { max-height: 40vh; overflow-y: auto; padding: 6px 8px; }
        .mp-pl-row { display: grid; grid-template-columns: 12px 1fr auto; gap: 0 8px; align-items: center; padding: 4px 4px; border-radius: 4px; }
        .mp-pl-row.cur { background: rgba(157,59,47,0.12); }
        .mp-pl-row.cur .mp-pl-name::after { content: " ◂ am Zug"; font-size: 11px; color: #9d3b2f; font-weight: normal; }
        .mp-pl-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.25); }
        .mp-pl-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
        .mp-pl-civ { grid-column: 2 / -1; font-size: 11px; color: #6f6551; }
        .mp-pl-tag { font-size: 10px; padding: 1px 5px; border-radius: 8px; background: #e4dbbe; color: #6f6551; }
        .mp-pl-tag.off { background: #f1d6cf; color: #9d3b2f; }
    `;
    document.head.appendChild(style);

    const pLog = document.createElement('div');
    pLog.id = 'mp-persistent-log-container';
    pLog.innerHTML = `
        <div id="mp-persistent-log-header">
            <span>Spiel-Log</span>
            <span id="mp-log-toggle-icon" style="font-size: 16px;">✖</span>
        </div>
        <div id="mp-persistent-log-content"></div>
    `;
    document.body.appendChild(pLog);

    document.getElementById('mp-persistent-log-header').addEventListener('click', (e) => {
        const plc = document.getElementById('mp-persistent-log-container');
        plc.classList.add('mp-log-minimized');
        e.stopPropagation(); // prevent container click from firing immediately
    });

    document.getElementById('mp-persistent-log-container').addEventListener('click', (e) => {
        const plc = document.getElementById('mp-persistent-log-container');
        if (plc.classList.contains('mp-log-minimized')) {
            plc.classList.remove('mp-log-minimized');
            const pl = document.getElementById('mp-persistent-log-content');
            if (pl) pl.scrollTop = pl.scrollHeight;
        }
    });

    // Player list: collapsible like the game log, names open the player profile
    const pList = document.createElement('div');
    pList.id = 'mp-players-container';
    pList.style.display = 'none';
    pList.innerHTML = `
        <div id="mp-players-header">
            <span>Spieler</span>
            <span style="font-size: 16px;">✖</span>
        </div>
        <div id="mp-players-content"></div>
    `;
    document.body.appendChild(pList);
    const setPlayersOpen = open => {
        pList.classList.toggle('mp-log-minimized', !open);
        try { localStorage.setItem('mp-players-open', open ? '1' : '0'); } catch (_) { }
    };
    let playersOpen = true;
    try { playersOpen = localStorage.getItem('mp-players-open') !== '0'; } catch (_) { }
    setPlayersOpen(playersOpen);
    document.getElementById('mp-players-header').addEventListener('click', e => {
        setPlayersOpen(false);
        e.stopPropagation();
    });
    pList.addEventListener('click', () => {
        if (pList.classList.contains('mp-log-minimized')) setPlayersOpen(true);
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

// --- Monkey Patch redraw() to fix army reference sync bug ---
// When the server sends a new state, the S.armies array contains completely new objects.
// If the UI is currently tracking an army (ui.army) for movement, the reference equality 
// check (!S.armies.includes(ui.army)) in the vanilla redraw() will falsely fail and clear the selection.
// We intercept redraw() to proactively restore the reference using the army ID.
const originalRedraw = window.redraw;
if (originalRedraw) {
    window.redraw = function () {
        if (typeof ui !== 'undefined' && ui && ui.army && typeof S !== 'undefined' && S && S.armies) {
            const freshArmy = S.armies.find(a => a.id === ui.army.id);
            if (freshArmy) ui.army = freshArmy;
        }
        return originalRedraw.apply(this, arguments);
    };
}

// ── Monkey Patch gameOver(): player names (with profile links) under the engine's result ──
const originalGameOver = window.gameOver;
if (originalGameOver) {
    window.gameOver = function () {
        const r = originalGameOver.apply(this, arguments);
        if (MP.active) {
            MP.addGameOverPlayers();
            MP.updatePlayerList();
        }
        return r;
    };
}

// ── Monkey Patch automatic turns ────────────────────────────────────────────
// ui.js plays bot / KI turns locally (startGameScreen → runBots, afterAutoTurn). In a
// multiplayer game the server plays them and pushes the result via 'state:update', so
// running them here as well would desync the client.
const originalRunBots = window.runBots;
if (originalRunBots) {
    window.runBots = function () {
        if (MP.active) {
            if (typeof S !== 'undefined' && S && S.over) return gameOver();
            if (S && S.cur === MP.playerIndex) return humanTurnStart();
            MP.syncTurnBlocker();
            return redraw();
        }
        return originalRunBots.apply(this, arguments);
    };
}
const originalHumanTurnStart = window.humanTurnStart;
if (originalHumanTurnStart) {
    window.humanTurnStart = function () {
        // Only open the turn-start dialogs (food, free pick …) for the player whose turn it is.
        if (MP.active && typeof S !== 'undefined' && S && !S.over && S.cur !== MP.playerIndex) {
            MP.syncTurnBlocker();
            return redraw();
        }
        return originalHumanTurnStart.apply(this, arguments);
    };
}

// ── Monkey Patch Marathon draft (v83) ───────────────────────────────────────
// The server holds the draft and plays the KI picks. Locally we only draw it; a click
// goes to the server, which answers every client with 'draft:update' – and with
// 'game:start' once the last ability is picked (so there is no "Spiel beginnen" here).
MP.draftMine = function () {
    if (typeof draftState === 'undefined' || !draftState || !draftState.V) return -1;
    return draftState.V.players.findIndex(p => p.slot === MP.lobbyIndex);
};
const originalDrawDraft = window.drawDraft;
if (originalDrawDraft) {
    window.drawDraft = function () {
        const out = originalDrawDraft.apply(this, arguments);
        if (MP.active && draftState && draftState.D) {
            const D = draftState.D;
            const cur = D.at < D.order.length ? D.order[D.at] : null;
            const mine = cur != null && cur === MP.draftMine();
            $('dr-go').hidden = true;
            if (!mine) $('dr-pool').querySelectorAll('[data-ab]').forEach(b => { b.disabled = true; });
            const note = $('dr-note');
            if (cur == null) {
                note.innerHTML += ' Das Spiel startet …';
            } else if (mine) {
                note.innerHTML = '<b>Du bist dran!</b> ' + note.innerHTML;
            } else {
                const seat = MP.players.find(x => x.index === draftState.V.players[cur].slot);
                note.innerHTML = `Warte auf <b>${seat ? escHtml(seat.name) : 'andere Spieler'}</b> … ` + note.innerHTML;
            }
        }
        return out;
    };
}
const originalDraftChoose = window.draftChoose;
if (originalDraftChoose) {
    window.draftChoose = function (id) {
        if (MP.active) {
            const D = draftState && draftState.D;
            if (!D || D.at >= D.order.length) return;
            if (D.order[D.at] !== MP.draftMine()) return toast('Du bist nicht am Zug!');
            $('dr-pool').querySelectorAll('[data-ab]').forEach(b => { b.disabled = true; });
            const done = res => { if (res && res.error) { toast(res.error); drawDraft(); } };
            if (MP.asyncId) MP.socket.emit('async:draft', { id: MP.asyncId, abilityId: id }, done);
            else MP.socket.emit('draft:pick', { id }, done);
            return;
        }
        return originalDraftChoose.apply(this, arguments);
    };
}

// ── Monkey Patch Engine Actions ─────────────────────────────────────────────
// The game shows its screens for the player who looks at them (viewer in ui.js) – here that is
// always the own empire, also during other players' turns (e.g. the tech tree).
if (typeof viewerHook !== 'undefined') viewerHook = () => (MP.active && Number.isInteger(MP.playerIndex) ? MP.playerIndex : null);
// A game without that (v83, only for Rundenspiele started on it) would show the tree of the
// player on turn – there "Forschen" stays blocked while it is not your turn (CSS below).
else document.documentElement.classList.add('mp-no-viewer');

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
            MP.sendAction(makePayload(state, ...args));
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
                if (!S || S.over) return;
                if (MP.playerIndex !== S.cur) return toast('Du bist nicht am Zug!');
                if (typeof ui !== 'undefined' && ui.botLock) return;
                // Hard block from ui.js (v80+): an army still standing in a city prevents
                // ending the turn – the server rejects it too.
                if (typeof blockingIssues === 'function') {
                    const stop = blockingIssues(S, S.cur);
                    if (stop.length) return toast(stop[0]);
                }
                // Keep warnings check from original ui.js
                const warn = pendingWarnings(S, S.cur);
                if (warn.length && !ui.confirmedEnd) {
                    ui.confirmedEnd = true;
                    return toast(warn[0] + ' Nochmal tippen zum Bestätigen.');
                }
                ui.confirmedEnd = false; ui.army = null; ui.sel = null; ui.mode = null;
                closeSheet();

                MP.sendAction({ type: 'endTurn' }, res => {
                    if (res && res.error && !MP.asyncId) toast(res.error);
                });
                toast('Warte auf Server...');
            } else {
                origEnd();
            }
        };
    }
}, 100);

// ════════════════════════════════════════════════════════════════════════════
// Rundenspiele – asynchronous games (play by turn)
// Games live in the server database, not in an open lobby. Login required. The list
// shows your games (badge where it is your turn), invitations and open public games.
// Opening a game joins its Socket.IO room: every change arrives as 'async:update' with
// the full view { status, seats, state | placement | draft, … }.
// ════════════════════════════════════════════════════════════════════════════
// ── Custom maps in the player account (routes/maps.js, maps/service.js) ────────
/**
 * Connects the game's map library ("Meine Karten", Hochciv's ui.js) with the account. The game
 * works without a server; it only calls the `mapAccount` hooks this module sets.
 *
 * Logged in, the account is the source of truth and the browser list its copy:
 *  · after login (sync) the account's maps replace local ones with the same name, local maps the
 *    account doesn't know go up – unless they were in the account at the last sync on this
 *    device (then they were deleted on another device and go here too);
 *  · saving / deleting in the editor goes to the account right away;
 *  · publishing gives a map its 6-character code; anybody (also logged out) loads it by code.
 * `hochciv.maps.synced.<userId>` remembers which names the account had at the last sync.
 */
const MAPACCOUNT = {
    userId: null,
    rows: {},              // name → { id, code } of the maps in the account

    api: async function (path, method, body) {
        const opts = { method: method || 'GET', cache: 'no-cache', credentials: 'include' };
        if (body !== undefined) Object.assign(opts, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const res = await fetch(`${MP.serverUrl}/api/maps${path}`, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Fehler');
        return data;
    },
    syncedKey: function () { return 'hochciv.maps.synced.' + this.userId; },
    markSynced: function (name, on) {
        const set = new Set(load(this.syncedKey()) || []);
        if (on) set.add(name); else set.delete(name);
        store(this.syncedKey(), [...set]);
    },

    onUser: function (user) {
        if (typeof replaceMyMaps !== 'function') return;     // a game version without the map library
        mapAccount = this.account;                           // loading by code works logged out, too
        const id = user ? user.id : null;
        if (id === this.userId) return;
        this.userId = id;
        this.rows = {};
        if (id) this.sync().catch(e => console.warn('[Maps] Abgleich fehlgeschlagen:', e.message));
    },

    sync: async function () {
        const uid = this.userId;
        const { maps } = await this.api('');
        if (uid !== this.userId) return;                     // logged out / switched meanwhile
        const synced = new Set(load(this.syncedKey()) || []);
        const server = new Map(maps.map(m => [m.name, m]));
        const onlyHere = myMaps.filter(m => !server.has(m.name) && !synced.has(m.name));
        for (const m of onlyHere) {
            try { const r = await this.api('', 'POST', { map: m }); server.set(r.map.name, r.map); }
            catch (e) { console.warn(`[Maps] „${m.name}" bleibt nur auf diesem Gerät:`, e.message); }
        }
        if (uid !== this.userId) return;
        const fromAccount = [...server.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(r => r.map);
        replaceMyMaps(fromAccount.concat(onlyHere.filter(m => !server.has(m.name))));
        this.rows = {};
        for (const r of server.values()) this.rows[r.name] = { id: r.id, code: r.code };
        store(this.syncedKey(), [...server.keys()]);
    },

    upload: async function (map) {
        const r = await this.api('', 'POST', { map });
        this.rows[r.map.name] = { id: r.map.id, code: r.map.code };
        this.markSynced(r.map.name, true);
        return this.rows[r.map.name];
    },

    account: {
        loggedIn: () => !!MAPACCOUNT.userId,
        codeOf: name => (MAPACCOUNT.rows[name] || {}).code || null,
        saved: map => {
            if (MAPACCOUNT.userId) MAPACCOUNT.upload(map).catch(e => toast('Konto: ' + e.message));
        },
        deleted: name => {
            const row = MAPACCOUNT.rows[name];
            if (!MAPACCOUNT.userId || !row) return;
            delete MAPACCOUNT.rows[name];
            MAPACCOUNT.markSynced(name, false);
            MAPACCOUNT.api('/' + row.id, 'DELETE').catch(e => toast('Konto: ' + e.message));
        },
        publish: async name => {
            if (!MAPACCOUNT.userId) throw new Error('Zum Veröffentlichen musst du angemeldet sein.');
            const row = MAPACCOUNT.rows[name] || await MAPACCOUNT.upload(myMap(name));
            const r = await MAPACCOUNT.api(`/${row.id}/publish`, 'POST', {});
            row.code = r.map.code;
            return r.map.code;
        },
        unpublish: async name => {
            const row = MAPACCOUNT.rows[name];
            if (!row) return;
            await MAPACCOUNT.api(`/${row.id}/unpublish`, 'POST', {});
            row.code = null;
        },
        load: code => MAPACCOUNT.api('/code/' + encodeURIComponent(String(code).trim())),
    },
};

const ASYNC = {
    view: null,
    data: null,
    placing: false,
    form: null,

    esc: t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    civ: k => (typeof CIVS !== 'undefined' && CIVS.find(c => c.k === k)) || null,
    civLabel: function (k) {
        const c = this.civ(k);
        return c ? `${typeof SYM !== 'undefined' ? SYM[c.sym] + ' ' : ''}${this.esc(c.n)}` : '?';
    },
    mapName: function (k, c) {
        if (k === 'eigene') return 'Eigene Karte „' + this.esc((c && c.customMapName) || '?') + '"';
        return ({ '0': 'Originalkarte', gross: 'Große Karte', plaettchen: 'Plättchenkarte', marathon: 'Marathon' })[k] || k;
    },
    seatsHtml: function (seats, mySlot) {
        return `<div class="mpa-seats">${seats.map(s => {
            const who = s.kind === 'bot' ? 'Bot' : s.replaced ? `KI (für ${this.esc(s.name)})` : s.kind === 'ki' ? 'KI'
                : s.name ? this.esc(s.name) : '<i>frei</i>';
            return `<span class="mpa-seat${s.slot === mySlot ? ' me' : ''}">${s.civ ? this.civLabel(s.civ) : '?'}${s.roman ? ' ' + s.roman : ''}: ${who}</span>`;
        }).join('')}</div>`;
    },

    api: async function (path, body) {
        const res = await fetch(`${MP.serverUrl}/api/async${path}`, body
            ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }
            : { cache: 'no-cache', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Fehler');
        return data;
    },

    requireLogin: async function () {
        await MP.fetchUser();
        if (MP.user) return true;
        toast('Rundenspiele gibt es nur mit Anmeldung.');
        MP.showAuthModal();
        return false;
    },

    // ── Menu button with "your turn" badge ───────────────────────────────────
    refreshBadge: async function () {
        const btn = $('mp-async-btn');
        if (!btn) return;
        let n = 0;
        if (MP.user) {
            try { n = (await this.api('')).mine.filter(g => g.yourTurn).length; } catch (_) { }
        }
        btn.innerHTML = 'Rundenspiele' + (n ? ` <span class="mpa-badge">${n}</span>` : '');
    },

    // ── List ─────────────────────────────────────────────────────────────────
    showList: async function () {
        if (!(await this.requireLogin())) return;
        try { this.data = await this.api(''); } catch (e) { return toast(e.message); }
        const d = this.data;
        const active = d.mine.filter(g => ['setup', 'placement', 'draft', 'playing'].includes(g.status) && !g.replaced);
        const turn = active.filter(g => g.yourTurn);
        const waiting = active.filter(g => !g.yourTurn);
        const takenOver = d.mine.filter(g => !active.includes(g));
        const section = (title, list, empty) => `<h4 class="mpa-h">${title}</h4>` +
            (list.length ? list.map(g => this.row(g)).join('') : `<p class="sub">${empty}</p>`);
        modal('Rundenspiele', `
            <div class="mpa-top">
              <button class="btn primary" onclick="ASYNC.showCreate()">Neues Rundenspiel</button>
              <span class="mpa-code"><input id="mpa-code" placeholder="Code" maxlength="8">
              <button class="btn small" onclick="ASYNC.joinByCode()">Beitreten</button></span>
            </div>
            <p class="sub">Gespielt wird nacheinander, ohne dass die anderen online sein müssen. Wer ${d.timeoutDays} Tage nicht zieht, wird von der KI ersetzt (gewertet: −15 MMR).</p>
            ${section('Du bist am Zug', turn, 'Gerade nirgends.')}
            ${section('Warten auf andere', waiting, 'Keine.')}
            ${section('Einladungen', d.invites, 'Keine offenen Einladungen.')}
            ${section('Offene Spiele', d.open, 'Keine öffentlichen Spiele mit freiem Platz.')}
            ${takenOver.length ? section('Von der KI übernommen', takenOver.slice(0, 15), '') : ''}
            <p class="sub">Beendete Rundenspiele findest du in deiner <a href="#" onclick="MP.showAccountModal(); return false;">Spielhistorie</a>.</p>
            <label class="row mpa-notify"><span>E-Mail, wenn ich am Zug bin</span>
              <input type="checkbox" ${d.notifyEmail ? 'checked' : ''} onchange="ASYNC.setNotify(this.checked)"></label>
            ${/HochcivApp\//.test(navigator.userAgent) ? `<label class="row"><span>Push-Nachricht, wenn ich am Zug bin</span>
              <input type="checkbox" ${d.notifyPush ? 'checked' : ''} onchange="ASYNC.setPush(this.checked)"></label>` : ''}`);
        $('overlay').classList.add('wide');
        this.refreshBadge();
    },

    row: function (g) {
        const c = g.config;
        const statusText = {
            setup: `Sucht Mitspieler (${g.seats.filter(s => s.userId).length}/${c.humanCount})`,
            placement: 'Startplättchen legen', draft: 'Fähigkeiten draften',
            playing: `Runde ${g.round}`, finished: 'Beendet', cancelled: 'Abgebrochen',
        }[g.status] || g.status;
        const days = g.deadline ? Math.max(0, Math.ceil((g.deadline - Date.now()) / 864e5)) : null;
        let info = '';
        if (g.yourTurn) info = '<span class="mpa-badge">Du bist am Zug</span>' + (days != null ? ` noch ${days} Tag(e)` : '');
        else if (g.status === 'finished') info = `Gewonnen: ${(g.winners || []).map(this.esc).join(', ') || '—'}`;
        else if (g.replaced) info = 'Von der KI übernommen';
        else if (g.waitingFor) info = `Wartet auf ${this.esc(g.waitingFor)}`;
        const member = g.mySlot != null;
        const btns = [];
        if (member) btns.push(`<button class="btn small primary" onclick="ASYNC.open('${g.id}')">Öffnen</button>`);
        else btns.push(`<button class="btn small primary" onclick="ASYNC.showJoin('${g.id}')">Beitreten</button>`);
        if (g.invited && !member) btns.push(`<button class="btn small ghost" onclick="ASYNC.decline('${g.id}')">Ablehnen</button>`);
        if (member && g.freeSeats.length) btns.push(`<button class="btn small ghost" onclick="ASYNC.showInvite('${g.id}', '${g.joinCode}')">Einladen</button>`);
        return `<div class="mpa-row${g.yourTurn ? ' turn' : ''}">
            <div class="mpa-title"><b>${this.mapName(c.mapKey, c)}</b> · ${c.civMode === 'random' ? 'Zufallsnationen' : 'Feste Nationen'}${c.ranked ? ' · 🔥 Gewertet' : ''}${c.isPublic ? ' · öffentlich' : ''} · ${statusText}
              ${member ? `<small class="mpa-c">Code ${g.joinCode}</small>` : ''}</div>
            ${this.seatsHtml(g.seats, g.mySlot)}
            <div class="mpa-foot"><span>${info}</span><span>${btns.join(' ')}</span></div></div>`;
    },

    setNotify: function (on) {
        this.api('/notify', { email: on }).then(() => toast(on ? 'E-Mails an.' : 'E-Mails aus.')).catch(e => toast(e.message));
    },

    /** Push notifications of the Android app (the switch is only shown there). */
    setPush: function (on) {
        fetch(`${MP.serverUrl}/api/push/notify`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
        }).then(r => r.ok ? toast(on ? 'Push-Nachrichten an.' : 'Push-Nachrichten aus.') : Promise.reject(new Error('Speichern fehlgeschlagen')))
            .catch(e => toast(e.message));
    },

    // ── Create ───────────────────────────────────────────────────────────────
    showCreate: function () {
        const f = this.form = this.form || {
            mapKey: '0', civMode: 'fixed', playerCount: 4, kiCount: 2, civ: 'russland', ability: 'basis',
            events: false, eventMode: 'hard', wonders: false, difficulty: KI_DEFAULT_LEVEL, ranked: false, isPublic: false, invite: '',
        };
        const civ = this.civ(f.civ) || CIVS[0];
        // how many empires the chosen map allows (mapLimits in the game's engine.js)
        const custom = f.mapKey === 'eigene' && typeof myMap === 'function' ? myMap(f.customName) : null;
        const lim = typeof mapLimits === 'function' ? mapLimits(f.mapKey, custom) : { min: 2, max: 4, marathon: f.mapKey === 'marathon' };
        f.playerCount = Math.max(lim.min, Math.min(lim.max, f.playerCount || 4));
        f.kiCount = Math.max(0, Math.min(f.playerCount - 2, f.kiCount || 0));
        const marathon = lim.marathon, random = f.civMode === 'random';
        const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
        let hint;
        // mirrors async/logic.js create(): when the host can play turn 1 right away
        const humans = f.playerCount - f.kiCount, noKi = f.kiCount === 0;
        const freeCivMap = f.mapKey === 'plaettchen' || f.mapKey === 'eigene';
        const seatsFinal = random || (!freeCivMap && f.playerCount === 4);
        const atOnce = !(f.mapKey === 'plaettchen' || marathon) && !noKi && seatsFinal;
        if (f.mapKey === 'plaettchen' || marathon)
            hint = 'Erst wenn alle beigetreten sind, ' + (marathon ? 'wird gedraftet' : 'legt jeder sein Startplättchen') + ' – dann beginnt die Partie mit deinem Zug.';
        else if (atOnce) hint = random ? 'Du spielst sofort deinen ersten Zug. Wer beitritt, bekommt den nächsten Platz in der Zugfolge.'
            : 'Du spielst sofort deinen ersten Zug. Kommt eine Nation an die Reihe, die noch niemand gewählt hat, wartet das Spiel auf sie.';
        else hint = 'Die Partie beginnt mit deinem Zug, sobald alle Mitspieler beigetreten sind.';
        hint = `${f.playerCount} Reiche: ${humans} Menschen${f.kiCount ? `, ${f.kiCount} KI` : ', keine KI'}${f.playerCount === 2 ? ' – 1 gegen 1 (höhere Siegschwellen)' : ''}. ` + hint;
        const hardest = KI_LEVELS[KI_LEVELS.length - 1].k;
        modal('Neues Rundenspiel', `
          <div class="mpa-form" onchange="ASYNC.readForm(true)">
            <label class="row"><span>Karte</span><select id="mpa-map">
              ${opt('0', f.mapKey, 'Originalkarte (12 × 18)')}${opt('gross', f.mapKey, 'Große Karte (15 × 24)')}
              ${opt('plaettchen', f.mapKey, 'Plättchenkarte (2–8 Reiche)')}
              ${typeof marathonMap === 'function' ? opt('marathon', f.mapKey, 'Marathon (24 × 36, 4 Reiche)') : ''}
              ${typeof checkCustomMap === 'function' ? opt('eigene', f.mapKey, 'Eigene Karte') : ''}</select></label>
            ${f.mapKey === 'eigene' ? `<label class="row"><span>Meine Karten</span><select id="mpa-custom">
              ${myMaps.map(m => `<option value="${this.esc(m.name)}" ${m.name === f.customName ? 'selected' : ''}>${this.esc(m.name)} (bis ${m.maxPlayers || 4} Reiche${m.marathon ? ', Marathon' : ''})</option>`).join('') || '<option value="">– keine gespeichert –</option>'}</select></label>
              <p class="sub"><a href="#" onclick="ASYNC.customMapByCode(); return false">Karte mit Code laden</a> ·
                <a href="#" onclick="ASYNC.importCustomMap(); return false">aus Datei laden</a> – eigene Karten baust du im Karteneditor (Hauptmenü).</p>` : ''}
            <label class="row"><span>Nationen</span><select id="mpa-mode">
              ${opt('fixed', f.civMode, 'Fest – jeder wählt seine Nation')}${opt('random', f.civMode, 'Zufällige Nationen für alle – Zugfolge nach Beitritt')}</select></label>
            <label class="row"><span>Reiche insgesamt</span><select id="mpa-total" ${lim.min === lim.max ? 'disabled' : ''}>
              ${Array.from({ length: lim.max - lim.min + 1 }, (_, i) => lim.min + i).map(n => opt(n, f.playerCount, n + (n === 2 ? ' (1 gegen 1)' : ''))).join('')}</select></label>
            <label class="row"><span>davon KI</span><select id="mpa-ki">
              ${Array.from({ length: f.playerCount - 1 }, (_, k) => k).map(k => opt(k, f.kiCount, k + (k === 0 ? ' (nur Menschen)' : ''))).join('')}</select></label>
            ${random ? '' : `<label class="row"><span>Deine Nation</span><select id="mpa-civ">
              ${CIVS.map(c => opt(c.k, f.civ, c.n)).join('')}</select></label>`}
            ${random || marathon ? '' : `<label class="row"><span>Fähigkeit</span><select id="mpa-ab">
              ${opt('random', f.ability, 'Zufall')}${civ.abilities.map(a => opt(a.k, f.ability, a.n)).join('')}</select></label>`}
            <label class="row"><span>Mit Ereignissen</span><input type="checkbox" id="mpa-events" ${f.events ? 'checked' : ''}></label>
            ${f.events ? `<label class="row"><span>Ereignisstärke</span><select id="mpa-evmode">
              ${opt('hard', f.eventMode, 'Hart (jede Runde)')}${opt('easy', f.eventMode, 'Leicht (selten)')}</select></label>` : ''}
            <label class="row"><span>Mit Weltwundern</span><input type="checkbox" id="mpa-wonders" ${f.wonders ? 'checked' : ''}></label>
            <label class="row"${noKi ? ' hidden' : ''}><span>KI-Stufe</span><select id="mpa-diff" ${f.ranked ? 'disabled' : ''}>
              ${KI_LEVELS.map(d => opt(d.k, f.ranked ? hardest : f.difficulty, d.n)).join('')}</select></label>
            <label class="row"><span>🔥 Gewertet <small>(KI auf schwerster Stufe)</small></span><input type="checkbox" id="mpa-ranked" ${f.ranked ? 'checked' : ''}></label>
            <label class="row"><span>Öffentlich auffindbar</span><input type="checkbox" id="mpa-public" ${f.isPublic ? 'checked' : ''}></label>
            <label class="row"><span>Einladen <small>(Benutzernamen, mit Komma)</small></span><input type="text" id="mpa-invite" value="${this.esc(f.invite)}"></label>
          </div>
          <p class="sub">${hint}</p>
          <button class="btn wide primary" onclick="ASYNC.create()">Erstellen</button>
          <button class="btn wide ghost" onclick="ASYNC.showList()">Zurück</button>`);
    },

    readForm: function (rerender) {
        const f = this.form, v = id => $(id) ? $(id).value : null, c = id => $(id) ? $(id).checked : false;
        const civBefore = f.civ;
        Object.assign(f, {
            mapKey: v('mpa-map'), civMode: v('mpa-mode'),
            playerCount: +v('mpa-total') || f.playerCount, kiCount: v('mpa-ki') != null ? +v('mpa-ki') : f.kiCount,
            civ: v('mpa-civ') || f.civ, ability: v('mpa-ab') || f.ability,
            events: c('mpa-events'), eventMode: v('mpa-evmode') || f.eventMode, wonders: c('mpa-wonders'),
            difficulty: v('mpa-diff') || f.difficulty, ranked: c('mpa-ranked'), isPublic: c('mpa-public'),
            customName: v('mpa-custom') || f.customName || (typeof myMaps !== 'undefined' && myMaps[0] ? myMaps[0].name : ''),
            invite: v('mpa-invite') || '',
        });
        if (f.civ !== civBefore) f.ability = 'basis';
        if (rerender) this.showCreate();
    },

    /** "6 Reiche · 3 Menschen · 3 KI" (older games: 4, or the humans without KI). */
    countText: function (c) {
        const total = c.playerCount || (c.noKi ? c.humanCount : 4), ki = total - c.humanCount;
        return `${total} Reiche · ${c.humanCount} Menschen · ${ki ? ki + ' KI' : 'ohne KI'}`;
    },

    /** A published map (code) goes into "Meine Karten" first, then it is the form's custom map. */
    customMapByCode: function () {
        loadMapByCodeAsk(name => {
            Object.assign(this.form, { mapKey: 'eigene', customName: name });
            this.showCreate();
        });
    },

    /** A map file goes into "Meine Karten" first, then it is the form's custom map. */
    importCustomMap: function () {
        importMapFile(m => {
            const r = checkCustomMap(m);
            if (r.error) return;                      // importMapFile already says why
            const err = saveMyMap(r.map);
            if (err) return toast(err);
            Object.assign(this.form, { mapKey: 'eigene', customName: r.map.name });
            this.showCreate();
        });
    },

    create: async function () {
        this.readForm(false);
        const f = this.form;
        const customMap = f.mapKey === 'eigene' ? myMap(f.customName) : undefined;
        if (f.mapKey === 'eigene' && !customMap) return toast('Wähle eine eigene Karte oder lade eine aus einer Datei.');
        try {
            toast('Erstelle Rundenspiel…');
            const r = await this.api('', {
                config: {
                    mapKey: f.mapKey, civMode: f.civMode, playerCount: f.playerCount, kiCount: f.kiCount, events: f.events, eventMode: f.eventMode,
                    wonders: f.wonders, difficulty: f.difficulty, ranked: f.ranked, isPublic: f.isPublic,
                    customMap,
                },
                civ: f.civ, ability: f.ability,
                invite: f.invite.split(',').map(x => x.trim()).filter(Boolean),
            });
            if (r.inviteErrors && r.inviteErrors.length) toast(r.inviteErrors.join(' '));
            this.open(r.id);
        } catch (e) { toast(e.message); }
    },

    // ── Join / invite / decline ──────────────────────────────────────────────
    joinByCode: async function () {
        const code = ($('mpa-code') && $('mpa-code').value || '').trim().toUpperCase();
        if (!code) return toast('Bitte einen Code eingeben.');
        try {
            const g = await this.api('/code/' + encodeURIComponent(code));
            if (g.mySlot != null) return this.open(g.id);
            this.showJoin(g.id, code, g);
        } catch (e) { toast(e.message); }
    },

    showJoin: async function (id, code, g) {
        try { g = g || await this.api('/' + id + (code ? '?code=' + encodeURIComponent(code) : '')); }
        catch (e) { return toast(e.message); }
        if (!g.freeSeats.length) return toast('Kein Platz mehr frei.');
        this.joining = { id, code };
        const c = g.config;
        let pickHtml;
        if (c.civMode === 'random') {
            const s = g.seats[g.freeSeats[0].slot];
            const ab = (this.civ(s.civ) || { abilities: [] }).abilities.find(a => a.k === s.ability);
            pickHtml = `<p>Du bekommst den nächsten Platz in der Zugfolge: <b>${this.civLabel(s.civ)}</b>${ab && c.mapKey !== 'marathon' ? ` mit „${this.esc(ab.n)}"` : ''}.</p>`;
        } else {
            const civs = [...new Set(g.freeSeats.map(s => s.civ))];
            pickHtml = `<label class="row"><span>Nation</span><select id="mpa-jciv" onchange="ASYNC.joinAbilities()">
                ${civs.map(k => `<option value="${k}">${this.esc((this.civ(k) || {}).n || k)}</option>`).join('')}</select></label>
              ${c.mapKey === 'marathon' ? '<p class="sub">Fähigkeiten werden vor dem ersten Zug gedraftet.</p>'
                : '<label class="row"><span>Fähigkeit</span><select id="mpa-jab"></select></label>'}`;
        }
        modal('Rundenspiel beitreten', `
            <p><b>${this.mapName(c.mapKey, c)}</b> · ${ASYNC.countText(c)}${c.ranked ? ' · 🔥 Gewertet' : ''}</p>
            ${this.seatsHtml(g.seats, null)}
            ${pickHtml}
            <p class="sub">Du kannst sofort beitreten – ziehen kannst du, sobald du an der Reihe bist. Bis zu deinem ersten Zug kannst du ohne Folgen wieder aussteigen.</p>
            <button class="btn wide primary" onclick="ASYNC.join()">Beitreten</button>
            <button class="btn wide ghost" onclick="ASYNC.showList()">Zurück</button>`);
        this.joinAbilities();
    },

    joinAbilities: function () {
        const sel = $('mpa-jab'), civ = $('mpa-jciv') && this.civ($('mpa-jciv').value);
        if (!sel || !civ) return;
        sel.innerHTML = '<option value="random">Zufall</option>' +
            civ.abilities.map(a => `<option value="${a.k}" ${a.k === 'basis' ? 'selected' : ''}>${this.esc(a.n)}</option>`).join('');
    },

    join: async function () {
        const j = this.joining;
        if (!j) return;
        try {
            await this.api(`/${j.id}/join`, {
                code: j.code, civ: $('mpa-jciv') ? $('mpa-jciv').value : undefined,
                ability: $('mpa-jab') ? $('mpa-jab').value : undefined,
            });
            this.open(j.id);
        } catch (e) { toast(e.message); }
    },

    decline: async function (id) {
        try { await this.api(`/${id}/decline`, {}); this.showList(); } catch (e) { toast(e.message); }
    },

    showInvite: function (id, code) {
        const back = MP.asyncId === id ? 'ASYNC.reopenModal()' : 'ASYNC.showList()';
        modal('Mitspieler einladen', `
            <p>Code zum Weitergeben: <b style="font-family:monospace;font-size:16px">${code}</b></p>
            <p class="sub">Oder Link: <span style="user-select:all">${this.esc(location.origin + location.pathname + '?async=' + id)}</span></p>
            <label class="row"><span>Benutzername</span><input type="text" id="mpa-inv-name"></label>
            <button class="btn wide primary" onclick="ASYNC.invite('${id}')">Einladen</button>
            <button class="btn wide ghost" onclick="${back}">Zurück</button>`);
    },

    reopenModal: function () {
        if (this.view && ['setup', 'placement'].includes(this.view.status)) this.apply(this.view);
        else closeModal();
    },

    invite: async function (id) {
        const name = ($('mpa-inv-name') && $('mpa-inv-name').value || '').trim();
        if (!name) return toast('Bitte einen Benutzernamen eingeben.');
        try { await this.api(`/${id}/invite`, { username: name }); toast(`${name} ist eingeladen.`); $('mpa-inv-name').value = ''; }
        catch (e) { toast(e.message); }
    },

    leave: async function (id) {
        if (!confirm('Dieses Rundenspiel verlassen?')) return;
        try { await this.api(`/${id}/leave`, {}); this.close(); show('screen-menu'); this.showList(); } catch (e) { toast(e.message); }
    },

    cancel: async function (id) {
        if (!confirm('Dieses Rundenspiel für alle abbrechen?')) return;
        try { await this.api(`/${id}/cancel`, {}); this.close(); show('screen-menu'); this.showList(); } catch (e) { toast(e.message); }
    },

    // ── Open a game ──────────────────────────────────────────────────────────
    open: async function (id) {
        if (!(await this.requireLogin())) return;
        await MP.connect();
        MP.socket.emit('async:open', { id }, res => {
            if (res && res.error === 'Bitte anmelden.' && MP.user && !this._retried) {
                // the socket was opened before logging in – reconnect with the session cookie
                this._retried = true;
                MP.socket.disconnect(); MP.socket = null;
                return this.open(id);
            }
            this._retried = false;
            if (!res || res.error) return toast((res && res.error) || 'Fehler');
            if (ASYNC.switchVersion(id, res.view.engine)) return;
            this.enter(res.view);
        });
    },

    /**
     * Rundenspiele are played with the version they were started on. The server runs that
     * engine; the page has to match: games from an older version open in that game at
     * /<version>/ (OLD_VERSIONS), all others in the current game at /. Returns true when the
     * page is being switched.
     */
    switchVersion: function (id, engineVersion) {
        const here = OLD_VERSIONS.includes(APP_VERSION_HERE) ? APP_VERSION_HERE : null;
        const want = OLD_VERSIONS.includes(engineVersion) ? engineVersion : null;
        if (here === want) return false;
        location.href = (want ? '/' + want + '/' : '/') + '?async=' + encodeURIComponent(id);
        return true;
    },

    reload: function () {
        if (!MP.asyncId || !MP.socket) return;
        MP.socket.emit('async:open', { id: MP.asyncId }, res => { if (res && res.view) this.apply(res.view); });
    },

    enter: function (view) {
        MP.active = true;
        MP.asyncId = view.id;
        MP.sessionId = null;
        MP.renderLobby = null;
        MP.lobbyIndex = view.mySlot;
        MP.lastTurnKey = null;
        this.view = null;
        this.placing = false;
        const credBox = $('mp-cred-box');
        if (credBox) credBox.textContent = `Rundenspiel ${view.joinCode} · Liste`;
        this.apply(view);
    },

    /** Leave the game view (the game itself goes on). */
    close: function () {
        if (MP.socket && MP.asyncId) MP.socket.emit('async:close', {});
        MP.asyncId = null;
        MP.active = false;
        this.view = null;
        this.placing = false;
        document.body.classList.remove('mp-waiting');
        const credBox = $('mp-cred-box');
        if (credBox) credBox.textContent = '';
        // older versions are only there for Rundenspiele started on them – afterwards back to the current game
        if (OLD_VERSIONS.includes(APP_VERSION_HERE)) { location.href = '/'; return; }
    },

    apply: function (view) {
        const prev = this.view;
        this.view = view;
        MP.players = view.seats.map(s => ({ index: s.slot, name: s.name, civ: s.civ, userId: s.replaced ? null : s.userId, isBot: s.kind === 'bot' || (s.kind === 'ki' && !s.replaced) }));
        const toastEl = document.querySelector('.mp-waiting-toast');
        if (toastEl) toastEl.textContent = view.waitingFor ? `Warte auf ${view.waitingFor} …` : 'Warte auf deinen Zug...';

        if (view.status === 'cancelled') {
            toast('Das Rundenspiel wurde abgebrochen.');
            this.close(); show('screen-menu'); return this.showList();
        }
        if (view.status === 'setup') return this.waitingModal(view, 'Das Spiel beginnt, sobald alle beigetreten sind.');
        if (view.status === 'placement') {
            if (view.placement.placed) {
                this.placing = false;
                return this.waitingModal(view, 'Dein Startplättchen liegt. Aufgedeckt wird, wenn alle gelegt haben.');
            }
            if (!this.placing) this.startPlacement(view);
            return;
        }
        if (view.status === 'draft') {
            closeModal();
            draftState = { cfg: null, V: view.draft.V, D: view.draft.D };
            if (!$('screen-draft').classList.contains('show')) show('screen-draft');
            return drawDraft();
        }
        // playing / finished
        this.placing = false;
        const fresh = !prev || !['playing', 'finished'].includes(prev.status) || !$('screen-game').classList.contains('show');
        MP.playerIndex = view.myIndex;
        if (fresh) {
            closeModal();
            if (typeof draftState !== 'undefined') draftState = null;
            placeState = null;
            S = view.state;
            MP.lastTurnKey = S.round + ':' + S.cur;
            MP.lastTurn = S.cur;
            MP.syncTurnBlocker();
            startGameScreen();
            MP.updateHudDelayed();
            MP.updatePersistentLog();
            MP.updatePlayerList();
            if (S.cur === MP.playerIndex && !S.over) MP.animDeinZug();
        } else {
            MP.applyState(view.state);
        }
    },

    waitingModal: function (view, text) {
        const c = view.config;
        const me = view.seats.find(s => s.slot === view.mySlot);
        const host = view.isHost;
        modal('Rundenspiel', `
            <p><b>${this.mapName(c.mapKey, c)}</b> · ${c.civMode === 'random' ? 'Zufallsnationen' : 'Feste Nationen'} · ${ASYNC.countText(c)}${c.ranked ? ' · 🔥 Gewertet' : ''}</p>
            ${this.seatsHtml(view.seats, view.mySlot)}
            <p>${text}</p>
            ${view.waitingFor ? `<p class="sub">Wartet auf: ${this.esc(view.waitingFor)}</p>` : ''}
            ${view.freeSeats.length ? `<button class="btn wide" onclick="ASYNC.showInvite('${view.id}', '${view.joinCode}')">Mitspieler einladen (Code ${view.joinCode})</button>` : ''}
            <button class="btn wide primary" onclick="ASYNC.close(); show('screen-menu'); ASYNC.showList()">Zur Liste</button>
            ${view.status === 'setup' && host ? `<button class="btn wide ghost" onclick="ASYNC.cancel('${view.id}')">Spiel abbrechen</button>` : ''}
            ${view.status === 'setup' && !host && me ? `<button class="btn wide ghost" onclick="ASYNC.leave('${view.id}')">Spiel verlassen</button>` : ''}`);
    },

    // ── Start tile placement (tile maps) ─────────────────────────────────────
    startPlacement: function (view) {
        const pl = view.placement;
        const seat = pl.plan.seats.find(s => s.idx === view.mySlot);
        if (!seat) return this.waitingModal(view, 'Warte auf die anderen Spieler.');
        closeModal();
        this.placing = true;
        placeState = {
            cfg: { players: pl.players, wonders: pl.wonders }, plan: pl.plan, rnd: mapRng(1),
            setup: pl.setup, queue: [seat], at: 0, o: 0, cell: null, done: false,
        };
        show('screen-place');
        placeStep();
        // "Fertig" is bound to placeConfirm at boot – route it to the server while placing
        $('pl-ok').onclick = () => (ASYNC.placing && MP.asyncId ? ASYNC.confirmPlacement() : placeConfirm());
    },

    confirmPlacement: function () {
        const st = placeState;
        if (!st) return;
        if (st.cell == null) return toast('Erst die Hauptstadt setzen.');
        MP.socket.emit('async:place', { id: MP.asyncId, o: st.o, cell: st.cell }, res => {
            if (res && res.error) return toast(res.error);
            toast('Startplättchen gelegt.');
        });
    },
};

// Menu button "Rundenspiele" (after "Multiplayer"), and ?async=<id> links from e-mails
window.addEventListener('DOMContentLoaded', () => {
    const mNew = $('m-new');
    if (mNew && !$('mp-async-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.id = 'mp-async-btn';
        btn.textContent = 'Rundenspiele';
        btn.onclick = () => ASYNC.showList();
        mNew.parentNode.insertBefore(btn, $('m-continue'));
    }
    // Tap the code box in the HUD to go back to the list (the game goes on)
    const cred = $('mp-cred-wrapper');
    if (cred) cred.addEventListener('click', () => {
        if (!MP.asyncId) return;
        ASYNC.close(); show('screen-menu'); ASYNC.showList();
    });
    // In-game menu (☰) of a Rundenspiel: "Zurück zum Hauptmenü" instead of "Spiel beenden"
    // (which would wipe the local single-player save). Deferred so ui.js has built the modal.
    const gMenu = $('g-menu');
    if (gMenu) gMenu.addEventListener('click', () => setTimeout(() => {
        if (!MP.asyncId) return;
        const quit = $('mm-quit');
        if (!quit || $('mm-async-menu')) return;
        const btn = document.createElement('button');
        btn.className = 'btn wide primary';
        btn.id = 'mm-async-menu';
        btn.textContent = 'Zurück zum Hauptmenü';
        btn.onclick = () => { closeModal(); ASYNC.close(); show('screen-menu'); ASYNC.refreshBadge(); };
        quit.parentNode.insertBefore(btn, quit);
        quit.remove();
    }, 0));
    MP.fetchUser().then(() => {
        ASYNC.refreshBadge();
        const params = new URLSearchParams(location.search);
        // Back from Google/Discord: the server redirects here with ?oauth=<result>
        const oauth = params.get('oauth');
        if (oauth) {
            history.replaceState(null, '', location.pathname);
            const OAUTH_MESSAGES = {
                ok: MP.user ? `Angemeldet als ${MP.user.username}.` : 'Anmeldung erfolgreich.',
                linked: 'Konto erfolgreich verknüpft.',
                failed: 'Anmeldung abgebrochen oder abgelehnt.',
                taken: 'Dieses Google-/Discord-Konto ist bereits mit einem anderen Hochciv-Konto verknüpft.',
                banned: 'Dieses Konto ist gesperrt.',
                merge_async: 'Dein Discord-Konto hat noch laufende Rundenspiele. Beende sie zuerst und verknüpfe danach erneut.',
                state: 'Die Anmeldung ist abgelaufen. Bitte starte sie erneut.',
                reauth: 'Bitte bestätige zuerst auf der Kontoseite deine Identität und verknüpfe danach erneut.',
                error: 'Bei der Anmeldung ist ein Fehler aufgetreten. Bitte versuche es erneut.',
            };
            toast(OAUTH_MESSAGES[oauth] || OAUTH_MESSAGES.error);
            if (MP.renderMainMenuAuth) MP.renderMainMenuAuth();
        }
        const id = params.get('async');
        if (id) {
            history.replaceState(null, '', location.pathname);
            ASYNC.open(id);
        } else if (OLD_VERSIONS.includes(APP_VERSION_HERE)) {
            location.replace('/');           // /v88/, /v87/, /v83/ only open running Rundenspiele of that version
        }
    });

    const style = document.createElement('style');
    style.textContent = `
        .mpa-badge { display:inline-block; background:#c0392b; color:#fff; border-radius:10px; padding:0 7px; font-size:12px; font-weight:bold; line-height:18px; }
        .mpa-top { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
        .mpa-top .btn { width:auto; margin:0; }
        .mpa-code { display:flex; gap:4px; align-items:center; margin-left:auto; }
        .mpa-code input { width:90px; text-transform:uppercase; }
        .mpa-h { margin:14px 0 6px; }
        .mpa-row { border:1px solid rgba(0,0,0,.15); border-radius:6px; padding:8px 10px; margin-bottom:8px; background:rgba(255,255,255,.4); }
        .mpa-row.turn { border-color:#c0392b; box-shadow:0 0 0 1px #c0392b inset; }
        .mpa-title { font-size:14px; }
        .mpa-c { float:right; font-family:monospace; opacity:.6; }
        .mpa-seats { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12px; margin:4px 0; }
        .mpa-seat.me { font-weight:bold; }
        .mpa-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; }
        .mpa-foot .btn { width:auto; margin:0; }
        .mpa-notify { margin-top:14px; border-top:1px solid rgba(0,0,0,.1); padding-top:10px; }
        #mp-cred-wrapper { cursor:pointer; }
    `;
    document.head.appendChild(style);
});
