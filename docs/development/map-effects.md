# Map effects

`client/fx.js` (added to `index.html` by `inject.js`, as the last script) animates the game map in multiplayer without changing the game files:

| What | Effect |
|---|---|
| Event of the round | A banner with the event, plus an effect where it hits: rain and flooded coastal cities (Sturmflut), erupting volcano, burning forests, plague clouds, earthquake cracks and shaking, snow on mountains, barbarians closing in, … |
| Battle | Volleys fly from the attacking fields, an impact, then the outcome: cracks and fire when the field is taken, an explosion when it is destroyed, a shield in the defender's colour when the defence holds |
| New city | A column of light, a shock wave in the empire's colour, dust; the city drops in |
| Growing city | A glow, rising sparks and a floating `+n` (not in the game's own scenes, which show `+1` already) |
| Conquered city | A banner in the new owner's colour, smoke |

## How it works

- It wraps `drawMap` (outside the wrappers of `client/chat.js` and `client/mobile/mobile.js`) and compares every picture of `#map` with the one before: new cities, more population, another owner, a new `S.event`, a new `opts.fight`.
- Effects are drawn on a `<canvas class="hcfx-layer">` placed exactly over `#map`, with its size. Every frame, positions go from map coordinates to the canvas through the svg's `viewBox` and `preserveAspectRatio`, plus a transform on `#world` if there is one. So zooming and panning keep effects in place. `getCTM()` and `getScreenCTM()` are not used. On big screens the game zooms the page (`html{zoom}`), and browsers get both wrong under that zoom, each in its own way. Firefox's `getScreenCTM()` gives the scale without the zoom but the offset with it, and effects land fields away. `HCFX.toScreen(r, c)` gives the screen point an effect on a field uses. The test checks it, and the storm surge's pixels, against the map at several screen sizes, in Chrome/Edge and, if installed, Playwright's Firefox.
- The pop-in and bounce of a city are Web Animations on the city's circle; because `drawMap` rebuilds the SVG, they are put on the new elements again at the elapsed time.
- Big jumps (another game, a reload, jumping in a replay) start no effects.
- It does not change the game state or its timing: battles last `COMBAT_MS`, scenes `ANIM_MS`.
- Off with "Animationen: Keine", with `prefers-reduced-motion`, in hidden tabs and when the game's animations are off (`ANIM_MS = 0`, as in the game's tests).

Game globals it relies on are listed at the top of `client/fx.js`; a missing one only switches its effect off. After a game update, run `node tests/fx/fx.test.js` and look at the screenshots in `tests/fx/shots`.

In the browser console, `HCFX.cityFound(r, c, '#c33')`, `HCFX.battle({...}, S)` and `HCFX.playEvent(S)` play an effect by hand.
