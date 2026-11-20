// Procedural world/region map generator with a hand-drawn cartographic renderer.
import { rng, makeNoise, Heap, blur, contour, stitch, chaikin, tracePath, Labeler, haloText, spaced, hexToRgb, mix, rgba,
  drawCompass, drawScaleBar, drawFrame, drawCartouche, paperGrain } from './core.js';
import { placeName, realmBase, realmName, seaName, mountainName, forestName } from './names.js';

export const WORLD_DEFAULTS = {
  seed: 'vael', name: '', shape: 'continent', land: 0.42, rivers: 0.5, towns: 16, realms: 4,
  climate: 'temperate', style: 'parchment', widthMiles: 1200,
};

const GW = 320, GH = 200;
export const OUT_W = 2400, OUT_H = 1500;

const B = { OCEAN: 0, GRASS: 1, FOREST: 2, TAIGA: 3, JUNGLE: 4, DESERT: 5, SAVANNA: 6, TUNDRA: 7, SNOW: 8, SWAMP: 9, LAKE: 10 };
const REALM_COLORS = ['#b5483f', '#3f6fa8', '#6f9a3c', '#7d5aa0', '#c9762d', '#3a99a8', '#b38a1e', '#8b5470'];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => Math.max(0, Math.min(1, x));

export const GRID_W = GW, GRID_H = GH;

