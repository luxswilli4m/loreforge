// Battle map: the fight from the combat tracker, on a map. Any map works (uploaded, generated or an isometric scene);
// every square is 5 ft. Pick up a token and its reachable squares light up from its speed and what it has used this turn;
// it can't be dropped further away (hold Shift to move it freely). A Player view window mirrors the map for the table.
import { W, save } from '../store.js';
import { esc, toast, contextMenu, query } from '../util.js';
import * as A from '../assets.js';
import { normalize, advanceTurn, speedOf, moveLeft, useEconFor, logTo, getPrefs, status } from './combat.js';
import { speedText } from './sheet.js';
import { getEntry } from '../store.js';
import { SCENES, sceneRender } from '../gen/scenes.js';

const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('loreforge-battle') : null;
const SIZES = { Tiny: 1, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };
const SIDE = { ally: '#4f8ff7', enemy: '#d9534f', neutral: '#c9a54a' };

// ---------- grid maths, for square and isometric grids ----------
function gridOf(B, img, sceneGrid) {
  if (sceneGrid) return { ...sceneGrid };
  return { type: 'square', cell: B.cell || 50, ox: B.ox || 0, oy: B.oy || 0, cols: img ? Math.ceil((img.width - (B.ox || 0)) / (B.cell || 50)) : 40, rows: img ? Math.ceil((img.height - (B.oy || 0)) / (B.cell || 50)) : 30 };
}
const zOf = (G, cx, cy) => G.type === 'iso' && G.z ? (G.z[Math.floor(cx) + Math.floor(cy) * G.cols] || 0) : 0;
// cell (may be fractional) → map pixels
function toMap(G, cx, cy) {
  if (G.type === 'iso') { const z = zOf(G, cx, cy); return [G.ox + (cx - cy) * G.tw / 2, G.oy + (cx + cy) * G.th / 2 - z]; }
  return [G.ox + cx * G.cell, G.oy + cy * G.cell];
}
// map pixels → cell (for isometric, try the height of the cell under the pointer)
function toCell(G, mx, my) {
  if (G.type !== 'iso') return [(mx - G.ox) / G.cell, (my - G.oy) / G.cell];
  let z = 0, cx = 0, cy = 0;
  for (let i = 0; i < 3; i++) { const a = (mx - G.ox) / (G.tw / 2), b = (my + z - G.oy) / (G.th / 2); cx = (a + b) / 2; cy = (b - a) / 2; z = zOf(G, cx, cy); }
  return [cx, cy];
}
// distance in feet between two cells, by the chosen rule
function feet(a, b, rule) {
  const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
  if (rule === '5e') return Math.max(dx, dy) * 5;
  if (rule === 'alt') return (Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2)) * 5;
  return Math.round(Math.hypot(dx, dy) * 5);
}

