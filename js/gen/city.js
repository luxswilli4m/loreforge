// Procedural medieval city generator: walls, gates, wards, building lots, river, harbour.
import { rng, makeNoise, chaikin, tracePath, polyArea, centroid, clipHalf, inset, pointInPoly, distToSeg, distToPolyline, segIntersect, voronoi,
  Labeler, haloText, spaced, mix, rgba, hexToRgb, drawCompass, drawScaleBar, drawFrame, drawCartouche, paperGrain } from './core.js';
import { districtName, templeName } from './names.js';

export const CITY_DEFAULTS = { seed: 'saltmere', name: '', size: 'town', walls: true, river: true, coast: false, castle: true, temple: true, style: 'parchment' };
export const CITY_W = 2000, CITY_H = 1600;
const SIZES = { village: 9, town: 22, city: 40, capital: 64 };

export function generateCity(opts) {
  const o = { ...CITY_DEFAULTS, ...opts };
  const r = rng(o.seed + ':city');
  const nz = makeNoise(r);
  const W = CITY_W, H = CITY_H;
  const nInner = SIZES[o.size] || 22;
  const walls = o.walls && o.size !== 'village';
  const R = H * (o.size === 'village' ? 0.22 : o.size === 'town' ? 0.27 : 0.31);
  const cx = W / 2 + r.range(-40, 40), cy = (o.coast ? H * 0.43 : H / 2) + r.range(-30, 30);
  const s = R / Math.sqrt(nInner);

  // ---- coastline (sea to the south) ----
  let shore = null;
  if (o.coast) {
    shore = [];
    const base = cy + R * 0.95;
    for (let x = -20; x <= W + 20; x += 40) shore.push([x, base + nz.fbm(x / 400, 3.3, 3) * 160 + Math.sin(x / 300) * 30]);
    shore = chaikin(shore, 3);
  }
  const shoreY = x => {
    if (!shore) return Infinity;
    for (let i = 1; i < shore.length; i++) if (shore[i][0] >= x) { const a = shore[i - 1], b = shore[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0] || 1); }
    return shore[shore.length - 1][1];
  };
  const inSea = p => p[1] > shoreY(p[0]);

  // ---- sites (sunflower spiral = even spacing) ----
  const pts = [];
  const maxR = Math.hypot(W, H) * 0.6;
  for (let i = 0; ; i++) {
    const rad = s * Math.sqrt(i + 0.5) * 0.98;
    if (rad > maxR) break;
    const a = i * 2.399963 + r.range(-0.12, 0.12);
    const j = s * 0.18;
    const p = [cx + Math.cos(a) * rad + r.range(-j, j), cy + Math.sin(a) * rad + r.range(-j, j)];
    if (p[0] < -s || p[1] < -s || p[0] > W + s || p[1] > H + s) continue;
    pts.push(p);
  }
  const cells = voronoi(pts, [-10, -10, W + 10, H + 10]).map((poly, i) => ({ poly, site: pts[i], c: centroid(poly), area: Math.abs(polyArea(poly)) }));

  // ---- wall ----
  let wall = null;
  {
    const N = 48;
    wall = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      const rr = R * (1.02 + 0.09 * nz.fbm(Math.cos(a) * 1.3 + 5, Math.sin(a) * 1.3 + 5, 3));
      wall.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  const insideTown = p => pointInPoly(p, wall);

  // ---- river ----
  let river = null;
  const riverW = Math.max(18, Math.min(34, s * 0.33));
  if (o.river) {
    const a0 = o.coast ? -Math.PI / 2 + r.range(-0.6, 0.6) : r.range(0, Math.PI * 2);
    const far = Math.hypot(W, H);
    const start = [cx + Math.cos(a0) * far, cy + Math.sin(a0) * far];
    const a1 = o.coast ? Math.PI / 2 + r.range(-0.3, 0.3) : a0 + Math.PI + r.range(-0.5, 0.5);
    const end = [cx + Math.cos(a1) * far, cy + Math.sin(a1) * far];
    const off = r.range(-0.45, 0.45) * R;
    const nx = -Math.sin(a0), ny = Math.cos(a0);
    const mid = [cx + nx * off, cy + ny * off];
    let line = [start, mid, end];
    for (let it = 0; it < 6; it++) {
      const nl = [line[0]];
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const px = -(b[1] - a[1]) / len, py = (b[0] - a[0]) / len;
        const d = r.range(-0.18, 0.18) * len;
        nl.push([m[0] + px * d, m[1] + py * d], b);
      }
      line = nl;
    }
    river = chaikin(line, 2);
    if (o.coast) { const cut = river.findIndex(p => inSea(p) && p[1] > cy); if (cut > 0) river = river.slice(0, cut + 2); }
  }
  const nearRiver = (p, pad = 0) => river ? distToPolyline(p, river) < riverW / 2 + pad : false;

  // ---- gates & main roads ----
  const roads = [];
  const gates = [];
  const nGates = { village: 3, town: 3, city: 4, capital: 5 }[o.size] || 4;
  const g0 = r.range(0, Math.PI * 2);
  for (let g = 0; g < nGates; g++) {
    const a = g0 + g / nGates * Math.PI * 2 + r.range(-0.25, 0.25);
    const wi = Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * wall.length) % wall.length;
    const gp = wall[wi];
    if (inSea([gp[0], gp[1] + 30])) continue;
    gates.push({ p: gp, wi, a });
    const far = Math.hypot(W, H) * 0.7;
    const outEnd = [cx + Math.cos(a + r.range(-0.2, 0.2)) * far, cy + Math.sin(a + r.range(-0.2, 0.2)) * far];
    const midOut = [(gp[0] + outEnd[0]) / 2 + r.range(-60, 60), (gp[1] + outEnd[1]) / 2 + r.range(-60, 60)];
    const midIn = [(gp[0] + cx) / 2 + r.range(-s * 0.4, s * 0.4), (gp[1] + cy) / 2 + r.range(-s * 0.4, s * 0.4)];
    let road = chaikin([[cx, cy], midIn, gp, midOut, outEnd], 3);
    if (o.coast) { const cut = road.findIndex(p => inSea(p)); if (cut > 0) road = road.slice(0, cut); }
    roads.push(road);
  }
  const roadW = Math.max(10, Math.min(18, s * 0.19));
  const nearRoad = (p, pad = 0) => roads.some(rd => distToPolyline(p, rd) < roadW / 2 + pad);

  // ---- classify wards ----
  for (const c of cells) {
    c.d = Math.hypot(c.c[0] - cx, c.c[1] - cy);
    c.inner = walls ? insideTown(c.c) : c.d < R;
    c.sea = inSea(c.c);
  }
  const inner = cells.filter(c => c.inner && !c.sea).sort((a, b) => a.d - b.d);
  const used = new Set();
  const plaza = inner.find(c => !nearRiver(c.c, 20)) || inner[0];
  if (plaza) plaza.type = 'plaza';
  if (o.temple) { const t = inner.slice(1, 6).find(c => !c.type && !nearRiver(c.c, 10)); if (t) { t.type = 'temple'; t.title = templeName(r); } }
  if (o.castle && inner.length > 5) {
    const cands = inner.filter(c => !c.type && c.d > R * 0.55 && !nearRiver(c.c, 30)).sort((a, b) => b.area - a.area);
    if (cands[0]) cands[0].type = 'castle';
  }
  if (nInner >= 30) { const p = r.shuffle(inner.filter(c => !c.type && c.d > R * 0.3 && c.d < R * 0.8))[0]; if (p) p.type = 'park'; }
  for (const c of inner) if (!c.type) c.type = 'res';
  for (const c of cells) {
    if (c.type) continue;
    if (c.sea) c.type = 'sea';
    else if (c.inner) c.type = 'res';
    else if (c.d < R * 1.75 && nearRoad(c.c, s * 0.9)) c.type = 'outskirts';
    else if (c.d < R * 2.9) c.type = r.chance(0.82) ? 'farm' : 'meadow';
    else c.type = r.chance(0.5) ? 'farm' : 'wild';
  }

  // ---- building lots ----
  const buildings = [];
  const fields = [];
  const minLot = s * s * 0.13;
  const split = (poly, minA, out, depth = 0, gapP = 0.35) => {
    const area = Math.abs(polyArea(poly));
    if (poly.length < 3 || area < 40) return;
    if (area < minA * r.range(0.6, 1.5) || depth > 9) { out.push(poly); return; }
    let li = 0, ll = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > ll) { ll = l; li = i; } }
    const a = poly[li], b = poly[(li + 1) % poly.length];
    const dx = (b[0] - a[0]) / ll, dy = (b[1] - a[1]) / ll;
    const c = centroid(poly);
    const t = r.range(-0.15, 0.15) * ll;
    const ox = c[0] + dx * t, oy = c[1] + dy * t;
    const g = r.chance(gapP) ? r.range(2.5, 5) : 1.2;
    split(clipHalf(poly, ox + dx * g / 2, oy + dy * g / 2, dx, dy), minA, out, depth + 1, gapP);
    split(clipHalf(poly, ox - dx * g / 2, oy - dy * g / 2, -dx, -dy), minA, out, depth + 1, gapP);
  };
  const lotOK = (lot, insideWall) => {
    const c = centroid(lot);
    if (inSea(c) || lot.some(p => inSea(p))) return false;
    if (river && lot.some(p => nearRiver(p, 5))) return false;
    if (lot.some(p => nearRoad(p, 2)) || nearRoad(c, 4)) return false;
    if (walls) {
      for (const p of lot) {
        const inW = insideTown(p);
        if (insideWall !== inW) return false;
        let dw = Infinity;
        for (let i = 0; i < wall.length; i++) dw = Math.min(dw, distToSeg(p, wall[i], wall[(i + 1) % wall.length]));
        if (dw < 10) return false;
      }
    }
    return true;
  };
  const trees = [];
  let castle = null, temple = null;
  for (const c of cells) {
    const street = Math.max(4, s * (c.type === 'res' || c.type === 'temple' || c.type === 'castle' ? 0.07 : 0.09));
    const base = inset(c.poly, street);
    if (base.length < 3) continue;
    if (c.type === 'res') {
      const lots = [];
      const near = Math.max(0, 1 - c.d / R);
      split(base, minLot * (1 + near * 0.6), lots);
      for (const l of lots) if (r() > 0.04 && lotOK(l, true)) buildings.push({ poly: l, kind: 'house' });
    } else if (c.type === 'outskirts') {
      const lots = [];
      split(base, minLot * 1.1, lots, 0, 0.7);
      for (const l of lots) if (nearRoad(centroid(l), 60) && r() > 0.3 && lotOK(l, false)) buildings.push({ poly: l, kind: 'house' });
    } else if (c.type === 'temple') {
      const body = inset(base, Math.sqrt(c.area) * 0.18);
      if (body.length > 2 && lotOK(body, true)) { buildings.push({ poly: body, kind: 'temple' }); temple = { c: centroid(body), name: c.title }; }
      const lots = []; split(base, minLot, lots);
      for (const l of lots) { const lc = centroid(l); if (body.length > 2 && pointInPoly(lc, inset(base, Math.sqrt(c.area) * 0.1))) continue; if (lotOK(l, true) && r() > 0.3) buildings.push({ poly: l, kind: 'house' }); }
    } else if (c.type === 'castle') {
      const cw = inset(base, 4);
      const keep = inset(base, Math.sqrt(c.area) * 0.27);
      castle = { wall: cw, c: centroid(cw) };
      if (keep.length > 2) buildings.push({ poly: keep, kind: 'keep' });
    } else if (c.type === 'park') {
      const pc = centroid(base);
      for (let i = 0; i < 26; i++) {
        const p = [pc[0] + r.range(-1, 1) * Math.sqrt(c.area) * 0.4, pc[1] + r.range(-1, 1) * Math.sqrt(c.area) * 0.4];
        if (pointInPoly(p, base)) trees.push({ p, s: r.range(6, 10) });
      }
    } else if (c.type === 'farm') {
      const fl = [];
      split(inset(c.poly, 3), c.area * r.range(0.25, 0.55), fl, 0, 1);
      for (const f of fl) if (!inSea(centroid(f))) fields.push({ poly: inset(f, 2), angle: r.range(0, Math.PI), tone: r.int(0, 2) });
    } else if (c.type === 'meadow' || c.type === 'wild') {
      const n = c.type === 'wild' ? 9 : 3;
      for (let i = 0; i < n; i++) {
        const p = [c.c[0] + r.range(-0.5, 0.5) * Math.sqrt(c.area), c.c[1] + r.range(-0.5, 0.5) * Math.sqrt(c.area)];
        if (pointInPoly(p, c.poly) && !inSea(p) && !nearRiver(p, 6) && !nearRoad(p, 8)) trees.push({ p, s: r.range(6, 11) });
      }
    }
  }
  // trees along the riverbanks outside town
  if (river) for (let i = 0; i < river.length; i += 2) {
    const p = river[i];
    if (insideTown(p) || r.chance(0.5)) continue;
    const a = r.range(0, Math.PI * 2), d = riverW / 2 + r.range(8, 22);
    const q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
    if (!nearRiver(q, 4) && !inSea(q) && !nearRoad(q, 6)) trees.push({ p: q, s: r.range(5, 9) });
  }

  // ---- bridges ----
  const bridges = [];
  if (river) for (const rd of roads) for (let i = 1; i < rd.length; i++) for (let j = 1; j < river.length; j++) {
    const hit = segIntersect(rd[i - 1], rd[i], river[j - 1], river[j]);
    if (hit && !bridges.some(b => Math.hypot(b.p[0] - hit.p[0], b.p[1] - hit.p[1]) < 30)) bridges.push(hit);
  }

  // ---- docks ----
  const docks = [];
  if (o.coast) {
    for (let x = cx - R * 0.9; x < cx + R * 0.9; x += r.range(55, 90)) {
      if (river && Math.abs(x - river[river.length - 1][0]) < 50) continue;
      const y = shoreY(x);
      docks.push({ x, y, len: r.range(45, 90), w: r.range(10, 14) });
    }
  }

  // ---- labels ----
  const names = new Set();
  const labels = [];
  if (plaza) labels.push({ name: 'Market Square', p: plaza.c, kind: 'landmark' });
  if (castle) labels.push({ name: 'Castle', p: castle.c, kind: 'landmark' });
  if (temple) labels.push({ name: temple.name, p: temple.c, kind: 'landmark' });
  const park = cells.find(c => c.type === 'park'); if (park) labels.push({ name: 'Royal Gardens', p: park.c, kind: 'landmark' });
  const resCells = r.shuffle(inner.filter(c => c.type === 'res'));
  const picked = [];
  const wanted = Math.min(8, Math.max(2, Math.round(nInner / 5)));
  for (const c of resCells) {
    if (picked.length >= wanted) break;
    if (picked.some(p => Math.hypot(p.c[0] - c.c[0], p.c[1] - c.c[1]) < s * 2)) continue;
    picked.push(c);
    labels.push({ name: districtName(r, names), p: c.c, kind: 'district' });
  }
  if (o.coast && docks.length) labels.push({ name: 'The Docks', p: [cx, shoreY(cx) + 40], kind: 'landmark' });

  return { o, W, H, R, s, cx, cy, cells, wall: walls ? wall : null, gates, roads, roadW, river, riverW, shore, buildings, fields, trees, bridges, docks, castle, labels, walls };
}

