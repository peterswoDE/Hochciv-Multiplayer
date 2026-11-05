/**
 * Consent to the terms of use: Play requires it before anybody creates content, and it is how
 * existing accounts learn about a change (terms §10). The popup is client/consent.js.
 *
 *   · accounts: the accepted version is kept with the account (POST /api/account/terms; the
 *     Discord Activity has no site cookie: POST /api/activity/terms);
 *   · guests: on the device (they have no account and can't write texts or publish maps);
 *   · bots don't accept anything, their owner does.
 *
 * Raise VERSION with every change that needs a new consent: everybody sees the popup again.
 * TERMS_CHECK=off (docker-compose.local.yml, for the browser tests) turns all of it off.
 */
const { User } = require('../models');

const VERSION = '2026-11-05';
const CHECK = process.env.TERMS_CHECK !== 'off';
const NEEDED = 'Bitte stimme zuerst den Nutzungsbedingungen zu.';

const accepted = user => !CHECK || !!user && (user.accountType === 'bot' || user.termsVersion === VERSION);

/** For players known by id only (a seat in a live game). */
async function acceptedById(userId) {
    if (!CHECK) return true;
    return accepted(await User.findByPk(userId, { attributes: ['accountType', 'termsVersion'] }));
}

async function accept(user) {
    user.termsVersion = VERSION;
    user.termsAcceptedAt = new Date();
    await user.save({ fields: ['termsVersion', 'termsAcceptedAt'] });
}

module.exports = { VERSION: CHECK ? VERSION : null, NEEDED, accepted, acceptedById, accept };
