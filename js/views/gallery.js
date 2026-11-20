// A map's folder: the map itself plus its snapshots, previews down the left, one large on the right.
import { W, getMap, getEntry, save, mentionsIn } from '../store.js';
import { esc, query, toast, confirmDialog, editorHTML, attachEditor, typeColor } from '../util.js';
import * as A from '../assets.js';

export function render(main, mapId) {
  const m = getMap(mapId);
  if (!m) { main.innerHTML = `<div class="empty">Map not found. <a href="#/maps">Back to maps</a></div>`; return; }
  m.shots = m.shots || [];
  let sel = query().shot || 'map';
  if (sel !== 'map' && !m.shots.some(s => s.id === sel)) sel = 'map';
  const view = { k: 1, x: 0, y: 0 };

  main.innerHTML = `
    <div class="breadcrumbs"><a href="#/maps">Maps</a> › <a href="#/map/${m.id}">${esc(m.name)}</a> › <b>📁 Folder</b></div>
    <div class="gallery-shell">
      <div class="gallery-list" id="list"></div>
      <div class="gallery-view" id="stage"><img id="big" alt="" draggable="false"></div>
      <div class="card side-box gallery-side" id="side"></div>
    </div>`;
  const list = main.querySelector('#list'), stage = main.querySelector('#stage'), big = main.querySelector('#big'), side = main.querySelector('#side');

  const item = () => sel === 'map' ? null : m.shots.find(s => s.id === sel);
  function drawList() {
    const tile = (id, img, name, sub) => `<button class="g-tile ${sel === id ? 'on' : ''}" data-sel="${id}"><img ${A.src(img)} alt=""><span><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    list.innerHTML = tile('map', m.image, m.name, 'Full map')
      + (m.shots.length ? m.shots.map(s => tile(s.id, s.image, s.name, new Date(s.created || Date.now()).toLocaleDateString())).join('')
        : `<p class="small muted" style="padding:8px">No snapshots yet. In the ✨ Map generator, zoom to a view and press 📸 Snapshot.</p>`);
  }
  function fit() {
    const r = stage.getBoundingClientRect(), w = big.naturalWidth || 1, h = big.naturalHeight || 1;
    view.k = Math.min(r.width / w, r.height / h) * 0.96;
    view.x = (r.width - w * view.k) / 2; view.y = (r.height - h * view.k) / 2; apply();
  }
  const apply = () => { big.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; };
  function drawBig() {
    const it = item();
    big.onload = fit;
    A.url(it ? it.image : m.image).then(u => { big.src = u; if (big.complete) fit(); });
  }
  function drawSide() {
    const it = item();
    if (!it) {
      side.innerHTML = `<h4>🗺️ ${esc(m.name)}</h4>
        <p class="small muted">${m.pins.length} pins · ${m.shots.length} snapshot${m.shots.length === 1 ? '' : 's'}</p>
        <a class="btn primary" href="#/map/${m.id}" style="width:100%;justify-content:center">Open the interactive map</a>
        ${m.gen?.edit ? `<a class="btn" href="#/generate?edit=${m.id}" style="width:100%;justify-content:center;margin-top:8px">✏️ Edit &amp; take snapshots</a>` : ''}`;
      return;
    }
    const links = [...mentionsIn((it.caption || '') + ' ' + it.name)].map(id => getEntry(id)).filter(Boolean);
    side.innerHTML = `<h4>📸 Snapshot</h4>
      <label>Name</label><input id="s-name" value="${esc(it.name)}">
      <label>Caption <span class="muted small">— type @ to link entries</span></label>
      ${editorHTML('s-cap', it.caption || '', 6, 'What’s shown here? Type @ to link places, people, quests…')}
      <div id="s-links">${linksHTML(links)}</div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:6px">
        <button id="s-dl">⬇ Download</button>
        <a class="btn" href="#/map/${m.id}">🗺️ Open map</a>
        <button class="danger" id="s-del">Delete</button>
      </div>`;
    side.querySelector('#s-name').oninput = e => { it.name = e.target.value; save(); drawList(); };
    attachEditor(side.querySelector('#s-cap'), v => {
      it.caption = v; save();
      side.querySelector('#s-links').innerHTML = linksHTML([...mentionsIn(v + ' ' + it.name)].map(id => getEntry(id)).filter(Boolean));
    });
    side.querySelector('#s-dl').onclick = async () => {
      const u = await A.url(it.image);
      const a = document.createElement('a'); a.href = u; a.download = `${it.name.replace(/[^\w\- ]+/g, '').trim() || 'snapshot'}.webp`; a.click();
    };
    side.querySelector('#s-del').onclick = async () => {
      if (!(await confirmDialog(`Delete the snapshot “${it.name}”?`))) return;
      m.shots = m.shots.filter(s => s !== it); save(); sel = 'map'; drawAll(); toast('Snapshot deleted');
    };
  }
  const linksHTML = links => links.length ? `<label>Linked</label><div class="g-links">${links.map(e => `<a class="mention" style="--tc:${typeColor(e.type)}" href="#/entry/${e.id}">${esc(e.name)}</a>`).join(' ')}</div>` : '';
  function drawAll() { drawList(); drawBig(); drawSide(); }

  list.addEventListener('click', e => {
    const b = e.target.closest('[data-sel]'); if (!b) return;
    sel = b.dataset.sel; history.replaceState(null, '', `#/gallery/${m.id}${sel === 'map' ? '' : '?shot=' + sel}`); drawAll();
  });
  // view only: zoom with the wheel, drag to look around, double-click to fit
  stage.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = stage.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const nk = Math.min(12, Math.max(0.05, view.k * Math.exp(-ev.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk; apply();
  }, { passive: false });
  let drag = null;
  stage.addEventListener('pointerdown', ev => { stage.setPointerCapture(ev.pointerId); drag = { sx: ev.clientX, sy: ev.clientY, x: view.x, y: view.y }; stage.classList.add('dragging'); });
  stage.addEventListener('pointermove', ev => { if (!drag) return; view.x = drag.x + ev.clientX - drag.sx; view.y = drag.y + ev.clientY - drag.sy; apply(); });
  const end = () => { drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('dblclick', fit);
  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    const ids = ['map', ...m.shots.map(s => s.id)], i = ids.indexOf(sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { sel = ids[Math.min(ids.length - 1, i + 1)]; drawAll(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { sel = ids[Math.max(0, i - 1)]; drawAll(); }
  };
  document.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(fit); ro.observe(stage);
  drawAll();
  return () => { document.removeEventListener('keydown', onKey); ro.disconnect(); };
}
