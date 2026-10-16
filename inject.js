/**
 * Patches the fetched game in public/ (called by entrypoint.sh and the Dockerfile):
 *   • loads the Socket.IO client from this server (Discord Activities may not use CDNs),
 *   • adds the player profile (client/profile.js), mp.js and the Discord Activity bridge to index.html,
 *   • points mp.js at this server.
 * Each step checks on its own, so an already patched public/ is brought up to date.
 *
 * Usage: node inject.js [publicDir]
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'public';
const htmlPath = path.join(dir, 'index.html');
const jsPath = path.join(dir, 'js', 'mp.js');

const SOCKET_IO = '<script src="/socket.io/socket.io.min.js"></script>';
const PROFILE = '<script src="/client/profile.js"></script>';
const MP = '<script src="js/mp.js"></script>';
const ACTIVITY = '<script src="js/activity.js"></script>';

if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/<script\s+src="https:\/\/cdn\.socket\.io\/[^"]*"\s*><\/script>/g, SOCKET_IO);
    const missing = [SOCKET_IO, PROFILE, MP, ACTIVITY].filter(tag => !html.includes(tag));
    if (missing.length) html = html.replace('</body>', missing.join('\n') + '\n</body>');
    fs.writeFileSync(htmlPath, html, 'utf8');
}

if (fs.existsSync(jsPath)) {
    let js = fs.readFileSync(jsPath, 'utf8');
    js = js.replace(/serverUrl:\s*["']http:\/\/localhost:3000["']/g, 'serverUrl: ""');
    fs.writeFileSync(jsPath, js, 'utf8');
}
