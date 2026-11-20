// Map stickers: small hand-drawn landmarks (mines, castles, dragons…) that take on the colours of the map style.
// Every icon is drawn in a 100×100 box centred on (0,0), standing on y≈+38, then scaled to the size asked for.

// ink styles draw in the map's own ink on paper-coloured fills; colour styles get painted colours
const PAL = {
  parchment: { mode: 'ink', ink: '#3a2b1c', paper: '#efe3c8', shade: '#cbb48a', accent: '#8a3b2b' },
  quill: { mode: 'ink', ink: '#3e2b18', paper: '#e8d6b0', shade: '#c9b083', accent: '#6e2e1c' },
  night: { mode: 'ink', ink: '#d4a24c', paper: '#2a2634', shade: '#3e3650', accent: '#e9c46a', dark: '#0e0c12' },
  atlas: { mode: 'color', ink: '#46362c', soft: true },
  storybook: { mode: 'color', ink: '#2a262c' },
  painted: { mode: 'color', ink: '#3a2c1e', soft: true },
  relief: { mode: 'color', ink: '#2e2a26', soft: true },
  cells: { mode: 'color', ink: '#2e2a30' },
  pastel: { mode: 'color', ink: '#4a4250', soft: true },
  // flat cream silhouettes with a dark red-brown outline, like a classic game map marker
  marker: { mode: 'ink', ink: '#5a1e14', paper: '#efe2bf', shade: '#e2cf9e', accent: '#5a1e14', dark: '#5a1e14', marker: true },
};
const COL = {
  stone: '#bdb6a8', stoneD: '#8e877b', roof: '#c4553f', roofD: '#963a2c', wood: '#a06e40', woodD: '#6e4a2a', fire: '#f08a2c', flame: '#ffd25a',
  water: '#5aa2c4', waterD: '#3a7896', leaf: '#62a04e', leafD: '#3e7438', gold: '#e4b43c', red: '#b8382c', dark: '#2e2830', cloth: '#ece0c4',
  glow: '#b47cf0', glowL: '#e2c8ff', snow: '#f4f6fa', sand: '#dcc08a', bone: '#efe8d6', earth: '#9c8a62', earthD: '#74663e', smoke: '#9a948c',
  scale: '#5e8c4a', scaleD: '#3c6232', wing: '#8a3a32', crystal: '#7cc8e0', crystalL: '#d4f2fa', sea: '#4e86a8',
};
// in ink styles each colour falls back to one of three tones
const INKMAP = {
  stone: 'paper', stoneD: 'shade', roof: 'shade', roofD: 'shade', wood: 'shade', woodD: 'ink', fire: 'accent', flame: 'paper', water: 'shade', waterD: 'shade',
  leaf: 'shade', leafD: 'shade', gold: 'shade', red: 'accent', dark: 'ink', cloth: 'paper', glow: 'shade', glowL: 'paper', snow: 'paper', sand: 'paper',
  bone: 'paper', earth: 'shade', earthD: 'shade', smoke: 'shade', scale: 'shade', scaleD: 'shade', wing: 'shade', crystal: 'paper', crystalL: 'paper', sea: 'shade',
};
export function iconPalette(style) {
  const P = PAL[style] || PAL.parchment;
  const c = P.mode === 'ink' ? k => (k === 'dark' && P.dark) || P[INKMAP[k] || 'paper'] : k => COL[k] || k;
  return { ...P, c };
}

function kit(ctx, P) {
  const c = P.c;
  const fs = (key, stroke = true) => { if (key) { ctx.fillStyle = c(key); ctx.fill(); } if (stroke) { ctx.strokeStyle = P.ink; ctx.stroke(); } };
  return {
    c, P,
    poly(pts, key, stroke = true) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); fs(key, stroke); },
    circ(x, y, r, key, stroke = true) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fs(key, stroke); },
    ell(x, y, rx, ry, key, stroke = true, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); fs(key, stroke); },
    rect(x, y, w, h, key, stroke = true) { ctx.beginPath(); ctx.rect(x, y, w, h); fs(key, stroke); },
    line(pts, w) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); const o = ctx.lineWidth; if (w) ctx.lineWidth = w; ctx.strokeStyle = P.ink; ctx.stroke(); ctx.lineWidth = o; },
    path(fn, key, stroke = true) { ctx.beginPath(); fn(ctx); fs(key, stroke); },
    crenel(x0, x1, y, h = 6, n) { n = n || Math.max(2, Math.round((x1 - x0) / 9)); const w = (x1 - x0) / (n * 2 - 1); const pts = [[x0, y + h]]; for (let i = 0; i < n * 2 - 1; i++) { const x = x0 + i * w, up = i % 2 === 0; pts.push([x, up ? y : y + h], [x + w, up ? y : y + h]); } pts.push([x1, y + h]); return pts; },
  };
}
const shadow = (ctx, w = 36, P) => { ctx.beginPath(); ctx.ellipse(4, 40, w, w * 0.16, 0, 0, Math.PI * 2); ctx.fillStyle = P.mode === 'ink' ? 'rgba(0,0,0,.08)' : 'rgba(20,14,6,.22)'; ctx.fill(); };

