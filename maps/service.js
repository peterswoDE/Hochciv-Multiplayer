/**
 * Custom maps in the player's account ("Meine Karten") and publishing them with a code.
 *
 * Every map is checked with the engine's own rule (checkCustomMap in Hochciv's engine.js) and
 * stored as the clean copy it returns. Same owner + same name = the same map: saving again
 * replaces it. Publishing gives the map a 6-character code from an alphabet without the easily
 * confused 0/O and 1/I; anybody can load a published map by its code (routes/maps.js, no login
 * needed) and the code always delivers the current version.
 *
 * Map browser: every published map is listed (browse) – sorted by favorites, newest or most
 * played, searchable by name and author. Logged-in players mark favorites (MapFavorite, counted
 * in CustomMap.favorites) and report maps (utils/reports.js, kind 'map'); an admin takes a map
 * out of the browser by unpublishing it (adminUnpublish).
 *
 * All functions return plain objects; errors come back as { error } (HTTP 400 in the route).
 */
const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, CustomMap, MapFavorite, User } = require('../models');
const engine = require('../engine-adapter');
const BUILTIN_MAPS = require('./builtin');
const terms = require('../utils/terms');

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
    await sequelize.transaction(async transaction => {
        await MapFavorite.destroy({ where: { mapId: row.id }, transaction });
        await row.destroy({ transaction });
    });
    return { ok: true };
}

/** Publish: a new code, or the one the map already has. */
async function publish(user, id) {
    if (!terms.accepted(user)) return { error: terms.NEEDED };
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
    if (!viewerId || row.ownerId !== viewerId) await row.increment('loads');
    const owner = await User.findByPk(row.ownerId, { attributes: ['username'] });
    return { code: c, map: row.map, author: owner ? owner.username : null };
}

// ── Map browser ──────────────────────────────────────────────────────────────

const PAGE = 24;
const MAX_LIMIT = 100;                     // favorites for the lobby's map menu come in one go
const SORTS = {
    popular: [['favorites', 'DESC'], ['loads', 'DESC'], ['publishedAt', 'DESC']],
    new: [['publishedAt', 'DESC']],
    played: [['loads', 'DESC'], ['favorites', 'DESC'], ['publishedAt', 'DESC']],
};
const isAdmin = user => !!user && (user.role === 'admin' || user.role === 'superadmin');
// a LIKE pattern for `text` anywhere – its own % and _ count as letters
const likeAnywhere = text => '%' + text.replace(/[\\%_]/g, ch => '\\' + ch) + '%';

/** A published map as the browser shows it. `favs`: ids of the viewer's favorites. */
const browseEntry = (row, authors, favs, viewer) => ({
    id: row.id, code: row.code, name: row.name, map: row.map,
    author: authors.get(row.ownerId) || null,
    favorites: row.favorites, loads: row.loads, publishedAt: row.publishedAt, updatedAt: row.updatedAt,
    fav: favs.has(row.id), own: !!viewer && row.ownerId === viewer.id,
});

/**
 * The published maps, a page at a time.
 *   sort     'popular' (favorites, then plays) | 'new' | 'played'
 *   only     'favorites' (the viewer's) | 'mine' (the viewer's own) | none
 *   q        part of the map's or the author's name
 *   players  only maps for at least this many empires
 *   page, limit
 * `viewer` may be null (not logged in): no favorite flags then.
 */
async function browse(viewer, { sort, only, q, players, page, limit } = {}) {
    const and = [{ code: { [Op.ne]: null } }];
    if (only === 'favorites' || only === 'mine') {
        if (!viewer) return { error: 'Dafür musst du angemeldet sein.' };
        if (only === 'mine') and.push({ ownerId: viewer.id });
        else and.push({ id: { [Op.in]: sequelize.literal(`(SELECT "mapId" FROM map_favorites WHERE "userId" = ${sequelize.escape(viewer.id)})`) } });
    }
    const text = String(q == null ? '' : q).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
    if (text) {
        and.push({
            [Op.or]: [
                { name: { [Op.iLike]: likeAnywhere(text) } },
                { ownerId: { [Op.in]: sequelize.literal(`(SELECT id FROM users WHERE username ILIKE ${sequelize.escape(likeAnywhere(text))})`) } },
            ],
        });
    }
    const n = Math.floor(Number(players));
    if (n >= 2 && n <= 8) and.push(sequelize.where(sequelize.literal(`("map"->>'maxPlayers')::int`), { [Op.gte]: n }));
    const size = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit)) || PAGE));
    const offset = Math.max(0, Math.floor(Number(page)) || 0) * size;
    const { rows, count } = await CustomMap.findAndCountAll({
        where: { [Op.and]: and }, order: SORTS[sort] || SORTS.popular, offset, limit: size,
    });
    const owners = [...new Set(rows.map(r => r.ownerId).filter(Boolean))];
    const authors = new Map(owners.length
        ? (await User.findAll({ where: { id: owners }, attributes: ['id', 'username'] })).map(u => [u.id, u.username]) : []);
    const favs = new Set(viewer && rows.length
        ? (await MapFavorite.findAll({ where: { userId: viewer.id, mapId: rows.map(r => r.id) }, attributes: ['mapId'] })).map(f => f.mapId) : []);
    return {
        maps: rows.map(r => browseEntry(r, authors, favs, viewer)),
        total: count, more: offset + rows.length < count, moderator: isAdmin(viewer),
    };
}

