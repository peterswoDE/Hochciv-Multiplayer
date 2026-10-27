[← Documentation](../README.md)

# Testing

There are two kinds of tests: the game's own tests (in the game folder) and the server's end-to-end tests in `tests/`, which run against the local Docker setup.

## Game tests

In `HochCiv/` (or better, in the game repository before copying, see [Updating the game](updating-the-game.md)):

```bash
node test.js        # rules, KI, maps, translations, version hash
node smoke.js       # the real UI in jsdom: setup, turns, tutorial, first game, editor
```

`smoke.js` needs `jsdom` (`npm i jsdom` in a separate folder, then `NODE_PATH=<that folder>/node_modules node smoke.js`).

## Server tests

Each test is a plain Node script in `tests/<area>/` that talks to a running server, by default `http://localhost:3000` (pass another URL as the first argument). Its header lists exactly how to start the server for it. Common requirements:

* the local Docker setup running: `docker compose -f docker-compose.local.yml up -d --build`
* `npm i --no-save playwright-core` for the tests that drive a browser
* an installed Chrome or Edge – no browser is downloaded; set `HOCHCIV_BROWSER` to its path if it is not found

Tests create their own test accounts and delete them afterwards.

| Test | Covers | Server started with |
|---|---|---|
| `admin/running-games.test.js` | admin tab *Laufende Spiele* | default |
| `auth/google-app-login.test.js` | Android Google sign-in (`/api/auth/google/*`) | override file with a token stub (see header) |
| `chat/chat.test.js` | chat, emotes, pings, blocks | default |
| `filter/filter.test.js` | word filter, guests emote-only | `CHAT_MUTE_MS=4000` |
| `i18n/english.test.js` | every screen in English, no German left | default |
| `layout/hud.test.js` | multiplayer HUD layout on several screen sizes | default |
| `match/match.test.js` | ranked matchmaking | `MATCH_GROUP_WAIT_MS=3000 MATCH_CONFIRM_MS=5000` |
| `mobile/mobile.test.js` | mobile layer (touch, zoom, narrow layout) | default |
| `push/push.test.js` | push notifications | override file with an FCM stub (see header) |
| `rematch/rematch.test.js` | rematch of a live game | default |
| `replay/replay.test.js` | replays | default |
| `reports/reports.test.js` | chat reports and their admin tab | default |
| `score/win-bonus.test.js` | winner's bonus points | default |
| `security/security.test.js` | origin check, TOTP limits, auth fixes | default |
| `spectators/spectators.test.js` | spectator mode | default |
| `stats/stats.test.js` | post-game statistics | default |
| `summary/summary.test.js` | "since your last turn" | default |
| `timer/turn-timer.test.js` | turn timer of live games | `TURN_TIMER_SCALE=0.05 TURN_TIMER_AFK_AFTER=2` |

Environment variables for the server are passed from the shell when starting the container, e.g.:

```bash
MATCH_GROUP_WAIT_MS=3000 MATCH_CONFIRM_MS=5000 docker compose -f docker-compose.local.yml up -d
node tests/match/match.test.js
docker compose -f docker-compose.local.yml up -d     # back to the defaults
```

Some tests need the same variable on the test side too (`filter`, `timer`) – the header shows it.

## Which tests to run

| Change | Run |
|---|---|
| new game version | game tests, `mobile`, `layout`, `i18n`, `match`, `replay`, `rematch`, `summary`, `spectators`, `admin/running-games` |
| `client/mobile/` | `mobile` |
| new or changed texts | `i18n` |
| a feature from [TASKS.md](../../TASKS.md) | that feature's test (named in its section) |
| auth, origin check, sessions | `security`, `auth` |
