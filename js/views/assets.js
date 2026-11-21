// Asset Forge: make your own assets. Right now that means map icons, drawn from simple shapes in the same
// 100×100 box as the built-in ones; fills are colour roles, so each icon repaints itself for every map style.
// Assets live in world.assets = [{ id, kind, name, group, shapes, trace, updated }] so more kinds can join later.
import { W, uid, save } from '../store.js';
import { esc, go, toast, confirmDialog, pickFile, query } from '../util.js';
import * as A from '../assets.js';
import { drawIcon, iconThumb, registerCustomIcons, ROLES, roleColor } from '../gen/icons.js';
import { SHAPES, makeShape, shapeSVG } from '../gen/shapePresets.js';

const KINDS = { icon: { label: 'Map icons', one: 'map icon', emoji: '🐉', note: 'Stickers for the map generator — they show up under their group in the Map icons palette.' } };
const TOOLS = [['select', '✋', 'Select & move'], ['pen', '✏️', 'Freehand'], ['poly', '⬠', 'Shape (click points)'], ['line', '╱', 'Line (click points)'], ['rect', '▭', 'Box'], ['ell', '◯', 'Oval']];
const PREVIEWS = [['parchment', 'Parchment'], ['storybook', 'Storybook'], ['night', 'Night'], ['quill', 'Ink & Quill']];
const ed = { tool: 'pen', fill: 'stone', stroke: true, lw: 1, snap: true, look: '', bg: 'parchment', traceOpacity: 0.35, gallery: false };
const G = 5; // snap grid: every 5 units (half of a grid square)

