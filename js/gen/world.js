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

export function generateWorld(opts) {
  const o = { ...WORLD_DEFAULTS, ...opts };
  const r = rng(o.seed);
  const n1 = makeNoise(r), n2 = makeNoise(r), n3 = makeNoise(r);
  const N = GW * GH;
  const idx = (x, y) => y * GW + x;
  const aspect = GW / GH;

  // ---- shape & height ----
  const centers = [];
  if (o.shape === 'twin') { centers.push([r.range(0.27, 0.35), r.range(0.4, 0.6)], [r.range(0.65, 0.73), r.range(0.4, 0.6)]); }
  const coastAngle = r.range(0, Math.PI * 2);
  const freq = { continent: 2.6, twin: 3, archipelago: 5.5, large: 2.2, coast: 2.6 }[o.shape] || 2.6;
  const h = new Float32Array(N), ridgeF = new Float32Array(N);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
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
  const sorted = Float32Array.from(h).sort();
  const sea = sorted[Math.floor((1 - o.land) * (N - 1))];
  const hmax = sorted[N - 1], hmin = sorted[0];
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
  {
    const raw = new Float32Array(N), land = [];
    for (let i = 0; i < N; i++) {
      if (isOcean[i]) continue;
      raw[i] = clamp01((h[i] - sea) / (hmax - sea)) * 0.45 + ridgeF[i] * 0.75 * smooth(0, 7, dWater[i]);
      land.push(i);
    }
    land.sort((a, b) => raw[a] - raw[b]);
    land.forEach((i, k) => { e[i] = Math.pow(k / land.length, 2.6); });
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
  const byScore = [...score.keys()].filter(i => score[i] > -1e8).sort((a, b) => score[b] - score[a]);
  const towns = [];
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

  // ---- realms (multi-source Dijkstra over land) ----
  const owner = new Int16Array(N).fill(-1);
  const capitals = towns.filter(tw => tw.capital);
  const realms = capitals.map((c, k) => {
    const base = realmBase(r);
    return { id: k, name: realmName(r, base), capital: c, color: REALM_COLORS[k % REALM_COLORS.length] };
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
  const regionLabels = [];
  for (const comp of components(i => !isOcean[i] && e[i] > 0.62, 25).slice(0, 3)) regionLabels.push({ kind: 'mountain', name: mountainName(r), pos: centerCell(comp) });
  for (const comp of components(i => biome[i] === B.FOREST || biome[i] === B.TAIGA || biome[i] === B.JUNGLE, 60).slice(0, 3)) regionLabels.push({ kind: 'forest', name: forestName(r), pos: centerCell(comp) });
  // seas: deepest open water
  const seaSpots = [...dLand.keys()].filter(i => {
    const x = i % GW, y = (i / GW) | 0;
    return isOcean[i] && dLand[i] >= 4 && x > GW * 0.14 && x < GW * 0.86 && y > GH * 0.12 && y < GH * 0.88;
  }).sort((a, b) => dLand[b] - dLand[a]);
  const seas = [];
  for (const i of seaSpots) {
    const p = [i % GW, (i / GW) | 0];
    if (seas.every(s => Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1]) > GW * 0.35)) seas.push({ kind: 'sea', name: seaName(r), pos: p });
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

  return { o, GW, GH, h, sea, e, isOcean, lake, dLand, dWater, m, t, biome, owner, rivers, riverThr: thr, isRiver, roads, towns, realms, regionLabels };
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
export const STYLE_NAMES = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night (gold ink)' };

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
    if (S.rock && e[i] > 0.5) c = mix(c, S.rock, smooth(0.5, 0.8, e[i]));
    if (S.rock && e[i] > 0.85) c = mix(c, S.biome[8], smooth(0.85, 0.96, e[i]));
    const el = j => h[j] * 0.5 + e[j] * 0.22;
    const hx = el(y * gw + Math.max(0, x - 1)) - el(y * gw + Math.min(gw - 1, x + 1));
    const hy = el(Math.max(0, y - 1) * gw + x) - el(Math.min(gh - 1, y + 1) * gw + x);
    const shade = 1 + (hx * 0.7 + hy) * S.shade * 2.2;
    LR[i] = c[0] * shade; LG[i] = c[1] * shade; LB[i] = c[2] * shade;
    const depth = isOcean[i] ? smooth(0, styleName === 'atlas' ? 9 : 14, dLand[i]) : 0;
    const wc = mix(S.water[0], S.water[1], depth);
    WR[i] = wc[0]; WG[i] = wc[1]; WB[i] = wc[2];
  }
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
  const rippleCol = styleName === 'atlas' ? [255, 255, 255] : S.ink;
  [[1.3, 0.38], [2.5, 0.26], [4, 0.16], [6, 0.09]].forEach(([lvl, a]) => {
    ctx.strokeStyle = rgba(rippleCol, a); ctx.lineWidth = 1.3 * k;
    strokeLines(contour(dls, gw, gh, lvl));
  });

  // --- coastline ---
  const coast = contour(f, gw, gh, 0);
  ctx.strokeStyle = rgba(S.water[1], styleName === 'night' ? 0.6 : 0.35); ctx.lineWidth = 7 * k; strokeLines(coast);
  ctx.strokeStyle = ink; ctx.lineWidth = 2.4 * k; strokeLines(coast);

  // --- realm borders (shared cell edges, smoothed) ---
  const segs = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x, a = owner[i];
    if (a < 0 || isOcean[i]) continue;
    if (x + 1 < gw) { const b = owner[i + 1]; if (b >= 0 && b !== a && !isOcean[i + 1]) segs.push([x + 0.5, y - 0.5, x + 0.5, y + 0.5]); }
    if (y + 1 < gh) { const b = owner[i + gw]; if (b >= 0 && b !== a && !isOcean[i + gw]) segs.push([x - 0.5, y + 0.5, x + 0.5, y + 0.5]); }
  }
  const borders = stitch(segs);
  ctx.save();
  ctx.strokeStyle = rgba(S.border, 0.18); ctx.lineWidth = 7 * k; strokeLines(borders, false, 3);
  ctx.setLineDash([7 * k, 5 * k]); ctx.strokeStyle = rgba(S.border, 0.85); ctx.lineWidth = 1.7 * k; strokeLines(borders, false, 3);
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
  const dens = styleName === 'night' ? 0.55 : 1;
  const cellsShuffled = r.shuffle([...Array(N).keys()]);
  const sortedByE = cellsShuffled.slice().sort((a, b) => e[b] - e[a]);
  for (const i of sortedByE) {
    if (isOcean[i] || lake[i] || taken[i] || e[i] < 0.42) continue;
    const x = i % gw, y = (i / gw) | 0;
    if (e[i] >= 0.62) { const s = (12 + (e[i] - 0.5) * 44) * k; syms.push({ t: 'mtn', x, y, s, snow: e[i] > 0.86 }); take(x, y, e[i] > 0.8 ? 2 : 1); }
    else if (r.chance(0.55)) { syms.push({ t: 'hill', x, y, s: (8 + e[i] * 10) * k }); take(x, y, 2); }
  }
  for (const i of cellsShuffled) {
    if (isOcean[i] || lake[i] || taken[i]) continue;
    const b = biome[i], x = i % gw, y = (i / gw) | 0;
    if (b === B.FOREST && r.chance(0.8 * dens)) { syms.push({ t: 'tree', x, y, s: 8 * k }); take(x, y, 0); }
    else if (b === B.TAIGA && r.chance(0.75 * dens)) { syms.push({ t: 'pine', x, y, s: 10 * k }); take(x, y, 0); }
    else if (b === B.JUNGLE && r.chance(0.8 * dens)) { syms.push({ t: 'jungle', x, y, s: 11 * k }); take(x, y, 0); }
    else if (b === B.SWAMP && r.chance(0.35)) { syms.push({ t: 'swamp', x, y, s: 7 * k }); take(x, y, 1); }
    else if (b === B.DESERT && r.chance(0.08)) { syms.push({ t: 'dune', x, y, s: 10 * k }); take(x, y, 2); }
    else if (b === B.GRASS && r.chance(0.03)) { syms.push({ t: 'grass', x, y, s: 5 * k }); take(x, y, 1); }
  }
  syms.sort((a, b) => a.y - b.y);
  const sym = (s) => {
    const [x, y] = toPx([s.x + r.range(-0.3, 0.3), s.y + r.range(-0.3, 0.3)]);
    const z = s.s;
    ctx.lineWidth = 1.3 * k; ctx.strokeStyle = ink;
    if (s.t === 'mtn') {
      const pk = x + r.range(-0.15, 0.15) * z, w = z * r.range(0.8, 1.05);
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(x + w, y); ctx.closePath();
      ctx.fillStyle = S.rock ? rgba(mix(S.rock, [255, 255, 255], 0.15)) : rgba(mix(S.paper, [255, 255, 255], 0.25)); ctx.fill();
      ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(x + w, y); ctx.lineTo(pk + w * 0.15, y); ctx.closePath();
      ctx.fillStyle = rgba(S.ink, styleName === 'night' ? 0.35 : 0.22); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(x + w, y); ctx.lineTo(pk, y); ctx.closePath(); ctx.clip();
      ctx.beginPath(); for (let j = 1; j < 6; j++) { const yy = y - z + j * z / 6; ctx.moveTo(pk, yy); ctx.lineTo(pk + w * 0.9, yy + z * 0.25); }
      ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 0.8 * k; ctx.stroke(); ctx.restore();
      if (s.snow) { ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk - w * 0.28, y - z * 0.7); ctx.lineTo(pk - w * 0.08, y - z * 0.76); ctx.lineTo(pk + w * 0.05, y - z * 0.66); ctx.lineTo(pk + w * 0.25, y - z * 0.72); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(pk, y - z); ctx.lineTo(x + w, y); ctx.strokeStyle = ink; ctx.lineWidth = 1.5 * k; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pk, y - z); ctx.lineTo(pk + w * 0.12, y - z * 0.45); ctx.lineWidth = 0.9 * k; ctx.stroke();
    } else if (s.t === 'hill') {
      ctx.beginPath(); ctx.moveTo(x - z, y); ctx.quadraticCurveTo(x, y - z * 1.1, x + z, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + z * 0.2, y - z * 0.35); ctx.lineTo(x + z * 0.45, y - z * 0.05); ctx.moveTo(x + z * 0.5, y - z * 0.25); ctx.lineTo(x + z * 0.68, y - z * 0.02);
      ctx.lineWidth = 0.8 * k; ctx.stroke();
    } else if (s.t === 'tree' || s.t === 'jungle') {
      const rr = z * (s.t === 'jungle' ? 0.62 : 0.52);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - z * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y - z * 0.75, rr, rr * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(s.t === 'jungle' ? mix(S.treeFill, [0, 0, 0], 0.12) : S.treeFill); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + rr * 0.15, y - z * 0.75, rr * 0.7, -0.2, 1.4); ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 0.8 * k; ctx.stroke();
    } else if (s.t === 'pine') {
      ctx.beginPath(); ctx.moveTo(x, y - z * 1.25); ctx.lineTo(x - z * 0.42, y - z * 0.15); ctx.lineTo(x + z * 0.42, y - z * 0.15); ctx.closePath();
      ctx.fillStyle = rgba(mix(S.treeFill, [0, 0, 0], 0.08)); ctx.fill(); ctx.stroke();
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

  // --- furniture boxes so labels avoid them ---
  const L = new Labeler(W, H, 30 * k);
  const title = data.o.name || 'Untitled Realm';
  L.add([30 * k, 30 * k, 30 * k + Math.min(760, 60 + title.length * 28) * k, 140 * k]);
  const compass = [W - 150 * k, H - 160 * k, 78 * k];
  L.add([compass[0] - 95 * k, compass[1] - 120 * k, compass[0] + 95 * k, compass[1] + 95 * k]);
  L.add([40 * k, H - 110 * k, 380 * k, H - 30 * k]);

  // --- towns ---
  const label = (text, x, y, size, opts2 = {}) => {
    ctx.font = `${opts2.weight || 600} ${opts2.italic ? 'italic ' : ''}${size}px "Cormorant Garamond", Georgia, serif`.replace(/(\d+) italic/, 'italic $1');
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
        haloText(ctx, text, bx, by, opts2.color || rgba(S.label), opts2.halo === false ? null : rgba(S.paper, 0.85), (opts2.haloW || 4) * k);
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
    const size = Math.max(22, Math.min(34, 16 + Math.sqrt(rl.size) * 0.35)) * k;
    label(rl.name.toUpperCase(), x, y, size, { center: true, weight: 700, spacing: 6 * k, color: rgba(mix(S.label, hexToRgb(rl.color), 0.45), 0.8), haloW: 5 });
  }
  for (const rg of data.regionLabels) {
    const [x, y] = toPx(rg.pos);
    if (rg.kind === 'sea') label(rg.name, x, y, 28 * k, { center: true, italic: true, weight: 600, spacing: 6 * k, color: rgba(S.seaLabel, 0.9), halo: false });
    else label(rg.name, x, y, 18 * k, { center: true, italic: true, weight: 600, spacing: 2 * k, color: rgba(S.label, 0.85) });
  }

  // --- map furniture ---
  if (furniture) {
    drawCompass(ctx, compass[0], compass[1], compass[2], ink, paperC, rgba(hexToRgb('#b5483f')));
    drawScaleBar(ctx, 60 * k, H - 62 * k, W / data.o.widthMiles, 'miles', ink, paperC, k * 1.2);
    drawCartouche(ctx, 44 * k, 44 * k, title, `${data.realms.length} realms · ${data.towns.length} settlements`, ink, paperC, k);
    drawFrame(ctx, W, H, ink, rgba(S.paper), k);
  }

  return {
    pins: data.towns.map(tw => ({ name: tw.name, capital: tw.capital, port: tw.port, realm: data.realms[tw.realm]?.name || '', x: (tw.gx + 0.5) * cs, y: (tw.gy + 0.5) * cs })),
    pxPerUnit: W / data.o.widthMiles,
  };
}
