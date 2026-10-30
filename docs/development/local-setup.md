[← Documentation](../README.md)

# Local setup

## With Docker (recommended)

```bash
docker compose -f docker-compose.local.yml up -d --build
```

* Game: <http://localhost:3000>, database: `localhost:5432` (only from this machine; user/password `hochciv` / `password123`).
* Containers: `hochciv-multiplayer-local` (server) and `hochciv-db`.
* The server code and the game (`HochCiv/`, `HochCiv-v96/`, `HochCiv-v93/`, `HochCiv-v83/`) are mounted into the container – after changes run `docker compose -f docker-compose.local.yml restart hochciv-local` (`public/` is rebuilt at start). Changes to `package.json`, `Dockerfile`, `entrypoint.sh` or `activity/bridge.js` need `--build`.
* Runs without `NODE_ENV=production`: e-mails (activation codes, reset codes) are printed to the log (`docker logs hochciv-multiplayer-local`).
* Optional SMTP settings can go into `secrets.env` (gitignored).
* Make yourself admin: `docker exec hochciv-multiplayer-local node elevate.js <username> superadmin`.
* Some tests need shorter timers. Pass them from the shell when starting, e.g. `MATCH_GROUP_WAIT_MS=3000 MATCH_CONFIRM_MS=5000 docker compose -f docker-compose.local.yml up -d`, and start again without them afterwards. Which variables are passed through: [Configuration](../operations/configuration.md#tuning-and-test-settings).

Before finishing a change, check the start in the logs (`docker compose -f docker-compose.local.yml logs --tail 5`) and run the tests that cover it ([Testing](testing.md)).

## Without Docker

```bash
npm install
npm start          # or: npm run dev (restarts on file changes)
```

You need a PostgreSQL database (`DATABASE_URL=postgres://user:pass@host:5432/db`). Run `node scripts/build-public.js` once (and after changes to the game or `mp.js`) so the server can serve the game page; the engine is always loaded from `HochCiv/` (and `HochCiv-v96/`, `HochCiv-v93/`, `HochCiv-v83/`). The Discord Activity bundle needs `npm run build:activity`.

## Testing the Discord Activity or passkeys locally

Both need a public HTTPS address. Use a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`), set `BASE_URL` to its address and open the game there. See [Discord Activity](../operations/discord-activity.md).

## Working rules

* The game files in `HochCiv*/` are not edited here – changes to the game are made in the game repository ([Updating the game](updating-the-game.md)); everything multiplayer goes through `mp.js`, `client/` and the server.
* Never commit `.env` or `secrets.env`.
* Branches and PRs: [Branches and release flow](release-flow.md).
