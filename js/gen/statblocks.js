// Stat blocks: loading the bestiary libraries, drawing classic stat blocks, turning any creature into a character sheet,
// and choosing a fitting NPC stat block for Story Forge characters.
import { esc } from '../util.js';
import { SRD_NPCS } from './srdNpcs.js';

export const LIBRARIES = {
  dnd5e: { label: 'D&D 5e', file: 'data/bestiary/dnd5e.json', credit: 'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).' },
  pf2e: { label: 'Pathfinder 2e', file: 'data/bestiary/pf2e.json', credit: 'Pathfinder creatures from Pathfinder Monster Core © 2024 Paizo Inc., used under the ORC License (https://paizo.com/orclicense). Pathfinder is a trademark of Paizo Inc.; Loreforge is not published, endorsed, or specifically approved by Paizo. Data prepared by the Foundry VTT pf2e project.' },
  mythos: { label: 'Mythos', file: 'data/bestiary/mythos.json', credit: 'Mythos creatures come from H. P. Lovecraft’s public-domain stories; their stat blocks were written for Loreforge (5e-compatible) and are not taken from any game.' },
};
const cache = {};
export function loadLibrary(key) {
  if (!cache[key]) cache[key] = fetch(LIBRARIES[key].file).then(r => r.json()).then(d => d.monsters.map(m => ({ ...m, sys: d.system, lib: key })));
  return cache[key];
}
export async function findMonster(ref) { const [lib, id] = String(ref || '').split(':'); if (!LIBRARIES[lib]) return null; return (await loadLibrary(lib)).find(m => m.id === id) || null; }
export const mod = s => Math.floor(((+s || 10) - 10) / 2);
const sg = n => (n >= 0 ? '+' : '−') + Math.abs(n);
export const crNum = cr => { const s = String(cr ?? ''); return s.includes('/') ? s.split('/')[0] / s.split('/')[1] : +s; };

// what the combat tracker needs from a library creature
export function combatBase(m) {
  if (m.sys === 'pf2e') return { name: m.name, bonus: m.per, dex: 10 + 2 * (m.abil.dex || 0), maxHp: m.hp, ac: m.ac, level: '', cr: '', pfLevel: m.level, speedFt: m.speed.walk || 25, bst: `${m.lib}:${m.id}` };
  return { name: m.name, bonus: mod(m.abil.dex), dex: m.abil.dex, maxHp: m.hp, hpRoll: m.hpRoll, ac: m.ac, cr: m.cr, speedFt: m.speed.walk ?? 30, bst: `${m.lib}:${m.id}` };
}

