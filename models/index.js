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
const AsyncGame = require('./AsyncGame')(sequelize);
const CustomMap = require('./CustomMap')(sequelize);
const DeviceToken = require('./DeviceToken')(sequelize);
const Replay = require('./Replay')(sequelize);
const ReplayFrame = require('./ReplayFrame')(sequelize);

// Define relationships if needed in the future
User.hasMany(Game, { foreignKey: 'winnerUsername', sourceKey: 'username' });
Game.belongsTo(User, { foreignKey: 'winnerUsername', targetKey: 'username' });

User.hasMany(Passkey);
Passkey.belongsTo(User);

User.hasMany(TotpToken);
TotpToken.belongsTo(User);

// Push notifications (Android app); a deleted or merged account takes its devices along
User.hasMany(DeviceToken, { onDelete: 'CASCADE' });
DeviceToken.belongsTo(User, { onDelete: 'CASCADE' });

module.exports = {
    sequelize,
    User,
    Game,
    Passkey,
    TotpToken,
    OAuthProvider,
    AsyncGame,
    CustomMap,
    DeviceToken,
    Replay,
    ReplayFrame
};
