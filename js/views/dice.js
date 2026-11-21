// The Dice page: the dice table built into the page, with quick rolls, saved rolls and the full roll history beside it.
import { rollAndLog, rollHTML, history } from '../tools/dice.js';
import { mountDiceTable } from '../tools/diceTable.js';
import { esc, toast } from '../util.js';

const SAVED_KEY = 'loreforge:savedRolls';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } };
const storeSaved = l => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(l)); } catch { /* private mode */ } };

export function render(main) {
  let saved = loadSaved();
  main.innerHTML = `
    <div class="page-head"><h1>Dice</h1><span class="muted small">Roll on the table, or roll quickly on the left. Every roll lands in the history.</span></div>
    <div class="dice-page">
      <div class="card side-box dp-side">
        <h4>Quick roll</h4>
        <div class="dice-buttons">${['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => `<button data-roll="1${d}">${d}</button>`).join('')}<button data-roll="adv" title="2d20, keep the highest">Adv</button><button data-roll="dis" title="2d20, keep the lowest">Dis</button></div>
        <div class="row" style="margin-top:8px"><input id="dp-expr" placeholder="e.g. 2d6+3, 4d6kh3"><button class="primary shrink" id="dp-go">Roll</button></div>
        <div id="dp-last" class="dice-last"></div>
        <h4 style="margin-top:14px">Saved rolls</h4>
        <div id="dp-saved"></div>
        <div class="row" style="gap:6px;margin-top:6px"><input id="dp-sname" placeholder="Name (e.g. Longsword)"><input id="dp-sexpr" placeholder="1d8+3" style="max-width:90px"><button class="small shrink" id="dp-sadd">＋</button></div>
        <h4 style="margin-top:14px">History</h4>
        <div id="dp-hist" class="dice-hist dp-hist"></div>
      </div>
      <div class="dp-table" id="dp-table"></div>
    </div>`;
  const $ = s => main.querySelector(s);
  const table = mountDiceTable($('#dp-table'));
  const draw = () => {
    $('#dp-last').innerHTML = history[0] ? rollHTML(history[0], esc) : '<p class="muted small">No rolls yet.</p>';
    $('#dp-hist').innerHTML = history.slice(1).map(h => `<button class="hist-row" data-roll="${esc(h.input)}" title="Roll again"><b>${h.total}</b><span>${esc(h.input)}</span><span class="muted small">${new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>`).join('') || '<p class="muted small">Earlier rolls show here.</p>';
  };
  const drawSaved = () => {
    $('#dp-saved').innerHTML = saved.length ? saved.map((s, i) => `<div class="dp-saved-row"><button class="small" data-roll="${esc(s.expr)}" title="Roll ${esc(s.expr)}"><b>${esc(s.name)}</b> <span class="muted">${esc(s.expr)}</span></button><button class="icon small" data-sdel="${i}" title="Remove">✕</button></div>`).join('')
      : '<p class="muted small" style="margin:0">Save rolls you make often, like an attack or a spell.</p>';
  };
  main.addEventListener('click', e => {
    if (e.target.closest('#dp-table')) return;
    const b = e.target.closest('[data-roll]'); if (b) { table.roll(b.dataset.roll); return; }
    const d = e.target.closest('[data-sdel]'); if (d) { saved.splice(+d.dataset.sdel, 1); storeSaved(saved); drawSaved(); }
  });
  $('#dp-go').onclick = () => { if ($('#dp-expr').value.trim()) table.roll($('#dp-expr').value.trim()); };
  $('#dp-expr').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) table.roll(e.target.value.trim()); });
  $('#dp-sadd').onclick = () => {
    const name = $('#dp-sname').value.trim(), expr = $('#dp-sexpr').value.trim();
    if (!expr) return $('#dp-sexpr').focus();
    saved.push({ name: name || expr, expr }); storeSaved(saved); drawSaved();
    $('#dp-sname').value = ''; $('#dp-sexpr').value = '';
  };
  const onRoll = () => draw();
  window.addEventListener('lf-roll', onRoll);
  draw(); drawSaved();
  return () => { window.removeEventListener('lf-roll', onRoll); table.close(); };
}
