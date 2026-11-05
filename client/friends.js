/**
 * Friends list (F8) on the game page – loaded after mp.js (inject.js).
 *
 *   • the tab "Freunde" of the multiplayer menu: live invitations, add by name, requests in and
 *     out, friends with online status and what they do (join a public lobby, watch a public
 *     game), suggestions from recent games ("Zuletzt gespielt mit")
 *   • in a live lobby: "👥 Freunde einladen" – online friends get an invitation card
 *   • friend names to pick when inviting to a Rundenspiel (create form, invite dialog)
 *   • the player profile (client/profile.js): add, accept, or "Freund"
 *
 * A logged-in page keeps a socket open (MP.connect), so friends see it online. Server side:
 * utils/friends.js, routes/friends.js, sockets/friends.js.
 */
(function () {
    'use strict';
    if (window.FRIENDS) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (de, ...a) => (window.HC_I18N ? HC_I18N.t(de, ...a) : de);
    const TS = m => (window.HC_I18N ? HC_I18N.tr(m) : m);

    const FRIENDS = {
        data: null,
        lobbyOpen: false,
        invited: new Set(),           // friends invited into the current lobby (button state)

        api: async function (path, method, body) {
            const res = await fetch('/api/friends' + path, {
                method: method || 'GET', credentials: 'same-origin',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ? TS(data.error) : T('Fehler'));
            return data;
        },

        /** Page start, logged in: open the socket (online for friends) and load the list. */
        start: function () {
            if (!MP.user || MP.user.isBot) return;
            MP.connect();
            this.load();
        },
        attach: function (socket) {
            socket.on('friends:changed', d => {
                if (d && d.type === 'request') toast(T('%s möchte mit dir befreundet sein.', d.from));
                if (d && d.type === 'accepted') toast(T('%s hat deine Freundschaftsanfrage angenommen.', d.from));
                if (d && (d.type === 'request' || d.type === 'accepted')) MP.alert('join', '👥 ' + T('Freunde'));
                this.load();
            });
            socket.on('friends:invited', inv => this.invited_(inv));
        },
        load: async function () {
            if (!MP.user) { this.data = null; return null; }
            try { this.data = await this.api(''); } catch (_) { return this.data; }
            this.redraw();
            return this.data;
        },
        redraw: function () {
            this.drawHub();
            if (this.lobbyOpen && MP.renderLobby) this.drawLobbyPanel();
            this.drawBadge();
        },
        /** Requests and invitations waiting: on the tab of the multiplayer menu. */
        drawBadge: function () {
            const d = this.data, n = d ? d.incoming.length + d.invites.length : 0;
            const el = $('mph-count-friends');
            if (el) { el.textContent = n || ''; el.classList.toggle('hot', n > 0); }
        },

        // ── The tab of the multiplayer menu ─────────────────────────────────────────
        statusText: function (f) {
            const a = f.activity;
            if (a && a.status === 'lobby') return T('In einer Lobby');
            if (a && a.status === 'playing') return a.round ? T('Spielt · Runde %s', a.round) : T('Spielt');
            if (f.online) return T('Online');
            if (f.seen) {
                const min = Math.round((Date.now() - f.seen) / 60000);
                return min < 60 ? T('Offline · vor %s Min.', Math.max(1, min)) : T('Offline · vor %s Std.', Math.round(min / 60));
            }
            return T('Offline');
        },
        friendRow: function (f) {
            const a = f.activity, btns = [];
            if (a && a.joinCode && a.status === 'lobby' && !a.full) btns.push(`<button class="btn small primary" data-code="${esc(a.joinCode)}" data-pw="${esc(a.password)}" onclick="FRIENDS.join(this.dataset.code, this.dataset.pw)">${T('Beitreten')}</button>`);
            if (a && a.joinCode && a.status === 'playing') btns.push(`<button class="btn small" data-code="${esc(a.joinCode)}" data-pw="${esc(a.password)}" onclick="MP.watch(this.dataset.code, this.dataset.pw, MP.user.username)">${T('Zuschauen')}</button>`);
            btns.push(`<button class="btn small ghost" title="${esc(T('Aus der Freundesliste entfernen'))}" onclick="FRIENDS.remove('${esc(f.id)}', '${esc(f.username)}', true)">✕</button>`);
            return `<div class="mpf-row" data-friend="${esc(f.id)}"><span class="mpf-dot${f.online ? ' on' : ''}"></span>
                <span class="mpf-name">${MP.nameLink(f.username, f.id)} <small>${esc(f.mmr)} MMR</small><br><small class="mpf-status">${esc(this.statusText(f))}</small></span>
                <span class="mpf-btns">${btns.join('')}</span></div>`;
        },
        drawHub: function () {
            const box = $('mph-friends');
            if (!box) return;
            if (!MP.user) {
                box.innerHTML = `<div class="mph-login"><p class="sub">${T('Freunde gibt es nur mit Anmeldung.')}</p>
                    <button class="btn small" onclick="MP.showAuthModal()">${T('Anmelden')}</button></div>`;
                return;
            }
            const d = this.data;
            if (!d) { box.innerHTML = `<p class="sub mph-empty">${T('Lade...')}</p>`; return; }
            const h = (t, n) => `<h4 class="mpa-h">${t}${n != null ? ` <span class="sub">(${n})</span>` : ''}</h4>`;
            const online = d.friends.filter(f => f.online).length;
            let html = '';
            if (d.invites.length) html += h(T('Einladungen in Live-Lobbys')) + d.invites.map(i =>
                `<div class="mpf-row mpf-invite"><span class="mpf-name">${T('%s lädt dich in die Lobby von %s ein.', `<b>${esc(i.fromName)}</b>`, esc(i.hostName))}</span>
                 <span class="mpf-btns"><button class="btn small primary" data-code="${esc(i.joinCode)}" data-pw="${esc(i.password)}" onclick="MP.openInvite(this.dataset.code, this.dataset.pw)">${T('Ansehen')}</button></span></div>`).join('');
            html += `<form class="mpf-add" onsubmit="FRIENDS.add(); return false">
                <input type="text" id="mpf-name" maxlength="40" placeholder="${esc(T('Spielername'))}" autocomplete="off">
                <button class="btn small primary" type="submit">${T('Anfrage senden')}</button></form>`;
            if (d.incoming.length) html += h(T('Anfragen an dich'), d.incoming.length) + d.incoming.map(r =>
                `<div class="mpf-row" data-request="${esc(r.id)}"><span class="mpf-name">${MP.nameLink(r.username, r.id)}</span>
                 <span class="mpf-btns"><button class="btn small primary" onclick="FRIENDS.accept('${esc(r.id)}')">${T('Annehmen')}</button>
                 <button class="btn small ghost" onclick="FRIENDS.remove('${esc(r.id)}')">${T('Ablehnen')}</button></span></div>`).join('');
            html += h(T('Freunde'), d.friends.length ? T('%s online', online) : null) + (d.friends.length ? d.friends.map(f => this.friendRow(f)).join('')
                : `<p class="sub mph-empty">${T('Noch keine Freunde. Schick eine Anfrage oder füge jemanden aus deinen letzten Spielen hinzu.')}</p>`);
            if (d.outgoing.length) html += h(T('Gesendete Anfragen')) + d.outgoing.map(r =>
                `<div class="mpf-row"><span class="mpf-name">${MP.nameLink(r.username, r.id)} <small class="mpf-status">${T('wartet')}</small></span>
                 <span class="mpf-btns"><button class="btn small ghost" onclick="FRIENDS.remove('${esc(r.id)}')">${T('Zurückziehen')}</button></span></div>`).join('');
            if (d.suggestions.length) html += h(T('Zuletzt gespielt mit')) + d.suggestions.map(s =>
                `<div class="mpf-row"><span class="mpf-name">${MP.nameLink(s.username, s.id)}</span>
                 <span class="mpf-btns"><button class="btn small" onclick="FRIENDS.add('${esc(s.id)}')">+ ${T('Hinzufügen')}</button></span></div>`).join('');
            if (box._html !== html) { box.innerHTML = html; box._html = html; }
            this.drawBadge();
        },

        add: async function (id) {
            const input = $('mpf-name');
            const body = id ? { id } : { username: input ? input.value.trim() : '' };
            try {
                const r = await this.api('', 'POST', body);
                toast(r.status === 'accepted' ? T('Ihr seid jetzt befreundet.') : T('Anfrage an %s gesendet.', r.username || ''));
                if (input && !id) input.value = '';
                await this.load();
            } catch (e) { toast(e.message); }
        },
        accept: async function (id) {
            try { await this.api('/' + encodeURIComponent(id) + '/accept', 'POST'); toast(T('Ihr seid jetzt befreundet.')); await this.load(); }
            catch (e) { toast(e.message); }
        },
        remove: async function (id, name, ask) {
            if (ask && !confirm(T('%s aus deiner Freundesliste entfernen?', name))) return;
            try { await this.api('/' + encodeURIComponent(id), 'DELETE'); await this.load(); }
            catch (e) { toast(e.message); }
        },
        /** A friend's public lobby, from the list. */
        join: function (code, pw) {
            return MP.joinWith(code, pw, MP.user.username);
        },

        // ── Live lobby: invite online friends ───────────────────────────────────────
        lobbyButton: function () {
            if (!MP.user || MP.user.isBot) return '';
            return `<button class="btn small" id="mp-friends-btn" onclick="FRIENDS.toggleLobby()" aria-expanded="${this.lobbyOpen}">👥 ${T('Freunde einladen')}</button>`;
        },
        lobbyPanel: function () {
            return this.lobbyOpen ? `<div id="mp-friends-panel" class="mpf-panel">${this.lobbyPanelHtml()}</div>` : '';
        },
        lobbyPanelHtml: function () {
            const d = this.data;
            if (!d) return `<p class="sub">${T('Lade...')}</p>`;
            const inLobby = new Set((MP.players || []).map(p => p.userId).filter(Boolean));
            const on = d.friends.filter(f => f.online && !inLobby.has(f.id));
            const off = d.friends.filter(f => !f.online).length;
            if (!d.friends.length) return `<p class="sub">${T('Noch keine Freunde. Im Multiplayer-Menü unter „Freunde" kannst du welche hinzufügen.')}</p>`;
            return (on.length ? on.map(f => {
                const done = this.invited.has(MP.joinCode + ':' + f.id);
                return `<div class="mpf-row"><span class="mpf-dot on"></span><span class="mpf-name"><b>${esc(f.username)}</b> <small class="mpf-status">${esc(this.statusText(f))}</small></span>
                    <span class="mpf-btns"><button class="btn small ${done ? 'ghost' : 'primary'}" data-invite="${esc(f.id)}" ${done ? 'disabled' : ''} onclick="FRIENDS.inviteLive('${esc(f.id)}', '${esc(f.username)}')">${done ? '✓ ' + T('Eingeladen') : T('Einladen')}</button></span></div>`;
            }).join('') : `<p class="sub">${T('Gerade ist keiner deiner Freunde online.')}</p>`)
                + (off ? `<p class="sub">${T('%s offline – schick ihnen den Einladungslink.', off)}</p>` : '');
        },
        drawLobbyPanel: function () {
            const el = $('mp-friends-panel');
            if (el) el.innerHTML = this.lobbyPanelHtml();
        },
        toggleLobby: function () {
            this.lobbyOpen = !this.lobbyOpen;
            if (MP.renderLobby) MP.renderLobby();
            if (this.lobbyOpen) this.load();
        },
        inviteLive: function (id, name) {
            MP.socket.emit('friends:invite', { userId: id, joinCode: MP.joinCode }, res => {
                if (res && res.error) return toast(TS(res.error));
                this.invited.add(MP.joinCode + ':' + id);
                toast(T('Einladung an %s gesendet.', name));
                this.drawLobbyPanel();
            });
        },

        /** An invitation arrived: a card, or – while playing – a note (it waits in the list). */
        invited_: function (inv) {
            if (!inv) return;
            MP.alert('join', '👥 ' + T('%s lädt dich ein', inv.fromName));
            this.load();
            if (MP.active) return toast(T('%s lädt dich in eine Live-Lobby ein – du findest die Einladung unter Multiplayer → Freunde.', inv.fromName));
            let card = $('mp-friend-card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'mp-friend-card';
                card.setAttribute('role', 'dialog');
                document.body.appendChild(card);
            }
            card.innerHTML = `<p>👥 ${T('%s lädt dich in eine Live-Lobby ein.', `<b>${esc(inv.fromName)}</b>`)}</p>
                <div class="mpf-btns"><button class="btn small primary" id="mp-friend-card-go">${T('Ansehen')}</button>
                <button class="btn small ghost" id="mp-friend-card-x">${T('Später')}</button></div>`;
            card.hidden = false;
            clearTimeout(this._cardTimer);
            this._cardTimer = setTimeout(() => { card.hidden = true; }, 60000);
            $('mp-friend-card-go').onclick = () => { card.hidden = true; MP.openInvite(inv.joinCode, inv.password); };
            $('mp-friend-card-x').onclick = () => { card.hidden = true; };
        },

        // ── Rundenspiele: pick friends to invite ────────────────────────────────────
        /** Buttons with friend names that fill `inputId` (`many`: a comma list). */
        chipsHtml: function (inputId, many) {
            const d = this.data;
            if (!d || !d.friends.length) return '';
            return `<div class="mpf-chips"><small>${T('Freunde:')}</small> ` + d.friends.map(f =>
                `<button type="button" class="mpf-chip" data-name="${esc(f.username)}" onclick="FRIENDS.pick('${inputId}', this.dataset.name, ${!!many})">${esc(f.username)}</button>`).join('') + '</div>';
        },
        pick: function (inputId, name, many) {
            const el = $(inputId);
            if (!el) return;
            if (!many) { el.value = name; return; }
            const names = el.value.split(',').map(x => x.trim()).filter(Boolean);
            if (!names.includes(name)) names.push(name);
            el.value = names.join(', ');
        },

        // ── Player profile (client/profile.js) ──────────────────────────────────────
        decorateProfile: async function (top, data) {
            if (!top || !MP.user || MP.user.isBot || data.isBotAccount || data.id === MP.user.id) return;
            const d = this.data || await this.load();
            if (!d || !top.isConnected) return;
            const old = top.querySelector('.mpf-profile');
            if (old) old.remove();
            const has = list => list.some(x => x.id === data.id);
            const el = document.createElement('div');
            el.className = 'mpf-profile';
            el.innerHTML = has(d.friends) ? `<span class="mpf-badge">✓ ${T('Freund')}</span>`
                : has(d.outgoing) ? `<span class="sub">${T('Anfrage gesendet')}</span>`
                    : has(d.incoming) ? `<button class="btn small primary" type="button">${T('Anfrage annehmen')}</button>`
                        : `<button class="btn small" type="button">+ ${T('Als Freund hinzufügen')}</button>`;
            const btn = el.querySelector('button');
            if (btn) btn.onclick = async () => {
                btn.disabled = true;
                await (has(d.incoming) ? this.accept(data.id) : this.add(data.id));
                this.decorateProfile(top, data);
            };
            top.appendChild(el);
        },
    };

    const style = document.createElement('style');
    style.textContent = `
        .mpf-row { display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--rule, #ddd); }
        .mpf-name { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; }
        .mpf-status { opacity:.7; }
        .mpf-btns { display:flex; gap:6px; flex:0 0 auto; }
        .mpf-btns .btn { width:auto; margin:0; }
        .mpf-dot { width:9px; height:9px; border-radius:50%; background:#aaa; flex:0 0 auto; }
        .mpf-dot.on { background:#2e8b3d; box-shadow:0 0 0 2px rgba(46,139,61,.2); }
        .mpf-add { display:flex; gap:6px; margin:4px 0 10px; }
        .mpf-add input { flex:1 1 auto; min-width:0; margin:0; }
        .mpf-add .btn { width:auto; margin:0; flex:0 0 auto; }
        .mpf-invite { background:#fff6dc; padding:7px 8px; border-radius:4px; }
        .mpf-panel { background:#f4ebd8; border-radius:4px; padding:4px 10px; margin:0 0 12px; }
        .mpf-chips { display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin:-4px 0 8px; }
        .mpf-chip { border:1px solid var(--rule, #ccc); background:var(--paper, #fff); border-radius:12px; padding:2px 9px; font:inherit; font-size:12px; cursor:pointer; }
        .mpf-profile { margin-left:auto; align-self:center; }
        .mpf-profile .btn { width:auto; margin:0; }
        .mpf-badge { color:#2e6b34; font-weight:600; }
        #mp-friend-card { position:fixed; right:16px; bottom:90px; z-index:1002; max-width:min(340px, calc(100% - 32px)); background:#fffbe8;
            border:2px solid #9d3b2f; border-radius:6px; padding:10px 12px; box-shadow:0 6px 16px rgba(0,0,0,.3); }
        #mp-friend-card[hidden] { display:none; }
        #mp-friend-card p { margin:0 0 8px; }
    `;
    document.head.appendChild(style);

    window.FRIENDS = FRIENDS;
})();
