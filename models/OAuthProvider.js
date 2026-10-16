const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const OAuthProvider = sequelize.define('OAuthProvider', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        provider: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isIn: [['google', 'discord']],
            },
        },
        clientId: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        clientSecret: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        // Discord only, optional: lets the Discord Activity check that a player belongs to
        // the activity instance whose lobby they join
        botToken: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
    }, {
        tableName: 'oauth_providers',
        // Unique as a named index, not `unique: true`: sync({ alter: true }) re-added that as a new
        // constraint on every start (scripts/dedupe-constraints.js cleans up old copies)
        indexes: [
            { name: 'oauth_providers_provider_key', unique: true, fields: ['provider'] },
        ],
        timestamps: true,
    });

    return OAuthProvider;
};
