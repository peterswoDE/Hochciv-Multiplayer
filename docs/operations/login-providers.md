[← Documentation](../README.md)

# Google and Discord login

Players can log in with Google or Discord next to username and password. The providers are configured at runtime by a superadmin (stored in the `oauth_providers` table); `utils/oauth.js` registers the login strategies at startup and whenever that configuration changes.

## Setup

1. Set `BASE_URL` (see [Configuration](configuration.md)) and restart with `docker compose up -d`.
2. Register these redirect URLs exactly, with your domain:
   * Google Cloud Console → Credentials → OAuth client → *Authorized redirect URIs*: `https://<your-domain>/api/auth/google/callback`
   * Discord Developer Portal → your app → OAuth2 → *Redirects*: `https://<your-domain>/api/auth/discord/callback`
3. As superadmin, open *Account & Admin → OAuth*, enter client ID and secret, tick *Aktiviert* and save. The tab shows the callback URLs the server really uses and warns if they do not match the address you opened the page with.

After logging in or linking an account, players return to the game with a short confirmation message (`/?oauth=<result>`).

## How accounts are matched

* A Google/Discord login whose **verified** e-mail belongs to an existing account is linked to that account and logs into it. Otherwise a new account is created (without a verified e-mail it gets a placeholder address).
* A logged-in player can link Google/Discord on the account page. Linking needs a recent login (the account page asks for the password or an authenticator code first).
* Unlinking is only allowed if the account keeps a way to log in: a password, a passkey or the other provider.
* An account with a second factor is asked for it after the Google/Discord login too (`/?oauth=mfa` opens the dialog).
* Linking a Discord account that was created by the [Discord Activity](discord-activity.md) merges the Activity account into the real one: game history, Rundenspiele, games played and MMR move over (`utils/mergeAccounts.js`).

## Android app

Google refuses its login page inside the app's WebView, so the app signs in natively (Credential Manager) and sends the Google ID token to `POST /api/auth/google/idtoken`. Beforehand it gets the client ID and a one-time nonce from `GET /api/auth/google/app-config`; the nonce makes a token unusable twice or in another session. It uses the same Google configuration as above (client ID, *Aktiviert*) and the same account logic as the web login.

In the Google Cloud Console, the app also needs an **Android** OAuth client (package `de.hochciv.app`, the SHA-1 of the app's signing keys); its ID isn't entered here.

Tests: `tests/auth/google-app-login.test.js` (instructions in the file).
