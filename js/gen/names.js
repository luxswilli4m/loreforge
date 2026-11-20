// Procedural names for places on generated maps.
const PRE = ['Ash', 'Bram', 'Cold', 'Dun', 'Elder', 'Fair', 'Gold', 'Grey', 'High', 'Iron', 'Kings', 'Mill', 'North', 'Oak', 'Raven', 'Red', 'Salt', 'Silver',
  'Stone', 'Thorn', 'West', 'Wolf', 'Wyn', 'Black', 'Brook', 'Frost', 'Har', 'Mor', 'Ell', 'Lyn', 'Sun', 'Glen', 'Hollow', 'Crow', 'Amber', 'Briar', 'Cinder',
  'Dawn', 'Ember', 'Fen', 'Gull', 'Hart', 'Ivy', 'Lark', 'Mire', 'Pike', 'Rook', 'Swan', 'Tarn', 'Wren'];
const SUF = ['ford', 'haven', 'wick', 'mere', 'stead', 'bury', 'hold', 'gate', 'fall', 'moor', 'reach', 'vale', 'watch', 'cross', 'well', 'port', 'dale', 'ton',
  'by', 'helm', 'brook', 'field', 'hurst', 'ley', 'mouth', 'wall', 'barrow', 'combe', 'den', 'shaw'];
const SYL1 = ['Ar', 'Val', 'Mor', 'Ith', 'Eld', 'Kar', 'Ser', 'Thal', 'Ys', 'Dor', 'Bel', 'Cal', 'Ny', 'Ost', 'Rha', 'Aes', 'Vey', 'Lor', 'Quel', 'Zan', 'Cor', 'Hal', 'Myr', 'Tor', 'Ul'];
const SYL2 = ['an', 'ar', 'el', 'en', 'is', 'or', 'ur', 'ae', 'ith', 'on', 'ev', 'ad', 'om', 'yr'];
const SYL3 = ['ia', 'or', 'eth', 'ara', 'ion', 'und', 'ane', 'is', 'os', 'ea', 'heim', 'mar', 'dell', 'wyn', 'ros', 'dor'];

export function placeName(r) {
  let n = r.pick(PRE) + r.pick(SUF);
  n = n.replace(/(.)\1\1/, '$1$1');
  return n;
}
export function realmBase(r) {
  for (let i = 0; i < 20; i++) {
    const n = r.pick(SYL1) + (r.chance(0.45) ? r.pick(SYL2) : '') + r.pick(SYL3);
    if (!/(..).*\1/i.test(n) && !/(.)\1\1/.test(n)) return n;
  }
  return r.pick(SYL1) + r.pick(SYL3);
}
export function realmName(r, base) {
  const f = r.pick(['Kingdom of {}', '{}', 'The {} Reach', 'Duchy of {}', '{} Dominion', 'Free Cities of {}', 'Principality of {}', 'The {} Marches']);
  return f.replace('{}', base);
}
export function seaName(r) {
  return r.pick(['The {} Sea', 'Sea of {}', 'The {} Deep', 'Gulf of {}', 'The {} Expanse']).replace('{}', r.chance(0.5) ? realmBase(r) : r.pick(['Sorrows', 'Storms', 'Glass', 'Whispers', 'Embers', 'Silence', 'Pearls', 'Mists', 'Teeth', 'Dawn']));
}
export function mountainName(r) {
  return r.pick(['The {} Peaks', 'The {} Spine', '{} Mountains', 'The {}crags', 'The {} Teeth', 'The {} Heights']).replace('{}', r.pick(['Grey', 'Iron', 'Frost', 'Dragon', 'Ash', 'Sky', 'Thunder', 'Crown', realmBase(r)]));
}
export function forestName(r) {
  return r.pick(['{} Wood', 'The {}weald', '{} Forest', 'The {} Thicket', '{}wood']).replace('{}', r.pick(['Whisper', 'Elder', 'Briar', 'Shadow', 'Moss', 'Raven', 'Thorn', 'Hollow', 'Wild', realmBase(r)]));
}
export function districtName(r, used) {
  const opts = ['Lantern Row', 'Tanners’ Quarter', 'Old Gate', 'Fishmarket', 'Copperhill', 'The Shambles', 'Weavers’ End', 'Saltyard', 'Bellward', 'Cobblers’ Lane',
    'Smithy Row', 'The Narrows', 'Highside', 'Lowtown', 'Chandlers’ Court', 'Mercers’ Quarter', 'Brewers’ Hill', 'Temple Ward', 'Scholars’ Close', 'Ropewalk',
    'Thieves’ Warren', 'Goldgate', 'Ashfield', 'Millbank', 'Crowsnest', 'Kingsway', 'Potters’ Yard', 'The Rookery', 'Dyers’ Steps', 'Glassblowers’ Row'];
  const avail = opts.filter(o => !used.has(o));
  const n = avail.length ? r.pick(avail) : placeName(r) + ' Ward';
  used.add(n);
  return n;
}
export function templeName(r) {
  return r.pick(['Cathedral of {}', 'Temple of {}', 'Sanctum of {}', 'Shrine of {}']).replace('{}', r.pick(['the Dawn', 'the Tides', 'Saint Arden', 'the Flame', 'the Moon', 'the Seven', 'Mercy', 'the Forge']));
}
