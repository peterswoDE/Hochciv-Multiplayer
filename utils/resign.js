/**
 * Resigning (F16) – shared by live games (sockets/game.js) and Rundenspiele (async/logic.js).
 *
 * The seat of a player who resigns goes to the KI for the rest of the game. Two cases end the
 * game right away instead:
 *  - the game began without KI seats and one human is left: that human wins;
 *  - nobody human is left: the empire with the most points wins (a game of KI seats only
 *    would otherwise run on with nobody watching).
 */

/** A resign in a ranked game costs as much as the KI takeover of a Rundenspiel (async/logic.js). */
const MMR_PENALTY = 15;

const LOG_TEXT = '%s gibt auf – die KI spielt das Reich weiter.';

/** Barbarians and dead empires are out of the game. */
const inGame = (S, i) => !!S.players[i] && !S.players[i].dead && S.players[i].kind !== 'barbar';

/**
 * @param {object} E          the engine (victoryScore)
 * @param {object} S          the game state
 * @param {number[]} humans   state indices still played by humans (not resigned)
 * @param {boolean} startedWithKi  any seat was KI or bot from the start
 * @returns {object|null}     an S.over to set, or null when the game goes on
 */
function endAfterResign(E, S, humans, startedWithKi) {
    if (S.over) return null;
    const left = humans.filter(i => inGame(S, i));
    // team mode (utils/teams.js): everyone left is in one team – that team wins
    const teams = Array.isArray(S.mpTeams) ? S.mpTeams : null;
    if (teams && left.length > 1 && !startedWithKi && left.every(i => teams[i] === teams[left[0]])) {
        return { winner: left[0], winners: left, resign: true, how: 'Alle anderen haben aufgegeben' };
    }
    if (left.length === 1 && !startedWithKi) {
        return { winner: left[0], winners: [left[0]], resign: true, how: 'Alle anderen haben aufgegeben' };
    }
    if (left.length === 0) {
        const score = i => { try { return (E.victoryScore(S, i) || {}).total || 0; } catch (_) { return 0; } };
        const all = S.players.map((_, i) => i).filter(i => inGame(S, i));
        if (!all.length) return null;
        const best = Math.max(...all.map(score));
        const winners = all.filter(i => score(i) === best);
        return { winner: winners[0], winners, resign: true, how: 'Alle Spieler haben aufgegeben – Punktvergleich' };
    }
    return null;
}

/** A line in the game log, so everyone sees who resigned (also later, in a Rundenspiel). */
function logResign(E, S, name) {
    if (typeof E.log === 'function') E.log(S, 'head', LOG_TEXT.replace('%s', name));
}

module.exports = { endAfterResign, logResign, LOG_TEXT, MMR_PENALTY };
