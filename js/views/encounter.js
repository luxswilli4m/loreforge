// Encounter map editor: paint top-down battle maps the way you would in Inkarnate.
// Paint ground with soft natural edges, draw walls and shaped floors, stamp trees, furniture and props,
// place lights, then set the darkness, colour mood and fog. Every square is 5 ft.
// Saved maps land in Maps and can be fought on straight away in the battle map.
import { W, save } from '../store.js';
import { esc, toast, query, contextMenu, promptDialog, confirmDialog } from '../util.js';
import * as A from '../assets.js';
import { CELL, TERRAIN, WALLS, MOODS, BM_PRESETS, blankMap, renderMap, presetMap, cellIdx, terrainThumb, texture, lightsOf } from '../gen/battlemaps.js';
import { ASSETS, ASSET_CATS, drawAsset, assetThumb } from '../gen/bmAssets.js';

const DRAFT = 'loreforge:encounterDraft';
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const TOOLS = [
  ['paint', '🖌️', 'Paint ground (B)'], ['wall', '🧱', 'Draw walls (W)'], ['floor', '⬠', 'Shaped floor (F)'], ['stamp', '🌳', 'Stamp assets (S)'],
  ['select', '👆', 'Select and move (V)'], ['light', '💡', 'Place lights (L)'], ['erase', '🧽', 'Erase objects, walls, lights (E)'],
];

