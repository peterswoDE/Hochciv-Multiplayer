const { DataTypes } = require('sequelize');

/**
 * Ranked seasons (F10, utils/seasons.js): one per calendar quarter, id like '2026-Q4'. A season
 * is closed (closedAt) when the next one begins: its final standings go to season_results and
 * every MMR moves halfway back to 1000.
 */
module.exports = (sequelize) => sequelize.define('Season', {
    id: { type: DataTypes.STRING(16), primaryKey: true },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: false },
    closedAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'seasons', timestamps: false });
