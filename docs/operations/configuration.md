[← Documentation](../README.md)

# Configuration

The server is configured with environment variables. In production and on staging they come from `.env` next to the compose file (template: `.env.template`); locally from `docker-compose.local.yml` and the gitignored `secrets.env`. After changing `.env`, run `docker compose up -d` – a plain `restart` does not re-read it.

Settings that change at runtime (maintenance mode, registration switch, OAuth providers, word filter) are not environment variables; they are set in the [admin panel](administration.md).

## Required and common settings

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **yes** | Long random string that signs login cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The server refuses to start with a missing or publicly known value. Changing it logs everyone out. |
| `BASE_URL` | **yes** for OAuth/passkeys | Public URL, scheme and host only, e.g. `https://hochciv.example` – no path, no trailing characters. Used for OAuth callbacks, links in e-mails and as the passkey origin. A malformed value stops the server at startup. Without it, OAuth redirects to `http://localhost:3000` and fails. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | recommended | Database credentials. Only applied when the database volume is created for the first time – changing them later does not change an existing database. The compose file builds `DATABASE_URL` from them. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | for e-mail | Mail server for activation codes, password reset, 2FA codes and turn notifications. Without `SMTP_HOST`, mails are only written to the log. |
| `FCM_SERVICE_ACCOUNT` | for push | Firebase service account key, base64-encoded on one line. Without it, push is off. See [Push notifications](push-notifications.md). |
| `ALLOWED_ORIGINS` | no | Further web origins (comma-separated, e.g. `https://second.example`) whose pages may use a visitor's login. By default only this site (the request's host or `BASE_URL`) and the Discord Activity may connect a socket or send changing API requests – see [Security](../reference/security.md). |
| `PROXY_NETWORK` | no | Docker network of the reverse proxy (default `nginx`). |
| `HOCHCIV_IMAGE_TAG` | no | Image version to run (default `latest`), e.g. a release tag like `v1.4.2`. |
| `WATCHTOWER_POLL_INTERVAL` | staging only | How often Watchtower looks for a new `staging` image, in seconds (default 300). |

## Set by the compose files

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db`. Set by the compose files; needed when running without Docker. |
| `NODE_ENV` | `production` in production and on staging. Without it (local), e-mails are printed to the log. |
| `PORT` | Port inside the container (default `3000`). |

## Tuning and test settings

These have sensible defaults and are normally left alone. The tests in `tests/` shorten some of them (each test's header says which); `docker-compose.local.yml` passes the ones marked *local* through from the shell.

| Variable | Default | Description |
|---|---|---|
| `TURN_TIMER_SCALE` | `1` | Factor on the live-game turn timer (tests: `0.05`). *local* |
| `TURN_TIMER_AFK_AFTER` | `3` | Missed turns in a row after which the KI keeps a live seat. *local* |
| `MATCH_GROUP_WAIT_MS` | `20000` | Matchmaking: how long the longest-waiting player waits before a game of two or three starts. *local* |
| `MATCH_CONFIRM_MS` | `20000` | Matchmaking: time to accept a found match. |
| `CHAT_MUTE_MS` | `300000` | First word-filter strike: how long the sender can't write texts. *local* |
| `ASYNC_REMINDER_MS` | 5 days | Rundenspiele: when the waiting player gets a reminder. |
| `ASYNC_TIMEOUT_MS` | 7 days | Rundenspiele: when the KI takes over a seat (see [Rundenspiele](../reference/rundenspiele.md)). |
| `ASYNC_SWEEP_MS` | 10 minutes | Rundenspiele: how often the server checks for reminders and timeouts. |
| `REPLAY_KEEP_DAYS` | `180` | Replays older than this are deleted. |
| `REPORT_KEEP_YEARS` | `3` | Chat reports about guests or deleted accounts are deleted after this time. |

## Fixed limits (`config.js`)

Changed in code, not by environment:

| Setting | Value |
|---|---|
| Empires per game | 8 |
| Live lobbies/games at once | 500 |
| Spectators per live game | 20 |
| Player name length | 30 |
| Join code / password | 6 characters / 6 digits |
| Live game removed after inactivity | 2 hours (lobbies and finished games: 10 minutes) |
