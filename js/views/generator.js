import { W, uid, save, getMap, getEntry, newEntry } from '../store.js';
import { esc, query, go, toast, openModal, closeModal, promptDialog } from '../util.js';
import { randomSeed, ensureFonts, drawFrame, drawCompass, drawScaleBar, drawCartouche } from '../gen/core.js';
import { generateWorld, renderWorld, WORLD_DEFAULTS, WORLD_SIZES, worldUnits, worldFrameStyle, makeEditState, cloneEdit, applyBrush, drawEditPreview,
  editToBlob, editFromBlob, BIOME_LABELS, REALM_COLORS } from '../gen/world.js';
import { generateCity, renderCity, CITY_DEFAULTS, CITY_EXTENTS, cityFrameStyle, citySubtitle, ROOF_SWATCHES, ROAD_SWATCHES, cloneCity, cityBrush, setCityWall, addCityRoad, nearestRoad, removeCityRoad, cityToBlob, cityFromBlob } from '../gen/city.js';
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
const MODE_STYLES = { world: Object.keys(STYLE_SWATCH), city: ['parchment', 'atlas', 'night', 'storybook', 'quill'] };

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

const CITY_TOOLS = [
  ['Buildings', [['bld-add', '🏠', 'Add'], ['bld-del', '🧹', 'Remove'], ['bld-paint', '🎨', 'Paint roofs']]],
  ['Nature', [['tree-add', '🌳', 'Add trees'], ['tree-del', '🪓', 'Clear trees']]],
  ['Walls & roads', [['wall', '🧱', 'Draw wall'], ['road', '🛣️', 'Draw road'], ['road-paint', '🖌️', 'Colour road'], ['road-del', '✂️', 'Remove road']]],
];
const CITY_HELP = {
  'bld-add': 'Drag to fill an area with houses. They line up with the nearest street.', 'bld-del': 'Drag over buildings to knock them down.',
  'bld-paint': 'Drag over buildings to repaint their roofs.', 'tree-add': 'Drag to plant trees.', 'tree-del': 'Drag to clear trees.',
  wall: 'Click around the town to place wall corners. Click the first corner again, double-click or press Enter to close the loop. Gates open where roads cross.',
  road: 'Click to place points along a road; double-click or press Enter to finish. Houses in the way are cleared.',
  'road-paint': 'Click a road to give it the colour below.', 'road-del': 'Click a road to remove it.',
};

// remembered between visits in this session
const memo = { mode: 'world', world: { ...WORLD_DEFAULTS, seed: randomSeed() }, city: { ...CITY_DEFAULTS, seed: randomSeed() },
  tool: { tool: 'raise', size: 8, strength: 0.5, biome: 2, realm: -2 },
  ctool: { tool: 'bld-add', size: 70, roof: '', road: '#b8946a' } };
const BW = 1000; // layout width of the zoomable map

