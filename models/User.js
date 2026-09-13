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
            unique: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
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
        currentChallenge: {
            type: DataTypes.STRING,
            allowNull: true,
        }
    }, {
        tableName: 'users',
        timestamps: true,
    });

    return User;
};
