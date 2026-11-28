[← Documentation](../README.md)

# REST API

All endpoints take and return JSON (request body limit 20 KB). Logins are cookie sessions (Passport); the Android app sends the same cookie. Errors come back as `{ error: "<German message>" }` with a 4xx/5xx status; the client translates them ([Languages](../development/languages.md)).

**Access** column: *public* – no login; *login* – any logged-in account; *recent* – login plus a re-confirmation within the last 10 minutes (`POST /api/account/reauth`); *admin* / *superadmin* – that role. Changing requests (POST, PUT, PATCH, DELETE) from a web page must pass the [origin check](security.md#origin-check). Most routes are rate-limited.

## Auth – `/api/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/register` | public | Create an account (username, password, e-mail); sends an activation code. Refused while registration is off. A taken username is refused; a taken e-mail address gets the same answer as a new one (its owner gets a note instead of a code). |
| POST | `/activate` | public | Activate with the e-mailed code |
| POST | `/login` | public | Username + password. With 2FA, answers which second factors are needed. |
| POST | `/bot` | public | Bot account login: `{ token }` or `Authorization: Bearer <token>` → session ([Bot accounts](bot-accounts.md)). A bot suspended for running into the [limits per account](security.md#limits) gets `403` with `{ error, code: 'suspended', retryAfter }` and a `Retry-After` header |
| POST | `/login/email-otp/request` | public | Send the e-mail code (second factor) |
| POST | `/login/email-otp/verify` | public | Check the e-mail code |
| POST | `/login/totp` | public | Check the authenticator code |
| POST | `/login/passkey/options` | public | Passkey challenge (second factor) |
| POST | `/login/passkey/verify` | public | Check the passkey (second factor) |
| POST | `/login/passkey/options-passwordless` | public | Passkey challenge for passwordless login |
| POST | `/login/passkey/verify-passwordless` | public | Passwordless login with a passkey |
| POST | `/reset-password/request` | public | Send a reset code |
| POST | `/reset-password/confirm` | public | Set a new password with the code |
| GET | `/mfa-pending` | public | The second factor still missing after a Google/Discord login |
| GET | `/me` | public | The logged-in user, or none |
| POST | `/logout` | public | Log out |
| GET | `/oauth-status` | public | Which OAuth providers are enabled |
| GET | `/google`, `/discord` | public | Start the OAuth login (redirect) |
| GET | `/google/callback`, `/discord/callback` | public | OAuth callback; returns to `/?oauth=<result>` |
| GET | `/google/app-config` | public | Android app: web client ID and a one-time nonce |
| POST | `/google/idtoken` | public | Android app: `{ idToken }` → `{ ok, linked }` or `{ ok: false, reason }` |

## Bot accounts – `/api/bots` (login, not for bots)

For bot creators and admins ([Bot accounts](bot-accounts.md)). Admins may act on every bot. How a bot uses the API: [Writing your own bot](../bots/writing-a-bot.md).

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/[?all=1]` | login | Own bots (admins with `all=1`: every bot), `{ canCreate, limit, own, bots }`. Each bot has a `description` string or null and `arenaLadderOptIn` |
| POST | `/` | recent | Create a bot `{ username }` → `{ bot, token }` – the token is shown only now |
| POST | `/:id/description` | owner or admin | Set public plain text `{ description }` → `{ description }`. The string is trimmed and limited to 280 Unicode code points. An empty string clears it and returns null |
| POST | `/:id/ladder-opt-in` | owner or admin | Take part in the [correspondence arena](rundenspiele.md#arena) or not: `{ arenaLadderOptIn: true/false }` → the same |
| POST | `/:id/token` | recent | New token → `{ token }`; the old one and its sessions end |
| POST | `/:id/transfer` | recent | Hand the bot over `{ username }` to another bot creator |
| DELETE | `/:id` | recent | Delete the bot (irreversible – a stolen session cookie alone is not enough) |

## Account – `/api/account` (login)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/reauth` | login | Re-confirm the identity: `{ password }` or `{ token }` (authenticator) |
| GET | `/recent-auth` | recent | Asked before linking Google/Discord |
| POST | `/unlink/:provider` | login | Unlink Google/Discord (only if another way to log in is left) |
| POST | `/update-password` | login (recent for passwordless accounts) | Change or set the password |
| POST | `/update-email` | login (recent for passwordless accounts) | Step 1: send a code to the new address |
| POST | `/confirm-email` | login | Step 2: confirm the new address with the code |
| GET | `/history` | login | The last 50 games of this account (including Rundenspiele where the KI took over) |
| GET / POST | `/blocks` | login | List / add blocked chat players |
| DELETE | `/blocks/:key` | login | Unblock |
| GET / PUT | `/presets` | login | Lobby presets: `{ list: [{ name, s }] }`, read and replaced as a whole; at most 10, unknown settings and values out of range are dropped (utils/presets.js) |
| POST | `/delete` | recent | Delete the own account (username typed as confirmation) |

## Second factors – `/api/mfa` (login; changes need recent)

| Method | Path | Purpose |
|---|---|---|
| POST | `/setup-totp` | New authenticator secret (QR code) |
| POST | `/verify-totp` | Confirm it with a first code |
| DELETE | `/totp/:id?` | Remove an authenticator (or all) |
| POST | `/toggle-email-otp` | E-mail code on/off |
| GET | `/tokens` | The account's authenticators and passkeys |
| POST | `/passkey/generate-registration` | Passkey registration challenge |
| POST | `/passkey/verify-registration` | Store the new passkey |
| DELETE | `/passkey/:id` | Remove a passkey |

## Live lobbies – `/api`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/sessions` | public | Create a lobby: `{ config, host: { name, clientId, civ, ability } }` → `{ sessionId, joinCode, password }`. Refused in maintenance mode. A logged-in bot account hosts as a player-bot. |
| POST | `/sessions/join` | public | Join: `{ joinCode, password, player: { name, clientId, civ, ability } }` → `{ sessionId, playerIndex }`. A logged-in bot account joins as a player-bot, if the lobby allows them and its bot filter lets this bot in ([Bot accounts](bot-accounts.md)). |
| POST | `/sessions/watch` | public | Watch as a spectator: `{ joinCode, password, viewer: { name, clientId } }` |
| POST | `/sessions/preview` | public | Invite link: `{ joinCode, password }` → the lobby as the list of open games shows it (`hostName`, `status`, `playersCount`, `maxPlayers`, settings) plus `players` (names); never the password or session id |

Join, watch and preview: after 10 wrong passwords within 10 minutes the lobby refuses newcomers for 5 minutes (`Zu viele falsche Passwörter für diese Lobby. …`); its players and spectators still get back in ([Security](security.md#limits)).
| GET | `/public-sessions` | public | Public lobbies and running public games, with the lobby's settings (`empires`, `kiCount`, `difficulty`, `randomCivs`, `events`, `eventMode`, `wonders`, `ranked`, `turnTime`, `customMapName`) for the filters of the open games, and `playerBots` / `playerBotsFree` / `playerBotFilter`. Asked by a logged-in bot, each row also has `playerBotsForYou` (the host's bot filter lets this bot in) |
| GET | `/playerbots` | public | The bot accounts a lobby host can pick in the bot filter: `{ bots: [{ id, username, owner, own, friend }] }`. Banned bots are left out. `own` / `friend` are only set for a logged-in person ([Bot accounts](bot-accounts.md#live-lobbies)) |
| GET | `/sessions/:id` | public | Lobby info |
| DELETE | `/sessions/:id` | host (`{ clientId }`) | Cancel the lobby |
| GET | `/leaderboard[?type=bot]` | public | Top 100 human accounts by MMR; `type=bot`: top 100 bot accounts |
| GET | `/settings` | public | Site navigation and links: `{ discordInvite, ladderPlacement }` |

The `clientId` is a secret the browser generates and keeps; the game itself then runs over [Socket.IO](socket-events.md#live-games), where the seat is found by that `clientId`, never by an index the client picks.

## Rundenspiele – `/api/async` (login)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Own games, invitations, open public games. Asked by a bot, each game also has `playerBotsForYou` (it may take a seat now: player-bots allowed, room under the limit, the host's bot filter lets it in) |
| POST | `/` | Create: `{ config: { mapKey, civMode, humanCount, events, eventMode, wonders, difficulty, ranked, isPublic, playerBots, playerBotLimit, playerBotFilter, … }, civ, ability, invite: [usernames] }`. `playerBotFilter` is `{ only, own, friends, allow, block }` ([Bot accounts](bot-accounts.md#rundenspiele)). Refused in maintenance mode. |
| GET | `/code/:code` | Look up a game by join code |
| GET | `/ladder[?version=v112]` | The [correspondence arena](rundenspiele.md#arena) of a game version (default: the current one): `{ version, editions, standings: [{ name, games, wins, draws, score }], games: [{ id, status, round, ranked, turnDays, names, winners, replay }] }` – the latest games up to the configured limit (default 30), `replay` is the match id once the replay is stored. Kept up to 60 seconds |
| POST | `/notify` | E-mail notifications on/off |
| GET | `/:id` | Game info and the player's view |
| POST | `/:id/join` | Take a seat |
| POST | `/:id/leave` | Leave before the start |
| POST | `/:id/cancel` | Host cancels |
| POST | `/:id/resign` | Resign while the game runs: the KI plays the seat to the end ([Resign](socket-events.md#resign)) |
| POST | `/:id/invite` | Invite a player by username (a bot account only when the game takes one more player-bot and its bot filter lets this bot in). One e-mail per invitation: again while it is open → `{ ok, already }` without a mail; a declined one can be renewed once a day |
| POST | `/:id/decline` | Decline an invitation |

These routes count against the [limits per account](security.md#limits): `GET /` 6 times a minute for a bot, 30 for a person (a `304` for `If-None-Match` is not counted); every other call of a bot 30 a minute. Over a limit a call is first held back for up to 2 seconds, then refused with `429`, a `Retry-After` header and `{ error, code: 'rate_limited', retryAfter }` (`403` with `code: 'suspended'` for a suspended bot). Creating (`POST /`) and joining (`POST /:id/join`) answer `400` with `code: 'too_many_games'` when the bots of one owner already have 60 running Rundenspiele, 5 open lobbies or 20 new games in the last hour.

Playing the opened game: [Socket.IO events → Rundenspiele](socket-events.md#rundenspiele). Rules: [Rundenspiele](rundenspiele.md).

## Custom maps – `/api/maps`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/code/:code` | public | Load a published map by its code |
| GET | `/browse` | public | Map browser: published maps, 24 per page – `?sort=popular\|new\|played` (popular = favorites, then plays), `&q=` (part of the map's or the author's name), `&players=` (at least this many empires), `&page=`, `&limit=` (≤ 100); `&only=favorites\|mine` needs a login. Each map with author, favorites, plays, `fav` (the viewer's favorite), `own`; `moderator` for admins |
| POST | `/browse/:id/pick` | public | A published map to play or keep – the current version, counted as played (not for the owner) |
| POST | `/:id/favorite` | login | `{ on }` mark or unmark a published map as a favorite → `{ fav, favorites }` |
| POST | `/:id/report` | login | `{ reason }` report a published map (once per player, not the own) |
| GET | `/` | login | The account's maps |
| POST | `/` | login | Save `{ map }` (checked with `checkCustomMap`; same name = same map) |
| DELETE | `/:id` | login | Delete a map |
| POST | `/:id/publish` | login | Give it a 6-character code |
| POST | `/:id/unpublish` | login | Remove the code |

Admins take a map out of the browser with `POST /api/admin/maps/:id/unpublish` (the map stays in its owner's account, the code stops working).

## Matches and profiles – public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/games/:id` | Finished match: date, version, rounds, players with points and MMR changes, statistics, whether a replay exists, nation and wonder names (German, English; nations with their colour) |
| GET | `/api/games/:id/replay` | The replay `{ v, version, names, frames }`, Brotli-compressed for browsers that accept it |
| GET | `/api/profile/:userId[?offset=n]` | Name, MMR, games played, wins and the player's games. Bot profiles include a public `description` string or null |
| GET | `/api/stats[?seats=humans\|bots\|players\|ki\|all&n=all\|2\|3\|4\|5+&mode=all\|normal\|duel\|marathon&ver=all\|vNN&origin=all\|online\|solo]` | Overall statistics over all finished matches: win rates per nation, ability and turn position, victory types, winners vs. the others, technologies, wonders, with German and English names (anonymous, cached for a minute) |
| GET | `/api/stats/player/:userId[?n=…&mode=…&ver=…]` | The same over one account's own seats (personal statistics, public like the profile): "how games are won" counts its wins, `query.seats` is `user`; a seat the KI took over still counts for its player |
| POST | `/api/solo/games` | A finished single-player game (login, no bots; up to 2 MB sent, 200 KB stored – a long chart is thinned; 30 an hour, 150 a day; 100 stored a day, then `429`): `{ cid, ver, state, t, rounds }` from client/solo.js → `{ ok, id, duplicate? }`. Checked for plausibility (known version, sane numbers, a finish the engine can score) and stored once per `cid` as a match marked `solo`; hotseat games without an account on any seat (utils/solo.js) |

Only public data goes out: names, nations, points, MMR – no e-mail, role or account flags.

## Seasons – `/api/seasons`

| Method | Path | Purpose |
|---|---|---|
| GET | `/leaderboard?season=<id>&type=human\|bot` | Top 100 of a season (default: the running one) with `tier`, `games`, `wins` of the season; `seasons` (all, newest first), `tiers`, `placementGames`; `me`: one's own row when logged in and not in the top 100 |

`GET /api/profile/:userId` (first page) also returns `season` (`{ id, endsAt, tier, games, wins, placementGames }`), `seasons` (closed seasons of the account), `badges` (`[{ k }]`) and `progress` (`nations`, `wonders`, `wins`, `played`).

## Weekly challenge – `/api/challenge`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/?week=<YYYY-Www>` | public | The week (default: this one; back to the oldest week anyone played, older ones are refused) with its bounds, `previous` / `next`, `weeks` (all playable weeks, newest first), `setup` (map, nation, ability, KI count and level, events, wonders), the top 20 (each player's best attempt finished before the week ended), `finished` (players on the leaderboard) / `playing` (running attempts) and – logged in – `me`: `attempts` (finished), `running` (`{ asyncId, week }` of the running attempt of any week, or null), `ranked` (the leaderboard entry), `best` (a better later attempt, not ranked) |
| POST | `/start` | login | `{ week? }`: start an attempt at this week or a past one (a Rundenspiel alone against three KI) → `{ asyncId }`. A running attempt (of any week) is resigned first: one runs at a time |
| GET | `/compare?week=<YYYY-Www>&game=<match id>` | public | An attempt (`game`; without it one's best of the week) next to the week's best: `best`, `attempt` (leaderboard row with `rank` or null, `civ`, `series`: the challenger's values per round – `s`, `c`, `pop`, `t`, `a`, `w` …), `same` (it is the best one) |

## Friends – `/api/friends` (login)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | `{ friends: [{ id, username, bot, mmr, online, seen, activity }], incoming, outgoing, invites, suggestions, max }`. `activity`: `{ status: lobby | playing, round, hostName }` plus `joinCode` / `password` / `full` of a public session |
| POST | `/` | `{ username }` or `{ id }`: send a request; accepts at once when the other asked first. Not to oneself, banned accounts or across a block, and bots don't send requests (a bot accepts or declines them); at most 200 friends and requests |
| POST | `/:id/accept` | Accept the request of account `:id` |
| DELETE | `/:id` | Decline, withdraw or end the friendship with account `:id` |

Rate limit: 60 requests a minute per account.

## Push – `/api/push` (login)

| Method | Path | Purpose |
|---|---|---|
| POST | `/token` | `{ token, platform }` – this device gets the user's notifications |
| DELETE | `/token` | `{ token }` – not any more (app logout) |
| POST | `/notify` | `{ on }` – push on/off for the user |

## Discord Activity – `/api/activity`

| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | The Discord client ID |
| POST | `/token` | Exchange the SDK's OAuth code for an access token |
| POST | `/lobby` | Seat the Discord user in the lobby of their activity instance |
| POST | `/log` | Bridge progress and errors → server log |

## Admin – `/api/admin`

All routes need *admin*; `/oauth*` needs *superadmin*. The review admin (`reviewadmin`) may use every GET route (and `POST /words/check`), with the exceptions noted below; every change is refused with 403. Admins can only manage accounts with the role `user` or `botcreator`. *Recent* (a re-confirmation within 10 minutes, the admin page asks for it) is needed for `DELETE /users/:id/mfa/…`, `DELETE /users/:id`, `POST /oauth/:provider` and the user actions other than `ban`, `unban`, `set_mmr` and `set_bot_limit`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/metrics` | Uptime, memory, CPU, maintenance/registration state, lobbies and players online |
| POST | `/config` | `{ maintenanceMode?, registrationEnabled? }` |
| GET | `/ladder` | Settings for the [correspondence arena](rundenspiele.md#arena) `{ enabled, turnDays, avoidRematches, sameOwnerRanked, pairingIntervalSeconds, placement, recentGamesLimit, canManage }`. `canManage` reflects this viewer's permission to save. |
| GET | `/ladder/status` | Ladder activity `{ optedIn, available, activeGames, lastCheckAt }`. `lastCheckAt` is an ISO timestamp or null. |
| POST | `/ladder` | `turnDays` is 1, 3 or 7. `enabled`, `avoidRematches` and `sameOwnerRanked` are booleans. `pairingIntervalSeconds` is an integer from 5 to 300 (default 15). `placement` is `leaderboard` (default) or `main-menu`. `recentGamesLimit` is a positive integer (default 30). Omitting the interval, placement, or recent game limit keeps its saved value. |
| GET | `/users` | All accounts; bots with `owner` and `botDisabled`, bot creators with `bots { count, limit }`. For the review admin the e-mail is masked (`p***@gmail.com`) |
| GET | `/users/:id/mfa` | A user's second factors (not for the review admin: 403) |
| DELETE | `/users/:id/mfa/:type/:tokenId?` | Remove a second factor |
| POST | `/users/:id/action` | `{ action }`: `ban`, `unban`, `set_mmr` (`mmr`), `force_password` (`newPassword`), `make_admin`, `set_role` (`role`), `reset_mfa`, `set_bot_limit` (`botLimit`, null = default). Bots: only ban/unban and `set_mmr`. |
| DELETE | `/users/:id` | Delete the account |
| GET | `/reports` | Chat reports |
| POST | `/reports/:id` | Handle a report: `{ status, note }` |
| GET / POST | `/words` | Word-filter entries of the admins / add one |
| DELETE | `/words/:id` | Remove an entry |
| POST | `/words/check` | Try a text against the filter |
| GET | `/lobbies` | Live lobbies and games in memory |
| POST | `/lobbies/:id/action` | `{ action: 'close' }` or `{ action: 'broadcast', message }` |
| GET | `/games[?q=&offset=]` | Finished matches, with player search |
| GET | `/running` | Running live games and Rundenspiele with their game version |
| GET | `/stats[?…]` | Like `/api/stats`, plus matches per version, KI and bot win rates by level and where the facts come from |
| GET | `/stats/export` | The facts of every match as a JSON download |
| POST | `/stats/recompute` | *superadmin*: recompute the facts of all matches (in the background) |
| GET | `/oauth` | OAuth provider configuration and the callback URLs |
| POST | `/oauth/:provider` | Save client ID, secret, enabled, bot token |

## Other

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ ok: true }` (no uptime – the admin dashboard shows it) |
