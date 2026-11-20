// Story Forge: builds context from the world, and an offline story engine that uses it.
import { W, TYPES, getEntry, mentionsIn } from '../store.js';
import { rng, randomSeed } from '../gen/core.js';
import { placeName } from '../gen/names.js';
import { plain } from '../util.js';

export const KINDS = {
  bounty: { label: 'Bounty', icon: '🎯', desc: 'A wanted target to hunt down' },
  quest: { label: 'Quest', icon: '🧭', desc: 'A mission with objectives' },
  rumours: { label: 'Rumours', icon: '👂', desc: 'Gossip and leads in a place' },
  npc: { label: 'NPC', icon: '🧙', desc: 'A character rooted in the setting' },
  encounter: { label: 'Encounter', icon: '⚔️', desc: 'A scene the party stumbles into' },
  custom: { label: 'Anything', icon: '✨', desc: 'Describe it (best with AI)' },
};
export const TONES = ['Heroic', 'Grim', 'Mysterious', 'Political', 'Comic'];

const isReligion = e => e && (/relig|faith|god|church|temple|cult|order|creed|worship|divine|deity|pantheon|saint/i.test(
  [e.name, e.summary, ...e.tags, ...e.fields.map(f => f.k + ' ' + f.v)].join(' ')));

// ---------------- context ----------------
export function gatherContext(locationId, tieIds = []) {
  const w = W();
  const loc = getEntry(locationId) || null;
  const ctx = { world: w, loc, ruler: null, places: [], people: [], factions: [], realm: null, ties: tieIds.map(getEntry).filter(Boolean) };
  if (loc) {
    for (const r of w.relations) {
      const other = getEntry(r.from === loc.id ? r.to : r.to === loc.id ? r.from : null);
      if (!other) continue;
      const lab = (r.label || '').toLowerCase();
      if (other.type === 'character' && /rule|govern|lord|lady|mayor|warden|king|queen/.test(lab)) ctx.ruler = other;
      else if (other.type === 'faction' && r.to === loc.id && /rule/.test(lab)) { ctx.realm = ctx.realm || other; ctx.factions.push(other); }
      else if (other.type === 'faction' && /part of/.test(lab) && r.from === loc.id) ctx.realm = other;
      else if (other.type === 'location' && r.to === loc.id && /located in|part of|in$/.test(lab)) ctx.places.push(other);
      else if (other.type === 'character') ctx.people.push(other);
      else if (other.type === 'faction') ctx.factions.push(other);
    }
    // entries that mention the location
    for (const e of w.entries) {
      if (e.id === loc.id || ctx.people.includes(e) || ctx.factions.includes(e) || ctx.places.includes(e) || e === ctx.ruler) continue;
      if (!mentionsIn(e.body + ' ' + e.summary + ' ' + e.fields.map(f => f.v).join(' ')).has(loc.id)) continue;
      if (e.type === 'character') ctx.people.push(e);
      else if (e.type === 'faction') ctx.factions.push(e);
      else if (e.type === 'location') ctx.places.push(e);
    }
    const rulerField = loc.fields.find(f => /ruler/i.test(f.k))?.v;
    if (!ctx.ruler && rulerField) { const id = [...mentionsIn(rulerField)][0]; if (getEntry(id)) ctx.ruler = getEntry(id); }
  }
  ctx.religions = [...ctx.ties, ...ctx.factions].filter(isReligion);
  return ctx;
}

