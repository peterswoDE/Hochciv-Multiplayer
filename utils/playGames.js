/**
 * Google Play Games sign-in of the Android app (POST /api/auth/google/playgames).
 *
 * The app's Play Games SDK hands out a one-time server auth code (requestServerSideAccess with
 * the scopes openid, email and profile). The server exchanges it at Google's token endpoint with
 * the web OAuth client – its secret never leaves the server – and gets an ID token for the
 * player's Google account. That is the same Google account ID as "Sign in with Google", so both
 * log in to the same HochCiv account.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10 * 1000;

/** code → Google's token response ({ id_token, access_token, … }); throws if Google refuses it. */
async function exchangeCode(clientId, clientSecret, code) {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            // codes from the Play Games SDK carry no redirect URI; Google expects it empty
            redirect_uri: '',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`token endpoint ${res.status} ${body.error || ''}`.trim());
    return body;
}

module.exports = { exchangeCode };