const house = (k, x, y, w, h, roof = 'roof') => {
  k.rect(x - w / 2, y - h, w, h, 'cloth');
  k.poly([[x - w / 2 - 3, y - h], [x, y - h - w * 0.62], [x + w / 2 + 3, y - h]], roof);
  k.rect(x - w * 0.12, y - h * 0.55, w * 0.24, h * 0.55, 'woodD');
};
const tree = (k, x, y, r) => { k.rect(x - r * 0.14, y - r * 0.7, r * 0.28, r * 0.7, 'wood'); k.circ(x, y - r * 1.35, r, 'leaf'); k.circ(x - r * 0.3, y - r * 1.6, r * 0.36, 'leafD', false); };

export const ICONS = {
  castle: { label: 'Castle', group: 'Places', draw(k) {
    k.poly(k.crenel(-30, 30, 2), 'stone'); k.rect(-30, 8, 60, 30, 'stone');
    for (const x of [-30, 30]) { k.rect(x - 9, -14, 18, 52, 'stoneD'); k.poly([[x - 12, -14], [x, -38], [x + 12, -14]], 'roof'); }
    k.rect(-11, -26, 22, 34, 'stone'); k.poly([[-14, -26], [0, -50], [14, -26]], 'roof');
    k.line([[0, -50], [0, -60]]); k.poly([[0, -60], [11, -56], [0, -52]], 'red');
    k.path(c => { c.moveTo(-8, 38); c.lineTo(-8, 26); c.arc(0, 26, 8, Math.PI, 0); c.lineTo(8, 38); c.closePath(); }, 'dark');
    k.rect(-3, -16, 6, 8, 'dark');
  } },
  tower: { label: 'Tower', group: 'Places', draw(k) {
    k.poly([[-12, 38], [-10, -18], [10, -18], [12, 38]], 'stone');
    k.poly(k.crenel(-14, 14, -24, 6, 3), 'stoneD');
    k.poly([[-15, -18], [0, -50], [15, -18]], 'roof');
    k.line([[0, -50], [0, -60]]); k.poly([[0, -60], [10, -56], [0, -52]], 'red');
    k.rect(-4, -6, 8, 10, 'dark'); k.rect(-3, 14, 6, 8, 'dark');
    k.path(c => { c.moveTo(-6, 38); c.lineTo(-6, 30); c.arc(0, 30, 6, Math.PI, 0); c.lineTo(6, 38); c.closePath(); }, 'woodD');
  } },
  ruins: { label: 'Ruins', group: 'Places', draw(k) {
    k.poly([[-34, 38], [-34, -6], [-28, -14], [-24, -2], [-18, -10], [-16, 38]], 'stone');
    k.poly([[-6, 38], [-6, -24], [0, -30], [4, -16], [8, -20], [8, 38]], 'stoneD');
    k.poly([[18, 38], [18, 10], [24, 4], [30, 14], [34, 8], [34, 38]], 'stone');
    k.rect(-29, 8, 7, 10, 'dark'); k.rect(-2, -6, 6, 12, 'dark');
    for (const [x, y, r] of [[-12, 36, 4], [12, 35, 5], [40, 36, 3], [-40, 36, 3]]) k.circ(x, y, r, 'stoneD');
  } },
  village: { label: 'Village', group: 'Places', draw(k) {
    house(k, -18, 30, 22, 18); house(k, 16, 34, 20, 16, 'roofD'); house(k, 0, 12, 22, 18);
    k.line([[-26, 38], [26, 38]]);
  } },
  temple: { label: 'Temple', group: 'Places', draw(k) {
    k.rect(-36, 30, 72, 8, 'stoneD'); k.rect(-32, 24, 64, 6, 'stone');
    for (let x = -26; x <= 26; x += 13) k.rect(x - 3.5, -8, 7, 32, 'stone');
    k.rect(-34, -14, 68, 6, 'stone'); k.poly([[-38, -14], [0, -38], [38, -14]], 'stone');
    k.circ(0, -23, 4, 'gold');
  } },
  lighthouse: { label: 'Lighthouse', group: 'Places', draw(k, ctx) {
    k.poly([[-14, 38], [-8, -18], [8, -18], [14, 38]], 'cloth');
    k.poly([[-12.6, 26], [-11.2, 14], [11.2, 14], [12.6, 26]], 'red', false); k.poly([[-10, 2], [-9, -8], [9, -8], [10, 2]], 'red', false);
    k.poly([[-14, 38], [-8, -18], [8, -18], [14, 38]], null);
    k.rect(-11, -22, 22, 4, 'dark'); k.rect(-7, -34, 14, 12, 'flame'); k.poly([[-9, -34], [0, -44], [9, -34]], 'roof');
    ctx.save(); ctx.globalAlpha = 0.35; k.poly([[7, -30], [44, -42], [44, -18]], 'flame', false); k.poly([[-7, -30], [-44, -42], [-44, -18]], 'flame', false); ctx.restore();
  } },
  windmill: { label: 'Windmill', group: 'Places', draw(k) {
    k.poly([[-14, 38], [-10, -6], [10, -6], [14, 38]], 'cloth'); k.poly([[-12, -6], [0, -20], [12, -6]], 'roof');
    k.rect(-4, 24, 8, 14, 'woodD');
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      k.poly([[ca * 6, -12 + sa * 6], [ca * 36, -12 + sa * 36], [ca * 36 + px * 9, -12 + sa * 36 + py * 9], [ca * 8 + px * 9, -12 + sa * 8 + py * 9]], 'cloth'); }
    k.circ(0, -12, 3.5, 'woodD');
  } },
  inn: { label: 'Inn', group: 'Places', draw(k) {
    k.rect(-26, 6, 52, 32, 'cloth'); k.poly([[-30, 6], [-18, -18], [18, -18], [30, 6]], 'roof');
    k.rect(-5, 20, 10, 18, 'woodD'); k.rect(-20, 14, 9, 9, 'flame'); k.rect(11, 14, 9, 9, 'flame');
    k.line([[30, 4], [42, 4]]); k.line([[40, 4], [40, 9]]); k.rect(33, 9, 14, 13, 'gold');
    k.rect(36.5, 12, 6, 7, 'cloth');
  } },
  camp: { label: 'Camp', group: 'Places', draw(k) {
    k.poly([[-36, 36], [-14, -10], [8, 36]], 'cloth'); k.poly([[-14, -10], [-8, 36], [8, 36]], 'sand');
    k.poly([[-18, 36], [-14, 18], [-10, 36]], 'dark'); k.line([[-14, -10], [-14, -18]]);
    for (const [a, b] of [[[16, 38], [36, 30]], [[16, 30], [36, 38]]]) k.line([a, b], 4);
    k.path(c => { c.moveTo(18, 32); c.quadraticCurveTo(20, 18, 26, 8); c.quadraticCurveTo(30, 20, 34, 32); c.closePath(); }, 'fire');
    k.path(c => { c.moveTo(22, 32); c.quadraticCurveTo(24, 24, 26, 18); c.quadraticCurveTo(29, 26, 30, 32); c.closePath(); }, 'flame', false);
  } },
  port: { label: 'Harbour', group: 'Places', draw(k, ctx) {
    ctx.lineWidth *= 1.6;
    k.circ(0, -30, 7, null); k.line([[0, -23], [0, 34]]); k.line([[-14, -12], [14, -12]]);
    k.path(c => { c.moveTo(-30, 10); c.quadraticCurveTo(-26, 34, 0, 34); c.quadraticCurveTo(26, 34, 30, 10); }, null);
    k.poly([[-30, 10], [-36, 16], [-26, 18]], 'dark'); k.poly([[30, 10], [36, 16], [26, 18]], 'dark');
  } },
  mine: { label: 'Mine', group: 'Resources', draw(k) {
    k.path(c => { c.moveTo(-42, 38); c.quadraticCurveTo(-30, -24, 0, -26); c.quadraticCurveTo(30, -24, 42, 38); c.closePath(); }, 'earth');
    k.path(c => { c.moveTo(-14, 38); c.lineTo(-14, 10); c.quadraticCurveTo(0, -4, 14, 10); c.lineTo(14, 38); c.closePath(); }, 'dark');
    k.rect(-18, 2, 5, 36, 'wood'); k.rect(13, 2, 5, 36, 'wood'); k.rect(-21, -2, 42, 6, 'wood');
    k.line([[-24, 36], [24, 36]], 2); k.line([[-24, 31], [24, 31]], 2);
    k.line([[22, -14], [40, -32]], 4); k.path(c => { c.moveTo(30, -36); c.quadraticCurveTo(44, -34, 42, -22); c.quadraticCurveTo(40, -30, 30, -36); }, 'stoneD');
  } },
  rocks: { label: 'Rocky outcrop', group: 'Resources', draw(k) {
    k.poly([[-40, 38], [-34, 6], [-22, -4], [-14, 14], [-10, 38]], 'stoneD');
    k.poly([[-18, 38], [-14, -6], [-2, -30], [12, -20], [18, 2], [22, 38]], 'stone');
    k.poly([[10, 38], [18, 12], [30, 4], [40, 18], [42, 38]], 'stoneD');
    k.line([[-2, -30], [2, -6], [-4, 16]], 1.6); k.line([[30, 4], [28, 22]], 1.4); k.line([[-22, -4], [-24, 20]], 1.4);
  } },
  cave: { label: 'Cave', group: 'Resources', draw(k) {
    k.poly([[-44, 38], [-34, 0], [-18, -22], [4, -30], [24, -16], [38, 4], [44, 38]], 'stone');
    k.path(c => { c.moveTo(-18, 38); c.quadraticCurveTo(-18, 2, 0, 0); c.quadraticCurveTo(18, 2, 18, 38); c.closePath(); }, 'dark');
    k.line([[4, -30], [8, -10]], 1.5); k.line([[-34, 0], [-26, 12]], 1.5); k.line([[24, -16], [22, 0]], 1.5);
    for (const x of [-8, 0, 8]) k.poly([[x - 3, 2], [x, 10], [x + 3, 2]], 'stone', false);
  } },
  crystals: { label: 'Crystals', group: 'Resources', draw(k) {
    const shard = (x, y, w, h, a) => { const ca = Math.cos(a), sa = Math.sin(a), T = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
      k.poly([T(-w, 0), T(-w, -h), T(0, -h - w * 1.4), T(w, -h), T(w, 0)], 'crystal'); k.poly([T(0, 0), T(0, -h - w * 1.4), T(w, -h), T(w, 0)], 'crystalL', false); k.poly([T(-w, 0), T(-w, -h), T(0, -h - w * 1.4), T(w, -h), T(w, 0)], null); };
    shard(-18, 38, 8, 30, -0.35); shard(18, 38, 8, 26, 0.4); shard(0, 38, 11, 48, 0);
    k.ell(0, 38, 34, 5, 'stoneD');
  } },
  farm: { label: 'Farmland', group: 'Resources', draw(k) {
    for (const [x, a] of [[-14, -0.35], [0, 0], [14, 0.35]]) {
      const tx = x + Math.sin(a) * 60, ty = 38 - Math.cos(a) * 60;
      k.line([[x * 0.3, 38], [tx * 0.9, ty + 22]], 2.2);
      k.ell(tx * 0.9, ty + 10, 6, 14, 'gold', true, a);
    }
    k.rect(-12, 20, 24, 6, 'wood');
  } },
  volcano: { label: 'Volcano', group: 'Nature', draw(k, ctx) {
    k.poly([[-46, 38], [-12, -18], [12, -18], [46, 38]], 'earthD');
    k.poly([[-12, -18], [-6, -12], [0, -16], [6, -11], [12, -18], [6, -22], [-6, -22]], 'fire');
    k.path(c => { c.moveTo(-4, -14); c.quadraticCurveTo(-10, 6, -4, 20); c.quadraticCurveTo(-2, 30, -10, 38); c.lineTo(-2, 38); c.quadraticCurveTo(6, 22, 2, 8); c.quadraticCurveTo(0, -2, 4, -14); c.closePath(); }, 'fire', false);
    ctx.save(); ctx.globalAlpha = 0.85;
    for (const [x, y, r] of [[0, -32, 9], [8, -42, 11], [-4, -52, 10], [10, -58, 8]]) k.circ(x, y, r, 'smoke', false);
    ctx.restore();
    k.poly([[-46, 38], [-12, -18], [12, -18], [46, 38]], null);
  } },
  grove: { label: 'Grove', group: 'Nature', draw(k) { tree(k, -22, 32, 17); tree(k, 22, 34, 16); tree(k, 0, 38, 20); } },
  stones: { label: 'Standing stones', group: 'Nature', draw(k) {
    k.ell(0, 30, 40, 10, 'leaf');
    for (const [x, y, w, h] of [[-30, 32, 8, 26], [-12, 22, 7, 22], [10, 22, 7, 24], [28, 32, 8, 28], [0, 38, 9, 30]]) {
      k.path(c => { c.moveTo(x - w, y); c.lineTo(x - w * 0.8, y - h); c.quadraticCurveTo(x, y - h - w * 0.7, x + w * 0.8, y - h); c.lineTo(x + w, y); c.closePath(); }, 'stone');
    }
  } },
  graves: { label: 'Graveyard', group: 'Nature', draw(k) {
    for (const [x, y, s] of [[-24, 30, 1], [0, 24, 1.15], [24, 32, 0.95], [-10, 40, 0.8], [14, 40, 0.8]]) {
      k.path(c => { c.moveTo(x - 7 * s, y); c.lineTo(x - 7 * s, y - 12 * s); c.arc(x, y - 12 * s, 7 * s, Math.PI, 0); c.lineTo(x + 7 * s, y); c.closePath(); }, 'stone');
      k.line([[x, y - 18 * s], [x, y - 8 * s]], 1.4); k.line([[x - 3.5 * s, y - 15 * s], [x + 3.5 * s, y - 15 * s]], 1.4);
    }
  } },
  dragon: { label: 'Dragon', group: 'Creatures', draw(k) {
    // wings behind
    k.path(c => { c.moveTo(-6, 0); c.lineTo(-30, -40); c.lineTo(-24, -20); c.lineTo(-40, -30); c.lineTo(-30, -8); c.lineTo(-44, -12); c.quadraticCurveTo(-28, 4, -10, 10); c.closePath(); }, 'wing');
    k.path(c => { c.moveTo(6, -2); c.lineTo(10, -46); c.lineTo(16, -26); c.lineTo(28, -40); c.lineTo(26, -16); c.lineTo(40, -22); c.quadraticCurveTo(28, 0, 10, 8); c.closePath(); }, 'wing');
    // tail
    k.path(c => { c.moveTo(-14, 22); c.quadraticCurveTo(-40, 30, -38, 14); c.quadraticCurveTo(-36, 6, -44, 4); c.lineTo(-38, 0); c.quadraticCurveTo(-30, 8, -32, 18); c.quadraticCurveTo(-30, 24, -12, 16); c.closePath(); }, 'scale');
    // body, neck, head
    k.path(c => { c.moveTo(-20, 22); c.quadraticCurveTo(-18, 2, 2, 2); c.quadraticCurveTo(16, 2, 18, 12); c.quadraticCurveTo(22, -8, 30, -18); c.lineTo(34, -12);
      c.quadraticCurveTo(28, 4, 26, 22); c.quadraticCurveTo(8, 32, -20, 22); c.closePath(); }, 'scale');
    k.path(c => { c.moveTo(28, -20); c.lineTo(44, -18); c.lineTo(46, -12); c.lineTo(34, -10); c.closePath(); }, 'scale');
    k.poly([[30, -20], [26, -30], [34, -22]], 'bone'); k.circ(37, -16, 1.6, 'dark', false);
    k.path(c => { c.moveTo(-10, 26); c.quadraticCurveTo(-4, 16, 6, 22); }, null);
    for (const x of [-12, 14]) k.poly([[x - 4, 22], [x - 3, 36], [x + 4, 36], [x + 4, 22]], 'scaleD');
    for (const x of [-8, -2, 4, 10]) k.poly([[x, 3], [x + 2.5, -3], [x + 5, 3]], 'red', false);
  } },
  serpent: { label: 'Sea serpent', group: 'Creatures', draw(k) {
    for (const [x, w] of [[-32, 10], [-12, 12], [8, 10]]) k.path(c => { c.moveTo(x - w, 34); c.quadraticCurveTo(x, 34 - w * 2.2, x + w, 34); c.lineTo(x + w * 0.55, 34); c.quadraticCurveTo(x, 34 - w * 1.2, x - w * 0.55, 34); c.closePath(); }, 'scale');
    k.path(c => { c.moveTo(18, 34); c.quadraticCurveTo(22, 0, 32, -8); c.lineTo(46, -6); c.lineTo(44, 2); c.lineTo(34, 2); c.quadraticCurveTo(30, 14, 28, 34); c.closePath(); }, 'scale');
    k.circ(37, -4, 1.6, 'dark', false); k.poly([[30, -8], [28, -18], [35, -9]], 'red');
    for (let x = -44; x <= 44; x += 14) k.path(c => { c.moveTo(x, 38); c.quadraticCurveTo(x + 3.5, 34, x + 7, 38); c.quadraticCurveTo(x + 10.5, 42, x + 14, 38); }, null);
  } },
  skull: { label: 'Danger', group: 'Creatures', draw(k) {
    k.path(c => { c.moveTo(-20, 10); c.quadraticCurveTo(-24, -30, 0, -30); c.quadraticCurveTo(24, -30, 20, 10); c.lineTo(14, 14); c.lineTo(14, 26); c.lineTo(-14, 26); c.lineTo(-14, 14); c.closePath(); }, 'bone');
    k.ell(-9, -4, 6, 7, 'dark'); k.ell(9, -4, 6, 7, 'dark'); k.poly([[0, 4], [-4, 12], [4, 12]], 'dark');
    for (const x of [-8, 0, 8]) k.line([[x, 18], [x, 26]], 1.3);
    k.line([[-30, 32], [30, 40]], 5); k.line([[-30, 40], [30, 32]], 5);
  } },
  battle: { label: 'Battle', group: 'Creatures', draw(k) {
    const sword = flip => { const s = flip ? -1 : 1, T = (u, v) => [s * (u * 0.7 - v * 0.7), u * 0.7 + v * 0.7];
      k.poly([T(-40, -3), T(16, -3), T(22, 0), T(16, 3), T(-40, 3)].map(([x, y]) => [x, y - 4]), 'stone');
      k.poly([T(16, -11), T(20, -11), T(20, 11), T(16, 11)].map(([x, y]) => [x, y - 4]), 'gold');
      k.poly([T(20, -2.5), T(34, -2.5), T(34, 2.5), T(20, 2.5)].map(([x, y]) => [x, y - 4]), 'woodD'); };
    sword(false); sword(true);
  } },
  ship: { label: 'Ship', group: 'Travel', draw(k) {
    k.path(c => { c.moveTo(-38, 18); c.lineTo(38, 18); c.quadraticCurveTo(30, 34, 0, 34); c.quadraticCurveTo(-30, 34, -38, 18); c.closePath(); }, 'wood');
    k.line([[0, 18], [0, -42]], 2.4);
    k.path(c => { c.moveTo(-24, -34); c.quadraticCurveTo(0, -28, 24, -34); c.quadraticCurveTo(28, -10, 24, 12); c.quadraticCurveTo(0, 6, -24, 12); c.quadraticCurveTo(-20, -10, -24, -34); c.closePath(); }, 'cloth');
    k.poly([[0, -42], [12, -38], [0, -34]], 'red');
    for (let x = -44; x <= 44; x += 14) k.path(c => { c.moveTo(x, 38); c.quadraticCurveTo(x + 3.5, 35, x + 7, 38); c.quadraticCurveTo(x + 10.5, 41, x + 14, 38); }, null);
  } },
  wreck: { label: 'Shipwreck', group: 'Travel', draw(k, ctx) {
    ctx.save(); ctx.rotate(0.35);
    k.path(c => { c.moveTo(-34, 14); c.lineTo(20, 14); c.lineTo(14, 20); c.lineTo(26, 24); c.quadraticCurveTo(0, 34, -28, 28); c.closePath(); }, 'woodD');
    k.line([[-4, 14], [-4, -24]], 2.4); k.line([[-4, -24], [10, -32]], 2.4);
    k.poly([[-4, -18], [12, -14], [6, -4], [-4, -6]], 'cloth');
    ctx.restore();
    k.path(c => { c.moveTo(-46, 34); c.lineTo(46, 34); c.lineTo(46, 40); c.lineTo(-46, 40); c.closePath(); }, 'sea', false);
    for (let x = -44; x <= 44; x += 14) k.path(c => { c.moveTo(x, 34); c.quadraticCurveTo(x + 3.5, 31, x + 7, 34); c.quadraticCurveTo(x + 10.5, 37, x + 14, 34); }, null);
  } },
  treasure: { label: 'Treasure', group: 'Travel', draw(k) {
    k.rect(-28, 4, 56, 32, 'wood'); k.path(c => { c.moveTo(-28, 4); c.quadraticCurveTo(-28, -16, 0, -16); c.quadraticCurveTo(28, -16, 28, 4); c.closePath(); }, 'wood');
    for (const x of [-20, 16]) k.rect(x, -14, 4, 50, 'gold');
    k.rect(-6, 0, 12, 12, 'gold'); k.rect(-2, 4, 4, 5, 'dark');
    for (const [x, y] of [[-34, 34], [34, 32], [38, 36]]) k.circ(x, y, 4, 'gold');
  } },
  portal: { label: 'Portal', group: 'Travel', draw(k, ctx) {
    k.path(c => { c.moveTo(-26, 38); c.lineTo(-26, -10); c.arc(0, -10, 26, Math.PI, 0); c.lineTo(26, 38); c.closePath(); }, 'stone');
    k.path(c => { c.moveTo(-17, 38); c.lineTo(-17, -10); c.arc(0, -10, 17, Math.PI, 0); c.lineTo(17, 38); c.closePath(); }, 'glow');
    ctx.save(); ctx.lineWidth *= 0.7;
    for (const r of [5, 10, 14]) k.path(c => { c.arc(0, 8, r, 0.3, Math.PI * 1.6); }, null);
    ctx.restore();
    k.circ(0, 8, 3, 'glowL', false);
    for (const [x, y] of [[-26, -18], [26, -18], [0, -36]]) k.circ(x, y, 3, 'glowL');
  } },
  // ---- cities & crests ----
  city: { label: 'City', group: 'Cities', draw(k) {
    k.poly(k.crenel(-40, 40, 8, 6, 6), 'stone'); k.rect(-40, 14, 80, 24, 'stone');
    for (const [x, h] of [[-26, 30], [-6, 44], [14, 34], [30, 24]]) { k.rect(x - 7, 14 - h, 14, h, 'stoneD'); k.poly([[x - 9, 14 - h], [x, 14 - h - 14], [x + 9, 14 - h]], 'roof'); }
    k.path(c => { c.moveTo(-7, 38); c.lineTo(-7, 28); c.arc(0, 28, 7, Math.PI, 0); c.lineTo(7, 38); c.closePath(); }, 'dark');
  } },
  capital: { label: 'Capital', group: 'Cities', draw(k) {
    k.path(c => { c.moveTo(-32, -26); c.lineTo(32, -26); c.lineTo(32, 6); c.quadraticCurveTo(30, 30, 0, 42); c.quadraticCurveTo(-30, 30, -32, 6); c.closePath(); }, 'cloth');
    k.poly([[-20, 10], [-20, -12], [-10, -2], [0, -16], [10, -2], [20, -12], [20, 10]], 'gold');
    k.rect(-20, 10, 40, 7, 'gold');
    for (const x of [-20, 0, 20]) k.circ(x, x ? -14 : -18, 3, 'red');
  } },
  crest: { label: 'Town crest', group: 'Cities', draw(k) {
    k.path(c => { c.moveTo(-30, -30); c.lineTo(30, -30); c.lineTo(30, 4); c.quadraticCurveTo(28, 28, 0, 40); c.quadraticCurveTo(-28, 28, -30, 4); c.closePath(); }, 'cloth');
    k.poly([[-30, -4], [0, 14], [30, -4], [30, 8], [0, 26], [-30, 8]], 'red');
    k.poly([[-8, -24], [0, -10], [8, -24]], 'red');
  } },
  keep: { label: 'Keep', group: 'Cities', draw(k) {
    k.rect(-22, -12, 44, 50, 'stone'); k.poly(k.crenel(-26, 26, -22, 10, 4), 'stone');
    k.rect(-6, -2, 12, 14, 'dark'); k.path(c => { c.moveTo(-9, 38); c.lineTo(-9, 26); c.arc(0, 26, 9, Math.PI, 0); c.lineTo(9, 38); c.closePath(); }, 'dark');
  } },
  // ---- dungeons ----
  barrow: { label: 'Barrow tomb', group: 'Dungeons', draw(k) {
    k.path(c => { c.moveTo(-44, 38); c.quadraticCurveTo(-40, -10, 0, -14); c.quadraticCurveTo(40, -10, 44, 38); c.closePath(); }, 'earth');
    k.path(c => { c.moveTo(-22, 38); c.lineTo(-22, 4); c.lineTo(0, -22); c.lineTo(22, 4); c.lineTo(22, 38); c.closePath(); }, 'stone');
    k.path(c => { c.moveTo(-12, 38); c.lineTo(-12, 8); c.lineTo(0, -6); c.lineTo(12, 8); c.lineTo(12, 38); c.closePath(); }, 'dark');
    for (const x of [-17, 17]) k.path(c => { c.arc(x, 18, 3, 0, Math.PI * 1.6); }, null);
  } },
  dwarven: { label: 'Dwarven ruin', group: 'Dungeons', draw(k) {
    const cog = (x, y, r) => { const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r : r * 1.28; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } k.poly(pts, 'gold'); k.circ(x, y, r * 0.45, 'dark'); };
    k.poly([[-14, 38], [-10, -26], [10, -26], [14, 38]], 'stoneD'); k.poly([[-16, -26], [0, -42], [16, -26]], 'stone');
    cog(-22, 20, 13); cog(20, 4, 11); k.rect(-4, 22, 8, 16, 'dark');
  } },
  tomb: { label: 'Tomb', group: 'Dungeons', draw(k) {
    k.poly([[-26, 38], [-26, -8], [0, -34], [26, -8], [26, 38]], 'stone'); k.poly([[-32, -6], [0, -40], [32, -6], [26, -6], [0, -32], [-26, -6]], 'stoneD');
    k.rect(-10, 4, 20, 34, 'dark'); k.line([[0, -22], [0, -12]], 3); k.line([[-5, -18], [5, -18]], 3);
  } },
  arch: { label: 'Broken arch', group: 'Dungeons', draw(k) {
    k.path(c => { c.moveTo(-34, 38); c.lineTo(-34, -4); c.arc(0, -4, 34, Math.PI, Math.PI * 1.72); c.lineTo(12, -24); c.arc(0, -4, 22, Math.PI * 1.62, Math.PI, true); c.lineTo(-22, 38); c.closePath(); }, 'stone');
    k.poly([[22, 38], [22, -2], [34, 4], [34, 38]], 'stoneD'); k.circ(10, 34, 4, 'stoneD'); k.circ(-2, 36, 3, 'stoneD');
  } },
  fort: { label: 'Fort', group: 'Dungeons', draw(k) {
    k.rect(-34, 6, 68, 32, 'stone'); k.poly(k.crenel(-34, 34, -2, 8, 6), 'stone');
    for (const x of [-30, 30]) { k.rect(x - 8, -16, 16, 54, 'stoneD'); k.poly(k.crenel(x - 10, x + 10, -24, 8, 2), 'stoneD'); }
    k.rect(-8, 18, 16, 20, 'dark'); k.line([[0, -2], [0, -30]], 2); k.poly([[0, -30], [14, -26], [0, -22]], 'red');
  } },
  watchtower: { label: 'Watchtower', group: 'Dungeons', draw(k) {
    k.line([[-16, 38], [-8, -14]], 4); k.line([[16, 38], [8, -14]], 4); k.line([[-13, 20], [13, 20]], 3); k.line([[-14, 24], [10, 2]], 2.4); k.line([[14, 24], [-10, 2]], 2.4);
    k.rect(-16, -24, 32, 12, 'wood'); k.poly([[-20, -24], [0, -44], [20, -24]], 'roof');
  } },
  // ---- other ----
  shrine: { label: 'Shrine', group: 'Mystic', draw(k) {
    k.rect(-24, 30, 48, 8, 'stoneD'); k.poly([[-12, 30], [-8, -30], [0, -42], [8, -30], [12, 30]], 'stone');
    k.ell(0, -4, 8, 5, 'glowL'); k.circ(0, -4, 3, 'dark', false);
    k.line([[-4, 10], [4, 10]], 2); k.line([[-4, 18], [4, 18]], 2);
  } },
  lair: { label: 'Dragon lair', group: 'Mystic', draw(k) {
    k.path(c => { c.moveTo(-46, 38); c.quadraticCurveTo(-30, 0, 0, -2); c.quadraticCurveTo(30, 0, 46, 38); c.closePath(); }, 'earth');
    k.path(c => { c.moveTo(-26, 14); c.quadraticCurveTo(0, -34, 26, 14); c.lineTo(20, 14); c.quadraticCurveTo(0, -22, -20, 14); c.closePath(); }, 'stone');
    for (const x of [-10, 0, 10]) k.line([[x - 2, 2 - Math.abs(x) * 0.4], [x + 2, -6 - Math.abs(x) * 0.4]], 1.6);
    k.path(c => { c.moveTo(-6, 36); c.lineTo(-14, 22); c.lineTo(-4, 26); c.lineTo(0, 16); c.lineTo(4, 26); c.lineTo(14, 22); c.lineTo(6, 36); c.closePath(); }, 'bone');
  } },
  pass: { label: 'Mountain pass', group: 'Mystic', draw(k) {
    k.poly([[-46, 38], [-20, -30], [-2, 38]], 'stone'); k.poly([[2, 38], [22, -22], [46, 38]], 'stoneD');
    k.poly([[-20, -30], [-28, -10], [-20, -14], [-12, -8]], 'snow', false); k.poly([[-46, 38], [-20, -30], [-2, 38]], null);
    k.path(c => { c.moveTo(-4, 38); c.quadraticCurveTo(0, 22, 4, 14); c.moveTo(4, 38); c.quadraticCurveTo(6, 26, 4, 14); }, null);
  } },
  clearing: { label: 'Clearing', group: 'Mystic', draw(k) {
    k.ell(0, 28, 34, 10, 'leaf');
    for (const [x, y, r] of [[-30, 14, 10], [30, 14, 10], [-18, 0, 9], [18, 0, 9], [0, -6, 8]]) { k.rect(x - 1.5, y + r * 0.6, 3, r * 0.8, 'wood'); k.poly([[x - r, y + r * 0.7], [x, y - r * 1.3], [x + r, y + r * 0.7]], 'leafD'); }
  } },
  // ---- camps ----
  giantcamp: { label: 'Giant camp', group: 'Camps', draw(k) {
    for (const s of [-1, 1]) k.path(c => { c.moveTo(s * 34, 38); c.quadraticCurveTo(s * 40, -10, s * 4, -30); c.quadraticCurveTo(s * 28, -6, s * 24, 38); c.closePath(); }, 'bone');
    k.path(c => { c.moveTo(-10, 36); c.quadraticCurveTo(-8, 18, 0, 8); c.quadraticCurveTo(8, 18, 10, 36); c.closePath(); }, 'fire');
    k.line([[-14, 38], [14, 38]], 4);
  } },
  warcamp: { label: 'War camp', group: 'Camps', draw(k) {
    k.poly([[-42, 38], [-24, 4], [-6, 38]], 'cloth'); k.poly([[2, 38], [22, -2], [42, 38]], 'cloth');
    k.poly([[-26, 38], [-24, 24], [-22, 38]], 'dark'); k.poly([[20, 38], [22, 22], [24, 38]], 'dark');
    k.line([[-2, 38], [-2, -40]], 2.4); k.poly([[-2, -40], [18, -34], [-2, -26]], 'red');
  } },
  hideout: { label: 'Bandit hideout', group: 'Camps', draw(k) {
    k.poly([[-36, 38], [-10, -6], [16, 38]], 'cloth'); k.poly([[-10, -6], [-4, 38], [16, 38]], 'sand');
    k.line([[-10, -6], [-10, -36]], 2.2); k.poly([[-10, -36], [12, -30], [-10, -24]], 'dark');
    k.circ(26, 28, 7, 'stoneD'); k.line([[22, 38], [30, 18]], 2); k.line([[30, 38], [22, 18]], 2);
  } },
  stronghold: { label: 'Stronghold', group: 'Camps', draw(k) {
    const pts = []; for (let x = -40; x <= 40; x += 8) pts.push([x, 0], [x + 4, -12]);
    k.poly([[-40, 38], ...pts.slice(0, -1), [40, 0], [40, 38]], 'wood');
    for (let x = -36; x <= 36; x += 8) k.line([[x, 4], [x, 38]], 1);
    k.path(c => { c.moveTo(-10, 38); c.lineTo(-10, 20); c.arc(0, 20, 10, Math.PI, 0); c.lineTo(10, 38); c.closePath(); }, 'dark');
    k.poly([[-6, -12], [0, -30], [6, -12]], 'bone'); k.poly([[18, -10], [24, -24], [30, -10]], 'bone'); k.poly([[-30, -10], [-24, -24], [-18, -10]], 'bone');
  } },
  // ---- homesteads ----
  shack: { label: 'Shack', group: 'Homesteads', draw(k) {
    k.poly([[-22, 38], [-22, 4], [24, 0], [24, 38]], 'wood'); k.poly([[-28, 6], [-2, -22], [30, 2]], 'woodD');
    k.rect(-6, 18, 12, 20, 'dark'); for (const y of [12, 22, 32]) k.line([[-22, y], [-10, y]], 1);
  } },
  stable: { label: 'Stable', group: 'Homesteads', draw(k, ctx) {
    ctx.lineWidth *= 1.2;
    k.path(c => { c.moveTo(-24, 34); c.lineTo(-24, -4); c.arc(0, -4, 24, Math.PI, 0); c.lineTo(24, 34); c.lineTo(12, 34); c.lineTo(12, -4); c.arc(0, -4, 12, 0, Math.PI, true); c.lineTo(-12, 34); c.closePath(); }, 'stoneD');
    for (const [x, y] of [[-18, 26], [-18, 8], [-12, -14], [18, 26], [18, 8], [12, -14]]) k.circ(x, y, 2, 'dark', false);
  } },
  lumbermill: { label: 'Lumber mill', group: 'Homesteads', draw(k) {
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 26 : 32; pts.push([Math.cos(a) * r, -6 + Math.sin(a) * r]); }
    k.poly(pts, 'stone'); k.circ(0, -6, 6, 'dark');
    for (const y of [26, 34]) k.path(c => { c.rect(-40, y - 4, 80, 8); }, 'wood');
    k.ell(40, 26, 3, 4, 'woodD'); k.ell(40, 34, 3, 4, 'woodD');
  } },
  well: { label: 'Well', group: 'Homesteads', draw(k) {
    k.rect(-22, 14, 44, 24, 'stone'); for (const x of [-11, 0, 11]) k.line([[x, 14], [x, 38]], 1); k.line([[-22, 26], [22, 26]], 1);
    k.line([[-18, 14], [-18, -20]], 3.4); k.line([[18, 14], [18, -20]], 3.4); k.poly([[-26, -18], [0, -36], [26, -18]], 'roof');
    k.line([[0, -18], [0, 4]], 1.4); k.rect(-5, 4, 10, 8, 'wood');
  } },
  marker: { label: 'Point of interest', group: 'Travel', draw(k) {
    k.path(c => { c.moveTo(0, 38); c.quadraticCurveTo(-28, 0, -24, -14); c.arc(0, -14, 24, Math.PI, 0); c.quadraticCurveTo(28, 0, 0, 38); c.closePath(); }, 'red');
    const st = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6 : 14; st.push([Math.cos(a) * r, -14 + Math.sin(a) * r]); }
    k.poly(st, 'gold');
  } },
};
export const ICON_GROUPS = [...new Set(Object.values(ICONS).map(i => i.group))];

