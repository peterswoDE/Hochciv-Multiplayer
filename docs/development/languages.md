[← Documentation](../README.md)

# Languages

Everything this server adds follows the game's language buttons (🇩🇪/🇬🇧): menus, lobby, Rundenspiele, player profile, login and account pages including the admin tabs, and the messages the server sends back.

## How it works

German is the source text and the key; the English is in the table `EN` in `client/i18n.js` – the same scheme as the game's own `T()`.

| Where | Function |
|---|---|
| `mp.js` and the other game-page scripts | `TX('…')` |
| account page (`client/account.js`) | `tx('…')` for texts, `txs()` for server messages |
| server messages shown in the client | `HC_I18N.tr(msg)` |

Numbers and names inside a server message stay as they are; the rest is translated by the table.

`client/i18n.js` is loaded on the game page before `profile.js` and `mp.js` (see `inject.js`), and on the account page (`client/account.html`) and the portal page (`client/index.html`).

## Adding a text

1. Write the German text in the code, wrapped in `TX()` / `tx()`.
2. Add its line to `EN` in `client/i18n.js`.
3. Run `tests/i18n/english.test.js` – it walks all screens in English and fails on German left over ([Testing](testing.md)).

## What stays German

The legal pages (Impressum, Datenschutzerklärung, Nutzungsbedingungen) and the e-mails.
