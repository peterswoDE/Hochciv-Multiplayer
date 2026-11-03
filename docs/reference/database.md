[← Documentation](../README.md)

# Database

PostgreSQL 15 through Sequelize. The models are in `models/` (`models/index.js` wires them up). There are no migration files: the server runs `sequelize.sync({ alter: true })` at every start, which creates missing tables and adds or changes columns to match the models. Sessions (login cookies) are stored in the same database by `connect-pg-simple`.

Live lobbies and games are **not** in the database – they live in memory (`sessions.js`). Only their result (`games`) and replay (`replays`) are stored when they end.

## Tables

| Table | Model | Holds |
|---|---|---|
| `users` | `User` | Accounts |
| `games` | `Game` | Finished matches (live games and Rundenspiele) |
| `async_games` | `AsyncGame` | Rundenspiele, running and finished |
| `replays` | `Replay` | Replays of finished matches |
| `replay_frames` | `ReplayFrame` | Turn states of Rundenspiele that are still running |
| `custom_maps` | `CustomMap` | Custom maps in accounts |
| `map_favorites` | `MapFavorite` | Players' favorites among the published maps |
| `seasons` | `Season` | Ranked seasons, one per quarter (`2026-Q4`); `closedAt` once the next one began |
| `season_results` | `SeasonResult` | Final standing per account and closed season: MMR, rank (humans and bots apart), tier, games, wins |
| `challenge_results` | `ChallengeResult` | Weekly challenge: one attempt per account and week (`weekId` like `2026-W45`), its Rundenspiel and, once finished, victory, rounds, points |
| `friendships` | `Friendship` | Friends list: `userId` asked `friendId`, `status` `pending` or `accepted` (one row per pair; declining or removing deletes it) |
| `passkeys` | `Passkey` | Passkeys (WebAuthn) |
| `TotpTokens` | `TotpToken` | Authenticator apps (several per account; table name from Sequelize's default) |
| `device_tokens` | `DeviceToken` | Android devices for push |
| `oauth_providers` | `OAuthProvider` | Google/Discord configuration |
| `reports` | `Report` | Chat reports |
| `banned_words` | `BannedWord` | Admins' word-filter entries |
| `session` | – | Login sessions (`connect-pg-simple`), created by `server.js` |

Relations: a `User` has many `Passkey`, `TotpToken` and `DeviceToken` rows (device tokens are deleted with the user); `Game.winnerUsername` refers to `User.username`. Everything else refers to users by id inside its own columns (`ownerId`, `hostUserId`, `participantIds`, …).

## `users`

| Columns | Meaning |
|---|---|
| `id` (UUID), `username`, `email`, `origin` | Identity; `origin` is e.g. `activity` for accounts created by the Discord Activity |
| `password_hash` | bcrypt; empty for Google/Discord/passkey-only accounts |
| `mmr` (default 1000), `gamesPlayed` | Ranking |
| `role` (`user`/`botcreator`/`admin`/`superadmin`), `isActive`, `isBanned` | Rights and state |
| `accountType` (`human`/`bot`), `ownerId`, `botTokenHash`, `botLimit` | [Bot accounts](bot-accounts.md): a bot's owner and the SHA-256 of its token; how many bots a bot creator may own (null = default) |
| `googleId`, `discordId`, `avatarUrl` | Linked providers |
| `activationCode…`, `resetCode…`, `pendingEmail`, `emailChangeCode…` | One-time codes with expiry and attempt counters |
| `totpSecret`, `totpEnabled`, `totpAttempts`, `totpLockedUntil` | Authenticator (and its lockout) |
| `emailOtpEnabled`, `emailOtpCode`, `emailOtpExpiry` | E-mail code as second factor |
| `currentChallenge` | Pending WebAuthn challenge |
| `notifyEmail`, `notifyPush` | Rundenspiel notifications |
| `blockedPlayers` | Chat blocks |

## `games`

One row per finished match: `id` (UUID, used in `/api/games/:id` and `/?replay=`), `version` (game version), `durationRounds`, `matchDate`, `winnerUsername`, `participants` (JSON: per seat name, account, nation, points, MMR change, KI/replaced flags), `stats` (score over the rounds, key moments) and `facts` (for the overall statistics, `utils/facts.js`: per empire nation, ability, turn position, won, cities, population, score, wonders and the round of each technology; anonymous, computed from the replay right after the match and for older matches at server start).

## `async_games`

A Rundenspiel as a whole: `id`, `joinCode`, `hostUserId`, `status` (`setup` → `placement` | `draft` → `playing` → `finished` | `cancelled`), `isPublic`, `round`, `waitSince`, `reminded`. The array columns `participantIds`, `invitedIds`, `waitingIds` exist for the game list and the "your turn" badge; everything else – seats, settings, chat, statistics, pre-phase – is in `data`, and the engine state in `state`. Saved after every action. Structure of `data`: see the header of `async/logic.js` and [Rundenspiele](rundenspiele.md).

## `replays` and `replay_frames`

`replays`: `gameId` (the match in `games`), `version`, `frames` (count), `data` – one Brotli-compressed JSON document `{ v, version, names, frames: [state, …] }`, about 15 KB per game. Deleted after `REPLAY_KEEP_DAYS` (180).

`replay_frames`: while a Rundenspiel runs, its turn states wait here (`gameKey`, `seq`, `data`), because Rundenspiele run for days and survive restarts. At the end they become one `replays` row and are deleted. Live games keep their frames in memory.

## Other tables

* **`custom_maps`:** `ownerId`, `name` (unique per owner), `map` (the clean copy `checkCustomMap` returns: `{ name, rows, capitals }`), `code` (6 characters when published, else null – every published map is in the map browser), `publishedAt`, `loads` (loaded by code or picked in the browser, by others), `favorites` (count of `map_favorites` rows, for sorting).
* **`map_favorites`:** `userId`, `mapId` (unique together). A favorite of an unpublished map stays and shows again when it is published again; it goes when the map or the account is deleted, and moves when accounts are merged.
* **`oauth_providers`:** `provider` (`google`/`discord`), `clientId`, `clientSecret`, `botToken` (Discord Activity), `enabled`.
* **`passkeys`:** `credentialID`, `credentialPublicKey`, `counter`, `transports`.
* **`device_tokens`:** `token`, `platform`, `lastSeenAt`.
* **`reports`:** `kind` (`chat` or `map`), `status`, `source`/`sourceId` (live game or Rundenspiel; for a map `map` and the map's id), reporter and reported (id and name), `reason`, `message`, `context` (the game's chat history from the server's copy; for a map report the map as it was), `auto` (word filter), `matches`, `penalty`, `note`, `handledBy`, `handledAt`. Reports about an existing account are kept as long as it exists; the others for `REPORT_KEEP_YEARS` (3).
* **`banned_words`:** `word` (normalized: lower case, ä → ae, ß → ss), `kind` (`ban`/`allow`), `match` (`word` – whole word, or `part` – anywhere), `addedBy`.

## Maintenance

* `node scripts/dedupe-constraints.js [--fix]` removes duplicate UNIQUE constraints that older `sync({ alter: true })` runs created.
* Backups: back up the PostgreSQL volume (e.g. `docker exec hochciv-db pg_dump -U hochciv hochciv > backup.sql`).
