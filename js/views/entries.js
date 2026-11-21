import { W, TYPES, getEntry, newEntry, deleteEntry, backlinks, mentionsIn, save, uid, formatDate } from '../store.js';
import { suggestName } from '../tools/generators.js';
import * as A from '../assets.js';
import { parentOf, childrenOf, ancestorsOf, isDescendant, mapsFor, placeOfMap, relColor, relKindPicker, wireRelKindPicker } from '../hierarchy.js';
import { mountSheet } from './sheet.js';
import { esc, md, typeBadge, typeColor, mentionLink, openModal, closeModal, confirmDialog, editorHTML, attachEditor, pickFile, imageToDataURL, toast, go, rerender } from '../util.js';

let listFilter = { q: '', tag: '' };

export function renderList(main, type) {
  const w = W();
  const allTags = [...new Set(w.entries.flatMap(e => e.tags))].sort();
  main.innerHTML = `
    <div class="page-head"><h1>World Bible</h1>
      <input id="q" placeholder="Filter…" value="${esc(listFilter.q)}" style="max-width:220px">
      <button class="primary" id="new">＋ New entry</button></div>
    <div class="filters">
      <a class="chip ${!type ? 'on' : ''}" href="#/entries">All (${w.entries.length})</a>
      ${Object.entries(TYPES).map(([k, t]) => `<a class="chip ${type === k ? 'on' : ''}" style="--tc:${t.color};text-decoration:none" href="#/entries/${k}">${t.icon} ${t.plural} (${w.entries.filter(e => e.type === k).length})</a>`).join('')}
    </div>
    ${allTags.length ? `<div class="filters">${allTags.map(t => `<button class="chip ${listFilter.tag === t ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    <div id="list"></div>`;
  const draw = () => {
    const q = listFilter.q.toLowerCase();
    const items = w.entries
      .filter(e => !type || e.type === type)
      .filter(e => !listFilter.tag || e.tags.includes(listFilter.tag))
      .filter(e => !q || (e.name + ' ' + e.summary + ' ' + e.tags.join(' ')).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    main.querySelector('#list').innerHTML = items.length ? `<div class="grid">${items.map(cardHTML).join('')}</div>`
      : `<div class="empty"><div class="big">${type ? TYPES[type].icon : '📚'}</div>Nothing here yet.</div>`;
  };
  draw();
  main.querySelector('#q').addEventListener('input', e => { listFilter.q = e.target.value; draw(); });
  main.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { listFilter.tag = listFilter.tag === b.dataset.tag ? '' : b.dataset.tag; renderList(main, type); });
  main.querySelector('#new').onclick = () => newEntryDialog(type);
}

function cardHTML(e) {
  return `<a class="card entry-card" href="#/entry/${e.id}" style="--tc:${typeColor(e.type)};text-decoration:none;color:inherit">
    ${e.image ? `<img class="thumb" ${A.src(e.image)} alt="">` : ''}
    ${typeBadge(e.type)}<h3>${esc(e.name)}</h3><p>${esc(e.summary)}</p>
    ${e.tags.length ? `<div style="margin-top:6px">${e.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
  </a>`;
}

export function newEntryDialog(type = 'character', after) {
  openModal(`<h2>New entry</h2>
    <label>Name</label><div class="row"><input id="n" autofocus placeholder="e.g. Captain Mira Vex"><button class="shrink" id="sugg" title="Suggest a name">🎲</button></div>
    <label>Type</label>
    <div class="filters">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${k === (type || 'character') ? 'on' : ''}" style="--tc:${t.color}" data-t="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Create</button></div>`, m => {
    let t = type || 'character';
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (b) { t = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); }
      const a = e.target.dataset.a;
      if (a === 'no') closeModal();
      if (a === 'yes') create();
    });
    const create = () => {
      const name = m.querySelector('#n').value.trim();
      if (!name) return m.querySelector('#n').focus();
      const ent = newEntry(t, name);
      closeModal();
      if (after) after(ent); else go(`#/entry/${ent.id}/edit`);
    };
    m.querySelector('#n').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
    m.querySelector('#sugg').onclick = () => { m.querySelector('#n').value = suggestName(t); m.querySelector('#n').focus(); };
  });
}