export function render(main) {
  const w = W(), c = normalize(w.combat);
  const B = c.battle = c.battle || { src: '', cell: 50, ox: 0, oy: 0, tokens: {}, showGrid: true, rule: 'circle' };
  B.tokens = B.tokens || {};
  main.innerHTML = `<div class="bm">
    <div class="bm-top">
      <select id="bm-src" title="The map to fight on"></select>
      <span class="bm-turn" id="bm-turn"></span>
      <span style="flex:1"></span>
      <button id="bm-prev" title="Previous turn">◀</button><button class="primary" id="bm-next">Next turn ▶</button>
      <a class="btn" href="#/combat">⚔️ Tracker</a>
      <button id="bm-player" title="A window for your players">🖥️ Player view</button>
    </div>
    <div class="bm-body">
      <div class="bm-stage" id="bm-stage"><canvas id="bm-cv"></canvas><div class="bm-hint" id="bm-hint"></div></div>
      <aside class="card side-box bm-side" id="bm-side"></aside>
    </div></div>`;
  const $ = s => main.querySelector(s), cv = $('#bm-cv'), ctx = cv.getContext('2d'), stage = $('#bm-stage');
  let img = null, G = gridOf(B, null), view = { x: 0, y: 0, k: 1 }, CW = 800, CH = 600, drag = null, hover = null, tool = 'move', ruler = null, sel = c.turnId;
  const tokenImgs = {};

  // ---------- the map choices ----------
  function drawSources() {
    const maps = w.maps.filter(m => m.image);
    $('#bm-src').innerHTML = `<option value="">— choose a map —</option><optgroup label="Isometric scenes">${Object.entries(SCENES).map(([k, s]) => `<option value="scene:${k}" ${B.src === 'scene:' + k ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}</optgroup>
      <optgroup label="Your maps">${maps.map(m => `<option value="map:${m.id}" ${B.src === 'map:' + m.id ? 'selected' : ''}>🗺️ ${esc(m.name)}</option>`).join('')}</optgroup><option value="blank" ${B.src === 'blank' ? 'selected' : ''}>▦ Blank grid</option>`;
  }
  async function loadSource() {
    img = null; let sceneGrid = null;
    if (B.src.startsWith('scene:')) { const r = sceneRender(B.src.slice(6)); if (r) { img = r.canvas; sceneGrid = r.grid; } }
    else if (B.src.startsWith('map:')) {
      const m = w.maps.find(x => x.id === B.src.slice(4));
      if (m) {
        const u = await A.url(m.image); img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u; });
        // a map with a scale knows how big 5 ft is
        if (!B.cellSet && m.scale?.pxPerUnit) { const per = { feet: 5, ft: 5, metres: 1.5, meters: 1.5, m: 1.5 }[m.scale.unit]; if (per) B.cell = Math.max(6, m.scale.pxPerUnit * per); }
      }
    }
    G = gridOf(B, img, sceneGrid);
    fit(); placeMissing(); draw(); drawSide(); persist();
  }
  // everyone in the fight without a spot on the map gets one near the middle (allies left, enemies right)
  function placeMissing() {
    // start from the middle of the walkable ground (not the sea), allies on one side, enemies on the other
    let sx = 0, sy = 0, n0 = 0;
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) if (!blocked([x, y])) { sx += x; sy += y; n0++; }
    const cx = n0 ? Math.round(sx / n0) : Math.floor(G.cols / 2), cy = n0 ? Math.round(sy / n0) : Math.floor(G.rows / 2);
    const taken = new Set(c.list.filter(x => B.tokens[x.id]).map(x => B.tokens[x.id].x + ',' + B.tokens[x.id].y));
    const nearestFree = (x0, y0) => { for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const p = [x0 + dx, y0 + dy]; if (p[0] < 0 || p[1] < 0 || p[0] >= G.cols || p[1] >= G.rows || blocked(p) || taken.has(p + '')) continue; return p; } return [x0, y0]; };
    for (const x of c.list) {
      if (x.lair || B.tokens[x.id]) continue;
      const enemy = x.side === 'enemy', p = nearestFree(cx + (enemy ? 3 : -3), cy);
      taken.add(p + ''); B.tokens[x.id] = { x: p[0], y: p[1] };
    }
    for (const id of Object.keys(B.tokens)) if (!c.list.some(x => x.id === id)) delete B.tokens[id];
  }
  const blocked = p => G.blocked && G.blocked[p[0] + p[1] * G.cols];
  const occupied = (p, exceptId) => c.list.some(x => x.id !== exceptId && !x.lair && B.tokens[x.id] && B.tokens[x.id].x === p[0] && B.tokens[x.id].y === p[1] && !(x.maxHp && x.hp <= 0));

  // ---------- view ----------
  function resize() { const r = stage.getBoundingClientRect(), dpr = devicePixelRatio || 1; CW = r.width; CH = r.height; cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function fit() {
    const mw = img ? img.width : G.cols * G.cell, mh = img ? img.height : G.rows * G.cell;
    const k = Math.min(CW / mw, CH / mh) * 0.95; view = { k, x: (CW - mw * k) / 2, y: (CH - mh * k) / 2 };
  }
  const scr = (mx, my) => [view.x + mx * view.k, view.y + my * view.k];
  const mapPt = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left - view.x) / view.k, (ev.clientY - r.top - view.y) / view.k]; };
  const cellAt = ev => { const [mx, my] = mapPt(ev); return toCell(G, mx, my); };

  // ---------- drawing ----------
  function cellPoly(cx, cy, size = 1) {
    if (G.type === 'iso') { const z = zOf(G, cx, cy); const p = (x, y) => { const q = [G.ox + (x - y) * G.tw / 2, G.oy + (x + y) * G.th / 2 - z]; return scr(...q); }; return [p(cx, cy), p(cx + size, cy), p(cx + size, cy + size), p(cx, cy + size)]; }
    const a = scr(G.ox + cx * G.cell, G.oy + cy * G.cell), s = G.cell * size * view.k; return [a, [a[0] + s, a[1]], [a[0] + s, a[1] + s], [a[0], a[1] + s]];
  }
  const pathPoly = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); };
  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#12100e'; ctx.fillRect(0, 0, CW, CH);
    if (img) ctx.drawImage(img, view.x, view.y, img.width * view.k, img.height * view.k);
    else { ctx.fillStyle = '#d8cbb0'; const a = scr(G.ox, G.oy); ctx.fillRect(a[0], a[1], G.cols * G.cell * view.k, G.rows * G.cell * view.k); }
    // grid
    if (B.showGrid !== false && (!img || G.type === 'square' || B.showGrid === true)) {
      ctx.strokeStyle = G.type === 'iso' ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
      if (G.type === 'iso') { for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) { pathPoly(cellPoly(x, y)); ctx.stroke(); } }
      else { ctx.beginPath(); for (let x = 0; x <= G.cols; x++) { const a = scr(G.ox + x * G.cell, G.oy), b = scr(G.ox + x * G.cell, G.oy + G.rows * G.cell); ctx.moveTo(...a); ctx.lineTo(...b); } for (let y = 0; y <= G.rows; y++) { const a = scr(G.ox, G.oy + y * G.cell), b = scr(G.ox + G.cols * G.cell, G.oy + y * G.cell); ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke(); }
    }
    // where the creature being moved (or whose turn it is) can still go
    const mover = drag?.x || (!drag && byId(sel)) || null;
    if (mover && B.tokens[mover.id]) {
      const from = drag ? drag.from : [B.tokens[mover.id].x, B.tokens[mover.id].y], left = drag ? drag.left : moveLeft(mover), R = Math.floor(left / 5) + 1;
      ctx.fillStyle = 'rgba(80,200,120,.22)'; ctx.strokeStyle = 'rgba(80,200,120,.55)';
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const p = [from[0] + dx, from[1] + dy]; if (p[0] < 0 || p[1] < 0 || p[0] >= G.cols || p[1] >= G.rows || (dx === 0 && dy === 0)) continue;
        if (feet(from, p, B.rule) > left || blocked(p)) continue;
        pathPoly(cellPoly(p[0], p[1])); ctx.fill();
      }
      // the outline of the reach (a circle, or a square for the 5-ft diagonal rule)
      const c0 = toMap(G, from[0] + 0.5, from[1] + 0.5), rr = left / 5 + 0.5;
      ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
      for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; let ux = Math.cos(a), uy = Math.sin(a); if (B.rule === '5e') { const m = Math.max(Math.abs(ux), Math.abs(uy)); ux /= m; uy /= m; } const q = toMap(G, from[0] + 0.5 + ux * rr, from[1] + 0.5 + uy * rr); const s = scr(q[0], q[1] + (G.type === 'iso' ? zOf(G, from[0] + 0.5 + ux * rr, from[1] + 0.5 + uy * rr) - zOf(G, from[0], from[1]) : 0)); i ? ctx.lineTo(...s) : ctx.moveTo(...s); }
      ctx.stroke(); ctx.setLineDash([]); void c0;
      if (drag) { pathPoly(cellPoly(drag.to[0], drag.to[1])); ctx.strokeStyle = drag.free ? '#e8c35a' : '#6fdc86'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    // tokens, back to front
    const toks = c.list.filter(x => !x.lair && B.tokens[x.id]).map(x => { const t = drag?.x === x ? { x: drag.to[0], y: drag.to[1] } : B.tokens[x.id]; return { x, t }; }).sort((a, b) => (a.t.x + a.t.y) - (b.t.x + b.t.y));
    for (const { x, t } of toks) drawToken(x, t);
    // ruler
    if (ruler) { const a = scr(...toMap(G, ruler.a[0] + 0.5, ruler.a[1] + 0.5)), b = scr(...toMap(G, ruler.b[0] + 0.5, ruler.b[1] + 0.5)); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); const d = feet(ruler.a, ruler.b, B.rule); label(b[0] + 10, b[1] - 10, speedText(d)); }
    broadcast();
  }
  function label(x, y, text) { ctx.font = '700 13px Inter, sans-serif'; const w2 = ctx.measureText(text).width + 12; ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x, y - 16, w2, 22); ctx.fillStyle = '#fff'; ctx.fillText(text, x + 6, y); }
  function drawToken(x, t) {
    const size = SIZES[x.size] || 1, c0 = toMap(G, t.x + size / 2, t.y + size / 2), [sx, sy] = scr(...c0);
    const cellPx = (G.type === 'iso' ? G.tw * 0.7 : G.cell) * view.k, r = Math.max(9, cellPx * 0.42 * size);
    const down = x.maxHp && x.hp <= 0, turn = x.id === c.turnId;
    const cy = G.type === 'iso' ? sy - r * 1.05 : sy; // isometric tokens stand up off the ground
    ctx.globalAlpha = x.hidden ? 0.5 : 1;
    if (G.type === 'iso') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = SIDE[x.side]; ctx.lineWidth = 2; ctx.stroke(); }
    if (turn) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = SIDE[x.side] || '#888'; ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.fill();
    const pic = tokenPic(x);
    ctx.save(); ctx.beginPath(); ctx.arc(sx, cy, r - 3, 0, Math.PI * 2); ctx.clip();
    if (pic) ctx.drawImage(pic, sx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = '#1e1a16'; ctx.fillRect(sx - r, cy - r, r * 2, r * 2); ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * 0.9)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(x.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?', sx, cy + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
    ctx.restore();
    if (down) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - r * 0.6, cy - r * 0.6); ctx.lineTo(sx + r * 0.6, cy + r * 0.6); ctx.moveTo(sx + r * 0.6, cy - r * 0.6); ctx.lineTo(sx - r * 0.6, cy + r * 0.6); ctx.stroke(); }
    // health bar and name
    if (x.maxHp) { const pct = Math.max(0, Math.min(1, x.hp / x.maxHp)), bw = r * 2; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(sx - r, cy + r + 3, bw, 5); ctx.fillStyle = pct > 0.5 ? '#4fc06a' : pct > 0.25 ? '#d9a13b' : '#d9534f'; ctx.fillRect(sx - r, cy + r + 3, bw * pct, 5); }
    if (view.k > 0.35 || turn || hover === x.id) { ctx.font = '600 11px Inter, sans-serif'; const tw = ctx.measureText(x.name).width; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(sx - tw / 2 - 4, cy - r - 18, tw + 8, 15); ctx.fillStyle = '#fff'; ctx.fillText(x.name, sx - tw / 2, cy - r - 7); }
    ctx.globalAlpha = 1;
  }
  function tokenPic(x) {
    const e = getEntry(x.entryId); const ref = e?.sheet?.portrait?.img || e?.image; if (!ref) return null;
    if (tokenImgs[ref] !== undefined) return tokenImgs[ref];
    tokenImgs[ref] = null; A.url(ref).then(u => { if (!u) return; const im = new Image(); im.onload = () => { tokenImgs[ref] = im; draw(); }; im.src = u; });
    return null;
  }

  // ---------- the side panel: whose turn, what they've used, settings ----------
  const byId = id => c.list.find(x => x.id === id);
  function drawSide() {
    const cur = byId(c.turnId), s = byId(sel) || cur;
    $('#bm-turn').innerHTML = cur ? `Round <b>${c.round}</b> · <b>${esc(cur.name)}</b>’s turn` : c.list.length ? 'Not started — press Next turn to roll initiative' : 'No one in the fight — add them in the tracker';
    const E = s?.econ || {}, left = s ? moveLeft(s) : 0, sp = s ? speedOf(s) : { sp: 0, why: [] };
    $('#bm-side').innerHTML = `
      ${s ? `<h4>${esc(s.name)} ${s.id === c.turnId ? '<span class="tag">their turn</span>' : ''}</h4>
        <div class="bm-move"><b>${speedText(left)}</b> of movement left <span class="small muted">(speed ${speedText(sp.sp)}${E.dash ? `, dashed ×${E.dash}` : ''}${E.moved ? `, moved ${speedText(E.moved)}` : ''})</span></div>
        ${sp.why.length ? `<p class="small muted">${esc(sp.why.join('; '))}</p>` : ''}
        <div class="cb-econs bm-econs">${[['action', 'Action', E.action], ['bonus', 'Bonus', E.bonus], ['reaction', 'Reaction', s.reaction]].map(([k, l, u]) => `<button class="cb-econ ${u ? 'used' : ''}" data-econ="${k}">${l}</button>`).join('')}<button class="cb-dash" data-econ="dash" title="Dash with the action (right-click: bonus action)">🏃 Dash</button>${E.moved ? '<button class="cb-dash" data-econ="undo" title="Put it back where it started this turn">↶ Undo move</button>' : ''}</div>
        <p class="small muted">HP ${s.maxHp ? `${s.hp}/${s.maxHp}` : '—'} · AC ${esc(String(s.ac || '—'))} · ${status(s) || ''}${s.conds.length ? ' · ' + s.conds.map(k => esc(k.k)).join(', ') : ''}</p>` : '<p class="muted small">Click a token to see what it can still do.</p>'}
      <h4>Tools</h4>
      <div class="seg small"><button data-tool="move" class="${tool === 'move' ? 'on' : ''}">✋ Move</button><button data-tool="ruler" class="${tool === 'ruler' ? 'on' : ''}">📏 Measure</button></div>
      <p class="small muted">Drag a token to move it; it stops at the edge of its movement. Hold <kbd>Shift</kbd> to move it freely (doesn’t use movement). Right-click a token for more. Scroll to zoom, drag the background (or middle mouse) to pan.</p>
      <h4>Grid</h4>
      <label class="check"><input type="checkbox" id="bm-grid" ${B.showGrid !== false ? 'checked' : ''}> Show the grid</label>
      ${G.type === 'square' ? `<label>Square size (5 ft) <span class="val">${Math.round(B.cell)} px</span></label><input type="range" id="bm-cell" min="8" max="200" step="1" value="${Math.round(B.cell)}">
        <div class="row" style="gap:6px"><div><label>Nudge across</label><input type="range" id="bm-ox" min="0" max="${Math.round(B.cell)}" value="${Math.round(B.ox) % Math.max(1, Math.round(B.cell))}"></div><div><label>Nudge down</label><input type="range" id="bm-oy" min="0" max="${Math.round(B.cell)}" value="${Math.round(B.oy) % Math.max(1, Math.round(B.cell))}"></div></div>` : '<p class="small muted">Isometric scene: every tile is 5 ft.</p>'}
      <label>Diagonals</label><select id="bm-rule"><option value="circle" ${B.rule === 'circle' ? 'selected' : ''}>Real distance (a circle)</option><option value="5e" ${B.rule === '5e' ? 'selected' : ''}>Every square 5 ft (5e default)</option><option value="alt" ${B.rule === 'alt' ? 'selected' : ''}>5–10–5 (variant)</option></select>
      <button class="small" id="bm-fit" style="margin-top:8px">⤢ Fit the map</button> <button class="small" id="bm-place">Place anyone missing</button>
      ${B.src.startsWith('scene:') ? '<button class="small" id="bm-savescene" style="margin-top:6px">💾 Save this scene to Maps</button>' : ''}`;
  }

  // ---------- turns ----------
  function persist() { save(); }
  $('#bm-next').onclick = () => { if (!c.list.length) return toast('Add someone to the fight in the tracker first'); advanceTurn(c, 1); sel = c.turnId; drawSide(); draw(); persist(); };
  $('#bm-prev').onclick = () => { if (!c.turnId) return; advanceTurn(c, -1); sel = c.turnId; drawSide(); draw(); persist(); };
  $('#bm-src').onchange = e => { B.src = e.target.value; B.cellSet = false; B.tokens = {}; loadSource(); };
  $('#bm-player').onclick = () => { window.open(location.href.split('#')[0] + '#/battleview', 'loreforge-battle', 'width=1200,height=800'); setTimeout(broadcast, 900); };

  const side = $('#bm-side');
  side.addEventListener('click', e => {
    const s = byId(sel) || byId(c.turnId);
    const ec = e.target.closest('[data-econ]');
    if (ec && s) {
      if (ec.dataset.econ === 'undo') { const st = s.econ.start; if (st) { B.tokens[s.id] = { x: st[0], y: st[1] }; s.econ.moved = 0; logTo(c, `${s.name} went back to where they started`); } }
      else useEconFor(c, s, ec.dataset.econ, false);
      drawSide(); draw(); persist(); return;
    }
    const tb = e.target.closest('[data-tool]'); if (tb) { tool = tb.dataset.tool; ruler = null; drawSide(); draw(); return; }
    if (e.target.id === 'bm-fit') { fit(); draw(); }
    if (e.target.id === 'bm-place') { placeMissing(); draw(); persist(); }
    if (e.target.id === 'bm-savescene') saveScene();
  });
  side.addEventListener('contextmenu', e => { const ec = e.target.closest('[data-econ="dash"]'); if (!ec) return; e.preventDefault(); const s = byId(sel) || byId(c.turnId); if (s) { useEconFor(c, s, 'dash', true); drawSide(); draw(); persist(); } });
  side.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'bm-cell') { B.cell = +t.value; B.cellSet = true; G = gridOf(B, img); t.previousElementSibling.querySelector('.val').textContent = `${t.value} px`; draw(); }
    if (t.id === 'bm-ox') { B.ox = +t.value; G = gridOf(B, img); draw(); }
    if (t.id === 'bm-oy') { B.oy = +t.value; G = gridOf(B, img); draw(); }
  });
  side.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'bm-grid') { B.showGrid = t.checked; draw(); }
    if (t.id === 'bm-rule') { B.rule = t.value; draw(); }
    if (['bm-cell', 'bm-ox', 'bm-oy'].includes(t.id)) { drawSide(); }
    persist();
  });
  async function saveScene() {
    const key = B.src.slice(6), r = sceneRender(key); if (!r) return;
    const blob = await new Promise(res => r.canvas.toBlob(res, 'image/png'));
    const file = new File([blob], `${key}.png`, { type: 'image/png' });
    const pic = await A.storeImage(file);
    const { uid } = await import('../store.js');
    w.maps.push({ id: uid(), name: SCENES[key].label, image: pic.ref, w: r.canvas.width, h: r.canvas.height, parentId: '', scale: { pxPerUnit: 0, unit: 'feet' }, pins: [], iso: true });
    save(); toast(`${SCENES[key].label} saved to your Maps`);
  }

  // ---------- pointer: move tokens, measure, pan and zoom ----------
  const tokenAt = ev => {
    const [mx, my] = mapPt(ev);
    let best = null, bd = Infinity;
    for (const x of c.list) {
      const t = B.tokens[x.id]; if (x.lair || !t) continue;
      const size = SIZES[x.size] || 1, c0 = toMap(G, t.x + size / 2, t.y + size / 2), r = (G.type === 'iso' ? G.tw * 0.7 : G.cell) * 0.45 * size, cy = G.type === 'iso' ? c0[1] - r * 1.05 : c0[1];
      const d = Math.hypot(mx - c0[0], my - cy); if (d < r * 1.1 && d < bd) { bd = d; best = x; }
    }
    return best;
  };
  const snap = cell => [Math.max(0, Math.min(G.cols - 1, Math.floor(cell[0]))), Math.max(0, Math.min(G.rows - 1, Math.floor(cell[1])))];
  // the furthest reachable square along the line toward where the pointer is
  function clampMove(from, want, left) {
    if (feet(from, want, B.rule) <= left && !blocked(want)) return want;
    const steps = Math.max(Math.abs(want[0] - from[0]), Math.abs(want[1] - from[1])) * 3;
    let best = from;
    for (let i = 1; i <= steps; i++) { const p = [Math.round(from[0] + (want[0] - from[0]) * i / steps), Math.round(from[1] + (want[1] - from[1]) * i / steps)]; if (feet(from, p, B.rule) <= left && !blocked(p)) best = p; else break; }
    return best;
  }
  cv.addEventListener('pointerdown', ev => {
    cv.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || ev.button === 2) { drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, btn: ev.button, moved: false }; return; }
    if (tool === 'ruler') { const p = snap(cellAt(ev)); ruler = { a: p, b: p }; drag = { ruler: true }; draw(); return; }
    const x = tokenAt(ev);
    if (x) {
      sel = x.id; const t = B.tokens[x.id];
      drag = { x, from: [t.x, t.y], to: [t.x, t.y], left: moveLeft(x), free: ev.shiftKey };
      drawSide(); draw(); return;
    }
    drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false };
  });
  cv.addEventListener('pointermove', ev => {
    if (!drag) { const x = tokenAt(ev); if ((x?.id || null) !== hover) { hover = x?.id || null; cv.style.cursor = x ? 'grab' : tool === 'ruler' ? 'crosshair' : 'default'; draw(); } return; }
    if (drag.pan) { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true; draw(); return; }
    if (drag.ruler) { ruler.b = snap(cellAt(ev)); draw(); return; }
    if (drag.x) {
      const want = snap(cellAt(ev)); drag.free = ev.shiftKey;
      drag.to = drag.free ? want : clampMove(drag.from, want, drag.left);
      $('#bm-hint').textContent = drag.free ? 'Free move (Shift): doesn’t use movement' : `${speedText(feet(drag.from, drag.to, B.rule))} of ${speedText(drag.left)}`;
      $('#bm-hint').hidden = false; draw();
    }
  });
  cv.addEventListener('pointerup', ev => {
    const d = drag; drag = null; $('#bm-hint').hidden = true;
    if (!d) return;
    if (d.pan && d.btn === 2 && !d.moved) { tokenMenu(ev); return; }
    if (d.x && (d.to[0] !== d.from[0] || d.to[1] !== d.from[1])) {
      if (occupied(d.to, d.x.id)) { toast('Someone is already standing there'); draw(); return; }
      const x = d.x; x.econ = x.econ || {};
      if (!d.free) { if (!x.econ.start) x.econ.start = d.from; x.econ.moved = (x.econ.moved || 0) + feet(d.from, d.to, B.rule); if (x.id === c.turnId || true) logTo(c, `${x.name} moved ${speedText(feet(d.from, d.to, B.rule))}`); }
      B.tokens[x.id] = { x: d.to[0], y: d.to[1] };
      persist(); drawSide();
    }
    draw();
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function tokenMenu(ev) {
    const x = tokenAt(ev); if (!x) return;
    sel = x.id; drawSide(); draw();
    const E = x.econ || {};
    contextMenu(ev.clientX, ev.clientY, [{ header: x.name },
      { label: E.action ? 'Action: give it back' : 'Use the action', icon: '⚔️', action: () => { useEconFor(c, x, 'action'); drawSide(); draw(); persist(); } },
      { label: E.bonus ? 'Bonus action: give it back' : 'Use the bonus action', icon: '✨', action: () => { useEconFor(c, x, 'bonus'); drawSide(); draw(); persist(); } },
      { label: x.reaction ? 'Reaction: give it back' : 'Use the reaction', icon: '⟲', action: () => { useEconFor(c, x, 'reaction'); drawSide(); draw(); persist(); } },
      { label: 'Dash (action)', icon: '🏃', action: () => { useEconFor(c, x, 'dash', false); drawSide(); draw(); persist(); } },
      { label: 'Dash (bonus action)', icon: '💨', action: () => { useEconFor(c, x, 'dash', true); drawSide(); draw(); persist(); } },
      '-',
      { label: x.hidden ? 'Show to players' : 'Hide from players', icon: '🙈', action: () => { x.hidden = !x.hidden; draw(); persist(); } },
      { label: 'Open in the tracker', icon: '📋', action: () => { location.hash = '#/combat'; } },
    ]);
  }
  cv.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, k2 = Math.max(0.05, Math.min(6, view.k * Math.exp(-ev.deltaY * 0.0015)));
    view.x = px - (px - view.x) * k2 / view.k; view.y = py - (py - view.y) * k2 / view.k; view.k = k2; draw();
  }, { passive: false });
  const onKey = ev => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return; if (ev.key === ']') $('#bm-next').click(); if (ev.key === '[') $('#bm-prev').click(); if (ev.key === 'Escape' && drag?.x) { drag = null; draw(); } };
  window.addEventListener('keydown', onKey);

  // ---------- the players' window ----------
  let bt = 0;
  function broadcast() {
    if (!chan) return; clearTimeout(bt);
    bt = setTimeout(() => chan.postMessage({ type: 'battle', src: B.src, mapRef: B.src.startsWith('map:') ? w.maps.find(m => m.id === B.src.slice(4))?.image : '', grid: G.type === 'square' ? { cell: B.cell, ox: B.ox, oy: B.oy } : null, showGrid: B.showGrid !== false,
      turnId: c.turnId, round: c.round, mover: drag?.x ? { id: drag.x.id, to: drag.to } : null,
      tokens: c.list.filter(x => !x.lair && !x.hidden && B.tokens[x.id]).map(x => ({ id: x.id, name: x.name, side: x.side, size: x.size, x: B.tokens[x.id].x, y: B.tokens[x.id].y, down: !!(x.maxHp && x.hp <= 0), pct: x.side === 'ally' && x.maxHp ? x.hp / x.maxHp : null, st: status(x), pic: getEntry(x.entryId)?.sheet?.portrait?.img || getEntry(x.entryId)?.image || '' })) }), 60);
  }
  const onMsg = ev => { if (ev.data?.type === 'hello-battle') broadcast(); };
  chan?.addEventListener('message', onMsg);

  const ro = new ResizeObserver(resize); ro.observe(stage);
  drawSources(); resize();
  if (!B.src && query().src) B.src = query().src;
  if (!B.src) B.src = w.maps.find(m => m.image) ? '' : 'scene:town';
  if (B.src) loadSource(); else { drawSide(); draw(); }
  drawSide();
  return () => { ro.disconnect(); window.removeEventListener('keydown', onKey); chan?.removeEventListener('message', onMsg); };
}

// ---------- Battle map: the players' window (follows the GM's map, read-only) ----------
export function renderPlayerBattle(main) {
  document.body.classList.add('player-view');
  main.innerHTML = '<div class="bm-pv"><canvas id="pv-cv"></canvas><div class="bm-pv-turn" id="pv-turn">Waiting for the battle map…</div></div>';
  const cv = main.querySelector('#pv-cv'), ctx = cv.getContext('2d');
  let st = null, img = null, imgKey = '', G = null, CW = 0, CH = 0;
  const pics = {};
  async function ensureMap() {
    const key = st.src + '|' + (st.mapRef || '');
    if (key === imgKey) return; imgKey = key; img = null;
    if (st.src.startsWith('scene:')) { const r = sceneRender(st.src.slice(6)); img = r?.canvas; G = r?.grid; }
    else if (st.mapRef) { const u = await A.url(st.mapRef); img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u; }); G = null; }
    else G = null;
  }
  function draw() {
    const r = main.getBoundingClientRect(), dpr = devicePixelRatio || 1; CW = r.width; CH = innerHeight - 20;
    cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0b0a'; ctx.fillRect(0, 0, CW, CH);
    if (!st) return;
    const grid = G ? G : { type: 'square', cell: st.grid?.cell || 50, ox: st.grid?.ox || 0, oy: st.grid?.oy || 0, cols: img ? Math.ceil(img.width / (st.grid?.cell || 50)) : 40, rows: img ? Math.ceil(img.height / (st.grid?.cell || 50)) : 30 };
    const mw = img ? img.width : grid.cols * grid.cell, mh = img ? img.height : grid.rows * grid.cell, k = Math.min(CW / mw, CH / mh), vx = (CW - mw * k) / 2, vy = (CH - mh * k) / 2;
    const scr = (x, y) => [vx + x * k, vy + y * k];
    if (img) ctx.drawImage(img, vx, vy, mw * k, mh * k); else { ctx.fillStyle = '#d8cbb0'; ctx.fillRect(vx, vy, mw * k, mh * k); }
    if (st.showGrid && grid.type === 'square') { ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); for (let x = 0; x <= grid.cols; x++) { ctx.moveTo(...scr(grid.ox + x * grid.cell, grid.oy)); ctx.lineTo(...scr(grid.ox + x * grid.cell, grid.oy + grid.rows * grid.cell)); } for (let y = 0; y <= grid.rows; y++) { ctx.moveTo(...scr(grid.ox, grid.oy + y * grid.cell)); ctx.lineTo(...scr(grid.ox + grid.cols * grid.cell, grid.oy + y * grid.cell)); } ctx.stroke(); }
    for (const t of [...st.tokens].sort((a, b) => (a.x + a.y) - (b.x + b.y))) {
      const size = SIZES[t.size] || 1, c0 = toMap(grid, t.x + size / 2, t.y + size / 2), [sx, sy] = scr(...c0), r2 = Math.max(9, (grid.type === 'iso' ? grid.tw * 0.7 : grid.cell) * k * 0.42 * size), cy = grid.type === 'iso' ? sy - r2 * 1.05 : sy;
      if (t.id === st.turnId) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, cy, r2 + 5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = SIDE[t.side] || '#888'; ctx.beginPath(); ctx.arc(sx, cy, r2, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(sx, cy, r2 - 3, 0, Math.PI * 2); ctx.clip();
      const p = t.pic && pics[t.pic]; if (p) ctx.drawImage(p, sx - r2, cy - r2, r2 * 2, r2 * 2); else { ctx.fillStyle = '#1e1a16'; ctx.fillRect(sx - r2, cy - r2, r2 * 2, r2 * 2); ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r2 * 0.9)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(), sx, cy + 1); }
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (t.pic && pics[t.pic] === undefined) { pics[t.pic] = null; A.url(t.pic).then(u => { if (!u) return; const im = new Image(); im.onload = () => { pics[t.pic] = im; draw(); }; im.src = u; }); }
      if (t.down) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - r2 * 0.6, cy - r2 * 0.6); ctx.lineTo(sx + r2 * 0.6, cy + r2 * 0.6); ctx.moveTo(sx + r2 * 0.6, cy - r2 * 0.6); ctx.lineTo(sx - r2 * 0.6, cy + r2 * 0.6); ctx.stroke(); }
      if (t.pct != null) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(sx - r2, cy + r2 + 3, r2 * 2, 5); ctx.fillStyle = t.pct > 0.5 ? '#4fc06a' : t.pct > 0.25 ? '#d9a13b' : '#d9534f'; ctx.fillRect(sx - r2, cy + r2 + 3, r2 * 2 * Math.max(0, t.pct), 5); }
      ctx.font = '600 12px Inter, sans-serif'; const tw = ctx.measureText(t.name).width; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(sx - tw / 2 - 4, cy - r2 - 19, tw + 8, 16); ctx.fillStyle = '#fff'; ctx.fillText(t.name, sx - tw / 2, cy - r2 - 7);
    }
    const cur = st.tokens.find(t => t.id === st.turnId);
    main.querySelector('#pv-turn').innerHTML = cur ? `Round ${st.round} · <b>${esc(cur.name)}</b>’s turn` : 'Battle map';
  }
  const onMsg = async ev => { if (ev.data?.type !== 'battle') return; st = ev.data; await ensureMap(); draw(); };
  chan?.addEventListener('message', onMsg);
  chan?.postMessage({ type: 'hello-battle' });
  window.addEventListener('resize', draw);
  return () => { document.body.classList.remove('player-view'); chan?.removeEventListener('message', onMsg); window.removeEventListener('resize', draw); };
}
