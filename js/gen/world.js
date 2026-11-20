// Procedural world/region map generator with a hand-drawn cartographic renderer.
import { drawIcon } from './icons.js';
import { rng, makeNoise, Heap, blur, contour, stitch, chaikin, tracePath, Labeler, haloText, spaced, hexToRgb, mix, rgba, voronoi,
  drawCompass, drawScaleBar, drawFrame, drawCartouche, paperGrain } from './core.js';
import { placeName, realmBase, realmName, seaName, mountainName, forestName } from './names.js';

export const WORLD_DEFAULTS = {
  seed: 'vael', name: '', shape: 'continent', land: 0.42, rivers: 0.5, towns: 16, realms: 4,
  climate: 'temperate', style: 'parchment', size: 'kingdom', mapW: 1200, mapH: 750,
};
// Map size presets (km). Bigger maps get a finer terrain grid, up to a limit.
export const WORLD_SIZES = [
  ['region', 'Region', 400, 250], ['kingdom', 'Kingdom', 1200, 750], ['continent', 'Continent', 4000, 2500],
  ['subcontinent', 'Great continent', 8000, 5000], ['world', 'Whole world', 16000, 8000], ['custom', 'Custom…', 0, 0],
];
export const CELL_PX = 7.5;
// grid size for a map: older maps (no mapW) keep the original 320 × 200
export function gridFor(o) {
  if (!o.mapW || !o.mapH) return { GW: 320, GH: 200 };
  const aspect = Math.max(0.4, Math.min(3, o.mapW / o.mapH));
  const area = o.mapW * o.mapH / (1200 * 750);
  const cells = Math.round(64000 * Math.max(1, Math.min(2.2, Math.pow(area, 0.22))));
  // even sizes keep the picture a whole number of pixels (7.5 px per cell)
  const GW = 2 * Math.round(Math.sqrt(cells * aspect) / 2), GH = 2 * Math.round(cells / GW / 2);
  return { GW, GH };
}
// map units for the scale bar: km on new maps, miles on older ones
export const worldUnits = o => o.mapW ? { per: o.mapW, unit: 'km' } : { per: o.widthMiles || 1200, unit: 'miles' };

const B = { OCEAN: 0, GRASS: 1, FOREST: 2, TAIGA: 3, JUNGLE: 4, DESERT: 5, SAVANNA: 6, TUNDRA: 7, SNOW: 8, SWAMP: 9, LAKE: 10 };
const REALM_COLORS = ['#b5483f', '#3f6fa8', '#6f9a3c', '#7d5aa0', '#c9762d', '#3a99a8', '#b38a1e', '#8b5470'];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => Math.max(0, Math.min(1, x));

// ---------------- Landmass templates ----------------
export const SHAPES = [
  ['continent', 'Continent'], ['large', 'Large continent'], ['twin', 'Twin continents'], ['oldworld', 'Old world'], ['pangea', 'Pangea'],
  ['highisland', 'High island'], ['lowisland', 'Low island'], ['volcano', 'Volcano'], ['atoll', 'Atoll'], ['archipelago', 'Archipelago'],
  ['shattered', 'Shattered'], ['fractious', 'Fractious'], ['mediterranean', 'Mediterranean'], ['peninsula', 'Peninsula'], ['isthmus', 'Isthmus'],
  ['coast', 'Coastal region'], ['taklamakan', 'Desert continent'],
];
// whole-world maps wrap east–west so the oceans meet on a globe
export const isWrapping = o => o.size === 'world';

// the raw height field for a template. Wrapping maps blend two noise samples a map-width apart so the edges join.
export function baseHeight(o, GW, GH, r0, n1, n2, n3) {
  const N = GW * GH, aspect = GW / GH, wrap = isWrapping(o);
  const shape = o.shape || 'continent';
  const W2 = (fn, x, y) => {
    if (!wrap) return fn(x, y);
    const t = x;
    const a = fn(x, y), b = fn(x - 1, y);
    return (a * (1 - t) + b * t) / Math.sqrt((1 - t) * (1 - t) + t * t);
  };
  const centers = [];
  const nC = shape === 'twin' ? 2 : shape === 'oldworld' ? r0.int(3, 4) : shape === 'isthmus' ? 2 : 0;
  if (shape === 'twin') centers.push([r0.range(0.27, 0.35), r0.range(0.4, 0.6), 0.42], [r0.range(0.65, 0.73), r0.range(0.4, 0.6), 0.42]);
  else if (shape === 'isthmus') centers.push([r0.range(0.22, 0.3), r0.range(0.28, 0.4), 0.3], [r0.range(0.7, 0.78), r0.range(0.6, 0.72), 0.3]);
  else for (let i = 0; i < nC; i++) centers.push([r0.range(0.15, 0.85), r0.range(0.22, 0.78), r0.range(0.2, 0.32)]);
  const coastAngle = r0.range(0, Math.PI * 2);
  const freq = { archipelago: 5.5, shattered: 7, fractious: 6.5, large: 2.2, pangea: 2, lowisland: 2.2, twin: 3, oldworld: 3 }[shape] || 2.6;
  const warpAmt = { fractious: 0.24, shattered: 0.18 }[shape] || 0.13;
  const ridgeW = { highisland: 0.3, volcano: 0.1, lowisland: 0.04, pangea: 0.16 }[shape] ?? 0.12;
  const h = new Float32Array(N), ridgeF = new Float32Array(N);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const nx = x / GW, ny = y / GH;
    const wx = nx + warpAmt * W2((a, b) => n2.fbm(a * 3 + 11, b * 3, 3), nx, ny), wy = ny + warpAmt * W2((a, b) => n2.fbm(a * 3, b * 3 + 7, 3), nx, ny);
    const dist = (cx, cy) => { let dx = Math.abs(wx - cx); if (wrap) dx = Math.min(dx, 1 - dx); return Math.hypot(dx * aspect * 0.8, wy - cy); };
    const seg = (ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy; const t = Math.max(0, Math.min(1, ((wx - ax) * vx + (wy - ay) * vy) / L)); return Math.hypot((wx - ax - vx * t) * aspect * 0.8, wy - ay - vy * t); };
    const proj = (wx - 0.5) * Math.cos(coastAngle) + (wy - 0.5) * Math.sin(coastAngle);
    let mask;
    switch (shape) {
      case 'twin': case 'oldworld': mask = Math.max(...centers.map(c => 1 - smooth(c[2] * 0.3, c[2], dist(c[0], c[1])))); break;
      case 'isthmus': mask = Math.max(...centers.map(c => 1 - smooth(0.08, c[2], dist(c[0], c[1]))), 1 - smooth(0.02, 0.075, seg(centers[0][0], centers[0][1], centers[1][0], centers[1][1]))); break;
      case 'archipelago': mask = 0.62 - 0.45 * smooth(0.25, 0.55, dist(0.5, 0.5)); break;
      case 'shattered': mask = 0.72 - 0.35 * smooth(0.3, 0.6, dist(0.5, 0.5)) - 0.5 * Math.pow(W2((a, b) => n3.ridged(a * 6 * aspect * 0.6 + 3, b * 6, 3), nx, ny), 4); break;
      case 'fractious': mask = 0.6 - 0.35 * smooth(0.3, 0.62, dist(0.5, 0.5)); break;
      case 'large': case 'taklamakan': mask = 1 - smooth(0.25, 0.68, dist(0.5, 0.5)); break;
      case 'pangea': mask = 1 - smooth(0.35, 0.8, dist(0.5, 0.5)); break;
      case 'highisland': mask = 1 - smooth(0.1, 0.42, dist(0.5, 0.5)); break;
      case 'lowisland': mask = 0.9 * (1 - smooth(0.12, 0.5, dist(0.5, 0.5))); break;
      case 'volcano': { const d = dist(0.5, 0.5); mask = 1 - smooth(0.05, 0.36, d) + 0.6 * (1 - smooth(0, 0.1, d)); break; }
      case 'atoll': { const d = dist(0.5, 0.5); mask = 1.05 - smooth(0.015, 0.06, Math.abs(d - 0.3)) * 1.1; break; }
      case 'mediterranean': mask = smooth(0.12, 0.38, Math.hypot((wx - 0.5) * aspect * 0.45, wy - 0.5)); break;
      case 'peninsula': mask = Math.max(smooth(0.18, 0.4, proj), 1 - smooth(0.05, 0.17, seg(0.5 + Math.cos(coastAngle) * 0.4, 0.5 + Math.sin(coastAngle) * 0.4, 0.5 - Math.cos(coastAngle) * 0.22, 0.5 - Math.sin(coastAngle) * 0.22))); break;
      case 'coast': mask = smooth(-0.25, 0.3, proj); break;
      default: mask = 1 - smooth(0.15, 0.55, dist(0.5, 0.5));
    }
    const edge = wrap ? Math.min(ny, 1 - ny) * 1.6 : Math.min(nx, 1 - nx, ny, 1 - ny);
    if (!['coast', 'mediterranean', 'peninsula'].includes(shape)) mask *= smooth(0, 0.09, edge);
    const base = W2((a, b) => n1.fbm(a * freq * aspect * 0.6, b * freq, 6), nx, ny);
    const ridge = W2((a, b) => n3.ridged(a * 3.5 * aspect * 0.6 + 5, b * 3.5, 4), nx, ny);
    ridgeF[y * GW + x] = Math.pow(Math.max(0, ridge), 2.2) * (ridgeW / 0.12);
    h[y * GW + x] = mask * 0.62 + base * 0.55 + ridge * ridgeW * mask;
  }
  return { h, ridgeF };
}

