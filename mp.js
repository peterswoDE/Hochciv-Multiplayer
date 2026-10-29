/** Escape text for use inside HTML (names come from other players). */
const escHtml = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Older game versions served at /<version>/ for Rundenspiele started on them (GAME_DIRS in
   engine-adapter.js), and the version of this page. */
const OLD_VERSIONS = ['v93', 'v88', 'v83'];
const APP_VERSION_HERE = typeof APP_VERSION !== 'undefined' ? APP_VERSION : null;

/* Texts in the player's language (client/i18n.js, loaded before this file): TX() for our own
   texts – German is the key, as in the game's T() –, TXS() for messages from the server. */
const TX = (de, ...args) => HC_I18N.t(de, ...args);
const TXS = msg => HC_I18N.tr(msg);

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
    TURN_TIMES: [0, 60, 120, 180, 300, 600],    // turn timer choices in seconds (sockets/game.js)
    turnClock: null,        // live games with a turn timer: { total, deadline (local ms) | null }
    spectator: false,       // watching without a seat (live game or public Rundenspiel)
    spectatorCount: 0,      // live game: how many are watching
    replay: false,          // the page shows a replay (client/replay.js, ?replay=<id>)
    lastRecord: null,       // the stored match of the game that just ended: { id, replay }
    summary: null,          // "since your last turn" of our current / last turn (utils/summary.js)
    summaryShownKey: null,  // the turn whose summary popped up already

    /** Live game: the KI plays our seat because we missed our turns (turn timer). */
    isAfk: function () {
        if (this.asyncId) return false;
        const me = (this.players || []).find(p => p.index === this.lobbyIndex);
        return !!(me && me.afk);
    },
    /** It is our turn and we play it ourselves. */
    isMyTurn: function () {
        return typeof S !== 'undefined' && !!S && S.cur === this.playerIndex && !this.isAfk();
    },

    /** Send a game action to the server – live lobby or asynchronous game. */
    sendAction: function (payload, cb) {
        if (this.asyncId) {
            this.socket.emit('async:action', { id: this.asyncId, type: payload.type, params: payload.params }, res => {
                if (res && res.error) { toast(TXS(res.error)); ASYNC.reload(); }
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
        MP.updatePlayerList();
        // round + player: also correct when the same player moves again (everyone else bots)
        const key = S.round + ':' + S.cur;
        if (MP.isMyTurn() && MP.lastTurnKey !== key && !S.over) {
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
        d.textContent = TX('DU BIST AM ZUG!');
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
                    displayName += ` <span style="opacity:0.75;font-weight:normal;">(· ${sPlayer.kind === 'ki' ? TX('KI') : TX('Bot')})</span>`;
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
        const info = cur ? `<b>${esc(cur.name)}</b> (${cur.rows.length} × ${cur.rows[0].length})` : `<i>${TX('noch keine gewählt')}</i>`;
        if (!isHost) return `<p class="hint" style="margin:4px 0 8px">${TX('Eigene Karte: %s', info)}</p>`;
        const list = typeof myMaps !== 'undefined' ? myMaps : [];
        const opts = list.map(m => `<option value="${esc(m.name)}" ${cur && cur.name === m.name ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
        return `<label class="row"><span>${TX('Meine Karten')}</span>
              <select id="mp-set-custom" onchange="MP.pickCustomMap(this.value)">
                ${cur && !list.some(m => m.name === cur.name) ? `<option selected>${esc(cur.name)}</option>` : ''}
                ${opts || (cur ? '' : `<option value="">${TX('– keine gespeichert –')}</option>`)}
              </select></label>
            <p class="hint" style="margin:4px 0 8px">${TX('Eigene Karte: %s', info)} ·
              <a href="#" onclick="MP.customMapByCode(); return false">${TX('Code eingeben')}</a> ·
              <a href="#" onclick="MP.importCustomMap(); return false">${TX('aus Datei laden')}</a>
              – ${TX('Karten baust du im Karteneditor (Hauptmenü).')}</p>`;
    },
    /** A published map (6-character code) becomes the lobby's map. */
    customMapByCode: function () {
        const code = prompt(TX('Kartencode (6 Zeichen):'));
        if (!code) return;
        MAPACCOUNT.account.load(code).then(r => {
            this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: r.map }, res => {
                if (res && res.error) return toast(TXS(res.error));
                toast(r.author ? TX('Karte „%s" von %s gewählt.', r.map.name, r.author) : TX('Karte „%s" gewählt.', r.map.name));
            });
        }).catch(e => toast(TXS(e.message)));
    },
    pickCustomMap: function (name) {
        const m = typeof myMap === 'function' ? myMap(name) : null;
        if (m) this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: m }, res => { if (res && res.error) toast(TXS(res.error)); });
    },
    importCustomMap: function () {
        importMapFile(m => {
            const r = checkCustomMap(m);
            if (r.error) return;                      // importMapFile already says why
            this.socket.emit('lobby:config', { mapKey: 'eigene', customMap: r.map }, res => { if (res && res.error) toast(TXS(res.error)); });
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
        const title = $('mp-players-title');
        if (title) title.textContent = TX('Spieler') + (this.spectatorCount ? ` · 👁 ${this.spectatorCount}` : '');
        list.innerHTML = S.players.map((sp, i) => {
            const lp = this.lobbyPlayerOf(sp) || {};
            const civ = typeof civOf === 'function' ? civOf(sp) : { n: sp.civ, color: '#999' };
            const bot = lp.isBot || sp.kind === 'bot' || sp.kind === 'ki';
            const name = lp.name || civ.n;
            // an absent player's seat (turn timer) is played by the KI, but stays theirs
            const status = lp.afk ? `<span class="mp-pl-tag off" title="${TX('Hat dreimal nicht gezogen – die KI spielt den Platz')}">${TX('KI (abwesend)')}</span>`
                : bot ? `<span class="mp-pl-tag">${sp.kind === 'bot' ? TX('Bot') : TX('KI')}</span>`
                : lp.connected === false ? `<span class="mp-pl-tag off" title="${TX('Nicht verbunden')}">${TX('offline')}</span>` : '';
            return `<div class="mp-pl-row${S.cur === i && !S.over ? ' cur' : ''}">
                <span class="mp-pl-dot" style="background:${esc(civ.color)}"></span>
                <span class="mp-pl-name">${this.nameLink(name, lp.userId)}${i === this.playerIndex ? ` <small>(${TX('du')})</small>` : ''}</span>
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
            : r.won ? `${r.points} <small>(${TX('inkl. +%s Sieg', this.WIN_BONUS)})</small>` : r.points;
        const html = `<div id="mp-go-players"><table class="tbl" style="margin:10px 0">
            <tr><th>${TX('Spieler')}</th><th>${TX('Reich')}</th>${scored ? `<th>${TX('Punkte')}</th>` : ''}</tr>
            ${rows.map(r => `<tr${r.won ? ' style="font-weight:700"' : ''}>
                <td>${this.nameLink(r.name, r.userId)}${r.bot ? ` <small>(${TX('Bot')})</small>` : ''}</td>
                <td>${esc(r.civ)}</td>${scored ? `<td>${pts(r)}</td>` : ''}</tr>`).join('')}
            </table></div>`;
        const tip = body.querySelector('.tip');
        if (tip) tip.insertAdjacentHTML('beforebegin', html);
        else body.insertAdjacentHTML('beforeend', html);
    },

    /**
     * End screen of a live game: "Revanche" for the host (back to the lobby with the same group),
     * a note for everyone else. The game's own "Nochmal spielen" would start a local game.
     */
    addRematch: function () {
        const body = document.getElementById('ov-body');
        if (!body || document.getElementById('mp-rematch-box')) return;
        const again = $('go-again');
        if (again) {
            const sub = again.nextElementSibling;
            if (sub && sub.classList.contains('sub')) sub.remove();
            again.remove();
        }
        if (this.asyncId || this.replay) return;
        const box = document.createElement('div');
        box.id = 'mp-rematch-box';
        box.innerHTML = this.lobbyIndex === this.hostIndex
            ? `<button class="btn primary wide" id="mp-rematch" onclick="MP.rematch()">${TX('Revanche')}</button>
               <p class="sub" style="margin:6px 2px 10px;text-align:center">${TX('Alle, die noch verbunden sind, kommen zurück in die Lobby – mit denselben Einstellungen.')}</p>`
            : `<p class="sub" style="margin:6px 2px 10px;text-align:center">${TX('Der Host kann eine Revanche starten – dann geht es für alle zurück in die Lobby.')}</p>`;
        const menu = $('go-menu');
        if (menu) menu.parentNode.insertBefore(box, menu);
        else body.appendChild(box);
    },
    rematch: function () {
        this.socket.emit('session:rematch', {}, res => { if (res && res.error) toast(TXS(res.error)); });
    },
    /** The host started a rematch: leave the finished game for the lobby. */
    enterRematch: async function (data) {
        this.lobbyIndex = this.spectator ? null : data.playerIndex;
        this.hostIndex = data.hostIndex;
        this.players = data.players;
        this.gameConfig = data.gameConfig || {};
        this.playerIndex = this.spectator ? -1 : null;
        if (typeof CHAT !== 'undefined') CHAT.setMute(null);     // the word filter's timeout ends with the game
        this.lastStats = null;
        this.lastRecord = null;
        this.lastTurnKey = null;
        this.placementFinished = false;
        this.setTurnClock(null);
        S = null;
        document.body.classList.remove('mp-waiting');
        const pl = $('mp-players-container');
        if (pl) pl.style.display = 'none';
        const confetti = $('confetti');
        if (confetti) confetti.remove();
        closeModal();
        show('screen-menu');
        await this.showLobby();
        this.setMode(this.spectator ? 'watching' : 'waiting');
        toast(TX('Revanche! Ihr seid zurück in der Lobby.'));
    },

    /** Lobby code and password in the game's header (spectators: the code only). */
    showCred: function () {
        const box = $('mp-cred-box');
        if (!box) return;
        const code = `<span class="mp-cred-lbl">Code: </span>${escHtml(this.joinCode || '')}`;
        box.innerHTML = this.spectator ? `👁 ${escHtml(TX('Zuschauer'))} · ${code}`
            : `${code} · PW ${escHtml(this.password || '')}`;
    },

    /**
     * Chat and player list are separate floating panels. On small screens the two open ones can
     * cover each other: the one that just opened (keep) stays, the other collapses. Without keep,
     * the chat stays.
     */
    fitPanels: function (keep) {
        if (keep) this._lastPanel = keep;
        clearTimeout(this._fitTimer);
        this._fitTimer = setTimeout(() => {            // after the 0.2 s open transition
            const open = ['mp-chat', 'mp-players-container'].map($)
                .filter(el => el && el.offsetWidth && !el.classList.contains('mp-log-minimized'));
            if (keep) open.sort((a, b) => (b === keep) - (a === keep));
            const kept = [];
            const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            for (const el of open) {
                const r = el.getBoundingClientRect();
                if (!kept.some(k => hit(k, r))) { kept.push(r); continue; }
                el.classList.add('mp-log-minimized');
                if (el.id === 'mp-chat' && typeof CHAT !== 'undefined') CHAT.cancelPing();
            }
        }, 250);
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
            if (typeof CHAT !== 'undefined') CHAT.attach(this.socket);       // client/chat.js
            if (typeof MATCH !== 'undefined') MATCH.attach(this.socket);     // client/matchmaking.js

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
                toast(TX('%s ist beigetreten.', data.name));
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
            });
            this.socket.on('player:left', data => {
                MP.players = data.players;
                if (data.newHostIndex !== undefined) MP.hostIndex = data.newHostIndex;
                toast(TX('%s hat das Spiel verlassen.', data.name));
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
            });
            this.socket.on('lobby:player:updated', players => {
                MP.players = players;
                if (MP.renderLobby) MP.renderLobby();
                MP.updatePlayerList();
                // turn timer: a seat went to the KI or came back
                if (typeof S !== 'undefined' && S && $('screen-game') && $('screen-game').classList.contains('show')) MP.syncTurnBlocker();
            });
            this.socket.on('session:kicked', (data) => {
                MP.active = false;
                toast(data && data.reason ? TXS(data.reason) : TX('Du wurdest vom Host gekickt.'));
                MP.setMode('menu'); // Snap directly to menu instead of waiting to reload
            });
            this.socket.on('spectators:update', data => {
                MP.spectatorCount = data && data.count || 0;
                MP.updatePlayerList();
            });
            this.socket.on('session:rematch', data => {
                if (MP.asyncId) return;
                MP.enterRematch(data);
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
                // spectators see the map once every start tile lies (game:start)
                if (MP.spectator) return modal(TX('Zuschauen'), `<p>${TX('Die Spieler legen ihre Startplättchen. Die Karte erscheint, sobald alle gelegt haben.')}</p>`);

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
                    if (MP.placementFinished) window.toast(TX('Warten auf andere Spieler...'));
                }

                // the game's own placeSeat – once, a rematch on the same page would wrap the wrapper
                MP.placementFinished = false;
                const origPlaceSeat = MP._origPlaceSeat = MP._origPlaceSeat || window.placeSeat;
                window.placeSeat = function (plan, seat, o, cell) {
                    if (seat.idx === MP.lobbyIndex) {
                        MP.placementFinished = true;
                        MP.socket.emit('placement:action', { o, cell }, res => {
                            if (res && res.error) window.toast(TXS(res.error));
                        });
                        document.body.classList.add('mp-waiting');
                        window.toast(TX('Warten auf andere Spieler...'));
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
                MP.lastStats = null;
                MP.lastRecord = null;
                MP.takeSummary(data.summary);
                MP.setTurnClock(data.turn);
                MP.lastTurn = S.cur;
                MP.lastTurnKey = S.round + ':' + S.cur;

                window.placeState = null;
                if (typeof draftState !== 'undefined') draftState = null;
                document.body.classList.remove('mp-waiting');

                MP.syncTurnBlocker();
                MP.renderLobby = null; // Prevent Lobby from opening mid-game on reconnects
                closeModal();
                startGameScreen();
                MP.updatePlayerList();
            });


            this.socket.on('state:update', data => {
                if (MP.asyncId) return;
                MP.setTurnClock(data.turn);
                MP.takeSummary(data.summary);
                MP.applyState(data.state);
            });

            // Turn timer: our time was up – the server (KI) has finished the turn
            this.socket.on('turn:timeout', data => {
                if (MP.asyncId) return;
                if (typeof closeModal === 'function') closeModal();
                if (typeof closeSheet === 'function') closeSheet();
                if (typeof ui !== 'undefined' && ui) { ui.army = null; ui.sel = null; ui.mode = null; }
                toast(data && data.afk ? TX('Die Zeit ist abgelaufen. Du hast dreimal nicht gezogen – die KI spielt jetzt für dich.')
                    : TX('Die Zeit ist abgelaufen – die KI hat deinen Zug beendet.'));
            });

            // Asynchronous games: the full view (status, seats, state / placement / draft)
            this.socket.on('async:update', view => {
                if (view && view.id === MP.asyncId) ASYNC.apply(view);
            });

            // Post-game statistics (client/stats.js), right after 'game:over'
            this.socket.on('game:stats', data => {
                if (MP.asyncId || !data) return;
                MP.lastStats = data.stats;
                if (typeof STATS !== 'undefined') STATS.addToEndScreen(MP.lastStats);
            });

            // The match is stored (with its replay): the end screen offers to watch it again
            this.socket.on('game:record', data => {
                if (MP.asyncId || !data) return;
                MP.lastRecord = data;
                if (typeof REPLAY !== 'undefined') REPLAY.addToEndScreen(data);
            });

            this.socket.on('game:over', winData => {
                S.over = winData;
                gameOver();
            });
        });
    },

    syncTurnBlocker: function () {
        MP.drawAfkBanner();
        MP.drawSummaryButton();
        const wait = document.querySelector('.mp-waiting-toast');
        if (wait && MP.spectator) wait.textContent = TX('Du schaust zu');
        if (S && !MP.isMyTurn() && !S.over) {
            document.body.classList.add('mp-waiting');
        } else {
            document.body.classList.remove('mp-waiting');
        }
    },

    // ── "Since your last turn" (utils/summary.js) ────────────────────────────
    /** A summary from the server – ours, and the first one of a turn (later views repeat it). */
    takeSummary: function (sum) {
        if (!sum || sum.me !== this.playerIndex) return;
        if (this.summary && this.summary.key === sum.key) return;
        this.summary = sum;
        this.drawSummaryButton();
    },
    summaryAuto: function () {
        try { return localStorage.getItem('hochciv.summary.auto') !== '0'; } catch (_) { return true; }
    },
    /** Our turn begins: its summary first (if wanted), the game's own turn-start dialogs after it. */
    summaryBeforeTurn: function (go) {
        const sum = this.summary;
        const key = typeof S !== 'undefined' && S ? S.round + ':' + S.cur : null;
        if (!sum || sum.key !== key || this.summaryShownKey === key || !this.summaryAuto()) return false;
        this.summaryShownKey = key;
        this.showSummary(go);
        return true;
    },
    summaryName: function (i) {
        const sp = S.players[i];
        if (!sp) return '?';
        const civ = typeof civOf === 'function' ? civOf(sp).n : sp.civ;
        const lp = this.lobbyPlayerOf(sp) || {};
        return lp.name && !lp.isBot ? `${lp.name} (${civ})` : civ;
    },
    showSummary: function (after) {
        const sum = this.summary;
        if (!sum || typeof S === 'undefined' || !S) return after && after();
        const nm = i => (i === this.playerIndex ? `<b>${TX('du')}</b>` : `<b>${escHtml(this.summaryName(i))}</b>`);
        const city = n => (n === 1 ? TX('eine Stadt') : TX('%s Städte', n));
        const wonder = k => { const w = typeof WONDER_BY_KEY !== 'undefined' && WONDER_BY_KEY[k]; return escHtml(w ? (typeof T === 'function' ? T(w.n) : w.n) : k); };
        const alerts = [];
        for (const l of sum.lost) alerts.push(l.by === -1 ? `⚔ ${TX('Du hast %s verloren.', city(l.n))}` : `⚔ ${TX('%s hat dir %s abgenommen.', nm(l.by), city(l.n))}`);
        for (const g of sum.gained) alerts.push(`🏰 ${TX('Du hast %s von %s erobert.', city(g.n), nm(g.from))}`);
        for (const p of sum.players) if (p.out) alerts.push(`☠ ${TX('%s ist ausgeschieden.', nm(p.pi))}`);
        for (const w of sum.wonders) alerts.push(`🏛 ${TX('%s baut %s.', nm(w.pi), wonder(w.k))}`);
        const diff = d => (d > 0 ? `<span class="mp-sum-up">+${d}</span>` : d < 0 ? `<span class="mp-sum-down">−${-d}</span>` : '');
        const score = i => { try { return victoryScore(S, i).total; } catch (_) { return '–'; } };
        const rows = sum.players.map(p => {
            const sp = S.players[p.pi];
            const cities = S.cities.filter(c => c.owner === p.pi).length;
            const techs = Object.keys(sp.techs || {}).filter(k => sp.techs[k]).length;
            const col = typeof civOf === 'function' ? civOf(sp).color : '#999';
            return `<tr${p.pi === this.playerIndex ? ' class="mp-sum-me"' : ''}>
                <td><span class="mp-pl-dot" style="display:inline-block;vertical-align:middle;background:${escHtml(col)}"></span> ${p.pi === this.playerIndex ? TX('Du') : escHtml(this.summaryName(p.pi))}</td>
                <td class="mp-sum-num">${score(p.pi)} ${diff(p.ds)}</td><td class="mp-sum-num">${cities} ${diff(p.dc)}</td>
                <td class="mp-sum-num">${techs} ${diff(p.dt)}</td><td class="mp-sum-num">${diff(p.da) || '·'}</td></tr>`;
        }).join('');
        const span = sum.since === sum.round ? TX('Runde %s', sum.round) : TX('Runde %s bis %s', sum.since, sum.round);
        modal(TX('Seit deinem letzten Zug'), `
            <p class="sub">${span}</p>
            ${alerts.length ? `<ul class="mp-sum-alerts">${alerts.map(a => `<li>${a}</li>`).join('')}</ul>` : `<p>${TX('Keine Eroberungen, keine Wunder – die anderen haben ausgebaut.')}</p>`}
            <div style="overflow-x:auto"><table class="tbl mp-sum-table">
              <tr><th>${TX('Reich')}</th><th class="mp-sum-num">${TX('Punkte')}</th><th class="mp-sum-num">${TX('Städte')}</th><th class="mp-sum-num">${TX('Technologien')}</th><th class="mp-sum-num">${TX('Armeen')}</th></tr>
              ${rows}</table></div>
            <details class="mp-sum-log"><summary>${TX('Alle Ereignisse (%s)', sum.log.length)}</summary>
              <div>${typeof logHtml === 'function' ? logHtml(sum.log) : ''}</div></details>
            <label class="row mp-sum-auto"><span>${TX('Bei jedem Zug automatisch zeigen')}</span>
              <input type="checkbox" id="mp-sum-auto" ${this.summaryAuto() ? 'checked' : ''}></label>
            <button class="btn wide primary" id="mp-sum-go">${TX('Weiter')}</button>`);
        $('mp-sum-auto').onchange = e => { try { localStorage.setItem('hochciv.summary.auto', e.target.checked ? '1' : '0'); } catch (_) { } };
        // however the popup is closed (button, ✕, outside), the turn goes on
        this._afterSummary = after || null;
        $('mp-sum-go').onclick = () => closeModal();
    },
    drawSummaryButton: function () {
        const btn = $('mp-summary-btn');
        if (btn) btn.hidden = !(this.active && !this.spectator && this.summary && typeof S !== 'undefined' && S && !S.over);
    },

    // ── Turn timer (live games, host setting "Zeit pro Zug") ──────────────────
    /** `turn` from the server: { total, left } in ms (left null: no clock now), or null without a limit. */
    setTurnClock: function (turn) {
        const was = this.turnClock;
        this.turnClock = turn && !this.asyncId ? { total: turn.total, deadline: turn.left == null ? null : Date.now() + turn.left } : null;
        // warn once per turn, also when the deadline is corrected by a later update
        if (this.turnClock && was && was.deadline && this.turnClock.deadline) this.turnClock.warned = was.warned;
        if (this.turnClock && !this._clockTimer) this._clockTimer = setInterval(() => this.drawTurnClock(), 250);
        if (!this.turnClock && this._clockTimer) { clearInterval(this._clockTimer); this._clockTimer = null; }
        this.drawTurnClock();
    },
    drawTurnClock: function () {
        const el = $('mp-turn-clock');
        if (!el) return;
        const tc = this.turnClock;
        if (!this.active || !tc || !tc.deadline || typeof S === 'undefined' || !S || S.over) { el.hidden = true; return; }
        const left = Math.max(0, tc.deadline - Date.now());
        const sec = Math.ceil(left / 1000);
        el.hidden = false;
        el.classList.toggle('mp-clock-low', sec <= 30);
        el.textContent = `⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        if (sec <= 30 && sec > 0 && !tc.warned && this.isMyTurn() && tc.total > 30000) {
            tc.warned = true;
            toast(TX('Noch 30 Sekunden für deinen Zug!'));
        }
    },
    /** Banner while the KI plays our seat, with the button to take it back. */
    drawAfkBanner: function () {
        const el = $('mp-afk-banner');
        if (el) el.hidden = !(this.active && this.isAfk() && typeof S !== 'undefined' && S && !S.over);
    },
    reclaimSeat: function () {
        this.socket.emit('turn:reclaim', {}, res => {
            if (res && res.error) return toast(TXS(res.error));
            MP.lastTurnKey = null;            // if it is our turn right now, it starts for us
            toast(TX('Willkommen zurück – du spielst wieder selbst.'));
        });
    },



    renderMainMenuAuth: async function () {
        await this.fetchUser();
        this.drawMainMenuAuth();
        if (this.renderLobby) this.renderLobby();
    },

    drawMainMenuAuth: function () {
        const authContainer = $('mp-main-auth-container');
        if (!authContainer) return;

        if (this.user) {
            authContainer.innerHTML = `
                <div style="color: rgba(255,255,255,0.9); font-size: 14px; display: flex; align-items: center; gap: 15px;">
                    <span>${TX('Eingeloggt als %s (%s MMR, %s Spiele)', `<b>${escHtml(this.user.username)}</b>`, escHtml(this.user.mmr), escHtml(this.user.gamesPlayed))}</span>
                    <button class="btn small" onclick="MP.showAccountModal()" style="margin:0; padding: 6px 12px; font-size: 13px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); box-shadow: none;">${TX('Account & Admin')}</button>
                    <button class="btn small" onclick="MP.logout()" style="margin:0; padding: 6px 12px; font-size: 13px; background: #c9302c; color: white; border: 1px solid #ac2925; box-shadow: none;">${TX('Abmelden')}</button>
                </div>
            `;
        } else {
            authContainer.innerHTML = `
                <div style="color: rgba(255,255,255,0.9); font-size: 14px; display: flex; align-items: center; gap: 15px;">
                    <span>${TX('Gast')} <span style="opacity:0.7">(${TX('Ranked gesperrt')})</span></span>
                    <button class="btn small" onclick="MP.showAuthModal()" style="margin:0; padding: 6px 12px; font-size: 13px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); box-shadow: none;">${TX('Anmelden')}</button>
                </div>
            `;
        }
    },

    /** The login dialog; `mfa`: only the second factor is missing (after Google/Discord, ?oauth=mfa). */
    showAuthModal: function (mfa) {
        if (typeof modal === 'function') {
            modal(TX('Anmelden'), `<iframe src="/client/index.html?modal=true${mfa ? '&mfa=1' : ''}" style="width:100%; height:75vh; min-height:550px; border:none; background:transparent;"></iframe>`);
            document.getElementById('overlay').classList.add('wide');
        }
    },

    showAccountModal: function () {
        if (typeof modal === 'function') {
            modal(TX('Account Übersicht'), '<iframe src="/client/account.html?modal=true" style="width:100%; height:80vh; min-height:600px; border:none; background:transparent;"></iframe>');
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
          <button class="btn wide primary" style="margin-bottom:10px" onclick="MP.setMode('host')">${TX('Neues Spiel hosten (Server)')}</button>
          ${typeof MATCH !== 'undefined' ? `<button class="btn wide" style="margin-bottom:10px" onclick="MATCH.start()" ${this.user ? '' : 'disabled'}>🔥 ${TX('Gewertetes Spiel suchen')}</button>
          ${this.user ? '' : `<p class="sub" style="margin:-4px 0 10px">${TX('Für gewertete Spiele musst du angemeldet sein.')}</p>`}` : ''}
          <button class="btn wide" onclick="MP.setMode('public-list')">${TX('Öffentliche Lobbys suchen')}</button>
          <button class="btn wide ghost" style="margin-top:10px" onclick="MP.setMode('join')">${TX('Privatem Spiel beitreten')}</button>
        `;
            } else if (mode === 'join') {
                const savedName = localStorage.getItem('mp-name') || TX('Spieler');
                h = `
          <label class="row"><span>${TX('Beitrittscode')}</span><input type="text" id="mp-c" style="width:100px;text-transform:uppercase"></label>
          <label class="row"><span>${TX('Passwort')}</span><input type="number" id="mp-p" style="width:100px"></label>
          <label class="row"><span>${TX('Dein Name')}</span><input type="text" id="mp-n" value="${savedName}"></label>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.join()">${TX('Beitreten')}</button>
          <button class="btn wide ghost" onclick="MP.watch($('mp-c').value.trim(), $('mp-p').value.trim(), $('mp-n').value.trim())">${TX('Zuschauen')}</button>
        `;
            } else if (mode === 'host') {
                const savedName = localStorage.getItem('mp-name') || 'Host';
                h = `
          <label class="row"><span>${TX('Dein Name')}</span><input type="text" id="mp-hn" value="${savedName}"></label>
          <label class="row" style="margin-top:10px"><span>${TX('Öffentlich')}</span><input type="checkbox" id="mp-is-public" checked></label>
          <p class="sub">${TX('Nach dem Hosten kannst du die Zivilisation, deren Fähigkeiten und weitere Einstellungen in der Lobby festlegen.')}</p>
          <button class="btn wide primary" style="margin-top:20px" onclick="MP.host()">${TX('Hosten')}</button>
        `;
            } else if (mode === 'public-list') {
                const savedName = localStorage.getItem('mp-name') || TX('Spieler');
                h = `
          <label class="row" style="margin-bottom:15px"><span>${TX('Dein Name')}</span><input type="text" id="mp-pln" value="${savedName}"></label>
          <h3 style="margin-bottom:10px">${TX('Öffentliche Lobbys')}</h3>
          <div id="mp-pl-container">${TX('Lade...')}</div>
          <button class="btn wide ghost" style="margin-top:20px" onclick="MP.setMode('menu')">${TX('Zurück')}</button>
        `;

                const fetchList = () => {
                    fetch(`${this.serverUrl}/api/public-sessions`)
                        .then(r => r.json())
                        .then(list => {
                            const c = $('mp-pl-container');
                            if (!c) return;
                            if (list.length === 0) {
                                c.innerHTML = `<p class="sub">${TX('Keine öffentlichen Lobbys gefunden.')}</p>`;
                                return;
                            }
                            // lobbies to join, and running games to watch (spectator mode)
                            c.innerHTML = '<table style="width:100%; text-align:left; border-collapse:collapse;">' +
                                list.map(l => {
                                    const running = l.status && l.status !== 'lobby';
                                    const info = running
                                        ? (l.round ? TX('Läuft · Runde %s', escHtml(l.round)) : TX('Läuft')) + (l.spectators ? ` · 👁 ${escHtml(l.spectators)}` : '')
                                        : TX('%s/%s Spieler', escHtml(l.playersCount), escHtml(l.maxPlayers));
                                    const btn = running
                                        ? `<button class="btn small" data-code="${escHtml(l.joinCode)}" data-pw="${escHtml(l.password)}" onclick="MP.watch(this.dataset.code, this.dataset.pw, ($('mp-pln') || {}).value)">${TX('Zuschauen')}</button>`
                                        : `<button class="btn small primary" data-code="${escHtml(l.joinCode)}" data-pw="${escHtml(l.password)}" onclick="MP.joinPublic(this.dataset.code, this.dataset.pw)">${TX('Beitreten')}</button>`;
                                    return `
                                <tr style="border-bottom:1px solid #ccc;">
                                    <td style="padding: 8px 4px;"><b>${escHtml(l.hostName)}</b><br><small>${info}</small></td>
                                    <td style="padding: 8px 4px; text-align:right;">${btn}</td>
                                </tr>`;
                                }).join('') + '</table>';
                        })
                        .catch(() => {
                            const c = $('mp-pl-container');
                            if (c) c.innerHTML = `<p class="sub error">${TX('Fehler beim Laden.')}</p>`;
                        });
                };

                fetchList();
                this._publicListTimer = setInterval(fetchList, 5000);
            } else if (mode === 'watching') {
                // spectator of a live game that has not started yet
                h = `
          <h3>${TX('Du schaust zu')} <span class="sub" style="float:right">${TX('Code')}: <b>${escHtml(this.joinCode)}</b></span></h3>
          <p>${TX('Das Spiel beginnt, sobald der Host es startet – du siehst es dann von Anfang an.')}</p>
          <table style="width:100%; text-align:left; border-collapse:collapse; margin-bottom:15px;">
            ${this.players.map(p => `<tr><td><b>${escHtml(p.name)}</b> ${p.index === this.hostIndex ? `(${TX('Host')})` : ''}</td><td>${p.connected ? TX('Verbunden') : TX('Wartet')}</td></tr>`).join('')}
          </table>
          <button class="btn wide ghost" onclick="location.reload()">${TX('Zuschauen beenden')}</button>
        `;
            } else if (mode === 'waiting') {
                const isHost = this.lobbyIndex === this.hostIndex;
                const cnt = this.lobbyCounts();
                const randomAll = !!this.gameConfig.randomCivs;   // the host deals every nation
                // Marathon (v83): abilities are drafted before the first turn – no choice here
                const isMarathon = this.lobbyLimits().marathon;
                let trs = this.players.map(p => {
                    const isMe = p.index === this.lobbyIndex;
                    const isPlayerHost = p.index === this.hostIndex;
                    const civOpts = randomAll ? `<option value="random" selected>${TX('Zufall (für alle)')}</option>`
                        : '<option value="random" ' + (p.civ === 'random' ? 'selected' : '') + '>' + TX('Zufall') + '</option>' + CIVS.map(c => `<option value="${c.k}" ${p.civ === c.k ? 'selected' : ''}>${c.n}</option>`).join('');
                    const civDef = CIVS.find(c => c.k === (p.civ || 'griechenland'));
                    let abOpts = '';
                    if (p.civ === 'random') {
                        abOpts = `<option value="random" selected>${TX('Zufall')}</option>`;
                    } else if (civDef) {
                        abOpts = '<option value="random" ' + (p.ability === 'random' ? 'selected' : '') + '>' + TX('Zufall') + '</option>' + civDef.abilities.map(a => `<option value="${a.k}" ${p.ability === a.k ? 'selected' : ''}>${a.n}</option>`).join('');
                    }

                    return `
                    <tr>
                        <td><b>${escHtml(p.name)}</b> ${isPlayerHost ? `(${TX('Host')})` : ''} ${p.mmr ? `<span style="font-size:11px; opacity:0.6">[${escHtml(p.mmr)} MMR]</span>` : ''}</td>
                        <td style="padding: 4px;">
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-civ-${p.index}" ${isMe && !randomAll ? '' : 'disabled'} style="${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${civOpts}</select>
                            <br/>
                            <select onchange="MP.updateLobbyPlayer()" id="mp-p-ab-${p.index}" ${isMe && !randomAll ? '' : 'disabled'} style="margin-top: 4px; font-size: 13px; ${isMarathon || randomAll ? 'display:none;' : ''} ${isMe ? '' : 'opacity: 0.5; filter: grayscale(100%);'}">${abOpts}</select>
                            ${isMarathon ? `<small style="display:block; margin-top:4px; font-size:11px; opacity:0.7">${TX('Fähigkeiten: Draft vor dem ersten Zug')}</small>` : ''}
                        </td>
                        <td>${p.connected ? TX('Verbunden') : TX('Wartet')}</td>
                        <td style="text-align:right">${isHost && !isMe ? `<button class="btn small error" onclick="MP.kickPlayer(${p.index})">${TX('Kick')}</button>` : ''}</td>
                    </tr>
                `}).join('');

                h = `
          <h3>${TX('Lobby')} <span class="sub" style="float:right">${TX('Code')}: <b>${this.joinCode}</b> · ${TX('Passwort')}: <b>${this.password}</b></span></h3>
          <table style="width:100%; text-align:left; border-collapse:collapse; margin-bottom:15px;">
            <tr style="border-bottom:1px solid #ccc;opacity:0.7"><th>${TX('Spieler')}</th><th>${TX('Ziv')}</th><th>${TX('Status')}</th><th></th></tr>
            ${trs}
          </table>

          <h4>${TX('Spieleinstellungen')}</h4>
          <div style="background:#f4ebd8; padding:10px; border-radius:4px; margin-bottom:15px; pointer-events:${isHost ? 'all' : 'none'}; opacity:${isHost ? 1 : 0.4}; filter:${isHost ? 'none' : 'grayscale(100%)'}">
              <label class="row"><span>${TX('Karte')}</span>
                <select id="mp-set-map" onchange="MP.updateLobbyConfig()">
                  <option value="0" ${this.gameConfig.mapKey === '0' ? 'selected' : ''}>${TX('Originalkarte (12 × 18)')}</option>
                  <option value="gross" ${this.gameConfig.mapKey === 'gross' ? 'selected' : ''}>${TX('Große Karte (15 × 24)')}</option>
                  <option value="random" ${this.gameConfig.mapKey === 'random' ? 'selected' : ''}>${TX('Plättchenkarte (2–8 Reiche)')}</option>
                  ${typeof marathonMap === 'function' ? `<option value="marathon" ${isMarathon ? 'selected' : ''}>${TX('Marathon (24 × 36)')}</option>` : ''}
                  ${typeof checkCustomMap === 'function' ? `<option value="eigene" ${this.gameConfig.mapKey === 'eigene' ? 'selected' : ''}>${TX('Eigene Karte')}</option>` : ''}
                </select>
              </label>
              ${this.gameConfig.mapKey === 'eigene' ? this.customMapRow(isHost) : ''}
              ${isMarathon ? `<p class="hint" style="margin:4px 0 8px">${TX('Marathon: vier Reiche auf einer neuen Zufallskarte, Technologien kosten je Zeitalter das Zwei- bis Fünffache. Vor dem ersten Zug sehen alle Karte und Starttechnologien und draften je zwei Fähigkeiten (Schlangenreihenfolge, auch fremde). Bots draften nicht.')}</p>` : ''}
              <label class="row"><span>${TX('Mit Ereignissen')}</span>
                <input type="checkbox" id="mp-set-events" onchange="MP.updateLobbyConfig()" ${this.gameConfig.events ? 'checked' : ''}>
              </label>
              ${this.gameConfig.events ? `
              <label class="row"><span>${TX('Ereignisstärke')}</span>
                <select id="mp-set-evmode" onchange="MP.updateLobbyConfig()">
                  <option value="hard" ${this.gameConfig.eventMode === 'hard' ? 'selected' : ''}>${TX('Hart (jede Runde)')}</option>
                  <option value="easy" ${this.gameConfig.eventMode === 'easy' ? 'selected' : ''}>${TX('Leicht (selten)')}</option>
                </select>
              </label>` : ''}
              <label class="row"><span>${TX('Mit Weltwundern')}</span>
                <input type="checkbox" id="mp-set-wonders" onchange="MP.updateLobbyConfig()" ${this.gameConfig.wonders ? 'checked' : ''}>
              </label>
              <label class="row"><span>${TX('Reiche insgesamt')}</span>
                <select id="mp-set-total" onchange="MP.updateLobbyConfig()">
                  ${Array.from({ length: cnt.lim.max - cnt.lim.min + 1 }, (_, i) => cnt.lim.min + i).map(k => `<option value="${k}" ${k === cnt.total ? 'selected' : ''}>${k}${k === 2 ? ` (${TX('1 gegen 1')})` : ''}</option>`).join('')}
                </select>
              </label>
              <label class="row"><span>${TX('davon KI (feste Plätze)')}</span>
                <select id="mp-set-ki" onchange="MP.updateLobbyConfig()">
                  ${Array.from({ length: cnt.total }, (_, k) => `<option value="${k}" ${k === cnt.ki ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </label>
              <p class="hint" style="margin:4px 0 8px">${cnt.humans > cnt.total - cnt.ki
                ? '⚠ ' + TX('%s Spieler in der Lobby – Platz ist für %s Menschen.', cnt.humans, cnt.total - cnt.ki)
                : TX('Bis zu %s Menschen.', cnt.total - cnt.ki) + ' ' + (cnt.total - cnt.humans > 1 ? TX('Beim Start spielt die KI %s Reiche.', cnt.total - cnt.humans)
                    : cnt.total - cnt.humans === 1 ? TX('Beim Start spielt die KI 1 Reich.') : TX('Ohne KI.'))}</p>
              <label class="row"><span>${TX('Zufällige Nationen für alle')}</span>
                <input type="checkbox" id="mp-set-random" onchange="MP.updateLobbyConfig()" ${this.gameConfig.randomCivs ? 'checked' : ''}>
              </label>
              <label class="row"${cnt.total - cnt.humans > 0 ? '' : ' hidden'}><span>${TX('KI-Stufe')}</span>
                <select id="mp-set-diff" onchange="MP.updateLobbyConfig()">
                  ${KI_LEVELS.map(d => `<option value="${d.k}" ${this.kiLevel(this.gameConfig.difficulty) === d.k ? 'selected' : ''}>${d.n}</option>`).join('')}
                </select>
              </label>
              <label class="row"><span>${TX('Zeit pro Zug')}</span>
                <select id="mp-set-turntime" onchange="MP.updateLobbyConfig()">
                  ${this.TURN_TIMES.map(s => `<option value="${s}" ${(this.gameConfig.turnTime || 0) === s ? 'selected' : ''}>${s ? TX('%s Min.', s / 60) : TX('Unbegrenzt')}</option>`).join('')}
                </select>
              </label>
              ${this.gameConfig.turnTime ? `<p class="hint" style="margin:4px 0 8px">${TX('Ist die Zeit um, beendet die KI den Zug. Nach drei verpassten Zügen in Folge spielt sie den Platz weiter, bis der Spieler zurück ist.')}</p>` : ''}
              <label class="row" style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                <span><b>🔥 ${TX('Gewertetes Spiel')}</b> <br><small style="font-size:10px;color:#777">(${TX('min 2 H-Spieler, KI auf schwer')})</small></span>
                <input type="checkbox" id="mp-set-ranked" onchange="MP.updateLobbyConfig()" ${this.gameConfig.ranked ? 'checked' : ''} ${!this.user ? 'disabled' : ''}>
              </label>
          </div>

          ${isHost ? `<button class="btn wide primary" onclick="MP.startGame()">${TX('Spiel starten')}</button>` : ''}
        `;
            }
            modal(TX('Multiplayer'), h);
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
            turnTime: $('mp-set-turntime') ? +$('mp-set-turntime').value : 0,
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
        this.socket.emit('lobby:config', newConfig, res => { if (res && res.error) toast(TXS(res.error)); });
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
        if (confirm(TX('Diesen Spieler unwiderruflich kicken?'))) {
            this.socket.emit('session:kick', { playerIndex });
        }
    },

    join: async function () {
        const joinCode = $('mp-c').value.trim();
        const password = $('mp-p').value.trim();
        const name = $('mp-n').value.trim();
        localStorage.setItem('mp-name', name);

        if (!joinCode || !password) return toast(TX('Bitte Code und Passwort eingeben.'));

        try {
            toast(TX('Verbinde...'));
            const res = await fetch(`${this.serverUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, player: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error ? TXS(data.error) : TX('Fehler beim Beitritt.'));

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
                if (ack.error) return toast(TXS(ack.error));
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;

                this.active = true;
                this.spectator = false;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                this.showCred();

                if (ack.status === 'playing' || ack.status === 'draft') {
                    toast(TX('Spiel läuft, lade Zustand...'));
                }
                else {
                    this.setMode('waiting');
                }
            });
        } catch (e) {
            console.error(e);
            toast(TX('Server nicht erreichbar: %s', e.message));
        }
    },

    /** Spectator mode: watch a live game (or its lobby) with code and password. */
    watch: async function (joinCode, password, name) {
        if (!joinCode || !password) return toast(TX('Bitte Code und Passwort eingeben.'));
        name = (name || localStorage.getItem('mp-name') || TX('Zuschauer')).trim();
        try {
            toast(TX('Verbinde...'));
            const res = await fetch(`${this.serverUrl}/api/sessions/watch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, viewer: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error ? TXS(data.error) : TX('Fehler beim Beitritt.'));
            this.sessionId = data.sessionId;
            this.joinCode = joinCode.toUpperCase();
            this.password = password;
            await this.connect();
            this.socket.emit('session:connect', { sessionId: this.sessionId, clientId: this.getClientId(), password }, ack => {
                if (ack.error) return toast(TXS(ack.error));
                this.enterSession(ack);
            });
        } catch (e) {
            console.error(e);
            toast(TX('Server nicht erreichbar: %s', e.message));
        }
    },
    /** After session:connect: take over the lobby state (players, settings, host, our seat or spectator). */
    enterSession: function (ack) {
        this.active = true;
        this.spectator = !!ack.spectator;
        this.lobbyIndex = this.spectator ? null : ack.playerIndex;
        if (this.spectator) this.playerIndex = -1;
        this.players = ack.players;
        this.gameConfig = ack.gameConfig || {};
        this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;
        this.spectatorCount = ack.spectators || 0;
        this.showCred();
        if (ack.status === 'lobby') this.setMode(this.spectator ? 'watching' : 'waiting');
        else toast(TX('Spiel läuft, lade Zustand...'));
    },

    joinPublic: async function (joinCode, password) {
        const nameInput = $('mp-pln');
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) return toast(TX('Bitte Namen eingeben.'));

        localStorage.setItem('mp-name', name);

        try {
            toast(TX('Verbinde...'));
            const res = await fetch(`${this.serverUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ joinCode, password, player: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error ? TXS(data.error) : TX('Fehler beim Beitritt.'));

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
                if (ack.error) return toast(TXS(ack.error));
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;

                this.active = true;
                this.spectator = false;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || {};
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                this.showCred();

                if (ack.status === 'playing' || ack.status === 'draft') {
                    toast(TX('Spiel läuft, lade Zustand...'));
                }
                else {
                    this.setMode('waiting');
                }
            });
        } catch (e) {
            console.error(e);
            toast(TX('Server nicht erreichbar: %s', e.message));
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
            toast(TX('Erstelle Sitzung...'));
            const res = await fetch(`${this.serverUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, host: { name, clientId: this.getClientId() } })
            });
            const data = await res.json();
            if (!res.ok) return toast(data.error ? TXS(data.error) : TX('Fehler beim Hosten.'));

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
                if (ack.error) return toast(TXS(ack.error));
                if (ack.playerIndex !== undefined) this.lobbyIndex = ack.playerIndex;
                this.active = true;
                this.spectator = false;
                this.players = ack.players;
                this.gameConfig = ack.gameConfig || config;
                this.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;

                this.showCred();

                this.setMode('waiting');
            });
        } catch (e) {
            console.error(e);
            toast(TX('Server nicht erreichbar: %s', e.message));
        }
    },

    startGame: function () {
        this.socket.emit('game:start', {}, (ack) => {
            if (ack.error) toast(TXS(ack.error));
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
        btn.id = 'mp-live-btn';
        btn.textContent = TX('Multiplayer');
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
            mVersion.parentNode.appendChild(footer);
            MP.drawLegalFooter();
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
        /* collapsed panels (player list, chat in client/chat.js): a labelled pill */
        .mp-log-minimized::before { color: #fff; font-weight: bold; font-size: 13px; white-space: nowrap; }
        #mp-players-container {
            position: fixed; left: 10px; top: 60px; width: 240px;
            background: rgba(255,255,240,0.95); pointer-events: auto;
            border: 2px solid #a89f91; border-radius: 6px; z-index: 29;   /* above map, bar and sheet (≤ 26), below the game's dialogs (30) */
            box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 13px; color: #333; overflow: hidden;
            transition: width 0.2s, height 0.2s, border-radius 0.2s;
        }
        #mp-players-container.mp-log-minimized {
            width: auto !important; height: 34px !important; border-radius: 17px !important; padding: 0 12px !important;
            border: none !important; background: #a89f91 !important; cursor: pointer !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
        }
        #mp-players-container.mp-log-minimized > * { display: none !important; }
        #mp-players-container.mp-log-minimized::before { content: "👥 " var(--mp-lbl-players, "Spieler"); }
        #mp-players-container[style*="display: none"] { display: none !important; }
        #mp-players-header {
            background:#a89f91; color:white; padding:6px 10px; cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; align-items:center; user-select:none;
        }
        #mp-players-content { max-height: 40vh; overflow-y: auto; padding: 6px 8px; }
        .mp-pl-row { display: grid; grid-template-columns: 12px 1fr auto; gap: 0 8px; align-items: center; padding: 4px 4px; border-radius: 4px; }
        .mp-pl-row.cur { background: rgba(157,59,47,0.12); }
        .mp-pl-row.cur .mp-pl-name::after { content: var(--mp-on-turn, " ◂ am Zug"); font-size: 11px; color: #9d3b2f; font-weight: normal; }
        .mp-pl-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.25); }
        .mp-pl-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
        .mp-pl-civ { grid-column: 2 / -1; font-size: 11px; color: #6f6551; }
        .mp-pl-tag { font-size: 10px; padding: 1px 5px; border-radius: 8px; background: #e4dbbe; color: #6f6551; }
        .mp-pl-tag.off { background: #f1d6cf; color: #9d3b2f; }
        /* Turn timer: countdown in the HUD, banner while the KI plays an absent player's seat */
        #mp-turn-clock { font-family: monospace; font-weight: bold; padding: 4px 10px; margin-left: 6px; }
        #mp-cred-wrapper { min-width: 0; }
        #mp-cred-wrapper .res { white-space: nowrap; }
        @media (max-width: 1000px) {
            .mp-cred-lbl { display: none; }
            #mp-cred-box { font-size: 13px !important; }
            #mp-cred-wrapper .res { padding: 4px 6px !important; }
        }
        #mp-turn-clock.mp-clock-low { background: #9d3b2f; color: #fff; }
        #mp-afk-banner {
            position: fixed; top: 52px; left: 50%; transform: translateX(-50%); z-index: 1001;
            background: #fffbe8; color: #333; border: 2px solid #9d3b2f; border-radius: 6px;
            padding: 8px 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; gap: 10px; align-items: center;
            /* % of the body: the game turns the body on phones held upright (html.turn) */
            width: max-content; max-width: calc(100% - 32px); box-sizing: border-box; font-size: 14px;
        }
        #mp-afk-banner[hidden] { display: none; }
        /* "Since your last turn" */
        #mp-summary-btn { cursor: pointer; margin-left: 6px; padding: 4px 8px; font-size: 15px; border: none; }
        #mp-summary-btn[hidden] { display: none; }
        .mp-sum-alerts { padding-left: 18px; margin: 6px 0 10px; }
        .mp-sum-alerts li { margin: 3px 0; }
        .mp-sum-table td, .mp-sum-table th { white-space: nowrap; }
        .mp-sum-num { text-align: right; font-variant-numeric: tabular-nums; }
        .mp-sum-me td { font-weight: 700; }
        .mp-sum-up { color: #2e6b34; font-size: 12px; }
        .mp-sum-down { color: #9d3b2f; font-size: 12px; }
        .mp-sum-log { margin: 10px 0; }
        .mp-sum-log > div { max-height: 40vh; overflow-y: auto; font-size: 13px; }
        .mp-sum-auto { margin: 8px 0; }
        #mp-afk-banner .btn { width: auto; margin: 0; white-space: nowrap; flex: 0 0 auto; }
    `;
    document.head.appendChild(style);

    // Player list: collapsible to a pill, names open the player profile
    const pList = document.createElement('div');
    pList.id = 'mp-players-container';
    pList.style.display = 'none';
    pList.innerHTML = `
        <div id="mp-players-header">
            <span id="mp-players-title">${TX('Spieler')}</span>
            <span style="font-size: 16px;">✖</span>
        </div>
        <div id="mp-players-content"></div>
    `;
    document.body.appendChild(pList);
    const setPlayersOpen = open => {
        pList.classList.toggle('mp-log-minimized', !open);
        if (open) MP.fitPanels(pList);
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
    waitToast.textContent = TX('Warte auf deinen Zug...');
    document.body.appendChild(waitToast);

    // Inject Credentials Box into Game Screen HUD Bar
    const headerHud = document.querySelector('.hud');
    if (headerHud && !$('mp-cred-wrapper')) {
        const wrap = document.createElement('div');
        wrap.id = 'mp-cred-wrapper';
        wrap.style.cssText = 'flex-grow: 1; display: flex; justify-content: center; align-items: center;';
        wrap.innerHTML = `
          <span class="res" style="cursor:text; user-select:text; padding: 4px 10px;" title="${TX('Lobby Zugangsdaten')}">
            <i style="font-style:normal; margin-right:4px;">🌐</i> 
            <b id="mp-cred-box" style="font-family:monospace; font-size:14px;"></b>
          </span>
          <span class="res" id="mp-turn-clock" title="${TX('Zeit für diesen Zug')}" hidden></span>
          <button type="button" class="res" id="mp-summary-btn" title="${TX('Seit deinem letzten Zug')}" hidden onclick="event.stopPropagation(); MP.showSummary()">📋</button>
        `;
        headerHud.insertBefore(wrap, document.querySelector('.hud-res'));
    }

    // Turn timer: shown while the KI plays our seat because we missed our turns
    const afk = document.createElement('div');
    afk.id = 'mp-afk-banner';
    afk.hidden = true;
    afk.innerHTML = `<span id="mp-afk-text">${TX('Die KI spielt für dich, weil du dreimal nicht gezogen hast.')}</span>
        <button class="btn small primary" id="mp-afk-btn" onclick="MP.reclaimSeat()">${TX('Ich bin zurück')}</button>`;
    document.body.appendChild(afk);
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

// ── Monkey Patch closeModal(): after "since your last turn", the turn goes on ──
// The popup comes before the game's turn-start dialogs (food, free pick …). However it is
// closed – "Weiter", ✕ or a tap beside it – those follow.
const originalCloseModal = window.closeModal;
if (originalCloseModal) {
    window.closeModal = function () {
        const r = originalCloseModal.apply(this, arguments);
        const after = MP._afterSummary;
        if (after) { MP._afterSummary = null; setTimeout(after, 0); }
        return r;
    };
}

// ── Monkey Patch saveGame(): the local single-player save is not ours ──────────
// The game saves S as its local game ('hochciv.save') on every redraw. A multiplayer game (live,
// Rundenspiel, watching, replay) would overwrite the player's own local game with it – and
// "Weiterspielen" in the menu would then open the multiplayer state as a local game.
const originalSaveGame = window.saveGame;
if (originalSaveGame) {
    window.saveGame = function () {
        if (MP.active) return;
        return originalSaveGame.apply(this, arguments);
    };
}

// ── Monkey Patch gameOver(): player names (with profile links) under the engine's result ──
const originalGameOver = window.gameOver;
if (originalGameOver) {
    window.gameOver = function () {
        const r = originalGameOver.apply(this, arguments);
        if (MP.active) {
            // "Zurück zum Menü" deletes the local game ('hochciv.save') – here it only leaves
            const menu = $('go-menu');
            if (menu) menu.onclick = () => { location.href = location.pathname; };
            MP.addGameOverPlayers();
            MP.addRematch();
            if (MP.lastStats && typeof STATS !== 'undefined') STATS.addToEndScreen(MP.lastStats);
            if (MP.lastRecord && typeof REPLAY !== 'undefined') REPLAY.addToEndScreen(MP.lastRecord);
            MP.updatePlayerList();
            MP.setTurnClock(null);
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
            if (MP.isMyTurn()) return humanTurnStart();
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
        if (MP.active && typeof S !== 'undefined' && S && !S.over && !MP.isMyTurn()) {
            MP.syncTurnBlocker();
            return redraw();
        }
        // "Since your last turn" pops up first; the game's turn-start dialogs follow when it closes
        const self = this, args = arguments;
        if (MP.active && MP.summaryBeforeTurn(() => originalHumanTurnStart.apply(self, args))) return redraw();
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
                note.innerHTML += ' ' + TX('Das Spiel startet …');
            } else if (mine) {
                note.innerHTML = `<b>${TX('Du bist dran!')}</b> ` + note.innerHTML;
            } else {
                const seat = MP.players.find(x => x.index === draftState.V.players[cur].slot);
                note.innerHTML = TX('Warte auf %s …', `<b>${seat ? escHtml(seat.name) : TX('andere Spieler')}</b>`) + ' ' + note.innerHTML;
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
            if (D.order[D.at] !== MP.draftMine()) return toast(TX('Du bist nicht am Zug!'));
            $('dr-pool').querySelectorAll('[data-ab]').forEach(b => { b.disabled = true; });
            const done = res => { if (res && res.error) { toast(TXS(res.error)); drawDraft(); } };
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
// Spectators (playerIndex -1) see the screens of the player on turn, as in a local game.
if (typeof viewerHook !== 'undefined') viewerHook = () => (MP.active && Number.isInteger(MP.playerIndex) && MP.playerIndex >= 0 ? MP.playerIndex : null);
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
        // Only actions on the live state go to the server. The game also runs them on throwaway
        // copies to plan (growAllPlan prices "Alle Städte wachsen" when Fähigkeiten opens) –
        // sending those made every city grow just by opening the sheet.
        if (MP.active && state === S) {
            if (MP.spectator) return TX('Du schaust nur zu.');
            const pi = fnName === 'moveArmy' ? args[0].owner : args[0];
            if (pi !== MP.playerIndex) return TX('Du bist nicht am Zug (oder nicht deine Armee).');

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
                if (MP.spectator) return toast(TX('Du schaust nur zu.'));
                if (!MP.isMyTurn()) return toast(TX('Du bist nicht am Zug!'));
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
                    return toast(warn[0] + ' ' + TX('Nochmal tippen zum Bestätigen.'));
                }
                ui.confirmedEnd = false; ui.army = null; ui.sel = null; ui.mode = null;
                closeSheet();

                MP.sendAction({ type: 'endTurn' }, res => {
                    if (res && res.error && !MP.asyncId) toast(TXS(res.error));
                });
                toast(TX('Warte auf Server...'));
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
        if (!res.ok) throw new Error(data.error ? TXS(data.error) : TX('Fehler'));
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
            if (MAPACCOUNT.userId) MAPACCOUNT.upload(map).catch(e => toast(TX('Konto: %s', e.message)));
        },
        deleted: name => {
            const row = MAPACCOUNT.rows[name];
            if (!MAPACCOUNT.userId || !row) return;
            delete MAPACCOUNT.rows[name];
            MAPACCOUNT.markSynced(name, false);
            MAPACCOUNT.api('/' + row.id, 'DELETE').catch(e => toast(TX('Konto: %s', e.message)));
        },
        publish: async name => {
            if (!MAPACCOUNT.userId) throw new Error(TX('Zum Veröffentlichen musst du angemeldet sein.'));
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
        if (k === 'eigene') return TX('Eigene Karte „%s"', this.esc((c && c.customMapName) || '?'));
        return ({ '0': TX('Originalkarte'), gross: TX('Große Karte'), plaettchen: TX('Plättchenkarte'), marathon: TX('Marathon') })[k] || k;
    },
    seatsHtml: function (seats, mySlot) {
        return `<div class="mpa-seats">${seats.map(s => {
            const who = s.kind === 'bot' ? TX('Bot') : s.replaced ? TX('KI (für %s)', this.esc(s.name)) : s.kind === 'ki' ? TX('KI')
                : s.name ? this.esc(s.name) : `<i>${TX('frei')}</i>`;
            return `<span class="mpa-seat${s.slot === mySlot ? ' me' : ''}">${s.civ ? this.civLabel(s.civ) : '?'}${s.roman ? ' ' + s.roman : ''}: ${who}</span>`;
        }).join('')}</div>`;
    },

    api: async function (path, body) {
        const res = await fetch(`${MP.serverUrl}/api/async${path}`, body
            ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }
            : { cache: 'no-cache', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ? TXS(data.error) : TX('Fehler'));
        return data;
    },

    requireLogin: async function () {
        await MP.fetchUser();
        if (MP.user) return true;
        toast(TX('Rundenspiele gibt es nur mit Anmeldung.'));
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
        this.badgeCount = n;
        this.drawBadge();
    },
    drawBadge: function () {
        const btn = $('mp-async-btn'), n = this.badgeCount || 0;
        if (btn) btn.innerHTML = TX('Rundenspiele') + (n ? ` <span class="mpa-badge">${n}</span>` : '');
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
        modal(TX('Rundenspiele'), `
            <div class="mpa-top">
              <button class="btn primary" onclick="ASYNC.showCreate()">${TX('Neues Rundenspiel')}</button>
              <span class="mpa-code"><input id="mpa-code" placeholder="${TX('Code')}" maxlength="8">
              <button class="btn small" onclick="ASYNC.joinByCode()">${TX('Beitreten')}</button></span>
            </div>
            <p class="sub">${TX('Gespielt wird nacheinander, ohne dass die anderen online sein müssen. Wer %s Tage nicht zieht, wird von der KI ersetzt (gewertet: −15 MMR).', d.timeoutDays)}</p>
            ${section(TX('Du bist am Zug'), turn, TX('Gerade nirgends.'))}
            ${section(TX('Warten auf andere'), waiting, TX('Keine.'))}
            ${section(TX('Einladungen'), d.invites, TX('Keine offenen Einladungen.'))}
            ${section(TX('Offene Spiele'), d.open, TX('Keine öffentlichen Spiele mit freiem Platz.'))}
            ${(d.watch || []).length ? section(TX('Laufende öffentliche Spiele – zuschauen'), d.watch, '') : ''}
            ${takenOver.length ? section(TX('Von der KI übernommen'), takenOver.slice(0, 15), '') : ''}
            <p class="sub">${TX('Beendete Rundenspiele findest du in deiner %s.', `<a href="#" onclick="MP.showAccountModal(); return false;">${TX('Spielhistorie')}</a>`)}</p>
            <label class="row mpa-notify"><span>${TX('E-Mail, wenn ich am Zug bin')}</span>
              <input type="checkbox" ${d.notifyEmail ? 'checked' : ''} onchange="ASYNC.setNotify(this.checked)"></label>
            ${/HochcivApp\//.test(navigator.userAgent) ? `<label class="row"><span>${TX('Push-Nachricht, wenn ich am Zug bin')}</span>
              <input type="checkbox" ${d.notifyPush ? 'checked' : ''} onchange="ASYNC.setPush(this.checked)"></label>` : ''}`);
        $('overlay').classList.add('wide');
        this.refreshBadge();
    },

    row: function (g) {
        const c = g.config;
        const statusText = {
            setup: TX('Sucht Mitspieler (%s/%s)', g.seats.filter(s => s.userId).length, c.humanCount),
            placement: TX('Startplättchen legen'), draft: TX('Fähigkeiten draften'),
            playing: TX('Runde %s', g.round), finished: TX('Beendet'), cancelled: TX('Abgebrochen'),
        }[g.status] || g.status;
        const days = g.deadline ? Math.max(0, Math.ceil((g.deadline - Date.now()) / 864e5)) : null;
        let info = '';
        if (g.yourTurn) info = `<span class="mpa-badge">${TX('Du bist am Zug')}</span>` + (days != null ? ' ' + TX('noch %s Tag(e)', days) : '');
        else if (g.status === 'finished') info = TX('Gewonnen: %s', (g.winners || []).map(this.esc).join(', ') || '—');
        else if (g.replaced) info = TX('Von der KI übernommen');
        else if (g.waitingFor) info = TX('Wartet auf %s', this.esc(TXS(g.waitingFor)));
        const member = g.mySlot != null;
        const btns = [];
        if (member) btns.push(`<button class="btn small primary" onclick="ASYNC.open('${g.id}')">${TX('Öffnen')}</button>`);
        else if (g.status === 'playing' && !g.freeSeats.length) btns.push(`<button class="btn small" onclick="ASYNC.open('${g.id}')">${TX('Zuschauen')}</button>`);
        else btns.push(`<button class="btn small primary" onclick="ASYNC.showJoin('${g.id}')">${TX('Beitreten')}</button>`);
        if (g.invited && !member) btns.push(`<button class="btn small ghost" onclick="ASYNC.decline('${g.id}')">${TX('Ablehnen')}</button>`);
        if (member && g.freeSeats.length) btns.push(`<button class="btn small ghost" onclick="ASYNC.showInvite('${g.id}', '${g.joinCode}')">${TX('Einladen')}</button>`);
        return `<div class="mpa-row${g.yourTurn ? ' turn' : ''}">
            <div class="mpa-title"><b>${this.mapName(c.mapKey, c)}</b> · ${c.civMode === 'random' ? TX('Zufallsnationen') : TX('Feste Nationen')}${c.ranked ? ' · 🔥 ' + TX('Gewertet') : ''}${c.isPublic ? ' · ' + TX('öffentlich') : ''} · ${statusText}
              <small class="mpa-c">${g.engine ? this.esc(g.engine) : ''}${member ? `${g.engine ? ' · ' : ''}${TX('Code')} ${g.joinCode}` : ''}</small></div>
            ${this.seatsHtml(g.seats, g.mySlot)}
            <div class="mpa-foot"><span>${info}</span><span>${btns.join(' ')}</span></div></div>`;
    },

    setNotify: function (on) {
        this.api('/notify', { email: on }).then(() => toast(on ? TX('E-Mails an.') : TX('E-Mails aus.'))).catch(e => toast(e.message));
    },

    /** Push notifications of the Android app (the switch is only shown there). */
    setPush: function (on) {
        fetch(`${MP.serverUrl}/api/push/notify`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
        }).then(r => r.ok ? toast(on ? TX('Push-Nachrichten an.') : TX('Push-Nachrichten aus.')) : Promise.reject(new Error(TX('Speichern fehlgeschlagen'))))
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
            hint = marathon ? TX('Erst wenn alle beigetreten sind, wird gedraftet – dann beginnt die Partie mit deinem Zug.')
                : TX('Erst wenn alle beigetreten sind, legt jeder sein Startplättchen – dann beginnt die Partie mit deinem Zug.');
        else if (atOnce) hint = random ? TX('Du spielst sofort deinen ersten Zug. Wer beitritt, bekommt den nächsten Platz in der Zugfolge.')
            : TX('Du spielst sofort deinen ersten Zug. Kommt eine Nation an die Reihe, die noch niemand gewählt hat, wartet das Spiel auf sie.');
        else hint = TX('Die Partie beginnt mit deinem Zug, sobald alle Mitspieler beigetreten sind.');
        hint = (f.kiCount ? TX('%s Reiche: %s Menschen, %s KI', f.playerCount, humans, f.kiCount) : TX('%s Reiche: %s Menschen, keine KI', f.playerCount, humans))
            + (f.playerCount === 2 ? ' – ' + TX('1 gegen 1 (höhere Siegschwellen)') : '') + '. ' + hint;
        const hardest = KI_LEVELS[KI_LEVELS.length - 1].k;
        modal(TX('Neues Rundenspiel'), `
          <div class="mpa-form" onchange="ASYNC.readForm(true)">
            <label class="row"><span>${TX('Karte')}</span><select id="mpa-map">
              ${opt('0', f.mapKey, TX('Originalkarte (12 × 18)'))}${opt('gross', f.mapKey, TX('Große Karte (15 × 24)'))}
              ${opt('plaettchen', f.mapKey, TX('Plättchenkarte (2–8 Reiche)'))}
              ${typeof marathonMap === 'function' ? opt('marathon', f.mapKey, TX('Marathon (24 × 36, 4 Reiche)')) : ''}
              ${typeof checkCustomMap === 'function' ? opt('eigene', f.mapKey, TX('Eigene Karte')) : ''}</select></label>
            ${f.mapKey === 'eigene' ? `<label class="row"><span>${TX('Meine Karten')}</span><select id="mpa-custom">
              ${myMaps.map(m => `<option value="${this.esc(m.name)}" ${m.name === f.customName ? 'selected' : ''}>${this.esc(m.name)} (${m.marathon ? TX('bis %s Reiche, Marathon', m.maxPlayers || 4) : TX('bis %s Reiche', m.maxPlayers || 4)})</option>`).join('') || `<option value="">${TX('– keine gespeichert –')}</option>`}</select></label>
              <p class="sub"><a href="#" onclick="ASYNC.customMapByCode(); return false">${TX('Karte mit Code laden')}</a> ·
                <a href="#" onclick="ASYNC.importCustomMap(); return false">${TX('aus Datei laden')}</a> – ${TX('eigene Karten baust du im Karteneditor (Hauptmenü).')}</p>` : ''}
            <label class="row"><span>${TX('Nationen')}</span><select id="mpa-mode">
              ${opt('fixed', f.civMode, TX('Fest – jeder wählt seine Nation'))}${opt('random', f.civMode, TX('Zufällige Nationen für alle – Zugfolge nach Beitritt'))}</select></label>
            <label class="row"><span>${TX('Reiche insgesamt')}</span><select id="mpa-total" ${lim.min === lim.max ? 'disabled' : ''}>
              ${Array.from({ length: lim.max - lim.min + 1 }, (_, i) => lim.min + i).map(n => opt(n, f.playerCount, n + (n === 2 ? ` (${TX('1 gegen 1')})` : ''))).join('')}</select></label>
            <label class="row"><span>${TX('davon KI')}</span><select id="mpa-ki">
              ${Array.from({ length: f.playerCount - 1 }, (_, k) => k).map(k => opt(k, f.kiCount, k + (k === 0 ? ` (${TX('nur Menschen')})` : ''))).join('')}</select></label>
            ${random ? '' : `<label class="row"><span>${TX('Deine Nation')}</span><select id="mpa-civ">
              ${CIVS.map(c => opt(c.k, f.civ, c.n)).join('')}</select></label>`}
            ${random || marathon ? '' : `<label class="row"><span>${TX('Fähigkeit')}</span><select id="mpa-ab">
              ${opt('random', f.ability, TX('Zufall'))}${civ.abilities.map(a => opt(a.k, f.ability, a.n)).join('')}</select></label>`}
            <label class="row"><span>${TX('Mit Ereignissen')}</span><input type="checkbox" id="mpa-events" ${f.events ? 'checked' : ''}></label>
            ${f.events ? `<label class="row"><span>${TX('Ereignisstärke')}</span><select id="mpa-evmode">
              ${opt('hard', f.eventMode, TX('Hart (jede Runde)'))}${opt('easy', f.eventMode, TX('Leicht (selten)'))}</select></label>` : ''}
            <label class="row"><span>${TX('Mit Weltwundern')}</span><input type="checkbox" id="mpa-wonders" ${f.wonders ? 'checked' : ''}></label>
            <label class="row"${noKi ? ' hidden' : ''}><span>${TX('KI-Stufe')}</span><select id="mpa-diff" ${f.ranked ? 'disabled' : ''}>
              ${KI_LEVELS.map(d => opt(d.k, f.ranked ? hardest : f.difficulty, d.n)).join('')}</select></label>
            <label class="row"><span>🔥 ${TX('Gewertet')} <small>(${TX('KI auf schwerster Stufe')})</small></span><input type="checkbox" id="mpa-ranked" ${f.ranked ? 'checked' : ''}></label>
            <label class="row"><span>${TX('Öffentlich auffindbar')}</span><input type="checkbox" id="mpa-public" ${f.isPublic ? 'checked' : ''}></label>
            <label class="row"><span>${TX('Einladen')} <small>(${TX('Benutzernamen, mit Komma')})</small></span><input type="text" id="mpa-invite" value="${this.esc(f.invite)}"></label>
          </div>
          <p class="sub">${hint}</p>
          <button class="btn wide primary" onclick="ASYNC.create()">${TX('Erstellen')}</button>
          <button class="btn wide ghost" onclick="ASYNC.showList()">${TX('Zurück')}</button>`);
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
        return `${TX('%s Reiche', total)} · ${TX('%s Menschen', c.humanCount)} · ${ki ? TX('%s KI', ki) : TX('ohne KI')}`;
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
        if (f.mapKey === 'eigene' && !customMap) return toast(TX('Wähle eine eigene Karte oder lade eine aus einer Datei.'));
        try {
            toast(TX('Erstelle Rundenspiel…'));
            const r = await this.api('', {
                config: {
                    mapKey: f.mapKey, civMode: f.civMode, playerCount: f.playerCount, kiCount: f.kiCount, events: f.events, eventMode: f.eventMode,
                    wonders: f.wonders, difficulty: f.difficulty, ranked: f.ranked, isPublic: f.isPublic,
                    customMap,
                },
                civ: f.civ, ability: f.ability,
                invite: f.invite.split(',').map(x => x.trim()).filter(Boolean),
            });
            if (r.inviteErrors && r.inviteErrors.length) toast(r.inviteErrors.map(TXS).join(' '));
            this.open(r.id);
        } catch (e) { toast(e.message); }
    },

    // ── Join / invite / decline ──────────────────────────────────────────────
    joinByCode: async function () {
        const code = ($('mpa-code') && $('mpa-code').value || '').trim().toUpperCase();
        if (!code) return toast(TX('Bitte einen Code eingeben.'));
        try {
            const g = await this.api('/code/' + encodeURIComponent(code));
            if (g.mySlot != null) return this.open(g.id);
            this.showJoin(g.id, code, g);
        } catch (e) { toast(e.message); }
    },

    showJoin: async function (id, code, g) {
        try { g = g || await this.api('/' + id + (code ? '?code=' + encodeURIComponent(code) : '')); }
        catch (e) { return toast(e.message); }
        if (!g.freeSeats.length) return toast(TX('Kein Platz mehr frei.'));
        this.joining = { id, code };
        const c = g.config;
        let pickHtml;
        if (c.civMode === 'random') {
            const s = g.seats[g.freeSeats[0].slot];
            const ab = (this.civ(s.civ) || { abilities: [] }).abilities.find(a => a.k === s.ability);
            pickHtml = `<p>${ab && c.mapKey !== 'marathon' ? TX('Du bekommst den nächsten Platz in der Zugfolge: %s mit „%s".', `<b>${this.civLabel(s.civ)}</b>`, this.esc(ab.n))
                : TX('Du bekommst den nächsten Platz in der Zugfolge: %s.', `<b>${this.civLabel(s.civ)}</b>`)}</p>`;
        } else {
            const civs = [...new Set(g.freeSeats.map(s => s.civ))];
            pickHtml = `<label class="row"><span>${TX('Nation')}</span><select id="mpa-jciv" onchange="ASYNC.joinAbilities()">
                ${civs.map(k => `<option value="${k}">${this.esc((this.civ(k) || {}).n || k)}</option>`).join('')}</select></label>
              ${c.mapKey === 'marathon' ? `<p class="sub">${TX('Fähigkeiten werden vor dem ersten Zug gedraftet.')}</p>`
                : `<label class="row"><span>${TX('Fähigkeit')}</span><select id="mpa-jab"></select></label>`}`;
        }
        modal(TX('Rundenspiel beitreten'), `
            <p><b>${this.mapName(c.mapKey, c)}</b> · ${ASYNC.countText(c)}${c.ranked ? ' · 🔥 ' + TX('Gewertet') : ''}${g.engine ? ' · ' + this.esc(g.engine) : ''}</p>
            ${this.seatsHtml(g.seats, null)}
            ${pickHtml}
            <p class="sub">${TX('Du kannst sofort beitreten – ziehen kannst du, sobald du an der Reihe bist. Bis zu deinem ersten Zug kannst du ohne Folgen wieder aussteigen.')}</p>
            <button class="btn wide primary" onclick="ASYNC.join()">${TX('Beitreten')}</button>
            <button class="btn wide ghost" onclick="ASYNC.showList()">${TX('Zurück')}</button>`);
        this.joinAbilities();
    },

    joinAbilities: function () {
        const sel = $('mpa-jab'), civ = $('mpa-jciv') && this.civ($('mpa-jciv').value);
        if (!sel || !civ) return;
        sel.innerHTML = `<option value="random">${TX('Zufall')}</option>` +
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
        modal(TX('Mitspieler einladen'), `
            <p>${TX('Code zum Weitergeben:')} <b style="font-family:monospace;font-size:16px">${code}</b></p>
            <p class="sub">${TX('Oder Link:')} <span style="user-select:all">${this.esc(location.origin + location.pathname + '?async=' + id)}</span></p>
            <label class="row"><span>${TX('Benutzername')}</span><input type="text" id="mpa-inv-name"></label>
            <button class="btn wide primary" onclick="ASYNC.invite('${id}')">${TX('Einladen')}</button>
            <button class="btn wide ghost" onclick="${back}">${TX('Zurück')}</button>`);
    },

    reopenModal: function () {
        if (this.view && ['setup', 'placement'].includes(this.view.status)) this.apply(this.view);
        else closeModal();
    },

    invite: async function (id) {
        const name = ($('mpa-inv-name') && $('mpa-inv-name').value || '').trim();
        if (!name) return toast(TX('Bitte einen Benutzernamen eingeben.'));
        try { await this.api(`/${id}/invite`, { username: name }); toast(TX('%s ist eingeladen.', name)); $('mpa-inv-name').value = ''; }
        catch (e) { toast(e.message); }
    },

    leave: async function (id) {
        if (!confirm(TX('Dieses Rundenspiel verlassen?'))) return;
        try { await this.api(`/${id}/leave`, {}); this.close(); show('screen-menu'); this.showList(); } catch (e) { toast(e.message); }
    },

    cancel: async function (id) {
        if (!confirm(TX('Dieses Rundenspiel für alle abbrechen?'))) return;
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
            if (!res || res.error) return toast(res && res.error ? TXS(res.error) : TX('Fehler'));
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
        MP.spectator = view.mySlot == null;          // a public game opened to watch
        MP.sessionId = null;
        MP.renderLobby = null;
        MP.lobbyIndex = view.mySlot;
        MP.lastTurnKey = null;
        this.view = null;
        this.placing = false;
        const credBox = $('mp-cred-box');
        if (credBox) credBox.textContent = view.mySlot == null ? `👁 ${TX('Zuschauer')} · ${TX('Liste')}` : TX('Rundenspiel %s · Liste', view.joinCode);
        this.apply(view);
    },

    /** Leave the game view (the game itself goes on). */
    close: function () {
        if (MP.socket && MP.asyncId) MP.socket.emit('async:close', {});
        MP.asyncId = null;
        MP.active = false;
        MP.spectator = false;
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
        MP.lastStats = view.stats || null;            // a finished game: its statistics (client/stats.js)
        MP.lastRecord = view.record || null;          // … and its stored match with the replay (client/replay.js)
        MP.players = view.seats.map(s => ({ index: s.slot, name: s.name, civ: s.civ, userId: s.replaced ? null : s.userId, isBot: s.kind === 'bot' || (s.kind === 'ki' && !s.replaced) }));
        const toastEl = document.querySelector('.mp-waiting-toast');
        if (toastEl) toastEl.textContent = MP.spectator ? TX('Du schaust zu') : view.waitingFor ? TX('Warte auf %s …', TXS(view.waitingFor)) : TX('Warte auf deinen Zug...');

        if (view.status === 'cancelled') {
            toast(TX('Das Rundenspiel wurde abgebrochen.'));
            this.close(); show('screen-menu'); return this.showList();
        }
        if (view.status === 'setup') return this.waitingModal(view, TX('Das Spiel beginnt, sobald alle beigetreten sind.'));
        if (view.status === 'placement') {
            if (view.placement.placed) {
                this.placing = false;
                return this.waitingModal(view, TX('Dein Startplättchen liegt. Aufgedeckt wird, wenn alle gelegt haben.'));
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
        MP.takeSummary(view.summary);                 // "since your last turn" – needs our index
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
        modal(TX('Rundenspiel'), `
            <p><b>${this.mapName(c.mapKey, c)}</b> · ${c.civMode === 'random' ? TX('Zufallsnationen') : TX('Feste Nationen')} · ${ASYNC.countText(c)}${c.ranked ? ' · 🔥 ' + TX('Gewertet') : ''}${view.engine ? ' · ' + this.esc(view.engine) : ''}</p>
            ${this.seatsHtml(view.seats, view.mySlot)}
            <p>${text}</p>
            ${view.waitingFor ? `<p class="sub">${TX('Wartet auf: %s', this.esc(TXS(view.waitingFor)))}</p>` : ''}
            ${view.freeSeats.length ? `<button class="btn wide" onclick="ASYNC.showInvite('${view.id}', '${view.joinCode}')">${TX('Mitspieler einladen (Code %s)', view.joinCode)}</button>` : ''}
            <button class="btn wide primary" onclick="ASYNC.close(); show('screen-menu'); ASYNC.showList()">${TX('Zur Liste')}</button>
            ${view.status === 'setup' && host ? `<button class="btn wide ghost" onclick="ASYNC.cancel('${view.id}')">${TX('Spiel abbrechen')}</button>` : ''}
            ${view.status === 'setup' && !host && me ? `<button class="btn wide ghost" onclick="ASYNC.leave('${view.id}')">${TX('Spiel verlassen')}</button>` : ''}`);
    },

    // ── Start tile placement (tile maps) ─────────────────────────────────────
    startPlacement: function (view) {
        const pl = view.placement;
        const seat = pl.plan.seats.find(s => s.idx === view.mySlot);
        if (!seat) return this.waitingModal(view, TX('Warte auf die anderen Spieler.'));
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
        if (st.cell == null) return toast(TX('Erst die Hauptstadt setzen.'));
        MP.socket.emit('async:place', { id: MP.asyncId, o: st.o, cell: st.cell }, res => {
            if (res && res.error) return toast(TXS(res.error));
            toast(TX('Startplättchen gelegt.'));
        });
    },
};

// ── Language ────────────────────────────────────────────────────────────────
/* The legal texts exist in German only – in English the link texts say so (client/i18n.js). */
MP.drawLegalFooter = function () {
    const footer = $('mp-legal-footer');
    if (!footer) return;
    const link = (href, text) => `<a href="${href}" target="_blank" style="color:inherit">${text}</a>`;
    footer.innerHTML = `&copy; 2026 Hochciv Multiplayer. ${TX('Alle Rechte vorbehalten.')} |
        ${link('/datenschutzerklaerung.html', TX('Datenschutzerklärung'))} |
        ${link('/nutzungsbedingungen.html', TX('Nutzungsbedingungen'))} |
        ${link('/impressum.html', TX('Impressum'))}`;
};
/* The game's language buttons (switchLang in ui.js) redraw the game's own texts – this redraws
   what mp.js has put on the page. Modals are closed by switchLang anyway. */
MP.applyLang = function () {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    set('mp-live-btn', TX('Multiplayer'));
    set('mp-overall-btn', TX('Statistiken'));
    set('mp-players-title', TX('Spieler'));
    set('dc-group-btn', TX('Mit der Discord-Gruppe spielen'));      // activity/bridge.js
    const wait = document.querySelector('.mp-waiting-toast');
    if (wait && !MP.asyncId) wait.textContent = TX('Warte auf deinen Zug...');
    const cred = document.querySelector('#mp-cred-wrapper .res');
    if (cred) cred.title = TX('Lobby Zugangsdaten');
    set('mp-afk-text', TX('Die KI spielt für dich, weil du dreimal nicht gezogen hast.'));
    set('mp-afk-btn', TX('Ich bin zurück'));
    const clock = $('mp-turn-clock');
    if (clock) clock.title = TX('Zeit für diesen Zug');
    const sumBtn = $('mp-summary-btn');
    if (sumBtn) sumBtn.title = TX('Seit deinem letzten Zug');
    document.documentElement.style.setProperty('--mp-on-turn', JSON.stringify(' ◂ ' + TX('am Zug')));
    [['--mp-lbl-players', 'Spieler'], ['--mp-lbl-chat', 'Chat']]
        .forEach(([v, t]) => document.documentElement.style.setProperty(v, JSON.stringify(TX(t))));
    if (this.joinCode) this.showCred();
    this.drawLegalFooter();
    if ($('mp-main-auth-container') && $('mp-main-auth-container').innerHTML) this.drawMainMenuAuth();
    ASYNC.drawBadge();
    if (typeof CHAT !== 'undefined') CHAT.applyLang();
};
const originalSwitchLang = window.switchLang;
if (originalSwitchLang) {
    window.switchLang = function () {
        const r = originalSwitchLang.apply(this, arguments);
        MP.applyLang();
        return r;
    };
}

// Menu button "Rundenspiele" (after "Multiplayer"), and ?async=<id> links from e-mails
window.addEventListener('DOMContentLoaded', () => {
    const mNew = $('m-new');
    if (mNew && !$('mp-async-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.id = 'mp-async-btn';
        btn.textContent = TX('Rundenspiele');
        btn.onclick = () => ASYNC.showList();
        mNew.parentNode.insertBefore(btn, $('m-continue'));
    }
    // Menu button "Statistiken": win rates over all matches (client/gamestats.js)
    if (mNew && !$('mp-overall-btn') && typeof GAMESTATS !== 'undefined') {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.id = 'mp-overall-btn';
        btn.textContent = TX('Statistiken');
        btn.onclick = () => GAMESTATS.open();
        mNew.parentNode.insertBefore(btn, $('m-continue'));
    }
    MP.applyLang();
    // Tap the code box in the HUD to go back to the list (the game goes on)
    const cred = $('mp-cred-wrapper');
    if (cred) cred.addEventListener('click', () => {
        if (!MP.asyncId) return;
        ASYNC.close(); show('screen-menu'); ASYNC.showList();
    });
    // In-game menu (☰) of a multiplayer game: "Zurück zum Hauptmenü" instead of "Spiel beenden"
    // (which would wipe the local single-player save). A Rundenspiel goes on without us, a live
    // game, a watched game or a replay is left. Deferred so ui.js has built the modal.
    const gMenu = $('g-menu');
    if (gMenu) gMenu.addEventListener('click', () => setTimeout(() => {
        if (!MP.active) return;
        const quit = $('mm-quit');
        if (!quit || $('mm-async-menu')) return;
        const btn = document.createElement('button');
        btn.className = 'btn wide primary';
        btn.id = 'mm-async-menu';
        btn.textContent = TX('Zurück zum Hauptmenü');
        btn.onclick = MP.asyncId
            ? () => { closeModal(); ASYNC.close(); show('screen-menu'); ASYNC.refreshBadge(); }
            : () => { location.href = location.pathname; };
        quit.parentNode.insertBefore(btn, quit);
        quit.remove();
    }, 0));
    MP.fetchUser().then(() => {
        ASYNC.refreshBadge();
        const params = new URLSearchParams(location.search);
        // Back from Google/Discord: the server redirects here with ?oauth=<result>
        const oauth = params.get('oauth');
        if (oauth === 'mfa') {
            // Google/Discord proved the account; its second factor is still missing
            history.replaceState(null, '', location.pathname);
            MP.showAuthModal(true);
        } else if (oauth) {
            history.replaceState(null, '', location.pathname);
            const OAUTH_MESSAGES = {
                ok: MP.user ? TX('Angemeldet als %s.', MP.user.username) : TX('Anmeldung erfolgreich.'),
                linked: TX('Konto erfolgreich verknüpft.'),
                failed: TX('Anmeldung abgebrochen oder abgelehnt.'),
                taken: TX('Dieses Google-/Discord-Konto ist bereits mit einem anderen Hochciv-Konto verknüpft.'),
                banned: TX('Dieses Konto ist gesperrt.'),
                merge_async: TX('Dein Discord-Konto hat noch laufende Rundenspiele. Beende sie zuerst und verknüpfe danach erneut.'),
                state: TX('Die Anmeldung ist abgelaufen. Bitte starte sie erneut.'),
                reauth: TX('Bitte bestätige zuerst auf der Kontoseite deine Identität und verknüpfe danach erneut.'),
                error: TX('Bei der Anmeldung ist ein Fehler aufgetreten. Bitte versuche es erneut.'),
            };
            toast(OAUTH_MESSAGES[oauth] || OAUTH_MESSAGES.error);
            if (MP.renderMainMenuAuth) MP.renderMainMenuAuth();
        }
        const id = params.get('async');
        const replay = params.get('replay');
        if (replay && typeof REPLAY !== 'undefined') {
            history.replaceState(null, '', location.pathname);
            REPLAY.open(replay);
        } else if (id) {
            history.replaceState(null, '', location.pathname);
            ASYNC.open(id);
        } else if (OLD_VERSIONS.includes(APP_VERSION_HERE)) {
            location.replace('/');           // /v93/, /v88/, /v83/ only open Rundenspiele and replays of that version
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
// A turned phone or a smaller window: open panels may now cover each other
window.addEventListener('resize', () => MP.fitPanels(MP._lastPanel));