export function render(main) {
  const q = query(), w = W();
  let mapId = q.map || null;
  let m;
  if (q.preset && BM_PRESETS[q.preset]) m = presetMap(q.preset);
  else if (mapId) { const mm = w.maps.find(x => x.id === mapId); m = mm?.gen?.data ? JSON.parse(JSON.stringify(mm.gen.data)) : null; if (!m) mapId = null; }
  if (!m) { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (d?.m?.ground) { m = d.m; mapId = d.mapId || null; } } catch { /* nothing saved */ } }
  if (!m) m = presetMap('crossroads');
  normMap(m);

  const st = { tool: 'paint', kind: 'grass', size: 2, shape: 'brush', wall: 'stone', asset: 'oak', rot: 0, scale: 1, randRot: true, randScale: true, snap: false, light: { r: 5, color: '#ffb347' }, sel: null, cat: ASSETS.oak.cat, layers: { terrain: true, walls: true, objects: true, lights: true, grid: true } };
  const hist = [], fut = [];
  let pic = null, tcache = null, view = { x: 0, y: 0, k: 1 }, CW = 800, CH = 600, pts = [], hover = null, drag = null, dirtyT = true, rebuildT = 0, busy = false;

  main.innerHTML = `<div class="enc">
    <div class="enc-top">
      <input id="en-name" value="${esc(m.name || 'Encounter map')}" title="Map name">
      <select id="en-preset" title="Start from a ready-made map"><option value="">📂 Start from…</option>${Object.entries(BM_PRESETS).map(([k, p]) => `<option value="${k}">${p.icon} ${esc(p.label)}</option>`).join('')}<option value="blank">▦ Blank map…</option></select>
      <button id="en-undo" title="Undo (Ctrl+Z)">↶</button><button id="en-redo" title="Redo (Ctrl+Y)">↷</button>
      <span style="flex:1"></span>
      <span class="muted small" id="en-status"></span>
      <button id="en-png" title="Download as a picture">⬇ PNG</button>
      <button id="en-save" class="primary">💾 Save to Maps</button>
      <button id="en-fight" title="Save, then fight on it">⚔️ Fight here</button>
    </div>
    <div class="enc-body">
      <div class="enc-tools" id="en-tools">${TOOLS.map(([k, i, t]) => `<button data-tool="${k}" title="${t}">${i}</button>`).join('')}</div>
      <div class="enc-stage" id="en-stage"><canvas id="en-cv"></canvas><canvas id="en-ov"></canvas><div class="enc-hint" id="en-hint"></div></div>
      <aside class="card side-box enc-side" id="en-side"></aside>
    </div></div>`;
  const $ = s => main.querySelector(s), cv = $('#en-cv'), ov = $('#en-ov'), stage = $('#en-stage'), ctx = cv.getContext('2d'), octx = ov.getContext('2d');

  // ---------- history ----------
  const snap = () => JSON.stringify(m);
  function push() { hist.push(snap()); if (hist.length > 60) hist.shift(); fut.length = 0; }
  function restore(s) { m = JSON.parse(s); normMap(m); st.sel = null; dirtyT = true; rebuild(); side(); }
  const undo = () => { if (!hist.length) return; fut.push(snap()); restore(hist.pop()); };
  const redo = () => { if (!fut.length) return; hist.push(snap()); restore(fut.pop()); };

  // ---------- rendering ----------
  function rebuild(now) {
    clearTimeout(rebuildT);
    const go = () => {
      busy = true; status('Painting…');
      requestAnimationFrame(() => setTimeout(() => {
        const out = renderMap(m, { terrainCache: dirtyT ? null : tcache, layers: { ...st.layers, mood: true } });
        tcache = out.terrain; dirtyT = false; pic = out.canvas; busy = false; status(''); draw(); persistDraft();
      }, 0));
    };
    if (now === false) rebuildT = setTimeout(go, 250); else go();
  }
  function persistDraft() { try { localStorage.setItem(DRAFT, JSON.stringify({ m, mapId })); } catch { /* too big or private mode */ } }
  const status = t => { $('#en-status').textContent = t; };
  function resize() { const r = stage.getBoundingClientRect(), dpr = devicePixelRatio || 1; CW = r.width; CH = r.height; for (const c of [cv, ov]) { c.width = CW * dpr; c.height = CH * dpr; c.style.width = CW + 'px'; c.style.height = CH + 'px'; } ctx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function fit() { const mw = m.cols * CELL, mh = m.rows * CELL, k = Math.min(CW / mw, CH / mh) * 0.94; view = { k, x: (CW - mw * k) / 2, y: (CH - mh * k) / 2 }; }
  const scr = (x, y) => [view.x + x * CELL * view.k, view.y + y * CELL * view.k]; // cells → screen
  const cellOf = ev => { const r = cv.getBoundingClientRect(); return [((ev.clientX - r.left) - view.x) / (CELL * view.k), ((ev.clientY - r.top) - view.y) / (CELL * view.k)]; };
  function draw() {
    ctx.fillStyle = '#14110e'; ctx.fillRect(0, 0, CW, CH);
    if (pic) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(pic, view.x, view.y, m.cols * CELL * view.k, m.rows * CELL * view.k); }
    if (st.layers.grid) {
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= m.cols; x++) { const a = scr(x, 0), b = scr(x, m.rows); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let y = 0; y <= m.rows; y++) { const a = scr(0, y), b = scr(m.cols, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    overlay();
  }
  // the overlay: brush outline, the wall being drawn, a ghost of the stamp, the selection
  function overlay() {
    octx.clearRect(0, 0, CW, CH);
    const k = CELL * view.k;
    if (st.tool === 'paint' && hover) {
      octx.strokeStyle = 'rgba(255,255,255,.8)'; octx.lineWidth = 1.5; octx.setLineDash([4, 3]);
      if (drag?.rect) { const [x0, y0, x1, y1] = rectOf(drag.start, hover); const a = scr(x0, y0); octx.strokeRect(a[0], a[1], (x1 - x0 + 1) * k, (y1 - y0 + 1) * k); }
      else if (st.shape === 'fill') { const a = scr(Math.floor(hover[0]), Math.floor(hover[1])); octx.strokeRect(a[0], a[1], k, k); }
      else { const c = brushCells(hover); for (const [x, y] of c) { const a = scr(x, y); octx.strokeRect(a[0] + 1, a[1] + 1, k - 2, k - 2); } }
      octx.setLineDash([]);
    }
    if ((st.tool === 'wall' || st.tool === 'floor') && (pts.length || hover)) {
      const all = hover ? [...pts, snapPt(hover)] : pts;
      octx.strokeStyle = st.tool === 'floor' ? '#7fd1ff' : '#ffd27f'; octx.lineWidth = Math.max(2, (st.tool === 'wall' ? WALLS[st.wall].w : 0.06) * k); octx.lineCap = 'round'; octx.lineJoin = 'round';
      octx.beginPath(); all.forEach((p, i) => { const s = scr(p[0], p[1]); i ? octx.lineTo(s[0], s[1]) : octx.moveTo(s[0], s[1]); }); if (st.tool === 'floor' && pts.length > 1) octx.closePath(); octx.globalAlpha = 0.75; octx.stroke(); octx.globalAlpha = 1;
      for (const p of all) { const s = scr(p[0], p[1]); octx.fillStyle = '#fff'; octx.beginPath(); octx.arc(s[0], s[1], 4, 0, 7); octx.fill(); }
      if (pts.length > 2) { const s = scr(pts[0][0], pts[0][1]); octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(s[0], s[1], 9, 0, 7); octx.stroke(); }
    }
    if (st.tool === 'stamp' && hover && !drag) {
      const p = st.snap ? snapHalf(hover) : hover, s = scr(p[0], p[1]);
      octx.save(); octx.globalAlpha = 0.75; octx.translate(s[0], s[1]); octx.scale(view.k, view.k); octx.rotate(st.rot); octx.scale(st.scale, st.scale); drawAsset(octx, st.asset, CELL, 3); octx.restore();
    }
    if (st.tool === 'light' && hover) { const s = scr(hover[0], hover[1]); octx.strokeStyle = st.light.color; octx.lineWidth = 2; octx.setLineDash([6, 4]); octx.beginPath(); octx.arc(s[0], s[1], st.light.r * k, 0, 7); octx.stroke(); octx.setLineDash([]); }
    if (st.sel) {
      const it = selItem(); if (it) { const s = scr(it.x, it.y), R = selRadius(it) * k; octx.strokeStyle = '#4fc3ff'; octx.lineWidth = 2; octx.setLineDash([5, 4]); octx.beginPath(); octx.arc(s[0], s[1], R, 0, 7); octx.stroke(); octx.setLineDash([]); }
    }
    if (st.tool === 'light' || st.tool === 'select' || st.tool === 'erase') for (const L of m.lights) { const s = scr(L.x, L.y); octx.fillStyle = L.color; octx.strokeStyle = '#000'; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(s[0], s[1], 7, 0, 7); octx.fill(); octx.stroke(); octx.fillStyle = '#000'; octx.font = '10px sans-serif'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText('☀', s[0], s[1]); }
    hint();
  }
  function hint() {
    const h = {
      paint: 'Click and drag to paint. Rectangle: drag a box. Fill: click a patch to flood it. Natural ground blends softly; floors keep sharp edges. [ and ] change the brush size.',
      wall: 'Click to add corners; double-click or Enter to finish, click the first corner to close it. Esc cancels. Hold Shift to place freely off the grid.',
      floor: 'Draw any outline (a ship deck, a round tower): click corners, double-click or Enter to finish. Esc cancels.',
      stamp: 'Click to stamp. A / D or Shift+scroll turn it, W / S or Alt+scroll resize it. Scroll to zoom.',
      select: 'Click an object or light to select it, drag to move. A / D turn it, W / S resize, Delete removes, Ctrl+D duplicates. Right-click for more.',
      light: 'Click to place a light. Campfires, torches, braziers and crystals already give off light of their own.',
      erase: 'Click an object, wall or light to remove it. Drag to rub out several.',
    }[st.tool];
    $('#en-hint').textContent = h + '  ·  Middle-drag or Space+drag to pan.';
  }

  // ---------- geometry helpers ----------
  const snapPt = (p, ev) => (ev?.shiftKey) ? [+p[0].toFixed(2), +p[1].toFixed(2)] : [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2];
  const snapHalf = p => [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2];
  function brushCells(p) { const out = [], R = st.size, cx = p[0], cy = p[1]; if (R <= 1) return [[Math.floor(cx), Math.floor(cy)]]; const r = R / 2; for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r + 0.2 && cellIdx(m, x, y) >= 0) out.push([x, y]); return out; }
  function rectOf(a, b) { return [Math.min(Math.floor(a[0]), Math.floor(b[0])), Math.min(Math.floor(a[1]), Math.floor(b[1])), Math.max(Math.floor(a[0]), Math.floor(b[0])), Math.max(Math.floor(a[1]), Math.floor(b[1]))].map((v, i) => Math.max(0, Math.min(i % 2 ? m.rows - 1 : m.cols - 1, v))); }
  const selItem = () => st.sel ? (st.sel.t === 'obj' ? m.objs[st.sel.i] : m.lights[st.sel.i]) : null;
  const selRadius = it => st.sel?.t === 'light' ? 0.35 : 0.55 * (it.s || 1) * (ASSETS[it.a]?.layer === 2 ? 1.8 : 1);
  function pickAt(p) {
    let best = null, bd = 1e9;
    m.lights.forEach((L, i) => { const d = Math.hypot(L.x - p[0], L.y - p[1]); if (d < 0.45 && d < bd) { bd = d; best = { t: 'light', i }; } });
    if (best) return best;
    // the topmost object whose middle is close
    for (let i = m.objs.length - 1; i >= 0; i--) { const o = m.objs[i], d = Math.hypot(o.x - p[0], o.y - p[1]), R = 0.55 * (o.s || 1) * (ASSETS[o.a]?.layer === 2 ? 1.6 : 1); if (d < R && d < bd) { bd = d; best = { t: 'obj', i }; } }
    return best;
  }
  function wallAt(p) { let best = -1, bd = 0.4; m.walls.forEach((wl, wi) => { const n = wl.pts.length - (wl.closed ? 0 : 1); for (let i = 0; i < n; i++) { const a = wl.pts[i], b = wl.pts[(i + 1) % wl.pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); if (d < bd) { bd = d; best = wi; } } }); return best; }
  function floorAt(p) { for (let i = (m.floors || []).length - 1; i >= 0; i--) { const P = m.floors[i].pts; let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, yi] = P[a], [xj, yj] = P[b]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } if (c) return i; } return -1; }

  // ---------- painting ----------
  // a quick preview while the brush moves: the new ground's texture in the painted squares; the full blend follows on release
  function paintCells(cells) {
    let changed = false; const g = pic?.getContext('2d'), pat = g && g.createPattern(texture(st.kind), 'repeat');
    for (const [x, y] of cells) { const i = cellIdx(m, x, y); if (i < 0 || m.ground[i] === st.kind) continue; m.ground[i] = st.kind; changed = true; if (g) { g.fillStyle = pat; g.fillRect(x * CELL, y * CELL, CELL, CELL); } }
    if (changed) { dirtyT = true; draw(); }
    return changed;
  }
  function flood(p) {
    const x0 = Math.floor(p[0]), y0 = Math.floor(p[1]), i0 = cellIdx(m, x0, y0); if (i0 < 0) return [];
    const from = m.ground[i0]; if (from === st.kind) return [];
    const out = [], seen = new Set([i0]), stack = [[x0, y0]];
    while (stack.length) { const [x, y] = stack.pop(); out.push([x, y]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = cellIdx(m, x + dx, y + dy); if (i >= 0 && !seen.has(i) && m.ground[i] === from) { seen.add(i); stack.push([x + dx, y + dy]); } } }
    return out;
  }
  function finishShape() {
    if (st.tool === 'wall' && pts.length >= 2) { push(); m.walls.push({ kind: st.wall, pts: pts.map(p => [...p]), closed: false }); rebuild(); }
    if (st.tool === 'floor' && pts.length >= 3) { push(); m.floors.push({ kind: st.kind === 'water' || st.kind === 'deep' ? 'wood' : st.kind, pts: pts.map(p => [...p]) }); dirtyT = true; rebuild(); }
    pts = []; overlay();
  }
  function stampAt(p) {
    const q = st.snap ? snapHalf(p) : [+p[0].toFixed(2), +p[1].toFixed(2)];
    push(); m.objs.push({ a: st.asset, x: q[0], y: q[1], r: st.rot, s: st.scale, seed: Math.floor(Math.random() * 1e6) });
    if (st.randRot) st.rot = Math.random() * Math.PI * 2;
    if (st.randScale) st.scale = +(0.85 + Math.random() * 0.3).toFixed(2);
    rebuild();
  }
  function eraseAt(p) {
    const hit = pickAt(p);
    if (hit) { if (hit.t === 'obj') m.objs.splice(hit.i, 1); else m.lights.splice(hit.i, 1); st.sel = null; return true; }
    const wi = wallAt(p); if (wi >= 0) { m.walls.splice(wi, 1); return true; }
    const fi = floorAt(p); if (fi >= 0) { m.floors.splice(fi, 1); dirtyT = true; return true; }
    return false;
  }

  // ---------- mouse ----------
  let space = false;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  ov.addEventListener('contextmenu', e => {
    e.preventDefault(); const p = cellOf(e), hit = pickAt(p);
    if ((st.tool === 'wall' || st.tool === 'floor') && pts.length) { finishShape(); return; }
    if (!hit) return; st.sel = hit; overlay();
    const it = selItem();
    contextMenu(e.clientX, e.clientY, [
      hit.t === 'obj' && { label: '↻ Turn 45°', action: () => { push(); it.r = (it.r || 0) + Math.PI / 4; rebuild(); } },
      hit.t === 'obj' && { label: '➕ Bigger', action: () => { push(); it.s = +((it.s || 1) * 1.15).toFixed(2); rebuild(); } },
      hit.t === 'obj' && { label: '➖ Smaller', action: () => { push(); it.s = +((it.s || 1) / 1.15).toFixed(2); rebuild(); } },
      hit.t === 'obj' && { label: '⧉ Duplicate', action: () => duplicate() },
      hit.t === 'obj' && { label: '⤒ Bring to front', action: () => { push(); m.objs.push(m.objs.splice(hit.i, 1)[0]); st.sel = { t: 'obj', i: m.objs.length - 1 }; rebuild(); } },
      { label: '🗑️ Remove', action: () => delSel() },
    ].filter(Boolean));
  });
  ov.addEventListener('pointerdown', e => {
    const p = cellOf(e);
    if (e.button === 1 || (e.button === 0 && space)) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; ov.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (e.button !== 0) return;
    ov.setPointerCapture(e.pointerId);
    if (st.tool === 'paint') {
      push();
      if (st.shape === 'rect') { drag = { rect: true, start: p }; return; }
      if (st.shape === 'fill') { paintCells(flood(p)); rebuild(); return; }
      drag = { paint: true }; paintCells(brushCells(p)); return;
    }
    if (st.tool === 'wall' || st.tool === 'floor') {
      const q = snapPt(p, e);
      if (pts.length > 2 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < 0.3) {
        if (st.tool === 'wall') { push(); m.walls.push({ kind: st.wall, pts: pts.map(x => [...x]), closed: true }); pts = []; rebuild(); } else finishShape();
        return;
      }
      if (e.detail >= 2) { finishShape(); return; }
      pts.push(q); overlay(); return;
    }
    if (st.tool === 'stamp') { stampAt(p); return; }
    if (st.tool === 'light') { push(); m.lights.push({ x: +p[0].toFixed(2), y: +p[1].toFixed(2), r: st.light.r, color: st.light.color }); rebuild(); return; }
    if (st.tool === 'erase') { push(); if (eraseAt(p)) rebuild(); drag = { erase: true }; return; }
    if (st.tool === 'select') {
      st.sel = pickAt(p); side(); overlay();
      if (st.sel) { const it = selItem(); push(); drag = { move: true, dx: it.x - p[0], dy: it.y - p[1], moved: false }; }
    }
  });
  ov.addEventListener('pointermove', e => {
    const p = cellOf(e); hover = p;
    if (drag?.pan) { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; draw(); return; }
    if (drag?.paint) { paintCells(brushCells(p)); overlay(); return; }
    if (drag?.erase) { if (eraseAt(p)) rebuild(false); return; }
    if (drag?.move) { const it = selItem(); if (it) { let x = p[0] + drag.dx, y = p[1] + drag.dy; if (st.snap) [x, y] = snapHalf([x, y]); it.x = +x.toFixed(2); it.y = +y.toFixed(2); drag.moved = true; if (st.sel.t === 'light' || it) { rebuild(false); overlay(); } } return; }
    overlay();
  });
  ov.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.rect) { const [x0, y0, x1, y1] = rectOf(d.start, cellOf(e)); const cells = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]); paintCells(cells); rebuild(); }
    else if (d.paint) rebuild();
    else if (d.move) { if (!d.moved) hist.pop(); rebuild(); }
    else if (d.erase) rebuild();
    overlay();
  });
  ov.addEventListener('pointerleave', () => { hover = null; overlay(); });
  ov.addEventListener('wheel', e => {
    e.preventDefault();
    const target = st.tool === 'select' && st.sel ? selItem() : null;
    if (e.shiftKey && (st.tool === 'stamp' || target)) { const d = (e.deltaY || e.deltaX) > 0 ? 1 : -1; if (target && st.sel.t === 'obj') { target.r = (target.r || 0) + d * Math.PI / 12; rebuild(false); } else st.rot += d * Math.PI / 12; overlay(); return; }
    if (e.altKey && (st.tool === 'stamp' || target)) { const f = e.deltaY > 0 ? 1 / 1.08 : 1.08; if (target && st.sel.t === 'obj') { target.s = +((target.s || 1) * f).toFixed(2); rebuild(false); } else st.scale = +(st.scale * f).toFixed(2); overlay(); side(); return; }
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    const k2 = Math.max(0.05, Math.min(6, view.k * f)); view.x = mx - (mx - view.x) * k2 / view.k; view.y = my - (my - view.y) * k2 / view.k; view.k = k2; draw();
  }, { passive: false });

  // ---------- keys ----------
  function duplicate() { const it = selItem(); if (!it || st.sel.t !== 'obj') return; push(); m.objs.push({ ...it, x: it.x + 0.5, y: it.y + 0.5, seed: Math.floor(Math.random() * 1e6) }); st.sel = { t: 'obj', i: m.objs.length - 1 }; rebuild(); }
  function delSel() { if (!st.sel) return; push(); if (st.sel.t === 'obj') m.objs.splice(st.sel.i, 1); else m.lights.splice(st.sel.i, 1); st.sel = null; rebuild(); side(); }
  const onKey = e => {
    if (e.target.closest('input,select,textarea')) return;
    if (e.code === 'Space') { space = e.type === 'keydown'; if (space) e.preventDefault(); return; }
    if (e.type !== 'keydown') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'escape') { pts = []; st.sel = null; overlay(); side(); return; }
    if (k === 'enter') { finishShape(); return; }
    if ((k === 'delete' || k === 'backspace') && st.sel) { e.preventDefault(); delSel(); return; }
    const target = st.sel?.t === 'obj' ? selItem() : null;
    if (k === 'a' || k === 'd') { const d = k === 'a' ? -1 : 1; if (target) { push(); target.r = (target.r || 0) + d * Math.PI / 12; rebuild(false); } else st.rot += d * Math.PI / 12; overlay(); return; }
    if ((k === 'w' || k === 's') && (st.tool === 'stamp' || target)) { const f = k === 'w' ? 1.1 : 1 / 1.1; if (target) { push(); target.s = +((target.s || 1) * f).toFixed(2); rebuild(false); } else st.scale = +(st.scale * f).toFixed(2); overlay(); side(); return; }
    if (k === '[' || k === ']') { st.size = Math.max(1, Math.min(9, st.size + (k === ']' ? 1 : -1))); side(); overlay(); return; }
    const t = { b: 'paint', w: 'wall', f: 'floor', s: 'stamp', v: 'select', l: 'light', e: 'erase' }[k]; if (t) setTool(t);
  };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);

  // ---------- the side panel ----------
  function setTool(t) { st.tool = t; pts = []; if (t !== 'select') st.sel = null; main.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); side(); overlay(); }
  function side() {
    const S = $('#en-side'), T = st.tool;
    let h = '';
    if (T === 'paint' || T === 'floor') {
      h += `<h4>${T === 'paint' ? 'Paint ground' : 'Shaped floor'}</h4>`;
      if (T === 'paint') h += `<div class="seg small"><button data-shape="brush" class="${st.shape === 'brush' ? 'on' : ''}">🖌️ Brush</button><button data-shape="rect" class="${st.shape === 'rect' ? 'on' : ''}">▭ Box</button><button data-shape="fill" class="${st.shape === 'fill' ? 'on' : ''}">🪣 Fill</button></div>
        ${st.shape === 'brush' ? `<label>Brush size <span class="val">${st.size} sq (${st.size * 5} ft)</span></label><input type="range" id="en-size" min="1" max="9" value="${st.size}">` : ''}`;
      h += `<div class="enc-swatches">${Object.entries(TERRAIN).filter(([k]) => T === 'paint' || !['water', 'deep', 'void'].includes(k)).map(([k, t]) => `<button class="enc-sw ${st.kind === k ? 'on' : ''}" data-kind="${k}" title="${t.label}"><img src="${terrainThumb(k)}" alt=""><span>${t.label}</span></button>`).join('')}</div>`;
      if (T === 'floor') h += '<p class="small muted">A shaped floor sits on top of the ground and can be any outline: draw a deck over water, a round tower, a raft. Tokens can stand on it.</p>';
    }
    if (T === 'wall') h += `<h4>Walls</h4><div class="enc-list">${Object.entries(WALLS).map(([k, t]) => `<button class="${st.wall === k ? 'on' : ''}" data-wall="${k}"><i class="enc-wsw" style="background:linear-gradient(90deg,${t.dark},${t.color},${t.top},${t.color},${t.dark})"></i>${t.label}</button>`).join('')}</div><p class="small muted">Walls snap to half squares. Fences and hedges can be stepped over; everything else blocks movement on the battle map.</p>`;
    if (T === 'stamp') {
      h += `<h4>Assets</h4><div class="seg small enc-cats">${ASSET_CATS.map(c => `<button data-cat="${esc(c)}" class="${st.cat === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
        <div class="enc-assets">${Object.entries(ASSETS).filter(([, a]) => a.cat === st.cat).map(([k, a]) => `<button class="enc-as ${st.asset === k ? 'on' : ''}" data-stamp="${k}" title="${esc(a.label)}"><img src="${assetThumb(k)}" alt=""><span>${esc(a.label)}</span></button>`).join('')}</div>
        <label>Turn <span class="val">${Math.round((st.rot * 180 / Math.PI) % 360 + 360) % 360}°</span></label><input type="range" id="en-rot" min="0" max="345" step="15" value="${Math.round((st.rot * 180 / Math.PI) % 360 + 360) % 360}">
        <label>Size <span class="val">${Math.round(st.scale * 100)}%</span></label><input type="range" id="en-scale" min="0.4" max="3" step="0.05" value="${st.scale}">
        <label class="check"><input type="checkbox" id="en-rr" ${st.randRot ? 'checked' : ''}> Random turn after each stamp</label>
        <label class="check"><input type="checkbox" id="en-rs" ${st.randScale ? 'checked' : ''}> Slightly random size</label>
        <label class="check"><input type="checkbox" id="en-snap" ${st.snap ? 'checked' : ''}> Snap to half squares</label>`;
    }
    if (T === 'select') {
      const it = selItem();
      h += '<h4>Selection</h4>' + (it ? (st.sel.t === 'obj' ? `<p><b>${esc(ASSETS[it.a]?.label || it.a)}</b></p>
        <label>Turn <span class="val">${Math.round(((it.r || 0) * 180 / Math.PI) % 360 + 360) % 360}°</span></label><input type="range" id="en-srot" min="0" max="355" step="5" value="${Math.round(((it.r || 0) * 180 / Math.PI) % 360 + 360) % 360}">
        <label>Size <span class="val">${Math.round((it.s || 1) * 100)}%</span></label><input type="range" id="en-sscale" min="0.3" max="3" step="0.05" value="${it.s || 1}">
        <div class="row" style="gap:6px;margin-top:6px"><button class="small" id="en-dup">⧉ Duplicate</button><button class="small" id="en-reseed" title="Same thing, drawn a little differently">🎲 Vary</button><button class="small danger" id="en-del">🗑️ Remove</button></div>`
        : `<p><b>Light</b></p><label>Reach <span class="val">${it.r} sq (${it.r * 5} ft)</span></label><input type="range" id="en-slr" min="1" max="16" value="${it.r}"><label>Colour</label><input type="color" id="en-slc" value="${it.color}"><button class="small danger" id="en-del" style="margin-top:6px">🗑️ Remove</button>`)
        : '<p class="small muted">Click an object or a light on the map.</p>');
      h += '<label class="check"><input type="checkbox" id="en-snap" ' + (st.snap ? 'checked' : '') + '> Snap to half squares</label>';
    }
    if (T === 'light') h += `<h4>Lights</h4><label>Reach <span class="val">${st.light.r} sq (${st.light.r * 5} ft)</span></label><input type="range" id="en-lr" min="1" max="16" value="${st.light.r}">
      <label>Colour</label><div class="row" style="gap:4px;flex-wrap:wrap">${['#ffb347', '#ffd890', '#ff6a3a', '#6ac0e8', '#8aff9a', '#c88aff', '#ffffff'].map(c => `<button class="enc-dot ${st.light.color === c ? 'on' : ''}" data-lc="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="en-lc" value="${st.light.color}" style="width:34px;padding:0"></div>
      <p class="small muted">Lights matter most once you turn up the darkness below.</p>`;
    if (T === 'erase') h += '<h4>Eraser</h4><p class="small muted">Removes whatever you click: a light first, then the object on top, then a wall, then a shaped floor. To change the ground, paint over it.</p>';
    // layers, atmosphere, map settings
    h += `<h4>Layers</h4><div class="enc-layers">${[['terrain', '🟫 Ground'], ['walls', '🧱 Walls'], ['objects', '🌳 Objects'], ['lights', '💡 Lights'], ['grid', '▦ Grid']].map(([k, l]) => `<label class="check"><input type="checkbox" data-layer="${k}" ${st.layers[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <h4>Atmosphere</h4>
      <label>Darkness <span class="val">${Math.round((m.dark || 0) * 100)}%</span></label><input type="range" id="en-dark" min="0" max="1" step="0.05" value="${m.dark || 0}">
      <label>Colour mood</label><select id="en-mood">${Object.entries(MOODS).map(([k, v]) => `<option value="${k}" ${m.mood === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <label>Fog <span class="val">${Math.round((m.fog || 0) * 100)}%</span></label><input type="range" id="en-fog" min="0" max="1" step="0.05" value="${m.fog || 0}">
      <h4>Map</h4><p class="small muted">${m.cols} × ${m.rows} squares (${m.cols * 5} × ${m.rows * 5} ft) · ${m.objs.length} objects · ${m.walls.length} walls · ${lightsOf(m).length} lights</p>
      <div class="row" style="gap:6px"><button class="small" id="en-resize">↔ Resize…</button><button class="small" id="en-fit">⤢ Fit to screen</button></div>`;
    S.innerHTML = h;
  }
  $('#en-side').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.shape) { st.shape = b.dataset.shape; side(); overlay(); }
    else if (b.dataset.kind) { st.kind = b.dataset.kind; side(); }
    else if (b.dataset.wall) { st.wall = b.dataset.wall; side(); }
    else if (b.dataset.cat) { st.cat = b.dataset.cat; side(); }
    else if (b.dataset.stamp) { st.asset = b.dataset.stamp; side(); }
    else if (b.dataset.lc) { st.light.color = b.dataset.lc; side(); }
    else if (b.id === 'en-dup') duplicate();
    else if (b.id === 'en-del') delSel();
    else if (b.id === 'en-reseed') { const it = selItem(); if (it) { push(); it.seed = Math.floor(Math.random() * 1e6); rebuild(); } }
    else if (b.id === 'en-fit') { fit(); draw(); }
    else if (b.id === 'en-resize') resizeDialog();
  });
  $('#en-side').addEventListener('input', e => {
    const t = e.target, v = +t.value, it = selItem();
    if (t.id === 'en-size') { st.size = v; t.previousElementSibling.querySelector('.val').textContent = `${v} sq (${v * 5} ft)`; }
    if (t.id === 'en-rot') { st.rot = v * Math.PI / 180; t.previousElementSibling.querySelector('.val').textContent = v + '°'; }
    if (t.id === 'en-scale') { st.scale = v; t.previousElementSibling.querySelector('.val').textContent = Math.round(v * 100) + '%'; }
    if (t.id === 'en-rr') st.randRot = t.checked;
    if (t.id === 'en-rs') st.randScale = t.checked;
    if (t.id === 'en-snap') st.snap = t.checked;
    if (t.id === 'en-lr') { st.light.r = v; t.previousElementSibling.querySelector('.val').textContent = `${v} sq (${v * 5} ft)`; }
    if (t.id === 'en-lc') st.light.color = t.value;
    if (it && t.id === 'en-srot') { it.r = v * Math.PI / 180; t.previousElementSibling.querySelector('.val').textContent = v + '°'; rebuild(false); }
    if (it && t.id === 'en-sscale') { it.s = v; t.previousElementSibling.querySelector('.val').textContent = Math.round(v * 100) + '%'; rebuild(false); }
    if (it && t.id === 'en-slr') { it.r = v; t.previousElementSibling.querySelector('.val').textContent = `${v} sq (${v * 5} ft)`; rebuild(false); }
    if (it && t.id === 'en-slc') { it.color = t.value; rebuild(false); }
    if (t.dataset.layer) { st.layers[t.dataset.layer] = t.checked; if (t.dataset.layer === 'grid') draw(); else rebuild(); }
    if (t.id === 'en-dark') { m.dark = v; t.previousElementSibling.querySelector('.val').textContent = Math.round(v * 100) + '%'; rebuild(false); }
    if (t.id === 'en-fog') { m.fog = v; t.previousElementSibling.querySelector('.val').textContent = Math.round(v * 100) + '%'; rebuild(false); }
    if (t.id === 'en-mood') { push(); m.mood = t.value; rebuild(); }
    overlay();
  });
  // a history step before a slider starts moving
  $('#en-side').addEventListener('pointerdown', e => { if (e.target.matches('input[type=range]') && ['en-dark', 'en-fog', 'en-srot', 'en-sscale', 'en-slr'].includes(e.target.id)) push(); });

  function resizeDialog() {
    promptDialog('New size in squares (across × down), each 5 ft', `${m.cols} x ${m.rows}`).then(v => {
      const mm = String(v || '').match(/(\d+)\D+(\d+)/); if (!mm) return;
      const nc = Math.max(6, Math.min(80, +mm[1])), nr = Math.max(6, Math.min(80, +mm[2]));
      push(); const g = new Array(nc * nr); for (let y = 0; y < nr; y++) for (let x = 0; x < nc; x++) g[x + y * nc] = m.ground[Math.min(x, m.cols - 1) + Math.min(y, m.rows - 1) * m.cols];
      m.ground = g; m.cols = nc; m.rows = nr; m.objs = m.objs.filter(o => o.x < nc && o.y < nr); dirtyT = true; fit(); rebuild(); side();
    });
  }

  // ---------- top bar ----------
  main.querySelector('#en-tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('#en-undo').onclick = undo; $('#en-redo').onclick = redo;
  $('#en-name').oninput = e => { m.name = e.target.value; persistDraft(); };
  $('#en-preset').onchange = async e => {
    const v = e.target.value; e.target.value = ''; if (!v) return;
    if (!(await confirmDialog('Replace what’s on the canvas? (You can undo this.)', 'Replace'))) return;
    push();
    if (v === 'blank') { const kind = 'grass'; m = blankMap(30, 22, kind); m.name = 'New encounter map'; }
    else m = presetMap(v);
    normMap(m); mapId = null; $('#en-name').value = m.name; dirtyT = true; fit(); rebuild(); side();
  };
  async function saveMap() {
    status('Saving…');
    const out = renderMap(m, { terrainCache: tcache });
    const img = await A.storeImage(out.canvas, { quality: 0.9 });
    const w = W(); let mm = mapId && w.maps.find(x => x.id === mapId);
    const data = JSON.parse(JSON.stringify(m));
    if (mm) Object.assign(mm, { name: m.name || mm.name, image: img.ref, w: img.w, h: img.h, scale: { pxPerUnit: CELL / 5, unit: 'feet' }, gen: { kind: 'encounter', data } });
    else { mm = { id: uid(), name: m.name || 'Encounter map', image: img.ref, w: img.w, h: img.h, parentId: '', scale: { pxPerUnit: CELL / 5, unit: 'feet' }, pins: [], gen: { kind: 'encounter', data } }; w.maps.push(mm); mapId = mm.id; }
    save(); persistDraft(); status('Saved'); toast(`Saved “${mm.name}” to Maps`);
    return mm;
  }
  $('#en-save').onclick = () => saveMap();
  $('#en-fight').onclick = async () => {
    const mm = await saveMap(), w = W();
    w.combat = w.combat || {}; const B = w.combat.battle = w.combat.battle || { tokens: {}, showGrid: true, rule: 'circle' };
    B.src = 'map:' + mm.id; B.cellSet = false; B.tokens = {}; save(); location.hash = '#/battle';
  };
  $('#en-png').onclick = () => { const out = renderMap(m, { terrainCache: tcache }); out.canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (m.name || 'encounter').replace(/[^\w-]+/g, '_') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png'); };

  const ro = new ResizeObserver(() => resize()); ro.observe(stage);
  resize(); fit(); setTool('paint'); rebuild();
  return () => { ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); clearTimeout(rebuildT); };
}

function normMap(m) { m.floors = m.floors || []; m.walls = m.walls || []; m.objs = m.objs || []; m.lights = m.lights || []; m.mood = m.mood || 'none'; m.fog = m.fog || 0; m.dark = m.dark || 0; m.seed = m.seed || 1; }
