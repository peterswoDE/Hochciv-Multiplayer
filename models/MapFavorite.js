const { DataTypes } = require('sequelize');

/**
 * A player's favorite among the published maps (map browser, maps/service.js). The map's own
 * `favorites` column counts them, so the browser can sort by it without a join. A favorite of a
 * map that is unpublished stays – it shows up again when the map is published again.
 */
module.exports = (sequelize) => {
    const MapFavorite = sequelize.define('MapFavorite', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: { type: DataTypes.UUID, allowNull: false },
        mapId: { type: DataTypes.UUID, allowNull: false },
    }, {
        tableName: 'map_favorites',
        timestamps: true,
        updatedAt: false,
        // a named index, not `unique: true` (see CustomMap.js)
        indexes: [
            { name: 'map_favorites_user_map_key', unique: true, fields: ['userId', 'mapId'] },
            { name: 'map_favorites_map', fields: ['mapId'] },
        ],
    });

    return MapFavorite;
};
