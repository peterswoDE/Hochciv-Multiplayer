/**
 * Socket.IO handlers for asynchronous games. A client opens one game at a time
 * ('async:open'); it then receives 'async:update' after every change, and sends its
 * actions, start-tile placement and draft picks here. Login required (passport session).
 */
const service = require('../async/service');

module.exports = function registerAsyncHandlers(io) {
    service.init(io);

    io.on('connection', (socket) => {
        const user = () => socket.request.user || null;
        const guard = (ack) => {
            if (!user()) { ack?.({ error: 'Bitte anmelden.' }); return false; }
            return true;
        };
        const reply = (ack) => (p) => p.then(r => ack?.(r || { ok: true }))
            .catch(err => { console.error('[Async Socket]', err); ack?.({ error: 'Serverfehler' }); });

        socket.on('async:open', async (data, ack) => {
            if (!guard(ack)) return;
            const id = data && data.id;
            const r = await service.open(user(), id).catch(err => ({ error: String(err.message || err) }));
            if (r.error) return ack?.(r);
            if (socket.data.asyncId && socket.data.asyncId !== id) socket.leave(service.room(socket.data.asyncId));
            socket.data.userId = user().id;
            socket.data.asyncId = id;
            socket.join(service.room(id));
            ack?.({ ok: true, view: r.view });
        });

        socket.on('async:close', (_data, ack) => {
            if (socket.data.asyncId) socket.leave(service.room(socket.data.asyncId));
            socket.data.asyncId = null;
            ack?.({ ok: true });
        });

        socket.on('async:action', (data, ack) => {
            if (!guard(ack)) return;
            reply(ack)(service.action(user(), data.id, data.type, data.params));
        });

        socket.on('async:place', (data, ack) => {
            if (!guard(ack)) return;
            reply(ack)(service.place(user(), data.id, data.o, data.cell));
        });

        socket.on('async:draft', (data, ack) => {
            if (!guard(ack)) return;
            reply(ack)(service.draftPick(user(), data.id, data.abilityId));
        });
    });
};