const brief = (e, n = 240) => e ? `${e.name} [id:${e.id}] (${TYPES[e.type]?.label}) — ${plain(e.summary || e.body).slice(0, n)}` : '';
export function contextText(ctx) {
  const w = ctx.world;
  const L = [];
  L.push(`WORLD: ${w.name}. ${w.description || ''}`.trim());
  if (ctx.loc) {
    L.push(`\nSETTING (where this takes place): ${brief(ctx.loc, 500)}`);
    const f = ctx.loc.fields.filter(x => x.v).map(x => `${x.k}: ${plain(x.v)}`).join('; ');
    if (f) L.push(`Details: ${f}`);
    if (ctx.ruler) L.push(`Ruled by: ${brief(ctx.ruler)}`);
    if (ctx.realm) L.push(`Part of realm: ${brief(ctx.realm)}`);
    if (ctx.places.length) L.push(`Districts & landmarks: ${ctx.places.slice(0, 12).map(p => `${p.name} [id:${p.id}]`).join(', ')}`);
    if (ctx.people.length) L.push(`Notable people here:\n${ctx.people.slice(0, 8).map(p => '- ' + brief(p, 160)).join('\n')}`);
    if (ctx.factions.length) L.push(`Factions present:\n${ctx.factions.slice(0, 6).map(p => '- ' + brief(p, 160)).join('\n')}`);
  }
  if (ctx.ties.length) L.push(`\nMUST TIE INTO (factions / religions / lore the GM chose):\n${ctx.ties.map(t => '- ' + brief(t, 400)).join('\n')}`);
  const active = w.quests.filter(q => q.status === 'active').map(q => q.title);
  if (active.length) L.push(`\nCurrently active quests (avoid duplicating): ${active.join('; ')}`);
  const others = w.entries.filter(e => !ctx.people.includes(e) && e !== ctx.loc).slice(0, 40).map(e => `${e.name} [id:${e.id}] (${TYPES[e.type]?.label})`);
  if (others.length) L.push(`\nOther existing entries you may reference: ${others.join(', ')}`);
  return L.join('\n').slice(0, 9000);
}

// ---------------- AI prompt ----------------
export function aiPrompt(req, ctx) {
  const k = KINDS[req.kind] || KINDS.custom;
  const system = `You are a creative tabletop RPG game master's assistant inside a worldbuilding app. You write vivid, playable, original content that fits the GM's existing world. Always weave in the given setting, its people, and the factions/religions the GM chose to tie in. Reuse existing entries by their [id:...] when they fit instead of inventing duplicates. Reply with ONLY a JSON object, no prose before or after.`;
  const schema = `{
  "title": "short evocative title",
  "hook": "2-3 sentences the players hear (player-facing)",
  "summary": "GM-facing overview, 3-5 sentences",
  "giver": { "name": "who offers it", "id": "existing id or null", "description": "one line if new" },
  "target": { "name": "who/what is hunted or central (or null)", "id": "existing id or null", "type": "character|creature|item|location", "description": "2-3 sentences", "secret": "a GM-only truth" },
  "ties": [ { "name": "existing place/faction/religion", "id": "existing id or null", "detail": "how it connects" } ],
  "objectives": ["3-5 concrete steps"],
  "clues": ["2-4 clues the party can find"],
  "complications": ["1-3 things that make it harder"],
  "twist": "a GM-only twist",
  "reward": "fitting reward for the party level",
  "rumours": ["only for rumours: 4-6 rumours, otherwise []"],
  "new_entries": [ { "name": "", "type": "character|location|faction|item|creature|lore", "summary": "" } ]
}`;
  const user = `Create a ${k.label.toUpperCase()} for my game.
Request: ${req.text || '(no extra details — surprise me)'}
Tone: ${req.tone}. Party level: ${req.level}.

${contextText(gatherContext(req.location, req.ties))}

Return JSON exactly in this shape:
${schema}`;
  return { system, user };
}

export function parseAI(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('The AI did not return a story I could read. Try again.');
  const j = JSON.parse(text.slice(s, e + 1));
  const arr = x => Array.isArray(x) ? x.filter(Boolean).map(String) : x ? [String(x)] : [];
  const valid = id => id && getEntry(id) ? id : null;
  return {
    engine: 'ai', title: j.title || 'Untitled', hook: j.hook || '', summary: j.summary || '',
    giver: j.giver?.name ? { name: j.giver.name, id: valid(j.giver.id), description: j.giver.description || '' } : null,
    target: j.target?.name ? { name: j.target.name, id: valid(j.target.id), type: TYPES[j.target.type] ? j.target.type : 'character', description: j.target.description || '', secret: j.target.secret || '' } : null,
    ties: (j.ties || []).filter(t => t?.name).map(t => ({ name: t.name, id: valid(t.id), detail: t.detail || '' })),
    objectives: arr(j.objectives), clues: arr(j.clues), complications: arr(j.complications), rumours: arr(j.rumours),
    twist: j.twist || '', reward: j.reward || '',
    newEntries: (j.new_entries || []).filter(n => n?.name && !W().entries.some(e => e.name.toLowerCase() === n.name.toLowerCase())).map(n => ({ name: n.name, type: TYPES[n.type] ? n.type : 'lore', summary: n.summary || '' })),
  };
}

