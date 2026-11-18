#!/usr/bin/env python3
"""Baut hochzeivilization-einzeldatei.html: css + js inline in index.html.
Welche Skripte in welcher Reihenfolge, steht nur in index.html (v102) – hier wird jedes
<script src="…"> durch seinen Inhalt ersetzt."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'index.html').read_text()

css = (root/'css/style.css').read_text()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n'+css+'\n</style>')

skripte = re.findall(r'<script src="([^"]+)"></script>', html)
for js in skripte:
    code = (root/js).read_text()
    html = html.replace(f'<script src="{js}"></script>', '<script>\n'+code+'\n</script>')

# Service Worker und Manifest gibt es in der Einzeldatei nicht
html = html.replace('<link rel="manifest" href="manifest.webmanifest">','')
sw_aufruf = "if ('serviceWorker' in navigator) swStart();"
assert html.count(sw_aufruf) == 1, 'Aufruf des Service Workers nicht gefunden (boot.js)'
html = html.replace(sw_aufruf, "/* Einzeldatei: kein Service Worker */")
assert 'src="js/' not in html and 'href="css/' not in html, 'nicht alles inline'
out = root/'hochzeivilization-einzeldatei.html'
out.write_text(html)
print('build   ok ·', len(skripte), 'Skripte ·', len(html), 'Zeichen')
