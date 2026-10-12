// Discord login on top of passport-oauth2 (replaces the unmaintained passport-discord).
// The profile has the same shape passport-discord produced: { provider, id, username, email, ... }.
const OAuth2Strategy = require('passport-oauth2');

class DiscordStrategy extends OAuth2Strategy {
    constructor(options, verify) {
        super({
            authorizationURL: 'https://discord.com/api/oauth2/authorize',
            tokenURL: 'https://discord.com/api/oauth2/token',
            scopeSeparator: ' ',
            ...options,
        }, verify);
        this.name = 'discord';
    }

    userProfile(accessToken, done) {
        this._oauth2.useAuthorizationHeaderforGET(true);
        this._oauth2.get('https://discord.com/api/users/@me', accessToken, (err, body) => {
            if (err) return done(new OAuth2Strategy.InternalOAuthError('Failed to fetch Discord profile', err));
            let json;
            try { json = JSON.parse(body); } catch (e) { return done(new Error('Failed to parse Discord profile')); }
            done(null, { ...json, provider: 'discord', _raw: body, _json: json });
        });
    }
}

module.exports = { Strategy: DiscordStrategy };
