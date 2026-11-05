const { DataTypes } = require('sequelize');

/**
 * Final standing of an account in a closed season (F10, utils/seasons.js): MMR, rank among the
 * accounts of its type (humans and bots apart), tier and its ranked games of that season.
 * The name is kept as it was; a deleted account's rows go with it.
 */
module.exports = (sequelize) => sequelize.define('SeasonResult', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    seasonId: { type: DataTypes.STRING(16), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false },
    accountType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'human' },
    mmr: { type: DataTypes.INTEGER, allowNull: false },
    rank: { type: DataTypes.INTEGER, allowNull: false },
    tier: { type: DataTypes.STRING(10), allowNull: true },
    games: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    wins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
    tableName: 'season_results',
    timestamps: false,
    indexes: [
        { name: 'season_results_season_user_key', unique: true, fields: ['seasonId', 'userId'] },
        { name: 'season_results_user', fields: ['userId'] },
    ],
});
