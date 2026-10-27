const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        // null for accounts created automatically by the Discord Activity
        email: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // 'activity': created automatically for a Discord Activity player (merged into a real
        // account when that one links the same Discord account)
        origin: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        password_hash: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        mmr: {
            type: DataTypes.INTEGER,
            defaultValue: 1000,
            allowNull: false,
        },
        gamesPlayed: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        activationCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        activationCodeExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        resetCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        resetCodeExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // E-mail change: the new address is only stored as `email` once the code sent there is entered
        pendingEmail: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        emailChangeCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        emailChangeCodeExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // Wrong guesses per code type (utils/auth.js consumeCode) – separate, so requesting one
        // kind of code cannot reset the attempt limit of another
        activationCodeAttempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
        resetCodeAttempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
        emailOtpCodeAttempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
        emailChangeCodeAttempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
        role: {
            type: DataTypes.STRING,
            defaultValue: 'user',
            allowNull: false,
        },
        isBanned: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        googleId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        discordId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        avatarUrl: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        totpSecret: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Wrong authenticator codes in a row (utils/totp.js checkLimited): after 5 the codes are
        // refused until totpLockedUntil
        totpAttempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
        totpLockedUntil: { type: DataTypes.DATE, allowNull: true },
        totpEnabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        emailOtpEnabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        emailOtpCode: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        emailOtpExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // Async games: e-mail when it is your turn, invitations, reminders (opt-out)
        notifyEmail: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false,
        },
        // ... and as a push notification in the Android app (opt-out, utils/push.js)
        notifyPush: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false,
        },
        // Chat: players whose messages this user doesn't see (utils/reports.js),
        // [{ id (account) | null, name, at }] – guests are blocked by name
        blockedPlayers: {
            type: DataTypes.JSONB,
            defaultValue: [],
            allowNull: false,
        },
        currentChallenge: {
            type: DataTypes.STRING,
            allowNull: true,
        }
    }, {
        tableName: 'users',
        // Unique as a named index, not `unique: true`: sync({ alter: true }) re-added that as a new
        // constraint on every start (scripts/dedupe-constraints.js cleans up old copies)
        indexes: [
            { name: 'users_username_key', unique: true, fields: ['username'] },
            { name: 'users_email_key', unique: true, fields: ['email'] },
        ],
        timestamps: true,
    });

    return User;
};
