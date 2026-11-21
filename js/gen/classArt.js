// Preset portrait cards for character sheets: one for each D&D class, plus a few for creatures.
// Each is drawn here as an SVG: a glowing backdrop, the class emblem, a rim-lit silhouette with its signature gear,
// and a name ribbon. No outside images are used.

const C = {
  barbarian: { label: 'Barbarian', bg: ['#7a2a14', '#1a0806'], rim: '#ff9a4a', body: 'light', head: 'horns', props: ['greataxe'], emblem: 'claw' },
  bard: { label: 'Bard', bg: ['#6a2a6e', '#14081a'], rim: '#ffb3e6', body: 'light', head: 'cap', props: ['lute'], emblem: 'notes' },
  cleric: { label: 'Cleric', bg: ['#8a7a3a', '#140f06'], rim: '#ffe9a0', body: 'robe', head: 'circlet', props: ['mace', 'holy'], emblem: 'sun' },
  druid: { label: 'Druid', bg: ['#2f6a34', '#06140a'], rim: '#a6ff8c', body: 'robe', head: 'antlers', props: ['leafstaff'], emblem: 'leaf' },
  fighter: { label: 'Fighter', bg: ['#4a5a72', '#0a0e16'], rim: '#cfe0ff', body: 'armour', head: 'helm', props: ['sword', 'shield'], emblem: 'swords' },
  monk: { label: 'Monk', bg: ['#a0602a', '#1a0d04'], rim: '#ffd39a', body: 'light', head: 'bald', props: ['fists'], emblem: 'yinyang' },
  paladin: { label: 'Paladin', bg: ['#7a6a9a', '#0e0a18'], rim: '#fff3c4', body: 'armour', head: 'helm', props: ['hammer', 'halo'], emblem: 'wings' },
  ranger: { label: 'Ranger', bg: ['#3e5a2a', '#0a1006'], rim: '#d7f0a6', body: 'light', head: 'hood', props: ['bow'], emblem: 'arrow' },
  rogue: { label: 'Rogue', bg: ['#2a2a3a', '#050508'], rim: '#9fb4ff', body: 'light', head: 'hood', props: ['daggers'], emblem: 'mask' },
  sorcerer: { label: 'Sorcerer', bg: ['#8a2a1a', '#160604'], rim: '#ffb066', body: 'robe', head: 'circlet', props: ['flame'], emblem: 'flame' },
  warlock: { label: 'Warlock', bg: ['#3a1a5a', '#08040e'], rim: '#b98cff', body: 'robe', head: 'hood', props: ['eldritch'], emblem: 'eye' },
  wizard: { label: 'Wizard', bg: ['#1f3a7a', '#050a18'], rim: '#9fd0ff', body: 'robe', head: 'hat', props: ['staff', 'book'], emblem: 'stars' },
  artificer: { label: 'Artificer', bg: ['#6a4a1a', '#120c04'], rim: '#ffcf7a', body: 'light', head: 'goggles', props: ['wrench'], emblem: 'cog' },
  // creatures
  dragon: { label: 'Dragon', bg: ['#7a1a1a', '#120404'], rim: '#ff7a4a', creature: 'dragon', emblem: 'flame' },
  undead: { label: 'Undead', bg: ['#2a4a4a', '#040a0a'], rim: '#8affd8', creature: 'undead', emblem: 'eye' },
  beast: { label: 'Beast', bg: ['#4a3a22', '#0c0804'], rim: '#ffd8a0', creature: 'beast', emblem: 'claw' },
  fiend: { label: 'Fiend', bg: ['#6a0e1a', '#100204'], rim: '#ff4a5a', creature: 'fiend', emblem: 'flame' },
  aberration: { label: 'Aberration', bg: ['#2a4a2a', '#040a04'], rim: '#c4ff6a', creature: 'aberration', emblem: 'eye' },
  elemental: { label: 'Elemental', bg: ['#1a4a7a', '#040a14'], rim: '#8ad8ff', creature: 'elemental', emblem: 'stars' },
};
export const CLASS_ART = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { label: v.label, creature: !!v.creature }]));
// guess a card from the class text ("Fighter 3 / Rogue 2" → fighter) or a creature's type
export function guessArt(text) {
  const s = String(text || '').toLowerCase();
  return Object.keys(C).find(k => s.includes(k)) || (/(undead|zombie|skeleton|ghost|lich|vampire)/.test(s) ? 'undead' : /(demon|devil|fiend)/.test(s) ? 'fiend' : /(wolf|bear|beast|cat|boar)/.test(s) ? 'beast' : '');
}

