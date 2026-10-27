[← Documentation](../README.md)

# Troubleshooting

## Startup

`entrypoint.sh` builds `public/` from the game in the image and starts the server – it needs no network access. Common startup errors:

| Message | Cause and fix |
|---|---|
| `SESSION_SECRET is a publicly known default` | set your own value in `.env` |
| `Invalid BASE_URL "..."` | the value contains a path or stray characters (e.g. a trailing comma) – only scheme and host |
| `HochCiv/index.html fehlt` | the image was built without the game folder (check `.dockerignore`) |

## Changes to `.env` have no effect

`docker compose restart` does not re-read `.env`. Run `docker compose up -d`.

## Changed database credentials don't work

`POSTGRES_*` are only applied when the database volume is created for the first time. Change the password inside PostgreSQL, or remove the volume (this deletes all data).

## Google / Discord login fails

* `BASE_URL` missing: callbacks go to `http://localhost:3000`.
* The redirect URL registered at Google/Discord must match exactly. The *OAuth* admin tab shows the callback URLs the server really uses and warns when they differ from the page's address.

## Passkeys fail

Passkeys only work under the address in `BASE_URL`. Opened under another address (localhost while `BASE_URL` is a tunnel, a changed tunnel address, the Discord Activity) the browser refuses; the page says so (`client/passkey.js`).

## Discord Activity hangs

Look for `[Activity client …]` lines in `docker logs`: the bridge logs every step of the handshake and any page error. The bar at the top of the menu shows the current step. Check the URL mapping and the `https://127.0.0.1` redirect ([Discord Activity](discord-activity.md)).

## No push messages

The log must show `[Push] FCM enabled (project …)` at start. If not, `FCM_SERVICE_ACCOUNT` is missing or not valid base64/JSON ([Push notifications](push-notifications.md)).

## E-mails don't arrive

Without `SMTP_HOST` (and locally, without `NODE_ENV=production`) mails are only written to the log – activation and reset codes can be read there.

## Staging didn't update

`docker logs hochciv-staging-watchtower` shows whether the new `staging` image was found. The image is built by the *Build & Publish Docker Image* workflow on every push to `development`.
