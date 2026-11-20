// A small demo world so new users can see every feature working together.
function mapSVG() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <radialGradient id="sea" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#2c4a5e"/><stop offset="1" stop-color="#16283a"/></radialGradient>
    <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 15 q15 -8 30 0 t30 0" fill="none" stroke="#3d6178" stroke-width="1.2" opacity=".5"/></pattern>
    <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdb98a"/><stop offset="1" stop-color="#a8935f"/></linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#sea)"/><rect width="1600" height="1000" fill="url(#waves)"/>
  <path d="M230 260 C330 140 560 120 700 170 C820 210 900 150 1040 160 C1210 170 1330 260 1350 380 C1370 480 1300 540 1320 640 C1340 760 1210 850 1060 830 C930 815 860 880 720 860 C560 840 470 780 380 790 C250 800 170 700 190 590 C205 500 150 420 180 350 Z" fill="url(#land)" stroke="#5b4a2a" stroke-width="5"/>
  <path d="M1420 180 C1480 160 1540 210 1520 270 C1500 330 1430 320 1410 270 C1395 230 1395 195 1420 180 Z" fill="url(#land)" stroke="#5b4a2a" stroke-width="4"/>
  <g fill="#7d8f5a" opacity=".85">
    <ellipse cx="420" cy="430" rx="130" ry="80"/><ellipse cx="520" cy="500" rx="90" ry="60"/><ellipse cx="360" cy="520" rx="70" ry="50"/>
  </g>
  <g fill="#6b5a3a" stroke="#3e321e" stroke-width="3">
    <path d="M820 330 l40 -80 l40 80 z"/><path d="M880 360 l50 -100 l50 100 z"/><path d="M950 330 l38 -75 l38 75 z"/><path d="M1010 370 l45 -90 l45 90 z"/><path d="M780 380 l35 -70 l35 70 z"/>
  </g>
  <g fill="#fff" opacity=".8"><path d="M880 360 l50 -100 l12 24 l-24 8 z" /><path d="M1010 370 l45 -90 l10 20 l-20 8 z"/></g>
  <path d="M700 300 C690 420 760 520 720 640 C700 700 740 780 720 860" fill="none" stroke="#3d6c8c" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="1080" cy="600" rx="80" ry="45" fill="#3d6c8c" stroke="#5b4a2a" stroke-width="3"/>
  <g stroke="#7a6136" stroke-width="3" stroke-dasharray="10 8" fill="none" opacity=".8"><path d="M720 640 C820 620 900 610 1000 600"/><path d="M720 640 C620 600 520 520 430 470"/></g>
  <g font-family="Georgia,serif" fill="#3e321e" font-style="italic" text-anchor="middle">
    <text x="900" y="230" font-size="30" letter-spacing="6">THE GREYSPINE</text>
    <text x="440" y="400" font-size="26" letter-spacing="4">Whisperwood</text>
  </g>
  <g font-family="Georgia,serif" fill="#a9c3d3" font-style="italic" text-anchor="middle" font-size="34" letter-spacing="8"><text x="800" y="960">THE SHATTERED SEA</text></g>
  <g transform="translate(1440 860)"><circle r="60" fill="none" stroke="#a9c3d3" stroke-width="2"/><path d="M0 -70 L10 0 L0 70 L-10 0 Z" fill="#a9c3d3"/><text y="-78" text-anchor="middle" fill="#a9c3d3" font-family="Georgia" font-size="20">N</text></g>
  <g transform="translate(80 930)" font-family="Georgia,serif" fill="#a9c3d3" font-size="18"><rect width="200" height="8" fill="#a9c3d3"/><rect width="100" height="8" fill="#16283a"/><text y="-8">0</text><text x="200" y="-8" text-anchor="middle">100 miles</text></g>
</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

