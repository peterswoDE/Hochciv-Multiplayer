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
            allowNull: false,
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
        }
    }, {
        tableName: 'users',
        timestamps: true,
    });

    return User;
};
