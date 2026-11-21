// The dice table: a big window where real-looking dice tumble across a tray and settle on the result.
// Build a pool (how many of each die, plus a modifier), roll, and watch them bounce off the walls and each other.
// Five tray themes, or your own picture. Rolls are logged to the shared dice history like any other roll.
import { rollAndLog } from './dice.js';
import { esc, toast, pickFile } from '../util.js';
import * as A from '../assets.js';

const TYPES = [4, 6, 8, 10, 12, 20, 100];
const THEMES = {
  tavern: { label: 'Tavern table', felt: '#2f5d3a', felt2: '#22452b', rim: ['#7a4e2a', '#4a2c16'], die: '#efe6d2', edge: '#b9a98a', ink: '#2a1d10', pattern: 'felt' },
  arcane: { label: 'Arcane velvet', felt: '#3d2160', felt2: '#1f0f36', rim: ['#d8b660', '#8a6a24'], die: '#7b3fd1', edge: '#c9a4ff', ink: '#ffe9a8', pattern: 'runes', glow: true },
  dungeon: { label: 'Dungeon stone', felt: '#5d5f63', felt2: '#46484c', rim: ['#3a3b3f', '#1c1d20'], die: '#ddd3c2', edge: '#9a8f7c', ink: '#8e1e1a', pattern: 'tiles' },
  parchment: { label: 'Explorer’s map', felt: '#e8d9b5', felt2: '#d4c193', rim: ['#8a5530', '#4e2c14'], die: '#a8322b', edge: '#6e1c17', ink: '#fff6e0', pattern: 'map' },
  starfall: { label: 'Starfall', felt: '#0e1636', felt2: '#060a1c', rim: ['#b7c2da', '#5a6680'], die: '#2a4fa8', edge: '#8fb0ff', ink: '#ffffff', pattern: 'stars', glow: true },
};
// what the dice are made of. Each has its own surface texture, lighting and number colour.
const MATS = {
  tray: { label: 'Match the tray' },
  ivory: { label: 'Ivory', color: '#efe6d2', ink: '#2a1d10' },
  wood: { label: 'Oak wood', color: '#9a6232', ink: '#f6e6c4', tex: 'wood' },
  steel: { label: 'Steel', color: '#b4bac4', ink: '#22252b', tex: 'brushed', shine: 0.7 },
  brass: { label: 'Brass', color: '#c9a04a', ink: '#3a2608', tex: 'brushed', shine: 0.7 },
  gem: { label: 'Gemstone', color: '#c4306a', ink: '#ffffff', tex: 'gem', glass: true },
  marble: { label: 'Marble', color: '#ecebe6', ink: '#33333a', tex: 'marble' },
  obsidian: { label: 'Obsidian', color: '#1c1a22', ink: '#e8c66a', tex: 'gloss', shine: 0.9 },
  bone: { label: 'Bone', color: '#e2d5b8', ink: '#5a1c14', tex: 'bone' },
  custom: { label: '🖼️ My own picture…', ink: '#ffffff' },
};
const PREF_KEY = 'loreforge:dicetable';
const prefs = (() => { try { return { theme: 'tavern', bg: '', dieColor: '', mat: 'tray', numColor: '', dieImg: '', pool: { 20: 1 }, mod: 0, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { theme: 'tavern', bg: '', dieColor: '', mat: 'tray', numColor: '', dieImg: '', pool: { 20: 1 }, mod: 0 }; } })();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } };

let win = null, api = null;
export const isDiceTableOpen = () => !!win;
export function openDiceTable() { if (win) { win.classList.add('pulse'); setTimeout(() => win?.classList.remove('pulse'), 300); return api; } return build(); }

