// Give a user admin rights from the command line (e.g. the very first superadmin):
//   node elevate.js <username> [admin|superadmin]      (default: admin)
const { sequelize, User } = require('./models');

const ROLES = ['user', 'admin', 'superadmin'];

async function elevate(username, role) {
    try {
        await sequelize.authenticate();
        const user = await User.findOne({ where: { username } });
        if (!user) {
            console.log(`Benutzer '${username}' nicht gefunden!`);
            process.exit(1);
        }

        user.role = role;
        await user.save();
        console.log(`Erfolg! Benutzer '${username}' hat jetzt die Rolle '${role}'.`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

const target = process.argv[2];
const role = process.argv[3] || 'admin';
if (!target || !ROLES.includes(role)) {
    console.log("Aufruf: node elevate.js <benutzername> [admin|superadmin]   Beispiel: node elevate.js peter superadmin");
    process.exit(1);
}

elevate(target, role);