export function readHTML(e, compact = false) {
  const w = W();
  const rels = w.relations.filter(r => r.from === e.id || r.to === e.id);
  const back = backlinks(e.id);
  const outs = [...mentionsIn(e.body + ' ' + e.summary)].filter(id => id !== e.id && getEntry(id));
  const pins = w.maps.flatMap(m => m.pins.filter(p => p.entryId === e.id).map(p => ({ m, p })));
  const fields = e.fields.filter(f => f.v);
  const kindHref = { quest: x => `#/quest/${x.id}`, entry: x => `#/entry/${x.id}`, session: x => `#/session/${x.id}`, journal: x => `#/journal/${x.id}`, event: () => '#/timeline', shot: x => `#/gallery/${x.mapId}?shot=${x.id}` };
  const kindName = { quest: x => `Quest: ${x.title}`, entry: x => x.name, session: x => `Session ${x.number}: ${x.title}`, journal: x => x.title, event: x => `${x.title} (${formatDate(x.date)})`, shot: x => `📸 ${x.name} (${x.mapName})` };
  return `
  <div class="entry-layout">
    <div>
      ${e.image ? `<img class="entry-hero" ${A.src(e.image)} alt="">` : ''}
      ${typeBadge(e.type)}
      ${ancestorsOf(e).length ? `<div class="place-trail">${ancestorsOf(e).map(a => `<a href="#/entry/${a.id}">${TYPES[a.type]?.icon || ''} ${esc(a.name)}</a>`).join(' <span>›</span> ')} <span>›</span></div>` : ''}
      <h1 style="margin-top:4px">${esc(e.name)}</h1>
      ${e.summary ? `<p class="muted" style="font-size:1.1em;font-style:italic">${md(e.summary).replace(/^<p>|<\/p>$/g, '')}</p>` : ''}
      <div class="prose">${md(e.body) || '<p class="muted">No description yet.</p>'}</div>
      ${e.secret ? `<div class="secret"><div class="secret-label">🔒 GM secrets — hidden from wiki export</div><div class="prose">${md(e.secret)}</div></div>` : ''}
    </div>
    <div>
      ${fields.length ? `<div class="card side-box"><h4>Details</h4><table class="fields-table">${fields.map(f => `<tr><td>${esc(f.k)}</td><td>${md(f.v).replace(/^<p>|<\/p>$/g, '')}</td></tr>`).join('')}</table></div>` : ''}
      ${e.tags.length ? `<div class="card side-box"><h4>Tags</h4>${e.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="card side-box"><h4>Relationships</h4>
        ${rels.length ? `<ul class="link-list">${rels.map(r => {
          const other = r.from === e.id ? r.to : r.from;
          const label = r.from === e.id ? r.label : (r.label ? `${r.label} (of this)` : '');
          return `<li style="align-items:flex-start"><span class="type-dot" style="--tc:${typeColor(getEntry(other)?.type)};margin-top:8px"></span><div style="flex:1">${label ? `<div class="rel-label" style="color:${relColor(r)}">${esc(label)}</div>` : ''}${mentionLink(other, '?')}</div>
            ${compact ? '' : `<button class="icon small" data-delrel="${r.id}" title="Remove">✕</button>`}</li>`;
        }).join('')}</ul>` : '<p class="muted small" style="margin:0">None yet.</p>'}
        ${compact ? '' : '<button class="small" id="addrel" style="margin-top:8px">＋ Add relationship</button>'}
      </div>
      ${outs.length ? `<div class="card side-box"><h4>Links to</h4><ul class="link-list">${outs.map(id => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(id).type)}"></span>${mentionLink(id)}</li>`).join('')}</ul></div>` : ''}
      ${back.length ? `<div class="card side-box"><h4>Mentioned in</h4><ul class="link-list">${back.map(b => `<li><a href="${kindHref[b.kind](b.item)}">${esc(kindName[b.kind](b.item))}</a><span class="muted small">${b.kind}</span></li>`).join('')}</ul></div>` : ''}
      ${(() => { const kids = childrenOf(e.id).sort((a, b) => a.name.localeCompare(b.name)); return kids.length ? `<div class="card side-box"><h4>Places inside (${kids.length})</h4><ul class="link-list">${kids.slice(0, 40).map(k => `<li><span class="type-dot" style="--tc:${typeColor(k.type)}"></span><a href="#/entry/${k.id}">${esc(k.name)}</a>${childrenOf(k.id).length ? `<span class="muted small">${childrenOf(k.id).length} inside</span>` : ''}</li>`).join('')}</ul>${kids.length > 40 ? `<p class="small muted">…and ${kids.length - 40} more</p>` : ''}</div>` : ''; })()}
      ${(() => { const own = mapsFor(e).own.map(id => W().maps.find(m => m.id === id)).filter(Boolean); return own.length ? `<div class="card side-box"><h4>Maps of ${esc(e.name)}</h4><ul class="link-list">${own.map(m => `<li><a href="#/map/${m.id}">🗺️ ${esc(m.name)}</a></li>`).join('')}</ul></div>` : ''; })()}
      ${pins.length ? `<div class="card side-box"><h4>On maps</h4><ul class="link-list">${pins.map(({ m, p }) => `<li><a href="#/map/${m.id}?pin=${p.id}">📍 ${esc(m.name)}</a></li>`).join('')}</ul></div>` : ''}
    </div>
  </div>`;
}

