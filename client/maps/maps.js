/*
 * HochCiv map browser – every published custom map, to play, keep or favorite. Injected after
 * mp.js (inject.js), styles in maps.css. Server side: routes/maps.js, maps/service.js.
 *
 *   MAPBROWSER.open()            from the main menu, the multiplayer menu, the editor, "Meine Karten"
 *   MAPBROWSER.open({ pick })    from a lobby or the Rundenspiel form: "Wählen" hands the map to
 *                                pick(map, entry) and closes the browser
 *   MAPBROWSER.favs              the player's favorites (published ones), for the lobby's map menu
 *
 * Its own overlay above everything (also above the game's dialog, e.g. the lobby). Tabs: Beliebt
 * (favorites, then plays), Neu, Meistgespielt, Favoriten and Meine (logged in). A map opens in a
 * detail view: choose it, add it to "Meine Karten", open it in the editor, copy its code, mark it
 * as a favorite, report it – and for admins, take it out of the browser.
 *
 * Uses the game's mapThumb / mapMeta (map preview, Hochciv ui.js), addMapFromCode, editorLoad,
 * toast, show, closeModal – a game version without mapThumb gets no browser.
 */
(function () {
    'use strict';
    if (window.MAPBROWSER || typeof mapThumb !== 'function' || typeof MP === 'undefined') return;

    const $id = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const TABS = [
        ['popular', 'Beliebt'], ['new', 'Neu'], ['played', 'Meistgespielt'],
        ['favorites', '★ Favoriten', true], ['mine', 'Meine', true],
    ];

    async function api(path, method, body) {
        const opts = { method: method || 'GET', cache: 'no-cache', credentials: 'include' };
        if (body !== undefined) Object.assign(opts, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const res = await fetch(`${MP.serverUrl}/api/maps${path}`, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error ? TXS(data.error) : TX('Fehler'));
        return data;
    }

    const MB = {
        tab: 'popular', q: '', players: '', page: 0,
        list: [], more: false, total: 0, moderator: false,
        opts: {},
        favs: [],
        loading: 0,

        open: function (opts) {
            this.opts = opts || {};
            if ((this.tab === 'favorites' || this.tab === 'mine') && !MP.user) this.tab = 'popular';
            this.build();
            $id('mb').classList.add('show');
            $id('mb').classList.toggle('picking', !!this.opts.pick);
            $id('mb-pickhint').hidden = !this.opts.pick;
            this.closeDetail();
            this.load(true);
            setTimeout(() => { const q = $id('mb-q'); if (q && matchMedia('(min-width: 720px)').matches) q.focus(); }, 50);
        },
        close: function () {
            const el = $id('mb');
            if (el) el.classList.remove('show');
            this.opts = {};
        },

        /** The overlay, once; its texts again on every opening (language). */
        build: function () {
            let el = $id('mb');
            if (!el) {
                el = document.createElement('div');
                el.id = 'mb';
                el.className = 'mb';
                el.setAttribute('role', 'dialog');
                el.setAttribute('aria-modal', 'true');
                document.body.appendChild(el);
                el.addEventListener('click', e => { if (e.target === el) this.close(); });
                document.addEventListener('keydown', e => {
                    if (e.key !== 'Escape' || !el.classList.contains('show')) return;
                    if (!$id('mb-detail').hidden) this.closeDetail(); else this.close();
                });
            }
            el.innerHTML = `<div class="mb-box">
                <header class="mb-head"><h3>${TX('Karten entdecken')}</h3>
                  <button class="icon-btn mb-x" aria-label="${esc(TX('Schließen'))}">✕</button></header>
                <div class="mb-bar">
                  <input type="search" id="mb-q" placeholder="${esc(TX('Karte oder Autor suchen'))}" value="${esc(this.q)}" maxlength="40" autocomplete="off">
                  <select id="mb-players" aria-label="${esc(TX('Reiche'))}">
                    <option value="">${TX('Alle Größen')}</option>
                    ${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${String(n) === String(this.players) ? 'selected' : ''}>${TX('ab %s Reichen', n)}</option>`).join('')}
                  </select>
                </div>
                <div class="mb-tabs" role="tablist">${TABS.map(([k, label, login]) =>
                    `<button role="tab" class="mb-tab" data-tab="${k}" ${login && !MP.user ? 'hidden' : ''}>${TX(label)}</button>`).join('')}</div>
                <p class="mb-pickhint" id="mb-pickhint" hidden>${TX('Wähle die Karte für dein Spiel.')}</p>
                <div class="mb-scroll" id="mb-scroll">
                  <div class="mb-grid" id="mb-grid"></div>
                  <p class="mb-empty" id="mb-empty" hidden></p>
                  <button class="btn mb-more" id="mb-more" hidden>${TX('Mehr laden')}</button>
                </div>
                <div class="mb-detail" id="mb-detail" hidden></div>
              </div>`;
            el.querySelector('.mb-x').onclick = () => this.close();
            let timer = null;
            $id('mb-q').oninput = () => {
                clearTimeout(timer);
                timer = setTimeout(() => { this.q = $id('mb-q').value.trim(); this.load(true); }, 300);
            };
            $id('mb-players').onchange = () => { this.players = $id('mb-players').value; this.load(true); };
            el.querySelectorAll('.mb-tab').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.load(true); });
            $id('mb-more').onclick = () => this.load(false);
        },

        load: async function (reset) {
            if (reset) { this.page = 0; this.list = []; }
            document.querySelectorAll('#mb .mb-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === this.tab)));
            const only = this.tab === 'favorites' || this.tab === 'mine' ? this.tab : '';
            const params = new URLSearchParams({ sort: only ? 'new' : this.tab, page: this.page });
            if (only) params.set('only', only);
            if (this.q) params.set('q', this.q);
            if (this.players) params.set('players', this.players);
            const ticket = ++this.loading;
            if (reset) this.render(true);
            try {
                const r = await api('/browse?' + params);
                if (ticket !== this.loading) return;                 // a newer search is on its way
                this.list = this.list.concat(r.maps);
                this.more = r.more; this.total = r.total; this.moderator = r.moderator;
                this.page++;
                this.render(false);
            } catch (e) {
                if (ticket !== this.loading) return;
                $id('mb-grid').innerHTML = '';
                this.empty(TX('Fehler beim Laden.') + ' ' + e.message);
            }
        },
        empty: function (text) {
            const p = $id('mb-empty');
            p.hidden = !text;
            p.textContent = text || '';
        },

        render: function (loading) {
            const grid = $id('mb-grid');
            if (!grid) return;
            if (loading) {
                grid.innerHTML = Array.from({ length: 6 }, () => '<div class="mb-card mb-ghost"><div class="mb-thumb"></div><div class="mb-info"><b></b><small></small></div></div>').join('');
                this.empty('');
                $id('mb-more').hidden = true;
                return;
            }
            grid.innerHTML = this.list.map((m, i) => this.card(m, i)).join('');
            this.empty(this.list.length ? '' : this.tab === 'favorites' ? TX('Noch keine Favoriten. Tippe bei einer Karte auf ★.')
                : this.tab === 'mine' ? TX('Du hast noch keine Karte veröffentlicht. Veröffentlichen kannst du im Karteneditor.')
                    : this.q || this.players ? TX('Keine Karte gefunden.') : TX('Noch keine veröffentlichten Karten.'));
            $id('mb-more').hidden = !this.more;
            grid.querySelectorAll('[data-open]').forEach(b => b.onclick = () => this.detail(this.list[+b.dataset.open]));
            grid.querySelectorAll('[data-fav]').forEach(b => b.onclick = e => { e.stopPropagation(); this.toggleFav(this.list[+b.dataset.fav]); });
            grid.querySelectorAll('[data-use]').forEach(b => b.onclick = e => { e.stopPropagation(); this.use(this.list[+b.dataset.use]); });
        },

        meta: m => typeof mapMeta === 'function' ? mapMeta(m.map) : `${m.map.rows.length} × ${m.map.rows[0].length}`,
        favBtn: function (m, attr) {
            const label = m.fav ? TX('Aus den Favoriten nehmen') : TX('Zu den Favoriten');
            return `<button class="mb-fav${m.fav ? ' on' : ''}" ${attr} aria-pressed="${m.fav}" title="${esc(label)}" aria-label="${esc(label)}">${m.fav ? '★' : '☆'}</button>`;
        },
        // a map without an author is one of ours (maps/builtin.js): its name is in client/i18n.js
        title: m => (m.author ? m.name : TX(m.name)),
        card: function (m, i) {
            return `<div class="mb-card">
                <button class="mb-thumb" data-open="${i}" aria-label="${esc(this.title(m))}">${mapThumb(m.map)}</button>
                ${this.favBtn(m, `data-fav="${i}"`)}
                <div class="mb-info" data-open="${i}">
                  <b>${esc(this.title(m))}</b>
                  <small>${m.author ? TX('von %s', esc(m.author)) : ''}${m.own ? ` <span class="mb-own">${TX('deine')}</span>` : ''}</small>
                  <small>${this.meta(m)}</small>
                  <span class="mb-stats"><span title="${esc(TX('Favoriten'))}">★ ${m.favorites}</span><span title="${esc(TX('Gespielt'))}">▶ ${m.loads}</span></span>
                </div>
                ${this.opts.pick ? `<button class="btn small primary mb-use" data-use="${i}">${TX('Wählen')}</button>` : ''}
              </div>`;
        },

        /** Detail view of a map, over the list. */
        detail: function (m) {
            if (!m) return;
            const d = $id('mb-detail');
            const canKeep = typeof addMapFromCode === 'function';
            const canEdit = typeof editorLoad === 'function';
            const date = m.publishedAt ? new Date(m.publishedAt).toLocaleDateString(HC_I18N.locale()) : '';
            d.innerHTML = `<div class="mb-d-top">
                  <button class="icon-btn mb-back" aria-label="${esc(TX('Zurück'))}">‹</button>
                  <h4>${esc(this.title(m))}</h4>
                  ${this.favBtn(m, 'id="mb-d-fav"')}
                </div>
                <div class="mb-d-body">
                  <div class="mb-d-thumb">${mapThumb(m.map)}</div>
                  <div class="mb-d-side">
                    <p class="mb-d-meta">${m.author ? TX('von %s', `<b>${esc(m.author)}</b>`) : ''}${date ? ' · ' + esc(date) : ''}</p>
                    <p class="mb-d-meta">${this.meta(m)}</p>
                    <p class="mb-stats"><span>★ ${m.favorites === 1 ? TX('1 Favorit') : TX('%s Favoriten', m.favorites)}</span>
                      <span>▶ ${m.loads === 0 ? TX('noch nie gespielt') : m.loads === 1 ? TX('einmal gespielt') : TX('%s-mal gespielt', m.loads)}</span></p>
                    <p class="mb-d-code">${TX('Code')} <b class="mapcode">${esc(m.code)}</b>
                      <button class="btn small ghost" id="mb-d-copy">${TX('Code kopieren')}</button></p>
                    <div class="mb-d-acts">
                      ${this.opts.pick ? `<button class="btn primary" id="mb-d-use">${TX('Für dieses Spiel wählen')}</button>` : ''}
                      ${canKeep && !m.own ? `<button class="btn" id="mb-d-keep">${TX('Zu meinen Karten')}</button>` : ''}
                      ${canEdit ? `<button class="btn" id="mb-d-edit">${m.own ? TX('Im Editor öffnen') : TX('Als Vorlage im Editor öffnen')}</button>` : ''}
                    </div>
                    <div class="mb-d-foot">
                      ${MP.user && !m.own ? `<button class="btn small ghost" id="mb-d-report">⚑ ${TX('Melden')}</button>` : ''}
                      ${this.moderator ? `<button class="btn small error" id="mb-d-unlist">${TX('Aus dem Browser entfernen')}</button>` : ''}
                    </div>
                  </div>
                </div>`;
            d.hidden = false;
            $id('mb').classList.add('detail');
            d.querySelector('.mb-back').onclick = () => this.closeDetail();
            $id('mb-d-fav').onclick = () => this.toggleFav(m);
            $id('mb-d-copy').onclick = () => {
                try { navigator.clipboard.writeText(m.code).then(() => toast(TX('Kopiert')), () => toast(m.code)); } catch (e) { toast(m.code); }
            };
            if ($id('mb-d-use')) $id('mb-d-use').onclick = () => this.use(m);
            if ($id('mb-d-keep')) $id('mb-d-keep').onclick = () => this.keep(m);
            if ($id('mb-d-edit')) $id('mb-d-edit').onclick = () => this.edit(m);
            if ($id('mb-d-report')) $id('mb-d-report').onclick = () => this.report(m);
            if ($id('mb-d-unlist')) $id('mb-d-unlist').onclick = () => this.unlist(m);
        },
        closeDetail: function () {
            const d = $id('mb-detail');
            if (d) { d.hidden = true; d.innerHTML = ''; }
            const el = $id('mb');
            if (el) el.classList.remove('detail');
        },
        /** Draw the list and an open detail again (favorite changed). */
        refresh: function (m) {
            this.render(false);
            if (!$id('mb-detail').hidden) this.detail(m);
        },

        /** The current version of a map, counted as played/kept (the list may be minutes old). */
        fetchMap: async function (m) {
            const r = await api(`/browse/${encodeURIComponent(m.id)}/pick`, 'POST', {});
            m.loads += m.own ? 0 : 1;
            return r;
        },
        use: async function (m) {
            const pick = this.opts.pick;
            if (!pick) return;
            try {
                const r = await this.fetchMap(m);
                this.close();
                pick(r.map, Object.assign({}, m, { author: r.author, code: r.code }));
            } catch (e) { toast(e.message); }
        },
        keep: async function (m) {
            try {
                const r = await this.fetchMap(m);
                const a = addMapFromCode(r.map, r.code);
                if (a.error) return toast(a.error);
                toast(TX('„%s" ist jetzt in „Meine Karten".', a.name));
            } catch (e) { toast(e.message); }
        },
        edit: async function (m) {
            try {
                const r = await this.fetchMap(m);
                // someone else's map: a copy without its name – saved, it is the player's own map
                const map = m.own ? r.map : Object.assign({}, r.map, { name: '' });
                if (typeof closeModal === 'function') closeModal();
                if (!editorLoad(map)) return;
                this.close();
                if (!m.own) toast(TX('Vorlage „%s" geöffnet – gib ihr einen eigenen Namen.', m.name));
            } catch (e) { toast(e.message); }
        },
        toggleFav: async function (m) {
            if (!MP.user) return toast(TX('Melde dich an, um Favoriten zu speichern.'));
            const on = !m.fav;
            try {
                const r = await api(`/${encodeURIComponent(m.id)}/favorite`, 'POST', { on });
                m.fav = r.fav; m.favorites = r.favorites;
                if (on) this.favs = [m].concat(this.favs.filter(f => f.id !== m.id));
                else this.favs = this.favs.filter(f => f.id !== m.id);
                if (!on && this.tab === 'favorites') { this.list = this.list.filter(x => x !== m); this.closeDetail(); }
                this.refresh(m);
                if (this.opts.onFavs) this.opts.onFavs();
            } catch (e) { toast(e.message); }
        },
        report: async function (m) {
            const reason = prompt(TX('Warum meldest du „%s"? (z. B. beleidigender Name, anstößiges Bild)', m.name));
            if (reason === null) return;
            try {
                await api(`/${encodeURIComponent(m.id)}/report`, 'POST', { reason });
                toast(TX('Danke – ein Admin sieht sich die Karte an.'));
            } catch (e) { toast(e.message); }
        },
        unlist: async function (m) {
            if (!confirm(m.author ? TX('„%s" aus dem Browser entfernen? Die Karte bleibt im Konto von %s, ihr Code funktioniert nicht mehr.', m.name, m.author)
                : TX('„%s" aus dem Browser entfernen? Ihr Code funktioniert dann nicht mehr.', m.name))) return;
            try {
                const res = await fetch(`${MP.serverUrl}/api/admin/maps/${encodeURIComponent(m.id)}/unpublish`, { method: 'POST', credentials: 'include' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error ? TXS(data.error) : TX('Fehler'));
                this.list = this.list.filter(x => x !== m);
                this.favs = this.favs.filter(f => f.id !== m.id);
                this.closeDetail();
                this.render(false);
                toast(TX('Entfernt'));
            } catch (e) { toast(e.message); }
        },

        /** The player's favorites (after login), for the lobby's map menu. */
        loadFavs: async function () {
            if (!MP.user) { this.favs = []; return; }
            try { this.favs = (await api('/browse?only=favorites&limit=100')).maps; } catch (e) { /* the menu goes without */ }
        },
        /** A favorite by id, fetched fresh – for the lobby's map menu. */
        favMap: async function (id) {
            const m = this.favs.find(f => f.id === id);
            if (!m) throw new Error(TX('Diese Karte ist nicht mehr veröffentlicht.'));
            return Object.assign(await this.fetchMap(m), { name: m.name });
        },
    };

    window.MAPBROWSER = MB;

    // the game's map account hooks (mp.js MAPACCOUNT): "Karten entdecken" in the editor and in "Meine Karten"
    if (typeof MAPACCOUNT !== 'undefined') MAPACCOUNT.account.browse = () => MB.open();

    /* main menu: next to "Karte bearbeiten" (MP.arrangeMenu moves both into the lower grid) */
    function menuButton() {
        const ed = $id('m-editor');
        if (!ed || $id('mp-maps-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.id = 'mp-maps-btn';
        btn.textContent = TX('Karten entdecken');
        btn.onclick = () => MB.open();
        ed.after(btn);
    }
    menuButton();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menuButton);
})();
