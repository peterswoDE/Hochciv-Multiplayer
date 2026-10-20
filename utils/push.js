/**
 * Push notifications through Firebase Cloud Messaging (HTTP v1 API), for the Android app.
 *
 * Configured by FCM_SERVICE_ACCOUNT: the service account key of the Firebase project (Firebase
 * console → Project settings → Service accounts → Generate new private key), as JSON or
 * base64-encoded JSON. Without it push is off and everything else works as before.
 *
 * Sends data-only messages: the app builds the notification itself (channel, texts, the link it
 * opens), also when it is in the background.
 *
 * Devices are addressed by their Firebase Installation ID (FID): the app uses Firebase Messaging's
 * register() / onRegistered API, which replaced registration tokens, so messages go to
 * `message.fid` (`message.token` is deprecated). DeviceToken.token holds that ID.
 */
const { GoogleAuth } = require('google-auth-library');

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function readServiceAccount() {
    const raw = (process.env.FCM_SERVICE_ACCOUNT || '').trim();
    if (!raw) return null;
    try {
        const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        const sa = JSON.parse(json);
        if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('project_id, client_email or private_key missing');
        return sa;
    } catch (err) {
        console.error('[Push] FCM_SERVICE_ACCOUNT is not a valid service account key – push is off:', err.message);
        return null;
    }
}

const account = readServiceAccount();
const auth = account ? new GoogleAuth({ credentials: account, scopes: [SCOPE] }) : null;
if (account) console.log(`[Push] FCM enabled (project ${account.project_id}).`);

const enabled = () => !!auth;

/**
 * Sends one message. `data` values must be strings. Returns 'sent', 'invalid' (the token is dead –
 * the caller deletes it) or 'error' (try again next time).
 */
async function send(token, data) {     // token = the device's FID
    if (!auth) return 'error';
    try {
        const client = await auth.getClient();
        await client.request({
            url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
            method: 'POST',
            data: {
                message: {
                    fid: token,
                    data,
                    // "Your turn" may arrive while the phone dozes; a day later it is stale
                    android: { priority: 'high', ttl: '86400s' },
                },
            },
        });
        return 'sent';
    } catch (err) {
        const status = err.response && err.response.status;
        const detail = err.response && err.response.data && err.response.data.error;
        const code = detail && detail.details && detail.details.map(d => d.errorCode).find(Boolean);
        // 404 UNREGISTERED: app uninstalled / token expired; 400 INVALID_ARGUMENT: not a token
        if (status === 404 || code === 'UNREGISTERED' || (status === 400 && code === 'INVALID_ARGUMENT')) return 'invalid';
        console.error('[Push] FCM send failed:', status || '', (detail && detail.message) || err.message);
        return 'error';
    }
}

module.exports = { enabled, send };
