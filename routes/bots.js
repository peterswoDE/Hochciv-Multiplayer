/**
 * Bot accounts of the logged-in owner (utils/bots.js) – the "Meine Bots" section of the account
 * page (client/account.js). Admins may act on every bot.
 *
 *   GET    /api/bots[?all=1]         – own bots (admins with all=1: every bot), the limit
 *   POST   /api/bots { username }    – new bot → { bot, token }; the token is shown only now
 *   POST   /api/bots/:id/description { description } – set or clear the public profile text
 *   POST   /api/bots/:id/token       – new token, the old one stops working → { token }
 *   POST   /api/bots/:id/transfer { username } – hand the bot to another bot creator
 *   DELETE /api/bots/:id             – delete the bot (like an account: its games stay)
 *
 * Creating and renewing a token, handing a bot over and deleting it need a recent login
 * (requireRecentAuth).
 */
const express = require('express');
const rateLimitLib = require('../utils/rateLimit');
const { sequelize, User } = require('../models');
const { BOT_DESCRIPTION_MAX_LENGTH } = require('../config');
const Bots = require('../utils/bots');
const { deleteAccount } = require('../utils/deleteAccount');
const { detachUser } = require('../utils/detachUser');
const { USERNAME_RE, isAuthenticated, noBots, requireRecentAuth, str, destroyOtherSessions } = require('../utils/auth');

const router = express.Router();
router.use(isAuthenticated, noBots);

const rateLimit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const isAdmin = user => user.role === 'admin' || user.role === 'superadmin';
const limitJson = n => (n === Infinity ? null : n);

function botJson(bot, owner) {
    return {
        id: bot.id,
        username: bot.username,
        description: bot.botDescription,
        arenaLadderOptIn: bot.arenaLadderOptIn,
        mmr: bot.mmr,
        gamesPlayed: bot.gamesPlayed,
        createdAt: bot.createdAt,
        isBanned: bot.isBanned,
        owner: owner ? { id: owner.id, username: owner.username } : null,
        // why it can't play right now (owner banned, role taken away, …), null when it can
        disabled: Bots.botBlockedReason(bot, owner),
    };
}

const managedBotWhere = req => ({
    id: req.params.id,
    accountType: 'bot',
    ...(isAdmin(req.user) ? {} : { ownerId: req.user.id }),
});

/** The bot `req.params.id` if the user may manage it, else an error is sent and null returned. */
async function managedBot(req, res) {
    const bot = await User.findOne({ where: managedBotWhere(req) }).catch(() => null);
    if (!bot) {
        res.status(404).json({ error: 'Bot nicht gefunden.' });
        return null;
    }
    return bot;
}

const countBots = ownerId => User.count({ where: { accountType: 'bot', ownerId } });

