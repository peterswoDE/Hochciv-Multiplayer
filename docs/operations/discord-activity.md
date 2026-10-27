[← Documentation](../README.md)

# Discord Activity

The game runs as a [Discord Activity](https://discord.com/developers/docs/activities/overview). Players start it from the Activity launcher of a voice channel or DM. They are signed in with Discord and everyone in the call lands in the same lobby, with no join codes. The first player is host.

## Setup

It uses the same Discord application as the [Discord login](login-providers.md):

1. Set up Discord login (client ID and secret in *Account & Admin → OAuth*). The Activity only needs ID and secret; *Aktiviert* only controls the website login.
2. Discord Developer Portal → your app:
   * **Activities → Settings:** enable Activities.
   * **Activities → URL Mappings:** prefix `/` → target your domain without the scheme, e.g. `hochciv.example`.
   * **OAuth2 → Redirects:** besides the login callback, add `https://127.0.0.1` as a placeholder. Discord requires one for the Activity's authorization.
   * **Installation:** allow *Guild Install* and/or *User Install*.
3. Optional: enter the app's bot token (Developer Portal → Bot) in the same OAuth tab. The server then checks that only players who are in the call can join its lobby. It must be the token of the same app.

## How it works

Discord shows the game in an iframe on `https://<client id>.discordsays.com` and forwards every request to this server. The bridge (`activity/bridge.js`, bundled with Discord's Embedded App SDK by `activity/build.js` and served as `/js/activity.js`) does the SDK handshake and uses these routes:

| Route | Purpose |
|---|---|
| `GET /api/activity/config` | the Discord client ID |
| `POST /api/activity/token` | exchanges the SDK's OAuth code for an access token |
| `POST /api/activity/lobby` | seats the Discord user in the lobby of their activity instance |
| `POST /api/activity/log` | progress and errors of the bridge, written to the server log |

One lobby per activity instance: everyone who launches the Activity in the same call lands in the same lobby. Each Discord user gets a secret clientId per instance, so reopening the Activity puts them back into their seat. If the lobby is gone (host left before the start, game over), the next player to join creates a fresh one.

Players get an account automatically (no e-mail, no password, origin `activity`) for their match history. Linking that Discord account to a real account later merges them.

## Notes

* **Guests in the UI.** Inside Discord, account login, ranked games and Rundenspiele are hidden, because login cannot run in Discord's iframe.
* **Joining by code still works.** The normal *Multiplayer* menu works, so Discord players can also play with people on the website.
* **Watching.** Whoever joins a running game or a full lobby watches as a spectator.
* **Framing.** Discord may embed the game: the server sends `Content-Security-Policy: frame-ancestors 'self'` plus the Discord domains, instead of `X-Frame-Options`.
* **Troubleshooting.** Inside Discord, the Activity script writes every step and any page error to the server log (`[Activity client …]` lines in `docker logs`). The bar at the top of the menu shows the current step.
* **Local testing.** Discord needs a public HTTPS URL. Use a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000`, and enter its host as the URL mapping target. Outside Discord, the Activity script does nothing.
