// Combat tracker: initiative, hit points, conditions and turns, built from the best bits of the popular 5e trackers.
// Search the World Bible to add someone and their stats fill in from their character sheet (HP, AC, initiative,
// CR or level); anyone else you type in by hand. Characters' hit points are written back to their sheets.
// A separate Player view window shows the order and how everyone's doing, without the numbers.
import { W, save, uid, getEntry, newEntry, TYPES } from '../store.js';
import { esc, toast, openModal, closeModal, query, go, typeColor } from '../util.js';
import { rollAndLog } from '../tools/dice.js';
import * as A from '../assets.js';
import { combatStats, writeBack, ensureSheet, derive, ABIL, sgn, CR_XP, speedText } from './sheet.js';

export const CONDS = {
  Blinded: ['🙈', 'Can’t see and fails any check that needs sight. Attacks against it have advantage; its own attacks have disadvantage.'],
  Charmed: ['💘', 'Can’t attack the one who charmed it, and that creature has advantage on social checks against it.'],
  Deafened: ['🔇', 'Can’t hear and fails any check that needs hearing.'],
  Frightened: ['😱', 'Disadvantage on checks and attacks while it can see the source of its fear, and it can’t willingly move closer.'],
  Grappled: ['🤼', 'Speed is 0. Ends if the grappler is incapacitated or they’re pulled apart.'],
  Incapacitated: ['💫', 'Can’t take actions or reactions.'],
  Invisible: ['👻', 'Can’t be seen without magic. Its attacks have advantage; attacks against it have disadvantage.'],
  Paralyzed: ['⚡', 'Incapacitated and can’t move or speak. Fails Strength and Dexterity saves. Attacks against it have advantage, and hits from within 5 ft are critical.'],
  Petrified: ['🗿', 'Turned to stone: incapacitated, unaware, resistant to all damage, immune to poison and disease.'],
  Poisoned: ['🤢', 'Disadvantage on attack rolls and ability checks.'],
  Prone: ['🛌', 'Can only crawl; disadvantage on its attacks. Melee attacks against it have advantage, ranged ones disadvantage.'],
  Restrained: ['⛓️', 'Speed 0. Attacks against it have advantage, its attacks have disadvantage, and it has disadvantage on Dexterity saves.'],
  Stunned: ['😵', 'Incapacitated, can’t move, speaks falteringly. Fails Strength and Dexterity saves; attacks against it have advantage.'],
  Unconscious: ['💤', 'Incapacitated, can’t move or speak, unaware; drops what it holds and falls prone. Fails Strength and Dexterity saves; attacks have advantage and hits from within 5 ft are critical.'],
  Exhaustion: ['😩', 'Levels of tiredness that stack up, each making things harder.'],
  Blessed: ['✨', 'Adds a d4 to attacks and saving throws.'], Hasted: ['🏃', 'Double speed, +2 AC, an extra action.'], Hexed: ['🕯️', 'Takes extra damage from the caster.'],
  Raging: ['😤', 'Bonus damage and resistance to physical damage.'], Dodging: ['🌀', 'Attacks against it have disadvantage.'], Hidden: ['🫥', 'Unseen and unheard for now.'],
};
// 2014 encounter thresholds per character level: easy, medium, hard, deadly
const THRESH = { 1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500], 13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700] };
const multiplier = n => n <= 1 ? 1 : n === 2 ? 1.5 : n <= 6 ? 2 : n <= 10 ? 2.5 : n <= 14 ? 3 : 4;
const PREF_KEY = 'loreforge:combat';
const prefs = (() => { try { return { autoSort: true, skipDown: true, rollHp: false, allyHp: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { autoSort: true, skipDown: true, rollHp: false, allyHp: true }; } })();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* */ } };
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('loreforge-combat') : null;

// older trackers stored conditions as plain names and the turn as a number
function normalize(c) {
  c.list = c.list || []; c.log = c.log || []; c.round = c.round || 1;
  for (const x of c.list) {
    x.conds = (x.conds || []).map(k => typeof k === 'string' ? { k } : k);
    x.temp = +x.temp || 0; x.hp = +x.hp || 0; x.maxHp = +x.maxHp || 0; x.init = x.init === '' ? '' : +x.init || 0; x.bonus = +x.bonus || 0;
    x.death = x.death || { s: 0, f: 0 };
  }
  if (c.turnId && !c.list.some(x => x.id === c.turnId)) c.turnId = null;
  return c;
}
const status = x => !x.maxHp ? '' : x.hp <= 0 ? (x.dead ? 'Dead' : x.side === 'ally' ? 'Down' : 'Defeated') : x.hp <= x.maxHp / 2 ? 'Bloodied' : x.hp < x.maxHp ? 'Hurt' : 'Healthy';

