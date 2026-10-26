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

        /**
         * Handler wrapper: login required, payload is always an object, ack is always a
         * function and errors (sync or async) never reach the process.
         */
        const on = (event, handler) => socket.on(event, (data, ack) => {
            const reply = typeof ack === 'function' ? ack : () => { };
            if (!user()) return reply({ error: 'Bitte anmelden.' });
            const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
            if (payload.id !== undefined && typeof payload.id !== 'string') return reply({ error: 'Ungültiges Spiel.' });
            Promise.resolve()
                .then(() => handler(payload))
                .then(r => reply(r || { ok: true }))
                .catch(err => { console.error(`[Async Socket] ${event}`, err); reply({ error: 'Serverfehler' }); });
        });

        on('async:open', async (data) => {
            const id = data.id;
            const r = await service.open(user(), id).catch(err => ({ error: String(err.message || err) }));
            if (r.error) return r;
            if (socket.data.asyncId && socket.data.asyncId !== id) socket.leave(service.room(socket.data.asyncId));
            socket.data.userId = user().id;
            socket.data.asyncId = id;
            socket.join(service.room(id));
            // after the reply: the client knows which game is open only once it has the view
            setImmediate(() => socket.emit('chat:history', { id, list: r.chat || [] }));
            return { ok: true, view: r.view };
        });

        socket.on('async:close', (_data, ack) => {
            if (socket.data.asyncId) socket.leave(service.room(socket.data.asyncId));
            socket.data.asyncId = null;
            if (typeof ack === 'function') ack({ ok: true });
        });

        on('async:action', data => service.action(user(), data.id, data.type, data.params));
        on('async:place', data => service.place(user(), data.id, data.o, data.cell));
        on('async:draft', data => service.draftPick(user(), data.id, data.abilityId));
        on('async:chat', data => service.chat(user(), data.id, data));
        on('async:report', data => service.report(user(), data.id, data.msgId, data.reason));
    });
};
