const { DataTypes } = require('sequelize');

/**
 * Weekly challenge (F21, utils/challenge.js): one attempt per account and week. The row is made
 * when the attempt starts (asyncId: its Rundenspiel) and filled in when that game ends.
 */
module.exports = (sequelize) => sequelize.define('ChallengeResult', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    weekId: { type: DataTypes.STRING(10), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false },
    asyncId: { type: DataTypes.UUID, allowNull: true },
    finished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    won: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    rounds: { type: DataTypes.INTEGER, allowNull: true },
    points: { type: DataTypes.INTEGER, allowNull: true },
    gameId: { type: DataTypes.UUID, allowNull: true },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'challenge_results',
    timestamps: true,
    indexes: [
        { name: 'challenge_results_week_user_key', unique: true, fields: ['weekId', 'userId'] },
        { name: 'challenge_results_user', fields: ['userId'] },
    ],
});
