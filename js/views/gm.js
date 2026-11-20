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
    <div class="page-head"><h1>GM Screen</h1><span class="muted small">Everything you need at the table. Press <kbd>D</kbd> anywhere for the dice tray.</span></div>
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
          <h3 style="margin:0;flex:1">⚔️ Initiative <span class="muted small" id="round">Round ${c.round}</span></h3>
          <button class="shrink small" id="cprev">◀ Prev</button>
          <button class="shrink small primary" id="cnext">Next turn ▶</button>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:6px;margin:10px 0">
          <button class="shrink small" id="cadd">＋ Combatant</button>
          <button class="shrink small" id="cfrom">＋ From World Bible</button>
          <button class="shrink small" id="cparty">＋ Whole party</button>
          <button class="shrink small" id="croll">🎲 Roll initiative</button>
          <span style="flex:1"></span>
          <button class="shrink small danger" id="cclear">End combat</button>
        </div>
        <div id="clist"></div>
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

  // ---------- combat ----------
  const sorted = () => c.list.slice().sort((a, b) => (b.init - a.init) || (b.bonus - a.bonus) || a.name.localeCompare(b.name));
  function drawCombat() {
    $m('#round').textContent = `Round ${c.round}`;
    const list = sorted();
    if (c.turn >= list.length) c.turn = 0;
    $m('#clist').innerHTML = list.length ? list.map((x, i) => {
      const pct = x.maxHp ? Math.max(0, Math.min(100, x.hp / x.maxHp * 100)) : 0;
      const ent = getEntry(x.entryId);
      return `<div class="combatant ${i === c.turn ? 'active' : ''} ${x.side} ${x.maxHp && x.hp <= 0 ? 'down' : ''}" data-id="${x.id}">
        <input class="c-init" data-f="init" type="number" value="${x.init}" title="Initiative">
        <div class="c-main">
          <div class="c-name">${ent ? `<a href="#/entry/${ent.id}" class="mention" style="--tc:${typeColor(ent.type)}">${esc(x.name)}</a>` : `<b>${esc(x.name)}</b>`}
            <span class="c-ac" title="Armour class">🛡 ${x.ac || '–'}</span></div>
          ${x.maxHp ? `<div class="hpbar"><div style="width:${pct}%;background:${pct > 50 ? 'var(--ok)' : pct > 20 ? '#d9a13b' : 'var(--danger)'}"></div></div>` : ''}
          <div class="c-conds">${x.conds.map(cd => `<span class="cond" data-cond="${cd}" title="Click to remove">${cd} ✕</span>`).join('')}<button class="icon small" data-addcond title="Add condition">＋ condition</button></div>
        </div>
        <div class="c-hp">${x.maxHp ? `<span>${x.hp}/${x.maxHp}</span>` : '<span class="muted">no HP</span>'}<input data-f="dmg" placeholder="−5 / +5" title="Type damage (−) or healing (+) and press Enter"></div>
        <button class="icon" data-del title="Remove">✕</button>
      </div>`;
    }).join('') : '<p class="muted small">No one in combat. Add combatants, your party, or creatures from the World Bible.</p>';
    save();
  }
  const addCombatant = x => { c.list.push(Object.assign({ id: uid(), init: 0, bonus: 0, hp: 0, maxHp: 0, ac: '', side: 'enemy', conds: [], entryId: '' }, x)); drawCombat(); };
  function combatantDialog(pre = {}) {
    openModal(`<h2>Add combatant</h2>
      <div class="row"><div><label>Name</label><input id="cn" value="${esc(pre.name || '')}" autofocus></div><div class="shrink" style="width:110px"><label>Count</label><input id="cc" type="number" min="1" max="20" value="1"></div></div>
      <div class="row"><div><label>Init bonus</label><input id="cb" type="number" value="${pre.bonus ?? 0}"></div><div><label>Max HP</label><input id="ch" placeholder="e.g. 7 or 2d8+2" value="${esc(pre.hp || '')}"></div><div><label>AC</label><input id="ca" value="${esc(pre.ac || '')}"></div></div>
      <label>Side</label><div class="seg small"><button data-side="enemy" class="on">Enemy</button><button data-side="ally">Ally</button></div>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Add & roll initiative</button></div>`, m => {
      let side = 'enemy';
      m.addEventListener('click', e => {
        const s = e.target.closest('[data-side]'); if (s) { side = s.dataset.side; m.querySelectorAll('[data-side]').forEach(b => b.classList.toggle('on', b === s)); }
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'yes') {
          const name = m.querySelector('#cn').value.trim() || 'Combatant';
          const n = Math.max(1, Math.min(20, +m.querySelector('#cc').value || 1));
          const bonus = +m.querySelector('#cb').value || 0;
          const hpTxt = m.querySelector('#ch').value.trim();
          for (let i = 0; i < n; i++) {
            let hp = 0; try { hp = hpTxt ? (/d/.test(hpTxt) ? rollAndLog(hpTxt).total : +hpTxt) : 0; } catch { hp = 0; }
            const init = rollAndLog(`d20${bonus >= 0 ? '+' : ''}${bonus}`).total;
            c.list.push({ id: uid(), name: n > 1 ? `${name} ${i + 1}` : name, init, bonus, hp, maxHp: hp, ac: m.querySelector('#ca').value.trim(), side, conds: [], entryId: pre.entryId || '' });
          }
          drawCombat();
        }
        closeModal();
      });
    });
  }
  $m('#cadd').onclick = () => combatantDialog();
  $m('#cfrom').onclick = () => pickEntryDialog('Add to combat from the World Bible', '', ent => {
    const f = k => ent.fields.find(x => x.k.toLowerCase() === k)?.v || '';
    combatantDialog({ name: ent.name, entryId: ent.id, hp: f('hp') || f('hit points'), ac: f('ac') || f('armor class') || f('armour class') });
  });
  $m('#cparty').onclick = () => {
    if (!w.party.length) return toast('Add party members first');
    for (const p of w.party) if (!c.list.some(x => x.partyId === p.id)) {
      c.list.push({ id: uid(), partyId: p.id, name: p.name, init: rollAndLog(`d20+${+p.init || 0}`).total, bonus: +p.init || 0, hp: +p.hp || 0, maxHp: +p.hp || 0, ac: p.ac, side: 'ally', conds: [], entryId: p.entryId || '' });
    }
    drawCombat(); toast('Party joined — initiative rolled');
  };
  $m('#croll').onclick = () => { for (const x of c.list) x.init = rollAndLog(`d20${x.bonus >= 0 ? '+' : ''}${x.bonus}`).total; c.turn = 0; c.round = 1; drawCombat(); };
  $m('#cnext').onclick = () => { if (!c.list.length) return; c.turn++; if (c.turn >= c.list.length) { c.turn = 0; c.round++; } drawCombat(); };
  $m('#cprev').onclick = () => { if (!c.list.length) return; c.turn--; if (c.turn < 0) { c.turn = c.list.length - 1; c.round = Math.max(1, c.round - 1); } drawCombat(); };
  $m('#cclear').onclick = async () => { if (await confirmDialog('End combat and clear the tracker?', 'End combat')) { c.list = []; c.round = 1; c.turn = 0; drawCombat(); } };
  const clist = $m('#clist');
  clist.addEventListener('change', e => {
    const row = e.target.closest('.combatant'); if (!row) return;
    const x = c.list.find(y => y.id === row.dataset.id);
    if (e.target.dataset.f === 'init') { x.init = +e.target.value || 0; drawCombat(); }
  });
  clist.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.dataset.f !== 'dmg') return;
    const row = e.target.closest('.combatant');
    const x = c.list.find(y => y.id === row.dataset.id);
    const v = e.target.value.trim(); if (!v) return;
    let n; try { n = /d/.test(v) ? rollAndLog(v.replace(/^[+-]/, '')).total * (v[0] === '+' ? 1 : -1) : +v; } catch { return toast('Try −5 or +5'); }
    if (v[0] !== '+' && v[0] !== '-' && !/d/.test(v)) n = -Math.abs(n); // plain number = damage
    x.hp = Math.max(0, Math.min(x.maxHp || Infinity, x.hp + n));
    drawCombat();
    toast(n < 0 ? `${x.name} takes ${-n} damage` : `${x.name} heals ${n}`);
  });
  clist.addEventListener('click', e => {
    const row = e.target.closest('.combatant'); if (!row) return;
    const x = c.list.find(y => y.id === row.dataset.id);
    if (e.target.closest('[data-del]')) { c.list = c.list.filter(y => y !== x); drawCombat(); }
    const cd = e.target.closest('[data-cond]'); if (cd) { x.conds = x.conds.filter(k => k !== cd.dataset.cond); drawCombat(); }
    if (e.target.closest('[data-addcond]')) {
      openModal(`<h2>Condition for ${esc(x.name)}</h2><div class="filters">${CONDITIONS.map(k => `<button class="chip ${x.conds.includes(k) ? 'on' : ''}" data-k="${k}">${k}</button>`).join('')}</div>
        <div class="modal-actions"><button class="primary" data-a="done">Done</button></div>`, m => {
        m.addEventListener('click', ev => {
          const b = ev.target.closest('[data-k]');
          if (b) { const k = b.dataset.k; x.conds = x.conds.includes(k) ? x.conds.filter(y => y !== k) : [...x.conds, k]; b.classList.toggle('on'); }
          if (ev.target.dataset.a) { closeModal(); drawCombat(); }
        });
      });
    }
  });

  // ---------- party ----------
  function drawParty() {
    $m('#plist').innerHTML = w.party.length ? `<table class="party-table"><tr><th>Name</th><th>AC</th><th>HP</th><th>Init</th><th>PP</th><th></th></tr>
      ${w.party.map(p => `<tr data-id="${p.id}">${['name', 'ac', 'hp', 'init', 'pp'].map(f => `<td><input data-f="${f}" value="${esc(p[f] ?? '')}" ${f === 'name' ? '' : 'class="num"'}></td>`).join('')}<td><button class="icon small" data-pdel>✕</button></td></tr>`).join('')}</table>
      <p class="muted small" style="margin:6px 0 0">PP = passive perception. Edits save automatically.</p>` : '<p class="muted small">Add your players’ characters for quick reference and one-click initiative.</p>';
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
