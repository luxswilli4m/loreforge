// Character sheets for World Bible characters and creatures: a gear screen (equipment slots around the figure and a bag
// grid, like an action RPG), every D&D 5e stat, and its own themes. Everything is edited right on the sheet.
// The combat tracker reads these stats (combatStats) and writes hit points back (writeBack).
import { W, save, uid, getEntry } from '../store.js';
import { esc, openModal, closeModal, pickFile, toast, contextMenu } from '../util.js';
import * as A from '../assets.js';
import { rollAndLog } from '../tools/dice.js';
import { CLASS_ART, artURL, guessArt } from '../gen/classArt.js';

// ---------- rules data ----------
export const ABIL = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
export const SKILLS = [['acrobatics', 'Acrobatics', 'dex'], ['animal', 'Animal Handling', 'wis'], ['arcana', 'Arcana', 'int'], ['athletics', 'Athletics', 'str'], ['deception', 'Deception', 'cha'], ['history', 'History', 'int'], ['insight', 'Insight', 'wis'], ['intimidation', 'Intimidation', 'cha'], ['investigation', 'Investigation', 'int'], ['medicine', 'Medicine', 'wis'], ['nature', 'Nature', 'int'], ['perception', 'Perception', 'wis'], ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'], ['sleight', 'Sleight of Hand', 'dex'], ['stealth', 'Stealth', 'dex'], ['survival', 'Survival', 'wis']];
export const CR_XP = { 0: 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
export const crNum = cr => { const s = String(cr ?? '').trim(); if (!s) return null; if (s.includes('/')) { const [a, b] = s.split('/'); return +a / +b; } return +s; };
// metric or imperial, from World settings (metric unless changed). Conversions follow the usual D&D ones: 5 ft = 1.5 m, 1 lb = 0.5 kg.
export const isMetric = () => (W()?.settings?.units || 'metric') === 'metric';
const num1 = v => String(+(+v).toFixed(2));
export const weightText = lb => isMetric() ? `${num1((+lb || 0) * 0.5)} kg` : `${num1(+lb || 0)} lb`;
export const speedText = ft => ft === '' || ft == null ? '—' : isMetric() ? `${num1(+ft * 0.3)} m` : `${num1(+ft)} ft`;
const CONV = { ft: [0.3, 'm', 'ft'], lb: [0.5, 'kg', 'lb'] };
const shown = (v, conv) => v === '' || v == null ? '' : isMetric() ? num1(+v * CONV[conv][0]) : num1(+v);
const stored = (v, conv) => v === '' ? '' : isMetric() ? +v / CONV[conv][0] : +v;
const unitOf = conv => CONV[conv][isMetric() ? 1 : 2];
export const mod = s => Math.floor(((+s || 10) - 10) / 2);
export const sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);

const TRINKETS = ['trinket', 'gem', 'key', 'potion', 'scroll', 'book', 'tool', 'treasure', 'food', 'light', 'misc'];
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
  // quick slots under the portrait: charms, potions, keys, anything small you keep to hand
  trinket1: { label: 'Trinket', icon: '🧿', kinds: TRINKETS },
  trinket2: { label: 'Trinket', icon: '🧿', kinds: TRINKETS },
  trinket3: { label: 'Trinket', icon: '🧿', kinds: TRINKETS },
};
export const KINDS = { weapon: ['Weapon', '🗡️'], shield: ['Shield', '🛡️'], armor: ['Armour', '🥋'], helm: ['Helm', '⛑️'], amulet: ['Amulet', '📿'], cloak: ['Cloak', '🧣'], gloves: ['Gloves / bracers', '🧤'], belt: ['Belt', '🎗️'], boots: ['Boots', '🥾'], ring: ['Ring', '💍'], ammo: ['Ammunition', '🏹'], light: ['Torch / lantern', '🕯️'], trinket: ['Trinket / charm', '🧿'],
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
    profOverride: '', acOverride: parseInt(f('ac') || f('armor class') || f('armour class')) || '', initBonus: '', speedFt: 30, wprof: { simple: true, martial: true, light: true, medium: true, heavy: true, shield: true },
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
  // initiative used to be a number you typed over; it's now Dexterity plus bonuses
  if (sh.initOverride !== undefined) { if (sh.initOverride !== '' && sh.initOverride != null) sh.initBonus = (+sh.initOverride - mod(sh.abil.dex)) || ''; delete sh.initOverride; }
  // speed used to be free text ("30 ft"); it's now kept in feet and shown in the world's units
  if (sh.speedFt === undefined || typeof sh.speed === 'string') { const t = String(sh.speed || '30'); const n = parseFloat(t) || 30; sh.speedFt = /\bm\b/.test(t) && !/ft|feet/.test(t) ? Math.round(n / 0.3) : n; delete sh.speed; }
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
  // armour class: a base (worn armour, or 10 + Dex, or your own number) plus anything that adds or takes away
  const armor = eq('body'), acBase = [];
  if (armor && +armor.ac) { acBase.push([`${armor.name} (${armor.armorType || 'light'} armour)`, +armor.ac]); if (armor.armorType !== 'heavy') acBase.push([armor.armorType === 'medium' ? 'Dexterity (max +2)' : 'Dexterity', armor.armorType === 'medium' ? Math.min(2, m.dex) : m.dex]); }
  else acBase.push(['Unarmoured', 10], ['Dexterity', m.dex]);
  const acAuto = acBase.reduce((t, [, v]) => t + v, 0);
  const own = sh.acOverride !== '' && sh.acOverride != null;
  const acMods = [];
  const shield = eq('off');
  if (shield?.kind === 'shield') acMods.push([shield.name, +shield.ac || 2]);
  for (const i of sh.items) if (i.slot && +i.acBonus) acMods.push([i.name, +i.acBonus]);
  // armour or a shield you aren't proficient with
  const R = profRules(), wornArmour = [armor, eq('off')?.kind === 'shield' ? eq('off') : null].filter(Boolean);
  const nonArmour = wornArmour.filter(i => !isProficient(sh, i));
  const armourRule = nonArmour.length ? R.armor.non : R.armor.prof;
  if (nonArmour.length && +armourRule.ac) acMods.push([`Not proficient (${nonArmour.map(i => i.name).join(', ')})`, +armourRule.ac]);
  const armorMode = armourRule.mode;
  const acMod = acMods.reduce((t, [, v]) => t + v, 0);
  const base = own ? +sh.acOverride : acAuto;
  const ac = base + acMod;
  const acParts = own ? [['Base you set', base]] : acBase;
  const initParts = [['Dexterity', m.dex]];
  for (const i of sh.items) if (i.slot && +i.initBonus) initParts.push([i.name, +i.initBonus]);
  if (+sh.initBonus) initParts.push(['Other bonus', +sh.initBonus]);
  const init = initParts.reduce((t, [, v]) => t + v, 0), initMod = init - m.dex;
  const sa = sh.spell.ability;
  const weight = sh.items.reduce((t, i) => t + (+i.weight || 0) * (+i.qty || 1), 0);
  // attacks from the weapons in hand
  // attacks from the weapons in hand: off-hand attacks don't add a positive modifier to damage (two-weapon fighting),
  // and a versatile weapon held alone in the main hand uses its bigger two-handed die
  const offItem = eq('off');
  const attacks = ['main', 'off', 'ranged'].map(sl => [sl, eq(sl)]).filter(([, i]) => i && i.kind === 'weapon').map(([sl, i]) => {
    const ab = i.ranged ? 'dex' : i.finesse ? (m.dex > m.str ? 'dex' : 'str') : 'str';
    const pr = isProficient(sh, i), r = pr ? R.weapon.prof : R.weapon.non;
    const hit = m[ab] + (r.addProf ? prof : 0) + (+r.hit || 0) + (+i.bonus || 0);
    const dmgMod = (sl === 'off' ? Math.min(0, m[ab]) : m[ab]) + (+i.bonus || 0) + (+r.dmg || 0);
    const mode = mixModes(r.mode, ab === 'str' || ab === 'dex' ? armorMode : 'normal');
    let dice = i.dmg || '', note = sl === 'off' ? 'off hand' : sl === 'ranged' ? 'ranged' : '';
    if (sl === 'main' && i.versatile && !offItem && !i.two) { dice = dice.replace(/d\d+/i, 'd' + i.versatile); note = 'two hands'; }
    if (i.range && (i.ranged || i.thrown || i.ammo)) note = [note, `${rangeShown(i.range)} ${unitOf('ft')}`].filter(Boolean).join(', ');
    if (!pr) note = [note, 'not proficient'].filter(Boolean).join(', ');
    return { name: i.name, note, hit, mode, pr, dmg: dice ? `${dice}${dmgMod ? (dmgMod > 0 ? '+' : '') + dmgMod : ''}` : '', type: i.dmgType || '', auto: true };
  });
  return { m, prof, saves, skills, ac, acAuto, acMod, acMods, acParts, init, initMod, initParts, armorMode, nonArmour, spellsOk: armourRule.spells, passive: 10 + skills.perception, passiveInv: 10 + skills.investigation, passiveIns: 10 + skills.insight,
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
    hpRoll: sh.hpRoll || '', speed: speedText(sh.speedFt), passive: d.passive, conds: [...(sh.conds || [])], hasSheet: true };
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
  const twoH = sh.items.find(i => i.slot === 'main' && i.kind === 'weapon' && i.two);
  const slotHTML = s => {
    const it = sh.items.find(i => i.slot === s), S = SLOTS[s];
    if (s === 'off' && twoH && !it) return `<div class="cs-slot slot-off blocked" data-slot="off" title="${esc(twoH.name)} is two-handed, so the off hand is in use"><span class="cs-ghost">${S.icon}</span><span class="cs-slot-label">Off hand</span></div>`;
    return `<div class="cs-slot slot-${s} ${it ? 'full' : ''}" data-slot="${s}" ${it ? `data-item="${it.id}" draggable="true" style="--rar:${rarCol(it)}"` : ''} title="${it ? '' : S.label}">
      ${it ? itemIcon(it, true) : `<span class="cs-ghost">${S.icon}</span>`}<span class="cs-slot-label">${it ? esc(it.name) : S.label}</span></div>`;
  };
  const pip = (k, n, on) => Array.from({ length: n }, (_, i) => `<button class="cs-pip ${i < on ? 'on' : ''}" data-pip="${k}" data-n="${i + 1}"></button>`).join('');
  const skillRow = ([k, label, a]) => { const p = +sh.skills[k] || 0; return `<div class="cs-skill"><button class="cs-prof p${p}" data-skill="${k}" title="${['Not proficient', 'Proficient', 'Expertise'][p]} — click to change"></button><span class="cs-mod" data-d="skill.${k}" data-ab="${a}" data-roll-mod="${label}">${sgn(d.skills[k])}</span><span>${label} <i>(${a.toUpperCase()})</i></span></div>`; };
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
        <div class="cs-abils">${ABIL.map(([k, l]) => `<div class="cs-abil"><label>${l}</label><div class="cs-abil-mod" data-d="mod.${k}" data-ab="${k}" data-roll-mod="${l} check">${sgn(d.m[k])}</div>${num('abil.' + k, '10', 'cs-abil-score')}</div>`).join('')}</div>
        <div class="cs-mini">
          <div class="cs-chip"><button class="cs-check ${sh.inspiration ? 'on' : ''}" data-toggle="inspiration"></button>Inspiration</div>
          <div class="cs-chip"><input class="cs-in w4" data-k="profOverride" data-t="num" value="${val(sh, 'profOverride')}" placeholder="${sgn(d.prof)}" title="Proficiency bonus — worked out from level${creature ? ' or CR' : ''}; type to set your own"> Proficiency bonus</div>
        </div>
        <div class="cs-panel"><h5>Saving throws</h5>${ABIL.map(([k, l]) => `<div class="cs-skill"><button class="cs-prof p${sh.saves[k] ? 1 : 0}" data-save="${k}" title="Proficient?"></button><span class="cs-mod" data-d="save.${k}" data-ab="${k}" data-roll-mod="${l} save">${sgn(d.saves[k])}</span><span>${l}</span></div>`).join('')}</div>
        <div class="cs-panel cs-passive"><div><b data-d="passive">${d.passive}</b> Passive Perception</div><div><b data-d="passiveIns">${d.passiveIns}</b> Passive Insight</div><div><b data-d="passiveInv">${d.passiveInv}</b> Passive Investigation</div></div>
      </aside>

      <section class="cs-gear">
        <div class="cs-doll">
          <div class="cs-col">${['head', 'cloak', 'body', 'hands', 'belt', 'feet'].map(slotHTML).join('')}</div>
          <div class="cs-mid"><button class="cs-portrait" data-act="portrait" title="Change the picture">${portraitHTML(e, sh)}<span class="cs-portrait-edit">🖼️ Change picture</span></button>
            <div class="cs-trinkets">${['trinket1', 'trinket2', 'trinket3'].map(slotHTML).join('')}</div></div>
          <div class="cs-col">${['neck', 'ring1', 'ring2', 'main', 'off', 'ranged'].map(slotHTML).join('')}</div>
        </div>
        <div class="cs-baghead"><b>Inventory</b><span class="cs-muted small">${bag.length} item${bag.length === 1 ? '' : 's'} · <span data-d="weight">${weightText(d.weight)}</span> / ${weightText(d.carry)}</span><span style="flex:1"></span><button class="cs-btn small" data-act="new-item">＋ Item</button><button class="cs-btn small" data-act="add-row" title="A bigger bag">＋ Row</button></div>
        <div class="cs-bag">${Array.from({ length: cells }, (_, c) => { const it = bag.find(i => i.cell === c); return `<div class="cs-cell ${it ? 'full' : ''}" data-cell="${c}" ${it ? `data-item="${it.id}" draggable="true" style="--rar:${rarCol(it)}"` : ''}>${it ? `${itemIcon(it)}${+it.qty > 1 ? `<b class="cs-qty">${it.qty}</b>` : ''}` : ''}</div>`; }).join('')}</div>
        <div class="cs-coins">${['cp', 'sp', 'ep', 'gp', 'pp'].map(c => `<label class="coin-${c}"><span>${c.toUpperCase()}</span>${num('coins.' + c, '0')}</label>`).join('')}</div>
        <p class="cs-muted small cs-hint">Drag items between the bag and the slots, or double-click to equip. Click an item to edit it, or an empty square to add one. Armour, shields and AC bonuses set your AC; weapons in hand become attacks.</p>
      </section>

      <section class="cs-stats">
        <div class="cs-vitals">
          <div class="cs-box cs-shield" data-breakdown="ac"><div class="cs-box-in"><div class="cs-ac-total"><b data-d="ac">${d.ac}</b><sup data-d="acmod" class="${d.acMod < 0 ? 'neg' : 'pos'}">${d.acMod ? sgn(d.acMod) : ''}</sup></div>
            <div class="cs-hp-row small">base <input class="cs-in w4" data-k="acOverride" data-t="num" value="${val(sh, 'acOverride')}" placeholder="${d.acAuto}" title="Leave empty to work it out from your armour (${d.acAuto}), or type your own base AC. Shields and items still add to it."></div></div><label>Armour class</label></div>
          <div class="cs-box" data-breakdown="init"><div class="cs-box-in"><div class="cs-ac-total"><b data-d="init">${sgn(d.init)}</b><sup data-d="initmod" class="${d.initMod < 0 ? 'neg' : 'pos'}">${d.initMod ? sgn(d.initMod) : ''}</sup></div>
            <div class="cs-hp-row small">bonus <input class="cs-in w4" data-k="initBonus" data-t="num" value="${val(sh, 'initBonus')}" placeholder="0" title="Anything extra, like the Alert feat. Dexterity and items are added for you."></div></div><label>Initiative</label></div>
          ${box(`Speed (${unitOf('ft')})`, `<input class="cs-in cs-big" data-k="speedFt" data-t="num" data-conv="ft" value="${shown(sh.speedFt, 'ft')}" placeholder="${shown(30, 'ft')}">`)}
        </div>
        <div class="cs-box cs-hp"><div class="cs-box-in"><div class="cs-hp-row">${num('hp', String(sh.hpMax || '—'), 'cs-big')}<span>/</span>${num('hpMax', 'max', 'cs-big')}</div>
          <div class="cs-hp-row small">Temp ${num('temp', '0', 'w4')}<button class="cs-btn small" data-act="hp-roll" title="Roll hit points from these dice">🎲</button>${txt('hpRoll', 'e.g. 4d8+4', 'w9')}</div></div><label>Hit points</label></div>
        <div class="cs-vitals two">
          ${box('Hit dice', `<div class="cs-hp-row">${txt('hitDice', 'e.g. 3d10', 'w7')}</div><div class="cs-hp-row small">used ${num('hitDiceUsed', '0', 'w4')}</div>`)}
          ${box('Death saves', `<div class="cs-ds"><span>✔</span>${pip('death.s', 3, sh.death.s)}</div><div class="cs-ds"><span>✖</span>${pip('death.f', 3, sh.death.f)}</div>`)}
        </div>
        ${d.nonArmour.length ? `<div class="cs-warn">⚠ Not proficient with ${d.nonArmour.map(i => esc(i.name)).join(' and ')}${d.armorMode !== 'normal' ? `: ${d.armorMode} on Strength and Dexterity checks, saves and attacks` : ''}${d.spellsOk ? '' : '; can’t cast spells'}.</div>` : ''}
        <div class="cs-conds">
          <span class="cs-label">Conditions</span>${(sh.conds || []).map(c => `<button class="cs-cond" data-cond="${esc(c)}" title="Remove">${esc(c)} ✕</button>`).join('')}
          <select class="cs-cond-add" data-act="cond"><option value="">＋ condition</option>${CONDITIONS.filter(c => !(sh.conds || []).includes(c)).map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="cs-conds"><span class="cs-label">Exhaustion</span>${pip('exhaustion', 6, sh.exhaustion)}</div>
        <div class="cs-panel cs-skills"><h5>Skills</h5>${SKILLS.map(skillRow).join('')}</div>
        <div class="cs-panel cs-atkpanel">
        <h5>Attacks</h5>
        <table class="cs-table"><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Type</th><th></th></tr>
          ${d.attacks.map(a => `<tr class="auto ${a.pr ? '' : 'nonprof'}"><td>${esc(a.name)} <span class="cs-muted small">(${esc(a.note || 'equipped')})</span></td><td><button class="cs-roll" data-roll="${d20(a.hit, a.mode)}" data-label="${esc(a.name)} to hit">${sgn(a.hit)}</button>${a.mode !== 'normal' ? `<span class="cs-mode ${a.mode}" title="${a.mode}">${a.mode === 'advantage' ? 'ADV' : 'DIS'}</span>` : ''}</td><td>${a.dmg ? `<button class="cs-roll" data-roll="${esc(a.dmg)}" data-label="${esc(a.name)} damage">${esc(a.dmg)}</button>` : '—'}</td><td>${esc(a.type)}</td><td></td></tr>`).join('')}
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
      <div class="cs-panel"><h5>Proficiencies <button class="cs-btn small cs-h5btn" data-act="prof-rules" title="What being proficient, or not, does (house rules)">⚙ Rules</button></h5>
        ${WPROF.map(([k, l]) => `<div class="cs-skill"><button class="cs-prof p${sh.wprof?.[k] ? 1 : 0}" data-wprof="${k}" title="Proficient? Click to change"></button><span>${l}</span></div>`).join('')}
        <label class="cs-sub">Tools & other</label>${area('profs', 'Thieves’ tools, lute, navigator’s tools…', 2)}<h5>Languages</h5>${area('languages', 'Common, Elvish…', 2)}<h5>Senses</h5>${area('senses', 'Darkvision 60 ft…', 2)}</div>
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
// weapon properties (5e), and 2024 weapon masteries
export const WPROPS = [['ammo', 'Ammunition', 'Needs ammunition; range listed'], ['finesse', 'Finesse', 'Use Strength or Dexterity'], ['heavy', 'Heavy', 'Small creatures have disadvantage'], ['light', 'Light', 'Good for fighting with two weapons'],
  ['loading', 'Loading', 'One shot per action'], ['ranged', 'Ranged', 'A ranged weapon (uses Dexterity)'], ['reach', 'Reach', 'Adds 5 ft to your reach'], ['thrown', 'Thrown', 'Can be thrown, using the same ability'], ['two', 'Two-handed', 'Needs both hands'], ['special', 'Special', 'Has its own rules']];
export const MASTERY = { Cleave: 'Hit a second creature next to the first', Graze: 'Deal ability-modifier damage on a miss', Nick: 'The extra light-weapon attack is part of the Attack action', Push: 'Push the target 10 ft', Sap: 'Target has disadvantage on its next attack', Slow: 'Target’s speed drops by 10 ft', Topple: 'Target makes a Con save or falls prone', Vex: 'Advantage on your next attack against the target' };
const rangeShown = r => String(r || '').replace(/\d+(\.\d+)?/g, n => shown(+n, 'ft'));
const rangeStored = r => String(r || '').replace(/\d+(\.\d+)?/g, n => num1(stored(+n, 'ft')));
export function propList(i) {
  const p = WPROPS.filter(([k]) => i[k]).map(([, l]) => l.toLowerCase());
  if (i.versatile) p.push(`versatile (d${i.versatile})`);
  if (i.range && (i.ranged || i.thrown || i.ammo)) p.push(`range ${rangeShown(i.range)} ${unitOf('ft')}`);
  return p.join(', ');
}
// what being proficient (or not) with weapons and armour does. Rules as written by default; each world can change them.
export const PROF_DEFAULTS = {
  weapon: { prof: { addProf: true, hit: 0, dmg: 0, mode: 'normal' }, non: { addProf: false, hit: 0, dmg: 0, mode: 'normal' } },
  armor: { prof: { ac: 0, mode: 'normal', spells: true }, non: { ac: 0, mode: 'disadvantage', spells: false } },
};
export function profRules() {
  const r = W()?.settings?.profRules || {};
  return { weapon: { prof: { ...PROF_DEFAULTS.weapon.prof, ...r.weapon?.prof }, non: { ...PROF_DEFAULTS.weapon.non, ...r.weapon?.non } },
    armor: { prof: { ...PROF_DEFAULTS.armor.prof, ...r.armor?.prof }, non: { ...PROF_DEFAULTS.armor.non, ...r.armor?.non } } };
}
export const WPROF = [['simple', 'Simple weapons'], ['martial', 'Martial weapons'], ['light', 'Light armour'], ['medium', 'Medium armour'], ['heavy', 'Heavy armour'], ['shield', 'Shields']];
export function isProficient(sh, i) {
  if (i.profMode === 'yes') return true;
  if (i.profMode === 'no') return false;
  const p = sh.wprof || {};
  if (i.kind === 'weapon') return !!p[i.wcat || 'simple'];
  if (i.kind === 'armor') return !!p[i.armorType || 'light'];
  if (i.kind === 'shield') return !!p.shield;
  return true;
}
const mixModes = (...ms) => { const a = ms.includes('advantage'), d = ms.includes('disadvantage'); return a && !d ? 'advantage' : d && !a ? 'disadvantage' : 'normal'; };
export const d20 = (mod, mode) => `${mode === 'advantage' ? '2d20kh1' : mode === 'disadvantage' ? '2d20kl1' : 'd20'}${mod >= 0 ? '+' : ''}${mod}`;
export const DMG_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const COINS = { cp: ['Copper', 0.01], sp: ['Silver', 0.1], ep: ['Electrum', 0.5], gp: ['Gold', 1], pp: ['Platinum', 10] };
// old items kept their value as text like "15 gp"
function valueOf(i) { if (i.value === '' || i.value == null) return null; if (typeof i.value === 'number') return { n: i.value, cur: i.cur || 'gp' }; const m = /([\d.]+)\s*(cp|sp|ep|gp|pp)?/i.exec(i.value); return m ? { n: +m[1], cur: (m[2] || i.cur || 'gp').toLowerCase() } : null; }
export const valueText = i => { const v = valueOf(i); return v ? `${num1(v.n)} ${v.cur}` : ''; };
const gpOf = i => { const v = valueOf(i); return v ? v.n * COINS[v.cur][1] : 0; };
const ICONS = ['🗡️', '⚔️', '🪓', '🔨', '🏹', '🪃', '🔱', '🪄', '🛡️', '🥋', '⛑️', '🪖', '👑', '📿', '💍', '🧣', '🧤', '🎗️', '🥾', '👢', '🧥', '👘', '🦺', '🕯️', '🔦', '🏮',
  '🧪', '⚗️', '🍷', '🍺', '🍖', '🍞', '🧀', '🍎', '📜', '📕', '📗', '📘', '📙', '🗺️', '💎', '🔮', '🪙', '💰', '🗝️', '🔑', '🔧', '⚒️', '🪚', '🧭', '⌛', '🎲', '🎻', '🪕', '🥁', '🪈',
  '🦴', '🪶', '🌿', '🍄', '🌹', '🐚', '🧿', '🪬', '⚱️', '🏺', '🪤', '⛓️', '🧶', '🪢', '🧰', '📦', '⭐', '🌙', '☀️', '🔥', '❄️', '⚡', '☠️', '👁️', '🐉', '🦂', '🕷️'];
// a searchable dropdown: type to filter, arrows and Enter to pick
function comboHTML(id, opts, value, { custom = false, placeholder = '' } = {}) {
  const cur = opts.find(o => o.v === value);
  return `<div class="combo" id="${id}" data-value="${esc(value ?? '')}" ${custom ? 'data-custom="1"' : ''}><input class="combo-in" value="${esc(cur ? `${cur.icon ? cur.icon + ' ' : ''}${cur.label}` : value || '')}" placeholder="${esc(placeholder)}" autocomplete="off"><div class="combo-list" hidden></div></div>`;
}
function wireCombo(root, id, opts, onChange) {
  const box = root.querySelector('#' + id), inp = box.querySelector('input'), list = box.querySelector('.combo-list');
  let shownOpts = [], sel = 0;
  const label = o => `${o.icon ? o.icon + ' ' : ''}${o.label}`;
  const draw = q => {
    q = (q || '').toLowerCase();
    shownOpts = opts.filter(o => !q || o.label.toLowerCase().includes(q));
    sel = Math.max(0, Math.min(sel, shownOpts.length - 1));
    list.innerHTML = shownOpts.map((o, i) => `<button type="button" class="${i === sel ? 'sel' : ''} ${o.v === box.dataset.value ? 'cur' : ''}" data-i="${i}">${esc(label(o))}</button>`).join('') || `<p class="small muted">${box.dataset.custom ? 'Press Enter to use this' : 'No matches'}</p>`;
    list.hidden = false;
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = o => { box.dataset.value = o ? o.v : inp.value.trim(); inp.value = o ? label(o) : inp.value.trim(); list.hidden = true; onChange?.(box.dataset.value); };
  inp.addEventListener('focus', () => { inp.select(); draw(''); });
  inp.addEventListener('input', () => { sel = 0; draw(inp.value); });
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { sel++; draw(inp.value === label(opts.find(o => o.v === box.dataset.value) || {}) ? '' : inp.value); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(inp.value === label(opts.find(o => o.v === box.dataset.value) || {}) ? '' : inp.value); ev.preventDefault(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (shownOpts[sel]) pick(shownOpts[sel]); else if (box.dataset.custom) pick(null); }
    else if (ev.key === 'Escape') { list.hidden = true; ev.stopPropagation(); }
  });
  list.addEventListener('mousedown', ev => { const b = ev.target.closest('[data-i]'); if (b) { ev.preventDefault(); pick(shownOpts[+b.dataset.i]); } });
  inp.addEventListener('blur', () => setTimeout(() => {
    list.hidden = true;
    const cur = opts.find(o => o.v === box.dataset.value);
    if (box.dataset.custom && inp.value.trim() && (!cur || inp.value !== label(cur))) { const exact = opts.find(o => o.label.toLowerCase() === inp.value.trim().toLowerCase()); pick(exact || null); }
    else inp.value = cur ? label(cur) : box.dataset.custom ? inp.value : '';
  }, 120));
  return () => box.dataset.value;
}
// damage dice as a pool, like the dice table: click to add a die, right-click to take one away
const DMG_DICE = [4, 6, 8, 10, 12, 20];
const parseDice = t => { const pool = {}; for (const m of String(t || '').matchAll(/(\d*)d(\d+)/gi)) pool[+m[2]] = (pool[+m[2]] || 0) + (+m[1] || 1); return pool; };
const diceExpr = pool => Object.keys(pool).map(Number).filter(k => pool[k] > 0).sort((a, b) => b - a).map(k => `${pool[k]}d${k}`).join('+');
export const avgDice = t => { let a = 0; for (const m of String(t || '').matchAll(/(\d*)d(\d+)/gi)) a += (+m[1] || 1) * (+m[2] + 1) / 2; const flat = String(t || '').replace(/\d*d\d+/gi, '').match(/[+-]\s*\d+/g); if (flat) a += flat.reduce((x, f) => x + parseInt(f.replace(/\s/g, '')), 0); return a; };

function itemDialog(e, item, onDone) {
  const sh = e.sheet, isNew = !sh.items.includes(item);
  const bibleItems = W().entries.filter(x => x.type === 'item').sort((a, b) => a.name.localeCompare(b.name));
  const kindOpts = Object.entries(KINDS).map(([k, [l, ic]]) => ({ v: k, label: l, icon: ic })).sort((a, b) => a.label.localeCompare(b.label));
  const dmgOpts = DMG_TYPES.map(t => ({ v: t, label: t[0].toUpperCase() + t.slice(1) }));
  const bibleOpts = [{ v: '', label: '— not linked —' }, ...bibleItems.map(x => ({ v: x.id, label: x.name }))];
  const v0 = valueOf(item);
  let pool = parseDice(item.dmg), icon = item.icon || '';
  const wUnitL = unitOf('lb');
  openModal(`<h2>${isNew ? 'New item' : 'Item'}</h2>
    <div class="row"><div style="flex:2"><label>Name</label><input id="i-name" value="${esc(item.name || '')}" placeholder="e.g. Longsword of Embers" autofocus></div>
      <div><label>Kind</label>${comboHTML('i-kind', kindOpts, item.kind || 'misc', { placeholder: 'Search kinds…' })}</div></div>
    <div class="row"><div><label>Rarity</label><select id="i-rar">${Object.entries(RARITY).map(([k, [l]]) => `<option value="${k}" ${(item.rarity || 'common') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Quantity</label><input id="i-qty" type="number" min="1" value="${item.qty || 1}"></div><div><label>Weight (${wUnitL}, each)</label><input id="i-w" type="number" step="0.1" min="0" value="${shown(item.weight, 'lb')}"></div>
      <div><label>Value</label><div class="i-money"><input id="i-val" type="number" min="0" step="any" value="${v0 ? v0.n : ''}" placeholder="15"><select id="i-cur">${Object.entries(COINS).map(([k, [l]]) => `<option value="${k}" ${(v0?.cur || 'gp') === k ? 'selected' : ''} title="${l}">${k}</option>`).join('')}</select></div></div></div>
    <div class="row"><div><label>Icon</label><div class="i-iconpick"><button type="button" class="i-iconbtn" id="i-iconbtn" title="Choose an icon"></button><span class="small muted" id="i-iconnote"></span></div>
        <div class="i-icongrid" id="i-icongrid" hidden><button type="button" class="i-auto" data-ic="">↺ Match the kind</button>${ICONS.map(ic => `<button type="button" data-ic="${ic}">${ic}</button>`).join('')}<input id="i-iconown" placeholder="or paste any emoji" maxlength="4"></div></div>
      <div><label>Picture</label><div class="row" style="gap:6px"><button class="small" id="i-img">${item.img ? 'Replace' : '⬆ Upload'}</button>${item.img ? '<button class="small danger" id="i-noimg">Remove</button>' : ''}</div></div>
      <div style="flex:2"><label>World Bible item</label>${comboHTML('i-entry', bibleOpts, item.entryId || '', { placeholder: 'Search the World Bible…' })}</div></div>
    <fieldset class="i-grp" data-for="weapon"><legend>Weapon</legend>
      <label style="margin-top:0">Damage <span class="small muted">— click a die to add it, right-click to take one away</span></label>
      <div class="i-dice">${DMG_DICE.map(n => `<button type="button" class="i-die" data-die="${n}">d${n}<b data-dc="${n}"></b></button>`).join('')}<span class="i-expr" id="i-expr"></span><button type="button" class="small" id="i-dclear">Clear</button></div>
      <div class="row"><div><label>Damage type</label>${comboHTML('i-dt', dmgOpts, item.dmgType || '', { custom: true, placeholder: 'Search or type…' })}</div><div><label>Magic bonus</label><input id="i-bonus" type="number" value="${item.bonus ?? ''}" placeholder="0"></div></div>
      <div class="row"><div><label>Category</label><select id="i-wcat"><option value="simple" ${item.wcat !== 'martial' ? 'selected' : ''}>Simple weapon</option><option value="martial" ${item.wcat === 'martial' ? 'selected' : ''}>Martial weapon</option></select></div><div></div></div>
      <label>Properties</label>
      <div class="i-props">${WPROPS.map(([k, l, tip]) => `<label class="check" title="${tip}"><input type="checkbox" data-prop="${k}" ${item[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        <label class="check" title="Can be used in one or two hands; two hands use a bigger die"><input type="checkbox" id="i-vers" ${item.versatile ? 'checked' : ''}> Versatile</label></div>
      <div class="row">
        <div id="i-versbox"><label>Two-handed die</label><select id="i-versdie">${[6, 8, 10, 12].map(n => `<option value="${n}" ${+item.versatile === n ? 'selected' : ''}>d${n}</option>`).join('')}</select></div>
        <div id="i-rangebox"><label>Range (${unitOf('ft')}, normal/long)</label><input id="i-range" value="${esc(rangeShown(item.range))}" placeholder="${isMetric() ? '24/96' : '80/320'}"></div>
        <div><label>Mastery <span class="small muted">(2024 rules)</span></label><select id="i-mastery"><option value="">—</option>${Object.entries(MASTERY).map(([k, d]) => `<option ${item.mastery === k ? 'selected' : ''} title="${d}">${k}</option>`).join('')}</select></div>
      </div></fieldset>
    <fieldset class="i-grp" data-for="armor shield"><legend>Armour</legend><div class="row"><div><label id="i-aclab">${item.kind === 'shield' ? 'AC bonus' : 'Base AC'}</label><input id="i-ac" type="number" value="${item.ac ?? ''}" placeholder="${item.kind === 'shield' ? '2' : '11'}"></div>
      <div class="i-armortype"><label>Type</label><select id="i-at">${['light', 'medium', 'heavy'].map(t => `<option ${item.armorType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div></fieldset>
    <div class="row i-profrow" id="i-profrow"><div><label>Proficiency</label><select id="i-prof"><option value="">From the character sheet</option><option value="yes" ${item.profMode === 'yes' ? 'selected' : ''}>Always proficient with this one</option><option value="no" ${item.profMode === 'no' ? 'selected' : ''}>Never proficient with this one</option></select></div><div></div></div>
    <div class="row"><div><label>Initiative bonus while worn</label><input id="i-initb" type="number" value="${item.initBonus ?? ''}" placeholder="e.g. 2"></div><div><label>AC bonus while worn</label><input id="i-acb" type="number" value="${item.acBonus ?? ''}" placeholder="e.g. 1, or −1"></div><label class="check" style="align-self:flex-end"><input type="checkbox" id="i-att" ${item.attune ? 'checked' : ''}> Needs attunement</label></div>
    <label>Description</label><textarea id="i-notes" rows="3" placeholder="What it does, where it came from">${esc(item.notes || '')}</textarea>
    <div class="modal-actions">${isNew ? '' : '<button class="danger" data-a="del">Delete</button><span style="flex:1"></span>'}<button data-a="no">Cancel</button><button class="primary" data-a="yes">${isNew ? 'Add to bag' : 'Save'}</button></div>`, m => {
    const $ = q => m.querySelector(q);
    let kind = item.kind || 'misc';
    const drawIcon = () => { $('#i-iconbtn').textContent = icon || KINDS[kind]?.[1] || '📦'; $('#i-iconnote').textContent = icon ? 'your choice' : `matches ${KINDS[kind]?.[0].toLowerCase() || 'the kind'}`; };
    const groups = () => { m.querySelectorAll('.i-grp').forEach(g => g.hidden = !g.dataset.for.split(' ').includes(kind)); $('#i-profrow').hidden = !['weapon', 'armor', 'shield'].includes(kind); $('#i-aclab').textContent = kind === 'shield' ? 'AC bonus' : 'Base AC'; m.querySelector('.i-armortype').hidden = kind === 'shield'; drawIcon(); };
    const getKind = wireCombo(m, 'i-kind', kindOpts, v => { kind = v; groups(); });
    const getDt = wireCombo(m, 'i-dt', dmgOpts);
    let entryId = item.entryId || '';
    wireCombo(m, 'i-entry', bibleOpts, v => { entryId = v; const x = getEntry(v); if (x && !$('#i-name').value.trim()) $('#i-name').value = x.name; if (x?.image && !img) img = x.image; });
    groups();
    // damage dice
    const drawDice = () => { for (const n of DMG_DICE) { const b = m.querySelector(`[data-dc="${n}"]`); b.textContent = pool[n] ? '×' + pool[n] : ''; b.parentElement.classList.toggle('on', !!pool[n]); } $('#i-expr').textContent = diceExpr(pool) || 'no dice yet'; };
    m.querySelectorAll('[data-die]').forEach(b => { b.onclick = () => { const n = +b.dataset.die; pool[n] = Math.min(20, (pool[n] || 0) + 1); drawDice(); }; b.oncontextmenu = ev => { ev.preventDefault(); const n = +b.dataset.die; pool[n] = Math.max(0, (pool[n] || 0) - 1); drawDice(); }; });
    $('#i-dclear').onclick = () => { pool = {}; drawDice(); };
    drawDice();
    const propsVis = () => { $('#i-versbox').hidden = !$('#i-vers').checked; const r = ['ranged', 'thrown', 'ammo'].some(k => m.querySelector(`[data-prop="${k}"]`).checked); $('#i-rangebox').hidden = !r; };
    m.querySelectorAll('[data-prop], #i-vers').forEach(c => c.addEventListener('change', propsVis)); propsVis();
    // icon
    $('#i-iconbtn').onclick = () => { $('#i-icongrid').hidden = !$('#i-icongrid').hidden; };
    $('#i-icongrid').addEventListener('click', ev => { const b = ev.target.closest('[data-ic]'); if (!b) return; icon = b.dataset.ic; drawIcon(); $('#i-icongrid').hidden = true; });
    $('#i-iconown').addEventListener('input', ev => { if (ev.target.value.trim()) { icon = ev.target.value.trim(); drawIcon(); } });
    let img = item.img || '';
    $('#i-img').onclick = async () => { const f = await pickFile('image/*'); if (!f) return; img = (await A.storeImage(f, { maxDim: 256 })).ref; $('#i-img').textContent = '✓ Picture added'; };
    if ($('#i-noimg')) $('#i-noimg').onclick = () => { img = ''; $('#i-noimg').remove(); $('#i-img').textContent = '⬆ Upload'; };
    m.addEventListener('click', ev => {
      const a = ev.target.dataset.a;
      if (a === 'no') closeModal();
      if (a === 'del') { sh.items = sh.items.filter(i => i !== item); closeModal(); onDone(); }
      if (a === 'yes') {
        const n = v => v === '' ? '' : +v;
        kind = getKind() || kind;
        Object.assign(item, { name: $('#i-name').value.trim() || KINDS[kind][0], kind, rarity: $('#i-rar').value, qty: Math.max(1, +$('#i-qty').value || 1), weight: stored($('#i-w').value, 'lb'),
          value: n($('#i-val').value), cur: $('#i-cur').value, icon, img, entryId, dmg: diceExpr(pool), dmgType: getDt() || '', bonus: n($('#i-bonus').value), ...Object.fromEntries(WPROPS.map(([k]) => [k, m.querySelector(`[data-prop="${k}"]`).checked])),
          versatile: $('#i-vers').checked ? +$('#i-versdie').value : '', range: rangeStored($('#i-range').value.trim()), mastery: $('#i-mastery').value,
          ac: n($('#i-ac').value), armorType: $('#i-at').value, acBonus: n($('#i-acb').value), initBonus: n($('#i-initb').value), wcat: $('#i-wcat').value, profMode: $('#i-prof').value, attune: $('#i-att').checked, notes: $('#i-notes').value });
        // something worn in a slot it no longer fits goes back in the bag
        if (item.slot && !SLOTS[item.slot].kinds.includes(item.kind)) { item.slot = ''; item.cell = freeCell(sh); }
        if (isNew) sh.items.push(item);
        closeModal(); onDone();
      }
    });
  });
}

// ---------- house rules for proficiency ----------
function profRulesDialog(onDone) {
  const R = profRules();
  const modeSel = (id, v) => `<select id="${id}">${['normal', 'advantage', 'disadvantage'].map(x => `<option ${v === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const wcol = (k, r) => `<td><label class="check"><input type="checkbox" id="w-${k}-add" ${r.addProf ? 'checked' : ''}> add proficiency bonus</label>
      <div class="row" style="gap:6px"><div><label>Extra to hit</label><input id="w-${k}-hit" type="number" value="${r.hit || 0}"></div><div><label>Extra damage</label><input id="w-${k}-dmg" type="number" value="${r.dmg || 0}"></div></div>
      <label>Attack rolls</label>${modeSel(`w-${k}-mode`, r.mode)}</td>`;
  const acol = (k, r) => `<td><div><label>AC change</label><input id="a-${k}-ac" type="number" value="${r.ac || 0}"></div>
      <label>Strength & Dexterity rolls and attacks</label>${modeSel(`a-${k}-mode`, r.mode)}
      <label class="check"><input type="checkbox" id="a-${k}-sp" ${r.spells ? 'checked' : ''}> can cast spells</label></td>`;
  openModal(`<h2>⚙ Proficiency rules</h2>
    <p class="small muted">What happens with weapons and armour a character is, or isn't, proficient with. These are house rules for this whole world; they start as the rules as written.</p>
    <table class="pr-table"><tr><th></th><th>Proficient</th><th>Not proficient</th></tr>
      <tr><th>⚔️ Weapons</th>${wcol('prof', R.weapon.prof)}${wcol('non', R.weapon.non)}</tr>
      <tr><th>🛡️ Armour & shields</th>${acol('prof', R.armor.prof)}${acol('non', R.armor.non)}</tr></table>
    <div class="modal-actions"><button data-a="reset">Back to the rules as written</button><span style="flex:1"></span><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save rules</button></div>`, m => m.addEventListener('click', ev => {
    const a = ev.target.dataset.a; if (!a) return;
    const w = W();
    if (a === 'reset') { delete w.settings.profRules; save(); closeModal(); onDone(); toast('Back to the rules as written'); return; }
    if (a === 'yes') {
      const q = id => m.querySelector('#' + id);
      const wr = k => ({ addProf: q(`w-${k}-add`).checked, hit: +q(`w-${k}-hit`).value || 0, dmg: +q(`w-${k}-dmg`).value || 0, mode: q(`w-${k}-mode`).value });
      const ar = k => ({ ac: +q(`a-${k}-ac`).value || 0, mode: q(`a-${k}-mode`).value, spells: q(`a-${k}-sp`).checked });
      w.settings.profRules = { weapon: { prof: wr('prof'), non: wr('non') }, armor: { prof: ar('prof'), non: ar('non') } };
      save(); toast('Proficiency rules saved for this world');
    }
    closeModal(); if (a === 'yes') onDone();
  }));
}

// ---------- comparing two items of the same kind ----------
function compareDialog(e, a, onEquip) {
  const others = [];
  for (const x of e.sheet.items) if (x !== a && x.kind === a.kind) others.push({ it: x, who: '', own: true });
  for (const en of W().entries) if (en !== e && en.sheet?.items) for (const x of en.sheet.items) if (x.kind === a.kind) others.push({ it: x, who: en.name, own: false });
  if (!others.length) return toast(`No other ${KINDS[a.kind]?.[0].toLowerCase() || 'item'}s to compare with yet`);
  const rows = (x, y) => {
    const R = [];
    const cmp = (label, va, vb, fmt = v => v, better = 1) => { const d = (+vb || 0) - (+va || 0); R.push(`<tr><td>${label}</td><td>${fmt(va)}</td><td>${fmt(vb)}</td><td class="${!d ? '' : d * better > 0 ? 'up' : 'down'}">${!d ? '=' : (d > 0 ? '▲ ' : '▼ ') + num1(Math.abs(d))}</td></tr>`); };
    const txt = (label, va, vb) => R.push(`<tr><td>${label}</td><td>${va || '—'}</td><td>${vb || '—'}</td><td>${va === vb ? '=' : ''}</td></tr>`);
    txt('Rarity', RARITY[x.rarity || 'common'][0], RARITY[y.rarity || 'common'][0]);
    if (a.kind === 'weapon') {
      cmp('Average damage', avgDice(x.dmg) + (+x.bonus || 0), avgDice(y.dmg) + (+y.bonus || 0), v => num1(v));
      txt('Damage', `${x.dmg || '—'}${+x.bonus ? ' ' + sgn(+x.bonus) : ''}`, `${y.dmg || '—'}${+y.bonus ? ' ' + sgn(+y.bonus) : ''}`);
      cmp('To hit (magic)', +x.bonus || 0, +y.bonus || 0, v => sgn(+v));
      txt('Damage type', x.dmgType, y.dmgType);
      txt('Properties', propList(x), propList(y));
      if (x.mastery || y.mastery) txt('Mastery', x.mastery, y.mastery);
    }
    if (a.kind === 'armor') { cmp('Base AC', +x.ac || 0, +y.ac || 0); txt('Type', x.armorType || 'light', y.armorType || 'light'); }
    if (a.kind === 'shield') cmp('AC bonus', +x.ac || 2, +y.ac || 2, v => sgn(+v));
    if (+x.acBonus || +y.acBonus) cmp('AC while worn', +x.acBonus || 0, +y.acBonus || 0, v => sgn(+v));
    const wc = v => (+v || 0) * (isMetric() ? 0.5 : 1);
    cmp(`Weight (${unitOf('lb')})`, wc(x.weight), wc(y.weight), v => num1(v), -1);
    cmp('Value (gp)', gpOf(x), gpOf(y), v => num1(v));
    txt('Attunement', x.attune ? 'needed' : 'no', y.attune ? 'needed' : 'no');
    return R.join('');
  };
  openModal(`<h2>Compare ${esc(a.name)}</h2>
    <label>With</label><select id="cmp-with">${others.map((o, i) => `<option value="${i}">${esc(o.it.name)}${o.it.slot ? ' (equipped)' : ''}${o.who ? ` — ${esc(o.who)}’s` : ''}</option>`).join('')}</select>
    <div id="cmp-out"></div>
    <div class="modal-actions"><span style="flex:1"></span><button data-a="close">Close</button></div>`, m => {
    const draw = () => {
      const o = others[+m.querySelector('#cmp-with').value];
      m.querySelector('#cmp-out').innerHTML = `<table class="cmp-table"><tr><th></th><th style="color:${rarCol(a)}">${itemIcon(a)} ${esc(a.name)}</th><th style="color:${rarCol(o.it)}">${itemIcon(o.it)} ${esc(o.it.name)}</th><th></th></tr>${rows(a, o.it)}</table>
        <p class="small muted">▲ / ▼ show how the second one compares with ${esc(a.name)}.</p>
        ${o.own && !o.it.slot ? `<button class="small" data-a="equip">Equip ${esc(o.it.name)} instead</button>` : ''}`;
    };
    m.querySelector('#cmp-with').onchange = draw; draw();
    m.addEventListener('click', ev => {
      const act = ev.target.dataset.a;
      if (act === 'close') closeModal();
      if (act === 'equip') { const o = others[+m.querySelector('#cmp-with').value]; closeModal(); onEquip(o.it, a.slot); }
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
  if (i.kind === 'weapon' && i.dmg) lines.push(`${esc(i.dmg)}${+i.bonus ? ` ${sgn(+i.bonus)}` : ''} ${esc(i.dmgType || '')} damage`);
  if (i.kind === 'weapon' && +i.bonus) lines.push(`${sgn(+i.bonus)} to hit`);
  if (i.kind === 'weapon') { const p = propList(i); if (p) lines.push(esc(p)); if (i.mastery) lines.push(`Mastery: ${i.mastery} — ${MASTERY[i.mastery]}`); }
  if (i.kind === 'armor' && i.ac) lines.push(`AC ${i.ac} · ${i.armorType || 'light'} armour`);
  if (i.kind === 'shield') lines.push(`${sgn(+i.ac || 2)} AC`);
  if (+i.acBonus) lines.push(`${sgn(+i.acBonus)} AC while worn`);
  if (+i.initBonus) lines.push(`${sgn(+i.initBonus)} initiative while worn`);
  return `<div class="cs-tip-name" style="color:${rarCol(i)}">${esc(i.name)}</div><div class="cs-tip-kind">${RARITY[i.rarity || 'common'][0]} ${i.kind === 'weapon' ? (i.wcat === 'martial' ? 'martial ' : 'simple ') : ''}${KINDS[i.kind]?.[0].toLowerCase() || 'item'}${i.attune ? ' (requires attunement)' : ''}</div>
    ${lines.map(l => `<div class="cs-tip-line">${l}</div>`).join('')}${i.notes ? `<div class="cs-tip-notes">${esc(i.notes)}</div>` : ''}
    <div class="cs-tip-foot">${[+i.qty > 1 && `×${i.qty}`, i.weight && weightText(i.weight), valueText(i)].filter(Boolean).join(' · ')}</div>`;
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
    set('passive', d.passive); set('passiveIns', d.passiveIns); set('passiveInv', d.passiveInv); set('dc', d.dc ?? '—'); set('satk', d.satk == null ? '—' : sgn(d.satk)); set('weight', weightText(d.weight)); set('xp', d.xp ?? '—');
    const ac = host.querySelector('[data-k="acOverride"]'); if (ac) ac.placeholder = d.acAuto;
    set('ac', d.ac); set('init', sgn(d.init)); const im = host.querySelector('[data-d="initmod"]'); if (im) { im.textContent = d.initMod ? sgn(d.initMod) : ''; im.className = d.initMod < 0 ? 'neg' : 'pos'; } const am = host.querySelector('[data-d="acmod"]'); if (am) { am.textContent = d.acMod ? sgn(d.acMod) : ''; am.className = d.acMod < 0 ? 'neg' : 'pos'; }
    const pr = host.querySelector('[data-k="profOverride"]'); if (pr && sh().profOverride === '') pr.placeholder = sgn(d.prof);
  };
  draw();
  host.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.field) { let f = e.fields.find(x => x.k.toLowerCase() === t.dataset.field.toLowerCase()); if (!f) e.fields.push(f = { k: t.dataset.field, v: '' }); f.v = t.value; touch(); return; }
    const k = t.dataset.k; if (!k) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.t === 'num') v = t.value.trim() === '' ? '' : +t.value.replace(/[^\d.+-]/g, '') || 0;
    if (t.dataset.conv && v !== '') v = stored(v, t.dataset.conv);
    setP(sh(), k, v); touch(); refresh();
    if (k === 'theme' || k === 'accent') draw();
  });
  host.addEventListener('change', ev => { const k = ev.target.dataset.k; if (k && /^spell\.slots\.\d\.max$/.test(k)) draw(); if (ev.target.dataset.act === 'cond' && ev.target.value) { sh().conds = [...(sh().conds || []), ev.target.value]; touch(); draw(); } });
  host.addEventListener('click', async ev => {
    const t = ev.target.closest('button, .cs-cell, .cs-slot, [data-roll-mod]'); if (!t) return;
    const S = sh();
    if (t.dataset.skill) { S.skills[t.dataset.skill] = ((+S.skills[t.dataset.skill] || 0) + 1) % 3; touch(); draw(); return; }
    if (t.dataset.save) { S.saves[t.dataset.save] = !S.saves[t.dataset.save]; touch(); draw(); return; }
    if (t.dataset.wprof) { S.wprof = { ...(S.wprof || {}) }; S.wprof[t.dataset.wprof] = !S.wprof[t.dataset.wprof]; touch(); draw(); return; }
    if (t.dataset.toggle) { S[t.dataset.toggle] = !S[t.dataset.toggle]; touch(); draw(); return; }
    if (t.dataset.pip) { const cur = +getP(S, t.dataset.pip) || 0, n = +t.dataset.n; setP(S, t.dataset.pip, cur === n ? n - 1 : n); touch(); draw(); return; }
    if (t.dataset.cond) { S.conds = S.conds.filter(c => c !== t.dataset.cond); touch(); draw(); return; }
    if (t.dataset.del) { getP(S, t.dataset.del).splice(+t.dataset.i, 1); touch(); draw(); return; }
    if (t.dataset.rollMod) { const v = parseInt(t.textContent.replace('−', '-')) || 0, d = derive(S), mode = ['str', 'dex'].includes(t.dataset.ab) ? d.armorMode : 'normal'; try { const r = rollAndLog(d20(v, mode)); toast(`${e.name}: ${t.dataset.rollMod}${mode !== 'normal' ? ` (${mode})` : ''} — ${r.total}`); } catch { /* */ } return; }
    if (t.dataset.roll) { try { const r = rollAndLog(t.dataset.roll); toast(`${t.dataset.label}: ${r.total}`); } catch (err) { toast(err.message); } return; }
    if (t.dataset.atk != null) { const a = S.attacks[+t.dataset.atk]; const ex = t.dataset.part === 'hit' ? `d20${/^[+-]/.test(String(a.hit).trim()) ? '' : '+'}${String(a.hit || 0).trim()}` : a.dmg; try { const r = rollAndLog(ex); toast(`${a.name || 'Attack'} ${t.dataset.part === 'hit' ? 'to hit' : 'damage'}: ${r.total}`); } catch (err) { toast(err.message); } return; }
    const act = t.dataset.act;
    if (act === 'prof-rules') { profRulesDialog(() => draw()); return; }
    if (act === 'portrait') { hideTip(); portraitDialog(e, () => { touch(); draw(); }); return; }
    if (act === 'accent-reset') { S.accent = ''; touch(); draw(); return; }
    if (act === 'add-attack') { S.attacks.push({ name: '', hit: '', dmg: '', type: '' }); touch(); draw(); return; }
    if (act === 'add-spell') { S.spell.list.push({ lvl: 0, name: '', prep: false }); touch(); draw(); host.querySelector(`[data-k="spell.list.${S.spell.list.length - 1}.name"]`)?.focus(); return; }
    if (act === 'add-row') { S.bagRows++; touch(); draw(); return; }
    if (act === 'hp-roll') { if (!S.hpRoll) return toast('Type the hit dice to roll, e.g. 4d8+4'); try { const r = rollAndLog(S.hpRoll); S.hpMax = r.total; S.hp = r.total; touch(); draw(); toast(`Hit points: ${r.total}`); } catch (err) { toast(err.message); } return; }
    if (act === 'new-item') { itemDialog(e, { id: uid(), kind: 'misc', qty: 1, cell: freeCell(S), slot: '' }, () => { touch(); draw(); }); return; }
    if (t.classList.contains('blocked')) { toast('Your main-hand weapon needs both hands'); return; }
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
    if (it.slot) unwear(S, it); else if (!wear(S, it)) return;
    touch(); draw();
  });
  // put something on in the best free slot that fits it (ranged weapons prefer the ranged slot)
  const fits = it => it.kind === 'weapon' ? (it.two ? (it.ranged ? ['ranged', 'main'] : ['main']) : it.ranged ? ['ranged', 'main', 'off'] : ['main', 'off']) : Object.keys(SLOTS).filter(s => SLOTS[s].kinds.includes(it.kind));
  function wear(S, it, prefer) {
    let ok = fits(it);
    const twoMain = S.items.find(i => i.slot === 'main' && i !== it && i.kind === 'weapon' && i.two);
    if (twoMain) ok = ok.filter(s => s !== 'off');
    if (!ok.length) { toast(twoMain && fits(it).includes('off') ? `${twoMain.name} needs both hands — take it off first` : `${KINDS[it.kind]?.[0] || 'That'} can’t be worn — it stays in the bag`); return false; }
    const slot = (prefer && ok.includes(prefer) && prefer) || ok.find(s => !S.items.some(i => i.slot === s)) || ok[0];
    return equip(S, it, slot);
  }
  function unwear(S, it) { it.slot = ''; it.cell = freeCell(S); }
  // right-click an item: equip or take off, compare, edit, delete
  host.addEventListener('contextmenu', ev => {
    const t = ev.target.closest('[data-item]'); if (!t) return;
    ev.preventDefault(); hideTip(); clearTimeout(clickT);
    const S = sh(), it = S.items.find(i => i.id === t.dataset.item); if (!it) return;
    const done = () => { touch(); draw(); };
    contextMenu(ev.clientX, ev.clientY, [
      { header: it.name },
      it.slot ? { label: 'Unequip', icon: '⤵️', action: () => { unwear(S, it); done(); } }
        : { label: fits(it).length ? 'Equip' : 'Can’t be worn', icon: '🛡️', action: () => { if (wear(S, it)) done(); } },
      { label: 'Compare…', icon: '⚖️', action: () => compareDialog(e, it, (other, slot) => { wear(S, other, slot); done(); }) },
      { label: 'Edit', icon: '✎', action: () => itemDialog(e, it, done) },
      { label: 'Duplicate', icon: '⧉', action: () => { S.items.push({ ...JSON.parse(JSON.stringify(it)), id: uid(), slot: '', cell: freeCell(S) }); done(); } },
      '-',
      { label: 'Delete', icon: '🗑', danger: true, action: () => { S.items = S.items.filter(i => i !== it); done(); } },
    ]);
  });
  // two-handed weapons go in the main hand and leave the off hand empty
  function equip(S, it, slot) {
    if (it.kind === 'weapon' && it.two && slot === 'off') slot = 'main';
    const main = S.items.find(i => i.slot === 'main');
    if (slot === 'off' && main && main !== it && main.kind === 'weapon' && main.two) { toast(`${main.name} needs both hands — take it off first`); return false; }
    const there = S.items.find(i => i.slot === slot && i !== it);
    if (there) { there.slot = it.slot || ''; there.cell = it.slot ? 0 : it.cell; if (there.slot && (!SLOTS[there.slot].kinds.includes(there.kind) || (there.slot === 'off' && it.two))) { there.slot = ''; there.cell = freeCell(S); } }
    it.slot = slot;
    if (slot === 'main' && it.kind === 'weapon' && it.two) { const off = S.items.find(i => i.slot === 'off'); if (off) { off.slot = ''; off.cell = freeCell(S); toast(`${off.name} went back in the bag — ${it.name} needs both hands`); } }
    return true;
  }
  // drag and drop between the bag and the slots
  let dragId = null;
  host.addEventListener('dragstart', ev => { const t = ev.target.closest('[data-item]'); if (!t) return; dragId = t.dataset.item; ev.dataTransfer.setData('text/plain', dragId); ev.dataTransfer.effectAllowed = 'move'; hideTip(); });
  host.addEventListener('dragover', ev => {
    const t = ev.target.closest('.cs-cell, .cs-slot'); if (!t || !dragId) return;
    const it = sh().items.find(i => i.id === dragId);
    const main = sh().items.find(i => i.slot === 'main' && i !== it);
    const ok = t.dataset.cell != null || (SLOTS[t.dataset.slot]?.kinds.includes(it?.kind) && !(t.dataset.slot === 'off' && main?.two && main.kind === 'weapon'));
    if (ok) { ev.preventDefault(); host.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok')); t.classList.add('drop-ok'); }
  });
  host.addEventListener('dragend', () => { dragId = null; host.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok')); });
  host.addEventListener('drop', ev => {
    const t = ev.target.closest('.cs-cell, .cs-slot'); if (!t || !dragId) return;
    ev.preventDefault();
    const S = sh(), it = S.items.find(i => i.id === dragId); dragId = null; if (!it) return;
    if (t.dataset.slot) { if (!equip(S, it, t.dataset.slot)) { draw(); return; } }
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
    const acb = ev.target.closest('[data-breakdown]');
    if (acb && acb.dataset.breakdown === 'init') {
      const d = derive(sh());
      if (!tip) { tip = document.createElement('div'); tip.className = 'cs-tip'; document.body.appendChild(tip); }
      tip.innerHTML = `<div class="cs-tip-name">Initiative ${sgn(d.init)}</div>${d.initParts.map(([l, v], i) => `<div class="cs-tip-row ${i ? (v < 0 ? 'neg' : 'pos') : ''}"><span>${esc(l)}</span><b>${sgn(v)}</b></div>`).join('')}<div class="cs-tip-row total"><span>Total</span><b>${sgn(d.init)}</b></div>`;
      const r = acb.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, r.left) + 'px'; tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, r.bottom + 6) + 'px';
      return;
    }
    if (acb) {
      const d = derive(sh());
      if (!tip) { tip = document.createElement('div'); tip.className = 'cs-tip'; document.body.appendChild(tip); }
      tip.innerHTML = `<div class="cs-tip-name">Armour class ${d.ac}</div>${d.acParts.map(([l, v]) => `<div class="cs-tip-row"><span>${esc(l)}</span><b>${l === 'Unarmoured' || l.includes('armour') || l === 'Base you set' ? v : sgn(v)}</b></div>`).join('')}
        ${d.acMods.map(([l, v]) => `<div class="cs-tip-row ${v < 0 ? 'neg' : 'pos'}"><span>${esc(l)}</span><b>${sgn(v)}</b></div>`).join('')}<div class="cs-tip-row total"><span>Total</span><b>${d.ac}</b></div>`;
      const r = acb.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, r.left) + 'px'; tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, r.bottom + 6) + 'px';
      return;
    }
    const t = ev.target.closest('[data-item]'); if (!t) { hideTip(); return; }
    const it = sh().items.find(i => i.id === t.dataset.item); if (!it) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'cs-tip'; document.body.appendChild(tip); }
    tip.innerHTML = tipHTML(it);
    const r = t.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, r.right + 8) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, r.top)) + 'px';
  });
  host.addEventListener('mouseleave', hideTip);
  return () => hideTip();
}
