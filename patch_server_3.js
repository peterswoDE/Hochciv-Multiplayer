const fs = require('fs');
let content = fs.readFileSync('/app/server.js', 'utf8');

if (!content.includes('routes/account')) {
    content = content.replace(
        "app.use('/api', apiRoutes);",
        "app.use('/api', apiRoutes);\nconst accountRoutes = require('./routes/account');\nconst adminRoutes = require('./routes/admin');\napp.use('/api/account', accountRoutes);\napp.use('/api/admin', adminRoutes);"
    );
}

if (!content.includes('app.locals.io = io')) {
    content = content.replace(
        'io.engine.use(sessionMiddleware);',
        'app.locals.io = io;\nio.engine.use(sessionMiddleware);'
    );
}

if (!content.includes("app.get('/account'")) {
    content = content.replace(
        "app.get('/game', (req, res) => {",
        "app.get('/account', (req, res) => {\n    res.sendFile(path.join(__dirname, 'client', 'account.html'));\n});\n\napp.get('/game', (req, res) => {"
    );
}

fs.writeFileSync('/app/server.js', content, 'utf8');
console.log('Patched server.js successfully');
