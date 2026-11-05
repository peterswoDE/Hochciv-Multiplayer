/**
 * The popup for the terms of use (server: utils/terms.js). Nothing behind it can be used until
 * it is answered. Loaded on the game page after mp.js (inject.js).
 *
 *   · accounts (website, Android app): after the login, kept with the account; declining logs out;
 *   · guests: when they open the multiplayer, kept on the device; declining goes back to the menu;
 *   · "Ablehnen" first says what it means, with the way back to agreeing;
 *   · Discord Activity: no site cookie, so the server asks before it gives a seat (HTTP 428) and
 *     activity/bridge.js calls CONSENT.ask() and stores the answer with the Discord login.
 *
 * Offline games need no consent: the app's offline copy has no mp.js and no popup.
 */
const CONSENT = {
    KEY: 'hochciv.terms',
    discord: /\.discordsays\.com$/.test(location.hostname),
    open: null,                 // the running question, a Promise of the answer
    busy: false,

    /** Shows the popup; resolves with true (agreed) or false (declined). */
    ask: function () {
        const declined = this.discord ? TX('Schließen')
            : MP.user ? TX('Abmelden und offline spielen') : TX('Offline spielen');
        if (this.open) return this.open;
        const box = document.createElement('div');
        box.id = 'mp-consent';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = `<div class="mp-consent-card">
            <h2>${TX('Nutzungsbedingungen und Datenschutz')}</h2>
            <p>${TX('Um online zu spielen, musst du unseren Regeln zustimmen. Beleidigende, diskriminierende, sexuelle oder rechtswidrige Inhalte sind verboten – in Namen, im Chat und auf veröffentlichten Karten. Verstöße können gemeldet werden und zur Sperrung führen.')}</p>
            <p class="mp-consent-links"><a href="/nutzungsbedingungen.html" target="_blank" rel="noopener">${TX('Nutzungsbedingungen')}</a>
                · <a href="/datenschutzerklaerung.html" target="_blank" rel="noopener">${TX('Datenschutzerklärung')}</a></p>
            <p class="mp-consent-small">${TX('Mit „Zustimmen“ akzeptierst du die Nutzungsbedingungen und bestätigst, dass du mindestens 13 Jahre alt bist. Die Datenschutzerklärung hast du zur Kenntnis genommen.')}</p>
            <div class="mp-consent-btns">
                <button type="button" class="btn" data-step="decline">${TX('Ablehnen')}</button>
                <button type="button" class="btn primary" data-answer="yes">${TX('Zustimmen')}</button>
            </div></div>
            <div class="mp-consent-card" hidden>
            <h2>${TX('Nicht zugestimmt')}</h2>
            <p>${TX('Ohne Zustimmung kannst du nicht online spielen: keine Live-Spiele, Rundenspiele, Rangliste oder Chat.')}</p>
            <div class="mp-consent-btns">
                <button type="button" class="btn" data-answer="no">${declined}</button>
                <button type="button" class="btn primary" data-answer="yes">${TX('Doch zustimmen')}</button>
            </div></div>`;
        document.body.appendChild(box);
        this.open = new Promise(resolve => {
            box.addEventListener('click', e => {
                if (e.target.closest('[data-step]')) {
                    box.querySelectorAll('.mp-consent-card').forEach(card => { card.hidden = !card.hidden; });
                    return;
                }
                const btn = e.target.closest('[data-answer]');
                if (!btn) return;
                box.remove();
                this.open = null;
                resolve(btn.dataset.answer === 'yes');
            });
        });
        return this.open;
    },

    /** Logged in, but not agreed to this version yet. */
    forUser: async function () {
        if (this.busy) return;
        this.busy = true;
        try {
            if (!(await this.ask())) {
                await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { });
                return location.reload();
            }
            const res = await fetch('/api/account/terms', { method: 'POST' });
            if (!res.ok) return toast(TXS('Das hat nicht geklappt. Bitte versuche es noch einmal.'));
            if (MP.user) MP.user.termsAccepted = true;
        } finally {
            this.busy = false;
        }
    },

    stored: function () {
        try { return localStorage.getItem(this.KEY); } catch (_) { return this.memory; }
    },
    store: function (version) {
        this.memory = version;
        try { localStorage.setItem(this.KEY, version); } catch (_) { }
    },

    /** A guest opens the multiplayer: waits for the answer, and never returns after a no. */
    forGuest: async function () {
        if (this.discord || MP.user) return;
        const res = await fetch('/api/auth/terms').catch(() => null);
        const version = res && res.ok ? (await res.json()).version : null;
        if (!version || this.stored() === version) return;
        if (await this.ask()) return this.store(version);
        location.reload();
        return new Promise(() => { });
    },
};

(function () {
    const fetchUser = MP.fetchUser;
    MP.fetchUser = async function () {
        await fetchUser.call(this);
        if (this.user && this.user.termsAccepted === false) CONSENT.forUser();
    };
    const showLobby = MP.showLobby;
    MP.showLobby = async function (tab) {
        await this.fetchUser();
        await CONSENT.forGuest();
        return showLobby.call(this, tab);
    };
    const style = document.createElement('style');
    style.textContent = `
        #mp-consent { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center;
            padding: 16px; background: rgba(42, 39, 33, .6); overflow-y: auto; }
        .mp-consent-card[hidden] { display: none; }
        .mp-consent-card { width: 100%; max-width: 460px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px;
            background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-radius: 12px; }
        .mp-consent-card h2 { margin: 0 0 10px; font-family: var(--serif); font-size: 22px; }
        .mp-consent-card p { margin: 0 0 12px; line-height: 1.45; }
        .mp-consent-links a { color: var(--red); }
        .mp-consent-small { font-size: 13px; color: var(--ink-soft); }
        .mp-consent-btns { display: flex; gap: 10px; }
        .mp-consent-btns .btn { flex: 1; }`;
    document.head.appendChild(style);
})();