export function renderView(main, id) {
  const e = getEntry(id);
  if (!e) { main.innerHTML = `<div class="empty"><div class="big">❓</div>Entry not found. <a href="#/entries">Back to World Bible</a></div>`; return; }
  const hasSheet = e.type === 'character' || e.type === 'creature';
  let tab = hasSheet ? (localStorage.getItem('loreforge:entrytab') || 'sheet') : 'story';
  main.innerHTML = `
    <div class="page-head"><div class="breadcrumbs" style="flex:1"><a href="#/entries">World Bible</a> › <a href="#/entries/${e.type}">${TYPES[e.type]?.plural}</a></div>
      <button id="fav" title="${e.fav ? 'Unpin from sidebar' : 'Pin to sidebar'}" class="${e.fav ? 'active' : ''}">${e.fav ? '⭐ Pinned' : '☆ Pin'}</button>
      ${e.type === 'location' ? `<a class="btn" href="#/forge?loc=${e.id}&kind=bounty" title="Generate a bounty, quest or rumours set here">🔮 Forge a story here</a>` : ''}
      <a class="btn" href="#/graph?focus=${e.id}">🕸️ Web</a>
      <a class="btn primary" href="#/entry/${e.id}/edit" style="background:var(--accent);color:var(--on-accent)">✎ Edit</a>
      <button class="danger" id="del">Delete</button></div>
    ${hasSheet ? `<div class="entry-tabs"><button data-etab="sheet" class="${tab === 'sheet' ? 'on' : ''}">🛡️ Character sheet</button><button data-etab="story" class="${tab === 'story' ? 'on' : ''}">📖 Story & links</button>
      ${e.type === 'character' || e.type === 'creature' ? `<a class="btn small" href="#/combat?add=${e.id}" style="margin-left:auto">⚔️ Add to combat</a>` : ''}</div>` : ''}
    <div id="etab-sheet" ${tab === 'sheet' ? '' : 'hidden'}></div>
    <div id="etab-story" ${tab === 'story' ? '' : 'hidden'}>${readHTML(e)}</div>`;
  let stopSheet = null;
  if (hasSheet) {
    const showTab = t => {
      tab = t; try { localStorage.setItem('loreforge:entrytab', t); } catch { /* */ }
      main.querySelectorAll('[data-etab]').forEach(b => b.classList.toggle('on', b.dataset.etab === t));
      main.querySelector('#etab-sheet').hidden = t !== 'sheet'; main.querySelector('#etab-story').hidden = t !== 'story';
      if (t === 'sheet' && !stopSheet) stopSheet = mountSheet(main.querySelector('#etab-sheet'), e);
    };
    main.querySelectorAll('[data-etab]').forEach(b => b.onclick = () => showTab(b.dataset.etab));
    if (tab === 'sheet') showTab('sheet');
  }
  main.querySelector('#del').onclick = async () => {
    if (await confirmDialog(`Delete “${e.name}”? Links to it elsewhere will show as broken.`)) { deleteEntry(e.id); go(`#/entries/${e.type}`); }
  };
  main.querySelector('#addrel').onclick = () => relationDialog(e);
  main.querySelector('#fav').onclick = () => { e.fav = !e.fav; save(); rerender(); };
  main.querySelectorAll('[data-delrel]').forEach(b => b.onclick = () => {
    W().relations = W().relations.filter(r => r.id !== b.dataset.delrel); save(); rerender();
  });
  return () => stopSheet?.();
}

