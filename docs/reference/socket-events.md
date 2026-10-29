[← Documentation](../README.md)

# Socket.IO events

One Socket.IO connection per browser tab carries live games, the open Rundenspiel and matchmaking. Connections must pass the [origin check](security.md#origin-check). Every handler takes an object payload and answers through the acknowledgement callback with `{ ok: true, … }` or `{ error: "<German message>" }`; a handler error never takes the server down.

The server is authoritative: the client sends intentions (`action`), the server applies them with the game engine and sends the new state to everyone. Each player gets their own view of the state (`engine.stateForPlayer`).

## Live games

Handled by `sockets/game.js`. A live game is a Socket.IO room named after its `sessionId`. The lobby is created and joined over REST first ([REST API](rest-api.md#live-lobbies--api)).

### Client → server

| Event | Payload | Who | Purpose |
|---|---|---|---|
| `session:connect` | `{ sessionId, password, clientId }` | player or spectator | Bind the socket to the seat whose `clientId` matches (or the spectator). Also used for reconnects. Ack: `playerIndex`, `status`, `players`, `gameConfig`, `hostIndex`, `spectators`. |
| `session:kick` | `{ playerIndex }` | host | Remove a player from the lobby |
| `lobby:config` | game settings | host | Change the lobby settings (map, empires, KI, events, timer, ranked, …); a custom map is checked with `checkCustomMap` |
| `lobby:player:update` | `{ civ, ability }` | player | Own nation and ability in the lobby |
| `game:start` | – | host | Start the game |
| `draft:pick` | `{ id }` | player | Marathon draft: pick an ability |
| `placement:action` | placement action | player | Tile map: place the start tile (all players at once) |
| `action` | `{ type, params }` | player on turn | A game action, applied by the engine (`engine.applyAction`) |
| `chat:send` | `{ kind: 'text' \| 'emote' \| 'ping', … }` | player | Chat message, emote or map ping (texts need an account) |
| `chat:report` | `{ id, reason }` (message id) | player or spectator | Report a message ([chat moderation](../overview/features.md#during-and-after-a-game)) |
| `session:rematch` | – | host | Back to the lobby after the game |
| `turn:reclaim` | – | player | *Ich bin zurück*: take the seat back from the KI after missed turns |

### Server → client

| Event | Purpose |
|---|---|
| `player:joined`, `player:left` | Someone joined or left the lobby |
| `lobby:player:updated` | The lobby's player list changed |
| `lobby:config:update` | The lobby settings changed |
| `session:index` | Your seat number / the host changed |
| `session:kicked` | You were removed (by the host, an admin, a ban) |
| `spectators:update` | `{ count }` of spectators |
| `placement:start` | Start-tile placement begins (tile map) |
| `draft:update` | Marathon draft state |
| `game:start` | `{ state, yourIndex, turn }` – the game begins (or the state after a reconnect) |
| `state:update` | New state after every action or KI turn, with turn/timer info |
| `turn:timeout` | Your turn ran out; `{ afk }` when the KI keeps the seat |
| `chat:history` | `{ list, guest, mute }` – the chat so far, on connect |
| `chat:msg` | A new chat message or ping |
| `game:over` | The result |
| `game:record` | The stored match (id for statistics, replay, profile links) |
| `game:stats` | Statistics over the rounds |
| `session:rematch` | The host started a rematch: back to the lobby |
| `sys:message` | Admin broadcast |

## Rundenspiele

Handled by `sockets/async.js`; login required. A client has one Rundenspiel open at a time. The list, creating and joining go over REST ([REST API](rest-api.md#rundenspiele--apiasync-login)).

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `async:open` | → server | `{ id }` | Open a game; ack `{ ok, view }`; followed by `chat:history` |
| `async:close` | → server | – | Close it (no more updates) |
| `async:action` | → server | `{ id, type, params }` | A game action |
| `async:place` | → server | `{ id, o, cell }` | Place the start tile |
| `async:draft` | → server | `{ id, abilityId }` | Marathon draft pick |
| `async:chat` | → server | `{ id, kind, … }` | Chat message, emote or ping |
| `async:report` | → server | `{ id, msgId, reason }` | Report a message |
| `async:update` | → client | view | The player's new view after every change (also KI turns) |
| `async:chat` | → client | `{ id, msg }` | A new chat message |
| `chat:history` | → client | `{ id, list, guest, mute }` | The chat so far |

## Matchmaking

Handled by `sockets/match.js`; login required. Queue and pending matches live in memory.

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `match:join` | → server | – | Enter the queue (refused in maintenance mode) |
| `match:leave` | → server | – | Leave the queue |
| `match:accept` / `match:decline` | → server | `{ matchId }` | Answer a found match |
| `match:status` | → client | `{ waiting, window, queued }` | While in the queue |
| `match:found` | → client | `{ matchId, players, confirmMs }` | Confirm now |
| `match:progress` | → client | `{ accepted, total }` | How many have accepted |
| `match:cancelled` | → client | `{ reason, requeued }` | Someone didn't confirm |
| `match:ready` | → client | `{ sessionId, joinCode, password, clientId }` | Join the created lobby; the game starts when everyone is there |

Rules (MMR window, group sizes, waits): [Features → Ranking](../overview/features.md#ranking).
