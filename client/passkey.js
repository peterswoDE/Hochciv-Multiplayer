/**
 * Passkeys only work under the address they are set up for: the server takes it from BASE_URL
 * (utils/webauthn.js, the "rpID"). Opened under another address – localhost while BASE_URL is a
 * tunnel, a tunnel whose address has changed, the Discord Activity – the browser refuses, and
 * without this the page could only say "aborted". Used by account.js (adding a passkey) and
 * app.js (logging in with one).
 */
window.PASSKEY = {
    /** null when this page may use passkeys for `rpId`, otherwise what is wrong. */
    problem: function (rpId) {
        if (!window.PublicKeyCredential || !window.isSecureContext) {
            return HC_I18N.t('Passkeys gehen hier nicht: der Browser unterstützt sie nicht oder die Seite läuft ohne sichere Verbindung (https bzw. localhost).');
        }
        const host = location.hostname;
        if (rpId && host !== rpId && !host.endsWith('.' + rpId)) {
            return HC_I18N.t('Passkeys sind für %s eingerichtet, diese Seite läuft aber unter %s.', rpId, host) + ' ' +
                HC_I18N.t('Öffne Hochciv unter %s, um Passkeys zu nutzen.', rpId);
        }
        return null;
    },
    /** A readable message for a failed WebAuthn call. */
    errorText: function (err, rpId, fallback) {
        const p = this.problem(rpId);
        if (p) return p;
        const name = err && err.name;
        if (name === 'NotAllowedError') return HC_I18N.t('Abgebrochen – oder die Zeit zum Bestätigen ist abgelaufen.');
        if (name === 'InvalidStateError') return HC_I18N.t('Dieser Passkey ist bereits registriert.');
        if (name === 'SecurityError') return HC_I18N.t('Der Browser erlaubt Passkeys auf dieser Seite nicht.') + (err.message ? ' (' + err.message + ')' : '');
        return fallback + (err && err.message ? ' (' + err.message + ')' : '');
    },
};
