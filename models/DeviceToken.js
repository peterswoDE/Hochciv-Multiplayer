const { DataTypes } = require('sequelize');

/**
 * A device that receives push notifications (Firebase Cloud Messaging) for its logged-in user –
 * today only the Android app. A token belongs to one user at a time: logging in with another
 * account on the same phone moves it (routes/push.js). Tokens FCM rejects are deleted
 * (utils/push.js).
 */
module.exports = (sequelize) => {
    const DeviceToken = sequelize.define('DeviceToken', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        token: {
            type: DataTypes.STRING(512),
            allowNull: false,
        },
        platform: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'android',
        },
        lastSeenAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'device_tokens',
        indexes: [
            { name: 'device_tokens_token_key', unique: true, fields: ['token'] },
        ],
    });

    return DeviceToken;
};
