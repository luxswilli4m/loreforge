// Quick table-side generators. Each returns { title, lines: [[label, text]], entry?: {type, name, summary, fields, body} }
import { rng, randomSeed } from '../gen/core.js';
import { placeName } from '../gen/names.js';

const FIRST = {
  any: ['Aldric', 'Bryn', 'Cassia', 'Dorian', 'Elowen', 'Fenwick', 'Garrick', 'Hesper', 'Isolde', 'Jory', 'Kestrel', 'Lysander', 'Maren', 'Nyx', 'Orrin', 'Perrin',
    'Quill', 'Rowan', 'Sable', 'Tamsin', 'Ulric', 'Vesper', 'Wren', 'Ysolde', 'Zarek', 'Ansel', 'Briar', 'Corwin', 'Delphine', 'Edric', 'Faye', 'Gideon', 'Halden',
    'Ivy', 'Jasper', 'Kaelen', 'Liora', 'Magnus', 'Nerys', 'Osric', 'Pell', 'Rhosyn', 'Silas', 'Thea', 'Varek', 'Willa', 'Brannoc', 'Mirelle', 'Tobias', 'Odessa'],
};
const LAST = ['Ashdown', 'Blackwood', 'Cray', 'Dunmore', 'Everhart', 'Fairweather', 'Greaves', 'Hollow', 'Ironside', 'Kettle', 'Lark', 'Marsh', 'Northcott', 'Oakes',
  'Penhallow', 'Quarry', 'Ravensworth', 'Stone', 'Thorne', 'Underhill', 'Vane', 'Whitlock', 'Yarrow', 'Brightwater', 'Coldbrook', 'Duskmantle', 'Emberly', 'Fenn'];
const RACES = ['Human', 'Human', 'Human', 'Elf', 'Half-elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-orc', 'Tiefling', 'Dragonborn', 'Goliath'];
const JOBS = ['blacksmith', 'innkeeper', 'smuggler', 'priest', 'guard captain', 'merchant', 'scholar', 'hunter', 'fisher', 'herbalist', 'bard', 'thief', 'noble',
  'farmer', 'cartographer', 'alchemist', 'sailor', 'gravedigger', 'stablehand', 'scribe', 'mercenary', 'tax collector', 'fortune teller', 'shipwright'];
const TRAITS = ['nervous and talks too fast', 'warm but nosy', 'gruff with a soft heart', 'endlessly curious', 'suspicious of outsiders', 'cheerfully dishonest',
  'proud to a fault', 'deeply superstitious', 'exhausted and short-tempered', 'flirtatious', 'pious and earnest', 'dry, sarcastic wit', 'secretive', 'boastful',
  'kind to animals, cold to people', 'overly formal', 'easily bribed', 'haunted by the past'];
const QUIRKS = ['hums constantly', 'never makes eye contact', 'collects teeth', 'speaks of themself in the third person', 'always eating', 'missing two fingers',
  'has a pet rat on their shoulder', 'quotes scripture badly', 'smells of smoke', 'laughs at the wrong moments', 'wears too much jewellery', 'whispers everything',
  'has a booming voice', 'taps the table when lying', 'cannot read', 'is wanted in another city'];
const WANTS = ['to pay off a crushing debt', 'revenge on a former partner', 'to find a missing sibling', 'to be left alone', 'to get out of this town', 'fame',
  'a cure for a sick child', 'to protect a secret', 'to win back a lost love', 'to prove themself to their family', 'to steal something specific', 'to join the party'];
const SECRETS = ['is a spy for a rival faction', 'murdered someone years ago', 'is secretly nobility', 'owes money to the thieves’ guild', 'is cursed',
  'knows where a treasure is buried', 'is not who they claim to be', 'is in love with the local villain', 'has a forbidden magical gift', 'is dying'];

export function npc() {
  const r = rng(randomSeed());
  const name = `${r.pick(FIRST.any)} ${r.pick(LAST)}`, race = r.pick(RACES), job = r.pick(JOBS);
  const lines = [['Race', race], ['Occupation', job], ['Personality', r.pick(TRAITS)], ['Quirk', r.pick(QUIRKS)], ['Wants', r.pick(WANTS)], ['Secret', r.pick(SECRETS)]];
  return { title: name, lines, entry: { type: 'character', name, summary: `A ${race.toLowerCase()} ${job}, ${lines[2][1]}.`, fields: { Race: race, Role: job }, body: `**Quirk:** ${lines[3][1]}\n\n**Wants:** ${lines[4][1]}`, secret: lines[5][1] } };
}

const TAV_A = ['Prancing', 'Drunken', 'Rusty', 'Golden', 'Sleeping', 'Laughing', 'Crooked', 'Salty', 'Silver', 'Wandering', 'Howling', 'Gilded', 'Leaky', 'Merry', 'Black', 'One-Eyed'];
const TAV_B = ['Pony', 'Dragon', 'Tankard', 'Goose', 'Griffin', 'Barrel', 'Mermaid', 'Anchor', 'Stag', 'Lantern', 'Wyvern', 'Boar', 'Kraken', 'Fiddle', 'Owl', 'Shield'];
export function tavern() {
  const r = rng(randomSeed());
  const name = `The ${r.pick(TAV_A)} ${r.pick(TAV_B)}`;
  const lines = [
    ['Atmosphere', r.pick(['smoky and loud', 'quiet and candlelit', 'rowdy, with a brawl brewing', 'cosy, a fire roaring', 'shady — every table whispers', 'packed with sailors', 'elegant but tired'])],
    ['Owner', `${r.pick(FIRST.any)} ${r.pick(LAST)}, ${r.pick(TRAITS)}`],
    ['Speciality', r.pick(['spiced honey mead', 'eel pie', 'black ale that stains the teeth', 'roast boar', 'mushroom stew', 'dwarven firewater', 'fish so fresh it’s still twitching'])],
    ['Rumour', r.pick(['the mayor’s been replaced by a doppelganger', 'something big lives under the docks', 'a caravan vanished on the north road', 'the old temple bells rang at midnight', 'there’s gold in the abandoned mine', 'a famous thief is in town'])],
    ['Room', `${r.int(2, 9)} sp a night — ${r.pick(['fleas included', 'clean sheets', 'shared with a snoring stranger', 'with a lock that works', 'above the noisy common room'])}`],
  ];
  return { title: name, lines, entry: { type: 'location', name, summary: `A tavern — ${lines[0][1]}.`, fields: { Kind: 'Tavern' }, body: lines.map(([k, v]) => `**${k}:** ${v}`).join('\n\n') } };
}