const cache = {};
export function artURL(key) {
  if (!C[key]) return '';
  return cache[key] || (cache[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(artSVG(key)));
}

// ---------- pieces ----------
function emblem(kind, col) {
  const o = `fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case 'claw': return `<g ${o}><path d="M95 70c30 40 30 90 10 140M140 55c25 50 25 110 0 165M185 70c20 45 15 95-10 140"/></g>`;
    case 'notes': return `<g fill="${col}"><circle cx="110" cy="190" r="18"/><circle cx="190" cy="170" r="18"/><path d="M124 190V80l80-20v110h-10V76l-60 15v99z"/></g>`;
    case 'sun': return `<g ${o}><circle cx="150" cy="140" r="38"/>${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return `<path d="M${150 + Math.cos(a) * 52} ${140 + Math.sin(a) * 52}L${150 + Math.cos(a) * 92} ${140 + Math.sin(a) * 92}"/>`; }).join('')}</g>`;
    case 'leaf': return `<g ${o}><path d="M150 230C80 180 80 90 150 50c70 40 70 130 0 180zM150 230V70M150 120l-30-25M150 150l32-28M150 180l-28-22"/></g>`;
    case 'swords': return `<g ${o}><path d="M80 220L210 70M220 220L90 70M70 200l30 30M230 200l-30 30"/></g>`;
    case 'yinyang': return `<g ${o}><circle cx="150" cy="140" r="80"/><path d="M150 60a40 40 0 0 1 0 80a40 40 0 0 0 0 80"/><circle cx="150" cy="100" r="8"/><circle cx="150" cy="180" r="8"/></g>`;
    case 'wings': return `<g ${o}><path d="M150 120c-40-50-90-50-120-30c30 0 50 20 60 40c-30-5-50 5-60 25c40-10 80 0 120-10M150 120c40-50 90-50 120-30c-30 0-50 20-60 40c30-5 50 5 60 25c-40-10-80 0-120-10M150 90v110"/></g>`;
    case 'arrow': return `<g ${o}><path d="M70 230L230 70M230 70h-45M230 70v45M70 230l12-35M70 230l35-12M90 210l-14-4M90 210l-4-14"/></g>`;
    case 'mask': return `<g ${o}><path d="M60 120c30-20 150-20 180 0c-5 40-35 60-60 50c-10-4-20-14-30-14s-20 10-30 14c-25 10-55-10-60-50z"/><path d="M95 130c10-8 25-8 35 0M170 130c10-8 25-8 35 0"/></g>`;
    case 'flame': return `<g ${o}><path d="M150 240c-60 0-80-60-50-110c10 30 25 35 30 30c-10-40 10-80 40-110c-5 40 40 60 45 110c5-10 10-25 5-40c30 40 25 120-70 120z"/></g>`;
    case 'eye': return `<g ${o}><path d="M50 140c50-70 150-70 200 0c-50 70-150 70-200 0z"/><circle cx="150" cy="140" r="28"/><circle cx="150" cy="140" r="8" fill="${col}"/></g>`;
    case 'stars': return `<g fill="${col}">${[[150, 90, 30], [95, 170, 18], [210, 175, 22], [120, 230, 12], [200, 60, 12]].map(([x, y, r]) => `<path d="M${x} ${y - r}L${x + r * 0.25} ${y - r * 0.25}L${x + r} ${y}L${x + r * 0.25} ${y + r * 0.25}L${x} ${y + r}L${x - r * 0.25} ${y + r * 0.25}L${x - r} ${y}L${x - r * 0.25} ${y - r * 0.25}z"/>`).join('')}</g>`;
    case 'cog': return `<g ${o}><circle cx="150" cy="140" r="55"/><circle cx="150" cy="140" r="20"/>${Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return `<path d="M${150 + Math.cos(a) * 55} ${140 + Math.sin(a) * 55}L${150 + Math.cos(a) * 78} ${140 + Math.sin(a) * 78}" stroke-width="14"/>`; }).join('')}</g>`;
  }
  return '';
}
// the figure, built from simple shapes so it reads as one silhouette
function figure(c) {
  const p = [];
  // legs and body
  if (c.body === 'robe') p.push('<path d="M100 215C92 270 80 330 60 400h180c-20-70-32-130-40-185z"/>');
  else p.push('<path d="M112 250L104 400h40l6-90l6 90h40l-8-150z"/>', '<path d="M106 240h88l-6 28h-76z"/>');
  // torso
  p.push(c.body === 'armour' ? '<path d="M92 160c18-14 98-14 116 0l-6 90H98z"/>' : '<path d="M98 162c16-12 88-12 104 0l-8 86h-88z"/>');
  // shoulders (pauldrons for armour)
  if (c.body === 'armour') p.push('<ellipse cx="94" cy="166" rx="26" ry="18"/><ellipse cx="206" cy="166" rx="26" ry="18"/>');
  // neck and head
  p.push('<rect x="138" y="128" width="24" height="30" rx="8"/>', '<ellipse cx="150" cy="112" rx="26" ry="30"/>');
  // arms: left down holding something, right bent forward
  p.push('<path d="M92 168c-14 30-20 60-22 92" stroke-width="22" stroke-linecap="round" fill="none"/>', '<path d="M208 168c14 24 22 44 24 66" stroke-width="22" stroke-linecap="round" fill="none"/>');
  // headwear
  const h = c.head;
  if (h === 'hood') p.push('<path d="M118 120c-6-50 70-62 66 0c4 24-6 44-12 52l-44 0c-8-12-12-30-10-52z"/><path d="M110 170c10-30 70-30 80 0z"/>');
  if (h === 'hat') p.push('<path d="M150 20L118 92h64z"/><ellipse cx="150" cy="94" rx="58" ry="11"/>');
  if (h === 'helm') p.push('<path d="M122 112c-4-40 60-44 56 0v24h-56z"/><path d="M148 60c2-14 4-14 6 0v20h-6z"/>');
  if (h === 'horns') p.push('<path d="M122 100c-28-10-40-40-30-60c4 22 18 34 36 38z"/><path d="M178 100c28-10 40-40 30-60c-4 22-18 34-36 38z"/><path d="M124 104c0-36 52-36 52 0z"/>');
  if (h === 'cap') p.push('<path d="M118 98c4-30 60-32 66-4c-20-6-46-4-66 4z"/><path d="M180 90c20-30 34-36 44-50c-4 26-20 46-40 56z"/>');
  if (h === 'antlers') p.push('<path d="M128 90c-20-20-24-44-12-60c0 16 6 26 14 32c-2-14 2-24 10-30c-4 20 2 36 8 48z"/><path d="M172 90c20-20 24-44 12-60c0 16-6 26-14 32c2-14-2-24-10-30c4 20-2 36-8 48z"/>');
  if (h === 'goggles') p.push('<rect x="122" y="96" width="56" height="14" rx="7"/>');
  if (h === 'circlet') p.push('<path d="M124 96h52l-4 8h-44z"/>');
  return p.join('');
}
// gear drawn over the figure, lit with the class colour
function prop(kind, rim) {
  const metal = '#3a3f4a', dark = '#0c0c10';
  switch (kind) {
    case 'greataxe': return `<path d="M232 60L232 330" stroke="${dark}" stroke-width="10" stroke-linecap="round"/><path d="M234 70c40 0 56 30 56 50c0 20-16 50-56 50z" fill="${metal}" stroke="${rim}" stroke-width="2.5"/><path d="M230 70c-30 4-40 24-40 50s10 46 40 50z" fill="${metal}" stroke="${rim}" stroke-width="2.5"/>`;
    case 'lute': return `<g transform="rotate(-35 210 250)"><ellipse cx="210" cy="270" rx="34" ry="42" fill="#5a3418" stroke="${rim}" stroke-width="2.5"/><circle cx="210" cy="262" r="10" fill="${dark}"/><rect x="204" y="150" width="12" height="90" fill="#3a220e" stroke="${rim}" stroke-width="1.5"/><path d="M200 150h20l-4-22h-12z" fill="#3a220e"/></g>`;
    case 'mace': return `<path d="M232 230L232 330" stroke="${dark}" stroke-width="9" stroke-linecap="round"/><circle cx="232" cy="222" r="18" fill="${metal}" stroke="${rim}" stroke-width="2.5"/>${[0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2; return `<path d="M${232 + Math.cos(a) * 16} ${222 + Math.sin(a) * 16}L${232 + Math.cos(a) * 26} ${222 + Math.sin(a) * 26}" stroke="${rim}" stroke-width="4"/>`; }).join('')}`;
    case 'holy': return `<circle cx="70" cy="262" r="22" fill="${rim}" opacity=".35" filter="url(#glow)"/><path d="M70 246v32M58 258h24" stroke="${rim}" stroke-width="5" stroke-linecap="round"/>`;
    case 'leafstaff': return `<path d="M68 70c-4 80 4 180 2 330" stroke="#3a2812" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M68 70c-30-10-36-34-24-50c10 10 22 24 24 50zM68 74c26-14 40-8 46 6c-16 6-30 4-46-6z" fill="#3e7a2a" stroke="${rim}" stroke-width="2"/><circle cx="68" cy="70" r="10" fill="${rim}" filter="url(#glow)"/>`;
    case 'sword': return `<path d="M232 240L232 60" stroke="#c9d2de" stroke-width="10" stroke-linecap="square"/><path d="M232 60l-5 10h10z" fill="#c9d2de"/><path d="M232 240V60" stroke="${rim}" stroke-width="2" opacity=".7"/><rect x="214" y="236" width="36" height="8" rx="3" fill="${metal}" stroke="${rim}" stroke-width="1.5"/><rect x="228" y="244" width="8" height="24" fill="#3a2812"/>`;
    case 'shield': return `<path d="M40 210h70v40c0 40-20 60-35 70c-15-10-35-30-35-70z" fill="${metal}" stroke="${rim}" stroke-width="3"/><path d="M75 222v80M50 250h50" stroke="${rim}" stroke-width="4" opacity=".8"/>`;
    case 'fists': return `<circle cx="70" cy="262" r="16" fill="${dark}"/><circle cx="232" cy="236" r="16" fill="${dark}"/><circle cx="232" cy="236" r="30" fill="${rim}" opacity=".35" filter="url(#glow)"/><circle cx="70" cy="262" r="26" fill="${rim}" opacity=".3" filter="url(#glow)"/>`;
    case 'hammer': return `<path d="M232 120L232 330" stroke="${dark}" stroke-width="9" stroke-linecap="round"/><rect x="206" y="96" width="52" height="34" rx="4" fill="${metal}" stroke="${rim}" stroke-width="2.5"/>`;
    case 'halo': return `<ellipse cx="150" cy="70" rx="38" ry="10" fill="none" stroke="${rim}" stroke-width="4" filter="url(#glow)"/>`;
    case 'bow': return `<path d="M60 60c50 60 50 200 0 260" fill="none" stroke="#5a3a1a" stroke-width="8" stroke-linecap="round"/><path d="M60 60L60 320" stroke="${rim}" stroke-width="1.5"/><path d="M232 230L262 120" stroke="#5a3a1a" stroke-width="3"/><path d="M262 120l-2 12l8-6z" fill="${rim}"/>`;
    case 'daggers': return `<path d="M70 262L56 316" stroke="#c9d2de" stroke-width="6" stroke-linecap="round"/><path d="M232 236L262 196" stroke="#c9d2de" stroke-width="6" stroke-linecap="round"/><path d="M232 236L262 196M70 262L56 316" stroke="${rim}" stroke-width="1.5"/>`;
    case 'flame': return `<circle cx="232" cy="220" r="30" fill="${rim}" opacity=".45" filter="url(#glow)"/><path d="M232 250c-18 0-24-18-14-32c2 8 8 10 9 8c-3-12 3-24 12-32c-1 12 12 18 13 32c2-3 3-8 2-12c9 12 7 36-22 36z" fill="#ffd36a" stroke="#fff3c4" stroke-width="1.5"/>`;
    case 'eldritch': return `<circle cx="232" cy="222" r="34" fill="${rim}" opacity=".4" filter="url(#glow)"/><circle cx="232" cy="222" r="16" fill="#1a0a2a" stroke="${rim}" stroke-width="3"/><circle cx="232" cy="222" r="6" fill="${rim}"/><path d="M232 190c-30 -20-20-40 0-60M232 254c30 20 20 40 0 60" fill="none" stroke="${rim}" stroke-width="2" opacity=".6"/>`;
    case 'staff': return `<path d="M232 70L232 360" stroke="#3a2812" stroke-width="9" stroke-linecap="round"/><path d="M232 30l14 26l-14 18l-14-18z" fill="${rim}" stroke="#fff" stroke-width="1.5"/><circle cx="232" cy="52" r="26" fill="${rim}" opacity=".35" filter="url(#glow)"/>`;
    case 'book': return `<path d="M44 250l30-8l30 8v40l-30-8l-30 8z" fill="#5a1a1a" stroke="${rim}" stroke-width="2"/><path d="M74 242v40" stroke="${rim}" stroke-width="1.5"/>`;
    case 'wrench': return `<path d="M232 240L262 160" stroke="${metal}" stroke-width="10" stroke-linecap="round"/><path d="M262 160c-8-16 4-30 18-28l-10 12l6 8l12-8c4 14-10 26-26 16z" fill="${metal}" stroke="${rim}" stroke-width="2"/><circle cx="70" cy="262" r="16" fill="none" stroke="${rim}" stroke-width="5" stroke-dasharray="6 4"/>`;
  }
  return '';
}
function creature(kind) {
  switch (kind) {
    case 'dragon': return '<path d="M150 400c-40-60-30-120 0-170c-20-30-10-60 10-80c-10-10-30-12-44-4c10-24 40-34 60-24c14-14 34-14 46-6c-14 2-22 8-26 16c20 14 26 40 16 64c40 40 50 120 18 204z"/><path d="M140 230C90 160 40 150 10 170c30 10 50 30 56 50c-24-6-44 0-56 14c30-4 60 8 80 28z"/><path d="M180 230c40-80 90-100 110-90c-26 8-40 26-44 48c20-10 40-8 54 2c-30 2-54 18-70 40z"/><path d="M196 92l20-30l2 30zM176 96l6-34l10 30z"/>';
    case 'undead': return '<path d="M150 40c-56 0-84 44-76 96c4 24 16 38 24 48v34h104v-34c8-10 20-24 24-48c8-52-20-96-76-96z"/><path d="M100 230h100l-10 40h-80z"/><path d="M60 400c10-70 40-110 90-120c50 10 80 50 90 120z"/>';
    case 'beast': return '<path d="M70 400c0-80 20-140 60-170l-30-60l-30-70l50 40l30 30h30l30-30l50-40l-30 70l-30 60c40 30 60 90 60 170z"/><path d="M118 200c10 30 54 30 64 0l-32 40z"/>';
    case 'fiend': return '<path d="M150 70c-30 0-50 26-46 60c-30-10-46-40-40-80c-20 30-20 80 20 100c-14 30-20 80-30 250h192c-10-170-16-220-30-250c40-20 40-70 20-100c6 40-10 70-40 80c4-34-16-60-46-60z"/><path d="M40 200c-30 30-30 80-10 120c0-40 20-60 40-70zM260 200c30 30 30 80 10 120c0-40-20-60-40-70z"/>';
    case 'aberration': return '<circle cx="150" cy="150" r="80"/>' + Array.from({ length: 7 }, (_, i) => { const x = 80 + i * 23; return `<path d="M${x} 200c${(i % 2 ? 20 : -20)} 60 ${(i % 2 ? -30 : 30)} 120 ${(i % 2 ? 10 : -10)} 200" stroke-width="16" stroke-linecap="round" fill="none"/>`; }).join('');
    case 'elemental': return '<path d="M150 30c-40 60-90 80-90 160c0 60 30 100 40 210h100c10-110 40-150 40-210c0-80-50-100-90-160z"/>';
  }
  return '';
}
function creatureLight(kind, rim) {
  if (kind === 'undead') return `<circle cx="122" cy="140" r="14" fill="${rim}" filter="url(#glow)"/><circle cx="178" cy="140" r="14" fill="${rim}" filter="url(#glow)"/><circle cx="122" cy="140" r="7" fill="#fff"/><circle cx="178" cy="140" r="7" fill="#fff"/>`;
  if (kind === 'aberration') return `<ellipse cx="150" cy="150" rx="40" ry="26" fill="#fff"/><circle cx="150" cy="150" r="18" fill="${rim}"/><circle cx="150" cy="150" r="8" fill="#000"/>`;
  if (kind === 'beast') return `<circle cx="128" cy="180" r="6" fill="${rim}" filter="url(#glow)"/><circle cx="172" cy="180" r="6" fill="${rim}" filter="url(#glow)"/>`;
  if (kind === 'fiend') return `<circle cx="134" cy="160" r="6" fill="${rim}" filter="url(#glow)"/><circle cx="166" cy="160" r="6" fill="${rim}" filter="url(#glow)"/>`;
  if (kind === 'dragon') return `<circle cx="190" cy="110" r="5" fill="#ffe36a" filter="url(#glow)"/>`;
  if (kind === 'elemental') return `<path d="M150 120c-20 30-40 50-40 90c0 40 20 60 40 80c20-20 40-40 40-80c0-40-20-60-40-90z" fill="${rim}" opacity=".6" filter="url(#glow)"/>`;
  return '';
}