// small live preview of a template with the current seed (Azgaar-style height colours)
export function shapePreview(o, w = 120, hgt = 76) {
  const r0 = rng(o.seed), n1 = makeNoise(r0), n2 = makeNoise(r0), n3 = makeNoise(r0);
  const { h } = baseHeight(o, w, hgt, r0, n1, n2, n3);
  const sorted = Float32Array.from(h).sort(), sea = sorted[Math.floor((1 - (o.land ?? 0.42)) * (h.length - 1))], top = sorted[h.length - 1];
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, hgt);
  const ramp = [[0, [92, 160, 96]], [0.3, [200, 220, 120]], [0.6, [236, 180, 92]], [0.85, [196, 72, 56]], [1, [120, 30, 30]]];
  for (let i = 0; i < h.length; i++) {
    let col;
    if (h[i] < sea) col = [88, 72, 160];
    else { const v = Math.min(1, (h[i] - sea) / (top - sea)); for (let j = 1; j < ramp.length; j++) if (v <= ramp[j][0]) { col = mix(ramp[j - 1][1], ramp[j][1], (v - ramp[j - 1][0]) / (ramp[j][0] - ramp[j - 1][0])); break; } }
    img.data.set([col[0], col[1], col[2], 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// heights from a picture (light = high). Returns a partial edit the generator can grow a world from.
export function heightsFromImage(img, o) {
  const { GW, GH } = gridFor(o);
  const c = document.createElement('canvas'); c.width = GW; c.height = GH;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, GW, GH);
  const d = ctx.getImageData(0, 0, GW, GH).data, h = new Float32Array(GW * GH);
  // a little noise keeps flat areas (like a black sea) from turning into perfectly smooth plates
  const nz = makeNoise(rng(o.seed + ':img'));
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255 + nz.fbm(x / GW * 8, y / GH * 8, 4) * 0.035;
  }
  return { GW, GH, h, ridge: new Float32Array(GW * GH) };
}

// edit (optional): hand-edited state from the map editor — see makeEditState()
export function generateWorld(opts, edit = null) {
  const o = { ...WORLD_DEFAULTS, ...opts };
  if (!opts.mapW && opts.widthMiles) { delete o.mapW; delete o.mapH; } // older map: keep its original grid
  const { GW, GH } = edit?.GW ? edit : gridFor(o);
  const r0 = rng(o.seed);
  const n1 = makeNoise(r0), n2 = makeNoise(r0), n3 = makeNoise(r0);
  const N = GW * GH;
  const idx = (x, y) => y * GW + x;
  const aspect = GW / GH;

  // ---- shape & height ----
  const wrap = isWrapping(o);
  let h, ridgeF;
  if (edit?.h) { h = edit.h; ridgeF = edit.ridge || new Float32Array(N); }
  else ({ h, ridgeF } = baseHeight(o, GW, GH, r0, n1, n2, n3));
  const r = rng(o.seed + ':d' + (edit?.townSeed || ''));
  let sea, hmax;
  if (edit?.sea != null) { sea = edit.sea; hmax = edit.hmax; }
  else { const sorted = Float32Array.from(h).sort(); sea = sorted[Math.floor((1 - o.land) * (N - 1))]; hmax = sorted[N - 1]; if (sea <= sorted[0]) sea = sorted[0] + 1e-4; }
  const isOcean = new Uint8Array(N);
  const e = new Float32Array(N);
  for (let i = 0; i < N; i++) if (h[i] < sea) isOcean[i] = 1;

  // ---- distance fields (4-neighbour BFS) ----
  const bfs = (isSource) => {
    const d = new Float32Array(N).fill(1e9), q = [];
    for (let i = 0; i < N; i++) if (isSource(i)) { d[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const nn = idx(xx, yy);
        if (d[nn] > d[c] + 1) { d[nn] = d[c] + 1; q.push(nn); }
      }
    }
    return d;
  };
  const dLand = bfs(i => !isOcean[i]);
  const dWater = bfs(i => isOcean[i]);

  // elevation: broad height plus ridge lines (inland), rank-normalised so mountains stay ~15% of land
  let eCurve = edit?.eCurve || null;
  if (eCurve && !eCurve.length) eCurve = null;
  {
    const raw = new Float32Array(N), land = [];
    for (let i = 0; i < N; i++) {
      if (isOcean[i]) continue;
      raw[i] = Math.max(0, (h[i] - sea) / (hmax - sea)) * 0.45 + ridgeF[i] * 0.75 * smooth(0, 7, dWater[i]);
      land.push(i);
    }
    if (eCurve) {
      // fixed curve from the original map, so editing one area never reshuffles the rest
      const C = eCurve, n = C.length - 1;
      for (const i of land) {
        const v = raw[i];
        if (v >= C[n]) { e[i] = 1; continue; }
        let lo = 0, hi = n;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (C[mid] <= v) lo = mid; else hi = mid; }
        const q = (lo + (v - C[lo]) / Math.max(1e-9, C[hi] - C[lo])) / n;
        e[i] = Math.pow(clamp01(q), 2.6);
      }
    } else {
      land.sort((a, b) => raw[a] - raw[b]);
      land.forEach((i, k) => { e[i] = Math.pow(k / land.length, 2.6); });
      eCurve = Array.from({ length: 257 }, (_, j) => raw[land[Math.min(land.length - 1, Math.round(j / 256 * (land.length - 1)))]] || 0);
      for (let j = 1; j < eCurve.length; j++) if (eCurve[j] <= eCurve[j - 1]) eCurve[j] = eCurve[j - 1] + 1e-6;
    }
  }

  // ---- drainage: priority flood gives a drainage tree ----
  const filled = Float32Array.from(h), receiver = new Int32Array(N).fill(-1), seen = new Uint8Array(N), order = [];
  const heap = new Heap();
  for (let i = 0; i < N; i++) {
    const x = i % GW, y = (i / GW) | 0;
    if (isOcean[i] || x === 0 || y === 0 || x === GW - 1 || y === GH - 1) { seen[i] = 1; heap.push(h[i], i); order.push(i); }
  }
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  while (heap.size) {
    const c = heap.pop(), x = c % GW, y = (c / GW) | 0;
    for (const [dx, dy] of N8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
      const nn = idx(xx, yy);
      if (seen[nn]) continue;
      seen[nn] = 1;
      filled[nn] = Math.max(h[nn], filled[c] + 1e-5);
      receiver[nn] = c;
      order.push(nn);
      heap.push(filled[nn], nn);
    }
  }
  // lakes = sizeable filled depressions
  const lake = new Uint8Array(N);
  {
    const cand = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!isOcean[i] && filled[i] - h[i] > 0.01) cand[i] = 1;
    const comp = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (!cand[i] || comp[i] >= 0) continue;
      const q = [i]; comp[i] = i;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], x = c % GW, y = (c / GW) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nn = idx(x + dx, y + dy);
          if (x + dx < 0 || x + dx >= GW || y + dy < 0 || y + dy >= GH || !cand[nn] || comp[nn] >= 0) continue;
          comp[nn] = i; q.push(nn);
        }
      }
      if (q.length >= 12 && q.length < 900) for (const c of q) lake[c] = 1;
    }
  }

  // ---- climate ----
  const climateShift = { cold: -0.22, temperate: 0, warm: 0.22 }[o.climate] || 0;
  const m = new Float32Array(N), t = new Float32Array(N), biome = new Uint8Array(N);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = idx(x, y);
    const nx = x / GW, ny = y / GH;
    m[i] = (clamp01(0.5 + n2.fbm(nx * 4 * aspect * 0.6 + 40, ny * 4, 4) * 1.3) * 0.62 + 0.38 * (1 - Math.min(1, dWater[i] / 28))) * (o.shape === 'taklamakan' ? 0.5 : 1);
    t[i] = wrap ? clamp01(1.08 - Math.abs(ny - 0.5) * 2.3 + n3.fbm(nx * 2 + 9, ny * 2, 3) * 0.25 + climateShift - e[i] * 0.55)
      : clamp01(0.3 + 0.45 * ny + n3.fbm(nx * 2 + 9, ny * 2, 3) * 0.3 + climateShift - e[i] * 0.55 + (o.shape === 'taklamakan' ? 0.2 : 0));
    if (isOcean[i]) { biome[i] = B.OCEAN; continue; }
    if (lake[i]) { biome[i] = B.LAKE; continue; }
    const tt = t[i], mm = m[i];
    if (e[i] > 0.9 || tt < 0.1) biome[i] = B.SNOW;
    else if (tt < 0.25) biome[i] = mm > 0.5 ? B.TAIGA : B.TUNDRA;
    else if (tt < 0.68) biome[i] = mm < 0.3 ? B.GRASS : mm > 0.78 && e[i] < 0.08 ? B.SWAMP : mm > 0.52 ? B.FOREST : B.GRASS;
    else biome[i] = mm < 0.28 ? B.DESERT : mm < 0.5 ? B.SAVANNA : mm > 0.82 && e[i] < 0.08 ? B.SWAMP : B.JUNGLE;
  }

  if (edit?.biome) for (let i = 0; i < N; i++) {
    const v = edit.biome[i];
    if (v !== 255 && !isOcean[i] && !lake[i]) biome[i] = v;
  }

  // ---- rivers ----
  const acc = new Float32Array(N);
  for (let i = 0; i < N; i++) acc[i] = isOcean[i] ? 0 : 0.3 + m[i];
  for (let k = order.length - 1; k >= 0; k--) {
    const c = order[k];
    if (!isOcean[c] && receiver[c] >= 0) acc[receiver[c]] += acc[c];
  }
  const landAcc = [];
  for (let i = 0; i < N; i++) if (!isOcean[i] && !lake[i]) landAcc.push(acc[i]);
  landAcc.sort((a, b) => a - b);
  const frac = 0.006 + o.rivers * 0.03;
  const thr = landAcc[Math.floor(landAcc.length * (1 - frac))] || Infinity;
  const isRiver = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!isOcean[i] && !lake[i] && acc[i] >= thr && !edit?.noRiver?.[i]) isRiver[i] = 1;
  const jx = new Float32Array(N), jy = new Float32Array(N);
  for (let i = 0; i < N; i++) { jx[i] = r.range(-0.32, 0.32); jy[i] = r.range(-0.32, 0.32); }
  const hasUp = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isRiver[i] && receiver[i] >= 0) hasUp[receiver[i]] = 1;
  const sources = [];
  for (let i = 0; i < N; i++) if (isRiver[i] && !hasUp[i]) sources.push(i);
  sources.sort((a, b) => acc[b] - acc[a]);
  const drawn = new Uint8Array(N);
  const rivers = [];
  for (const s of sources) {
    let c = s, path = [];
    while (c >= 0) {
      const x = c % GW, y = (c / GW) | 0;
      path.push({ x: x + jx[c], y: y + jy[c], w: Math.sqrt(acc[c] / thr) });
      if (isOcean[c]) break;
      if (lake[c]) { if (path.length > 2) rivers.push(path); path = []; while (c >= 0 && lake[c]) c = receiver[c]; continue; }
      if (drawn[c] && path.length > 1) break;
      if (!isRiver[c]) break; // dried up by hand
      drawn[c] = 1;
      c = receiver[c];
    }
    if (path.length > 2) rivers.push(path);
  }
  // hand-drawn rivers: thin at the source, widening towards the mouth. Where one runs into the sea or a lake it
  // ends at the shore (and starts again on the far side), so it never runs across open water.
  const wetAt = (x, y) => { const c = idx(Math.max(0, Math.min(GW - 1, Math.round(x))), Math.max(0, Math.min(GH - 1, Math.round(y)))); return isOcean[c] || lake[c]; };
  for (const hr of edit?.rivers || []) {
    if (!hr.pts || hr.pts.length < 2) continue;
    const n = hr.pts.length, wmax = hr.w || 2.2;
    let seg = [];
    const flush = () => { if (seg.length > 1) rivers.push(seg); seg = []; };
    hr.pts.forEach(([x, y], j) => {
      const p = { x, y, w: 0.15 + (wmax - 0.15) * Math.pow(j / (n - 1), 1.3) };
      if (wetAt(x, y)) { if (seg.length) { seg.push(p); flush(); } return; }
      if (!seg.length && j > 0) { const [px, py] = hr.pts[j - 1]; seg.push({ x: px, y: py, w: p.w }); } // start at the far shore
      seg.push(p);
    });
    flush();
    for (const [x, y] of hr.pts) { const c = idx(Math.max(0, Math.min(GW - 1, Math.round(x))), Math.max(0, Math.min(GH - 1, Math.round(y)))); if (!isOcean[c] && !lake[c]) isRiver[c] = 1; }
  }
  // dried-up stretches (precise points from the Dry brush) cut any river that passes through them
  if (edit?.dry?.length) {
    const D = edit.dry;
    const isDry = p => D.some(([x, y, r]) => { const rr = Math.max(r, 0.55); return (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) <= rr * rr; });
    const out = [];
    for (const rv of rivers) {
      let seg = [];
      for (const p of rv) { if (isDry(p)) { if (seg.length > 1) out.push(seg); seg = []; } else seg.push(p); }
      if (seg.length > 1) out.push(seg);
    }
    rivers.length = 0; rivers.push(...out);
  }

  // ---- settlements ----
  const landCount = N - isOcean.reduce((a, b) => a + b, 0);
  const coastal = i => dWater[i] === 1;
  const score = new Float32Array(N).fill(-1e9);
  for (let i = 0; i < N; i++) {
    if (isOcean[i] || lake[i] || e[i] > 0.6 || biome[i] === B.SNOW) continue;
    const x = i % GW, y = (i / GW) | 0;
    if (x < 6 || y < 6 || x > GW - 7 || y > GH - 7) continue;
    score[i] = 1.1 - Math.abs(m[i] - 0.55) - Math.abs(t[i] - 0.5) * 0.8 - e[i] * 0.9 + (isRiver[i] ? 0.55 : 0) + (coastal(i) ? 0.45 : 0)
      + (biome[i] === B.DESERT || biome[i] === B.TUNDRA ? -0.4 : 0) + (biome[i] === B.SWAMP ? -0.3 : 0) + r() * 0.45;
  }
  const towns = [];
  if (edit?.towns) {
    for (const t0 of edit.towns) {
      const gx = Math.max(0, Math.min(GW - 1, Math.round(t0.gx))), gy = Math.max(0, Math.min(GH - 1, Math.round(t0.gy))), c = idx(gx, gy);
      if (isOcean[c] || lake[c]) continue;
      towns.push({ ...t0, cell: c, gx, gy, port: coastal(c), river: !!isRiver[c] });
    }
  } else {
  const byScore = [...score.keys()].filter(i => score[i] > -1e8).sort((a, b) => score[b] - score[a]);
  const far = (i, d) => towns.every(tw => Math.hypot(tw.gx - (i % GW), tw.gy - ((i / GW) | 0)) >= d);
  const capSpacing = Math.max(14, Math.sqrt(landCount / Math.max(1, o.realms)) * 0.75);
  for (const i of byScore) {
    if (towns.filter(tw => tw.capital).length >= o.realms) break;
    if (far(i, capSpacing)) towns.push({ cell: i, gx: i % GW, gy: (i / GW) | 0, capital: true });
  }
  const townSpacing = Math.max(7, Math.sqrt(landCount / Math.max(1, o.towns + o.realms)) * 0.55);
  for (const i of byScore) {
    if (towns.length >= o.towns + o.realms) break;
    if (far(i, townSpacing)) towns.push({ cell: i, gx: i % GW, gy: (i / GW) | 0, capital: false });
  }
  const usedNames = new Set();
  for (const tw of towns) {
    let nm; do { nm = placeName(r); } while (usedNames.has(nm)); usedNames.add(nm);
    tw.name = nm; tw.port = coastal(tw.cell); tw.river = !!isRiver[tw.cell];
  }
  }

  // ---- realms (multi-source Dijkstra over land) ----
  const owner = new Int16Array(N).fill(-1);
  const capitals = towns.filter(tw => tw.capital);
  const realms = capitals.map((c, k) => {
    if (edit?.towns && edit.realms) {
      const er = edit.realms.find(x => x.id === c.rid);
      return { id: k, rid: c.rid, name: er?.name || 'New realm', capital: c, color: er?.color || REALM_COLORS[k % REALM_COLORS.length] };
    }
    const base = realmBase(r);
    c.rid = k;
    return { id: k, rid: k, name: realmName(r, base), capital: c, color: REALM_COLORS[k % REALM_COLORS.length] };
  });
  {
    const cost = new Float32Array(N).fill(Infinity), hp = new Heap();
    capitals.forEach((c, k) => { cost[c.cell] = 0; owner[c.cell] = k; hp.push(0, c.cell); });
    while (hp.size) {
      const c = hp.pop(), x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const nn = idx(xx, yy);
        if (isOcean[nn]) continue;
        const nc = cost[c] + 1 + e[nn] * 7 + (isRiver[nn] ? 1.5 : 0) + (lake[nn] ? 3 : 0);
        if (nc < cost[nn]) { cost[nn] = nc; owner[nn] = owner[c]; hp.push(nc, nn); }
      }
    }
  }
  if (edit?.realmPaint) {
    const byRid = new Map(realms.map(rl => [rl.rid, rl.id]));
    for (let i = 0; i < N; i++) {
      const v = edit.realmPaint[i];
      if (v === -2 || isOcean[i]) continue;
      owner[i] = v === -1 ? -1 : (byRid.has(v) ? byRid.get(v) : owner[i]);
    }
  }
  for (const tw of towns) { tw.realm = owner[tw.cell]; }

  // ---- roads (A* that prefers reusing earlier roads) ----
  const roadCell = new Uint8Array(N);
  const roads = [];
  const astar = (a, b) => {
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), hp = new Heap();
    const bx = b % GW, by = (b / GW) | 0;
    g[a] = 0; hp.push(0, a);
    let visited = 0;
    while (hp.size) {
      const c = hp.pop();
      if (c === b) break;
      if (++visited > 60000) return null;
      const x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const nn = idx(xx, yy);
        if (isOcean[nn] || lake[nn]) continue;
        const step = (dx && dy ? 1.414 : 1) * (1 + e[nn] * 14 + (isRiver[nn] && !roadCell[nn] ? 2 : 0)) * (roadCell[nn] ? 0.35 : 1);
        const ng = g[c] + step;
        if (ng < g[nn]) { g[nn] = ng; from[nn] = c; hp.push(ng + Math.hypot(xx - bx, yy - by) * 0.35, nn); }
      }
    }
    if (from[b] < 0) return null;
    const path = [];
    for (let c = b; c >= 0; c = from[c]) { path.push(c); if (c === a) break; }
    return path.reverse();
  };
  const connected = [...capitals];
  const addRoad = path => {
    if (!path) return;
    path.forEach(c => roadCell[c] = 1);
    roads.push(path.map(c => [c % GW + jx[c] * 0.4, ((c / GW) | 0) + jy[c] * 0.4]));
  };
  // capitals to their nearest neighbouring capital
  const linked = new Set();
  for (const c of capitals) {
    const near = capitals.filter(o2 => o2 !== c).sort((a, b) => Math.hypot(a.gx - c.gx, a.gy - c.gy) - Math.hypot(b.gx - c.gx, b.gy - c.gy))[0];
    if (!near) continue;
    const key = [c.cell, near.cell].sort().join('-');
    if (linked.has(key) || Math.hypot(near.gx - c.gx, near.gy - c.gy) > GW * 0.55) continue;
    linked.add(key);
    addRoad(astar(c.cell, near.cell));
  }
  const rest = towns.filter(tw => !tw.capital).sort((a, b) => {
    const da = Math.min(...capitals.map(c => Math.hypot(c.gx - a.gx, c.gy - a.gy)));
    const db = Math.min(...capitals.map(c => Math.hypot(c.gx - b.gx, c.gy - b.gy)));
    return da - db;
  });
  for (const tw of rest) {
    const target = connected.slice().sort((a, b) => Math.hypot(a.gx - tw.gx, a.gy - tw.gy) - Math.hypot(b.gx - tw.gx, b.gy - tw.gy))[0];
    if (target && Math.hypot(target.gx - tw.gx, target.gy - tw.gy) < GW * 0.4) addRoad(astar(tw.cell, target.cell));
    connected.push(tw);
  }
  if (edit?.noRoads) roads.length = 0;
  for (const hr of edit?.roads || []) if (hr.pts?.length > 1) roads.push(hr.pts.map(p => [p[0], p[1]]));

  // ---- region labels ----
  const components = (pred, minSize) => {
    const comp = new Int32Array(N).fill(-1), out = [];
    for (let i = 0; i < N; i++) {
      if (!pred(i) || comp[i] >= 0) continue;
      const q = [i]; comp[i] = out.length;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], x = c % GW, y = (c / GW) | 0;
        for (const [dx, dy] of N8) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
          const nn = idx(xx, yy);
          if (pred(nn) && comp[nn] < 0) { comp[nn] = out.length; q.push(nn); }
        }
      }
      out.push(q);
    }
    return out.filter(c => c.length >= minSize).sort((a, b) => b.length - a.length);
  };
  const centerCell = cells => {
    const cx = cells.reduce((s, c) => s + c % GW, 0) / cells.length, cy = cells.reduce((s, c) => s + ((c / GW) | 0), 0) / cells.length;
    let best = cells[0], bd = Infinity;
    for (const c of cells) { const d = Math.hypot(c % GW - cx, ((c / GW) | 0) - cy); if (d < bd) { bd = d; best = c; } }
    return [best % GW, (best / GW) | 0];
  };
  const rL = rng(o.seed + ':labels' + (edit?.nameSeed || ''));
  const regionLabels = [];
  for (const comp of components(i => !isOcean[i] && e[i] > 0.62, 25).slice(0, 3)) regionLabels.push({ kind: 'mountain', name: mountainName(rL), pos: centerCell(comp) });
  for (const comp of components(i => biome[i] === B.FOREST || biome[i] === B.TAIGA || biome[i] === B.JUNGLE, 60).slice(0, 3)) regionLabels.push({ kind: 'forest', name: forestName(rL), pos: centerCell(comp) });
  // seas: deepest open water
  const seaSpots = [...dLand.keys()].filter(i => {
    const x = i % GW, y = (i / GW) | 0;
    return isOcean[i] && dLand[i] >= 4 && x > GW * 0.14 && x < GW * 0.86 && y > GH * 0.12 && y < GH * 0.88;
  }).sort((a, b) => dLand[b] - dLand[a]);
  const seas = [];
  for (const i of seaSpots) {
    const p = [i % GW, (i / GW) | 0];
    if (seas.every(s => Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1]) > GW * 0.35)) seas.push({ kind: 'sea', name: seaName(rL), pos: p });
    if (seas.length >= 2) break;
  }
  regionLabels.push(...seas);
  // renamed or hidden labels, and labels placed by hand
  regionLabels.forEach((l, i) => { l.key = `${l.kind}:${i}`; const ov = edit?.labelNames?.[l.key]; if (ov != null) l.name = ov; });
  for (const cl of edit?.labels || []) regionLabels.push({ kind: 'custom', name: cl.text, pos: [cl.x, cl.y], size: cl.size || 1, key: 'c:' + cl.id });
  for (let i = regionLabels.length - 1; i >= 0; i--) if (!regionLabels[i].name) regionLabels.splice(i, 1);
  // realm label anchors: deepest interior cell of each realm
  {
    const dIn = new Float32Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) {
      if (owner[i] < 0) continue;
      const x = i % GW, y = (i / GW) | 0;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH || owner[idx(xx, yy)] !== owner[i]) { edge = true; break; }
      }
      if (edge) { dIn[i] = 0; q.push(i); }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
        const nn = idx(xx, yy);
        if (owner[nn] === owner[c] && dIn[nn] < 0) { dIn[nn] = dIn[c] + 1; q.push(nn); }
      }
    }
    for (const rl of realms) {
      let best = -1, bd = -1;
      for (let i = 0; i < N; i++) if (owner[i] === rl.id && dIn[i] > bd) { bd = dIn[i]; best = i; }
      rl.anchor = best >= 0 ? [best % GW, (best / GW) | 0] : [rl.capital.gx, rl.capital.gy];
      rl.size = owner.reduce((s, v) => s + (v === rl.id ? 1 : 0), 0);
    }
  }

  return { o, GW, GH, h, ridgeF, sea, hmax, eCurve, e, isOcean, lake, dLand, dWater, m, t, biome, owner, rivers, riverThr: thr, isRiver, roads, towns, realms, regionLabels, icons: edit?.icons || [] };
}