// ---------- the classic stat block ----------
const line = (label, v) => v ? `<div class="sb-line"><b>${label}</b> ${v}</div>` : '';
const speedText = (sp, unit) => Object.entries(sp || {}).map(([k, v]) => `${k === 'walk' ? '' : k + ' '}${unit(v)}`).join(', ');
export function statblockHTML(m, { unit = v => `${v} ft.`, rollable = true } = {}) {
  const roll = (expr, label, text) => rollable ? `<button class="sb-roll" data-roll="${esc(expr)}" data-label="${esc(label)}">${esc(text ?? expr)}</button>` : esc(text ?? expr);
  if (m.sys === 'pf2e') {
    const strikes = (m.strikes || []).map(s => `<div class="sb-act"><b>${s.ranged ? 'Ranged' : 'Melee'}</b> ${esc(s.n)} ${roll(`d20${s.hit >= 0 ? '+' : ''}${s.hit}`, `${m.name}: ${s.n}`, sg(s.hit))}${s.tr?.length ? ` <span class="sb-tr">(${esc(s.tr.join(', '))})</span>` : ''}, <b>Damage</b> ${s.dmg.map(x => `${roll(x.dice, `${m.name}: ${s.n} damage`)} ${esc(x.type)}`).join(' plus ')}</div>`).join('');
    const acts = (m.actions || []).map(a => `<div class="sb-act"><b>${esc(a.n)}</b>${a.a && a.a !== 'passive' ? ` <span class="sb-tr">[${a.cost ? a.cost + ' action' + (a.cost > 1 ? 's' : '') : a.a}]</span>` : ''} ${esc(a.d)}</div>`).join('');
    return `<div class="sb sb-pf"><div class="sb-head"><h3>${esc(m.name)}</h3><span class="sb-lvl">Creature ${m.level}</span></div>
      <div class="sb-tags">${[m.rarity !== 'common' && m.rarity, m.size, ...(m.traits || [])].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      ${line('Perception', `${roll(`d20${m.per >= 0 ? '+' : ''}${m.per}`, `${m.name}: Perception`, sg(m.per))}${m.senses ? '; ' + esc(m.senses) : ''}`)}
      ${line('Languages', esc(m.langs))}
      ${line('Skills', Object.entries(m.skills || {}).map(([k, v]) => `${esc(k)} ${roll(`d20${v >= 0 ? '+' : ''}${v}`, `${m.name}: ${k}`, sg(v))}`).join(', '))}
      ${line('', ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => `<b>${k[0].toUpperCase() + k.slice(1)}</b> ${sg(m.abil[k] || 0)}`).join(', '))}
      <hr>${line('AC', `${m.ac}${m.acNote ? ' ' + esc(m.acNote) : ''}; <b>Fort</b> ${roll(`d20+${m.saves.fortitude}`, `${m.name}: Fortitude`, sg(m.saves.fortitude))}, <b>Ref</b> ${roll(`d20+${m.saves.reflex}`, `${m.name}: Reflex`, sg(m.saves.reflex))}, <b>Will</b> ${roll(`d20+${m.saves.will}`, `${m.name}: Will`, sg(m.saves.will))}`)}
      ${line('HP', `${m.hp}${m.immune?.length ? `; <b>Immunities</b> ${esc(m.immune.join(', '))}` : ''}${m.resist?.length ? `; <b>Resistances</b> ${esc(m.resist.join(', '))}` : ''}${m.weak?.length ? `; <b>Weaknesses</b> ${esc(m.weak.join(', '))}` : ''}`)}
      <hr>${line('Speed', esc(speedText(m.speed, unit)))}${strikes}${acts}</div>`;
  }
  const ab = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const act = a => `<div class="sb-act"><b>${esc(a.n)}${a.use ? ` (${esc(a.use)})` : ''}.</b> ${esc(a.d)}${a.hit != null ? ` ${roll(`d20${a.hit >= 0 ? '+' : ''}${a.hit}`, `${m.name}: ${a.n}`, 'roll ' + sg(a.hit))}` : ''}${(a.dmg || []).map(x => ` ${roll(x.dice, `${m.name}: ${a.n} damage`, `${x.dice} ${x.type}`)}`).join('')}</div>`;
  const sec = (title, list) => list?.length ? `<h4>${title}</h4>${list.map(act).join('')}` : '';
  return `<div class="sb sb-5e"><h3>${esc(m.name)}</h3><div class="sb-sub">${esc(m.size)} ${esc(m.type)}, ${esc(m.align || 'unaligned')}</div><hr>
    ${line('Armor Class', `${m.ac}${m.acNote ? ` (${esc(m.acNote)})` : ''}`)}${line('Hit Points', `${m.hp}${m.hpRoll ? ` (${roll(m.hpRoll, `${m.name}: hit points`)})` : ''}`)}${line('Speed', esc(speedText(m.speed, unit)))}<hr>
    <div class="sb-abil">${ab.map(k => `<div><b>${k.toUpperCase()}</b>${roll(`d20${mod(m.abil[k]) >= 0 ? '+' : ''}${mod(m.abil[k])}`, `${m.name}: ${k.toUpperCase()}`, `${m.abil[k]} (${sg(mod(m.abil[k]))})`)}</div>`).join('')}</div><hr>
    ${line('Saving Throws', Object.entries(m.saves || {}).map(([k, v]) => `${k.toUpperCase()} ${roll(`d20+${v}`, `${m.name}: ${k.toUpperCase()} save`, sg(v))}`).join(', '))}
    ${line('Skills', Object.entries(m.skills || {}).map(([k, v]) => `${esc(k)} ${roll(`d20+${v}`, `${m.name}: ${k}`, sg(v))}`).join(', '))}
    ${line('Damage Vulnerabilities', esc((m.vuln || []).join(', ')))}${line('Damage Resistances', esc((m.resist || []).join(', ')))}${line('Damage Immunities', esc((m.immune || []).join(', ')))}${line('Condition Immunities', esc((m.condImmune || []).join(', ')))}
    ${line('Senses', esc(m.senses))}${line('Languages', esc(m.langs || '—'))}${line('Challenge', `${esc(m.cr)} (${(m.xp || 0).toLocaleString()} XP)`)}<hr>
    ${(m.traits || []).map(act).join('')}${sec('Actions', m.actions)}${sec('Reactions', m.reactions)}${sec('Legendary Actions', m.legendary)}${m.lore ? `<p class="sb-lore">${esc(m.lore)}</p>` : ''}</div>`;
}

