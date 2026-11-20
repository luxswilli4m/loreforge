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
  quill: { paper: [226, 208, 170], ink: [62, 43, 24], bld: [218, 198, 158], keep: [204, 182, 140], temple: [210, 188, 146], field: [[226, 208, 170], [221, 203, 164], [230, 213, 176]], furrow: 0.3,
    water: [214, 195, 156], tree: [226, 208, 170], road: [232, 216, 182], plaza: [232, 216, 182], grain: 20, vignette: 0.4, label: [62, 43, 24] },
  night: { paper: [24, 22, 30], ink: [212, 162, 76], bld: [58, 52, 70], keep: [70, 60, 80], temple: [74, 64, 64], field: [[34, 36, 42], [30, 34, 38], [38, 38, 44]], furrow: 0.14,
    water: [16, 30, 46], tree: [40, 54, 48], road: [36, 33, 44], plaza: [40, 36, 48], grain: 6, vignette: 0.25, label: [235, 229, 216] },
};

export const CITY_STYLE_NAMES = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night', storybook: 'Storybook', quill: 'Ink & Quill' };

export function renderCity(data, canvas, styleName = 'parchment') {
  if (styleName === 'storybook') return renderCityStorybook(data, canvas);
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

  return finishCity(ctx, data, S, ink, paper);
}


function finishCity(ctx, data, S, ink, paper, opts = {}) {
  const { W, H } = data;
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
      haloText(ctx, text, x, y, rgba(S.label), rgba(S.halo || S.paper, 0.92), 6);
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
  if (!opts.noFrame) drawFrame(ctx, W, H, ink, paper, 1);
  return { pins, pxPerUnit: pxPerFoot, unit: 'feet' };
}

