const fs = require('fs');
let content = fs.readFileSync('/app/server.js', 'utf8');

if (!content.includes('app.locals.io = io')) {
    content = content.replace(
        'io.engine.use(sessionMiddleware);',
        'app.locals.io = io;\nio.engine.use(sessionMiddleware);'
    );
}

if (!content.includes('app.get(\'/account\'')) {
    content = content.replace(
        'app.get(\'/game\', (req, res) => {',
        'app.get(\'/account\', (req, res) => {\n    res.sendFile(path.join(__dirname, \'client\', \'account.html\'));\n});\n\napp.get(\'/game\', (req, res) => {'
    );
}

fs.writeFileSync('/app/server.js', content, 'utf8');
console.log('Done');
