const { DataTypes } = require('sequelize');

/**
 * An asynchronous ("play by turn") game. Unlike live lobbies it is not kept in memory:
 * the whole game – seats, settings, pre-phase and engine state – lives here and is saved
 * after every action.
 *
 * The array columns exist for the game list: whose games, who is invited, whom the game
 * is waiting for (the "your turn" badge). Everything else is in `data` / `state`.
 */
module.exports = (sequelize) => {
    const AsyncGame = sequelize.define('AsyncGame', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        joinCode: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        hostUserId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        // setup (collecting players) → placement / draft → playing → finished | cancelled
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'setup',
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        participantIds: {
            type: DataTypes.ARRAY(DataTypes.UUID),
            allowNull: false,
            defaultValue: [],
        },
        invitedIds: {
            type: DataTypes.ARRAY(DataTypes.UUID),
            allowNull: false,
            defaultValue: [],
        },
        waitingIds: {
            type: DataTypes.ARRAY(DataTypes.UUID),
            allowNull: false,
            defaultValue: [],
        },
        // When the game started waiting for its current player (7-day rule, 5-day reminder)
        waitSince: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        reminded: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        round: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        // { config, seats, invites, pre, hold, result }
        data: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
        },
        // the engine state S (null before the game itself starts)
        state: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
    }, {
        tableName: 'async_games',
        timestamps: true,
        // Unique as a named index, not `unique: true`: sync({ alter: true }) re-added that as a new
        // constraint on every start (scripts/dedupe-constraints.js cleans up old copies)
        indexes: [
            { name: 'async_games_joinCode_key', unique: true, fields: ['joinCode'] },
            { fields: ['status'] },
            { fields: ['participantIds'], using: 'GIN' },
            { fields: ['invitedIds'], using: 'GIN' },
        ],
    });

    return AsyncGame;
};
