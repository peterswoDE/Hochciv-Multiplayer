# Hochciv Multiplayer Server

Authoritative multiplayer backend for **Hochciv**, built with Node.js, Express, Socket.IO and PostgreSQL. It serves the game, runs lobbies and live games with the real game rules on the server, and handles accounts, rankings and turn-based "Rundenspiele".

**📖 Full documentation: [docs/](docs/README.md)**

## Features

* **Live multiplayer** for 2–8 empires: lobbies with join code and password, public list, KI seats, custom maps, turn timer, rematch, reconnects, spectators.
* **Rundenspiele:** asynchronous games over days, with e-mail and push notifications and a KI takeover for inactive players.
* **Server-side rules:** every move is checked and applied by the real Hochciv engine on the server.
* **Ranking:** ranked games, MMR, matchmaking, player profiles, match history.
* **After the game:** statistics over the rounds, replays, "since your last turn" summaries.
* **Chat** with emotes, map pings, reports, blocks and a word filter.
* **Accounts:** e-mail registration, Google and Discord login, authenticator apps, passkeys, e-mail codes.
* **Discord Activity**, an **Android app**, a **mobile layer** for phones, and German/English for everything.
* **Admin panel** for server status, users, lobbies, running games, reports and OAuth.

Details: [Features](docs/overview/features.md) · roadmap: [TASKS.md](TASKS.md)

## Quick start

**Production** (pre-built image behind a reverse proxy):

```bash
docker network create nginx
cp .env.template .env          # set at least SESSION_SECRET and BASE_URL
docker compose up -d
docker exec hochciv-multiplayer node elevate.js <your-username> superadmin
```

→ [Deployment](docs/operations/deployment.md) · [Configuration](docs/operations/configuration.md)

**Local development:**

```bash
docker compose -f docker-compose.local.yml up -d --build
# game at http://localhost:3000
```

→ [Local setup](docs/development/local-setup.md) · [Testing](docs/development/testing.md)

## Documentation

| | |
|---|---|
| **Overview** | [Features](docs/overview/features.md) · [How it works](docs/overview/how-it-works.md) |
| **Bots** | [Writing your own bot](docs/bots/writing-a-bot.md) · [Bot accounts](docs/reference/bot-accounts.md) |
| **Running a server** | [Deployment](docs/operations/deployment.md) · [Configuration](docs/operations/configuration.md) · [Staging](docs/operations/staging.md) · [Google/Discord login](docs/operations/login-providers.md) · [Discord Activity](docs/operations/discord-activity.md) · [Push notifications](docs/operations/push-notifications.md) · [Administration](docs/operations/administration.md) · [Troubleshooting](docs/operations/troubleshooting.md) |
| **Development** | [Local setup](docs/development/local-setup.md) · [Branches and release flow](docs/development/release-flow.md) · [Updating the game](docs/development/updating-the-game.md) · [Testing](docs/development/testing.md) · [Languages](docs/development/languages.md) · [Mobile layer](docs/development/mobile-layer.md) |
| **Reference** | [Architecture](docs/reference/architecture.md) · [REST API](docs/reference/rest-api.md) · [Socket.IO events](docs/reference/socket-events.md) · [Database](docs/reference/database.md) · [Rundenspiele](docs/reference/rundenspiele.md) · [Points and MMR](docs/reference/ranking.md) · [Security](docs/reference/security.md) |

## Release flow in short

```
feature/… or fix/…  ──PR──▶  development  ──▶  staging  ──PR──▶  main  ──▶  production
```

Branch from `origin/development`, PR into `development` (auto-deployed to staging), test there, then PR `development` → `main`. Hotfixes: `hotfix/…` → `main`, then merge `main` back. → [Branches and release flow](docs/development/release-flow.md)

## The game

`HochCiv/` is [timooom-hash/Hochciv](https://github.com/timooom-hash/Hochciv) with the multiplayer extension; older versions in `HochCiv-v96/`, `HochCiv-v93/`, `HochCiv-v83/` keep running Rundenspiele on their rules. → [How it works](docs/overview/how-it-works.md) · [Updating the game](docs/development/updating-the-game.md)