// ---------------- Editing ----------------
export const BIOMES = B;
export const BIOME_LABELS = [[B.GRASS, 'Grassland'], [B.FOREST, 'Forest'], [B.TAIGA, 'Pine forest'], [B.JUNGLE, 'Jungle'], [B.SWAMP, 'Swamp'],
  [B.SAVANNA, 'Savanna'], [B.DESERT, 'Desert'], [B.TUNDRA, 'Tundra'], [B.SNOW, 'Snow & ice']];
export { REALM_COLORS };

export function makeEditState(data) {
  return {
    GW: data.GW, GH: data.GH,
    h: Float32Array.from(data.h), ridge: Float32Array.from(data.ridgeF), sea: data.sea, hmax: data.hmax, eCurve: data.eCurve.slice(),
    biome: new Uint8Array(data.GW * data.GH).fill(255), realmPaint: new Int16Array(data.GW * data.GH).fill(-2),
    towns: data.towns.map(t => ({ gx: t.gx, gy: t.gy, name: t.name, capital: !!t.capital, rid: t.capital ? t.rid : undefined })),
    realms: data.realms.map(rl => ({ id: rl.rid, name: rl.name, color: rl.color })),
    rivers: [], roads: [], labels: [], labelNames: {}, nameSeed: '', noRoads: false, noRiver: new Uint8Array(data.GW * data.GH), icons: [],
  };
}
// fill in anything an older or partial edit state is missing
export function completeEdit(ed, data) {
  ed.GW = ed.GW || data.GW; ed.GH = ed.GH || data.GH;
  if (ed.sea == null) { ed.sea = data.sea; ed.hmax = data.hmax; }
  if (!ed.eCurve || !ed.eCurve.length) ed.eCurve = data.eCurve.slice();
  if (!ed.ridge) ed.ridge = Float32Array.from(data.ridgeF);
  if (!ed.biome) ed.biome = new Uint8Array(ed.GW * ed.GH).fill(255);
  if (!ed.realmPaint) ed.realmPaint = new Int16Array(ed.GW * ed.GH).fill(-2);
  if (!ed.towns) { ed.towns = data.towns.map(t => ({ gx: t.gx, gy: t.gy, name: t.name, capital: !!t.capital, rid: t.capital ? t.rid : undefined })); ed.realms = data.realms.map(rl => ({ id: rl.rid, name: rl.name, color: rl.color })); }
  ed.dry = ed.dry || [];
  ed.icons = ed.icons || [];
  ed.rivers = ed.rivers || []; ed.roads = ed.roads || []; ed.labels = ed.labels || []; ed.labelNames = ed.labelNames || {}; ed.nameSeed = ed.nameSeed || '';
  if (!ed.noRiver) ed.noRiver = new Uint8Array(ed.GW * ed.GH);
  return ed;
}
export function cloneEdit(ed) {
  return { ...ed, h: Float32Array.from(ed.h), ridge: Float32Array.from(ed.ridge), eCurve: ed.eCurve.slice(), biome: Uint8Array.from(ed.biome),
    realmPaint: Int16Array.from(ed.realmPaint), towns: ed.towns.map(t => ({ ...t })), realms: ed.realms.map(rl => ({ ...rl })),
    rivers: (ed.rivers || []).map(r => ({ ...r, pts: r.pts.map(p => [...p]) })), roads: (ed.roads || []).map(r => ({ ...r, pts: r.pts.map(p => [...p]) })),
    labels: (ed.labels || []).map(l => ({ ...l })), labelNames: { ...(ed.labelNames || {}) }, noRiver: ed.noRiver ? Uint8Array.from(ed.noRiver) : null, dry: (ed.dry || []).map(d => [...d]), icons: (ed.icons || []).map(i => ({ ...i })) };
}

