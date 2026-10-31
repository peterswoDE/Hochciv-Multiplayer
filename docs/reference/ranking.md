[← Documentation](../README.md)

# Points and MMR

## Points at the end of a game

`utils/score.js`: the engine's `victoryScore` (population + wonders + technologies) plus a fixed **winner bonus of 10** (`WIN_BONUS`). These points go into the match history and into the MMR calculation. `mp.js` shows the same number on the end screen (`MP.WIN_BONUS` – keep both in step). The game's own tiebreak between several victory claims is not affected; that stays inside the engine.

## Which games are ranked

* The host ticks *ranked* in the lobby (only possible when logged in) or in the Rundenspiel settings, or the game comes from [matchmaking](../overview/features.md#ranking) (always ranked).
* KI seats play at the hardest level.
* A live game in which one account held several seats is not rated.
* A Rundenspiel that ends up with fewer than two humans (setup timeout) is no longer ranked.

Only ranked games change MMR. Every finished game (ranked or not) counts for `gamesPlayed` of each account in it and appears in the match history.

## MMR formula

`utils/mmr.js`, a multi-player Elo that also weighs the point difference. Everybody starts at **1000**.

Every pair of seats (A, B) is compared. KI seats and guests take part at a baseline of 1000 MMR, but only accounts have their MMR changed.

* Expected result: `E_A = 1 / (1 + 10^((MMR_B − MMR_A) / 400))` (standard Elo).
* Actual result: the winner beats everyone (1 : 0); between two non-winners the one with more points wins, equal points are a draw (0.5 : 0.5).
* K factor: `K = (16 + 2·√|points_A − points_B|) · 2 / N`, with N = number of seats. A big point gap moves more MMR; the `2 / N` keeps a four-player game from moving more than a two-player game.
* Change: `K · (S_A − E_A)`, summed over all pairs and rounded. MMR never goes below 0.

## Penalties

* **Rundenspiel takeover:** a player whose ranked Rundenspiel seat is taken over by the KI after 7 days of inactivity loses an extra **15 MMR** ([Rundenspiele](rundenspiele.md)).

## Where it shows

* Leaderboard: `GET /api/leaderboard` (top 100 humans); bot accounts have their own, `GET /api/leaderboard?type=bot`. Both share the same MMR – games against bots count as usual ([Bot accounts](bot-accounts.md)).
* Player profile and match history: MMR change per match.
* Admins can set an account's MMR (*User* tab).
