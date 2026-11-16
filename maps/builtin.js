/**
 * Maps that belong to nobody: published for everybody (with a fixed code), listed in the map
 * browser without an author. seedBuiltin (maps/service.js) creates them at server start. The fixed
 * `id` is what tells a map is there already – keep it, even if the map changes.
 *
 * Große Karte: the game's second fixed map until v98, removed from the game in v99. The start
 * points are its four capitals (Wikinger, Russland, England, Griechenland).
 *
 * Originalkarte: the game's classic map (MAP_ORIGINAL in HochCiv/js/data.js), taken out of the map
 * selection on 2026-11-16. As a custom map its start points belong to no nation – any nation can
 * start on any of them. They are its four capitals in the classic turn order (Russland,
 * Griechenland, England, Wikinger). mapKey '0' still works for running games, the weekly challenge
 * and older clients.
 */
module.exports = [
    {
        id: '0a62b593-0564-428d-aae1-10c7fe28a305',
        code: 'URKART',
        map: {
            name: 'Originalkarte',
            rows: [
                'MIMMBBWBGGWWWWWWWM',
                'MMMBBWGGWMMWWWFWWB',
                'MMMMMGGWMMGWWWWFWB',
                'MMGGMMGFGFWWWGGWWB',
                'MMGGMGFGGGWWWWGGFB',
                'MMGGMGFGGGBWWGGGFM',
                'MMMGFGBBGBBGGFGGGM',
                'MMGFGGBGGGFFFFGGGG',
                'MGGBGMGFGGGGGMMMBB',
                'MFGGMMMGGMGGGMMGGB',
                'MGGGMMMMGMMGGMIGGM',
                'MGGMMMMIMIMIMIMMGM',
            ],
            spawns: [[4, 15], [9, 10], [5, 3], [1, 8]],
        },
    },
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
