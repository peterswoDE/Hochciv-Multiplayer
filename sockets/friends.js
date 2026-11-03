/**
 * Friends list over Socket.IO (F8): logged-in sockets count as online (utils/presence.js), and a
 * player in a live lobby invites an online friend ('friends:invite' { userId, joinCode }).
 */
const presence = require('../utils/presence');
const friends = require('../utils/friends');

module.exports = function registerFriendHandlers(io) {
    friends.init(io);
    io.on('connection', socket => {
        const user = socket.request.user || null;
        if (user && user.accountType !== 'bot') {
            presence.add(user.id, socket.id);
            socket.on('disconnect', () => presence.remove(user.id, socket.id));
        }
        socket.on('friends:invite', (data, ack) => {
            const reply = typeof ack === 'function' ? ack : () => { };
            if (!user) return reply({ error: 'Freunde gibt es nur mit Anmeldung.' });
            const d = data && typeof data === 'object' ? data : {};
            Promise.resolve(friends.invite(user, d.userId, typeof d.joinCode === 'string' ? d.joinCode : ''))
                .then(reply)
                .catch(err => { console.error('[Friends] invite', err); reply({ error: 'Serverfehler' }); });
        });
    });
};