const CSTYLES = {
  parchment: { paper: [234, 221, 192], ink: [58, 43, 28], bld: [205, 182, 140], keep: [180, 150, 110], temple: [190, 160, 118], field: [[226, 212, 170], [218, 206, 160], [230, 220, 182]], furrow: 0.18,
    water: [186, 196, 182], tree: [196, 196, 148], road: [240, 230, 205], plaza: [240, 230, 205], grain: 12, vignette: 0.16, label: [58, 43, 28] },
  atlas: { paper: [238, 232, 218], ink: [70, 54, 44], bld: [214, 132, 104], keep: [150, 120, 110], temple: [200, 170, 110], field: [[208, 216, 160], [222, 208, 150], [196, 210, 150]], furrow: 0.12,
    water: [128, 178, 206], tree: [104, 150, 90], road: [250, 246, 236], plaza: [245, 238, 222], grain: 5, vignette: 0.1, label: [40, 32, 28] },
  night: { paper: [24, 22, 30], ink: [212, 162, 76], bld: [58, 52, 70], keep: [70, 60, 80], temple: [74, 64, 64], field: [[34, 36, 42], [30, 34, 38], [38, 38, 44]], furrow: 0.14,
    water: [16, 30, 46], tree: [40, 54, 48], road: [36, 33, 44], plaza: [40, 36, 48], grain: 6, vignette: 0.25, label: [235, 229, 216] },
};

