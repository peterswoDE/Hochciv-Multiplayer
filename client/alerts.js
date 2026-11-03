/**
 * Sound and tab alerts (F18): a short tone and, while the tab is in the background, a blinking
 * tab title for the moments a player waits for – the own turn, someone joining the lobby, every
 * player ready, the game starting, a ranked match found, a chat message.
 *
 * Loaded after mp.js (inject.js). The tones are synthesized with the Web Audio API (no files).
 * Browsers only allow sound after a first tap or key press on the page; until then a tone is
 * skipped, the title still blinks. The sound switch is kept per device ('hochciv.alerts.sound',
 * on by default) and shown in the game menu and the multiplayer menu.
 *
 *   ALERTS.notify(kind, title)   – tone of `kind`; blink `title` while the tab is hidden
 *   ALERTS.play(kind) / .blink(title) / .stopBlink()
 *   ALERTS.soundOn() / .setSound(on)
 *   ALERTS.log                   – the alerts of this page ({ kind, sound, blink }), for tests
 */
(function () {
    'use strict';
    if (window.ALERTS) return;

    const KEY = 'hochciv.alerts.sound';
    // [frequency Hz, start s, length s] – soft sine tones, quiet enough for a quiet room
    const TONES = {
        turn: [[659, 0, 0.14], [880, 0.15, 0.22]],
        join: [[587, 0, 0.12]],
        ready: [[587, 0, 0.1], [740, 0.11, 0.1], [880, 0.22, 0.2]],
        start: [[523, 0, 0.12], [659, 0.13, 0.12], [784, 0.26, 0.28]],
        match: [[784, 0, 0.12], [784, 0.14, 0.12], [1047, 0.28, 0.3]],
        chat: [[988, 0, 0.07]],
    };
    let ctx = null, blinkTimer = null, baseTitle = null;

    function audio() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (_) { ctx = null; }
        return ctx;
    }
    // the first gesture unlocks sound (autoplay rules)
    const unlock = () => { const a = audio(); if (a && a.state === 'suspended') a.resume().catch(() => { }); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

    const ALERTS = {
        log: [],

        soundOn: function () {
            try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return true; }
        },
        setSound: function (on) {
            try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (_) { }
            if (on) this.play('join');
            document.querySelectorAll('[data-alerts-sound]').forEach(el => { if ('checked' in el) el.checked = !!on; });
        },

        /** Plays the tone of `kind`; returns whether it could. */
        play: function (kind) {
            const tones = TONES[kind];
            if (!tones || !this.soundOn()) return false;
            const a = audio();
            if (!a || a.state !== 'running') return false;
            const t0 = a.currentTime + 0.02;
            for (const [f, at, len] of tones) {
                const osc = a.createOscillator(), gain = a.createGain();
                osc.type = 'sine';
                osc.frequency.value = f;
                gain.gain.setValueAtTime(0.0001, t0 + at);
                gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
                osc.connect(gain).connect(a.destination);
                osc.start(t0 + at);
                osc.stop(t0 + at + len + 0.05);
            }
            return true;
        },

        /** While the tab is hidden: the title alternates with `text` until the player is back. */
        blink: function (text) {
            if (!document.hidden || !text) return false;
            this.stopBlink();
            baseTitle = document.title;
            let on = false;
            const step = () => { on = !on; document.title = on ? text : baseTitle; };
            step();
            blinkTimer = setInterval(step, 1000);
            return true;
        },
        stopBlink: function () {
            if (blinkTimer) clearInterval(blinkTimer);
            blinkTimer = null;
            if (baseTitle != null) document.title = baseTitle;
            baseTitle = null;
        },

        notify: function (kind, title) {
            const entry = { kind, sound: this.play(kind), blink: this.blink(title), at: Date.now() };
            this.log.push(entry);
            if (this.log.length > 50) this.log.shift();
            return entry;
        },

        /** A checkbox for menus (the multiplayer menu); kept in step with the game menu's button. */
        checkboxHtml: function (label) {
            return `<label class="mph-sound"><input type="checkbox" data-alerts-sound ${this.soundOn() ? 'checked' : ''}
                onchange="ALERTS.setSound(this.checked)"> 🔔 ${label}</label>`;
        },
    };

    const back = () => { if (!document.hidden) ALERTS.stopBlink(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);

    window.ALERTS = ALERTS;
})();
