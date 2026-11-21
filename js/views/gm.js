// GM Screen: dice, initiative tracker, party, quick generators and custom random tables.
import { W, uid, save, newEntry, getEntry, TYPES } from '../store.js';
import { esc, openModal, closeModal, toast, confirmDialog, go, typeColor } from '../util.js';
import { rollAndLog, rollHTML, history } from '../tools/dice.js';
import { GENERATORS } from '../tools/generators.js';
import { pickEntryDialog } from './graph.js';

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Concentrating', 'Exhausted'];
let lastGen = null;

export function render(main) {
  const w = W();
  const c = w.combat;
  main.innerHTML = `
    <div class="page-head"><h1>GM Screen</h1><span class="muted small">Everything you need at the table. The 🎲 button in the corner opens the dice tray anywhere.</span></div>
    <div class="gm-grid">
      <section class="card gm-dice">
        <h3>🎲 Dice</h3>
        <div class="dice-buttons">${['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => `<button data-roll="1${d}">${d}</button>`).join('')}
          <button data-roll="adv" title="2d20, keep highest">Adv</button><button data-roll="dis" title="2d20, keep lowest">Dis</button></div>
        <div class="row" style="margin-top:8px"><input id="dexpr" placeholder="e.g. 2d6+3, 4d6kh3, d20+5"><button class="primary shrink" id="droll">Roll</button></div>
        <div id="dlast" class="dice-last"></div>
        <div id="dhist" class="dice-hist"></div>
      </section>

      <section class="card gm-combat">
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <h3 style="margin:0;flex:1">⚔️ Combat <span class="muted small" id="round"></span></h3>
          <a class="btn small primary" href="#/combat">Open the combat tracker ▶</a>
        </div>
        <div id="clist" style="margin-top:10px"></div>
      </section>

      <section class="card gm-party">
        <div class="row"><h3 style="margin:0">🛡️ Party</h3><button class="shrink small" id="padd">＋ Member</button></div>
        <div id="plist"></div>
      </section>

      <section class="card gm-gen">
        <h3>✨ Quick generators</h3>
        <div class="dice-buttons">${Object.entries(GENERATORS).map(([k, [ic, label]]) => `<button data-gen="${k}">${ic} ${label}</button>`).join('')}</div>
        <div id="genout" class="gen-out"></div>
      </section>

      <section class="card gm-tables">
        <div class="row"><h3 style="margin:0">📋 Random tables</h3><button class="shrink small" id="tadd">＋ New table</button></div>
        <div id="tlist"></div>
        <div id="tout" class="gen-out"></div>
      </section>
    </div>`;
  const $m = s => main.querySelector(s);

  // ---------- dice ----------
  const showRoll = r => { $m('#dlast').innerHTML = rollHTML(r, esc); drawHist(); };
  const drawHist = () => {
    $m('#dhist').innerHTML = history.slice(1, 12).map(h => `<button class="hist-row" data-roll="${esc(h.input)}"><b>${h.total}</b><span>${esc(h.input)}</span></button>`).join('');
  };
  const doRoll = expr => { try { showRoll(rollAndLog(expr)); } catch (e) { toast(e.message); } };
  main.querySelector('.gm-dice').addEventListener('click', e => { const b = e.target.closest('[data-roll]'); if (b) doRoll(b.dataset.roll); });
  $m('#droll').onclick = () => doRoll($m('#dexpr').value);
  $m('#dexpr').addEventListener('keydown', e => { if (e.key === 'Enter') doRoll(e.target.value); });
  if (history[0]) showRoll(history[0]); else drawHist();
  const onRoll = () => { if (history[0]) { $m('#dlast').innerHTML = rollHTML(history[0], esc); drawHist(); } };
  window.addEventListener('lf-roll', onRoll);

  // ---------- combat (a summary; the full tracker has its own page) ----------
  function drawCombat() {
    const L = c.list || [], cur = L.find(x => x.id === c.turnId);
    $m('#round').textContent = cur ? `Round ${c.round} · ${cur.name}’s turn` : L.length ? 'Not started' : '';
    $m('#clist').innerHTML = L.length ? L.map(x => `<div class="combatant ${x.id === c.turnId ? 'active' : ''} ${x.side} ${x.maxHp && x.hp <= 0 ? 'down' : ''}">
        <span class="c-init">${x.init === '' || x.init == null ? '—' : x.init}</span>
        <div class="c-main"><div class="c-name"><b>${esc(x.name)}</b><span class="c-ac">🛡 ${esc(String(x.ac ?? '–') || '–')}</span></div>
          ${x.maxHp ? `<div class="hpbar"><div style="width:${Math.max(0, Math.min(100, x.hp / x.maxHp * 100))}%;background:${x.hp / x.maxHp > 0.5 ? 'var(--ok)' : x.hp / x.maxHp > 0.25 ? '#d9a13b' : 'var(--danger)'}"></div></div>` : ''}</div>
        <div class="c-hp">${x.maxHp ? `${x.hp}/${x.maxHp}` : ''}</div></div>`).join('')
      : '<p class="muted small">No fight going on. Open the combat tracker to start one.</p>';
  }

  // ---------- party ----------
  function drawParty() {
    $m('#plist').innerHTML = w.party.length ? `<table class="party-table"><tr><th>Name</th><th>Lv</th><th>AC</th><th>HP</th><th>Init</th><th>PP</th><th></th></tr>
      ${w.party.map(p => `<tr data-id="${p.id}">${['name', 'level', 'ac', 'hp', 'init', 'pp'].map(f => `<td><input data-f="${f}" value="${esc(p[f] ?? '')}" ${f === 'name' ? '' : 'class="num"'}></td>`).join('')}<td><button class="icon small" data-pdel>✕</button></td></tr>`).join('')}</table>
      <p class="muted small" style="margin:6px 0 0">Lv = level (for encounter difficulty), PP = passive perception. Edits save automatically. Party members linked to the World Bible use their character sheets in the combat tracker.</p>` : '<p class="muted small">Add your players’ characters for quick reference and one-click initiative.</p>';
  }
  $m('#padd').onclick = () => { w.party.push({ id: uid(), name: 'New hero', ac: '', hp: '', init: 0, pp: '' }); save(); drawParty(); };
  $m('#plist').addEventListener('input', e => { const tr = e.target.closest('tr'); const p = w.party.find(x => x.id === tr.dataset.id); p[e.target.dataset.f] = e.target.value; save(); });
  $m('#plist').addEventListener('click', e => { if (e.target.closest('[data-pdel]')) { const tr = e.target.closest('tr'); w.party = w.party.filter(x => x.id !== tr.dataset.id); save(); drawParty(); } });

  // ---------- generators ----------
  function showGen(g) {
    lastGen = g;
    $m('#genout').innerHTML = `<h4>${esc(g.title)}</h4><table class="fields-table">${g.lines.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="row" style="margin-top:8px;gap:6px">${g.entry ? '<button class="small shrink" id="gsave">📚 Save to World Bible</button>' : ''}<button class="small shrink" id="gcopy">📋 Copy</button></div>`;
    const sv = $m('#gsave');
    if (sv) sv.onclick = () => {
      const e = newEntry(g.entry.type, g.entry.name);
      e.summary = g.entry.summary; e.body = g.entry.body || ''; e.secret = g.entry.secret || ''; e.tags = ['generated'];
      for (const [k, v] of Object.entries(g.entry.fields || {})) { const f = e.fields.find(x => x.k === k); if (f) f.v = v; else e.fields.push({ k, v }); }
      save(); toast(`${e.name} added to the World Bible`);
    };
    $m('#gcopy').onclick = () => { navigator.clipboard?.writeText(`${g.title}\n` + g.lines.map(([k, v]) => `${k}: ${v}`).join('\n')); toast('Copied'); };
  }
  main.querySelector('.gm-gen').addEventListener('click', e => { const b = e.target.closest('[data-gen]'); if (b) showGen(GENERATORS[b.dataset.gen][2]()); });
  if (lastGen) showGen(lastGen);

  // ---------- random tables ----------
  function drawTables() {
    $m('#tlist').innerHTML = w.tables.length ? w.tables.map(t => `<div class="table-row" data-id="${t.id}">
      <button class="small" data-troll>🎲 ${esc(t.name)}</button><span class="muted small">${t.rows.length} rows</span><span style="flex:1"></span>
      <button class="icon small" data-tedit title="Edit">✎</button><button class="icon small" data-tdel title="Delete">🗑</button></div>`).join('')
      : '<p class="muted small">Make your own tables — random encounters, rumours, loot — then roll on them with one click.</p>';
  }
  function tableDialog(t) {
    const isNew = !t;
    t = t || { id: uid(), name: '', rows: [] };
    openModal(`<h2>${isNew ? 'New random table' : 'Edit table'}</h2>
      <label>Name</label><input id="tn" value="${esc(t.name)}" placeholder="e.g. Forest encounters" autofocus>
      <label>Rows — one per line. Add a weight with “3x ” to make a row more likely. Dice like 2d6 inside a row get rolled.</label>
      <textarea id="tr" rows="10" placeholder="3x 1d4 wolves&#10;2x A lost merchant&#10;An owlbear&#10;A ruined shrine">${esc(t.rows.map(r => (r.w > 1 ? `${r.w}x ` : '') + r.text).join('\n'))}</textarea>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save table</button></div>`, m => {
      m.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'yes') {
          t.name = m.querySelector('#tn').value.trim() || 'Untitled table';
          t.rows = m.querySelector('#tr').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const mm = l.match(/^(\d+)x\s+(.*)$/i); return mm ? { w: +mm[1], text: mm[2] } : { w: 1, text: l }; });
          if (isNew) w.tables.push(t);
          save(); drawTables();
        }
        closeModal();
      });
    });
  }
  $m('#tadd').onclick = () => tableDialog();
  $m('#tlist').addEventListener('click', async e => {
    const row = e.target.closest('.table-row'); if (!row) return;
    const t = w.tables.find(x => x.id === row.dataset.id);
    if (e.target.closest('[data-tedit]')) return tableDialog(t);
    if (e.target.closest('[data-tdel]')) { if (await confirmDialog(`Delete the table “${t.name}”?`)) { w.tables = w.tables.filter(x => x !== t); save(); drawTables(); } return; }
    if (e.target.closest('[data-troll]')) {
      if (!t.rows.length) return toast('This table has no rows yet');
      const total = t.rows.reduce((a, r) => a + r.w, 0);
      let pick = Math.random() * total, row2 = t.rows[0];
      for (const r of t.rows) { pick -= r.w; if (pick < 0) { row2 = r; break; } }
      const text = row2.text.replace(/\b(\d*d\d+(?:[+-]\d+)?)\b/g, m => { try { return `${rollAndLog(m).total} (${m})`; } catch { return m; } });
      $m('#tout').innerHTML = `<h4>${esc(t.name)}</h4><p class="gen-result">${esc(text)}</p>`;
    }
  });

  drawCombat(); drawParty(); drawTables();
  return () => window.removeEventListener('lf-roll', onRoll);
}
