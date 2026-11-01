# Documentation

Documentation of the Hochciv multiplayer server. Start with **[How it works](overview/how-it-works.md)** if you are new to the project.

## Overview

| Page | What's in it |
|---|---|
| [Features](overview/features.md) | Everything the server adds to the game, feature by feature |
| [How it works](overview/how-it-works.md) | How the game is shipped, patched and run on the server; game versions |

## Bots

| Page | What's in it |
|---|---|
| [Writing your own bot](bots/writing-a-bot.md) | Step by step: bot account and token, login, finding games, playing turns, a complete example |
| [Bot accounts](reference/bot-accounts.md) | The rules: owners, limits, bans, player-bots in lobbies, Rundenspiele and matchmaking |

## Running a server

| Page | What's in it |
|---|---|
| [Deployment (production)](operations/deployment.md) | Docker setup behind a reverse proxy, first superadmin, updating |
| [Configuration](operations/configuration.md) | Every environment variable, including the tuning and test variables |
| [Staging](operations/staging.md) | The semi-live test server next to production |
| [Google and Discord login](operations/login-providers.md) | OAuth setup, Android app login |
| [Discord Activity](operations/discord-activity.md) | Running the game inside Discord |
| [Push notifications](operations/push-notifications.md) | Firebase setup for the Android app |
| [Administration](operations/administration.md) | Admin panel tabs, roles, command-line tools |
| [Troubleshooting](operations/troubleshooting.md) | Startup errors and where to look |

## Development

| Page | What's in it |
|---|---|
| [Local setup](development/local-setup.md) | Docker and non-Docker development environment |
| [Branches and release flow](development/release-flow.md) | Feature branch → `development` (staging) → `main` (production) |
| [Updating the game](development/updating-the-game.md) | Bringing a new Hochciv version in, keeping or dropping old versions |
| [Testing](development/testing.md) | The game's tests and the server's test suite |
| [Languages](development/languages.md) | German/English texts of everything the server adds |
| [Mobile layer](development/mobile-layer.md) | `client/mobile/`: zoom, narrow-screen layout |

## Reference

| Page | What's in it |
|---|---|
| [Architecture](reference/architecture.md) | Map of the code: every folder and the important files |
| [REST API](reference/rest-api.md) | All HTTP endpoints with their access rules |
| [Socket.IO events](reference/socket-events.md) | Live games, Rundenspiele and matchmaking over WebSockets |
| [Database](reference/database.md) | Tables (Sequelize models) and what they hold |
| [Rundenspiele](reference/rundenspiele.md) | Lifecycle, timeouts, KI takeover of asynchronous games |
| [Points and MMR](reference/ranking.md) | End-of-game points, the MMR formula, penalties |
| [Bot accounts](reference/bot-accounts.md) | Accounts for programs, their owners and tokens; player-bots in lobbies, Rundenspiele and matchmaking |
| [Security](reference/security.md) | Origin check, second factor, rate limits, bans |

## Other documents

* [TASKS.md](../TASKS.md) – the feature roadmap (F1–F12) and the status of each feature.
* [Base-assumtions.md](../Base-assumtions.md) – working rules for this repository (also read by coding agents).
* [archive/mmr-account-plan.md](archive/mmr-account-plan.md) – the original plan for accounts and MMR (historical, superseded by the pages above).
