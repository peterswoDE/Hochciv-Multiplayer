# Hochciv Multiplayer Server

Authoritative multiplayer backend for **Hochciv**, built with Node.js, Express, Socket.IO and PostgreSQL. It serves the game, runs lobbies and live games with the real game rules on the server, and handles accounts, rankings and turn-based "Rundenspiele".

## Features

Planned and in-progress features for the multiplayer experience are tracked in [TASKS.md](TASKS.md).

* **Live multiplayer:** Lobbies with a 6-character join code and a 6-digit password, public lobby list, 2 to 8 empires – as many as the map allows (fixed maps and the standard Marathon 4, the tile map 8, custom maps as many as they have start points). The host sets the number of empires and how many of them the KI plays; free human seats are filled with the KI at the start. Further settings: map (including custom maps and their codes), random nations for everyone, KI level, events, wonders and ranked mode.
* **Server-side rules:** Every move is checked and applied by the real Hochciv engine on the server; clients only display the state.
* **Discord Activity:** Play inside Discord voice channels and DMs. Everyone in the call lands in the same lobby automatically.
* **Rundenspiele (asynchronous games):** Play turn by turn over days, with e-mail notifications when it is your turn. Same choices as live games: 2–8 empires, how many of them KI (none: the game waits for everybody), random nations for everyone, custom maps.
* **Custom maps:** Maps from the game's map editor ("Meine Karten") are kept in the player's account and synced to every device they log in on. A map can be published with a 6-character code; anybody can load it by that code (also without an account) and use it locally or as the map of a lobby.
* **Accounts:** Registration with e-mail activation, password reset, Google and Discord login, two-factor authentication (authenticator app, passkeys, e-mail code), MMR ranking and match history.
* **Admin panel:** Server status, maintenance mode, registration switch, lobby and user management, OAuth configuration.
* **Reconnects:** Players who lose their connection or reload the page are put back into their seat.
* **Turn timer (live games):** The host sets the time per turn: no limit (default), or 1 to 10 minutes. A countdown runs in the HUD. When the time is up, the KI finishes the turn. After three missed turns in a row, the KI keeps playing the seat until the player clicks *Ich bin zurück*.

## How it works

The game ships with this repository – nothing is downloaded, neither when the image is built nor at container start:

