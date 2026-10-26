const { DataTypes } = require('sequelize');

/**
 * One turn of a Rundenspiel that is still running (utils/replay.js): the game state after the
 * turn, Brotli-compressed. Rundenspiele run for days and survive restarts, so their frames wait
 * here; at the end they become one Replay and are deleted. `gameKey` is the AsyncGame.
 */
module.exports = (sequelize) => {
    const ReplayFrame = sequelize.define('ReplayFrame', {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        gameKey: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        seq: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        data: {
            type: DataTypes.BLOB,
            allowNull: false,
        },
    }, {
        tableName: 'replay_frames',
        timestamps: false,
        indexes: [{ name: 'replay_frames_game_seq', fields: ['gameKey', 'seq'] }],
    });

    return ReplayFrame;
};
