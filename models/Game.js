const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Game = sequelize.define('Game', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        version: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        durationRounds: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        matchDate: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        winnerUsername: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        participants: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        // Score and counts over the rounds, key moments (utils/stats.js) – null for older games
        stats: {
            type: DataTypes.JSONB,
            allowNull: true,
        }
    }, {
        tableName: 'games',
        timestamps: true,
    });

    return Game;
};
