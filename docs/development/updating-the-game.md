[← Documentation](../README.md)

# Updating the game

The game in `HochCiv/` is upstream [timooom-hash/Hochciv](https://github.com/timooom-hash/Hochciv) plus the multiplayer extension (more empires, KI seats, custom maps, viewer hooks for `mp.js`, …). The extension lives on a branch of the game repository, `multiplayer-on-<version>`, which is **not** pushed upstream. The server repository only receives the built result.

## Steps

1. **Find what production runs.** `git fetch`, then look at `origin/main:HochCiv/js/data.js` (`APP_VERSION`). Never start from a stale local branch – a version may have been released in between.
2. **Bring the extension onto the new release** in the game repository:
   ```bash
   git fetch origin
   git switch -c multiplayer-on-v<new> multiplayer-on-v<old>
   git merge origin/main          # or rebase the extension commits onto origin/main
   ```
   A single merge resolves all conflicts at once; a rebase resolves them per extension commit. Typical conflicts are in `js/ui.js`, `smoke.js`, `js/i18n.js`, `sw.js` and the notes (`ANNAHMEN.md`, `UEBERGABE.md`): usually both sides are kept.
3. **Version and cache list.** Keep upstream's version number. `sw.js` must list every file the game loads (new upstream files *and* the extension's favicons). Then run `node tools_version.js v<new>`, which writes `VERSION` and `BUILD_HASH` in `sw.js` and `APP_VERSION` in `js/data.js`.
4. **Game tests** in the game repository: `node test.js` and `node smoke.js` (and `node check_single.js` for the single-file build). `smoke.js` and `check_single.js` need `jsdom`, which the game repository does not install – install it somewhere outside and point `NODE_PATH` at its `node_modules`. `test.js` also fails when a translation key is no longer used anywhere.
5. **Copy into the server** on a branch from `origin/development`:
   ```bash
   git rm -rq HochCiv && rm -rf HochCiv && mkdir HochCiv
   (cd ../Hochciv && git archive multiplayer-on-v<new>) | tar -x -C HochCiv
   ```
   `git status` should then show only the game files that changed upstream.
6. **Check the server side.** If upstream added a rule file that the server needs, add it to `FILES` in `engine-adapter.js` (DOM-only files such as `tutorial.js`, `ui.js`, `firstgame.js` are not loaded there). Run `node scripts/build-public.js`.
7. **Server tests** against the local Docker setup ([Testing](testing.md)): at least `tests/mobile`, `tests/layout`, `tests/i18n`, plus the game-flow tests (`match`, `replay`, `rematch`, `summary`, `spectators`, `admin/running-games`). The mobile layer relies on ids, classes and functions of the game, so `tests/mobile/mobile.test.js` must pass after **every** game update.
8. Commit, PR into `development`, test on staging ([Branches and release flow](release-flow.md)).

## Keeping or dropping an old version

Running Rundenspiele are not affected by a new version only if their version is kept. Before replacing `HochCiv/`, check in the admin tab *Laufende Spiele* which versions running games use.

**To keep the version** that production runs now, copy the old `HochCiv/` to `HochCiv-<version>/` before replacing it and add it everywhere the other old versions appear:

* `GAME_DIRS` in `engine-adapter.js`
* `GAMES` in `scripts/build-public.js`
* `OLD_VERSIONS` in `mp.js`
* the volumes in `docker-compose.local.yml`
* the version lists in this documentation ([How it works](../overview/how-it-works.md))

**To drop it** (no running game uses it), just replace `HochCiv/`. An old `HochCiv-<version>/` folder that no running game needs any more can be removed together with those entries.

## History

| Version | Server PR | Kept old versions |
|---|---|---|
| v88 | #19 | v87, v83 |
| v91 | #21 | v88, v87, v83 |
| v93 | #48 | v88, v87, v83 (v91 dropped – no running games) |
| v96 | – | v93, v88, v83 (v87 dropped – no running games) |
