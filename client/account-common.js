/**
 * What the account page (account.html, account.js) and the admin page (admin.html, admin.js)
 * share: texts, escaping, the logged-in user and the top bar, the section navigation with a
 * link per section (account.html#history), and the dialog with a finished game's result.
 */

// Older game versions (public/vNN) still open the account page in an iframe – leave it
if (window.self !== window.top) {
    try { window.top.location.href = location.pathname + location.hash; } catch (_) { }
}

/** Escape text for use inside HTML (usernames, e-mails, player names, …). */
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Player name that opens the player profile (client/profile.js) when it belongs to an account. */
const nameLink = (name, userId) => window.PROFILE ? PROFILE.link(name, userId) : esc(name);
/* The page in the player's language (client/i18n.js): tx() for texts, txs() for server messages. */
const tx = (de, ...args) => HC_I18N.t(de, ...args);
const txs = msg => HC_I18N.tr(msg);

const ACC = {
    isAdmin: u => !!u && (u.role === 'admin' || u.role === 'superadmin'),

    /** The logged-in user, or null (then the page goes back to the game). */
    me: async function () {
        try {
            const res = await fetch('/api/auth/me');
            const data = res.ok ? await res.json() : null;
            return data && data.username ? data : null;
        } catch (_) { return null; }
    },

    /** Name and MMR in the top bar. */
    drawWho: function (user) {
        const el = document.getElementById('acc-who');
        if (el) el.innerHTML = `<b>${esc(user.username)}</b>${user.mmr != null ? ' · ' + esc(user.mmr) + ' MMR' : ''}`;
    },

    /**
     * Section navigation: a .nav-tab[data-target] shows its .tab-content. The section is in the
     * address (#history for tab-history, #running for tab-admin-running), so a link or a reload
     * opens it again. `onShow(id)` runs for every section that is opened.
     */
    tabs: function (onShow) {
        const tabs = [...document.querySelectorAll('.nav-tab')];
        const hashOf = id => id.replace(/^tab-(admin-)?/, '');
        const show = (tab, push) => {
            if (!tab || tab.hidden) return;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tab.dataset.target));
            if (push) history.replaceState(null, '', '#' + hashOf(tab.dataset.target));
            if (onShow) onShow(tab.dataset.target);
            if (push) window.scrollTo({ top: 0 });
            tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };
        tabs.forEach(tab => tab.addEventListener('click', () => show(tab, true)));
        const fromHash = () => {
            const h = location.hash.slice(1);
            show(tabs.find(t => !t.hidden && hashOf(t.dataset.target) === h) || tabs.find(t => !t.hidden), false);
        };
        window.addEventListener('hashchange', fromHash);
        return fromHash;          // call once the sections the user may see are visible
    },

    /** A dialog (.acc-modal): open, close with ✕, a click beside it or Escape. */
    openModal: function (id) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'flex';
    },
    closeModal: function (id) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    },

    /** A finished game: result table and (if recorded) the statistics over the rounds. */
    gameDetails: function (g, me) {
        if (!g) return;
        const sorted = [...g.participants].sort((a, b) => (b.points || 0) - (a.points || 0));
        const rows = sorted.map(x => {
            const isWinner = x.isWinner || (g.winnerUsername && (x.name === g.winnerUsername || x.dbUsername === g.winnerUsername));
            const d = x.scoreDetails || {};
            const shift = x.mmrShift != null ? (x.mmrShift > 0 ? `+${x.mmrShift}` : `${x.mmrShift}`) : '-';
            const color = x.mmrShift > 0 ? 'var(--ok)' : (x.mmrShift < 0 ? 'var(--red)' : 'inherit');
            return `<tr class="${isWinner ? 'won' : ''}"${me && x.dbUserId === me.id ? ' style="font-weight:600"' : ''}>
                <td>${nameLink(x.name, x.dbUserId)} ${x.isBot ? `<small>(${tx('Bot')})</small>` : ''}${isWinner ? ' 🏆' : ''}</td>
                <td>${esc(x.civ || '-')}</td>
                <td>${esc(d.pop != null ? d.pop : '-')}</td>
                <td>${esc(d.wonders != null ? d.wonders : '-')}</td>
                <td>${esc(d.techs != null ? d.techs : '-')}</td>
                <td><b>${esc(x.points || 0)}</b></td>
                <td style="color:${color}; font-weight:600;">${esc(shift)}</td>
            </tr>`;
        }).join('');
        const table = `<div class="acc-scroll"><table>
            <thead><tr><th>${tx('Spieler')}</th><th>${tx('Nation')}</th><th>${tx('Bev.')}</th><th>${tx('Wunder')}</th>
                <th>${tx('Techs')}</th><th>${tx('Punkte')}</th><th>MMR &Delta;</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
        const date = new Date(g.matchDate).toLocaleString(HC_I18N.locale());
        document.getElementById('hm-title').innerHTML = `${tx('Spielauswertung')} <small style="font-family:inherit; font-size:14px; font-weight:400; color:var(--ink-soft);">${esc(date)}</small>`;
        // the statistics over the rounds (client/stats.js): chart with a choice of values, key moments
        const withStats = g.stats && typeof STATS !== 'undefined';
        // the replay (F7), if one is stored – it opens in the game, in the version it was played with
        const replay = g.hasReplay ? `<p style="margin:10px 0 0"><a class="btn btn-ghost small" href="/?replay=${encodeURIComponent(g.id)}" target="_blank" rel="noopener">▶ ${tx('Wiederholung ansehen')}</a></p>` : '';
        document.getElementById('hm-body').innerHTML = table + replay + (withStats ? '<div id="hm-stats"></div>' : '');
        if (withStats) STATS.loadInto(document.getElementById('hm-stats'), g.id);
        ACC.openModal('history-modal');
    },
};

document.addEventListener('DOMContentLoaded', () => {
    // dialogs close with ✕, a click on the dark background or Escape (the re-confirm dialog
    // handles its own ✕: it has to answer the waiting request)
    document.querySelectorAll('.acc-modal').forEach(m => {
        m.addEventListener('click', e => {
            if (e.target === m && m.id !== 'reauth-modal') ACC.closeModal(m.id);
        });
        m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => ACC.closeModal(m.id)));
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.acc-modal').forEach(m => { if (m.id !== 'reauth-modal' && m.style.display === 'flex') ACC.closeModal(m.id); });
    });
});
