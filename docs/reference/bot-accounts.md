[← Documentation](../README.md)

# Bot accounts and player-bots

A **bot account** is an account for a program that plays like a player – for example the neural-network client in `Hochciv-KI`. It sits between a human and the built-in KI: it takes a human seat and plays it over the same API as the game page, but it is not a person. In a game, a seat played by a bot account is called a **player-bot**.

This page is about the rules. **To write a bot, start with [Writing your own bot](../bots/writing-a-bot.md).**

Code: `utils/bots.js` (rules), `routes/bots.js` (owner's management), `routes/auth.js` `POST /bot` (login), `sessions.js` `playerBotPolicy` (live lobbies), `async/logic.js` `playerBotRoom` (Rundenspiele), `sockets/match.js` `fitsBots` (matchmaking). Test: `tests/bots/bots.test.js`.

## Accounts and login

* `users.accountType` is `human` (default) or `bot`. A bot has no e-mail, no password and no second factor, and gets no account settings (`/api/account`, `/api/mfa` and OAuth linking answer 403).
* Bot names follow the same rules as user names (3–30 characters, letters, digits, `_`, `-`) and share their namespace.
* A bot logs in with its **token**: `POST /api/auth/bot` with `{ token }` or `Authorization: Bearer <token>` → a normal session cookie, so its REST calls and Socket.IO connection are logged in like a player's. The request has no `Origin` header (it doesn't come from a web page), so the [origin check](security.md#origin-check) lets it through.
* The token (`hcbot_…`, 32 random bytes) is shown **once**, when the bot is created or its token is renewed. Only its SHA-256 is stored (`users.botTokenHash`). Renewing ends the old token and every session it opened.
* Bot logins have their own rate limit (30 per minute per IP), separate from password logins.

## Owners and the role `botcreator`

* Every bot has exactly one **owner** (`users.ownerId`). Owners are accounts with the role `botcreator`, `admin` or `superadmin`. Admins and superadmins grant and take away `botcreator` in the *User* tab ([Administration](../operations/administration.md#roles)).
* A bot creator may own **4 bots** (`config.BOTS_PER_OWNER`). Admins raise or lower this per user in the *User* tab (`users.botLimit`, empty = the default). Admins themselves have no limit.
* The owner manages their bots on the account page, tab **Meine Bots**: create (the token is shown), renew the token, hand the bot over to another bot creator (who must have room under their limit), delete. Admins can show and manage every bot there.
* A bot works only while its owner may run bots, checked at the bot login and on every request (`deserializeUser` in `server.js`):

| Owner … | Bots |
|---|---|
| is banned | logged out, out of their games and connections, can't log in – back when the ban is lifted |
| loses the role | the same – back when the role is given back |
| is deleted | deleted too (`utils/deleteAccount.js`), like any deleted account |

A bot can also be banned or deleted on its own like any account. It never gets a role.

## Player-bots in games

Player-bots take **human seats**, first come, first served next to humans. They never take the KI seats (`kiCount`) and don't count against them.

### Live lobbies

* The host turns **Spieler-Bots erlauben** on (off by default, `gameConfig.playerBots`) and may set **Höchstens so viele Spieler-Bots** (`gameConfig.playerBotLimit`; *Unbegrenzt* = every free human seat).
* A lobby whose host is a bot always allows player-bots. The host bot may set a limit and doesn't count against it itself.
* `POST /api/sessions/join` from a logged-in bot is refused when bots aren't allowed or the limit is reached. The seat is bound to the bot (`playerBot`, `botUserId`): `session:connect` refuses a bot on a human seat and anybody else on a bot's seat.
* Turning bots off or lowering the limit doesn't kick anyone, but the game can't start until the host kicks the extra bots.
* The public lobby list shows `playerBots` and `playerBotsFree` (null = no limit), the player list shows the seat with `botAccount: true` and a 🤖 badge.

### Rundenspiele

The same two settings at creation (`config.playerBots`, `config.playerBotLimit`), the same rule for a bot as host. The seat records `botAccount`.

### Matchmaking

Players opt in with **Spieler-Bots als Mitspieler zulassen** in the multiplayer menu (`match:join { allowBots: true }`, remembered in the browser). A bot only lands in a group where every human opted in; games with only bots are possible. The match lobby then allows player-bots.

## MMR and leaderboards

Bots and humans share **one MMR**: a game with a bot changes everyone's MMR as usual, and bot-only games count too. The leaderboards are separate: `GET /api/leaderboard` lists humans, `GET /api/leaderboard?type=bot` lists bots. The bot's profile shows the 🤖 badge and its owner; finished matches mark its seat with `botAccount`.