export function loot() {
  const r = rng(randomSeed());
  const coins = `${r.int(2, 60)} gp, ${r.int(5, 90)} sp`;
  const items = r.shuffle(['a silver locket with a stranger’s portrait', 'a potion of healing', 'a map fragment', 'a jewelled dagger (50 gp)', 'a sealed letter',
    'a scroll of a random spell', 'a pouch of rare spices', 'an ivory chess piece', 'a +1 weapon', 'a bag of tarnished rings', 'a key to an unknown lock',
    'a vial of glowing ink', 'a minor magic trinket', 'a gemstone (100 gp)', 'a holy symbol of a forgotten god', 'a well-made cloak']).slice(0, r.int(1, 3));
  return { title: 'Treasure', lines: [['Coins', coins], ['Items', items.join('; ')]] };
}

export function weather() {
  const r = rng(randomSeed());
  return { title: 'Today’s weather', lines: [
    ['Sky', r.pick(['clear and bright', 'overcast', 'thick fog until noon', 'drizzle', 'heavy rain', 'thunderstorm in the afternoon', 'light snow', 'blustery and grey'])],
    ['Temperature', r.pick(['freezing', 'cold', 'cool', 'mild', 'warm', 'hot', 'sweltering'])],
    ['Wind', r.pick(['still', 'a light breeze', 'gusty', 'strong winds', 'a howling gale'])],
    ['Effect', r.pick(['none', 'travel is slowed', 'perception checks at disadvantage beyond 60 ft', 'fires are hard to light', 'tracks are easy to follow', 'rivers are swollen'])],
  ] };
}

export function hook() {
  const r = rng(randomSeed());
  const who = r.pick(['A desperate widow', 'A dying knight', 'A child', 'A masked noble', 'A talking raven', 'The local priest', 'A rival adventurer', 'A merchant guild']);
  const what = r.pick(['begs the party to find', 'hires the party to steal', 'warns the party about', 'offers a fortune for', 'needs an escort to', 'accuses the party of taking']);
  const obj = r.pick(['a cursed crown', 'their missing brother', 'the lighthouse on the cliffs', 'a stolen relic', 'the ruins beneath the city', 'a dragon’s egg', 'a forbidden book', 'the old smugglers’ caves']);
  const twist = r.pick(['but they are lying about why', 'but someone else wants it too', 'and the reward is fake', 'but it’s a trap', 'and time is running out', 'but the villain is a friend']);
  return { title: 'Plot hook', lines: [['Hook', `${who} ${what} ${obj}…`], ['Twist', twist]] };
}

export function names() {
  const r = rng(randomSeed());
  return { title: 'Names', lines: [
    ['People', Array.from({ length: 5 }, () => `${r.pick(FIRST.any)} ${r.pick(LAST)}`).join(', ')],
    ['Places', Array.from({ length: 5 }, () => placeName(r)).join(', ')],
    ['Taverns', Array.from({ length: 3 }, () => `The ${r.pick(TAV_A)} ${r.pick(TAV_B)}`).join(', ')],
  ] };
}

// a single suggested name for a new entry of the given type
export function suggestName(type) {
  const r = rng(randomSeed());
  switch (type) {
    case 'character': return `${r.pick(FIRST.any)} ${r.pick(LAST)}`;
    case 'location': return r.chance(0.3) ? `The ${r.pick(TAV_A)} ${r.pick(TAV_B)}` : placeName(r);
    case 'faction': return r.pick(['The ', '']) + r.pick(['Order of the', 'Brotherhood of the', 'Circle of the', 'House', 'Guild of the', 'Children of the']) + ' ' + r.pick(['Ashen Rose', 'Silver Hand', 'Drowned Moon', 'Iron Key', 'Black Lantern', 'Seventh Star', 'Thorn', 'Gilded Crow']);
    case 'item': return r.pick(['Blade', 'Crown', 'Amulet', 'Tome', 'Ring', 'Horn', 'Lantern', 'Mask', 'Chalice']) + ' of ' + r.pick(['Whispers', 'the Deep', 'Embers', 'Sorrow', 'the First King', 'Storms', 'Ashes', 'Dawn']);
    case 'creature': return r.pick(['Gloom', 'Thorn', 'Bog', 'Frost', 'Ash', 'Shadow', 'Bone', 'Mire', 'Storm']) + r.pick(['stalker', 'wyrm', 'hound', 'crawler', 'maw', 'wing', 'back', 'fiend']);
    default: return r.pick(['The ', '']) + r.pick(['Prophecy', 'Legend', 'War', 'Fall', 'Song', 'Pact', 'Curse']) + ' of ' + placeName(r);
  }
}

export const GENERATORS = { npc: ['🧙', 'NPC', npc], tavern: ['🍺', 'Tavern', tavern], loot: ['💰', 'Loot', loot], weather: ['🌦️', 'Weather', weather], hook: ['🪝', 'Plot hook', hook], names: ['🏷️', 'Names', names] };
