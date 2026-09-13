const fs = require('fs');
let serverJs = fs.readFileSync('server.js', 'utf8');

const killerSwCode = `
app.get('/sw.js', (req, res) => {
    res.type('application/javascript');
    res.send(\`
        self.addEventListener('install', e => { self.skipWaiting(); });
        self.addEventListener('activate', e => {
            e.waitUntil(self.registration.unregister().then(() => self.clients.claim()));
        });
        self.addEventListener('fetch', e => {
            e.respondWith(fetch(e.request));
        });
    \`);
});

app.use(express.static(path.join(__dirname, 'client')));
`;

serverJs = serverJs.replace(
    "app.use(express.static(path.join(__dirname, 'client')));",
    killerSwCode
);

fs.writeFileSync('server.js', serverJs, 'utf8');
console.log("Patched server.js to serve a killer sw.js!");