router.get('/', async (req, res) => {
    try {
        const all = req.query.all === '1' && isAdmin(req.user);
        const bots = await User.findAll({
            where: all ? { accountType: 'bot' } : { accountType: 'bot', ownerId: req.user.id },
            order: [['createdAt', 'ASC']],
        });
        const ownerIds = [...new Set(bots.map(b => b.ownerId).filter(Boolean))];
        const owners = new Map((await User.findAll({ where: { id: ownerIds } })).map(o => [o.id, o]));
        res.json({
            canCreate: Bots.canCreateBots(req.user),
            limit: limitJson(Bots.botLimitOf(req.user)),
            own: await countBots(req.user.id),
            bots: bots.map(b => botJson(b, owners.get(b.ownerId) || null)),
        });
    } catch (err) {
        console.error('[Bots] List', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/', rateLimit, requireRecentAuth, async (req, res) => {
    try {
        if (!Bots.canCreateBots(req.user)) return res.status(403).json({ error: 'Du darfst keine Bots erstellen.' });
        const username = str(req.body.username, 30);
        if (!username || !USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'Benutzername: 3–30 Zeichen, nur Buchstaben, Ziffern, _ und -.' });
        }
        const { token, hash } = Bots.newToken();
        const bot = await sequelize.transaction(async transaction => {
            // the count and the new row in one transaction, so two requests can't both pass the limit
            const owner = await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
            if ((await User.count({ where: { accountType: 'bot', ownerId: owner.id }, transaction })) >= Bots.botLimitOf(owner)) return null;
            if (await User.findOne({ where: { username }, transaction })) return 'taken';
            return User.create({
                username, email: null, password_hash: null, isActive: true, accountType: 'bot',
                ownerId: owner.id, botTokenHash: hash, notifyEmail: false, notifyPush: false,
            }, { transaction });
        });
        if (bot === 'taken') return res.status(400).json({ error: 'Dieser Benutzername ist schon vergeben.' });
        if (!bot) return res.status(400).json({ error: 'Du hast schon so viele Bots, wie du haben darfst.' });
        console.log(`[Bots] ${req.user.username} created bot ${bot.username} (${bot.id}).`);
        res.json({ bot: botJson(bot, req.user), token });
    } catch (err) {
        console.error('[Bots] Create', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/:id/description', rateLimit, async (req, res) => {
    try {
        const bot = await managedBot(req, res);
        if (!bot) return;
        const input = req.body?.description;
        const text = typeof input === 'string' ? input.trim() : null;
        if (text === null || [...text].length > BOT_DESCRIPTION_MAX_LENGTH) {
            return res.status(400).json({ error: `Die Beschreibung muss ein Text mit höchstens ${BOT_DESCRIPTION_MAX_LENGTH} Zeichen sein.` });
        }
        if (text.includes('\0')) return res.status(400).json({ error: 'Die Beschreibung enthält ein ungültiges Zeichen.' });
        const description = text || null;
        // Check ownership at the write too, in case the bot was handed over since the lookup.
        const [updated] = await User.update({ botDescription: description }, { where: managedBotWhere(req) });
        if (!updated) return res.status(404).json({ error: 'Bot nicht gefunden.' });
        res.json({ description });
    } catch (err) {
        console.error('[Bots] Description', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// The bot ladder of the Rundenspiele (async/ladder.js): the owner opts the bot in or out
router.post('/:id/ladder-opt-in', rateLimit, async (req, res) => {
    const optedIn = req.body?.arenaLadderOptIn;
    if (typeof optedIn !== 'boolean') return res.status(400).json({ error: 'Ungültige Aktion.' });
    try {
        const [updated] = await User.update({ arenaLadderOptIn: optedIn }, { where: managedBotWhere(req) });
        if (!updated) return res.status(404).json({ error: 'Bot nicht gefunden.' });
        res.json({ arenaLadderOptIn: optedIn });
    } catch (err) {
        console.error('[Bots] Ladder opt-in', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/:id/token', rateLimit, requireRecentAuth, async (req, res) => {
    try {
        const bot = await managedBot(req, res);
        if (!bot) return;
        const { token, hash } = Bots.newToken();
        bot.botTokenHash = hash;
        await bot.save();
        // the old token's sessions end as well
        await destroyOtherSessions(sequelize, bot.id);
        await detachUser(req.app.locals.io, bot.id);
        res.json({ token });
    } catch (err) {
        console.error('[Bots] Token', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/:id/transfer', rateLimit, requireRecentAuth, async (req, res) => {
    try {
        const bot = await managedBot(req, res);
        if (!bot) return;
        const name = str(req.body.username, 30);
        const to = name ? await User.findOne({ where: { username: name, accountType: 'human' } }) : null;
        if (!to) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
        if (to.id === bot.ownerId) return res.status(400).json({ error: 'Dieser Bot gehört schon diesem Benutzer.' });
        if (!Bots.canCreateBots(to)) return res.status(400).json({ error: 'Dieser Benutzer darf keine Bots besitzen.' });
        if ((await countBots(to.id)) >= Bots.botLimitOf(to)) return res.status(400).json({ error: 'Dieser Benutzer hat schon so viele Bots, wie er haben darf.' });
        const from = bot.ownerId;
        bot.ownerId = to.id;
        await bot.save();
        console.log(`[Bots] ${req.user.username} handed bot ${bot.username} from ${from} to ${to.username}.`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Bots] Transfer', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/:id', rateLimit, requireRecentAuth, async (req, res) => {
    try {
        const bot = await managedBot(req, res);
        if (!bot) return;
        const error = await deleteAccount(bot, { io: req.app.locals.io, byAdmin: bot.ownerId === req.user.id ? null : req.user.username });
        if (error) return res.status(400).json({ error });
        res.json({ ok: true });
    } catch (err) {
        console.error('[Bots] Delete', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