export function relationDialog(e, onDone) {
  const others = W().entries.filter(x => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) return toast('Create another entry first');
  openModal(`<h2>New relationship</h2>
    <p class="muted small">How is <b>${esc(e.name)}</b> connected to something else?</p>
    <div class="row"><div><label>${esc(e.name)} is…</label><input id="lab" list="rel-sugg" placeholder="e.g. ally of, rules, sister of" autofocus>
      <datalist id="rel-sugg">${['ally of', 'enemy of', 'member of', 'leader of', 'rules', 'lives in', 'parent of', 'child of', 'sibling of', 'married to', 'in love with', 'hunts', 'rival of', 'owns', 'serves', 'worships', 'created'].map(s => `<option value="${s}">`).join('')}</datalist></div>
    <div><label>…this entry</label><select id="to">${others.map(o => `<option value="${o.id}">${esc(o.name)} (${TYPES[o.type]?.label})</option>`).join('')}</select></div></div>
    <label>Kind (sets its colour in the World Web)</label>${relKindPicker('')}
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Add</button></div>`, m => {
    let kind = '';
    wireRelKindPicker(m, k => kind = k);
    m.addEventListener('click', ev => {
      const a = ev.target.dataset.a;
      if (a === 'no') closeModal();
      if (a === 'yes') {
        W().relations.push({ id: uid(), from: e.id, to: m.querySelector('#to').value, label: m.querySelector('#lab').value.trim(), ...(kind ? { kind } : {}) });
        save(); closeModal(); (onDone || rerender)();
      }
    });
  });
}

