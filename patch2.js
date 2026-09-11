const fs = require('fs');
let content = fs.readFileSync('/app/mp.js', 'utf8');

const newAuth = `        renderMainMenuAuth: async function () {
        await this.fetchUser();
        
        if (!this.user && !sessionStorage.getItem('hochciv_guest')) {
            window.location.href = '/';
            return;
        }

        const authContainer = $('mp-main-auth-container');
        if (!authContainer) return;

        if (this.user) {
            authContainer.innerHTML = \`
                <div style="background:rgba(128,128,128,0.15); padding:8px; border-radius:4px; margin-bottom:15px; text-align:center; font-size:14px;">
                    Eingeloggt als <b>\${this.user.username}</b> 
                    (<b>\${this.user.mmr} MMR</b>, \${this.user.gamesPlayed} Spiele) 
                    <span style="opacity:0.5; margin:0 6px;">|</span> 
                    <a href="/" style="text-decoration:underline; cursor:pointer;">Portal / Abmelden</a>
                </div>
            \`;
        } else {
            authContainer.innerHTML = \`
                <div style="background:rgba(128,128,128,0.15); padding:8px; border-radius:4px; margin-bottom:15px; text-align:center; font-size:14px;">
                    Gast <span style="opacity:0.7">(Ranked gesperrt)</span> 
                    <span style="opacity:0.5; margin:0 6px;">|</span> 
                    <a href="/" style="text-decoration:underline; cursor:pointer;">Portal / Anmelden</a>
                </div>
            \`;
        }

        if (this.renderLobby) this.renderLobby();
    },`;

content = content.replace(/renderMainMenuAuth:\s*async\s*function\s*\(\)\s*\{[\s\S]*?if\s*\(this\.renderLobby\)\s*this\.renderLobby\(\);\s*\},\s*/, newAuth + '\n\n');

fs.writeFileSync('/app/mp.js', content, 'utf8');
