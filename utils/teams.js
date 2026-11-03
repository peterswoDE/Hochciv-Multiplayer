/**
 * Team mode (F22). The game has no alliances, so the server adds them without changing the game
 * files (the engine is patched at runtime, like mp.js patches the page):
 *
 *   • S.mpTeams – one team number per state index (null: barbarians, no team).
 *   • No friendly fire: in an empire's combat phase its teammates' cities and armies count as
 *     its own (they are neither besieged nor flanked; they help to besiege and flank, like
 *     allies). The power stays the one from the start of the phase (as the engine does since
 *     v94), so teammates' cities don't raise it.
 *   • Shared victory: when an empire wins, its whole team wins (expandWin).
 *
 * Team games are humans only (no KI seats): the KI knows no allies and would march on its
 * teammates' cities.
 */

/** Wrap the engine's combat phase (once per engine sandbox). */
function patchEngine(E) {
    if (!E || E.__mpTeamsPatched || typeof E.combatPhase !== 'function' || typeof E.powerOf !== 'function') return false;
    const combat = E.combatPhase, power = E.powerOf;
    E.combatPhase = function (S, pi, rec) {
        const teams = S && S.mpTeams;
        if (!Array.isArray(teams) || teams[pi] == null) return combat(S, pi, rec);
        const team = teams[pi];
        const fixed = S.players.map((_, i) => power(S, i));      // before anything is swapped
        const swapped = [];
        for (const list of [S.cities, S.armies]) {
            for (const o of list || []) {
                if (o.owner !== pi && o.owner != null && teams[o.owner] === team) { swapped.push([o, o.owner]); o.owner = pi; }
            }
        }
        E.powerOf = (S2, i) => (S2 === S && fixed[i] != null ? fixed[i] : power(S2, i));
        try {
            return combat(S, pi, rec);
        } finally {
            E.powerOf = power;
            for (const [o, owner] of swapped) o.owner = owner;
        }
    };
    E.__mpTeamsPatched = true;
    return true;
}

/** The teams of the state's empires from the lobby players' `team` (index → team or null). */
function attach(S, teamOfStateIndex) {
    S.mpTeams = S.players.map((p, i) => (p.kind === 'barbar' ? null : teamOfStateIndex(i)));
    return S.mpTeams;
}

const sameTeam = (S, a, b) => !!(S && Array.isArray(S.mpTeams) && S.mpTeams[a] != null && S.mpTeams[a] === S.mpTeams[b]);

/** S.over of a team game: every member of a winner's team wins as well. */
function expandWin(S) {
    if (!S || !S.over || !Array.isArray(S.mpTeams) || S.over.teamWin) return S && S.over;
    const won = new Set((S.over.winners || []).map(i => S.mpTeams[i]).filter(t => t != null));
    if (!won.size) return S.over;
    S.over.winners = S.players.map((_, i) => i).filter(i => won.has(S.mpTeams[i]));
    S.over.teamWin = [...won];
    S.over.shared = S.over.winners.length > 1;
    return S.over;
}

/** Team letter for texts: 0 → 'A'. */
const letter = t => String.fromCharCode(65 + t);

module.exports = { patchEngine, attach, sameTeam, expandWin, letter };
