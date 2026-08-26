# Hochciv Multiplayer Server

This is the authoritative backend multiplayer server for **Hochciv**, built using Node.js, Express, and Socket.IO. It manages session lobbies, synchronizes game states in real-time across connected clients, and dynamically serves the game frontend.

## 🌟 Key Features

* **Real-Time Synchronization:** Uses Socket.IO for effortless, immediate propagation of game inputs, turns, and state changes.
* **Lobby Management:** Full lobby system allowing players to join via simple 4-letter passcodes. The host can configure game rules (Difficulty, Map Size, Events, Wonders) directly in the lobby.
* **Dynamic Frontend Pulling:** The server's Docker container automatically fetches the latest frontend game client from the core Hochciv repository on startup, injecting the multiplayer networking bindings (`mp.js`) directly into the HTML to ensure players are always playing on the latest version.
* **Smart Reconnection Flow:** Handles accidental disconnections, tab sleeping, or hard page refreshes by automatically identifying and dropping players back into their active game states.

## 🚀 Deployment (Production)

The production setup relies on pre-built images generated automatically via GitHub Actions, mapped securely to external networking (like Nginx Proxy Manager).

1. Ensure you have Docker and Docker Compose installed on your host.
2. In order for the container to start, you must create its required external networks first:
   ```bash
   docker network create nginx
   docker network create hoochciv-mp_default
   ```
3. Inside the folder containing your `docker-compose.yml`, start the container in detached mode. This directly pulls the latest built image `peterswode/hochciv-multiplayer:latest`:

```bash
docker compose up -d
```

The server will be reachable within the `nginx` internal network at port `3000`.

### Configuration (Environment Variables)

In the `docker-compose.yml`, you can customize the following variables:
- `PORT` (default: `3000`): The port the Node.js server listens on.
- `MAX_PLAYERS` (default: `4`): Maximum number of players allowed in a single lobby.
- `CORE_REPO_URL`: The Git URL from which it clones the original frontend Hochciv repository.
- `CORE_REPO_BRANCH`: The branch to clone for the frontend (e.g. `main`).
- `UPDATE_INTERVAL_SEC`: How often (in seconds) the container queries the frontend repo for updates.

Notes on resilience:
- The `entrypoint.sh` script now retries network/git operations with exponential backoff when cloning or pulling. If the initial clone fails (for example due to DNS/network issues), the container will continue starting and the background auto-updater will keep retrying periodically according to `UPDATE_INTERVAL_SEC`.
- To override retry behavior, set `CORE_REPO_URL` to a reachable mirror or pre-populate the `public/` directory before starting the container.

## 🛠️ Local Development

If you wish to run the server locally without Docker for development and debugging:

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm start
   ```

*(Note: Running outside Docker means you might need to manually set up the `public/` directory containing the frontend, as `entrypoint.sh` normally handles cloning this automatically.)*

## 📁 Architecture Overview
* `server.js`: The main Express server entry point.
* `sockets/game.js`: The Socket.IO event router mapping client inputs to engine functions.
* `sessions.js`: In-memory session and lobby manager mapping connection IDs to game environments.
* `engine-adapter.js`: The bridge linking the stateless frontend game logic (`engine.js`) to the backend server.
* `mp.js`: The frontend-injected multiplayer module enabling the custom UI and socket bindings.
