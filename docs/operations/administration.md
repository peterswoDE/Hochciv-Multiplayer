[← Documentation](../README.md)

# Administration

## Roles

| Role | Can |
|---|---|
| `user` | play, manage their own account |
| `botcreator` | like `user`, plus own up to 4 [bot accounts](../reference/bot-accounts.md) (tab *Meine Bots*); granted by admins |
| `admin` | everything in the admin tabs below except *OAuth*; manages users with the role `user` or `botcreator` only; owns bots without a limit |
| `superadmin` | everything, including granting `admin`/`superadmin`, managing other admins and the *OAuth* tab |

The first superadmin is set on the command line, after registering the account in the game:

```bash
docker exec hochciv-multiplayer node elevate.js <username> [admin|superadmin]   # default: admin
```

(Staging: `hochciv-multiplayer-staging`, local: `hochciv-multiplayer-local`.)

## Admin panel

The admin tabs appear on the account page (*Account & Admin* in the game menu) for admins. All of them use `/api/admin/*` ([REST API](../reference/rest-api.md#admin--apiadmin)).

| Tab | What it does |
|---|---|
| **Server-Status** | Uptime, memory, CPU load, active lobbies and players online. Switches for **maintenance mode** and **registration**. |
| **Lobbys** | Live lobbies and games in memory. *Close* ends a lobby and disconnects everyone in it; *broadcast* sends a system message to everyone in it. |
| **Laufende Spiele** | Running live games and Rundenspiele with the game version each one runs on – check this before dropping an old game version ([Updating the game](../development/updating-the-game.md)). |
| **Spiele** | Finished matches, newest first, with a player search. |
| **User** | All accounts, newest first. Per user: ban / unban, set MMR, set a new password, change the role, show and remove second factors (authenticator apps, passkeys, e-mail code), delete the account. Bot accounts show a *Bot* badge and their owner (only ban, MMR and delete apply); bot creators show their bots and *Bot-Limit* to change how many they may own. |
| **Meldungen** | Chat reports from players and from the word filter, with the message and the game's chat history; mark them handled with a note. Also the admins' own entries for the **word filter** ('ban' words – whole word or part of a word – and 'allow' words) and a field to try a text against the filter. |
| **OAuth** (superadmin) | Client ID, secret and *Aktiviert* for Google and Discord, the Discord bot token for the Activity, and the callback URLs the server uses. See [Google and Discord login](login-providers.md). |

### Maintenance mode and registration

* **Maintenance mode** stops new live lobbies, new Rundenspiele, new Discord Activity lobbies and matchmaking. Running games continue. Use it before a server update so no new games start.
* **Registration** off refuses new accounts (`POST /api/auth/register`); Google/Discord logins of existing accounts still work.
* Both switches live in memory: a restart turns maintenance mode off and registration on again.

### Bans and deleted accounts

* A ban logs the account out everywhere, closes its open game connections and takes it off its live seats (the seat plays on as a guest's) – `utils/detachUser.js`. The bots of a banned owner stop the same way until the ban is lifted; so do they when the owner loses the role `botcreator`.
* Deleting a bot owner deletes their bots as well.
* Deleting an account (by the user or an admin, `utils/deleteAccount.js`) keeps the game history for the other players, but anonymizes its seats; running Rundenspiele go on without it, and its name is removed from their game states and replay frames. Its custom maps and push devices are deleted.

## Command-line tools

| Command | Purpose |
|---|---|
| `node elevate.js <username> [admin\|superadmin]` | give a user admin rights |
| `node scripts/dedupe-constraints.js [--fix]` | find (and with `--fix` drop) duplicate UNIQUE constraints that older `sequelize.sync({ alter: true })` runs piled up (`users_email_key1`, …) |
| `node scripts/build-public.js` | rebuild `public/` from the game folders (done automatically at start) |

Run them inside the container with `docker exec <container> node …`.

## Logs

`docker logs hochciv-multiplayer` (production). Useful prefixes: `[Async]` (Rundenspiele, timeouts), `[Push]`, `[Engine Adapter]` (loaded game versions), `[Activity client …]` (Discord Activity), `[build-public]` (startup build).
