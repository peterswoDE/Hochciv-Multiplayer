[← Documentation](../README.md)

# How it works

The server takes the single-player browser game [Hochciv](https://github.com/timooom-hash/Hochciv), serves it with a multiplayer layer on top, and runs the game's own rule engine on the server so that every move is checked there.

```
             Browser                                       Server (Node.js)
 ┌───────────────────────────────┐            ┌──────────────────────────────────────┐
 │ HochCiv game (index.html, js/)│            │ server.js  Express + Socket.IO        │
 │   + mp.js        (multiplayer)│  REST API  │   routes/      accounts, lobbies, …   │
 │   + client/*.js  (chat, stats,│◀──────────▶│   sockets/     live games, Rundenspiele│
 │     profile, replay, mobile)  │  Socket.IO │   engine-adapter.js                   │
 │   + activity.js  (Discord)    │            │     └─ the same game files, one       │
 └───────────────────────────────┘            │        sandbox per game version        │
                                              │ PostgreSQL  accounts, matches, async  │
                                              └──────────────────────────────────────┘
```

## The game ships with this repository

Nothing is downloaded, neither when the image is built nor at container start:

* `HochCiv/` – the current game (based on timooom-hash/Hochciv, with the multiplayer changes). Served at `/`; its engine runs live games and new Rundenspiele.
* `HochCiv-v96/`, `HochCiv-v93/`, `HochCiv-v83/` – versions that were deployed before, unchanged. Rundenspiele started on one of them keep playing with its rules until they end: the server runs its engine for them, and `mp.js` opens them in that version at `/v96/`, `/v93/` or `/v83/`.

The game files are never edited in this repository by hand: a new version is built in the game repository and copied over – see [Updating the game](../development/updating-the-game.md).

## From game files to the multiplayer page

1. **Build** – `scripts/build-public.js` (run by the Dockerfile and again at container start) copies every version into `public/`, `public/v96/`, `public/v93/` and `public/v83/`, leaving out development files (tests, tools, notes).
2. **Inject** – it copies `mp.js` into each copy and runs `inject.js`, which adds script tags to its `index.html`: the Socket.IO client (served by this server, because the Discord Activity may not use CDNs), the multiplayer texts (`client/i18n.js`), the player profile, `mp.js`, the chat, the statistics, the replay viewer, matchmaking, the mobile layer and the Discord Activity bridge.
3. **Hook** – in the browser, `mp.js` replaces the game's action functions so that moves are sent to the server instead of being applied locally, and adds the lobby, login and account UI. The game's own screens show the state the server sends.
4. **Rules on the server** – `engine-adapter.js` loads the same game files (`data.js`, `civs.js`, `i18n.js`, `hex.js`, `tiles.js`, `engine.js`, `expansion.js`, `bots.js`, `ki.js`, `marathon.js`, `anim.js` – everything except the DOM code) into a sandbox, one per game version, and applies every move there. The server's state is the only true one; clients only display it.

## Game versions

Each Rundenspiel records the version it was started with (`engine`); games from before that have none and are v83. Live games last only hours, so they always use the current version. Finished matches store their version too, which is how replays open in the version they were played with.

Whether an old version has to be kept when a new one comes in is decided per update – see [Updating the game](../development/updating-the-game.md#keeping-or-dropping-an-old-version).

## Live games vs. Rundenspiele

| | Live games | Rundenspiele |
|---|---|---|
| Kept in | memory (`sessions.js`) | the database (`async_games`), saved after every action |
| Transport | Socket.IO room per lobby | REST for the list, Socket.IO for the open game |
| Join | code + password, public list, matchmaking, Discord Activity | invitation, join code, public list |
| Accounts | optional (guests) | required |
| Missing players | turn timer, KI takes over | reminder after 5 days, KI takes over after 7 |
| Cleanup | after 2 hours without action (lobbies: 10 minutes) | when finished or cancelled |

Details: [Socket.IO events](../reference/socket-events.md), [Rundenspiele](../reference/rundenspiele.md).
