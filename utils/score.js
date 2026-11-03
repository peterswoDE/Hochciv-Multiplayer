/**
 * Points of a seat at the end of a multiplayer game or Rundenspiel: the engine's victoryScore
 * (population + wonders + technologies); the winner's is doubled (WIN_FACTOR).
 *
 * These points go into the match history and into the MMR calculation (utils/mmr.js). The game's
 * own tiebreak between several victory claims is not affected – that stays inside the engine.
 * mp.js shows the same number on the end screen (MP.WIN_FACTOR – keep both in step).
 */
const WIN_FACTOR = 2;

/** `score` is what victoryScore returned (or null). */
function finalPoints(score, isWinner) {
    return (score ? score.total : 0) * (isWinner ? WIN_FACTOR : 1);
}

module.exports = { WIN_FACTOR, finalPoints };
