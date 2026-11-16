/**
 * Nation draft and turn positions (F34): utils/civdraft.js and the engine side (seatOrder,
 * start points by position). Runs without the docker setup:
 *
 *   node tests/draft/civdraft.test.js
 *
 * Covered: the modes of old and new configs, positions (wishes, a position asked for twice,
 * random), the draft's order (last mover picks first), its pool on a fixed map (each nation
 * once) and on a free map (each at most ⌈empires/4⌉ times), the random draft's pool (one per
 * empire, repeats allowed, ability dealt), refused picks, KI and forced picks, and that the
 * engine of every kept version plays the seats in position order and starts position n on a
 * custom map's start point n.
 */
const CD = require('../../utils/civdraft');
const engine = require('../../engine-adapter');
const builtin = require('../../maps/builtin');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const CIVS = engine.getEngine().CIVS;

// ── 1. Modes ─────────────────────────────────────────────────────────────────────
ok(JSON.stringify(CD.modesOf({})) === '{"civMode":"fixed","turnOrder":"classic"}', 'no setting: everybody picks, classic order');
ok(CD.modesOf({ randomCivs: true }).civMode === 'random', 'a lobby from before F34: randomCivs is the random mode');
ok(CD.modesOf({ civMode: 'random' }).turnOrder === 'classic', 'a Rundenspiel from before F34 (civMode random) keeps the classic order');
ok(CD.modesOf({ civMode: 'draft', turnOrder: 'classic' }).turnOrder === 'random', 'a draft never has the classic order (it needs positions first)');
ok(CD.modesOf({ civMode: 'draft', turnOrder: 'pick' }).turnOrder === 'pick', 'a draft with picked positions');
ok(CD.modesOf({ civMode: 'nonsense', turnOrder: 'x' }).civMode === 'fixed', 'unknown values fall back');

// ── 2. Positions ─────────────────────────────────────────────────────────────────
{
    const perm = CD.arrange(4, 'pick', [2, null, 0, null], seeded(3));
    ok(perm[2] === 0 && perm[0] === 2 && new Set(perm).size === 4, 'pick: wishes are kept, the rest fills the free positions', JSON.stringify(perm));
    const twice = CD.arrange(3, 'pick', [1, 1, null], seeded(5));
    ok(twice[1] === 0 && new Set(twice).size === 3, 'a position asked for twice goes to the first who asked', JSON.stringify(twice));
    const out = CD.arrange(3, 'pick', [7, -1, 'x'], seeded(9));
    ok(new Set(out).size === 3, 'invalid wishes are dealt at random');
    const firsts = new Set();
    for (let s = 0; s < 200; s++) firsts.add(CD.arrange(4, 'random', [0, 1, 2, 3], Math.random)[0]);
    ok(firsts.size === 4, 'random: wishes do not count, everybody can be first', [...firsts].join(','));
}

// ── 3. Draft on a fixed map ──────────────────────────────────────────────────────
{
    const rnd = seeded(11);
    const D = CD.newDraft({ mode: 'draft', n: 4, civs: CIVS, uniqueCivs: true, rnd });
    ok(JSON.stringify(D.order) === '[3,2,1,0]', 'reverse turn order: the last to move picks first');
    ok(D.pool.length === 4 && D.pool.every(e => e.left === 1 && e.ability === null), 'fixed map: every nation once, no ability yet');
    ok(CD.pick(D, 0, 'england', null, CIVS, rnd) === 'Du bist nicht dran.', 'only the seat whose pick it is');
    ok(CD.pick(D, 3, 'england', 'quatsch', CIVS, rnd) === 'Diese Fähigkeit gibt es bei dieser Nation nicht.', 'an ability of another nation is refused');
    const ab = CIVS.find(c => c.k === 'england').abilities[1].k;
    ok(CD.pick(D, 3, 'england', ab, CIVS, rnd) === null && D.picks[3].civ === 'england' && D.picks[3].ability === ab, 'a pick with nation and ability');
    ok(CD.pick(D, 2, 'england', null, CIVS, rnd) === 'Diese Nation ist nicht mehr zu haben.', 'a taken nation is gone');
    CD.pick(D, 2, 'russland', null, CIVS, rnd);
    ok(D.picks[2].ability && CIVS.find(c => c.k === 'russland').abilities.some(a => a.k === D.picks[2].ability), 'no ability given: a random one of that nation');
    // seat 1 is KI: settle picks for it, then stops at the human seat 0 (still two abilities to choose)
    CD.settle(D, CIVS, rnd, seat => seat === 1);
    ok(D.picks[1] && CD.current(D) === 0, 'the KI picks on its own, then it is the next human\'s pick');
    ok(D.pool.filter(e => e.left).length === 1, 'the first to move gets what is left');
    CD.settle(D, CIVS, rnd, () => false);
    ok(CD.current(D) === 0, 'in a draft the last one still picks the ability');
    CD.pick(D, 0, D.pool.find(e => e.left).id, null, CIVS, rnd);
    ok(CD.done(D) && new Set(Object.values(D.picks).map(p => p.civ)).size === 4, 'done: four different nations');
    ok(CD.pick(D, 0, 'england', null, CIVS, rnd) === 'Der Draft ist vorbei.', 'no pick after the end');
}

