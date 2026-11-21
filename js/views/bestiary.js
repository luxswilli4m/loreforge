// Bestiary: the D&D 5e SRD, Pathfinder Monster Core and Mythos libraries, your own creatures, and a creature maker.
import { W, save, newEntry } from '../store.js';
import { esc, toast, openModal, closeModal, go } from '../util.js';
import { rollAndLog } from '../tools/dice.js';
import { LIBRARIES, loadLibrary, statblockHTML, monsterToSheet, crNum, mod } from '../gen/statblocks.js';
import { ensureSheet, speedText } from './sheet.js';

const st = { lib: 'dnd5e', q: '', type: '', min: '', max: '', sel: null };

export function render(main) {
  main.innerHTML = `<div class="page-head"><h1>Bestiary</h1><span class="muted small">Every creature here can go straight into a fight or into your World Bible.</span><span style="flex:1"></span>
      <button class="primary" id="bs-make">＋ Make a creature</button></div>
    <div class="bs-tabs">${Object.entries(LIBRARIES).map(([k, l]) => `<button data-lib="${k}" class="${st.lib === k ? 'on' : ''}">${l.label}</button>`).join('')}<button data-lib="mine" class="${st.lib === 'mine' ? 'on' : ''}">🐉 My creatures</button></div>
    <div class="bs-shell">
      <aside class="card side-box bs-list">
        <input id="bs-q" placeholder="Search…" value="${esc(st.q)}">
        <div class="row" style="gap:6px;margin-top:6px"><select id="bs-type"><option value="">Any type</option></select>
          <input id="bs-min" placeholder="${st.lib === 'pf2e' ? 'Lv' : 'CR'} from" value="${esc(st.min)}" style="max-width:76px"><input id="bs-max" placeholder="to" value="${esc(st.max)}" style="max-width:60px"></div>
        <div class="small muted" id="bs-count" style="margin:6px 0"></div>
        <div id="bs-rows" class="bs-rows"><p class="muted small">Loading…</p></div>
      </aside>
      <section class="bs-view" id="bs-view"><div class="empty"><div class="big">🐲</div>Pick a creature to see its stat block.</div></section>
    </div>
    <p class="small muted bs-credit" id="bs-credit"></p>`;
  const $ = s => main.querySelector(s);
  let list = [];
  const isMine = () => st.lib === 'mine';
  const level = m => m.sys === 'pf2e' ? m.level : crNum(m.cr);
  const typeOf = m => m.sys === 'pf2e' ? (m.traits || []).find(t => !['humanoid'].includes(t)) || m.traits?.[0] || '' : String(m.type || '').replace(/\s*\(.*/, '');

  async function load() {
    if (isMine()) {
      list = W().entries.filter(e => e.type === 'creature' || (e.type === 'character' && e.sheet?.cr !== undefined && e.sheet?.src)).map(e => ({ entry: e, name: e.name, cr: e.sheet?.cr ?? '', type: e.sheet?.ctype || 'creature', sys: '5e', lib: 'mine', id: e.id }));
      $('#bs-credit').textContent = 'Creatures from your World Bible. Make new ones with ＋ Make a creature, or copy any library creature in.';
    } else {
      list = await loadLibrary(st.lib);
      $('#bs-credit').textContent = LIBRARIES[st.lib].credit;
    }
    const types = [...new Set(list.map(typeOf).filter(Boolean))].sort();
    $('#bs-type').innerHTML = `<option value="">Any type</option>${types.map(t => `<option ${st.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    drawList();
    if (st.sel) { const m = list.find(x => x.id === st.sel); if (m) show(m); }
  }
  function filtered() {
    const q = st.q.toLowerCase(), lo = st.min === '' ? -Infinity : crNum(st.min), hi = st.max === '' ? Infinity : crNum(st.max);
    return list.filter(m => (!q || m.name.toLowerCase().includes(q)) && (!st.type || typeOf(m) === st.type) && (isMine() || (level(m) >= lo && level(m) <= hi)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function drawList() {
    const f = filtered();
    $('#bs-count').textContent = `${f.length} of ${list.length}`;
    $('#bs-rows').innerHTML = f.slice(0, 600).map(m => `<button class="bs-row ${st.sel === m.id ? 'on' : ''}" data-id="${esc(m.id)}"><b>${esc(m.name)}</b><span>${m.sys === 'pf2e' ? `Lv ${m.level}` : m.cr !== '' && m.cr != null ? `CR ${esc(m.cr)}` : ''}</span><i>${esc(typeOf(m))}</i></button>`).join('') || '<p class="muted small">Nothing matches.</p>';
  }
  function show(m) {
    st.sel = m.id;
    main.querySelectorAll('.bs-row').forEach(r => r.classList.toggle('on', r.dataset.id === m.id));
    if (m.entry) {
      $('#bs-view').innerHTML = `<div class="bs-actions"><a class="btn primary" href="#/combat?add=${m.entry.id}">⚔️ Add to combat</a><a class="btn" href="#/entry/${m.entry.id}">🛡️ Open its sheet</a></div>
        <div class="card"><h3 style="margin-top:0">${esc(m.name)}</h3><p class="muted">${esc(m.entry.summary || '')}</p><p class="small">${m.cr !== '' ? `CR ${esc(m.cr)} · ` : ''}${esc(m.type)}</p></div>`;
      return;
    }
    $('#bs-view').innerHTML = `<div class="bs-actions"><label class="small">How many <input id="bs-n" type="number" min="1" max="30" value="1" style="width:60px"></label>
        <button class="primary" data-act="combat">⚔️ Add to combat</button><button data-act="bible">📚 Copy to World Bible</button></div>
      ${statblockHTML(m, { unit: v => speedText(v) })}`;
  }
  // ---------- events ----------
  main.querySelector('.bs-tabs').addEventListener('click', e => { const b = e.target.closest('[data-lib]'); if (!b) return; st.lib = b.dataset.lib; st.type = ''; st.sel = null; render(main); });
  $('#bs-q').addEventListener('input', e => { st.q = e.target.value; drawList(); });
  $('#bs-type').addEventListener('change', e => { st.type = e.target.value; drawList(); });
  $('#bs-min').addEventListener('input', e => { st.min = e.target.value.trim(); drawList(); });
  $('#bs-max').addEventListener('input', e => { st.max = e.target.value.trim(); drawList(); });
  $('#bs-rows').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) show(list.find(m => m.id === b.dataset.id)); });
  $('#bs-view').addEventListener('click', e => {
    const r = e.target.closest('[data-roll]'); if (r) { try { const res = rollAndLog(r.dataset.roll); toast(`${r.dataset.label}: ${res.total}`); } catch (err) { toast(err.message); } return; }
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    const m = list.find(x => x.id === st.sel); if (!m) return;
    if (a === 'combat') go(`#/combat?bst=${m.lib}:${m.id}&n=${Math.max(1, +$('#bs-n').value || 1)}`);
    if (a === 'bible') { const ent = copyToBible(m); toast(`${ent.name} is in your World Bible, with a sheet`); go(`#/entry/${ent.id}`); }
  });
  $('#bs-make').onclick = () => makeCreatureDialog();
  load();
}

export function copyToBible(m, name) {
  const e = newEntry('creature', name || m.name);
  e.summary = m.lore || (m.sys === 'pf2e' ? `A level ${m.level} ${(m.traits || []).join(' ')} creature.` : `${m.size} ${m.type}, CR ${m.cr}.`);
  const f = k => e.fields.find(x => x.k === k);
  if (f('Size')) f('Size').v = m.size || '';
  if (f('Danger')) f('Danger').v = m.sys === 'pf2e' ? `Level ${m.level}` : `CR ${m.cr}`;
  e.tags = ['bestiary'];
  e.sheet = monsterToSheet(m); ensureSheet(e); save();
  return e;
}

// ---------- making your own creature ----------
// typical stats at each challenge rating, worked out from the SRD's own monsters (medians)
let crTable = null;
async function typical(cr) {
  if (!crTable) {
    const all = await loadLibrary('dnd5e'), by = {};
    for (const m of all) (by[m.cr] = by[m.cr] || []).push(m);
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
    crTable = Object.fromEntries(Object.entries(by).map(([k, ms]) => [k, { ac: med(ms.map(m => m.ac)), hp: med(ms.map(m => m.hp)), hit: med(ms.map(m => Math.max(0, ...m.actions.map(a => a.hit ?? 0)))),
      abil: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => [k, med(ms.map(m => m.abil[k]))])) }]));
  }
  const keys = Object.keys(crTable).sort((a, b) => crNum(a) - crNum(b));
  return crTable[cr] || crTable[keys.reduce((b, k) => Math.abs(crNum(k) - crNum(cr)) < Math.abs(crNum(b) - crNum(cr)) ? k : b, keys[0])];
}
export function makeCreatureDialog() {
  const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
  openModal(`<h2>Make a creature</h2>
    <p class="small muted">Starts with typical numbers for its challenge rating (worked out from the official monsters), so it plays about right. Change anything on its sheet afterwards.</p>
    <div class="row"><div style="flex:2"><label>Name</label><input id="mc-name" placeholder="e.g. Bog Lurker" autofocus></div><div><label>Challenge</label><select id="mc-cr">${CRS.map(c => `<option ${c === '2' ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <div class="row"><div><label>Size</label><select id="mc-size">${['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].map(s => `<option ${s === 'Medium' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Type</label><input id="mc-type" list="mc-types" placeholder="beast, undead, fiend…"><datalist id="mc-types">${['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'].map(t => `<option value="${t}">`).join('')}</datalist></div>
      <div><label>Fights by</label><select id="mc-role"><option value="brute">Hitting hard (Strength)</option><option value="skirmisher">Speed and precision (Dexterity)</option><option value="caster">Magic (spells)</option></select></div></div>
    <label>Main attack</label><div class="row"><input id="mc-atk" placeholder="e.g. Bite" value="Claw"><input id="mc-dtype" placeholder="damage type" value="slashing"></div>
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Create & open its sheet</button></div>`, m => m.addEventListener('click', async ev => {
    const a = ev.target.dataset.a; if (!a) return;
    if (a === 'no') return closeModal();
    const q = s => m.querySelector(s);
    const name = q('#mc-name').value.trim(); if (!name) return q('#mc-name').focus();
    const cr = q('#mc-cr').value, t = await typical(cr), role = q('#mc-role').value;
    const abil = { ...t.abil };
    if (role === 'skirmisher') [abil.str, abil.dex] = [Math.min(abil.str, abil.dex), Math.max(abil.str, abil.dex) + 2];
    if (role === 'caster') { abil.int = Math.max(abil.int, 14 + Math.floor(crNum(cr) / 3)); abil.str = Math.min(abil.str, 10); }
    const ab = role === 'skirmisher' ? 'dex' : role === 'caster' ? 'int' : 'str';
    const pb = Math.max(2, 2 + Math.floor((Math.max(crNum(cr), 1) - 1) / 4));
    const die = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 }[q('#mc-size').value];
    const avgPerHit = Math.max(2, Math.round((t.hit + 2) * 1.6)), n = Math.max(1, Math.round((avgPerHit - mod(abil[ab])) / ((die + 1) / 2)));
    const monster = { sys: '5e', lib: 'custom', id: '', name, size: q('#mc-size').value, type: q('#mc-type').value || 'monstrosity', ac: t.ac, hp: t.hp, hpRoll: '', speed: { walk: 30 }, abil, cr, saves: {}, skills: {},
      senses: 'darkvision 60 ft.', langs: '', traits: [], reactions: [], legendary: [],
      actions: [{ n: q('#mc-atk').value || 'Attack', d: '', hit: mod(abil[ab]) + pb, dmg: [{ dice: `${n}d${Math.min(die, 12)}${mod(abil[ab]) ? (mod(abil[ab]) > 0 ? '+' : '') + mod(abil[ab]) : ''}`, type: q('#mc-dtype').value || 'slashing' }] }] };
    const e = copyToBible(monster, name);
    e.sheet.src = ''; e.tags = ['homebrew']; save();
    closeModal(); toast(`${name} created`); go(`#/entry/${e.id}`);
  }));
}
