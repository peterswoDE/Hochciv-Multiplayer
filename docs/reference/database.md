[← Documentation](../README.md)

# Database

PostgreSQL 15 through Sequelize. The models are in `models/` (`models/index.js` wires them up); the schema comes from the migrations in `migrations/`, and the server connects with a role that can't change it – see [Roles and migrations](#roles-and-migrations). Sessions (login cookies) are stored in the same database by `connect-pg-simple`.

Live lobbies and games are **not** in the database – they live in memory (`sessions.js`). Only their result (`games`) and replay (`replays`) are stored when they end.

## Tables

| Table | Model | Holds |
|---|---|---|
| `users` | `User` | Accounts |
| `games` | `Game` | Finished matches (live games and Rundenspiele) |
| `async_games` | `AsyncGame` | Rundenspiele, running and finished |
| `arena_standings` | – | Standings of the [correspondence arena](rundenspiele.md#arena), one row per game version and bot (migration 0010) |
| `async_chat` | – | Chat messages of running Rundenspiele, one row per message (migration 0011) |
| `async_log` | – | The engine log of running Rundenspiele, one row per entry (migration 0012) |
| `replays` | `Replay` | Replays of finished matches |
| `replay_frames` | `ReplayFrame` | Turn states of Rundenspiele that are still running |
| `custom_maps` | `CustomMap` | Custom maps in accounts |
| `map_favorites` | `MapFavorite` | Players' favorites among the published maps |
| `seasons` | `Season` | Ranked seasons, one per quarter (`2026-Q4`); `closedAt` once the next one began |
| `season_results` | `SeasonResult` | Final standing per account and closed season: MMR, rank (humans and bots apart), tier, games, wins |
| `challenge_results` | `ChallengeResult` | Weekly challenge: one row per attempt (any number per account and week; `weekId` like `2026-W45`), its Rundenspiel (`asyncId`) and, once finished, victory, rounds, points, `finishedAt` (before the week's end: on the leaderboard) |
| `friendships` | `Friendship` | Friends list: `userId` asked `friendId`, `status` `pending` or `accepted` (one row per pair; declining or removing deletes it) |
| `passkeys` | `Passkey` | Passkeys (WebAuthn) |
| `TotpTokens` | `TotpToken` | Authenticator apps (several per account; table name from Sequelize's default) |
| `device_tokens` | `DeviceToken` | Android devices for push |
| `oauth_providers` | `OAuthProvider` | Google/Discord configuration |
| `reports` | `Report` | Chat reports |
| `banned_words` | `BannedWord` | Admins' word-filter entries |
| `settings` | `Setting` | Server settings from the admin panel, one row per `key`: `discordInvite` (utils/settings.js), `arena-correspondence-ladder` (the bot ladder's settings as JSON, async/ladder.js) |
| `session` | – | Login sessions (`connect-pg-simple`) |
| `schema_migrations` | – | The applied migrations (`name`, `appliedAt`) |

Relations: a `User` has many `Passkey`, `TotpToken` and `DeviceToken` rows (device tokens are deleted with the user); `Game.winnerUsername` refers to `User.username`. Everything else refers to users by id inside its own columns (`ownerId`, `hostUserId`, `participantIds`, …).

## `users`

| Columns | Meaning |
|---|---|
| `id` (UUID), `username`, `email`, `origin` | Identity; `origin` is e.g. `activity` for accounts created by the Discord Activity |
| `password_hash` | bcrypt; empty for Google/Discord/passkey-only accounts |
| `mmr` (default 1000), `gamesPlayed` | Ranking |
| `role` (`user`/`botcreator`/`admin`/`superadmin`), `isActive`, `isBanned` | Rights and state |
| `accountType` (`human`/`bot`), `ownerId`, `botTokenHash`, `botLimit`, `botDescription`, `arenaLadderOptIn`, `suspendedUntil` | [Bot accounts](bot-accounts.md): a bot's owner and the SHA-256 of its token; how many bots a bot creator may own (null = default); the bot's public profile text (null = none); whether the bot takes part in the [correspondence arena](rundenspiele.md#arena); until when a bot is suspended for running into the [limits per account](security.md#limits) (migration 0009) |
| `googleId`, `discordId`, `avatarUrl` | Linked providers |
| `activationCode…`, `resetCode…`, `pendingEmail`, `emailChangeCode…` | One-time codes with expiry and attempt counters |
| `totpSecret`, `totpEnabled`, `totpAttempts`, `totpLockedUntil` | Authenticator (and its lockout) |
| `emailOtpEnabled`, `emailOtpCode`, `emailOtpExpiry` | E-mail code as second factor |
| `currentChallenge` | Pending WebAuthn challenge |
| `notifyEmail`, `notifyPush`, `notifyDiscord` | Rundenspiel notifications (e-mail and push opt-out, Discord direct message opt-in) |
| `blockedPlayers` | Chat blocks |

## `games`

One row per finished match: `id` (UUID, used in `/api/games/:id` and `/?replay=`), `version` (game version), `durationRounds`, `matchDate`, `winnerUsername`, `participants` (JSON: per seat name, account, nation, points, MMR change, KI/replaced flags), `stats` (score over the rounds, key moments) and `facts` (for the overall statistics, `utils/facts.js`: per empire nation, ability, turn position, won, cities, population, score, wonders and the round of each technology; anonymous, computed from the replay right after the match and for older matches at server start).

## `async_games`

A Rundenspiel as a whole: `id`, `joinCode`, `hostUserId`, `status` (`setup` → `placement` | `draft` → `playing` → `finished` | `cancelled`), `isPublic`, `round`, `waitSince`, `reminded`, `arenaLadder` (a game of the [correspondence arena](rundenspiele.md#arena), set at creation; partial index `async_games_arena_ladder` on (`createdAt`, `id`) of those games, migration 0010). The array columns `participantIds`, `invitedIds`, `waitingIds` exist for the game list and the "your turn" badge. `stats` (statistics over the rounds, `utils/stats.js`), `marks` ("since your last turn", `utils/summary.js`) and `scenes` (the scenes of the running game, `utils/scenes.js`) have their own columns (migration 0011); everything else – seats, settings, chat timeouts, pre-phase, result – is in `data`, the engine state in `state` (while the game runs without its log, which is in `async_log`), the chat in `async_chat`. A save writes only the columns that changed: the small columns always, `data` and `state` when they changed, `stats`, `marks` and `scenes` once per turn – when the player or the round changes, the game ends or the server shuts down, at the latest `ASYNC_HOLD_MS` (60 s) after a change (`async/service.js` flush). Structure of `data`: see the header of `async/logic.js` and [Rundenspiele](rundenspiele.md).

## `replays` and `replay_frames`

`replays`: `gameId` (the match in `games`), `version`, `frames` (count), `data` – one Brotli-compressed JSON document `{ v, version, names, frames: [state, …] }`, about 15 KB per game. Deleted after `REPLAY_KEEP_DAYS` (180); for matches only bots played after `BOT_REPLAY_KEEP_DAYS` (30), which also clears their `games.stats`.

`game_players` (migrations/0003-game-players.js): one row per account and match – `gameId`, `userId`, `seat`, `replaced` (a seat the KI took over from the account, `replacedUserId`), `won`, `solo`, `ranked` (the seat has an MMR change), `botAccount`, `matchDate`. A trigger on `games` keeps it in step with `participants` (insert, and updates of `participants` or `matchDate`); the rows go with their match. Indexed by (`userId`, `matchDate` DESC), so profiles, badges, seasons, friends' suggestions, the account history and personal statistics read an account's matches without scanning `games` (utils/gameplayers.js). `games` itself has a GIN index on `participants::jsonb` (jsonb_path_ops, for the `@>` lookups that remain: duplicates of single-player games, account deletion and merges) and one on `matchDate`.

`replay_frames`: while a Rundenspiel runs, its turn states wait here (`gameKey`, `seq`, `data`), because Rundenspiele run for days and survive restarts. At the end they become one `replays` row and are deleted. Live games keep their frames in memory.

## User changes

A trigger on `users` (migrations/0008-user-changed-notify.js) sends `pg_notify('hochciv_user_changed', id)` after every update or delete of a row. The server keeps the logged-in users for a short while (`utils/session-cost.js`, `USER_CACHE_MS`) and drops one as soon as its id is announced; the listener has a connection of its own from the session store's pool and switches the cache off while it is away.

## Other tables

* **`custom_maps`:** `ownerId` (null: a map that belongs to nobody, `maps/builtin.js`), `name` (unique per owner), `map` (the clean copy `checkCustomMap` returns: `{ name, rows, capitals }`), `code` (6 characters when published, else null – every published map is in the map browser), `publishedAt`, `loads` (loaded by code or picked in the browser, by others), `favorites` (count of `map_favorites` rows, for sorting).
* **`map_favorites`:** `userId`, `mapId` (unique together). A favorite of an unpublished map stays and shows again when it is published again; it goes when the map or the account is deleted, and moves when accounts are merged.
* **`oauth_providers`:** `provider` (`google`/`discord`), `clientId`, `clientSecret`, `botToken` (Discord Activity), `enabled`.
* **`passkeys`:** `credentialID`, `credentialPublicKey`, `counter`, `transports`.
* **`device_tokens`:** `token`, `platform`, `lastSeenAt`, `sessionHash` (SHA-256 of the session id that registered the device, migrations/0004-device-session.js – another account takes the device over only after that login ended).
* **`async_chat`:** `id` (bigserial, the order), `gameId` (→ `async_games`, deleted with the game), `msg` (the message as the clients get it: `{ id, t, slot, name, uid, kind, text | emote, … }`), `createdAt`; index on (`gameId`, `id`). One insert per message; a game keeps its last 200. The rows are deleted when the game ends (in the statement that writes the end) and at server start for games that ended before.
* **`async_log`:** `gameId` (→ `async_games`, deleted with the game), `seq` (the entry's number in the engine, one up per entry), `entry` (the entry as in `state.log`: `{ c, m, r, seq, art? }`); primary key (`gameId`, `seq`). While a game runs its `state` is written without `log`: a write that carries the state inserts the entries new since the last one and deletes the rows outside the log's range (the engine keeps the last 600), in the statement that writes the row. Loading the game puts the last 600 back into `state.log`. When the game ends the log is back in `state` and the rows go in that statement (at server start too, for games that ended before). A log whose entries are not numbered one after another stays in `state`.
* **`arena_standings`:** `version` (game version), `userId`, `name` (the bot's name in its first ladder game of that version), `games` (booked games), `wins`, `draws`; primary key (`version`, `userId`). A bot's row is made with its first ladder game of a version and counted when a game is booked, in the booking's transaction (async/service.js processResult → async/ladder.js `book`), so each game counts once. No foreign key: a deleted bot stays in the standings, as it stays in the games.
* **`reports`:** `kind` (`chat`, `map` or `limit` – a bot suspended by the [limits per account](security.md#limits)), `status`, `source`/`sourceId` (live game or Rundenspiel; for a map `map` and the map's id), reporter and reported (id and name), `reason`, `message`, `context` (the game's chat history from the server's copy; for a map report the map as it was), `auto` (word filter), `matches`, `penalty`, `note`, `handledBy`, `handledAt`. Reports about an existing account are kept as long as it exists; the others for `REPORT_KEEP_YEARS` (3).
* **`settings`:** `key` (primary key), `value` (text), `updatedBy` (admin username). Read once and kept in memory by utils/settings.js.
* **`banned_words`:** `word` (normalized: lower case, ä → ae, ß → ss), `kind` (`ban`/`allow`), `match` (`word` – whole word, or `part` – anywhere), `addedBy`.

## Roles and migrations

The server doesn't use the database superuser. There are three roles:

| Role | Used by | May |
|---|---|---|
| `hochciv` (`POSTGRES_USER`) | the database container, the db-setup container, backups | everything (superuser) |
| `hochciv_owner` | the migrations before the server starts (`MIGRATION_DATABASE_URL`) | owns the tables: create, change and drop them – in this database only |
| `hochciv_app` | the server (`DATABASE_URL`) | read and write rows; no schema changes, no writes to `schema_migrations`, no superuser rights such as running programs |

`scripts/db-setup.js` creates the two roles. It runs as the one-shot container `hochciv-db-setup` (staging: `hochciv-staging-db-setup`) at every `docker compose up`, before the server: it sets the roles' passwords from `.env` (`POSTGRES_OWNER_PASSWORD`, `POSTGRES_APP_PASSWORD`), hands every table to `hochciv_owner` and grants `hochciv_app` its rights – also on the tables later migrations create. Running it again changes nothing.

At start, `entrypoint.sh` runs `scripts/migrate.js` as the owner and then starts the server without `MIGRATION_DATABASE_URL` in its environment. The server checks that no migration is pending and compares the models with the schema: a table or column a model expects but the database lacks is logged as `[DB] Schema: … – a migration is missing`.

Without `MIGRATION_DATABASE_URL` (`npm start`, or a compose file from before the roles) the migrations and the server both use `DATABASE_URL`.

`0001-baseline` is the schema `sequelize.sync({ alter: true })` kept at every start until 2026-11: an empty database gets it from `0001-baseline.sql`; a database from before only records it.

### Changing the schema

Changing a model doesn't change the database any more. Every model change comes with a migration:

1. Add `migrations/NNNN-what-it-does.js` with the next number. It exports `up(db)`; `db` is a pg client inside the migration's transaction. Plain SQL:
   ```js
   exports.up = async db => {
       await db.query('ALTER TABLE users ADD COLUMN "theme" varchar(255)');
   };
   ```
2. Change the model to match.
3. `docker compose -f docker-compose.local.yml up -d` applies it (log: `[DB] Migration … applied`). `tests/db/migrations.test.js` – also run on every pull request – fails when a model and the schema disagree.

Migrations only go forward; there is no down. An older image started on a newer schema (pinning `HOCHCIV_IMAGE_TAG` back) must still work, so prefer additive changes – new columns nullable or with a default – and drop columns a release after the code stopped using them. Never change a migration that has been applied somewhere, nor `0001-baseline.sql`.

## Maintenance

* `node scripts/dedupe-constraints.js [--fix]` removes duplicate UNIQUE constraints that older `sync({ alter: true })` runs created (in the container it uses the owner role).
* Backups: back up the PostgreSQL volume (e.g. `docker exec hochciv-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql`). A dump restored into a new database belongs to the superuser; the next `docker compose up` hands it to `hochciv_owner` again.
