[← Documentation](../README.md)

# Rundenspiele (asynchronous games)

A Rundenspiel is played turn by turn over days. Unlike live games it lives in the database (`async_games`) and survives restarts. The rules of the meta game (seats, invitations, pre-phases, timeouts) are in `async/logic.js`, persistence, notifications and the scheduler in `async/service.js`. All of it needs an account.

## Lifecycle

```
setup ──▶ placement (tile map) ──┐
   │  └─▶ draft (Marathon) ──────┼──▶ playing ──▶ finished
   │                             │
   └─────────────────────────────┘        (any phase) ──▶ cancelled
```

* **setup** – the host creates the game ([REST API](rest-api.md#rundenspiele--apiasync-login)) with map, number of empires, how many of them KI (or none), nation mode, events, wonders, KI level, ranked and public. Players join by invitation, join code or the public list.
* **Starting early** – when the seats are already final (nations dealt at random, or all four nations of a fixed map), the game starts right away: the host plays turn 1 while the others join. A turn of a seat nobody has claimed yet waits (`hold`) until someone takes it. Otherwise – and always without KI – the game starts once everybody is there.
* **placement / draft** – pre-phases of the tile map (everyone places a start tile) and of Marathon (ability draft).
* **playing** – one action at a time per game; the state is saved after every action and every KI turn, and everyone who has the game open gets the new view.
* **finished** – result, points and MMR are stored as a match (`games`), the turn states become a replay.
* **cancelled** – by the host, when not enough players joined (games without KI), or when the host's account is deleted during setup.

Leaving is free until your seat has had its first turn (or the pre-phase began).

## Seats

* **Nations:** random for everyone, or fixed (one seat per nation on fixed maps; any nation, also twice, on the tile map and custom maps – doubles get Roman numerals and their own colours).
* **KI seats** fill the empires beyond the number of humans, at the level the host chose (ranked: the hardest).
* **Without KI** the nations nobody took leave the game before it starts; two empires play as a duel (higher victory thresholds).
* Each game records the game version it started with (`engine`) and keeps it to the end – see [How it works](../overview/how-it-works.md#game-versions).

## Waiting, reminders and the KI takeover

The server checks every 10 minutes (`ASYNC_SWEEP_MS`) how long each game has been waiting (`waitSince`).

| After | What happens |
|---|---|
| 5 days (`ASYNC_REMINDER_MS`) | Reminder to whoever the game waits for |
| 7 days (`ASYNC_TIMEOUT_MS`) | The game resolves whatever it waits for (see below), and the affected players are told |

At the 7-day timeout:

| Phase | Resolution |
|---|---|
| setup, with KI | Plays with those who are there; the KI fills up. Fewer than two humans: not ranked any more. |
| setup, without KI | Plays with those who are there if the map allows that many empires, otherwise cancelled |
| placement | The KI places the missing start tiles and takes over those seats |
| draft | The KI picks for the player and takes over the seat |
| playing, unclaimed seat | The KI plays that nation; one human fewer |
| playing, a player's turn | The KI takes over the seat for the rest of the game (`replaced`) |

A seat taken over by the KI plays at level *mittel*, in ranked games *schwer*. In ranked games the player who was replaced loses **15 MMR** on top of the result ([Points and MMR](ranking.md)). Replaced players still see the game in their history (`replacedUserId`).

## Notifications

Through `utils/notify.js`, by e-mail and [push](../operations/push-notifications.md): invitation, your turn (with a short "since your last turn" summary), reminder, takeover, game finished. Players switch e-mail and push separately in the Rundenspiele list.

## Account deletion

A running game goes on without the deleted player: a seat that has not played yet is free again (the host's game in setup is cancelled), otherwise the KI plays it to the end without penalty. During placement and draft an account can't be deleted until the phase is over. Afterwards no seat, invitation or name points to the account any more – the name is replaced by *Gelöschter Spieler* in the state and the replay frames.

## Chat

The game keeps its last 200 chat messages; unread messages are shown when it is opened again. Blocks and reports work as in live games.
