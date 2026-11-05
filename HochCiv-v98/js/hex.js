/* Hexraster – spitze Ecke oben ("pointy top"), Zeilen versetzt (odd-r).
   Würfelrichtungen wie im Regelheft: 1=rechts, 2=rechts unten, 3=links unten,
   4=links, 5=links oben, 6=rechts oben (im Uhrzeigersinn). */

const DIR_NAMES = ['Osten', 'Südosten', 'Südwesten', 'Westen', 'Nordwesten', 'Nordosten'];

// [dr, dc] je Richtung, getrennt für gerade/ungerade Zeilen
const DIRS_EVEN = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]];
const DIRS_ODD = [[0, 1], [1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1]];

const key = (r, c) => r + ',' + c;
const unkey = s => s.split(',').map(Number);

function neighbor(r, c, dir) {
  const d = (r & 1) ? DIRS_ODD[dir] : DIRS_EVEN[dir];
  return [r + d[0], c + d[1]];
}
function neighbors(r, c) {
  const out = [];
  for (let d = 0; d < 6; d++) out.push(neighbor(r, c, d));
  return out;
}
function toCube(r, c) {
  const x = c - (r - (r & 1)) / 2;
  const z = r;
  return [x, -x - z, z];
}
function hexDistance(r1, c1, r2, c2) {
  const a = toCube(r1, c1), b = toCube(r2, c2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
/* Liegen a und b einander gegenüber, gespiegelt an m? In Würfelkoordinaten heißt das
   genau a + b = 2·m – auf allen drei Achsen, in jeder Entfernung. (Bis v74 wurde in
   Zeile/Spalte gespiegelt. Im versetzten Raster stimmt das nur waagerecht: die beiden
   Diagonalen paarten Felder derselben Seite, etwa Nordost mit Südost.) */
function hexOpposite(mr, mc, ar, ac, br, bc) {
  const m = toCube(mr, mc), a = toCube(ar, ac), b = toCube(br, bc);
  return a[0] + b[0] === 2 * m[0] && a[1] + b[1] === 2 * m[1] && a[2] + b[2] === 2 * m[2];
}
// Ring mit Radius n um ein Feld (inkl. aller Felder mit Distanz <= n, ohne Zentrum)
function within(r, c, n) {
  const out = [];
  for (let dr = -n; dr <= n; dr++) {
    for (let dc = -n - 1; dc <= n + 1; dc++) {
      const rr = r + dr, cc = c + dc;
      const d = hexDistance(r, c, rr, cc);
      if (d > 0 && d <= n) out.push([rr, cc]);
    }
  }
  return out;
}
// Pixelmittelpunkt
function hexCenter(r, c, size) {
  const w = Math.sqrt(3) * size;
  return [w * (c + 0.5 * (r & 1)) + w / 2, size * 1.5 * r + size];
}
function hexPoints(size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 90);
    pts.push([size * Math.cos(a), size * Math.sin(a)]);
  }
  return pts;
}

/* Dijkstra über Bewegungskosten. passable(r,c) -> bool | 'stop' (betretbar, endet Bewegung)
   edgeCost(from,to) -> Kosten (1, 0.5 mit Straße, 0 mit Eisenbahn)
   Die Warteschlange ist ein binärer Heap (v77). Vorher wurde sie vor jedem Schritt ganz
   sortiert – bei Luftwaffe (Bewegung 9) über die halbe Karte gut 1 ms je Aufruf, und die
   KI fragt Reichweiten tausendfach ab. Das Ergebnis ist dasselbe: Dijkstra liefert die
   kürzesten Wege unabhängig davon, in welcher Reihenfolge gleich weite Felder drankommen
   (test.js vergleicht beide Fassungen an echten Spielständen).
   Ebenso neu: passable wird je Feld nur einmal gefragt. Es liest den Spielstand, der sich
   während der Suche nicht ändert, und prüft Städte, Armeen und Kontrollzonen – bis zu
   sechsmal dieselbe Antwort für dasselbe Feld war der größere Teil der Rechenzeit. */
function reachable(startR, startC, budget, passable0, edgeCost) {
  const known = new Map();
  const passable = (r, c) => {
    const k = key(r, c);
    let v = known.get(k);
    if (v === undefined) { v = passable0(r, c); known.set(k, v); }
    return v;
  };
  const dist = new Map();
  const start = key(startR, startC);
  dist.set(start, 0);
  const heap = [[0, startR, startC]];                  // [Entfernung, Zeile, Spalte]
  const push = e => {
    heap.push(e);
    for (let i = heap.length - 1; i > 0;) {
      const j = (i - 1) >> 1;
      if (heap[j][0] <= heap[i][0]) break;
      [heap[i], heap[j]] = [heap[j], heap[i]]; i = j;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
      }
    }
    return top;
  };
  const stopped = new Set();
  while (heap.length) {
    const [dq, r, c] = pop();
    const k0 = key(r, c);
    const d = dist.get(k0);
    if (dq > d + 1e-9) continue;                       // veralteter Eintrag
    if (d > budget) continue;
    if (stopped.has(k0) && k0 !== start) continue;
    for (const [nr, nc] of neighbors(r, c)) {
      const p = passable(nr, nc);
      if (!p) continue;
      const nd = d + edgeCost(r, c, nr, nc);
      if (nd > budget + 1e-9) continue;
      const k = key(nr, nc);
      if (!dist.has(k) || nd < dist.get(k) - 1e-9) {
        dist.set(k, nd);
        if (p === 'stop') stopped.add(k);
        push([nd, nr, nc]);
      }
    }
  }
  dist.delete(start);
  return dist;
}

/* Kürzeste Distanz in passierbaren Feldern (Schrittzahl, für Stadtgründungskosten) */
function pathSteps(startR, startC, goalR, goalC, passable) {
  if (startR === goalR && startC === goalC) return 0;
  const seen = new Set([key(startR, startC)]);
  let frontier = [[startR, startC]], d = 0;
  while (frontier.length && d < 200) {
    d++;
    const next = [];
    for (const [r, c] of frontier) {
      for (const [nr, nc] of neighbors(r, c)) {
        const k = key(nr, nc);
        if (seen.has(k)) continue;
        if (nr === goalR && nc === goalC) return d;
        if (!passable(nr, nc)) continue;
        seen.add(k); next.push([nr, nc]);
      }
    }
    frontier = next;
  }
  return null;
}