// ── 4. Draft on a free map: each nation at most ⌈empires/4⌉ times ───────────────
{
    const D = CD.newDraft({ mode: 'draft', n: 6, civs: CIVS, uniqueCivs: false, rnd: seeded(2) });
    ok(D.pool.every(e => e.left === 2), 'six empires: every nation twice', JSON.stringify(D.pool.map(e => e.left)));
    const D3 = CD.newDraft({ mode: 'draft', n: 3, civs: CIVS, uniqueCivs: false, rnd: seeded(2) });
    ok(D3.pool.every(e => e.left === 1), 'three empires: every nation once');
    const rnd = seeded(4);
    for (let i = 0; i < 6; i++) CD.autoPick(D, CIVS, rnd);
    const count = {};
    Object.values(D.picks).forEach(p => { count[p.civ] = (count[p.civ] || 0) + 1; });
    ok(CD.done(D) && Object.values(count).every(c => c <= 2), 'nobody gets a nation a third time', JSON.stringify(count));
}

// ── 5. Random draft ──────────────────────────────────────────────────────────────
{
    let repeats = false;
    for (let s = 1; s < 30 && !repeats; s++) {
        const D = CD.newDraft({ mode: 'randomDraft', n: 4, civs: CIVS, uniqueCivs: false, rnd: seeded(s) });
        repeats = new Set(D.pool.map(e => e.civ)).size < 4;
    }
    ok(repeats, 'free map: a nation can come twice');
    const rnd = seeded(8);
    const D = CD.newDraft({ mode: 'randomDraft', n: 5, civs: CIVS, uniqueCivs: false, rnd });
    ok(D.pool.length === 5 && D.pool.every(e => e.left === 1 && CIVS.find(c => c.k === e.civ).abilities.some(a => a.k === e.ability)),
        'one nation per empire, each with a dealt ability', JSON.stringify(D.pool));
    const e = D.pool[2];
    const other = CIVS.find(c => c.k === e.civ).abilities.find(a => a.k !== e.ability).k;
    CD.pick(D, 4, e.id, other, CIVS, rnd);
    ok(D.picks[4].ability === e.ability, 'random draft: the ability is the dealt one, not a chosen one');
    const U = CD.newDraft({ mode: 'randomDraft', n: 4, civs: CIVS, uniqueCivs: true, rnd: seeded(3) });
    ok(new Set(U.pool.map(x => x.civ)).size === 4, 'fixed map: four different nations');
    // the last pick is made for the first mover
    for (let i = 0; i < 3; i++) CD.autoPick(U, CIVS, rnd);
    CD.settle(U, CIVS, rnd, () => false);
    ok(CD.done(U) && U.picks[0], 'random draft: the first to move gets the last nation without picking');
    const M = CD.newDraft({ mode: 'draft', n: 4, civs: CIVS, uniqueCivs: true, noAbility: true, rnd });
    CD.pick(M, 3, 'england', 'x', CIVS, rnd);
    ok(M.picks[3].ability === 'basis', 'Marathon: no ability in the nation draft (drafted afterwards)');
    const P = CD.payload(M);
    P.pool[0].left = 99;
    ok(M.pool[0].left !== 99 && P.cur === 2, 'the payload is a copy with whose pick it is');
}

// ── 6. Engine: turn order by position, start points by position ──────────────────
const versions = [['current', engine]].concat((engine.OLD_VERSIONS || []).map(v => [v, engine.forVersion(v)]));
const urkart = builtin.find(m => m.code === 'URKART').map;
for (const [v, eng] of versions) {
    const players = ['wikinger', 'england', 'russland', 'griechenland'].map((civ, i) => ({ civ, kind: 'human', ability: 'basis', name: 'P' + i }));
    const mk = (cfg, list) => eng.createGame({ gameConfig: Object.assign({ playerCount: 4, seed: 7 }, cfg), players: list || players });
    const seat = mk({ mapKey: 'eigene', customMap: urkart, turnOrder: 'pick' });
    ok(seat.players.map(p => p.slot).join() === '0,1,2,3' && seat.cur === 0, `${v}: positions – the seats move in their order`, seat.players.map(p => p.civ).join());
    const caps = seat.players.map((p, i) => seat.cities.find(c => c.owner === i && c.cap)).map(c => [c.r, c.c]);
    ok(JSON.stringify(caps) === JSON.stringify(urkart.spawns), `${v}: position n starts on start point n`, JSON.stringify(caps));
    const classic = mk({ mapKey: 'eigene', customMap: urkart });
    ok(classic.players.map(p => p.civ).join() === 'russland,griechenland,england,wikinger', `${v}: classic order follows the nations`);
    const drafted = mk({ mapKey: 'eigene', customMap: urkart, civMode: 'draft' });
    ok(drafted.players.map(p => p.slot).join() === '0,1,2,3', `${v}: a draft plays by position`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
