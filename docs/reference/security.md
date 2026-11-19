[← Documentation](../README.md)

# Security

## Operating a server

* Never commit `.env` or `secrets.env`; they are excluded from Git and from the Docker build.
* Audit reports, credentials and other sensitive security notes go into `security/`, which is excluded from Git and from the Docker build.
* Use a unique `SESSION_SECRET` and database password per installation (production and staging differ). The server refuses to start with a missing or publicly known secret.
* The game code in `HochCiv*/` runs on your server and in your players' browsers – review changes to it like server code.
* Only superadmins can grant admin rights or change OAuth settings; admins manage normal users only ([Administration](../operations/administration.md)). Changes that could take over an account – a new password, removing second factors, roles, deleting an account – and the OAuth settings need a recent login of the admin (password or authenticator), and every admin change is written to the log (`[Admin] <who> <what>`).
* The image runs the server as `node`, which may only write `public/`; the compose files drop all Linux capabilities, forbid privilege changes, limit processes and memory and wait for the database's health check. `POSTGRES_PASSWORD` has no default.
* The server connects to PostgreSQL as `hochciv_app`: it reads and writes rows but is no superuser and can't change the schema. Migrations run as `hochciv_owner` before the server starts, and the server process never sees that password; the superuser's password stays with the database ([Roles and migrations](database.md#roles-and-migrations)).
* Workflow actions are pinned to commit SHAs (Dependabot updates them); pull requests run `.github/workflows/checks.yml` (tests without a server, `npm audit`).

## Sessions and cookies

* Login sessions are stored in PostgreSQL (table `session`) and last 30 days.
* The cookie is `SameSite=Lax`, and `Secure` in production (`NODE_ENV=production`, behind a proxy with `trust proxy`).
* Changing `SESSION_SECRET` logs everyone out.
* A socket keeps the login it had when it connected. Whenever the other sessions of an account end – password change, password reset, a password set by an admin, a ban, deleting the account – its open sockets are closed as well (`utils/detachUser.js`), except those of the session that changed the password.

## Origin check

`utils/origin.js`. Socket.IO connections and changing API requests (POST, PUT, PATCH, DELETE) from a web page are only accepted from this site, the Discord Activity (`*.discordsays.com`) and `ALLOWED_ORIGINS`.

Why: the login cookie is `SameSite=Lax`, which other sites never get – but a page of the same site (e.g. `staging.hochciv.de` next to `hochciv.de`) would, and CORS doesn't cover WebSockets; simple form POSTs also get through before CORS blocks the answer. Requests without an `Origin` header (the Android app's native code, scripts) pass.

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
* **Deleting an account** removes its personal data and anonymizes its seats in other players' matches and replays ([Administration](../operations/administration.md#bans-and-deleted-accounts)).

## Game integrity

* The server is authoritative: every action is checked by the game engine on the server; a client can only act for its own seat, found by its secret `clientId` – never by an index it picks.
* Lobbies need code **and** 6-digit password.
* Ranked games are rated between different logged-in people only: no guest seats, no account twice, no bot with its owner ([Points and MMR](ranking.md#which-games-are-ranked)).
* Custom maps are checked with `checkCustomMap` and only a clean copy is stored.
* Public endpoints (profiles, matches, replays) only return public data: names, nations, points, MMR.

## Limits

* Request bodies: 20 KB.
* Rate limits on login, registration, codes, lobby creation/joining, map codes and other endpoints (`express-rate-limit`); the auth endpoints have separate limits per group (registration, login, second factor, passwordless passkey, reset, Android Google login), so one can't lock the others. Rundenspiel requests: 60 a minute per account.
* A Rundenspiel invitation sends one e-mail / push: inviting again while it is open sends nothing, a declined one can be renewed once a day.
* A live lobby nobody connects to within a minute is removed (`UNUSED_LOBBY_MS`), so creating lobbies can't fill the 500 slots.
* Socket.IO messages: at most 100 KB.
* Chat: 5 messages per 10 seconds per sender; word filter with auto-reports.
* At most 500 live lobbies/games and 20 spectators per game.

## HTTP headers

`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security` (over HTTPS), and `Content-Security-Policy: frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com` (instead of `X-Frame-Options`, so the Discord Activity can frame the game). `X-Powered-By` is off.

## Tests

`tests/security/security.test.js` covers the origin check, the authenticator lockout, the second factor after OAuth and bans; `tests/security/regression.test.js` the findings of the security audit of 2026-11-16.

## Discord Activity

The Activity's Discord access token must have been issued to this server's Discord application (checked with `GET /oauth2/@me`, scope `identify`): a token of another Discord app the player once used is refused.

## E-mails in the log

Without `SMTP_HOST` mails are written to the log. Locally (no `NODE_ENV=production`) with their codes; in production mode the six-digit codes are hidden unless `MAIL_LOG_CODES=on`. SMTP connections on ports other than 465 require STARTTLS.
