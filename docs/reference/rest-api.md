[← Documentation](../README.md)

# REST API

All endpoints take and return JSON (request body limit 20 KB). Logins are cookie sessions (Passport); the Android app sends the same cookie. Errors come back as `{ error: "<German message>" }` with a 4xx/5xx status; the client translates them ([Languages](../development/languages.md)).

**Access** column: *public* – no login; *login* – any logged-in account; *recent* – login plus a re-confirmation within the last 10 minutes (`POST /api/account/reauth`); *admin* / *superadmin* – that role. Changing requests (POST, PUT, PATCH, DELETE) from a web page must pass the [origin check](security.md#origin-check). Most routes are rate-limited.

## Auth – `/api/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/register` | public | Create an account (username, password, e-mail); sends an activation code. Refused while registration is off. |
| POST | `/activate` | public | Activate with the e-mailed code |
| POST | `/login` | public | Username + password. With 2FA, answers which second factors are needed. |
| POST | `/bot` | public | Bot account login: `{ token }` or `Authorization: Bearer <token>` → session ([Bot accounts](bot-accounts.md)) |
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

For bot creators and admins ([Bot accounts](bot-accounts.md)). Admins may act on every bot.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/[?all=1]` | login | Own bots (admins with `all=1`: every bot), `{ canCreate, limit, own, bots }` |
| POST | `/` | recent | Create a bot `{ username }` → `{ bot, token }` – the token is shown only now |
| POST | `/:id/token` | recent | New token → `{ token }`; the old one and its sessions end |
| POST | `/:id/transfer` | recent | Hand the bot over `{ username }` to another bot creator |
| DELETE | `/:id` | login | Delete the bot |

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
| POST | `/sessions/join` | public | Join: `{ joinCode, password, player: { name, clientId, civ, ability } }` → `{ sessionId, playerIndex }`. A logged-in bot account joins as a player-bot, if the lobby allows them ([Bot accounts](bot-accounts.md)). |
| POST | `/sessions/watch` | public | Watch as a spectator: `{ joinCode, password, viewer: { name, clientId } }` |
| GET | `/public-sessions` | public | Public lobbies and running public games |
| GET | `/sessions/:id` | public | Lobby info |
| DELETE | `/sessions/:id` | host (`{ clientId }`) | Cancel the lobby |
| GET | `/leaderboard[?type=bot]` | public | Top 100 human accounts by MMR; `type=bot`: top 100 bot accounts |

The `clientId` is a secret the browser generates and keeps; the game itself then runs over [Socket.IO](socket-events.md#live-games), where the seat is found by that `clientId`, never by an index the client picks.

## Rundenspiele – `/api/async` (login)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Own games, invitations, open public games |
| POST | `/` | Create: `{ config: { mapKey, civMode, humanCount, events, eventMode, wonders, difficulty, ranked, isPublic, … }, civ, ability, invite: [usernames] }`. Refused in maintenance mode. |
| GET | `/code/:code` | Look up a game by join code |
| POST | `/notify` | E-mail notifications on/off |
| GET | `/:id` | Game info and the player's view |
| POST | `/:id/join` | Take a seat |
| POST | `/:id/leave` | Leave before the start |
| POST | `/:id/cancel` | Host cancels |
| POST | `/:id/invite` | Invite a player by username |
| POST | `/:id/decline` | Decline an invitation |

Playing the opened game: [Socket.IO events → Rundenspiele](socket-events.md#rundenspiele). Rules: [Rundenspiele](rundenspiele.md).

## Custom maps – `/api/maps`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/code/:code` | public | Load a published map by its code |
| GET | `/` | login | The account's maps |
| POST | `/` | login | Save `{ map }` (checked with `checkCustomMap`; same name = same map) |
| DELETE | `/:id` | login | Delete a map |
| POST | `/:id/publish` | login | Give it a 6-character code |
| POST | `/:id/unpublish` | login | Remove the code |

## Matches and profiles – public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/games/:id` | Finished match: date, version, rounds, players with points and MMR changes, statistics, whether a replay exists, nation and wonder names (German, English; nations with their colour) |
| GET | `/api/games/:id/replay` | The replay `{ v, version, names, frames }`, Brotli-compressed for browsers that accept it |
| GET | `/api/profile/:userId[?offset=n]` | Name, MMR, games played, wins and the player's games |
| GET | `/api/stats[?seats=humans\|all&n=all\|2\|3\|4\|5+&mode=all\|normal\|duel\|marathon&ver=all\|vNN]` | Overall statistics over all finished matches: win rates per nation, ability and turn position, victory types, winners vs. the others, technologies, wonders, with German and English names (anonymous, cached for a minute) |

Only public data goes out: names, nations, points, MMR – no e-mail, role or account flags.

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

All routes need *admin*; `/oauth*` needs *superadmin*. Admins can only manage accounts with the role `user` or `botcreator`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/metrics` | Uptime, memory, CPU, maintenance/registration state, lobbies and players online |
| POST | `/config` | `{ maintenanceMode?, registrationEnabled? }` |
| GET | `/users` | All accounts; bots with `owner` and `botDisabled`, bot creators with `bots { count, limit }` |
| GET | `/users/:id/mfa` | A user's second factors |
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
| GET | `/health` | `{ ok: true, uptime }` |
