/**
 * Player profile – the one place for everything profile-related on the client.
 * Loaded by the game (also in the Discord Activity) and by the account page.
 *
 *   PROFILE.link(name, userId)  – HTML for a clickable player name (plain text without account)
 *   PROFILE.open(userId)        – show the profile in its own overlay, above any other dialog
 *
 * Any element with data-profile="<userId>" opens that profile on click, so lists can just
 * render PROFILE.link(…). Data comes from GET /api/profile/:userId (routes/profile.js).
 */
(function () {
    'use strict';
    if (window.PROFILE) return;

    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // texts in the player's language (client/i18n.js)
    const tx = (de, ...args) => HC_I18N.t(de, ...args);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const fmtDate = d => new Date(d).toLocaleDateString(HC_I18N.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fmtDateTime = d => new Date(d).toLocaleString(HC_I18N.locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fmtShift = n => n == null ? '–' : n > 0 ? `+${n}` : `${n}`;

    const CSS = `
        .hcp-link { color: inherit; text-decoration: underline dotted; text-underline-offset: 3px; cursor: pointer; }
        .hcp-link:hover { color: var(--red, #9d3b2f); text-decoration-style: solid; }
        #hcp-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(30,24,12,.55);
            display: none; align-items: center; justify-content: center; padding: 16px;
            font-family: var(--sans, -apple-system, "Segoe UI", Roboto, sans-serif); }
        #hcp-overlay.show { display: flex; }
        #hcp-box { background: var(--paper, #f5efdf); color: var(--ink, #2a2721); border-radius: 10px;
            width: min(640px, 100%); max-height: min(85vh, 760px); display: flex; flex-direction: column;
            box-shadow: 0 10px 40px rgba(0,0,0,.35); overflow: hidden; }
        #hcp-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px;
            border-bottom: 1px solid var(--rule, #c9bb98); }
        #hcp-head .hcp-title { flex: 1; font-family: var(--serif, Georgia, serif); font-size: 18px; font-weight: 700; }
        #hcp-head button { background: none; border: 0; font-size: 22px; line-height: 1; cursor: pointer;
            color: inherit; padding: 4px 8px; border-radius: 6px; }
        #hcp-head button:hover { background: rgba(0,0,0,.06); }
        #hcp-back { font-size: 15px !important; }
        #hcp-body { overflow-y: auto; padding: 16px; }
        .hcp-top { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .hcp-avatar { width: 56px; height: 56px; border-radius: 50%; background: var(--paper-2, #efe6ce);
            display: flex; align-items: center; justify-content: center; font-family: var(--serif, Georgia, serif);
            font-size: 26px; font-weight: 700; color: var(--red, #9d3b2f); flex-shrink: 0; overflow: hidden; }
        .hcp-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .hcp-name { font-family: var(--serif, Georgia, serif); font-size: 24px; font-weight: 700; word-break: break-word; }
        .hcp-sub { color: var(--ink-soft, #6f6551); font-size: 13px; }
        .hcp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
        .hcp-stat { background: var(--paper-2, #efe6ce); border-radius: 8px; padding: 8px 6px; text-align: center; }
        .hcp-stat b { display: block; font-size: 20px; font-family: var(--serif, Georgia, serif); }
        .hcp-stat span { font-size: 12px; color: var(--ink-soft, #6f6551); }
        .hcp-h { font-family: var(--serif, Georgia, serif); font-size: 16px; margin: 0 0 8px; }
        .hcp-game { border-top: 1px solid var(--rule, #c9bb98); }
        .hcp-game > summary { list-style: none; cursor: pointer; display: grid; padding: 8px 4px; gap: 2px 10px;
            grid-template-columns: 1fr auto; align-items: center; }
        .hcp-game > summary::-webkit-details-marker { display: none; }
        .hcp-game > summary:hover { background: rgba(0,0,0,.03); }
        .hcp-res { font-weight: 700; }
        .hcp-res.win { color: #3f7a3a; }
        .hcp-res.loss { color: var(--red, #9d3b2f); }
        .hcp-meta { font-size: 12px; color: var(--ink-soft, #6f6551); grid-column: 1 / -1; }
        .hcp-shift.up { color: #3f7a3a; } .hcp-shift.down { color: var(--red, #9d3b2f); }
        .hcp-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 2px 0 10px; }
        .hcp-table th, .hcp-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid rgba(0,0,0,.06); }
        .hcp-table th { font-weight: 600; color: var(--ink-soft, #6f6551); }
        .hcp-table tr.win td { font-weight: 700; }
        .hcp-num { text-align: right !important; }
        .hcp-more { margin-top: 10px; width: 100%; padding: 8px; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--rule, #c9bb98); background: var(--paper-2, #efe6ce); color: inherit; font: inherit; }
        .hcp-empty { color: var(--ink-soft, #6f6551); padding: 8px 0; }
        @media (max-width: 480px) { .hcp-stats { grid-template-columns: repeat(2, 1fr); } }
    `;

    let overlay = null;
    let stack = [];             // profile ids opened from within a profile (for "Zurück")
    let current = null;         // { data, games: [] }

    function ensureOverlay() {
        if (overlay) return;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        overlay = document.createElement('div');
        overlay.id = 'hcp-overlay';
        overlay.innerHTML = `<div id="hcp-box" role="dialog" aria-modal="true" aria-labelledby="hcp-title">
            <div id="hcp-head">
              <button id="hcp-back" title="${tx('Zurück')}" style="display:none">← ${tx('Zurück')}</button>
              <span class="hcp-title" id="hcp-title">${tx('Spielerprofil')}</span>
              <button id="hcp-close" title="${tx('Schließen')}" aria-label="${tx('Schließen')}">×</button>
            </div>
            <div id="hcp-body"></div></div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        // A match opened: its statistics over the rounds (client/stats.js), loaded once.
        // 'toggle' does not bubble – caught on the way down.
        overlay.addEventListener('toggle', e => {
            const chart = e.target.open && e.target.querySelector && e.target.querySelector('.hcp-chart:empty');
            if (chart) STATS.loadInto(chart, chart.dataset.game);
        }, true);
        overlay.querySelector('#hcp-close').onclick = close;
        overlay.querySelector('#hcp-back').onclick = () => { stack.pop(); load(stack[stack.length - 1]); };
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && overlay.classList.contains('show')) { e.stopPropagation(); close(); }
        }, true);
    }

    function close() {
        if (overlay) overlay.classList.remove('show');
        stack = [];
        current = null;
    }

    /** HTML for a player name: clickable with an account, plain text without one. */
    function link(name, userId) {
        if (!userId || !UUID_RE.test(userId)) return esc(name);
        return `<a class="hcp-link" data-profile="${esc(userId)}" role="button" tabindex="0">${esc(name)}</a>`;
    }

    function open(userId) {
        if (!userId || !UUID_RE.test(userId)) return;
        ensureOverlay();
        // the language may have changed since the overlay was built
        const back = overlay.querySelector('#hcp-back'), closeBtn = overlay.querySelector('#hcp-close');
        back.title = tx('Zurück'); back.textContent = '← ' + tx('Zurück');
        overlay.querySelector('#hcp-title').textContent = tx('Spielerprofil');
        closeBtn.title = closeBtn.ariaLabel = tx('Schließen');
        if (!overlay.classList.contains('show')) stack = [];
        if (stack[stack.length - 1] !== userId) stack.push(userId);
        overlay.classList.add('show');
        load(userId);
    }

    async function api(userId, offset) {
        const res = await fetch(`/api/profile/${encodeURIComponent(userId)}${offset ? `?offset=${offset}` : ''}`, { cache: 'no-cache' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ? HC_I18N.tr(data.error) : tx('Profil konnte nicht geladen werden.'));
        return data;
    }

    async function load(userId) {
        const body = overlay.querySelector('#hcp-body');
        overlay.querySelector('#hcp-back').style.display = stack.length > 1 ? '' : 'none';
        body.innerHTML = `<p class="hcp-empty">${tx('Lade Profil …')}</p>`;
        try {
            const data = await api(userId);
            if (stack[stack.length - 1] !== userId) return;     // another profile was opened meanwhile
            current = { data, games: data.games.list };
            render();
        } catch (e) {
            body.innerHTML = `<p class="hcp-empty">${esc(e.message)}</p>`;
        }
    }

    function gameHtml(g, ownerId) {
        const result = g.replaced ? `<span class="hcp-res loss">${tx('Von der KI übernommen')}</span>`
            : g.won ? `<span class="hcp-res win">${tx('Sieg')}</span>` : `<span class="hcp-res loss">${tx('Niederlage')}</span>`;
        const shift = g.mmrShift == null ? ''
            : ` · <span class="hcp-shift ${g.mmrShift > 0 ? 'up' : g.mmrShift < 0 ? 'down' : ''}">${esc(fmtShift(g.mmrShift))} MMR</span>`;
        const type = (g.async ? tx('Rundenspiel') : tx('Live')) + (g.ranked ? ', ' + tx('gewertet') : '');
        const players = [...g.players].sort((a, b) => b.points - a.points);
        const rows = players.map(p => `<tr class="${p.isWinner ? 'win' : ''}">
                <td>${p.userId === ownerId ? esc(p.name) : link(p.name, p.userId)}${p.isBot ? ` <small>(${tx('Bot')})</small>` : ''}</td>
                <td>${esc(p.civ || '–')}</td>
                <td class="hcp-num">${p.scoreDetails ? esc(p.scoreDetails.pop) : '–'}</td>
                <td class="hcp-num">${p.scoreDetails ? esc(p.scoreDetails.wonders) : '–'}</td>
                <td class="hcp-num">${p.scoreDetails ? esc(p.scoreDetails.techs) : '–'}</td>
                <td class="hcp-num"><b>${esc(p.points)}</b></td>
                <td class="hcp-num">${esc(fmtShift(p.mmrShift))}</td></tr>`).join('');
        return `<details class="hcp-game">
            <summary>
              <span>${result}${shift}</span>
              <span class="hcp-sub">${esc(fmtDateTime(g.matchDate))}</span>
              <span class="hcp-meta">${esc(type)} · ${esc(g.civ || '–')} · ${tx('%s Punkte', esc(g.points))} · ${tx('%s Runden', esc(g.rounds))}</span>
            </summary>
            <div style="overflow-x:auto"><table class="hcp-table">
              <tr><th>${tx('Spieler')}</th><th>${tx('Nation')}</th><th class="hcp-num">${tx('Bev.')}</th><th class="hcp-num">${tx('Wunder')}</th>
                  <th class="hcp-num">${tx('Techs')}</th><th class="hcp-num">${tx('Punkte')}</th><th class="hcp-num">MMR Δ</th></tr>
              ${rows}</table></div>
            ${g.hasReplay ? `<p class="hcp-replay"><a href="/?replay=${esc(g.id)}" target="_blank" rel="noopener">▶ ${tx('Wiederholung ansehen')}</a></p>` : ''}
            ${g.hasStats && typeof STATS !== 'undefined' ? `<div class="hcp-chart" data-game="${esc(g.id)}"></div>` : ''}
          </details>`;
    }

    function render() {
        const { data, games } = current;
        const body = overlay.querySelector('#hcp-body');
        const total = data.games.total;
        const rate = total ? Math.round(100 * data.wins / total) + ' %' : '–';
        const avatar = data.avatarUrl
            ? `<img src="${esc(data.avatarUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
        body.innerHTML = `
            <div class="hcp-top">
              <div class="hcp-avatar">${esc((data.username || '?').charAt(0).toUpperCase())}</div>
              <div><div class="hcp-name">${esc(data.username)}</div>
                <div class="hcp-sub">${tx('Dabei seit %s', esc(fmtDate(data.memberSince)))}</div></div>
            </div>
            <div class="hcp-stats">
              <div class="hcp-stat"><b>${esc(data.mmr)}</b><span>MMR</span></div>
              <div class="hcp-stat"><b>${esc(total)}</b><span>${tx('Spiele')}</span></div>
              <div class="hcp-stat"><b>${esc(data.wins)}</b><span>${tx('Siege')}</span></div>
              <div class="hcp-stat"><b>${esc(rate)}</b><span>${tx('Siegquote')}</span></div>
            </div>
            <h3 class="hcp-h">${tx('Spiele')}</h3>
            ${games.length ? games.map(g => gameHtml(g, data.id)).join('') : `<p class="hcp-empty">${tx('Noch keine Spiele.')}</p>`}
            ${games.length < total ? `<button class="hcp-more" id="hcp-more">${tx('Weitere Spiele laden')}</button>` : ''}`;
        if (avatar) {
            const box = body.querySelector('.hcp-avatar');
            box.insertAdjacentHTML('beforeend', avatar);
            const img = box.querySelector('img');
            img.onload = () => { box.firstChild.textContent = ''; };
        }
        const more = body.querySelector('#hcp-more');
        if (more) more.onclick = async () => {
            more.disabled = true;
            more.textContent = tx('Lade …');
            try {
                const next = await api(data.id, games.length);
                if (!current || current.data.id !== data.id) return;
                current.games = games.concat(next.games.list);
                const scroll = body.scrollTop;
                render();
                body.scrollTop = scroll;
            } catch (e) {
                more.disabled = false;
                more.textContent = e.message;
            }
        };
    }

    // One handler for every clickable name, wherever it was rendered
    document.addEventListener('click', e => {
        const el = e.target.closest && e.target.closest('[data-profile]');
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        open(el.getAttribute('data-profile'));
    }, true);
    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest('[data-profile]');
        if (!el) return;
        e.preventDefault();
        open(el.getAttribute('data-profile'));
    });

    window.PROFILE = { open, link, close };
})();
