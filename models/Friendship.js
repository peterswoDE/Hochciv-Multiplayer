const { DataTypes } = require('sequelize');

/**
 * Friends list (F8, utils/friends.js). One row per pair: `userId` asked `friendId`. While
 * `status` is 'pending' only the asked player can accept; 'accepted' is mutual. Declining or
 * removing deletes the row.
 */
module.exports = (sequelize) => {
    const Friendship = sequelize.define('Friendship', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: { type: DataTypes.UUID, allowNull: false },
        friendId: { type: DataTypes.UUID, allowNull: false },
        status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'pending' },
    }, {
        tableName: 'friendships',
        timestamps: true,
        // named indexes, not `unique: true` (see CustomMap.js)
        indexes: [
            { name: 'friendships_pair_key', unique: true, fields: ['userId', 'friendId'] },
            { name: 'friendships_friend', fields: ['friendId'] },
        ],
    });

    return Friendship;
};
