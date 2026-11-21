// Rules data for the character creator: classes, species, backgrounds, spell slots and starting gear (5e, 2014 rules).
// Homebrew classes made in the creator are stored on the world (world.classes) and work the same way.

const F = (obj) => Object.entries(obj).map(([l, t]) => [+l, t]);
export const CLASSES = {
  barbarian: { name: 'Barbarian', die: 12, saves: ['str', 'con'], armour: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], skillN: 2,
    skills: ['animal', 'athletics', 'intimidation', 'nature', 'perception', 'survival'], cast: '', unarmored: 'con',
    features: F({ 1: 'Rage, Unarmored Defense', 2: 'Reckless Attack, Danger Sense', 3: 'Primal Path', 4: 'Ability Score Improvement', 5: 'Extra Attack, Fast Movement', 6: 'Path feature', 7: 'Feral Instinct', 8: 'Ability Score Improvement', 9: 'Brutal Critical (1 die)', 10: 'Path feature', 11: 'Relentless Rage', 12: 'Ability Score Improvement', 13: 'Brutal Critical (2 dice)', 14: 'Path feature', 15: 'Persistent Rage', 16: 'Ability Score Improvement', 17: 'Brutal Critical (3 dice)', 18: 'Indomitable Might', 19: 'Ability Score Improvement', 20: 'Primal Champion' }),
    gear: ['greataxe', 'handaxe', 'handaxe'] },
  bard: { name: 'Bard', die: 8, saves: ['dex', 'cha'], armour: ['light'], weapons: ['simple'], skillN: 3, skills: 'any', cast: 'full', ability: 'cha', tools: 'Three musical instruments; hand crossbows, longswords, rapiers, shortswords',
    features: F({ 1: 'Spellcasting, Bardic Inspiration (d6)', 2: 'Jack of All Trades, Song of Rest (d6)', 3: 'Bard College, Expertise', 4: 'Ability Score Improvement', 5: 'Bardic Inspiration (d8), Font of Inspiration', 6: 'Countercharm, College feature', 8: 'Ability Score Improvement', 9: 'Song of Rest (d8)', 10: 'Bardic Inspiration (d10), Expertise, Magical Secrets', 12: 'Ability Score Improvement', 13: 'Song of Rest (d10)', 14: 'Magical Secrets, College feature', 15: 'Bardic Inspiration (d12)', 16: 'Ability Score Improvement', 17: 'Song of Rest (d12)', 18: 'Magical Secrets', 19: 'Ability Score Improvement', 20: 'Superior Inspiration' }),
    gear: ['rapier', 'leather', 'dagger', 'lute'] },
  cleric: { name: 'Cleric', die: 8, saves: ['wis', 'cha'], armour: ['light', 'medium', 'shield'], weapons: ['simple'], skillN: 2, skills: ['history', 'insight', 'medicine', 'persuasion', 'religion'], cast: 'full', ability: 'wis',
    features: F({ 1: 'Spellcasting, Divine Domain', 2: 'Channel Divinity (1/rest), Domain feature', 4: 'Ability Score Improvement', 5: 'Destroy Undead (CR 1/2)', 6: 'Channel Divinity (2/rest), Domain feature', 8: 'Ability Score Improvement, Destroy Undead (CR 1), Domain feature', 10: 'Divine Intervention', 11: 'Destroy Undead (CR 2)', 12: 'Ability Score Improvement', 14: 'Destroy Undead (CR 3)', 16: 'Ability Score Improvement', 17: 'Destroy Undead (CR 4), Domain feature', 18: 'Channel Divinity (3/rest)', 19: 'Ability Score Improvement', 20: 'Divine Intervention improvement' }),
    gear: ['mace', 'scale', 'shield', 'holysymbol'] },
  druid: { name: 'Druid', die: 8, saves: ['int', 'wis'], armour: ['light', 'medium', 'shield'], weapons: ['simple'], skillN: 2, skills: ['arcana', 'animal', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'], cast: 'full', ability: 'wis', tools: 'Herbalism kit; won’t wear metal armour or shields',
    features: F({ 1: 'Druidic, Spellcasting', 2: 'Wild Shape, Druid Circle', 4: 'Wild Shape improvement, Ability Score Improvement', 6: 'Circle feature', 8: 'Wild Shape improvement, Ability Score Improvement', 10: 'Circle feature', 12: 'Ability Score Improvement', 14: 'Circle feature', 16: 'Ability Score Improvement', 18: 'Timeless Body, Beast Spells', 19: 'Ability Score Improvement', 20: 'Archdruid' }),
    gear: ['scimitar', 'leather', 'woodshield', 'focusdruid'] },
  fighter: { name: 'Fighter', die: 10, saves: ['str', 'con'], armour: ['light', 'medium', 'heavy', 'shield'], weapons: ['simple', 'martial'], skillN: 2, skills: ['acrobatics', 'animal', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'], cast: '',
    features: F({ 1: 'Fighting Style, Second Wind', 2: 'Action Surge (one use)', 3: 'Martial Archetype', 4: 'Ability Score Improvement', 5: 'Extra Attack', 6: 'Ability Score Improvement', 7: 'Archetype feature', 8: 'Ability Score Improvement', 9: 'Indomitable (one use)', 10: 'Archetype feature', 11: 'Extra Attack (2)', 12: 'Ability Score Improvement', 13: 'Indomitable (two uses)', 14: 'Ability Score Improvement', 15: 'Archetype feature', 16: 'Ability Score Improvement', 17: 'Action Surge (two uses), Indomitable (three uses)', 18: 'Archetype feature', 19: 'Ability Score Improvement', 20: 'Extra Attack (3)' }),
    gear: ['chain', 'longsword', 'shield', 'lightcrossbow'] },
  monk: { name: 'Monk', die: 8, saves: ['str', 'dex'], armour: [], weapons: ['simple'], skillN: 2, skills: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'], cast: '', unarmored: 'wis', tools: 'One artisan’s tool or instrument; shortswords',
    features: F({ 1: 'Unarmored Defense, Martial Arts', 2: 'Ki, Unarmored Movement', 3: 'Monastic Tradition, Deflect Missiles', 4: 'Ability Score Improvement, Slow Fall', 5: 'Extra Attack, Stunning Strike', 6: 'Ki-Empowered Strikes, Tradition feature', 7: 'Evasion, Stillness of Mind', 8: 'Ability Score Improvement', 9: 'Unarmored Movement improvement', 10: 'Purity of Body', 11: 'Tradition feature', 12: 'Ability Score Improvement', 13: 'Tongue of the Sun and Moon', 14: 'Diamond Soul', 15: 'Timeless Body', 16: 'Ability Score Improvement', 17: 'Tradition feature', 18: 'Empty Body', 19: 'Ability Score Improvement', 20: 'Perfect Self' }),
    gear: ['shortsword', 'darts'] },
  paladin: { name: 'Paladin', die: 10, saves: ['wis', 'cha'], armour: ['light', 'medium', 'heavy', 'shield'], weapons: ['simple', 'martial'], skillN: 2, skills: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'], cast: 'half', ability: 'cha',
    features: F({ 1: 'Divine Sense, Lay on Hands', 2: 'Fighting Style, Spellcasting, Divine Smite', 3: 'Divine Health, Sacred Oath', 4: 'Ability Score Improvement', 5: 'Extra Attack', 6: 'Aura of Protection', 7: 'Oath feature', 8: 'Ability Score Improvement', 10: 'Aura of Courage', 11: 'Improved Divine Smite', 12: 'Ability Score Improvement', 14: 'Cleansing Touch', 15: 'Oath feature', 16: 'Ability Score Improvement', 18: 'Aura improvements', 19: 'Ability Score Improvement', 20: 'Oath feature' }),
    gear: ['chain', 'longsword', 'shield', 'javelins', 'holysymbol'] },
  ranger: { name: 'Ranger', die: 10, saves: ['str', 'dex'], armour: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], skillN: 3, skills: ['animal', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'], cast: 'half', ability: 'wis',
    features: F({ 1: 'Favored Enemy, Natural Explorer', 2: 'Fighting Style, Spellcasting', 3: 'Ranger Archetype, Primeval Awareness', 4: 'Ability Score Improvement', 5: 'Extra Attack', 6: 'Favored Enemy and Natural Explorer improvements', 7: 'Archetype feature', 8: 'Ability Score Improvement, Land’s Stride', 10: 'Natural Explorer improvement, Hide in Plain Sight', 11: 'Archetype feature', 12: 'Ability Score Improvement', 14: 'Favored Enemy improvement, Vanish', 15: 'Archetype feature', 16: 'Ability Score Improvement', 18: 'Feral Senses', 19: 'Ability Score Improvement', 20: 'Foe Slayer' }),
    gear: ['scale', 'shortsword', 'shortsword', 'longbow'] },
  rogue: { name: 'Rogue', die: 8, saves: ['dex', 'int'], armour: ['light'], weapons: ['simple'], skillN: 4, skills: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight', 'stealth'], cast: '', tools: 'Thieves’ tools; hand crossbows, longswords, rapiers, shortswords',
    features: F({ 1: 'Expertise, Sneak Attack, Thieves’ Cant', 2: 'Cunning Action', 3: 'Roguish Archetype', 4: 'Ability Score Improvement', 5: 'Uncanny Dodge', 6: 'Expertise', 7: 'Evasion', 8: 'Ability Score Improvement', 9: 'Archetype feature', 10: 'Ability Score Improvement', 11: 'Reliable Talent', 12: 'Ability Score Improvement', 13: 'Archetype feature', 14: 'Blindsense', 15: 'Slippery Mind', 16: 'Ability Score Improvement', 17: 'Archetype feature', 18: 'Elusive', 19: 'Ability Score Improvement', 20: 'Stroke of Luck' }),
    extra: L => `Sneak Attack: ${Math.ceil(L / 2)}d6`, gear: ['rapier', 'shortbow', 'leather', 'dagger', 'dagger', 'thievestools'] },
  sorcerer: { name: 'Sorcerer', die: 6, saves: ['con', 'cha'], armour: [], weapons: ['simple'], skillN: 2, skills: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'], cast: 'full', ability: 'cha', tools: 'Daggers, darts, slings, quarterstaffs, light crossbows',
    features: F({ 1: 'Spellcasting, Sorcerous Origin', 2: 'Font of Magic', 3: 'Metamagic', 4: 'Ability Score Improvement', 6: 'Origin feature', 8: 'Ability Score Improvement', 10: 'Metamagic', 12: 'Ability Score Improvement', 14: 'Origin feature', 16: 'Ability Score Improvement', 17: 'Metamagic', 18: 'Origin feature', 19: 'Ability Score Improvement', 20: 'Sorcerous Restoration' }),
    extra: L => L >= 2 ? `Sorcery points: ${L}` : '', gear: ['lightcrossbow', 'dagger', 'dagger', 'focusarcane'] },
  warlock: { name: 'Warlock', die: 8, saves: ['wis', 'cha'], armour: ['light'], weapons: ['simple'], skillN: 2, skills: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'], cast: 'pact', ability: 'cha',
    features: F({ 1: 'Otherworldly Patron, Pact Magic', 2: 'Eldritch Invocations', 3: 'Pact Boon', 4: 'Ability Score Improvement', 6: 'Patron feature', 8: 'Ability Score Improvement', 10: 'Patron feature', 11: 'Mystic Arcanum (6th level)', 12: 'Ability Score Improvement', 13: 'Mystic Arcanum (7th level)', 14: 'Patron feature', 15: 'Mystic Arcanum (8th level)', 16: 'Ability Score Improvement', 17: 'Mystic Arcanum (9th level)', 19: 'Ability Score Improvement', 20: 'Eldritch Master' }),
    gear: ['lightcrossbow', 'leather', 'dagger', 'dagger', 'focusarcane'] },
  wizard: { name: 'Wizard', die: 6, saves: ['int', 'wis'], armour: [], weapons: ['simple'], skillN: 2, skills: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'], cast: 'full', ability: 'int', tools: 'Daggers, darts, slings, quarterstaffs, light crossbows',
    features: F({ 1: 'Spellcasting, Arcane Recovery', 2: 'Arcane Tradition', 4: 'Ability Score Improvement', 6: 'Tradition feature', 8: 'Ability Score Improvement', 10: 'Tradition feature', 12: 'Ability Score Improvement', 14: 'Tradition feature', 16: 'Ability Score Improvement', 18: 'Spell Mastery', 19: 'Ability Score Improvement', 20: 'Signature Spells' }),
    gear: ['quarterstaff', 'spellbook', 'focusarcane'] },
  artificer: { name: 'Artificer', die: 8, saves: ['con', 'int'], armour: ['light', 'medium', 'shield'], weapons: ['simple'], skillN: 2, skills: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight'], cast: 'artificer', ability: 'int', tools: 'Thieves’ tools, tinker’s tools, one artisan’s tool',
    features: F({ 1: 'Magical Tinkering, Spellcasting', 2: 'Infuse Item', 3: 'Artificer Specialist, The Right Tool for the Job', 4: 'Ability Score Improvement', 6: 'Tool Expertise', 7: 'Flash of Genius', 8: 'Ability Score Improvement', 10: 'Magic Item Adept', 11: 'Spell-Storing Item', 12: 'Ability Score Improvement', 14: 'Magic Item Savant', 16: 'Ability Score Improvement', 18: 'Magic Item Master', 19: 'Ability Score Improvement', 20: 'Soul of Artifice' }),
    gear: ['lightcrossbow', 'studded', 'dagger', 'thievestools'] },
};
export const SPECIES = {
  human: { name: 'Human', speed: 30, bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, langs: 'Common, one more of your choice', traits: '' },
  elf: { name: 'Elf', speed: 30, bonus: { dex: 2 }, dark: 60, skills: ['perception'], langs: 'Common, Elvish', traits: 'Darkvision, Keen Senses, Fey Ancestry, Trance' },
  dwarf: { name: 'Dwarf', speed: 25, bonus: { con: 2 }, dark: 60, langs: 'Common, Dwarvish', resist: 'poison', traits: 'Darkvision, Dwarven Resilience, Stonecunning; heavy armour doesn’t slow you' },
  halfling: { name: 'Halfling', speed: 25, size: 'Small', bonus: { dex: 2 }, langs: 'Common, Halfling', traits: 'Lucky, Brave, Halfling Nimbleness' },
  dragonborn: { name: 'Dragonborn', speed: 30, bonus: { str: 2, cha: 1 }, langs: 'Common, Draconic', traits: 'Draconic Ancestry, Breath Weapon, damage resistance of your ancestry' },
  gnome: { name: 'Gnome', speed: 25, size: 'Small', bonus: { int: 2 }, dark: 60, langs: 'Common, Gnomish', traits: 'Darkvision, Gnome Cunning' },
  halfelf: { name: 'Half-Elf', speed: 30, bonus: { cha: 2 }, dark: 60, langs: 'Common, Elvish, one more', traits: 'Darkvision, Fey Ancestry, two skills and +1 to two abilities of your choice' },
  halforc: { name: 'Half-Orc', speed: 30, bonus: { str: 2, con: 1 }, dark: 60, skills: ['intimidation'], langs: 'Common, Orc', traits: 'Darkvision, Menacing, Relentless Endurance, Savage Attacks' },
  tiefling: { name: 'Tiefling', speed: 30, bonus: { cha: 2, int: 1 }, dark: 60, langs: 'Common, Infernal', resist: 'fire', traits: 'Darkvision, Hellish Resistance, Infernal Legacy' },
  custom: { name: 'Other / my own', speed: 30, bonus: {}, langs: '', traits: '' },
};
export const BACKGROUNDS = {
  acolyte: ['Acolyte', ['insight', 'religion']], charlatan: ['Charlatan', ['deception', 'sleight']], criminal: ['Criminal', ['deception', 'stealth']], entertainer: ['Entertainer', ['acrobatics', 'performance']],
  folkhero: ['Folk Hero', ['animal', 'survival']], guildartisan: ['Guild Artisan', ['insight', 'persuasion']], hermit: ['Hermit', ['medicine', 'religion']], noble: ['Noble', ['history', 'persuasion']],
  outlander: ['Outlander', ['athletics', 'survival']], sage: ['Sage', ['arcana', 'history']], sailor: ['Sailor', ['athletics', 'perception']], soldier: ['Soldier', ['athletics', 'intimidation']], urchin: ['Urchin', ['sleight', 'stealth']],
  custom: ['Other / my own', []],
};
// spell slots for a full caster at each level; half and third casters use this table at a lower level
const FULL = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
export const CAST_TYPES = { '': 'No spellcasting', full: 'Full caster (like a wizard)', half: 'Half caster (like a paladin)', third: 'Third caster (from level 3)', pact: 'Pact magic (like a warlock)', artificer: 'Half caster from level 1 (like an artificer)' };
export function slotsFor(cast, L) {
  if (cast === 'full') return FULL[L] || [];
  if (cast === 'half') return L >= 2 ? FULL[Math.ceil(L / 2)] : [];
  if (cast === 'artificer') return FULL[Math.ceil(L / 2)] || [];
  if (cast === 'third') return L >= 3 ? FULL[Math.ceil(L / 3)] : [];
  if (cast === 'pact') { const n = L === 1 ? 1 : L <= 10 ? 2 : L <= 16 ? 3 : 4, lvl = Math.min(5, Math.ceil(L / 2)); const out = []; out[lvl - 1] = n; return out; }
  return [];
}
// starting gear, in the sheet's item format (weights in lb, ranges in ft)
const W = (name, dmg, dmgType, o = {}) => ({ kind: 'weapon', name, dmg, dmgType, wcat: 'simple', ...o });
export const GEAR = {
  greataxe: W('Greataxe', '1d12', 'slashing', { wcat: 'martial', two: true, heavy: true, weight: 7, value: 30 }),
  handaxe: W('Handaxe', '1d6', 'slashing', { light: true, thrown: true, range: '20/60', weight: 2, value: 5 }),
  rapier: W('Rapier', '1d8', 'piercing', { wcat: 'martial', finesse: true, weight: 2, value: 25 }),
  dagger: W('Dagger', '1d4', 'piercing', { finesse: true, light: true, thrown: true, range: '20/60', weight: 1, value: 2 }),
  mace: W('Mace', '1d6', 'bludgeoning', { weight: 4, value: 5 }),
  scimitar: W('Scimitar', '1d6', 'slashing', { wcat: 'martial', finesse: true, light: true, weight: 3, value: 25 }),
  longsword: W('Longsword', '1d8', 'slashing', { wcat: 'martial', versatile: 10, weight: 3, value: 15 }),
  shortsword: W('Shortsword', '1d6', 'piercing', { wcat: 'martial', finesse: true, light: true, weight: 2, value: 10 }),
  quarterstaff: W('Quarterstaff', '1d6', 'bludgeoning', { versatile: 8, weight: 4, value: 0.2 }),
  lightcrossbow: W('Light crossbow', '1d8', 'piercing', { ranged: true, ammo: true, loading: true, two: true, range: '80/320', weight: 5, value: 25 }),
  shortbow: W('Shortbow', '1d6', 'piercing', { ranged: true, ammo: true, two: true, range: '80/320', weight: 2, value: 25 }),
  longbow: W('Longbow', '1d8', 'piercing', { wcat: 'martial', ranged: true, ammo: true, heavy: true, two: true, range: '150/600', weight: 2, value: 50 }),
  javelins: W('Javelin', '1d6', 'piercing', { thrown: true, range: '30/120', qty: 5, weight: 2, value: 0.5 }),
  darts: W('Dart', '1d4', 'piercing', { finesse: true, thrown: true, range: '20/60', qty: 10, weight: 0.25, value: 0.05 }),
  leather: { kind: 'armor', name: 'Leather armour', ac: 11, armorType: 'light', weight: 10, value: 10 },
  studded: { kind: 'armor', name: 'Studded leather', ac: 12, armorType: 'light', weight: 13, value: 45 },
  scale: { kind: 'armor', name: 'Scale mail', ac: 14, armorType: 'medium', weight: 45, value: 50 },
  chain: { kind: 'armor', name: 'Chain mail', ac: 16, armorType: 'heavy', weight: 55, value: 75 },
  shield: { kind: 'shield', name: 'Shield', ac: 2, weight: 6, value: 10 },
  woodshield: { kind: 'shield', name: 'Wooden shield', ac: 2, weight: 6, value: 10 },
  lute: { kind: 'tool', name: 'Lute', icon: '🪕', weight: 2, value: 35 },
  holysymbol: { kind: 'trinket', name: 'Holy symbol', icon: '🪬', weight: 1, value: 5 },
  focusdruid: { kind: 'trinket', name: 'Druidic focus', icon: '🌿', weight: 1, value: 1 },
  focusarcane: { kind: 'trinket', name: 'Arcane focus', icon: '🔮', weight: 1, value: 10 },
  spellbook: { kind: 'book', name: 'Spellbook', weight: 3, value: 50 },
  thievestools: { kind: 'tool', name: 'Thieves’ tools', icon: '🗝️', weight: 1, value: 25 },
};
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