// ---------- a creature as a character sheet (for the World Bible) ----------
const SKILL_KEYS = { 'Animal Handling': 'animal', 'Sleight of Hand': 'sleight' };
const PORTRAIT_BY_TYPE = t => /dragon/.test(t) ? 'dragon' : /undead/.test(t) ? 'undead' : /beast/.test(t) ? 'beast' : /fiend/.test(t) ? 'fiend' : /aberration|mythos/.test(t) ? 'aberration' : /elemental/.test(t) ? 'elemental' : '';
export function monsterToSheet(m, base = {}) {
  const sh = { ...base, theme: base.theme || 'hellforge', src: `${m.lib}:${m.id}` };
  sh.size = m.size; sh.speedFt = m.speed?.walk ?? 30;
  sh.hpMax = m.hp; sh.hp = ''; sh.acOverride = m.ac; sh.senses = m.senses || ''; sh.languages = m.langs || '';
  sh.resist = (m.resist || []).join(', '); sh.immune = (m.immune || []).join(', '); sh.vuln = (m.vuln || m.weak || []).join(', '); sh.condImmune = (m.condImmune || []).join(', ');
  const art = PORTRAIT_BY_TYPE(`${m.type || ''} ${(m.traits || []).join(' ')}`); if (art && !sh.portrait) sh.portrait = { art };
  if (m.sys === 'pf2e') {
    sh.abil = Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => [k, 10 + 2 * (m.abil[k] || 0)]));
    sh.ctype = (m.traits || []).join(', '); sh.cr = ''; sh.initBonus = m.per - (m.abil.dex || 0) || '';
    sh.attacks = (m.strikes || []).map(s => ({ name: s.n, hit: sg(s.hit), dmg: s.dmg.map(x => x.dice).join('+'), type: s.dmg.map(x => x.type).join(', ') }));
    sh.features = [`Pathfinder creature ${m.level} · Perception ${sg(m.per)} · Fort ${sg(m.saves.fortitude)}, Ref ${sg(m.saves.reflex)}, Will ${sg(m.saves.will)}`,
      Object.entries(m.skills || {}).length ? 'Skills: ' + Object.entries(m.skills).map(([k, v]) => `${k} ${sg(v)}`).join(', ') : '',
      ...(m.actions || []).map(a => `${a.n}${a.cost ? ` [${a.cost}]` : a.a && a.a !== 'passive' ? ` [${a.a}]` : ''}. ${a.d}`)].filter(Boolean).join('\n\n');
  } else {
    sh.abil = { ...m.abil }; sh.ctype = m.type; sh.cr = m.cr;
    sh.saves = Object.fromEntries(Object.keys(m.saves || {}).map(k => [k, true]));
    const pb = Math.max(2, 2 + Math.floor((Math.max(crNum(m.cr), 1) - 1) / 4));
    sh.skills = Object.fromEntries(Object.entries(m.skills || {}).map(([n, v]) => { const key = SKILL_KEYS[n] || n.toLowerCase(); const ab = { acrobatics: 'dex', stealth: 'dex', sleight: 'dex', athletics: 'str', arcana: 'int', history: 'int', investigation: 'int', nature: 'int', religion: 'int', deception: 'cha', intimidation: 'cha', performance: 'cha', persuasion: 'cha' }[key] || 'wis'; return [key, v - mod(m.abil[ab]) >= pb * 2 ? 2 : 1]; }));
    sh.attacks = (m.actions || []).filter(a => a.hit != null).map(a => ({ name: a.n, hit: sg(a.hit), dmg: (a.dmg || []).map(x => x.dice).join('+'), type: (a.dmg || []).map(x => x.type).join(', ') }));
    sh.features = [...(m.traits || []), ...(m.actions || []).filter(a => a.hit == null), ...(m.reactions || []).map(a => ({ ...a, n: `Reaction: ${a.n}` }))].map(a => `${a.n}${a.use ? ` (${a.use})` : ''}. ${a.d}`).join('\n\n');
    sh.legendary = (m.legendary || []).map(a => `${a.n}. ${a.d}`).join('\n');
    if (m.lore) sh.notes = m.lore;
  }
  return sh;
}

