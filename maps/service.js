/**
 * Custom maps in the player's account ("Meine Karten") and publishing them with a code.
 *
 * Every map is checked with the engine's own rule (checkCustomMap in Hochciv's engine.js) and
 * stored as the clean copy it returns. Same owner + same name = the same map: saving again
 * replaces it. Publishing gives the map a 6-character code from an alphabet without the easily
 * confused 0/O and 1/I; anybody can load a published map by its code (routes/maps.js, no login
 * needed) and the code always delivers the current version.
 *
 * All functions return plain objects; errors come back as { error } (HTTP 400 in the route).
 */
const crypto = require('crypto');
const { UniqueConstraintError } = require('sequelize');
const { CustomMap, User } = require('../models');
const engine = require('../engine-adapter');

const MAX_MAPS = 30;                       // the browser library holds as many (MY_MAPS_MAX)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newCode() {
    return Array.from(crypto.randomBytes(CODE_LENGTH), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** A code as typed: case, spaces and dashes don't matter. null if it can't be one. */
function normalizeCode(code) {
    const c = String(code == null ? '' : code).toUpperCase().replace(/[\s-]/g, '');
    return c.length === CODE_LENGTH && [...c].every(ch => CODE_CHARS.includes(ch)) ? c : null;
}

/** What the owner sees of a map. */
const entry = row => ({
    id: row.id, name: row.name, map: row.map, code: row.code || null,
    publishedAt: row.publishedAt || null, loads: row.loads, updatedAt: row.updatedAt,
});

async function ownMap(user, id) {
    if (!UUID_RE.test(String(id))) return null;
    return CustomMap.findOne({ where: { id, ownerId: user.id } });
}

async function list(user) {
    const rows = await CustomMap.findAll({ where: { ownerId: user.id }, order: [['updatedAt', 'DESC']] });
    return { maps: rows.map(entry) };
}

/** Save (create or replace by name). */
async function save(user, raw) {
    const r = engine.checkCustomMap(raw);
    if (r.error) return { error: r.error };
    const map = r.map;
    const row = await CustomMap.findOne({ where: { ownerId: user.id, name: map.name } });
    if (row) {
        row.map = map;
        row.changed('map', true);
        await row.save();
        return { map: entry(row) };
    }
    if (await CustomMap.count({ where: { ownerId: user.id } }) >= MAX_MAPS)
        return { error: `Höchstens ${MAX_MAPS} eigene Karten – lösche erst eine.` };
    try {
        return { map: entry(await CustomMap.create({ ownerId: user.id, name: map.name, map })) };
    } catch (err) {
        // two saves of a new name at the same time: the other one won, replace it
        if (err instanceof UniqueConstraintError) return save(user, raw);
        throw err;
    }
}

async function remove(user, id) {
    const row = await ownMap(user, id);
    if (!row) return { error: 'Diese Karte gibt es nicht.' };
    await row.destroy();
    return { ok: true };
}

/** Publish: a new code, or the one the map already has. */
async function publish(user, id) {
    const row = await ownMap(user, id);
    if (!row) return { error: 'Diese Karte gibt es nicht.' };
    if (row.code) return { map: entry(row) };
    for (let i = 0; i < 10; i++) {
        try {
            row.code = newCode();
            row.publishedAt = new Date();
            await row.save();
            return { map: entry(row) };
        } catch (err) {
            if (!(err instanceof UniqueConstraintError)) throw err;   // code taken – roll again
        }
    }
    return { error: 'Kein freier Code gefunden. Bitte versuche es noch einmal.' };
}

async function unpublish(user, id) {
    const row = await ownMap(user, id);
    if (!row) return { error: 'Diese Karte gibt es nicht.' };
    Object.assign(row, { code: null, publishedAt: null });
    await row.save();
    return { map: entry(row) };
}

/** A published map by its code – for everybody. `viewerId` (may be null) is not counted as a load if it is the owner. */
async function byCode(code, viewerId) {
    const c = normalizeCode(code);
    if (!c) return { error: `Ein Kartencode hat ${CODE_LENGTH} Zeichen (Buchstaben und Ziffern).` };
    const row = await CustomMap.findOne({ where: { code: c } });
    if (!row) return { error: 'Zu diesem Code gibt es keine veröffentlichte Karte.' };
    if (row.ownerId !== viewerId) await row.increment('loads');
    const owner = await User.findByPk(row.ownerId, { attributes: ['username'] });
    return { code: c, map: row.map, author: owner ? owner.username : null };
}

// ── Account lifecycle (utils/deleteAccount.js, utils/mergeAccounts.js) ────────

/** The account is deleted: its maps go with it (games already played keep their copy in the state). */
async function removeOwner(userId, transaction) {
    await CustomMap.destroy({ where: { ownerId: userId }, transaction });
}

/** Accounts are merged: maps of `fromId` move to `intoId`; a name both have gets " (2)", " (3)" … */
async function moveOwner(fromId, intoId, transaction) {
    const taken = new Set((await CustomMap.findAll({ where: { ownerId: intoId }, attributes: ['name'], transaction })).map(r => r.name));
    for (const row of await CustomMap.findAll({ where: { ownerId: fromId }, transaction })) {
        let name = row.name;
        for (let n = 2; taken.has(name); n++) name = `${row.name.slice(0, 34)} (${n})`;
        taken.add(name);
        Object.assign(row, { ownerId: intoId, name, map: { ...row.map, name } });
        await row.save({ transaction });
    }
}

module.exports = { list, save, remove, publish, unpublish, byCode, removeOwner, moveOwner, normalizeCode, MAX_MAPS, CODE_LENGTH };
