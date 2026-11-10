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
| 11 | F13 | [Overall statistics](#f13-overall-statistics) | ✔ | ✔ | ✅ |
| 12 | F14 | [What the others did, played on the map](#f14-what-the-others-did-played-on-the-map) | ✔ | ✔ (since your last turn) | ✅ |
| 13 | F15 | [Invite link](#f15-invite-link) | ✔ | ✔ | ✅ |
| 14 | F16 | [Resign](#f16-resign) | ✔ | ✔ | ✅ |
| 15 | F17 | [Lobby ready check](#f17-lobby-ready-check) | ✔ | – | ✅ |
| 16 | F18 | [Sound and tab alerts](#f18-sound-and-tab-alerts) | ✔ | ✔ | ✅ |
| 17 | F19 | [Turn deadline per Rundenspiel](#f19-turn-deadline-per-rundenspiel) | – | ✔ | ✅ |
| 18 | F20 | ["Next game" button](#f20-next-game-button) | – | ✔ | ✅ |
| 19 | F8 | [Friends list](#f8-friends-list) | ✔ | ✔ | ✅ |
| 20 | F10 | [Seasons, leaderboard, badges](#f10-seasons-leaderboard-and-badges) | ✔ | ✔ | ✅ |
| 21 | F21 | [Weekly challenge](#f21-weekly-challenge) | – | ✔ (solo vs. KI) | ✅ |
| 22 | F22 | [Team mode](#f22-team-mode) | ✔ | ✔ | removed |
| 23 | F23 | [Personal statistics](#f23-personal-statistics) | ✔ | ✔ | ✅ |
| 24 | F24 | [Replay link to a turn](#f24-replay-link-to-a-turn) | ✔ | ✔ | ✅ |
| 25 | F25 | [Lobby presets](#f25-lobby-presets) | ✔ | ✔ | ✅ |
| 26 | F26 | [Challenge: compare with the best attempt](#f26-challenge-compare-with-the-best-attempt) | – | ✔ (challenge) | ✅ |
| 27 | F27 | [Pause a live game, or continue it as a Rundenspiel](#f27-pause-a-live-game-or-continue-it-as-a-rundenspiel) | ✔ | – | ✅ |
| 28 | F28 | [Single-player games in the statistics](#f28-single-player-games-in-the-statistics) | – | – (single player, browser and app) | 🔨 server ✅, app open |

The numbers are those of the original proposal; F11 and F12 were requested after the staging tests of F1. F15–F22 (and F8, F10 moved up from "later") are the second round, approved on 2026-11-03. Not wanted for now: a vacation mode for Rundenspiele, a tutorial, tournaments (too few players yet). F23–F27 are the third round, approved on 2026-11-10; F28 was asked for the same day. Parked as GitHub issues for later: daily challenge (#120), bot arena (#121), Discord integration (#122). The order puts the small fixes for live games first. F6 and F7 come before F5 because they record per-turn data that F5 can reuse.

F1–F14 are in production. Production (`main`) gets them through a PR from `development` once they have been tested on staging. Each feature has its own test in `tests/`; together they run against the local docker setup (see each file's header).

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

**Later additions (requested after the staging tests):** each point also has the income per round and the stock of science, food and coins (`ys yf yc rs rf rc`, from the engine's `income()` and `res`); the chart has a value selector (points, cities, population, techs, armies, wonders, income, stock) and the table follows it; older matches get the new values from their replay (`Stats.enrich`, run with the facts backfill of F13). The match history on the account page shows the chart when a match is clicked (`client/stats.js` is loaded there; `GET /api/games/:id` sends nation names and colours for pages without the game).

**Tests:** `tests/stats/stats.test.js`: recording with the engine (one point per round, final scores, events, names, income and stock), `enrich`, the value selector, the chart in the account page's match history, a real Rundenspiel played to the end by the KI through the service (`finish-async.js`: stored, in the view and in the match record), and a live game in the browser (end screen, chart, legend, tooltip, key moments, table, the match record, `GET /api/games/:id`, the chart in the profile).

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

## F13 Overall statistics

**Goal:** Numbers over all finished matches – requested by the players: win rate per nation and per turn position, how many cities winners have, which technologies winners research, and more.

**Decisions**
- **Both public and admin:** *Statistiken* in the main menu for everyone; the account tab *Statistiken* for admins adds detail.
- **Humans only by default:** win rates count human seats; a filter adds KI and bot seats. Further filters: number of empires, game type, version.
- **Game types on their own:** every match counts under its game type (normal, 1 gegen 1, Marathon – different rules), each viewable on its own; *Alle* puts them together. Older matches from the match record have no type stored: drafted abilities mean Marathon, two empires 1 gegen 1, otherwise normal (`modeOf`, when reading – no recompute needed).
- **Older matches are included:** the facts of a match are computed from its replay (the state after every turn), so matches from before this feature count as well. Matches without a replay fall back to the match record (no techs, no turn position).
- **Anonymous:** the facts have no names and no account ids, so account deletion and merging don't need to touch them.

**Implementation**
- `utils/facts.js`: `fromStates(states, version)` → per empire nation, ability (or the drafted pair), human/KI/bot and level, turn position (from `S.startIdx`, barbarians left out), won, dead, score, cities, population, armies, wonders and the round of each technology (a tech new in frame j was researched in the turn of frame j-1). Per match: rounds, empires, mode, map, events/wonders, victory type (from `S.over`). `fromRecord(game)` is the fallback. `storeLater(gameId)` runs after a match is stored (`sockets/game.js`, `async/service.js`); `backfill()` fills every match without facts after the DB sync at start.
- `models/Game.js`: new column `facts` (JSONB).
- `utils/gamestats.js`: `aggregate(rows, query, detail)` – nations, abilities, turn positions (by number of empires), victory types, winners vs. the others (averages), winners' cities, techs (share among winners and the others, win rate with it, average round for winners), wonders; names in German and English from the current game. The facts of all matches are cached for a minute and dropped when new facts are stored.
- `routes/stats.js`: `GET /api/stats` (public, filters sanitised). `routes/admin.js`: `GET /api/admin/stats` (adds matches per version, KI/bot levels, sources), `GET /api/admin/stats/export` (JSON download), `POST /api/admin/stats/recompute` (superadmin).
- `client/gamestats.js` (new, injected after `mp.js` and loaded by the account page): `GAMESTATS.open()` (overlay) and `GAMESTATS.render(el, { admin })`. Tables with one bar per row and the number next to it (one neutral colour; the table is the accessible view), rows with fewer than 5 seats greyed out, the tech table sortable. On phones the tables are compact and scroll sideways.
- `mp.js`: the menu button *Statistiken*. Texts in `client/i18n.js`.

**Tests:** `tests/stats/overall.test.js`: facts from a KI game played with the engine (turn positions, winners, tech rounds, victory type, barbarians, the fallback), the aggregation over made-up matches (every table and filter), a real Rundenspiel played to the end (facts from its replay, `GET /api/stats`, filters, no names), the overlay in German and English, and the admin tab with export.

**Status:** ✅ on `development`

## F14 What the others did, played on the map

**Goal:** The animations single player has since v94 (KI and bot turns replayed on the map, `js/anim.js`) also in multiplayer – in Rundenspiele as a replay of the time one was away.

**Decisions** (by the user)
- **Everybody's actions, not only the KI:** KI turns, the actions of the other humans and every battle. One's own actions are not played back to oneself; one's own battles are (they happen at the end of the turn, as in single player).
- **Live games:** every update plays what is new, then shows the new state. **Rundenspiele:** opening the game in one's turn plays everything since one's last turn, then "Seit deinem letzten Zug" (F5) pops up. What a device has shown is not shown again (reload, watching live before one's turn).
- The game's own setting *Animationen* (Langsam / Schnell / Keine) applies. A tap on the map skips everything still queued (single player skips only the rest of one turn – here that would mean one tap per empire). Battles play like in single player, also with *Keine*.
- **Turn timer (F2):** when one's own timed turn begins, whatever is still queued is skipped – the clock runs on the server, the time belongs to the player. The F5 pop-up still tells what happened.
- Game versions before v94 (v93, v83) have no `js/anim.js`: their games record and play nothing.

**Implementation**
- `utils/scenes.js` (new): the scene log of a game, `{ n0, base, frames }`. The engine's `LOG_HOOK` (v94) records every log entry of class `act` of a state that has a log attached – the action's text and the map snapshot after it (`animSnap`); battles come from `finishTurn(S, rec)` with the engine's combat entries; silent frames (`sync`, before actions and turns) keep the chain equal to the state (income, turn change). Frames are diffs against the snapshot before. The log hangs on the state under a symbol, so it is never sent or stored with it, and the KI's planning copies don't get it. `trim()` folds what every human has seen (after the earliest F5 mark) into the base; `chain()` cuts out what a client needs (base + frames).
- `client/scenes.js` (new, shared with the server): `diff` / `apply` of snapshots, and in the browser `SCENES.run()`: rebuilds the chain and turns it into the game's own scenes (`animUnterschied`, `animDetails`) and battle entries, one part per empire's turn, played with `playAnim` / `playCombat`.
- `engine-adapter.js`: loads `anim.js` (optional, no DOM), sets `LOG_HOOK`, `attachScenes()`, and a `finishTurn()` / `endTurn()` that record battles – used for human turn ends, `runBots`, the turn timer and Rundenspiele (`async/logic.js`).
- Live games (`sockets/game.js`): the log in `session.scenes`; every `state:update` carries `scenes` – the frames since the last update – and nothing older is kept.
- Rundenspiele: the log in `data.scenes` (dropped when the game ends), trimmed with the marks; the view carries `scenes` since the player's mark.
- `mp.js`: `queueScenes()` – each update's scenes play, then its state is applied, in order. The turn start (and with it the F5 pop-up) waits for the queue; `endAnim` / `endCombat` hooks make a tap skip the whole queue. Rundenspiele remember the last frame shown per game (`hochciv.scenes.<id>`).

**Tests:** `tests/timer` covers the skip on a timed turn. `tests/scenes/scenes.test.js`: recording with the engine (the chain rebuilds the engine's snapshot after every turn, actions / battles / silent frames, the same game with and without recording, trim, v93 records nothing), a live game (the KI's and the other human's actions are played, one's own not, the turn starts after them, a tap skips the queue, spectators see everything, *Keine* plays nothing) and a Rundenspiel (opening it in one's turn plays the other human's research and the KI's turn, then "Seit deinem letzten Zug"; opened again, nothing is played twice).

**Status:** ✅ on `development`

## F15 Invite link

**Goal:** Bring a friend into a game with one link instead of a code and a password to type.

**Decisions**
- Live games: `/?join=CODE&pw=PASSWORD`, also for private lobbies. Rundenspiele: `/?join=CODE`.
- The lobby has *🔗 Einladungslink teilen*: on phones the system's share sheet, elsewhere the clipboard (a prompt if both fail). The Rundenspiel invite dialog shares the same kind of link (before, its link only worked for public games).
- Whoever opens a live-game link sees whose game it is (host, map, settings, players) and joins with their name, or watches if the game runs already or the lobby is full. A Rundenspiel link opens the game's join dialog (guests log in first).
- The address is cleaned right away, so code and password don't stay in the browser history or a reload.

**Implementation**
- `sessions.js`: `sessionSummary()` (shared with `getPublicSessions()`), `previewSession(code, password)` without password and session id. `routes/api.js`: `POST /api/sessions/preview` (rate-limited like joining).
- `mp.js`: `inviteUrl()`, `shareInvite()`, `openInvite()`, `acceptInvite()`; `join()` and `joinPublic()` share `joinWith()`. Old game versions (`/v96/` …) pass the link on to `/`.
- Texts in `client/i18n.js`.

**Tests:** `tests/invite/invite.test.js`: the button copies the link, the preview (fields, no password, wrong password), joining a private lobby through the link, a wrong password, a running game offers watching, a guest's Rundenspiel link asks for the login, a logged-in player joins a private Rundenspiel, English.

**Status:** ✅ on `development`

## F16 Resign

**Goal:** Give up a game you can't win instead of leaving the others waiting.

**Decisions**
- *🏳 Aufgeben* in the game menu of live games and Rundenspiele, with a confirmation (it names the MMR in ranked games). Only while the game runs.
- The KI plays the seat to the end (*mittel*, ranked *schwer*); the player stays on the page and watches (banner, can be closed). The player list shows *Aufgegeben*, the others get a toast, the game log a line.
- Rating: like a Rundenspiel seat the KI took over after 7 days – out of the MMR calculation, a played game, in ranked games −15 MMR.
- Two cases end the game at once: a game that began without KI seats has one human left (that human wins), or nobody human is left (the most points win, so no KI-only game runs on).

**Implementation**
- `utils/resign.js`: `endAfterResign()` (the two end cases, `S.over.resign`), `logResign()`, `MMR_PENALTY`.
- Live (`sockets/game.js`): `game:resign` sets `resigned` on the lobby player, makes the seat KI, plays the turn if it was theirs (`finishTurnForAbsent`), sends `game:resigned`. Actions of a resigned player are refused, `turn:reclaim` doesn't give the seat back, the turn timer's AFK rule ignores them. `processGameOverMmr` keeps them out of the rating (`replaced`, `replacedUserId`, `resigned`, `penalty`) and applies the penalty. A rematch clears it (`sessions.js`).
- Rundenspiele: `async/logic.js resign()` (uses `replaceSeat`, `resigned` on the seat and in the views), `service.resign()` (penalty or a played game), `async:resign`, `POST /api/async/:id/resign`.
- `utils/facts.js`: victory type `resign` (overall statistics: *Aufgabe*).
- `mp.js`: `hasResigned()`, `canResign()`, `resign()`, the menu button, the banner, the player-list tag, the Rundenspiel seat label *KI (… hat aufgegeben)*, the two end texts translated (`translateOver`). Texts in `client/i18n.js`.

**Tests:** `tests/resign/resign.test.js`: the end rule, a ranked live duel of two accounts (menu button, the win, match record, 985 MMR and one game for the one who resigned), a live game with KI (the KI plays the turn, actions refused, banner, player list, log; the last human resigns → points), Rundenspiele (a duel ends, a game with KI goes on and the player watches). `rematch`, `score/win-bonus`, `stats/overall`, `timer`, `i18n` pass.

**Status:** ✅ on `development`

## F17 Lobby ready check

**Goal:** The host starts when everyone has picked a nation, not while someone is still choosing.

**Decisions**
- Every player except the host taps *Ich bin bereit* (and can take it back). The status column shows *✓ Bereit* / *Wählt noch …*; the host doesn't tick.
- The host's *Spiel starten (n/m bereit)* asks before starting while someone isn't ready; the server doesn't block the start.
- New lobby settings clear every tick, and whoever was ready is told to confirm again. Player-bots are always ready. Kicking from the lobby existed already.

**Implementation**
- `sockets/game.js`: `lobby:ready { ready }`, ticks cleared after `lobby:config`, `ready` in `publicPlayers()`. `sessions.js`: the rematch clears it.
- `mp.js`: `readyCount()`, `readyCell()`, `readyHint()`, `setReady()`, `startClick()` (the button; `startGame()` stays without the question for the Discord Activity and tests). Texts in `client/i18n.js`. The invite bar and the status column wrap on phones.

**Tests:** `tests/ready/ready.test.js`. `i18n`, `mobile`, `bots`, `rematch` pass.

**Status:** ✅ on `development`

## F18 Sound and tab alerts

**Goal:** Notice your turn, a full lobby or a found match while the tab is in the background.

**Decisions**
- Tones for: your turn begins, a player joins your lobby, everyone is ready (host only), the game starts, a ranked match is found, a chat message while the chat panel is closed or the tab hidden. Not for one's own messages, not when a Rundenspiel is opened in one's turn (only a turn that begins while it is open).
- While the tab is hidden, its title alternates with a short text (*▶ Du bist dran*, *%s ist beigetreten*, …) until the player is back.
- One switch per device, on by default: a checkbox in the multiplayer menu and *🔔 Töne: an/aus* in the game menu.

**Implementation**
- `client/alerts.js` (new, after mp.js via `inject.js`): tones synthesized with the Web Audio API (no sound files), unlocked by the first tap or key (autoplay rules), `notify()`, `blink()`, `soundOn()` / `setSound()` (`hochciv.alerts.sound`), `log` for tests.
- Calls: `MP.alert()` in `applyState` (turn), `player:joined`, `lobby:player:updated` (all ready), `game:start`; `client/chat.js` `receive()`; `client/matchmaking.js` `match:found`. Texts in `client/i18n.js`.

**Tests:** `tests/alerts/alerts.test.js`. `loading`, `chat`, `i18n`, `match` pass.

**Status:** ✅ on `development`

## F19 Turn deadline per Rundenspiel

**Goal:** Faster Rundenspiele for groups who play daily.

**Decisions**
- The host picks *Zeit pro Zug* when creating a Rundenspiel: 1, 3 or 7 days (default 7, older games 7).
- Reminder and takeover scale with it (reminder at 5/7, takeover at the end; 1 day: about 17 hours, then 1 day). Finding players (setup) always has 7 days.
- The open games show *1 Tag pro Zug* / *3 Tage pro Zug*, and the filter *Zeit pro Zug: Mit Zeitlimit* finds them. The list shows the hours left once less than a day is left. The e-mails name the real time.

**Implementation**
- `async/logic.js`: `config.turnDays` (`TURN_DAYS`). `async/service.js`: `timeoutOf()`, `reminderOf()`, `duration()`; the sweep looks at games waiting longer than the shortest reminder and checks each one; `deadline` in the list.
- `mp.js`: the form's select, `lobbyTraits()` / `traitsHtml()`, hours left in `row()`. Texts in `client/i18n.js`.
- `docker-compose.local.yml` passes `ASYNC_TIMEOUT_MS`, `ASYNC_REMINDER_MS`, `ASYNC_SWEEP_MS` for tests.

**Tests:** `tests/deadline/deadline.test.js` (scaled-down timeouts). `lobbies/lobby-filter`, `summary`, `i18n` pass.

**Status:** ✅ on `development`

## F20 "Next game" button

**Goal:** Play all Rundenspiele that wait for you in one go.

**Decisions**
- In a Rundenspiel, while it isn't one's turn (or the game is over), *▶ Nächstes Spiel (n)* appears below the waiting note when other games wait for one's turn; it opens the one with the nearest deadline. Hidden during one's own turn.
- The list is fetched right after one's turn ends and at most every 20 seconds otherwise.

**Implementation**
- `mp.js`: `refreshNext()` (from `syncTurnBlocker`), `drawNextGame()` (below the AFK/resign banner if one is shown), `openNextGame()` (closes the game and opens the next; on an older game version page via `/?async=`). `ASYNC.close()` hides it. Texts in `client/i18n.js`.

**Tests:** `tests/nextgame/nextgame.test.js`.

**Status:** ✅ on `development`

---

## F8 Friends list

**Goal:** Play again with people you like: see who is online and bring them into a game.

**Decisions**
- Accounts only (not bots). Requests by name, from a player profile, or from *Zuletzt gespielt mit* (accounts of one's last 20 matches). Two crossing requests accept each other. A chat block (either way) or a ban stops requests. At most 200 friends and open requests.
- Online = a game page with an open socket (a logged-in page connects right away). The list shows *Online*, *In einer Lobby*, *Spielt · Runde n* or *Offline · vor …*; a friend's public lobby can be joined and a public game watched from there.
- Live lobbies: *👥 Freunde einladen* lists online friends; the invited friend gets a card (*Ansehen* opens the invite dialog of F15). While playing, only a note – the invitation waits in the list for 15 minutes as long as the lobby waits.
- Rundenspiele: the existing invitation by name, with friend names to pick in the create form and the invite dialog.
- Account deletion removes the friendships; a merged Discord Activity account passes them on.

**Implementation**
- `models/Friendship.js` (`friendships`), `utils/friends.js` (list, request, accept, remove, live invitations, suggestions, delete/merge), `utils/presence.js` (online sockets, last seen), `sessions.js` `activityOf()` / `lobbyByCode()`, `routes/friends.js` (`/api/friends`, rate limit per account), `sockets/friends.js` (`friends:invite`; `friends:changed` / `friends:invited` to the account's sockets). `utils/deleteAccount.js`, `utils/mergeAccounts.js`.
- `client/friends.js` (after mp.js via `inject.js`): the menu tab with a count of requests and invitations, the lobby panel, the invitation card, `chipsHtml()` for Rundenspiele, `decorateProfile()` for `client/profile.js`. `mp.js`: the third tab, `FRIENDS.start()` after login, `FRIENDS.attach()` on every socket. Texts in `client/i18n.js`.

**Tests:** `tests/friends/friends.test.js`. `loading`, `i18n`, `bots`, `security`, `account/pages`, `maps`, `invite`, `ready` pass.

**Status:** ✅ on `development`

## F10 Seasons, leaderboard and badges

**Goal:** Something to play for over weeks: a season standing, a tier, badges to collect.

**Decisions**
- A season is a calendar quarter (UTC). The first one began without a reset. At its end the final standings are kept and every MMR moves halfway back to 1000. The MMR stays one number, shared by humans and bots.
- Tiers by MMR: Bronze, Silber (950), Gold (1100), Platin (1250), Diamant (1400), once an account has 5 ranked games in the season.
- *🏆 Rangliste* in the main menu and the multiplayer menu: the top 100 of the running or a closed season, players or bots, own row marked (and shown below when not in the top 100).
- Badges on the profile, computed from the history (also older matches): first win, 10 / 50 wins, 10 / 50 / 100 games, each kind of victory and all four, every nation, 10 wonders, 5 duels, season tiers Gold+, podium, champion. Plus the season's tier, the closed seasons and "wins with n of m nations".

**Implementation**
- `models/Season.js`, `models/SeasonResult.js`; `utils/seasons.js` (`ensure()` at startup and hourly, `close()`, `leaderboard()`, `profileOf()`); `utils/badges.js`; `routes/seasons.js` (`GET /api/seasons/leaderboard`); `routes/profile.js` adds season and badges. Account deletion and Activity merges handle the results. `GET /api/leaderboard` is unchanged.
- `client/ranking.js` (new, via `inject.js`), the menu button and the link in the multiplayer menu (`mp.js`); `client/profile.js` shows tier, past seasons and badges (`window.HC_SEASONS`). Texts in `client/i18n.js`.

**Tests:** `tests/seasons/seasons.test.js`. `stats`, `i18n`, `loading`, `score/win-bonus`, `account/pages` pass.

**Status:** ✅ on `development`

## F21 Weekly challenge

**Goal:** A shared goal for everyone each week, also for players who have no opponent at hand.

**Decisions**
- A week is an ISO week (Monday 00:00 UTC). Its setup comes from a hash of the week's id, the same for everybody and without storage: original or large map, nation and ability, four empires (three KI with the base ability at one of the two hardest levels), events (on/off, easy/hard), wonders, and a fixed seed.
- Played as a Rundenspiel alone against the KI (own pace, the normal 7 days per turn), as often as a player likes, one attempt at a time: starting another (also of another week) resigns the running one, after asking. It can't be left or cancelled; resigning or a KI takeover counts as a loss. Not ranked; it counts as a game in the history.
- Leaderboard of the week: each player's best attempt; a victory first, then fewer rounds, then more points, then who finished first. Top 20, one's own result, how many still play.
- Past weeks (back to the oldest week anyone played; earlier weeks can't be viewed) can be picked and played again, but their leaderboard is closed: only attempts finished before the week's end count; later ones show as "best attempt, not ranked".
- *📅 Wochen-Challenge* in the multiplayer menu; the attempt is labelled in the Rundenspiele list.

**Implementation**
- `utils/challenge.js` (`weekOf`, `boundsOf`, `setupOf`, `info`, `start`, `recordResult`, `migrate` drops the old one-attempt unique index), `models/ChallengeResult.js` (`challenge_results`, one row per attempt), `routes/challenge.js` (`/api/challenge`). `async/logic.js`: `opts.challenge` lets one human play and fills the KI seats at once; leaving and cancelling are refused. `async/service.js`: `create(user, body, internal)` – only the server sets the challenge; `processResult` records it. Account deletion and Activity merges handle the rows.
- `client/challenge.js` (via `inject.js`), the button in the multiplayer menu and the label in `ASYNC.row` (`mp.js`). Texts in `client/i18n.js`.

**Tests:** `tests/challenge/challenge.test.js`. `resign`, `nextgame`, `bots`, `summary`, `i18n` pass.

**Status:** ✅ on `development`

## F22 Team mode

**Goal:** Play together against others, e.g. 2 against 2.

**Planned:** the host splits the empires into teams in the lobby; a team wins together, and teammates have a team chat. The details depend on what the engine allows without changing the game files (alliances, victory check).

**Status:** built (PRs #90, #91), then removed before it reached `main`: it does not fit the game for now. It may come back; the code is in the history of `development` (commits 56152c0 and 7bf2a65).

---

## F23 Personal statistics

**Goal:** the overall statistics (F13), but only over one's own matches: win rate per nation, ability and turn position, how one wins, which techs one wins with.

**Built:**
- `utils/facts.js` `markAccounts(f, participants)`: the account of each seat (`uid`), added in memory when the facts are read – the stored facts stay anonymous. Matched by nation and ability: first the players who played to the end (human seats), then seats the KI took over or that were resigned (`replacedUserId`; they count as the player's).
- `utils/gamestats.js` `aggregate(rows, { user })`: only that account's matches and seats, whatever `seats` says; the victory types count its wins; `query.seats` is `'user'`.
- `routes/stats.js`: `GET /api/stats/player/:userId` (public like the profile, 404 for an id that is no account id).
- `client/gamestats.js` `render(el, { user })`: no seat filter, a win-rate tile, "Siege nach Siegart", "Am Spielende" and the tech columns as won against lost. `client/account.html`/`account.js`: tab *Meine Statistiken* (`#stats`). `client/profile.js`: *📊 Statistiken* in every profile, drawn when opened.

**Tests:** `tests/stats/overall.test.js` part 6: markAccounts (a nation twice, a taken-over seat), the aggregation per account, the endpoint (also with a Rundenspiel seat the KI took over), the account tab and the profile.

**Status:** ✅ on `development`.

---

## F24 Replay link to a turn

**Goal:** share a moment of a game.

**Built:** `/?replay=<id>&turn=<n>` opens the replay at turn n (1-based, as the timeline counts; out of range → the first or the last turn, the end screen). The timeline has *🔗 Dieser Zug*: the share sheet on phones, the clipboard elsewhere (`client/replay.js` `link()`, `shareTurn()`). A match of an older version keeps the turn when it moves to `/vNN/`. `mp.js` passes `turn` to `REPLAY.open`.

**Tests:** `tests/replay/replay.test.js`: a link opens the 4th turn, *🔗 Dieser Zug* copies the link to the shown turn, a turn past the end opens the end screen.

**Status:** ✅ on `development`.

---

## F25 Lobby presets

**Goal:** start the usual game in one click.

**Built:**
- `users.lobbyPresets` (JSONB), `utils/presets.js` (cleaning: known keys and values only, names trimmed and unique, at most 10), `GET/PUT /api/account/presets` (routes/account.js).
- `client/presets.js` (injected after `mp.js`): the row *📋 Vorlagen* above the settings of a live lobby (host, logged in) and of *Neues Rundenspiel*: pick a preset to load it, *💾 Als Vorlage* saves under a name (the loaded one is suggested; the same name updates it), 🗑 deletes. One preset serves both kinds: the map (*Plättchenkarte* is `random` in the lobby, `plaettchen` in the form), and the live time per turn and the Rundenspiel days are kept side by side. Loading in a lobby sends one `lobby:config` (numbers within what the map allows, as `updateLobbyConfig`); the server checks it as always. A custom map is kept by its name; if it is no longer in *Meine Karten*, the map stays.

**Tests:** `tests/presets/presets.test.js`: the API (login, cleaning, limit), a live lobby (save, change, load), the Rundenspiel form (load, save keeps the live time, delete), no row for guests.

**Status:** ✅ on `development`.

---

## F26 Challenge: compare with the best attempt

**Goal:** see where one fell behind in the weekly challenge.

**Built:**
- `utils/challenge.js` `compare(user, week, gameId)`, `GET /api/challenge/compare`: the attempt (or one's best of the week) and the week's best, each with the challenger's values per round from the match statistics (utils/stats.js; the attempt's one human seat). Public like the leaderboard; an attempt that is not one of the week's is refused.
- `client/challenge.js`: *📈 Mit der Bestleistung vergleichen* below one's result (not when one holds the best), 📈 on every leaderboard row but the first, and on the end screen of an attempt (`addToEndScreen`, called from the `gameOver` hook in `mp.js`, shown below the result). The view: both results, notes where the gap grew (level until round n, the round that lost the most points, the largest gap) and one chart with two lines in their own colours and shapes – `STATS.render` (client/stats.js) with two "players" and `noMoments`, so every value of the post-game statistics can be picked.

**Tests:** `tests/challenge/compare.test.js`: the API (best, a given attempt, the best against itself, refused, public), the dialog (results, notes, chart, another value), the leaderboard button, the end screen. `tests/challenge/challenge.test.js` still passes.

**Status:** ✅ on `development`.

---

## F27 Pause a live game, or continue it as a Rundenspiel

**Goal:** a live game is not lost when players have to leave.

**Built:**
- **Pause** (`sockets/game.js` `game:pause`, host only): `session.paused = { by, at }`; moves are refused; the turn clock keeps the time left (`turnClock.left`) and gets it back on resume; a turn that begins while paused waits with its full time. `game:paused` to everyone, `paused` in `state:update` / `game:start` (reconnects, spectators). A KI turn under way still finishes. The session still ends after 2 hours without activity.
- **Continue as a Rundenspiel** (`game:toAsync` { turnDays }, host with an account, not during a KI turn): `async/service.js` `fromLive` builds the Rundenspiel from the session – the state (copied), `stats`, the last 200 chat messages, the replay frames (as `replay_frames` rows), the config (`fromLive`: the join code; not public). Seats: accounts (also player-bots, also seats the KI held after missed turns) play on; players who resigned stay replaced (lost game, ranked penalty); **guests' empires go to the KI** (*mittel*, ranked *schwer*); KI seats stay KI. Then it settles like any Rundenspiel move (the KI moves if it is its turn, the player on turn is notified); the other players get an e-mail/push. The live session is marked `converted` (no match record, no MMR there) and removed.
- `client/pause.js` (injected after `mp.js`): host buttons in the game menu (*⏸ Pause* / *▶ Fortsetzen*, *📨 Als Rundenspiel fortsetzen* with the time per turn and the guests named), the banner, the frozen clock (*⏸ m:ss*, `mp.js` `setTurnClock`), `MP.isMyTurn()` false while paused. On `game:toAsync` players with an account open `/?async=<id>`; guests, resigned players and spectators are told.

**Tests:** `tests/pause/pause.test.js`: only the host, the menu, the banner for everyone, moves refused, the clock standing still, resume; the move to a Rundenspiel (dialog, A and B land in it, the guest is told, round, seats, statistics, replay frames, chat, who it waits for, a move there, the live game gone). `tests/resign` and `tests/timer` still pass.

**Status:** ✅ on `development`.

---

## F28 Single-player games in the statistics

**Goal:** single-player games – in the browser and offline in the Android app – are recorded for the statistics, like the multiplayer matches.

**Decided (2026-11-10):**
- Only games of logged-in accounts are recorded. Offline games in the app wait on the device until it is online and logged in.
- They are their own kind of match: the overall statistics get a filter *Herkunft*: *Alle* (default), *Online*, *Einzelspiel*. It works with every other filter, e.g. *Nur Menschen* + *Einzelspiel*. So single-player games can be left out of every view.
- The personal statistics (F23) and the match history show them too, with the same filter.
- No MMR. Single-player games get their own badges (e.g. first win, 10 and 50 wins, a win against the hardest KI, every kind of victory), apart from the multiplayer badges.

**Planned:**
- The game runs on the player's device, so the server can't check the moves; it only checks that the result is plausible (a known game version, a finished state the engine accepts, sane numbers) and takes each game once (a game id from the device).
- **Browser:** a small recorder (`client/solo.js`, loaded with the game page) follows a single-player game while it is played: the round in which each empire got each technology, the start player, the numbers per round for the post-game chart. When the game ends it sends that with the final state to `POST /api/solo/games` (logged in), or keeps it in the browser until it can. A whole replay is not stored (too big for the browser's storage).
- **Server:** facts from the final state and the recorded tech rounds (the same shape as `utils/facts.js`), stored as a match marked `solo`. The facts get `src`/kind *solo*, `utils/gamestats.js` the new filter, `utils/badges.js` the single-player badges.
- **Android app (HochCiv-Android):** the offline copy gets the same recorder, which keeps finished games in the offline storage. When the app goes online, the native bridge moves them to the online page, which uploads them if the player is logged in. This needs a new app release.
- Hotseat games (several people on one device) count in the overall statistics as human seats, but in no account's personal statistics or badges, as the device can't tell who played which empire.

**Built (server and browser):**
- `client/solo.js` (injected after `mp.js`; works without it too, for the app's offline copy): follows `saveGame()` (every redraw) and `gameOver()`. A game seen from round 1 gets an id; per state player the round each technology first appeared, a point per round (score, cities, population, techs, armies, wonders, out). At the end: queued with the final state, compact (no map tiles, no log) – `hochciv.solo.cur` / `hochciv.solo.queue` (at most 30). Sent when logged in (now, or after a later login via `MP.fetchUser`); kept on network errors, a 401 and 5xx; dropped once stored, a duplicate or refused. Not recorded: games first seen in a later round (saved before this existed), the guided first game (`S.fg`), multiplayer games. For the app: `SOLO.pending()`, `SOLO.importQueue(items)`, `SOLO.delivered(cids)`, and `window.__hochciv.soloDelivered(cids)` after sending.
- `routes/solo.js` `POST /api/solo/games` (login, no bots, 120 an hour, bodies up to 2 MB – `server.js` lets only this path past the 20 KB limit), `utils/solo.js`: the check (a known version – current or kept –, players, kinds, winners, cities, armies, wonders, tech rounds within the game, the chart's numbers, the engine of that version scores every empire) and the match: participants `solo: true, soloId`, the account on the one human seat (hotseat: none), points and score as usual, the chart (`stats`), facts from the final state with the recorded tech rounds (`src: 'solo'`). Stored once per `cid`.
- Statistics: `utils/gamestats.js` marks the rows `solo`; filter `origin` = `all` | `online` | `solo` (`GET /api/stats`, `/api/stats/player/:id`, admin) and *Herkunft* in `client/gamestats.js`; the admin note counts them. "Neu berechnen" leaves single-player games alone (their upload isn't kept).
- Profile (`routes/profile.js`, `client/profile.js`): the tiles count multiplayer games (`played`, `wins`), single-player games apart (`solo: { games, wins }`, "Einzelspiele: n, davon m gewonnen"); the list shows *Einzelspiel*. Badges (`utils/badges.js`): single-player games don't count for the multiplayer ones; their own `solo_first_win`, `solo_wins_10`, `solo_wins_50`, `solo_hardest`, `solo_all_victories`. Seasons count ranked games only, so nothing changes there.
- Privacy policy: a paragraph on single-player games.

**Tests:** `tests/solo/solo.test.js`: the recorder with a real game (from round 1, tech rounds, points, compact state, queued once), waiting without a login and sent after it, the stored match (seat, facts, chart), what is not recorded; the API (login, duplicates, refused uploads, hotseat); *Herkunft* in the overall and personal statistics, the profile (tiles, numbers, list, badge). `tests/stats/overall.test.js`, `tests/seasons`, `tests/account/pages.test.js` still pass.

**Still open:** the Android app (HochCiv-Android): the offline copy gets `client/solo.js`; its bridge hands the offline queue to the native side, which gives it to the online page (`SOLO.importQueue`) and drops what was delivered.

**Status:** 🔨 server and browser on `development`; the app part follows.
