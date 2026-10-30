/**
 * Patches the fetched game in public/ (called by entrypoint.sh and the Dockerfile):
 *   • loads the Socket.IO client from this server (Discord Activities may not use CDNs),
 *   • adds the multiplayer texts (client/i18n.js), the player profile (client/profile.js), mp.js, the scene player (client/scenes.js), the in-game chat (client/chat.js), the post-game statistics (client/stats.js), the overall statistics (client/gamestats.js), the replay viewer (client/replay.js), the matchmaking (client/matchmaking.js), the Discord Activity bridge and the
 *     mobile layer (client/mobile) to index.html,
 *   • points mp.js at this server,
 *   • writes a content hash into every script and stylesheet tag (utils/assets.js), so browsers
 *     keep these files until they change.
 * Each step checks on its own, so an already patched public/ is brought up to date.
 *
 * Usage: node inject.js [publicDir]
 */
const fs = require('fs');
const path = require('path');
const Assets = require('./utils/assets');
const { OUT_FILE: ACTIVITY_BUNDLE } = require('./activity/build');

const dir = process.argv[2] || 'public';
const htmlPath = path.join(dir, 'index.html');
const jsPath = path.join(dir, 'js', 'mp.js');

const SOCKET_IO = '<script src="/socket.io/socket.io.min.js"></script>';
// Multiplayer texts in the player's language – before profile.js and mp.js, which use them
const I18N = '<script src="/client/i18n.js"></script>';
const PROFILE = '<script src="/client/profile.js"></script>';
const MP = '<script src="js/mp.js"></script>';
// In-game chat (after mp.js, which it uses)
const CHAT = '<script src="/client/chat.js"></script>';
// Post-game statistics (after mp.js)
const STATS = '<script src="/client/stats.js"></script>';
// Overall statistics over all matches (menu button "Statistiken", mp.js)
const GAMESTATS = '<script src="/client/gamestats.js"></script>';
// What the others did, played on the map (after mp.js, which queues it)
const SCENES = '<script src="/client/scenes.js"></script>';
// Replay viewer, ?replay=<id> (after mp.js)
const REPLAY = '<script src="/client/replay.js"></script>';
// Ranked matchmaking (after mp.js)
const MATCH = '<script src="/client/matchmaking.js"></script>';
const ACTIVITY = '<script src="js/activity.js"></script>';
// Mobile layer (client/mobile): zoomable maps, compact layout on phones. After mp.js – it wraps
// game functions and styles mp.js's widgets.
const MOBILE_CSS = '<link rel="stylesheet" href="/client/mobile/mobile.css">';
const MOBILE_JS = '<script src="/client/mobile/mobile.js"></script>';

if (fs.existsSync(jsPath)) {
    let js = fs.readFileSync(jsPath, 'utf8');
    js = js.replace(/serverUrl:\s*["']http:\/\/localhost:3000["']/g, 'serverUrl: ""');
    fs.writeFileSync(jsPath, js, 'utf8');
}

// The file behind a url of index.html – null for what is not ours (Socket.IO serves its own client)
function fileOf(url) {
    if (url === 'js/activity.js') return ACTIVITY_BUNDLE;           // server.js serves the bundle
    if (url.startsWith('/client/')) return path.join(__dirname, url);
    if (url.startsWith('/')) return null;
    return path.join(dir, url);
}

if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    // without the hashes of an earlier run, so the tags below are found again
    html = html.replace(/(\s(?:src|href)="[^"?#]+\.(?:js|css))\?v=[^"]*"/g, '$1"');
    html = html.replace(/<script\s+src="https:\/\/cdn\.socket\.io\/[^"]*"\s*><\/script>/g, SOCKET_IO);
    if (!html.includes(MOBILE_CSS)) html = html.replace('</head>', MOBILE_CSS + '\n</head>');
    const missing = [SOCKET_IO, I18N, PROFILE, MP, SCENES, CHAT, STATS, GAMESTATS, REPLAY, MATCH, ACTIVITY, MOBILE_JS].filter(tag => !html.includes(tag));
    if (missing.length) html = html.replace('</body>', missing.join('\n') + '\n</body>');
    html = Assets.versioned(html, fileOf);
    fs.writeFileSync(htmlPath, html, 'utf8');
}