// ---------------- offline engine ----------------
const ARCH = [
  { k: /assassin|killer|murder|blade/, role: 'assassin', crime: ['murdered {victim} in cold blood', 'killed three guards and vanished', 'poisoned {victim} at a feast'], epithet: ['the Knife', 'Silent', 'Red-Hand'] },
  { k: /cult|zealot|heretic|occult|ritual/, role: 'cult leader', crime: ['performed forbidden rites beneath {spot}', 'kidnapped worshippers for a dark ritual', 'desecrated a holy shrine'], epithet: ['the Whisperer', 'the Pale', 'Ashtongue'] },
  { k: /thief|burglar|steal|heist|rob/, role: 'master thief', crime: ['stole {treasure} from {victim}', 'robbed the city treasury', 'emptied the vault of {victim}'], epithet: ['Quickfingers', 'the Cat', 'Ghost'] },
  { k: /smuggl|pirate|corsair|contraband/, role: 'smuggler captain', crime: ['ran poisoned cargo into the harbour', 'sank a navy cutter', 'smuggled weapons to rebels'], epithet: ['Saltjaw', 'the Eel', 'Black Tide'] },
  { k: /witch|necro|mage|sorcer|warlock|wizard/, role: 'rogue sorcerer', crime: ['raised the dead in {spot}', 'cursed {victim}', 'unleashed wild magic on the market'], epithet: ['the Grey', 'Bonecaller', 'Hexen'] },
  { k: /traitor|spy|defector|desert|turncoat/, role: 'traitor', crime: ['sold the city’s defences to its enemies', 'betrayed {victim} to their rivals', 'deserted with the garrison pay'], epithet: ['Two-Face', 'the Turncoat', 'Oathbreaker'] },
  { k: /noble|lord|lady|baron|count/, role: 'disgraced noble', crime: ['ordered the burning of a village', 'embezzled the grain stores', 'framed {victim} for treason'], epithet: ['the Gilded', 'Lord Ruin', 'the Fallen'] },
  { k: /bandit|raider|outlaw|brigand|highway/, role: 'bandit chief', crime: ['raided every caravan on the east road', 'held {victim} for ransom', 'burned the toll house'], epithet: ['Wolfjaw', 'Red Cap', 'the Butcher'] },
];
const BEASTS = { k: /beast|monster|creature|wolf|troll|drake|dragon|wyvern|ghoul|wyrm|spider|horror|werewolf|vampire|hag/, kinds: ['wyvern', 'troll', 'dire wolf', 'ghoul', 'giant spider', 'werewolf', 'hag', 'basilisk', 'owlbear', 'sea serpent'] };
const an = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
const FIRST = ['Varis', 'Mirelle', 'Corwin', 'Sable', 'Edric', 'Nyssa', 'Tobias', 'Rhosyn', 'Garrick', 'Isolde', 'Kael', 'Odessa', 'Brannoc', 'Liora', 'Osric', 'Vesper'];
const LAST = ['Thorne', 'Vane', 'Blackwood', 'Greaves', 'Marsh', 'Ashdown', 'Coldbrook', 'Duskmantle', 'Ravensworth', 'Whitlock'];
const GENERIC_SPOTS = ['the old sewers', 'the dockside warehouses', 'a shuttered temple', 'the thieves’ market', 'the abandoned watchtower', 'the catacombs', 'the tanneries', 'the river barges'];
const WILD_SPOTS = ['the hills outside town', 'the old quarry', 'the drowned forest', 'a ruined chapel on the moor', 'the caves above the river'];

