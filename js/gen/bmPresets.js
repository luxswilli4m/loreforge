// Ready-made top-down encounter maps. Each one is built from the same pieces the editor uses,
// so opening a preset in the editor gives you every layer to change.
import { blankMap, rng, cellIdx } from './battlemaps.js';

function kit(m, seed) {
  const r = rng(seed);
  const set = (x, y, k) => { const i = cellIdx(m, x, y); if (i >= 0) m.ground[i] = k; };
  const get = (x, y) => m.ground[cellIdx(m, x, y)];
  const rect = (x0, y0, w, h, k) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, k); };
  const disc = (cx, cy, R, k, jag = 0) => { for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= R + (r() - 0.5) * jag) set(x, y, k); } };
  // a wandering path of a given width
  const path = (pts, w, k) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let s = 0; s <= n; s++) disc(ax + (bx - ax) * s / n, ay + (by - ay) * s / n, w / 2, k, 0.6); } };
  const obj = (a, x, y, extra = {}) => m.objs.push({ a, x, y, r: extra.r ?? 0, s: extra.s ?? 1, seed: Math.floor(r() * 1e6) });
  const wall = (kind, pts, closed = false) => m.walls.push({ kind, pts, closed });
  // a building: floor, walls round it with gaps for doors
  const room = (x0, y0, w, h, floor, wk, doors = []) => {
    rect(x0, y0, w, h, floor);
    const edges = [[[x0, y0], [x0 + w, y0]], [[x0 + w, y0], [x0 + w, y0 + h]], [[x0 + w, y0 + h], [x0, y0 + h]], [[x0, y0 + h], [x0, y0]]];
    edges.forEach(([a, b], side) => { const ds = doors.filter(d => d[0] === side).map(d => d[1]).sort((p, q) => p - q); let t = 0; const L = Math.hypot(b[0] - a[0], b[1] - a[1]), at = s => [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]; for (const d of ds) { if (d > t) wall(wk, [at(t), at(d)]); obj('door', ...at(d + 0.5), { r: side % 2 ? Math.PI / 2 : 0 }); t = d + 1; } if (t < L) wall(wk, [at(t), at(L)]); });
  };
  const scatter = (a, n, test, opt = {}) => { let tries = 0; while (n > 0 && tries++ < n * 60) { const x = r() * m.cols, y = r() * m.rows; if (!test(Math.floor(x), Math.floor(y), x, y)) continue; obj(a, x, y, { r: r() * 6.28, s: (opt.s || 1) * (0.8 + r() * 0.4) }); n--; } };
  const near = (x, y, k, d = 1) => { for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) if (get(x + i, y + j) === k) return true; return false; };
  return { r, set, get, rect, disc, path, obj, wall, room, scatter, near };
}

