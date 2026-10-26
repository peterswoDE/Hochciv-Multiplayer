# Tasks: multiplayer experience

The features that were approved to improve the multiplayer experience, and how far each one is. **This file reflects the `development` branch.** Every feature PR updates its section here (status, what was built, tests), next to the feature list in README.md.

Process (see Base-assumtions.md): one branch per feature from `origin/development`, PR into `development` (staging), tested locally with `docker-compose.local.yml` first. The game in `HochCiv/` is never changed. Everything goes through `mp.js` and the server.

Status: ⬜ planned · 🔨 in progress · ✅ on `development` (staging) · 🚀 in production (`main`)

| Order | # | Feature | Live games | Rundenspiele | Status |
|---|---|---|---|---|---|
| 1 | F2 | [Turn timer](#f2-turn-timer) | ✔ | – (7-day rule stays) | ⬜ |
| 2 | F3 | [Rematch](#f3-rematch) | ✔ | – | ⬜ |
| 3 | F1 | [Chat, emotes, map pings](#f1-chat-emotes-and-map-pings) | ✔ | ✔ | ⬜ |
| 4 | F4 | [Spectator mode](#f4-spectator-mode) | ✔ | ✔ (public games) | ⬜ |
| 5 | F6 | [Post-game statistics](#f6-post-game-statistics) | ✔ | ✔ | ⬜ |
| 6 | F7 | [Replays](#f7-replays) | ✔ | ✔ | ⬜ |
| 7 | F5 | ["Since your last turn" summary](#f5-since-your-last-turn-summary) | ✔ | ✔ (+ e-mail / push) | ⬜ |
| 8 | F9 | [Ranked matchmaking](#f9-ranked-matchmaking) | ✔ | – | ⬜ |
| later | F8 | [Friends list](#f8-friends-list) | | | later |
| later | F10 | [Seasons, leaderboard, badges](#f10-seasons-leaderboard-and-badges) | | | later |

The numbers are those of the original proposal. The order puts the small fixes for live games first. F6 and F7 come before F5 because they record per-turn data that F5 can reuse.

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

**Status:** ⬜ planned

## F3 Rematch

**Goal:** Play again with the same group without building a new lobby.

**Decisions**
- Live games only.
- At the end of a game the host gets a *Rematch* button. The session goes back to the lobby: the same code, password and settings, a new seed, the connected humans in their seats, the KI seats removed (they are refilled at the start). Everyone's screen goes back to the lobby.
- Players who have left are not in the new lobby. The Discord Activity keeps its instance in the same lobby.

**Status:** ⬜ planned

## F1 Chat, emotes and map pings

**Goal:** Talk to each other inside a game, also over the days of a Rundenspiel.

**Decisions**
- A chat panel next to the game log, collapsible like it. Text (up to 300 characters), a row of quick emotes, and map pings: *ping*, then tap a hex, and a marker pulses there on every screen for a few seconds.
- Live games keep the last 100 messages in memory (shown again after a reconnect). Rundenspiele store the last 200 messages with the game.
- Moderation: a server-side rate limit (5 messages in 10 seconds), plain text only, and a local *mute* per player. Reporting is not part of this.
- No e-mail or push messages for chat.

**Status:** ⬜ planned

## F4 Spectator mode

**Goal:** Watch a game without a seat, for example people in a Discord call who aren't playing.

**Decisions**
- Live games: join with code and password as a spectator, or with *Zuschauen* in the public lobby list (running public games are listed there too). Up to 20 spectators per game.
- Discord Activity: whoever joins while the game is running (or the lobby is full) becomes a spectator instead of getting an error.
- Rundenspiele: public games can be watched from the list (read-only).
- Spectators see the whole board, the log and the chat. They can't act or write in the chat. The player list shows how many are watching.

**Status:** ⬜ planned

## F6 Post-game statistics

**Goal:** A game's story after it ends, not just the final points.

**Decisions**
- The server records, at the end of every round, the score of each empire (`victoryScore`) and a few counts: cities, population, techs and armies.
- The end screen gets a *Statistik* tab: a score chart over the rounds and the key moments (wonders, cities taken, empires eliminated, biggest jumps).
- The data is stored with the match (`games` table), so the match history on the account page can show it later as well.

**Status:** ⬜ planned

## F7 Replays

**Goal:** Watch a finished game again, turn by turn, and share it with a link.

**Decisions**
- The server keeps a snapshot of the state after every turn, compressed (Brotli, about 15 KB for a whole game) and stored with the match.
- Viewer: the game page in replay mode (`?replay=<id>`) with a timeline: back, play/pause, forward and a slider. It opens in the game version the match was played with (`/v88/` etc. for older ones).
- *Replay* links in the match history and on the end screen. Anyone with the link can watch.
- Retention: replays are deleted after 180 days.

**Status:** ⬜ planned

## F5 "Since your last turn" summary

**Goal:** When it is your turn again, see at a glance what the others did.

**Decisions**
- When a turn begins, a pop-up lists the changes since the player's previous turn: attacks on them and cities lost, wonders built, techs and cities of the others, and the score change of every empire. It can be closed and opened again from the HUD.
- Rundenspiele: the "your turn" e-mail and push message contain a short version.
- The server remembers, for each seat, the point of its last turn (log position and counts). The pop-up compares that point with the current state.

**Status:** ⬜ planned

## F9 Ranked matchmaking

**Goal:** Find a ranked game without a group or join codes.

**Decisions**
- *Gewertetes Spiel suchen* in the multiplayer menu (logged in only). The queue pairs players by MMR. The allowed MMR gap starts at ±100 and grows over time.
- Match found: everyone confirms within 20 seconds, then the server creates the lobby and starts it. Settings: original map, random nations for everyone, KI on the hardest level, turn timer 3 minutes (F2).
- 2 to 4 humans per game. Free seats up to 4 empires are KI.
- Anyone who doesn't confirm leaves the queue. The others stay in it.

**Status:** ⬜ planned

---

## Later

Not started. These features need groundwork that doesn't exist yet.

### F8 Friends list
A friends list with online status and direct invitations to lobbies and Rundenspiele. Needs friends functionality (requests, accept, block) first.

### F10 Seasons, leaderboard and badges
Seasons with tiers and a soft MMR reset, a public leaderboard, and badges on the profile (wins with each nation, wonders built, …).
