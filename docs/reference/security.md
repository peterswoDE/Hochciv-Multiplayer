[← Documentation](../README.md)

# Security

## Operating a server

* Never commit `.env` or `secrets.env`; they are excluded from Git and from the Docker build.
* Use a unique `SESSION_SECRET` and database password per installation (production and staging differ). The server refuses to start with a missing or publicly known secret.
* The game code in `HochCiv*/` runs on your server and in your players' browsers – review changes to it like server code.
* Only superadmins can grant admin rights or change OAuth settings; admins manage normal users only ([Administration](../operations/administration.md)).

## Sessions and cookies

* Login sessions are stored in PostgreSQL (table `session`) and last 30 days.
* The cookie is `SameSite=Lax`, and `Secure` in production (`NODE_ENV=production`, behind a proxy with `trust proxy`).
* Changing `SESSION_SECRET` logs everyone out.

## Origin check

`utils/origin.js`. Socket.IO connections and changing API requests (POST, PUT, PATCH, DELETE) from a web page are only accepted from this site, the Discord Activity (`*.discordsays.com`) and `ALLOWED_ORIGINS`.

Why: the login cookie is `SameSite=Lax`, which other sites never get – but a page of the same site (e.g. `staging.hochciv.de` next to `hochciv.de`) would, and CORS doesn't cover WebSockets; simple form POSTs also get through before CORS blocks the answer. Requests without an `Origin` header (the Android app's native code, scripts) pass.

## Logins and second factors

* **Second factor everywhere:** an account with 2FA (authenticator app, passkey, e-mail code) is asked for it after the password and after Google/Discord too (`/?oauth=mfa` opens the dialog; the Android app forwards the same reason). The first factor counts for 10 minutes.
* **Authenticator codes** are limited per account: after 5 wrong codes in a row, no code is accepted for 15 minutes (login and re-confirmation). E-mail codes are burnt after 5 wrong tries; activation, reset and e-mail-change codes count attempts as well.
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
* Custom maps are checked with `checkCustomMap` and only a clean copy is stored.
* Public endpoints (profiles, matches, replays) only return public data: names, nations, points, MMR.

## Limits

* Request bodies: 20 KB.
* Rate limits on login, registration, codes, lobby creation/joining, map codes and other endpoints (`express-rate-limit`).
* Chat: 5 messages per 10 seconds per sender; word filter with auto-reports.
* At most 500 live lobbies/games and 20 spectators per game.

## HTTP headers

`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and `Content-Security-Policy: frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com` (instead of `X-Frame-Options`, so the Discord Activity can frame the game). `X-Powered-By` is off.

## Tests

`tests/security/security.test.js` covers the origin check, the authenticator lockout, the second factor after OAuth and bans.
