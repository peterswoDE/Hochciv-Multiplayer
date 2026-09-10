const { sequelize, User } = require('./models');

async function elevate(username) {
    try {
        await sequelize.authenticate();
        const user = await User.findOne({ where: { username } });
        if (!user) {
            console.log(`Benutzer '${username}' nicht gefunden!`);
            process.exit(1);
        }
        
        user.role = 'admin';
        await user.save();
        console.log(`Erfolg! Benutzer '${username}' ist jetzt ein Administrator.`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

const target = process.argv[2];
if (!target) {
    console.log("Bitte gib einen Benutzernamen an. Beispiel: node elevate.js admin");
    process.exit(1);
}

elevate(target);
