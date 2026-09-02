/**
 * Calculates the new MMR for players based on their relative placement and point differentials.
 * @param {Array<{ dbUserId: string, mmr: number, points: number }>} players
 * @returns {Array<{ dbUserId: string, oldMmr: number, mmrChange: number, newMmr: number }>}
 */
function calculateMMR(players) {
    const results = players.map(p => ({
        ...p,
        mmrChange: 0
    }));

    const N = players.length;
    if (N <= 1) return results;

    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const A = results[i];
            const B = results[j];

            const diff = Math.abs(A.points - B.points);

            // Base K is 16. We scale the K factor using the square root of the points difference.
            // E.g., a 100 point difference adds ~10 to K.
            // We multiply by (2 / N) so that a 4-player game doesn't drastically over-inflate MMR compared to a 2-player game.
            const K = (16 + Math.sqrt(diff) * 2) * (2 / N);

            // Expected win chance (standard Elo)
            const E_A = 1 / (1 + Math.pow(10, (B.mmr - A.mmr) / 400));
            const E_B = 1 / (1 + Math.pow(10, (A.mmr - B.mmr) / 400));

            // Actual outcome score
            let S_A = 0.5;
            let S_B = 0.5;
            if (A.points > B.points) { S_A = 1; S_B = 0; }
            else if (A.points < B.points) { S_A = 0; S_B = 1; }

            A.mmrChange += K * (S_A - E_A);
            B.mmrChange += K * (S_B - E_B);
        }
    }

    return results.map(r => ({
        dbUserId: r.dbUserId,
        oldMmr: r.mmr,
        mmrChange: Math.round(r.mmrChange),
        newMmr: Math.max(0, r.mmr + Math.round(r.mmrChange))
    }));
}

module.exports = { calculateMMR };