export function renderEdit(main, id) {
  const e = getEntry(id);
  if (!e) { main.innerHTML = `<div class="empty">Entry not found.</div>`; return; }
  const touch = () => { e.updated = Date.now(); save(); };
  main.innerHTML = `
    <div class="page-head"><h1>Editing</h1><span class="muted small">Saves automatically</span>
      <a class="btn primary" href="#/entry/${e.id}" style="background:var(--accent);color:var(--on-accent)">✓ Done</a></div>
    <div class="entry-layout">
      <div>
        <label>Name</label><input id="name" value="${esc(e.name)}" style="font-size:1.3em;font-family:var(--display);font-weight:700">
        <label>One-line summary</label><input id="summary" value="${esc(e.summary)}" placeholder="Shown on cards and in previews">
        <label>Description</label>${editorHTML('body', e.body, 16)}
        <label>🔒 GM secrets (never included in the wiki export)</label>${editorHTML('secret', e.secret, 5, 'Hidden motives, twists, stat blocks… type @ to link')}
      </div>
      <div>
        <div class="card side-box">
          <h4>Type</h4>
          <select id="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>
        </div>
        <div class="card side-box">
          <h4>Part of</h4>
          <p class="small muted" style="margin:0 0 6px">The place (or planet, realm…) this sits inside. It becomes a sub-node of it in the World Web.</p>
          <select id="parent"><option value="">— nothing —</option>${Object.entries(TYPES).filter(([k]) => k !== 'character').map(([k, t]) => {
            const opts = W().entries.filter(x => x.type === k && x.id !== e.id && !isDescendant(x.id, e.id)).sort((a, b) => a.name.localeCompare(b.name));
            return opts.length ? `<optgroup label="${t.plural}">${opts.map(x => `<option value="${x.id}" ${x.id === e.parentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : '';
          }).join('')}</select>
          ${!e.parentId && parentOf(e) ? `<p class="small muted" style="margin:6px 0 0">Inside <b>${esc(getEntry(parentOf(e)).name)}</b> because of its map.</p>` : ''}
        </div>
        <div class="card side-box">
          <h4>Image</h4>
          ${e.image ? `<img ${A.src(e.image)} style="width:100%;border-radius:8px;margin-bottom:8px">` : ''}
          <div class="row"><button id="img">${e.image ? 'Replace' : '⬆ Upload'}</button>${e.image ? '<button id="noimg" class="danger">Remove</button>' : ''}</div>
        </div>
        <div class="card side-box">
          <h4>Details</h4>
          <div id="fields">${e.fields.map((f, i) => `<div class="field-row"><input data-fk="${i}" value="${esc(f.k)}" placeholder="Field"><input data-fv="${i}" value="${esc(f.v)}" placeholder="Value"><button class="icon" data-fdel="${i}">✕</button></div>`).join('')}</div>
          <button class="small" id="addf">＋ Field</button>
        </div>
        <div class="card side-box">
          <h4>Tags</h4>
          <input id="tags" value="${esc(e.tags.join(', '))}" placeholder="comma, separated">
        </div>
      </div>
    </div>`;
  const $m = s => main.querySelector(s);
  $m('#name').addEventListener('input', ev => { e.name = ev.target.value || 'Untitled'; touch(); });
  $m('#summary').addEventListener('input', ev => { e.summary = ev.target.value; touch(); });
  $m('#type').addEventListener('change', ev => {
    e.type = ev.target.value;
    // add the new type's default fields if missing
    for (const k of TYPES[e.type].fields) if (!e.fields.some(f => f.k === k)) e.fields.push({ k, v: '' });
    touch(); renderEdit(main, id);
  });
  $m('#parent').addEventListener('change', ev => { e.parentId = ev.target.value; touch(); renderEdit(main, id); });
  $m('#tags').addEventListener('input', ev => { e.tags = ev.target.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean); touch(); });
  attachEditor($m('#body'), v => { e.body = v; touch(); });
  attachEditor($m('#secret'), v => { e.secret = v; touch(); });
  $m('#fields').addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.fk) e.fields[+t.dataset.fk].k = t.value;
    if (t.dataset.fv) e.fields[+t.dataset.fv].v = t.value;
    touch();
  });
  $m('#fields').addEventListener('click', ev => {
    const d = ev.target.closest('[data-fdel]');
    if (d) { e.fields.splice(+d.dataset.fdel, 1); touch(); renderEdit(main, id); }
  });
  $m('#addf').onclick = () => { e.fields.push({ k: '', v: '' }); touch(); renderEdit(main, id); main.querySelector('#fields .field-row:last-child input')?.focus(); };
  $m('#img').onclick = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    try { e.image = (await A.storeImage(f, { maxDim: 1200 })).ref; touch(); renderEdit(main, id); } catch { toast('Could not read that image'); }
  };
  const noimg = $m('#noimg'); if (noimg) noimg.onclick = () => { e.image = ''; touch(); renderEdit(main, id); };
}
