import { W, uid, save, getMap, getEntry, newEntry } from '../store.js';
import { esc, query, go, toast, openModal, closeModal } from '../util.js';
import { randomSeed, ensureFonts } from '../gen/core.js';
import { generateWorld, renderWorld, WORLD_DEFAULTS, GRID_W, GRID_H, makeEditState, cloneEdit, applyBrush, drawEditPreview,
  editToBlob, editFromBlob, BIOME_LABELS, REALM_COLORS } from '../gen/world.js';
import { generateCity, renderCity, CITY_DEFAULTS } from '../gen/city.js';
import { placeName, realmBase, realmName } from '../gen/names.js';
import { rng } from '../gen/core.js';
import * as A from '../assets.js';

const STYLE_SWATCH = {
  parchment: 'linear-gradient(135deg,#eadcbf 0 55%,#b9bfb0 55% 100%)',
  atlas: 'linear-gradient(135deg,#a8c47a 0 55%,#3f6f99 55% 100%)',
  night: 'linear-gradient(135deg,#3a3446 0 55%,#d4a24c 55% 58%,#101b2a 58% 100%)',
  quill: 'linear-gradient(135deg,#e2d0aa 0 52%,#3e2b18 52% 56%,#d6c39c 56% 100%)',
  storybook: 'linear-gradient(135deg,#b4d874 0 40%,#68b65c 40% 55%,#78d2de 55% 100%)',
  painted: 'linear-gradient(135deg,#b2aa54 0 40%,#3c5c32 40% 55%,#7ec0c8 55% 60%,#18384f 60% 100%)',
  relief: 'linear-gradient(135deg,#769e5c 0 32%,#ba9668 32% 50%,#f0f0f4 50% 57%,#1a4a86 57% 100%)',
  cells: 'linear-gradient(135deg,#d88a62 0 30%,#8fb764 30% 55%,#a2c9e2 55% 100%)',
};
const STYLE_LABEL = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night', quill: 'Ink & Quill', storybook: 'Storybook', painted: 'Painted', relief: 'Realistic', cells: 'Political' };
const STYLE_HINT = {
  quill: 'Pen-and-ink on sepia — the classic epic-fantasy look', storybook: 'Bright, friendly colours', painted: 'Painted terrain with cloud edges',
  relief: 'Realistic shaded elevation', cells: 'Coloured realm cells, like Azgaar',
};
const MODE_STYLES = { world: Object.keys(STYLE_SWATCH), city: ['parchment', 'atlas', 'night'] };

const TOOLS = [
  ['Terrain', [['raise', '⬆️', 'Raise'], ['lower', '⬇️', 'Lower'], ['mountain', '🏔️', 'Mountains'], ['smooth', '〰️', 'Smooth'], ['flatten', '▁', 'Flatten'], ['land', '🏝️', 'Add land'], ['sea', '🌊', 'Add sea']]],
  ['Paint', [['biome', '🌲', 'Biome'], ['realm', '🚩', 'Realm']]],
  ['Places', [['town', '🏘️', 'Towns']]],
];
const TOOL_HELP = {
  raise: 'Drag to raise the ground. Lift the sea floor to make new land.', lower: 'Drag to lower the ground — carve valleys, bays and lakes.',
  mountain: 'Drag to build mountain ranges.', smooth: 'Drag to soften rough terrain and coastlines.', flatten: 'Drag to wear mountains down into plains.',
  land: 'Drag across the sea to add land.', sea: 'Drag across land to flood it.',
  biome: 'Paint forests, deserts, swamps… “Automatic” lets the climate decide again.', realm: 'Paint land into a realm. “Automatic” lets borders grow naturally again.',
  town: 'Click land to add a town. Drag a town to move it. Click a town to rename it, make it a capital or delete it.',
};

// remembered between visits in this session
const memo = { mode: 'world', world: { ...WORLD_DEFAULTS, seed: randomSeed() }, city: { ...CITY_DEFAULTS, seed: randomSeed() },
  tool: { tool: 'raise', size: 8, strength: 0.5, biome: 2, realm: -2 } };

