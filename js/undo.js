// Session undo/redo (Ctrl+Z / Ctrl+Y), like Word: covers changes made since the app was opened.
// Bursts of edits (e.g. typing) are grouped into one step. History lives in memory only.
import { state, hooks, save } from './store.js';

const MAX_STEPS = 80, MAX_BYTES = 80 * 1048576, GROUP_MS = 900;
let worldId = null, base = null, undo = [], redo = [], timer = null, applying = false;

const snap = w => { const { updated, ...rest } = w; return JSON.stringify(rest); };
const emit = () => window.dispatchEvent(new CustomEvent('lf-undo', { detail: { undo: undo.length, redo: redo.length } }));
export const canUndo = () => undo.length > 0 || !!timer;
export const canRedo = () => redo.length > 0;

export function track() {
  const w = state.world;
  if (!w) { worldId = null; base = null; undo = []; redo = []; emit(); return; }
  if (w.id !== worldId) { worldId = w.id; base = snap(w); undo = []; redo = []; clearTimeout(timer); timer = null; emit(); }
}
function capture() {
  clearTimeout(timer); timer = null;
  const w = state.world;
  if (!w || w.id !== worldId || base == null) return;
  const cur = snap(w);
  if (cur === base) return;
  undo.push(base);
  let bytes = undo.reduce((a, s) => a + s.length, 0);
  while (undo.length > MAX_STEPS || (bytes > MAX_BYTES && undo.length > 1)) bytes -= undo.shift().length;
  base = cur;
  redo = [];
  emit();
}
function apply(str) {
  const w = state.world;
  const data = JSON.parse(str);
  applying = true;
  for (const k of Object.keys(w)) if (k !== 'id') delete w[k];
  Object.assign(w, data, { id: w.id, updated: Date.now() });
  base = str;
  save();
  setTimeout(() => { applying = false; }, 400);
  emit();
}

export function undoStep() {
  track();
  if (timer) capture();
  if (!undo.length) return false;
  const prev = undo.pop();
  redo.push(base);
  apply(prev);
  return true;
}
export function redoStep() {
  track();
  if (!redo.length) return false;
  const next = redo.pop();
  undo.push(base);
  apply(next);
  return true;
}
// start fresh (e.g. after another device's changes arrive or a version is restored)
export function resetHistory() { worldId = null; track(); }

export function initUndo() {
  hooks.afterSave.push(w => {
    if (applying || !w || w !== state.world) return;
    if (w.id !== worldId) { track(); return; }
    clearTimeout(timer);
    timer = setTimeout(capture, GROUP_MS);
    emit();
  });
  setInterval(track, 1000);
  track();
}
