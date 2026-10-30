[← Documentation](../README.md)

# Architecture

Node.js (Express, Socket.IO, Passport), PostgreSQL through Sequelize. The big picture is in [How it works](../overview/how-it-works.md); this page maps the code.

## Server

| Path | Purpose |
|---|---|
| `server.js` | Entry point: gzip, security headers, origin check, static files (before the session, so the page's files cost no database queries; hashed files cached for a year), sessions (stored in PostgreSQL via `connect-pg-simple`), Passport, routes, Socket.IO, database sync |
| `config.js` | Central settings: port, `BASE_URL` (checked at startup), WebAuthn origin, limits, turn-timer factors |
| `engine-adapter.js` | Loads the game engine into Node (one sandbox per game version, `GAME_DIRS`) and wraps it: new game, apply/validate actions, KI turns, start-tile placement, Marathon draft, the per-player view of the state, custom-map check |
| `sessions.js` | In-memory store of live lobbies and games: create, join, spectate, kick, config, rematch reset, public list, cleanup |
| `sockets/game.js` | Live games over Socket.IO: lobby, start, moves, placement, draft, chat, turn timer, rematch, reconnects, game end (results, MMR, statistics, replay) |
| `sockets/async.js` | Socket.IO side of Rundenspiele: open a game, send actions, chat |
| `sockets/match.js` | Ranked matchmaking queue (in memory) |
| `async/logic.js` | Rules of the Rundenspiel meta game on a plain object: seats, invitations, pre-phases, KI fill-in, timeouts – no database, no sockets |
| `async/service.js` | Rundenspiele persistence: one change at a time per game, save after every action, live updates, notifications, MMR, reminder/timeout sweep |
| `maps/service.js` | Custom maps in the account: save (checked with the engine's `checkCustomMap`), publish with a code, load by code |
| `routes/` | REST API – see [REST API](rest-api.md) |
| `models/` | Database models – see [Database](database.md) |
| `elevate.js` | Command-line tool to assign admin roles |
| `scripts/` | `build-public.js` (game folders → `public/`), `dedupe-constraints.js` (database cleanup) |
| `inject.js` | Adds the multiplayer scripts to each copy's `index.html` and writes the content hash into every script and stylesheet tag |
| `entrypoint.sh`, `Dockerfile` | Container start (build `public/`, start the server) and image build (including the Activity bundle) |

### `utils/`

| File | Purpose |
|---|---|
| `auth.js` | Login guard, the user object sent to the client, input validation, one-time codes, recent-login check |
| `oauth.js`, `discordStrategy.js` | Google/Discord login strategies from the database configuration |
| `totp.js`, `webauthn.js` | Authenticator codes; passkey relying party from `BASE_URL` |
| `origin.js` | Which web pages may use a visitor's login ([Security](security.md#origin-check)) |
| `mailer.js` | E-mail through SMTP, or to the log |
| `notify.js`, `push.js` | Rundenspiel notifications: e-mail and push channels |
| `mmr.js`, `score.js` | MMR calculation and end-of-game points ([Points and MMR](ranking.md)) |
| `chat.js`, `profanity.js`, `reports.js` | Chat messages and rate limit, word filter, reports and blocks |
| `stats.js`, `summary.js`, `replay.js` | Statistics over the rounds, "since your last turn", replays |
| `assets.js` | Content hashes of the page's scripts and styles (`inject.js`), and whether a request may be cached for a year (`server.js`) |
| `scenes.js` | What happened as scenes for the clients (actions and battles as a chain of map diffs) |
| `deleteAccount.js`, `detachUser.js`, `rename.js`, `mergeAccounts.js` | Deleting/banning accounts, removing names from game states, merging Discord Activity accounts |
| `serverState.js` | Maintenance mode, registration switch, metrics (in memory) |

## Browser

| Path | Purpose |
|---|---|
| `HochCiv/`, `HochCiv-v96/`, `HochCiv-v93/`, `HochCiv-v83/` | The game (current version, and old versions for Rundenspiele started on them) |
| `mp.js` | Multiplayer client injected into the game: hooks the game's actions, lobby, login, Rundenspiele, HUD, spectators, end screen |
| `client/i18n.js` | English texts of everything the server adds ([Languages](../development/languages.md)) |
| `client/chat.js` | In-game chat panel |
| `client/stats.js`, `client/replay.js` | Post-game statistics, replay viewer (`?replay=<id>`) |
| `client/scenes.js` | Plays what the others did on the map (also the diff code `utils/scenes.js` uses) |
| `client/profile.js` | Player profiles |
| `client/matchmaking.js` | Ranked matchmaking UI |
| `client/mobile/` | [Mobile layer](../development/mobile-layer.md) |
| `client/account.html`, `account.js` | Account page and admin panel |
| `client/passkey.js` | Passkey helpers and the wrong-address message |
| `client/index.html`, `app.js`, `style.css` | Portal page |
| `client/*.html` (legal) | Impressum, Datenschutzerklärung, Nutzungsbedingungen |
| `activity/bridge.js`, `activity/build.js` | Discord Activity bridge and its bundler ([Discord Activity](../operations/discord-activity.md)) |

`public/` is generated (gitignored) – never edit it.

## Request paths

| Path | Served from |
|---|---|
| `/` | `public/` (current game with the injected scripts) |
| `/v96/`, `/v93/`, `/v83/` | `public/<version>/` |
| `/client/…` | `client/` |
| `/api/…` | `routes/` |
| `/socket.io/…` | Socket.IO (also serves its client script) |
| `/js/activity.js` | the bundled Discord Activity bridge |
| `/health` | health check |