export function render(main) {
  const q = query();
  if (q.mode === 'city' || q.mode === 'world') memo.mode = q.mode;
  if (q.name && memo.mode === 'city') memo.city.name = q.name;
  if (!memo.world.name) memo.world.name = W().name;
  if (!memo.city.name) memo.city.name = placeName(rng(memo.city.seed));
  const link = q.parent ? { parent: q.parent, pin: q.pin || '' } : null;

  let data = null, lastKey = '', timer = null, busy = false, pending = false;
  // editor state
  let ed = null, editing = false, editMapId = q.edit || '', selTown = -1, undoStack = [], redoStack = [], edVersion = 0;
  const canvas = document.createElement('canvas');
  const ov = document.createElement('canvas'); ov.className = 'gen-overlay';
  const cur = document.createElement('div'); cur.className = 'brush-cur';
  const mark = document.createElement('div'); mark.className = 'town-mark';

  function styleButtons(o) {
    return MODE_STYLES[memo.mode].map(s => `<button class="swatch ${o.style === s ? 'on' : ''}" data-style="${s}" title="${esc(STYLE_HINT[s] || STYLE_LABEL[s])}"><span style="background:${STYLE_SWATCH[s]}"></span>${STYLE_LABEL[s]}</button>`).join('');
  }

  function controlsHTML() {
    const mode = memo.mode, o = memo[mode];
    if (mode === 'world' && editing) return editHTML();
    const common = `
      <label>Map title</label><input data-k="name" value="${esc(o.name)}" placeholder="${mode === 'world' ? 'e.g. The Shattered Coast' : 'e.g. Saltmere'}">
      <label>Seed <span class="muted">— same seed, same map</span></label>
      <div class="row"><input data-k="seed" value="${esc(o.seed)}"><button class="shrink" id="reroll" title="Random seed">🎲</button></div>`;
    const world = `
      <label>Landmass</label>
      <select data-k="shape">${[['continent', 'Single continent'], ['large', 'Large continent'], ['twin', 'Twin continents'], ['archipelago', 'Archipelago'], ['coast', 'Coastal region']].map(([v, l]) => `<option value="${v}" ${o.shape === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label>Land vs sea <span class="val">${Math.round(o.land * 100)}% land</span></label><input type="range" data-k="land" data-num min="0.2" max="0.7" step="0.01" value="${o.land}">
      <label>Rivers <span class="val">${o.rivers < 0.3 ? 'Few' : o.rivers < 0.7 ? 'Some' : 'Many'}</span></label><input type="range" data-k="rivers" data-num min="0" max="1" step="0.05" value="${o.rivers}">
      <div class="row">
        <div><label>Realms</label><input type="number" data-k="realms" data-num min="1" max="8" value="${o.realms}"></div>
        <div><label>Towns</label><input type="number" data-k="towns" data-num min="0" max="40" value="${o.towns}"></div>
      </div>
      <div class="row">
        <div><label>Climate</label><select data-k="climate">${['cold', 'temperate', 'warm'].map(c => `<option ${o.climate === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>Width (miles)</label><input type="number" data-k="widthMiles" data-num min="20" max="20000" value="${o.widthMiles}"></div>
      </div>`;
    const city = `
      <label>Size</label>
      <div class="seg small">${['village', 'town', 'city', 'capital'].map(s => `<button data-size="${s}" class="${o.size === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
      <label>Features</label>
      <div class="checks">${[['walls', 'City walls'], ['river', 'River'], ['coast', 'Harbour & sea'], ['castle', 'Castle'], ['temple', 'Temple']].map(([k, l]) =>
        `<label class="check"><input type="checkbox" data-k="${k}" ${o[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>`;
    return `
      <div class="seg" id="mode"><button data-mode="world" class="${mode === 'world' ? 'on' : ''}">🌍 World</button><button data-mode="city" class="${mode === 'city' ? 'on' : ''}">🏰 City</button></div>
      ${ed && mode === 'world' ? `<p class="small edit-note">✏️ This map has hand edits. Changing the options below starts a fresh map.</p>` : ''}
      ${common}
      ${mode === 'world' ? world : city}
      <label>Style</label><div class="swatches">${styleButtons(o)}</div>
      ${mode === 'world' ? `<button id="startedit" class="edit-btn">✏️ ${ed ? 'Keep editing' : 'Edit this map'} <span class="muted small">— brushes, biomes, realms, towns</span></button>` : ''}
      <div class="gen-actions">
        <button id="newmap">✨ Surprise me</button>
        <button class="primary" id="save">💾 ${editMapId ? 'Save' : 'Save to my maps'}</button>
      </div>
      ${link ? `<p class="small muted" style="margin:10px 0 0">Will open from the pin on <b>${esc(getMap(link.parent)?.name || 'your map')}</b>.</p>` : ''}`;
  }

  function editHTML() {
    const t = memo.tool, o = memo.world;
    const tools = TOOLS.map(([g, list]) => `<div class="tg-label">${g}</div><div class="tools">${list.map(([id, ic, lb]) =>
      `<button class="tool ${t.tool === id ? 'on' : ''}" data-tool="${id}" title="${esc(TOOL_HELP[id])}"><span>${ic}</span>${lb}</button>`).join('')}</div>`).join('');
    const brush = t.tool !== 'town' ? `
      <label>Brush size <span class="val">${t.size}</span></label><input type="range" data-t="size" min="2" max="40" step="1" value="${t.size}">
      ${['biome', 'realm'].includes(t.tool) ? '' : `<label>Strength <span class="val">${Math.round(t.strength * 100)}%</span></label><input type="range" data-t="strength" min="0.1" max="1" step="0.05" value="${t.strength}">`}` : '';
    const biome = t.tool === 'biome' ? `<label>Paint with</label><select data-t="biome">${BIOME_LABELS.map(([v, l]) => `<option value="${v}" ${+t.biome === v ? 'selected' : ''}>${l}</option>`).join('')}<option value="255" ${+t.biome === 255 ? 'selected' : ''}>✨ Automatic (let climate decide)</option></select>` : '';
    const realm = t.tool === 'realm' ? `<label>Paint with</label><select data-t="realm">${ed.realms.map(rl => `<option value="${rl.id}" ${+t.realm === rl.id ? 'selected' : ''}>${esc(rl.name)}</option>`).join('')}<option value="-1" ${+t.realm === -1 ? 'selected' : ''}>Unclaimed land</option><option value="-2" ${+t.realm === -2 ? 'selected' : ''}>✨ Automatic (natural borders)</option></select>` : '';
    const tw = selTown >= 0 ? ed.towns[selTown] : null;
    const town = t.tool === 'town' ? (tw ? `<div class="sel-town">
        <label>Town name</label><input id="tw-name" value="${esc(tw.name)}">
        <label class="check"><input type="checkbox" id="tw-cap" ${tw.capital ? 'checked' : ''}> Capital of its own realm</label>
        <div class="row" style="margin-top:8px"><button id="tw-done" class="small">Done</button><button id="tw-del" class="danger small">Delete town</button></div></div>`
      : `<p class="small muted" style="margin:8px 0 0">${ed.towns.length} towns · ${ed.realms.length} realms</p>`) : '';
    const realms = `<details class="realm-list" ${t.tool === 'realm' ? 'open' : ''}><summary>Realms (${ed.realms.length})</summary>${ed.realms.map(rl =>
      `<div class="row realm-row"><input type="color" data-rc="${rl.id}" value="${rl.color}"><input data-rn="${rl.id}" value="${esc(rl.name)}"></div>`).join('') || '<p class="small muted">Make a town a capital to found a realm.</p>'}</details>`;
    return `
      <div class="edit-head"><b>✏️ Editing ${esc(o.name || 'map')}</b><button class="small" id="enddone">Done</button></div>
      ${tools}
      <p class="small muted tool-help">${esc(TOOL_HELP[t.tool])}</p>
      ${brush}${biome}${realm}${town}
      ${realms}
      <label>Style</label><div class="swatches">${styleButtons(o)}</div>
      <div class="row" style="margin-top:12px">
        <button id="undo" ${undoStack.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button id="redo" ${redoStack.length ? '' : 'disabled'} title="Redo (Ctrl+Y)">↷ Redo</button>
        <button id="reset" class="shrink" title="Throw away all hand edits">⟲</button>
      </div>
      <div class="gen-actions"><button class="primary" id="save" style="grid-column:1/-1">💾 ${editMapId ? 'Save changes' : 'Save to my maps'}</button></div>`;
  }

  main.innerHTML = `
    <div class="page-head"><h1>Map generator</h1><span class="muted small">Generate a world or city, edit it by hand, then save it with pins and entries ready to go.</span></div>
    <div class="gen-shell">
      <div class="card gen-controls" id="ctl"></div>
      <div class="gen-preview" id="pv"><div class="gen-busy" id="busy"><div class="spinner"></div><span>Drawing your map…</span></div></div>
    </div>`;
  const ctl = main.querySelector('#ctl'), pv = main.querySelector('#pv'), busyEl = main.querySelector('#busy');
  pv.prepend(canvas); pv.append(ov, cur, mark);

  const drawControls = () => { ctl.innerHTML = controlsHTML(); pv.classList.toggle('editing', editing); pv.dataset.tool = editing ? memo.tool.tool : ''; drawMark(); };

  async function regen(force = false) {
    if (busy) { pending = true; return; }
    const mode = memo.mode, o = memo[mode];
    const key = mode + JSON.stringify({ ...o, style: '', name: '' }) + (mode === 'world' && ed ? ':e' + edVersion : '');
    busy = true;
    busyEl.classList.toggle('soft', !!(editing || ed));
    busyEl.classList.add('on');
    await ensureFonts();
    await new Promise(r => setTimeout(r, 30));
    try {
      if (force || key !== lastKey || !data || data.mode !== mode) {
        data = { mode, gen: mode === 'world' ? generateWorld(o, ed) : generateCity(o) };
        lastKey = key;
      }
      data.gen.o.name = o.name;
      data.gen.o.style = o.style;
      data.result = mode === 'world' ? renderWorld(data.gen, canvas, o.style) : renderCity(data.gen, canvas, o.style);
    } catch (e) { console.error(e); toast('Something went wrong drawing that map — try another seed'); }
    busy = false; busyEl.classList.remove('on');
    ov.classList.remove('on');
    drawMark();
    if (pending) { pending = false; regen(); }
  }
  const schedule = (ms = 350) => { clearTimeout(timer); timer = setTimeout(() => regen(), ms); };

  // ---------- editing ----------
  const pushUndo = () => { undoStack.push(cloneEdit(ed)); if (undoStack.length > 30) undoStack.shift(); redoStack = []; };
  const changed = () => { edVersion++; schedule(60); };
  function startEditing() {
    if (!data || data.mode !== 'world') return;
    if (!ed) { ed = makeEditState(data.gen); edVersion++; lastKey = ''; }
    editing = true; selTown = -1;
    drawControls();
  }
  function discardEdits() { ed = null; editing = false; undoStack = []; redoStack = []; selTown = -1; edVersion++; }
  function undo() { if (!undoStack.length) return; redoStack.push(cloneEdit(ed)); ed = undoStack.pop(); selTown = -1; drawControls(); changed(); }
  function redo() { if (!redoStack.length) return; undoStack.push(cloneEdit(ed)); ed = redoStack.pop(); selTown = -1; drawControls(); changed(); }
  const gridPos = ev => { const rc = canvas.getBoundingClientRect(); return [(ev.clientX - rc.left) / rc.width * GRID_W - 0.5, (ev.clientY - rc.top) / rc.height * GRID_H - 0.5]; };
  const screenPos = (gx, gy) => [(gx + 0.5) / GRID_W * canvas.clientWidth, (gy + 0.5) / GRID_H * canvas.clientHeight];
  function drawMark() {
    const tw = editing && memo.tool.tool === 'town' && selTown >= 0 ? ed?.towns[selTown] : null;
    mark.style.display = tw ? 'block' : 'none';
    if (tw) { const [x, y] = screenPos(tw.gx, tw.gy); mark.style.left = x + 'px'; mark.style.top = y + 'px'; }
  }
  function nearestTown(gx, gy, maxD) {
    let best = -1, bd = maxD;
    ed.towns.forEach((t, i) => { const d = Math.hypot(t.gx - gx, t.gy - gy); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  const newRealmId = () => ed.realms.reduce((m, rl) => Math.max(m, rl.id), -1) + 1;
  function makeCapital(tw, on) {
    if (on && !tw.capital) {
      const id = newRealmId(), r = rng(Math.random().toString(36));
      const used = new Set(ed.realms.map(rl => rl.color));
      ed.realms.push({ id, name: realmName(r, realmBase(r)), color: REALM_COLORS.find(c => !used.has(c)) || REALM_COLORS[id % REALM_COLORS.length] });
      tw.capital = true; tw.rid = id;
    } else if (!on && tw.capital) {
      ed.realms = ed.realms.filter(rl => rl.id !== tw.rid);
      for (let i = 0; i < ed.realmPaint.length; i++) if (ed.realmPaint[i] === tw.rid) ed.realmPaint[i] = -2;
      if (+memo.tool.realm === tw.rid) memo.tool.realm = -2;
      tw.capital = false; delete tw.rid;
    }
  }

  let stroke = null;
  canvas.addEventListener('pointermove', ev => {
    if (!editing) return;
    const rc = canvas.getBoundingClientRect(), t = memo.tool;
    if (t.tool !== 'town') {
      const d = t.size * 2 / GRID_W * rc.width;
      cur.style.width = cur.style.height = d + 'px';
      cur.style.left = (ev.clientX - rc.left) + 'px'; cur.style.top = (ev.clientY - rc.top) + 'px';
      cur.style.display = 'block';
    }
    if (!stroke) return;
    const [gx, gy] = gridPos(ev);
    if (stroke.kind === 'brush') {
      const dist = Math.hypot(gx - stroke.x, gy - stroke.y), step = Math.max(0.6, t.size * 0.25);
      for (let s2 = step; s2 <= dist; s2 += step) {
        const f = s2 / dist;
        dab(stroke.x + (gx - stroke.x) * f, stroke.y + (gy - stroke.y) * f);
      }
      if (dist >= step) { stroke.x = gx; stroke.y = gy; drawEditPreview(ed, ov, data?.gen); }
    } else if (stroke.kind === 'town') {
      if (!stroke.moved && Math.hypot(gx - stroke.x, gy - stroke.y) < 0.8) return;
      if (!stroke.moved) { pushUndo(); stroke.moved = true; }
      const tw = ed.towns[stroke.i]; tw.gx = Math.max(0, Math.min(GRID_W - 1, gx)); tw.gy = Math.max(0, Math.min(GRID_H - 1, gy));
      drawMark();
    }
  });
  canvas.addEventListener('pointerleave', () => { cur.style.display = 'none'; });
  const dab = (gx, gy) => {
    const t = memo.tool;
    applyBrush(ed, t.tool, gx, gy, t.size, t.strength, t.tool === 'biome' ? +t.biome : t.tool === 'realm' ? +t.realm : 0);
  };
  canvas.addEventListener('pointerdown', ev => {
    if (!editing || ev.button !== 0) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const [gx, gy] = gridPos(ev), t = memo.tool;
    if (t.tool === 'town') {
      const rc = canvas.getBoundingClientRect();
      const i = nearestTown(gx, gy, 14 / rc.width * GRID_W + 0.8);
      if (i >= 0) { selTown = i; stroke = { kind: 'town', i, x: gx, y: gy, moved: false }; drawControls(); return; }
      const c = Math.round(gy) * GRID_W + Math.round(gx);
      if (ed.h[c] < ed.sea) { toast('Towns go on land — click somewhere on the land'); return; }
      pushUndo();
      const r = rng(Math.random().toString(36)), names = new Set(ed.towns.map(x => x.name));
      let nm; do { nm = placeName(r); } while (names.has(nm));
      ed.towns.push({ gx, gy, name: nm, capital: false });
      selTown = ed.towns.length - 1;
      drawControls(); changed();
      return;
    }
    pushUndo();
    stroke = { kind: 'brush', x: gx, y: gy };
    dab(gx, gy);
    drawEditPreview(ed, ov, data?.gen);
    ov.classList.add('on');
  });
  const endStroke = () => {
    if (!stroke) return;
    const s0 = stroke; stroke = null;
    if (s0.kind === 'brush' || s0.moved) { drawControls(); changed(); }
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  const onResize = () => drawMark();
  window.addEventListener('resize', onResize);
  const onKey = ev => {
    if (!editing || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.target.matches?.('input,textarea,select')) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); ev.stopImmediatePropagation(); undo(); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); ev.stopImmediatePropagation(); redo(); }
  };
  window.addEventListener('keydown', onKey, true);

  // ---------- controls ----------
  let nameUndoArmed = true;
  ctl.addEventListener('input', e => {
    const t = e.target;
    if (editing) {
      if (t.dataset.t) {
        memo.tool[t.dataset.t] = t.type === 'range' ? +t.value : t.value;
        const val = t.previousElementSibling?.querySelector?.('.val');
        if (val) val.textContent = t.dataset.t === 'strength' ? Math.round(+t.value * 100) + '%' : t.value;
        return;
      }
      if (t.id === 'tw-name' && selTown >= 0) { if (nameUndoArmed) { pushUndo(); nameUndoArmed = false; } ed.towns[selTown].name = t.value; changed(); return; }
      if (t.dataset.rn != null) { const rl = ed.realms.find(x => x.id === +t.dataset.rn); if (rl) { rl.name = t.value; changed(); } return; }
      if (t.dataset.rc != null) { const rl = ed.realms.find(x => x.id === +t.dataset.rc); if (rl) { rl.color = t.value; changed(); } return; }
      return;
    }
    const k = t.dataset.k; if (!k) return;
    const o = memo[memo.mode];
    if (memo.mode === 'world' && ed && !['name'].includes(k)) {
      if (!confirm('Changing this starts a fresh map and throws away your hand edits. Continue?')) { drawControls(); return; }
      discardEdits(); drawControls();
    }
    if (t.type === 'checkbox') o[k] = t.checked;
    else o[k] = t.dataset.num != null ? +t.value : t.value;
    const val = t.previousElementSibling?.querySelector?.('.val');
    if (val && k === 'land') val.textContent = Math.round(o.land * 100) + '% land';
    if (val && k === 'rivers') val.textContent = o.rivers < 0.3 ? 'Few' : o.rivers < 0.7 ? 'Some' : 'Many';
    schedule(t.type === 'range' || t.type === 'text' || t.type === 'number' ? 450 : 50);
  });
  ctl.addEventListener('change', e => {
    const t = e.target;
    if (!editing) return;
    if (t.id === 'tw-cap' && selTown >= 0) { pushUndo(); makeCapital(ed.towns[selTown], t.checked); drawControls(); changed(); }
    if (t.dataset.t === 'biome' || t.dataset.t === 'realm') memo.tool[t.dataset.t] = +t.value;
  });
  ctl.addEventListener('focusin', e => { if (e.target.id === 'tw-name') nameUndoArmed = true; });
  ctl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const o = memo[memo.mode];
    if (b.dataset.tool) { memo.tool.tool = b.dataset.tool; if (b.dataset.tool !== 'town') selTown = -1; if (b.dataset.tool === 'realm' && +memo.tool.realm === -2 && ed.realms[0]) memo.tool.realm = ed.realms[0].id; drawControls(); }
    else if (b.dataset.style) { o.style = b.dataset.style; drawControls(); regen(); }
    else if (b.id === 'startedit') startEditing();
    else if (b.id === 'enddone') { editing = false; cur.style.display = 'none'; drawControls(); }
    else if (b.id === 'undo') undo();
    else if (b.id === 'redo') redo();
    else if (b.id === 'reset') { if (confirm('Throw away every hand edit and go back to the generated map?')) { discardEdits(); drawControls(); regen(true); } }
    else if (b.id === 'tw-done') { selTown = -1; drawControls(); }
    else if (b.id === 'tw-del' && selTown >= 0) { pushUndo(); makeCapital(ed.towns[selTown], false); ed.towns.splice(selTown, 1); selTown = -1; drawControls(); changed(); }
    else if (b.dataset.mode) {
      if (b.dataset.mode === memo.mode) return;
      if (ed && b.dataset.mode === 'city' && !confirm('Switching to a city map throws away your hand edits to this world map. Continue?')) return;
      if (b.dataset.mode === 'city') discardEdits();
      memo.mode = b.dataset.mode; drawControls(); regen();
    }
    else if (b.dataset.size) { o.size = b.dataset.size; if (o.size === 'village') { o.walls = false; o.castle = false; } drawControls(); regen(); }
    else if (b.id === 'reroll' || b.id === 'newmap') {
      if (memo.mode === 'world' && ed && !confirm('This starts a fresh map and throws away your hand edits. Continue?')) return;
      if (memo.mode === 'world') discardEdits();
      o.seed = randomSeed();
      if (b.id === 'newmap') {
        const rr = rng(o.seed + ':opts');
        if (memo.mode === 'world') { o.shape = rr.pick(['continent', 'large', 'twin', 'archipelago', 'coast']); o.land = +rr.range(0.32, 0.55).toFixed(2); o.realms = rr.int(2, 6); o.towns = rr.int(10, 24); }
        else { o.name = placeName(rr); o.coast = rr.chance(0.4); o.river = rr.chance(0.7); }
      }
      drawControls(); regen();
    } else if (b.id === 'save') saveDialog();
  });

  function saveDialog() {
    if (busy || !data) return;
    const mode = data.mode, o = memo[mode];
    const maps = W().maps;
    const isWorld = mode === 'world';
    const existing = isWorld && editMapId ? getMap(editMapId) : null;
    openModal(`<h2>Save map</h2>
      ${existing ? `<div class="seg" id="smode" style="margin-bottom:8px"><button data-sm="update" class="on">Update “${esc(existing.name)}”</button><button data-sm="new">Save as a new map</button></div>` : ''}
      <label>Map name</label><input id="sn" value="${esc(existing?.name || o.name || (isWorld ? 'World map' : 'City map'))}">
      <label class="check"><input type="checkbox" id="spins" checked> Add pins for ${isWorld ? 'every town and capital' : 'landmarks and districts'}</label>
      <label class="check"><input type="checkbox" id="sent" ${isWorld ? 'checked' : ''}> Create World Bible entries ${isWorld ? '(towns as Locations, realms as Factions)' : '(landmarks & districts as Locations)'}</label>
      <label>Opens from a pin on</label>
      <select id="sparent"><option value="">— nothing (top-level map) —</option>${maps.map(m => `<option value="${m.id}" ${link?.parent === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <div id="spinwrap"></div>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save map</button></div>`, m => {
      const drawPinSel = () => {
        const pm = getMap(m.querySelector('#sparent').value);
        m.querySelector('#spinwrap').innerHTML = pm ? `<label>Which pin?</label><select id="spin"><option value="">— add a new pin in the middle —</option>${pm.pins.map(p => `<option value="${p.id}" ${link?.pin === p.id ? 'selected' : ''}>${esc(p.label || getEntry(p.entryId)?.name || 'Unnamed pin')}</option>`).join('')}</select>` : '';
      };
      drawPinSel();
      m.querySelector('#sparent').onchange = drawPinSel;
      let smode = existing ? 'update' : 'new';
      const syncMode = () => {
        m.querySelectorAll('[data-sm]').forEach(x => x.classList.toggle('on', x.dataset.sm === smode));
        m.querySelector('#sparent').closest('label') && (m.querySelector('#sparent').disabled = smode === 'update');
        m.querySelector('#sparent').style.opacity = smode === 'update' ? 0.5 : 1;
      };
      if (existing) syncMode();
      m.addEventListener('click', ev => {
        if (ev.target.dataset.sm) { smode = ev.target.dataset.sm; syncMode(); return; }
        const a = ev.target.dataset.a; if (!a) return;
        if (a === 'no') return closeModal();
        const opts = {
          name: m.querySelector('#sn').value.trim() || 'Generated map',
          pins: m.querySelector('#spins').checked, entries: m.querySelector('#sent').checked,
          parent: m.querySelector('#sparent').value, pin: m.querySelector('#spin')?.value || '',
          update: smode === 'update' ? existing : null,
        };
        closeModal();
        toast('Saving map…');
        commit(opts).then(map => { toast('Map saved'); go(`#/map/${map.id}`); }).catch(e => { console.error(e); toast('Couldn’t save the map — ' + e.message); });
      });
    });
  }

  async function commit(opts) {
    const w = W();
    const isWorld = data.mode === 'world';
    const res = data.result;
    const pic = await A.storeImage(canvas, { quality: 0.88 });
    // keep the editable terrain with world maps so they can be reopened in the editor later
    let gen = null;
    if (isWorld) {
      const state = ed || makeEditState(data.gen);
      gen = { kind: 'world', edit: await A.storeBlob(await editToBlob(state, { ...memo.world })), style: memo.world.style };
    }
    if (opts.update) {
      const map = opts.update;
      map.name = opts.name; map.image = pic.ref; map.w = canvas.width; map.h = canvas.height; map.gen = gen;
      map.scale = { pxPerUnit: res.pxPerUnit, unit: 'miles' };
      // move pins that match a town, add pins for new towns, leave everything else alone
      const pinName = p => (p.label || getEntry(p.entryId)?.name || '').toLowerCase();
      for (const p of res.pins) {
        const pin = map.pins.find(x => pinName(x) === p.name.toLowerCase());
        if (pin) { pin.x = p.x; pin.y = p.y; continue; }
        if (!opts.pins) continue;
        let ent = null;
        if (opts.entries) {
          ent = w.entries.find(x => x.name.toLowerCase() === p.name.toLowerCase());
          if (!ent) { ent = newEntry('location', p.name); ent.summary = `${p.capital ? 'Capital' : p.port ? 'Port town' : 'Town'}${p.realm ? ' in ' + p.realm : ''}.`; ent.tags = ['generated']; }
        }
        map.pins.push({ id: uid(), x: p.x, y: p.y, label: ent ? '' : p.name, entryId: ent?.id || '', submapId: '', color: p.capital ? '#d4a24c' : '', quiet: true });
      }
      save();
      return map;
    }
    const map = {
      id: uid(), name: opts.name, image: pic.ref, w: canvas.width, h: canvas.height,
      parentId: opts.parent || '', scale: { pxPerUnit: res.pxPerUnit, unit: isWorld ? 'miles' : 'feet' }, pins: [], ...(gen ? { gen } : {}),
    };
    const findOrCreate = (name, type, summary, fields) => {
      let e = w.entries.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!e) {
        e = newEntry(type, name);
        e.summary = summary;
        for (const [k2, v] of Object.entries(fields)) { const f = e.fields.find(x => x.k === k2); if (f) f.v = v; else e.fields.push({ k: k2, v }); }
        e.tags = ['generated'];
      }
      return e;
    };
    const rel = (from, to, label) => { if (!w.relations.some(r => r.from === from && r.to === to)) w.relations.push({ id: uid(), from, to, label }); };

    // parent pin
    let parentEntry = null;
    if (opts.parent) {
      const pm = getMap(opts.parent);
      if (pm) {
        let pin = pm.pins.find(p => p.id === opts.pin);
        if (!pin) { pin = { id: uid(), x: pm.w / 2, y: pm.h / 2, label: opts.name, entryId: '', submapId: '', color: '' }; pm.pins.push(pin); }
        pin.submapId = map.id;
        parentEntry = getEntry(pin.entryId);
      }
    }

    if (isWorld) {
      const realmEntries = {};
      if (opts.entries) for (const rl of data.gen.realms) {
        realmEntries[rl.name] = findOrCreate(rl.name, 'faction', `A realm of ${opts.name}.`, { Headquarters: rl.capital.name });
      }
      for (const p of res.pins) {
        let ent = null;
        if (opts.entries) {
          ent = findOrCreate(p.name, 'location', `${p.capital ? 'Capital' : p.port ? 'Port town' : 'Town'}${p.realm ? ' in ' + p.realm : ''}.`,
            { Kind: p.capital ? 'Capital city' : p.port ? 'Port town' : 'Town' });
          const re = realmEntries[p.realm];
          if (re) { if (p.capital) rel(re.id, ent.id, 'rules from'); else rel(ent.id, re.id, 'part of'); }
        }
        if (opts.pins) map.pins.push({ id: uid(), x: p.x, y: p.y, label: ent ? '' : p.name, entryId: ent?.id || '', submapId: '', color: p.capital ? '#d4a24c' : '', quiet: true });
      }
    } else {
      for (const p of res.pins) {
        let ent = null;
        if (opts.entries) {
          ent = findOrCreate(p.name === 'Market Square' || p.name === 'Castle' || p.name === 'The Docks' || p.name === 'Royal Gardens' ? `${p.name} of ${opts.name}` : p.name,
            'location', `${p.kind === 'district' ? 'A district' : 'A landmark'} of ${opts.name}.`, { Kind: p.kind === 'district' ? 'District' : 'Landmark' });
          if (parentEntry) rel(ent.id, parentEntry.id, 'located in');
        }
        if (opts.pins) map.pins.push({ id: uid(), x: p.x, y: p.y, label: ent ? '' : p.name, entryId: ent?.id || '', submapId: '', color: p.kind === 'district' ? '#a5a5c7' : '', quiet: true });
      }
    }
    w.maps.push(map);
    save();
    return map;
  }

  async function boot() {
    if (editMapId) {
      const m = getMap(editMapId);
      try {
        if (!m?.gen?.edit) throw new Error('not editable');
        const blob = await A.getBlob(m.gen.edit);
        if (!blob) throw new Error('missing');
        const st = await editFromBlob(blob);
        memo.mode = 'world';
        memo.world = { ...WORLD_DEFAULTS, ...st.o, name: st.o.name || m.name };
        ed = st.edit; editing = true; edVersion++;
      } catch (e) {
        console.error(e);
        toast('Couldn’t open that map for editing — its terrain file is missing');
        editMapId = '';
      }
    }
    drawControls();
    regen();
  }
  boot();
  return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); };
}
