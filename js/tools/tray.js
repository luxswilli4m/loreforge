// Floating dice tray available on every page (the 🎲 button bottom-right).
import { rollAndLog, rollHTML, history } from './dice.js';
import { esc, toast } from '../util.js';
import { openDiceTable } from './diceTable.js';

let open = false;
export function initTray() {
  const fab = document.createElement('button');
  fab.id = 'dice-fab'; fab.title = 'Dice tray'; fab.textContent = '🎲';
  const tray = document.createElement('div');
  tray.id = 'dice-tray'; tray.className = 'hidden';
  tray.innerHTML = `<div class="row"><b style="flex:1">Dice tray</b><button class="icon small" data-close>✕</button></div>
    <div class="dice-buttons">${['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => `<button data-roll="1${d}">${d}</button>`).join('')}<button data-roll="adv">Adv</button><button data-roll="dis">Dis</button></div>
    <div class="row" style="margin-top:8px"><input id="tray-expr" placeholder="2d6+3"><button class="primary shrink" data-go>Roll</button></div>
    <button class="dt-open" data-table>🎲 Open the dice table <span class="muted small">— roll real dice on a tray</span></button>
    <div id="tray-out"></div><div id="tray-hist" class="dice-hist"></div>`;
  document.body.append(fab, tray);
  const out = tray.querySelector('#tray-out'), hist = tray.querySelector('#tray-hist'), input = tray.querySelector('#tray-expr');
  const draw = () => {
    out.innerHTML = history[0] ? rollHTML(history[0], esc) : '<p class="muted small">Click a die or type a roll.</p>';
    hist.innerHTML = history.slice(1, 6).map(h => `<button class="hist-row" data-roll="${esc(h.input)}"><b>${h.total}</b><span>${esc(h.input)}</span></button>`).join('');
  };
  const roll = e => { try { rollAndLog(e); } catch (err) { toast(err.message); } };
  const toggle = v => { open = v ?? !open; tray.classList.toggle('hidden', !open); fab.classList.toggle('on', open); if (open) { draw(); input.focus(); } };
  fab.onclick = () => toggle();
  tray.addEventListener('click', e => {
    const b = e.target.closest('[data-roll]'); if (b) roll(b.dataset.roll);
    if (e.target.closest('[data-go]')) roll(input.value);
    if (e.target.closest('[data-close]')) toggle(false);
    if (e.target.closest('[data-table]')) { openDiceTable(); toggle(false); }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') roll(input.value); if (e.key === 'Escape') toggle(false); });
  window.addEventListener('lf-roll', () => { if (open) draw(); });
  return { toggle };
}
