const fs = require('fs');
let content = fs.readFileSync('mp.js', 'utf8');

// Replace renderMainMenuAuth
const newAuth = `    renderMainMenuAuth: async function () {
        await this.fetchUser();
        if (!this.user) {
            window.location.href = '/';
            return;
        }
        const authContainer = $('mp-main-auth-container');
        if (!authContainer) return;
        authContainer.innerHTML = \`
            <div style="background:rgba(128,128,128,0.15); padding:8px; border-radius:4px; margin-bottom:15px; text-align:center; font-size:14px;">
                Eingeloggt als <b>\${this.user.username}</b> 
                (<b>\${this.user.mmr} MMR</b>, \${this.user.gamesPlayed} Spiele) 
                <span style="opacity:0.5; margin:0 6px;">|</span> 
                <a href="/" style="text-decoration:underline; cursor:pointer;">Portal / Abmelden</a>
            </div>
        \`;
        if (this.renderLobby) this.renderLobby();
    },`;

content = content.replace(/renderMainMenuAuth:\s*async\s*function\s*\(\)\s*\{[\s\S]*?if\s*\(this\.renderLobby\)\s*this\.renderLobby\(\);\s*\},\s*/, newAuth + '\n\n');

// Remove showAuthDialog, auth, logout
content = content.replace(/showAuthDialog:\s*function\s*\([\s\S]*?logout:\s*async\s*function\s*\(\)\s*\{[\s\S]*?\},\s*/, '');

fs.writeFileSync('mp.js', content, 'utf8');
