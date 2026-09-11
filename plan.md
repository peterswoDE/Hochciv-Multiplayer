# Complete Plan: MMR & Account System Integration

## Overview
This plan details the implementation of an account framework and a custom Point-Differential MMR (Matchmaking Rating) system with persistent PostgreSQL storage for the Hochciv multiplayer server.

## 1. Database Infrastructure Requirements
- **Docker Integration**: Add a `postgres` service using the `postgres:15-alpine` image to your `docker-compose.local.yml`. Map the internal database directory to a persistent standard Docker volume to ensure data is not lost on reboot. Provide the Node.js backend with a `DATABASE_URL` environment variable.
- **ORM Integration**: Initialize `Sequelize` (a full-featured NodeJS ORM) connecting through the `pg` library to automate database migrations and query execution for zero-hassle tables handling.

## 2. Table Definitions (Sequelize Models)
- **User Record (`models/User.js`)**
  - `id` (Primary Key, UUID)
  - `username` (Unique string)
  - `email` (Unique string)
  - `password_hash` (Encrypted string via `bcryptjs`)
  - `mmr` (Integer, default 1000 base metric)
  - `gamesPlayed` (Integer, default 0)

- **Game Record (`models/Game.js`)**
  - `id` (Primary Key, UUID)
  - `version` (String, pulled dynamically from `APP_VERSION` natively inside the engine sandbox)
  - `durationRounds` (Integer, the turn count of the match)
  - `matchDate` (Timestamp of completion)
  - `winnerUsername` (String, Foreign Key mapping optional)
  - `participants` (JSON array: stores individual scores, civs picked, points gained, and the MMR shift calculated for that specific match)

## 3. Account System Integration
- **Libraries Used**: `passport`, `passport-local`, and `bcryptjs` will handle modern authentication. `express-session` combined with `connect-pg-simple` will securely store active session cookies inside the PostgreSQL database.
- **Anonymous Sessions**: Players can still play without registering. However, the 'Ranked Match' feature is completely blocked/disabled for lobbies containing anonymous guests.
- **Rules provided by User**: 
  - Login requires Username + Password. Registration requires Username + Password + Email.
  - Sessions will expire after exactly 30 days of inactivity.
- **Routes Exposed**:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- **Frontend Changes (`mp.js`)**: Add intuitive UI inputs for Registration and Login built directly into the lobby modal interface.

## 4. Custom Point-Weighted MMR Algorithm
- Standard TrueSkill merely maps placements (1st, 2nd, 3rd) and ignores the actual point disparity/score gap at the end of the match. Therefore, to satisfy the requirement that "point-differences matter", we will deploy a specially formulated multi-way Elo in `utils/mmr.js`.
- Everybody starts natively at **1000 MMR**.
- Upon `game:over`: The score difference between 1st place and other ranks will dynamically shift the K-factor. (e.g., losing by 5 points costs less MMR than getting completely wiped out by 100 points).
- **Ranked Lobby Requirements**: 
  - The Host will see a checkbox labeled "Ranked Match". 
  - Ranked Games need a minimum of 2 Human Players.
  - Bots can be added to Ranked matches, but the game difficulty MUST be locked to the highest difficulty.
  - If any human player is anonymous (guest without an account), Ranked Mode cannot be enabled.
- Only if "Ranked Match" is checked and requirements are met will the match recalculate Elo and persist to the Database!

## 5. Capturing Game History & Leaderboards
- **Version Tracking**: Open `engine-adapter.js` and securely scrape the `APP_VERSION` directly from the engine memory scope so it naturally synchronizes with the `js/data.js` frontend label.
- **Intercept the End Game Hook**: When `sockets/game.js` issues a `game:over` emission, silently compile the match stats, calculate the MMR transitions using our util function in memory, apply the rating update, and push the record to the `Games` table via Sequelize.
- **Leaderboard API**: Expose `GET /api/leaderboard` which sorts the `User` table descending by `mmr` and surfaces Games Played and Average Points/Winrate!