// ---------------- Storybook: bright, hand-painted look (coloured roofs, cobbles, lush trees, painted water) ----------------
const ROOFS = [[204, 92, 70], [186, 80, 64], [222, 132, 74], [214, 168, 106], [196, 112, 84], [104, 122, 156], [76, 142, 142], [146, 100, 146], [226, 150, 96]];
function renderCityStorybook(data, canvas) {
  const { W, H } = data;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const r = rng(data.o.seed + ':sb');
  const nz = makeNoise(rng(data.o.seed + ':sbn'));
  const INK = [42, 38, 44], ink = rgba(INK);
  const S = { ink: INK, paper: [250, 244, 226], label: [40, 36, 44], halo: [252, 248, 238] };

  // grass ground: coarse blotches + fine tiled texture
  const cg = 8, gw = Math.ceil(W / cg) + 1, gh = Math.ceil(H / cg) + 1, coarse = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) coarse[y * gw + x] = nz.fbm(x * cg / 260, y * cg / 260, 4);
  const fine = new Float32Array(128 * 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) fine[y * 128 + x] = nz.fbm(x / 9 + 50, y / 9, 2);
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cv = coarse[((y / cg) | 0) * gw + ((x / cg) | 0)], fv = fine[((y & 127) << 7) | (x & 127)];
    const t = Math.max(0, Math.min(1, 0.5 + cv * 1.3));
    const o = (y * W + x) * 4;
    d[o] = 118 + t * 50 + fv * 14; d[o + 1] = 152 + t * 36 + fv * 14; d[o + 2] = 80 + t * 22 + fv * 8; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const shadow = 'rgba(20,24,10,.32)';

  // fields: patchwork with furrows and hedgerows
  const FIELD = [[202, 188, 104], [172, 170, 84], [150, 178, 90], [212, 178, 112], [184, 196, 110]];
  for (const f of data.fields) {
    if (f.poly.length < 3) continue;
    ctx.save();
    ctx.beginPath(); tracePath(ctx, f.poly, true);
    const fc = FIELD[(f.tone + Math.floor(r() * 5)) % FIELD.length];
    ctx.fillStyle = rgba(fc); ctx.fill(); ctx.clip();
    const c = centroid(f.poly), ext = 400, dx = Math.cos(f.angle), dy = Math.sin(f.angle);
    ctx.beginPath();
    for (let t = -ext; t < ext; t += 8) { ctx.moveTo(c[0] - dx * ext - dy * t, c[1] - dy * ext + dx * t); ctx.lineTo(c[0] + dx * ext - dy * t, c[1] + dy * ext + dx * t); }
    ctx.strokeStyle = rgba(mix(fc, [60, 50, 20], 0.35), 0.5); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); tracePath(ctx, f.poly, true); ctx.strokeStyle = 'rgba(52,96,44,.85)'; ctx.lineWidth = 4; ctx.stroke();
  }

  // sea: sandy beach, shallows glow, foam
  if (data.shore) {
    const sea = [...data.shore, [W + 50, H + 50], [-50, H + 50]];
    ctx.beginPath(); tracePath(ctx, data.shore); ctx.strokeStyle = 'rgb(226,206,150)'; ctx.lineWidth = 34; ctx.stroke();
    ctx.save();
    ctx.beginPath(); tracePath(ctx, sea, true);
    const top = Math.min(...data.shore.map(p => p[1]));
    const g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, 'rgb(70,140,160)'); g.addColorStop(1, 'rgb(34,86,120)');
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    for (const [w, a] of [[110, 0.18], [64, 0.25], [30, 0.35]]) { ctx.beginPath(); tracePath(ctx, data.shore); ctx.strokeStyle = `rgba(150,214,218,${a})`; ctx.lineWidth = w; ctx.stroke(); }
    // painted swirls
    for (let i = 0; i < 70; i++) {
      const x = r.range(0, W), y = r.range(top, H);
      ctx.beginPath(); ctx.ellipse(x, y, r.range(40, 120), r.range(8, 22), r.range(-0.3, 0.3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r.chance(0.5) ? '255,255,255' : '10,40,70'},${r.range(0.03, 0.07)})`; ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); tracePath(ctx, data.shore.map(p => [p[0], p[1] + 6])); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.setLineDash([18, 10]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); tracePath(ctx, data.shore); ctx.strokeStyle = 'rgba(60,50,30,.6)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // river
  if (data.river) {
    ctx.beginPath(); tracePath(ctx, data.river);
    ctx.strokeStyle = 'rgb(150,132,92)'; ctx.lineWidth = data.riverW + 14; ctx.stroke();
    ctx.strokeStyle = 'rgb(40,74,88)'; ctx.lineWidth = data.riverW + 4; ctx.stroke();
    ctx.strokeStyle = 'rgb(76,146,168)'; ctx.lineWidth = data.riverW; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,214,220,.55)'; ctx.lineWidth = data.riverW * 0.35; ctx.setLineDash([30, 22]); ctx.stroke(); ctx.setLineDash([]);
  }

  // cobbled roads
  const cobble = (poly, closed) => {
    ctx.beginPath(); tracePath(ctx, poly, closed);
  };
  for (const rd of data.roads) { cobble(rd); ctx.strokeStyle = 'rgb(84,80,84)'; ctx.lineWidth = data.roadW + 5; ctx.stroke(); }
  for (const rd of data.roads) {
    cobble(rd); ctx.strokeStyle = 'rgb(194,190,182)'; ctx.lineWidth = data.roadW; ctx.stroke();
    for (const [off, col] of [[0, 'rgba(120,114,110,.55)'], [5, 'rgba(236,232,224,.6)']]) {
      cobble(rd); ctx.setLineDash([3, 7]); ctx.lineDashOffset = off; ctx.strokeStyle = col; ctx.lineWidth = data.roadW * 0.7; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // plaza with flagstones and a fountain
  const plaza = data.cells.find(c => c.type === 'plaza');
  if (plaza) {
    const p = inset(plaza.poly, 6);
    ctx.save();
    ctx.beginPath(); tracePath(ctx, p, true); ctx.fillStyle = 'rgb(204,200,190)'; ctx.fill(); ctx.clip();
    const bb = [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
    for (let y = bb[1]; y < bb[3]; y += 9) for (let x = bb[0] + ((y / 9) % 2) * 6; x < bb[2]; x += 12) {
      ctx.fillStyle = `rgba(${r.chance(0.5) ? '120,114,108' : '235,230,220'},${r.range(0.15, 0.4)})`; ctx.fillRect(x, y, 10, 7);
    }
    ctx.restore();
    ctx.beginPath(); tracePath(ctx, p, true); ctx.strokeStyle = 'rgb(84,80,84)'; ctx.lineWidth = 2.5; ctx.stroke();
    const pc = centroid(p);
    ctx.beginPath(); ctx.arc(pc[0], pc[1], 18, 0, Math.PI * 2); ctx.fillStyle = 'rgb(176,172,168)'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(pc[0], pc[1], 13, 0, Math.PI * 2); ctx.fillStyle = 'rgb(96,176,200)'; ctx.fill();
    ctx.beginPath(); ctx.arc(pc[0], pc[1], 4, 0, Math.PI * 2); ctx.fillStyle = 'rgb(220,240,244)'; ctx.fill();
    // market stalls with striped awnings
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, Math.PI * 2), dd = r.range(34, Math.sqrt(plaza.area) * 0.32);
      const x = pc[0] + Math.cos(a) * dd, y = pc[1] + Math.sin(a) * dd;
      if (!pointInPoly([x, y], inset(p, 10))) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(r.range(-0.4, 0.4));
      const col = r.pick(['rgb(204,70,64)', 'rgb(60,120,170)', 'rgb(222,170,60)', 'rgb(70,150,100)']);
      ctx.fillStyle = shadow; ctx.fillRect(-7, -5, 16, 12);
      ctx.fillStyle = col; ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let j = -6; j < 8; j += 6) ctx.fillRect(j, -6, 3, 12);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.strokeRect(-8, -6, 16, 12);
      ctx.restore();
    }
  }

  // castle courtyard
  if (data.castle && data.castle.wall.length > 2) {
    ctx.beginPath(); tracePath(ctx, data.castle.wall, true); ctx.fillStyle = 'rgb(186,182,172)'; ctx.fill();
    ctx.strokeStyle = 'rgb(54,50,56)'; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = 'rgb(160,156,160)'; ctx.lineWidth = 7; ctx.stroke();
  }

  // buildings: drop shadow, two-tone roofs with a ridge line, bold outline
  for (const b of data.buildings) { ctx.beginPath(); tracePath(ctx, b.poly.map(p => [p[0] + 3.5, p[1] + 3.5]), true); ctx.fillStyle = shadow; ctx.fill(); }
  for (const b of data.buildings) {
    const poly = b.poly, c = centroid(poly);
    let best = 0, dir = [1, 0];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L > best) { best = L; dir = [(q[0] - a[0]) / L, (q[1] - a[1]) / L]; } }
    let col;
    if (b.kind === 'keep') col = [112, 118, 140];
    else if (b.kind === 'temple') col = [86, 132, 170];
    else {
      const bias = nz.fbm(c[0] / 320, c[1] / 320, 2);
      const pool = bias > 0.12 ? [0, 1, 4, 8] : bias < -0.15 ? [3, 5, 6, 2] : [0, 2, 3, 1, 7, 4];
      col = mix(ROOFS[pool[Math.floor(r() * pool.length)]], [255, 255, 255], r.range(-0.08, 0.1));
    }
    ctx.beginPath(); tracePath(ctx, poly, true); ctx.fillStyle = rgba(col); ctx.fill();
    const n = [-dir[1], dir[0]];
    const half = clipHalf(poly, c[0], c[1], n[0], n[1]);
    if (half.length > 2) { ctx.beginPath(); tracePath(ctx, half, true); ctx.fillStyle = rgba(mix(col, [20, 10, 10], 0.24)); ctx.fill(); }
    // roof tiles: faint lines parallel to the ridge
    ctx.save(); ctx.beginPath(); tracePath(ctx, poly, true); ctx.clip();
    ctx.beginPath();
    for (let t = -best; t <= best; t += 4) { ctx.moveTo(c[0] + n[0] * t - dir[0] * best, c[1] + n[1] * t - dir[1] * best); ctx.lineTo(c[0] + n[0] * t + dir[0] * best, c[1] + n[1] * t + dir[1] * best); }
    ctx.strokeStyle = 'rgba(40,20,10,.13)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    let lo = 0, hi = 0;
    for (const p of poly) { const pr = (p[0] - c[0]) * dir[0] + (p[1] - c[1]) * dir[1]; lo = Math.min(lo, pr); hi = Math.max(hi, pr); }
    ctx.beginPath(); ctx.moveTo(c[0] + dir[0] * lo * 0.78, c[1] + dir[1] * lo * 0.78); ctx.lineTo(c[0] + dir[0] * hi * 0.78, c[1] + dir[1] * hi * 0.78);
    ctx.strokeStyle = rgba(mix(col, [255, 240, 220], 0.35)); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); tracePath(ctx, poly, true); ctx.strokeStyle = ink; ctx.lineWidth = b.kind === 'house' ? 1.6 : 2.6; ctx.stroke();
    if (b.kind === 'temple') { ctx.beginPath(); ctx.arc(c[0], c[1], 6, 0, Math.PI * 2); ctx.fillStyle = 'rgb(232,196,90)'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // bridges
  for (const br of data.bridges) {
    ctx.save(); ctx.translate(br.p[0], br.p[1]); ctx.rotate(br.angle);
    const L = data.riverW + 24, Wd = data.roadW + 6;
    ctx.fillStyle = shadow; ctx.fillRect(-L / 2 + 3, -Wd / 2 + 3, L, Wd);
    ctx.fillStyle = 'rgb(178,172,164)'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(-L / 2, -Wd / 2, L, Wd);
    ctx.beginPath(); for (let x = -L / 2 + 6; x < L / 2; x += 8) { ctx.moveTo(x, -Wd / 2); ctx.lineTo(x, -Wd / 2 + 3); ctx.moveTo(x, Wd / 2); ctx.lineTo(x, Wd / 2 - 3); }
    ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  // wooden docks
  for (const dk of data.docks) {
    ctx.fillStyle = shadow; ctx.fillRect(dk.x - dk.w / 2 + 3, dk.y - 1, dk.w, dk.len);
    ctx.fillStyle = 'rgb(170,122,78)'; ctx.fillRect(dk.x - dk.w / 2, dk.y - 4, dk.w, dk.len);
    ctx.beginPath(); for (let y = dk.y; y < dk.y + dk.len - 4; y += 5) { ctx.moveTo(dk.x - dk.w / 2, y); ctx.lineTo(dk.x + dk.w / 2, y); }
    ctx.strokeStyle = 'rgba(70,44,24,.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.strokeRect(dk.x - dk.w / 2, dk.y - 4, dk.w, dk.len);
    if (r.chance(0.5)) { // a little boat
      const bx = dk.x + dk.w / 2 + 12, by = dk.y + dk.len * r.range(0.4, 0.8);
      ctx.beginPath(); ctx.ellipse(bx, by, 6, 16, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgb(150,96,56)'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by, 3, 11, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgb(206,170,120)'; ctx.fill();
    }
  }

  // lush tree clumps
  const TREE = [[58, 118, 64], [76, 140, 70], [50, 104, 74], [92, 150, 76]];
  for (const t of data.trees.sort((a, b) => a.p[1] - b.p[1])) {
    const base = TREE[Math.floor(r() * TREE.length)], s0 = t.s * 1.25;
    const blobs = [[0, 0, 1], [-0.55, 0.25, 0.7], [0.55, 0.3, 0.72], [0, -0.45, 0.68]];
    ctx.beginPath(); for (const [dx, dy, rr] of blobs) { ctx.moveTo(t.p[0] + dx * s0 + rr * s0 + 4, t.p[1] + dy * s0 + 4); ctx.arc(t.p[0] + dx * s0 + 4, t.p[1] + dy * s0 + 4, rr * s0, 0, Math.PI * 2); }
    ctx.fillStyle = shadow; ctx.fill();
    ctx.beginPath(); for (const [dx, dy, rr] of blobs) { ctx.moveTo(t.p[0] + dx * s0 + rr * s0, t.p[1] + dy * s0); ctx.arc(t.p[0] + dx * s0, t.p[1] + dy * s0, rr * s0, 0, Math.PI * 2); }
    ctx.fillStyle = rgba(base); ctx.fill(); ctx.strokeStyle = 'rgb(28,52,30)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(t.p[0] - s0 * 0.25, t.p[1] - s0 * 0.4, s0 * 0.45, 0, Math.PI * 2); ctx.fillStyle = rgba(mix(base, [230, 240, 160], 0.3), 0.8); ctx.fill();
  }

  // stone walls with round towers and red conical roofs
  if (data.wall) {
    const gateIdx = new Set(data.gates.map(g => g.wi));
    const wl = data.wall;
    const inS = p => data.shore && p[1] > (() => { for (let i = 1; i < data.shore.length; i++) if (data.shore[i][0] >= p[0]) return data.shore[i][1]; return Infinity; })() - 4;
    const segs = [];
    for (let i = 0; i < wl.length; i++) {
      const a = wl[i], b = wl[(i + 1) % wl.length];
      if (inS(a) && inS(b)) continue;
      let pa = a, pb = b;
      if (gateIdx.has(i)) pa = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45];
      if (gateIdx.has((i + 1) % wl.length)) pb = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55];
      segs.push([pa, pb]);
    }
    ctx.lineCap = 'butt';
    for (const [w, col, dash] of [[16, 'rgb(46,42,48)', null], [11, 'rgb(158,154,158)', null], [11, 'rgb(118,114,120)', [5, 7]], [3, 'rgba(230,228,224,.6)', null]]) {
      ctx.setLineDash(dash || []);
      ctx.beginPath(); for (const [pa, pb] of segs) { ctx.moveTo(...pa); ctx.lineTo(...pb); }
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineCap = 'round';
    const tower = (x, y, rad) => {
      ctx.beginPath(); ctx.arc(x + 3, y + 3, rad, 0, Math.PI * 2); ctx.fillStyle = shadow; ctx.fill();
      const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 1, x, y, rad);
      g.addColorStop(0, 'rgb(232,124,98)'); g.addColorStop(1, 'rgb(160,62,50)');
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      ctx.strokeStyle = 'rgba(60,20,14,.45)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    };
    for (let i = 0; i < wl.length; i += 3) { if (gateIdx.has(i) || inS(wl[i])) continue; tower(wl[i][0], wl[i][1], 11); }
    for (const g of data.gates) {
      const a = wl[(g.wi - 1 + wl.length) % wl.length], b = wl[(g.wi + 1) % wl.length];
      for (const t of [0.72, 1.28]) { const p = [a[0] + (b[0] - a[0]) * t / 2, a[1] + (b[1] - a[1]) * t / 2]; tower(p[0], p[1], 13); }
    }
  }
  if (data.castle) for (const p of data.castle.wall) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fillStyle = 'rgb(112,118,140)'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.stroke();
  }

  // gentle vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,30,10,.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  return finishCity(ctx, data, S, ink, rgba(S.paper));
}