export function render(main) {
  const q = query();
  if (q.mode === 'city' || q.mode === 'world') memo.mode = q.mode;
  if (q.name && memo.mode === 'city') memo.city.name = q.name;
  if (!memo.world.name) memo.world.name = W().name;
  if (!memo.city.name) memo.city.name = placeName(rng(memo.city.seed));
  const link = q.parent ? { parent: q.parent, pin: q.pin || '' } : null;

  let data = null, lastKey = '', timer = null, busy = false, pending = false;
  // world editor state
  let ed = null, wEdit = false, selTown = -1, edVersion = 0;
  // city editor state
  let ced = null, cEdit = false, cVersion = 0, poly = null;
  let undoStack = [], redoStack = [];
  let editMapId = q.edit || '';
  let pendingShots = [];
  const editing = () => memo.mode === 'world' ? wEdit : cEdit;

  const canvas = document.createElement('canvas');
  const ov = document.createElement('canvas'); ov.className = 'gen-overlay';
  const cov = document.createElement('canvas'); cov.className = 'gen-overlay city-ov';
  const cur = document.createElement('div'); cur.className = 'brush-cur';
  const mark = document.createElement('div'); mark.className = 'town-mark';
  const zw = document.createElement('div'); zw.className = 'gen-zoom';
  const det = document.createElement('canvas'); det.className = 'gen-detail';
  zw.append(canvas, det, ov, cov, cur, mark);

  function styleButtons(o) {
    return MODE_STYLES[memo.mode].map(s => `<button class="swatch ${o.style === s ? 'on' : ''}" data-style="${s}" title="${esc(STYLE_HINT[s] || STYLE_LABEL[s])}"><span style="background:${STYLE_SWATCH[s]}"></span>${STYLE_LABEL[s]}</button>`).join('');
  }

  // map size: presets in km × km, or your own
  function sizeHTML(o, list, key, unit, step) {
    const cur = o[key] || (o.mapW ? 'custom' : list[1][0]);
    const fmt = v => (+v).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<label>Map size <span class="muted">— the area you have to work with</span></label>
      <select data-k="${key}">${list.map(([v, l, w, h]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}${w ? ` · ${fmt(w)} × ${fmt(h)} ${unit}` : ''}</option>`).join('')}${!o.mapW ? '<option value="legacy" selected>Original size</option>' : ''}</select>
      ${cur === 'custom' ? `<div class="row"><div><label>Width (${unit})</label><input type="number" data-k="mapW" data-num min="${step}" step="${step}" value="${o.mapW || ''}"></div>
        <div><label>Height (${unit})</label><input type="number" data-k="mapH" data-num min="${step}" step="${step}" value="${o.mapH || ''}"></div></div>` : ''}`;
  }

  function controlsHTML() {
    const mode = memo.mode, o = memo[mode];
    if (mode === 'world' && wEdit) return editHTML();
    if (mode === 'city' && cEdit) return cityEditHTML();
    const common = `
      <label>Map title</label><input data-k="name" value="${esc(o.name)}" placeholder="${mode === 'world' ? 'e.g. The Shattered Coast' : 'e.g. Saltmere'}">
      <label>Seed <span class="muted">— same seed, same map</span></label>
      <div class="row"><input data-k="seed" value="${esc(o.seed)}"><button class="shrink" id="reroll" title="Random seed">🎲</button></div>`;
    const world = `
      <label>Landmass</label>
      <select data-k="shape">${[['continent', 'Single continent'], ['large', 'Large continent'], ['twin', 'Twin continents'], ['archipelago', 'Archipelago'], ['coast', 'Coastal region']].map(([v, l]) => `<option value="${v}" ${o.shape === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${sizeHTML(o, WORLD_SIZES, 'size', 'km', 1)}
      <label>Land vs sea <span class="val">${Math.round(o.land * 100)}% land</span></label><input type="range" data-k="land" data-num min="0.2" max="0.7" step="0.01" value="${o.land}">
      <label>Rivers <span class="val">${o.rivers < 0.3 ? 'Few' : o.rivers < 0.7 ? 'Some' : 'Many'}</span></label><input type="range" data-k="rivers" data-num min="0" max="1" step="0.05" value="${o.rivers}">
      <div class="row">
        <div><label>Realms</label><input type="number" data-k="realms" data-num min="1" max="8" value="${o.realms}"></div>
        <div><label>Towns</label><input type="number" data-k="towns" data-num min="0" max="40" value="${o.towns}"></div>
      </div>
      <label>Climate</label><select data-k="climate">${['cold', 'temperate', 'warm'].map(c => `<option ${o.climate === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
    const city = `
      <label>Size</label>
      <div class="seg small">${['village', 'town', 'city', 'capital'].map(s => `<button data-size="${s}" class="${o.size === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
      ${sizeHTML(o, CITY_EXTENTS, 'extent', 'km', 0.1)}
      <label>Features</label>
      <div class="checks">${[['walls', 'City walls'], ['river', 'River'], ['coast', 'Harbour & sea'], ['castle', 'Castle'], ['temple', 'Temple']].map(([k, l]) =>
        `<label class="check"><input type="checkbox" data-k="${k}" ${o[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>`;
    const hasEdits = mode === 'world' ? ed : ced;
    return `
      <div class="seg" id="mode"><button data-mode="world" class="${mode === 'world' ? 'on' : ''}">🌍 World</button><button data-mode="city" class="${mode === 'city' ? 'on' : ''}">🏰 City</button></div>
      ${hasEdits ? `<p class="small edit-note">✏️ This map has hand edits. Changing the options below starts a fresh map.</p>` : ''}
      ${common}
      ${mode === 'world' ? world : city}
      <label>Style</label><div class="swatches">${styleButtons(o)}</div>
      <button id="startedit" class="edit-btn">✏️ ${hasEdits ? 'Keep editing' : 'Edit this map'} <span class="muted small">— ${mode === 'world' ? 'brushes, biomes, realms, towns' : 'buildings, roofs, walls, roads, trees'}</span></button>
      <div class="gen-actions">
        <button id="newmap">✨ Surprise me</button>
        <button id="shot" title="Save what’s inside the frame as a picture attached to this map">📸 Snapshot</button>
        <button class="primary wide" id="save">💾 ${editMapId ? 'Save' : 'Save to my maps'}</button>
      </div>
      ${shotNote()}
      ${link ? `<p class="small muted" style="margin:10px 0 0">Will open from the pin on <b>${esc(getMap(link.parent)?.name || 'your map')}</b>.</p>` : ''}`;
  }

  const shotNote = () => pendingShots.length ? `<p class="small edit-note">📸 ${pendingShots.length} snapshot${pendingShots.length > 1 ? 's' : ''} will be attached when you save this map.</p>` : '';
  const undoRow = () => `
      <div class="row" style="margin-top:12px">
        <button id="undo" ${undoStack.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button id="redo" ${redoStack.length ? '' : 'disabled'} title="Redo (Ctrl+Y)">↷ Redo</button>
        <button id="reset" class="shrink" title="Throw away all hand edits">⟲</button>
      </div>
      <div class="gen-actions"><button id="shot" title="Save what’s inside the frame as a picture attached to this map">📸 Snapshot</button><button class="primary" id="save">💾 ${editMapId ? 'Save changes' : 'Save to my maps'}</button></div>
      ${shotNote()}`;

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
      ${undoRow()}`;
  }

  function cityEditHTML() {
    const t = memo.ctool, o = memo.city;
    const tools = CITY_TOOLS.map(([g, list]) => `<div class="tg-label">${g}</div><div class="tools">${list.map(([id, ic, lb]) =>
      `<button class="tool ${t.tool === id ? 'on' : ''}" data-ctool="${id}" title="${esc(CITY_HELP[id])}"><span>${ic}</span>${lb}</button>`).join('')}</div>`).join('');
    const brushTools = ['bld-add', 'bld-del', 'bld-paint', 'tree-add', 'tree-del'];
    const size = brushTools.includes(t.tool) ? `<label>Brush size <span class="val">${t.size}</span></label><input type="range" data-ct="size" min="15" max="260" step="5" value="${t.size}">` : '';
    const roof = ['bld-add', 'bld-paint'].includes(t.tool) ? `<label>Roof colour</label><div class="color-row">
        <button class="swatch-dot style-dot ${!t.roof ? 'on' : ''}" data-roof="" title="Use the map style’s colours">✦</button>
        ${ROOF_SWATCHES.map(c => `<button class="swatch-dot ${t.roof === c ? 'on' : ''}" data-roof="${c}" style="background:${c}"></button>`).join('')}
        <input type="color" id="c-roof" value="${t.roof || '#cc5c46'}" title="Any colour"></div>` : '';
    const road = ['road', 'road-paint'].includes(t.tool) ? `<label>Road colour</label><div class="color-row">
        <button class="swatch-dot style-dot ${!t.road ? 'on' : ''}" data-road="" title="Use the map style’s colour">✦</button>
        ${ROAD_SWATCHES.map(c => `<button class="swatch-dot ${t.road === c ? 'on' : ''}" data-road="${c}" style="background:${c}"></button>`).join('')}
        <input type="color" id="c-road" value="${t.road || '#c2beb6'}" title="Any colour"></div>
        ${t.tool === 'road-paint' ? '<button class="small" id="c-allroads" style="margin-top:8px">Colour every road</button>' : ''}` : '';
    const wall = t.tool === 'wall' ? `<div class="row" style="margin-top:8px"><button class="small" id="c-nowall" ${ced.wall ? '' : 'disabled'}>Remove the wall</button></div>` : '';
    const drawing = poly ? `<div class="row" style="margin-top:8px"><button class="small primary" id="c-finish">Finish ${t.tool === 'wall' ? 'wall' : 'road'}</button><button class="small" id="c-cancel">Cancel</button></div>` : '';
    return `
      <div class="edit-head"><b>✏️ Editing ${esc(o.name || 'city')}</b><button class="small" id="enddone">Done</button></div>
      ${tools}
      <p class="small muted tool-help">${esc(CITY_HELP[t.tool])}</p>
      ${size}${roof}${road}${wall}${drawing}
      <p class="small muted" style="margin:10px 0 0">${ced.buildings.length} buildings · ${ced.roads.length} roads · ${ced.trees.length} trees</p>
      <label>Style</label><div class="swatches">${styleButtons(o)}</div>
      ${undoRow()}`;
  }

  main.innerHTML = `
    <div class="page-head gen-head"><h1>Map generator</h1>
      <span class="muted small gen-hint">Scroll to zoom · drag to move${''}</span>
      <div class="zoom-bar"><button id="z-out" title="Zoom out">－</button><button id="z-in" title="Zoom in">＋</button><button id="z-fit" title="Fit the whole map in the frame">⤢ Fit</button></div></div>
    <div class="gen-shell">
      <div class="card gen-controls" id="ctl"></div>
      <div class="gen-preview" id="pv">
        <canvas class="gen-frame" id="fur"></canvas>
        <div class="gen-busy" id="busy"><div class="spinner"></div><span>Drawing your map…</span></div>
      </div>
    </div>`;
  const ctl = main.querySelector('#ctl'), pv = main.querySelector('#pv'), busyEl = main.querySelector('#busy'), fur = main.querySelector('#fur');
  pv.prepend(zw);

  const drawControls = () => {
    ctl.innerHTML = controlsHTML();
    pv.classList.toggle('editing', editing());
    pv.dataset.tool = editing() ? (memo.mode === 'world' ? memo.tool.tool : memo.ctool.tool) : '';
    drawMark();
  };

  // ---------- zoom & pan ----------
  const view = { k: 1, x: 0, y: 0, fitted: true, fitK: 1 };
  const applyView = () => { zw.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; drawFurniture(); scheduleDetail(); };
  const PAD = 34; // room for the frame
  function fit() {
    const r = pv.getBoundingClientRect();
    const h = BW * (canvas.height / canvas.width || 0.625);
    zw.style.height = h + 'px';
    view.fitK = view.k = Math.min((r.width - PAD * 2) / BW, (r.height - PAD * 2) / h);
    view.x = (r.width - BW * view.k) / 2; view.y = (r.height - h * view.k) / 2;
    view.fitted = true; applyView();
  }
  // ---------- frame, title, compass & scale pinned to the view ----------
  const frameStyle = () => memo.mode === 'world' ? worldFrameStyle(memo.world.style) : cityFrameStyle(memo.city.style);
  function paintFurniture(ctx, w, h, s, scr) {
    if (!data?.gen) return;
    const fs = frameStyle(), g = data.gen;
    const title = memo[memo.mode].name || (memo.mode === 'world' ? 'Untitled Realm' : 'Unnamed Town');
    const sub = memo.mode === 'world' ? `${g.realms.length} realms · ${g.towns.length} settlements` : citySubtitle(g);
    const cs = Math.min(1, w / (1100 * s)) * s;
    drawFrame(ctx, w, h, fs.ink, fs.paper, s);
    drawCartouche(ctx, 30 * s, 30 * s, title, sub, fs.ink, fs.paper, cs * 0.8);
    drawCompass(ctx, w - 78 * s, h - 92 * s, 46 * s, fs.ink, fs.paper, 'rgb(181,72,63)');
    if (memo.mode === 'world') { const u = worldUnits(g.o); drawScaleBar(ctx, 46 * s, h - 46 * s, canvas.width / u.per * scr, u.unit, fs.ink, fs.paper, s); }
    else drawScaleBar(ctx, 46 * s, h - 46 * s, g.s / 230 * (g.u || 1) * scr, 'feet', fs.ink, fs.paper, s);
  }
  function drawFurniture() {
    const r = pv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    fur.width = Math.round(r.width * dpr); fur.height = Math.round(r.height * dpr);
    const ctx = fur.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cr = canvas.getBoundingClientRect();
    paintFurniture(ctx, r.width, r.height, 1, cr.width / (canvas.width || 1));
  }
  // ---------- sharp zoom: redraw just the visible part at screen resolution ----------
  let detTimer = null, detBusy = false;
  const scheduleDetail = () => { clearTimeout(detTimer); detTimer = setTimeout(renderDetail, 220); };
  function visibleRect() {
    const cr = canvas.getBoundingClientRect(), pr = pv.getBoundingClientRect(), scr = cr.width / canvas.width;
    const x0 = Math.max(0, (pr.left - cr.left) / scr), y0 = Math.max(0, (pr.top - cr.top) / scr);
    const x1 = Math.min(canvas.width, (pr.right - cr.left) / scr), y1 = Math.min(canvas.height, (pr.bottom - cr.top) / scr);
    return { x0, y0, x1, y1, scr };
  }
  async function renderDetail() {
    if (!data?.gen || !canvas.width) return;
    if (busy || detBusy || stroke || pan) { scheduleDetail(); return; }
    const dpr = devicePixelRatio || 1, v = visibleRect();
    if (v.scr * dpr <= 1.05 || v.x1 <= v.x0 || v.y1 <= v.y0) { det.style.display = 'none'; return; }
    const s = Math.min(v.scr * dpr, 8);
    const view = { x: v.x0, y: v.y0, w: v.x1 - v.x0, h: v.y1 - v.y0, s };
    detBusy = true; busyEl.classList.add('soft', 'on');
    await new Promise(r => setTimeout(r, 20));
    try {
      const tmp = document.createElement('canvas');
      if (memo.mode === 'world') renderWorld(data.gen, tmp, memo.world.style, { view, furniture: false });
      else renderCity(data.gen, tmp, memo.city.style, { view, furniture: false });
      det.width = tmp.width; det.height = tmp.height;
      det.getContext('2d').drawImage(tmp, 0, 0);
      const f = BW / canvas.width;
      Object.assign(det.style, { display: 'block', left: view.x * f + 'px', top: view.y * f + 'px', width: view.w * f + 'px', height: view.h * f + 'px' });
    } catch (e) { console.error(e); }
    detBusy = false; if (!busy) busyEl.classList.remove('on');
  }
  function zoomAt(f, cx, cy) {
    const r = pv.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const nk = Math.min(view.fitK * 14, Math.max(view.fitK * 0.35, view.k * f));
    view.x = cx - (cx - view.x) * (nk / view.k); view.y = cy - (cy - view.y) * (nk / view.k);
    view.k = nk; view.fitted = false; applyView();
  }
  pv.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = pv.getBoundingClientRect();
    zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  main.querySelector('#z-in').onclick = () => zoomAt(1.4);
  main.querySelector('#z-out').onclick = () => zoomAt(1 / 1.4);
  main.querySelector('#z-fit').onclick = fit;
  let pan = null, spaceDown = false;
  pv.addEventListener('pointerdown', ev => {
    const wantPan = ev.button === 1 || ev.button === 2 || spaceDown || (ev.button === 0 && !editing());
    if (!wantPan || ev.target.closest('.zoom-btns')) return;
    ev.preventDefault(); ev.stopPropagation();
    pv.setPointerCapture(ev.pointerId);
    pan = { sx: ev.clientX, sy: ev.clientY, x: view.x, y: view.y };
    pv.classList.add('panning');
  }, true);
  pv.addEventListener('pointermove', ev => {
    if (!pan) return;
    view.x = pan.x + ev.clientX - pan.sx; view.y = pan.y + ev.clientY - pan.sy; view.fitted = false; applyView();
  });
  const endPan = () => { if (pan) { pan = null; pv.classList.remove('panning'); } };
  pv.addEventListener('pointerup', endPan); pv.addEventListener('pointercancel', endPan);
  pv.addEventListener('contextmenu', ev => ev.preventDefault());

  async function regen(force = false) {
    if (busy) { pending = true; return; }
    const mode = memo.mode, o = memo[mode];
    const key = mode + JSON.stringify({ ...o, style: '', name: '' }) + (mode === 'world' && ed ? ':e' + edVersion : '') + (mode === 'city' && ced ? ':c' + cVersion : '');
    busy = true;
    busyEl.classList.toggle('soft', !!(editing() || ed || ced || data));
    busyEl.classList.add('on');
    await ensureFonts();
    await new Promise(r => setTimeout(r, 30));
    const prevW = canvas.width, prevH = canvas.height;
    try {
      if (force || key !== lastKey || !data || data.mode !== mode) {
        data = { mode, gen: mode === 'world' ? generateWorld(o, ed) : (ced || generateCity(o)) };
        lastKey = key;
      }
      data.gen.o.name = o.name;
      data.gen.o.style = o.style;
      data.result = mode === 'world' ? renderWorld(data.gen, canvas, o.style, { furniture: false }) : renderCity(data.gen, canvas, o.style, { furniture: false });
      // beyond the map's edge, continue the colour of its own border so the frame looks seamless
      try { const px = canvas.getContext('2d').getImageData(4, Math.round(canvas.height / 2), 1, 1).data; pv.style.background = `rgb(${px[0]},${px[1]},${px[2]})`; }
      catch { pv.style.background = frameStyle().back; }
      det.style.display = 'none';
    } catch (e) { console.error(e); toast('Something went wrong drawing that map — try another seed'); }
    busy = false; busyEl.classList.remove('on');
    ov.classList.remove('on');
    if (view.fitted || prevW !== canvas.width || prevH !== canvas.height) fit(); else { drawFurniture(); scheduleDetail(); }
    drawMark();
    if (pending) { pending = false; regen(); }
  }
  const schedule = (ms = 350) => { clearTimeout(timer); timer = setTimeout(() => regen(), ms); };

  // ---------- editing (shared) ----------
  const snap = () => memo.mode === 'world' ? cloneEdit(ed) : cloneCity(ced);
  const restore = st => { if (memo.mode === 'world') ed = st; else ced = st; };
  const pushUndo = () => { undoStack.push(snap()); if (undoStack.length > 30) undoStack.shift(); redoStack = []; };
  const changed = () => { if (memo.mode === 'world') edVersion++; else { cVersion++; ced.o = { ...ced.o }; } schedule(60); };
  function startEditing() {
    if (!data) return;
    if (memo.mode === 'world') {
      if (data.mode !== 'world') return;
      if (!ed) { ed = makeEditState(data.gen); edVersion++; lastKey = ''; }
      wEdit = true; selTown = -1;
    } else {
      if (data.mode !== 'city') return;
      if (!ced) { ced = cloneCity(data.gen); cVersion++; lastKey = ''; }
      cEdit = true;
    }
    drawControls();
  }
  function discardEdits(mode = memo.mode) {
    if (mode === 'world') { ed = null; wEdit = false; selTown = -1; edVersion++; }
    else { ced = null; cEdit = false; poly = null; drawPoly(); cVersion++; }
    undoStack = []; redoStack = [];
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); selTown = -1; poly = null; drawPoly(); drawControls(); changed(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); selTown = -1; drawControls(); changed(); }
  const relPos = ev => { const rc = canvas.getBoundingClientRect(); return [(ev.clientX - rc.left) / rc.width, (ev.clientY - rc.top) / rc.height]; };
  const gdim = () => { const g = ed || data?.gen; return [g?.GW || 320, g?.GH || 200]; };
  const gridPos = ev => { const [fx, fy] = relPos(ev), [GW, GH] = gdim(); return [fx * GW - 0.5, fy * GH - 0.5]; };
  // city positions are in the map's design pixels (the picture is u of those)
  const cu = () => (ced || data?.gen)?.u || 1;
  const cityPos = ev => { const [fx, fy] = relPos(ev), g = ced || data.gen; return [fx * g.W, fy * g.H]; };
  const cityTol = px => px / (canvas.getBoundingClientRect().width / canvas.width) / cu();
  const lay = () => [BW, BW * canvas.height / canvas.width];
  function drawMark() {
    const tw = memo.mode === 'world' && wEdit && memo.tool.tool === 'town' && selTown >= 0 ? ed?.towns[selTown] : null;
    mark.style.display = tw ? 'block' : 'none';
    if (tw) { const [lw, lh] = lay(), [GW, GH] = gdim(); mark.style.left = (tw.gx + 0.5) / GW * lw + 'px'; mark.style.top = (tw.gy + 0.5) / GH * lh + 'px'; }
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
  // wall / road outline being drawn (city)
  function drawPoly(hover) {
    cov.width = canvas.width || 2000; cov.height = canvas.height || 1600;
    const c = cov.getContext('2d'), u = cu();
    c.clearRect(0, 0, cov.width, cov.height);
    if (!poly || !poly.length) return;
    c.setTransform(u, 0, 0, u, 0, 0);
    const lw = 1 / u;
    const pts = hover ? [...poly, hover] : poly;
    c.lineJoin = c.lineCap = 'round';
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    if (memo.ctool.tool === 'wall' && hover && poly.length > 2) c.lineTo(...poly[0]);
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 14 * lw; c.stroke();
    c.strokeStyle = memo.ctool.tool === 'wall' ? '#d8d2c4' : (memo.ctool.road || '#c2beb6'); c.lineWidth = 8 * lw; c.stroke();
    for (const [i, p] of poly.entries()) { c.beginPath(); c.arc(p[0], p[1], (i === 0 && memo.ctool.tool === 'wall' ? 11 : 7) * lw, 0, Math.PI * 2); c.fillStyle = i === 0 ? '#d4a24c' : '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2 * lw; c.stroke(); }
  }
  function finishPoly() {
    if (!poly) return;
    const t = memo.ctool.tool, pts = poly; poly = null; drawPoly();
    if (t === 'wall' && pts.length >= 3) { pushUndo(); setCityWall(ced, pts); changed(); }
    else if (t === 'road' && pts.length >= 2) { pushUndo(); addCityRoad(ced, pts); if (memo.ctool.road) ced.roadColors[ced.roads.length - 1] = memo.ctool.road; changed(); }
    drawControls();
  }

  let stroke = null;
  canvas.addEventListener('pointermove', ev => {
    if (!editing() || pan) return;
    const rc = canvas.getBoundingClientRect(), [lw] = lay();
    const showCur = memo.mode === 'world' ? memo.tool.tool !== 'town' : ['bld-add', 'bld-del', 'bld-paint', 'tree-add', 'tree-del'].includes(memo.ctool.tool);
    if (showCur) {
      const d = memo.mode === 'world' ? memo.tool.size * 2 / gdim()[0] * lw : memo.ctool.size * 2 * cu() / canvas.width * lw;
      cur.style.width = cur.style.height = d + 'px';
      cur.style.left = (ev.clientX - rc.left) / rc.width * lw + 'px'; cur.style.top = (ev.clientY - rc.top) / rc.width * lw + 'px';
      cur.style.display = 'block';
    } else cur.style.display = 'none';
    if (memo.mode === 'city') {
      if (poly) drawPoly(cityPos(ev));
      if (stroke?.kind === 'cbrush') {
        const [x, y] = cityPos(ev), step = Math.max(6, memo.ctool.size * 0.35);
        if (Math.hypot(x - stroke.x, y - stroke.y) >= step) { if (cityDab(x, y)) stroke.dirty = true; stroke.x = x; stroke.y = y; }
      }
      return;
    }
    if (!stroke) return;
    const t = memo.tool;
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
      const [GW, GH] = gdim();
      const tw = ed.towns[stroke.i]; tw.gx = Math.max(0, Math.min(GW - 1, gx)); tw.gy = Math.max(0, Math.min(GH - 1, gy));
      drawMark();
    }
  });
  canvas.addEventListener('pointerleave', () => { cur.style.display = 'none'; });
  const dab = (gx, gy) => {
    const t = memo.tool;
    applyBrush(ed, t.tool, gx, gy, t.size, t.strength, t.tool === 'biome' ? +t.biome : t.tool === 'realm' ? +t.realm : 0);
  };
  const cityDab = (x, y) => {
    const t = memo.ctool;
    const ok = cityBrush(ced, t.tool, x, y, t.size, t.roof || null);
    if (ok) { const c = cov.getContext('2d'), u = cu(); c.setTransform(u, 0, 0, u, 0, 0); c.beginPath(); c.arc(x, y, t.size, 0, Math.PI * 2); c.fillStyle = t.tool.endsWith('del') ? 'rgba(255,80,60,.18)' : 'rgba(255,255,255,.18)'; c.fill(); }
    return ok;
  };
  canvas.addEventListener('pointerdown', ev => {
    if (!editing() || ev.button !== 0 || spaceDown) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    if (memo.mode === 'city') {
      const t = memo.ctool, p = cityPos(ev);
      if (t.tool === 'wall' || t.tool === 'road') {
        if (!poly) poly = [];
        if (t.tool === 'wall' && poly.length > 2 && Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]) < cityTol(24)) { finishPoly(); return; }
        const last = poly[poly.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) poly.push(p);
        drawPoly(); if (poly.length === 1) drawControls();
        return;
      }
      if (t.tool === 'road-paint' || t.tool === 'road-del') {
        const tol = cityTol(18);
        const i = nearestRoad(ced, p, tol + ced.roadW / 2);
        if (i < 0) { toast('Click right on a road'); return; }
        pushUndo();
        if (t.tool === 'road-del') removeCityRoad(ced, i); else ced.roadColors[i] = t.road || null;
        drawControls(); changed(); return;
      }
      pushUndo();
      drawPoly();
      stroke = { kind: 'cbrush', x: p[0], y: p[1], dirty: cityDab(p[0], p[1]) };
      return;
    }
    const [gx, gy] = gridPos(ev), t = memo.tool;
    if (t.tool === 'town') {
      const rc = canvas.getBoundingClientRect();
      const i = nearestTown(gx, gy, 14 / rc.width * gdim()[0] + 0.8);
      if (i >= 0) { selTown = i; stroke = { kind: 'town', i, x: gx, y: gy, moved: false }; drawControls(); return; }
      const c = Math.round(gy) * gdim()[0] + Math.round(gx);
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
  canvas.addEventListener('dblclick', ev => { if (memo.mode === 'city' && cEdit && poly) { ev.preventDefault(); finishPoly(); } });
  const endStroke = () => {
    if (!stroke) return;
    const s0 = stroke; stroke = null;
    if (s0.kind === 'cbrush') { if (s0.dirty) { drawControls(); changed(); } else { undoStack.pop(); drawPoly(); } return; }
    if (s0.kind === 'brush' || s0.moved) { drawControls(); changed(); }
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  const onResize = () => { if (view.fitted) fit(); drawMark(); };
  window.addEventListener('resize', onResize);
  const typing = ev => ev.target.matches?.('input,textarea,select');
  const onKey = ev => {
    if (ev.code === 'Space' && !typing(ev)) { if (!spaceDown) { spaceDown = true; pv.classList.add('space-pan'); } ev.preventDefault(); return; }
    if (!editing() || typing(ev)) return;
    if (poly && ev.key === 'Enter') { ev.preventDefault(); finishPoly(); return; }
    if (poly && ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); poly = null; drawPoly(); drawControls(); return; }
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); ev.stopImmediatePropagation(); undo(); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); ev.stopImmediatePropagation(); redo(); }
  };
  const onKeyUp = ev => { if (ev.code === 'Space') { spaceDown = false; pv.classList.remove('space-pan'); } };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);

  // ---------- controls ----------
  let nameUndoArmed = true;
  ctl.addEventListener('input', e => {
    const t = e.target;
    if (editing()) {
      if (t.dataset.t || t.dataset.ct) {
        const key = t.dataset.t || t.dataset.ct, tool = t.dataset.t ? memo.tool : memo.ctool;
        tool[key] = t.type === 'range' ? +t.value : t.value;
        const val = t.previousElementSibling?.querySelector?.('.val');
        if (val) val.textContent = key === 'strength' ? Math.round(+t.value * 100) + '%' : t.value;
        return;
      }
      if (t.id === 'c-roof') { memo.ctool.roof = t.value; ctl.querySelectorAll('[data-roof]').forEach(x => x.classList.remove('on')); return; }
      if (t.id === 'c-road') { memo.ctool.road = t.value; ctl.querySelectorAll('[data-road]').forEach(x => x.classList.remove('on')); return; }
      if (t.id === 'tw-name' && selTown >= 0) { if (nameUndoArmed) { pushUndo(); nameUndoArmed = false; } ed.towns[selTown].name = t.value; changed(); return; }
      if (t.dataset.rn != null) { const rl = ed.realms.find(x => x.id === +t.dataset.rn); if (rl) { rl.name = t.value; changed(); } return; }
      if (t.dataset.rc != null) { const rl = ed.realms.find(x => x.id === +t.dataset.rc); if (rl) { rl.color = t.value; changed(); } return; }
      return;
    }
    const k = t.dataset.k; if (!k) return;
    const o = memo[memo.mode];
    const hasEdits = memo.mode === 'world' ? ed : ced;
    if (hasEdits && k !== 'name') {
      if (!confirm('Changing this starts a fresh map and throws away your hand edits. Continue?')) { drawControls(); return; }
      discardEdits(); drawControls();
    }
    if (t.type === 'checkbox') o[k] = t.checked;
    else o[k] = t.dataset.num != null ? +t.value : t.value;
    if (k === 'name' && ced) ced.o.name = t.value;
    if (k === 'size' && memo.mode === 'world' || k === 'extent') {
      const pr = (memo.mode === 'world' ? WORLD_SIZES : CITY_EXTENTS).find(x => x[0] === t.value);
      if (pr && pr[2]) { o.mapW = pr[2]; o.mapH = pr[3]; }
      else if (!o.mapW) { o.mapW = memo.mode === 'world' ? 1200 : 1.5; o.mapH = memo.mode === 'world' ? 750 : 1.2; }
      view.fitted = true; drawControls();
    }
    if ((k === 'mapW' || k === 'mapH') && !(o[k] > 0)) return;
    if (k === 'mapW' || k === 'mapH') view.fitted = true;
    if (k === 'name') drawFurniture();
    const val = t.previousElementSibling?.querySelector?.('.val');
    if (val && k === 'land') val.textContent = Math.round(o.land * 100) + '% land';
    if (val && k === 'rivers') val.textContent = o.rivers < 0.3 ? 'Few' : o.rivers < 0.7 ? 'Some' : 'Many';
    schedule(t.type === 'range' || t.type === 'text' || t.type === 'number' ? 450 : 50);
  });
  ctl.addEventListener('change', e => {
    const t = e.target;
    if (!editing()) return;
    if (t.id === 'tw-cap' && selTown >= 0) { pushUndo(); makeCapital(ed.towns[selTown], t.checked); drawControls(); changed(); }
    if (t.dataset.t === 'biome' || t.dataset.t === 'realm') memo.tool[t.dataset.t] = +t.value;
    if (t.id === 'c-roof' || t.id === 'c-road') drawControls();
  });
  ctl.addEventListener('focusin', e => { if (e.target.id === 'tw-name') nameUndoArmed = true; });
  ctl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const o = memo[memo.mode];
    if (b.dataset.tool) { memo.tool.tool = b.dataset.tool; if (b.dataset.tool !== 'town') selTown = -1; if (b.dataset.tool === 'realm' && +memo.tool.realm === -2 && ed.realms[0]) memo.tool.realm = ed.realms[0].id; drawControls(); }
    else if (b.dataset.ctool) { if (poly) { poly = null; drawPoly(); } memo.ctool.tool = b.dataset.ctool; drawControls(); }
    else if (b.dataset.roof != null) { memo.ctool.roof = b.dataset.roof; drawControls(); }
    else if (b.dataset.road != null) { memo.ctool.road = b.dataset.road; drawControls(); }
    else if (b.id === 'c-allroads') { pushUndo(); ced.roadColors = ced.roads.map(() => memo.ctool.road || null); changed(); }
    else if (b.id === 'c-nowall') { pushUndo(); setCityWall(ced, null); drawControls(); changed(); }
    else if (b.id === 'c-finish') finishPoly();
    else if (b.id === 'c-cancel') { poly = null; drawPoly(); drawControls(); }
    else if (b.dataset.style) { o.style = b.dataset.style; if (ced && memo.mode === 'city') ced.o = { ...ced.o, style: o.style }; drawControls(); regen(); }
    else if (b.id === 'startedit') startEditing();
    else if (b.id === 'enddone') { wEdit = cEdit = false; poly = null; drawPoly(); cur.style.display = 'none'; drawControls(); }
    else if (b.id === 'undo') undo();
    else if (b.id === 'redo') redo();
    else if (b.id === 'reset') { if (confirm('Throw away every hand edit and go back to the generated map?')) { discardEdits(); drawControls(); regen(true); } }
    else if (b.id === 'tw-done') { selTown = -1; drawControls(); }
    else if (b.id === 'tw-del' && selTown >= 0) { pushUndo(); makeCapital(ed.towns[selTown], false); ed.towns.splice(selTown, 1); selTown = -1; drawControls(); changed(); }
    else if (b.dataset.mode) {
      if (b.dataset.mode === memo.mode) return;
      const hasEdits = memo.mode === 'world' ? ed : ced;
      if (hasEdits && !confirm(`Switching to a ${b.dataset.mode} map throws away your hand edits to this ${memo.mode} map. Continue?`)) return;
      discardEdits();
      memo.mode = b.dataset.mode; view.fitted = true; drawControls(); regen();
    }
    else if (b.dataset.size) {
      if (ced && !confirm('This starts a fresh map and throws away your hand edits. Continue?')) return;
      if (ced) discardEdits();
      o.size = b.dataset.size; if (o.size === 'village') { o.walls = false; o.castle = false; } drawControls(); regen();
    }
    else if (b.id === 'reroll' || b.id === 'newmap') {
      const hasEdits = memo.mode === 'world' ? ed : ced;
      if (hasEdits && !confirm('This starts a fresh map and throws away your hand edits. Continue?')) return;
      discardEdits();
      o.seed = randomSeed();
      if (b.id === 'newmap') {
        const rr = rng(o.seed + ':opts');
        if (memo.mode === 'world') { o.shape = rr.pick(['continent', 'large', 'twin', 'archipelago', 'coast']); o.land = +rr.range(0.32, 0.55).toFixed(2); o.realms = rr.int(2, 6); o.towns = rr.int(10, 24); }
        else { o.name = placeName(rr); o.coast = rr.chance(0.4); o.river = rr.chance(0.7); }
      }
      drawControls(); regen();
    } else if (b.id === 'save') saveDialog();
    else if (b.id === 'shot') takeSnapshot();
  });

  // ---------- snapshots: exactly what's inside the frame, saved as a picture on the map ----------
  async function takeSnapshot() {
    if (!data?.gen || busy) return;
    const pr = pv.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const scr = cr.width / canvas.width;
    const out = document.createElement('canvas');
    const f = Math.min(2, 2600 / pr.width);
    out.width = Math.round(pr.width * f); out.height = Math.round(pr.height * f);
    const ctx = out.getContext('2d');
    ctx.fillStyle = getComputedStyle(pv).backgroundColor || frameStyle().back; ctx.fillRect(0, 0, out.width, out.height);
    const v = visibleRect();
    toast('Taking snapshot…');
    await new Promise(r => setTimeout(r, 20));
    if (v.x1 > v.x0 && v.y1 > v.y0) {
      const s = scr * f, view = { x: v.x0, y: v.y0, w: v.x1 - v.x0, h: v.y1 - v.y0, s };
      const tmp = document.createElement('canvas');
      if (memo.mode === 'world') renderWorld(data.gen, tmp, memo.world.style, { view, furniture: false });
      else renderCity(data.gen, tmp, memo.city.style, { view, furniture: false });
      ctx.drawImage(tmp, (cr.left - pr.left + v.x0 * scr) * f, (cr.top - pr.top + v.y0 * scr) * f);
    }
    paintFurniture(ctx, out.width, out.height, f, scr * f);
    const n = (getMap(editMapId)?.shots?.length || 0) + pendingShots.length + 1;
    const name = await promptDialog('Name this snapshot', `${memo[memo.mode].name || 'Map'} — view ${n}`);
    if (name === null) return;
    const pic = await A.storeImage(out, { quality: 0.9 });
    const shot = { id: uid(), name: name || `View ${n}`, image: pic.ref, w: pic.w, h: pic.h, caption: '', created: Date.now() };
    const m = editMapId && getMap(editMapId);
    if (m) { (m.shots = m.shots || []).push(shot); save(); toast(`Snapshot attached to ${m.name} — open its 📁 folder on the Maps page`); }
    else { pendingShots.push(shot); toast('Snapshot taken — it’ll be attached when you save this map'); drawControls(); }
  }

  function saveDialog() {
    if (busy || !data) return;
    const mode = data.mode, o = memo[mode];
    const maps = W().maps;
    const isWorld = mode === 'world';
    const existing = editMapId ? getMap(editMapId) : null;
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
    const full = document.createElement('canvas');
    const res = isWorld ? renderWorld(data.gen, full, memo.world.style) : renderCity(data.gen, full, memo.city.style);
    const pic = await A.storeImage(full, { quality: 0.88 });
    const shots = pendingShots; pendingShots = [];
    // keep the editable terrain with world maps so they can be reopened in the editor later
    let gen = null;
    if (isWorld) {
      const state = ed || makeEditState(data.gen);
      gen = { kind: 'world', edit: await A.storeBlob(await editToBlob(state, { ...memo.world })), style: memo.world.style };
    } else {
      gen = { kind: 'city', edit: await A.storeBlob(await cityToBlob(ced || data.gen, { ...memo.city })), style: memo.city.style };
    }
    if (opts.update) {
      const map = opts.update;
      map.name = opts.name; map.image = pic.ref; map.w = full.width; map.h = full.height; map.gen = gen;
      if (shots.length) map.shots = [...(map.shots || []), ...shots];
      map.scale = { pxPerUnit: res.pxPerUnit, unit: res.unit || (isWorld ? 'miles' : 'feet') };
      // move pins that match a town, add pins for new towns, leave everything else alone
      const pinName = p => (p.label || getEntry(p.entryId)?.name || '').toLowerCase();
      for (const p of res.pins) {
        const pin = map.pins.find(x => pinName(x) === p.name.toLowerCase());
        if (pin) { pin.x = p.x; pin.y = p.y; continue; }
        if (!opts.pins) continue;
        let ent = null;
        if (opts.entries) {
          ent = w.entries.find(x => x.name.toLowerCase() === p.name.toLowerCase());
          if (!ent) { ent = newEntry('location', p.name); ent.summary = isWorld ? `${p.capital ? 'Capital' : p.port ? 'Port town' : 'Town'}${p.realm ? ' in ' + p.realm : ''}.` : `${p.kind === 'district' ? 'A district' : 'A landmark'} of ${opts.name}.`; ent.tags = ['generated']; }
        }
        map.pins.push({ id: uid(), x: p.x, y: p.y, label: ent ? '' : p.name, entryId: ent?.id || '', submapId: '', color: isWorld ? (p.capital ? '#d4a24c' : '') : (p.kind === 'district' ? '#a5a5c7' : ''), quiet: true });
      }
      save();
      return map;
    }
    const map = {
      id: uid(), name: opts.name, image: pic.ref, w: full.width, h: full.height, shots,
      parentId: opts.parent || '', scale: { pxPerUnit: res.pxPerUnit, unit: res.unit || (isWorld ? 'miles' : 'feet') }, pins: [], ...(gen ? { gen } : {}),
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
        if (m.gen.kind === 'city') {
          const st = await cityFromBlob(blob);
          memo.mode = 'city';
          memo.city = { ...CITY_DEFAULTS, ...st.o, name: st.o.name || m.name };
          if (!st.o.mapW) { delete memo.city.mapW; delete memo.city.mapH; memo.city.extent = 'legacy'; }
          ced = st.data; cEdit = true; cVersion++;
        } else {
          const st = await editFromBlob(blob);
          memo.mode = 'world';
          memo.world = { ...WORLD_DEFAULTS, ...st.o, name: st.o.name || m.name };
          if (!st.o.mapW) { delete memo.world.mapW; delete memo.world.mapH; memo.world.size = 'legacy'; }
          ed = st.edit; wEdit = true; edVersion++;
        }
      } catch (e) {
        console.error(e);
        toast('Couldn’t open that map for editing — its map file is missing');
        editMapId = '';
      }
    }
    drawControls();
    regen();
  }
  boot();
  return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('resize', onResize); };
}
