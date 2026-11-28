// The Arena panel uses the scoped settings and status endpoints for correspondence.
window.HC_LADDER_ADMIN = {
    mount(panel, request = fetch) {
        const endpoint = '/api/admin/ladder';
        const form = panel.querySelector('#admin-ladder-form');
        const save = form.querySelector('button[type="submit"]');
        const status = panel.querySelector('#admin-ladder-status');
        const summary = panel.querySelector('#admin-ladder-summary');
        const pending = panel.querySelector('#admin-ladder-pending');
        const message = panel.querySelector('#admin-ladder-msg');
        const T = (text, ...args) => HC_I18N.t(text, ...args);
        const fields = form.elements;
        let savedSettings;

        function draft() {
            return {
                enabled: fields.enabled.checked, turnDays: Number(fields.turnDays.value),
                avoidRematches: fields.avoidRematches.checked, sameOwnerRanked: fields.sameOwnerRanked.checked,
                pairingIntervalSeconds: fields.pairingIntervalSeconds.valueAsNumber, placement: fields.placement.value,
                recentGamesLimit: fields.recentGamesLimit.valueAsNumber,
            };
        }
        function warnUnsaved(event) {
            event.preventDefault();
            event.returnValue = '';
        }
        function updatePending() {
            const dirty = Boolean(savedSettings) && Object.entries(draft()).some(([key, value]) => value !== savedSettings[key]);
            pending.hidden = !dirty;
            save.classList.toggle('btn-primary', dirty);
            if (dirty) window.addEventListener('beforeunload', warnUnsaved);
            else window.removeEventListener('beforeunload', warnUnsaved);
        }
        function showSaved(settings) {
            savedSettings = settings;
            status.dataset.enabled = String(settings.enabled);
            status.textContent = T(settings.enabled ? 'Aktiv' : 'Inaktiv');
            updatePending();
        }
        function lock(locked) {
            for (const field of fields) field.disabled = locked;
        }
        function showMessage(text, isError) {
            message.hidden = false;
            message.classList.toggle('error', isError);
            message.textContent = text;
        }

        async function loadSettings() {
            try {
                const res = await request(endpoint, { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const settings = await res.json();
                fields.enabled.checked = settings.enabled;
                fields.turnDays.value = settings.turnDays;
                fields.avoidRematches.checked = settings.avoidRematches;
                fields.sameOwnerRanked.checked = settings.sameOwnerRanked;
                fields.pairingIntervalSeconds.value = settings.pairingIntervalSeconds;
                fields.placement.value = settings.placement;
                fields.recentGamesLimit.value = settings.recentGamesLimit;
                showSaved(settings);
                lock(!settings.canManage);
            } catch (_) {
                showMessage(T('Einstellungen der Arena konnten nicht geladen werden.'), true);
            }
        }

        async function refreshStatus() {
            try {
                const res = await request(endpoint + '/status', { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                const last = data.lastCheckAt
                    ? new Date(data.lastCheckAt).toLocaleString(HC_I18N.locale(), { dateStyle: 'short', timeStyle: 'medium' })
                    : T('seit Serverstart keine');
                summary.textContent = T('Angemeldet %s · Paarungsbereit %s · Laufende Partien %s · Letzte Prüfung %s',
                    data.optedIn, data.available, data.activeGames, last);
            } catch (_) {
                summary.textContent = T('Status der Arena konnte nicht geladen werden.');
            }
        }

        form.addEventListener('input', updatePending);
        form.addEventListener('submit', async ev => {
            ev.preventDefault();
            try {
                const res = await request(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft()),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && typeof data.enabled === 'boolean') {
                    showSaved(data);
                    refreshStatus();
                }
                showMessage(res.ok ? T('Gespeichert.') : HC_I18N.tr(data.error || 'Fehler'), !res.ok);
            } catch (_) {
                showMessage(T('Netzwerkfehler.'), true);
            }
        });
        lock(true);
        loadSettings();
        return { refreshStatus };
    },
};
