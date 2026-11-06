const config = require('../config');

// The Android app's signing keys (public): Play, upload; the debug build only outside production.
const ANDROID_APPS = [
    { package: 'de.hochciv.app', sha256: [
        'DD:C3:95:68:89:86:99:95:81:91:23:9A:FC:B9:3D:D8:65:9F:A8:BA:82:92:DB:CF:C5:06:83:D1:AF:91:9E:5D',
        '95:A1:47:63:3E:EB:38:14:FA:87:2F:98:47:D3:17:8E:F9:22:11:3B:FC:6A:78:3C:B4:57:58:80:D4:C4:3A:F8',
    ] },
];
if (config.BASE_URL !== 'https://hochciv.de') {
    ANDROID_APPS.push({ package: 'de.hochciv.app.debug', sha256: ['F2:F5:BF:D4:0B:9F:3D:4C:8F:D8:57:50:2C:80:DD:0C:F3:99:4C:8E:BB:C2:07:2E:39:8A:E7:06:4E:6D:58:D0'] });
}

/** How WebAuthn names an Android app as the origin: the hash of its signing key. */
const apkOrigin = sha256 => 'android:apk-key-hash:' + Buffer.from(sha256.replace(/:/g, ''), 'hex').toString('base64url');
const APP_ORIGINS = ANDROID_APPS.flatMap(app => app.sha256.map(apkOrigin));

/**
 * Relying party for WebAuthn. Taken from BASE_URL when it is configured, so a forged
 * Host header cannot change what the passkey is checked against.
 */
function rp(req) {
    const web = config.WEBAUTHN || { rpID: req.hostname, origin: req.protocol + '://' + req.get('host') };
    return { rpID: web.rpID, origin: [web.origin, ...APP_ORIGINS] };
}

/** /.well-known/assetlinks.json: lets the app use this site's passkeys. */
const assetLinks = () => ANDROID_APPS.map(app => ({
    // handle_all_urls is what Bitwarden and other password managers ask Google for
    relation: ['delegate_permission/common.get_login_creds', 'delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: app.package, sha256_cert_fingerprints: app.sha256 },
}));

module.exports = { rp, assetLinks };
