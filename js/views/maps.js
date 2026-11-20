import { W, getMap, getEntry, uid, save, TYPES } from '../store.js';
import { esc, openModal, closeModal, confirmDialog, pickFile, imageToDataURL, toast, go, query, typeColor, promptDialog } from '../util.js';
import { newEntryDialog } from './entries.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const PIN_COLORS = ['#d4a24c', '#e07a5f', '#5fa8d3', '#c77dff', '#81b29a', '#e9c46a', '#ffffff'];

function chain(m) {
  const out = [];
  let cur = m, guard = 0;
  while (cur && guard++ < 20) { out.unshift(cur); cur = getMap(cur.parentId); }
  return out;
}

async function newMapDialog(parentId = '', pin = null) {
  const f = await pickFile('image/*');
  if (!f) return null;
  toast('Loading map…');
  let img;
  try { img = await imageToDataURL(f, 4096); } catch { toast('Could not read that image'); return null; }
  const def = pin ? (pin.label || getEntry(pin.entryId)?.name || '') : f.name.replace(/\.[^.]+$/, '');
  const name = await promptDialog('Name this map', def) || def || 'Untitled map';
  const m = { id: uid(), name, image: img.src, w: img.w, h: img.h, parentId, scale: { pxPerUnit: 0, unit: 'miles' }, pins: [] };
  W().maps.push(m);
  if (pin) pin.submapId = m.id;
  save();
  return m;
}

export function renderList(main) {
  const maps = W().maps;
  main.innerHTML = `
    <div class="page-head"><h1>Maps</h1><a class="btn" href="#/generate">✨ Generate a map</a><button class="primary" id="new">⬆ Upload a map</button></div>
    ${maps.length ? `<div class="grid">${maps.map(m => {
      const parent = getMap(m.parentId);
      return `<a class="card entry-card" href="#/map/${m.id}" style="text-decoration:none;color:inherit;--tc:var(--accent)">
        <img class="thumb" src="${m.image}" alt="">
        <h3>${esc(m.name)}</h3>
        <p>${m.pins.length} pins${parent ? ` · inside ${esc(parent.name)}` : ''}${m.scale.pxPerUnit ? ' · scaled' : ''}</p></a>`;
    }).join('')}</div>`
      : `<div class="empty"><div class="big">🗺️</div>Upload a world, region, city or dungeon map — or <a href="#/generate">generate one</a>. Pins can link to entries or open deeper maps.</div>`}`;
  main.querySelector('#new').onclick = async () => { const m = await newMapDialog(); if (m) go(`#/map/${m.id}`); };
}

export function peekHTML(m) {
  return `<h2>${esc(m.name)}</h2>
    <div style="position:relative"><img src="${m.image}" style="width:100%;border-radius:8px;display:block">
    ${m.pins.map(p => `<span title="${esc(p.label || getEntry(p.entryId)?.name || '')}" style="position:absolute;left:${p.x / m.w * 100}%;top:${p.y / m.h * 100}%;width:10px;height:10px;margin:-5px;border-radius:50%;background:${p.color || '#d4a24c'};border:2px solid #000"></span>`).join('')}</div>
    <ul class="link-list" style="margin-top:10px">${m.pins.map(p => `<li>📍 ${p.entryId && getEntry(p.entryId) ? `<a class="mention" style="--tc:${typeColor(getEntry(p.entryId).type)}" href="#/entry/${p.entryId}">${esc(p.label || getEntry(p.entryId).name)}</a>` : esc(p.label)}</li>`).join('')}</ul>`;
}

