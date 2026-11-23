/**
 * Keeps the monitoring configuration on the host current with the server image
 * (docs/operations/monitoring.md).
 *
 * Prometheus and Grafana read monitoring/ from a shared volume. monitoring-setup fills it at
 * `docker compose up`, but Watchtower only recreates this server. So at every start the server
 * copies its own monitoring/ into the volume (MONITORING_SYNC_DIR), and a changed dashboard
 * arrives with the release: Grafana re-reads the dashboard files every minute. Changes to
 * prometheus.yml or the provisioning only take effect when those containers restart.
 *
 * Each file is written to a temporary name and renamed, so Grafana never reads half a file.
 * Files the image no longer has are removed. Without MONITORING_SYNC_DIR (local), nothing happens.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'monitoring');

function filesOf(dir, base = dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return filesOf(full, base);
        return e.isFile() ? [path.relative(base, full)] : [];
    });
}

/** Copies SOURCE into `target`; returns { written, removed }. */
function sync(target = process.env.MONITORING_SYNC_DIR, source = SOURCE) {
    if (!target) return null;
    const wanted = new Set(filesOf(source));
    let written = 0, removed = 0;
    for (const rel of wanted) {
        const from = path.join(source, rel), to = path.join(target, rel);
        const data = fs.readFileSync(from);
        if (fs.existsSync(to) && fs.readFileSync(to).equals(data)) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const tmp = to + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, data, { mode: 0o644 });
        fs.renameSync(tmp, to);
        written++;
    }
    for (const rel of filesOf(target)) {
        if (!wanted.has(rel)) { fs.unlinkSync(path.join(target, rel)); removed++; }
    }
    return { written, removed };
}

/** At start: never stops the server, only logs. */
function syncOnStart() {
    try {
        const r = sync();
        if (r && (r.written || r.removed)) console.log(`[Monitoring] Configuration updated (${r.written} written, ${r.removed} removed)`);
    } catch (err) {
        console.warn('[Monitoring] Configuration not updated:', err.message);
    }
}

module.exports = { sync, syncOnStart };
