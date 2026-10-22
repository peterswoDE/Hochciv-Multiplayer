/**
 * Points of a seat at the end of a multiplayer game or Rundenspiel: the engine's victoryScore
 * (population + wonders + technologies) plus a fixed bonus for the winner.
 *
 * These points go into the match history and into the MMR calculation (utils/mmr.js). The game's
 * own tiebreak between several victory claims is not affected – that stays inside the engine.
 * mp.js shows the same number on the end screen (MP.WIN_BONUS – keep both in step).
 */
const WIN_BONUS = 10;

/** `score` is what victoryScore returned (or null). */
function finalPoints(score, isWinner) {
    return (score ? score.total : 0) + (isWinner ? WIN_BONUS : 0);
}

module.exports = { WIN_BONUS, finalPoints };
