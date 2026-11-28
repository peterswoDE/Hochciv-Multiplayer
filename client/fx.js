/**
 * Map effects (Effekte) – a layer of animation over the game map, for multiplayer only.
 *
 * The game draws the map as a still picture (drawMap in js/ui/map.js) and replays battles and
 * the turns of others as a series of such pictures (playCombat, playAnim in js/ui/turns.js;
 * in multiplayer via client/scenes.js). This module leaves all of that as it is and adds motion
 * on top, on a canvas over the map (#map-host):
 *
 *   • events (Ereignisse): a banner with the event, and an effect where it hits – a storm surge
 *     floods the cities by the water, a volcano erupts, forests burn, the plague drifts over the
 *     cities …
 *   • battles: projectiles from the attacking fields, the impact, and how it ends (the field
 *     taken, destroyed, or the defence holding)
 *   • cities: a new city rises with a shock wave and dust, a growing one glows and counts up,
 *     a conquered one bursts in the colour of its new owner
 *
 * How it hooks in: drawMap is wrapped (like client/chat.js and client/mobile/mobile.js do). Every
 * picture of #map is compared with the one before: new cities, more population, another owner,
 * a new event, a new battle (opts.fight). Positions are kept in map coordinates and turned into
 * pixels every frame (from the svg's viewBox), so zooming and panning (mobile layer) keep the effects
 * in place, and so does a redraw of the map in between.
 *
 * Nothing here changes the game state or the timing of the game: battles still last COMBAT_MS,
 * scenes ANIM_MS. Off with the game's setting „Animationen: Keine", with reduced motion, and in
 * tests that switch the game's animations off (ANIM_MS = 0). Never throws into drawMap.
 *
 * Relies on these globals of the game: drawMap, hexCenter, hexPoints, HEX, civOf, S (optional),
 * prefs, ANIM_MS, COMBAT_MS, EVENT_BY_KEY, EVENT_TERRAIN, humanPlayers, hasWonder, neighbors,
 * terrainAt. Missing ones only switch the matching effect off.
 */
