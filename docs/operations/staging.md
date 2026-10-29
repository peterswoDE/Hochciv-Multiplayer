[← Documentation](../README.md)

# Staging (semi-live)

Every merge into `development` is deployed to staging automatically, so changes can be tried with real devices before they reach production. How changes get there: [Branches and release flow](../development/release-flow.md).

Staging runs on the production server next to production, with its own containers (`hochciv-multiplayer-staging`, `hochciv-staging-db`, `hochciv-staging-watchtower`), its own empty database and its own subdomain. Production is never touched: the Watchtower in `docker-compose.staging.yml` only updates containers labelled for the `hochciv-staging` scope. Production has its own Watchtower (`hochciv-watchtower`, scope `hochciv`, see [Deployment](deployment.md#updating)).

## Setup

1. DNS: point the staging subdomain (e.g. `staging.hochciv.de`) at the server and get a certificate for it.
2. Put `docker-compose.staging.yml` into its **own** folder (not the production one), copy `.env.template` next to it as `.env` and fill it in:
   * `SESSION_SECRET`: a different value than production.
   * `BASE_URL`: the staging URL, e.g. `https://staging.hochciv.de`.
   * `POSTGRES_PASSWORD`: its own value.
   * SMTP: optional; leave `SMTP_HOST` empty to only log mails. Leave `FCM_SERVICE_ACCOUNT` empty unless you test push.
3. Start: `docker compose -f docker-compose.staging.yml up -d`.
4. Proxy the subdomain to `hochciv-multiplayer-staging:3000` with WebSocket support – see the staging block in `nginx-example.conf`, or in Nginx Proxy Manager add a proxy host for it with *Websockets Support* on. `PROXY_NETWORK` must be the same network as production's.
5. Register an account on staging and make it superadmin: `docker exec hochciv-multiplayer-staging node elevate.js <your-username> superadmin`.
6. Google / Discord login on staging: add `https://staging.hochciv.de/api/auth/google/callback` and `…/api/auth/discord/callback` as additional redirect URLs to the same OAuth apps, and enter client ID and secret in the staging admin panel (the staging database is separate).

## Operation

* Watchtower checks for a new `staging` image every 5 minutes (`WATCHTOWER_POLL_INTERVAL` in `.env`, in seconds). See what it did with `docker logs hochciv-staging-watchtower`.
* To pin staging to a specific build, stop Watchtower and change the image tag to `staging-<commit>`.
* The Android app can be pointed at the staging URL for testing.
* Staging is the same site as production for the browser (`staging.hochciv.de` next to `hochciv.de`); the [origin check](../reference/security.md#origin-check) keeps staging pages from using a production login.
