[← Documentation](../README.md)

# Google and Discord login

Players can log in with Google or Discord next to username and password. The providers are configured at runtime by a superadmin (stored in the `oauth_providers` table); `utils/oauth.js` registers the login strategies at startup and whenever that configuration changes.

## Setup

1. Set `BASE_URL` (see [Configuration](configuration.md)) and restart with `docker compose up -d`.
2. Register these redirect URLs exactly, with your domain:
   * Google Cloud Console → Credentials → OAuth client → *Authorized redirect URIs*: `https://<your-domain>/api/auth/google/callback`
   * Discord Developer Portal → your app → OAuth2 → *Redirects*: `https://<your-domain>/api/auth/discord/callback`
3. As superadmin, open *Mein Konto → Admin-Bereich → OAuth*, enter client ID and secret, tick *Aktiviert* and save. The tab shows the callback URLs the server really uses and warns if they do not match the address you opened the page with.

After logging in or linking an account, players return to the game with a short confirmation message (`/?oauth=<result>`).

## How accounts are matched

* A Google/Discord login whose **verified** e-mail belongs to an existing account is linked to that account and logs into it. Otherwise a new account is created (without a verified e-mail it gets a placeholder address).
* A logged-in player can link Google/Discord on the account page. Linking needs a recent login (the account page asks for the password or an authenticator code first), or the second factor if the account has one.
* Unlinking is only allowed if the account keeps a way to log in: a password, a passkey or the other provider.
* An account with a second factor is asked for it once, when a Google/Discord account is linked to it (`/?oauth=mfa` opens the dialog). After that, Google/Discord log in without it.
* Linking a Discord account that was created by the [Discord Activity](discord-activity.md) merges the Activity account into the real one: game history, Rundenspiele, games played and MMR move over (`utils/mergeAccounts.js`).

## Android app

Google refuses its login page inside the app's WebView, so the app signs in natively (Credential Manager) and sends the Google ID token to `POST /api/auth/google/idtoken`. Beforehand it gets the client ID and a one-time nonce from `GET /api/auth/google/app-config`; the nonce makes a token unusable twice or in another session. It uses the same Google configuration as above (client ID, *Aktiviert*) and the same account logic as the web login.

In the Google Cloud Console, the app also needs an **Android** OAuth client (package `de.hochciv.app`, the SHA-1 of the app's signing keys); its ID isn't entered here.

### Play Games login

If the player is signed in to Google Play Games on the phone, the app logs in by itself at start, with no tap. Play Games gives the app a one-time code (scopes `openid`, `email`, `profile`), the page sends it to `POST /api/auth/google/playgames`, and the server exchanges it at Google with the client ID **and secret** entered above (`utils/playGames.js`). The ID token it gets back carries the same Google account ID as the Google button, so both lead to the same HochCiv account.

This automatic login **only logs in to accounts that exist**: one linked to that Google account, or one with its verified e-mail (linked on the way, as above). It never creates an account – a new player taps "Google" once, after that it's automatic. It isn't used for linking while logged in, and the app stops trying after the player logs out, until the next manual login.

Setup in the Play Console (*Play Games-Dienste → Konfiguration → Anmeldedaten*): besides the Android credential, add a **Game server** credential with the same web OAuth client that is entered above. Play Games issues codes for that client only, and only if it is in the Play Games project's Google Cloud project.

Tests: `tests/auth/google-app-login.test.js` (instructions in the file).