// draw one sticker centred at (x, y) and `size` pixels tall, in the colours of the given map style
export function drawIcon(ctx, id, x, y, size, style, opts = {}) {
  const ic = ICONS[id]; if (!ic) return;
  const P = iconPalette(opts.look === 'marker' ? 'marker' : style);
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // a soft paper halo keeps stickers readable over busy terrain
  if (opts.halo !== false) { ctx.beginPath(); ctx.ellipse(0, 4, 50, 46, 0, 0, Math.PI * 2); const g = ctx.createRadialGradient(0, 4, 10, 0, 4, 52);
    const hc = P.marker ? '#fff6dc' : P.mode === 'ink' ? P.paper : '#fff8e8'; g.addColorStop(0, hexA(hc, P.mode === 'ink' ? 0.55 : 0.28)); g.addColorStop(1, hexA(hc, 0)); ctx.fillStyle = g; ctx.fill(); }
  shadow(ctx, 36, P);
  ctx.lineWidth = P.marker ? 3.6 : P.mode === 'ink' ? 2.6 : 2.2;
  ic.draw(kit(ctx, P), ctx);
  ctx.restore();
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// a small picture of an icon for the tool palette
const thumbCache = new Map();
export function iconThumb(id, style, px = 44, look = '') {
  const key = id + style + px + look;
  if (!thumbCache.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = px * 2;
    const ctx = c.getContext('2d');
    drawIcon(ctx, id, px, px * 1.05, px * 1.7, style, { halo: false, look });
    thumbCache.set(key, c.toDataURL());
  }
  return thumbCache.get(key);
}