function artSVG(key) {
  const c = C[key], [b1, b2] = c.bg, rim = c.rim, sil = '#0b0a0e';
  const shape = c.creature ? creature(c.creature) : figure(c);
  // drifting motes
  let sd = key.length * 97; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const motes = Array.from({ length: 26 }, () => `<circle cx="${(rnd() * 300).toFixed(0)}" cy="${(rnd() * 330).toFixed(0)}" r="${(0.6 + rnd() * 1.8).toFixed(1)}" fill="${rim}" opacity="${(0.2 + rnd() * 0.6).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></radialGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b2}" stop-opacity="0"/><stop offset="1" stop-color="${b2}" stop-opacity=".95"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="rim" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <rect width="300" height="400" fill="url(#bg)"/>
  <circle cx="150" cy="140" r="120" fill="${rim}" opacity=".10" filter="url(#glow)"/>
  <g opacity=".22">${emblem(c.emblem, rim)}</g>
  ${motes}
  <g fill="${rim}" stroke="${rim}" opacity=".85" filter="url(#rim)">${shape}</g>
  <g fill="${sil}" stroke="${sil}">${shape}</g>
  ${c.creature ? creatureLight(c.creature, rim) : (c.props || []).map(p => prop(p, rim)).join('')}
  <rect y="290" width="300" height="110" fill="url(#fog)"/>
  <path d="M40 352h220l-12 14l12 14H40l12-14z" fill="${b2}" stroke="${rim}" stroke-width="1.5" opacity=".95"/>
  <text x="150" y="372" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-weight="700" font-size="22" letter-spacing="3" fill="${rim}">${c.label.toUpperCase()}</text>
  <rect x="5" y="5" width="290" height="390" rx="10" fill="none" stroke="${rim}" stroke-opacity=".5" stroke-width="2"/>
</svg>`;
}