export function render(main) {
  const w = W();
  w.assets = w.assets || [];
  registerCustomIcons(w.assets);
  const id = query().id;
  let cur = w.assets.find(a => a.id === id) || null;
  let sel = -1, draft = null, undo = [], redo = [], traceImg = null;

  main.innerHTML = `
    <div class="page-head"><h1>Asset Forge</h1><span class="muted small">Make your own assets for your maps.</span><span style="flex:1"></span>
      <button class="primary" id="af-new">＋ New map icon</button></div>
    <div class="af-shell">
      <div class="card side-box af-list" id="list"></div>
      <div class="af-main" id="mainpane"></div>
      <div class="card side-box af-side" id="side"></div>
    </div>`;
  const listEl = main.querySelector('#list'), pane = main.querySelector('#mainpane'), side = main.querySelector('#side');

  const touch = () => { cur.updated = Date.now(); registerCustomIcons(w.assets); save(); };
  const snap = () => JSON.stringify(cur.shapes);
  const pushUndo = () => { undo.push(snap()); if (undo.length > 60) undo.shift(); redo = []; };

  function drawList() {
    const byKind = Object.entries(KINDS).map(([k, info]) => {
      const list = w.assets.filter(a => a.kind === k).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
      return `<div class="tg-label">${info.emoji} ${info.label} (${list.length})</div>
        ${list.length ? `<div class="af-grid">${list.map(a => `<button class="af-item ${a === cur ? 'on' : ''}" data-open="${a.id}" title="${esc(a.name)}${a.group ? ' · ' + esc(a.group) : ''}"><img src="${iconThumb('c:' + a.id, 'parchment', 44, ed.look)}" alt=""><span>${esc(a.name)}</span></button>`).join('')}</div>`
          : `<p class="small muted">${info.note}</p>`}`;
    }).join('');
    listEl.innerHTML = `${byKind}<p class="small muted af-future">More kinds of custom assets will live here too.</p>`;
  }
  listEl.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) go(`#/assets?id=${b.dataset.open}`); });

  function newIcon() {
    const a = { id: uid(), kind: 'icon', name: 'New icon', group: 'Custom', shapes: [], created: Date.now(), updated: Date.now() };
    w.assets.push(a); registerCustomIcons(w.assets); save();
    go(`#/assets?id=${a.id}`);
  }
  main.querySelector('#af-new').onclick = newIcon;

  if (!cur) {
    pane.innerHTML = `<div class="af-empty"><div class="big">🛠️</div><h2>Make your own map icons</h2>
      <p class="muted">Draw with simple shapes: freehand, boxes, ovals and click-point shapes. Fill them with colour <i>roles</i> like Stone, Roof or Leaf
      and they’ll repaint themselves to match every map style, just like the built-in icons. You can trace over a picture as a guide.</p>
      <button class="primary" id="af-new2">＋ Make a map icon</button></div>`;
    pane.querySelector('#af-new2').onclick = newIcon;
    side.innerHTML = `<h4>How custom icons are used</h4><p class="small muted">Open the <a href="#/generate">Map generator</a>, start editing, choose <b>🐉 Map icons</b> — your icons sit at the top under their group name.</p>`;
    drawList();
    return;
  }

  // ---------- the editor ----------
  pane.innerHTML = `
    <div class="af-head">
      <input id="af-name" value="${esc(cur.name)}" placeholder="Icon name" class="af-name">
      <input id="af-group" value="${esc(cur.group || '')}" placeholder="Group (e.g. My ruins)" list="af-groups" class="af-group">
      <datalist id="af-groups">${[...new Set(w.assets.map(a => a.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    </div>
    <div class="af-tools">${TOOLS.map(([k, i, l]) => `<button class="tool ${ed.tool === k ? 'on' : ''}" data-tool="${k}" title="${l}"><span>${i}</span>${l.split(' (')[0]}</button>`).join('')}
      <button class="tool ${ed.gallery ? 'on' : ''}" id="af-gal-btn" title="Ready-made shapes: drag one onto the box, or click to drop it in the middle"><span>🔷</span>Shapes ▾</button></div>
    <div class="af-gallery" id="af-gallery" ${ed.gallery ? '' : 'hidden'}>${SHAPES.map((d, i) => `<button class="af-shape" draggable="true" data-shape="${i}" title="${d.label} — drag onto the box, or click">${shapeSVG(d)}</button>`).join('')}</div>
    <div class="af-stage"><canvas id="cv"></canvas></div>
    <div class="row af-bar">
      <button id="af-undo" title="Undo (Ctrl+Z)">↶ Undo</button><button id="af-redo" title="Redo (Ctrl+Y)">↷ Redo</button>
      <label class="check" style="margin:0" title="Corners, points, moves and resizes lock onto the grid (every half square). Freehand is never snapped. Hold Alt to ignore the grid for a moment."><input type="checkbox" id="af-snap" ${ed.snap ? 'checked' : ''}> Snap to grid</label>
      <span style="flex:1"></span>
      <label class="row shrink" style="margin:0;gap:6px">Paper <select id="af-bg">${PREVIEWS.map(([k, l]) => `<option value="${k}" ${ed.bg === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>`;
  const cv = pane.querySelector('#cv'), ctx = cv.getContext('2d');
  let Spx = 4, CW = 480;
  const PAD = 6; // units of margin around the 100×100 box
  const snapOn = ev => ed.snap && !ev.altKey;
  const sn = v => Math.round(v / G) * G;
  const toU = ev => { const r = cv.getBoundingClientRect(); let x = (ev.clientX - r.left) / Spx - 50 - PAD, y = (ev.clientY - r.top) / Spx - 50 - PAD; if (snapOn(ev)) { x = sn(x); y = sn(y); } return [+x.toFixed(1), +y.toFixed(1)]; };
  const rawU = ev => toU({ clientX: ev.clientX, clientY: ev.clientY, altKey: true });
  let hoverPt = null;
  const toPx = p => [(p[0] + 50 + PAD) * Spx, (p[1] + 50 + PAD) * Spx];

  function resize() {
    const box = pane.querySelector('.af-stage').getBoundingClientRect();
    CW = Math.max(260, Math.min(box.width, box.height) - 4);
    const dpr = devicePixelRatio || 1;
    cv.style.width = cv.style.height = CW + 'px'; cv.width = cv.height = Math.round(CW * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Spx = CW / (100 + PAD * 2);
    draw();
  }

  const PAPER = { parchment: '#efe3c8', storybook: '#9cc06a', night: '#1e1b26', quill: '#e2d0aa' };
  function bbox(sh) {
    if (sh.t === 'rect') return [Math.min(sh.x, sh.x + sh.w), Math.min(sh.y, sh.y + sh.h), Math.max(sh.x, sh.x + sh.w), Math.max(sh.y, sh.y + sh.h)];
    if (sh.t === 'ell') return [sh.cx - Math.abs(sh.rx), sh.cy - Math.abs(sh.ry), sh.cx + Math.abs(sh.rx), sh.cy + Math.abs(sh.ry)];
    const xs = sh.pts.map(p => p[0]), ys = sh.pts.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  // handle positions in canvas pixels: 4 corners (top-left, top-right, bottom-right, bottom-left), then the turn handle
  function handles() {
    const [x0, y0, x1, y1] = bbox(cur.shapes[sel]), a = toPx([x0, y0]), b = toPx([x1, y1]);
    return [[a[0] - 4, a[1] - 4], [b[0] + 4, a[1] - 4], [b[0] + 4, b[1] + 4], [a[0] - 4, b[1] + 4], [(a[0] + b[0]) / 2, a[1] - 26]];
  }
  function handleAt(ev) {
    if (sel < 0 || !cur.shapes[sel] || ed.tool !== 'select') return -1;
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    return handles().findIndex(([hx, hy]) => Math.hypot(hx - x, hy - y) < 9);
  }
  // boxes and ovals become point shapes when they're turned, since they can only sit square
  function toPoints(sh) {
    if (sh.t === 'rect') return { ...sh, t: 'poly', pts: [[sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x + sh.w, sh.y + sh.h], [sh.x, sh.y + sh.h]], x: undefined, y: undefined, w: undefined, h: undefined };
    if (sh.t === 'ell') return { ...sh, t: 'path', closed: true, pts: Array.from({ length: 40 }, (_, i) => { const a = i / 40 * Math.PI * 2; return [sh.cx + Math.cos(a) * Math.abs(sh.rx), sh.cy + Math.sin(a) * Math.abs(sh.ry)]; }), cx: undefined, cy: undefined, rx: undefined, ry: undefined };
    return sh;
  }
  const R1 = v => +v.toFixed(1);
  function resized(o, bb, nb) {
    const sx = (nb[2] - nb[0]) / ((bb[2] - bb[0]) || 1), sy = (nb[3] - nb[1]) / ((bb[3] - bb[1]) || 1);
    const fx = x => R1(nb[0] + (x - bb[0]) * sx), fy = y => R1(nb[1] + (y - bb[1]) * sy);
    if (o.t === 'rect') return { ...o, x: fx(o.x), y: fy(o.y), w: R1(o.w * sx), h: R1(o.h * sy) };
    if (o.t === 'ell') return { ...o, cx: fx(o.cx), cy: fy(o.cy), rx: R1(o.rx * sx), ry: R1(o.ry * sy) };
    return { ...o, pts: o.pts.map(([x, y]) => [fx(x), fy(y)]) };
  }
  function turned(o, c, ang) {
    const p = toPoints(o), cs = Math.cos(ang), sn2 = Math.sin(ang);
    return { ...p, pts: p.pts.map(([x, y]) => [R1(c[0] + (x - c[0]) * cs - (y - c[1]) * sn2), R1(c[1] + (x - c[0]) * sn2 + (y - c[1]) * cs)]) };
  }
  const clean = sh => { for (const k of Object.keys(sh)) if (sh[k] === undefined) delete sh[k]; return sh; };

  function draw() {
    ctx.clearRect(0, 0, CW, CW);
    ctx.fillStyle = PAPER[ed.bg]; ctx.fillRect(0, 0, CW, CW);
    // trace picture
    if (traceImg && cur.trace) { ctx.globalAlpha = ed.traceOpacity; const s = 100 * Spx, r = Math.min(s / traceImg.width, s / traceImg.height); ctx.drawImage(traceImg, PAD * Spx + (s - traceImg.width * r) / 2, PAD * Spx + (s - traceImg.height * r) / 2, traceImg.width * r, traceImg.height * r); ctx.globalAlpha = 1; }
    // grid, the icon box and its ground line
    const dark = ed.bg === 'night';
    ctx.lineWidth = 1;
    for (let u = -50; u <= 50; u += ed.snap ? G : 10) {
      const [x] = toPx([u, 0]), [, y] = toPx([0, u]), major = u % 10 === 0;
      ctx.strokeStyle = dark ? `rgba(255,255,255,${major ? 0.09 : 0.035})` : `rgba(0,0,0,${major ? 0.09 : 0.035})`;
      ctx.beginPath(); ctx.moveTo(x, toPx([0, -50])[1]); ctx.lineTo(x, toPx([0, 50])[1]); ctx.moveTo(toPx([-50, 0])[0], y); ctx.lineTo(toPx([50, 0])[0], y); ctx.stroke();
    }
    const [bx, by] = toPx([-50, -50]);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.25)'; ctx.setLineDash([4, 4]); ctx.strokeRect(bx, by, 100 * Spx, 100 * Spx);
    const [gx0, gy] = toPx([-50, 38]); ctx.strokeStyle = 'rgba(212,162,76,.7)'; ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx0 + 100 * Spx, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = 'rgba(212,162,76,.9)'; ctx.fillText('ground', gx0 + 4, gy - 4);
    // the icon, drawn exactly as maps will draw it
    drawIcon(ctx, 'c:' + cur.id, toPx([0, 0])[0], toPx([0, 0])[1], 100 * Spx, ed.bg, { halo: false, look: ed.look });
    // the shape being drawn
    if (draft) {
      ctx.save(); ctx.strokeStyle = '#d4a24c'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      if (draft.t === 'rect') { const [x, y] = toPx([draft.x, draft.y]); ctx.rect(x, y, draft.w * Spx, draft.h * Spx); }
      else if (draft.t === 'ell') { const [x, y] = toPx([draft.cx, draft.cy]); ctx.ellipse(x, y, Math.abs(draft.rx) * Spx, Math.abs(draft.ry) * Spx, 0, 0, Math.PI * 2); }
      else { const pts = draft.hover ? [...draft.pts, draft.hover] : draft.pts; pts.forEach((p, i) => { const q = toPx(p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); if (draft.t === 'poly' && pts.length > 2) ctx.closePath(); }
      ctx.stroke(); ctx.setLineDash([]);
      if (draft.t === 'poly' || draft.t === 'line') for (const [i, p] of draft.pts.entries()) { const [x, y] = toPx(p); ctx.beginPath(); ctx.arc(x, y, i ? 4 : 6, 0, Math.PI * 2); ctx.fillStyle = i ? '#fff' : '#d4a24c'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
    }
    // selection box, with handles to resize (corners) and turn (the round one on top)
    if (sel >= 0 && cur.shapes[sel]) {
      const [x0, y0, x1, y1] = bbox(cur.shapes[sel]), a = toPx([x0, y0]), b = toPx([x1, y1]);
      ctx.strokeStyle = '#4ea4ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(a[0] - 4, a[1] - 4, b[0] - a[0] + 8, b[1] - a[1] + 8); ctx.setLineDash([]);
      if (ed.tool === 'select') {
        const hs = handles();
        ctx.beginPath(); ctx.moveTo(hs[4][0], hs[4][1]); ctx.lineTo(hs[4][0], a[1] - 4); ctx.stroke();
        hs.forEach(([x, y], i) => { ctx.beginPath(); if (i === 4) ctx.arc(x, y, 6, 0, Math.PI * 2); else ctx.rect(x - 5, y - 5, 10, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#4ea4ff'; ctx.lineWidth = 2; ctx.stroke(); });
      }
    }
    // where the next point will land when snapping
    if (hoverPt && ed.snap && ['poly', 'line', 'rect', 'ell'].includes(ed.tool)) {
      const [x, y] = toPx(hoverPt); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(212,162,76,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // ---------- side panel: colours, outline, layers, previews ----------
  function drawSide() {
    const s = sel >= 0 ? cur.shapes[sel] : null, fill = s ? (s.fill || '') : ed.fill, stroke = s ? s.stroke !== false : ed.stroke, lw = s ? (s.lw || 1) : ed.lw;
    side.innerHTML = `
      <h4>${s ? 'Selected shape' : 'New shapes'}</h4>
      <label>Fill</label>
      <div class="af-roles">${ROLES.map(([k, l]) => `<button class="swatch-dot ${fill === k ? 'on' : ''}" data-fill="${k}" title="${l} (changes with the map style)" style="background:${roleColor(k)}"></button>`).join('')}
        <button class="swatch-dot af-none ${!fill ? 'on' : ''}" data-fill="" title="No fill">⌀</button>
        <input type="color" id="af-hex" value="${fill?.[0] === '#' ? fill : '#b06a3a'}" title="An exact colour (stays the same in every style)"></div>
      <p class="small muted" style="margin:4px 0 0">${fill?.[0] === '#' ? 'Exact colour — the same in every style.' : fill ? `<b>${ROLES.find(r => r[0] === fill)?.[1] || fill}</b> — repaints to suit each map style.` : 'No fill — just an outline.'}</p>
      <label class="check"><input type="checkbox" id="af-stroke" ${stroke ? 'checked' : ''}> Ink outline</label>
      <label>Line weight <span class="val">${lw.toFixed(1)}×</span></label><input type="range" id="af-lw" min="0.4" max="3" step="0.1" value="${lw}">
      ${s ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><button class="small" id="af-up">▲ Forward</button><button class="small" id="af-down">▼ Back</button><button class="small" id="af-dup">⧉ Copy</button><button class="small danger" id="af-del">Delete</button></div>` : ''}
      <label>Shapes (${cur.shapes.length})</label>
      <div class="af-layers">${cur.shapes.map((sh, i) => ({ sh, i })).reverse().map(({ sh, i }) => `<button class="af-layer ${i === sel ? 'on' : ''}" data-sel="${i}"><span class="rk-dot" style="background:${sh.fill ? roleColor(sh.fill) : 'transparent'};border:1px solid #888"></span>${esc(sh.name || ({ rect: 'Box', ell: 'Oval', poly: 'Shape', path: sh.closed ? 'Freehand shape' : 'Freehand line', line: 'Line' })[sh.t])}</button>`).join('') || '<p class="small muted">Nothing drawn yet — pick a tool and draw in the box.</p>'}</div>
      <label>Preview</label>
      <div class="af-previews">${PREVIEWS.map(([k, l]) => `<div><img src="${previewURL(k)}" alt=""><span>${l}</span></div>`).join('')}<div><img src="${previewURL('parchment', 'marker')}" alt=""><span>Marker</span></div></div>
      <label>Trace over a picture</label>
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="small" id="af-trace">${cur.trace ? 'Replace picture' : '⬆ Add a picture'}</button>${cur.trace ? '<button class="small" id="af-notrace">Remove</button>' : ''}</div>
      ${cur.trace ? `<label>Picture strength</label><input type="range" id="af-tr" min="0.05" max="0.9" step="0.05" value="${ed.traceOpacity}">` : ''}
      <p class="small muted">The picture is only a guide in this editor; it never appears on maps.</p>
      <div class="row" style="margin-top:14px;gap:6px"><a class="btn small" href="#/generate">Use it in the Map generator ↗</a><button class="small danger" id="af-delicon">Delete icon</button></div>`;
  }
  function previewURL(style, look = '') {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); x.fillStyle = PAPER[style]; x.fillRect(0, 0, 96, 96);
    drawIcon(x, 'c:' + cur.id, 48, 50, 84, style, { look });
    return c.toDataURL();
  }
  side.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = sel >= 0 ? cur.shapes[sel] : null;
    if (b.dataset.fill != null) { if (s) { pushUndo(); s.fill = b.dataset.fill; touch(); } else ed.fill = b.dataset.fill; refresh(); }
    else if (b.dataset.sel != null) { sel = +b.dataset.sel; ed.tool = 'select'; syncTools(); refresh(); }
    else if (b.id === 'af-up' && sel < cur.shapes.length - 1) { pushUndo(); cur.shapes.splice(sel + 1, 0, cur.shapes.splice(sel, 1)[0]); sel++; touch(); refresh(); }
    else if (b.id === 'af-down' && sel > 0) { pushUndo(); cur.shapes.splice(sel - 1, 0, cur.shapes.splice(sel, 1)[0]); sel--; touch(); refresh(); }
    else if (b.id === 'af-dup' && s) { pushUndo(); const c2 = JSON.parse(JSON.stringify(s)); moveShape(c2, 5, 5); cur.shapes.push(c2); sel = cur.shapes.length - 1; touch(); refresh(); }
    else if (b.id === 'af-del' && s) { pushUndo(); cur.shapes.splice(sel, 1); sel = -1; touch(); refresh(); }
    else if (b.id === 'af-trace') { const f = await pickFile('image/*'); if (!f) return; cur.trace = (await A.storeImage(f, { maxDim: 800 })).ref; save(); await loadTrace(); refresh(); }
    else if (b.id === 'af-notrace') { cur.trace = ''; traceImg = null; save(); refresh(); }
    else if (b.id === 'af-delicon') {
      if (!(await confirmDialog(`Delete “${cur.name}”? Maps that already use it will no longer show it.`))) return;
      w.assets = w.assets.filter(a => a !== cur); registerCustomIcons(w.assets); save(); go('#/assets');
    }
  });
  side.addEventListener('input', e => {
    const t = e.target, s = sel >= 0 ? cur.shapes[sel] : null;
    if (t.id === 'af-hex') { if (s) { s.fill = t.value; touch(); draw(); } else ed.fill = t.value; }
    if (t.id === 'af-stroke') { if (s) { pushUndo(); s.stroke = t.checked; touch(); draw(); } else ed.stroke = t.checked; }
    if (t.id === 'af-lw') { const v = +t.value; t.previousElementSibling.querySelector('.val').textContent = v.toFixed(1) + '×'; if (s) { s.lw = v; touch(); draw(); } else ed.lw = v; }
    if (t.id === 'af-tr') { ed.traceOpacity = +t.value; draw(); }
  });
  side.addEventListener('change', e => { if (['af-hex', 'af-lw'].includes(e.target.id)) refresh(); });

  function refresh() { draw(); drawSide(); drawList(); }
  function syncTools() { pane.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === ed.tool)); draw(); }
  async function loadTrace() {
    traceImg = null; if (!cur.trace) return;
    const u = await A.url(cur.trace); if (!u) return;
    await new Promise(r => { const im = new Image(); im.onload = () => { traceImg = im; r(); }; im.onerror = r; im.src = u; });
  }

  // ---------- drawing on the canvas ----------
  const newShapeStyle = () => ({ fill: ed.fill, stroke: ed.stroke, lw: ed.lw });
  function moveShape(sh, dx, dy) {
    if (sh.t === 'rect') { sh.x += dx; sh.y += dy; }
    else if (sh.t === 'ell') { sh.cx += dx; sh.cy += dy; }
    else sh.pts = sh.pts.map(p => [+(p[0] + dx).toFixed(1), +(p[1] + dy).toFixed(1)]);
  }
  const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const segD = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };
  function hit(p) {
    for (let i = cur.shapes.length - 1; i >= 0; i--) {
      const sh = cur.shapes[i];
      if (sh.t === 'rect' || sh.t === 'ell') { const [x0, y0, x1, y1] = bbox(sh); if (sh.t === 'rect' ? p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 : ((p[0] - sh.cx) / (Math.abs(sh.rx) || 1)) ** 2 + ((p[1] - sh.cy) / (Math.abs(sh.ry) || 1)) ** 2 <= 1) return i; }
      else if ((sh.t === 'poly' || sh.closed) && inPoly(p, sh.pts)) return i;
      else if (sh.pts.some((q, j) => j && segD(p, sh.pts[j - 1], q) < 3)) return i;
    }
    return -1;
  }
  function commitShape(sh) { pushUndo(); cur.shapes.push(sh); sel = -1; touch(); refresh(); }
  function finishPoints() {
    if (!draft || (draft.t !== 'poly' && draft.t !== 'line')) return;
    const d = draft; draft = null;
    if (d.pts.length >= (d.t === 'poly' ? 3 : 2)) commitShape({ t: d.t, pts: d.pts, ...newShapeStyle() });
    else draw();
  }
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    const p = toU(e);
    cv.setPointerCapture(e.pointerId);
    if (ed.tool === 'select') {
      const h = handleAt(e);
      if (h >= 0) {
        const o = JSON.parse(JSON.stringify(cur.shapes[sel])), bb = bbox(o);
        pushUndo(); drag = { kind: h === 4 ? 'turn' : 'size', h, o, bb, c: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], start: rawU(e), moved: false };
        return;
      }
      sel = hit(rawU(e));
      if (sel >= 0) { pushUndo(); const o = JSON.parse(JSON.stringify(cur.shapes[sel])); drag = { kind: 'move', o, bb: bbox(o), start: rawU(e), moved: false }; }
      refresh(); return;
    }
    if (ed.tool === 'poly' || ed.tool === 'line') {
      if (!draft) draft = { t: ed.tool, pts: [] };
      if (draft.t === 'poly' && draft.pts.length > 2 && Math.hypot(p[0] - draft.pts[0][0], p[1] - draft.pts[0][1]) < 4) { finishPoints(); return; }
      const l = draft.pts[draft.pts.length - 1];
      if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.5) draft.pts.push(p);
      draw(); return;
    }
    if (ed.tool === 'pen') { draft = { t: 'path', pts: [toU({ ...e, altKey: true, clientX: e.clientX, clientY: e.clientY })] }; drag = { kind: 'pen' }; return; }
    if (ed.tool === 'rect') { draft = { t: 'rect', x: p[0], y: p[1], w: 0, h: 0, o: p }; drag = { kind: 'box' }; return; }
    if (ed.tool === 'ell') { draft = { t: 'ell', cx: p[0], cy: p[1], rx: 0, ry: 0, o: p }; drag = { kind: 'box' }; return; }
  });
  cv.addEventListener('pointermove', e => {
    const p = toU(e);
    if (!drag) {
      hoverPt = p;
      if (draft && (draft.t === 'poly' || draft.t === 'line')) draft.hover = p;
      if (ed.tool === 'select') { const h = handleAt(e); cv.style.cursor = h === 4 ? 'grab' : h === 0 || h === 2 ? 'nwse-resize' : h === 1 || h === 3 ? 'nesw-resize' : hit(rawU(e)) >= 0 ? 'move' : 'default'; }
      else cv.style.cursor = 'crosshair';
      draw(); return;
    }
    if (drag.kind === 'move') {
      // the shape's top-left corner lands on the grid when snapping
      const q = rawU(e); let dx = q[0] - drag.start[0], dy = q[1] - drag.start[1];
      if (snapOn(e)) { dx = sn(drag.bb[0] + dx) - drag.bb[0]; dy = sn(drag.bb[1] + dy) - drag.bb[1]; }
      const o = JSON.parse(JSON.stringify(drag.o)); moveShape(o, dx, dy); cur.shapes[sel] = o; drag.moved = true; draw(); return;
    }
    if (drag.kind === 'size') {
      // drag a corner; the opposite corner stays put. Shift keeps the proportions.
      const bb = drag.bb, fixed = [[bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]], [bb[2], bb[1]]][drag.h];
      let q = p;
      if (e.shiftKey) { const w0 = bb[2] - bb[0] || 1, h0 = bb[3] - bb[1] || 1, k = Math.max(Math.abs(q[0] - fixed[0]) / w0, Math.abs(q[1] - fixed[1]) / h0); q = [fixed[0] + Math.sign(q[0] - fixed[0] || 1) * w0 * k, fixed[1] + Math.sign(q[1] - fixed[1] || 1) * h0 * k]; }
      if (Math.abs(q[0] - fixed[0]) < 1 || Math.abs(q[1] - fixed[1]) < 1) return;
      const nb = [Math.min(q[0], fixed[0]), Math.min(q[1], fixed[1]), Math.max(q[0], fixed[0]), Math.max(q[1], fixed[1])];
      cur.shapes[sel] = resized(drag.o, bb, nb); drag.moved = true; draw(); return;
    }
    if (drag.kind === 'turn') {
      const q = rawU(e), c = drag.c;
      let ang = Math.atan2(q[1] - c[1], q[0] - c[0]) - Math.atan2(drag.start[1] - c[1], drag.start[0] - c[0]);
      if (e.shiftKey || snapOn(e)) ang = Math.round(ang / (Math.PI / 12)) * Math.PI / 12; // 15° steps
      cur.shapes[sel] = ang ? clean(turned(drag.o, c, ang)) : JSON.parse(JSON.stringify(drag.o)); drag.moved = true; draw(); return;
    }
    if (drag.kind === 'pen') { const q = toU({ clientX: e.clientX, clientY: e.clientY, altKey: true }), l = draft.pts[draft.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 1.2) { draft.pts.push(q); draw(); } return; }
    if (drag.kind === 'box') {
      const o = draft.o;
      if (draft.t === 'rect') { draft.x = Math.min(o[0], p[0]); draft.y = Math.min(o[1], p[1]); draft.w = Math.abs(p[0] - o[0]); draft.h = Math.abs(p[1] - o[1]); }
      else { draft.cx = (o[0] + p[0]) / 2; draft.cy = (o[1] + p[1]) / 2; draft.rx = Math.abs(p[0] - o[0]) / 2; draft.ry = Math.abs(p[1] - o[1]) / 2; }
      draw();
    }
  });
  cv.addEventListener('pointerup', () => {
    const d = drag; drag = null; if (!d) return;
    if (d.kind === 'move' || d.kind === 'size' || d.kind === 'turn') { if (d.moved) touch(); else undo.pop(); refresh(); return; }
    if (d.kind === 'pen') {
      const dr = draft; draft = null;
      if (dr.pts.length < 3) { draw(); return; }
      // a stroke that ends near where it started becomes a filled shape
      const a = dr.pts[0], z = dr.pts[dr.pts.length - 1], closed = Math.hypot(a[0] - z[0], a[1] - z[1]) < 7;
      const pts = dr.pts.filter((_, i) => i % 2 === 0 || i === dr.pts.length - 1);
      commitShape({ t: 'path', pts, closed, ...newShapeStyle() });
      return;
    }
    if (d.kind === 'box') {
      const dr = draft; draft = null; delete dr.o;
      if ((dr.t === 'rect' ? Math.min(dr.w, dr.h) : Math.min(dr.rx, dr.ry)) < 1) { draw(); return; }
      commitShape({ ...dr, ...newShapeStyle() });
    }
  });
  cv.addEventListener('dblclick', () => finishPoints());
  cv.addEventListener('pointerleave', () => { hoverPt = null; if (!drag) draw(); });
  // ---------- ready-made shapes: drag from the gallery, or click to drop in the middle ----------
  function placeShape(i, at) {
    const def = SHAPES[i]; if (!def) return;
    let [x, y] = at || [0, 0];
    if (ed.snap) { x = sn(x); y = sn(y); }
    const sh = { ...makeShape(def, x, y, 40), ...newShapeStyle() };
    if (def.t === 'line' && !sh.fill) sh.stroke = true;
    pushUndo(); cur.shapes.push(sh); sel = cur.shapes.length - 1; ed.tool = 'select'; syncTools(); touch(); refresh();
  }
  const gal = pane.querySelector('#af-gallery');
  pane.querySelector('#af-gal-btn').onclick = () => { ed.gallery = !ed.gallery; gal.hidden = !ed.gallery; pane.querySelector('#af-gal-btn').classList.toggle('on', ed.gallery); resize(); };
  gal.addEventListener('click', e => { const b = e.target.closest('[data-shape]'); if (b) placeShape(+b.dataset.shape); });
  gal.addEventListener('dragstart', e => { const b = e.target.closest('[data-shape]'); if (!b) return; e.dataTransfer.setData('text/x-lf-shape', b.dataset.shape); e.dataTransfer.effectAllowed = 'copy'; });
  cv.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-lf-shape')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; hoverPt = toU(e); draw(); } });
  cv.addEventListener('drop', e => { const i = e.dataTransfer.getData('text/x-lf-shape'); if (i === '') return; e.preventDefault(); hoverPt = null; placeShape(+i, rawU(e)); });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (draft) { draft = null; draw(); } else if (sel >= 0) { sel = -1; refresh(); } });

  pane.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { finishPoints(); draft = null; ed.tool = b.dataset.tool; if (ed.tool !== 'select') sel = -1; syncTools(); refresh(); });
  const doUndo = () => { if (!undo.length) return; redo.push(snap()); cur.shapes = JSON.parse(undo.pop()); sel = -1; touch(); refresh(); };
  const doRedo = () => { if (!redo.length) return; undo.push(snap()); cur.shapes = JSON.parse(redo.pop()); sel = -1; touch(); refresh(); };
  pane.querySelector('#af-undo').onclick = doUndo;
  pane.querySelector('#af-redo').onclick = doRedo;
  pane.querySelector('#af-snap').onchange = e => { ed.snap = e.target.checked; draw(); };
  pane.querySelector('#af-bg').onchange = e => { ed.bg = e.target.value; draw(); };
  pane.querySelector('#af-name').oninput = e => { cur.name = e.target.value || 'Untitled icon'; touch(); drawList(); };
  pane.querySelector('#af-group').oninput = e => { cur.group = e.target.value; touch(); drawList(); };
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  const onKey = e => {
    if (!document.body.contains(cv) || typing()) return;
    if (e.key === 'Enter') { finishPoints(); return; }
    if (e.key === 'Escape') { draft = null; sel = -1; refresh(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0) { e.preventDefault(); pushUndo(); cur.shapes.splice(sel, 1); sel = -1; touch(); refresh(); return; }
    if (sel >= 0 && e.key.startsWith('Arrow')) { e.preventDefault(); const st = e.shiftKey ? 5 : 1; pushUndo(); moveShape(cur.shapes[sel], e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0); touch(); refresh(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopImmediatePropagation(); doRedo(); }
  };
  window.addEventListener('keydown', onKey, true);
  const ro = new ResizeObserver(resize); ro.observe(pane.querySelector('.af-stage'));
  drawList(); drawSide(); resize();
  loadTrace().then(draw);
  return () => { window.removeEventListener('keydown', onKey, true); ro.disconnect(); };
}
