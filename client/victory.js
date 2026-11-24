/**
 * The end of a game, full screen – loaded after mp.js (inject.js), which calls VICTORY.play()
 * from its gameOver() patch.
 *
 * A flash, an explosion in the winner's colour with gold sparks, a shock wave and a few
 * fireworks; on top "<name> gewinnt das Spiel" and, for a player of the game, whether they won.
 * After about three seconds it fades and leaves the engine's end screen (the result, the players,
 * statistics, replay …) as it was before. A tap or a key skips it.
 *
 * gameOver() runs on several paths (end of turn, a reloaded ended game, bot turns), so it plays
 * once per game: in memory for live and solo games, per device for Rundenspiele (localStorage),
 * which a player opens one last time from the game list to see who won (async/service.js).
 * Not in replays and not in the first game (the engine has its own end there).
 */
(function () {
    'use strict';
    if (window.VICTORY) return;
    const T = (de, ...a) => HC_I18N.t(de, ...a);
    const DURATION = 3200;          // ms until the end screen shows
    const FADE = 450;
    const GOLD = ['#fff6c8', '#ffe27a', '#f5c542', '#e8a317', '#ff8a1f'];

    const played = new Set();

    const css = `
    #victory { position:fixed; inset:0; z-index:100000; overflow:hidden; cursor:pointer;
      background:radial-gradient(ellipse at center, rgba(42,24,6,.95) 0%, rgba(8,5,2,.985) 72%);
      transition:opacity ${FADE}ms ease; -webkit-tap-highlight-color:transparent; }
    #victory.out { opacity:0; pointer-events:none; }
    #victory canvas { position:absolute; inset:0; width:100%; height:100%; }
    #victory .v-text { position:absolute; left:16px; right:16px; top:50%; transform:translateY(-50%);
      text-align:center; pointer-events:none; }
    #victory .v-name { font-family:var(--serif, Georgia, serif); font-weight:700; line-height:1.05;
      font-size:clamp(44px, 13vw, 120px); letter-spacing:.01em; overflow-wrap:anywhere;
      background:linear-gradient(180deg,#fffbe6 0%,#ffe27a 38%,#e8a317 62%,#b0670c 100%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      filter:drop-shadow(0 0 18px rgba(255,190,60,.55)) drop-shadow(0 4px 0 rgba(60,30,0,.8));
      opacity:0; transform:scale(2.6); }
    #victory .v-line { font-family:var(--serif, Georgia, serif); color:#fff3d6; font-size:clamp(20px, 5vw, 42px);
      margin-top:.35em; text-shadow:0 2px 12px rgba(0,0,0,.8); opacity:0; transform:translateY(24px); }
    #victory .v-me { display:inline-block; margin-top:1em; padding:.25em .9em; border-radius:999px;
      font-family:var(--sans, system-ui, sans-serif); font-weight:700; font-size:clamp(15px, 3.4vw, 22px);
      letter-spacing:.08em; text-transform:uppercase; opacity:0; }
    #victory .v-me.won { background:linear-gradient(135deg,#ffe27a,#e8a317); color:#3a2300; box-shadow:0 0 24px rgba(255,200,80,.6); }
    #victory .v-me.lost { background:rgba(255,255,255,.12); color:#e8dccb; border:1px solid rgba(255,255,255,.25); }
    #victory.go .v-name { animation:v-slam 700ms cubic-bezier(.2,1.6,.4,1) 380ms forwards; }
    #victory.go .v-line { animation:v-rise 500ms ease-out 900ms forwards; }
    #victory.go .v-me { animation:v-pop 450ms cubic-bezier(.2,1.8,.4,1) 1300ms forwards; }
    @keyframes v-slam { 0% { opacity:0; transform:scale(2.6); } 60% { opacity:1; transform:scale(.94); } 100% { opacity:1; transform:scale(1); } }
    @keyframes v-rise { to { opacity:1; transform:none; } }
    @keyframes v-pop { 0% { opacity:0; transform:scale(.4); } 100% { opacity:1; transform:scale(1); } }
    @keyframes v-shake { 0%,100% { transform:none; } 10% { transform:translate(-9px,5px); } 25% { transform:translate(8px,-7px); }
      40% { transform:translate(-6px,-4px); } 55% { transform:translate(5px,6px); } 70% { transform:translate(-3px,2px); } 85% { transform:translate(2px,-1px); } }
    #victory.shake { animation:v-shake 520ms ease-out 1; }
    @media (prefers-reduced-motion: reduce) {
      #victory.go .v-name, #victory.go .v-line, #victory.go .v-me { animation:v-rise 400ms ease-out forwards; transform:none; }
      #victory.shake { animation:none; }
    }`;

    /** Display names of the winners: the players' names in multiplayer, else "Du" / the empire. */
    function winnerNames(o, me) {
        const ids = o.winners || [o.winner];
        return ids.map(i => {
            const sp = S.players[i];
            if (!sp) return '?';
            const civ = typeof civOf === 'function' ? civOf(sp) : { n: sp.civ };
            if (typeof MP !== 'undefined' && MP.active) {
                const lp = MP.lobbyPlayerOf(sp);
                if (lp && lp.name) return lp.name;
            } else if (i === me && typeof MP !== 'undefined' && MP.user && MP.user.username) {
                return MP.user.username;
            }
            return civ.n;
        });
    }

    /** Our index in the game, or -1 (spectator, replay). */
    function myIndex() {
        if (typeof MP !== 'undefined' && MP.active) return MP.spectator || MP.playerIndex == null ? -1 : MP.playerIndex;
        return typeof soloHuman === 'function' ? soloHuman(S) : -1;
    }

    function gameKey() {
        const won = (S.over.winners || [S.over.winner]).join(',');
        if (typeof MP !== 'undefined' && MP.asyncId) return 'async:' + MP.asyncId;
        if (typeof MP !== 'undefined' && MP.active) return 'live:' + (MP.joinCode || '') + ':' + S.round + ':' + won;
        return 'solo';
    }
    const storeKey = k => 'hochciv.victory.' + k;
    function seen(k) {
        if (k === 'solo') return !!S.victoryShown;          // the local game keeps it (saved with S)
        if (played.has(k)) return true;
        if (!k.startsWith('async:')) return false;
        try { return localStorage.getItem(storeKey(k)) === '1'; } catch (_) { return false; }
    }
    function remember(k) {
        if (k === 'solo') { S.victoryShown = true; return; }
        played.add(k);
        if (!k.startsWith('async:')) return;
        try { localStorage.setItem(storeKey(k), '1'); } catch (_) { /* private window: only in memory */ }
    }

    // ── Particles ─────────────────────────────────────────────────────────────
    function burst(parts, x, y, n, speed, colors, opts) {
        const o = opts || {};
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = speed * (0.35 + Math.random() * 0.75);
            parts.push({
                x, y, px: x, py: y,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.lift || 0),
                life: 0, max: (o.life || 1.4) * (0.6 + Math.random() * 0.6),
                size: (o.size || 2.6) * (0.6 + Math.random() * 0.8),
                color: colors[(Math.random() * colors.length) | 0],
                drag: o.drag || 0.985, grav: o.grav == null ? 260 : o.grav,
            });
        }
    }

    function run(el, canvas, winColor) {
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0, H = 0;
        const size = () => {
            W = innerWidth; H = innerHeight;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        size();
        addEventListener('resize', size);
        const cx = () => W / 2, cy = () => H * 0.46;
        const parts = [], smoke = [];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const big = Math.max(W, H);
        const colors = GOLD.concat([winColor, winColor]);
        if (!reduced) {
            burst(parts, cx(), cy(), Math.min(320, Math.round(big / 3.5)), big * 0.95, colors, { life: 1.6, size: 3.2, lift: 40 });
            burst(parts, cx(), cy(), 90, big * 0.35, ['#ffffff', '#fff6c8'], { life: 0.7, size: 4, grav: 60 });
            for (let i = 0; i < 14; i++) {
                const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
                smoke.push({ x: cx(), y: cy(), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, r: 20 + Math.random() * 30, life: 0, max: 1.6 + Math.random() });
            }
        }
        // fireworks after the explosion, left and right of the text
        const later = reduced ? [] : [
            { t: 0.85, x: 0.2, y: 0.24 }, { t: 1.15, x: 0.8, y: 0.2 }, { t: 1.55, x: 0.32, y: 0.74 },
            { t: 1.9, x: 0.72, y: 0.7 }, { t: 2.3, x: 0.5, y: 0.16 },
        ];
        const t0 = performance.now();
        let last = t0, raf = 0;
        const frame = now => {
            const t = Math.max(0, (now - t0) / 1000), dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // the first frame can be stamped before t0
            last = now;
            while (later.length && later[0].t <= t) {
                const f = later.shift();
                const c = Math.random() < 0.5 ? winColor : GOLD[(Math.random() * GOLD.length) | 0];
                burst(parts, W * f.x, H * f.y, 70, big * 0.32, [c, '#fff6c8', GOLD[2]], { life: 1.2, size: 2.2, grav: 120 });
            }
            ctx.clearRect(0, 0, W, H);
            // light rays behind the name
            if (t > 0.3) {
                const a = Math.min(1, (t - 0.3) / 0.6) * 0.13;
                ctx.save();
                ctx.translate(cx(), cy());
                ctx.rotate(t * 0.25);
                for (let i = 0; i < 14; i++) {
                    ctx.rotate(Math.PI * 2 / 14);
                    const g = ctx.createLinearGradient(0, 0, big, 0);
                    g.addColorStop(0, `rgba(255,215,110,${a})`);
                    g.addColorStop(1, 'rgba(255,215,110,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(big, -big * 0.055); ctx.lineTo(big, big * 0.055); ctx.closePath(); ctx.fill();
                }
                ctx.restore();
            }
            if (!reduced) {
                // fireball
                if (t < 0.9) {
                    const k = t / 0.9, r = big * (0.08 + 0.32 * Math.sqrt(k));
                    const g = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), r);
                    g.addColorStop(0, `rgba(255,255,240,${1 - k})`);
                    g.addColorStop(0.35, `rgba(255,200,80,${0.85 * (1 - k)})`);
                    g.addColorStop(0.7, `rgba(230,90,20,${0.5 * (1 - k)})`);
                    g.addColorStop(1, 'rgba(120,30,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(cx(), cy(), r, 0, Math.PI * 2); ctx.fill();
                }
                // shock waves
                for (const [start, len, w] of [[0, 0.75, 10], [0.12, 0.9, 4]]) {
                    const k = (t - start) / len;
                    if (k <= 0 || k >= 1) continue;
                    ctx.strokeStyle = `rgba(255,230,160,${(1 - k) * 0.8})`;
                    ctx.lineWidth = w * (1 - k) + 1;
                    ctx.beginPath(); ctx.arc(cx(), cy(), big * 0.75 * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx.stroke();
                }
                // smoke
                for (const s of smoke) {
                    s.life += dt;
                    if (s.life > s.max) continue;
                    s.x += s.vx * dt; s.y += s.vy * dt; s.r += 40 * dt;
                    const a = 0.16 * (1 - s.life / s.max);
                    ctx.fillStyle = `rgba(60,40,25,${a})`;
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
                }
                // sparks with a short trail
                ctx.globalCompositeOperation = 'lighter';
                ctx.lineCap = 'round';
                for (const p of parts) {
                    p.life += dt;
                    if (p.life > p.max) continue;
                    p.px = p.x; p.py = p.y;
                    p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt;
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    const a = 1 - p.life / p.max;
                    ctx.globalAlpha = a;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size * (0.5 + a * 0.5);
                    ctx.beginPath(); ctx.moveTo(p.px - p.vx * dt * 2, p.py - p.vy * dt * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            }
            // the flash
            if (t < 0.35 && !reduced) {
                ctx.fillStyle = `rgba(255,250,235,${0.9 * (1 - t / 0.35)})`;
                ctx.fillRect(0, 0, W, H);
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
    }

    const VICTORY = {
        DURATION,
        /** The full-screen end of the game that just ended (S.over); once per game. */
        play: function () {
            if (typeof S === 'undefined' || !S || !S.over || S.fg) return false;
            if (typeof MP !== 'undefined' && MP.replay) return false;
            if (document.getElementById('victory')) return false;
            const key = gameKey();
            if (seen(key)) return false;
            remember(key);

            const o = S.over;
            const me = myIndex();
            const winners = o.winners || [o.winner];
            const names = winnerNames(o, me);
            const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const plural = names.length > 1;
            const nameLine = names.map(esc).join(' &amp; ');
            const line = plural ? T('gewinnen das Spiel') : T('gewinnt das Spiel');
            const sp = S.players[winners[0]];
            const civ = sp && typeof civOf === 'function' ? civOf(sp) : null;
            const winColor = (civ && civ.color) || GOLD[3];
            let meHtml = '';
            if (me >= 0) {
                meHtml = winners.includes(me)
                    ? `<div class="v-me won">🏆 ${esc(T('Sieg!'))}</div>`
                    : `<div class="v-me lost">${esc(T('Niederlage'))}</div>`;
            }

            if (!document.getElementById('victory-css')) {
                const st = document.createElement('style');
                st.id = 'victory-css';
                st.textContent = css;
                document.head.appendChild(st);
            }
            const el = document.createElement('div');
            el.id = 'victory';
            el.setAttribute('role', 'alert');
            el.innerHTML = `<canvas></canvas><div class="v-text">
                <div class="v-name">${nameLine}</div><div class="v-line">${esc(line)}</div>${meHtml}</div>`;
            document.body.appendChild(el);
            const stop = run(el, el.querySelector('canvas'), winColor);
            requestAnimationFrame(() => el.classList.add('go', 'shake'));
            if (typeof ALERTS !== 'undefined' && ALERTS.play) { try { ALERTS.play('win'); } catch (_) { /* no sound */ } }

            const shownAt = Date.now();
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                el.classList.add('out');
                setTimeout(() => { stop(); el.remove(); document.removeEventListener('keydown', onKey, true); }, FADE);
            };
            const skip = e => {
                if (Date.now() - shownAt < 350) return;        // the tap that ended the turn
                if (e) { e.preventDefault(); e.stopPropagation(); }
                finish();
            };
            const onKey = e => skip(e);
            el.addEventListener('click', skip);
            document.addEventListener('keydown', onKey, true);
            setTimeout(finish, DURATION);
            return true;
        },
    };
    window.VICTORY = VICTORY;
})();
