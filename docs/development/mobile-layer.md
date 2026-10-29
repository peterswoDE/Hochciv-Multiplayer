[← Documentation](../README.md)

# Mobile layer

`client/mobile/` (`mobile.css` and `mobile.js`, added to `index.html` by `inject.js` after `mp.js`) makes the game usable on phones without changing the game files. It is used by the website on phones and by the Android app.

## What it does

* **Zoomable maps on every screen size** (game, start tile, draft, editor): pinch, drag, mouse wheel, and buttons + / − / ⌖ (whole map ↔ own capital). Maps start zoomed in far enough that a hex is a touch target (44 px), unless the whole map already gives ≥ 36 px hexes (tablets).
* **Narrow screens** (`html.w-narrow` from the game, < 600 px):
  * **Aktionsleiste:** "4 + Mehr" – *Fähigkeiten*, *Welt* and *Protokoll* move into a small menu, which still works while `mp.js` waits for other players.
  * **Technologiebogen:** one tab per column.
  * **Kopfzeile:** compact; readable log.
  * **`mp.js` widgets:** fitted to the screen.
* **Selected field:** stays visible next to its sheet.
* **Short screens:** dialogs use the full height, and the editor starts with its settings folded.
* **Tutorial:** highlighted fields are brought into view.

## Dependencies on the game

The layer wraps a few game functions (`drawMap`, `openTile`, `editorScreen`) and relies on some ids and classes of the game. The list is at the top of `mobile.js`.

**After every game update**, run the interaction tests in `tests/mobile/mobile.test.js` ([Testing](testing.md)) – a renamed id or function in the game breaks the layer silently otherwise.
