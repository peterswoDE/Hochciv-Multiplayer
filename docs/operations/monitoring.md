# Monitoring (Grafana in the admin page)

The admin page has a tab **Leistung**. It shows a Grafana dashboard with:

* response times and request rates by route
* errors
* event-loop lag, memory, CPU and garbage collection
* open sockets and live games
* matches of the last 24 hours (with people, bots only, single-player)
* the database: query times, the connection pool, database size and table rows, full-table scans, and the most expensive queries (`pg_stat_statements`)

```
browser ──/admin/grafana/…──▶ game server (admins only) ──X-WEBAUTH-USER──▶ grafana ──▶ prometheus
                                                                                         ├─▶ hochciv-app:9464 /metrics  (utils/metrics.js)
                                                                                         └─▶ postgres-exporter ──▶ hochciv-db
```

| Part | Where | What it does |
|---|---|---|
| `utils/metrics.js` | game server | Collects the figures with `prom-client` and serves them on their own port, `METRICS_PORT` (default `9464`, `off` turns it off). nginx doesn't proxy that port, so only containers on the internal network reach it. |
| `utils/grafana.js` | game server | Passes `/admin/grafana/…` to Grafana (`GRAFANA_URL`) for admins, superadmins and the review admin. It replaces any `X-WEBAUTH-*` header the browser sends, sets the admin's name and role (super admin → Grafana Admin, everyone else → Viewer), and only forwards Grafana's own cookies. |
| `monitoring/prometheus/prometheus.yml` | Prometheus | Scrapes the server and the exporter every 15 s and keeps the data for `PROMETHEUS_RETENTION` (default `30d`). |
| `monitoring/grafana/…` | Grafana | Provisions the data source and the dashboard `hochciv-overview` (`dashboards/hochciv.json`). It has no login of its own (auth proxy) and runs on the internal network only. |
| `utils/monitoringSync.js` | game server | At every start, copies the image's `monitoring/` into the shared volume (`MONITORING_SYNC_DIR`), so a release with a changed dashboard arrives through Watchtower. Off locally. |
| `postgres-exporter` | container | Reads the statistics views as `hochciv_app`, which `scripts/db-setup.js` gives the read-only role `pg_monitor`. |
| `pg_stat_statements` | Postgres | Loaded through the database's `command` (`shared_preload_libraries`). `scripts/db-setup.js` then creates the extension. |

On the host, `monitoring-setup` copies `monitoring/` from the server image into a volume, so the host needs no files besides `docker-compose.yml` and `.env` – but it does need the current `docker-compose.yml` (see below). Locally, `docker-compose.local.yml` mounts `./monitoring` directly, and Prometheus is also reachable at `http://127.0.0.1:9090`.

## Setting it up on a host

Watchtower only replaces the server image, and `docker compose pull` only fetches images – neither changes the compose file on the host. The new containers and the database's new start command are in that file, so once per host:

1. Replace the host's `docker-compose.yml` with the current one from this repository (no `.env` changes needed).
2. Then:
   ```sh
   docker compose pull
   docker compose up -d        # restarts hochciv-db once (pg_stat_statements), starts prometheus, grafana, postgres-exporter
   ```
3. Check: `docker logs hochciv-db-setup` ends with `[DB setup] Done`, `docker logs hochciv-multiplayer` shows `[Metrics] Prometheus figures on port 9464`, and the admin tab **Leistung** shows the dashboard.

For staging, replace `docker-compose.staging.yml` in the staging folder and run the same commands with `-f docker-compose.staging.yml`. The database restart takes a few seconds, and the server reconnects on its own. Live games end when the server container is recreated, as with every update.

To leave monitoring off on a host, set `GRAFANA_URL=` (empty) in `.env`. The tab then says that monitoring isn't set up.

## Changing the dashboard

`monitoring/grafana/dashboards/hochciv.json` is provisioned read-only. To change it:

1. Edit it in Grafana as super admin and save a copy.
2. Export the copy as JSON.
3. Replace the file and keep `uid: hochciv-overview`.

The change reaches a host with the next release: Watchtower recreates the server, the server copies the new file into the volume, and Grafana picks it up within a minute. Changes to `prometheus.yml` or to the provisioning files are copied the same way, but Prometheus and Grafana read them only at their start: run `docker compose restart prometheus grafana` on the host.

Watchtower only updates the server. Prometheus, Grafana and the exporter run fixed versions; a new version, a new container or another change to the compose file needs the current compose file on the host and `docker compose up -d`.
