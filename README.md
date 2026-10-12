# Hochciv Multiplayer Server

Authoritative multiplayer backend for **Hochciv**, built with Node.js, Express, Socket.IO and PostgreSQL. It serves the game, runs lobbies and live games with the real game rules on the server, and handles accounts, rankings and turn-based "Rundenspiele".

## Features

* **Live multiplayer:** Lobbies with a 6-character join code and a 6-digit password, public lobby list, up to 4 players (empty seats are filled with bots). The host configures map, difficulty, events, wonders and ranked mode.
* **Server-side rules:** Every move is checked and applied by the real Hochciv engine on the server; clients only display the state.
* **Discord Activity:** Play inside Discord voice channels and DMs. Everyone in the call lands in the same lobby automatically.
* **Rundenspiele (asynchronous games):** Play turn by turn over days, with e-mail notifications when it is your turn.
* **Accounts:** Registration with e-mail activation, password reset, Google and Discord login, two-factor authentication (authenticator app, passkeys, e-mail code), MMR ranking and match history.
* **Admin panel:** Server status, maintenance mode, registration switch, lobby and user management, OAuth configuration.
* **Reconnects:** Players who lose their connection or reload the page are put back into their seat.

## How it works

The game itself lives in a separate repository ([timooom-hash/Hochciv](https://github.com/timooom-hash/Hochciv)). This server adds multiplayer on top of it:

1. **Fetch** – at container start, `entrypoint.sh` fetches the game into `public/` (exactly the pinned commit if `CORE_REPO_COMMIT` is set, otherwise the head of `CORE_REPO_BRANCH`). There are **no automatic updates while running**; restart the container to pick up a newer game version.
2. **Inject** – it copies `mp.js` into the game and, via `inject.js`, adds three scripts to the game's `index.html`: the Socket.IO client (served by this server), `mp.js` and the Discord Activity bridge.
3. **Hook** – in the browser, `mp.js` replaces the game's action functions so that moves are sent to the server, and adds the lobby, login and account UI.
4. **Rules on the server** – `engine-adapter.js` loads the same game files into the server and applies every move there.

Because the engine code runs inside the server, pinning it with `CORE_REPO_COMMIT` to a commit you have reviewed is recommended. With a pin, nothing else is ever executed: if that commit cannot be fetched, the container refuses to start.

Docker images built by GitHub Actions already contain a bundled copy of the game, so the server can start without internet access.

## Deployment (production)

The production setup uses the pre-built image `peterswode/hochciv-multiplayer` behind a reverse proxy (Nginx, Nginx Proxy Manager, …).

1. Install Docker with Docker Compose.
2. Create the external network the proxy and the server share:
   ```bash
   docker network create nginx
   ```
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
| `CORE_REPO_COMMIT` | recommended | Full 40-character commit SHA of the game repository to run. Empty = latest head of `CORE_REPO_BRANCH` at each start. |
| `CORE_REPO_URL` / `CORE_REPO_BRANCH` | no | Game repository and branch (default: `timooom-hash/Hochciv`, `main`). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | recommended | Database credentials. Only applied when the database volume is created for the first time – changing them later does not change an existing database. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | for e-mail | Mail server for activation codes, password reset, 2FA codes and turn notifications. Without `SMTP_HOST`, mails are only written to the log. |
| `HOCHCIV_IMAGE_TAG` | no | Image version to run (default `latest`), e.g. a release tag like `v1.4.2`. |
| `DISCORD_BOT_TOKEN` | no | Bot token of the Discord application. Lets the Discord Activity check that a player really belongs to the call whose lobby they join. |

### Google / Discord login

1. Set `BASE_URL` (see above) and restart with `docker compose up -d`.
2. Register these redirect URLs exactly, with your domain:
   * Google Cloud Console → Credentials → OAuth client → *Authorized redirect URIs*: `https://<your-domain>/api/auth/google/callback`
   * Discord Developer Portal → your app → OAuth2 → *Redirects*: `https://<your-domain>/api/auth/discord/callback`
3. As superadmin, open *Account & Admin → OAuth*, enter client ID and secret, tick *Aktiviert* and save. The tab shows the callback URLs the server really uses and warns if they do not match the address you opened the page with.

After logging in or linking an account, players return to the game with a short confirmation message.

### Discord Activity

The game runs as a [Discord Activity](https://discord.com/developers/docs/activities/overview). Players start it from the Activity launcher of a voice channel or DM. They are signed in with Discord and everyone in the call lands in the same lobby, with no join codes. The first player is host.

It uses the same Discord application as the Discord login above:

1. Set up Discord login as described above (client ID and secret in *Account & Admin → OAuth*). The Activity only needs ID and secret; *Aktiviert* only controls the website login.
2. Discord Developer Portal → your app:
   * **Activities → Settings:** enable Activities.
   * **Activities → URL Mappings:** prefix `/` → target your domain without the scheme, e.g. `hochciv.example`.
   * **OAuth2 → Redirects:** besides the login callback, add `https://127.0.0.1` as a placeholder. Discord requires one for the Activity's authorization.
   * **Installation:** allow *Guild Install* and/or *User Install*.
3. Optional: set `DISCORD_BOT_TOKEN` (Developer Portal → Bot) so that only players who are in the call can join its lobby.

Notes:

* **Guests only.** Inside Discord, players play as guests under their Discord name. Account login, ranked games and Rundenspiele are hidden there, because login cannot run in Discord's iframe.
* **Joining by code still works.** The normal *Multiplayer* menu works, so Discord players can also play with people on the website.
* **Framing.** Discord may embed the game: the server sends `Content-Security-Policy: frame-ancestors 'self'` plus the Discord domains, instead of `X-Frame-Options`.
* **Reconnects.** Reopening the Activity puts a player back into their seat. If the host leaves before the start, or the game ends, the next player who joins gets a fresh lobby.

For local testing, Discord needs a public HTTPS URL. Use a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000`, and enter its host as the URL mapping target. Outside Discord, the Activity script does nothing.

### Updating

* **Server:** pull the new image and recreate: `docker compose pull && docker compose up -d`.
* **Game version:** restart the container (`docker compose up -d --force-recreate`). With `CORE_REPO_COMMIT` set, change it to the new reviewed commit first.

### Startup troubleshooting

`entrypoint.sh` logs a network check at startup and tries, in this order: Git clone → GitHub tarball (unpinned only) → the copy bundled in the image (when pinned: only if built from that commit) → the existing `public/` folder. If DNS does not work inside the container it tries some automatic fixes.

Common startup errors:

* `SESSION_SECRET is a publicly known default` – set your own value in `.env`.
* `Invalid BASE_URL "..."` – the value contains a path or stray characters (e.g. a trailing comma).
* `Pinned frontend ... is not available` – the pinned commit could not be fetched; check `CORE_REPO_COMMIT` and network access.

## Local development

### With Docker (recommended)

```bash
docker compose -f docker-compose.local.yml up -d --build
```

* Game: <http://localhost:3000>, database: `localhost:5432` (only from this machine; user/password `hochciv` / `password123`).
* The server code is mounted into the container – after changes run `docker compose -f docker-compose.local.yml restart hochciv-local`. Changes to `package.json`, `Dockerfile`, `entrypoint.sh` or `activity/bridge.js` need `--build`.
* Runs without `NODE_ENV=production`: e-mails (activation codes, reset codes) are printed to the log (`docker logs hochciv-multiplayer-local`).
* Optional SMTP settings can go into `secrets.env` (gitignored).
* Make yourself admin: `docker exec hochciv-multiplayer-local node elevate.js <username> superadmin`.

### Without Docker

```bash
npm install
npm start
```

You need a PostgreSQL database (`DATABASE_URL=postgres://user:pass@host:5432/db`). Without a `public/` folder the server loads the engine from a sibling `../Hochciv` checkout of the game repository, but does not serve the game page – use Docker to get the full setup.

## Architecture

* `server.js` – Express entry point: sessions, login (Passport), routes, static files, Socket.IO.
* `config.js` – Central settings (port, `BASE_URL`, limits).
* `routes/` – REST API: `auth.js` (login, registration, 2FA login, OAuth), `account.js`, `mfa.js`, `admin.js`, `api.js` (lobbies, leaderboard), `async.js` (Rundenspiele).
* `routes/activity.js` – Discord Activity: OAuth code exchange and one lobby per activity instance.
* `activity/` – Discord Activity bridge for the browser (`bridge.js`). `build.js` bundles it with the Embedded App SDK (`npm run build:activity`; the Dockerfile does this in a build stage). The bundle is served as `/js/activity.js`.
* `inject.js` – Patches the fetched game's `index.html` (Socket.IO client, `mp.js`, Activity bridge).
* `sockets/game.js` – Live games: lobby, start, moves, placement, draft, reconnects.
* `sockets/async.js`, `async/` – Rundenspiele: rules, storage, notifications, timeouts.
* `sessions.js` – In-memory store for live lobbies and games.
* `engine-adapter.js` – Loads the game engine into the server and checks/applies moves.
* `utils/` – Auth helpers, OAuth strategies, WebAuthn settings, mailer, MMR, notifications.
* `models/` – Database models (Sequelize).
* `mp.js` – Multiplayer client injected into the game.
* `client/` – Login and account pages (shown inside the game).
* `elevate.js` – Command-line tool to assign admin roles.

## Security notes

* Never commit `.env` or `secrets.env`; they are excluded from Git and from the Docker build.
* Use a unique `SESSION_SECRET` and database password per installation.
* Pin `CORE_REPO_COMMIT` to a commit you have reviewed – that code runs on your server and in your players' browsers.
* Only superadmins can grant admin rights or change OAuth settings; admins manage normal users only.
