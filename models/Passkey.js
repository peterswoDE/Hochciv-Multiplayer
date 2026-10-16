const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Passkey = sequelize.define('Passkey', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        credentialID: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        credentialPublicKey: {
            type: DataTypes.BLOB,
            allowNull: false,
        },
        counter: {
            type: DataTypes.BIGINT,
            defaultValue: 0,
            allowNull: false,
        },
        transports: {
            type: DataTypes.JSON,
            allowNull: true,
        }
    }, {
        tableName: 'passkeys',
        // Unique as a named index, not `unique: true`: sync({ alter: true }) re-added that as a new
        // constraint on every start (scripts/dedupe-constraints.js cleans up old copies)
        indexes: [
            { name: 'passkeys_credentialID_key', unique: true, fields: ['credentialID'] },
        ],
        timestamps: true,
    });

    return Passkey;
};