export function offlineStory(req) {
  const r = rng(randomSeed());
  const ctx = gatherContext(req.location, req.ties);
  const text = (req.text || '').toLowerCase();
  const tone = req.tone || 'Heroic';
  const lvl = Math.max(1, Math.min(20, +req.level || 3));
  const where = ctx.loc?.name || placeName(r);
  const spots = [...ctx.places.map(p => p.name), ...r.shuffle(GENERIC_SPOTS.slice())].slice(0, 6);
  const religion = ctx.religions[0] || ctx.ties.find(isReligion) || null;
  const faction = ctx.ties.find(t => t.type === 'faction' && !isReligion(t)) || ctx.factions.find(f => !isReligion(f)) || null;
  const tie = ctx.ties[0] || faction || religion;
  // read the request for a victim and a hiding place
  const vWord = text.match(/\b(priest|priestess|bishop|monk|merchant|noble|lord|lady|guard|child|smith|captain|magistrate|innkeeper|sailor|scholar|healer|knight)s?\b/)?.[1];
  const sWord = text.match(/\b(docks?|harbou?r|port|sewers?|market|temple|shrine|slums?|graveyard|cemetery|castle|keep|tavern|inn|warehouses?|catacombs|crypts?|forest|woods|swamp|marsh|mines?|caves?|ruins|tower|library|arena)\b/)?.[1];
  if (sWord) {
    const match = ctx.places.find(p => p.name.toLowerCase().includes(sWord.replace(/s$/, '')) || plain(p.summary + ' ' + p.body).toLowerCase().includes(sWord));
    spots.unshift(match ? match.name : `the ${sWord}`);
    if (match) spots.splice(spots.lastIndexOf(match.name), spots.lastIndexOf(match.name) > 0 ? 1 : 0);
  }
  const victimPool = [...ctx.people.filter(p => p !== ctx.ruler), ctx.ruler].filter(Boolean);
  const victim = vWord ? (religion && /priest|bishop|monk/.test(vWord) ? `a ${vWord} of ${religion.name}` : `${an(vWord)} ${vWord} of ${where}`)
    : victimPool.length ? r.pick(victimPool).name : `${r.pick(['a merchant', 'a magistrate', 'a priest', 'a guild master'])} of ${where}`;
  const treasure = r.pick(['the Sunstone Chalice', 'a dragon-bone key', 'the city charter', 'a reliquary', 'the harbour master’s ledger', religion ? `the holy relic of ${religion.name}` : 'a jewelled crown']);
  const fill = s => s.replace('{victim}', victim).replace('{spot}', spots[0]).replace('{treasure}', treasure);

  // giver
  let giver = null;
  if (ctx.ruler && ctx.ruler.name !== victim && r.chance(0.6)) giver = { name: ctx.ruler.name, id: ctx.ruler.id };
  else if (religion && r.chance(0.5)) giver = { name: `High Priest ${r.pick(FIRST)} of ${religion.name}`, id: null, description: `A senior voice of ${religion.name} in ${where}.` };
  else if (faction) giver = { name: faction.fields.find(f => /leader/i.test(f.k))?.v ? plain(faction.fields.find(f => /leader/i.test(f.k)).v) : `${r.pick(FIRST)} ${r.pick(LAST)} of ${faction.name}`, id: null, description: `Speaks for ${faction.name}.` };
  else if (ctx.people.some(p => p.name !== victim)) { const p = r.pick(ctx.people.filter(x => x.name !== victim)); giver = { name: p.name, id: p.id }; }
  else giver = { name: `Captain ${r.pick(FIRST)} ${r.pick(LAST)} of the ${where} Watch`, id: null, description: `A tired watch captain with too few soldiers.` };
  if (giver.id) giver.name = getEntry(giver.id).name;

  // target
  const beast = BEASTS.k.test(text) || (req.kind === 'bounty' && !ARCH.some(a => a.k.test(text)) && r.chance(0.2));
  let arch = ARCH.find(a => a.k.test(text)) || r.pick(tone === 'Political' ? [ARCH[5], ARCH[6]] : tone === 'Mysterious' ? [ARCH[1], ARCH[4]] : tone === 'Grim' ? [ARCH[0], ARCH[1], ARCH[7]] : ARCH);
  let target;
  if (beast) {
    const kind = BEASTS.kinds.find(b => text.includes(b.split(' ').pop())) || r.pick(BEASTS.kinds);
    const lair = r.pick([...spots.slice(0, 2), ...WILD_SPOTS]);
    target = { type: 'creature', name: `The ${r.pick(['Ashen', 'Hollow', 'Red', 'Drowned', 'Grey', 'Howling', 'Old'])} ${kind[0].toUpperCase() + kind.slice(1)} of ${lair.replace(/^the /, '').replace(/^\w/, c => c.toUpperCase())}`,
      description: `A ${kind} that has made its lair in ${lair}, preying on anyone who comes near ${where}.`, lair,
      crime: r.pick([`has killed ${r.int(3, 9)} people`, `drags livestock and children into the dark`, `has cut ${where} off from its trade road`]),
      secret: religion ? `It was summoned — or cursed into being — by someone within ${religion.name}.` : faction ? `${faction.name} has been feeding it on purpose.` : `It is guarding something far older than itself.` };
  } else {
    const nm = `${r.pick(FIRST)} ${r.pick(LAST)}`;
    const member = tie && r.chance(0.65);
    const roleText = member ? (isReligion(tie) ? `${arch.role}, once sworn to ${tie.name}` : `${arch.role} of ${tie.name}`) : arch.role;
    target = { type: 'character', name: `${nm} “${r.pick(arch.epithet)}”`, role: roleText, crime: fill(r.pick(arch.crime)), memberOf: member ? tie : null,
      description: `${an(roleText)[0].toUpperCase() + an(roleText).slice(1)} ${roleText} who ${fill(r.pick(arch.crime))}. Last seen near ${spots[0]} in ${where}.`,
      secret: r.pick([`${victim} is not as innocent as they seem.`, `They are blackmailing someone powerful in ${where}.`, member ? `${tie.name} quietly ordered the crime.` : `They are trying to stop something worse.`, `They are the estranged child of ${ctx.ruler?.name || 'the city’s ruler'}.`]) };
  }

  const gp = Math.round((lvl * lvl * 30 + r.int(50, 200)) / 10) * 10;
  const perk = r.pick([faction ? `the favour of ${faction.name}` : 'a writ of free passage', religion ? `a blessing from ${religion.name}` : 'a minor magic item', `a pardon for one crime in ${where}`, ctx.realm ? `land in ${ctx.realm.name}` : 'a title from the city']);
  const reward = `${gp} gp${req.kind === 'bounty' ? ' (double if taken alive)' : ''} and ${perk}`;

  const toneWord = { Heroic: 'bold', Grim: 'brutal', Mysterious: 'strange', Political: 'delicate', Comic: 'ridiculous' }[tone];
  const complications = r.shuffle([
    faction ? `${faction.name} wants ${target.name} for themselves — and will pay more.` : `A rival band of hunters is after the same target.`,
    religion ? `${religion.name} forbids bloodshed on holy ground, and the trail leads into a temple.` : `The trail crosses into territory no guard will enter.`,
    ctx.ruler ? `${ctx.ruler.name} insists the matter stays quiet — no public arrests.` : `The local watch is bribed to look away.`,
    `A storm (or festival) floods ${where} with crowds at the worst moment.`,
    tone === 'Comic' ? `The target has a devoted pet goat that follows the party everywhere.` : `An innocent will die if the party moves too slowly.`,
  ]).slice(0, 2);
  const witness = ctx.people.filter(p => p !== ctx.ruler)[0];
  const clues = r.shuffle([
    `${witness ? witness.name : 'A street urchin'} saw ${target.type === 'creature' ? 'tracks the size of shields' : 'the target'} near ${spots[1] || spots[0]}.`,
    `A torn ${r.pick(['cloak', 'letter', 'map', 'holy symbol', 'ledger page'])} bearing the mark of ${tie ? tie.name : 'an unknown sigil'}.`,
    `${r.pick(['Fresh blood', 'Strange ash', 'Wax drippings', 'Salt crystals'])} leading toward ${spots[2] || spots[0]}.`,
    `A barkeep remembers ${target.type === 'creature' ? 'a hunter who came back raving' : 'a stranger paying in old coin'}.`,
  ]).slice(0, 3);
  const twist = r.pick([
    `${target.name} is innocent — framed by ${faction ? faction.name : giver.name}.`,
    `${giver.name} hired ${target.name} in the first place and wants loose ends tied.`,
    religion ? `${religion.name} needs the target alive for a prophecy.` : `The target carries a secret that could topple ${where}.`,
    `The whole affair is bait to lure the party into ${spots[0]}.`,
    target.secret,
  ]);
  const ties = [
    ctx.loc && { name: ctx.loc.name, id: ctx.loc.id, detail: `Where it all takes place.` },
    ctx.ruler && { name: ctx.ruler.name, id: ctx.ruler.id, detail: `Rules ${where}.` },
    ...ctx.ties.map(t => ({ name: t.name, id: t.id, detail: isReligion(t) ? `The faith at the heart of it.` : `Has a stake in the outcome.` })),
    ...ctx.places.slice(0, 2).map(p => ({ name: p.name, id: p.id, detail: `A place the trail leads.` })),
  ].filter(Boolean).filter((t, i, a) => a.findIndex(x => x.id === t.id) === i);

  const out = { engine: 'offline', giver, target, ties, reward, complications, clues, twist, rumours: [], newEntries: [], objectives: [] };
  const crimeLine = target.crime;
  if (req.kind === 'bounty') {
    out.title = `Wanted: ${target.name}`;
    out.hook = `A notice nailed up across ${where}: WANTED — ${target.name}, who ${crimeLine}. ${giver.name} offers ${reward}. Enquire in person.`;
    out.summary = `${giver.name} wants ${target.name} brought to justice. ${target.description} The hunt leads through ${spots.slice(0, 3).join(', ')}. It’s a ${toneWord} job${tie ? `, tangled up with ${tie.name}` : ''}.`;
    out.objectives = [`Speak with ${giver.name} about the bounty`, `Find leads in ${spots[1] || spots[0]}`, `Track ${target.name} to ${target.lair || spots[2] || spots[0]}`, `Capture or kill ${target.name}`, `Bring proof back to ${giver.name}`];
  } else if (req.kind === 'quest') {
    const goal = r.pick([`recover ${treasure}`, `escort ${witness ? witness.name : 'a key witness'} safely out of ${where}`, `uncover who is behind ${target.crime ? 'the crimes in ' + where : 'the attacks'}`, `stop ${target.name} before the next new moon`]);
    out.title = r.pick([`The ${treasure.replace(/^(the|a|an) /i, '').replace(/^\w/, c => c.toUpperCase())}`, `Shadows over ${where}`, `A Debt to ${giver.name.split(' ')[0]}`, `The ${where} Affair`]);
    out.hook = `${giver.name} needs capable hands to ${goal}. ${religion ? `The faithful of ${religion.name} are watching closely. ` : ''}The pay is ${reward}.`;
    out.summary = `The party must ${goal}. ${target.description} ${tie ? `${tie.name} is involved more deeply than anyone admits.` : ''}`;
    out.objectives = [`Meet ${giver.name}`, `Investigate ${spots[0]}`, `Confront ${target.name}`, `Resolve the matter: ${goal}`];
  } else if (req.kind === 'rumours') {
    out.title = `Rumours in ${where}`;
    out.hook = `What people are whispering in ${where} this week.`;
    out.summary = `Leads the party can pick up in taverns and markets.`;
    out.rumours = r.shuffle([
      `They say ${target.name} has been seen near ${spots[0]} after dark.`,
      ctx.ruler ? `${ctx.ruler.name} hasn’t been seen in public for nine days.` : `The city council meets in secret every night.`,
      religion ? `The bells of ${religion.name} rang on their own at midnight.` : `The old temple bells rang on their own at midnight.`,
      faction ? `${faction.name} is buying up every boat in the harbour.` : `Someone is buying up every boat in the harbour.`,
      `${witness ? witness.name : 'A merchant'} owes money to the wrong people.`,
      `There’s a tunnel under ${spots[1] || spots[0]} that leads outside the walls.`,
      `A stranger is offering gold for maps of ${spots[2] || spots[0]}.`,
    ]).slice(0, 5);
    out.target = null; out.objectives = []; out.reward = '';
  } else if (req.kind === 'npc') {
    out.title = target.name;
    out.hook = `${target.name} — ${target.description}`;
    out.summary = target.description;
    out.giver = null; out.objectives = []; out.reward = '';
  } else {
    out.title = r.pick([`Trouble at ${spots[0]}`, `Ambush in ${where}`, `A ${toneWord} night in ${where}`]);
    out.hook = `As the party passes ${spots[0]}, ${target.type === 'creature' ? `${target.name} bursts from the shadows` : `${target.name} and ${r.int(2, 5)} thugs block the way`}${tie ? `, wearing the colours of ${tie.name}` : ''}.`;
    out.summary = `A ${toneWord} scene in ${where}. ${target.description}`;
    out.objectives = ['Survive the first round', `Discover why ${target.name} is here`, `Decide: fight, talk, or flee into ${spots[1] || 'the crowd'}`];
    out.giver = null;
  }
  return out;
}
