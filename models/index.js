const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://hochciv:password123@hochciv-db:5432/hochciv', {
    dialect: 'postgres',
    logging: false, // Set to true to see SQL queries in logs
});

// Import models
const User = require('./User')(sequelize);
const Game = require('./Game')(sequelize);
const Passkey = require('./Passkey')(sequelize);
const TotpToken = require('./TotpToken')(sequelize);
const OAuthProvider = require('./OAuthProvider')(sequelize);

// Define relationships if needed in the future
User.hasMany(Game, { foreignKey: 'winnerUsername', sourceKey: 'username' });
Game.belongsTo(User, { foreignKey: 'winnerUsername', targetKey: 'username' });

User.hasMany(Passkey);
Passkey.belongsTo(User);

User.hasMany(TotpToken);
TotpToken.belongsTo(User);

module.exports = {
    sequelize,
    User,
    Game,
    Passkey,
    TotpToken,
    OAuthProvider
};
