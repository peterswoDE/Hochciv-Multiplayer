/**
 * Patches the fetched game in public/ (called by entrypoint.sh and the Dockerfile):
 *   • loads the Socket.IO client from this server (Discord Activities may not use CDNs),
 *   • adds the multiplayer texts (client/i18n.js), the game log in the player's language (client/logtext.js), the player profile (client/profile.js), mp.js, the scene player (client/scenes.js), the in-game chat (client/chat.js), the post-game statistics (client/stats.js), the player report (client/report.js), the overall statistics (client/gamestats.js), the replay viewer (client/replay.js), the matchmaking (client/matchmaking.js), the sound and tab alerts (client/alerts.js), the friends list (client/friends.js), the leaderboard (client/ranking.js), the weekly challenge (client/challenge.js), the end of a game in full screen (client/victory.js), the lobby presets (client/presets.js), pause and "continue as a Rundenspiel" (client/pause.js), the single-player recorder (client/solo.js), the Discord Activity bridge, the
 *     map browser (client/maps), the mobile layer (client/mobile) and the map effects (client/fx.js) to index.html,
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
// The game log in the player's language (after client/i18n.js, before mp.js, which uses it)
const LOGTEXT_JS = '<script src="/client/logtext.js"></script>';
const PROFILE = '<script src="/client/profile.js"></script>';
const MP = '<script src="js/mp.js"></script>';
// In-game chat (after mp.js, which it uses)
const CHAT = '<script src="/client/chat.js"></script>';
// The popup for the terms of use (after mp.js, whose login and lobby it wraps)
const CONSENT = '<script src="/client/consent.js"></script>';
// Post-game statistics (after mp.js)
const STATS = '<script src="/client/stats.js"></script>';
// The end screen's tabs, Civ IV style (after client/stats.js and client/solo.js, whose data it shows)
const ENDSCREEN = '<script src="/client/endscreen.js"></script>';
// Player report (after mp.js and client/stats.js, whose chart it uses)
const REPORT = '<script src="/client/report.js"></script>';
// Overall statistics over all matches (menu button "Statistiken", mp.js)
const GAMESTATS = '<script src="/client/gamestats.js"></script>';
// What the others did, played on the map (after mp.js, which queues it)
const SCENES = '<script src="/client/scenes.js"></script>';
// Replay viewer, ?replay=<id> (after mp.js)
const REPLAY = '<script src="/client/replay.js"></script>';
// Ranked matchmaking (after mp.js)
const MATCH = '<script src="/client/matchmaking.js"></script>';
// Sound and tab alerts (after mp.js, which calls them)
const ALERTS = '<script src="/client/alerts.js"></script>';
// Friends list (after mp.js, which it uses)
const FRIENDS = '<script src="/client/friends.js"></script>';
// Leaderboard and seasons (after mp.js and profile.js)
const RANKING = '<script src="/client/ranking.js"></script>';
// Single-player games for the statistics (after mp.js: it follows saveGame / gameOver and the login)
const SOLO = '<script src="/client/solo.js"></script>';
// Pause a live game, continue it as a Rundenspiel (after mp.js, which calls it)
const PAUSE = '<script src="/client/pause.js"></script>';
// Lobby presets (after mp.js, whose lobby and Rundenspiel form show them)
const PRESETS = '<script src="/client/presets.js"></script>';
// Weekly challenge (after mp.js)
const CHALLENGE = '<script src="/client/challenge.js"></script>';
// The end of a game, full screen (after mp.js, whose gameOver() patch plays it)
const VICTORY = '<script src="/client/victory.js"></script>';
const ACTIVITY = '<script src="js/activity.js"></script>';
// Map browser (client/maps): published maps and favorites. After mp.js, whose MAPACCOUNT it uses.
const MAPS_CSS = '<link rel="stylesheet" href="/client/maps/maps.css">';
const MAPS_JS = '<script src="/client/maps/maps.js"></script>';
// Mobile layer (client/mobile): zoomable maps, compact layout on phones. After mp.js – it wraps
// game functions and styles mp.js's widgets.
const MOBILE_CSS = '<link rel="stylesheet" href="/client/mobile/mobile.css">';
const MOBILE_JS = '<script src="/client/mobile/mobile.js"></script>';
// Map effects (client/fx.js): events, battles, cities. Last – it wraps drawMap outside of
// client/chat.js and client/mobile/mobile.js.
const FX = '<script src="/client/fx.js"></script>';

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
    if (!html.includes(MAPS_CSS)) html = html.replace('</head>', MAPS_CSS + '\n</head>');
    if (!html.includes(MOBILE_CSS)) html = html.replace('</head>', MOBILE_CSS + '\n</head>');
    const missing = [SOCKET_IO, I18N, LOGTEXT_JS, PROFILE, MP, ALERTS, FRIENDS, RANKING, CHALLENGE, VICTORY, PRESETS, PAUSE, SOLO, SCENES, CHAT, CONSENT, STATS, ENDSCREEN, REPORT, GAMESTATS, REPLAY, MATCH, ACTIVITY, MAPS_JS, MOBILE_JS, FX].filter(tag => !html.includes(tag));
    if (missing.length) html = html.replace('</body>', missing.join('\n') + '\n</body>');
    html = Assets.versioned(html, fileOf);
    fs.writeFileSync(htmlPath, html, 'utf8');
}
