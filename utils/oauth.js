/**
 * Google / Discord login. Strategies are configured by the super admin in the database and
 * (re)registered here at startup and whenever that configuration changes.
 */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('./discordStrategy').Strategy;
const { User, OAuthProvider } = require('../models');
const config = require('../config');
const { isMergeable, mergeInto } = require('./mergeAccounts');
const { recentlyAuthenticated, secondFactors } = require('./auth');

const PROVIDERS = ['google', 'discord'];
const strategies = new Set();       // providers with a registered strategy
const TAKEN = 'Dieses Konto ist bereits mit einem anderen Benutzer verknüpft.';

/** The provider's e-mail address, but only if the provider says it is verified. */
function verifiedEmail(provider, profile) {
    if (provider === 'google') {
        const e = profile.emails && profile.emails[0];
        return e && e.value && e.verified === true ? e.value : null;
    }
    if (provider === 'discord') {
        return profile.email && profile.verified === true ? profile.email : null;
    }
    return null;
}

/**
 * Connects a provider account to `user`; its automatic Activity account is merged in. On accounts
 * with a second factor this waits for that factor (routes/auth.js). Returns an error text or null.
 */
async function linkProvider(user, { idField, value, avatar }) {
    const owner = await User.findOne({ where: { [idField]: value } });
    if (owner && owner.id !== user.id) {
        if (!(await isMergeable(owner))) return TAKEN;
        const error = await mergeInto(user, owner);
        if (error) return error;
    }
    if (!user.isActive) {
        // Nobody has proven this address yet – whoever registered it may not own it.
        // The provider just did, so drop the unproven password and activate.
        user.password_hash = null;
        user.activationCode = null;
        user.isActive = true;
    }
    user[idField] = value;
    if (avatar && !user.avatarUrl) user.avatarUrl = avatar;
    await user.save();
    return null;
}

/**
 * Logging in with a linked provider account needs no second factor. A new link does, as it is a
 * new way in: done(null, user, { link }) has the login wait for the factor, nothing is saved yet.
 * `opts.create === false`: no new account, done(null, false, { message: 'noaccount' }) instead.
 */
async function handleOAuthProfile(req, provider, idField, profile, done, opts = {}) {
    try {
        const providerIdValue = String(profile.id);
        const email = verifiedEmail(provider, profile);
        const avatar = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : null;
        const owner = await User.findOne({ where: { [idField]: providerIdValue } });
        const link = { idField, value: providerIdValue, avatar };

        // 0. Linking from the account page: the user is already logged in
        if (req.user) {
            const user = await User.findByPk(req.user.id);
            // Linking a new provider account is a new way to log in – a stolen session cookie must not
            // be enough. Coming back with the account that is already linked is a re-confirmation.
            const isNew = user[idField] !== providerIdValue;
            const factors = isNew && await secondFactors(user);
            if (isNew && !factors && !recentlyAuthenticated(req)) {
                return done(null, false, { message: 'reauth' });
            }
            // The automatic account of the Discord Activity can be merged into this one, others not
            if (owner && owner.id !== user.id && !(await isMergeable(owner))) {
                return done(null, false, { message: TAKEN });
            }
            if (factors) return done(null, user, { link });
            const error = await linkProvider(user, link);
            return error ? done(null, false, { message: error }) : done(null, user);
        }

        // 1. Find by provider ID. An automatic Activity account whose verified Discord e-mail
        //    belongs to a real account is merged into that account first.
        if (owner && email && await isMergeable(owner)) {
            const user = await User.findOne({ where: { email } });
            if (user && user.id !== owner.id && !user.isBanned) {
                if (await secondFactors(user)) return done(null, user, { link });
                if (!(await linkProvider(user, link))) return done(null, user);
            }
        }
        if (owner) {
            if (owner.isBanned) return done(null, false, { message: 'banned' });
            if (avatar && !owner.avatarUrl) {
                owner.avatarUrl = avatar;
                await owner.save();
            }
            return done(null, owner);
        }

        // 2. Find by (verified) email and link
        if (email) {
            const user = await User.findOne({ where: { email } });
            if (user) {
                if (user.isBanned) return done(null, false, { message: 'banned' });
                if (await secondFactors(user)) return done(null, user, { link });
                await linkProvider(user, link);
                return done(null, user);
            }
        }

        // 3. Create new user with a unique, plain username – unless the login wasn't asked for
        //    (the app's automatic Play Games login only signs in to accounts that exist)
        if (opts.create === false) return done(null, false, { message: 'noaccount' });
        const displayName = profile.displayName || profile.username || (email ? email.split('@')[0] : '');
        let base = displayName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 24);
        if (base.length < 3) base = `${provider}_${providerIdValue.slice(0, 6)}`;
        let username = base;
        if (await User.findOne({ where: { username } })) {
            username = `${base}_${providerIdValue.slice(0, 5)}`;
        }

        const user = await User.create({
            username,
            email: email || `${provider}_${providerIdValue}@oauth.local`,
            password_hash: null,
            isActive: true,
            [idField]: providerIdValue,
            avatarUrl: avatar,
        });

        return done(null, user);
    } catch (err) {
        console.error(`[OAuth] ${provider} profile handling error:`, err);
        return done(err);
    }
}

async function refreshOAuthStrategies() {
    try {
        const providers = await OAuthProvider.findAll();

        for (const p of providers) {
            if (!PROVIDERS.includes(p.provider)) continue;
            passport.unuse(p.provider);
            strategies.delete(p.provider);
            if (!p.enabled || !p.clientId || !p.clientSecret) continue;

            const idField = p.provider === 'google' ? 'googleId' : 'discordId';
            const Strategy = p.provider === 'google' ? GoogleStrategy : DiscordStrategy;
            passport.use(p.provider, new Strategy({
                clientID: p.clientId,
                clientSecret: p.clientSecret,
                callbackURL: `${config.BASE_URL}/api/auth/${p.provider}/callback`,
                scope: p.provider === 'google' ? ['profile', 'email'] : ['identify', 'email'],
                state: true,        // CSRF protection for the callback
                passReqToCallback: true,
            }, (req, accessToken, refreshToken, profile, done) => {
                handleOAuthProfile(req, p.provider, idField, profile, done);
            }));
            strategies.add(p.provider);
            console.log(`[OAuth] ${p.provider} strategy registered.`);
        }
    } catch (err) {
        console.error('[OAuth] Failed to refresh strategies:', err);
    }
}

const isEnabled = provider => strategies.has(provider);

module.exports = { refreshOAuthStrategies, isEnabled, handleOAuthProfile, linkProvider };
