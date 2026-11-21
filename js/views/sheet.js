// Character sheets for World Bible characters and creatures: a gear screen (equipment slots around the figure and a bag
// grid, like an action RPG), every D&D 5e stat, and its own themes. Everything is edited right on the sheet.
// The combat tracker reads these stats (combatStats) and writes hit points back (writeBack).
import { W, save, uid, getEntry } from '../store.js';
import { esc, openModal, closeModal, pickFile, toast } from '../util.js';
import * as A from '../assets.js';
import { rollAndLog } from '../tools/dice.js';
import { CLASS_ART, artURL, guessArt } from '../gen/classArt.js';

// ---------- rules data ----------
export const ABIL = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
export const SKILLS = [['acrobatics', 'Acrobatics', 'dex'], ['animal', 'Animal Handling', 'wis'], ['arcana', 'Arcana', 'int'], ['athletics', 'Athletics', 'str'], ['deception', 'Deception', 'cha'], ['history', 'History', 'int'], ['insight', 'Insight', 'wis'], ['intimidation', 'Intimidation', 'cha'], ['investigation', 'Investigation', 'int'], ['medicine', 'Medicine', 'wis'], ['nature', 'Nature', 'int'], ['perception', 'Perception', 'wis'], ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'], ['sleight', 'Sleight of Hand', 'dex'], ['stealth', 'Stealth', 'dex'], ['survival', 'Survival', 'wis']];
export const CR_XP = { 0: 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
export const crNum = cr => { const s = String(cr ?? '').trim(); if (!s) return null; if (s.includes('/')) { const [a, b] = s.split('/'); return +a / +b; } return +s; };
export const mod = s => Math.floor(((+s || 10) - 10) / 2);
export const sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);

export const SLOTS = {
  head: { label: 'Head', icon: '⛑️', kinds: ['helm'] },
  neck: { label: 'Neck', icon: '📿', kinds: ['amulet'] },
  cloak: { label: 'Cloak', icon: '🧣', kinds: ['cloak'] },
  main: { label: 'Main hand', icon: '🗡️', kinds: ['weapon'] },
  body: { label: 'Armour', icon: '🥋', kinds: ['armor'] },
  off: { label: 'Off hand', icon: '🛡️', kinds: ['shield', 'weapon', 'light'] },
  hands: { label: 'Hands', icon: '🧤', kinds: ['gloves'] },
  belt: { label: 'Belt', icon: '🎗️', kinds: ['belt'] },
  ranged: { label: 'Ranged', icon: '🏹', kinds: ['weapon', 'ammo'] },
  ring1: { label: 'Ring', icon: '💍', kinds: ['ring'] },
  feet: { label: 'Feet', icon: '🥾', kinds: ['boots'] },
  ring2: { label: 'Ring', icon: '💍', kinds: ['ring'] },
};
export const KINDS = { weapon: ['Weapon', '🗡️'], shield: ['Shield', '🛡️'], armor: ['Armour', '🥋'], helm: ['Helm', '⛑️'], amulet: ['Amulet', '📿'], cloak: ['Cloak', '🧣'], gloves: ['Gloves / bracers', '🧤'], belt: ['Belt', '🎗️'], boots: ['Boots', '🥾'], ring: ['Ring', '💍'], ammo: ['Ammunition', '🏹'], light: ['Torch / lantern', '🕯️'],
  potion: ['Potion', '🧪'], scroll: ['Scroll', '📜'], book: ['Book', '📕'], gem: ['Gem', '💎'], treasure: ['Treasure', '🪙'], tool: ['Tool / kit', '🔧'], food: ['Food & drink', '🍖'], key: ['Key', '🗝️'], misc: ['Other', '📦'] };
export const RARITY = { common: ['Common', '#d8d2c4'], uncommon: ['Uncommon', '#4fc06a'], rare: ['Rare', '#4f8ff7'], 'very rare': ['Very rare', '#b265f0'], legendary: ['Legendary', '#f08a24'], artifact: ['Artifact', '#e8c35a'] };
export const THEMES = {
  parchment: { label: 'Parchment', bg: '#f1e4c3', panel: '#fbf3df', ink: '#2b1d0e', muted: '#7a6346', line: '#c9b38a', accent: '#8a1c1c', slot: '#2e2116', slotInk: '#efe0bf', slotLine: '#6b5236' },
  hellforge: { label: 'Hellforge', bg: '#120a09', panel: '#1f1311', ink: '#ead8b2', muted: '#9b8466', line: '#4a2a22', accent: '#c9302c', slot: '#0b0605' },
  elven: { label: 'Elven grove', bg: '#0e1c15', panel: '#15281e', ink: '#e1efdc', muted: '#8fae96', line: '#2c4a38', accent: '#7fc18f', slot: '#0a140f' },
  dwarven: { label: 'Dwarven hall', bg: '#1c1a18', panel: '#27241f', ink: '#ecdfc8', muted: '#a8977b', line: '#4a4136', accent: '#c88a3a', slot: '#13110f' },
  arcane: { label: 'Arcane', bg: '#110e22', panel: '#1b1734', ink: '#e6defe', muted: '#9b90c8', line: '#3a3170', accent: '#9b7bff', slot: '#0b0918' },
  frost: { label: 'Frostbound', bg: '#0d1822', panel: '#132433', ink: '#e4f2ff', muted: '#8fb0c8', line: '#2a4660', accent: '#6cc7ff', slot: '#08111a' },
};
const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

export function blankSheet(e) {
  const f = k => (e?.fields || []).find(x => x.k.toLowerCase() === k)?.v || '';
  return {
    theme: e?.type === 'creature' ? 'hellforge' : 'parchment', accent: '',
    cls: '', level: e?.type === 'creature' ? '' : 1, background: '', player: '', xp: '', size: 'Medium', ctype: '',
    cr: '', abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, saves: {}, skills: {},
    profOverride: '', acOverride: parseInt(f('ac') || f('armor class') || f('armour class')) || '', initOverride: '', speed: '30 ft',
    hpMax: parseInt(f('hp') || f('hit points')) || '', hp: '', temp: '', hitDice: '', hitDiceUsed: '', hpRoll: '',
    death: { s: 0, f: 0 }, inspiration: false, exhaustion: 0, conds: [],
    attacks: [], spell: { ability: '', slots: {}, list: [] },
    features: '', profs: '', languages: '', senses: '', resist: '', immune: '', vuln: '', condImmune: '', legendary: '',
    traits: '', ideals: '', bonds: '', flaws: '', notes: '',
    coins: { cp: '', sp: '', ep: '', gp: '', pp: '' },
    items: [], bagRows: 4,
  };
}
export function ensureSheet(e) {
  if (!e.sheet) e.sheet = blankSheet(e);
  const b = blankSheet(e), sh = e.sheet;
  for (const k of Object.keys(b)) if (sh[k] === undefined) sh[k] = b[k];
  for (const k of ['abil', 'coins', 'death', 'spell']) sh[k] = { ...b[k], ...sh[k] };
  if (!sh.spell.slots) sh.spell.slots = {};
  if (!Array.isArray(sh.spell.list)) sh.spell.list = [];
  return sh;
}

// ---------- the numbers worked out from the sheet ----------
export function derive(sh) {
  const m = Object.fromEntries(ABIL.map(([k]) => [k, mod(sh.abil[k])]));
  const cr = crNum(sh.cr);
  const autoProf = sh.level !== '' && sh.level != null && +sh.level ? 2 + Math.floor((+sh.level - 1) / 4) : cr != null ? Math.max(2, 2 + Math.floor((Math.max(cr, 1) - 1) / 4)) : 2;
  const prof = sh.profOverride !== '' && sh.profOverride != null ? +sh.profOverride : autoProf;
  const saves = Object.fromEntries(ABIL.map(([k]) => [k, m[k] + (sh.saves[k] ? prof : 0)]));
  const skills = Object.fromEntries(SKILLS.map(([k, , a]) => [k, m[a] + prof * (+sh.skills[k] || 0)]));
  const eq = s => sh.items.find(i => i.slot === s);
  // armour class from what's worn
  const armor = eq('body');
  let acAuto = 10 + m.dex;
  if (armor && +armor.ac) acAuto = +armor.ac + (armor.armorType === 'heavy' ? 0 : armor.armorType === 'medium' ? Math.min(2, m.dex) : m.dex);
  const shield = eq('off');
  if (shield?.kind === 'shield') acAuto += +shield.ac || 2;
  for (const i of sh.items) if (i.slot && +i.acBonus) acAuto += +i.acBonus;
  const ac = sh.acOverride !== '' && sh.acOverride != null ? +sh.acOverride : acAuto;
  const init = sh.initOverride !== '' && sh.initOverride != null ? +sh.initOverride : m.dex;
  const sa = sh.spell.ability;
  const weight = sh.items.reduce((t, i) => t + (+i.weight || 0) * (+i.qty || 1), 0);
  // attacks from the weapons in hand
  const attacks = ['main', 'off', 'ranged'].map(eq).filter(i => i && i.kind === 'weapon').map(i => {
    const ab = i.ranged ? 'dex' : i.finesse ? (m.dex > m.str ? 'dex' : 'str') : 'str';
    const hit = m[ab] + prof + (+i.bonus || 0), dmgMod = m[ab] + (+i.bonus || 0);
    return { name: i.name, hit, dmg: i.dmg ? `${i.dmg}${dmgMod ? (dmgMod > 0 ? '+' : '') + dmgMod : ''}` : '', type: i.dmgType || '', auto: true };
  });
  return { m, prof, saves, skills, ac, acAuto, init, passive: 10 + skills.perception, passiveInv: 10 + skills.investigation, passiveIns: 10 + skills.insight,
    dc: sa ? 8 + prof + m[sa] : null, satk: sa ? prof + m[sa] : null, weight, carry: (+sh.abil.str || 10) * 15, attacks, xp: CR_XP[String(sh.cr).trim()] ?? null };
}

// what the combat tracker needs from an entry (with or without a sheet)
export function combatStats(e) {
  if (!e) return null;
  const f = k => (e.fields || []).find(x => x.k.toLowerCase() === k)?.v || '';
  if (!e.sheet) {
    const hp = parseInt(f('hp') || f('hit points')) || 0;
    return { maxHp: hp, hp, temp: 0, ac: f('ac') || f('armor class') || f('armour class') || '', initBonus: parseInt(f('initiative')) || 0, cr: f('cr') || f('challenge') || '', level: parseInt(f('level')) || 0, hasSheet: false };
  }
  const sh = ensureSheet(e), d = derive(sh);
  return { maxHp: +sh.hpMax || 0, hp: sh.hp === '' || sh.hp == null ? +sh.hpMax || 0 : +sh.hp, temp: +sh.temp || 0, ac: d.ac, initBonus: d.init, dex: +sh.abil.dex || 10, cr: sh.cr, level: +sh.level || 0,
    hpRoll: sh.hpRoll || '', speed: sh.speed, passive: d.passive, conds: [...(sh.conds || [])], hasSheet: true };
}
// the combat tracker keeps a character's sheet up to date with the fight
export function writeBack(e, { hp, temp, death }) {
  if (!e?.sheet) return;
  if (hp != null) e.sheet.hp = hp;
  if (temp != null) e.sheet.temp = temp || '';
  if (death) e.sheet.death = { ...death };
  e.updated = Date.now();
}

// ---------- drawing the sheet ----------
const getP = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = a[k] ??= {}; a[ks[ks.length - 1]] = v; };
const val = (sh, p) => { const v = getP(sh, p); return v == null ? '' : esc(String(v)); };
const fieldV = (e, k) => (e.fields.find(f => f.k.toLowerCase() === k.toLowerCase())?.v) || '';

