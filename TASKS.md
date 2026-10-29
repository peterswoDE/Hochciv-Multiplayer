# Tasks: multiplayer experience

The features that were approved to improve the multiplayer experience, and how far each one is. **This file reflects the `development` branch.** Every feature PR updates its section here (status, what was built, tests), next to the feature list in [docs/overview/features.md](docs/overview/features.md).

Process (see Base-assumtions.md): one branch per feature from `origin/development`, PR into `development` (staging), tested locally with `docker-compose.local.yml` first. The game in `HochCiv/` is never changed. Everything goes through `mp.js` and the server.

Status: ⬜ planned · 🔨 in progress · ✅ on `development` (staging) · 🚀 in production (`main`)

| Order | # | Feature | Live games | Rundenspiele | Status |
|---|---|---|---|---|---|
| 1 | F2 | [Turn timer](#f2-turn-timer) | ✔ | – (7-day rule stays) | ✅ |
| 2 | F3 | [Rematch](#f3-rematch) | ✔ | – | ✅ |
| 3 | F1 | [Chat, emotes, map pings](#f1-chat-emotes-and-map-pings) | ✔ | ✔ | ✅ |
| 4 | F4 | [Spectator mode](#f4-spectator-mode) | ✔ | ✔ (public games) | ✅ |
| 5 | F6 | [Post-game statistics](#f6-post-game-statistics) | ✔ | ✔ | ✅ |
| 6 | F7 | [Replays](#f7-replays) | ✔ | ✔ | ✅ |
| 7 | F5 | ["Since your last turn" summary](#f5-since-your-last-turn-summary) | ✔ | ✔ (+ e-mail / push) | ✅ |
| 8 | F9 | [Ranked matchmaking](#f9-ranked-matchmaking) | ✔ | – | ✅ |
| 9 | F11 | [Chat: report and block](#f11-chat-report-and-block) | ✔ | ✔ | ✅ |
| 10 | F12 | [Chat: word filter, guests emote-only](#f12-chat-word-filter-and-guests-emote-only) | ✔ | ✔ | ✅ |
| later | F8 | [Friends list](#f8-friends-list) | | | later |
| later | F10 | [Seasons, leaderboard, badges](#f10-seasons-leaderboard-and-badges) | | | later |

The numbers are those of the original proposal; F11 and F12 were requested after the staging tests of F1. The order puts the small fixes for live games first. F6 and F7 come before F5 because they record per-turn data that F5 can reuse.

All planned features are on `development` (staging). Production (`main`) gets them through a PR from `development` once they have been tested on staging. Each feature has its own test in `tests/`; together they run against the local docker setup (see each file's header).

---

## F2 Turn timer

**Goal:** One slow or absent player no longer stalls a live game.

**Decisions**
- The host sets the time per turn in the lobby: *no limit* (default, the game waits forever), 1, 2, 3, 5 or 10 minutes.
- When the time is up, the server finishes the turn: the KI plays the rest of it, then the turn ends.
- After 3 timed-out turns in a row, the KI keeps playing the seat until the player acts again. A player who comes back (reconnects and plays) gets the seat back.
- Everyone sees a countdown in the HUD; the player on turn gets a warning 30 seconds before the end.
- Live games only. Rundenspiele keep their 7-day rule.

**Also fixes:** game actions did not count as activity (`sessions.recordActivity`), so the cleanup dropped every live game from the session store 10 minutes after its start. Players who were connected kept playing, but reconnects failed with "Sitzung nicht gefunden".

**Implementation**
- `sockets/game.js`: `gameConfig.turnTime` (seconds, one of 0/60/120/180/300/600, checked in `lobby:config`). The KI keeps a seat after `TURN_TIMER_AFK_AFTER` (3) missed turns; tests may lower it. `session.turnClock = { key, deadline }` follows the state. A new human turn (`round:cur`) starts the clock; KI turns have none. `state:update` and `game:start` carry `turn: { total, left }`, or `null` without a limit. A 1-second loop calls `timeOutTurn()`: it counts `missedTurns` on the lobby player, sends `turn:timeout` to that player, and has the engine finish the turn. On the third miss the player becomes `afk` (in `publicPlayers`), unless no other active human would be left. Any action resets the count. `turn:reclaim` hands the seat back and restarts the clock.
- `engine-adapter.js`: `finishTurnForAbsent(state, kiLevel, keepKi, onStateChanged)`: the KI plays the rest of the turn (medium, hardest in ranked games), then `endTurn` and the following bot/KI turns.
- `sessions.js` / `config.js`: actions and start-tile placement count as activity. Running games (placement, draft, playing) are removed after `SESSION_TIMEOUT_MS` (2 h) without activity, lobbies and finished games after `LOBBY_TIMEOUT_MS` (10 min). `TURN_TIMER_SCALE` shortens the turns for tests.
- `mp.js`: lobby row *Zeit pro Zug* with a hint. Countdown `#mp-turn-clock` in the HUD, red in the last 30 seconds, with a toast to the player on turn. `turn:timeout` closes open dialogs and says why. `#mp-afk-banner` with *Ich bin zurück*. The player list tags the seat *KI (abwesend)*. `MP.isMyTurn()` (own turn and not absent) replaces the plain `S.cur === playerIndex` checks.
- Texts in `client/i18n.js`.

**Tests:** `tests/timer/turn-timer.test.js` (run with `TURN_TIMER_SCALE=0.05 TURN_TIMER_AFK_AFTER=2`, the latter for the server and the test): lobby setting, countdown, the timeouts, the KI takeover (B's next turn takes milliseconds instead of waiting), *Ich bin zurück*, no clock without a limit, and the cleanup rules. A only passes in this test, so the KI can end the game by round 5 or 6 (A's capital, economy): two missed turns instead of three keep the scenario within four rounds, and a game that still ends too early is replayed (up to three). `tests/i18n/english.test.js` covers the new lobby row.

**Status:** ✅ on `development`

## F3 Rematch

**Goal:** Play again with the same group without building a new lobby.

**Decisions**
- Live games only.
- At the end of a game the host gets a *Rematch* button. The session goes back to the lobby: the same code, password and settings, a new seed, the connected humans in their seats, the KI seats removed (they are refilled at the start). Everyone's screen goes back to the lobby.
- Players who have left are not in the new lobby. The Discord Activity keeps its instance in the same lobby.

**Implementation**
- `sockets/game.js`: at the start every lobby player keeps their own choice (`p.choice`, before "Zufall" and "random nations for everyone" are resolved). The host's `session:rematch` (only once the game is `finished`) calls `sessions.resetForRematch()` and sends every remaining player `session:rematch` with their new seat, the players and the settings.
- `sessions.js` `resetForRematch()`: keeps the connected humans (re-indexed, with their choice of nation and ability, and no turn-timer or draft leftovers), drops KI seats and players who left, removes `map` / `setup` from the settings, draws a new seed and sets the session back to `lobby`.
- `mp.js`: `addRematch()` on the end screen of a live game, a button for the host and a note for the others. In all multiplayer games it removes the game's own *Nochmal spielen*, which would start a local single-player game. `enterRematch()` clears the old game (`S`, log, player list, clock) and opens the lobby. The start-tile hook keeps the game's own `placeSeat` once, so a second tile-map game on the same page doesn't wrap the wrapper and send the tile twice.
- Discord Activity: unchanged. Its instance still points to the session, which is a lobby again after the rematch. Anyone who opens the Activity between the end and the rematch gets a fresh lobby, as before.

**Tests:** `tests/rematch/rematch.test.js`: no rematch during the game, host only, the end screen, the lobby after the rematch (code, seats, the player who left is gone, the "Zufall" choice is back, a new seed), and a second game starts.

**Status:** ✅ on `development`

## F1 Chat, emotes and map pings

**Goal:** Talk to each other inside a game, also over the days of a Rundenspiel.

**Decisions**
- A chat panel next to the game log, collapsible like it. Text (up to 300 characters), a row of quick emotes, and map pings: *ping*, then tap a hex, and a marker pulses there on every screen for a few seconds.
- Live games keep the last 100 messages in memory (shown again after a reconnect). Rundenspiele store the last 200 messages with the game.
- Moderation: a server-side rate limit (5 messages in 10 seconds), plain text only, and a local *mute* per player. Reporting is not part of this.
- No e-mail or push messages for chat.

**Implementation**
- `utils/chat.js`: the message format `{ id, t, slot, name, kind: text|emote|ping, … }`, checks (plain text up to 300 characters, a fixed emote list, valid hexes for pings), the rate limit (5 per 10 s per sender) and the history (pings are not kept).
- Live games (`sockets/game.js`): `chat:send` → `chat:msg` to the room. The last 100 messages stay in `session.chat` (also across a rematch), and `chat:history` is sent after every `session:connect`.
- Rundenspiele (`async/service.js`, `sockets/async.js`): `async:chat`, only for players of the game. Messages are kept in `data.chat` (last 200) and saved in the game's queue, so they can't overwrite a move. `async:chat` goes to everyone who has the game open, with no new view. `chat:history` is sent after `async:open`. Deleting an account removes its messages (`logic.removeUser`).
- `client/chat.js` (new, injected after `mp.js` by `inject.js`): panel bottom left, collapsible to a "💬 Chat" pill with an unread badge. Rundenspiele remember per device what was read (`hochciv.chat.seen.<id>`). Emote row, ping mode (a capture listener on `#map-host` takes the tap before the game opens the hex), pings drawn into `#map #world` after every `drawMap` and gone after 6 s. Muting on this device (`hochciv.chat.muted`). Follows the game's language. `mp.js` attaches it to every new socket.
- Texts in `client/i18n.js`.

**Tests:** `tests/chat/chat.test.js`: live game (panel, HTML shown as text, unread badge, emote, ping on both screens without opening the hex, the server's checks, the rate limit, muting, English, history after a reconnect) and Rundenspiel (live delivery, stored with the game, unread when opened again, non-players may not write).

**Layout fix (after staging tests):** the closed chat was an unlabelled round 💬 and easy to miss; the game log (top right) covered the map's zoom buttons; on short screens the open chat and the player list covered each other; on narrower windows code, password and turn timer wrapped in the header. Now the closed chat and player list are labelled pills ("💬 Chat", "👥 Spieler"), the floating game log is gone (it repeated the game's own "Protokoll" button), `MP.fitPanels()` collapses an open panel that would cover the one just opened (also after a resize), and the header stays on one line (`MP.showCred()`, the "Code:" label is dropped below 1000 px). `tests/layout/hud.test.js` checks this at 1280×720, 844×390 and 390×844 (upright phone).

**Status:** ✅ on `development`

## F4 Spectator mode

**Goal:** Watch a game without a seat, for example people in a Discord call who aren't playing.

**Decisions**
- Live games: join with code and password as a spectator, or with *Zuschauen* in the public lobby list (running public games are listed there too). Up to 20 spectators per game.
- Discord Activity: whoever joins while the game is running (or the lobby is full) becomes a spectator instead of getting an error.
- Rundenspiele: public games can be watched from the list (read-only).
- Spectators see the whole board, the log and the chat. They can't act or write in the chat. The player list shows how many are watching.

**Implementation**
- `sessions.js`: `session.spectators` (`{ clientId, name, socketId, connected }`), `addSpectator()` (code and password, any phase, at most `MAX_SPECTATORS` = 20 connected, the same clientId comes back, a player stays a player), and `spectatorCount()`. A spectator who takes a free seat with `joinSession` stops watching. `getPublicSessions()` also lists running public games (`status`, `round`, `spectators`) and leaves out sessions where nobody is connected.
- `routes/api.js`: `POST /api/sessions/watch { joinCode, password, viewer: { name, clientId } }`.
- `sockets/game.js`: `session:connect` with a spectator's clientId binds the socket as `watcher`, not as a player. Every player handler (`bound()`) then refuses, `chat:send` says *Zuschauer können nicht schreiben.*, and `game:start` / `draft:update` / state updates arrive like for players with `yourIndex: -1`. `spectators:update { count }` goes to the room. The rematch keeps spectators (`session:rematch` with `spectator: true`).
- `routes/activity.js` / `activity/bridge.js`: a game that is already running, or a full lobby, makes the Discord user a spectator, and the bridge uses `MP.enterSession()`.
- Rundenspiele (`async/service.js`): `open()` also lets non-players open public games that are being played or finished (read-only view: no seat, `myIndex: -1`). Actions and chat are refused by the existing checks. `list()` returns `watch`: running public games without a free seat.
- `mp.js`: `MP.spectator`. `watch()` + `enterSession()` (shared after `session:connect`). The lobby mode `watching` shows "Du schaust zu" while the host hasn't started yet. *Zuschauen* in the join form, in the public list (running games: "Läuft · Runde n · 👁 k") and in the Rundenspiele list (section *Laufende öffentliche Spiele – zuschauen*). Actions and end of turn say *Du schaust nur zu.* `viewerHook` gives spectators the screens of the player on turn. Spectators see a note while start tiles are placed. The player list title shows "👁 n" and the HUD shows "👁 Zuschauer".
- Texts in `client/i18n.js`.

**Tests:** `tests/spectators/spectators.test.js`: the session store (limit, comeback, room after leaving, a player stays a player, a wrong password, the hand-over to a free seat), a live game (watching the lobby, the game from the start, refused actions and chat, the count, the public list, watching mid-game, every move arrives, the end screen, the rematch) and Rundenspiele (listed, read-only, refused actions and chat, a private game can't be watched).

**Status:** ✅ on `development`

## F6 Post-game statistics

**Goal:** A game's story after it ends, not just the final points.

**Decisions**
- The server records, at the end of every round, the score of each empire (`victoryScore`) and a few counts: cities, population, techs and armies.
- The end screen gets a *Statistik* tab: a score chart over the rounds and the key moments (wonders, cities taken, empires eliminated, biggest jumps).
- The data is stored with the match (`games` table), so the match history on the account page can show it later as well.

**Implementation**
- `utils/stats.js`: `record(stats, E, S, names, final)`. A point (`{ r, p: [{ s, c, pop, t, a, w, d }] }`) is taken when a round begins, and at the end the last round's point is taken again. Between points it finds the events: wonders, conquered cities (city owners are tracked), empires out, a new leader. `publicStats()` strips the bookkeeping (`owners`, `wonders`).
- Live games (`sockets/game.js`): `recordStats()` in every `broadcastState` (a no-op within a round) and the final point in `checkGameOver`. `game:stats` goes to the room right after `game:over`, and again on a reconnect after the end. The match record gets `stats`. The rematch clears them.
- Rundenspiele (`async/service.js`): `recordStats(g)` in `settle()` before saving, so it covers every move and every KI turn. Stored in `data.stats` and in the match record, and the finished view carries it (`logic.view`).
- `models/Game.js`: new column `stats` (JSONB, null for older matches; added by `sync({ alter: true })`).
- `routes/games.js`: `GET /api/games/:id`, a public match summary (names, nations, points, MMR changes) with its statistics. `routes/profile.js` sends only `hasStats` per match, not the statistics themselves.
- `client/stats.js` (new, injected after `mp.js`): `STATS.render()` draws the chart. The nation colours are the empires' identity on the map, but they fail the colour-blind checks as a chart palette, so every line also has its own marker shape, and there are a legend, end labels (left out where they would collide), a crosshair tooltip with every empire, and a table view (points per round, counts at the end). Key moments list captures per round, wonders by name and the biggest jump. `addToEndScreen()` adds *📊 Statistik* to the end screen, and `loadInto()` loads a stored match. `client/profile.js` draws the chart when a match with statistics is opened.
- `mp.js`: `MP.lastStats` (live: `game:stats`; Rundenspiel: the view). The log, player list and chat panels are now at `z-index` 29, below the game's dialogs (30): before, they covered every dialog.
- Texts in `client/i18n.js`.

**Tests:** `tests/stats/stats.test.js`: recording with the engine (one point per round, final scores, events, names), a real Rundenspiel played to the end by the KI through the service (`finish-async.js`: stored, in the view and in the match record), and a live game in the browser (end screen, chart, legend, tooltip, key moments, table, the match record, `GET /api/games/:id`, the chart in the profile).

**Status:** ✅ on `development`

## F7 Replays

**Goal:** Watch a finished game again, turn by turn, and share it with a link.

**Decisions**
- The server keeps a snapshot of the state after every turn, compressed (Brotli, about 15 KB for a whole game) and stored with the match.
- Viewer: the game page in replay mode (`?replay=<id>`) with a timeline: back, play/pause, forward and a slider. It opens in the game version the match was played with (`/v88/` etc. for older ones).
- *Replay* links in the match history and on the end screen. Anyone with the link can watch.
- Retention: replays are deleted after 180 days.

**Implementation**
- `utils/replay.js`: a frame is the full game state when a new turn begins (`round:cur`) and once more at the end. Live games keep their frames in memory (`session.replay`, each Brotli-compressed on its own). Rundenspiele run for days and survive restarts, so their frames are rows in `replay_frames` (`g.replay = { key, seq }` in the game's data). At the end, `save()` / `saveAsync()` combine them into one document `{ v, version, names, frames }`, compressed with Brotli, as a `replays` row (about 6–15 KB per game). The frame rows are then deleted. `cleanup()` runs every 6 hours and deletes replays older than `REPLAY_KEEP_DAYS` (180) and frames of Rundenspiele that no longer run.
- `models/Replay.js`, `models/ReplayFrame.js`: new tables `replays` (by match id) and `replay_frames`.
- Live games (`sockets/game.js`): frames in `recordStats()` (start, every broadcast, end). After the match record is created, the replay is saved and `game:record { id, replay }` goes to the room (and again on a reconnect).
- Rundenspiele (`async/service.js`): `recordStats()` also stores the frame of a new turn while the game is `playing`. `processResult()` saves the replay and records `gameId` / `replay` in `g.result`, which the finished view passes on as `record` (`logic.view`).
- `routes/games.js`: `GET /api/games/:id/replay` sends the stored Brotli document as it is (`Content-Encoding: br`) to browsers that accept it, otherwise decompressed (browsers send `br` only over https). `GET /api/games/:id` says whether there is a replay, and `routes/profile.js` sends `hasReplay`.
- `client/replay.js` (new, injected after `mp.js`): `?replay=<id>` opens the viewer, in the version the match was played with (`/v88/` etc.; `mp.js` lets the old versions open replays). It shows the frames with the game's own screens, read-only (`MP.spectator`, `MP.replay`), with a timeline: start, previous round, previous turn, play/pause, next turn, next round, end, a slider, "Link kopieren" and "Beenden". The end screen shows the statistics, without rematch. `REPLAY.addToEndScreen()` adds *▶ Wiederholung ansehen* to the end screen of live games and Rundenspiele, and `client/profile.js` links the replay of an opened match.
- Texts in `client/i18n.js`.

**Also fixes**
- **Local game overwritten:** the game saves `S` as its local single-player game on every `redraw()`, so every multiplayer game (live, Rundenspiel, watching) overwrote the player's own local game, and *Weiterspielen* then opened the multiplayer state. `mp.js` now stops `saveGame` while `MP.active`. The end screen's *Zurück zum Menü* and the ☰ menu's *Spiel beenden* deleted the local game too. In multiplayer games they now only leave.
- **Account deletion:** the statistics (F6) and replays name the players, so deleting an account now renames them in the stored statistics, in every state of stored replays and in the frames of running Rundenspiele. That covers player names, log lines ("Kampf um Xs Stadt") and the result text. The running Rundenspiel's own state gets the same treatment (`utils/rename.js`, whole names only).

**Tests:** `tests/replay/replay.test.js`: live game (end screen, stored with one frame per turn in order, `br` and plain delivery, 404, profile link), viewer in a fresh browser (every timeline control, read-only, no chat, playing, the end screen with statistics and without rematch, the local game neither overwritten nor deleted), Rundenspiel (one replay at the end, frame rows gone, the view links it), account deletion (name gone from replay and statistics, renamed in running frames, whole names only) and the cleanup.

**Status:** ✅ on `development`

## F5 "Since your last turn" summary

**Goal:** When it is your turn again, see at a glance what the others did.

**Decisions**
- When a turn begins, a pop-up lists the changes since the player's previous turn: attacks on them and cities lost, wonders built, techs and cities of the others, and the score change of every empire. It can be closed and opened again from the HUD.
- Rundenspiele: the "your turn" e-mail and push message contain a short version.
- The server remembers, for each seat, the point of its last turn (log position and counts). The pop-up compares that point with the current state.

**Implementation**
- `utils/summary.js`: `track()` runs on every state change. When a human's turn has moved on, that seat gets a mark: log position, the counts of every empire (the `utils/stats.js` snapshot), city owners and the existing wonders. `summarize()` compares the state at the start of the seat's next turn with its mark and returns score, city, tech, wonder and army changes per empire, cities lost (also destroyed) and gained, new wonders, empires out, and the log since then (up to 150 entries). `text()` builds the German e-mail text (several lines) and push text (one line).
- Live games (`sockets/game.js`): marks in `session.marks` (tracked in `recordStats`). `turnSummary()` computes the summary once when a human's turn begins and sends it with that `state:update`. It is derived from the public state, so the room may receive it, and arriving with the state avoids any ordering problem. A reconnect during the turn gets it again with `game:start`. The rematch clears it.
- Rundenspiele: marks in `data.marks` (tracked in the service's save path). The player's view carries `summary` while it is their turn (`logic.view`). The "your turn" notification now goes out per recipient, with `summary` / `short` from `logic.summaryText()`. `utils/notify.js` adds `summary` to the e-mail and `short` to the push text.
- `mp.js`: `takeSummary()` keeps the first summary of a turn, ours only. The `humanTurnStart` hook shows it first (`summaryBeforeTurn`), and the game's own turn-start dialogs (food, free pick …) follow when it is closed, however that happens (`closeModal` hook). The pop-up shows alerts (⚔ cities lost or taken, ☠ out, 🏛 wonders), a table of every empire with its changes, *Alle Ereignisse* (the game's `logHtml`) and *Bei jedem Zug automatisch zeigen* (`hochciv.summary.auto`). The HUD button 📋 reopens it. Spectators get none.
- Texts in `client/i18n.js`. E-mails stay German, like all e-mails.

**Tests:** `tests/summary/summary.test.js`: the summary with the engine (marks, log since, score changes, a city taken and one gone, e-mail and push texts), a live game (no summary on the first turn, pop-up before the turn-start dialogs and continuing after it, a row per empire, nothing for the other player or spectators, 📋, a reconnect, automatic display off) and a Rundenspiel (the "your turn" e-mail with the summary, the pop-up when opening the game). `tests/timer` passes with it (a timeout closes the pop-up).

**Status:** ✅ on `development`

## F9 Ranked matchmaking

**Goal:** Find a ranked game without a group or join codes.

**Decisions**
- *Gewertetes Spiel suchen* in the multiplayer menu (logged in only). The queue pairs players by MMR. The allowed MMR gap starts at ±100 and grows over time.
- Match found: everyone confirms within 20 seconds, then the server creates the lobby and starts it. Settings: original map, random nations for everyone, KI on the hardest level, turn timer 3 minutes (F2).
- 2 to 4 humans per game. Free seats up to 4 empires are KI.
- Anyone who doesn't confirm leaves the queue. The others stay in it.

**Implementation**
- `sockets/match.js` (new): the queue and pending matches live in memory. Every 2 seconds the player waiting longest is matched with the closest MMRs within the allowed gap of both (`windowOf`: ±100, +50 every 15 s, at most ±1000). Four form a game at once; two or three after `MATCH_GROUP_WAIT_MS` (20 s). `match:found` asks for confirmation within `MATCH_CONFIRM_MS` (20 s), and `match:progress` shows who has confirmed. Declining, the time running out or a disconnect removes that player from the queue, and the others go back into it with their waiting time (`match:cancelled`). When everyone has confirmed, the server creates the lobby (`matchConfig()`: original map, random nations, ranked, hardest KI, 3 minutes per turn, four empires), seats everyone and sends `match:ready` with their seat. The game starts as soon as all of them have joined the lobby, or after 30 s with those who came (at least two). Login required, nothing during maintenance.
- `sockets/game.js`: the start logic of the host's `game:start` is now `startGame(io, session)` (exported), so the matchmaking starts its lobbies the same way. `session:connect` tells a matchmaking lobby that a player has arrived (`session.match.onConnect`).
- `client/matchmaking.js` (new, injected after `mp.js`; `mp.js` attaches it to every socket): *🔥 Gewertetes Spiel suchen* in the multiplayer menu (disabled without login). The search dialog shows the waiting time, the MMR range and the queue size. *Spiel gefunden* lists the players with a countdown and *Annehmen* / *Ablehnen*. The client then joins the lobby with the seat it was given, like the Discord Activity does. A closed search dialog keeps searching, *Spiel gefunden* opens it again, and the menu button brings it back. After a reconnect the client rejoins the queue.
- `docker-compose.local.yml`: `MATCH_GROUP_WAIT_MS` / `MATCH_CONFIRM_MS` for the test.
- Texts in `client/i18n.js`.

**Tests:** `tests/match/match.test.js` (run with `MATCH_GROUP_WAIT_MS=3000 MATCH_CONFIRM_MS=5000`): the MMR window and the settings, the queue screen, close MMRs matched and a far one not, a decline (one back in the queue, one out), a closed dialog, both confirming and the ranked game starting by itself with the right settings, a confirmation running out, and no queue without login. All other tests pass with `startGame()`.

**Status:** ✅ on `development`

---

## F11 Chat: report and block

Tapping another player's chat message opens a menu: **report the message** to the admins or **block the player**. Live games and Rundenspiele.

**Decisions**
- The menu is a list (`CHAT.menuItems` in `client/chat.js`): `{ id, icon, label, when(m), run(m) }`. More options are one more entry; `run` can return a second step (as the report does with its reason field).
- A report stores the chat history as the **server** has it (live game: last 100 messages, Rundenspiel: last 200, no pings), not what the client sends. Optional reason (300 characters). Players and spectators may report, guests too; nobody twice per message, not their own, at most 10 per hour.
- Block replaces the earlier device-local *mute*. Only accounts can be blocked, by id (holds across games, devices and names); logged-in players keep the list with the account (`users.blockedPlayers`), guests on the device. Guests can't be blocked: they can be muted for the running game only (F12). A blocked player's messages, unread count and pings are hidden. The list is under the chat and on the account page (*Blockierte Spieler*), with *Entblocken*.
- Admins (admin and superadmin) review reports in the new account tab *Meldungen* (open count on the tab): the chat history with the reported message marked, then *Erledigt* or *Verwerfen* with a note, *Wieder öffnen*, and *Konto sperren* (the existing ban, with its admin/superadmin rules). Retention: see F12.
- Account deletion: reports stay (moderation record) without the deleted account's name; nobody blocks the account any more.

**Implementation**
- `models/Report.js` (new, `reports` table); `models/User.js`: `blockedPlayers` (JSONB).
- `utils/reports.js` (new): `report()` (checks, rate limit, snapshot), `block()` / `unblock()` / `publicBlocks()`, `list()` / `update()` for the admin, `removeUser()` for account deletion, `cleanup()` / `startCleanup()` (`server.js`).
- `utils/chat.js`: messages carry the sender's account as `uid` (none for guests) – blocks and reports go by it.
- `sockets/game.js`: `chat:report`. `async/service.js` + `sockets/async.js`: `async:report`.
- `routes/account.js`: `GET/POST /api/account/blocks`, `DELETE /api/account/blocks/:key`. `routes/admin.js`: `GET /api/admin/reports?status=open|closed`, `POST /api/admin/reports/:id` (`status`, `note`).
- `client/chat.js`: rows of other players are tappable (keyboard too), the menu over the messages (the panel grows while it is open), Escape closes it; the blocked list under the messages.
- `client/account.html` / `account.js`: *Blockierte Spieler* in the profile, the *Meldungen* tab.
- `utils/deleteAccount.js` calls `reports.removeUser()`. Texts in `client/i18n.js`.

**Tests:** `tests/reports/reports.test.js`: live game with two accounts and a guest (the menu, a report with reason and history, refused twice / own / unknown, a guest's report, blocking an account and a guest, no new messages, badge or pings, the account page list and unblocking there), the admin tab (403 for non-admins, open count, history with the marked message, resolve with note, dismiss, closed list, reopen, ban), a Rundenspiel report and an outsider refused, and account deletion. `tests/chat/chat.test.js` blocks on a guest's device instead of muting.

**Status:** ✅ on `development`

---

## F12 Chat: word filter and guests emote-only

Texts with bad language are not sent but reported automatically, and the sender gets a writing timeout. Guests (no account) can only send emotes and pings. Live games and Rundenspiele.

**Decisions**
- **Filter base:** the `obscenity` library (MIT) does the matching. It sees through l33t speak, look-alike characters and repeated letters ("sh1t", "Wiiichser") and has an English list that avoids the usual false hits ("assassin"). German words come from the LDNOOBW list in `naughty-words` (CC-BY-4.0), matched as whole words so "arsch" doesn't hit "Marsch".
- **Curated German words** in `utils/profanity.js`:
  - `DE_SKIP`: list words that are harmless in a game (nackt, Rosette, Bonze, Kimme, Penis, …) don't count.
  - `DE_EXTRA`: common words the list lacks (Hurensohn, Scheiß…, fick…, Spast, Mongo, Nazi, …).
  - `DE_ALLOW`: German words the English list would hit (dick/dicke, Fagott, Analphabet, Assel, wanken, …). Allowing "dick" lets the English insult through as well, because the German word is far more common here. The English list's own allowance of "fick" is removed.
- **Admin words** live in the database (`banned_words`): *Sperren* (whole word, or also inside words) or *Erlauben* (never counts). Changes apply at once, and the tab has a field to test a text against the filter.
- **Penalty:**
  - A flagged text is not shown to anyone. It is auto-reported (reporter "Wortfilter", with the words found, the penalty, and the history plus the message).
  - First time: no texts for 5 minutes (`CHAT_MUTE_MS`). Second time: no texts for the rest of the game.
  - Emotes and pings stay possible. The chat shows why the text field is gone and until when.
  - Live games keep the timeout with the seat; a rematch is a new game and resets it. Rundenspiele keep it with the game (`data.chatMutes`), so it outlasts a restart.
- **Guests:** the server refuses their texts, and the chat shows a hint instead of the text field. Guests can't be blocked. The message menu offers *Für dieses Spiel stummschalten* instead: kept in the browser tab (sessionStorage) for this game only (session + seed), listed under the chat and undone there.
- **Retention:** reports about an account are kept as long as the account exists. Reports without one (a guest, or an account that was deleted, which anonymizes its reports) are deleted 3 years after the report (`REPORT_KEEP_YEARS`).

**Implementation**
- `package.json`: `obscenity` 0.4.6, `naughty-words` 1.2.0.
- `utils/profanity.js` (new): the matcher from the built-in lists plus `banned_words`, `check(text)`, which tests the text as typed and with punctuation as spaces (the library's word ends miss "Hurensohn!!", but "sh!t" needs the "!"), `reload()` at start and after changes, and `list/add/remove`. `models/BannedWord.js` (new).
- `utils/reports.js`: `moderate()` (check, auto-report, next strike), `muteActive()`, `GUEST_TEXT`; blocks accept accounts only, and old name entries are dropped; `cleanup()` follows the new retention. `models/Report.js`: `auto`, `matches`, `penalty`.
- `sockets/game.js` `chat:send`: refuses guest texts, refuses texts during a timeout, runs `moderate`. `chat:history` carries `guest` and `mute`. `sessions.js`: a rematch clears `chatMute`.
- `async/service.js` `chat()`: the same, with `chatMutes` saved through the game's queue. `open()` and `sockets/async.js` send the timeout with the history. `async/logic.js` `removeUser` drops the account's timeout.
- `routes/admin.js`: `GET/POST /api/admin/words`, `DELETE /api/admin/words/:id`, `POST /api/admin/words/check`. `server.js` loads the list after the DB sync.
- `client/chat.js`:
  - the note instead of the text field (guest or timeout), refreshed when the timeout ends;
  - the menu shows *block* for accounts and *mute for this game* for guests;
  - both lists sit under the chat;
  - the rotated-phone rules are scoped to portrait, as in the game's `style.css`.
- `mp.js`: a rematch clears the timeout on the client.
- `client/account.html` / `account.js`: the *Wortfilter* section in *Meldungen*, and auto-reports showing the words and penalty. Texts in `client/i18n.js`.
- `docker-compose.local.yml`: `CHAT_MUTE_MS` for the test.

**Tests:** `tests/filter/filter.test.js` (run server and test with `CHAT_MUTE_MS=4000`) covers:
- the filter: hits, including disguised spellings, and no false hits on game words;
- guests: texts refused, emotes and pings allowed, the hint shown;
- the first bad text: hidden, auto-reported, the timeout and its note, emotes still allowed; after the timeout a clean text passes;
- the second bad text: blocked for the rest of the game, also after a reconnect;
- the admin word list: ban whole word and word part, allow, duplicates, removal, the check field, 403 for non-admins;
- a Rundenspiel: the timeout is stored with the game and sent when it is opened;
- retention.

`tests/reports` and `tests/chat` now use accounts for texts, a guest sends emotes, and the guest is muted instead of blocked.

**Status:** ✅ on `development`

---

## Later

Not started. These features need groundwork that doesn't exist yet.

### F8 Friends list
A friends list with online status and direct invitations to lobbies and Rundenspiele. Needs friends functionality (requests, accept, block) first.

### F10 Seasons, leaderboard and badges
Seasons with tiers and a soft MMR reset, a public leaderboard, and badges on the profile (wins with each nation, wonders built, …).