* `HochCiv/` – the current game (based on [timooom-hash/Hochciv](https://github.com/timooom-hash/Hochciv), with the multiplayer changes). Served at `/`; its engine runs live games and new Rundenspiele.
* `HochCiv-v88/`, `HochCiv-v87/`, `HochCiv-v83/` – versions that were deployed before (v88, v87, v83), unchanged. Rundenspiele started on one of them keep playing with its rules until they end: the server runs its engine for them, and `mp.js` opens them in that version at `/v88/`, `/v87/` or `/v83/`. Once no such game is running any more, the folder can be removed (together with its entry in `GAME_DIRS` in `engine-adapter.js`, `GAMES` in `scripts/build-public.js`, `OLD_VERSIONS` in `mp.js` and the volume in `docker-compose.local.yml`).

This server adds multiplayer on top of the game:

1. **Build** – `scripts/build-public.js` (run by the Dockerfile and again at container start) copies all versions into `public/`, `public/v88/`, `public/v87/` and `public/v83/`, leaving out development files (tests, tools, notes).
2. **Inject** – it copies `mp.js` into each copy and, via `inject.js`, adds three scripts to its `index.html`: the Socket.IO client (served by this server), `mp.js` and the Discord Activity bridge.
3. **Hook** – in the browser, `mp.js` replaces the game's action functions so that moves are sent to the server, and adds the lobby, login and account UI.
4. **Rules on the server** – `engine-adapter.js` loads the same game files into the server (one sandbox per version) and applies every move there. Each Rundenspiel records the version it was started with (`engine`); games from before that have none and are v83.

### Push notifications (Android app)

Rundenspiele notifications (invitation, your turn, reminder, takeover, finished) also go to the Android app as push messages, next to the e-mail. It's a second channel in `utils/notify.js`; the game code doesn't change.

* **Setup:** a Firebase project (it can be the Google Cloud project of the Google login). Firebase console → *Project settings → Service accounts → Generate new private key*. Put the key base64-encoded in `.env` as `FCM_SERVICE_ACCOUNT` (see `.env.template`) and run `docker compose up -d`. Without it, push is off and nothing else changes. The log shows `[Push] FCM enabled (project …)`.
* **Devices:** the app registers its FCM token with `POST /api/push/token` after login and removes it on logout (`DELETE`). A phone belongs to the account that logged in on it last. Tokens Firebase rejects (app uninstalled) are deleted, as are those of deleted accounts.
* **Players** switch push on or off in the Rundenspiele list (*Push-Nachricht, wenn ich am Zug bin*, shown only in the app). Android's own notification settings work as well.
* **Tests:** `tests/push/push.test.js` (instructions in the file).

### Mobile layer

`client/mobile/` (`mobile.css` and `mobile.js`, added to `index.html` by `inject.js` after `mp.js`) makes the game usable on phones without changing the game files. It is used by the website on phones and by the Android app.

* **Zoomable maps on every screen size:** pinch, drag, mouse wheel, and buttons + / − / ⌖ (whole map ↔ own capital). Maps start zoomed in far enough that a hex is a touch target (44 px), unless the whole map already gives ≥ 36 px hexes (tablets).
* **Narrow screens** (`html.w-narrow` from the game, < 600 px):
  * **Aktionsleiste:** "4 + Mehr" – *Fähigkeiten*, *Welt* and *Protokoll* move into a small menu, which still works while `mp.js` waits for other players.
  * **Technologiebogen:** one tab per column.
  * **Kopfzeile:** compact; readable log.
  * **`mp.js` widgets:** fitted to the screen.
* **Selected field:** stays visible next to its sheet.
* **Short screens:** dialogs use the full height, and the editor starts with its settings folded.

The layer wraps a few game functions (`drawMap`, `openTile`, `editorScreen`) and relies on some ids and classes of the game. The list is at the top of `mobile.js`. **After every game update**, run the interaction tests in `tests/mobile/mobile.test.js` (instructions in the file).

### Languages

Everything this server adds follows the game's language buttons (🇩🇪/🇬🇧): menus, lobby, Rundenspiele, player profile, login and account pages including the admin tabs, and the messages the server sends back. German is the key, the English is in `client/i18n.js` – the same scheme as the game's `T()`: `TX('…')` in `mp.js`, `tx('…')` on the account page, `HC_I18N.tr(msg)` for server messages (numbers and names inside them stay). A new text needs its line in the table; `tests/i18n/english.test.js` walks all screens in English and fails on German left over. The legal pages and e-mails stay German.

**Updating the game:** bring the new game version into `HochCiv/` (for example by merging a new Hochciv release into the multiplayer branch of the game repository and copying the result over), run its tests (`node test.js`, `node smoke.js` in `HochCiv/`) and commit. Running Rundenspiele are not affected by later versions only if their version is kept – to keep one, copy the old `HochCiv/` to `HochCiv-<version>/` before replacing it and add it everywhere `HochCiv-v87/` appears (`GAME_DIRS` in `engine-adapter.js`, `GAMES` in `scripts/build-public.js`, `OLD_VERSIONS` in `mp.js`, `docker-compose.local.yml`).

## Deployment (production)

The production setup uses the pre-built image `peterswode/hochciv-multiplayer` behind a reverse proxy (Nginx, Nginx Proxy Manager, …).

1. Install Docker with Docker Compose.
2. Create the external network the proxy and the server share:
   ```bash
   docker network create nginx
   ```
   If your proxy is already in a network with another name (e.g. `proxy`), skip this and set `PROXY_NETWORK=proxy` in `.env`.
3. Put `docker-compose.yml` into a folder, copy `.env.template` next to it as `.env` and fill it in (see below). At least `SESSION_SECRET` and `BASE_URL` must be set.
4. Start:
   ```bash
   docker compose up -d
   ```
   The server listens on port `3000` inside the `nginx` network. Point your proxy at `hochciv-multiplayer:3000` for the whole site (`/`, `/api/`, `/client/`, `/socket.io/` with WebSocket upgrade). `nginx-example.conf` shows the required locations and headers; it proxies to `127.0.0.1:3000`, so when Nginx runs as a container in the `nginx` network, replace that with `hochciv-multiplayer:3000` (the compose file publishes no host port).
5. Register your account in the game, then make it superadmin (needed for the OAuth settings):
   ```bash
   docker exec hochciv-multiplayer node elevate.js <your-username> superadmin
   ```

After changing `.env`, run `docker compose up -d` again – a plain `restart` does not re-read `.env`.

### Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **yes** | Long random string that signs login cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The server refuses to start with a missing or publicly known value. Changing it logs everyone out. |
| `BASE_URL` | **yes** for OAuth/passkeys | Public URL, scheme and host only, e.g. `https://hochciv.example` – no path, no trailing characters. Used for OAuth callbacks, links in e-mails and as the passkey origin. A malformed value stops the server at startup. Without it, OAuth redirects to `http://localhost:3000` and fails. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | recommended | Database credentials. Only applied when the database volume is created for the first time – changing them later does not change an existing database. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | for e-mail | Mail server for activation codes, password reset, 2FA codes and turn notifications. Without `SMTP_HOST`, mails are only written to the log. |
| `PROXY_NETWORK` | no | Docker network of the reverse proxy (default `nginx`). |
| `HOCHCIV_IMAGE_TAG` | no | Image version to run (default `latest`), e.g. a release tag like `v1.4.2`. |

### Google / Discord login

1. Set `BASE_URL` (see above) and restart with `docker compose up -d`.
2. Register these redirect URLs exactly, with your domain:
   * Google Cloud Console → Credentials → OAuth client → *Authorized redirect URIs*: `https://<your-domain>/api/auth/google/callback`
   * Discord Developer Portal → your app → OAuth2 → *Redirects*: `https://<your-domain>/api/auth/discord/callback`
3. As superadmin, open *Account & Admin → OAuth*, enter client ID and secret, tick *Aktiviert* and save. The tab shows the callback URLs the server really uses and warns if they do not match the address you opened the page with.

After logging in or linking an account, players return to the game with a short confirmation message.

**Android app:** Google refuses its login page inside the app's WebView, so the app signs in natively (Credential Manager) and sends the Google ID token to `POST /api/auth/google/idtoken`. Beforehand it gets the client ID and a one-time nonce from `GET /api/auth/google/app-config`. It uses the same Google configuration as above (client ID, *Aktiviert*) and the same account logic as the web login. In the Google Cloud Console, the app also needs an **Android** OAuth client (package `de.hochciv.app`, the SHA-1 of the app's signing keys); its ID isn't entered here. Tests: `tests/auth/google-app-login.test.js` (instructions in the file).

### Discord Activity

The game runs as a [Discord Activity](https://discord.com/developers/docs/activities/overview). Players start it from the Activity launcher of a voice channel or DM. They are signed in with Discord and everyone in the call lands in the same lobby, with no join codes. The first player is host.

It uses the same Discord application as the Discord login above:

1. Set up Discord login as described above (client ID and secret in *Account & Admin → OAuth*). The Activity only needs ID and secret; *Aktiviert* only controls the website login.
2. Discord Developer Portal → your app:
   * **Activities → Settings:** enable Activities.
   * **Activities → URL Mappings:** prefix `/` → target your domain without the scheme, e.g. `hochciv.example`.
   * **OAuth2 → Redirects:** besides the login callback, add `https://127.0.0.1` as a placeholder. Discord requires one for the Activity's authorization.
   * **Installation:** allow *Guild Install* and/or *User Install*.
3. Optional: enter the app's bot token (Developer Portal → Bot) in the same OAuth tab. The server then checks that only players who are in the call can join its lobby. It must be the token of the same app.

Notes:

* **Guests only.** Inside Discord, players play as guests under their Discord name. Account login, ranked games and Rundenspiele are hidden there, because login cannot run in Discord's iframe.
* **Joining by code still works.** The normal *Multiplayer* menu works, so Discord players can also play with people on the website.
* **Framing.** Discord may embed the game: the server sends `Content-Security-Policy: frame-ancestors 'self'` plus the Discord domains, instead of `X-Frame-Options`.
* **Reconnects.** Reopening the Activity puts a player back into their seat. If the host leaves before the start, or the game ends, the next player who joins gets a fresh lobby.

* **Troubleshooting.** Inside Discord, the Activity script writes every step and any page error to the server log (`[Activity client …]` lines in `docker logs`). The bar at the top of the menu shows the current step.

For local testing, Discord needs a public HTTPS URL. Use a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000`, and enter its host as the URL mapping target. Outside Discord, the Activity script does nothing.

### Updating

* **Server:** pull the new image and recreate: `docker compose pull && docker compose up -d`. Before that, the change has been tested on staging (see below).
* **Game version:** comes with the server image (`HochCiv/` in this repository) – updating the server updates the game.

## Branches and release flow

```
feature/… or fix/…  ──PR──▶  development  ──▶  staging server  ──PR──▶  main  ──▶  production
                             (image :staging,     (test there)          (image :latest + vX.Y.Z,
                              Watchtower updates)                         GitHub release)
```

1. Branch from `development` (`git fetch && git switch -c feature/… origin/development`).
2. Test locally with `docker-compose.local.yml`, then open a PR **into `development`**.
3. Merging builds `peterswode/hochciv-multiplayer:staging` (plus `staging-<commit>`). Watchtower on the server pulls it within a few minutes and restarts staging.
4. Test on staging (web and, if needed, the Android app pointed at the staging URL).
5. When staging is good, open a PR **`development` → `main`**. Merging builds the release (`latest` + version tag), then update production as described under *Updating*.

Hotfixes that cannot wait go from a `hotfix/…` branch off `main` straight into `main`; merge `main` back into `development` afterwards (PR `main` → `development`) so the two do not drift. The *PR Source Check* workflow fails every PR into `main` that comes from another branch than `development` or `hotfix/…`.

## Staging (semi-live)

Staging runs on the production server next to production, with its own containers (`hochciv-multiplayer-staging`, `hochciv-staging-db`), its own empty database and its own subdomain. Production is never touched: the Watchtower in `docker-compose.staging.yml` only updates containers labelled for the `hochciv-staging` scope.

1. DNS: point the staging subdomain (e.g. `staging.hochciv.de`) at the server and get a certificate for it.
2. Put `docker-compose.staging.yml` into its **own** folder (not the production one), copy `.env.template` next to it as `.env` and fill it in:
   * `SESSION_SECRET`: a different value than production.
   * `BASE_URL`: the staging URL, e.g. `https://staging.hochciv.de`.
   * `POSTGRES_PASSWORD`: its own value.
   * SMTP: optional; leave `SMTP_HOST` empty to only log mails. Leave `FCM_SERVICE_ACCOUNT` empty unless you test push.
3. Start: `docker compose -f docker-compose.staging.yml up -d`.
4. Proxy the subdomain to `hochciv-multiplayer-staging:3000` with WebSocket support – see the staging block in `nginx-example.conf`, or in Nginx Proxy Manager add a proxy host for it with *Websockets Support* on. `PROXY_NETWORK` must be the same network as production's.
5. Register an account on staging and make it superadmin: `docker exec hochciv-multiplayer-staging node elevate.js <your-username> superadmin`.
6. Google / Discord login on staging: add `https://staging.hochciv.de/api/auth/google/callback` and `…/api/auth/discord/callback` as additional redirect URLs to the same OAuth apps, and enter client ID and secret in the staging admin panel (the staging database is separate).

Watchtower checks for a new `staging` image every 5 minutes (`WATCHTOWER_POLL_INTERVAL` in `.env`, in seconds). See what it did with `docker logs hochciv-staging-watchtower`. To pin staging to a specific build, stop Watchtower and change the image tag to `staging-<commit>`.

### Startup troubleshooting

`entrypoint.sh` builds `public/` from the game in the image and starts the server – it needs no network access.

Common startup errors:

* `SESSION_SECRET is a publicly known default` – set your own value in `.env`.
* `Invalid BASE_URL "..."` – the value contains a path or stray characters (e.g. a trailing comma).
* `HochCiv/index.html fehlt` – the image was built without the game folder (check `.dockerignore`).

## Local development

### With Docker (recommended)

```bash
docker compose -f docker-compose.local.yml up -d --build
```

* Game: <http://localhost:3000>, database: `localhost:5432` (only from this machine; user/password `hochciv` / `password123`).
* The server code and the game (`HochCiv/`, `HochCiv-v88/`, `HochCiv-v87/`, `HochCiv-v83/`) are mounted into the container – after changes run `docker compose -f docker-compose.local.yml restart hochciv-local` (`public/` is rebuilt at start). Changes to `package.json`, `Dockerfile`, `entrypoint.sh` or `activity/bridge.js` need `--build`.
* Runs without `NODE_ENV=production`: e-mails (activation codes, reset codes) are printed to the log (`docker logs hochciv-multiplayer-local`).
* Optional SMTP settings can go into `secrets.env` (gitignored).
* Make yourself admin: `docker exec hochciv-multiplayer-local node elevate.js <username> superadmin`.

### Without Docker

```bash
npm install
npm start
```

You need a PostgreSQL database (`DATABASE_URL=postgres://user:pass@host:5432/db`). Run `node scripts/build-public.js` once (and after changes to the game or `mp.js`) so the server can serve the game page; the engine is always loaded from `HochCiv/` (and `HochCiv-v88/`, `HochCiv-v87/`, `HochCiv-v83/`).

## Architecture

* `server.js` – Express entry point: sessions, login (Passport), routes, static files, Socket.IO.
* `config.js` – Central settings (port, `BASE_URL`, limits).
* `routes/` – REST API: `auth.js` (login, registration, 2FA login, OAuth), `account.js`, `mfa.js`, `admin.js`, `api.js` (lobbies, leaderboard), `async.js` (Rundenspiele), `maps.js` (custom maps).
* `maps/service.js` – Custom maps in the account: save (checked with the engine's `checkCustomMap`), publish with a code, load by code. Deleting an account deletes its maps; merging accounts moves them.
* `routes/activity.js` – Discord Activity: OAuth code exchange and one lobby per activity instance.
* `activity/` – Discord Activity bridge for the browser (`bridge.js`). `build.js` bundles it with the Embedded App SDK (`npm run build:activity`; the Dockerfile does this in a build stage). The bundle is served as `/js/activity.js`.
* `HochCiv/`, `HochCiv-v88/`, `HochCiv-v87/`, `HochCiv-v83/` – the game (current version, and v88/v87/v83 for Rundenspiele started on them).
* `scripts/build-public.js` – builds `public/` from the game; `inject.js` patches each copy's `index.html` (Socket.IO client, `mp.js`, Activity bridge).
* `sockets/game.js` – Live games: lobby, start, moves, placement, draft, reconnects.
* `sockets/async.js`, `async/` – Rundenspiele: rules, storage, notifications, timeouts.
* `sessions.js` – In-memory store for live lobbies and games.
* `engine-adapter.js` – Loads the game engine into the server (one sandbox per version) and checks/applies moves.
* `utils/` – Auth helpers, OAuth strategies, WebAuthn settings, mailer, MMR, notifications.
* `models/` – Database models (Sequelize).
* `mp.js` – Multiplayer client injected into the game.
* `client/` – Login and account pages (shown inside the game); `client/i18n.js` – the English texts of everything the server adds.
* `elevate.js` – Command-line tool to assign admin roles.

## Security notes

* Never commit `.env` or `secrets.env`; they are excluded from Git and from the Docker build.
* Use a unique `SESSION_SECRET` and database password per installation.
* The game code in `HochCiv/` runs on your server and in your players' browsers – review changes to it like server code.
* Only superadmins can grant admin rights or change OAuth settings; admins manage normal users only.
