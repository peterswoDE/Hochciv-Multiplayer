/**
 * Tests of the Discord direct messages (utils/discord.js, the Discord channel in utils/notify.js).
 *
 * Runs without a server and without Discord: the database calls of the models and fetch() are
 * replaced by stubs, so it checks the API calls the bot would make and how the channel reacts to
 * Discord's answers.
 *
 *   node tests/discord/discord-dm.test.js
 */
const models = require('../../models');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

// ── Stubs ────────────────────────────────────────────────────────────────────
let botToken = 'bot-secret';
let users = [];
const updates = [];
models.OAuthProvider.findOne = async () => ({ botToken });
models.User.findAll = async () => users;
models.User.update = async (values, opts) => { updates.push({ values, id: opts.where.id }); return [1]; };
models.DeviceToken.findAll = async () => [];

// Discord: answers per recipient; 'closed' → 50007, 'limit' → one 429 first
const calls = [];
const limited = new Set();
global.fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body });
    const json = (status, data) => ({ ok: status < 300, status, json: async () => data });
    if (url.endsWith('/users/@me/channels')) {
        if (body.recipient_id === 'closed') return json(400, { code: 50007, message: 'Cannot send messages to this user' });
        return json(200, { id: 'dm-' + body.recipient_id });
    }
    const m = url.match(/\/channels\/dm-(.+)\/messages$/);
    if (m) {
        if (m[1] === 'limit' && !limited.has('limit')) {
            limited.add('limit');
            return json(429, { retry_after: 0.01, message: 'You are being rate limited.' });
        }
        if (m[1] === 'blocked') return json(403, { code: 50007, message: 'Cannot send messages to this user' });
        return json(200, { id: 'msg' });
    }
    return json(404, {});
};

const discord = require('../../utils/discord');
const { notify } = require('../../utils/notify');

const user = (id, extra) => Object.assign({ id, username: 'u' + id, email: 'x@oauth.local', notifyEmail: false, notifyPush: false,
    notifyDiscord: true, discordId: 'd' + id, isBanned: false }, extra);
const dmCalls = () => calls.filter(c => c.url.includes('/messages'));
const reset = () => { calls.length = 0; updates.length = 0; discord.resetCache(); };

(async () => {
    // messageFor
    const msg = discord.messageFor({ subject: 'Du bist am Zug', text: 'Runde 4 wartet.', summary: 'A baute eine Stadt.', link: 'https://hochciv.de/?async=g1' });
    ok(msg.embeds[0].title === 'Hochciv: Du bist am Zug', 'embed title');
    ok(msg.embeds[0].description === 'Runde 4 wartet.\n\nA baute eine Stadt.', 'embed text with summary');
    ok(msg.components && msg.components[0].components[0].url === 'https://hochciv.de/?async=g1', 'link button');
    ok(msg.allowed_mentions && msg.allowed_mentions.parse.length === 0, 'no mentions');
    ok(!discord.messageFor({ subject: 's', text: 't', link: 'http://localhost:3000/?async=g' }).components, 'no button for a non-https link');

    // Sending through notify(): only players who switched it on and have a Discord ID
    reset();
    users = [user(1), user(2, { notifyDiscord: false }), user(3, { discordId: null }), user(4, { isBanned: true })];
    await notify([1, 2, 3, 4], { type: 'turn', gameId: 'g1', subject: 'Du bist am Zug', text: 'Runde 4.' });
    ok(dmCalls().length === 1 && dmCalls()[0].url.endsWith('/channels/dm-d1/messages'), 'only the opted-in player gets a DM', dmCalls().map(c => c.url).join(','));
    ok(calls.every(c => c.auth === 'Bot bot-secret'), 'uses the bot token');
    ok(dmCalls()[0] && dmCalls()[0].body.embeds[0].description === 'Runde 4.', 'event text is the message text');

    // The DM channel is opened once and then reused
    calls.length = 0;
    await notify([1], { type: 'turn', gameId: 'g1', subject: 'Du bist am Zug', text: 'Runde 5.' });
    ok(!calls.some(c => c.url.endsWith('/users/@me/channels')) && dmCalls().length === 1, 'DM channel is cached');

    // Bot can't write to the player → the channel switches off for them
    reset();
    users = [user('closed', { discordId: 'closed' }), user('blocked', { discordId: 'blocked' })];
    await notify(['closed', 'blocked'], { type: 'turn', gameId: 'g1', subject: 's', text: 't' });
    ok(updates.length === 2 && updates.every(u => u.values.notifyDiscord === false), 'closed DMs switch the channel off', JSON.stringify(updates));

    // Rate limit: waits and tries once more
    reset();
    users = [user('limit', { discordId: 'limit' })];
    await notify(['limit'], { type: 'turn', gameId: 'g1', subject: 's', text: 't' });
    ok(dmCalls().length === 2 && updates.length === 0, 'retries once after a 429');

    // Without a bot token nothing is sent
    reset();
    botToken = '';
    users = [user(1)];
    await notify([1], { type: 'turn', gameId: 'g1', subject: 's', text: 't' });
    ok(calls.length === 0, 'no bot token – no Discord call');
    ok((await discord.sendDm('d1', msg)) === 'error', 'sendDm without a token reports error');

    console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
