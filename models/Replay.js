const { DataTypes } = require('sequelize');

/**
 * The replay of a finished match (utils/replay.js): the game state after every turn, as one
 * Brotli-compressed JSON document { v, version, names, frames: [S, …] } – about 15 KB for a
 * whole game. `gameId` is the match in `games`. Deleted after REPLAY_KEEP_DAYS.
 */
module.exports = (sequelize) => {
    const Replay = sequelize.define('Replay', {
        gameId: {
            type: DataTypes.UUID,
            primaryKey: true,
        },
        // engine version the game was played with – the viewer opens it in that version
        version: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        frames: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        data: {
            type: DataTypes.BLOB,
            allowNull: false,
        },
    }, {
        tableName: 'replays',
        timestamps: true,
    });

    return Replay;
};