// edit (optional): hand-edited state from the map editor — see makeEditState()
export function generateWorld(opts, edit = null) {
  const o = { ...WORLD_DEFAULTS, ...opts };
  const r0 = rng(o.seed);
  const n1 = makeNoise(r0), n2 = makeNoise(r0), n3 = makeNoise(r0);
  const N = GW * GH;
  const idx = (x, y) => y * GW + x;
  const aspect = GW / GH;

  // ---- shape & height ----
  const centers = [];
  if (o.shape === 'twin') { centers.push([r0.range(0.27, 0.35), r0.range(0.4, 0.6)], [r0.range(0.65, 0.73), r0.range(0.4, 0.6)]); }
  const coastAngle = r0.range(0, Math.PI * 2);
  const freq = { continent: 2.6, twin: 3, archipelago: 5.5, large: 2.2, coast: 2.6 }[o.shape] || 2.6;
  let h = new Float32Array(N), ridgeF = new Float32Array(N);
  if (edit) { h = edit.h; ridgeF = edit.ridge; }
  else for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const nx = x / GW, ny = y / GH;
    const wx = nx + 0.13 * n2.fbm(nx * 3 + 11, ny * 3, 3), wy = ny + 0.13 * n2.fbm(nx * 3, ny * 3 + 7, 3);
    let mask;
    const dist = (cx, cy) => Math.hypot((wx - cx) * aspect * 0.8, wy - cy);
    if (o.shape === 'twin') mask = Math.max(...centers.map(c => 1 - smooth(0.12, 0.42, dist(c[0], c[1]))));
    else if (o.shape === 'archipelago') mask = 0.62 - 0.45 * smooth(0.25, 0.55, dist(0.5, 0.5));
    else if (o.shape === 'large') mask = 1 - smooth(0.25, 0.68, dist(0.5, 0.5));
    else if (o.shape === 'coast') mask = smooth(-0.25, 0.3, (wx - 0.5) * Math.cos(coastAngle) + (wy - 0.5) * Math.sin(coastAngle));
    else mask = 1 - smooth(0.15, 0.55, dist(0.5, 0.5));
    const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
    if (o.shape !== 'coast') mask *= smooth(0, 0.09, edge);
    const base = n1.fbm(nx * freq * aspect * 0.6, ny * freq, 6);
    const ridge = n3.ridged(nx * 3.5 * aspect * 0.6 + 5, ny * 3.5, 4);
    ridgeF[idx(x, y)] = Math.pow(ridge, 2.2);
    h[idx(x, y)] = mask * 0.62 + base * 0.55 + ridge * 0.12 * mask;
  }
  const r = rng(o.seed + ':d');
  let sea, hmax;
  if (edit) { sea = edit.sea; hmax = edit.hmax; }
  else { const sorted = Float32Array.from(h).sort(); sea = sorted[Math.floor((1 - o.land) * (N - 1))]; hmax = sorted[N - 1]; }
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
    m[i] = clamp01(0.5 + n2.fbm(nx * 4 * aspect * 0.6 + 40, ny * 4, 4) * 1.3) * 0.62 + 0.38 * (1 - Math.min(1, dWater[i] / 28));
    t[i] = clamp01(0.3 + 0.45 * ny + n3.fbm(nx * 2 + 9, ny * 2, 3) * 0.3 + climateShift - e[i] * 0.55);
    if (isOcean[i]) { biome[i] = B.OCEAN; continue; }
    if (lake[i]) { biome[i] = B.LAKE; continue; }
    const tt = t[i], mm = m[i];
    if (e[i] > 0.9 || tt < 0.1) biome[i] = B.SNOW;
    else if (tt < 0.25) biome[i] = mm > 0.5 ? B.TAIGA : B.TUNDRA;
    else if (tt < 0.68) biome[i] = mm < 0.3 ? B.GRASS : mm > 0.78 && e[i] < 0.08 ? B.SWAMP : mm > 0.52 ? B.FOREST : B.GRASS;
    else biome[i] = mm < 0.28 ? B.DESERT : mm < 0.5 ? B.SAVANNA : mm > 0.82 && e[i] < 0.08 ? B.SWAMP : B.JUNGLE;
  }

  if (edit) for (let i = 0; i < N; i++) {
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
  for (let i = 0; i < N; i++) if (!isOcean[i] && !lake[i] && acc[i] >= thr) isRiver[i] = 1;
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
      drawn[c] = 1;
      c = receiver[c];
    }
    if (path.length > 2) rivers.push(path);
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
  if (edit) {
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
    if (edit) {
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
  if (edit) {
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
  const rL = rng(o.seed + ':labels');
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

  return { o, GW, GH, h, ridgeF, sea, hmax, eCurve, e, isOcean, lake, dLand, dWater, m, t, biome, owner, rivers, riverThr: thr, isRiver, roads, towns, realms, regionLabels };
}

// ---------------- Editing ----------------
export const BIOMES = B;
export const BIOME_LABELS = [[B.GRASS, 'Grassland'], [B.FOREST, 'Forest'], [B.TAIGA, 'Pine forest'], [B.JUNGLE, 'Jungle'], [B.SWAMP, 'Swamp'],
  [B.SAVANNA, 'Savanna'], [B.DESERT, 'Desert'], [B.TUNDRA, 'Tundra'], [B.SNOW, 'Snow & ice']];
export { REALM_COLORS };

export function makeEditState(data) {
  return {
    h: Float32Array.from(data.h), ridge: Float32Array.from(data.ridgeF), sea: data.sea, hmax: data.hmax, eCurve: data.eCurve.slice(),
    biome: new Uint8Array(GW * GH).fill(255), realmPaint: new Int16Array(GW * GH).fill(-2),
    towns: data.towns.map(t => ({ gx: t.gx, gy: t.gy, name: t.name, capital: !!t.capital, rid: t.capital ? t.rid : undefined })),
    realms: data.realms.map(rl => ({ id: rl.rid, name: rl.name, color: rl.color })),
  };
}
export function cloneEdit(ed) {
  return { ...ed, h: Float32Array.from(ed.h), ridge: Float32Array.from(ed.ridge), eCurve: ed.eCurve.slice(), biome: Uint8Array.from(ed.biome),
    realmPaint: Int16Array.from(ed.realmPaint), towns: ed.towns.map(t => ({ ...t })), realms: ed.realms.map(rl => ({ ...rl })) };
}

// one dab of a brush at grid position (gx, gy). radius in cells, strength 0..1
export function applyBrush(ed, tool, gx, gy, radius, strength, value) {
  const { h, ridge, sea } = ed, span = Math.max(0.05, ed.hmax - sea);
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
    }
  }
}

