const { DataTypes } = require('sequelize');

/**
 * Chat word filter entries added by admins (utils/profanity.js), on top of the built-in lists:
 * 'ban' – a message containing it is blocked and auto-reported; 'allow' – never counts as bad
 * language, even if a built-in list has it. `match` (for 'ban'): 'word' (only as a whole word)
 * or 'part' (anywhere, also inside a longer word: "arsch" in "Arschgeige", but in "Marsch" too). `word` is stored as
 * utils/profanity.js normalizes it (lower case, ä → ae, ß → ss).
 */
module.exports = (sequelize) => {
    const BannedWord = sequelize.define('BannedWord', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        word: { type: DataTypes.STRING(60), allowNull: false },
        kind: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ban' },
        match: { type: DataTypes.STRING, allowNull: false, defaultValue: 'word' },
        addedBy: { type: DataTypes.STRING, allowNull: true },        // admin username
    }, {
        tableName: 'banned_words',
        timestamps: true,
        // Unique as a named index, not `unique: true` (see models/User.js)
        indexes: [{ name: 'banned_words_word_key', unique: true, fields: ['word'] }],
    });

    return BannedWord;
};
