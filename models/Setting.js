const { DataTypes } = require('sequelize');

/**
 * Server settings from the admin panel (utils/settings.js): one row per key, the value as text.
 * Table from migrations/0006-settings.js.
 */
module.exports = (sequelize) => {
    const Setting = sequelize.define('Setting', {
        key: { type: DataTypes.STRING(60), primaryKey: true },
        value: { type: DataTypes.TEXT, allowNull: true },
        updatedBy: { type: DataTypes.STRING, allowNull: true },     // admin username
    }, {
        tableName: 'settings',
        timestamps: true,
    });

    return Setting;
};