export function renderCity(data, canvas, styleName = 'parchment') {
  const S = CSTYLES[styleName] || CSTYLES.parchment;
  const { W, H } = data;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const r = rng(data.o.seed + ':crender');
  const ink = rgba(S.ink), paper = rgba(S.paper);
  const k = 1;

  // paper
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { img.data[i * 4] = S.paper[0]; img.data[i * 4 + 1] = S.paper[1]; img.data[i * 4 + 2] = S.paper[2]; img.data[i * 4 + 3] = 255; }
  paperGrain(img, W, H, r, S.grain, S.vignette);
  ctx.putImageData(img, 0, 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // fields with furrows
  for (const f of data.fields) {
    if (f.poly.length < 3) continue;
    ctx.save();
    ctx.beginPath(); tracePath(ctx, f.poly, true);
    ctx.fillStyle = rgba(S.field[f.tone]); ctx.fill();
    ctx.clip();
    const c = centroid(f.poly), ext = 400, dx = Math.cos(f.angle), dy = Math.sin(f.angle);
    ctx.beginPath();
    for (let t = -ext; t < ext; t += 7) { ctx.moveTo(c[0] - dx * ext - dy * t, c[1] - dy * ext + dx * t); ctx.lineTo(c[0] + dx * ext - dy * t, c[1] + dy * ext + dx * t); }
    ctx.strokeStyle = rgba(S.ink, S.furrow); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); tracePath(ctx, f.poly, true); ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 0.8; ctx.stroke();
  }

  // sea
  if (data.shore) {
    const sea = [...data.shore, [W + 50, H + 50], [-50, H + 50]];
    ctx.beginPath(); tracePath(ctx, sea, true); ctx.fillStyle = rgba(S.water); ctx.fill();
    for (const [off, a] of [[10, 0.35], [22, 0.22], [38, 0.12]]) {
      ctx.beginPath(); tracePath(ctx, data.shore.map(p => [p[0], p[1] + off])); ctx.strokeStyle = rgba(styleName === 'atlas' ? [255, 255, 255] : S.ink, a); ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.beginPath(); tracePath(ctx, data.shore); ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke();
  }

  // river
  if (data.river) {
    ctx.beginPath(); tracePath(ctx, data.river);
    ctx.strokeStyle = ink; ctx.lineWidth = data.riverW + 4; ctx.stroke();
    ctx.strokeStyle = rgba(S.water); ctx.lineWidth = data.riverW; ctx.stroke();
    ctx.setLineDash([14, 18]); ctx.strokeStyle = rgba(styleName === 'atlas' ? [255, 255, 255] : S.ink, 0.25); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }

  // main roads
  for (const rd of data.roads) {
    ctx.beginPath(); tracePath(ctx, rd);
    ctx.strokeStyle = rgba(S.ink, 0.55); ctx.lineWidth = data.roadW + 2; ctx.stroke();
    ctx.strokeStyle = rgba(S.road); ctx.lineWidth = data.roadW; ctx.stroke();
  }

  // plaza
  const plaza = data.cells.find(c => c.type === 'plaza');
  if (plaza) {
    const p = inset(plaza.poly, 6);
    ctx.beginPath(); tracePath(ctx, p, true); ctx.fillStyle = rgba(S.plaza); ctx.fill(); ctx.strokeStyle = rgba(S.ink, 0.4); ctx.lineWidth = 1; ctx.stroke();
    const pc = centroid(p);
    ctx.beginPath(); ctx.arc(pc[0], pc[1], 9, 0, Math.PI * 2); ctx.fillStyle = rgba(S.water); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(22, Math.sqrt(plaza.area) * 0.32);
      const x = pc[0] + Math.cos(a) * d, y = pc[1] + Math.sin(a) * d;
      if (!pointInPoly([x, y], inset(p, 6))) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(r.range(0, Math.PI));
      ctx.fillStyle = rgba(mix(S.bld, [255, 255, 255], 0.25)); ctx.fillRect(-6, -4, 12, 8); ctx.strokeStyle = rgba(S.ink, 0.7); ctx.lineWidth = 0.8; ctx.strokeRect(-6, -4, 12, 8);
      ctx.restore();
    }
  }

  // castle inner wall
  if (data.castle && data.castle.wall.length > 2) {
    ctx.beginPath(); tracePath(ctx, data.castle.wall, true);
    ctx.fillStyle = rgba(mix(S.plaza, S.ink, 0.06)); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.stroke();
    for (const p of data.castle.wall) { ctx.beginPath(); ctx.arc(p[0], p[1], 5.5, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill(); }
  }

  // buildings (shadow, fill, outline)
  const shadow = styleName === 'night' ? 'rgba(0,0,0,.45)' : rgba(S.ink, 0.22);
  for (const b of data.buildings) { ctx.beginPath(); tracePath(ctx, b.poly.map(p => [p[0] + 2, p[1] + 2]), true); ctx.fillStyle = shadow; ctx.fill(); }
  for (const b of data.buildings) {
    ctx.beginPath(); tracePath(ctx, b.poly, true);
    ctx.fillStyle = rgba(b.kind === 'keep' ? S.keep : b.kind === 'temple' ? S.temple : mix(S.bld, [0, 0, 0], r.range(-0.06, 0.08)));
    ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = b.kind === 'house' ? 1 : 2; ctx.stroke();
    if (b.kind !== 'house') {
      // roof ridge / cross for landmarks
      const c = centroid(b.poly);
      ctx.beginPath();
      if (b.kind === 'temple') { ctx.moveTo(c[0] - 9, c[1]); ctx.lineTo(c[0] + 9, c[1]); ctx.moveTo(c[0], c[1] - 13); ctx.lineTo(c[0], c[1] + 9); }
      else { tracePath(ctx, inset(b.poly, 6), true); }
      ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // bridges
  for (const br of data.bridges) {
    ctx.save(); ctx.translate(br.p[0], br.p[1]); ctx.rotate(br.angle);
    const L = data.riverW + 18, Wd = data.roadW + 2;
    ctx.fillStyle = rgba(S.road); ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-L / 2, -Wd / 2); ctx.lineTo(L / 2, -Wd / 2); ctx.moveTo(-L / 2, Wd / 2); ctx.lineTo(L / 2, Wd / 2); ctx.stroke();
    ctx.restore();
  }

  // docks
  for (const d of data.docks) {
    ctx.fillStyle = rgba(mix(S.bld, S.ink, 0.25)); ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(d.x - d.w / 2, d.y - 4, d.w, d.len); ctx.fill(); ctx.stroke();
  }

  // trees
  for (const t of data.trees.sort((a, b) => a.p[1] - b.p[1])) {
    ctx.beginPath(); ctx.arc(t.p[0] + 2, t.p[1] + 2, t.s, 0, Math.PI * 2); ctx.fillStyle = shadow; ctx.fill();
    ctx.beginPath(); ctx.arc(t.p[0], t.p[1], t.s, 0, Math.PI * 2); ctx.fillStyle = rgba(mix(S.tree, [0, 0, 0], r.range(-0.05, 0.1))); ctx.fill();
    ctx.strokeStyle = rgba(S.ink, 0.8); ctx.lineWidth = 1; ctx.stroke();
  }

  // walls, towers, gates
  if (data.wall) {
    const gateIdx = new Set(data.gates.map(g => g.wi));
    const wl = data.wall;
    const inS = p => data.shore && p[1] > (() => { for (let i = 1; i < data.shore.length; i++) if (data.shore[i][0] >= p[0]) return data.shore[i][1]; return Infinity; })() - 4;
    ctx.strokeStyle = ink; ctx.lineCap = 'butt';
    for (let i = 0; i < wl.length; i++) {
      const a = wl[i], b = wl[(i + 1) % wl.length];
      if (inS(a) && inS(b)) continue;
      let pa = a, pb = b;
      if (gateIdx.has(i)) pa = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45];
      if (gateIdx.has((i + 1) % wl.length)) pb = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55];
      ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.lineWidth = 8; ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < wl.length; i += 3) {
      if (gateIdx.has(i) || inS(wl[i])) continue;
      ctx.beginPath(); ctx.arc(wl[i][0], wl[i][1], 8, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    }
    for (const g of data.gates) {
      const a = wl[(g.wi - 1 + wl.length) % wl.length], b = wl[(g.wi + 1) % wl.length];
      for (const t of [0.72, 1.28]) {
        const p = [a[0] + (b[0] - a[0]) * t / 2, a[1] + (b[1] - a[1]) * t / 2];
        ctx.beginPath(); ctx.rect(p[0] - 8, p[1] - 8, 16, 16); ctx.fillStyle = paper; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }

  // labels
  const L = new Labeler(W, H, 24);
  const title = data.o.name || 'Unnamed Town';
  L.add([30, 30, 30 + Math.min(700, 60 + title.length * 26), 140]);
  L.add([W - 240, H - 260, W - 20, H - 20]);
  L.add([30, H - 100, 360, H - 20]);
  const pins = [];
  for (const lb of data.labels) {
    const size = lb.kind === 'landmark' ? 20 : 18;
    ctx.font = `${lb.kind === 'district' ? 'italic ' : ''}700 ${size}px "Cormorant Garamond", Georgia, serif`;
    spaced(ctx, lb.kind === 'district' ? 2 : 1);
    const text = lb.kind === 'district' ? lb.name.toUpperCase() : lb.name;
    const tw = ctx.measureText(text).width;
    for (const [dx, dy] of [[0, 0], [0, -26], [0, 26], [-40, 0], [40, 0]]) {
      const x = lb.p[0] - tw / 2 + dx, y = lb.p[1] + dy;
      const box = [x - 4, y - size, x + tw + 4, y + 6];
      if (!L.free(box)) continue;
      L.add(box);
      ctx.textAlign = 'left';
      haloText(ctx, text, x, y, rgba(S.label), rgba(S.paper, 0.92), 6);
      break;
    }
    spaced(ctx, 0);
    pins.push({ name: lb.name, x: lb.p[0], y: lb.p[1], kind: lb.kind });
  }

  const pxPerFoot = data.s / 230;
  drawCompass(ctx, W - 130, H - 140, 70, ink, paper, rgba(hexToRgb('#b5483f')));
  drawScaleBar(ctx, 56, H - 56, pxPerFoot, 'feet', ink, paper, 1.1);
  const sizeLabel = { village: 'Village', town: 'Town', city: 'City', capital: 'Capital city' }[data.o.size] || 'Town';
  drawCartouche(ctx, 40, 40, title, `${sizeLabel} · ${data.buildings.length} buildings`, ink, paper, 1);
  drawFrame(ctx, W, H, ink, paper, 1);
  return { pins, pxPerUnit: pxPerFoot, unit: 'feet' };
}
