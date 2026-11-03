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
* **Resign:** a player who resigns (live game or Rundenspiel) is out of the MMR calculation; the KI plays the seat. In ranked games it costs the same **15 MMR**, and it always counts as a played game.

## Seasons and tiers

`utils/seasons.js`. A season is a calendar quarter (`2026-Q4`, in UTC). The first season the server saw began without a reset. When a quarter ends (checked at startup and every hour):

1. every account with ranked games in the season gets its final standing (`season_results`): MMR, rank among humans or among bots, tier, ranked games and wins of the season;
2. every MMR moves halfway back to 1000: `1000 + (MMR − 1000) / 2`, rounded (1400 → 1200, 800 → 900).

| Tier | MMR |
|---|---|
| 💎 Diamant | ≥ 1400 |
| 🔷 Platin | ≥ 1250 |
| 🥇 Gold | ≥ 1100 |
| 🥈 Silber | ≥ 950 |
| 🥉 Bronze | below |

A tier needs **5 ranked games in the season**; before that an account is *unplaced*. A ranked game is a seat with an MMR change in the match record.

## Badges

`utils/badges.js`, computed from the match history and the closed seasons when a profile is opened (nothing stored): first win, 10 / 50 wins, 10 / 50 / 100 games, each kind of victory and all four, a win with every nation, 10 wonders, 5 duels won, a season finished in Gold / Platin / Diamant, on the podium or first.

## Where it shows

* Leaderboard: `GET /api/leaderboard` (top 100 humans); bot accounts have their own, `GET /api/leaderboard?type=bot`. Both share the same MMR – games against bots count as usual ([Bot accounts](bot-accounts.md)).
* Player profile and match history: MMR change per match.
* Admins can set an account's MMR (*User* tab).
