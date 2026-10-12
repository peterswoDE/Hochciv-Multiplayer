/**
 * Google / Discord login. Strategies are configured by the super admin in the database and
 * (re)registered here at startup and whenever that configuration changes.
 */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('./discordStrategy').Strategy;
const { User, OAuthProvider } = require('../models');
const config = require('../config');

const PROVIDERS = ['google', 'discord'];
const strategies = new Set();       // providers with a registered strategy

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

async function handleOAuthProfile(req, provider, idField, profile, done) {
    try {
        const providerIdValue = String(profile.id);
        const email = verifiedEmail(provider, profile);
        const avatar = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : null;
        const owner = await User.findOne({ where: { [idField]: providerIdValue } });

        // 0. Linking from the account page: the user is already logged in
        if (req.user) {
            if (owner && owner.id !== req.user.id) {
                return done(null, false, { message: 'Dieses Konto ist bereits mit einem anderen Benutzer verknüpft.' });
            }
            const user = await User.findByPk(req.user.id);
            user[idField] = providerIdValue;
            if (avatar && !user.avatarUrl) user.avatarUrl = avatar;
            await user.save();
            return done(null, user);
        }

        // 1. Find by provider ID
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
                if (!user.isActive) {
                    // Nobody has proven this address yet – whoever registered it may not own it.
                    // The provider just did, so drop the unproven password and activate.
                    user.password_hash = null;
                    user.activationCode = null;
                    user.isActive = true;
                }
                user[idField] = providerIdValue;
                if (avatar && !user.avatarUrl) user.avatarUrl = avatar;
                await user.save();
                return done(null, user);
            }
        }

        // 3. Create new user with a unique, plain username
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

module.exports = { refreshOAuthStrategies, isEnabled };
