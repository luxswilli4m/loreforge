// Dice expressions: 2d6+3, d20, 4d6kh3, 2d20kl1, d%, adv, dis, 1d8+1d6-1
const rnd = n => Math.floor(Math.random() * n) + 1;

export function roll(input) {
  let expr = String(input || '').toLowerCase().replace(/\s+/g, '');
  if (!expr) throw new Error('Type a roll, e.g. 2d6+3');
  expr = expr.replace(/^adv(?=[+-]|$)/, '2d20kh1').replace(/^dis(?=[+-]|$)/, '2d20kl1').replace(/d%/g, 'd100');
  const terms = expr.match(/[+-]?[^+-]+/g);
  if (!terms) throw new Error('Could not read that roll');
  let total = 0;
  const parts = [];
  for (const raw of terms) {
    const sign = raw[0] === '-' ? -1 : 1;
    const t = raw.replace(/^[+-]/, '');
    let m;
    if ((m = t.match(/^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?$/))) {
      const n = Math.min(100, +(m[1] || 1)), sides = +m[2];
      if (!sides || sides > 1000) throw new Error('Dice need 1–1000 sides');
      const rolls = Array.from({ length: n }, () => ({ v: rnd(sides), kept: true }));
      if (m[3]) {
        const k = Math.min(n, +m[4]);
        const order = rolls.map((r, i) => i).sort((a, b) => rolls[a].v - rolls[b].v);
        const keepHigh = m[3] === 'kh' || m[3] === 'dl';
        const keepCount = m[3][0] === 'k' ? k : n - k;
        const keep = new Set(keepHigh ? order.slice(n - keepCount) : order.slice(0, keepCount));
        rolls.forEach((r, i) => r.kept = keep.has(i));
      }
      const sum = rolls.filter(r => r.kept).reduce((a, r) => a + r.v, 0) * sign;
      parts.push({ text: (sign < 0 ? '-' : '') + t, rolls, sides, sum });
      total += sum;
    } else if ((m = t.match(/^\d+$/))) {
      parts.push({ text: (sign < 0 ? '-' : '+') + t, sum: sign * +t });
      total += sign * +t;
    } else throw new Error(`I don't understand “${t}”`);
  }
  const d20 = parts.find(p => p.sides === 20);
  const kept20 = d20?.rolls.filter(r => r.kept);
  return {
    input: String(input), total, parts,
    crit: kept20?.length === 1 && kept20[0].v === 20,
    fumble: kept20?.length === 1 && kept20[0].v === 1,
    time: Date.now(),
  };
}

export function rollHTML(res, esc) {
  const parts = res.parts.map(p => p.rolls
    ? `<span class="dice-part">${esc(p.text)}: [${p.rolls.map(r => `<span class="${r.kept ? '' : 'dropped'} ${p.sides === 20 && r.v === 20 ? 'nat20' : ''} ${p.sides === 20 && r.v === 1 ? 'nat1' : ''}">${r.v}</span>`).join(', ')}]</span>`
    : `<span class="dice-part">${esc(p.text)}</span>`).join(' ');
  return `<div class="dice-res ${res.crit ? 'crit' : ''} ${res.fumble ? 'fumble' : ''}">
    <div class="dice-total">${res.total}</div>
    <div class="dice-detail"><b>${esc(res.input)}</b>${res.crit ? ' · <span class="nat20">Natural 20!</span>' : res.fumble ? ' · <span class="nat1">Natural 1</span>' : ''}<br>${parts}</div></div>`;
}

// shared history across the tray and the GM screen
export const history = [];
export function rollAndLog(input) {
  const r = roll(input);
  history.unshift(r);
  if (history.length > 40) history.pop();
  window.dispatchEvent(new CustomEvent('lf-roll', { detail: r }));
  return r;
}