// one dab of a brush at grid position (gx, gy). radius in cells, strength 0..1
export function applyBrush(ed, tool, gx, gy, radius, strength, value) {
  const { h, ridge, sea, GW, GH } = ed, span = Math.max(0.05, ed.hmax - sea);
  if (tool === 'dry') {
    // remember the exact spot, so even a hair-thin brush can dry a river (no snapping to the terrain grid)
    ed.dry = ed.dry || [];
    const last = ed.dry[ed.dry.length - 1];
    if (!last || Math.hypot(last[0] - gx, last[1] - gy) > radius * 0.3 || last[2] !== radius) ed.dry.push([+gx.toFixed(2), +gy.toFixed(2), +radius.toFixed(2)]);
    return;
  }
  const x0 = Math.max(0, Math.floor(gx - radius)), x1 = Math.min(GW - 1, Math.ceil(gx + radius));
  const y0 = Math.max(0, Math.floor(gy - radius)), y1 = Math.min(GH - 1, Math.ceil(gy + radius));
  let avgH = 0, avgR = 0, cnt = 0;
  if (tool === 'smooth') {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * GW + x; avgH += h[i]; avgR += ridge[i]; cnt++; }
    avgH /= cnt; avgR /= cnt;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - gx, y - gy) / radius;
    if (d > 1) continue;
    const f = Math.pow(1 - d * d, 1.5), i = y * GW + x, s = strength * f;
    switch (tool) {
      case 'raise': h[i] += span * 0.06 * s; break;
      case 'lower': h[i] -= span * 0.06 * s; break;
      case 'mountain':
        ridge[i] = Math.min(1.4, ridge[i] + 0.16 * s);
        if (h[i] < sea + span * 0.06) h[i] += (sea + span * 0.06 - h[i]) * Math.min(1, s * 2);
        break;
      case 'smooth': h[i] += (avgH - h[i]) * 0.35 * s; ridge[i] += (avgR - ridge[i]) * 0.35 * s; break;
      case 'flatten':
        ridge[i] *= 1 - 0.3 * s;
        if (h[i] > sea + span * 0.08) h[i] -= (h[i] - (sea + span * 0.08)) * 0.3 * s;
        break;
      case 'land': if (h[i] < sea + span * 0.05) h[i] += (sea + span * 0.05 - h[i]) * Math.min(1, s * 1.5); break;
      case 'sea': if (h[i] > sea - span * 0.12) h[i] -= (h[i] - (sea - span * 0.12)) * Math.min(1, s * 1.5); ridge[i] *= 1 - 0.5 * s; break;
      case 'biome': if (f > 0.12) ed.biome[i] = value; break;
      case 'realm': if (f > 0.12) ed.realmPaint[i] = value; break;
      case 'dry': break; // handled below with exact points
      case 'wet': if (f > 0.1) ed.noRiver[i] = 0; break;
    }
  }
}

// quick low-res look at the edit state while a brush stroke is in progress
export function drawEditPreview(ed, canvas, data) {
  const { GW, GH } = ed;
  canvas.width = GW; canvas.height = GH;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(GW, GH), d = img.data;
  const rc = new Map(ed.realms.map(rl => [rl.id, hexToRgb(rl.color)]));
  const BC = { 1: [196, 206, 140], 2: [92, 140, 78], 3: [70, 110, 90], 4: [60, 130, 70], 5: [226, 200, 140], 6: [200, 186, 110], 7: [180, 186, 176], 8: [244, 246, 250], 9: [110, 128, 90] };
  for (let i = 0; i < GW * GH; i++) {
    const o = i * 4, land = ed.h[i] >= ed.sea;
    let c = land ? [176, 190, 132] : [96, 140, 176];
    if (land) {
      const hh = Math.max(0, (ed.h[i] - ed.sea) / (ed.hmax - ed.sea)) * 0.5 + ed.ridge[i] * 0.6;
      c = mix(c, [150, 128, 104], Math.min(1, hh));
      const b = ed.biome[i] !== 255 ? ed.biome[i] : data?.biome?.[i];
      if (b && BC[b] && ed.biome[i] !== 255) c = mix(c, BC[b], 0.75);
      const rp = ed.realmPaint[i];
      if (rp >= 0 && rc.has(rp)) c = mix(c, rc.get(rp), 0.55);
      else if (rp === -1) c = mix(c, [255, 255, 255], 0.45);
    }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 200;
  }
  ctx.putImageData(img, 0, 0);
}

