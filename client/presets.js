/**
 * Lobby presets (F25): the host of a live lobby or of a new Rundenspiel keeps the settings under
 * a name and loads them again with one pick. Kept with the account (GET/PUT /api/account/presets,
 * utils/presets.js), so they are on every device; guests don't see the row.
 *
 *   PRESETS.rowHtml(kind)   – the row above the settings: kind 'live' (MP lobby) or 'async'
 *                             (ASYNC.showCreate form)
 *
 * One preset serves both: the map ('tiles' is the live lobby's 'random' and the form's
 * 'plaettchen'), empires and KI seats, nations, events, wonders, KI level, player-bots, public,
 * ranked, and the time per turn of each kind (turnTime live, turnDays Rundenspiel). Saving under
 * an existing name keeps the other kind's time. A custom map is kept by its name in
 * "Meine Karten"; if it is gone, the map stays as it is.
 */
(function () {
    'use strict';
    if (window.PRESETS) return;

    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const tx = (de, ...args) => HC_I18N.t(de, ...args);
    const base = () => (typeof MP !== 'undefined' && MP.serverUrl) || '';

    const P = {
        list: null,             // the account's presets, once loaded
        owner: null,            // whose they are
        loading: null,
        chosen: { live: '', async: '' },
        saving: { live: false, async: false },

        load: function () {
            if (this.list) return Promise.resolve(this.list);
            if (this.loading) return this.loading;
            this.loading = fetch(base() + '/api/account/presets', { credentials: 'same-origin' })
                .then(r => (r.ok ? r.json() : { list: [] }))
                .then(d => { this.list = Array.isArray(d.list) ? d.list : []; return this.list; })
                .catch(() => { this.list = []; return this.list; })
                .finally(() => { this.loading = null; });
            return this.loading;
        },
        store: async function (list) {
            const r = await fetch(base() + '/api/account/presets', {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error ? HC_I18N.tr(d.error) : tx('Speichern fehlgeschlagen'));
            this.list = d.list;
        },

        // ── settings ⇄ preset ────────────────────────────────────────────────────────────
        fromLive: function () {
            const gc = MP.gameConfig || {}, cnt = MP.lobbyCounts();
            return {
                map: gc.mapKey === 'random' ? 'tiles' : gc.mapKey, customName: gc.mapKey === 'eigene' && gc.customMap ? gc.customMap.name : undefined,
                hexTiles: !!gc.hexTiles, events: !!gc.events, eventMode: gc.eventMode || 'hard', wonders: !!gc.wonders,
                total: cnt.total, ki: cnt.ki, randomCivs: !!gc.randomCivs, difficulty: MP.kiLevel(gc.difficulty),
                turnTime: gc.turnTime || 0, playerBots: gc.playerBots === true, playerBotLimit: gc.playerBotLimit || null,
                isPublic: !!gc.isPublic, ranked: !!gc.ranked,
            };
        },
        fromAsync: function () {
            ASYNC.readForm(false);
            const f = ASYNC.form;
            return {
                map: f.mapKey === 'plaettchen' ? 'tiles' : f.mapKey, customName: f.mapKey === 'eigene' ? f.customName : undefined,
                hexTiles: !!f.hexTiles, events: !!f.events, eventMode: f.eventMode || 'hard', wonders: !!f.wonders,
                total: f.playerCount, ki: f.kiCount, randomCivs: f.civMode === 'random', difficulty: f.difficulty,
                turnDays: f.turnDays || 7, playerBots: !!f.playerBots, playerBotLimit: f.playerBotLimit ? +f.playerBotLimit : null,
                isPublic: !!f.isPublic, ranked: !!f.ranked,
            };
        },
        /** The custom map of a preset from "Meine Karten" – null (and a note) if it is gone. */
        customMap: function (s) {
            const m = s.customName && typeof myMap === 'function' ? myMap(s.customName) : null;
            if (!m) toast(tx('Die Karte „%s“ ist nicht mehr in „Meine Karten“ – die Karte bleibt, wie sie ist.', s.customName || '?'));
            return m;
        },
        toLive: function (s) {
            const has = k => s[k] !== undefined;
            const c = {};
            if (s.map === 'eigene') { const m = this.customMap(s); if (m) Object.assign(c, { mapKey: 'eigene', customMap: m }); }
            else if (has('map')) c.mapKey = s.map === 'tiles' ? 'random' : s.map;
            ['hexTiles', 'events', 'eventMode', 'wonders', 'randomCivs', 'difficulty', 'turnTime', 'playerBots', 'playerBotLimit', 'isPublic']
                .forEach(k => { if (has(k)) c[k] = s[k]; });
            if (has('ranked')) c.ranked = !!s.ranked && !!MP.user;
            if (c.ranked) c.difficulty = KI_LEVELS[KI_LEVELS.length - 1].k;
            if (has('total')) c.playerCount = s.total;
            if (has('ki')) c.kiCount = s.ki;
            // the numbers within what the map allows, as MP.updateLobbyConfig does
            const old = MP.gameConfig;
            MP.gameConfig = Object.assign({}, old, c);
            const cnt = MP.lobbyCounts();
            MP.gameConfig = old;
            c.playerCount = cnt.total;
            c.kiCount = cnt.ki;
            c.noKi = false;
            MP.socket.emit('lobby:config', c, res => {
                if (res && res.error) toast(TXS(res.error));
                else toast(tx('Vorlage geladen.'));
            });
        },
        toAsync: function (s) {
            const has = k => s[k] !== undefined;
            const f = ASYNC.form;
            ASYNC.readForm(false);
            if (s.map === 'eigene') { if (this.customMap(s)) Object.assign(f, { mapKey: 'eigene', customName: s.customName }); }
            else if (has('map')) f.mapKey = s.map === 'tiles' ? 'plaettchen' : s.map;
            ['hexTiles', 'events', 'eventMode', 'wonders', 'difficulty', 'turnDays', 'playerBots', 'isPublic'].forEach(k => { if (has(k)) f[k] = s[k]; });
            if (has('playerBotLimit')) f.playerBotLimit = s.playerBotLimit ? String(s.playerBotLimit) : '';
            if (has('randomCivs')) f.civMode = s.randomCivs ? 'random' : 'fixed';
            if (has('ranked')) f.ranked = !!s.ranked;
            if (has('total')) f.playerCount = s.total;
            if (has('ki')) f.kiCount = s.ki;
            ASYNC.showCreate();
            toast(tx('Vorlage geladen.'));
        },

        // ── the row ──────────────────────────────────────────────────────────────────────
        rowHtml: function (kind) {
            if (typeof MP === 'undefined' || !MP.user) return '';
            if (this.owner !== MP.user.id) { this.reset(); this.owner = MP.user.id; }     // another account
            if (!this.list) { this.load().then(() => this.redraw(kind)); }
            // its changes stay here: the Rundenspiel form redraws itself on every change
            return `<div class="mpp-row" id="mpp-${kind}" onchange="event.stopPropagation()">${this.inner(kind)}</div>`;
        },
        inner: function (kind) {
            const list = this.list || [];
            const chosen = list.some(p => p.name === this.chosen[kind]) ? this.chosen[kind] : '';
            const sel = `<select id="mpp-sel-${kind}" aria-label="${esc(tx('Vorlage'))}" onchange="PRESETS.pick('${kind}', this.value)" ${this.list ? '' : 'disabled'}>
                <option value="">${esc(this.list ? (list.length ? tx('– Vorlage laden –') : tx('– noch keine Vorlage –')) : tx('Lädt...'))}</option>
                ${list.map(p => `<option value="${esc(p.name)}" ${p.name === chosen ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
            const save = this.saving[kind]
                ? `<span class="mpp-save"><input type="text" id="mpp-name-${kind}" maxlength="40" placeholder="${esc(tx('Name der Vorlage'))}" value="${esc(chosen)}"
                     onkeydown="if (event.key === 'Enter') PRESETS.save('${kind}'); if (event.key === 'Escape') PRESETS.cancel('${kind}')">
                   <button type="button" class="btn small primary" onclick="PRESETS.save('${kind}')">${tx('Speichern')}</button>
                   <button type="button" class="btn small ghost" onclick="PRESETS.cancel('${kind}')" aria-label="${esc(tx('Abbrechen'))}">✕</button></span>`
                : `<button type="button" class="btn small" onclick="PRESETS.startSave('${kind}')" title="${esc(tx('Diese Einstellungen als Vorlage speichern'))}">💾 ${tx('Als Vorlage')}</button>
                   ${chosen ? `<button type="button" class="btn small ghost" onclick="PRESETS.remove('${kind}')" title="${esc(tx('Vorlage löschen'))}" aria-label="${esc(tx('Vorlage löschen'))}">🗑</button>` : ''}`;
            return `<span class="mpp-label">📋 ${tx('Vorlagen')}</span>${sel}${save}`;
        },
        redraw: function (kind) {
            const el = document.getElementById('mpp-' + kind);
            if (el) el.innerHTML = this.inner(kind);
        },

        pick: function (kind, name) {
            this.chosen[kind] = name;
            const p = (this.list || []).find(x => x.name === name);
            if (!p) return this.redraw(kind);
            if (kind === 'live') this.toLive(p.s); else this.toAsync(p.s);
        },
        startSave: function (kind) {
            this.saving[kind] = true;
            this.redraw(kind);
            const i = document.getElementById('mpp-name-' + kind);
            if (i) { i.focus(); i.select(); }
        },
        cancel: function (kind) {
            this.saving[kind] = false;
            this.redraw(kind);
        },
        save: async function (kind) {
            const i = document.getElementById('mpp-name-' + kind);
            const name = (i ? i.value : '').replace(/\s+/g, ' ').trim().slice(0, 40);
            if (!name) { toast(tx('Bitte einen Namen eingeben.')); if (i) i.focus(); return; }
            const list = (this.list || []).slice();
            const old = list.find(p => p.name === name);
            if (!old && list.length >= 10) return toast(tx('Höchstens 10 Vorlagen.'));
            // the other kind's time per turn stays (a live lobby has no days, a Rundenspiel no minutes)
            const s = Object.assign({}, old ? old.s : {}, kind === 'live' ? this.fromLive() : this.fromAsync());
            const next = old ? list.map(p => (p === old ? { name, s } : p)) : list.concat({ name, s });
            try {
                await this.store(next);
                this.saving[kind] = false;
                this.chosen[kind] = name;
                toast(old ? tx('Vorlage „%s“ aktualisiert.', name) : tx('Vorlage „%s“ gespeichert.', name));
            } catch (e) { toast(e.message); }
            this.redraw(kind);
        },
        remove: async function (kind) {
            const name = this.chosen[kind];
            if (!name || !confirm(tx('Vorlage „%s“ löschen?', name))) return;
            try {
                await this.store((this.list || []).filter(p => p.name !== name));
                this.chosen[kind] = '';
                toast(tx('Vorlage gelöscht.'));
            } catch (e) { toast(e.message); }
            this.redraw(kind);
        },
        /** Logged out or another account: forget the list. */
        reset: function () {
            this.list = null;
            this.chosen = { live: '', async: '' };
        },
    };

    const css = document.createElement('style');
    css.textContent = `
        .mpp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; padding: 6px 8px;
            border: 1px dashed #c9bfa8; border-radius: 6px; font-size: 13px; }
        .mpp-label { font-weight: 600; }
        .mpp-row select { max-width: 100%; min-width: 0; flex: 1 1 140px; }
        .mpp-save { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; flex: 1 1 220px; }
        .mpp-save input { flex: 1 1 120px; min-width: 0; }
    `;
    document.head.appendChild(css);

    window.PRESETS = P;
})();
