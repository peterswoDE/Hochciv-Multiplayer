const { DataTypes } = require('sequelize');

/**
 * A custom map from the map editor ("Meine Karten"), kept in its owner's account. `map` is the
 * clean copy checkCustomMap (engine.js) returns – { name, rows, capitals } – and nothing else.
 *
 * Publishing gives the map a 6-character `code`; with it anybody can load the map (also without
 * an account) and play it. The code always points to the current version – saving the map again
 * under the same name updates what the code delivers. Unpublishing sets the code back to null.
 */
module.exports = (sequelize) => {
    const CustomMap = sequelize.define('CustomMap', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        ownerId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        // same as map.name – a column for the (ownerId, name) index
        name: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        map: {
            type: DataTypes.JSONB,
            allowNull: false,
        },
        code: {
            type: DataTypes.STRING(6),
            allowNull: true,
        },
        publishedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        // how often the map was loaded by its code (by others)
        loads: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        tableName: 'custom_maps',
        timestamps: true,
        // Unique as named indexes, not `unique: true`: sync({ alter: true }) re-added that as a new
        // constraint on every start (see scripts/dedupe-constraints.js)
        indexes: [
            { name: 'custom_maps_owner_name_key', unique: true, fields: ['ownerId', 'name'] },
            { name: 'custom_maps_code_key', unique: true, fields: ['code'] },
        ],
    });

    return CustomMap;
};
