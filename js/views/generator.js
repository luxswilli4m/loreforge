import { W, uid, save, getMap, getEntry, newEntry } from '../store.js';
import { esc, query, go, toast, openModal, closeModal } from '../util.js';
import { randomSeed, ensureFonts } from '../gen/core.js';
import { generateWorld, renderWorld, WORLD_DEFAULTS } from '../gen/world.js';
import { generateCity, renderCity, CITY_DEFAULTS } from '../gen/city.js';
import { placeName } from '../gen/names.js';
import { rng } from '../gen/core.js';
import * as A from '../assets.js';

const STYLE_SWATCH = {
  parchment: 'linear-gradient(135deg,#eadcbf 0 55%,#b9bfb0 55% 100%)',
  atlas: 'linear-gradient(135deg,#a8c47a 0 55%,#3f6f99 55% 100%)',
  night: 'linear-gradient(135deg,#3a3446 0 55%,#d4a24c 55% 58%,#101b2a 58% 100%)',
};
const STYLE_LABEL = { parchment: 'Parchment', atlas: 'Atlas', night: 'Night' };

// remembered between visits in this session
const memo = { mode: 'world', world: { ...WORLD_DEFAULTS, seed: randomSeed() }, city: { ...CITY_DEFAULTS, seed: randomSeed() } };

export function render(main) {
  const q = query();
  if (q.mode === 'city' || q.mode === 'world') memo.mode = q.mode;
  if (q.name && memo.mode === 'city') memo.city.name = q.name;
  if (!memo.world.name) memo.world.name = W().name;
  if (!memo.city.name) memo.city.name = placeName(rng(memo.city.seed));
  const link = q.parent ? { parent: q.parent, pin: q.pin || '' } : null;

  let data = null, lastKey = '', timer = null, busy = false;
  const canvas = document.createElement('canvas');

  function controlsHTML() {
    const mode = memo.mode, o = memo[mode];
    const styles = Object.keys(STYLE_SWATCH).map(s => `<button class="swatch ${o.style === s ? 'on' : ''}" data-style="${s}" title="${STYLE_LABEL[s]}"><span style="background:${STYLE_SWATCH[s]}"></span>${STYLE_LABEL[s]}</button>`).join('');
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
      ${common}
      ${mode === 'world' ? world : city}
      <label>Style</label><div class="swatches">${styles}</div>
      <div class="gen-actions">
        <button id="newmap">✨ Surprise me</button>
        <button class="primary" id="save">💾 Save to my maps</button>
      </div>
      ${link ? `<p class="small muted" style="margin:10px 0 0">Will open from the pin on <b>${esc(getMap(link.parent)?.name || 'your map')}</b>.</p>` : ''}`;
  }

  main.innerHTML = `
    <div class="page-head"><h1>Map generator</h1><span class="muted small">Generate a world or city, then save it with pins and entries ready to go.</span></div>
    <div class="gen-shell">
      <div class="card gen-controls" id="ctl"></div>
      <div class="gen-preview" id="pv"><div class="gen-busy" id="busy"><div class="spinner"></div><span>Drawing your map…</span></div></div>
    </div>`;
  const ctl = main.querySelector('#ctl'), pv = main.querySelector('#pv'), busyEl = main.querySelector('#busy');
  pv.prepend(canvas);

  const drawControls = () => { ctl.innerHTML = controlsHTML(); };

  async function regen(force = false) {
    const mode = memo.mode, o = memo[mode];
    const key = mode + JSON.stringify({ ...o, style: '', name: '' });
    busy = true; busyEl.classList.add('on');
    await ensureFonts();
    await new Promise(r => setTimeout(r, 30));
    try {
      if (force || key !== lastKey || !data || data.mode !== mode) {
        data = { mode, gen: mode === 'world' ? generateWorld(o) : generateCity(o) };
        lastKey = key;
      }
      data.gen.o.name = o.name;
      data.gen.o.style = o.style;
      data.result = mode === 'world' ? renderWorld(data.gen, canvas, o.style) : renderCity(data.gen, canvas, o.style);
    } catch (e) { console.error(e); toast('Something went wrong generating that map — try another seed'); }
    busy = false; busyEl.classList.remove('on');
  }
  const schedule = (ms = 350) => { clearTimeout(timer); timer = setTimeout(() => regen(), ms); };

  ctl.addEventListener('input', e => {
    const t = e.target, k = t.dataset.k; if (!k) return;
    const o = memo[memo.mode];
    if (t.type === 'checkbox') o[k] = t.checked;
    else o[k] = t.dataset.num != null ? +t.value : t.value;
    const val = t.previousElementSibling?.querySelector?.('.val');
    if (val && k === 'land') val.textContent = Math.round(o.land * 100) + '% land';
    if (val && k === 'rivers') val.textContent = o.rivers < 0.3 ? 'Few' : o.rivers < 0.7 ? 'Some' : 'Many';
    schedule(t.type === 'range' || t.type === 'text' || t.type === 'number' ? 450 : 50);
  });
  ctl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const o = memo[memo.mode];
    if (b.dataset.mode) { memo.mode = b.dataset.mode; drawControls(); regen(); }
    else if (b.dataset.style) { o.style = b.dataset.style; drawControls(); regen(); }
    else if (b.dataset.size) { o.size = b.dataset.size; if (o.size === 'village') { o.walls = false; o.castle = false; } drawControls(); regen(); }
    else if (b.id === 'reroll') { o.seed = randomSeed(); drawControls(); regen(); }
    else if (b.id === 'newmap') {
      o.seed = randomSeed();
      const rr = rng(o.seed + ':opts');
      if (memo.mode === 'world') { o.shape = rr.pick(['continent', 'large', 'twin', 'archipelago', 'coast']); o.land = +rr.range(0.32, 0.55).toFixed(2); o.realms = rr.int(2, 6); o.towns = rr.int(10, 24); }
      else { o.name = placeName(rr); o.coast = rr.chance(0.4); o.river = rr.chance(0.7); }
      drawControls(); regen();
    } else if (b.id === 'save') saveDialog();
  });

  function saveDialog() {
    if (busy || !data) return;
    const mode = data.mode, o = memo[mode];
    const maps = W().maps;
    const isWorld = mode === 'world';
    openModal(`<h2>Save map</h2>
      <label>Map name</label><input id="sn" value="${esc(o.name || (isWorld ? 'World map' : 'City map'))}">
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
      m.addEventListener('click', ev => {
        const a = ev.target.dataset.a; if (!a) return;
        if (a === 'no') return closeModal();
        const opts = {
          name: m.querySelector('#sn').value.trim() || 'Generated map',
          pins: m.querySelector('#spins').checked, entries: m.querySelector('#sent').checked,
          parent: m.querySelector('#sparent').value, pin: m.querySelector('#spin')?.value || '',
        };
        closeModal();
        toast('Saving map…');
        commit(opts).then(map => { toast('Map saved'); go(`#/map/${map.id}`); });
      });
    });
  }

  async function commit(opts) {
    const w = W();
    const isWorld = data.mode === 'world';
    const res = data.result;
    const pic = await A.storeImage(canvas, { quality: 0.88 });
    const map = {
      id: uid(), name: opts.name, image: pic.ref, w: canvas.width, h: canvas.height,
      parentId: opts.parent || '', scale: { pxPerUnit: res.pxPerUnit, unit: isWorld ? 'miles' : 'feet' }, pins: [],
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

  drawControls();
  regen();
  return () => clearTimeout(timer);
}
