/**
 * Bad language in chat texts (auto-report, utils/reports.js). The matching is done by the
 * `obscenity` library: it sees through l33t speak, look-alike characters and repeated letters
 * ("sh1t", "Wiiichser") and knows the usual false hits ("assassin", "Bassist").
 *
 * What counts:
 *   · English: obscenity's own list (englishDataset);
 *   · German: the LDNOOBW list from `naughty-words`, without the words that are harmless in a
 *     game (DE_SKIP), plus a few common ones it lacks (DE_EXTRA). Whole words only, so "arsch"
 *     doesn't hit "Marsch". German words the English list would hit are allowed (DE_ALLOW);
 *   · the admins' entries in banned_words (models/BannedWord.js): more words to ban, as a whole
 *     word or anywhere in a word, and words to allow.
 * Texts and words are compared in lower case with ä/ö/ü/ß written out (ae, oe, ue, ss).
 */
const {
    DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, parseRawPattern,
} = require('obscenity');
const naughty = require('naughty-words');
const { BannedWord } = require('../models');

// In the German list but no reason to mute someone in a game chat
const DE_SKIP = new Set([
    'bonze', 'dödel', 'fratze', 'ische', 'kimme', 'lümmel', 'mufti', 'nackt', 'nippel', 'orgasmus',
    'penis', 'pinkeln', 'popel', 'porno', 'reudig', 'rosette', 'schiesser', 'schnackeln',
]);
// Common German swear words the list lacks: [word, 'word' | 'part']
const DE_EXTRA = [
    ['scheiss', 'part'], ['scheisse', 'part'], ['hurensohn', 'part'], ['missgeburt', 'word'],
    ['spast', 'word'], ['spasti', 'word'], ['wixer', 'word'], ['wichser', 'part'], ['arschloch', 'part'],
    ['fotze', 'part'], ['schlampe', 'part'], ['nazi', 'word'], ['heil hitler', 'part'], ['fick', 'part'],
    ['mongo', 'word'],
];
// German words the English list would hit ("dick" is thick, a Fagott an instrument). Allowing
// "dick" lets the English insult through too – in a German game the word is far more common.
const DE_ALLOW = [
    'dick', 'dicke', 'dicken', 'dicker', 'dickes', 'dickicht', 'dickkopf', 'fagott', 'analphabet',
    'assel', 'asseln', 'wankelmotor', 'wanken', 'wankt', 'schwanken', 'schwankt', 'schwankend',
];

const MAX_WORD = 60;
const KINDS = ['ban', 'allow'];
const MATCHES = ['word', 'part'];

const normalize = s => String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
// characters with a meaning in obscenity's pattern syntax
const escape = w => w.replace(/[\\[\]?|]/g, m => '\\' + m);

let state = null;           // { matcher, dataset } – rebuilt when the admins change the list

function build(entries) {
    const dataset = new DataSet().addAll(englishDataset);
    const add = (word, match, source) => {
        const w = normalize(word).trim();
        if (!w) return;
        const raw = match === 'part' ? escape(w) : `|${escape(w)}|`;
        dataset.addPhrase(p => p.setMetadata({ originalWord: w, source }).addPattern(parseRawPattern(raw)));
    };
    for (const w of naughty.de) if (!DE_SKIP.has(w.toLowerCase())) add(w, 'word', 'de');
    for (const [w, match] of DE_EXTRA) add(w, match, 'de');
    const allowed = DE_ALLOW.slice();
    for (const e of entries) {
        if (e.kind === 'allow') allowed.push(normalize(e.word));
        else add(e.word, e.match, 'admin');
    }
    const built = dataset.build();
    const matcher = new RegExpMatcher({
        ...built,
        ...englishRecommendedTransformers,
        // the English list allows "fick" (harmless in English) – not in a German chat
        whitelistedTerms: built.whitelistedTerms.filter(w => w !== 'fick').concat(allowed),
    });
    return { matcher, dataset };
}

/** (Re)load the admins' entries. Called at the start and after every change. */
async function reload() {
    const entries = await BannedWord.findAll({ attributes: ['word', 'kind', 'match'] });
    state = build(entries);
}

/**
 * The bad words in `text` (normalized, unique), [] if there are none. Checked as typed and with
 * punctuation as spaces: the library's word ends don't see "Hurensohn!!", but "sh!t" needs the "!".
 */
function check(text) {
    if (!state) state = build([]);
    const t = normalize(text);
    const found = new Set();
    for (const variant of [t, t.replace(/[!?.,;:"'()«»„“”‚‘’\-–—_/\\*#~+=<>^]/g, ' ')]) {
        for (const m of state.matcher.getAllMatches(variant)) {
            found.add(state.dataset.getPayloadWithPhraseMetadata(m).phraseMetadata.originalWord);
        }
    }
    return [...found];
}

// ── Admin list ─────────────────────────────────────────────────────────────────────────────

async function list() {
    const rows = await BannedWord.findAll({ order: [['kind', 'ASC'], ['word', 'ASC']] });
    return rows.map(r => ({ id: r.id, word: r.word, kind: r.kind, match: r.match, addedBy: r.addedBy, createdAt: r.createdAt }));
}

/** Returns null or an error (German, translated by the client). */
async function add({ word, kind, match }, admin) {
    const w = normalize(word).replace(/\s+/g, ' ').trim();
    if (!w || w.length > MAX_WORD) return `Ein Wort mit 1 bis ${MAX_WORD} Zeichen.`;
    if (!KINDS.includes(kind) || !MATCHES.includes(match)) return 'Ungültige Angaben.';
    if (await BannedWord.findOne({ where: { word: w } })) return 'Das Wort steht schon in der Liste.';
    await BannedWord.create({ word: w, kind, match: kind === 'allow' ? 'word' : match, addedBy: admin.username });
    await reload();
    return null;
}

async function remove(id) {
    const n = await BannedWord.destroy({ where: { id } }).catch(() => 0);
    await reload();
    return n ? null : 'Eintrag nicht gefunden.';
}

module.exports = { check, reload, list, add, remove, normalize, DE_SKIP, DE_EXTRA, DE_ALLOW };