// save / load edit state as a compact binary file (heights stored as 16-bit, gzipped where the browser supports it)
export async function editToBlob(ed, o) {
  const { GW, GH } = ed, N = GW * GH;
  let lo = Infinity, hi = -Infinity, rhi = 0;
  for (let i = 0; i < N; i++) { if (ed.h[i] < lo) lo = ed.h[i]; if (ed.h[i] > hi) hi = ed.h[i]; if (ed.ridge[i] > rhi) rhi = ed.ridge[i]; }
  const span = Math.max(1e-6, hi - lo), rspan = Math.max(1e-6, rhi);
  const qh = new Uint16Array(N), qr = new Uint16Array(N);
  for (let i = 0; i < N; i++) { qh[i] = Math.round((ed.h[i] - lo) / span * 65535); qr[i] = Math.round(Math.max(0, ed.ridge[i]) / rspan * 65535); }
  const head = new TextEncoder().encode(JSON.stringify({ v: 3, GW, GH, o, lo, span, rspan, sea: ed.sea, hmax: ed.hmax, eCurve: ed.eCurve, towns: ed.towns, realms: ed.realms,
    rivers: ed.rivers || [], roads: ed.roads || [], labels: ed.labels || [], labelNames: ed.labelNames || {}, nameSeed: ed.nameSeed || '', noRoads: !!ed.noRoads, dry: ed.dry || [], townSeed: ed.townSeed || '', icons: ed.icons || [] }));
  const pad = new Uint8Array((4 - (head.length % 4)) % 4);
  let blob = new Blob([new Uint32Array([head.length]), head, pad, qh, qr, ed.realmPaint, ed.biome, ed.noRiver || new Uint8Array(N)]);
  if (typeof CompressionStream !== 'undefined') blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return new Blob([blob], { type: 'application/octet-stream' });
}
export async function editFromBlob(blob) {
  let buf = await blob.arrayBuffer();
  const b0 = new Uint8Array(buf, 0, 2);
  if (b0[0] === 0x1f && b0[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const n = new Uint32Array(buf.slice(0, 4))[0];
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const { GW, GH } = head;
  let off = 4 + n + ((4 - (n % 4)) % 4);
  const N = GW * GH;
  const take = (Ctor, bytes) => { const a = new Ctor(buf.slice(off, off + bytes)); off += bytes; return a; };
  const qh = take(Uint16Array, N * 2), qr = take(Uint16Array, N * 2), realmPaint = take(Int16Array, N * 2), biome = take(Uint8Array, N);
  const noRiver = head.v >= 3 ? take(Uint8Array, N) : new Uint8Array(N);
  const h = new Float32Array(N), ridge = new Float32Array(N);
  for (let i = 0; i < N; i++) { h[i] = head.lo + qh[i] / 65535 * head.span; ridge[i] = qr[i] / 65535 * head.rspan; }
  return { o: head.o, edit: { GW, GH, h, ridge, realmPaint, biome, noRiver, sea: head.sea, hmax: head.hmax, eCurve: head.eCurve, towns: head.towns, realms: head.realms,
    rivers: head.rivers || [], roads: head.roads || [], labels: head.labels || [], labelNames: head.labelNames || {}, nameSeed: head.nameSeed || '', noRoads: !!head.noRoads,
    dry: head.dry || [], townSeed: head.townSeed || '', icons: head.icons || [] } };
}

// ---------------- Rendering ----------------
const STYLES = {
  parchment: {
    paper: [234, 221, 192], ink: [58, 43, 28], water: [[211, 209, 186], [184, 190, 177]], river: [62, 84, 102], road: [128, 82, 44],
    border: [128, 52, 40], realmAlpha: 0.09, shade: 0.9, grain: 13, vignette: 0.32, symbolFill: null, treeFill: [214, 208, 165], rock: null,
    biome: { 1: [228, 215, 177], 2: [216, 210, 167], 3: [208, 206, 173], 4: [204, 206, 155], 5: [240, 226, 187], 6: [234, 217, 170], 7: [226, 222, 205], 8: [242, 239, 230], 9: [210, 207, 172], 10: [211, 209, 186] },
    label: [58, 43, 28], seaLabel: [70, 84, 92],
  },
  atlas: {
    paper: [241, 234, 216], ink: [44, 40, 36], water: [[150, 196, 214], [58, 104, 146]], river: [58, 110, 160], road: [152, 92, 52],
    border: [90, 40, 40], realmAlpha: 0.16, shade: 2.2, grain: 5, vignette: 0.12, treeFill: [92, 140, 78], rock: [150, 134, 112],
    biome: { 1: [172, 198, 122], 2: [112, 156, 92], 3: [102, 134, 102], 4: [76, 136, 74], 5: [228, 208, 152], 6: [204, 192, 122], 7: [196, 200, 186], 8: [246, 247, 250], 9: [122, 144, 108], 10: [150, 196, 214] },
    label: [36, 32, 28], seaLabel: [232, 240, 246],
  },
  night: {
    paper: [24, 22, 30], ink: [212, 162, 76], water: [[30, 50, 70], [12, 22, 36]], river: [98, 150, 190], road: [212, 162, 76],
    border: [212, 162, 76], realmAlpha: 0.12, shade: 1.6, grain: 6, vignette: 0.4, treeFill: [52, 66, 58], rock: [70, 64, 82],
    biome: { 1: [62, 60, 72], 2: [50, 60, 58], 3: [48, 56, 62], 4: [44, 62, 54], 5: [78, 70, 66], 6: [70, 66, 62], 7: [70, 72, 82], 8: [140, 146, 160], 9: [48, 58, 60], 10: [30, 50, 70] },
    label: [235, 229, 216], seaLabel: [150, 180, 205],
  },
};
// Inspired-by looks: hand-inked epic fantasy, colourful storybook, painted, realistic relief, Azgaar-like political cells
STYLES.quill = {
  paper: [226, 208, 170], ink: [62, 43, 24], water: [[223, 205, 167], [214, 195, 156]], river: [62, 43, 24], road: [110, 78, 46],
  border: [92, 60, 32], realmAlpha: 0, shade: 0.45, grain: 20, vignette: 0.45, treeFill: [230, 213, 176], rock: null,
  biome: { 1: [226, 208, 170], 2: [222, 204, 164], 3: [220, 202, 164], 4: [220, 202, 160], 5: [232, 214, 174], 6: [228, 210, 168], 7: [224, 210, 178], 8: [236, 224, 196], 9: [218, 202, 162], 10: [214, 195, 156] },
  label: [62, 43, 24], seaLabel: [62, 43, 24], sym: 'quill', ripples: [[1.2, 0.5], [2.2, 0.38], [3.4, 0.27], [5, 0.18], [7, 0.11], [9.5, 0.06]],
  coast: 'ink', borders: 'faint', roadAlpha: 0.4, realmFont: '"Uncial Antiqua", "Cormorant Garamond", Georgia, serif', realmSpacing: 26, realmAlpha2: 0.55, realmSize: 1.6, noHalo: true,
};
STYLES.storybook = {
  paper: [250, 244, 226], ink: [52, 56, 74], water: [[120, 210, 222], [52, 136, 196]], shallow: [176, 236, 228], river: [62, 150, 210], road: [176, 120, 76],
  border: [214, 92, 92], realmAlpha: 0.15, shade: 1.6, grain: 3, vignette: 0.08, treeFill: [104, 182, 92], rock: [184, 176, 196], rockShade: [130, 120, 152],
  biome: { 1: [180, 216, 116], 2: [132, 194, 98], 3: [112, 164, 112], 4: [98, 186, 96], 5: [246, 216, 142], 6: [226, 206, 120], 7: [208, 216, 206], 8: [250, 250, 252], 9: [142, 164, 102], 10: [120, 210, 222] },
  label: [40, 48, 80], seaLabel: [255, 255, 255], sym: 'storybook', ripples: [[1.1, 0.75], [2.4, 0.35]], rippleCol: [255, 255, 255], coast: 'surf', seaHalo: [40, 90, 140],
};
STYLES.painted = {
  paper: [236, 226, 204], ink: [40, 36, 30], water: [[64, 124, 146], [24, 56, 82]], shallow: [126, 192, 200], river: [104, 168, 196], road: [160, 120, 80],
  border: [236, 214, 170], realmAlpha: 0.05, shade: 2.8, grain: 5, vignette: 0.3, treeFill: [52, 92, 50], rock: [156, 132, 108], rockShade: [92, 74, 62],
  biome: { 1: [178, 170, 84], 2: [96, 124, 60], 3: [74, 100, 64], 4: [76, 124, 60], 5: [216, 170, 96], 6: [192, 162, 82], 7: [150, 148, 124], 8: [240, 242, 246], 9: [112, 118, 72], 10: [64, 124, 146] },
  label: [250, 244, 230], labelHalo: [24, 22, 20], seaLabel: [226, 238, 244], sym: 'painted', texture: 16, clouds: true, ripples: [[1.2, 0.4], [2.6, 0.2]], rippleCol: [200, 236, 240],
  coast: 'soft', borders: 'light', noFrame: true,
};
STYLES.relief = {
  paper: [245, 242, 235], ink: [46, 46, 50], water: [[150, 198, 222], [26, 74, 134]], river: [58, 118, 182], road: [150, 86, 52],
  border: [120, 40, 40], realmAlpha: 0, shade: 2.3, grain: 0, vignette: 0.06, hypso: true, treeFill: [92, 140, 78], rock: null,
  biome: STYLES.atlas.biome, label: [28, 28, 30], seaLabel: [226, 238, 248], sym: 'none', ripples: [], coast: 'thin', borders: 'thin', depthSpan: 22, texture: 5,
};
STYLES.cells = {
  paper: [238, 234, 224], ink: [40, 40, 46], water: [[170, 206, 226], [92, 146, 194]], river: [70, 130, 190], road: [130, 90, 60],
  border: [40, 40, 46], realmAlpha: 0.5, shade: 0.9, grain: 0, vignette: 0, cells: true, treeFill: [92, 140, 78], rock: [170, 160, 140],
  biome: { 1: [214, 226, 170], 2: [176, 206, 146], 3: [168, 192, 160], 4: [160, 206, 140], 5: [240, 226, 182], 6: [230, 218, 160], 7: [220, 224, 214], 8: [248, 248, 250], 9: [184, 196, 150], 10: [170, 206, 226] },
  label: [30, 30, 36], seaLabel: [56, 88, 120], sym: 'small', ripples: [], coast: 'none', borders: 'none',
};
STYLES.cells.cells = 'cells'; STYLES.cells.bands = 6; STYLES.cells.depthSpan = 15;
STYLES.pastel = {
  paper: [246, 242, 232], ink: [62, 60, 74], water: [[156, 182, 218], [104, 134, 188]], river: [116, 138, 186], road: [214, 112, 58],
  border: [88, 84, 98], realmAlpha: 0, shade: 0.5, grain: 4, vignette: 0, bands: 6, depthSpan: 15, cells: 'pastel', treeFill: [150, 186, 130], rock: [190, 182, 170],
  biome: { 1: [214, 228, 182], 2: [186, 214, 170], 3: [180, 204, 184], 4: [176, 214, 166], 5: [240, 228, 190], 6: [234, 224, 176], 7: [222, 226, 220], 8: [246, 248, 250], 9: [196, 206, 170], 10: [156, 182, 218] },
  label: [52, 50, 66], seaLabel: [64, 86, 128], sym: 'none', ripples: [], coast: 'none', borders: 'none',
  realmFont: '"Almendra SC", "Cormorant Garamond", Georgia, serif', realmSpacing: 1.5, realmAlpha2: 0.9, realmSize: 1.25, townSmall: true,
};
export const STYLE_NAMES = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night (gold ink)', quill: 'Ink & Quill', storybook: 'Storybook', painted: 'Painted', relief: 'Realistic', cells: 'Political cells', pastel: 'Pastel political' };
// what can be switched on and off in the Layers panel
export const LAYERS = [['realms', 'Realm colours'], ['borders', 'Borders'], ['relief', 'Mountains & hills'], ['forests', 'Forests & plants'], ['rivers', 'Rivers'],
  ['roads', 'Roads'], ['towns', 'Towns'], ['townLabels', 'Town names'], ['realmLabels', 'Realm names'], ['regionLabels', 'Mountain, forest & custom labels'], ['seaLabels', 'Sea names'], ['ripples', 'Coastal ripples'], ['icons', 'Map icons']];

// colours for a frame/compass drawn around the view, and the colour beyond the map's edge
export function worldFrameStyle(styleName) {
  const S = STYLES[styleName] || STYLES.parchment;
  const back = styleName === 'painted' ? [236, 240, 244] : S.water[1];
  return { ink: rgba(S.ink), paper: rgba(S.paper), back: rgba(back) };
}

const HYPSO = [[0, [118, 158, 92]], [0.18, [148, 176, 104]], [0.36, [196, 190, 128]], [0.55, [186, 150, 104]], [0.74, [150, 120, 94]], [0.9, [172, 164, 160]], [0.98, [240, 240, 244]]];
function hypso(v) {
  for (let j = 1; j < HYPSO.length; j++) if (v <= HYPSO[j][0]) return mix(HYPSO[j - 1][1], HYPSO[j][1], (v - HYPSO[j - 1][0]) / (HYPSO[j][0] - HYPSO[j - 1][0]));
  return HYPSO[HYPSO.length - 1][1];
}

export function renderWorld(data, canvas, styleName = 'parchment', ropts = {}) {
  const furniture = ropts.furniture !== false;
  const S = STYLES[styleName] || STYLES.parchment;
  const { GW: gw, GH: gh, h, sea, e, isOcean, lake, dLand, biome, owner } = data;
  const N = gw * gh;
  const cs = CELL_PX, k = 1, W = Math.round(gw * cs), H = Math.round(gh * cs);
  // view: draw only part of the map, magnified (sharp zoom). Otherwise the whole map at 1:1.
  const view = ropts.view;
  const ctx = canvas.getContext('2d');
  if (view) {
    canvas.width = Math.max(1, Math.round(view.w * view.s)); canvas.height = Math.max(1, Math.round(view.h * view.s));
    ctx.setTransform(view.s, 0, 0, view.s, -view.x * view.s, -view.y * view.s);
    ctx.imageSmoothingQuality = 'high';
  } else { canvas.width = W; canvas.height = H; }
  const r = rng(data.o.seed + ':render');
  const ink = rgba(S.ink), paperC = rgba(S.paper);
  const LY = { ...Object.fromEntries(LAYERS.map(([k]) => [k, true])), ...(ropts.layers || {}) };

  const f = new Float32Array(N);
  for (let i = 0; i < N; i++) f[i] = lake[i] ? -0.004 : h[i] - sea;
  if (!Object.prototype.hasOwnProperty.call(data, '_raster')) Object.defineProperty(data, '_raster', { value: {}, enumerable: false, writable: true });
  const rkey = styleName + (LY.realms ? '' : ':plain');
  let raster = data._raster[rkey];
  if (!raster) {
  // --- per-cell colours ---
  const LR = new Float32Array(N), LG = new Float32Array(N), LB = new Float32Array(N);
  const WR = new Float32Array(N), WG = new Float32Array(N), WB = new Float32Array(N);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x;
    let c = S.biome[biome[i]] || S.biome[1];
    if (isOcean[i]) c = S.biome[1];
    if (S.hypso && !isOcean[i]) {
      c = hypso(e[i]);
      const b = biome[i];
      if (b === B.DESERT) c = mix(c, [222, 196, 140], 0.6); else if (b === B.SAVANNA) c = mix(c, [206, 190, 122], 0.4);
      else if (b === B.FOREST || b === B.JUNGLE) c = mix(c, [72, 120, 64], 0.4); else if (b === B.TAIGA) c = mix(c, [72, 100, 78], 0.45);
      else if (b === B.SNOW) c = mix(c, [246, 248, 252], 0.35); else if (b === B.TUNDRA) c = mix(c, [176, 178, 164], 0.5); else if (b === B.SWAMP) c = mix(c, [110, 122, 80], 0.45);
    }
    if (S.rock && e[i] > 0.5) c = mix(c, S.rock, smooth(0.5, 0.8, e[i]));
    if (S.rock && e[i] > 0.85) c = mix(c, S.biome[8], smooth(0.85, 0.96, e[i]));
    const el = j => h[j] * 0.5 + e[j] * 0.22;
    const hx = el(y * gw + Math.max(0, x - 1)) - el(y * gw + Math.min(gw - 1, x + 1));
    const hy = el(Math.max(0, y - 1) * gw + x) - el(Math.min(gh - 1, y + 1) * gw + x);
    const shade = 1 + (hx * 0.7 + hy) * S.shade * 2.2;
    LR[i] = c[0] * shade; LG[i] = c[1] * shade; LB[i] = c[2] * shade;
    const depth = isOcean[i] ? smooth(0, S.depthSpan || (styleName === 'atlas' || S.shallow ? 9 : 14), dLand[i]) : 0;
    let wc = mix(S.water[0], S.water[1], S.bands ? Math.floor(depth * S.bands) / (S.bands - 1) : depth);
    if (S.shallow && isOcean[i]) wc = mix(S.shallow, wc, smooth(0.5, 3.2, dLand[i]));
    if (isOcean[i] && data.t && data.t[i] < 0.06) wc = mix(wc, [236, 242, 246], 0.85); // sea ice
    WR[i] = wc[0]; WG[i] = wc[1]; WB[i] = wc[2];
  }
  if (S.hypso) { const sm = a => blur(a, gw, gh, 1, 1); const [a1, a2, a3] = [LR, LG, LB].map(sm); for (let i = 0; i < N; i++) if (!isOcean[i]) { LR[i] = a1[i]; LG[i] = a2[i]; LB[i] = a3[i]; } }
  // realm washes (premultiplied, blurred for soft edges)
  let TA = new Float32Array(N), TR = new Float32Array(N), TG = new Float32Array(N), TB = new Float32Array(N);
  const realmRGB = data.realms.map(rl => hexToRgb(rl.color));
  for (let i = 0; i < N; i++) {
    if (owner[i] < 0 || isOcean[i] || !LY.realms) continue;
    const c = realmRGB[owner[i]];
    TA[i] = S.realmAlpha; TR[i] = c[0] * S.realmAlpha; TG[i] = c[1] * S.realmAlpha; TB[i] = c[2] * S.realmAlpha;
  }
  [TA, TR, TG, TB] = [TA, TR, TG, TB].map(a => blur(a, gw, gh, 2, 1));

  // --- raster pass ---
  const img = ctx.createImageData(W, H);
  const d = img.data;
  // painterly texture: a tiled noise patch plus broad blotches
  let tex = null;
  if (S.texture) {
    const tn = makeNoise(rng(data.o.seed + ':tex'));
    tex = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) tex[y * 256 + x] = tn.fbm(x / 22, y / 22, 4) * S.texture + tn.fbm(x / 6, y / 6, 2) * S.texture * 0.35;
  }
  for (let py = 0; py < H; py++) {
    let gy = py / cs - 0.5; if (gy < 0) gy = 0; if (gy > gh - 1.001) gy = gh - 1.001;
    const y0 = gy | 0, ty = gy - y0;
    for (let px = 0; px < W; px++) {
      let gx = px / cs - 0.5; if (gx < 0) gx = 0; if (gx > gw - 1.001) gx = gw - 1.001;
      const x0 = gx | 0, tx = gx - x0;
      const i00 = y0 * gw + x0, i10 = i00 + 1, i01 = i00 + gw, i11 = i01 + 1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const fv = f[i00] * w00 + f[i10] * w10 + f[i01] * w01 + f[i11] * w11;
      let R, G, Bc;
      if (fv < 0 || S.cells) {
        R = WR[i00] * w00 + WR[i10] * w10 + WR[i01] * w01 + WR[i11] * w11;
        G = WG[i00] * w00 + WG[i10] * w10 + WG[i01] * w01 + WG[i11] * w11;
        Bc = WB[i00] * w00 + WB[i10] * w10 + WB[i01] * w01 + WB[i11] * w11;
      } else {
        R = LR[i00] * w00 + LR[i10] * w10 + LR[i01] * w01 + LR[i11] * w11;
        G = LG[i00] * w00 + LG[i10] * w10 + LG[i01] * w01 + LG[i11] * w11;
        Bc = LB[i00] * w00 + LB[i10] * w10 + LB[i01] * w01 + LB[i11] * w11;
        const a = TA[i00] * w00 + TA[i10] * w10 + TA[i01] * w01 + TA[i11] * w11;
        if (a > 0.001) {
          R = R * (1 - a) + (TR[i00] * w00 + TR[i10] * w10 + TR[i01] * w01 + TR[i11] * w11);
          G = G * (1 - a) + (TG[i00] * w00 + TG[i10] * w10 + TG[i01] * w01 + TG[i11] * w11);
          Bc = Bc * (1 - a) + (TB[i00] * w00 + TB[i10] * w10 + TB[i01] * w01 + TB[i11] * w11);
        }
      }
      const o = (py * W + px) * 4;
      if (tex) { const tv = tex[((py & 255) << 8) | (px & 255)] * (fv < 0 ? 1.2 : 1); R += tv; G += tv; Bc += tv * (fv < 0 ? 1.1 : 0.8); }
      d[o] = R; d[o + 1] = G; d[o + 2] = Bc; d[o + 3] = 255;
    }
  }
  paperGrain(img, W, H, rng(data.o.seed + ':grain'), S.grain, S.vignette);
  raster = document.createElement('canvas'); raster.width = W; raster.height = H;
  raster.getContext('2d').putImageData(img, 0, 0);
  data._raster[rkey] = raster;
  }
  ctx.drawImage(raster, 0, 0);
  if (S.cells) drawCellsVector(ctx, data, S, LY, cs);

  const toPx = p => [(p[0] + 0.5) * cs, (p[1] + 0.5) * cs];
  const strokeLines = (lines, closedSmooth = true, it = 2) => {
    ctx.beginPath();
    for (const ln of lines) { if (ln.length < 2) continue; tracePath(ctx, chaikin(ln.map(toPx), it, ln.closed && closedSmooth), ln.closed); }
    ctx.stroke();
  };

  // --- coastal ripple lines ---
  const dl = new Float32Array(N);
  for (let i = 0; i < N; i++) dl[i] = isOcean[i] ? dLand[i] : 0;
  const dls = blur(dl, gw, gh, 1, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const rippleCol = S.rippleCol || (styleName === 'atlas' ? [255, 255, 255] : S.ink);
  (LY.ripples ? (S.ripples || [[1.3, 0.38], [2.5, 0.26], [4, 0.16], [6, 0.09]]) : []).forEach(([lvl, a]) => {
    ctx.strokeStyle = rgba(rippleCol, a); ctx.lineWidth = (S.sym === 'quill' ? 1.1 : 1.3) * k;
    strokeLines(contour(dls, gw, gh, lvl));
  });

  // --- coastline ---
  const coast = contour(f, gw, gh, 0);
  const cst = S.coast || 'default';
  if (cst === 'default') {
    ctx.strokeStyle = rgba(S.water[1], styleName === 'night' ? 0.6 : 0.35); ctx.lineWidth = 7 * k; strokeLines(coast);
    ctx.strokeStyle = ink; ctx.lineWidth = 2.4 * k; strokeLines(coast);
  } else if (cst === 'ink') { ctx.strokeStyle = ink; ctx.lineWidth = 2.3 * k; strokeLines(coast); }
  else if (cst === 'surf') {
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 9 * k; strokeLines(coast);
    ctx.strokeStyle = ink; ctx.lineWidth = 2 * k; strokeLines(coast);
  } else if (cst === 'soft') {
    ctx.strokeStyle = rgba(S.shallow, 0.55); ctx.lineWidth = 6 * k; strokeLines(coast);
    ctx.strokeStyle = rgba(S.ink, 0.55); ctx.lineWidth = 1.4 * k; strokeLines(coast);
  } else if (cst === 'thin') { ctx.strokeStyle = rgba(S.ink, 0.45); ctx.lineWidth = 1 * k; strokeLines(coast); }

  // --- realm borders (shared cell edges, smoothed) ---
  const segs = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x, a = owner[i];
    if (a < 0 || isOcean[i]) continue;
    if (x + 1 < gw) { const b = owner[i + 1]; if (b >= 0 && b !== a && !isOcean[i + 1]) segs.push([x + 0.5, y - 0.5, x + 0.5, y + 0.5]); }
    if (y + 1 < gh) { const b = owner[i + gw]; if (b >= 0 && b !== a && !isOcean[i + gw]) segs.push([x - 0.5, y + 0.5, x + 0.5, y + 0.5]); }
  }
  const borders = stitch(segs);
  const bst = LY.borders ? (S.borders || 'default') : 'none';
  ctx.save();
  if (bst === 'default') {
    ctx.strokeStyle = rgba(S.border, 0.18); ctx.lineWidth = 7 * k; strokeLines(borders, false, 3);
    ctx.setLineDash([7 * k, 5 * k]); ctx.strokeStyle = rgba(S.border, 0.85); ctx.lineWidth = 1.7 * k; strokeLines(borders, false, 3);
  } else if (bst === 'faint') { ctx.setLineDash([2 * k, 5 * k]); ctx.strokeStyle = rgba(S.border, 0.5); ctx.lineWidth = 1.3 * k; strokeLines(borders, false, 3); }
  else if (bst === 'light') { ctx.setLineDash([8 * k, 6 * k]); ctx.strokeStyle = rgba(S.border, 0.6); ctx.lineWidth = 1.6 * k; strokeLines(borders, false, 3); }
  else if (bst === 'thin') { ctx.setLineDash([5 * k, 4 * k]); ctx.strokeStyle = rgba(S.border, 0.7); ctx.lineWidth = 1.2 * k; strokeLines(borders, false, 3); }
  ctx.restore();

  // --- terrain symbols ---
  const taken = new Uint8Array(N);
  const take = (x, y, rad) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) taken[yy * gw + xx] = 1;
    }
  };
  // keep symbols off rivers, roads and towns
  for (const rv of data.rivers) for (const p of rv) taken[Math.round(p.y) * gw + Math.round(p.x)] = 1;
  for (const rd of data.roads) for (const p of rd) taken[Math.round(p[1]) * gw + Math.round(p[0])] = 1;
  for (const tw of data.towns) take(tw.gx, tw.gy, 3);
  const syms = [];
  const SY = S.sym || 'classic';
  const dens = styleName === 'night' ? 0.55 : 1;
  const P = {
    classic: { mtn: 0.62, hill: 0.42, hillP: 0.55, mtnTake: [1, 2], tree: 0.8, pine: 0.75, jung: 0.8, treeS: 8, pineS: 10, mtnS: [12, 44] },
    storybook: { mtn: 0.6, hill: 0.4, hillP: 0.6, mtnTake: [1, 2], tree: 0.85, pine: 0.8, jung: 0.85, treeS: 9, pineS: 11, mtnS: [13, 46] },
    quill: { mtn: 0.55, hill: 0.34, hillP: 0.7, mtnTake: [0, 1], tree: 0.97, pine: 0.95, jung: 0.97, treeS: 6.5, pineS: 8, mtnS: [9, 30] },
    painted: { mtn: 0.56, hill: 0.38, hillP: 0.6, mtnTake: [0, 1], tree: 1, pine: 1, jung: 1, treeS: 9, pineS: 11, mtnS: [14, 52] },
    small: { mtn: 0.7, hill: 2, hillP: 0, mtnTake: [2, 3], tree: 0, pine: 0, jung: 0, treeS: 0, pineS: 0, mtnS: [8, 22] },
    none: null,
  }[SY];
  const cellsShuffled = r.shuffle([...Array(N).keys()]);
  if (P) {
    const sortedByE = cellsShuffled.slice().sort((a, b) => e[b] - e[a]);
    for (const i of sortedByE) {
      if (isOcean[i] || lake[i] || taken[i] || e[i] < Math.min(P.hill, P.mtn)) continue;
      const x = i % gw, y = (i / gw) | 0;
      if (e[i] >= P.mtn) { const s = (P.mtnS[0] + (e[i] - 0.5) * P.mtnS[1]) * k; syms.push({ t: 'mtn', x, y, s, snow: e[i] > 0.86 }); take(x, y, e[i] > 0.8 ? P.mtnTake[1] : P.mtnTake[0]); }
      else if (r.chance(P.hillP)) { syms.push({ t: 'hill', x, y, s: (8 + e[i] * 10) * k * (SY === 'quill' ? 0.8 : 1) }); take(x, y, SY === 'quill' ? 1 : 2); }
    }
    for (const i of cellsShuffled) {
      if (isOcean[i] || lake[i] || taken[i]) continue;
      const b = biome[i], x = i % gw, y = (i / gw) | 0;
      if (b === B.FOREST && r.chance(P.tree * dens)) { syms.push({ t: 'tree', x, y, s: P.treeS * k }); take(x, y, 0); }
      else if (b === B.TAIGA && r.chance(P.pine * dens)) { syms.push({ t: 'pine', x, y, s: P.pineS * k }); take(x, y, 0); }
      else if (b === B.JUNGLE && r.chance(P.jung * dens)) { syms.push({ t: 'jungle', x, y, s: (P.treeS + 3) * k }); take(x, y, 0); }
      else if (SY === 'small') continue;
      else if (b === B.SWAMP && r.chance(0.35)) { syms.push({ t: 'swamp', x, y, s: 7 * k }); take(x, y, 1); }
      else if (b === B.DESERT && r.chance(0.08)) { syms.push({ t: 'dune', x, y, s: 10 * k }); take(x, y, 2); }
      else if (b === B.GRASS && r.chance(SY === 'quill' ? 0.05 : 0.03)) { syms.push({ t: 'grass', x, y, s: 5 * k }); take(x, y, 1); }
    }
  }
  syms.sort((a, b) => a.y - b.y);
  const classicSym = (s) => {
    const [x, y] = toPx([s.x + r.range(-0.3, 0.3), s.y + r.range(-0.3, 0.3)]);
    const z = s.s;
    ctx.lineWidth = 1.3 * k; ctx.strokeStyle = ink;
    if (s.t === 'mtn') {
      const pk = x + r.range(-0.15, 0.15) * z, w = z * r.range(0.8, 1.05);
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(x + w, y); ctx.closePath();
      ctx.fillStyle = S.rock ? rgba(mix(S.rock, [255, 255, 255], 0.15)) : rgba(mix(S.paper, [255, 255, 255], 0.25)); ctx.fill();
      ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(x + w, y); ctx.lineTo(pk + w * 0.15, y); ctx.closePath();
      ctx.fillStyle = S.rockShade ? rgba(S.rockShade) : rgba(S.ink, styleName === 'night' ? 0.35 : 0.22); ctx.fill();
      if (!S.rockShade) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(x + w, y); ctx.lineTo(pk, y); ctx.closePath(); ctx.clip();
        ctx.beginPath(); for (let j = 1; j < 6; j++) { const yy = y - z + j * z / 6; ctx.moveTo(pk, yy); ctx.lineTo(pk + w * 0.9, yy + z * 0.25); }
        ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 0.8 * k; ctx.stroke(); ctx.restore();
      }
      if (s.snow) { ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk - w * 0.28, y - z * 0.7); ctx.lineTo(pk - w * 0.08, y - z * 0.76); ctx.lineTo(pk + w * 0.05, y - z * 0.66); ctx.lineTo(pk + w * 0.25, y - z * 0.72); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(x + w, y); ctx.strokeStyle = ink; ctx.lineWidth = (SY === 'storybook' ? 1.9 : 1.5) * k; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk + w * 0.12, y - z * 0.45); ctx.lineWidth = 0.9 * k; ctx.stroke();
    } else if (s.t === 'hill') {
      if (SY === 'storybook') { ctx.beginPath(); ctx.moveTo(x - z, y); ctx.quadraticCurveTo(x, y - z * 1.1, x + z, y); ctx.closePath(); ctx.fillStyle = rgba(mix(S.biome[1], [0, 0, 0], 0.08)); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x - z, y); ctx.quadraticCurveTo(x, y - z * 1.1, x + z, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + z * 0.2, y - z * 0.35); ctx.lineTo(x + z * 0.45, y - z * 0.05); ctx.moveTo(x + z * 0.5, y - z * 0.25); ctx.lineTo(x + z * 0.68, y - z * 0.02);
      ctx.lineWidth = 0.8 * k; ctx.stroke();
    } else if (s.t === 'tree' || s.t === 'jungle') {
      const rr = z * (s.t === 'jungle' ? 0.62 : 0.52);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - z * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y - z * 0.75, rr, rr * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(mix(s.t === 'jungle' ? mix(S.treeFill, [0, 0, 0], 0.12) : S.treeFill, [255, 255, 255], SY === 'storybook' ? r.range(-0.05, 0.12) : 0)); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + rr * 0.15, y - z * 0.75, rr * 0.7, -0.2, 1.4); ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 0.8 * k; ctx.stroke();
      if (SY === 'storybook') { ctx.beginPath(); ctx.arc(x - rr * 0.3, y - z * 0.95, rr * 0.25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); }
    } else if (s.t === 'pine') {
      ctx.beginPath(); ctx.moveTo(x, y - z * 1.25); ctx.lineTo(x - z * 0.42, y - z * 0.15); ctx.lineTo(x + z * 0.42, y - z * 0.15); ctx.closePath();
      ctx.fillStyle = rgba(mix(S.treeFill, [0, 0, 0], SY === 'storybook' ? 0.25 : 0.08)); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - z * 0.15); ctx.lineTo(x, y + z * 0.05); ctx.stroke();
    } else if (s.t === 'swamp') {
      ctx.beginPath(); ctx.moveTo(x - z, y); ctx.lineTo(x + z, y);
      for (const dx of [-0.5, 0, 0.5]) { ctx.moveTo(x + dx * z, y); ctx.lineTo(x + dx * z + dx * z * 0.3, y - z * (dx ? 0.6 : 0.9)); }
      ctx.lineWidth = 0.9 * k; ctx.stroke();
    } else if (s.t === 'dune') {
      ctx.beginPath(); ctx.moveTo(x - z, y); ctx.quadraticCurveTo(x - z * 0.2, y - z * 0.5, x + z, y - z * 0.05); ctx.lineWidth = 0.9 * k; ctx.stroke();
    } else if (s.t === 'grass') {
      ctx.beginPath(); for (const dx of [-0.6, 0, 0.6]) { ctx.moveTo(x + dx * z, y); ctx.lineTo(x + dx * z * 1.4, y - z); }
      ctx.lineWidth = 0.7 * k; ctx.strokeStyle = rgba(S.ink, 0.5); ctx.stroke();
    }
  };
  // pen-and-ink: open-based peaks with hatching, scribbled tree clumps
  const quillSym = (s) => {
    const [x, y] = toPx([s.x + r.range(-0.35, 0.35), s.y + r.range(-0.35, 0.35)]);
    const z = s.s;
    ctx.strokeStyle = ink; ctx.lineCap = 'round';
    if (s.t === 'mtn') {
      const w = z * r.range(0.55, 0.75), pk = x + r.range(-0.2, 0.2) * w, lean = r.range(-0.08, 0.08) * z;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.4, y - z * 0.55, pk + lean, y - z); ctx.quadraticCurveTo(x + w * 0.45, y - z * 0.5, x + w * 1.05, y + z * 0.04);
      ctx.fillStyle = rgba(S.paper); ctx.fill();
      ctx.lineWidth = 1.25 * k; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.moveTo(pk + lean, y - z); ctx.quadraticCurveTo(x + w * 0.45, y - z * 0.5, x + w * 1.05, y + z * 0.04); ctx.lineTo(pk, y); ctx.closePath(); ctx.clip();
      ctx.beginPath(); const n = Math.max(3, Math.round(z / (2.6 * k)));
      for (let j = 0; j < n; j++) { const t = (j + 0.5) / n, yy = y - z + t * z; ctx.moveTo(pk + lean * (1 - t) + 1 * k, yy); ctx.lineTo(pk + w * 1.1, yy + z * 0.35); }
      ctx.lineWidth = 0.7 * k; ctx.strokeStyle = rgba(S.ink, 0.55); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(pk + lean, y - z); ctx.lineTo(pk + lean * 0.3 + w * 0.08, y - z * 0.4); ctx.lineWidth = 0.8 * k; ctx.strokeStyle = ink; ctx.stroke();
    } else if (s.t === 'hill') {
      ctx.beginPath(); ctx.moveTo(x - z, y); ctx.quadraticCurveTo(x - z * 0.1, y - z * 0.9, x + z, y); ctx.lineWidth = 1 * k; ctx.stroke();
      ctx.beginPath(); for (let j = 0; j < 3; j++) { const xx = x + z * (0.15 + j * 0.22); ctx.moveTo(xx, y - z * (0.42 - j * 0.12)); ctx.lineTo(xx + z * 0.12, y - z * 0.02); }
      ctx.lineWidth = 0.6 * k; ctx.stroke();
    } else if (s.t === 'tree' || s.t === 'jungle' || s.t === 'pine') {
      const nn = s.t === 'pine' ? 1 : r.int(2, 3);
      for (let j = 0; j < nn; j++) {
        const xx = x + r.range(-0.45, 0.45) * z, yy = y + r.range(-0.35, 0.35) * z, rr = z * r.range(0.32, 0.45);
        ctx.beginPath();
        if (s.t === 'pine') { ctx.moveTo(xx, yy - z); ctx.lineTo(xx - rr, yy); ctx.lineTo(xx + rr, yy); ctx.closePath(); }
        else ctx.ellipse(xx, yy - rr, rr, rr * 1.15, r.range(-0.4, 0.4), 0, Math.PI * 2);
        ctx.fillStyle = rgba(S.paper); ctx.fill(); ctx.lineWidth = 0.85 * k; ctx.strokeStyle = ink; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + rr * 0.5); ctx.lineWidth = 0.7 * k; ctx.stroke();
        if (s.t !== 'pine' && r.chance(0.6)) { ctx.beginPath(); ctx.arc(xx + rr * 0.2, yy - rr, rr * 0.55, -0.3, 1.3); ctx.lineWidth = 0.6 * k; ctx.stroke(); }
      }
    } else classicSym(s);
  };
  // painted: shaded, filled shapes with soft shadows and no outlines
  const paintSym = (s) => {
    const [x, y] = toPx([s.x + r.range(-0.35, 0.35), s.y + r.range(-0.35, 0.35)]);
    const z = s.s;
    if (s.t === 'mtn') {
      const w = z * r.range(0.75, 1), pk = x + r.range(-0.18, 0.18) * w;
      ctx.beginPath(); ctx.ellipse(x + w * 0.25, y, w * 1.1, z * 0.16, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,16,10,.22)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(pk + w * 0.12, y); ctx.closePath();
      const g = ctx.createLinearGradient(x - w, y, pk, y - z); g.addColorStop(0, rgba(mix(S.rock, [0, 0, 0], 0.15))); g.addColorStop(1, rgba(mix(S.rock, [255, 255, 255], 0.25)));
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(x + w, y); ctx.lineTo(pk + w * 0.12, y); ctx.closePath(); ctx.fillStyle = rgba(S.rockShade); ctx.fill();
      ctx.beginPath(); for (let j = 0; j < 3; j++) { const t = 0.3 + j * 0.2; ctx.moveTo(pk + w * 0.05, y - z * (1 - t)); ctx.lineTo(pk + w * (0.25 + t * 0.4), y - z * (0.75 - t) * 0.6); }
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1 * k; ctx.stroke();
      if (s.snow) {
        ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk - w * 0.32, y - z * 0.66); ctx.lineTo(pk - w * 0.12, y - z * 0.72); ctx.lineTo(pk + w * 0.02, y - z * 0.6); ctx.lineTo(pk + w * 0.18, y - z * 0.7); ctx.lineTo(pk + w * 0.34, y - z * 0.64); ctx.closePath();
        ctx.fillStyle = 'rgba(250,252,255,.95)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk + w * 0.34, y - z * 0.64); ctx.lineTo(pk + w * 0.18, y - z * 0.7); ctx.lineTo(pk + w * 0.06, y - z * 0.62); ctx.closePath(); ctx.fillStyle = 'rgba(170,186,204,.9)'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(x + w, y); ctx.strokeStyle = 'rgba(30,22,14,.45)'; ctx.lineWidth = 1 * k; ctx.stroke();
    } else if (s.t === 'hill') {
      ctx.beginPath(); ctx.moveTo(x - z * 1.2, y); ctx.quadraticCurveTo(x, y - z * 1.2, x + z * 1.2, y); ctx.closePath();
      const g = ctx.createLinearGradient(x, y - z, x + z, y); g.addColorStop(0, 'rgba(255,240,200,.35)'); g.addColorStop(1, 'rgba(40,30,10,.3)'); ctx.fillStyle = g; ctx.fill();
    } else if (s.t === 'tree' || s.t === 'jungle' || s.t === 'pine') {
      const base = s.t === 'jungle' ? mix(S.treeFill, [40, 90, 30], 0.4) : s.t === 'pine' ? mix(S.treeFill, [20, 40, 34], 0.35) : S.treeFill;
      const c = mix(base, r.chance(0.12) && s.t === 'tree' ? [96, 70, 120] : [0, 0, 0], r.range(0, 0.25));
      ctx.beginPath(); ctx.ellipse(x + z * 0.2, y + z * 0.05, z * 0.5, z * 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,20,6,.28)'; ctx.fill();
      ctx.beginPath();
      if (s.t === 'pine') { ctx.moveTo(x, y - z * 1.25); ctx.lineTo(x - z * 0.4, y); ctx.lineTo(x + z * 0.4, y); ctx.closePath(); }
      else ctx.arc(x, y - z * 0.45, z * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c); ctx.fill();
      ctx.beginPath();
      if (s.t === 'pine') { ctx.moveTo(x, y - z * 1.25); ctx.lineTo(x - z * 0.4, y); ctx.lineTo(x - z * 0.05, y); ctx.closePath(); }
      else ctx.arc(x - z * 0.15, y - z * 0.6, z * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = rgba(mix(c, [255, 250, 200], 0.22)); ctx.fill();
    } else classicSym(s);
  };
  const sym = SY === 'quill' ? quillSym : SY === 'painted' ? paintSym : classicSym;
  for (const s of syms) if (s.t === 'mtn' || s.t === 'hill' ? LY.relief : LY.forests) sym(s);

  // --- rivers ---
  ctx.strokeStyle = rgba(S.river); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const rv of LY.rivers ? data.rivers : []) {
    const pts = chaikin(rv.map(p => toPx([p.x, p.y])), 2);
    const ws = chaikin(rv.map(p => [p.w, 0]), 2).map(p => p[0]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = Math.min(4.5, 0.7 + Math.sqrt(ws[i]) * 0.75) * k;
      ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
    }
  }

  // --- roads ---
  ctx.save();
  ctx.setLineDash([6 * k, 5 * k]); ctx.strokeStyle = rgba(S.road, styleName === 'night' ? 0.55 : 0.8); ctx.lineWidth = 1.6 * k;
  if (S.cells === 'pastel') { ctx.setLineDash([4 * k, 3 * k]); ctx.lineWidth = 1.3 * k; }
  for (const rd of LY.roads ? data.roads : []) { ctx.beginPath(); tracePath(ctx, chaikin(rd.map(toPx), 3)); ctx.stroke(); }
  ctx.restore();

  // --- cloud banks around the edges (painted style) ---
  if (S.clouds && !ropts.noClouds) drawClouds(ctx, W, H, rng(data.o.seed + ':clouds'), k);

  // --- map icons (stickers) ---
  const iconBoxes = [];
  if (LY.icons) for (const ic of [...(data.icons || [])].sort((a, b) => a.y - b.y)) {
    const [px, py] = toPx([ic.x, ic.y]), sz = ic.s * cs;
    drawIcon(ctx, ic.t, px, py, sz, styleName, { flip: ic.flip });
    iconBoxes.push([px - sz * 0.42, py - sz * 0.45, px + sz * 0.42, py + sz * 0.42]);
  }

  // --- furniture boxes so labels avoid them ---
  const L = new Labeler(W, H, 30 * k);
  for (const b of iconBoxes) L.add(b);
  const title = data.o.name || 'Untitled Realm';
  const compass = [W - 150 * k, H - 160 * k, 78 * k];
  if (furniture) {
    L.add([30 * k, 30 * k, 30 * k + Math.min(760, 60 + title.length * 28) * k, 140 * k]);
    L.add([compass[0] - 95 * k, compass[1] - 120 * k, compass[0] + 95 * k, compass[1] + 95 * k]);
    L.add([40 * k, H - 110 * k, 380 * k, H - 30 * k]);
  }

  // --- towns ---
  const label = (text, x, y, size, opts2 = {}) => {
    ctx.font = `${opts2.weight || 600} ${opts2.italic ? 'italic ' : ''}${size}px ${opts2.font || '"Cormorant Garamond", Georgia, serif'}`.replace(/(\d+) italic/, 'italic $1');
    spaced(ctx, opts2.spacing || 0);
    const tw = ctx.measureText(text).width;
    const cand = opts2.center ? [[0, 0], [0, -size], [0, size], [-size * 2, 0], [size * 2, 0], [0, -size * 2], [0, size * 2]]
      : [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
    const off = opts2.off || 0;
    for (const [cx, cy] of cand) {
      let bx, by;
      if (opts2.center) { bx = x - tw / 2 + cx; by = y + cy; }
      else { bx = cx > 0 ? x + off : cx < 0 ? x - off - tw : x - tw / 2; by = cy > 0 ? y + off + size * 0.75 : cy < 0 ? y - off : y + size * 0.32; }
      const box = [bx - 3, by - size * 0.85, bx + tw + 3, by + size * 0.25];
      if (L.free(box) || opts2.force) {
        L.add(box);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        haloText(ctx, text, bx, by, opts2.color || rgba(S.label), opts2.halo === false || S.noHalo ? null : S.labelHalo ? rgba(S.labelHalo, 0.6) : rgba(S.paper, 0.85), (opts2.haloW || 4) * k);
        spaced(ctx, 0);
        return true;
      }
    }
    spaced(ctx, 0);
    return false;
  };
  const townPx = data.towns.map(tw => ({ tw, p: toPx([tw.gx, tw.gy]) }));
  for (const { tw, p } of townPx) { const rr = (tw.capital ? 9 : 6) * k; L.add([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr]); }
  const ts = S.townSmall ? 0.6 : 1;
  for (const { tw, p } of townPx.sort((a, b) => b.tw.capital - a.tw.capital)) {
    const [x, y] = p;
    if (!LY.towns) { if (LY.townLabels) label(tw.name, x, y, (tw.capital ? 22 : 17) * k * ts, { center: true, weight: tw.capital ? 700 : 600 }); continue; }
    if (S.townSmall) {
      ctx.beginPath(); ctx.arc(x, y, (tw.capital ? 3.2 : 2) * k, 0, Math.PI * 2); ctx.fillStyle = tw.capital ? ink : paperC; ctx.fill(); ctx.lineWidth = 1 * k; ctx.strokeStyle = ink; ctx.stroke();
    } else if (tw.capital) {
      ctx.beginPath(); ctx.arc(x, y, 7.5 * k, 0, Math.PI * 2); ctx.fillStyle = paperC; ctx.fill(); ctx.lineWidth = 2 * k; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3.6 * k, 0, Math.PI * 2); ctx.fillStyle = rgba(hexToRgb(data.realms[tw.realm]?.color || '#000000')); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 4.4 * k, 0, Math.PI * 2); ctx.fillStyle = paperC; ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.6 * k, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    }
    if (LY.townLabels) label(tw.name, x, y, (tw.capital ? 22 : 17) * k * ts, { off: (tw.capital ? 11 : 8) * k * ts, weight: tw.capital ? 700 : 600, spacing: tw.capital ? 1 : 0 });
  }

  // --- region labels ---
  for (const rl of LY.realmLabels ? data.realms.slice().sort((a, b) => b.size - a.size) : []) {
    const [x, y] = toPx(rl.anchor);
    const size = Math.max(22, Math.min(34, 16 + Math.sqrt(rl.size) * 0.35)) * k * (S.realmSize || 1);
    label(S.realmFont ? rl.name : rl.name.toUpperCase(), x, y, size, { center: true, weight: S.realmFont ? 400 : 700, spacing: (S.realmSpacing || 6) * k, font: S.realmFont,
      color: S.realmAlpha2 ? rgba(S.label, S.realmAlpha2) : rgba(mix(S.label, hexToRgb(rl.color), S.labelHalo ? 0.15 : 0.45), S.labelHalo ? 0.95 : 0.8), haloW: 5 });
  }
  for (const rg of data.regionLabels) {
    const [x, y] = toPx(rg.pos);
    if (rg.kind === 'sea' ? !LY.seaLabels : !LY.regionLabels) continue;
    if (rg.kind === 'custom') label(rg.name, x, y, 24 * k * (rg.size || 1), { center: true, italic: !S.realmFont, weight: S.realmFont ? 400 : 700, spacing: 2 * k, color: rgba(S.label, 0.92), font: S.realmFont, force: true });
    else if (rg.kind === 'sea') label(rg.name, x, y, 28 * k, { center: true, italic: true, weight: 600, spacing: 6 * k, color: rgba(S.seaLabel, 0.9), halo: false, font: S.realmFont });
    else if (S.realmFont) label(rg.name.toUpperCase(), x, y, 14 * k, { center: true, weight: 600, spacing: 5 * k, color: rgba(S.label, 0.8) });
    else label(rg.name, x, y, 18 * k, { center: true, italic: true, weight: 600, spacing: 2 * k, color: rgba(S.label, 0.85) });
  }

  // --- map furniture ---
  if (furniture) {
    drawCompass(ctx, compass[0], compass[1], compass[2], ink, paperC, rgba(hexToRgb('#b5483f')));
    const u = worldUnits(data.o);
    drawScaleBar(ctx, 60 * k, H - 62 * k, W / u.per, u.unit, ink, paperC, k * 1.2);
    drawCartouche(ctx, 44 * k, 44 * k, title, `${data.realms.length} realms · ${data.towns.length} settlements`, ink, paperC, k);
    if (!S.noFrame) drawFrame(ctx, W, H, ink, rgba(S.paper), k);
  }

  return {
    pins: data.towns.map(tw => ({ name: tw.name, capital: tw.capital, port: tw.port, realm: data.realms[tw.realm]?.name || '', x: (tw.gx + 0.5) * cs, y: (tw.gy + 0.5) * cs })),
    pxPerUnit: W / worldUnits(data.o).per, unit: worldUnits(data.o).unit,
  };
}


