const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const TotpToken = sequelize.define('TotpToken', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        secret: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            defaultValue: 'Authenticator App',
        }
    });

    return TotpToken;
};