export function sampleWorld() {
  const e = (id, type, name, summary, body, fields = [], tags = [], secret = '') =>
    ({ id, type, name, summary, body, secret, tags, image: '', fields, created: Date.now(), updated: Date.now() });
  const f = o => Object.entries(o).map(([k, v]) => ({ k, v }));
  return {
    name: 'Vael',
    description: 'A storm-wracked land where the old Ember Kings are gone, and a drowned crown waits beneath the Shattered Sea.',
    entries: [
      e('mira', 'character', 'Captain Mira Vex', 'A smuggler-captain who knows every hidden cove of the Shattered Sea.',
        'Mira commands the *Gull’s Lament* out of @[Saltmere](saltmere). She owes a dangerous debt to the @[Ashen Hand](ashen) and quietly searches for the @[Drowned Crown](crown).\n\n## Personality\n- Dry humour, never raises her voice\n- Fiercely loyal to her crew\n\n> “The sea keeps every secret. I just know where it hides them.”',
        f({ Race: 'Human', Role: 'Smuggler captain', Age: '38', Alignment: 'Chaotic good', Status: 'Alive' }), ['npc', 'ally'],
        'Mira is the last living heir of the Ember Kings — she doesn’t know it yet.'),
      e('oren', 'character', 'High Warden Oren Thale', 'The iron-willed ruler of Saltmere.',
        'Oren governs @[Saltmere](saltmere) from the Tidewatch keep. He publicly hunts the @[Ashen Hand](ashen) while privately taking their bribes.',
        f({ Race: 'Human', Role: 'Ruler of Saltmere', Age: '61', Status: 'Alive' }), ['npc', 'villain'], 'Secretly a member of the Ashen Hand’s inner circle.'),
      e('sela', 'character', 'Sela of the Thorn', 'A druid who speaks for Whisperwood.',
        'Sela tends the @[Whisperwood](whisper) and distrusts anyone from @[Saltmere](saltmere). She once sailed with @[Captain Mira Vex](mira).',
        f({ Race: 'Half-elf', Role: 'Druid', Age: '112', Status: 'Alive' }), ['npc']),
      e('saltmere', 'location', 'Saltmere', 'A rain-soaked port city built on the bones of an older one.',
        'The largest port on the coast. Ruled by @[High Warden Oren Thale](oren). Its lower docks are thick with smugglers and spies of the @[Ashen Hand](ashen).\n\n## Districts\n- **Tidewatch** — the keep and noble houses\n- **The Sump** — flooded lower streets\n- **Lantern Row** — markets and taverns',
        f({ Kind: 'Port city', Population: '24,000', Ruler: '@[High Warden Oren Thale](oren)', Climate: 'Wet, stormy' }), ['city']),
      e('whisper', 'location', 'Whisperwood', 'An ancient forest where the trees remember.',
        'A vast old-growth forest west of @[Saltmere](saltmere), watched over by @[Sela of the Thorn](sela). @[Thornbacks](thornback) roam its depths.',
        f({ Kind: 'Forest', Climate: 'Temperate' }), ['wilderness']),
      e('greyspine', 'location', 'The Greyspine', 'Jagged mountains said to be the Ember Kings’ tomb.',
        'Snow-capped peaks to the north-east. Ruins of the Ember Kings dot the high passes.', f({ Kind: 'Mountain range', Climate: 'Cold' }), ['wilderness']),
      e('ashen', 'faction', 'The Ashen Hand', 'A smuggling cartel with a cult at its heart.',
        'They run the black market in @[Saltmere](saltmere) and seek the @[Drowned Crown](crown) to wake something beneath the sea.',
        f({ Leader: 'Unknown (“the Ash Mother”)', Headquarters: 'The Sump, Saltmere', Goals: 'Recover the Drowned Crown', Size: 'Hundreds' }), ['villain'],
        'The Ash Mother is a drowned priestess kept alive by the crown’s curse.'),
      e('crown', 'item', 'The Drowned Crown', 'The lost crown of the last Ember King.',
        'Sank with the royal flagship during the @[Night of Broken Tides](tides). Whoever wears it can command the sea — at a price.',
        f({ Rarity: 'Artifact', Owner: 'Lost', Properties: 'Command water; slowly drowns the wearer' }), ['macguffin']),
      e('thornback', 'creature', 'Thornback', 'A bramble-covered beast the size of a bear.',
        'Thornbacks guard the deep places of @[Whisperwood](whisper). They are calm unless the forest is harmed.', f({ Habitat: 'Whisperwood', Danger: 'Moderate', Size: 'Large' })),
      e('tides', 'lore', 'Night of Broken Tides', 'The storm that ended the Ember Kings.',
        'In a single night the sea rose and swallowed the royal fleet and the @[Drowned Crown](crown) with it. Sailors still refuse to speak of it.', f({ Category: 'History', Origin: 'Year 1187' }), ['history']),
    ],
    relations: [
      { id: 'r1', from: 'oren', to: 'saltmere', label: 'rules' },
      { id: 'r2', from: 'mira', to: 'ashen', label: 'owes a debt to' },
      { id: 'r3', from: 'oren', to: 'ashen', label: 'secretly allied with' },
      { id: 'r4', from: 'sela', to: 'whisper', label: 'protects' },
      { id: 'r5', from: 'mira', to: 'sela', label: 'old friend of' },
      { id: 'r6', from: 'ashen', to: 'crown', label: 'hunts' },
    ],
    maps: [{
      id: 'vaelmap', name: 'The Coast of Vael', image: mapSVG(), w: 1600, h: 1000, parentId: '',
      scale: { pxPerUnit: 2, unit: 'miles' },
      pins: [
        { id: 'p1', x: 720, y: 640, label: '', entryId: 'saltmere', submapId: '', color: '' },
        { id: 'p2', x: 430, y: 470, label: '', entryId: 'whisper', submapId: '', color: '' },
        { id: 'p3', x: 920, y: 300, label: '', entryId: 'greyspine', submapId: '', color: '' },
        { id: 'p4', x: 1000, y: 880, label: 'Wreck of the Ember Fleet', entryId: 'tides', submapId: '', color: '#ffffff' },
      ],
    }],
    events: [
      { id: 'ev1', title: 'The Night of Broken Tides', date: { year: 1187, month: 10, day: 13 }, desc: 'The Ember Kings’ fleet is lost with the @[Drowned Crown](crown).', entryIds: [] },
      { id: 'ev2', title: 'Oren Thale becomes High Warden', date: { year: 1201, month: 3, day: 1 }, desc: '@[High Warden Oren Thale](oren) takes control of @[Saltmere](saltmere).', entryIds: [] },
      { id: 'ev3', title: 'The Ashen Hand surfaces', date: { year: 1210, month: 6, day: 20 }, desc: 'The @[Ashen Hand](ashen) seize the Sump.', entryIds: [] },
    ],
    arcs: [{ id: 'arc1', name: 'Act I: Salt and Ash', desc: 'The party arrives in Saltmere and is drawn into the hunt for the Drowned Crown.', order: 0 }],
    sessions: [
      { id: 's1', arcId: 'arc1', number: 1, title: 'Storm at Saltmere', status: 'played', realDate: '', date: { year: 1214, month: 8, day: 3 },
        beats: [
          { id: 'b1', text: 'Shipwreck — the party washes up near @[Saltmere](saltmere)', done: true },
          { id: 'b2', text: 'Meet @[Captain Mira Vex](mira) at the Gull’s Lament', done: true },
          { id: 'b3', text: 'Ambush by @[Ashen Hand](ashen) thugs in the Sump', done: true },
        ], notes: '', recap: 'The party survived the wreck, befriended Mira and fought off Ashen Hand thugs.' },
      { id: 's2', arcId: 'arc1', number: 2, title: 'Into the Whisperwood', status: 'planned', realDate: '', date: { year: 1214, month: 8, day: 6 },
        beats: [
          { id: 'b4', text: 'Mira asks the party to find @[Sela of the Thorn](sela)', done: true },
          { id: 'b5', text: 'Travel to @[Whisperwood](whisper) — use the Measure tool for travel time', done: false },
          { id: 'b6', text: 'Encounter: a wounded @[Thornback](thornback)', done: false },
          { id: 'b7', text: 'Sela reveals a clue about @[Drowned Crown](crown)', done: false },
        ], notes: '**Secret:** Sela knows where the Ember fleet sank.', recap: '' },
    ],
    journals: [
      { id: 'j1', title: 'A Brief History of Vael', category: 'History', created: Date.now(), updated: Date.now(),
        body: '# The Ember Kings\nFor four centuries the Ember Kings ruled from the @[The Greyspine](greyspine).\n\n# The Fall\nAll of it ended on the @[Night of Broken Tides](tides).' },
    ],
    calendar: {
      months: [
        { name: 'Frostwane', days: 30 }, { name: 'Thawmoon', days: 30 }, { name: 'Seedtide', days: 30 },
        { name: 'Bloomrise', days: 30 }, { name: 'Highsun', days: 30 }, { name: 'Emberfall', days: 30 },
        { name: 'Goldleaf', days: 30 }, { name: 'Harvestend', days: 30 }, { name: 'Mistveil', days: 30 },
        { name: 'Duskmarch', days: 30 }, { name: 'Longnight', days: 30 }, { name: 'Deepwinter', days: 30 },
      ],
      weekdays: ['Sunday', 'Moonday', 'Tideday', 'Windsday', 'Thunderday', 'Fireday', 'Starday'],
      eras: [{ name: 'Age of Embers', abbr: 'AE', start: 1 }, { name: 'The Drowned Years', abbr: 'DY', start: 1188 }],
      current: { year: 1214, month: 8, day: 6 },
    },
    settings: { speeds: { foot: 24, horse: 40, wagon: 16, ship: 72 } },
  };
}
