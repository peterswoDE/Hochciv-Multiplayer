// Bundles activity/bridge.js with Discord's Embedded App SDK into one classic script.
// The output lives in node_modules/.cache (ignored by Git and Docker); server.js serves it as
// /js/activity.js. Run with "npm run build:activity" – the Dockerfile does it in a build stage.
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'node_modules', '.cache', 'hochciv-activity', 'activity.js');

if (require.main === module) {
    require('esbuild').build({
        entryPoints: [path.join(__dirname, 'bridge.js')],
        outfile: OUT_FILE,
        bundle: true,
        format: 'iife',
        target: ['es2020'],
        minify: true,
        legalComments: 'none',
        logLevel: 'info',
    }).catch(() => process.exit(1));
}

module.exports = { OUT_FILE };