function itemIcon(i, big) {
  if (i.img) return `<img ${A.src(i.img)} alt="">`;
  return `<span class="cs-emoji${big ? ' big' : ''}">${i.icon || KINDS[i.kind]?.[1] || '📦'}</span>`;
}
const rarCol = i => RARITY[i.rarity]?.[1] || RARITY.common[1];

function sheetHTML(e, opts = {}) {
  const sh = ensureSheet(e), d = derive(sh), creature = e.type === 'creature';
  const th = THEMES[sh.theme] || THEMES.parchment;
  const style = `--cs-bg:${th.bg};--cs-panel:${th.panel};--cs-ink:${th.ink};--cs-muted:${th.muted};--cs-line:${th.line};--cs-accent:${sh.accent || th.accent};--cs-slot:${th.slot};--cs-slot-ink:${th.slotInk || th.ink};--cs-slot-line:${th.slotLine || th.line}`;
  const num = (k, ph = '', cls = '') => `<input class="cs-in ${cls}" data-k="${k}" data-t="num" inputmode="numeric" value="${val(sh, k)}" placeholder="${ph}">`;
  const txt = (k, ph = '', cls = '') => `<input class="cs-in ${cls}" data-k="${k}" value="${val(sh, k)}" placeholder="${esc(ph)}">`;
  const area = (k, ph, rows = 4) => `<textarea class="cs-area" data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${val(sh, k)}</textarea>`;
  const box = (label, inner, cls = '') => `<div class="cs-box ${cls}"><div class="cs-box-in">${inner}</div><label>${label}</label></div>`;
  const bag = sh.items.filter(i => !i.slot);
  const cells = sh.bagRows * 10;
  const slotHTML = s => {
    const it = sh.items.find(i => i.slot === s), S = SLOTS[s];
    return `<div class="cs-slot slot-${s} ${it ? 'full' : ''}" data-slot="${s}" ${it ? `data-item="${it.id}" draggable="true" style="--rar:${rarCol(it)}"` : ''} title="${it ? '' : S.label}">
      ${it ? itemIcon(it, true) : `<span class="cs-ghost">${S.icon}</span>`}<span class="cs-slot-label">${it ? esc(it.name) : S.label}</span></div>`;
  };
  const pip = (k, n, on) => Array.from({ length: n }, (_, i) => `<button class="cs-pip ${i < on ? 'on' : ''}" data-pip="${k}" data-n="${i + 1}"></button>`).join('');
  const skillRow = ([k, label, a]) => { const p = +sh.skills[k] || 0; return `<div class="cs-skill"><button class="cs-prof p${p}" data-skill="${k}" title="${['Not proficient', 'Proficient', 'Expertise'][p]} — click to change"></button><span class="cs-mod" data-d="skill.${k}" data-roll-mod="${label}">${sgn(d.skills[k])}</span><span>${label} <i>(${a.toUpperCase()})</i></span></div>`; };
  const spellLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return `<div class="cs" style="${style}">
    <div class="cs-top">
      <div class="cs-ident">
        ${opts.hideName ? '' : `<div class="cs-name">${esc(e.name)}</div>`}
        <div class="cs-idrow">
          ${creature ? `<label>Size ${txt('size', 'Medium')}</label><label>Type ${txt('ctype', 'e.g. dragon')}</label><label>CR ${txt('cr', '1/2', 'w5')}</label><label>XP <b data-d="xp">${d.xp ?? '—'}</b></label>`
            : `<label>Class ${txt('cls', 'e.g. Fighter 3 / Rogue 1')}</label><label>Level ${num('level', '1', 'w4')}</label><label>Background ${txt('background', 'e.g. Sailor')}</label><label>Player ${txt('player', 'who plays them')}</label><label>XP ${txt('xp', '0', 'w7')}</label>`}
          <label>Race ${`<input class="cs-in" data-field="Race" value="${esc(fieldV(e, 'Race'))}" placeholder="${creature ? '—' : 'e.g. Human'}">`}</label>
          <label>Alignment <input class="cs-in" data-field="Alignment" value="${esc(fieldV(e, 'Alignment'))}" placeholder="e.g. Neutral good"></label>
        </div>
      </div>
      <div class="cs-themes">
        <select data-k="theme" title="Sheet theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${sh.theme === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
        <input type="color" data-k="accent" value="${sh.accent || th.accent}" title="Accent colour"><button class="cs-btn small" data-act="accent-reset" title="Theme’s own accent">↺</button>
      </div>
    </div>

    <div class="cs-main">
      <aside class="cs-side">
        <div class="cs-abils">${ABIL.map(([k, l]) => `<div class="cs-abil"><label>${l}</label><div class="cs-abil-mod" data-d="mod.${k}" data-roll-mod="${l} check">${sgn(d.m[k])}</div>${num('abil.' + k, '10', 'cs-abil-score')}</div>`).join('')}</div>
        <div class="cs-mini">
          <div class="cs-chip"><button class="cs-check ${sh.inspiration ? 'on' : ''}" data-toggle="inspiration"></button>Inspiration</div>
          <div class="cs-chip"><input class="cs-in w4" data-k="profOverride" data-t="num" value="${val(sh, 'profOverride')}" placeholder="${sgn(d.prof)}" title="Proficiency bonus — worked out from level${creature ? ' or CR' : ''}; type to set your own"> Proficiency bonus</div>
        </div>
        <div class="cs-panel"><h5>Saving throws</h5>${ABIL.map(([k, l]) => `<div class="cs-skill"><button class="cs-prof p${sh.saves[k] ? 1 : 0}" data-save="${k}" title="Proficient?"></button><span class="cs-mod" data-d="save.${k}" data-roll-mod="${l} save">${sgn(d.saves[k])}</span><span>${l}</span></div>`).join('')}</div>
        <div class="cs-panel cs-passive"><div><b data-d="passive">${d.passive}</b> Passive Perception</div><div><b data-d="passiveIns">${d.passiveIns}</b> Passive Insight</div><div><b data-d="passiveInv">${d.passiveInv}</b> Passive Investigation</div></div>
      </aside>

      <section class="cs-gear">
        <div class="cs-doll">
          <div class="cs-col">${['head', 'cloak', 'body', 'hands', 'belt', 'feet'].map(slotHTML).join('')}</div>
          <button class="cs-portrait" data-act="portrait" title="Change the picture">${portraitHTML(e, sh)}<span class="cs-portrait-edit">🖼️ Change picture</span></button>
          <div class="cs-col">${['neck', 'ring1', 'ring2', 'main', 'off', 'ranged'].map(slotHTML).join('')}</div>
        </div>
        <div class="cs-baghead"><b>Inventory</b><span class="cs-muted small">${bag.length} item${bag.length === 1 ? '' : 's'} · <span data-d="weight">${d.weight}</span> / ${d.carry} lb</span><span style="flex:1"></span><button class="cs-btn small" data-act="new-item">＋ Item</button><button class="cs-btn small" data-act="add-row" title="A bigger bag">＋ Row</button></div>
        <div class="cs-bag">${Array.from({ length: cells }, (_, c) => { const it = bag.find(i => i.cell === c); return `<div class="cs-cell ${it ? 'full' : ''}" data-cell="${c}" ${it ? `data-item="${it.id}" draggable="true" style="--rar:${rarCol(it)}"` : ''}>${it ? `${itemIcon(it)}${+it.qty > 1 ? `<b class="cs-qty">${it.qty}</b>` : ''}` : ''}</div>`; }).join('')}</div>
        <div class="cs-coins">${['cp', 'sp', 'ep', 'gp', 'pp'].map(c => `<label class="coin-${c}"><span>${c.toUpperCase()}</span>${num('coins.' + c, '0')}</label>`).join('')}</div>
        <p class="cs-muted small cs-hint">Drag items between the bag and the slots, or double-click to equip. Click an item to edit it, or an empty square to add one. Armour, shields and AC bonuses set your AC; weapons in hand become attacks.</p>
      </section>

      <section class="cs-stats">
        <div class="cs-vitals">
          ${box('Armour class', `<input class="cs-in cs-big" data-k="acOverride" data-t="num" value="${val(sh, 'acOverride')}" placeholder="${d.acAuto}" title="Worked out from your armour and shield (${d.acAuto}); type to set your own">`, 'cs-shield')}
          ${box('Initiative', `<input class="cs-in cs-big" data-k="initOverride" data-t="num" value="${val(sh, 'initOverride')}" placeholder="${sgn(d.m.dex)}" title="Your Dexterity modifier; type to set your own">`)}
          ${box('Speed', txt('speed', '30 ft', 'cs-big'))}
        </div>
        <div class="cs-box cs-hp"><div class="cs-box-in"><div class="cs-hp-row">${num('hp', String(sh.hpMax || '—'), 'cs-big')}<span>/</span>${num('hpMax', 'max', 'cs-big')}</div>
          <div class="cs-hp-row small">Temp ${num('temp', '0', 'w4')}<button class="cs-btn small" data-act="hp-roll" title="Roll hit points from these dice">🎲</button>${txt('hpRoll', 'e.g. 4d8+4', 'w9')}</div></div><label>Hit points</label></div>
        <div class="cs-vitals two">
          ${box('Hit dice', `<div class="cs-hp-row">${txt('hitDice', 'e.g. 3d10', 'w7')}</div><div class="cs-hp-row small">used ${num('hitDiceUsed', '0', 'w4')}</div>`)}
          ${box('Death saves', `<div class="cs-ds"><span>✔</span>${pip('death.s', 3, sh.death.s)}</div><div class="cs-ds"><span>✖</span>${pip('death.f', 3, sh.death.f)}</div>`)}
        </div>
        <div class="cs-conds">
          <span class="cs-label">Conditions</span>${(sh.conds || []).map(c => `<button class="cs-cond" data-cond="${esc(c)}" title="Remove">${esc(c)} ✕</button>`).join('')}
          <select class="cs-cond-add" data-act="cond"><option value="">＋ condition</option>${CONDITIONS.filter(c => !(sh.conds || []).includes(c)).map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="cs-conds"><span class="cs-label">Exhaustion</span>${pip('exhaustion', 6, sh.exhaustion)}</div>
        <div class="cs-panel cs-skills"><h5>Skills</h5>${SKILLS.map(skillRow).join('')}</div>
        <div class="cs-panel cs-atkpanel">
        <h5>Attacks</h5>
        <table class="cs-table"><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Type</th><th></th></tr>
          ${d.attacks.map(a => `<tr class="auto"><td>${esc(a.name)} <span class="cs-muted small">(equipped)</span></td><td><button class="cs-roll" data-roll="d20${a.hit >= 0 ? '+' : ''}${a.hit}" data-label="${esc(a.name)} to hit">${sgn(a.hit)}</button></td><td>${a.dmg ? `<button class="cs-roll" data-roll="${esc(a.dmg)}" data-label="${esc(a.name)} damage">${esc(a.dmg)}</button>` : '—'}</td><td>${esc(a.type)}</td><td></td></tr>`).join('')}
          ${sh.attacks.map((a, i) => `<tr><td><input class="cs-in" data-k="attacks.${i}.name" value="${esc(a.name || '')}" placeholder="Bite"></td><td class="cs-rollcell"><input class="cs-in w4" data-k="attacks.${i}.hit" value="${esc(a.hit ?? '')}" placeholder="+5"><button class="cs-roll" data-atk="${i}" data-part="hit" title="Roll to hit">🎲</button></td>
            <td class="cs-rollcell"><input class="cs-in" data-k="attacks.${i}.dmg" value="${esc(a.dmg || '')}" placeholder="2d6+3"><button class="cs-roll" data-atk="${i}" data-part="dmg" title="Roll damage">🎲</button></td><td><input class="cs-in" data-k="attacks.${i}.type" value="${esc(a.type || '')}" placeholder="piercing"></td><td><button class="cs-x" data-del="attacks" data-i="${i}">✕</button></td></tr>`).join('')}
        </table>
        <button class="cs-btn small" data-act="add-attack">＋ Attack</button>
        <h5 style="margin-top:14px">Spellcasting</h5>
        <div class="cs-spellhead"><label>Ability <select data-k="spell.ability"><option value="">—</option>${ABIL.map(([k, l]) => `<option value="${k}" ${sh.spell.ability === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <span>Save DC <b data-d="dc">${d.dc ?? '—'}</b></span><span>Spell attack <b data-d="satk">${d.satk == null ? '—' : sgn(d.satk)}</b></span></div>
        <div class="cs-slots">${spellLevels.map(l => { const s = sh.spell.slots[l] || {}; return `<div class="cs-slotlvl"><span>${l}</span><input class="cs-in w3" data-k="spell.slots.${l}.max" data-t="num" value="${s.max ?? ''}" placeholder="0" title="Level ${l} slots">${+s.max ? `<div>${pip('spell.slots.' + l + '.used', +s.max, +s.used || 0)}</div>` : ''}</div>`; }).join('')}</div>
        <table class="cs-table">${sh.spell.list.map((sp, i) => `<tr><td style="width:84px"><select data-k="spell.list.${i}.lvl">${['Cantrip', ...spellLevels].map((l, j) => `<option value="${j}" ${+sp.lvl === j ? 'selected' : ''}>${j ? 'Level ' + l : l}</option>`).join('')}</select></td>
          <td><input class="cs-in" data-k="spell.list.${i}.name" value="${esc(sp.name || '')}" placeholder="Spell name"></td><td style="width:84px"><label class="cs-muted small"><input type="checkbox" data-k="spell.list.${i}.prep" ${sp.prep ? 'checked' : ''}> prepared</label></td>
          <td><input class="cs-in" data-k="spell.list.${i}.note" value="${esc(sp.note || '')}" placeholder="notes, damage, range"></td><td><button class="cs-x" data-del="spell.list" data-i="${i}">✕</button></td></tr>`).join('')}</table>
        <button class="cs-btn small" data-act="add-spell">＋ Spell</button>
      </div>
      </section>
    </div>

    <div class="cs-below">
      <div class="cs-panel"><h5>Features & traits</h5>${area('features', creature ? 'Special traits, actions, reactions…' : 'Class and race features, feats…', 8)}
        ${creature ? `<h5>Legendary actions</h5>${area('legendary', 'e.g. 3 per round: Detect, Tail attack, Wing attack (costs 2)', 3)}` : ''}</div>
      <div class="cs-panel"><h5>Proficiencies</h5>${area('profs', 'Armour, weapons, tools…', 3)}<h5>Languages</h5>${area('languages', 'Common, Elvish…', 2)}<h5>Senses</h5>${area('senses', 'Darkvision 60 ft…', 2)}</div>
      <div class="cs-panel"><h5>Defences</h5><label class="cs-sub">Resistances</label>${txt('resist', 'e.g. fire, cold')}<label class="cs-sub">Immunities</label>${txt('immune', 'e.g. poison')}<label class="cs-sub">Vulnerabilities</label>${txt('vuln', 'e.g. radiant')}<label class="cs-sub">Condition immunities</label>${txt('condImmune', 'e.g. charmed')}</div>
      ${creature ? '' : `<div class="cs-panel"><h5>Personality traits</h5>${area('traits', '', 2)}<h5>Ideals</h5>${area('ideals', '', 2)}<h5>Bonds</h5>${area('bonds', '', 2)}<h5>Flaws</h5>${area('flaws', '', 2)}</div>`}
      <div class="cs-panel"><h5>Notes</h5>${area('notes', 'Anything else', 8)}</div>
    </div>
  </div>`;
}

// ---------- the portrait in the middle of the gear screen ----------
function portraitHTML(e, sh) {
  const p = sh.portrait || {};
  if (p.img) return `<img ${A.src(p.img)} alt="">`;
  const art = p.art || (!p.none && !e.image ? guessArt(sh.cls || sh.ctype || (e.type === 'creature' ? e.name : '')) : '');
  if (art && artURL(art)) return `<img src="${artURL(art)}" alt="">`;
  if (e.image && !p.none) return `<img ${A.src(e.image)} alt="">`;
  return `<svg class="cs-sil" viewBox="0 0 100 200"><path d="M50 8a17 17 0 1 1 0 34a17 17 0 1 1 0-34M30 48h40l12 50l-10 4l-6-30v50l6 70h-14l-8-60l-8 60h-14l6-70v-50l-6 30l-10-4z"/></svg>`;
}
function portraitDialog(e, onDone) {
  const sh = e.sheet, cur = sh.portrait || {};
  const card = (k, v) => `<button class="cs-artcard ${cur.art === k ? 'on' : ''}" data-art="${k}" title="${v.label}"><img src="${artURL(k)}" alt="${v.label}"></button>`;
  openModal(`<h2>Character picture</h2>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="primary" data-a="upload">⬆ Upload your own</button>${e.image ? '<button data-a="entry">Use the World Bible picture</button>' : ''}<button data-a="none">No picture</button></div>
    <label style="margin-top:12px">Classes</label><div class="cs-artgrid">${Object.entries(CLASS_ART).filter(([, v]) => !v.creature).map(([k, v]) => card(k, v)).join('')}</div>
    <label>Creatures</label><div class="cs-artgrid">${Object.entries(CLASS_ART).filter(([, v]) => v.creature).map(([k, v]) => card(k, v)).join('')}</div>
    <div class="modal-actions"><button data-a="close">Close</button></div>`, m => m.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-art], [data-a]'); if (!b) return;
    if (b.dataset.art) sh.portrait = { art: b.dataset.art };
    else if (b.dataset.a === 'upload') { const f = await pickFile('image/*'); if (!f) return; sh.portrait = { img: (await A.storeImage(f, { maxDim: 900 })).ref }; }
    else if (b.dataset.a === 'entry') sh.portrait = {};
    else if (b.dataset.a === 'none') sh.portrait = { none: true };
    else if (b.dataset.a !== 'close') return;
    closeModal(); onDone();
  }));
}

// ---------- the item editor ----------
function itemDialog(e, item, onDone) {
  const sh = e.sheet, isNew = !sh.items.includes(item);
  const bibleItems = W().entries.filter(x => x.type === 'item').sort((a, b) => a.name.localeCompare(b.name));
  openModal(`<h2>${isNew ? 'New item' : 'Item'}</h2>
    <div class="row"><div style="flex:2"><label>Name</label><input id="i-name" value="${esc(item.name || '')}" placeholder="e.g. Longsword of Embers" autofocus></div>
      <div><label>Kind</label><select id="i-kind">${Object.entries(KINDS).map(([k, [l, ic]]) => `<option value="${k}" ${item.kind === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}</select></div></div>
    <div class="row"><div><label>Rarity</label><select id="i-rar">${Object.entries(RARITY).map(([k, [l]]) => `<option value="${k}" ${(item.rarity || 'common') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Quantity</label><input id="i-qty" type="number" min="1" value="${item.qty || 1}"></div><div><label>Weight (lb, each)</label><input id="i-w" type="number" step="0.1" value="${item.weight ?? ''}"></div><div><label>Value</label><input id="i-val" value="${esc(item.value || '')}" placeholder="15 gp"></div></div>
    <div class="row"><div><label>Icon</label><input id="i-icon" value="${esc(item.icon || '')}" placeholder="${KINDS[item.kind || 'misc'][1]} (any emoji)"></div>
      <div><label>Picture</label><div class="row" style="gap:6px"><button class="small" id="i-img">${item.img ? 'Replace' : '⬆ Upload'}</button>${item.img ? '<button class="small danger" id="i-noimg">Remove</button>' : ''}</div></div>
      <div style="flex:2"><label>World Bible item</label><select id="i-entry"><option value="">— not linked —</option>${bibleItems.map(x => `<option value="${x.id}" ${item.entryId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
    <fieldset class="i-grp" data-for="weapon"><legend>Weapon</legend><div class="row"><div><label>Damage</label><input id="i-dmg" value="${esc(item.dmg || '')}" placeholder="1d8"></div><div><label>Damage type</label><input id="i-dt" value="${esc(item.dmgType || '')}" placeholder="slashing"></div><div><label>Magic bonus</label><input id="i-bonus" type="number" value="${item.bonus ?? ''}" placeholder="0"></div></div>
      <div class="row"><label class="check"><input type="checkbox" id="i-fin" ${item.finesse ? 'checked' : ''}> Finesse</label><label class="check"><input type="checkbox" id="i-rng" ${item.ranged ? 'checked' : ''}> Ranged</label><label class="check"><input type="checkbox" id="i-two" ${item.two ? 'checked' : ''}> Two-handed</label></div></fieldset>
    <fieldset class="i-grp" data-for="armor shield"><legend>Armour</legend><div class="row"><div><label id="i-aclab">${item.kind === 'shield' ? 'AC bonus' : 'Base AC'}</label><input id="i-ac" type="number" value="${item.ac ?? ''}" placeholder="${item.kind === 'shield' ? '2' : '11'}"></div>
      <div class="i-armortype"><label>Type</label><select id="i-at">${['light', 'medium', 'heavy'].map(t => `<option ${item.armorType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div></fieldset>
    <div class="row"><div><label>AC bonus while worn</label><input id="i-acb" type="number" value="${item.acBonus ?? ''}" placeholder="e.g. 1 for a Ring of Protection"></div><label class="check" style="align-self:flex-end"><input type="checkbox" id="i-att" ${item.attune ? 'checked' : ''}> Needs attunement</label></div>
    <label>Description</label><textarea id="i-notes" rows="3" placeholder="What it does, where it came from">${esc(item.notes || '')}</textarea>
    <div class="modal-actions">${isNew ? '' : '<button class="danger" data-a="del">Delete</button><span style="flex:1"></span>'}<button data-a="no">Cancel</button><button class="primary" data-a="yes">${isNew ? 'Add to bag' : 'Save'}</button></div>`, m => {
    const $ = s => m.querySelector(s);
    const groups = () => { const k = $('#i-kind').value; m.querySelectorAll('.i-grp').forEach(g => g.hidden = !g.dataset.for.split(' ').includes(k)); $('#i-aclab').textContent = k === 'shield' ? 'AC bonus' : 'Base AC'; m.querySelector('.i-armortype').hidden = k === 'shield'; };
    groups(); $('#i-kind').onchange = groups;
    let img = item.img || '';
    $('#i-img').onclick = async () => { const f = await pickFile('image/*'); if (!f) return; img = (await A.storeImage(f, { maxDim: 256 })).ref; $('#i-img').textContent = '✓ Picture added'; };
    if ($('#i-noimg')) $('#i-noimg').onclick = () => { img = ''; $('#i-noimg').remove(); $('#i-img').textContent = '⬆ Upload'; };
    $('#i-entry').onchange = ev => { const x = getEntry(ev.target.value); if (x && !$('#i-name').value.trim()) $('#i-name').value = x.name; if (x?.image && !img) img = x.image; };
    m.addEventListener('click', ev => {
      const a = ev.target.dataset.a;
      if (a === 'no') closeModal();
      if (a === 'del') { sh.items = sh.items.filter(i => i !== item); closeModal(); onDone(); }
      if (a === 'yes') {
        const n = v => v === '' ? '' : +v;
        Object.assign(item, { name: $('#i-name').value.trim() || KINDS[$('#i-kind').value][0], kind: $('#i-kind').value, rarity: $('#i-rar').value, qty: Math.max(1, +$('#i-qty').value || 1), weight: n($('#i-w').value), value: $('#i-val').value.trim(),
          icon: $('#i-icon').value.trim(), img, entryId: $('#i-entry').value, dmg: $('#i-dmg').value.trim(), dmgType: $('#i-dt').value.trim(), bonus: n($('#i-bonus').value), finesse: $('#i-fin').checked, ranged: $('#i-rng').checked, two: $('#i-two').checked,
          ac: n($('#i-ac').value), armorType: $('#i-at').value, acBonus: n($('#i-acb').value), attune: $('#i-att').checked, notes: $('#i-notes').value });
        // something worn in a slot it no longer fits goes back in the bag
        if (item.slot && !SLOTS[item.slot].kinds.includes(item.kind)) { item.slot = ''; item.cell = freeCell(sh); }
        if (isNew) sh.items.push(item);
        closeModal(); onDone();
      }
    });
  });
}
function freeCell(sh, from = 0) {
  const used = new Set(sh.items.filter(i => !i.slot).map(i => i.cell));
  for (let c = from; c < sh.bagRows * 10; c++) if (!used.has(c)) return c;
  sh.bagRows++; return freeCell(sh, from);
}
function tipHTML(i) {
  const lines = [];
  if (i.kind === 'weapon' && i.dmg) lines.push(`${esc(i.dmg)}${+i.bonus ? ` +${i.bonus}` : ''} ${esc(i.dmgType || '')} damage`);
  if (i.kind === 'weapon') { const p = [i.finesse && 'finesse', i.ranged && 'ranged', i.two && 'two-handed'].filter(Boolean); if (p.length) lines.push(p.join(', ')); }
  if (i.kind === 'armor' && i.ac) lines.push(`AC ${i.ac} · ${i.armorType || 'light'} armour`);
  if (i.kind === 'shield') lines.push(`+${i.ac || 2} AC`);
  if (+i.acBonus) lines.push(`+${i.acBonus} AC while worn`);
  return `<div class="cs-tip-name" style="color:${rarCol(i)}">${esc(i.name)}</div><div class="cs-tip-kind">${RARITY[i.rarity || 'common'][0]} ${KINDS[i.kind]?.[0].toLowerCase() || 'item'}${i.attune ? ' (requires attunement)' : ''}</div>
    ${lines.map(l => `<div class="cs-tip-line">${l}</div>`).join('')}${i.notes ? `<div class="cs-tip-notes">${esc(i.notes)}</div>` : ''}
    <div class="cs-tip-foot">${[+i.qty > 1 && `×${i.qty}`, i.weight && `${i.weight} lb`, i.value && esc(i.value)].filter(Boolean).join(' · ')}</div>`;
}

// ---------- putting the sheet on a page ----------
export function mountSheet(host, e, opts = {}) {
  ensureSheet(e);
  const sh = () => e.sheet;
  const touch = () => { e.updated = Date.now(); save(); };
  let tip = null;
  // redraw, keeping the cursor in whichever box you were typing in
  const draw = () => {
    const a = document.activeElement, k = host.contains(a) ? (a.dataset.k || a.dataset.field) : null, pos = k && a.selectionStart != null ? a.selectionStart : null;
    host.innerHTML = `<div class="cs-wrap">${sheetHTML(e, opts)}</div>`;
    if (k) { const n = host.querySelector(`[data-k="${k}"], [data-field="${k}"]`); if (n) { n.focus(); if (pos != null) try { n.setSelectionRange(pos, pos); } catch { /* */ } } }
  };
  // update the worked-out numbers without redrawing (so typing isn't interrupted)
  const refresh = () => {
    const d = derive(sh());
    const set = (k, v) => host.querySelectorAll(`[data-d="${k}"]`).forEach(el => el.textContent = v);
    for (const [k] of ABIL) { set('mod.' + k, sgn(d.m[k])); set('save.' + k, sgn(d.saves[k])); }
    for (const [k] of SKILLS) set('skill.' + k, sgn(d.skills[k]));
    set('passive', d.passive); set('passiveIns', d.passiveIns); set('passiveInv', d.passiveInv); set('dc', d.dc ?? '—'); set('satk', d.satk == null ? '—' : sgn(d.satk)); set('weight', d.weight); set('xp', d.xp ?? '—');
    const ac = host.querySelector('[data-k="acOverride"]'); if (ac) ac.placeholder = d.acAuto;
    const ini = host.querySelector('[data-k="initOverride"]'); if (ini) ini.placeholder = sgn(d.m.dex);
    const pr = host.querySelector('[data-k="profOverride"]'); if (pr && sh().profOverride === '') pr.placeholder = sgn(d.prof);
  };
  draw();
  host.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.field) { let f = e.fields.find(x => x.k.toLowerCase() === t.dataset.field.toLowerCase()); if (!f) e.fields.push(f = { k: t.dataset.field, v: '' }); f.v = t.value; touch(); return; }
    const k = t.dataset.k; if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.t === 'num') v = t.value.trim() === '' ? '' : +t.value.replace(/[^\d.+-]/g, '') || 0;
    setP(sh(), k, v); touch(); refresh();
    if (k === 'theme' || k === 'accent') draw();
  });
  host.addEventListener('change', ev => { const k = ev.target.dataset.k; if (k && /^spell\.slots\.\d\.max$/.test(k)) draw(); if (ev.target.dataset.act === 'cond' && ev.target.value) { sh().conds = [...(sh().conds || []), ev.target.value]; touch(); draw(); } });
  host.addEventListener('click', async ev => {
    const t = ev.target.closest('button, .cs-cell, .cs-slot, [data-roll-mod]'); if (!t) return;
    const S = sh();
    if (t.dataset.skill) { S.skills[t.dataset.skill] = ((+S.skills[t.dataset.skill] || 0) + 1) % 3; touch(); draw(); return; }
    if (t.dataset.save) { S.saves[t.dataset.save] = !S.saves[t.dataset.save]; touch(); draw(); return; }
    if (t.dataset.toggle) { S[t.dataset.toggle] = !S[t.dataset.toggle]; touch(); draw(); return; }
    if (t.dataset.pip) { const cur = +getP(S, t.dataset.pip) || 0, n = +t.dataset.n; setP(S, t.dataset.pip, cur === n ? n - 1 : n); touch(); draw(); return; }
    if (t.dataset.cond) { S.conds = S.conds.filter(c => c !== t.dataset.cond); touch(); draw(); return; }
    if (t.dataset.del) { getP(S, t.dataset.del).splice(+t.dataset.i, 1); touch(); draw(); return; }
    if (t.dataset.rollMod) { const v = parseInt(t.textContent.replace('−', '-')) || 0; try { rollAndLog(`d20${v >= 0 ? '+' : ''}${v}`); toast(`${e.name}: ${t.dataset.rollMod}`); } catch { /* */ } return; }
    if (t.dataset.roll) { try { const r = rollAndLog(t.dataset.roll); toast(`${t.dataset.label}: ${r.total}`); } catch (err) { toast(err.message); } return; }
    if (t.dataset.atk != null) { const a = S.attacks[+t.dataset.atk]; const ex = t.dataset.part === 'hit' ? `d20${/^[+-]/.test(String(a.hit).trim()) ? '' : '+'}${String(a.hit || 0).trim()}` : a.dmg; try { const r = rollAndLog(ex); toast(`${a.name || 'Attack'} ${t.dataset.part === 'hit' ? 'to hit' : 'damage'}: ${r.total}`); } catch (err) { toast(err.message); } return; }
    const act = t.dataset.act;
    if (act === 'portrait') { hideTip(); portraitDialog(e, () => { touch(); draw(); }); return; }
    if (act === 'accent-reset') { S.accent = ''; touch(); draw(); return; }
    if (act === 'add-attack') { S.attacks.push({ name: '', hit: '', dmg: '', type: '' }); touch(); draw(); return; }
    if (act === 'add-spell') { S.spell.list.push({ lvl: 0, name: '', prep: false }); touch(); draw(); host.querySelector(`[data-k="spell.list.${S.spell.list.length - 1}.name"]`)?.focus(); return; }
    if (act === 'add-row') { S.bagRows++; touch(); draw(); return; }
    if (act === 'hp-roll') { if (!S.hpRoll) return toast('Type the hit dice to roll, e.g. 4d8+4'); try { const r = rollAndLog(S.hpRoll); S.hpMax = r.total; S.hp = r.total; touch(); draw(); toast(`Hit points: ${r.total}`); } catch (err) { toast(err.message); } return; }
    if (act === 'new-item') { itemDialog(e, { id: uid(), kind: 'misc', qty: 1, cell: freeCell(S), slot: '' }, () => { touch(); draw(); }); return; }
    if (t.classList.contains('cs-cell') || t.classList.contains('cs-slot')) {
      hideTip();
      const it = S.items.find(i => i.id === t.dataset.item);
      // wait a moment, so a double-click (equip) doesn't open the editor
      if (it) { clearTimeout(clickT); clickT = setTimeout(() => itemDialog(e, it, () => { touch(); draw(); }), 240); }
      else if (t.dataset.cell != null) itemDialog(e, { id: uid(), kind: 'misc', qty: 1, cell: +t.dataset.cell, slot: '' }, () => { touch(); draw(); });
      else if (t.dataset.slot) { const k = SLOTS[t.dataset.slot].kinds[0]; itemDialog(e, { id: uid(), kind: k, qty: 1, cell: 0, slot: t.dataset.slot }, () => { touch(); draw(); }); }
    }
  });
  // double-click: put it on, or take it off
  let clickT = 0;
  host.addEventListener('dblclick', ev => {
    const t = ev.target.closest('[data-item]'); if (!t) return;
    clearTimeout(clickT);
    const S = sh(), it = S.items.find(i => i.id === t.dataset.item); if (!it) return;
    closeModal();
    if (it.slot) { it.slot = ''; it.cell = freeCell(S); }
    else { const slot = Object.keys(SLOTS).find(s => SLOTS[s].kinds.includes(it.kind) && !S.items.some(i => i.slot === s && (it.kind !== 'weapon' || s !== 'ranged' || it.ranged))) || Object.keys(SLOTS).find(s => SLOTS[s].kinds.includes(it.kind));
      if (!slot) return toast(`${KINDS[it.kind]?.[0] || 'That'} can’t be worn — it stays in the bag`);
      equip(S, it, slot); }
    touch(); draw();
  });
  function equip(S, it, slot) {
    const there = S.items.find(i => i.slot === slot && i !== it);
    if (there) { there.slot = it.slot || ''; there.cell = it.slot ? 0 : it.cell; if (there.slot && !SLOTS[there.slot].kinds.includes(there.kind)) { there.slot = ''; there.cell = freeCell(S); } }
    it.slot = slot;
  }
  // drag and drop between the bag and the slots
  let dragId = null;
  host.addEventListener('dragstart', ev => { const t = ev.target.closest('[data-item]'); if (!t) return; dragId = t.dataset.item; ev.dataTransfer.setData('text/plain', dragId); ev.dataTransfer.effectAllowed = 'move'; hideTip(); });
  host.addEventListener('dragover', ev => {
    const t = ev.target.closest('.cs-cell, .cs-slot'); if (!t || !dragId) return;
    const it = sh().items.find(i => i.id === dragId);
    const ok = t.dataset.cell != null || SLOTS[t.dataset.slot]?.kinds.includes(it?.kind);
    if (ok) { ev.preventDefault(); host.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok')); t.classList.add('drop-ok'); }
  });
  host.addEventListener('dragend', () => { dragId = null; host.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok')); });
  host.addEventListener('drop', ev => {
    const t = ev.target.closest('.cs-cell, .cs-slot'); if (!t || !dragId) return;
    ev.preventDefault();
    const S = sh(), it = S.items.find(i => i.id === dragId); dragId = null; if (!it) return;
    if (t.dataset.slot) equip(S, it, t.dataset.slot);
    else {
      const c = +t.dataset.cell, other = S.items.find(i => !i.slot && i.cell === c && i !== it);
      if (other) { if (it.slot) { if (SLOTS[it.slot].kinds.includes(other.kind)) other.slot = it.slot; else other.cell = freeCell(S); } else other.cell = it.cell; }
      it.slot = ''; it.cell = c;
    }
    touch(); draw();
  });
  // a hover card for items, like in an action RPG
  function hideTip() { tip?.remove(); tip = null; }
  host.addEventListener('mouseover', ev => {
    const t = ev.target.closest('[data-item]'); if (!t) { hideTip(); return; }
    const it = sh().items.find(i => i.id === t.dataset.item); if (!it) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'cs-tip'; document.body.appendChild(tip); }
    tip.innerHTML = tipHTML(it);
    const r = t.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, r.right + 8) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, r.top)) + 'px';
  });
  host.addEventListener('mouseleave', hideTip);
  return () => hideTip();
}
