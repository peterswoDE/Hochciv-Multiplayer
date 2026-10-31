[← Documentation](../README.md)

# Features

What the multiplayer server adds to the single-player game. The roadmap with the status of each feature (F1–F12) is in [TASKS.md](../../TASKS.md).

## Playing together

* **Live multiplayer:** Lobbies with a 6-character join code and a 6-digit password, public lobby list, 2 to 8 empires – as many as the map allows (fixed maps and the standard Marathon 4, the tile map 8, custom maps as many as they have start points). The host sets the number of empires and how many of them the KI plays; free human seats are filled with the KI at the start. Further settings: map (including custom maps and their codes), random nations for everyone, KI level, events, wonders and ranked mode.
* **Server-side rules:** Every move is checked and applied by the real Hochciv engine on the server; clients only display the state. See [How it works](how-it-works.md).
* **Rundenspiele (asynchronous games):** Play turn by turn over days, with e-mail and push notifications when it is your turn. Same choices as live games: 2–8 empires, how many of them KI (none: the game waits for everybody), random nations for everyone, custom maps. Rules for inactive players: [Rundenspiele](../reference/rundenspiele.md).
* **Discord Activity:** Play inside Discord voice channels and DMs. Everyone in the call lands in the same lobby automatically. Setup: [Discord Activity](../operations/discord-activity.md).
* **Reconnects:** Players who lose their connection or reload the page are put back into their seat.
* **Rematch (live games):** On the end screen the host can start a *Revanche*. Everyone still connected goes back to the same lobby (same code and settings, everyone's own choice of nation) and can start the next game from there.
* **Turn timer (live games):** The host sets the time per turn: no limit (default), or 1, 2, 3, 5 or 10 minutes. A countdown runs in the HUD. When the time is up, the KI finishes the turn. After three missed turns in a row, the KI keeps playing the seat until the player clicks *Ich bin zurück*.
* **Spectator mode:** *Zuschauen* with code and password, or from the public list, which also shows running public games. Spectators see the board, the log and the chat, but can't act or write; the player list shows how many are watching (up to 20). In the Discord Activity, whoever joins a running game or a full lobby watches. Public Rundenspiele can be watched from the Rundenspiele list.

## Ranking

* **Ranked games and MMR:** Ranked games change every account's MMR by placement and point difference. Details: [Points and MMR](../reference/ranking.md).
* **Ranked matchmaking:** *🔥 Gewertetes Spiel suchen* in the multiplayer menu (logged in) puts a player in a queue that pairs players by MMR (±100, growing by 50 every 15 seconds). Four players who fit start at once; two or three once the one waiting longest has waited 20 seconds. Everyone confirms within 20 seconds, then the server creates the lobby and starts a ranked game: original map, random nations, 3 minutes per turn, free seats up to four empires played by the KI at its hardest level. Whoever doesn't confirm leaves the queue; the others keep their place.
* **Player profiles:** Click a player name anywhere (end screen, history, player list) to see their MMR, games played, wins and match list.

## During and after a game

* **In-game chat:** In live games and Rundenspiele: text messages, quick emotes and map pings (📍, then tap a hex, and it pulses on every screen). A Rundenspiel keeps its last 200 messages with the game and shows unread messages when it is opened again. Texts need an account; guests can send emotes and pings. The server limits each sender to 5 messages in 10 seconds.
* **Chat moderation:** Tapping another player's message lets you report it to the admins (with the game's chat history, reviewed in the account tab *Meldungen*), block the player (accounts only, kept with your account, listed under the chat and on the account page) or mute a guest for the running game. A word filter (`obscenity` plus German lists and the admins' own words) stops texts with bad language: they are not sent but reported, and the sender can't write texts for 5 minutes – after a second time, for the rest of the game.
* **"Since your last turn":** When a player's turn begins, a pop-up shows what happened since their previous turn: cities taken or gained, empires out, wonders built, every empire's score, cities, techs and armies with their changes, and all events from the log. The game's own turn-start dialogs follow when it closes. It can be reopened from the HUD (📋) or switched off. In Rundenspiele the "your turn" e-mail and push message carry a short version.
* **What the others did, played on the map:** KI turns, the other players' actions and every battle are played on the map with the game's own animations (setting *Animationen*: Langsam / Schnell / Keine), before the new state is shown. In Rundenspiele, opening the game in one's turn plays everything since one's last turn. A tap on the map skips it.
* **Post-game statistics:** The end screen of live games and Rundenspiele has *📊 Statistik*: a chart over the rounds with a choice of values – points, cities, population, techs, armies, wonders, and science, food and coins per round and in stock (lines in the nation colours with their own marker shapes, legend, end labels and a crosshair tooltip) –, key moments (wonders, conquered cities, empires out, a new leader, the biggest jump) and the numbers as a table. The statistics are stored with the match (`GET /api/games/:id`); the player profile and the match history on the account page show the chart for any match opened there. Older matches get the income and stock values from their replay.
* **Overall statistics:** *Statistiken* in the main menu shows numbers over all finished matches: win rate per nation, per ability and per turn position (by number of empires), how games are won, what winners have at the end compared with everyone else (cities, population, techs, wonders, armies, points), how many cities winners have, every technology (how often winners and others had it, the win rate with it, the round in which winners researched it) and the wonders. Filters: humans only (default) or all seats, number of empires, game type, version. Admins get the same in the account tab *Statistiken*, plus matches per version, KI and bot win rates by level, a raw-data export and "recompute". The data per match is computed from its replay, so older matches are included as well.
* **Replays:** Every finished live game and Rundenspiel can be watched again turn by turn: *▶ Wiederholung ansehen* on the end screen and in the player profile, or the link `/?replay=<match id>`. A timeline steps through turns and rounds or plays them, and older matches open in the game version they were played with. The game states after every turn are stored compressed (about 15 KB per game) and deleted after 180 days (`REPLAY_KEEP_DAYS`).

## Maps

* **Custom maps:** Maps from the game's map editor ("Meine Karten") are kept in the player's account and synced to every device they log in on. A map can be published with a 6-character code; anybody can load it by that code (also without an account) and use it locally or as the map of a lobby. Every map is checked with the engine's `checkCustomMap` before it is saved or played.

## Accounts

* **Accounts:** Registration with e-mail activation, password reset, Google and Discord login, two-factor authentication (authenticator app, passkeys, e-mail code), MMR ranking and match history. Players can change e-mail and password, link and unlink Google/Discord, and delete their account.
* **Bot accounts:** Accounts for programs that play like players (e.g. an AI client). Bot creators (a role admins grant) and admins create them on the account page; a bot logs in with a token. Hosts allow player-bots in their lobbies and Rundenspiele (off by default, with an optional limit); in matchmaking, players opt in. Bots share the MMR but have their own leaderboard. See [Bot accounts](../reference/bot-accounts.md).
* **Guests:** Everybody can play live games without an account. Matchmaking, MMR, Rundenspiele, custom maps in the account and chat texts need one.
* **Discord Activity accounts:** Players inside Discord get an account automatically; linking that Discord account to a real account later merges the two (history, Rundenspiele, MMR).

## Apps and devices

* **Phones and tablets:** The [mobile layer](../development/mobile-layer.md) makes every screen usable on small touch screens, without changing the game files.
* **Android app:** Wraps the website, logs in natively with Google ([login providers](../operations/login-providers.md)) and receives [push notifications](../operations/push-notifications.md).
* **Two languages:** Everything the server adds follows the game's 🇩🇪/🇬🇧 buttons ([Languages](../development/languages.md)).

## Administration

* **Admin panel:** Server status, maintenance mode, registration switch, lobby and user management, running games with their version, past games, chat reports and word filter, OAuth configuration. See [Administration](../operations/administration.md).
