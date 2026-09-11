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
            unique: true,
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
        timestamps: true,
    });

    return Passkey;
};
