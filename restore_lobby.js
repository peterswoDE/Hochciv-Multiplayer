const fs = require('fs');
let mpOld = fs.readFileSync('mp_old.js', 'utf8');
let mpCurrent = fs.readFileSync('mp.js', 'utf8');

// Extract showLobby and updateLobbyConfig from mpOld
const match = mpOld.match(/(showLobby:\s*async\s*function\s*\(\)\s*\{[\s\S]*?updateLobbyConfig:\s*function\s*\(\)\s*\{[\s\S]*?this\.socket\.emit\('lobby:config',\s*newConfig\);\s*\},)/);

if (!match) {
    console.error("Could not find the lobby block in mp_old.js!");
    process.exit(1);
}

const lobbyCode = match[1];

// Insert it right after renderMainMenuAuth in mpCurrent
mpCurrent = mpCurrent.replace(/(renderMainMenuAuth:\s*async\s*function\s*\(\)\s*\{[\s\S]*?if\s*\(this\.renderLobby\)\s*this\.renderLobby\(\);\s*\},)/, `$1\n\n    ${lobbyCode}\n`);

fs.writeFileSync('mp.js', mpCurrent, 'utf8');
console.log("Restored showLobby and updateLobbyConfig!");