export const PRESETS = {
  tavern: {
    label: 'The Gilded Tankard (tavern)', icon: '🍺', blurb: 'A busy common room, a bar, a kitchen and a back room, with the street outside.',
    build() {
      const m = blankMap(30, 22, 'cobble'); m.name = 'The Gilded Tankard'; m.seed = 1101; const K = kit(m, 1101);
      K.rect(0, 0, 30, 3, 'grass'); K.rect(0, 19, 30, 3, 'dirt');
      K.room(3, 4, 22, 14, 'wood', 'stone', [[2, 10], [2, 11]]);
      K.wall('wood', [[17, 4], [17, 9]]); K.wall('wood', [[17, 11], [17, 18]]); K.obj('door', 17, 10, { r: Math.PI / 2 });
      K.rect(18, 4, 7, 6, 'flag'); K.wall('wood', [[17, 10], [20, 10]]); K.wall('wood', [[21, 10], [25, 10]]); K.obj('door', 20.5, 10);
      K.obj('fireplace', 10, 4.45); K.obj('rug', 10, 7, { s: 1.2 });
      K.obj('counter', 14.5, 14, { r: Math.PI / 2 }); for (const y of [12, 13.2, 14.4, 15.6]) K.obj('chair', 13.4, y);
      K.obj('barrel', 16.3, 12); K.obj('barrel', 16.3, 12.7); K.obj('barrel', 16.3, 16.6);
      for (const [x, y] of [[6, 8], [6, 13], [10, 11], [10, 15]]) { K.obj('roundtable', x, y); for (let a = 0; a < 4; a++) K.obj('chair', x + Math.cos(a * 1.57 + 0.5) * 0.95, y + Math.sin(a * 1.57 + 0.5) * 0.95, { r: a * 1.57 }); }
      K.obj('table', 21, 14, { r: Math.PI / 2 }); K.obj('chair', 20, 13); K.obj('chair', 22, 15);
      K.obj('bookshelf', 21, 17.7); K.obj('chest', 23.5, 16.5); K.obj('bed', 23.6, 12.5);
      K.obj('table', 21.5, 6); K.obj('barrel', 19, 5); K.obj('barrel', 19.7, 5); K.obj('sack', 24, 5); K.obj('sack', 24.2, 5.7); K.obj('crate', 23.8, 8.5); K.obj('brazier', 19, 8.5);
      K.obj('torch', 3.3, 6); K.obj('torch', 3.3, 15); K.obj('lamppost', 1.2, 9); K.obj('lamppost', 1.2, 13);
      K.obj('cart', 1.5, 18.5, { r: 0.3 }); K.obj('barrel', 26.5, 5); K.obj('crate', 27, 6); K.obj('well', 27.5, 15);
      for (let i = 0; i < 9; i++) K.obj(['oak', 'bush', 'pine'][i % 3], 1 + i * 3.4, 1.2 + K.r() * 0.6);
      K.obj('puddle', 6, 19.8); K.obj('tracks', 12, 20.5);
      m.dark = 0.2; return m;
    },
  },
  forestcamp: {
    label: 'Bandit camp in the woods', icon: '🏕️', blurb: 'A clearing ringed by trees, tents round a fire, a stream and a fallen log to cross it.',
    build() {
      const m = blankMap(32, 24, 'grass'); m.name = 'Bandit camp'; m.seed = 2202; const K = kit(m, 2202);
      K.disc(15, 12, 7, 'dirt', 2.2); K.path([[15, 12], [10, 24]], 2.2, 'dirt'); K.path([[15, 12], [32, 8]], 2, 'dirt');
      K.path([[0, 4], [6, 6], [10, 3], [18, 1], [24, 4], [32, 2]], 2.4, 'water'); K.path([[0, 4], [6, 6], [10, 3], [18, 1], [24, 4], [32, 2]], 0.8, 'deep');
      for (let x = 0; x < 32; x++) for (let y = 0; y < 24; y++) if (K.get(x, y) === 'grass' && K.near(x, y, 'water', 1) && K.r() < 0.25) K.set(x, y, 'mud');
      K.obj('campfire', 15, 12); for (let a = 0; a < 5; a++) K.obj('log', 15 + Math.cos(a * 1.26) * 2.1, 12 + Math.sin(a * 1.26) * 2.1, { r: a * 1.26 + 1.57, s: 0.7 });
      for (const [x, y, rr] of [[10, 9, 0.5], [20, 9, -0.4], [11, 16.5, 0.2], [19.5, 16, -0.2]]) K.obj('tent', x, y, { r: rr });
      K.obj('cart', 22, 12.5, { r: 1.4 }); K.obj('crate', 8, 12); K.obj('crate', 8.6, 12.8); K.obj('barrel', 7.6, 13.5); K.obj('sack', 22.5, 15); K.obj('chest', 17, 8.8);
      K.obj('log', 15, 2.8, { r: 1.45, s: 1.3 }); K.obj('reeds', 6, 5); K.obj('reeds', 22, 3.3); K.obj('lilypads', 27, 2.5);
      K.obj('bones', 25, 18); K.obj('blood', 24.5, 18.4); K.obj('stump', 12, 20); K.obj('torch', 12.5, 11); K.obj('torch', 17.5, 11);
      K.scatter('oak', 22, (x, y, fx, fy) => K.get(x, y) === 'grass' && Math.hypot(fx - 15, fy - 12) > 8.5 && !K.near(x, y, 'dirt', 1));
      K.scatter('pine', 18, (x, y, fx, fy) => K.get(x, y) === 'grass' && Math.hypot(fx - 15, fy - 12) > 9 && !K.near(x, y, 'dirt', 1));
      K.scatter('bush', 20, (x, y) => K.get(x, y) === 'grass'); K.scatter('berrybush', 5, (x, y) => K.get(x, y) === 'grass');
      K.scatter('rock', 14, (x, y) => K.get(x, y) !== 'water' && K.get(x, y) !== 'deep'); K.scatter('flowers', 14, (x, y) => K.get(x, y) === 'grass'); K.scatter('mushrooms', 6, (x, y) => K.get(x, y) === 'grass');
      m.dark = 0.5; m.mood = 'moon'; return m;
    },
  },
  cave: {
    label: 'Crystal caverns', icon: '🕳️', blurb: 'Winding tunnels, an underground pool, glowing crystals and a spider lair.',
    build() {
      const m = blankMap(32, 24, 'void'); m.name = 'Crystal caverns'; m.seed = 3303; const K = kit(m, 3303);
      const nodes = [[3, 12, 2.6], [9, 8, 3.4], [16, 12, 4.4], [24, 6, 3.4], [26, 17, 4], [12, 19, 3], [29, 11, 2]];
      for (const [x, y, R] of nodes) K.disc(x, y, R, 'rock', 1.6);
      K.path([[0, 12], [3, 12], [9, 8], [16, 12], [24, 6], [29, 11], [26, 17], [16, 12], [12, 19]], 2.2, 'rock');
      K.disc(17, 12.5, 2.4, 'water', 1); K.disc(17.3, 12.6, 1.1, 'deep', 0.4); K.disc(26, 17.5, 2.3, 'moss', 1.4);
      for (const [x, y] of [[15, 9.6], [19.6, 11], [25, 4.6], [23, 7.4], [11, 9], [27.5, 15.5]]) K.obj('crystal', x, y, { s: 0.9 + K.r() * 0.4 });
      K.obj('web', 26, 17, { s: 1.6 }); K.obj('web', 28, 19); K.obj('bones', 25, 18.5); K.obj('bones', 27, 16.3); K.obj('chest', 28.5, 18);
      K.obj('mushrooms', 12, 19); K.obj('mushrooms', 10.6, 20.3); K.obj('mushrooms', 24.3, 17); K.obj('rubble', 9, 8); K.obj('rubble', 3, 13); K.obj('torch', 2, 11); K.obj('campfire', 12.5, 18.6, { s: 0.7 });
      K.scatter('rock', 26, (x, y) => K.get(x, y) === 'rock'); K.scatter('boulder', 5, (x, y) => K.get(x, y) === 'rock' && !K.near(x, y, 'void', 0)); K.scatter('puddle', 4, (x, y) => K.get(x, y) === 'rock');
      m.dark = 0.8; m.lights.push({ x: 17, y: 12.5, r: 3, color: '#4ab0d0' }); return m;
    },
  },
  shipdeck: {
    label: 'Ship deck at sea', icon: '⛵', blurb: 'A three-masted ship on open water, with cannons, hatches and a rowboat alongside.',
    build() {
      const m = blankMap(34, 20, 'deep'); m.name = 'The Saltwind'; m.seed = 4404; const K = kit(m, 4404);
      for (let y = 0; y < 20; y++) for (let x = 0; x < 34; x++) if (K.r() < 0.05) K.set(x, y, 'water');
      // the hull: a long pointed shape
      const hull = []; for (let i = 0; i <= 20; i++) { const t = i / 20, x = 4 + t * 26; const w = t > 0.75 ? 4.2 * Math.cos((t - 0.75) / 0.25 * Math.PI / 2) : 4.2 - (0.75 - t) * 1.2; hull.push([x, 10 - w]); } for (let i = 20; i >= 0; i--) { const [x, y] = hull[i]; hull.push([x, 20 - y]); }
      m.floors.push({ kind: 'deck', pts: hull });
      K.wall('rail', hull, true);
      K.wall('wood', [[7, 7.2], [7, 12.8]]); K.wall('wood', [[25, 7], [25, 13]]);
      for (const x of [10, 16, 22]) K.obj('mast', x, 10); K.obj('wheel', 6, 10); K.obj('hatch', 13, 10); K.obj('hatch', 19, 10);
      for (const x of [11, 15, 19, 23]) { K.obj('cannon', x, 6.9, { r: -Math.PI / 2 }); K.obj('cannon', x, 13.1, { r: Math.PI / 2 }); }
      K.obj('barrel', 8, 7.6); K.obj('barrel', 8.6, 7.9); K.obj('crate', 24, 8); K.obj('crate', 24, 12); K.obj('rope', 17.5, 8.5); K.obj('rope', 12, 11.6); K.obj('sack', 20.5, 11.5); K.obj('chest', 5.5, 8.8); K.obj('lamppost', 6.8, 7.5); K.obj('lamppost', 6.8, 12.5); K.obj('lamppost', 28, 10);
      K.obj('rowboat', 16, 16.4, { r: 0.08 });
      m.dark = 0.15; return m;
    },
  },
  docks: {
    label: 'Harbour docks', icon: '⚓', blurb: 'Warehouses on the quay, piers out into the harbour, boats and stacked cargo.',
    build() {
      const m = blankMap(32, 24, 'water'); m.name = 'Saltmarsh docks'; m.seed = 5505; const K = kit(m, 5505);
      K.rect(0, 15, 32, 24, 'deep'); K.rect(0, 0, 32, 9, 'cobble'); K.rect(0, 9, 32, 1, 'sand');
      for (let x = 0; x < 32; x++) if (K.r() < 0.4) K.set(x, 10, 'sand');
      for (const [x, L] of [[4, 11], [14, 9], [24, 12]]) K.rect(x, 9, 3, L, 'wood');
      K.room(1, 1, 9, 6, 'wood', 'brick', [[2, 4]]); K.room(12, 1, 8, 6, 'flag', 'brick', [[2, 3]]); K.room(22, 1, 9, 5, 'wood', 'wood', [[2, 3], [3, 3]]);
      for (const [x, y] of [[3, 3], [3.8, 3.4], [7, 2.5], [8, 3], [14, 3], [15, 3], [18, 2.6], [24, 2.6], [28, 2.6]]) K.obj(K.r() < 0.5 ? 'crate' : 'barrel', x, y);
      K.obj('table', 16, 4.6); K.obj('chair', 15, 5.3); K.obj('anvil', 25, 4.5); K.obj('sack', 29, 4); K.obj('sack', 29.5, 4.6);
      for (let i = 0; i < 14; i++) K.obj(['crate', 'barrel', 'sack'][i % 3], 2 + K.r() * 28, 7.4 + K.r() * 1.2);
      K.obj('cart', 11, 8, { r: 1.57 }); for (const x of [3, 11, 21, 29]) K.obj('lamppost', x, 7.2);
      K.obj('rowboat', 8, 13, { r: 1.5 }); K.obj('rowboat', 18.4, 12.5, { r: 1.7 }); K.obj('rowboat', 21.5, 18, { r: 1.4 }); K.obj('rope', 5.5, 18); K.obj('rope', 15.5, 16.5); K.obj('crate', 25, 19.5); K.obj('barrel', 26, 19.7);
      for (const [x, L] of [[4, 11], [14, 9], [24, 12]]) { K.wall('fence', [[x, 10], [x, 9 + L]]); K.wall('fence', [[x + 3, 10], [x + 3, 9 + L]]); }
      m.dark = 0.25; m.mood = 'dusk'; return m;
    },
  },
  crossroads: {
    label: 'Crossroads shrine', icon: '🛤️', blurb: 'Two roads meet at a wayside shrine, with a farm wall, a pond and an old oak.',
    build() {
      const m = blankMap(30, 22, 'grass'); m.name = 'Crossroads shrine'; m.seed = 6606; const K = kit(m, 6606);
      K.path([[0, 11], [8, 10], [15, 11], [22, 12], [30, 11]], 2.6, 'dirt'); K.path([[15, 0], [14, 6], [15, 11], [16, 16], [15, 22]], 2.4, 'dirt');
      K.disc(15, 11, 2.6, 'cobble', 0.5); K.disc(6, 17, 2.8, 'water', 1.6); K.disc(6, 17, 1.2, 'deep', 0.6); for (let x = 0; x < 30; x++) for (let y = 0; y < 22; y++) if (K.get(x, y) === 'grass' && K.near(x, y, 'water', 1) && K.r() < 0.5) K.set(x, y, 'mud');
      K.rect(19, 14, 11, 8, 'dirt'); K.wall('stone', [[19, 14], [30, 14]]); K.wall('stone', [[19, 14], [19, 18]]); K.wall('stone', [[19, 19.6], [19, 22]]);
      K.obj('statue', 15, 11); K.obj('flowers', 14, 12); K.obj('flowers', 16.2, 10); K.obj('brazier', 13.6, 9.6); K.obj('brazier', 16.4, 12.4);
      K.obj('oak', 22, 7, { s: 1.5 }); K.obj('reeds', 4, 15.5); K.obj('reeds', 8.4, 18); K.obj('lilypads', 6.4, 17.4); K.obj('log', 9, 6, { r: 0.6 });
      for (let i = 0; i < 6; i++) K.obj('sack', 21 + K.r() * 8, 15 + K.r() * 6); K.obj('cart', 25, 17.5, { r: 0.2 }); K.obj('well', 28, 20);
      K.scatter('oak', 10, (x, y) => K.get(x, y) === 'grass' && !K.near(x, y, 'dirt', 1)); K.scatter('bush', 18, (x, y) => K.get(x, y) === 'grass'); K.scatter('rock', 10, (x, y) => K.get(x, y) !== 'water'); K.scatter('flowers', 16, (x, y) => K.get(x, y) === 'grass'); K.scatter('tracks', 5, (x, y) => K.get(x, y) === 'dirt');
      m.dark = 0; m.mood = 'golden'; return m;
    },
  },
  dungeon: {
    label: 'Sunken crypt', icon: '💀', blurb: 'Flagstone halls, a pillared chamber with an altar, side tombs and a ritual circle.',
    build() {
      const m = blankMap(30, 24, 'void'); m.name = 'Sunken crypt'; m.seed = 7707; const K = kit(m, 7707);
      K.room(2, 9, 6, 6, 'flag', 'stone', [[1, 2], [1, 3]]); K.room(11, 4, 10, 16, 'flag', 'stone', [[3, 7], [3, 8], [0, 4], [2, 4], [1, 6]]);
      K.rect(8, 11, 3, 2, 'flag'); K.wall('stone', [[8, 11], [11, 11]]); K.wall('stone', [[8, 13], [11, 13]]);
      K.room(14, 0, 4, 4, 'flag', 'stone', [[2, 1]]); K.room(14, 20, 4, 4, 'flag', 'stone', [[0, 1]]); K.room(21, 8, 7, 8, 'flag', 'stone', [[3, 3]]);
      K.rect(11, 0, 3, 0, 'flag');
      for (const y of [7, 10, 14, 17]) { K.obj('pillar', 13, y); K.obj('pillar', 19, y); }
      K.obj('altar', 16, 6); K.obj('rug', 16, 12, { r: Math.PI / 2, s: 1.4 }); K.obj('brazier', 14, 5.4); K.obj('brazier', 18, 5.4);
      K.obj('pentagram', 24.5, 12, { s: 1.4 }); for (let a = 0; a < 5; a++) K.obj('torch', 24.5 + Math.cos(a * 1.257) * 1.7, 12 + Math.sin(a * 1.257) * 1.7);
      K.obj('chest', 16, 1.5); K.obj('bones', 15, 2.5); K.obj('statue', 16, 22); K.obj('bones', 3.5, 10.5); K.obj('rubble', 6.5, 13.5); K.obj('stairs', 5, 12, { r: Math.PI / 2, s: 0.9 }); K.obj('web', 2.5, 9.5);
      K.obj('blood', 24, 13); K.obj('rubble', 20, 19); K.obj('rubble', 12, 4.8); K.obj('puddle', 17.5, 16.5); K.obj('web', 20.6, 4.4);
      K.scatter('bones', 4, (x, y) => K.get(x, y) === 'flag'); K.scatter('rubble', 4, (x, y) => K.get(x, y) === 'flag');
      m.dark = 0.85; return m;
    },
  },
  ruins: {
    label: 'Overgrown temple ruins', icon: '🏛️', blurb: 'Broken walls and toppled pillars swallowed by the forest, around a courtyard well.',
    build() {
      const m = blankMap(30, 24, 'grass'); m.name = 'Overgrown ruins'; m.seed = 8808; const K = kit(m, 8808);
      K.rect(7, 5, 16, 14, 'flag'); for (let i = 0; i < 70; i++) K.set(7 + Math.floor(K.r() * 16), 5 + Math.floor(K.r() * 14), K.r() < 0.6 ? 'moss' : 'grass');
      K.path([[15, 19], [15, 24]], 2.2, 'dirt');
      K.wall('stone', [[7, 5], [12, 5]]); K.wall('stone', [[14, 5], [23, 5], [23, 10]]); K.wall('stone', [[23, 13], [23, 19], [18, 19]]); K.wall('stone', [[12, 19], [7, 19], [7, 15]]); K.wall('stone', [[7, 11], [7, 7]]);
      K.wall('hedge', [[2, 2], [5, 3], [4, 8]]); K.wall('hedge', [[26, 18], [27, 22]]);
      for (const [x, y] of [[10, 8], [20, 8], [10, 16], [20, 16]]) K.obj('pillar', x, y); for (const [x, y] of [[13, 8], [17, 16]]) { K.obj('rubble', x, y); K.obj('rubble', x + 0.6, y + 0.5); }
      K.obj('well', 15, 12); K.obj('statue', 15, 6.4); K.obj('chest', 21.5, 17.5); K.obj('bones', 9, 17.5); K.obj('web', 21.6, 6.4); K.obj('deadtree', 11, 13);
      K.scatter('oak', 18, (x, y) => K.get(x, y) === 'grass' && (x < 6 || x > 24 || y < 4 || y > 20)); K.scatter('pine', 8, (x, y) => K.get(x, y) === 'grass' && (x < 6 || x > 24)); K.scatter('bush', 22, (x, y) => K.get(x, y) === 'grass' || K.get(x, y) === 'moss'); K.scatter('rock', 10, () => true); K.scatter('flowers', 12, (x, y) => K.get(x, y) === 'grass'); K.scatter('mushrooms', 6, (x, y) => K.get(x, y) === 'moss');
      m.dark = 0.1; m.fog = 0.3; return m;
    },
  },
};
