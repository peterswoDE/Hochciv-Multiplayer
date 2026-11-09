[← Documentation](../README.md)

# Mobile layer

`client/mobile/` (`mobile.css` and `mobile.js`, added to `index.html` by `inject.js` after `mp.js`) makes the game usable on phones without changing the game files. It is used by the website on phones and by the Android app.

## What it does

* **Zoomable maps on every screen size** (game, start tile, draft, editor): pinch, drag, mouse wheel, and buttons + / − / ⌖ (whole map ↔ own capital). In the map editor one finger paints – the layer asks the game's `edOwnsDrag()` – unless the editor's *Verschieben* tool is on (or the space bar is held); two fingers always zoom and move. Maps start zoomed in far enough that a hex is a touch target (44 px), unless the whole map already gives ≥ 36 px hexes (tablets).
* **Narrow screens** (`html.w-narrow` from the game, < 600 px):
  * **Aktionsleiste** (v100 and older, whose bar has seven buttons): "4 + Mehr" – *Fähigkeiten*, *Welt* and *Protokoll* move into a small menu, which still works while `mp.js` waits for other players. Since v102 the bar has five buttons and is left as it is.
  * **Technologiebogen:** one tab per column.
  * **Kopfzeile:** compact; readable log.
  * **`mp.js` widgets:** fitted to the screen.
* **Selected field:** stays visible next to its sheet.
* **Short screens:** dialogs use the full height, and the editor starts with its settings folded.
* **Tutorial** (v101 and older): highlighted fields are brought into view.
* **Turned page:** since v102 the game always turns itself sideways on a phone held upright (`html.turn`, the body rotated by 90°), in the browser and in the Android app. The layer converts pointer positions and rects into the page's own frame (`frame`, `pt` in `mobile.js`), so dragging, pinching and the field next to its sheet follow the finger. In a game held upright the page is wide, so the narrow-screen items above apply to the menu, not the game. Media queries measure the unturned screen – rules for phones that must not apply to a turned page are scoped with `html:not(.turn)` (see the lobby styles in `mp.js`).

## Dependencies on the game

The layer wraps a few game functions (`drawMap`, `openTile`, `editorScreen`) and relies on some ids and classes of the game. The list is at the top of `mobile.js`.

**After every game update**, run the interaction tests in `tests/mobile/mobile.test.js` ([Testing](testing.md)) – a renamed id or function in the game breaks the layer silently otherwise.