// soft cloud banks hugging the map edges
function drawClouds(ctx, W, H, r, k) {
  ctx.save();
  const n = makeNoise(r);
  // soft white fade at the very edge
  const m = 0.09 * Math.min(W, H);
  const edges = [[0, 0, 0, m, 0, 0, W, m], [0, H, 0, H - m, 0, H - m, W, m], [0, 0, m, 0, 0, 0, m, H], [W, 0, W - m, 0, W - m, 0, m, H]];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(244,247,250,.92)'); g.addColorStop(1, 'rgba(244,247,250,0)');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  }
  const puff = (x, y, rad, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(245,248,251,${a * 0.55})`); g.addColorStop(1, 'rgba(240,244,248,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  };
  // billowing banks: puffs follow a noisy edge line so they clump into cloud shapes
  for (let j = 0; j < 1400; j++) {
    const side = r.int(0, 3), t = r();
    const reach = (0.05 + 0.09 * Math.max(0, n.fbm(t * 6 + side * 10, side, 3) + 0.25)) * (side < 2 ? H : W * 0.75);
    const depth = Math.pow(r(), 1.6) * reach;
    let x, y;
    if (side === 0) { x = t * W; y = depth; } else if (side === 1) { x = t * W; y = H - depth; }
    else if (side === 2) { x = depth; y = t * H; } else { x = W - depth; y = t * H; }
    const fall = 1 - depth / (reach + 1);
    puff(x, y, r.range(26, 70) * k, 0.3 * fall + 0.06);
  }
  ctx.restore();
}

// Azgaar-style cells, drawn as shapes so they stay crisp at any zoom
function cellGeom(data) {
  if (data._cg) return data._cg;
  const { GW: gw, GH: gh } = data;
  const r = rng(data.o.seed + ':cells'), sp = 3.2, pts = [];
  for (let y = 0; y * sp < gh; y++) for (let x = 0; x * sp < gw; x++) {
    const p = [Math.min(gw - 0.01, (x + r.range(0.12, 0.88)) * sp), Math.min(gh - 0.01, (y + r.range(0.12, 0.88)) * sp)];
    pts.push(p);
  }
  const polys = voronoi(pts, [0, 0, gw, gh]);
  const at = pts.map(p => Math.min(gh - 1, p[1] | 0) * gw + Math.min(gw - 1, p[0] | 0));
  const kq = v => Math.round(v[0] * 500) + ',' + Math.round(v[1] * 500);
  const seen = new Map(), pairs = [];
  polys.forEach((poly, j) => {
    for (let q = 0; q < poly.length; q++) {
      const a = poly[q], b = poly[(q + 1) % poly.length], ka = kq(a), kb = kq(b);
      if (ka === kb) continue;
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const other = seen.get(key);
      if (other != null) { pairs.push([other, j, a, b]); seen.delete(key); } else seen.set(key, j);
    }
  });
  Object.defineProperty(data, '_cg', { value: { pts, polys, at, pairs }, enumerable: false, configurable: true });
  return data._cg;
}
function drawCellsVector(ctx, data, S, LY, cs) {
  const { isOcean, lake, owner, biome, h, GW: gw } = data;
  const { polys, at, pairs } = cellGeom(data);
  const realmRGB = data.realms.map(rl => hexToRgb(rl.color));
  const kind = j => { const i = at[j]; return isOcean[i] || lake[i] ? -2 : (LY.realms ? owner[i] : -1); };
  const pastel = S.cells === 'pastel';
  const groups = new Map();
  polys.forEach((poly, j) => {
    const i = at[j];
    if (isOcean[i] || lake[i] || poly.length < 3) return;
    let c;
    const ow = LY.realms ? owner[i] : -1;
    if (pastel) c = ow >= 0 ? mix(realmRGB[ow], [255, 255, 255], 0.52) : mix(S.biome[biome[i]] || S.biome[1], [255, 255, 255], 0.2);
    else {
      c = S.biome[biome[i]] || S.biome[1];
      const x = i % gw, sl = (h[i] - h[Math.min(h.length - 1, i + gw)]) + (h[Math.max(0, i - 1)] - h[i]);
      c = mix(c, [0, 0, 0], Math.max(-0.15, Math.min(0.2, -sl * 4)));
      if (ow >= 0) c = mix(c, realmRGB[ow], S.realmAlpha);
    }
    const key = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    if (!groups.has(key)) groups.set(key, new Path2D());
    const path = groups.get(key);
    path.moveTo(poly[0][0] * cs, poly[0][1] * cs);
    for (let q = 1; q < poly.length; q++) path.lineTo(poly[q][0] * cs, poly[q][1] * cs);
    path.closePath();
  });
  ctx.save();
  ctx.lineJoin = 'round';
  for (const [col, path] of groups) { ctx.fillStyle = col; ctx.fill(path); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(path); }
  if (!pastel) {
    const all = new Path2D();
    for (const [a, b, p, q] of pairs) if (kind(a) !== -2 || kind(b) !== -2) { all.moveTo(p[0] * cs, p[1] * cs); all.lineTo(q[0] * cs, q[1] * cs); }
    ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.lineWidth = 0.7; ctx.stroke(all);
  }
  const coast = new Path2D(), border = new Path2D();
  for (const [a, b, p, q] of pairs) {
    const ka = kind(a), kb = kind(b);
    if ((ka === -2) !== (kb === -2)) { coast.moveTo(p[0] * cs, p[1] * cs); coast.lineTo(q[0] * cs, q[1] * cs); }
    else if (ka !== -2 && ka !== kb && LY.borders) { border.moveTo(p[0] * cs, p[1] * cs); border.lineTo(q[0] * cs, q[1] * cs); }
  }
  ctx.strokeStyle = rgba(S.ink, pastel ? 0.4 : 0.75); ctx.lineWidth = pastel ? 1 : 1.6; ctx.stroke(coast);
  if (pastel) { ctx.setLineDash([3.5, 3]); ctx.strokeStyle = rgba(S.ink, 0.65); ctx.lineWidth = 1.5; }
  else { ctx.strokeStyle = rgba(S.ink, 0.8); ctx.lineWidth = 2.2; }
  ctx.stroke(border);
  ctx.restore();
}