export function render(main) {
  const w = W();
  w.encounters = w.encounters || [];
  const c = normalize(w.combat);
  let focus = c.focusId || null, found = [], fsel = 0, timer = 0;

  main.innerHTML = `
    <div class="page-head"><h1>Combat tracker</h1>
      <input id="cb-name" class="cb-name" value="${esc(c.name || '')}" placeholder="Name this fight (e.g. Ambush at the ford)">
      <span style="flex:1"></span>
      <button id="cb-load" title="Load a saved encounter">📂 Encounters</button>
      <button id="cb-save" title="Save everyone here as an encounter to run later">💾 Save encounter</button>
      <button id="cb-player" title="Open a window to show your players">🖥️ Player view</button>
      <button class="danger" id="cb-end">End combat</button></div>
    <div class="cb-bar" id="cb-bar"></div>
    <div class="cb-shell">
      <aside class="card side-box cb-add">
        <h4>Add to the fight</h4>
        <div class="cb-search"><input id="cb-q" placeholder="Search the World Bible, or type a new name…" autocomplete="off"><div class="cb-found" id="cb-found"></div></div>
        <div class="cb-quick">
          <div class="row" style="gap:6px"><div><label>Init bonus</label><input id="qa-bonus" type="number" placeholder="+0"></div><div><label>HP</label><input id="qa-hp" placeholder="12 or 2d8+2"></div><div><label>AC</label><input id="qa-ac" placeholder="13"></div></div>
          <div class="row" style="gap:6px;align-items:flex-end"><div><label>How many</label><input id="qa-n" type="number" min="1" max="30" value="1"></div>
            <div><label>Side</label><select id="qa-side"><option value="enemy">Enemy</option><option value="ally">Ally / player</option><option value="neutral">Neutral</option></select></div></div>
          <button class="primary" id="qa-add" style="width:100%;margin-top:8px">＋ Add</button>
          <p class="small muted" style="margin:6px 0 0">Picking someone from the World Bible fills in their hit points, AC and initiative from their sheet. Anyone else starts blank for you to fill in.</p>
        </div>
        <div class="cb-more">
          <button class="small" id="cb-party">🛡️ Whole party</button>
          <button class="small" id="cb-lair" title="A lair action that happens on initiative 20">🏰 Lair action</button>
        </div>
        <div id="cb-diff"></div>
        <details class="cb-opts"><summary>Options</summary>
          <label class="check"><input type="checkbox" data-pref="autoSort" ${prefs.autoSort ? 'checked' : ''}> Keep the list in initiative order</label>
          <label class="check"><input type="checkbox" data-pref="skipDown" ${prefs.skipDown ? 'checked' : ''}> Skip defeated enemies’ turns</label>
          <label class="check"><input type="checkbox" data-pref="rollHp" ${prefs.rollHp ? 'checked' : ''}> Roll creatures’ hit points (when their sheet has hit dice)</label>
          <label class="check"><input type="checkbox" data-pref="allyHp" ${prefs.allyHp ? 'checked' : ''}> Player view shows allies’ exact HP</label>
        </details>
      </aside>
      <section class="cb-main">
        <div class="cb-groupbar" id="cb-group" hidden></div>
        <div class="cb-list" id="cb-list"></div>
        <details class="card cb-log" ${c.log.length ? '' : ''}><summary>📜 Combat log <span class="muted small" id="cb-logn"></span></summary><div id="cb-logl"></div></details>
      </section>
      <aside class="card side-box cb-detail" id="cb-detail"></aside>
    </div>`;
  const $ = s => main.querySelector(s);

  // ---------- helpers ----------
  const log = m => { c.log.unshift({ r: c.round, m, t: Date.now() }); if (c.log.length > 200) c.log.length = 200; };
  const byId = id => c.list.find(x => x.id === id);
  const order = () => c.list;
  const sortList = () => c.list.sort((a, b) => ((+b.init || 0) - (+a.init || 0)) || (b.lair ? 1 : 0) - (a.lair ? 1 : 0) || (b.bonus - a.bonus) || ((b.dex || 10) - (a.dex || 10)));
  const persist = () => { c.focusId = focus; save(); broadcast(); };
  const rollInit = x => x.lair ? 20 : rollAndLog(`d20${x.bonus >= 0 ? '+' : ''}${x.bonus}`).total;
  function syncSheet(x) {
    if (!x.sync) return;
    const e = getEntry(x.entryId); if (!e?.sheet) return;
    writeBack(e, { hp: x.hp, temp: x.temp, death: x.death });
  }
  function add(base, n = 1) {
    const out = [];
    const sameName = c.list.filter(x => x.name.replace(/ \d+$/, '') === base.name).length;
    for (let i = 0; i < n; i++) {
      let hp = base.maxHp;
      if (base.hpRoll && (prefs.rollHp || !hp)) { try { hp = rollAndLog(base.hpRoll).total; } catch { /* */ } }
      const x = { id: uid(), name: n > 1 || sameName ? `${base.name} ${sameName + i + 1}` : base.name, entryId: base.entryId || '', partyId: base.partyId || '', side: base.side || 'enemy',
        bonus: +base.bonus || 0, dex: base.dex || 10, init: '', hp: base.hp != null && n === 1 ? base.hp : hp || 0, maxHp: hp || 0, temp: base.temp || 0, ac: base.ac ?? '', conds: (base.conds || []).map(k => typeof k === 'string' ? { k } : k),
        cr: base.cr || '', level: base.level || 0, notes: '', death: { s: 0, f: 0 }, lair: !!base.lair, sync: !!base.sync && n === 1 };
      // anyone joining a fight already under way rolls straight away
      if (c.turnId || base.lair) x.init = rollInit(x);
      c.list.push(x); out.push(x);
    }
    if (out.length === 1 && sameName === 1) { const first = c.list.find(x => x.name === base.name); if (first && first !== out[0]) first.name = `${base.name} 1`; }
    log(`${out.length > 1 ? `${out.length} × ${base.name}` : out[0].name} joined the fight`);
    if (prefs.autoSort && c.turnId) sortList();
    focus = out[0].id;
    return out;
  }
  function fromEntry(e, n = 1, extra = {}) {
    const s = combatStats(e);
    const party = w.party.find(p => p.entryId === e.id);
    const side = extra.side || (party || e.sheet?.player ? 'ally' : e.type === 'character' ? 'neutral' : 'enemy');
    return add({ name: e.name, entryId: e.id, side, bonus: s.initBonus, dex: s.dex, maxHp: s.maxHp, hp: e.type === 'character' ? s.hp : undefined, temp: e.type === 'character' ? s.temp : 0, ac: s.ac, cr: s.cr, level: s.level, hpRoll: s.hpRoll,
      conds: e.type === 'character' ? s.conds : [], sync: e.type === 'character', partyId: party?.id, ...extra }, n);
  }

  // ---------- damage, healing and turns ----------
  function hurt(x, amt, quiet) {
    if (!amt) return;
    const wasUp = x.hp > 0, before = x.hp;
    let left = amt;
    if (x.temp) { const t = Math.min(x.temp, left); x.temp -= t; left -= t; }
    x.hp = Math.max(0, x.hp - left);
    log(`${x.name} took ${amt} damage${x.maxHp ? ` (${x.hp}/${x.maxHp})` : ''}`);
    if (x.conc && left > 0) { const dc = Math.max(10, Math.floor(amt / 2)); toast(`${x.name}: Constitution save DC ${dc} to keep concentrating`); log(`${x.name} must make a DC ${dc} Constitution save to keep concentrating`); }
    if (x.maxHp && x.hp <= 0 && left > 0) {
      // damage left over after dropping to 0 that's at least their max HP kills outright
      if (x.side === 'ally' && wasUp && left - before >= x.maxHp) { x.dead = true; log(`${x.name} was killed outright by massive damage`); }
      else if (!wasUp && x.side === 'ally' && !x.dead) { x.death.f = Math.min(3, x.death.f + 1); log(`${x.name} failed a death save from the hit`); if (x.death.f >= 3) { x.dead = true; log(`${x.name} died`); } }
      if (wasUp && !x.dead) {
        if (x.side === 'ally') { if (!x.conds.some(k => k.k === 'Unconscious')) x.conds.push({ k: 'Unconscious', auto: true }); log(`${x.name} fell unconscious`); }
        else log(`${x.name} was defeated`);
      }
    }
    if (!quiet) toast(`${x.name} takes ${amt}`);
    syncSheet(x);
  }
  function heal(x, amt) {
    if (!amt) return;
    const was = x.hp;
    x.hp = x.maxHp ? Math.min(x.maxHp, x.hp + amt) : x.hp + amt;
    if (was <= 0 && x.hp > 0) { x.dead = false; x.death = { s: 0, f: 0 }; x.conds = x.conds.filter(k => !(k.k === 'Unconscious' && k.auto)); log(`${x.name} is back on their feet`); }
    log(`${x.name} healed ${x.hp - was}${x.maxHp ? ` (${x.hp}/${x.maxHp})` : ''}`);
    syncSheet(x);
  }
  // "7" or "-7" is damage, "+7" heals, "t7" gives temporary HP; dice are rolled
  function applyText(x, v, mode) {
    v = String(v || '').trim(); if (!v) return false;
    let kind = mode || (v[0] === '+' ? 'heal' : /^t/i.test(v) ? 'temp' : 'dmg');
    const expr = v.replace(/^[+\-t]/i, '');
    let n; try { n = /d/i.test(expr) ? rollAndLog(expr).total : Math.abs(parseInt(expr)); } catch { toast('Try 7, +7 to heal, or t5 for temporary HP'); return false; }
    if (!n && n !== 0) return false;
    if (kind === 'heal') heal(x, n); else if (kind === 'temp') { x.temp = Math.max(x.temp, n); log(`${x.name} gained ${n} temporary HP`); syncSheet(x); } else hurt(x, n);
    return true;
  }
  const isDown = x => x.side !== 'ally' && x.maxHp && x.hp <= 0;
  function startTurn(x) {
    x.reaction = false; if (x.leg) x.leg.used = 0;
    // conditions with a duration count down at the start of their turn
    for (const k of x.conds) if (k.rounds) { k.rounds--; if (k.rounds <= 0) { k.gone = true; log(`${x.name} is no longer ${k.k.toLowerCase()}`); } }
    x.conds = x.conds.filter(k => !k.gone);
    if (x.side === 'ally' && x.maxHp && x.hp <= 0 && !x.dead) toast(`${x.name} makes a death saving throw`);
  }
  function next(dir = 1) {
    const L = order(); if (!L.length) return;
    if (!c.turnId) { begin(); return; }
    let i = L.findIndex(x => x.id === c.turnId), guard = 0;
    do {
      i += dir;
      if (i >= L.length) { i = 0; c.round++; log(`— Round ${c.round} —`); }
      if (i < 0) { i = L.length - 1; c.round = Math.max(1, c.round - 1); }
    } while (prefs.skipDown && isDown(L[i]) && ++guard < L.length);
    c.turnId = L[i].id;
    if (dir > 0) startTurn(L[i]);
    focus = c.turnId; draw();
  }
  function begin() {
    if (!c.list.length) return toast('Add someone to the fight first');
    for (const x of c.list) if (x.init === '' || x.init == null) x.init = rollInit(x);
    sortList();
    c.round = 1; c.started = Date.now(); c.turnId = c.list.find(x => !(prefs.skipDown && isDown(x)))?.id || c.list[0].id;
    log(`— Combat started: round 1 —`);
    startTurn(byId(c.turnId)); focus = c.turnId; draw();
  }

  // ---------- drawing ----------
  function draw() {
    const a = document.activeElement, keep = main.contains(a) && a.dataset.f ? { f: a.dataset.f, id: a.closest('[data-id]')?.dataset.id } : null;
    drawBar(); drawList(); drawDetail(); drawDiff(); drawLog(); drawGroup();
    if (keep) { const n = main.querySelector(`[data-id="${keep.id}"] [data-f="${keep.f}"]`); n?.focus(); }
    persist();
  }
  function drawBar() {
    const cur = byId(c.turnId), secs = (c.round - 1) * 6;
    $('#cb-bar').innerHTML = `
      <div class="cb-stat"><span>Round</span><b>${c.turnId ? c.round : '—'}</b></div>
      <div class="cb-stat wide"><span>Turn</span><b>${cur ? esc(cur.name) : 'Not started'}</b></div>
      <div class="cb-stat"><span>Creatures</span><b>${c.list.filter(x => !x.lair).length}</b></div>
      <div class="cb-stat"><span>In-game time</span><b>${c.turnId ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '—'}</b></div>
      <div class="cb-stat"><span>Real time</span><b id="cb-clock">${clock()}</b></div>
      <span style="flex:1"></span>
      <button id="cb-roll" title="Roll initiative for everyone who hasn’t rolled (Shift: re-roll everyone)">🎲 Roll initiative</button>
      <button id="cb-sort" title="Put everyone in initiative order">⇅ Sort</button>
      <button id="cb-prev" ${c.turnId ? '' : 'disabled'} title="Previous turn ( [ )">◀</button>
      <button class="primary cb-next" id="cb-next" title="Next turn ( ] )">${c.turnId ? 'Next turn ▶' : '⚔️ Start combat'}</button>`;
  }
  const clock = () => { if (!c.started) return '—'; const s = Math.floor((Date.now() - c.started) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function rowHTML(x) {
    const e = getEntry(x.entryId), pct = x.maxHp ? Math.max(0, Math.min(100, x.hp / x.maxHp * 100)) : 0, st = status(x);
    const pic = e?.image ? `<img ${A.src(e.image)} alt="">` : `<span>${x.lair ? '🏰' : x.side === 'ally' ? '🛡️' : x.side === 'neutral' ? '🙂' : (TYPES[e?.type]?.icon || '👹')}</span>`;
    const isTurn = x.id === c.turnId;
    return `<div class="cb-row ${x.side} ${isTurn ? 'turn' : ''} ${x.id === focus ? 'focus' : ''} ${x.maxHp && x.hp <= 0 ? 'down' : ''} ${x.dead ? 'dead' : ''} ${x.hidden ? 'hid' : ''}" data-id="${x.id}" draggable="true">
      <div class="cb-grip" title="Drag to change the order">⋮⋮</div>
      <input type="checkbox" class="cb-sel" data-f="sel" ${x.sel ? 'checked' : ''} title="Select (to damage or heal several at once)">
      <div class="cb-init"><input data-f="init" value="${x.init === '' ? '' : x.init}" placeholder="—" title="Initiative (bonus ${sgn(x.bonus)})"><button class="icon small" data-act="rollinit" title="Roll d20${sgn(x.bonus)}">🎲</button></div>
      <div class="cb-pic">${pic}</div>
      <div class="cb-who">
        <div class="cb-name">${isTurn ? '<span class="cb-arrow">▶</span>' : ''}<input data-f="name" value="${esc(x.name)}">${e ? `<a href="#/entry/${e.id}" class="cb-link" title="Open ${esc(e.name)} in the World Bible" style="color:${typeColor(e.type)}">↗</a>` : ''}
          ${x.conc ? '<span class="cb-badge conc" title="Concentrating">◎ Conc.</span>' : ''}${x.hidden ? '<span class="cb-badge" title="Hidden from the player view">🙈 hidden</span>' : ''}${x.reaction ? '<span class="cb-badge" title="Reaction used this round">⟲ used</span>' : ''}
          ${x.leg?.max ? `<span class="cb-leg" title="Legendary actions — click to use one">${Array.from({ length: x.leg.max }, (_, i) => `<button class="cb-legpip ${i < x.leg.used ? 'on' : ''}" data-act="leg" data-n="${i + 1}"></button>`).join('')}</span>` : ''}</div>
        <div class="cb-conds">${x.conds.map((k, i) => `<button class="cb-cond" data-act="uncond" data-i="${i}" title="${esc(CONDS[k.k]?.[1] || k.k)} — click to remove">${CONDS[k.k]?.[0] || '🏷️'} ${esc(k.k)}${k.rounds ? ` <i>${k.rounds}</i>` : ''}</button>`).join('')}
          ${x.side === 'ally' && x.maxHp && x.hp <= 0 && !x.dead ? `<span class="cb-ds">Saves <span class="ok">${[1, 2, 3].map(n => `<button class="cb-dpip ${x.death.s >= n ? 'on' : ''}" data-act="ds" data-k="s" data-n="${n}"></button>`).join('')}</span><span class="bad">${[1, 2, 3].map(n => `<button class="cb-dpip ${x.death.f >= n ? 'on' : ''}" data-act="ds" data-k="f" data-n="${n}"></button>`).join('')}</span></span>` : ''}
          ${x.dead ? '<span class="cb-badge dead">💀 Dead</span>' : ''}</div>
      </div>
      <div class="cb-hp">${x.lair ? '' : `<div class="cb-hpnum"><input data-f="hp" value="${x.hp}" title="Current HP">/<input data-f="maxHp" value="${x.maxHp || ''}" placeholder="max" title="Max HP">${x.temp ? `<span class="cb-temp" title="Temporary HP">+${x.temp}</span>` : ''}</div>
        <div class="cb-hpbar"><div style="width:${pct}%;background:${pct > 50 ? 'var(--ok)' : pct > 25 ? '#d9a13b' : 'var(--danger)'}"></div>${x.temp && x.maxHp ? `<div class="tmp" style="width:${Math.min(100, x.temp / x.maxHp * 100)}%"></div>` : ''}</div>
        <span class="cb-status">${st}</span>`}</div>
      <div class="cb-dmg">${x.lair ? '' : `<input data-f="dmg" placeholder="7 · +7 · t5" title="Type damage and press Enter. +7 heals, t5 gives temporary HP, dice like 2d6 are rolled.">
        <button class="icon small cb-hit" data-act="dmg" title="Damage">⚔</button><button class="icon small cb-heal" data-act="heal" title="Heal">✚</button>`}</div>
      <div class="cb-ac" title="Armour class">${x.lair ? '' : `<input data-f="ac" value="${esc(x.ac ?? '')}" placeholder="AC">`}</div>
      <button class="icon small cb-menu" data-act="menu" title="More">⋯</button>
    </div>`;
  }
  function drawList() {
    $('#cb-list').innerHTML = c.list.length ? `<div class="cb-head"><span></span><span></span><span>Init</span><span></span><span>Name</span><span>Hit points</span><span>Damage / heal</span><span>AC</span><span></span></div>${c.list.map(rowHTML).join('')}`
      : `<div class="empty"><div class="big">⚔️</div>No one in the fight yet. Search the World Bible on the left, type a name, or bring in the whole party.</div>`;
  }
  function drawGroup() {
    const sel = c.list.filter(x => x.sel);
    const g = $('#cb-group'); g.hidden = !sel.length;
    if (sel.length) g.innerHTML = `<b>${sel.length} selected</b><input id="g-amt" placeholder="amount or 3d6"><button class="small" data-g="dmg">⚔ Damage all</button><button class="small" data-g="half" title="Half damage, for those who made their save">½ Half</button><button class="small" data-g="heal">✚ Heal all</button>
      <select id="g-cond"><option value="">＋ Condition…</option>${Object.keys(CONDS).map(k => `<option>${k}</option>`).join('')}</select><span style="flex:1"></span><button class="small" data-g="none">Clear selection</button>`;
  }
  function statBlock(x) {
    const e = getEntry(x.entryId);
    if (!e?.sheet) return '';
    const sh = ensureSheet(e), d = derive(sh);
    return `<div class="cb-abils">${ABIL.map(([k, l]) => `<button class="cb-abil" data-roll="d20${d.m[k] >= 0 ? '+' : ''}${d.m[k]}" data-label="${esc(x.name)} ${l}"><span>${k.toUpperCase()}</span><b>${sh.abil[k]}</b><i>${sgn(d.m[k])}</i></button>`).join('')}</div>
      <div class="cb-kv"><span>Speed</span><b>${speedText(sh.speedFt)}</b><span>Passive Perception</span><b>${d.passive}</b>${sh.cr !== '' ? `<span>CR</span><b>${esc(sh.cr)} (${d.xp ?? '?'} XP)</b>` : ''}${sh.level ? `<span>Level</span><b>${esc(sh.cls || '')} ${sh.level}</b>` : ''}</div>
      <div class="cb-saves">Saves: ${ABIL.map(([k]) => `<button class="cs-roll" data-roll="d20${d.saves[k] >= 0 ? '+' : ''}${d.saves[k]}" data-label="${esc(x.name)} ${k.toUpperCase()} save">${k.toUpperCase()} ${sgn(d.saves[k])}</button>`).join(' ')}</div>
      ${[...d.attacks, ...sh.attacks.filter(a => a.name)].length ? `<h5>Attacks</h5>${[...d.attacks, ...sh.attacks.filter(a => a.name)].map(a => { const hit = typeof a.hit === 'number' ? a.hit : parseInt(a.hit) || 0; return `<div class="cb-atk"><b>${esc(a.name)}</b><button class="cs-roll" data-roll="d20${hit >= 0 ? '+' : ''}${hit}" data-label="${esc(a.name)} to hit">${sgn(hit)}</button>${a.dmg ? `<button class="cs-roll" data-roll="${esc(a.dmg)}" data-label="${esc(a.name)} damage">${esc(a.dmg)} ${esc(a.type || '')}</button>` : ''}</div>`; }).join('')}` : ''}
      ${sh.spell.ability ? `<h5>Spells</h5><p class="small">Save DC <b>${d.dc}</b> · attack <b>${sgn(d.satk)}</b></p>${Object.entries(sh.spell.slots).filter(([, s]) => +s.max).map(([l, s]) => `<span class="cb-slot">L${l} ${(+s.max - (+s.used || 0))}/${s.max}</span>`).join(' ')}
        <p class="small muted">${sh.spell.list.filter(s => s.name).map(s => esc(s.name)).join(', ')}</p>` : ''}
      ${[sh.resist && `Resists ${esc(sh.resist)}`, sh.immune && `Immune ${esc(sh.immune)}`, sh.vuln && `Vulnerable ${esc(sh.vuln)}`, sh.condImmune && `Can’t be ${esc(sh.condImmune)}`, sh.senses && esc(sh.senses)].filter(Boolean).map(t => `<p class="small" style="margin:2px 0">${t}</p>`).join('')}
      ${sh.features ? `<h5>Features</h5><div class="small cb-feat">${esc(sh.features).replace(/\n/g, '<br>')}</div>` : ''}
      ${sh.legendary ? `<h5>Legendary actions</h5><div class="small cb-feat">${esc(sh.legendary).replace(/\n/g, '<br>')}</div>` : ''}`;
  }
  function drawDetail() {
    const x = byId(focus);
    const el = $('#cb-detail');
    if (!x) { el.innerHTML = `<h4>Details</h4><p class="muted small">Click someone in the list to see their stats, conditions and notes here.</p><p class="small muted"><kbd>]</kbd> next turn · <kbd>[</kbd> previous</p>`; return; }
    const e = getEntry(x.entryId);
    el.innerHTML = `<div class="cb-dhead">${e?.image ? `<img ${A.src(e.image)} alt="">` : ''}<div><h3>${esc(x.name)}</h3>
        <div class="seg small cb-side">${['ally', 'neutral', 'enemy'].map(s => `<button data-side="${s}" class="${x.side === s ? 'on' : ''}">${{ ally: 'Ally', neutral: 'Neutral', enemy: 'Enemy' }[s]}</button>`).join('')}</div></div></div>
      ${e ? `<a class="btn small" href="#/entry/${e.id}">${e.sheet ? '🛡️ Open their sheet' : '📖 Open in the World Bible'}</a>${x.sync ? '<p class="small muted" style="margin:4px 0 0">Hit points save to their sheet as the fight goes.</p>' : ''}`
        : `<button class="small" data-act="tobible">📚 Save to the World Bible</button>`}
      <div class="cb-kv" style="margin-top:8px"><span>Init bonus</span><input data-df="bonus" value="${x.bonus}" class="cb-mini"><span>Temp HP</span><input data-df="temp" value="${x.temp || ''}" class="cb-mini" placeholder="0">
        <span>${x.side === 'ally' ? 'Level' : 'CR'}</span><input data-df="${x.side === 'ally' ? 'level' : 'cr'}" value="${esc(x.side === 'ally' ? (x.level || '') : (x.cr || ''))}" class="cb-mini" placeholder="—">
        <span>Legendary</span><input data-df="legmax" value="${x.leg?.max || ''}" class="cb-mini" placeholder="0"></div>
      <div class="cb-toggles"><label class="check"><input type="checkbox" data-dt="conc" ${x.conc ? 'checked' : ''}> Concentrating</label><label class="check"><input type="checkbox" data-dt="reaction" ${x.reaction ? 'checked' : ''}> Reaction used</label><label class="check"><input type="checkbox" data-dt="hidden" ${x.hidden ? 'checked' : ''}> Hide from players</label></div>
      <h5>Conditions</h5>
      ${x.conds.length ? x.conds.map((k, i) => `<div class="cb-cdesc"><div class="row" style="gap:6px;align-items:center"><b style="flex:1">${CONDS[k.k]?.[0] || '🏷️'} ${esc(k.k)}</b><input class="cb-mini" data-cr="${i}" value="${k.rounds || ''}" placeholder="∞" title="Rounds left (counts down at the start of their turn)"> rounds<button class="icon small" data-act="uncond" data-i="${i}">✕</button></div>${CONDS[k.k] ? `<p class="small muted">${CONDS[k.k][1]}</p>` : ''}</div>`).join('') : '<p class="small muted">None.</p>'}
      <div class="row" style="gap:6px"><select id="d-cond"><option value="">＋ Add a condition…</option>${Object.keys(CONDS).map(k => `<option>${k}</option>`).join('')}</select><input id="d-ccustom" placeholder="or your own" style="max-width:110px"></div>
      ${statBlock(x)}
      <h5>Notes</h5><textarea data-df="notes" rows="3" placeholder="Tactics, loot, what they want…">${esc(x.notes || '')}</textarea>
      <div class="row" style="gap:6px;margin-top:8px"><button class="small" data-act="dup">⧉ Copy</button><button class="small" data-act="kill">💀 ${x.dead ? 'Not dead' : 'Kill'}</button><span style="flex:1"></span><button class="small danger" data-act="remove">Remove</button></div>`;
  }
  function drawDiff() {
    const allies = c.list.filter(x => x.side === 'ally' && !x.lair), foes = c.list.filter(x => x.side === 'enemy' && !x.lair);
    const levels = allies.map(x => +x.level || 0).filter(Boolean);
    const xp = foes.reduce((t, x) => t + (CR_XP[String(x.cr).trim()] || 0), 0), counted = foes.filter(x => CR_XP[String(x.cr).trim()] != null).length;
    if (!foes.length) { $('#cb-diff').innerHTML = ''; return; }
    if (!counted) { $('#cb-diff').innerHTML = `<div class="cb-diffbox"><b>Difficulty</b><p class="small muted">Give the enemies a CR (on their sheet, or in Details) to work out how hard this fight is.</p></div>`; return; }
    const adj = xp * multiplier(counted);
    if (!levels.length) { $('#cb-diff').innerHTML = `<div class="cb-diffbox"><b>${xp.toLocaleString()} XP</b> <span class="small muted">(${adj.toLocaleString()} adjusted)</span><p class="small muted">Add the party with their levels to see the difficulty.</p></div>`; return; }
    const th = [0, 1, 2, 3].map(i => levels.reduce((t, l) => t + THRESH[Math.min(20, Math.max(1, l))][i], 0));
    const label = adj >= th[3] ? 'Deadly' : adj >= th[2] ? 'Hard' : adj >= th[1] ? 'Medium' : adj >= th[0] ? 'Easy' : 'Trivial';
    const pct = Math.min(100, adj / (th[3] * 1.25) * 100);
    $('#cb-diff').innerHTML = `<div class="cb-diffbox"><div class="row" style="align-items:baseline"><b class="cb-diff-${label.toLowerCase()}">${label}</b><span class="small muted" style="margin-left:auto">${adj.toLocaleString()} adj. XP</span></div>
      <div class="cb-diffbar">${th.map((t, i) => `<i style="left:${Math.min(100, t / (th[3] * 1.25) * 100)}%" title="${['Easy', 'Medium', 'Hard', 'Deadly'][i]}: ${t}"></i>`).join('')}<div style="width:${pct}%"></div></div>
      <p class="small muted" style="margin:4px 0 0">${xp.toLocaleString()} XP to share · ${Math.floor(xp / allies.length).toLocaleString()} each · party of ${allies.length} (levels ${levels.join(', ')})</p></div>`;
  }
  function drawLog() {
    $('#cb-logn').textContent = c.log.length ? `(${c.log.length})` : '';
    $('#cb-logl').innerHTML = c.log.slice(0, 80).map(l => `<div class="cb-logline"><span>R${l.r}</span>${esc(l.m)}</div>`).join('') || '<p class="small muted">Nothing yet.</p>';
  }

  // ---------- searching and adding ----------
  const q = $('#cb-q'), foundEl = $('#cb-found');
  function search() {
    const s = q.value.trim().toLowerCase();
    if (!s) { found = []; foundEl.innerHTML = ''; return; }
    const ents = w.entries.filter(e => (e.type === 'character' || e.type === 'creature') && e.name.toLowerCase().includes(s)).sort((a, b) => a.name.toLowerCase().indexOf(s) - b.name.toLowerCase().indexOf(s) || a.name.localeCompare(b.name)).slice(0, 8);
    const pty = w.party.filter(p => !p.entryId && p.name.toLowerCase().includes(s)).slice(0, 4);
    found = [...ents.map(e => ({ e })), ...pty.map(p => ({ p })), { name: q.value.trim() }];
    fsel = Math.min(fsel, found.length - 1);
    foundEl.innerHTML = found.map((f, i) => {
      if (f.e) { const st = combatStats(f.e); return `<div class="cb-res ${i === fsel ? 'sel' : ''}" data-i="${i}"><span class="type-dot" style="--tc:${typeColor(f.e.type)}"></span><b>${esc(f.e.name)}</b><span class="muted small">${st.hasSheet ? `HP ${st.maxHp || '?'} · AC ${st.ac || '?'}${st.cr ? ` · CR ${esc(st.cr)}` : st.level ? ` · Lv ${st.level}` : ''}` : (TYPES[f.e.type]?.label + ' · no sheet yet')}</span></div>`; }
      if (f.p) return `<div class="cb-res ${i === fsel ? 'sel' : ''}" data-i="${i}">🛡️ <b>${esc(f.p.name)}</b><span class="muted small">party</span></div>`;
      return `<div class="cb-res new ${i === fsel ? 'sel' : ''}" data-i="${i}">＋ Add “<b>${esc(f.name)}</b>” by hand</div>`;
    }).join('');
  }
  function pickFound(i) {
    const f = found[i]; if (!f) return;
    const n = Math.max(1, Math.min(30, +$('#qa-n').value || 1));
    if (f.e) fromEntry(f.e, n, $('#qa-side').dataset.touched ? { side: $('#qa-side').value } : {});
    else if (f.p) addParty(f.p);
    else quickAdd(f.name);
    q.value = ''; search(); $('#qa-n').value = 1; draw(); q.focus();
  }
  function quickAdd(name) {
    name = (name || q.value).trim(); if (!name) { q.focus(); return toast('Type a name first'); }
    const hpT = $('#qa-hp').value.trim(), n = Math.max(1, Math.min(30, +$('#qa-n').value || 1));
    add({ name, side: $('#qa-side').value, bonus: parseInt($('#qa-bonus').value) || 0, maxHp: /d/i.test(hpT) ? 0 : parseInt(hpT) || 0, hpRoll: /d/i.test(hpT) ? hpT : '', ac: $('#qa-ac').value.trim() }, n);
    for (const id of ['#qa-bonus', '#qa-hp', '#qa-ac']) $(id).value = '';
  }
  function addParty(p) {
    const e = getEntry(p.entryId);
    if (e) return fromEntry(e, 1, { side: 'ally', partyId: p.id });
    return add({ name: p.name, partyId: p.id, side: 'ally', bonus: +p.init || 0, maxHp: +p.hp || 0, ac: p.ac || '', level: +p.level || 0 });
  }
  q.addEventListener('input', () => { fsel = 0; search(); });
  q.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { fsel = Math.min(fsel + 1, found.length - 1); search(); ev.preventDefault(); }
    if (ev.key === 'ArrowUp') { fsel = Math.max(0, fsel - 1); search(); ev.preventDefault(); }
    if (ev.key === 'Enter') { ev.preventDefault(); if (found.length) pickFound(fsel); else { quickAdd(); draw(); } }
  });
  foundEl.addEventListener('click', ev => { const r = ev.target.closest('[data-i]'); if (r) pickFound(+r.dataset.i); });
  $('#qa-side').onchange = ev => { ev.target.dataset.touched = '1'; };
  $('#qa-add').onclick = () => { if (q.value.trim() && found.length && found[fsel] && !found[fsel].name) pickFound(fsel); else { quickAdd(); q.value = ''; search(); draw(); } };
  $('#cb-party').onclick = () => {
    if (!w.party.length) return toast('Add your party on the GM Screen first');
    let n = 0; for (const p of w.party) if (!c.list.some(x => x.partyId === p.id || (p.entryId && x.entryId === p.entryId))) { addParty(p); n++; }
    toast(n ? `${n} party member${n > 1 ? 's' : ''} joined` : 'The party is already here'); draw();
  };
  $('#cb-lair').onclick = () => { add({ name: 'Lair action', side: 'neutral', lair: true }); draw(); };
  main.querySelectorAll('[data-pref]').forEach(b => b.onchange = () => { prefs[b.dataset.pref] = b.checked; savePrefs(); if (b.dataset.pref === 'autoSort' && b.checked) sortList(); draw(); });

  // ---------- the list ----------
  const list = $('#cb-list');
  list.addEventListener('change', ev => {
    const row = ev.target.closest('[data-id]'); if (!row) return; const x = byId(row.dataset.id), f = ev.target.dataset.f;
    if (f === 'init') { x.init = ev.target.value.trim() === '' ? '' : parseInt(ev.target.value) || 0; if (prefs.autoSort) sortList(); }
    else if (f === 'hp') { const v = parseInt(ev.target.value) || 0; if (v < x.hp) hurt(x, x.hp - v, true); else heal(x, v - x.hp); }
    else if (f === 'maxHp') { x.maxHp = parseInt(ev.target.value) || 0; if (!x.hp) x.hp = x.maxHp; syncSheet(x); }
    else if (f === 'ac') x.ac = ev.target.value.trim();
    else if (f === 'name') x.name = ev.target.value.trim() || x.name;
    else if (f === 'sel') x.sel = ev.target.checked;
    else return;
    draw();
  });
  list.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    const row = ev.target.closest('[data-id]'); if (!row) return; const x = byId(row.dataset.id);
    if (ev.target.dataset.f === 'dmg') { if (applyText(x, ev.target.value)) { ev.target.value = ''; draw(); } }
    else ev.target.blur();
  });
  list.addEventListener('click', ev => {
    const row = ev.target.closest('[data-id]'); if (!row) return; const x = byId(row.dataset.id);
    const b = ev.target.closest('[data-act]');
    if (!b) { if (!ev.target.closest('input')) { focus = x.id; drawList(); drawDetail(); persist(); } return; }
    const act = b.dataset.act;
    if (act === 'rollinit') { x.init = rollInit(x); if (prefs.autoSort) sortList(); }
    if (act === 'dmg' || act === 'heal') { const inp = row.querySelector('[data-f="dmg"]'); if (!inp.value.trim()) { inp.focus(); return toast(act === 'dmg' ? 'Type the damage first' : 'Type how much to heal'); } applyText(x, inp.value, act === 'heal' ? 'heal' : 'dmg'); }
    if (act === 'uncond') { x.conds.splice(+b.dataset.i, 1); }
    if (act === 'ds') { const k = b.dataset.k, n = +b.dataset.n; x.death[k] = x.death[k] === n ? n - 1 : n; if (x.death.s >= 3) { log(`${x.name} is stable`); toast(`${x.name} is stable`); } if (x.death.f >= 3) { x.dead = true; log(`${x.name} died`); } syncSheet(x); }
    if (act === 'leg') { const n = +b.dataset.n; x.leg.used = x.leg.used === n ? n - 1 : n; }
    if (act === 'menu') { focus = x.id; }
    draw();
  });
  // drag rows to change the order (for ties, or a surprise)
  let dragRow = null;
  list.addEventListener('dragstart', ev => { const r = ev.target.closest('.cb-row'); if (!r || ev.target.closest('input')) return; dragRow = r.dataset.id; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', dragRow); r.classList.add('dragging'); });
  list.addEventListener('dragover', ev => { if (!dragRow) return; const r = ev.target.closest('.cb-row'); if (!r) return; ev.preventDefault(); list.querySelectorAll('.drop-above,.drop-below').forEach(n => n.classList.remove('drop-above', 'drop-below')); const box = r.getBoundingClientRect(); r.classList.add(ev.clientY < box.top + box.height / 2 ? 'drop-above' : 'drop-below'); });
  list.addEventListener('drop', ev => {
    const r = ev.target.closest('.cb-row'); if (!dragRow || !r) return; ev.preventDefault();
    const box = r.getBoundingClientRect(), below = ev.clientY >= box.top + box.height / 2;
    const it = byId(dragRow); c.list.splice(c.list.indexOf(it), 1);
    c.list.splice(c.list.indexOf(byId(r.dataset.id)) + (below ? 1 : 0), 0, it);
    dragRow = null; if (prefs.autoSort) { prefs.autoSort = false; savePrefs(); main.querySelector('[data-pref="autoSort"]').checked = false; toast('Order changed by hand — automatic sorting is off'); }
    draw();
  });
  list.addEventListener('dragend', () => { dragRow = null; list.querySelectorAll('.dragging,.drop-above,.drop-below').forEach(n => n.classList.remove('dragging', 'drop-above', 'drop-below')); });

  // ---------- group actions ----------
  $('#cb-group').addEventListener('click', ev => {
    const g = ev.target.closest('[data-g]')?.dataset.g; if (!g) return;
    const sel = c.list.filter(x => x.sel);
    if (g === 'none') { sel.forEach(x => x.sel = false); draw(); return; }
    const v = $('#g-amt').value.trim(); if (!v) { $('#g-amt').focus(); return toast('Type an amount first'); }
    let n; try { n = /d/i.test(v) ? rollAndLog(v).total : Math.abs(parseInt(v)); } catch (err) { return toast(err.message); }
    for (const x of sel) { if (g === 'heal') heal(x, n); else hurt(x, g === 'half' ? Math.floor(n / 2) : n, true); }
    toast(`${g === 'heal' ? 'Healed' : 'Dealt'} ${g === 'half' ? Math.floor(n / 2) : n} to ${sel.length}`); draw();
  });
  $('#cb-group').addEventListener('change', ev => { if (ev.target.id === 'g-cond' && ev.target.value) { for (const x of c.list.filter(y => y.sel)) if (!x.conds.some(k => k.k === ev.target.value)) x.conds.push({ k: ev.target.value }); log(`${c.list.filter(y => y.sel).map(y => y.name).join(', ')}: ${ev.target.value}`); draw(); } });

  // ---------- details panel ----------
  const det = $('#cb-detail');
  det.addEventListener('click', ev => {
    const x = byId(focus); if (!x) return;
    const r = ev.target.closest('[data-roll]'); if (r) { try { const res = rollAndLog(r.dataset.roll); toast(`${r.dataset.label}: ${res.total}`); } catch (err) { toast(err.message); } return; }
    const s = ev.target.closest('[data-side]'); if (s) { x.side = s.dataset.side; draw(); return; }
    const act = ev.target.closest('[data-act]')?.dataset.act; if (!act) return;
    if (act === 'uncond') x.conds.splice(+ev.target.closest('[data-act]').dataset.i, 1);
    if (act === 'dup') { const copy = add({ ...x, name: x.name.replace(/ \d+$/, ''), conds: [], hpRoll: '' })[0]; copy.init = x.init; copy.hp = x.hp; copy.maxHp = x.maxHp; }
    if (act === 'kill') { x.dead = !x.dead; if (x.dead) { x.hp = 0; log(`${x.name} died`); } }
    if (act === 'remove') { c.list = c.list.filter(y => y !== x); if (c.turnId === x.id) c.turnId = c.list[0]?.id || null; log(`${x.name} left the fight`); focus = null; }
    if (act === 'tobible') {
      const e = newEntry(x.side === 'ally' || x.side === 'neutral' ? 'character' : 'creature', x.name.replace(/ \d+$/, ''));
      const sh = ensureSheet(e); sh.hpMax = x.maxHp || ''; sh.acOverride = parseInt(x.ac) || ''; sh.cr = x.cr || ''; if (x.level) sh.level = x.level; sh.initBonus = x.bonus || '';
      save(); for (const y of c.list) if (y.name.replace(/ \d+$/, '') === e.name && !y.entryId) y.entryId = e.id;
      toast(`${e.name} is now in the World Bible, with a sheet`);
    }
    draw();
  });
  det.addEventListener('change', ev => {
    const x = byId(focus); if (!x) return; const t = ev.target;
    if (t.dataset.df) {
      const k = t.dataset.df, v = t.value.trim();
      if (k === 'bonus') x.bonus = parseInt(v) || 0;
      if (k === 'temp') { x.temp = Math.max(0, parseInt(v) || 0); syncSheet(x); }
      if (k === 'level') x.level = parseInt(v) || 0;
      if (k === 'cr') x.cr = v;
      if (k === 'legmax') { const n = Math.max(0, Math.min(5, parseInt(v) || 0)); x.leg = n ? { max: n, used: Math.min(n, x.leg?.used || 0) } : null; }
      if (k === 'notes') { x.notes = t.value; persist(); return; }
      draw();
    }
    if (t.dataset.dt) { x[t.dataset.dt] = t.checked; if (t.dataset.dt === 'conc') log(`${x.name} ${t.checked ? 'is concentrating' : 'stopped concentrating'}`); draw(); }
    if (t.dataset.cr != null) { x.conds[+t.dataset.cr].rounds = parseInt(t.value) || 0; draw(); }
    if (t.id === 'd-cond' && t.value) { if (!x.conds.some(k => k.k === t.value)) { x.conds.push({ k: t.value }); log(`${x.name} is ${t.value.toLowerCase()}`); } draw(); }
    if (t.id === 'd-ccustom' && t.value.trim()) { x.conds.push({ k: t.value.trim() }); log(`${x.name}: ${t.value.trim()}`); draw(); }
  });
  det.addEventListener('input', ev => { const x = byId(focus); if (x && ev.target.dataset.df === 'notes') { x.notes = ev.target.value; clearTimeout(det.t); det.t = setTimeout(persist, 400); } });

  // ---------- top bar ----------
  $('#cb-bar').addEventListener('click', ev => {
    const id = ev.target.closest('button')?.id;
    if (id === 'cb-next') next(1);
    if (id === 'cb-prev') next(-1);
    if (id === 'cb-sort') { sortList(); draw(); }
    if (id === 'cb-roll') { let n = 0; for (const x of c.list) if (ev.shiftKey || x.init === '' || x.init == null) { x.init = rollInit(x); n++; } if (!n) toast('Everyone has rolled — Shift-click to re-roll everyone'); sortList(); draw(); }
  });
  $('#cb-name').addEventListener('input', ev => { c.name = ev.target.value; persist(); });
  $('#cb-end').onclick = () => openModal(`<h2>End combat</h2><p>${c.list.length ? `${c.round > 1 || c.turnId ? `The fight lasted ${c.round} round${c.round > 1 ? 's' : ''}.` : ''}` : 'There’s no one here.'}</p>
    <div class="modal-actions"><button data-a="no">Cancel</button><button data-a="party">Keep the party, clear the rest</button><button class="primary" data-a="all">Clear everyone</button></div>`, m => m.addEventListener('click', ev => {
    const a = ev.target.dataset.a; if (!a) return;
    if (a !== 'no') {
      if (a === 'party') c.list = c.list.filter(x => x.side === 'ally' && !x.lair).map(x => ({ ...x, init: '', conds: x.conds.filter(k => k.k === 'Unconscious'), sel: false }));
      else c.list = [];
      c.turnId = null; c.round = 1; c.started = null; c.log = []; focus = null; draw();
    }
    closeModal();
  }));
  // saved encounters: prep fights ahead of time
  $('#cb-save').onclick = () => {
    if (!c.list.length) return toast('Add someone first');
    const name = (c.name || '').trim() || `Encounter ${w.encounters.length + 1}`;
    const keep = c.list.filter(x => x.side !== 'ally' || !x.partyId).map(x => ({ name: x.name, entryId: x.entryId, side: x.side, bonus: x.bonus, dex: x.dex, maxHp: x.maxHp, ac: x.ac, cr: x.cr, level: x.level, lair: x.lair, notes: x.notes, leg: x.leg ? { max: x.leg.max, used: 0 } : null }));
    const ex = w.encounters.find(e => e.name === name);
    if (ex) ex.list = keep; else w.encounters.push({ id: uid(), name, list: keep, created: Date.now() });
    save(); toast(`Saved “${name}” (${keep.length})${c.list.length > keep.length ? ' — the party isn’t saved with it' : ''}`);
  };
  $('#cb-load').onclick = () => openModal(`<h2>Encounters</h2>${w.encounters.length ? `<div class="cb-enc">${w.encounters.map(en => `<div class="cb-encrow" data-id="${en.id}"><div style="flex:1"><b>${esc(en.name)}</b><div class="small muted">${en.list.length} · ${esc(en.list.map(x => x.name).slice(0, 6).join(', '))}${en.list.length > 6 ? '…' : ''}${(() => { const xp = en.list.reduce((t, x) => t + (CR_XP[String(x.cr).trim()] || 0), 0); return xp ? ` · ${xp.toLocaleString()} XP` : ''; })()}</div></div>
      <button class="small primary" data-a="run">Add to fight</button><button class="icon small" data-a="del" title="Delete">🗑</button></div>`).join('')}</div>` : '<p class="muted">No saved encounters yet. Build a fight here and press 💾 Save encounter to keep it for later.</p>'}
    <div class="modal-actions"><button data-a="close">Close</button></div>`, m => m.addEventListener('click', ev => {
    const a = ev.target.dataset.a; if (!a) return;
    if (a === 'close') return closeModal();
    const en = w.encounters.find(x => x.id === ev.target.closest('[data-id]')?.dataset.id); if (!en) return;
    if (a === 'del') { w.encounters = w.encounters.filter(x => x !== en); save(); ev.target.closest('.cb-encrow').remove(); return; }
    if (a === 'run') { for (const t of en.list) { const e = getEntry(t.entryId); const got = e ? fromEntry(e, 1, { side: t.side }) : add({ ...t, hp: undefined }); if (t.leg) got[0].leg = { ...t.leg }; got[0].notes = t.notes || ''; } if (!c.name) c.name = en.name; closeModal(); draw(); $('#cb-name').value = c.name; toast(`${en.name} added`); }
  }));
  $('#cb-player').onclick = () => { window.open(location.href.split('#')[0] + '#/playerview', 'loreforge-player', 'width=1000,height=720'); setTimeout(broadcast, 800); };

  // ---------- the player view gets the order and how everyone looks, never the numbers ----------
  function broadcast() {
    if (!chan) return;
    chan.postMessage({ type: 'state', name: c.name || '', round: c.round, started: !!c.turnId, turnId: c.turnId, allyHp: prefs.allyHp,
      list: c.list.filter(x => !x.hidden).map(x => ({ id: x.id, name: x.name, side: x.side, lair: x.lair, status: status(x), dead: !!x.dead, conds: x.conds.map(k => k.k), conc: !!x.conc,
        hp: x.side === 'ally' && prefs.allyHp ? x.hp : null, maxHp: x.side === 'ally' && prefs.allyHp ? x.maxHp : null, pct: x.maxHp ? Math.max(0, Math.min(1, x.hp / x.maxHp)) : null, img: getEntry(x.entryId)?.image || '' })) });
  }
  const onMsg = ev => { if (ev.data?.type === 'hello') broadcast(); };
  chan?.addEventListener('message', onMsg);

  // ---------- keyboard ----------
  const onKey = ev => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('#modal-root').innerHTML) return;
    if (ev.key === ']') { ev.preventDefault(); next(1); } if (ev.key === '[') { ev.preventDefault(); next(-1); }
  };
  window.addEventListener('keydown', onKey);
  timer = setInterval(() => { const el = main.querySelector('#cb-clock'); if (el) el.textContent = clock(); }, 1000);

  // arriving from a character's page with "Add to combat"
  const addId = query().add;
  if (addId) { const e = getEntry(addId); if (e) { fromEntry(e); toast(`${e.name} joined the fight`); } history.replaceState(null, '', '#/combat'); }
  draw();
  return () => { clearInterval(timer); window.removeEventListener('keydown', onKey); chan?.removeEventListener('message', onMsg); };
}

