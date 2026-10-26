#!/usr/bin/env python3
"""Baut hochzeivilization-einzeldatei.html: css + js inline in index.html."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'index.html').read_text()

css = (root/'css/style.css').read_text()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n'+css+'\n</style>')

for js in ['js/data.js','js/civs.js','js/i18n.js','js/hex.js','js/tiles.js','js/engine.js','js/expansion.js','js/bots.js','js/ki.js','js/marathon.js','js/tutorial.js','js/ui.js']:
    code = (root/js).read_text()
    html = html.replace(f'<script src="{js}"></script>', '<script>\n'+code+'\n</script>')

# Service Worker und Manifest gibt es in der Einzeldatei nicht
html = html.replace('<link rel="manifest" href="manifest.webmanifest">','')
html = html.replace("if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });","/* Einzeldatei: kein Service Worker */")
assert 'src="js/' not in html and 'href="css/' not in html, 'nicht alles inline'
out = root/'hochzeivilization-einzeldatei.html'
out.write_text(html)
print('geschrieben:', out.name, len(html), 'Zeichen')