function fmtTime(days) {
  if (!isFinite(days)) return '—';
  if (days < 1) return `${Math.max(1, Math.round(days * 8))} h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

export function renderMap(main, id) {
  const m = getMap(id);
  if (!m) { main.innerHTML = `<div class="empty">Map not found. <a href="#/maps">Back to maps</a></div>`; return; }
  const view = { x: 0, y: 0, k: 1 };
  let mode = 'pan';
  let selected = query().pin || null;
  let measure = [];
  let calib = [];

  const crumbs = chain(m);
  main.innerHTML = `
    <div class="breadcrumbs"><a href="#/maps">Maps</a> ${crumbs.map(c => c.id === m.id ? `› <b>${esc(c.name)}</b>` : `› <a href="#/map/${c.id}">${esc(c.name)}</a>`).join(' ')}</div>
    <div class="map-shell">
      <div class="map-stage" id="stage">
        <div class="map-tools">
          <button data-mode="pan" title="Move around, click pins, drag pins">✋ Select</button>
          <button data-mode="pin" title="Click on the map to add a pin">📍 Add pin</button>
          <button data-mode="measure" title="Click points to measure distance & travel time">📏 Measure</button>
          <button data-mode="calibrate" title="Set the map scale">📐 Set scale</button>
          <button id="fit" title="Fit map to view">⤢</button>
        </div>
        <svg id="svg"><g id="vp"><image href="${m.image}" width="${m.w}" height="${m.h}"/><g id="overlay"></g><g id="pins"></g></g></svg>
        <div class="map-info hidden" id="info"></div>
      </div>
      <div class="map-side" id="side"></div>
    </div>`;

  const stage = main.querySelector('#stage');
  const svg = main.querySelector('#svg');
  const vp = main.querySelector('#vp');
  const pinsG = main.querySelector('#pins');
  const overlay = main.querySelector('#overlay');
  const info = main.querySelector('#info');
  const side = main.querySelector('#side');

  const apply = () => { vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); drawPins(); drawOverlay(); };
  const fit = () => {
    const r = stage.getBoundingClientRect();
    view.k = Math.min(r.width / m.w, r.height / m.h) * 0.95 || 1;
    view.x = (r.width - m.w * view.k) / 2;
    view.y = (r.height - m.h * view.k) / 2;
    apply();
  };
  const centerOn = (x, y) => {
    const r = stage.getBoundingClientRect();
    view.k = Math.max(view.k, Math.min(r.width / m.w, r.height / m.h) * 2);
    view.x = r.width / 2 - x * view.k; view.y = r.height / 2 - y * view.k; apply();
  };
  const toMap = ev => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
  };

  function drawPins() {
    const s = 1 / view.k;
    pinsG.innerHTML = m.pins.map(p => {
      const ent = getEntry(p.entryId);
      const label = p.label || ent?.name || '';
      const col = p.color || (ent ? TYPES[ent.type]?.hex : '#d4a24c');
      const sel = p.id === selected;
      return `<g class="pin" data-pin="${p.id}" transform="translate(${p.x},${p.y}) scale(${s})">
        ${sel ? '<circle r="15" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"/>' : ''}
        <title>${esc(label)}</title>
        <circle class="pin-body" r="${p.quiet && !sel ? 6 : p.submapId ? 9 : 7}" fill="${col}" fill-opacity="${p.quiet ? 0.8 : 1}" stroke="${p.quiet ? '#fff' : '#000'}" stroke-width="2"/>
        ${p.submapId ? '<circle r="3" fill="#000"/>' : ''}
        ${label && (!p.quiet || sel) ? `<text class="pin-label" x="12" y="5">${esc(label)}</text>` : ''}
      </g>`;
    }).join('');
  }

  function dist(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return d;
  }

  function drawOverlay() {
    const s = 1 / view.k;
    const pts = mode === 'calibrate' ? calib : measure;
    if (!pts.length) { overlay.innerHTML = ''; return; }
    overlay.innerHTML = `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${mode === 'calibrate' ? '#5fa8d3' : '#d4a24c'}" stroke-width="${3 * s}" stroke-dasharray="${8 * s} ${5 * s}"/>
      ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${5 * s}" fill="#fff" stroke="#000" stroke-width="${1.5 * s}"/>`).join('')}`;
  }

  function updateInfo() {
    if (mode === 'measure') {
      info.classList.remove('hidden');
      if (measure.length < 2) { info.innerHTML = 'Click points on the map to trace a route. <span class="muted">Double-click or press Esc to clear.</span>'; return; }
      const px = dist(measure);
      if (!m.scale.pxPerUnit) { info.innerHTML = `Route length: ${Math.round(px)} px. <b>Set the scale</b> (📐) to get real distances and travel times.`; return; }
      const d = px / m.scale.pxPerUnit;
      const sp = W().settings.speeds;
      info.innerHTML = `<b>${d < 10 ? d.toFixed(1) : Math.round(d)} ${esc(m.scale.unit)}</b> &nbsp;·&nbsp; 🚶 ${fmtTime(d / sp.foot)} &nbsp;·&nbsp; 🐎 ${fmtTime(d / sp.horse)} &nbsp;·&nbsp; 🛒 ${fmtTime(d / sp.wagon)} &nbsp;·&nbsp; ⛵ ${fmtTime(d / sp.ship)}
        <span class="muted small"> (speeds per day set in World settings)</span>`;
    } else if (mode === 'calibrate') {
      info.classList.remove('hidden');
      info.innerHTML = calib.length === 0 ? 'Click the start of a known distance (e.g. the ends of the map’s scale bar).' : 'Now click the end point.';
    } else if (mode === 'pin') {
      info.classList.remove('hidden');
      info.innerHTML = 'Click anywhere on the map to drop a pin.';
    } else info.classList.add('hidden');
  }

  function setMode(md) {
    mode = md; measure = []; calib = [];
    main.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === md));
    stage.classList.toggle('placing', md !== 'pan');
    drawOverlay(); updateInfo();
  }

  function drawSide() {
    const p = m.pins.find(x => x.id === selected);
    const entries = [...W().entries].sort((a, b) => a.name.localeCompare(b.name));
    const others = W().maps.filter(x => x.id !== m.id);
    side.innerHTML = p ? `
      <div class="card side-box">
        <h4>Pin</h4>
        <label>Label</label><input id="p-label" value="${esc(p.label)}" placeholder="${esc(getEntry(p.entryId)?.name || 'Pin name')}">
        <label>Linked entry</label>
        <select id="p-entry"><option value="">— none —</option>${entries.map(e => `<option value="${e.id}" ${e.id === p.entryId ? 'selected' : ''}>${TYPES[e.type].icon} ${esc(e.name)}</option>`).join('')}</select>
        <button class="small" id="p-newentry" style="margin-top:6px">＋ New entry for this pin</button>
        <label>Opens map</label>
        <select id="p-sub"><option value="">— none —</option>${others.map(x => `<option value="${x.id}" ${x.id === p.submapId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap"><button class="small" id="p-gencity">🏰 Generate a city map</button><button class="small" id="p-newsub">⬆ Upload a map</button></div>
        <label class="check"><input type="checkbox" id="p-quiet" ${p.quiet ? '' : 'checked'}> Show label on the map</label>
        <label>Colour</label>
        <div class="row" style="gap:4px">${PIN_COLORS.map(c => `<button class="icon" data-col="${c}" style="flex:0;padding:0;width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${c === p.color ? '#fff' : '#000'}"></button>`).join('')}
          <button class="small shrink" data-col="">auto</button></div>
        <div class="row" style="margin-top:14px;flex-wrap:wrap">
          ${p.entryId ? `<a class="btn" href="#/entry/${p.entryId}">Open entry</a>` : ''}
          ${p.submapId ? `<a class="btn" href="#/map/${p.submapId}">Enter map ↘</a>` : ''}
          <button class="danger" id="p-del">Delete pin</button>
        </div>
      </div>` : `
      <div class="card side-box">
        <h4>Map</h4>
        <label>Name</label><input id="m-name" value="${esc(m.name)}">
        <label>Scale</label>
        <p class="small muted" style="margin:0">${m.scale.pxPerUnit ? `${esc(m.scale.unit)}: ${m.scale.pxPerUnit.toFixed(2)} px each. ` : 'Not set. '}Use 📐 Set scale to calibrate.</p>
        <label>Parent map</label>
        <select id="m-parent"><option value="">— none (top level) —</option>${others.filter(x => !chain(x).some(c => c.id === m.id)).map(x => `<option value="${x.id}" ${x.id === m.parentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <div class="row" style="margin-top:12px"><button id="m-replace">Replace image</button><button class="danger" id="m-del">Delete map</button></div>
      </div>
      <div class="card side-box">
        <h4>Pins (${m.pins.length})</h4>
        ${m.pins.length ? `<ul class="link-list">${m.pins.map(x => `<li><a href="#" data-goto="${x.id}"><span class="type-dot" style="--tc:${x.color || TYPES[getEntry(x.entryId)?.type]?.hex || '#d4a24c'}"></span> ${esc(x.label || getEntry(x.entryId)?.name || 'Unnamed pin')}</a>${x.submapId ? ' <span class="muted small">↘ map</span>' : ''}</li>`).join('')}</ul>`
          : '<p class="small muted" style="margin:0">Use 📍 Add pin, then click the map.</p>'}
      </div>`;
    const $s = s => side.querySelector(s);
    if (p) {
      $s('#p-label').oninput = e => { p.label = e.target.value; save(); drawPins(); };
      $s('#p-entry').onchange = e => { p.entryId = e.target.value; save(); drawPins(); drawSide(); };
      $s('#p-sub').onchange = e => { p.submapId = e.target.value; save(); drawPins(); drawSide(); };
      $s('#p-newentry').onclick = () => newEntryDialog('location', ent => { p.entryId = ent.id; if (!p.label) p.label = ''; save(); drawPins(); drawSide(); toast(`Created ${ent.name}`); });
      $s('#p-gencity').onclick = () => go(`#/generate?mode=city&name=${encodeURIComponent(p.label || getEntry(p.entryId)?.name || '')}&parent=${m.id}&pin=${p.id}`);
      $s('#p-newsub').onclick = async () => { const sub = await newMapDialog(m.id, p); if (sub) { drawPins(); drawSide(); toast('Deeper map added — click “Enter map”'); } };
      $s('#p-quiet').onchange = e => { p.quiet = !e.target.checked; save(); drawPins(); };
      side.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { p.color = b.dataset.col; save(); drawPins(); drawSide(); });
      $s('#p-del').onclick = () => { m.pins = m.pins.filter(x => x !== p); selected = null; save(); drawPins(); drawSide(); };
    } else {
      $s('#m-name').oninput = e => { m.name = e.target.value || 'Untitled map'; save(); };
      $s('#m-parent').onchange = e => { m.parentId = e.target.value; save(); };
      $s('#m-replace').onclick = async () => {
        const f = await pickFile('image/*'); if (!f) return;
        const img = await imageToDataURL(f, 4096);
        const sx = img.w / m.w, sy = img.h / m.h;
        m.pins.forEach(x => { x.x *= sx; x.y *= sy; });
        if (m.scale.pxPerUnit) m.scale.pxPerUnit *= sx;
        Object.assign(m, { image: img.src, w: img.w, h: img.h }); save(); renderMap(main, id);
      };
      $s('#m-del').onclick = async () => {
        if (!(await confirmDialog(`Delete the map “${m.name}” and its pins?`))) return;
        const w = W();
        w.maps = w.maps.filter(x => x.id !== m.id);
        for (const x of w.maps) { if (x.parentId === m.id) x.parentId = ''; for (const pp of x.pins) if (pp.submapId === m.id) pp.submapId = ''; }
        save(); go('#/maps');
      };
      side.querySelectorAll('[data-goto]').forEach(a => a.onclick = e => {
        e.preventDefault(); selected = a.dataset.goto; const pp = m.pins.find(x => x.id === selected); centerOn(pp.x, pp.y); drawSide();
      });
    }
  }

  // ----- interaction -----
  let drag = null;
  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const pinEl = ev.target.closest('.pin');
    svg.setPointerCapture(ev.pointerId);
    drag = { pinId: pinEl?.dataset.pin, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false, pin: mode === 'pan' && pinEl ? m.pins.find(p => p.id === pinEl.dataset.pin) : null };
  });
  svg.addEventListener('pointermove', ev => {
    if (!drag) return;
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.pin) { const pt = toMap(ev); drag.pin.x = pt.x; drag.pin.y = pt.y; drawPins(); }
    else { stage.classList.add('dragging'); view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); }
  });
  svg.addEventListener('pointerup', ev => {
    if (!drag) return;
    const d = drag; drag = null;
    stage.classList.remove('dragging');
    if (d.moved) { if (d.pin) save(); return; }
    const pt = toMap(ev);
    if (mode === 'pan') {
      if (d.pinId) {
        const p = m.pins.find(x => x.id === d.pinId);
        if (ev.ctrlKey || ev.metaKey) {
          if (p.submapId) return go(`#/map/${p.submapId}`);
          if (p.entryId) return go(`#/entry/${p.entryId}`);
        }
        selected = p.id;
      } else selected = null;
      drawPins(); drawSide();
    } else if (mode === 'pin') {
      if (pt.x < 0 || pt.y < 0 || pt.x > m.w || pt.y > m.h) return;
      const p = { id: uid(), x: pt.x, y: pt.y, label: '', entryId: '', submapId: '', color: '' };
      m.pins.push(p); selected = p.id; save();
      setMode('pan'); drawPins(); drawSide();
      side.querySelector('#p-label')?.focus();
    } else if (mode === 'measure') {
      measure.push(pt); drawOverlay(); updateInfo();
    } else if (mode === 'calibrate') {
      calib.push(pt); drawOverlay(); updateInfo();
      if (calib.length === 2) {
        const px = dist(calib);
        openModal(`<h2>Set map scale</h2><p class="muted small">How far is the line you just drew in real terms?</p>
          <div class="row"><input id="cd" type="number" min="0" step="any" placeholder="e.g. 100" autofocus>
          <select id="cu">${['miles', 'km', 'leagues', 'feet', 'metres'].map(u => `<option ${u === m.scale.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
          <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save scale</button></div>`, md => {
          md.addEventListener('click', e => {
            const a = e.target.dataset.a; if (!a) return;
            const v = parseFloat(md.querySelector('#cd').value);
            if (a === 'yes' && v > 0) { m.scale = { pxPerUnit: px / v, unit: md.querySelector('#cu').value }; save(); toast('Scale saved — try 📏 Measure'); }
            closeModal(); setMode('pan'); drawSide();
          });
        });
      }
    }
  });
  svg.addEventListener('dblclick', () => { if (mode === 'measure') { measure = []; drawOverlay(); updateInfo(); } });
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const f = Math.exp(-ev.deltaY * 0.0015);
    const nk = Math.min(20, Math.max(0.05, view.k * f));
    view.x = mx - (mx - view.x) * (nk / view.k);
    view.y = my - (my - view.y) * (nk / view.k);
    view.k = nk; apply();
  }, { passive: false });

  main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(mode === b.dataset.mode ? 'pan' : b.dataset.mode));
  main.querySelector('#fit').onclick = fit;
  const onKey = e => {
    if (e.key === 'Escape' && !document.querySelector('.modal')) setMode('pan');
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      m.pins = m.pins.filter(x => x.id !== selected); selected = null; save(); drawPins(); drawSide();
    }
  };
  document.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(() => { if (!view.inited) { view.inited = true; fit(); const p = m.pins.find(x => x.id === selected); if (p) centerOn(p.x, p.y); } });
  ro.observe(stage);

  setMode('pan');
  drawSide();
  return () => { document.removeEventListener('keydown', onKey); ro.disconnect(); };
}
