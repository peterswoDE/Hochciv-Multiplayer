const fs = require('fs');
let code = fs.readFileSync('client/app.js', 'utf8');

const unregisterCode = `
// Unregister broken service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
            console.log('Unregistered SW');
        }
    });
}
`;

if (!code.includes('registration.unregister()')) {
    code = unregisterCode + '\n' + code;
    fs.writeFileSync('client/app.js', code, 'utf8');
    console.log("Injected SW unregistration code into client/app.js");
}