// quick low-res look at the edit state while a brush stroke is in progress
export function drawEditPreview(ed, canvas, data) {
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
  const N = GW * GH;
  let lo = Infinity, hi = -Infinity, rhi = 0;
  for (let i = 0; i < N; i++) { if (ed.h[i] < lo) lo = ed.h[i]; if (ed.h[i] > hi) hi = ed.h[i]; if (ed.ridge[i] > rhi) rhi = ed.ridge[i]; }
  const span = Math.max(1e-6, hi - lo), rspan = Math.max(1e-6, rhi);
  const qh = new Uint16Array(N), qr = new Uint16Array(N);
  for (let i = 0; i < N; i++) { qh[i] = Math.round((ed.h[i] - lo) / span * 65535); qr[i] = Math.round(Math.max(0, ed.ridge[i]) / rspan * 65535); }
  const head = new TextEncoder().encode(JSON.stringify({ v: 2, GW, GH, o, lo, span, rspan, sea: ed.sea, hmax: ed.hmax, eCurve: ed.eCurve, towns: ed.towns, realms: ed.realms }));
  const pad = new Uint8Array((4 - (head.length % 4)) % 4);
  let blob = new Blob([new Uint32Array([head.length]), head, pad, qh, qr, ed.realmPaint, ed.biome]);
  if (typeof CompressionStream !== 'undefined') blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return new Blob([blob], { type: 'application/octet-stream' });
}
export async function editFromBlob(blob) {
  let buf = await blob.arrayBuffer();
  const b0 = new Uint8Array(buf, 0, 2);
  if (b0[0] === 0x1f && b0[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const n = new Uint32Array(buf.slice(0, 4))[0];
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  if (head.GW !== GW || head.GH !== GH) throw new Error('Map grid size changed');
  let off = 4 + n + ((4 - (n % 4)) % 4);
  const N = GW * GH;
  const take = (Ctor, bytes) => { const a = new Ctor(buf.slice(off, off + bytes)); off += bytes; return a; };
  const qh = take(Uint16Array, N * 2), qr = take(Uint16Array, N * 2), realmPaint = take(Int16Array, N * 2), biome = take(Uint8Array, N);
  const h = new Float32Array(N), ridge = new Float32Array(N);
  for (let i = 0; i < N; i++) { h[i] = head.lo + qh[i] / 65535 * head.span; ridge[i] = qr[i] / 65535 * head.rspan; }
  return { o: head.o, edit: { h, ridge, realmPaint, biome, sea: head.sea, hmax: head.hmax, eCurve: head.eCurve, towns: head.towns, realms: head.realms } };
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
export const STYLE_NAMES = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night (gold ink)', quill: 'Ink & Quill', storybook: 'Storybook', painted: 'Painted', relief: 'Realistic', cells: 'Political cells' };

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
  const W = OUT_W, H = OUT_H, cs = W / gw, k = W / 2400;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const r = rng(data.o.seed + ':render');
  const ink = rgba(S.ink), paperC = rgba(S.paper);

  // --- per-cell colours ---
  const f = new Float32Array(N);
  for (let i = 0; i < N; i++) f[i] = lake[i] ? -0.004 : h[i] - sea;
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
    let wc = mix(S.water[0], S.water[1], depth);
    if (S.shallow && isOcean[i]) wc = mix(S.shallow, wc, smooth(0.5, 3.2, dLand[i]));
    WR[i] = wc[0]; WG[i] = wc[1]; WB[i] = wc[2];
  }
  if (S.hypso) { const sm = a => blur(a, gw, gh, 1, 1); const [a1, a2, a3] = [LR, LG, LB].map(sm); for (let i = 0; i < N; i++) if (!isOcean[i]) { LR[i] = a1[i]; LG[i] = a2[i]; LB[i] = a3[i]; } }
  // realm washes (premultiplied, blurred for soft edges)
  let TA = new Float32Array(N), TR = new Float32Array(N), TG = new Float32Array(N), TB = new Float32Array(N);
  const realmRGB = data.realms.map(rl => hexToRgb(rl.color));
  for (let i = 0; i < N; i++) {
    if (owner[i] < 0 || isOcean[i]) continue;
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
  if (S.cells) rasterCells(d, W, H, cs, data, S, LR, LG, LB, WR, WG, WB);
  else for (let py = 0; py < H; py++) {
    let gy = py / cs - 0.5; if (gy < 0) gy = 0; if (gy > gh - 1.001) gy = gh - 1.001;
    const y0 = gy | 0, ty = gy - y0;
    for (let px = 0; px < W; px++) {
      let gx = px / cs - 0.5; if (gx < 0) gx = 0; if (gx > gw - 1.001) gx = gw - 1.001;
      const x0 = gx | 0, tx = gx - x0;
      const i00 = y0 * gw + x0, i10 = i00 + 1, i01 = i00 + gw, i11 = i01 + 1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const fv = f[i00] * w00 + f[i10] * w10 + f[i01] * w01 + f[i11] * w11;
      let R, G, Bc;
      if (fv < 0) {
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
  paperGrain(img, W, H, r, S.grain, S.vignette);
  ctx.putImageData(img, 0, 0);

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
  (S.ripples || [[1.3, 0.38], [2.5, 0.26], [4, 0.16], [6, 0.09]]).forEach(([lvl, a]) => {
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
  const bst = S.borders || 'default';
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
  for (const s of syms) sym(s);

  // --- rivers ---
  ctx.strokeStyle = rgba(S.river); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const rv of data.rivers) {
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
  for (const rd of data.roads) { ctx.beginPath(); tracePath(ctx, chaikin(rd.map(toPx), 3)); ctx.stroke(); }
  ctx.restore();

  // --- cloud banks around the edges (painted style) ---
  if (S.clouds) drawClouds(ctx, W, H, rng(data.o.seed + ':clouds'), k);

  // --- furniture boxes so labels avoid them ---
  const L = new Labeler(W, H, 30 * k);
  const title = data.o.name || 'Untitled Realm';
  L.add([30 * k, 30 * k, 30 * k + Math.min(760, 60 + title.length * 28) * k, 140 * k]);
  const compass = [W - 150 * k, H - 160 * k, 78 * k];
  L.add([compass[0] - 95 * k, compass[1] - 120 * k, compass[0] + 95 * k, compass[1] + 95 * k]);
  L.add([40 * k, H - 110 * k, 380 * k, H - 30 * k]);

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
  for (const { tw, p } of townPx.sort((a, b) => b.tw.capital - a.tw.capital)) {
    const [x, y] = p;
    if (tw.capital) {
      ctx.beginPath(); ctx.arc(x, y, 7.5 * k, 0, Math.PI * 2); ctx.fillStyle = paperC; ctx.fill(); ctx.lineWidth = 2 * k; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3.6 * k, 0, Math.PI * 2); ctx.fillStyle = rgba(hexToRgb(data.realms[tw.realm]?.color || '#000000')); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 4.4 * k, 0, Math.PI * 2); ctx.fillStyle = paperC; ctx.fill(); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.6 * k, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    }
    label(tw.name, x, y, (tw.capital ? 22 : 17) * k, { off: (tw.capital ? 11 : 8) * k, weight: tw.capital ? 700 : 600, spacing: tw.capital ? 1 : 0 });
  }

  // --- region labels ---
  for (const rl of data.realms.slice().sort((a, b) => b.size - a.size)) {
    const [x, y] = toPx(rl.anchor);
    const size = Math.max(22, Math.min(34, 16 + Math.sqrt(rl.size) * 0.35)) * k * (S.realmSize || 1);
    label(S.realmFont ? rl.name : rl.name.toUpperCase(), x, y, size, { center: true, weight: S.realmFont ? 400 : 700, spacing: (S.realmSpacing || 6) * k, font: S.realmFont,
      color: S.realmAlpha2 ? rgba(S.label, S.realmAlpha2) : rgba(mix(S.label, hexToRgb(rl.color), S.labelHalo ? 0.15 : 0.45), S.labelHalo ? 0.95 : 0.8), haloW: 5 });
  }
  for (const rg of data.regionLabels) {
    const [x, y] = toPx(rg.pos);
    if (rg.kind === 'sea') label(rg.name, x, y, 28 * k, { center: true, italic: true, weight: 600, spacing: 6 * k, color: rgba(S.seaLabel, 0.9), halo: false, font: S.realmFont });
    else if (S.realmFont) label(rg.name.toUpperCase(), x, y, 14 * k, { center: true, weight: 600, spacing: 5 * k, color: rgba(S.label, 0.8) });
    else label(rg.name, x, y, 18 * k, { center: true, italic: true, weight: 600, spacing: 2 * k, color: rgba(S.label, 0.85) });
  }

  // --- map furniture ---
  if (furniture) {
    drawCompass(ctx, compass[0], compass[1], compass[2], ink, paperC, rgba(hexToRgb('#b5483f')));
    drawScaleBar(ctx, 60 * k, H - 62 * k, W / data.o.widthMiles, 'miles', ink, paperC, k * 1.2);
    drawCartouche(ctx, 44 * k, 44 * k, title, `${data.realms.length} realms · ${data.towns.length} settlements`, ink, paperC, k);
    if (!S.noFrame) drawFrame(ctx, W, H, ink, rgba(S.paper), k);
  }

  return {
    pins: data.towns.map(tw => ({ name: tw.name, capital: tw.capital, port: tw.port, realm: data.realms[tw.realm]?.name || '', x: (tw.gx + 0.5) * cs, y: (tw.gy + 0.5) * cs })),
    pxPerUnit: W / data.o.widthMiles,
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

// Azgaar-style political map: irregular cells, flat realm colours, crisp cell, coast and border edges
function rasterCells(d, W, H, cs, data, S, LR, LG, LB, WR, WG, WB) {
  const { GW: gw, GH: gh, isOcean, lake, owner, dLand } = data;
  const sp = 3.2, cw = Math.ceil(gw / sp) + 1, ch = Math.ceil(gh / sp) + 1;
  const r = rng(data.o.seed + ':cells');
  const px = new Float32Array(cw * ch), py = new Float32Array(cw * ch), col = new Uint8Array(cw * ch * 3), kind = new Int16Array(cw * ch);
  const realmRGB = data.realms.map(rl => hexToRgb(rl.color));
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const j = cy * cw + cx;
    px[j] = (cx + r.range(0.1, 0.9)) * sp; py[j] = (cy + r.range(0.1, 0.9)) * sp;
    const gx = Math.min(gw - 1, px[j] | 0), gy = Math.min(gh - 1, py[j] | 0), i = gy * gw + gx;
    let c;
    if (isOcean[i] || lake[i]) {
      const band = Math.min(5, Math.floor(dLand[i] / 3)) / 5;
      c = lake[i] ? S.water[0] : mix(S.water[0], S.water[1], band);
      kind[j] = -2;
    } else {
      c = [LR[i], LG[i], LB[i]];
      if (owner[i] >= 0) c = mix(c, realmRGB[owner[i]], S.realmAlpha);
      kind[j] = owner[i];
    }
    col[j * 3] = Math.max(0, Math.min(255, c[0])); col[j * 3 + 1] = Math.max(0, Math.min(255, c[1])); col[j * 3 + 2] = Math.max(0, Math.min(255, c[2]));
  }
  const near = new Int32Array(W * H);
  const scale = 1 / cs;
  for (let y = 0; y < H; y++) {
    const gy = y * scale, cy = Math.floor(gy / sp);
    for (let x = 0; x < W; x++) {
      const gx = x * scale, cx = Math.floor(gx / sp);
      let best = 0, bd = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy; if (yy < 0 || yy >= ch) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx; if (xx < 0 || xx >= cw) continue;
          const j = yy * cw + xx, ex = px[j] - gx, ey = py[j] - gy, dd = ex * ex + ey * ey;
          if (dd < bd) { bd = dd; best = j; }
        }
      }
      near[y * W + x] = best;
      const o = (y * W + x) * 4;
      d[o] = col[best * 3]; d[o + 1] = col[best * 3 + 1]; d[o + 2] = col[best * 3 + 2]; d[o + 3] = 255;
    }
  }
  const darken = (o, f) => { d[o] *= f; d[o + 1] *= f; d[o + 2] *= f; };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = near[y * W + x], b1 = near[y * W + x + 1], b2 = near[(y + 1) * W + x];
    if (a === b1 && a === b2) continue;
    const o = (y * W + x) * 4, ka = kind[a];
    const other = a !== b1 ? b1 : b2, kb = kind[other];
    if ((ka === -2) !== (kb === -2)) { darken(o, 0.3); if (x > 0) darken(o - 4, 0.55); if (y > 0) darken(o - W * 4, 0.55); }
    else if (ka !== kb && ka !== -2) { darken(o, 0.35); if (x > 0) darken(o - 4, 0.6); }
    else darken(o, ka === -2 ? 0.97 : 0.9);
  }
}
