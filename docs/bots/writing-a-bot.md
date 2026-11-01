[← Documentation](../README.md)

# Writing your own bot

A **bot account** lets your own program play Hochciv online, against people and against other bots. Your bot logs in with a token and then uses the same API as the game page: it joins lobbies, Rundenspiele and matchmaking, gets the game state, and sends its moves. In a game, its seat is called a **player-bot** and shows a 🤖 badge.

This page takes you from nothing to a bot that plays. The rules behind bot accounts (owners, limits, bans, who may let bots in) are in [Bot accounts](../reference/bot-accounts.md); every endpoint and event is listed in the [REST API](../reference/rest-api.md) and the [Socket.IO events](../reference/socket-events.md).

**Contents:** [How it works](#how-it-works) · [1. Get a bot account](#1-get-a-bot-account) · [2. Log in](#2-log-in) · [3. Open the socket](#3-open-the-socket) · [4. Find a game](#4-find-a-game) · [5. Play a turn](#5-play-a-turn) · [6. Know the rules](#6-know-the-rules) · [A complete example](#a-complete-example) · [Keep it running](#keep-it-running) · [Errors](#errors) · [Fair play](#fair-play)

## How it works

```
your program                                   Hochciv server
────────────                                   ──────────────
POST /api/auth/bot  (Bearer hcbot_…)   ──────▶  checks the token
                                       ◀──────  session cookie
REST with the cookie: find and join a game
Socket.IO with the cookie:
  session:connect / async:open         ──────▶  binds you to your seat
                                       ◀──────  game:start / state:update / async:update  (the full state)
  action { type, params }              ──────▶  the game engine checks and applies the move
                                       ◀──────  { ok } or { error }, then the new state to everyone
  … until endTurn
```

The server is in charge: it runs the game engine and accepts only legal moves. Your bot never sends a new state. It sends a move such as `research` or `moveArmy`, and the server either applies it or says why not. So a bad move can't break a game; it is just refused.

There are three ways into a game, and a bot may use all of them at once:

| Way | What it is | Section |
|---|---|---|
| **Live lobby** | A real-time game in a lobby, usually with a turn timer. Your bot joins a public lobby or hosts its own. | [Live lobbies](#live-lobbies) |
| **Rundenspiel** | A game played turn by turn over days. Your bot checks every so often whether it is its turn. | [Rundenspiele](#rundenspiele) |
| **Matchmaking** | The ranked queue. Your bot is matched with players who allow bots. | [Matchmaking](#matchmaking) |

## 1. Get a bot account

1. **Get the role.** Only accounts with the role *Bot-Ersteller* (`botcreator`) can create bots. Ask an admin of the server for it; admins and superadmins can create bots anyway.
2. **Create the bot.** Log in on the website, open your account page and go to the tab **Meine Bots**. Enter a name and click **Bot erstellen**. Bot names follow the same rules as user names: 3–30 letters, digits, `_` or `-`, and not taken by anyone else.
3. **Save the token.** The page shows a token that starts with `hcbot_`. It is shown **only once**. Copy it into your bot's configuration file, not into your code, and keep it out of git: anyone with the token can play as your bot.

You may own **4 bots** unless an admin set a different limit for you. On the same tab you can later get a **new token** (the old one stops working at once, and so does every session it opened), **hand the bot over** to another bot creator, or **delete** it.

> **Test on staging first.** `https://staging.hochciv.de` is a test copy of the server with the newest features ([Staging](../operations/staging.md)). Accounts and bots there are separate from `https://hochciv.de`, so you need a bot account on each.

Your bot keeps working only while you may run bots. If your account is banned or loses the role, your bots are logged out and can't log in again until that is undone. If your account is deleted, your bots are deleted with it.

## 2. Log in

Send the token to `POST /api/auth/bot`, either as a header or in the body:

```
POST /api/auth/bot
Authorization: Bearer hcbot_…
```

or `{ "token": "hcbot_…" }` as JSON. The answer is the account, and it sets the session cookie (`connect.sid`):

```json
{ "id": "…", "username": "MyBot", "mmr": 1000, "gamesPlayed": 0, "role": "user",
  "accountType": "bot", "canCreateBots": false, "googleLinked": false, "discordLinked": false }
```

Send that cookie with every later request and with the socket connection. Then the server treats your bot like a logged-in player.

* A wrong or replaced token gets `401 { "error": "Ungültiges Bot-Token." }`. A banned bot or owner gets `403` with the reason.
* Bot logins are limited to 30 per minute per IP address. Log in once and reuse the session; don't log in before every request.
* Don't send an `Origin` header. Requests without one pass the server's [origin check](../reference/security.md#origin-check), which only exists to stop other websites.
* A session lasts up to 30 days. When a request comes back with `401`, log in again.

```bash
curl -i -X POST https://staging.hochciv.de/api/auth/bot -H "Authorization: Bearer $HOCHCIV_TOKEN"
```

Bots can't use the account settings: `/api/account`, `/api/mfa` and linking Google or Discord answer `403`.

## 3. Open the socket

Everything during a game goes over [Socket.IO](https://socket.io/) (protocol version 4), at the server's root URL. Pass the session cookie as a header when you connect:

```python
# Python: pip install requests "python-socketio[client]"
cookie = "; ".join(f"{c.name}={c.value}" for c in http.cookies)   # http = the requests.Session of the login
sio = socketio.Client()
sio.connect(URL, headers={"Cookie": cookie})
```

```js
// Node.js 20+: npm install socket.io-client
const { io } = require('socket.io-client');
const res = await fetch(URL + '/api/auth/bot', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } });
const cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const socket = io(URL, { extraHeaders: { Cookie: cookie } });
```

Keep the default transports (HTTP long-polling first, then the upgrade to WebSocket). Don't force `websocket` only: behind some proxies the upgrade isn't passed through, and the connection then fails instead of staying on polling.

Every event you send gets an answer through the acknowledgement callback (`sio.call(...)` in Python, `socket.emitWithAck(...)` in Node): `{ "ok": true, … }` or `{ "error": "<German message>" }`. **Always check for `error`.**

**One socket per live game.** The server binds a socket to one live game with `session:connect`. If your bot plays several live games at once, open a socket for each. Rundenspiele can all share one socket, and matchmaking can use one more.

## 4. Find a game

### Live lobbies

**Joining a public lobby**

1. `GET /api/public-sessions` lists the public lobbies and running public games:

   ```json
   [{ "id": "…", "joinCode": "K7Q2", "password": "…", "status": "lobby", "hostName": "Anna",
      "playersCount": 1, "maxPlayers": 3, "mapKey": "random", "round": null, "spectators": 0,
      "playerBots": true, "playerBotsFree": null }]
   ```

   Your bot may join when `status` is `"lobby"`, `playerBots` is `true`, `playerBotsFree` isn't `0` (`null` means no limit), and `playersCount < maxPlayers`.

2. Make up a `clientId`, a random secret (for example 32 hex characters), and keep it. It is the key to your seat for the rest of the game.

3. `POST /api/sessions/join`:

   ```json
   { "joinCode": "K7Q2", "password": "…",
     "player": { "name": "MyBot", "clientId": "<your secret>", "civ": "random", "ability": "random" } }
   ```

   The answer is `{ "sessionId", "playerIndex" }`. Your bot plays under its account name.

4. On the socket: `session:connect { sessionId, password, clientId }`. The answer holds `playerIndex`, `status`, `players`, `gameConfig` and `hostIndex`.

The public list doesn't show every setting. Look at `gameConfig` in the answer to `session:connect`, and leave if the game is one your bot can't play (events, wonders, marathon, a map type it doesn't know). To leave a lobby, just disconnect: the server removes a lobby player whose socket is gone.

While you wait, listen for `lobby:config:update` (the host changed the settings), `lobby:player:updated`, `player:joined`, `player:left` and `session:kicked`. The game begins with `game:start`, or with `placement:start` / `draft:update` first (see [Before the first turn](#before-the-first-turn)).

**Hosting a lobby**

`POST /api/sessions` with `{ config, host: { name, clientId, civ, ability } }` creates a lobby and answers `{ sessionId, joinCode, password }`. Then `session:connect` as above. A lobby your bot hosts always lets player-bots in; set `playerBotLimit` to cap them (your own seat doesn't count). The settings the Hochciv-KI bot uses:

```json
{ "mapKey": "random", "playerCount": 3, "kiCount": 1, "difficulty": "schwer", "turnTime": 180,
  "isPublic": true, "ranked": false, "events": false, "eventMode": "hard", "wonders": false,
  "playerBots": true, "playerBotLimit": null }
```

`mapKey`: `"0"`/`"1"` (the original map), `"gross"` (the large map) or `"random"` (tile map). `turnTime` in seconds: `0` (none), `60`, `120`, `180`, `300` or `600`. `kiCount` seats are played by the built-in KI at `difficulty` `leicht`, `mittel` or `schwer`.

As host, your bot starts the game with `game:start` (free seats are filled with KI, so one player is enough) and may remove players with `session:kick { playerIndex }`. A lobby with no activity for **10 minutes** is closed; the Hochciv-KI bot sends `lobby:player:update {}` every few minutes while it waits.

### Rundenspiele

Rundenspiele need no socket while you wait, only REST:

* `GET /api/async` → `{ mine, open, invites }`. `mine` are your games; each has `yourTurn`, `status`, `round` and `config`. `open` are public games with free seats (`freeSeats`) whose host allows player-bots when `config.playerBots` is `true`. Games started on an older version of the rules carry it in `engine` (for example `"v96"`, see [Know the rules](#6-know-the-rules)).
* `POST /api/async/:id/join { civ, ability }` takes a seat.
* `POST /api/async { config, civ, ability }` creates a Rundenspiel. A Rundenspiel your bot hosts always lets player-bots in. Example `config`: `{ "mapKey": "plaettchen", "playerCount": 3, "kiCount": 0, "difficulty": "schwer", "civMode": "random", "isPublic": true, "ranked": false, "events": false, "eventMode": "hard", "wonders": false, "playerBots": true }`.

Then check `GET /api/async` about once a minute. For every game with `yourTurn: true`:

1. `async:open { id }` on the socket → `{ ok, view }`. One Rundenspiel is open at a time; opening another closes the previous one.
2. When `view.status` is `"playing"`, `view.hold` is false and `view.state.cur == view.myIndex`, it is your turn. Send moves as `async:action { id, type, params }`.
3. After every move the server sends `async:update` with the new view.

A Rundenspiel waits up to 7 days for a move ([Rundenspiele](../reference/rundenspiele.md#waiting-reminders-and-the-ki-takeover)), so checking once a minute is plenty.

### Matchmaking

On a socket: `match:join {}`. Your bot is only matched with players who ticked *Spieler-Bots als Mitspieler zulassen* (or with other bots), and every match is ranked.

| You get | You do |
|---|---|
| `match:found { matchId, players, confirmMs }` | `match:accept { matchId }` within `confirmMs` |
| `match:ready { sessionId, joinCode, password, clientId }` | `session:connect` with exactly these values, on a socket of its own. The game starts when everyone is there. |
| `match:cancelled { reason, requeued }` | If `requeued` is false, `match:join` again |

`match:leave` leaves the queue. A queue entry belongs to its socket, so after a reconnect you have to join again.

## 5. Play a turn

### The state

`game:start { state, yourIndex, turn }` gives you the whole game, and `state:update { state, … }` gives the new one after every move by anyone, including the KI's turns. Each one is the **complete state**, not a change, so you can always just keep the newest one. The parts a bot needs most:

| Field | What it is |
|---|---|
| `cur` | The index of the empire whose turn it is |
| `round` | The round, starting at 1 |
| `over` | `null` while the game runs, then the result |
| `players[i]` | Each empire: `civ`, `kind` (`human`, `ki`, …), `name`, `power`, `res { sci, food, coins }`, `techs`, `avail`, `ability`, `dead` |
| `cities[]` | `{ id, owner, r, c, pop, cap, … }` – `owner` is an index into `players` |
| `armies[]` | `{ id, owner, r, c, mp, born }` |
| `map` | The board `{ name, rows }`: one string per row `r`, one letter per column `c`. The letters are the keys of `TERRAIN` in `js/data.js` (`G` Grasland, `W` Wald, `B` Gebirge, `F` Fluss, …). |
| `roads`, `sieges`, `bought` | Roads, sieges and bought tiles |
| `logSeq` | Grows with every logged event. A state with a lower `logSeq` is older than the one you have. |

Your empire is `state.players[yourIndex]`. It is your turn when `state.cur == yourIndex` and `state.over` is null. In a Rundenspiel the same state is `view.state` and your index is `view.myIndex`.

Note that `yourIndex` is not the lobby seat (`playerIndex`): the game sorts the empires into its own turn order. Use `yourIndex` for everything inside the state.

### Moves

On your turn, send `action { type, params }` (in a Rundenspiel: `async:action { id, type, params }`). The server applies it, answers `{ ok: true }`, and sends the new state to everyone. If the move isn't allowed it answers `{ error }` and nothing changes.

| `type` | `params` | Move |
|---|---|---|
| `research` | `{ tech }` | Research a technology (its key, e.g. `"rad"`) |
| `freeTech` | `{ tech }` | Take a free technology |
| `freePick` | `{ tech }` | Use a free pick (from an ability or a wonder) |
| `backPick` | `{ tech }` | Use a look-back pick |
| `copyTech` | `{ tech, mode }` | Copy a neighbour's technology; `mode` `"paid"` or `"free"` |
| `foundCity` | `{ r, c }` | Found a city |
| `growCity` | `{ cityId, mode }` | Grow a city; `mode` `"paid"` or `"free"` |
| `sacrifice` | `{ cityId }` | Sacrifice population (Sklaverei) |
| `buildArmy` | `{ cityId }` | Build an army in a city |
| `moveArmy` | `{ armyId, r, c }` | Move an army |
| `buyPower` | `{ n }` | Buy `n` power with coins |
| `buildRoad` | `{ r, c, target }` | Build a road; `target` `1` needs Rad, `2` (railway) needs Eisenbahn |
| `buyTile` | `{ r, c }` | Buy a tile (Kolonialismus) |
| `coverPop` / `uncoverPop` | `{ kind, amount }` | Feed population from another source, or stop; `kind` `"coins"` or `"sci"` |
| `buildWonder` | `{ cityId, wonder }` | Build a wonder (only with wonders on) |
| `nuke` | `{ r, c }` | Atomic strike |
| `endTurn` | `{}` | End the turn |

The exact rules of each move are in the engine function of the same idea (`doResearch`, `foundCity`, `moveArmy`, … in `js/engine.js` and `js/expansion.js`). Parameters must be plain values: keys like `tech` are short identifiers, counts like `n` and `amount` are whole numbers from 1 up.

**A turn is several moves followed by `endTurn`.** Wait for the `state:update` after each move before you decide the next one, so you always decide on the newest state. `endTurn` is refused while one of your armies still stands in a city and could leave it (`Eine Armee steht noch in einer Stadt – sie muss erst herausziehen.`): move it out first. That happens on the very first turn for empires that start with an army in their capital.

### Before the first turn

Some game types need a step before the first turn:

* **Tile maps** (`mapKey` `"random"` live, `"plaettchen"` in Rundenspiele): `placement:start { plan, queue, seed, cfg }` arrives. Every player places their start tile at the same time with `placement:action { o, cell }`. `o` is the orientation (0–2) and `cell` the field of the tile for the capital. In a Rundenspiel: `view.status == "placement"` and `async:place { id, o, cell }`. The engine's `placeOptions(plan, seat, o)` in `js/tiles.js` tells you which cells are allowed, and the KI's `kiPlaceSeat` in `js/ki.js` shows how to pick a good one. If you don't want to deal with this, play only the fixed maps `"0"`, `"1"` and `"gross"`.
* **Marathon:** every player drafts abilities: `draft:update` shows the choice, `draft:pick { id }` picks (in a Rundenspiel `async:draft { id, abilityId }`). Simplest: leave marathon games.

### The turn timer

In a live game with a turn timer, the KI finishes your turn when the time is up (`turn:timeout`). After three missed turns in a row the KI keeps your seat until you send `turn:reclaim`. In a Rundenspiel nothing hurries you except the [7-day timeout](../reference/rundenspiele.md#waiting-reminders-and-the-ki-takeover).

## 6. Know the rules

To choose good moves, your bot has to know what is legal and what a move will do. The best source is the rules engine itself: the server serves the exact version it plays at

```
https://hochciv.de/js/data.js, civs.js, i18n.js, hex.js, tiles.js, engine.js, expansion.js, bots.js, ki.js, marathon.js
```

(on staging: `https://staging.hochciv.de/js/…`). Rundenspiele started on an older version keep its rules; their `engine` field tells you which, and that version is at `/<engine>/js/…`, for example `/v96/js/engine.js`. The version is in `APP_VERSION` at the top of `data.js`.

These are plain browser scripts that share global variables. Loaded in this order into one shared scope (in Node.js: one `vm` context, the way the server's own `engine-adapter.js` does it), they give you the full game: load the server's state, try a move on a copy, and see what happens. For example:

* `doResearch(S, pi, tech)`, `foundCity(S, pi, r, c)`, `moveArmy(S, army, r, c)`, … – the moves; each returns `null` on success or the reason it is not allowed.
* `blockingIssues(S, pi)` – what still stops `endTurn`.
* `kiCandidates(S, pi, …)` and `kiTurn(S, pi)` in `ki.js` – how the built-in KI chooses its moves. A good starting point to read, or to beat.

The rules for people, in German and English, are on the game page under *Regeln & Technologien* in the main menu.

## A complete example

This bot in Python joins one public lobby that takes player-bots, waits for the host to start, and ends every turn. Replace `decide()` with your own logic. It plays only the fixed maps, so it doesn't need to place a start tile.

```python
"""A minimal HochCiv bot: joins a public lobby that takes player-bots and ends every turn.

    pip install requests "python-socketio[client]"
    HOCHCIV_TOKEN=hcbot_... python minimal_bot.py      (Windows: set HOCHCIV_TOKEN=hcbot_... first)
"""
import os
import queue
import secrets
import sys

import requests
import socketio

URL = os.environ.get("HOCHCIV_URL", "https://staging.hochciv.de")
TOKEN = os.environ["HOCHCIV_TOKEN"]
FIXED_MAPS = ("0", "1", "gross")        # no start tile to place


def decide(state, me):
    """Your logic: the moves of one turn, ending with endTurn."""
    return [("endTurn", {})]


# 1. log in with the token; the answer sets the session cookie
http = requests.Session()
r = http.post(URL + "/api/auth/bot", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=20)
if not r.ok:
    sys.exit(f"login refused: {r.json().get('error')}")
name = r.json()["username"]

# 2. a public lobby that takes player-bots and has room for one
lobbies = http.get(URL + "/api/public-sessions", timeout=20).json()
lobby = next((s for s in lobbies if s["status"] == "lobby" and s["playerBots"]
              and s["playerBotsFree"] != 0 and s["playersCount"] < s["maxPlayers"]
              and str(s["mapKey"]) in FIXED_MAPS), None)
if not lobby:
    sys.exit("no lobby takes player-bots right now")

# 3. take a seat; the clientId is the secret key to it
client_id = secrets.token_hex(16)
r = http.post(URL + "/api/sessions/join", timeout=20, json={
    "joinCode": lobby["joinCode"], "password": lobby["password"],
    "player": {"name": name, "clientId": client_id, "civ": "random", "ability": "random"}})
if not r.ok:
    sys.exit(f"join refused: {r.json().get('error')}")
session_id = r.json()["sessionId"]

# 4. the socket, with the same cookie; events go into a queue for the main loop
events = queue.Queue()
sio = socketio.Client()
for ev in ("game:start", "state:update", "game:over", "session:kicked"):
    sio.on(ev, lambda data=None, ev=ev: events.put((ev, data)))
cookie = "; ".join(f"{c.name}={c.value}" for c in http.cookies)
sio.connect(URL, headers={"Cookie": cookie})
ack = sio.call("session:connect", {"sessionId": session_id, "password": lobby["password"], "clientId": client_id})
if ack.get("error"):
    sys.exit(f"session:connect refused: {ack['error']}")
print(f"{name} is in lobby {lobby['joinCode']}, waiting for the host to start")

# 5. play: act whenever the newest state says it is our turn
me = None
while True:
    ev, data = events.get()
    if ev in ("game:over", "session:kicked"):
        print(ev, data)
        break
    if ev == "game:start":
        me = data["yourIndex"]
    state = data["state"]
    if me is None or state.get("over") or state["cur"] != me:
        continue
    for typ, params in decide(state, me):
        res = sio.call("action", {"type": typ, "params": params})
        if res.get("error"):
            print(f"{typ} refused: {res['error']}")
            break
sio.disconnect()
```

To try it, host a lobby on staging with your normal account, turn on **Spieler-Bots erlauben**, start the bot, and start the game once it has joined.

Two things this example leaves out on purpose. It ends the turn without moving, so a refused `endTurn` (an army in a city) simply lets the turn timer run out. And it decides on every update separately, while a real bot should wait for the update after each move (see [Moves](#moves)).

**A full bot to learn from:** [Hochciv-KI](https://github.com/peterswoDE/Hochciv-KI) is a neural-network bot that plays on hochciv.de. Its online client (`hochciv_ki/online/client.py`) does everything on this page: live lobbies (joining and hosting), Rundenspiele, matchmaking, start tiles, reconnects and logging in again. Its `bridge/worker.js` loads the rules engine in Node.js.

## Keep it running

| What happens | What to do |
|---|---|
| The socket drops in a running game | Socket.IO reconnects on its own. After the reconnect, send `session:connect` again with the same `sessionId`, `password` and `clientId`; your seat is still yours. In a Rundenspiel, `async:open` again. |
| The socket drops in a lobby | The server removes a lobby player whose socket is gone, and closes the lobby if that was the host. Join or host again. |
| A request gets `401` | The session ended (expired, new token, owner banned). Log in again; if the login fails too, stop and tell the owner. |
| `session:kicked` | The host or an admin removed your bot, or it was banned. Don't rejoin that lobby. |
| No action for a long time | Lobbies close after 10 minutes without activity, running live games after 2 hours. |
| You get a new token | Every session of the old token ends at once. Restart the bot with the new token. |

## Errors

The server answers in German; the game page translates the same texts. The ones a bot meets most:

| Message | Meaning |
|---|---|
| `Ungültiges Bot-Token.` | Wrong token, or it was replaced by a new one |
| `Dieser Bot ist gesperrt.` / `Der Besitzer dieses Bots ist gesperrt.` | The bot or its owner is banned |
| `Der Besitzer dieses Bots darf keine Bots mehr betreiben.` | The owner lost the role *Bot-Ersteller* |
| `In dieser Lobby sind keine Spieler-Bots erlaubt.` | The host didn't allow player-bots |
| `In dieser Lobby ist kein Platz mehr für Spieler-Bots.` | The host's bot limit is reached |
| `In diesem Rundenspiel sind keine Spieler-Bots erlaubt.` / `… kein Platz mehr für Spieler-Bots.` | The same for a Rundenspiel |
| `Bot-Konten treten nur als Spieler-Bot bei.` | The `clientId` belongs to a human seat |
| `Du bist nicht am Zug.` | Not your turn (often: you acted on an old state) |
| `Spiel läuft nicht.` | The game hasn't started yet or is over |
| `Unbekannte Aktion: …` / `Ungültiger Parameter: …` | Wrong `type`, or a parameter that isn't a plain value |
| `Zu viele Anfragen …` (HTTP 429) | Rate limit: slow down |

Any other refusal of a move comes from the engine and says what is missing, for example `Zu wenig Münzen.`

## Fair play

* **Say you are a bot.** The 🤖 badge does that already; a short greeting in the chat (`chat:send { kind: "text", text }`) is friendly.
* **Only where you are welcome.** Join only games whose host allows player-bots (the server makes sure of that), and leave if the game is one your bot can't play properly, before it starts.
* **Play your games to the end.** A bot that leaves running games spoils them for everyone. If your bot has to stop, finish or leave its games first; in a running game the KI takes over the seat.
* **Be gentle with the server.** Check the lobby list every 15 seconds or so and Rundenspiele about once a minute, not in a tight loop. Reuse one login.
* **Bots share the MMR with humans.** Games against your bot change people's ranking, so a bot that is broken or plays randomly should not play ranked games. Bots have their own leaderboard: `GET /api/leaderboard?type=bot`.
* **You are responsible for your bots.** What they write in the chat falls under the same rules ([chat moderation](../overview/features.md#during-and-after-a-game)) as anything you write, and a ban of your bot or of you stops them all.
