[← Documentation](../README.md)

# Deployment (production)

The production setup uses the pre-built image `peterswode/hochciv-multiplayer` behind a reverse proxy (Nginx, Nginx Proxy Manager, …). The image contains the server and every game version; it needs no network access at start.

## First installation

1. Install Docker with Docker Compose.
2. Create the external network the proxy and the server share:
   ```bash
   docker network create proxy
   ```
   If your proxy is already in a network with another name (e.g. `nginx`), skip this and set `PROXY_NETWORK=nginx` in `.env`.
3. Put `docker-compose.yml` into a folder, copy `.env.template` next to it as `.env` and fill it in (see [Configuration](configuration.md)). At least `SESSION_SECRET`, `BASE_URL` and the three database passwords (`POSTGRES_PASSWORD`, `POSTGRES_OWNER_PASSWORD`, `POSTGRES_APP_PASSWORD`) must be set.
4. Start:
   ```bash
   docker compose up -d
   ```
   The server listens on port `3000` inside the `proxy` network. Point your proxy at `hochciv-multiplayer:3000` for the whole site (`/`, `/api/`, `/client/`, `/socket.io/` with WebSocket upgrade). `nginx-example.conf` shows the required locations and headers; it proxies to `127.0.0.1:3000`, so when Nginx runs as a container in the `proxy` network, replace that with `hochciv-multiplayer:3000` (the compose file publishes no host port).
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
| `hochciv-db` | `postgres:15-alpine` | accounts, matches, Rundenspiele, sessions; data in the Docker volume `pgdata` or the folder in `POSTGRES_DATA` |
| `hochciv-db-setup` | as the server | one-shot at every `docker compose up`: the database roles of the server (exits after a few seconds – `Exited (0)` is normal) |
| `hochciv-watchtower` | `nickfedor/watchtower` | updates `hochciv-multiplayer` when a new image is published (scope `hochciv`) |

The database schema comes from migrations, which the server container applies before the server starts; there is nothing to run by hand. The server itself connects with a role that can read and write rows but not change the schema. See [Roles and migrations](../reference/database.md#roles-and-migrations).

## Updating

* **Server:** automatic. A merge into `main` builds `peterswode/hochciv-multiplayer:latest`; Watchtower finds it within `WATCHTOWER_POLL_INTERVAL` (5 minutes) and recreates `hochciv-multiplayer`. Before that, the change has been tested on staging (see [Branches and release flow](../development/release-flow.md)) – a merge into `main` is a release. See what Watchtower did: `docker logs hochciv-watchtower`.
* **Right away** instead of waiting: `docker exec hochciv-watchtower /watchtower --run-once --label-enable --scope hochciv`, or by hand: `docker compose pull && docker compose up -d`.
* **Pause automatic updates** (e.g. before a long live tournament): `docker stop hochciv-watchtower`; `docker start hochciv-watchtower` resumes them.
* **Game version:** comes with the server image (`HochCiv/` in this repository) – updating the server updates the game.
* **A specific release:** set `HOCHCIV_IMAGE_TAG` (e.g. `v1.4.2`) in `.env` and run `docker compose up -d`. Setting it back to `latest` returns to the newest release.

Live games are kept in memory: recreating the container ends running live games – also when Watchtower does it. Rundenspiele are in the database and continue.

### Switching to the database roles (from 2026-11)

Until 2026-11 the server used the database superuser and changed the schema itself. To switch an existing installation (staging the same way, with `-f docker-compose.staging.yml` and the `staging` names):

1. Back up the database: `docker exec hochciv-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql` (the superuser's name is `POSTGRES_USER` from `.env`)
2. Add two new, different passwords to `.env` – letters and digits only, e.g. from `openssl rand -hex 24`:
   ```
   POSTGRES_OWNER_PASSWORD=…
   POSTGRES_APP_PASSWORD=…
   ```
   `POSTGRES_PASSWORD` stays the superuser's existing password.
3. Replace `docker-compose.yml` with the current one.
4. `docker compose pull && docker compose up -d`
5. Check: `docker logs hochciv-db-setup` ends with `[DB setup] Done`; `docker logs hochciv-multiplayer` shows `[DB] Schema is current.` and no `[DB] Schema:` warning.

Back: the previous `docker-compose.yml` and `docker compose up -d` – the superuser can still do everything, the roles stay unused.

### Older installations

An installation from before the Watchtower (or with the database in a folder) can switch to the current `docker-compose.yml` without losing data: keep its `.env` and add `POSTGRES_DATA=./postgres` (the folder it used) and, if its proxy network has another name than `proxy`, `PROXY_NETWORK`. `CORE_REPO_URL`, `CORE_REPO_BRANCH` and `CORE_REPO_COMMIT` are no longer used – the game ships in the image. Then `docker compose up -d`.

## Health check

`GET /health` answers `{ ok: true, uptime }` – useful for the proxy or an uptime monitor.