// a small picture of each die shape for the pool buttons
function dieSVG(n) {
  const pts = shape(n, 15).map(([x, y]) => `${(x + 18).toFixed(1)},${(y + 18).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 36 36" width="30" height="30"><polygon points="${pts}" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}
// outline of each die as seen from above (unit radius r)
function shape(n, r) {
  const poly = (k, rot = -Math.PI / 2, sx = 1, sy = 1) => Array.from({ length: k }, (_, i) => [Math.cos(rot + i / k * Math.PI * 2) * r * sx, Math.sin(rot + i / k * Math.PI * 2) * r * sy]);
  if (n === 4) return poly(3, -Math.PI / 2, 1.08, 1.08);
  if (n === 6) return poly(4, Math.PI / 4, 0.95, 0.95);
  if (n === 8) return poly(4, -Math.PI / 2, 0.92, 1.12);
  if (n === 10 || n === 100) return [[0, -r * 1.1], [r * 0.95, -r * 0.1], [r * 0.6, r * 0.75], [-r * 0.6, r * 0.75], [-r * 0.95, -r * 0.1]];
  if (n === 12) return poly(5);
  return poly(6, -Math.PI / 2);
}

function build() {
  win = document.createElement('div');
  win.id = 'dice-table';
  win.innerHTML = `
    <div class="dt-head" id="dt-drag"><b>🎲 Dice table</b>
      <select id="dt-theme" title="Tray">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}<option value="custom">🖼️ My own picture…</option></select>
      <select id="dt-mat" title="What the dice are made of">${Object.entries(MATS).map(([k, m]) => `<option value="${k}">🎲 ${m.label}</option>`).join('')}</select>
      <label class="dt-colour" title="Dice colour"><input type="color" id="dt-dcol"><span>Dice</span></label>
      <label class="dt-colour" title="Number colour"><input type="color" id="dt-ncol"><span>Numbers</span></label>
      <button class="small" id="dt-dreset" title="Back to the material’s own colours">↺</button>
      <span style="flex:1"></span><button class="icon small" id="dt-close" title="Close">✕</button></div>
    <div class="dt-body">
      <div class="dt-pool">
        <div class="dt-dice">${TYPES.map(n => `<button class="dt-die" data-add="${n}" title="Click to add a d${n} · right-click to remove one">${dieSVG(n)}<span>d${n}</span><b class="dt-count" data-count="${n}"></b></button>`).join('')}</div>
        <div class="row" style="gap:6px;align-items:center;margin-top:8px"><span class="small">Modifier</span><button class="small" data-mod="-1">−</button><input id="dt-mod" type="number" value="0" style="width:64px;text-align:center"><button class="small" data-mod="1">＋</button></div>
        <div class="dt-expr" id="dt-expr"></div>
        <button class="primary dt-roll" id="dt-roll">🎲 Roll</button>
        <div class="dt-quick"><button class="small" id="dt-clear">Clear dice</button><button class="small" data-quick="adv">Advantage</button><button class="small" data-quick="dis">Disadvantage</button></div>
        <div class="dt-result" id="dt-result"><p class="small muted">Pick some dice and roll — or roll from the dice tray and watch it here.</p></div>
      </div>
      <div class="dt-stage" id="dt-stage"><canvas id="dt-cv"></canvas><div class="dt-hint">Click the tray to roll again</div></div>
    </div>`;
  document.body.appendChild(win);
  const $ = q => win.querySelector(q);
  const cv = $('#dt-cv'), ctx = cv.getContext('2d'), stage = $('#dt-stage');
  let W = 600, H = 400, dice = [], raf = 0, pending = null, bgImg = null, lastRes = null, bgCanvas = null;

  // ---------- settings ----------
  $('#dt-theme').value = prefs.theme;
  $('#dt-mod').value = prefs.mod || 0;
  const theme = () => THEMES[prefs.theme] || { ...THEMES.tavern, label: 'Custom', pattern: 'image' };
  const mat = () => MATS[prefs.mat] || MATS.tray;
  const dieCol = () => prefs.dieColor || mat().color || (prefs.theme === 'custom' ? '#efe6d2' : theme().die);
  const lum = hex => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  const numCol = () => prefs.numColor || (prefs.dieColor && prefs.mat !== 'custom' ? (lum(prefs.dieColor) > 420 ? '#1e1610' : '#fff8e8') : mat().ink || theme().ink);
  const syncColour = () => { $('#dt-dcol').value = dieCol(); $('#dt-ncol').value = numCol(); $('#dt-mat').value = prefs.mat in MATS ? prefs.mat : 'tray'; };
  syncColour();
  // the picture for your own dice, and the textures for each material
  let dieImg = null;
  const texCache = new Map();
  async function loadDieImg() {
    dieImg = null; texCache.clear();
    if (prefs.mat !== 'custom' || !prefs.dieImg) return;
    const u = await A.url(prefs.dieImg); if (!u) return;
    await new Promise(r => { const im = new Image(); im.onload = () => { dieImg = im; r(); }; im.onerror = r; im.src = u; });
  }
  function texture(kind, base) {
    const key = kind + base + (kind === 'custom' ? prefs.dieImg + (dieImg ? ':ready' : '') : '');
    if (texCache.has(key)) return texCache.get(key);
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    if (kind === 'custom' && dieImg) { const k = Math.max(S / dieImg.width, S / dieImg.height); g.drawImage(dieImg, (S - dieImg.width * k) / 2, (S - dieImg.height * k) / 2, dieImg.width * k, dieImg.height * k); }
    if (kind === 'wood') { for (let i = 0; i < 26; i++) { const y0 = rnd() * S; g.beginPath(); for (let x = 0; x <= S; x += 4) g.lineTo(x, y0 + Math.sin(x / 18 + i) * 3 + Math.sin(x / 7) * 0.8); g.strokeStyle = `rgba(${rnd() > 0.5 ? '60,30,10' : '255,220,170'},${0.12 + rnd() * 0.18})`; g.lineWidth = 0.6 + rnd() * 1.6; g.stroke(); }
      g.beginPath(); g.ellipse(S * 0.6, S * 0.4, 9, 4, 0.2, 0, Math.PI * 2); g.strokeStyle = 'rgba(60,30,10,.35)'; g.lineWidth = 1.4; g.stroke(); }
    if (kind === 'brushed') for (let i = 0; i < 220; i++) { const y = rnd() * S; g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.08})`; g.fillRect(0, y, S, 0.6 + rnd()); }
    if (kind === 'marble') for (let i = 0; i < 7; i++) { g.beginPath(); let x = rnd() * S, y = 0; g.moveTo(x, y); while (y < S) { x += (rnd() - 0.5) * 16; y += 6 + rnd() * 6; g.lineTo(x, y); } g.strokeStyle = `rgba(80,80,90,${0.15 + rnd() * 0.25})`; g.lineWidth = 0.5 + rnd() * 1.8; g.stroke(); }
    if (kind === 'bone') { for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,70,40,${rnd() * 0.12})`; g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); } for (let i = 0; i < 4; i++) { g.beginPath(); let x = rnd() * S, y = rnd() * S; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 18; y += (rnd() - 0.5) * 18; g.lineTo(x, y); } g.strokeStyle = 'rgba(90,60,30,.22)'; g.lineWidth = 0.7; g.stroke(); } }
    if (kind === 'gem') for (let i = 0; i < 14; i++) { g.beginPath(); const x = rnd() * S, y = rnd() * S, s2 = 8 + rnd() * 22; g.moveTo(x, y); g.lineTo(x + s2, y + s2 * 0.3); g.lineTo(x + s2 * 0.4, y + s2); g.closePath(); g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.14})`; g.fill(); }
    texCache.set(key, c);
    return c;
  }
  $('#dt-mat').onchange = async e => {
    const v = e.target.value;
    if (v === 'custom') {
      if (!prefs.dieImg || prefs.mat === 'custom' || confirm('Choose a new picture for your dice? (Cancel keeps the one you used before.)')) {
        const f = await pickFile('image/*');
        if (f) prefs.dieImg = (await A.storeImage(f, { maxDim: 512 })).ref;
        else if (!prefs.dieImg) { e.target.value = prefs.mat; return; }
      }
    }
    prefs.mat = v; prefs.dieColor = ''; prefs.numColor = ''; savePrefs(); await loadDieImg(); syncColour(); draw();
  };
  $('#dt-ncol').oninput = e => { prefs.numColor = e.target.value; savePrefs(); draw(); };
  async function loadBg() {
    bgImg = null;
    if (prefs.theme !== 'custom' || !prefs.bg) return;
    const u = await A.url(prefs.bg); if (!u) return;
    await new Promise(r => { const im = new Image(); im.onload = () => { bgImg = im; r(); }; im.onerror = r; im.src = u; });
  }
  $('#dt-theme').onchange = async e => {
    if (e.target.value === 'custom') {
      if (!prefs.bg) { const f = await pickFile('image/*'); if (!f) { e.target.value = prefs.theme; return; } prefs.bg = (await A.storeImage(f, { maxDim: 1600 })).ref; }
      else if (prefs.theme === 'custom' || confirm('Choose a new picture? (Cancel keeps the one you used before.)')) { const f = await pickFile('image/*'); if (f) prefs.bg = (await A.storeImage(f, { maxDim: 1600 })).ref; }
    }
    prefs.theme = e.target.value; savePrefs(); syncColour(); await loadBg(); paintBg(); draw();
  };
  $('#dt-dcol').oninput = e => { prefs.dieColor = e.target.value; savePrefs(); draw(); };
  $('#dt-dreset').onclick = () => { prefs.dieColor = ''; prefs.numColor = ''; savePrefs(); syncColour(); draw(); };

  // ---------- the pool ----------
  const poolExpr = () => {
    const parts = TYPES.filter(n => prefs.pool[n] > 0).map(n => `${prefs.pool[n]}d${n}`);
    const m = +prefs.mod || 0;
    return parts.length ? parts.join('+') + (m ? (m > 0 ? '+' : '') + m : '') : '';
  };
  function drawPool() {
    for (const n of TYPES) { const c = win.querySelector(`[data-count="${n}"]`); c.textContent = prefs.pool[n] > 0 ? '×' + prefs.pool[n] : ''; c.parentElement.classList.toggle('on', prefs.pool[n] > 0); }
    const ex = poolExpr();
    $('#dt-expr').textContent = ex ? ex.replace(/\+/g, ' + ').replace(/\+ -/g, '− ') : 'No dice yet';
    $('#dt-roll').disabled = !ex;
  }
  const addDie = (n, d) => { prefs.pool[n] = Math.max(0, Math.min(30, (prefs.pool[n] || 0) + d)); lastQuick = ''; savePrefs(); drawPool(); };
  win.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = () => addDie(+b.dataset.add, 1);
    b.oncontextmenu = e => { e.preventDefault(); addDie(+b.dataset.add, -1); };
  });
  win.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { prefs.mod = (+prefs.mod || 0) + +b.dataset.mod; $('#dt-mod').value = prefs.mod; savePrefs(); drawPool(); });
  $('#dt-mod').oninput = e => { prefs.mod = +e.target.value || 0; savePrefs(); drawPool(); };
  $('#dt-clear').onclick = () => { prefs.pool = {}; prefs.mod = 0; $('#dt-mod').value = 0; savePrefs(); drawPool(); };
  const doRoll = expr => { try { pending = 'self'; const r = rollAndLog(expr); pending = null; throwDice(r); } catch (err) { pending = null; toast(err.message); } };
  $('#dt-roll').onclick = () => { const ex = poolExpr(); lastQuick = ''; if (ex) doRoll(ex); };
  win.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { lastQuick = b.dataset.quick; doRoll(b.dataset.quick); });
  let lastQuick = '';
  stage.addEventListener('click', () => { if (dice.some(d => !d.settled)) return; const ex = lastQuick || poolExpr() || lastRes?.input; if (ex) doRoll(ex); });
  // rolls made anywhere else (the tray, the GM screen) tumble here too while the table is open
  const onRoll = e => { if (pending !== 'self' && e.detail) throwDice(e.detail); };
  window.addEventListener('lf-roll', onRoll);

  // ---------- the tray ----------
  const RIM = 22;
  function resize() {
    const r = stage.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBg();
  }
  // the felt and rim are painted once into their own canvas
  function paintBg() {
    const dpr = devicePixelRatio || 1, t = theme();
    bgCanvas = document.createElement('canvas'); bgCanvas.width = W * dpr; bgCanvas.height = H * dpr;
    const g = bgCanvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // rim
    const rg = g.createLinearGradient(0, 0, 0, H); rg.addColorStop(0, t.rim[0]); rg.addColorStop(1, t.rim[1]);
    g.fillStyle = rg; rr(g, 0, 0, W, H, 18); g.fill();
    g.save(); rr(g, RIM, RIM, W - RIM * 2, H - RIM * 2, 10); g.clip();
    const iw = W - RIM * 2, ih = H - RIM * 2;
    if (prefs.theme === 'custom' && bgImg) {
      const s = Math.max(iw / bgImg.width, ih / bgImg.height);
      g.drawImage(bgImg, RIM + (iw - bgImg.width * s) / 2, RIM + (ih - bgImg.height * s) / 2, bgImg.width * s, bgImg.height * s);
    } else {
      const fg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7); fg.addColorStop(0, t.felt); fg.addColorStop(1, t.felt2);
      g.fillStyle = fg; g.fillRect(0, 0, W, H);
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      if (t.pattern === 'felt') { for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},.05)`; g.fillRect(RIM + rnd() * iw, RIM + rnd() * ih, 1.5, 1.5); } }
      if (t.pattern === 'tiles') { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let y = RIM; y < H; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = RIM + ((y / 48) % 2) * 34; x < W; x += 68) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 48); g.stroke(); } }
        for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(RIM + rnd() * iw, RIM + rnd() * ih, 2, 2); } }
      if (t.pattern === 'map') { g.strokeStyle = 'rgba(90,60,30,.18)'; g.lineWidth = 1.2; for (let k = 0; k < 9; k++) { g.beginPath(); let x = RIM + rnd() * iw, y = RIM + rnd() * ih; g.moveTo(x, y); for (let j = 0; j < 30; j++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
        g.font = 'italic 20px "Cormorant Garamond", Georgia, serif'; g.fillStyle = 'rgba(90,60,30,.25)'; g.fillText('Here be dragons', RIM + iw * 0.12, RIM + ih * 0.85); g.fillText('Terra Incognita', RIM + iw * 0.55, RIM + ih * 0.2); }
      if (t.pattern === 'stars') { for (let i = 0; i < 260; i++) { const a = rnd(); g.fillStyle = `rgba(220,230,255,${0.3 + a * 0.7})`; g.beginPath(); g.arc(RIM + rnd() * iw, RIM + rnd() * ih, a * 1.6, 0, Math.PI * 2); g.fill(); } }
      if (t.pattern === 'runes') { g.font = '26px serif'; g.fillStyle = 'rgba(216,182,96,.13)'; const R = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'; for (let i = 0; i < 40; i++) g.fillText(R[Math.floor(rnd() * R.length)], RIM + rnd() * iw, RIM + rnd() * ih);
        g.strokeStyle = 'rgba(216,182,96,.22)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, Math.min(iw, ih) * 0.36, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, Math.min(iw, ih) * 0.3, 0, Math.PI * 2); g.stroke(); }
    }
    // a soft inner shadow under the rim
    const sh = g.createLinearGradient(0, RIM, 0, RIM + 30); sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(RIM, RIM, iw, 30);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; rr(g, RIM, RIM, W - RIM * 2, H - RIM * 2, 10); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1.5; rr(g, 3, 3, W - 6, H - 6, 16); g.stroke();
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------- throwing & physics ----------
  function throwDice(res) {
    lastRes = res;
    const list = [];
    for (const p of res.parts) if (p.rolls) for (const r of p.rolls) list.push({ n: p.sides, v: r.v, kept: r.kept });
    const shown = list.slice(0, 40);
    const size = Math.max(20, Math.min(36, Math.sqrt(W * H / Math.max(4, shown.length)) * 0.22));
    // dice come in from the lower-right corner, spread out, with a good spin
    dice = shown.map((d, i) => {
      const a = Math.PI + 0.35 + Math.random() * 0.5, sp = 13 + Math.random() * 7;
      return { ...d, r: size * (d.n === 100 ? 1.1 : d.n === 4 ? 0.95 : 1), x: W - RIM - size - Math.random() * 60, y: H - RIM - size - Math.random() * 60 - (i % 4) * 8,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: Math.random() * 6, va: (Math.random() - 0.5) * 0.6, z: 30 + Math.random() * 25, vz: 4 + Math.random() * 3,
        face: 1 + Math.floor(Math.random() * d.n), t: 0, settled: false, pop: 0 };
    });
    $('#dt-result').innerHTML = `<p class="small muted">Rolling ${esc(res.input)}…</p>`;
    cancelAnimationFrame(raf); lastT = 0; raf = requestAnimationFrame(frame);
  }
  // physics runs in fixed 60-per-second steps, however fast the screen redraws
  let lastT = 0, acc = 0;
  function frame(now) {
    if (!lastT) lastT = now - 16.7;
    acc = Math.min(acc + (now - lastT), 120); lastT = now;
    let going = true;
    while (acc >= 16.7 && going) { going = step(); acc -= 16.7; }
    draw();
    if (going) raf = requestAnimationFrame(frame); else showResult();
  }
  function step() {
    let moving = false;
    for (const d of dice) {
      if (d.settled) { d.pop = Math.max(0, d.pop - 0.06); continue; }
      d.t++;
      // fall and bounce on the felt
      d.vz -= 0.9; d.z += d.vz; if (d.z <= 0) { d.z = 0; d.vz = Math.abs(d.vz) * 0.45; if (d.vz < 1.2) d.vz = 0; d.vx *= 0.9; d.vy *= 0.9; d.va *= 0.85; }
      d.x += d.vx; d.y += d.vy; d.ang += d.va;
      const fr = d.z > 0 ? 0.995 : 0.955; d.vx *= fr; d.vy *= fr; d.va *= d.z > 0 ? 0.995 : 0.94;
      // walls
      const lo = RIM + d.r, hx = W - RIM - d.r, hy = H - RIM - d.r;
      if (d.x < lo) { d.x = lo; d.vx = Math.abs(d.vx) * 0.7; d.va += d.vy * 0.02; } if (d.x > hx) { d.x = hx; d.vx = -Math.abs(d.vx) * 0.7; d.va -= d.vy * 0.02; }
      if (d.y < lo) { d.y = lo; d.vy = Math.abs(d.vy) * 0.7; d.va -= d.vx * 0.02; } if (d.y > hy) { d.y = hy; d.vy = -Math.abs(d.vy) * 0.7; d.va += d.vx * 0.02; }
      // tumbling faces while it moves
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 1.2 && d.t % 4 === 0) d.face = 1 + Math.floor(Math.random() * d.n);
      if (sp < 0.25 && Math.abs(d.va) < 0.02 && d.z === 0 && d.t > 25) { d.settled = true; d.face = d.v; d.pop = 1; d.vx = d.vy = 0; }
      else moving = true;
    }
    // dice knock into each other
    for (let i = 0; i < dice.length; i++) for (let j = i + 1; j < dice.length; j++) {
      const a = dice[i], b = dice[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.01, min = (a.r + b.r) * 0.92;
      if (dist < min) {
        const nx = dx / dist, ny = dy / dist, push = (min - dist) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { const imp = -rv * 0.85; a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp; if (!a.settled || !b.settled) { a.va += (Math.random() - 0.5) * 0.2; b.va += (Math.random() - 0.5) * 0.2; } }
        if (a.settled && Math.hypot(a.vx, a.vy) > 0.3) a.settled = false; if (b.settled && Math.hypot(b.vx, b.vy) > 0.3) b.settled = false;
      }
    }
    return moving || dice.some(d => d.pop > 0);
  }

  // ---------- drawing ----------
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + f)))); return `rgb(${c(16)},${c(8)},${c(0)})`; }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
    const t = theme(), body = dieCol(), M = mat();
    const light = lum(body) > 420;
    const ink = numCol();
    const texKind = prefs.mat === 'custom' ? 'custom' : M.tex;
    const tex = texKind ? texture(texKind, body) : null, pat = tex ? ctx.createPattern(tex, 'repeat') : null;
    for (const d of [...dice].sort((a, b) => a.z - b.z)) {
      const lift = 1 + d.z / 90, pop = 1 + d.pop * 0.18, r = d.r * lift * pop, pts = shape(d.n, r);
      // shadow
      ctx.save(); ctx.translate(d.x + 4 + d.z * 0.5, d.y + 6 + d.z * 0.7); ctx.rotate(d.ang);
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${0.22 / lift})`; ctx.fill(); ctx.scale(0.86, 0.86); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(d.x, d.y - d.z * 0.4); ctx.rotate(d.ang);
      ctx.globalAlpha = d.kept === false && d.settled ? 0.45 : 1;
      if (t.glow && d.settled && d.pop > 0) { ctx.shadowColor = t.edge; ctx.shadowBlur = 24 * d.pop; }
      // body: the material's surface, then light from the top left
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      const baseA = ctx.globalAlpha;
      if (M.glass) ctx.globalAlpha = baseA * 0.85;
      if (pat) { if (pat.setTransform) pat.setTransform(prefs.mat === 'custom' ? new DOMMatrix().translate(-r * 1.15, -r * 1.15).scale(r * 2.3 / 128) : new DOMMatrix()); ctx.fillStyle = pat; ctx.fill(); }
      const g = ctx.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.1, 0, 0, r * 1.2);
      if (pat) { g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.38)'); }
      else { g.addColorStop(0, shade(body, 0.35)); g.addColorStop(0.55, body); g.addColorStop(1, shade(body, -0.35)); }
      ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
      ctx.globalAlpha = baseA;
      // metal and obsidian catch a bright streak of light
      if (M.shine) { ctx.save(); ctx.clip(); const sg = ctx.createLinearGradient(-r, -r, r, r); sg.addColorStop(0.3, 'rgba(255,255,255,0)'); sg.addColorStop(0.42, `rgba(255,255,255,${0.5 * M.shine})`); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6); ctx.restore(); }
      if (M.glass) { ctx.save(); ctx.clip(); ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.35, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); ctx.restore(); }
      ctx.lineJoin = 'round'; ctx.strokeStyle = prefs.mat === 'custom' ? 'rgba(0,0,0,.6)' : shade(body, -0.5); ctx.lineWidth = 2; ctx.stroke();
      // facets
      ctx.strokeStyle = light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.2;
      if (d.n === 20) { const tri = [[0, -r * 0.62], [r * 0.56, r * 0.36], [-r * 0.56, r * 0.36]]; ctx.beginPath(); tri.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke(); ctx.beginPath(); pts.forEach(([x, y], i) => { const q = tri[Math.round(i / 2) % 3]; ctx.moveTo(x, y); ctx.lineTo(q[0], q[1]); }); ctx.stroke(); }
      else if (d.n === 12) { const pen = shape(12, r * 0.55); ctx.beginPath(); pen.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke(); ctx.beginPath(); pts.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(pen[i][0], pen[i][1]); }); ctx.stroke(); }
      else if (d.n === 8 || d.n === 4) { ctx.beginPath(); pts.forEach(([x, y]) => { ctx.moveTo(0, 0); ctx.lineTo(x, y); }); ctx.stroke(); }
      else if (d.n === 10 || d.n === 100) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(0, r * 0.25); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(0, r * 0.25); ctx.moveTo(pts[4][0], pts[4][1]); ctx.lineTo(0, r * 0.25); ctx.stroke(); }
      else if (d.n === 6) { ctx.beginPath(); const q = r * 0.5; ctx.rect(-q, -q, q * 2, q * 2); ctx.stroke(); }
      // the number (kept upright so it's readable once it lands)
      ctx.rotate(-d.ang * (d.settled ? 1 : 0.3));
      const txt = String(d.face);
      const fs = r * (txt.length > 2 ? 0.55 : txt.length > 1 ? 0.7 : 0.82) * (d.n === 4 ? 0.85 : 1);
      ctx.font = `800 ${fs}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nat = d.settled && d.n === 20 && (d.face === 20 || d.face === 1);
      ctx.fillStyle = nat ? (d.face === 20 ? '#ffd24a' : '#ff5a4a') : ink;
      ctx.strokeStyle = nat ? '#000' : light ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'; ctx.lineWidth = nat ? 3 : 1.5;
      const ty = d.n === 4 ? r * 0.18 : d.n === 10 || d.n === 100 ? -r * 0.05 : 0;
      ctx.strokeText(txt, 0, ty); ctx.fillText(txt, 0, ty);
      if ((d.face === 6 || d.face === 9) && d.n > 6) { ctx.fillRect(-fs * 0.25, ty + fs * 0.42, fs * 0.5, Math.max(1.5, fs * 0.07)); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function showResult() {
    const r = lastRes; if (!r) return;
    const dropped = r.parts.some(p => p.rolls?.some(x => !x.kept));
    const breakdown = r.parts.map(p => p.rolls ? `${esc(p.text)}: ${p.rolls.map(x => `<span class="${x.kept ? '' : 'dropped'}">${x.v}</span>`).join(' ')}` : esc(p.text)).join(' · ');
    $('#dt-result').innerHTML = `<div class="dt-total ${r.crit ? 'crit' : r.fumble ? 'fumble' : ''}">${r.total}</div>
      <div class="small"><b>${esc(r.input)}</b>${r.crit ? ' · <span class="nat20">Natural 20!</span>' : r.fumble ? ' · <span class="nat1">Natural 1</span>' : ''}</div>
      <div class="small muted dt-break">${breakdown}${dropped ? '<br>(faded dice don’t count)' : ''}</div>`;
  }

  // ---------- window: drag to move, close ----------
  const head = $('#dt-drag');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button,select,input,label')) return;
    const r = win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const mv = ev => { win.style.left = Math.max(0, Math.min(innerWidth - 120, ev.clientX - ox)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 60, ev.clientY - oy)) + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; win.style.transform = 'none'; };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
  });
  const close = () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('lf-roll', onRoll); window.removeEventListener('keydown', onKey, true); win.remove(); win = null; api = null; };
  $('#dt-close').onclick = close;
  const onKey = e => { if (e.key === 'Escape' && win && !document.querySelector('.modal')) close(); };
  window.addEventListener('keydown', onKey, true);
  const ro = new ResizeObserver(() => { resize(); draw(); }); ro.observe(stage);
  drawPool();
  Promise.all([loadBg(), loadDieImg()]).then(() => { resize(); draw(); });
  api = { roll: doRoll, close };
  return api;
}