/** A published map from the browser picked to play or to keep: counted like a load by code. */
async function pick(viewer, id) {
    if (!UUID_RE.test(String(id))) return { error: 'Diese Karte gibt es nicht.' };
    const row = await CustomMap.findOne({ where: { id, code: { [Op.ne]: null } } });
    if (!row) return { error: 'Diese Karte ist nicht mehr veröffentlicht.' };
    if (!viewer || row.ownerId !== viewer.id) await row.increment('loads');
    const owner = await User.findByPk(row.ownerId, { attributes: ['username'] });
    return { code: row.code, map: row.map, author: owner ? owner.username : null };
}

/** Mark (on) or unmark a favorite. Only published maps can become one. */
async function setFavorite(user, id, on) {
    if (!UUID_RE.test(String(id))) return { error: 'Diese Karte gibt es nicht.' };
    return sequelize.transaction(async transaction => {
        const row = await CustomMap.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!row) return { error: 'Diese Karte gibt es nicht.' };
        if (on) {
            if (!row.code) return { error: 'Diese Karte ist nicht mehr veröffentlicht.' };
            const [, created] = await MapFavorite.findOrCreate({ where: { userId: user.id, mapId: id }, transaction });
            if (created) await row.increment('favorites', { transaction });
        } else {
            const gone = await MapFavorite.destroy({ where: { userId: user.id, mapId: id }, transaction });
            if (gone) await row.decrement('favorites', { by: gone, transaction });
        }
        await row.reload({ transaction });
        return { fav: !!on, favorites: Math.max(0, row.favorites) };
    });
}

/** A published map for a report (utils/reports.js): its owner, name and a copy of the map. */
async function forReport(id) {
    if (!UUID_RE.test(String(id))) return null;
    const row = await CustomMap.findOne({ where: { id, code: { [Op.ne]: null } } });
    if (!row) return null;
    const owner = await User.findByPk(row.ownerId, { attributes: ['id', 'username'] });
    return { id: row.id, code: row.code, name: row.name, map: row.map, ownerId: row.ownerId, ownerName: owner ? owner.username : '?' };
}

/** Admin: take a map out of the browser (it stays in its owner's account, the code stops working). */
async function adminUnpublish(admin, id) {
    if (!UUID_RE.test(String(id))) return { error: 'Diese Karte gibt es nicht.' };
    const row = await CustomMap.findByPk(id);
    if (!row) return { error: 'Diese Karte gibt es nicht.' };
    if (!row.code) return { ok: true };
    console.log(`[Maps] ${admin.username} unpublished „${row.name}" (${row.code}) of ${row.ownerId}.`);
    Object.assign(row, { code: null, publishedAt: null });
    await row.save();
    return { ok: true };
}

/**
 * The maps without an owner (maps/builtin.js), at server start. Each is created once and left alone
 * after that – an admin who unpublishes one has the last word.
 */
async function seedBuiltin() {
    for (const { id, code, map } of BUILTIN_MAPS) {
        const r = engine.checkCustomMap(map);
        if (r.error) throw new Error(`${map.name}: ${r.error}`);
        await CustomMap.findOrCreate({
            where: { id },
            defaults: { ownerId: null, name: r.map.name, map: r.map, code, publishedAt: new Date() },
        });
    }
}

// ── Account lifecycle (utils/deleteAccount.js, utils/mergeAccounts.js) ────────

/** The account is deleted: its maps go with it (games already played keep their copy in the state). */
async function removeOwner(userId, transaction) {
    const ids = (await CustomMap.findAll({ where: { ownerId: userId }, attributes: ['id'], transaction })).map(r => r.id);
    if (ids.length) await MapFavorite.destroy({ where: { mapId: ids }, transaction });
    // the account's own favorites: the maps they counted for lose one
    for (const f of await MapFavorite.findAll({ where: { userId }, transaction })) {
        await CustomMap.decrement('favorites', { where: { id: f.mapId }, transaction });
        await f.destroy({ transaction });
    }
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
    // favorites: a map both accounts like counts once
    const have = new Set((await MapFavorite.findAll({ where: { userId: intoId }, attributes: ['mapId'], transaction })).map(f => f.mapId));
    for (const f of await MapFavorite.findAll({ where: { userId: fromId }, transaction })) {
        if (have.has(f.mapId)) {
            await CustomMap.decrement('favorites', { where: { id: f.mapId }, transaction });
            await f.destroy({ transaction });
        } else {
            f.userId = intoId;
            await f.save({ transaction });
        }
    }
}

module.exports = {
    list, save, remove, publish, unpublish, byCode,
    browse, pick, setFavorite, forReport, adminUnpublish, seedBuiltin,
    removeOwner, moveOwner, normalizeCode, MAX_MAPS, CODE_LENGTH,
};
