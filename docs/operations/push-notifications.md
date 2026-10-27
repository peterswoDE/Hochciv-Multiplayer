[← Documentation](../README.md)

# Push notifications (Android app)

Rundenspiele notifications (invitation, your turn, reminder, takeover, finished) also go to the Android app as push messages, next to the e-mail. It's a second channel in `utils/notify.js` (sent by `utils/push.js` through the Firebase Cloud Messaging HTTP v1 API); the game code doesn't change.

## Setup

1. Create a Firebase project (it can be the Google Cloud project of the Google login).
2. Firebase console → *Project settings → Service accounts → Generate new private key*.
3. Put the key base64-encoded on one line in `.env` as `FCM_SERVICE_ACCOUNT` (see `.env.template` for the Linux and PowerShell commands) and run `docker compose up -d`.

Without it, push is off and nothing else changes. With it, the log shows `[Push] FCM enabled (project …)`. Keep the key secret – it can send messages to every app user.

## Devices and players

* **Devices:** the app registers its FCM token with `POST /api/push/token` after login and removes it on logout (`DELETE /api/push/token`). A phone belongs to the account that logged in on it last. Tokens Firebase rejects (app uninstalled) are deleted, as are those of deleted accounts.
* **Players** switch push on or off in the Rundenspiele list (*Push-Nachricht, wenn ich am Zug bin*, shown only in the app; `POST /api/push/notify`). Android's own notification settings work as well. E-mail notifications are switched separately (`POST /api/async/notify`).

## Tests

`tests/push/push.test.js` runs the server with a stub instead of Firebase (instructions in the file).