// ---------- stats for Story Forge characters ----------
// Each role climbs a ladder of the SRD's NPC stat blocks; the party's level picks the rung.
const LADDERS = {
  fighter: ['guard', 'tribal-warrior', 'thug', 'veteran', 'gladiator', 'knight'],
  rogue: ['bandit', 'scout', 'spy', 'bandit-captain', 'assassin'],
  caster: ['acolyte', 'cultist', 'priest', 'cult-fanatic', 'mage', 'archmage'],
  holy: ['acolyte', 'priest', 'cult-fanatic', 'priest', 'knight'],
  nature: ['tribal-warrior', 'scout', 'druid', 'berserker'],
  leader: ['noble', 'bandit-captain', 'knight', 'veteran', 'gladiator'],
  common: ['commoner', 'noble', 'guard', 'thug'],
  brute: ['thug', 'berserker', 'veteran', 'gladiator'],
};
const ROLE_WORDS = [
  ['caster', /\b(mage|wizard|sorcer|warlock|witch|arcan|spell|scholar|sage|alchemist|seer|oracle|necromancer)/],
  ['holy', /\b(priest|cleric|acolyte|monk|nun|temple|church|faith|paladin|templar|bishop|abbot)/],
  ['rogue', /\b(thief|rogue|spy|smuggl|assassin|cutpurse|pickpocket|bandit|pirate|scout|informant|fence|burglar)/],
  ['nature', /\b(druid|ranger|hunter|trapper|herbalist|forester|witch of the wood|tribal)/],
  ['leader', /\b(captain|lord|lady|noble|baron|duke|king|queen|commander|chief|mayor|leader|guildmaster|admiral)/],
  ['brute', /\b(brute|berserk|thug|enforcer|bouncer|pit fighter|barbarian)/],
  ['fighter', /\b(guard|soldier|knight|warrior|mercenary|sellsword|sentinel|watch|veteran|fighter|duelist|gladiator|sergeant)/],
  ['common', /\b(merchant|farmer|innkeeper|barkeep|shopkeeper|child|peasant|baker|smith|fisher|sailor|clerk|servant|townsfolk)/],
];
export function npcTemplate(text, partyLevel = 3) {
  const t = String(text || '').toLowerCase();
  const role = (ROLE_WORDS.find(([, re]) => re.test(t)) || ['fighter'])[0];
  const ladder = LADDERS[role];
  // aim for about the party's level, a little lower for minor folk
  const target = Math.max(0, (+partyLevel || 3) * (role === 'common' ? 0.3 : 0.75));
  const opts = ladder.map(id => SRD_NPCS.find(n => n.id === id)).filter(Boolean);
  const pick = opts.reduce((best, n) => Math.abs(crNum(n.cr) - target) < Math.abs(crNum(best.cr) - target) ? n : best, opts[0]);
  return { role, monster: { ...pick, sys: '5e', lib: 'dnd5e' } };
}
export const npcOptions = () => SRD_NPCS.map(n => ({ id: n.id, name: n.name, cr: n.cr }));
export const npcById = id => { const n = SRD_NPCS.find(x => x.id === id); return n && { ...n, sys: '5e', lib: 'dnd5e' }; };
