[← Documentation](../README.md)

# Security

## Operating a server

* Never commit `.env` or `secrets.env`; they are excluded from Git and from the Docker build.
* Audit reports, credentials and other sensitive security notes go into `security/`, which is excluded from Git and from the Docker build.
* Use a unique `SESSION_SECRET` and database password per installation (production and staging differ). The server refuses to start with a missing, publicly known or short (under 25 characters) secret.
* The game code in `HochCiv*/` runs on your server and in your players' browsers – review changes to it like server code.
* Only superadmins can grant admin rights or change OAuth settings; admins manage normal users only ([Administration](../operations/administration.md)). Changes that could take over an account – a new password, removing second factors, roles, deleting an account – and the OAuth settings need a recent login of the admin (password or authenticator), and every admin change is written to the log (`[Admin] <who> <what>`).
* The review admin (`reviewadmin`, for outside reviewers) reads but changes nothing, and gets as little personal data as possible: e-mail addresses only masked, no second factors of other users. Give the account only for the time of a review.
* The image runs the server as `node`, which may only write `public/`; the compose files drop all Linux capabilities, forbid privilege changes, limit processes and memory and wait for the database's health check. `POSTGRES_PASSWORD` has no default.
* The server connects to PostgreSQL as `hochciv_app`: it reads and writes rows but is no superuser and can't change the schema. Migrations run as `hochciv_owner` before the server starts, and the server process never sees that password; the superuser's password stays with the database ([Roles and migrations](database.md#roles-and-migrations)).
* Workflow actions are pinned to commit SHAs (Dependabot updates them); pull requests run `.github/workflows/checks.yml` (tests without a server, `npm audit`).

## Sessions and cookies

* Login sessions are stored in PostgreSQL (table `session`) and last 30 days from the last visit. The cookie and the stored expiry are renewed at most every 15 minutes, not on every request (`utils/session-cost.js`); Socket.IO reads the session only at the handshake, not on every poll.
* The logged-in user is kept up to `USER_CACHE_MS` (60 s) between requests. A ban, a role change or any other change of the `users` row – also by hand in `psql` – drops it at once: a trigger announces every change (`hochciv_user_changed`, migration 0008) and the server listens for it. Without that listener nothing is cached.
* The cookie is `SameSite=Lax`, and `Secure` in production (`NODE_ENV=production`, behind a proxy with `trust proxy`).
* Changing `SESSION_SECRET` logs everyone out.
* A socket keeps the login it had when it connected. Whenever the other sessions of an account end – password change, password reset, a password set by an admin, a ban, deleting the account – its open sockets are closed as well (`utils/detachUser.js`), except those of the session that changed the password.

## Origin check

`utils/origin.js`. Socket.IO connections and changing API requests (POST, PUT, PATCH, DELETE) from a web page are only accepted from this site, the Discord Activity (`*.discordsays.com`) and `ALLOWED_ORIGINS`.

Why: the login cookie is `SameSite=Lax`, which other sites never get – but a page of the same site (e.g. `staging.hochciv.de` next to `hochciv.de`) would, and CORS doesn't cover WebSockets; simple form POSTs also get through before CORS blocks the answer. Requests without an `Origin` header (the Android app's native code, scripts) pass.

CORS follows the same rule (`server.js`): only these origins get `Access-Control-Allow-Origin` (their own origin, never `*`) with credentials; any other site's page can't read answers with the visitor's cookie.

## Logins and second factors

* **Second factor:** an account with 2FA (authenticator app, passkey, e-mail code) is asked for it after the password, and once when a Google/Discord account is linked to it, also through the verified e-mail address (`/?oauth=mfa` opens the dialog; the Android app forwards the same reason). The link is only saved after that. Logging in with a linked Google/Discord account needs no second factor, but such a login doesn't count as a recent one: sensitive changes ask for the password or the second factor. The first factor counts for 10 minutes.
* **Authenticator codes** are limited per account: after 5 wrong codes in a row, no code is accepted for 15 minutes (login and re-confirmation). E-mail codes are burnt after 5 wrong tries; activation, reset and e-mail-change codes count attempts as well. Each attempt is counted in the database before the code is compared, in one statement, so parallel guesses can't share one count; a right code is used up once. A code that replaces one still valid keeps its failed attempts, and an account gets at most 3 codes of a kind per hour (reset, e-mail login, e-mail change) – so the IP limit is not the only bound on guessing.
* **Passwords:** after 20 wrong passwords for one account within 15 minutes, that account takes no password for the rest of the window, from any address. Changing the password is rate-limited like the re-confirmation. An unknown username costs as much time as a wrong password, and registration answers the same for a taken e-mail address as for a new one (the address's owner gets a note), so neither tells which accounts exist.
* **Re-confirmation:** sensitive changes (second factors, deleting the account, linking Google/Discord, password/e-mail for accounts without a password) need a password or authenticator confirmation within the last 10 minutes.
* **E-mail changes** only take effect after the code sent to the new address is entered – an unproven address could otherwise be linked to whoever logs in with it via Google/Discord and receive password resets.
* **Passkeys** are bound to the host in `BASE_URL`, so a forged `Host` header cannot change what they are checked against.
* **Google ID tokens** from the Android app carry a one-time nonce from the server: a token can't be used twice or in another session.

## Bans and account deletion

* **A ban** logs the account out everywhere, closes its open game connections and takes it off its live seats (the seat plays on as a guest's).
* **A host's kick** puts the player's tab (`clientId`) and account on the lobby's ban list: neither can join that session again; a guest seat that logs in with the kicked account is removed. A guest in a new tab gets past it – the host kicks again.
* **Deleting an account** removes its personal data and anonymizes its seats in other players' matches and replays ([Administration](../operations/administration.md#bans-and-deleted-accounts)).

## Game integrity

* The server is authoritative: every action is checked by the game engine on the server; a client can only act for its own seat, found by its secret `clientId` – never by an index it picks.
* Action parameters are plain values (`engine-adapter.js` `checkParams`): coordinates and ids (`r`, `c`, `cityId`, `armyId`, `target`) must be integers, coordinates on the map; tech/wonder keys are short identifiers; counts small positive integers. The engine compares positions with `===`, so a string coordinate would slip past its occupied-tile and stacking rules. The start-tile placement (`o`, `cell`) is checked the same way.
* Once a live game has started, a seat stays bound to the account that held it at the start: a reconnect with the seat's `clientId` from another account is refused, so a result (MMR) can't be booked to another account. Before the start, the seat takes over the login of whoever connects with it.
* Lobbies need code **and** 6-digit password.
* Ranked games are rated between different logged-in people only: no guest seats, no account twice. A bot plays rated against its owner too – a deliberate choice: an owner could farm MMR with a weak bot of their own ([Points and MMR](ranking.md#which-games-are-ranked)).
* Custom maps are checked with `checkCustomMap` and only a clean copy is stored.
* Public endpoints (profiles, matches, replays) only return public data: names, nations, points, MMR.

## Limits

* Request bodies: 20 KB.
* Rate limits on login, registration, codes, lobby creation/joining, map codes and other endpoints (`express-rate-limit`); the auth endpoints have separate limits per group (registration, login, second factor, passwordless passkey, reset, Android Google login), so one can't lock the others. Rundenspiel requests: 60 a minute per account.
* A Rundenspiel invitation sends one e-mail / push: inviting again while it is open sends nothing, a declined one can be renewed once a day.
* A live lobby nobody connects to within a minute is removed (`UNUSED_LOBBY_MS`), so creating lobbies can't fill the 500 slots.
* Socket.IO messages: at most 100 KB.
* Socket.IO events (`utils/socket-limit.js`): two token buckets per connection – game moves (`action`, `placement:action`) 100 at once, refilled at 30 a second; every other event 40, refilled at 10 a second. An event over the limit is not handled and its acknowledgement gets `Zu viele Anfragen – warte einen Moment.`; a connection that keeps sending into the empty bucket (about 10 seconds flat out) is disconnected. A player or a bot that waits for each acknowledgement never gets near it.
* Lobby passwords (`sessions.js` `checkPassword`): 10 wrong passwords within 10 minutes lock the lobby for 5 minutes for everyone not yet in it – also with the right password, so the lock gives a guesser nothing. Its players and spectators (by their `clientId`) still get back in, and so do the server's own joins (Discord Activity, matchmaking). Passwords are compared in constant time.
* Single-player games (`utils/solo.js`): at most 200 KB stored per game (a long chart over the rounds keeps every second round until it fits) and 100 games per account and 24 hours; uploads 30 an hour and 150 a day per account. A game over the daily cap gets a `429` and waits on the device.
* Chat: 5 messages per 10 seconds per sender; word filter with auto-reports.
* Limits per account (`utils/account-limits.js`): the limits above count per IP, route or socket; these count per account, so several sockets or many bots of one owner don't get round them:

| What | Bot | Person |
|---|---|---|
| Moves in Rundenspielen (`async:action`, `async:place`, `async:draft`, `async:civdraft`) | 5 a second, 30 at once | the same |
| Moves in one Rundenspiel, all its players together | 10 a second, 30 at once | the same |
| Engine time of the bot's moves (the KI turns they set off included) | 10 seconds a minute, 30 at once | – |
| Game list `GET /api/async` (a `304` doesn't count) | 6 a minute | 30 a minute |
| Every other Rundenspiel call (REST `/api/async/…` and `async:*` events) | 30 a minute | – |
| Chat (`async:chat`, `chat:send`) | once in 10 seconds | – |
| Sockets open at once | 3 | 5 |
| Rundenspiele of all bots of one owner | 60 running, 5 open lobbies, 20 new an hour | – |

  An empty bucket first delays the call (when the next token is due within 2 seconds and no other call of the account is waiting), then refuses it: REST with `429`, a `Retry-After` header and `{ error, code: 'rate_limited', retryAfter }`, a socket acknowledgement with the same object. Other codes: `engine_budget`, `too_many_sockets` (the socket gets a `limit` event and is closed), `too_many_games` (`400`), `suspended`. Every refusal is a strike, a strike fades after 20 seconds; a **bot** with 30 strikes is suspended for an hour (`users.suspendedUntil`, migration 0009): its login (`403`, `code: 'suspended'`) and session are refused, its sockets closed, and the admins get a report of kind `limit` with what it ran into. People are delayed and refused, never suspended. The counts live in the server process (one instance); `ACCOUNT_LIMITS_SCALE` scales them, `0` switches them off.
* At most 500 live lobbies/games and 20 spectators per game.

## Results and MMR

A finished game is booked in one transaction (`utils/rating.js`): the MMR of every account, the played games, the resign penalty and the match record – all or nothing. The accounts' rows are locked while their MMR is read, so a live and a Rundenspiel result of the same account at the same moment can't overwrite each other. A Rundenspiel writes its result into its own row in the same transaction: a restart before the game is saved doesn't count it twice. A Rundenspiel whose evaluation failed is tried again by the scheduler (every 10 minutes, up to 5 times).

## Push devices

A push device (`device_tokens`) keeps a SHA-256 of the session id that registered it. Another account takes the device over only once that login has ended (logout or expiry); before that `POST /api/push/token` answers `409`. The app unregisters the device on logout, so changing accounts on one phone works as before – knowing someone's FCM token alone doesn't redirect their notifications.

## HTTP headers

`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security` (over HTTPS), and `Content-Security-Policy: frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com` (instead of `X-Frame-Options`, so the Discord Activity can frame the game). `X-Powered-By` is off.

## Tests

`tests/security/security.test.js` covers the origin check, the authenticator lockout, the second factor after OAuth and bans; `tests/security/regression.test.js` the findings of the security audit of 2026-11-16. The fixes of the findings report of 2026-11-20 (IDs `R-xx`) have their tests in `tests/security/` as well (see [Testing](../development/testing.md)).

## Discord Activity

Inside the Activity, the bridge compiles only inline handlers that one of our templates produces (an allow-list built from `mp.js` and `client/` at build time, see [Discord Activity](../operations/discord-activity.md#notes)), so an HTML injection cannot use Discord's CSP workaround to run script.

The Activity's Discord access token must have been issued to this server's Discord application (checked with `GET /oauth2/@me`, scope `identify`): a token of another Discord app the player once used is refused.

## E-mails in the log

Without `SMTP_HOST` mails are written to the log. Locally (no `NODE_ENV=production`) with their codes; in production mode the six-digit codes are hidden unless `MAIL_LOG_CODES=on`. SMTP connections on ports other than 465 require STARTTLS.
