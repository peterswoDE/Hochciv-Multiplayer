const { DataTypes } = require('sequelize');

/**
 * A player's report of a chat message (utils/reports.js), reviewed by an admin on the account
 * page ("Meldungen"). `context` is the game's chat history at the time of the report, taken from
 * the server's own copy – not from the reporting client. Reports about an account are kept as
 * long as the account exists; the others (a guest, a deleted account) for REPORT_KEEP_YEARS (3).
 */
module.exports = (sequelize) => {
    const Report = sequelize.define('Report', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        // what is reported – only 'chat' so far
        kind: { type: DataTypes.STRING, allowNull: false, defaultValue: 'chat' },
        // 'open' → 'resolved' (action taken) or 'dismissed' (nothing wrong)
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'open' },
        // 'live' (session id) or 'async' (Rundenspiel id) – where the chat took place
        source: { type: DataTypes.STRING, allowNull: false },
        sourceId: { type: DataTypes.STRING, allowNull: false },
        reporterId: { type: DataTypes.UUID, allowNull: true },        // null: a guest
        reporterName: { type: DataTypes.STRING, allowNull: false },
        reportedId: { type: DataTypes.UUID, allowNull: true },        // null: a guest
        reportedName: { type: DataTypes.STRING, allowNull: false },
        reason: { type: DataTypes.STRING(500), allowNull: true },
        message: { type: DataTypes.JSONB, allowNull: false },          // the reported chat message
        context: { type: DataTypes.JSONB, allowNull: false },          // [message, …] the chat history
        // the word filter (utils/profanity.js) reported it: the words it found, and the sender's
        // writing timeout that followed ('timeout': 5 minutes, 'game': the rest of the game)
        auto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        matches: { type: DataTypes.JSONB, allowNull: true },
        penalty: { type: DataTypes.STRING, allowNull: true },
        note: { type: DataTypes.STRING(1000), allowNull: true },       // the admin's note
        handledBy: { type: DataTypes.STRING, allowNull: true },        // admin username
        handledAt: { type: DataTypes.DATE, allowNull: true },
    }, {
        tableName: 'reports',
        timestamps: true,
        indexes: [{ name: 'reports_status_created', fields: ['status', 'createdAt'] }],
    });

    return Report;
};
