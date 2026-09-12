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
            unique: true,
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
        enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
    }, {
        tableName: 'oauth_providers',
        timestamps: true,
    });

    return OAuthProvider;
};