(function () {
    'use strict';
    if (window.HCFX || typeof window.drawMap !== 'function' || typeof hexCenter !== 'function' || typeof HEX === 'undefined') return;

    // ── When to play ─────────────────────────────────────────────────────────────

    const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function enabled() {
        if (reduced() || document.hidden) return false;
        // v102–v110 turn the page by 90° on phones (html.turn): the canvas would not follow the map
        if (document.documentElement.classList.contains('turn')) return false;
        try { if (typeof prefs !== 'undefined' && prefs && prefs.anim === 'aus') return false; } catch (e) { /* older versions */ }
        try { if (typeof ANIM_MS !== 'undefined' && ANIM_MS <= 0) return false; } catch (e) { /* older versions */ }
        return true;
    }
    const combatMs = () => { try { return typeof COMBAT_MS !== 'undefined' && COMBAT_MS > 0 ? COMBAT_MS : 1000; } catch (e) { return 1000; } };
    const slow = () => { try { return typeof prefs !== 'undefined' && prefs && prefs.anim === 'schnell' ? 1 : 1.25; } catch (e) { return 1.25; } };

    // ── Small helpers ────────────────────────────────────────────────────────────

    const TAU = Math.PI * 2;
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeIn = t => t * t * t;
    const span = (t, a, b) => clamp01((t - a) / (b - a));            // 0…1 within [a, b] of the effect
    const bell = t => Math.sin(Math.PI * clamp01(t));                // 0 → 1 → 0
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (list, n) => {
        if (list.length <= n) return list.slice();
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
        return out.slice(0, n);
    };
    const center = (r, c) => hexCenter(r, c, HEX);
    const colorOf = (S2, pi) => {
        try { return civOf(S2.players[pi]).color || '#b8860b'; } catch (e) { return '#b8860b'; }
    };
    function rgba(hex, a) {
        const h = /^#([0-9a-f]{6})$/i.exec(hex || '');
        if (!h) return `rgba(184,134,11,${a})`;
        const n = parseInt(h[1], 16);
        return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    }
    const HEX_PTS = typeof hexPoints === 'function' ? hexPoints(HEX) : null;
    // the outline of a field, in pixels
    function hexPath(ctx, P, k, x, y, scale) {
        ctx.beginPath();
        if (!HEX_PTS) { const [px, py] = P(x, y); ctx.arc(px, py, HEX * k * scale, 0, TAU); return; }
        HEX_PTS.forEach(([dx, dy], i) => {
            const [px, py] = P(x + dx * scale, y + dy * scale);
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
        ctx.closePath();
    }
    function emoji(ctx, ch, px, py, size, alpha) {
        if (alpha <= 0) return;
        ctx.globalAlpha = clamp01(alpha);
        ctx.font = `${Math.round(size)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, px, py);
        ctx.globalAlpha = 1;
    }
    function glow(ctx, px, py, radius, color, alpha) {
        if (alpha <= 0 || radius <= 0) return;
        const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
        g.addColorStop(0, rgba(color, alpha));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, radius, 0, TAU); ctx.fill();
    }
    // Particles in map coordinates: { x, y, vx, vy (map units per effect), g (gravity), size, color, a0, a1 (life within the effect) }
    function particles(ctx, P, k, list, t) {
        for (const p of list) {
            const u = span(t, p.a0, p.a1);
            if (u <= 0 || u >= 1) continue;
            const x = p.x + p.vx * u, y = p.y + p.vy * u + (p.g || 0) * u * u;
            const [px, py] = P(x, y);
            ctx.globalAlpha = (1 - u) * (p.alpha || 1);
            if (p.ch) { emoji(ctx, p.ch, px, py, p.size * k, (1 - u) * (p.alpha || 1)); continue; }
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(px, py, Math.max(0.5, p.size * k * (p.shrink ? 1 - u * 0.7 : 1)), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    function burst(x, y, n, opt) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = rand(0, TAU), v = rand(opt.v0 || 10, opt.v1 || 40);
            out.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (opt.flat || 1) - (opt.up || 0),
                g: opt.g || 0, size: rand(opt.s0 || 1.5, opt.s1 || 3), shrink: true,
                color: Array.isArray(opt.color) ? opt.color[i % opt.color.length] : opt.color,
                a0: (opt.a0 || 0) + rand(0, opt.jitter || 0), a1: opt.a1 || 1, ch: opt.ch,
            });
        }
        return out;
    }

    // ── The canvas and the frame loop ────────────────────────────────────────────

    let mapSvg = null, canvas = null, ctx = null, raf = 0;
    /* While a scene of another empire's turn is drawn: its object and how long it stays. The
       game shortens scenes when there are many (animFaktor), so effects started in a scene are
       cut to its length and end when the next one is drawn – otherwise they would still play at
       the last city while the game already shows the next. */
    let scene = null, sceneMs = 0;
    let effects = [];
    const MAX_EFFECTS = 60;

    function ensureLayer(svg) {
        mapSvg = svg;
        const host = svg.parentNode;
        if (!host) return false;
        if (canvas && canvas.parentNode === host) return true;
        if (canvas) canvas.remove();
        canvas = document.createElement('canvas');
        canvas.className = 'hcfx-layer';
        canvas.setAttribute('aria-hidden', 'true');
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.insertBefore(canvas, svg.nextSibling);
        ctx = canvas.getContext('2d');
        return !!ctx;
    }

    function add(effect) {
        if (!canvas || !ctx) return;
        if (effects.length >= MAX_EFFECTS) effects.shift();
        if (scene) { effect.scene = scene; effect.dur = Math.min(effect.dur, Math.max(350, sceneMs - (effect.delay || 0))); }
        effect.t0 = performance.now() + (effect.delay || 0);
        effects.push(effect);
        if (!raf) raf = requestAnimationFrame(frame);
    }

    /* Map → canvas, computed from the svg's viewBox and its size – not from getCTM() or
       getScreenCTM(): where the page is enlarged with CSS zoom (the game does that on big
       screens) browsers get those wrong, each in its own way (Firefox: the scale without the
       zoom but the offset with it; Chromium: getCTM's offset divided by the zoom). The canvas
       lies exactly over the svg and has its size (frame), so the svg's own coordinates are the
       canvas's: viewBox + preserveAspectRatio (+ a transform on #world) is all it takes. */
    function mapping(w, h) {
        const vb = mapSvg && mapSvg.viewBox && mapSvg.viewBox.baseVal;
        const box = canvas && canvas.getBoundingClientRect();
        if (!vb || !vb.width || !vb.height || !w || !h || !box || !box.width || !box.height) return null;
        const par = mapSvg.preserveAspectRatio && mapSvg.preserveAspectRatio.baseVal;
        let sx = w / vb.width, sy = h / vb.height, tx = 0, ty = 0;
        if (!par || par.align !== 1) {                      // 1 = none: stretched, no letterbox
            const s = par && par.meetOrSlice === 2 ? Math.max(sx, sy) : Math.min(sx, sy);
            const a = par ? par.align : 6;                  // 6 = xMidYMid (default)
            const fx = [0, 0, 0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1][a] ?? 0.5;
            const fy = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1][a] ?? 0.5;
            tx = (w - vb.width * s) * fx; ty = (h - vb.height * s) * fy;
            sx = sy = s;
        }
        // a transform on #world (the game sets none, a mod might)
        let g = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        try {
            const world = mapSvg.querySelector('#world');
            const t = world && world.transform && world.transform.baseVal.consolidate();
            if (t) g = t.matrix;
        } catch (e) { /* no SVG DOM */ }
        const zx = w / box.width, zy = h / box.height;     // canvas px per screen px (CSS zoom)
        return {
            P: (x, y) => {
                const X = g.a * x + g.c * y + g.e, Y = g.b * x + g.d * y + g.f;
                return [(X - vb.x) * sx + tx, (Y - vb.y) * sy + ty];
            },
            k: (sx * Math.hypot(g.a, g.b)) || 1,
            box, zx, zy,
        };
    }

    function frame(now) {
        raf = 0;
        if (!canvas || !mapSvg || !mapSvg.isConnected || !enabled()) { clear(); return; }
        const w = mapSvg.clientWidth, h = mapSvg.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        }
        // over the svg (SVG elements have no offsetLeft): the gap between the boxes, in unzoomed px
        const sr = mapSvg.getBoundingClientRect(), hr = canvas.parentElement.getBoundingClientRect();
        const zoom = (sr.width / w) || 1;
        canvas.style.left = ((sr.left - hr.left) / zoom - canvas.parentElement.clientLeft) + 'px';
        canvas.style.top = ((sr.top - hr.top) / zoom - canvas.parentElement.clientTop) + 'px';
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const map = mapping(w, h);
        if (map) {
            const { P, k } = map;
            const view = { w, h };
            effects = effects.filter(e => {
                const t = (now - e.t0) / e.dur;
                if (t >= 1) return false;
                if (t < 0) return true;
                ctx.save();
                try { e.draw(ctx, t, P, k, view); } catch (err) { console.warn('[FX]', err); ctx.restore(); return false; }
                ctx.restore();
                return true;
            });
        }
        if (effects.length) raf = requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, w, h);
    }

    function clear() {
        effects = [];
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Shaking the map: the svg moves, the canvas with it (it reads the svg's box every frame)
    function shake(strength, ms) {
        if (!mapSvg || !mapSvg.animate) return;
        const f = [];
        for (let i = 0; i <= 8; i++) {
            const s = strength * (1 - i / 8);
            f.push({ transform: i === 8 ? 'translate(0,0)' : `translate(${rand(-s, s).toFixed(1)}px,${rand(-s, s).toFixed(1)}px)` });
        }
        try { mapSvg.animate(f, { duration: ms, easing: 'linear' }); } catch (e) { /* no WAAPI */ }
    }

    // ── City pictures in the SVG: rise in, bounce ────────────────────────────────
    /* drawMap builds the city anew with every redraw, so the animation is kept here and put on
       the new elements again, continued where it was (currentTime). */
    const cityAnims = new Map();      // "r,c" → { kind, t0, dur }
    const CITY_FRAMES = {
        found: [
            { transform: 'translateY(-26px) scale(0.2)', opacity: 0 },
            { transform: 'translateY(0) scale(1.3)', opacity: 1, offset: 0.55 },
            { transform: 'translateY(0) scale(0.92)', offset: 0.75 },
            { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        grow: [
            { transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.35 },
            { transform: 'scale(0.95)', offset: 0.7 }, { transform: 'scale(1)' },
        ],
    };
    function animateCities(svg) {
        if (!cityAnims.size || !svg.animate) return;
        const now = performance.now();
        const circles = svg.querySelectorAll('#world circle[r="15"]');
        for (const [pos, a] of cityAnims) {
            const elapsed = now - a.t0;
            if (elapsed >= a.dur) { cityAnims.delete(pos); continue; }
            if (elapsed < 0) continue;
            const [x, y] = pos.split(',').map(Number);
            for (const c of circles) {
                if (Math.abs(+c.getAttribute('cx') - x) > 0.5 || Math.abs(+c.getAttribute('cy') - y) > 0.5) continue;
                const parts = [c];
                const label = c.nextElementSibling;
                if (label && label.tagName.toLowerCase() === 'text' && label.hasAttribute('data-pop')) parts.push(label);
                for (const el of parts) {
                    el.style.transformBox = 'view-box';
                    el.style.transformOrigin = `${x}px ${y}px`;
                    try { el.animate(CITY_FRAMES[a.kind], { duration: a.dur, easing: 'ease-out' }).currentTime = elapsed; } catch (e) { /* no WAAPI */ }
                }
            }
        }
    }

    // ── Effects: cities ──────────────────────────────────────────────────────────

    function cityFound(r, c, color) {
        const [x, y] = center(r, c);
        const dust = burst(x, y + 6, 22, { v0: 14, v1: 42, flat: 0.45, up: 6, g: 10, color: ['#b39b72', '#d2c19a', '#8d7a58'], s0: 1.4, s1: 3.2, a0: 0.25, a1: 0.95, jitter: 0.08 });
        const sparks = burst(x, y - 4, 12, { v0: 8, v1: 26, up: 30, g: -6, color: ['#ffe08a', '#fff6d0', color], s0: 1, s1: 2, a0: 0.3, a1: 1, jitter: 0.2 });
        cityAnims.set(`${x},${y}`, { kind: 'found', t0: performance.now(), dur: scene ? Math.min(900, Math.max(300, sceneMs * 0.8)) : 900 });
        add({
            dur: 1500 * slow(),
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                // the field lights up in the empire's colour
                hexPath(ctx, P, k, x, y, 1);
                ctx.fillStyle = rgba(color, 0.4 * bell(span(t, 0, 0.7)));
                ctx.fill();
                // a column of light comes down
                const beam = span(t, 0, 0.35), fade = 1 - span(t, 0.35, 0.8);
                if (fade > 0) {
                    const top = py - H * 4 * (1 - easeOut(beam)) - H * 0.4, bw = H * 0.55 * (0.4 + 0.6 * fade);
                    const g = ctx.createLinearGradient(px, top - H * 3, px, py);
                    g.addColorStop(0, 'rgba(255,240,190,0)');
                    g.addColorStop(1, `rgba(255,236,170,${0.75 * fade})`);
                    ctx.fillStyle = g;
                    ctx.fillRect(px - bw / 2, top - H * 3, bw, py - top + H * 3);
                }
                // the shock wave when it lands, twice
                for (const [a, b, w] of [[0.3, 0.85, 4], [0.42, 1, 2.5]]) {
                    const u = span(t, a, b);
                    if (u <= 0 || u >= 1) continue;
                    ctx.strokeStyle = rgba(color, 0.9 * (1 - u));
                    ctx.lineWidth = w * k * (1 - u * 0.5);
                    ctx.beginPath(); ctx.arc(px, py, H * (0.5 + 1.9 * easeOut(u)), 0, TAU); ctx.stroke();
                }
                glow(ctx, px, py, H * 1.4, '#fff3c4', 0.7 * bell(span(t, 0.28, 0.6)));
                particles(ctx, P, k, dust, t);
                particles(ctx, P, k, sparks, t);
            },
        });
    }

    function cityGrow(r, c, color, n, label) {
        const [x, y] = center(r, c);
        const motes = [];
        for (let i = 0; i < 10; i++) {
            const a = rand(0, TAU), d = rand(6, 16);
            motes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, vx: rand(-4, 4), vy: rand(-30, -18), size: rand(1.2, 2.2), color: i % 2 ? '#d7f5a0' : '#fff1a8', a0: rand(0, 0.3), a1: rand(0.7, 1) });
        }
        cityAnims.set(`${x},${y}`, { kind: 'grow', t0: performance.now(), dur: scene ? Math.min(650, Math.max(300, sceneMs * 0.8)) : 650 });
        add({
            dur: 1300 * slow(),
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                glow(ctx, px, py, H * 1.25, '#e9ff9a', 0.55 * bell(span(t, 0, 0.6)));
                const u = span(t, 0.05, 0.75);
                if (u > 0 && u < 1) {
                    ctx.strokeStyle = rgba(color, 0.8 * (1 - u));
                    ctx.lineWidth = 2.5 * k;
                    ctx.beginPath(); ctx.arc(px, py, H * (0.55 + 0.6 * easeOut(u)), 0, TAU); ctx.stroke();
                }
                particles(ctx, P, k, motes, t);
                if (label) {
                    const v = span(t, 0.05, 1);
                    const ty = py - H * (0.75 + 0.7 * easeOut(v));
                    ctx.globalAlpha = 1 - easeIn(v);
                    ctx.font = `800 ${Math.round(Math.max(13, 17 * k))}px system-ui,sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.lineWidth = 4; ctx.strokeStyle = '#f7f1e0'; ctx.lineJoin = 'round';
                    ctx.strokeText('+' + n, px + H * 0.55, ty);
                    ctx.fillStyle = color; ctx.fillText('+' + n, px + H * 0.55, ty);
                    ctx.globalAlpha = 1;
                }
            },
        });
    }

    function cityTaken(r, c, color) {
        const [x, y] = center(r, c);
        const smoke = burst(x, y, 14, { v0: 6, v1: 20, up: 26, g: -4, color: ['rgba(80,72,64,.55)', 'rgba(120,110,98,.5)'], s0: 3, s1: 6, a0: 0.1, a1: 1, jitter: 0.25 });
        const confetti = burst(x, y, 16, { v0: 18, v1: 44, up: 10, g: 22, color: [color, '#f7f1e0'], s0: 1.2, s1: 2.4, a0: 0.05, a1: 0.85 });
        add({
            dur: 1400 * slow(),
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                particles(ctx, P, k, smoke, t);
                hexPath(ctx, P, k, x, y, 1);
                ctx.strokeStyle = rgba(color, bell(span(t, 0, 0.8)));
                ctx.lineWidth = 5 * k;
                ctx.stroke();
                // a banner on a pole, in the new owner's colour
                const up = easeOut(span(t, 0.05, 0.4)), fade = 1 - span(t, 0.75, 1);
                if (fade > 0) {
                    ctx.globalAlpha = fade;
                    const bx = px + H * 0.1, top = py - H * (0.6 + 0.9 * up);
                    ctx.strokeStyle = '#2a2721'; ctx.lineWidth = 2 * k;
                    ctx.beginPath(); ctx.moveTo(bx, py - H * 0.3); ctx.lineTo(bx, top); ctx.stroke();
                    const wave = Math.sin(t * 18) * H * 0.06;
                    ctx.fillStyle = color;
                    ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx + H * 0.75, top + H * 0.18 + wave);
                    ctx.lineTo(bx, top + H * 0.42); ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
                particles(ctx, P, k, confetti, t);
            },
        });
    }

    // ── Effects: battles ─────────────────────────────────────────────────────────

    function battle(f, S2) {
        const att = colorOf(S2, f.pi), def = colorOf(S2, f.gegner);
        const [x, y] = center(f.r, f.c);
        const from = (f.von || []).slice(0, 6).map(([r, c]) => center(r, c));
        if (!from.length) from.push([x - HEX * 2, y - HEX]);
        const dur = Math.max(700, combatMs() - 60);
        const HIT = 0.38;
        const shots = [];
        from.forEach(([sx, sy], i) => {
            for (let j = 0; j < 3; j++) shots.push({ sx, sy, a0: 0.02 + j * 0.07 + i * 0.015, a1: HIT - 0.04 + j * 0.03 + i * 0.01, bend: rand(0.25, 0.5) });
        });
        const taken = !!f.genommen, razed = !!f.zerstoert, won = !!f.sieg;
        const sparks = burst(x, y, 34, { v0: 16, v1: 52, up: 6, g: 18, color: [att, def, '#ffd36b', '#fff4d4'], s0: 1, s1: 2.6, a0: HIT, a1: 0.85, jitter: 0.05 });
        const debris = won ? burst(x, y, 16, { v0: 10, v1: 30, up: 22, g: 40, color: ['#5b4a33', '#8a7454', '#3a3128'], s0: 1.5, s1: 3, a0: HIT + 0.02, a1: 0.95 }) : [];
        const smoke = (taken || razed) ? burst(x, y, razed ? 22 : 12, { v0: 4, v1: 18, up: 30, g: -6, color: ['rgba(60,55,50,.55)', 'rgba(100,92,84,.5)'], s0: 4, s1: 8, a0: HIT + 0.05, a1: 1, jitter: 0.2 }) : [];
        const flames = (taken || razed) ? burst(x, y, 14, { v0: 3, v1: 10, up: 18, g: -10, color: ['#ff9a2e', '#ffcf4a', '#e0451f'], s0: 1.6, s1: 3.2, a0: HIT + 0.08, a1: 1, jitter: 0.35 }) : [];
        setTimeout(() => shake(razed ? 7 : taken ? 5 : 3, 260), dur * HIT);
        add({
            dur,
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                // the attacking fields gather strength
                const charge = bell(span(t, 0, HIT + 0.05));
                for (const [sx, sy] of from) { const [qx, qy] = P(sx, sy); glow(ctx, qx, qy, H * 0.9, att, 0.5 * charge); }
                // the volleys fly in an arc onto the field
                for (const s of shots) {
                    const u = span(t, s.a0, s.a1);
                    if (u <= 0 || u >= 1) continue;
                    const mx = (s.sx + x) / 2, my = (s.sy + y) / 2 - Math.hypot(x - s.sx, y - s.sy) * s.bend;
                    const at = v => [(1 - v) * (1 - v) * s.sx + 2 * (1 - v) * v * mx + v * v * x, (1 - v) * (1 - v) * s.sy + 2 * (1 - v) * v * my + v * v * y];
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 5; i++) {
                        const v0 = Math.max(0, u - 0.06 * (i + 1)), v1 = Math.max(0, u - 0.06 * i);
                        const [ax, ay] = P(...at(v0)), [bx, by] = P(...at(v1));
                        ctx.strokeStyle = rgba(att, 0.85 * (1 - i / 5));
                        ctx.lineWidth = (3.4 - i * 0.5) * k;
                        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
                    }
                    const [hx, hy] = P(...at(u));
                    glow(ctx, hx, hy, 5 * k, '#fff4d4', 0.95);
                }
                // the impact
                const hit = span(t, HIT, HIT + 0.22);
                if (hit > 0 && hit < 1) {
                    glow(ctx, px, py, H * (0.8 + 1.6 * easeOut(hit)), '#fff7dc', 0.9 * (1 - hit));
                    ctx.strokeStyle = `rgba(255,244,212,${1 - hit})`;
                    ctx.lineWidth = 5 * k * (1 - hit);
                    ctx.beginPath(); ctx.arc(px, py, H * (0.4 + 2.2 * easeOut(hit)), 0, TAU); ctx.stroke();
                }
                if (t > HIT) emoji(ctx, '⚔️', px, py - H * (0.1 + 0.25 * span(t, HIT, 1)), H * (0.9 + 0.5 * easeOut(span(t, HIT, HIT + 0.15))), 1 - span(t, 0.62, 0.9));
                // how it ends
                const end = span(t, HIT + 0.12, 1);
                if (end > 0) {
                    if (won) {
                        // cracks run over the field
                        ctx.strokeStyle = `rgba(42,39,33,${0.8 * (1 - span(t, 0.8, 1))})`;
                        ctx.lineWidth = 2 * k;
                        for (let i = 0; i < 5; i++) {
                            const a = i * TAU / 5 + 0.4, len = HEX * 0.85 * easeOut(end);
                            ctx.beginPath();
                            let cx = x, cy = y;
                            ctx.moveTo(...P(cx, cy));
                            for (let s = 1; s <= 3; s++) {
                                cx = x + Math.cos(a + (s % 2 ? 0.25 : -0.2)) * len * s / 3;
                                cy = y + Math.sin(a + (s % 2 ? 0.25 : -0.2)) * len * s / 3;
                                ctx.lineTo(...P(cx, cy));
                            }
                            ctx.stroke();
                        }
                    } else {
                        // the defence holds: a shield of light in the defender's colour
                        const u = easeOut(end);
                        hexPath(ctx, P, k, x, y, 0.9 + 0.2 * u);
                        ctx.strokeStyle = rgba(def, 0.95 * (1 - span(t, 0.75, 1)));
                        ctx.lineWidth = (5 - 2 * u) * k;
                        ctx.stroke();
                        hexPath(ctx, P, k, x, y, 0.9);
                        ctx.fillStyle = rgba(def, 0.22 * bell(end));
                        ctx.fill();
                        emoji(ctx, '🛡️', px, py - H * 0.95, H * 0.85, bell(end) * 1.3);
                    }
                    if (taken || razed) emoji(ctx, razed ? '💥' : '🔥', px + H * 0.35, py - H * 0.55, H * (0.7 + 0.3 * bell(end)), 1 - span(t, 0.85, 1));
                }
                particles(ctx, P, k, smoke, t);
                particles(ctx, P, k, flames, t);
                particles(ctx, P, k, sparks, t);
                particles(ctx, P, k, debris, t);
            },
        });
    }

    // ── Effects: events ──────────────────────────────────────────────────────────

    const EVENT_ICON = {
        pest: '☠️', erdbeben: '🌋', piraterie: '🏴‍☠️', kriegsmuedigkeit: '🏳️', sturmflut: '🌊', duerre: '☀️',
        revolution: '✊', barbaren: '🪓', hochwasser: '💧', dunkles_zeitalter: '🕯️', vulkan: '🌋', waldbrand: '🔥',
        buergerkrieg: '💥', wirtschaftskrise: '📉', lawinen: '🏔️', hungersnot: '🌾', atomprotest: '☮️', blockade: '⚓',
    };
    const EVENT_TINT = {
        pest: '#4d6b2f', erdbeben: '#6b5a4c', piraterie: '#24404d', kriegsmuedigkeit: '#7d7a72', sturmflut: '#2f6f9a', duerre: '#c9822b',
        revolution: '#b02a2a', barbaren: '#8a2a1f', hochwasser: '#3d82b8', dunkles_zeitalter: '#1c1a24', vulkan: '#c2401c', waldbrand: '#d0601f',
        buergerkrieg: '#8f2f3f', wirtschaftskrise: '#6d6a5e', lawinen: '#9fb4c4', hungersnot: '#8c6a3a', atomprotest: '#3f7f5f', blockade: '#365a74',
    };

    const ALL_TILES = S2 => {
        const out = [];
        const rows = (S2.map && S2.map.rows) || [];
        rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) out.push([r, c, row[c]]); });
        return out;
    };
    function hitPlayers(S2, k) {
        let list = [];
        try { list = typeof humanPlayers === 'function' ? humanPlayers(S2) : S2.players.map((p, i) => i); } catch (e) { list = []; }
        return list.filter(pi => { try { return !(typeof hasWonder === 'function' && hasWonder(S2, pi, 'palast')); } catch (e) { return true; } });
    }
    const citiesOfAll = (S2, pis) => (S2.cities || []).filter(c => pis.includes(c.owner));
    function wetCity(S2, c) {
        try { return neighbors(c.r, c.c).some(([r, cc]) => ['M', 'F'].includes(terrainAt(S2, r, cc))); } catch (e) { return false; }
    }

    function banner(k, icon, tint) {
        let name = k, text = '';
        try { const d = EVENT_BY_KEY[k]; name = d.n; text = d.e || ''; } catch (e) { /* unknown event */ }
        add({
            dur: 3400,
            draw(ctx, t, P, kk, view) {
                const inn = easeOut(span(t, 0, 0.12)), out = span(t, 0.82, 1);
                const a = inn * (1 - out);
                if (a <= 0) return;
                const w = Math.min(view.w - 24, 460), y = 14 + (1 - inn) * -30 - out * 12;
                ctx.font = '700 20px system-ui,sans-serif';
                const lines = wrap(ctx, text, w - 40, '14px system-ui,sans-serif').slice(0, 3);
                const h = 50 + lines.length * 18;
                const x = (view.w - w) / 2;
                ctx.globalAlpha = a;
                ctx.fillStyle = 'rgba(28,25,22,.86)';
                roundRect(ctx, x, y, w, h, 12); ctx.fill();
                ctx.fillStyle = rgba(tint, 1);
                roundRect(ctx, x, y, 6, h, 3); ctx.fill();
                emoji(ctx, icon, x + 30, y + 26, 24, a);
                ctx.globalAlpha = a;
                ctx.fillStyle = '#f7f1e0';
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.font = '700 19px system-ui,sans-serif';
                ctx.fillText(name, x + 52, y + 26);
                ctx.font = '14px system-ui,sans-serif';
                ctx.fillStyle = 'rgba(247,241,224,.82)';
                lines.forEach((l, i) => ctx.fillText(l, x + 20, y + 54 + i * 18));
                ctx.globalAlpha = 1;
            },
        });
    }
    function wrap(ctx, text, width, font) {
        ctx.font = font;
        const out = [];
        let line = '';
        for (const word of String(text).split(/\s+/)) {
            const next = line ? line + ' ' + word : word;
            if (ctx.measureText(next).width > width && line) { out.push(line); line = word; } else line = next;
        }
        if (line) out.push(line);
        return out;
    }
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    // A tint pulsing over a set of fields, optionally with something rising from them
    function fieldsEffect(tiles, opt) {
        /* Every hit field gets the tint – a random part only looked patchy, as if the overlay sat
           beside the fields. `max` limits only what is drawn on top (opt.draw, opt.emit). */
        const list = tiles.slice(0, 1500);
        const deco = new Set(pick(list, opt.max || 40));
        const extra = [];
        if (opt.emit) deco.forEach(([r, c]) => { const [x, y] = center(r, c); extra.push(...opt.emit(x, y)); });
        add({
            dur: opt.dur || 2600,
            delay: opt.delay || 0,
            draw(ctx, t, P, k) {
                const a = bell(span(t, 0, 0.9));
                for (const tile of list) {
                    const [r, c] = tile, [x, y] = center(r, c);
                    hexPath(ctx, P, k, x, y, 0.96);
                    ctx.fillStyle = rgba(opt.color, (opt.alpha || 0.4) * a * (opt.flicker ? 0.75 + 0.25 * Math.sin(t * 40 + r * 3 + c) : 1));
                    ctx.fill();
                    if (opt.draw && deco.has(tile)) opt.draw(ctx, t, P, k, x, y, r, c);
                }
                particles(ctx, P, k, extra, t);
            },
        });
    }

    // Rain or snow over the whole map (screen space)
    function weather(kind, dur) {
        const drops = [];
        const n = kind === 'snow' ? 90 : 140;
        for (let i = 0; i < n; i++) drops.push({ x: Math.random(), y: Math.random(), v: rand(0.7, 1.3), l: rand(0.6, 1.2) });
        add({
            dur,
            draw(ctx, t, P, k, view) {
                const a = bell(span(t, 0, 1)) * (kind === 'snow' ? 0.9 : 0.55);
                ctx.strokeStyle = kind === 'snow' ? `rgba(255,255,255,${a})` : `rgba(190,220,240,${a})`;
                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.lineWidth = 1.3;
                for (const d of drops) {
                    const fall = (d.y + t * d.v * (kind === 'snow' ? 1.2 : 4)) % 1;
                    const x = ((d.x + fall * (kind === 'snow' ? 0.08 : 0.25)) % 1) * view.w, y = fall * view.h;
                    if (kind === 'snow') { ctx.beginPath(); ctx.arc(x + Math.sin(t * 9 + d.x * 20) * 4, y, 1.6 * d.l, 0, TAU); ctx.fill(); }
                    else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5 * d.l, y + 16 * d.l); ctx.stroke(); }
                }
            },
        });
    }

    function vignette(color, alpha, dur) {
        add({
            dur,
            draw(ctx, t, P, k, view) {
                const a = alpha * bell(span(t, 0, 1));
                const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.2, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
                g.addColorStop(0, rgba(color, a * 0.25));
                g.addColorStop(1, rgba(color, a));
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, view.w, view.h);
            },
        });
    }

    function emojiRain(cities, ch, opt) {
        const list = [];
        for (const ct of pick(cities, 16)) {
            const [x, y] = center(ct.r, ct.c);
            for (let i = 0; i < (opt.n || 3); i++)
                list.push({ x: x + rand(-12, 12), y: y + (opt.fall ? -40 : rand(-4, 6)), vx: rand(-6, 6), vy: opt.fall ? rand(36, 52) : rand(-34, -22), size: rand(11, 16), ch, a0: rand(0, 0.35), a1: rand(0.65, 1) });
        }
        add({ dur: opt.dur || 2600, delay: opt.delay || 0, draw(ctx, t, P, k) { particles(ctx, P, k, list, t); } });
    }

    function cityGlow(cities, color, opt) {
        const list = pick(cities, 20).map(ct => center(ct.r, ct.c));
        add({
            dur: opt.dur || 2400,
            draw(ctx, t, P, k) {
                for (const [x, y] of list) {
                    const [px, py] = P(x, y), H = HEX * k;
                    const pulse = 0.6 + 0.4 * Math.sin(t * (opt.speed || 14));
                    glow(ctx, px, py, H * (opt.size || 1.5), color, (opt.alpha || 0.6) * bell(span(t, 0, 1)) * pulse);
                }
            },
        });
    }

    function playEvent(S2, prev) {
        const k = S2.event && S2.event.k;
        if (!k) return;
        const icon = EVENT_ICON[k] || '❗', tint = EVENT_TINT[k] || '#b8860b';
        banner(k, icon, tint);
        const pis = hitPlayers(S2, k);
        const cities = citiesOfAll(S2, pis);
        const terrain = (typeof EVENT_TERRAIN !== 'undefined' && EVENT_TERRAIN[k]) || null;
        const tiles = letter => ALL_TILES(S2).filter(([, , t]) => t === letter).map(([r, c]) => [r, c]);
        switch (k) {
            case 'sturmflut': {
                weather('rain', 3000);
                vignette('#1d3f5c', 0.35, 3000);
                const wet = cities.filter(c => wetCity(S2, c));
                fieldsEffect(tiles('M'), { color: '#1f5a80', alpha: 0.35, max: 60, dur: 2800 });
                wet.forEach(ct => wave(ct.r, ct.c));
                emojiRain(wet, '💧', { n: 3, fall: true, delay: 300 });
                break;
            }
            case 'hochwasser':
                weather('rain', 2600);
                fieldsEffect(tiles('F'), { color: '#2f7fc4', alpha: 0.5, max: 50, draw: ripple });
                break;
            case 'piraterie':
                fieldsEffect(tiles('M'), { color: '#15303c', alpha: 0.45, max: 60 });
                emojiRain(pick(tiles('M'), 8).map(([r, c]) => ({ r, c })), '☠️', { n: 1 });
                break;
            case 'blockade':
                fieldsEffect(tiles('I'), { color: '#1d3448', alpha: 0.5, max: 30, emit: (x, y) => [{ x, y, vx: 0, vy: -20, size: 15, ch: '⚓', a0: 0.1, a1: 0.95 }] });
                break;
            case 'duerre':
                vignette('#c9822b', 0.3, 2800);
                fieldsEffect(tiles('G'), { color: '#d99a3a', alpha: 0.42, max: 60, draw: heat });
                break;
            case 'waldbrand':
                vignette('#7a2a0c', 0.25, 2800);
                fieldsEffect(tiles('W'), { color: '#e0581f', alpha: 0.4, max: 45, flicker: true, emit: (x, y) => flamesAt(x, y) });
                break;
            case 'lawinen':
                weather('snow', 3000);
                fieldsEffect(tiles('B'), { color: '#ffffff', alpha: 0.55, max: 45, emit: (x, y) => burst(x, y - 8, 4, { v0: 6, v1: 16, up: -18, g: 16, color: '#ffffff', s0: 1.4, s1: 2.6, a0: 0.1, a1: 0.9, jitter: 0.3 }) });
                break;
            case 'pest':
                vignette('#2c3a18', 0.35, 3000);
                miasma(cities);
                emojiRain(cities, '☠️', { n: 1, delay: 250 });
                break;
            case 'hungersnot':
                cityGlow(cities, '#8c6a3a', { alpha: 0.5, speed: 6 });
                emojiRain(cities, '🌾', { n: 2, fall: true });
                break;
            case 'wirtschaftskrise':
                vignette('#3a382f', 0.25, 2600);
                emojiRain(cities, '🪙', { n: 3, fall: true });
                break;
            case 'dunkles_zeitalter':
                vignette('#0c0a12', 0.6, 3400);
                emojiRain(capitals(S2, pis), '🕯️', { n: 1, dur: 3000 });
                break;
            case 'revolution': {
                const caps = capitals(S2, pis);
                cityGlow(caps, '#d0302a', { alpha: 0.75, speed: 20, size: 1.8 });
                emojiRain(caps, '✊', { n: 3 });
                caps.forEach(ct => {
                    const [x, y] = center(ct.r, ct.c);
                    const sparks = burst(x, y, 18, { v0: 14, v1: 34, up: 14, g: 14, color: ['#d0302a', '#ffcf4a'], a0: 0, a1: 0.9, jitter: 0.5 });
                    add({ dur: 2000, draw: (ctx, t, P, k) => particles(ctx, P, k, sparks, t) });
                });
                break;
            }
            case 'kriegsmuedigkeit': {
                const armies = (S2.armies || []).filter(a => pis.includes(a.owner));
                emojiRain(armies.length ? armies : cities, '🏳️', { n: 1 });
                break;
            }
            case 'atomprotest':
                emojiRain(capitals(S2, pis).concat(pick(cities, 6)), '☮️', { n: 2 });
                break;
            case 'erdbeben':
                shake(9, 900);
                setTimeout(() => shake(5, 600), 1000);
                quake(cities);
                break;
            case 'vulkan': {
                const before = prev && prev.rows;
                let spots = [];
                ALL_TILES(S2).forEach(([r, c, t]) => { if (t === 'V' && (!before || !before[r] || before[r][c] !== 'V')) spots.push([r, c]); });
                if (!spots.length) spots = tiles('V');
                shake(6, 700);
                spots.slice(0, 6).forEach(([r, c]) => eruption(r, c));
                break;
            }
            case 'buergerkrieg': {
                const gone = ((prev && prev.armies) || []).filter(a => pis.includes(a.owner) && !(S2.armies || []).some(b => b.id === a.id));
                const spots = gone.length ? gone : cities;
                pick(spots, 14).forEach((a, i) => explosion(a.r, a.c, i * 120));
                shake(4, 500);
                break;
            }
            case 'barbaren': {
                const forces = (S2.barbs || []).map(f => (S2.cities || []).find(c => c.id === f.cityId)).filter(Boolean);
                forces.forEach(ct => horde(ct.r, ct.c));
                break;
            }
            default:
                if (terrain) fieldsEffect(tiles(terrain), { color: tint, alpha: 0.4 });
                else cityGlow(cities, tint, {});
        }
    }
    const capitals = (S2, pis) => (S2.cities || []).filter(c => c.cap && pis.includes(c.owner));

    function ripple(ctx, t, P, k, x, y, r, c) {
        const u = (t * 2.2 + (r * 7 + c * 3) % 10 / 10) % 1;
        const [px, py] = P(x, y);
        ctx.strokeStyle = `rgba(220,240,255,${0.7 * (1 - u) * bell(t)})`;
        ctx.lineWidth = 1.6 * k;
        ctx.beginPath(); ctx.ellipse(px, py, HEX * k * 0.75 * u, HEX * k * 0.4 * u, 0, 0, TAU); ctx.stroke();
    }
    function heat(ctx, t, P, k, x, y, r, c) {
        ctx.strokeStyle = `rgba(255,236,190,${0.55 * bell(t)})`;
        ctx.lineWidth = 1.4 * k;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            for (let s = 0; s <= 8; s++) {
                const yy = y + HEX * 0.45 - s * HEX * 0.11, xx = x + i * HEX * 0.35 + Math.sin(t * 20 + s + r + c) * 2.4;
                const [px, py] = P(xx, yy);
                if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            }
            ctx.stroke();
        }
    }
    const flamesAt = (x, y) => burst(x, y + 4, 5, { v0: 2, v1: 7, up: 26, g: -8, color: ['#ff9a2e', '#ffcf4a', '#e0451f'], s0: 1.6, s1: 3, a0: 0, a1: 1, jitter: 0.6 })
        .concat(burst(x, y - 6, 2, { v0: 2, v1: 6, up: 34, g: -4, color: 'rgba(70,60,52,.45)', s0: 4, s1: 6, a0: 0.15, a1: 1, jitter: 0.4 }));

    function wave(r, c) {
        const [x, y] = center(r, c);
        const spray = burst(x, y, 16, { v0: 10, v1: 28, up: 20, g: 30, color: ['#e3f3ff', '#9fd0ee'], s0: 1.2, s1: 2.4, a0: 0.35, a1: 0.95, jitter: 0.1 });
        add({
            dur: 2600,
            delay: rand(0, 300),
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                for (let i = 0; i < 3; i++) {
                    const u = span(t, 0.1 + i * 0.12, 0.7 + i * 0.1);
                    if (u <= 0 || u >= 1) continue;
                    ctx.strokeStyle = `rgba(160,210,240,${0.9 * (1 - u)})`;
                    ctx.lineWidth = 4 * k * (1 - u);
                    ctx.beginPath(); ctx.arc(px, py, H * (0.4 + 1.5 * u), Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
                }
                const fill = bell(span(t, 0.2, 0.95));
                hexPath(ctx, P, k, x, y, 1);
                ctx.fillStyle = `rgba(47,111,154,${0.5 * fill})`;
                ctx.fill();
                particles(ctx, P, k, spray, t);
            },
        });
    }
    function miasma(cities) {
        const clouds = [];
        for (const ct of pick(cities, 18)) {
            const [x, y] = center(ct.r, ct.c);
            for (let i = 0; i < 4; i++) clouds.push({ x: x + rand(-14, 14), y: y + rand(-10, 10), vx: rand(-14, 14), vy: rand(-12, 2), size: rand(7, 12), color: i % 2 ? 'rgba(96,128,48,.45)' : 'rgba(54,72,30,.4)', a0: rand(0, 0.3), a1: rand(0.75, 1) });
        }
        add({ dur: 3000, draw(ctx, t, P, k) { particles(ctx, P, k, clouds, t); } });
    }
    function quake(cities) {
        const list = pick(cities, 12).map(ct => ({ at: center(ct.r, ct.c), arms: [0, 1, 2, 3].map(() => ({ a: rand(0, TAU), len: rand(0.6, 1.1) })) }));
        add({
            dur: 2600,
            draw(ctx, t, P, k) {
                const grow = easeOut(span(t, 0.05, 0.4)), fade = 1 - span(t, 0.75, 1);
                ctx.strokeStyle = `rgba(42,39,33,${0.85 * fade})`;
                ctx.lineWidth = 2.2 * k;
                for (const { at: [x, y], arms } of list) {
                    for (const arm of arms) {
                        ctx.beginPath();
                        ctx.moveTo(...P(x, y));
                        for (let s = 1; s <= 4; s++) {
                            const d = HEX * arm.len * grow * s / 4, a = arm.a + (s % 2 ? 0.3 : -0.3);
                            ctx.lineTo(...P(x + Math.cos(a) * d, y + Math.sin(a) * d));
                        }
                        ctx.stroke();
                    }
                }
            },
        });
        list.forEach(({ at: [x, y] }) => add({ dur: 1800, draw: (dust => (ctx, t, P, k) => particles(ctx, P, k, dust, t))(burst(x, y, 10, { v0: 8, v1: 24, flat: 0.5, up: 6, g: 8, color: ['#b39b72', '#8d7a58'], s0: 2, s1: 4, a0: 0, a1: 1 })) }));
    }
    function eruption(r, c) {
        const [x, y] = center(r, c);
        const lava = burst(x, y - 6, 40, { v0: 18, v1: 60, up: 70, g: 110, color: ['#ff6a1a', '#ffb02e', '#d02a10', '#fff0a0'], s0: 1.4, s1: 3.2, a0: 0.05, a1: 0.8, jitter: 0.25 });
        const smoke = burst(x, y - 10, 18, { v0: 4, v1: 16, up: 50, g: -10, color: ['rgba(50,44,40,.6)', 'rgba(90,82,76,.5)'], s0: 6, s1: 11, a0: 0.1, a1: 1, jitter: 0.3 });
        add({
            dur: 3000,
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                glow(ctx, px, py, H * 2, '#ff6a1a', 0.75 * bell(span(t, 0, 0.8)) * (0.8 + 0.2 * Math.sin(t * 50)));
                hexPath(ctx, P, k, x, y, 1);
                ctx.fillStyle = `rgba(208,42,16,${0.55 * bell(span(t, 0, 1))})`;
                ctx.fill();
                particles(ctx, P, k, smoke, t);
                particles(ctx, P, k, lava, t);
            },
        });
    }
    function explosion(r, c, delay) {
        const [x, y] = center(r, c);
        const bits = burst(x, y, 18, { v0: 14, v1: 40, up: 10, g: 30, color: ['#ff9a2e', '#ffd36b', '#5b4a33'], a0: 0, a1: 0.8 });
        add({
            dur: 1300, delay,
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                glow(ctx, px, py, H * (0.6 + 1.2 * easeOut(span(t, 0, 0.4))), '#ffb02e', 0.85 * (1 - span(t, 0, 0.6)));
                emoji(ctx, '💥', px, py, H * (0.6 + 0.6 * easeOut(span(t, 0, 0.3))), 1 - span(t, 0.5, 1));
                particles(ctx, P, k, bits, t);
            },
        });
    }
    function horde(r, c) {
        const [x, y] = center(r, c);
        const axes = [];
        for (let i = 0; i < 7; i++) {
            const a = rand(0, TAU), d = HEX * rand(2.5, 3.5);
            axes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 0.85, vy: -Math.sin(a) * d * 0.85, size: 15, ch: '🪓', a0: i * 0.04, a1: 0.65 + i * 0.03 });
        }
        add({
            dur: 2800,
            draw(ctx, t, P, k) {
                const [px, py] = P(x, y), H = HEX * k;
                const pulse = 0.6 + 0.4 * Math.sin(t * 24);
                hexPath(ctx, P, k, x, y, 1.05);
                ctx.strokeStyle = `rgba(160,30,20,${0.9 * bell(t) * pulse})`;
                ctx.lineWidth = 5 * k;
                ctx.stroke();
                glow(ctx, px, py, H * 1.6, '#b0281c', 0.45 * bell(t) * pulse);
                particles(ctx, P, k, axes, t);
            },
        });
    }

    // ── Watching the pictures of #map ────────────────────────────────────────────

    let base = null;          // what the last picture showed: { cities: Map(id → {r,c,pop,owner}), armies, rows, n }
    let lastFight = null, lastEvent = null;

    function snapshotOf(S2) {
        const cities = new Map();
        (S2.cities || []).forEach(c => cities.set(c.id, { r: c.r, c: c.c, pop: c.pop, owner: c.owner }));
        return {
            cities,
            armies: (S2.armies || []).map(a => ({ id: a.id, r: a.r, c: a.c, owner: a.owner })),
            rows: S2.map && S2.map.rows ? S2.map.rows.slice() : null,
            players: (S2.players || []).length,
        };
    }

    // how long the game shows a scene (animFrame in js/ui/turns.js)
    function sceneLength(s) {
        let ms = 900;
        try { ms = ANIM_MS; } catch (e) { /* older versions */ }
        return Math.round(ms * (s.tempo || 1) * (s.zuege && s.zuege.length ? 1.4 : 1));
    }

    function compare(S2, opts) {
        const now = snapshotOf(S2);
        const prev = base;
        base = now;
        if (!prev || prev.players !== now.players || !prev.rows || !now.rows || prev.rows.length !== now.rows.length) return prev;
        const found = [], grown = [], taken = [];
        for (const [id, c] of now.cities) {
            const was = prev.cities.get(id);
            if (!was) found.push(c);
            else if (was.owner !== c.owner) taken.push(c);
            else if (c.pop > was.pop) grown.push([c, c.pop - was.pop]);
        }
        // a whole new picture (another game, a reload, a jump back in a replay): no effects
        if (found.length > 4 || grown.length > 12 || taken.length > 4) return prev;
        const inScene = !!opts.anim;
        if (window.HCFX && typeof HCFX.trace === 'function')
            try { HCFX.trace({ found, taken, grown: grown.map(([c]) => c), opts }); } catch (e) { /* debugging only */ }
        scene = opts.anim || null;
        sceneMs = scene ? sceneLength(scene) : 0;
        found.forEach(c => cityFound(c.r, c.c, colorOf(S2, c.owner)));
        taken.forEach(c => cityTaken(c.r, c.c, colorOf(S2, c.owner)));
        // the game's own scenes show +1 already: there only the glow
        grown.forEach(([c, n]) => cityGrow(c.r, c.c, colorOf(S2, c.owner), n, !inScene));
        scene = null;
        return prev;
    }

    function eventKey(S2) {
        const e = S2.event;
        if ('ev' in S2 && !S2.ev) return null;          // events switched off (like curEvent in js/ui/world.js)
        return e && e.k && e.round === S2.round ? `${e.round}:${e.k}:${(S2.players || []).map(p => p.civ).join(',')}` : null;
    }

    function onDraw(svg, opts) {
        if (!svg || svg.id !== 'map' || !opts || !opts.state) return;
        const S2 = opts.state;
        if (!S2.cities || !S2.players) return;
        if (!enabled()) { base = snapshotOf(S2); lastEvent = eventKey(S2) || lastEvent; clear(); cityAnims.clear(); return; }
        if (!ensureLayer(svg)) return;
        if (opts.fight) {
            // a battle picture shows the map before the battle: not a step back in time
            // combatDraw builds a new fight object with every redraw: the same battle by its content
            const f = opts.fight;
            const fk = [f.r, f.c, f.pi, f.gegner, f.a, f.d, f.zug, f.caption].join('|');
            if (fk !== lastFight && f.r != null) { lastFight = fk; battle(f, S2); }
        } else {
            lastFight = null;
            // a new scene, or the game after the scenes: what the scene before started ends here
            const cur = opts.anim || null;
            if (effects.some(e => e.scene && e.scene !== cur)) effects = effects.filter(e => !e.scene || e.scene === cur);
            const prev = compare(S2, opts);
            if (!opts.anim) {
                const ek = eventKey(S2);
                if (ek && ek !== lastEvent) { lastEvent = ek; playEvent(S2, prev); }
            }
        }
        animateCities(svg);
    }

    const origDrawMap = window.drawMap;
    window.drawMap = function (svg, map, opts) {
        const out = origDrawMap.apply(this, arguments);
        try { onDraw(svg, opts); } catch (e) { console.warn('[FX]', e); }
        return out;
    };

    const style = document.createElement('style');
    style.textContent = '.hcfx-layer{position:absolute;pointer-events:none;z-index:2;left:0;top:0}';
    (document.head || document.documentElement).appendChild(style);

    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });

    window.HCFX = {
        // for tests and trying effects out in the console
        cityFound, cityGrow, cityTaken, battle, playEvent,
        get active() { return effects.length; },
        clear,
        // where an effect on field r,c lands on the screen (tests: it must be the city's spot)
        toScreen(r, c) {
            if (!mapSvg || !canvas) return null;
            const map = mapping(mapSvg.clientWidth, mapSvg.clientHeight);
            if (!map) return null;
            const [x, y] = map.P(...center(r, c));
            return [map.box.left + x / map.zx, map.box.top + y / map.zy];
        },
    };
})();
