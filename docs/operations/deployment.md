[← Documentation](../README.md)

# Deployment (production)

The production setup uses the pre-built image `peterswode/hochciv-multiplayer` behind a reverse proxy (Nginx, Nginx Proxy Manager, …). The image contains the server and every game version; it needs no network access at start.

## First installation

1. Install Docker with Docker Compose.
2. Create the external network the proxy and the server share:
   ```bash
   docker network create nginx
   ```
   If your proxy is already in a network with another name (e.g. `proxy`), skip this and set `PROXY_NETWORK=proxy` in `.env`.
3. Put `docker-compose.yml` into a folder, copy `.env.template` next to it as `.env` and fill it in (see [Configuration](configuration.md)). At least `SESSION_SECRET` and `BASE_URL` must be set.
4. Start:
   ```bash
   docker compose up -d
   ```
   The server listens on port `3000` inside the `nginx` network. Point your proxy at `hochciv-multiplayer:3000` for the whole site (`/`, `/api/`, `/client/`, `/socket.io/` with WebSocket upgrade). `nginx-example.conf` shows the required locations and headers; it proxies to `127.0.0.1:3000`, so when Nginx runs as a container in the `nginx` network, replace that with `hochciv-multiplayer:3000` (the compose file publishes no host port).
5. Register your account in the game, then make it superadmin (needed for the OAuth settings):
   ```bash
   docker exec hochciv-multiplayer node elevate.js <your-username> superadmin
   ```

After changing `.env`, run `docker compose up -d` again – a plain `restart` does not re-read `.env`.

Optional next steps:

* [Google and Discord login](login-providers.md)
* [Discord Activity](discord-activity.md)
* [Push notifications](push-notifications.md) for the Android app
* [Staging](staging.md) on the same server

## Containers

| Container | Image | Purpose |
|---|---|---|
| `hochciv-multiplayer` | `peterswode/hochciv-multiplayer:${HOCHCIV_IMAGE_TAG:-latest}` | the server |
| `hochciv-db` | `postgres:15-alpine` | accounts, matches, Rundenspiele, sessions; data in a Docker volume |

The database schema is created and updated by the server at start (`sequelize.sync({ alter: true })`); there are no migration scripts to run. See [Database](../reference/database.md).

## Updating

* **Server:** pull the new image and recreate: `docker compose pull && docker compose up -d`. Before that, the change has been tested on staging (see [Branches and release flow](../development/release-flow.md)).
* **Game version:** comes with the server image (`HochCiv/` in this repository) – updating the server updates the game.
* **A specific release:** set `HOCHCIV_IMAGE_TAG` (e.g. `v1.4.2`) in `.env` and run `docker compose up -d`. Setting it back to `latest` returns to the newest release.

Live games are kept in memory: recreating the container ends running live games. Rundenspiele are in the database and continue.

## Health check

`GET /health` answers `{ ok: true, uptime }` – useful for the proxy or an uptime monitor.
