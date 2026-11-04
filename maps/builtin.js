/**
 * Maps that belong to nobody: published for everybody (with a fixed code), listed in the map
 * browser without an author. seedBuiltin (maps/service.js) creates them at server start. The fixed
 * `id` is what tells a map is there already – keep it, even if the map changes.
 *
 * Große Karte: the game's second fixed map until v98, removed from the game in v99. The start
 * points are its four capitals (Wikinger, Russland, England, Griechenland).
 */
module.exports = [
    {
        id: '5f0c1e52-7a3d-4c1b-9a6e-2b8d4f6a1c15',
        code: 'GRKART',
        map: {
            name: 'Große Karte',
            rows: [
                'MMMMMMMMIMMMMMMMMIMMMMMM',
                'MGGGMMMMMMGGGGGWMMMMMGGM',
                'MGGGBMMMGGWGGGGWWMGGGGBM',
                'MMMBBBGWWFFFFGGGWFFFGGGM',
                'MMMMWFFFFFWWWGGWGGGGFGMM',
                'MMMBGBWGWWWWWWGGGBBFGBMM',
                'MMGGGGGGGWWWWWGWGBBBBWMM',
                'MGGGGGGGGGWWWGGGGBGBGMMM',
                'MGGGWGGGWWWWWGGGGBBGFGMM',
                'MMFFGGGGGWFWWWGGFGGGFFMM',
                'IMGGFGGGGWFWWGGGGFGGGGMM',
                'MMBBBGGGWFGWWGWBBFGGGGMM',
                'IMBBWBFFFFGWBWGWGGFFGBMM',
                'MBWBBFWWWWWGGMMMMMMMGGMI',
                'MMMMMMMMMMMMMMMMMMMMMMMM',
            ],
            spawns: [[2, 11], [3, 20], [8, 3], [12, 13]],
        },
    },
];