// ---------- Player view (its own window) ----------
export function renderPlayerView(main) {
  document.body.classList.add('player-view');
  const c = W()?.combat ? normalize(W().combat) : null;
  let state = c ? { name: c.name, round: c.round, started: !!c.turnId, turnId: c.turnId, list: c.list.filter(x => !x.hidden).map(x => ({ id: x.id, name: x.name, side: x.side, lair: x.lair, status: status(x), dead: !!x.dead, conds: x.conds.map(k => k.k), pct: x.maxHp ? x.hp / x.maxHp : null, img: getEntry(x.entryId)?.image || '' })) } : null;
  const draw = () => {
    if (!state) { main.innerHTML = '<div class="pv"><h1>Waiting for the fight…</h1></div>'; return; }
    const cur = state.list.find(x => x.id === state.turnId);
    const i = state.list.findIndex(x => x.id === state.turnId), up = i >= 0 ? state.list.slice(i + 1).concat(state.list.slice(0, i)).find(x => !x.dead && x.status !== 'Defeated') : null;
    main.innerHTML = `<div class="pv">
      <div class="pv-head"><h1>${esc(state.name || 'Combat')}</h1><div class="pv-round">${state.started ? `Round <b>${state.round}</b>` : 'Roll for initiative!'}</div></div>
      ${cur ? `<div class="pv-now">It’s <b>${esc(cur.name)}</b>’s turn${up ? `<span>Up next: ${esc(up.name)}</span>` : ''}</div>` : ''}
      <div class="pv-list">${state.list.map(x => `<div class="pv-row ${x.side} ${x.id === state.turnId ? 'turn' : ''} ${x.dead || x.status === 'Defeated' ? 'down' : ''}">
        <div class="pv-pic">${x.img ? `<img ${A.src(x.img)} alt="">` : x.lair ? '🏰' : x.side === 'ally' ? '🛡️' : '⚔️'}</div>
        <div class="pv-name">${esc(x.name)}<div class="pv-conds">${x.conds.map(k => `<span>${CONDS[k]?.[0] || '🏷️'} ${esc(k)}</span>`).join('')}</div></div>
        ${x.lair ? '' : x.hp != null && x.maxHp ? `<div class="pv-hp"><div class="pv-bar"><div style="width:${Math.max(0, x.hp / x.maxHp * 100)}%"></div></div><b>${x.hp}/${x.maxHp}</b></div>` : `<div class="pv-status s-${(x.status || 'unknown').toLowerCase()}">${x.dead ? '💀 Dead' : x.status || ''}</div>`}
      </div>`).join('')}</div></div>`;
  };
  const onMsg = ev => { if (ev.data?.type === 'state') { state = ev.data; draw(); } };
  chan?.addEventListener('message', onMsg);
  chan?.postMessage({ type: 'hello' });
  draw();
  return () => { document.body.classList.remove('player-view'); chan?.removeEventListener('message', onMsg); };
}
