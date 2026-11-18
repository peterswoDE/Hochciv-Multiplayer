[← Documentation](../README.md)

# Configuration

The server is configured with environment variables. In production and on staging they come from `.env` next to the compose file (template: `.env.template`); locally from `docker-compose.local.yml` and the gitignored `secrets.env`. After changing `.env`, run `docker compose up -d` – a plain `restart` does not re-read it.

Settings that change at runtime (maintenance mode, registration switch, OAuth providers, word filter) are not environment variables; they are set in the [admin panel](administration.md).

## Required and common settings

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **yes** | Long random string that signs login cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. The server refuses to start with a missing or publicly known value. Changing it logs everyone out. |
| `BASE_URL` | **yes** for OAuth/passkeys | Public URL, scheme and host only, e.g. `https://hochciv.example` – no path, no trailing characters. Used for OAuth callbacks, links in e-mails and as the passkey origin. A malformed value stops the server at startup. Without it, OAuth redirects to `http://localhost:3000` and fails. |
| `POSTGRES_PASSWORD` | **yes** | Password of the database superuser – the production and staging compose files refuse to start without it (there is no default). For an existing database it must be the password the volume was created with. Only the database and the db-setup container get it, not the server. |
| `POSTGRES_OWNER_PASSWORD` / `POSTGRES_APP_PASSWORD` | **yes** | Passwords of the server's roles `hochciv_owner` (migrations) and `hochciv_app` (the server). Two different values, letters and digits only (they go into a URL). The db-setup container creates the roles and sets these passwords at every `docker compose up` – changing them in `.env` and running `docker compose up -d` changes them. See [Roles and migrations](../reference/database.md#roles-and-migrations). |
| `POSTGRES_USER` / `POSTGRES_DB` | no | Database superuser and database name (default `hochciv`). Only applied when the database volume is created for the first time – changing them later does not change an existing database. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | for e-mail | Mail server for activation codes, password reset, 2FA codes and turn notifications. Without `SMTP_HOST`, mails are only written to the log – in production mode (staging) with the one-time codes hidden, see `MAIL_LOG_CODES`. On ports other than 465 the connection must be upgraded with STARTTLS. |
| `SMTP_REQUIRE_TLS` | no | `off` allows a mail server without STARTTLS (not recommended). |
| `MAIL_LOG_CODES` | no | `on` writes the codes of logged mails in full in production mode, e.g. to test registration on a staging server without SMTP. Off by default: whoever reads the logs could use anybody's reset or 2FA code. |
| `HOCHCIV_MEM_LIMIT` | no | Memory limit of the server container (default `2g`). |
| `FCM_SERVICE_ACCOUNT` | for push | Firebase service account key, base64-encoded on one line. Without it, push is off. See [Push notifications](push-notifications.md). |
| `ALLOWED_ORIGINS` | no | Further web origins (comma-separated, e.g. `https://second.example`) whose pages may use a visitor's login. By default only this site (the request's host or `BASE_URL`) and the Discord Activity may connect a socket or send changing API requests – see [Security](../reference/security.md). |
| `PROXY_NETWORK` | no | Docker network of the reverse proxy (default `proxy`); production and staging must use the same one. |
| `HOCHCIV_IMAGE_TAG` | no | Image version to run (default `latest`), e.g. a release tag like `v1.4.2`. |
| `WATCHTOWER_POLL_INTERVAL` | production, staging | How often Watchtower looks for a new image (`latest` or `staging`), in seconds (default 300). |
| `POSTGRES_DATA` | production | Where the database keeps its data: the Docker volume `pgdata` (default) or a folder such as `./postgres`. |

## Set by the compose files

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` – the server's connection (in Docker: `hochciv_app`). Needed when running without Docker. |
| `MIGRATION_DATABASE_URL` | The owner role `hochciv_owner`, only for the migrations before the server starts; the server process doesn't get it. Without it the migrations use `DATABASE_URL`. |
| `NODE_ENV` | `production` in production and on staging. Without it (local), e-mails are printed to the log with their codes. |
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
| `TERMS_CHECK` | on | `off` turns the consent to the terms of use off (`docker-compose.local.yml`, for the browser tests). *local* |
| `ASYNC_REMINDER_MS` | 5 days | Rundenspiele: when the waiting player gets a reminder (for 7 days per turn; shorter times per turn scale it). |
| `ASYNC_TIMEOUT_MS` | 7 days | Rundenspiele: when the KI takes over a seat, for 7 days per turn; 1 and 3 days per turn scale it (see [Rundenspiele](../reference/rundenspiele.md)). |
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
