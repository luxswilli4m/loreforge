// Cosmos: a spinnable 3D star chart of worlds, moons, stars and planes, with portals between them.
// Bodies can open their maps; everything lives in world.cosmos = { bodies: [], links: [] }.
import { W, uid, save, getMap, getEntry, newEntry, TYPES } from '../store.js';
import { esc, md, openModal, closeModal, confirmDialog, editorHTML, attachEditor, typeColor, toast } from '../util.js';
import * as A from '../assets.js';

const KINDS = { star: ['☀️', 'Star'], planet: ['🪐', 'World'], moon: ['🌙', 'Moon'], plane: ['🌀', 'Plane'], demiplane: ['✨', 'Demiplane'], other: ['☄️', 'Other'] };
const LINKS = { portal: ['🌀', 'Portal', '#c77dff'], route: ['🚀', 'Route', '#5fa8d3'], orbit: ['🪐', 'Orbit', '#9aa4b8'], bond: ['🔗', 'Bond', '#d4a24c'] };
const COLORS = ['#e9c46a', '#5fa8d3', '#81b29a', '#e07a5f', '#c77dff', '#9aa4b8', '#f4a261', '#2a9d8f', '#e76f51', '#a8dadc'];

const cam = { yaw: 0.6, pitch: 0.35, dist: 420, tx: 0, ty: 0, tz: 0, spin: true };
let selected = null; // { kind: 'body' | 'link', id }

const kindOf = b => { const k = KINDS[b.kind] || KINDS.other; return b.typeName ? ['✦', b.typeName] : k; };
const bodyR = b => b.kind === 'star' ? 10 + b.size * 2.6 : b.kind === 'moon' ? 3 + b.size * 1.1 : 4 + b.size * 2;

export function render(main) {
  const w = W(), cz = w.cosmos;
  main.innerHTML = `
    <div class="page-head"><h1>Cosmos</h1><span class="muted small cz-hint">Drag to turn · scroll to zoom · Shift-drag a selected body to move it · double-click to focus</span>
      <button id="cz-spin">${cam.spin ? '⏸ Pause' : '▶ Spin'}</button><button id="cz-link">＋ Connection</button><button class="primary" id="cz-add">＋ World or plane</button></div>
    <div class="cosmos-shell">
      <div class="cosmos-stage" id="stage"><canvas></canvas><div class="tl-tip hidden" id="tip"></div>
        ${cz.bodies.length ? '' : `<div class="cosmos-empty"><div class="big">🌌</div><p>Chart the worlds, moons, stars and planes of your setting, and the portals between them.</p>
          <div class="row" style="justify-content:center;gap:8px"><button class="primary" id="cz-example">✨ Start with an example cosmos</button><button id="cz-add2">＋ Add a world</button></div></div>`}
      </div>
      <div class="card side-box cosmos-side" id="side"></div>
    </div>`;
  const stage = main.querySelector('#stage'), cv = stage.querySelector('canvas'), tip = main.querySelector('#tip'), side = main.querySelector('#side');

  // background stars, fixed in space
  const stars = [];
  { let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) { const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u); stars.push([r * Math.cos(t) * 1500, u * 1500, r * Math.sin(t) * 1500, 0.3 + rnd() * 1.4, rnd()]); } }

  let proj = new Map(), linkProj = [], hover = null, drag = null, raf = 0, t0 = performance.now();
  const project = (x, y, z, Wd, Hd) => {
    x -= cam.tx; y -= cam.ty; z -= cam.tz;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = Math.min(Wd, Hd) * 0.9, d = cam.dist - z2;
    if (d < 5) return null;
    const s = f / d;
    return { x: Wd / 2 + x1 * s, y: Hd / 2 - y1 * s, s, depth: z2 };
  };

  function draw(now) {
    const Wd = stage.clientWidth, Hd = stage.clientHeight, dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(Wd * dpr) || cv.height !== Math.round(Hd * dpr)) { cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr); cv.style.width = Wd + 'px'; cv.style.height = Hd + 'px'; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const time = (now - t0) / 1000;
    // deep space
    const bg = c.createRadialGradient(Wd * 0.5, Hd * 0.45, 0, Wd * 0.5, Hd * 0.5, Math.max(Wd, Hd) * 0.75);
    bg.addColorStop(0, '#141a33'); bg.addColorStop(0.6, '#0a0c1a'); bg.addColorStop(1, '#04050b');
    c.fillStyle = bg; c.fillRect(0, 0, Wd, Hd);
    // nebula wisps
    for (const [x, y, r, col] of [[0.25, 0.3, 0.35, 'rgba(120,60,180,.10)'], [0.75, 0.65, 0.4, 'rgba(40,110,170,.09)'], [0.6, 0.2, 0.25, 'rgba(200,90,120,.06)']]) {
      const g = c.createRadialGradient(Wd * x, Hd * y, 0, Wd * x, Hd * y, Math.max(Wd, Hd) * r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
    }
    for (const [x, y, z, sz, tw] of stars) {
      const p = project(x + cam.tx, y + cam.ty, z + cam.tz, Wd, Hd); if (!p) continue;
      c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + tw * 20)) * 0.6 + 0.2;
      c.fillStyle = '#dfe6ff'; c.fillRect(p.x, p.y, sz, sz);
    }
    c.globalAlpha = 1;

    proj = new Map();
    for (const b of cz.bodies) { const p = project(b.x, b.y, b.z, Wd, Hd); if (p) proj.set(b.id, { ...p, r: Math.max(2, bodyR(b) * p.s), b }); }
    // connections
    linkProj = [];
    for (const l of cz.links) {
      const pa = proj.get(l.a), pb = proj.get(l.b);
      const A_ = cz.bodies.find(b => b.id === l.a), B_ = cz.bodies.find(b => b.id === l.b);
      if (!A_ || !B_) continue;
      const col = l.color || LINKS[l.kind]?.[2] || '#ccc';
      const isSel = selected?.kind === 'link' && selected.id === l.id, isHov = hover?.link === l;
      c.save();
      if (l.kind === 'orbit') {
        // a ring around the first body through the second
        const rad = Math.hypot(B_.x - A_.x, B_.y - A_.y, B_.z - A_.z), ring = [];
        for (let k = 0; k <= 72; k++) { const a = k / 72 * Math.PI * 2; const p = project(A_.x + Math.cos(a) * rad, A_.y + Math.sin(a) * rad * 0.08, A_.z + Math.sin(a) * rad, Wd, Hd); if (p) ring.push(p); }
        c.beginPath(); ring.forEach((p, k) => k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
        c.strokeStyle = col; c.globalAlpha = isSel || isHov ? 0.8 : 0.32; c.lineWidth = isSel || isHov ? 2 : 1; c.setLineDash([2, 5]); c.stroke();
        linkProj.push({ l, pts: ring });
      } else if (pa && pb) {
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1;
        const bend = l.kind === 'portal' ? 0.18 : 0.06, cx2 = mx - dy / L * L * bend, cy2 = my + dx / L * L * bend;
        const pts = []; for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push({ x: (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx2 + t * t * pb.x, y: (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy2 + t * t * pb.y }); }
        c.beginPath(); c.moveTo(pa.x, pa.y); c.quadraticCurveTo(cx2, cy2, pb.x, pb.y);
        if (l.kind === 'portal') {
          c.shadowColor = col; c.shadowBlur = 14; c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = isSel || isHov ? 7 : 5; c.stroke();
          c.shadowBlur = 0; c.globalAlpha = 0.95; c.lineWidth = isSel || isHov ? 2.4 : 1.6; c.setLineDash([10, 8]); c.lineDashOffset = -time * 30; c.stroke();
        } else {
          c.strokeStyle = col; c.globalAlpha = isSel || isHov ? 0.95 : 0.55; c.lineWidth = isSel || isHov ? 2.4 : 1.4;
          if (l.kind === 'bond') c.setLineDash([2, 4]);
          c.stroke();
        }
        linkProj.push({ l, pts });
      }
      c.restore();
    }
    // bodies, far to near
    const order = [...proj.values()].sort((a, b) => a.depth - b.depth);
    for (const p of order) drawBody(c, p, time);
    // labels for selected and hovered
    c.textAlign = 'center'; c.font = '600 13px Inter, sans-serif';
    for (const p of order) {
      const sel = selected?.kind === 'body' && selected.id === p.b.id;
      if (!sel && hover?.body !== p.b && cz.bodies.length > 14) continue;
      c.globalAlpha = sel || hover?.body === p.b ? 1 : 0.6;
      c.fillStyle = '#e8ecff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
      c.strokeText(p.b.name, p.x, p.y + p.r + 16); c.fillText(p.b.name, p.x, p.y + p.r + 16);
    }
    c.globalAlpha = 1;
  }

  function drawBody(c, p, time) {
    const { x, y, r, b } = p;
    const col = b.color || '#9aa4b8';
    const sel = selected?.kind === 'body' && selected.id === b.id, hov = hover?.body === b;
    c.save();
    if (b.kind === 'star') {
      const g = c.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2); g.addColorStop(0, col); g.addColorStop(0.3, col + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 3.2, 0, Math.PI * 2); c.fill();
      const g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, '#fffbe8'); g2.addColorStop(0.6, col); g2.addColorStop(1, col + 'cc');
      c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    } else if (b.kind === 'plane' || b.kind === 'demiplane') {
      // ethereal swirl
      const g = c.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, col + 'aa'); g.addColorStop(0.5, col + '33'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.2, 0, Math.PI * 2); c.fill();
      c.translate(x, y); c.rotate(time * (b.kind === 'plane' ? 0.4 : -0.7));
      c.strokeStyle = col; c.lineWidth = Math.max(1, r * 0.08);
      for (let arm = 0; arm < 3; arm++) {
        c.beginPath();
        for (let k = 0; k <= 40; k++) { const t = k / 40, a = arm * Math.PI * 2 / 3 + t * 4.2, rr = t * r * 1.25; k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(0, 0); }
        c.globalAlpha = 0.75; c.stroke();
      }
      c.globalAlpha = 1; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, Math.max(1.5, r * 0.18), 0, Math.PI * 2); c.fill();
    } else {
      const g0 = c.createRadialGradient(x, y, r, x, y, r * 1.6); g0.addColorStop(0, col + '55'); g0.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g0; c.beginPath(); c.arc(x, y, r * 1.6, 0, Math.PI * 2); c.fill();
      const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.05);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, col); g.addColorStop(0.75, shade(col, -0.45)); g.addColorStop(1, '#05060c');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      if (b.rings) {
        c.strokeStyle = col; c.globalAlpha = 0.7; c.lineWidth = Math.max(1, r * 0.12);
        c.beginPath(); c.ellipse(x, y, r * 1.8, r * 0.45, -0.35, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 0.4; c.lineWidth = Math.max(1, r * 0.06); c.beginPath(); c.ellipse(x, y, r * 2.15, r * 0.56, -0.35, 0, Math.PI * 2); c.stroke();
      }
      if (b.mapIds?.length) { c.globalAlpha = 0.9; c.fillStyle = '#d4a24c'; c.beginPath(); c.arc(x + r * 0.75, y - r * 0.75, Math.max(2.5, r * 0.16), 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
    if (sel || hov) {
      c.save(); c.strokeStyle = sel ? '#d4a24c' : '#fff'; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.lineDashOffset = -time * 12;
      c.beginPath(); c.arc(x, y, r * (b.kind === 'star' ? 1.5 : 1.45) + 4, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  }

  function loop(now) {
    if (!document.body.contains(cv)) return;
    if (cam.spin && !drag) cam.yaw += 0.0015;
    // ease the camera towards its focus point
    if (cam.focus) { const f = cam.focus; cam.tx += (f[0] - cam.tx) * 0.08; cam.ty += (f[1] - cam.ty) * 0.08; cam.tz += (f[2] - cam.tz) * 0.08; if (Math.hypot(f[0] - cam.tx, f[1] - cam.ty, f[2] - cam.tz) < 0.3) cam.focus = null; }
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  // ---------- picking ----------
  function pick(mx, my) {
    let best = null, bd = Infinity;
    for (const p of proj.values()) { const d = Math.hypot(p.x - mx, p.y - my); if (d < Math.max(p.r + 6, 12) && d < bd) { bd = d; best = { body: p.b }; } }
    if (best) return best;
    for (const lp of linkProj) for (let k = 1; k < lp.pts.length; k++) {
      const a = lp.pts[k - 1], b = lp.pts[k], vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((mx - a.x) * vx + (my - a.y) * vy) / L));
      if (Math.hypot(mx - a.x - vx * t, my - a.y - vy * t) < 6) return { link: lp.l };
    }
    return null;
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    cv.setPointerCapture(e.pointerId);
    const h = pick(mx, my);
    const movable = e.shiftKey && h?.body && selected?.kind === 'body' && selected.id === h.body.id;
    drag = { x: mx, y: my, yaw: cam.yaw, pitch: cam.pitch, moved: false, body: movable ? h.body : null, last: [mx, my] };
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (drag) {
      if (Math.abs(mx - drag.x) + Math.abs(my - drag.y) > 3) drag.moved = true;
      if (drag.body) {
        // move in the plane facing the camera
        const p = proj.get(drag.body.id), s = p?.s || 1, dx = (mx - drag.last[0]) / s, dy = -(my - drag.last[1]) / s;
        const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        // inverse of the view rotation applied to (dx, dy, 0)
        const y1 = dy * cp, z1 = -dy * sp, x0 = dx * cy - z1 * sy, z0 = dx * sy + z1 * cy;
        drag.body.x += x0; drag.body.y += y1; drag.body.z += z0;
        drag.last = [mx, my];
      } else if (drag.moved) {
        cam.yaw = drag.yaw + (mx - drag.x) * 0.006;
        cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (my - drag.y) * 0.006));
      }
      tip.classList.add('hidden');
      return;
    }
    hover = pick(mx, my);
    cv.style.cursor = hover ? 'pointer' : 'grab';
    if (hover) {
      tip.classList.remove('hidden');
      if (hover.body) { const b = hover.body, k = kindOf(b); tip.innerHTML = `<b>${k[0]} ${esc(b.name)}</b><br><span class="muted small">${k[1]}${b.mapIds?.length ? ` · ${b.mapIds.length} map${b.mapIds.length > 1 ? 's' : ''}` : ''}</span>`; }
      else { const l = hover.link, k = LINKS[l.kind] || LINKS.route, na = cz.bodies.find(b => b.id === l.a)?.name, nb = cz.bodies.find(b => b.id === l.b)?.name;
        tip.innerHTML = `<b>${k[0]} ${esc(l.label || k[1])}</b><br><span class="muted small">${esc(na || '?')} ↔ ${esc(nb || '?')}</span>`; }
      tip.style.left = Math.min(stage.clientWidth - 230, mx + 14) + 'px'; tip.style.top = (my + 14) + 'px';
    } else tip.classList.add('hidden');
  });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (d?.body) { save(); drawSide(); return; }
    if (d?.moved) return;
    const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
    selected = h?.body ? { kind: 'body', id: h.body.id } : h?.link ? { kind: 'link', id: h.link.id } : null;
    drawSide();
  });
  cv.addEventListener('dblclick', e => {
    const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h?.body) { cam.focus = [h.body.x, h.body.y, h.body.z]; cam.dist = Math.max(120, Math.min(cam.dist, 260)); }
    else { cam.focus = [0, 0, 0]; }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(60, Math.min(2200, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

  // ---------- side panel ----------
  function drawSide() {
    const sel = selected?.kind === 'body' ? cz.bodies.find(b => b.id === selected.id) : null;
    const lnk = selected?.kind === 'link' ? cz.links.find(l => l.id === selected.id) : null;
    if (sel) {
      const k = kindOf(sel), ent = getEntry(sel.entryId);
      const maps = (sel.mapIds || []).map(getMap).filter(Boolean);
      const conns = cz.links.filter(l => l.a === sel.id || l.b === sel.id);
      side.innerHTML = `<h4>${k[0]} ${esc(k[1])}</h4>
        <h2 style="margin:0 0 6px;font-family:var(--display)"><span class="cz-dot" style="background:${esc(sel.color)}"></span>${esc(sel.name)}</h2>
        ${sel.desc ? `<div class="prose small">${md(sel.desc)}</div>` : ''}
        ${ent ? `<p class="small">📖 <a class="mention" style="--tc:${typeColor(ent.type)}" href="#/entry/${ent.id}">${esc(ent.name)}</a></p>` : ''}
        <label>Maps</label>
        ${maps.length ? `<div class="cz-maps">${maps.map(m => `<a class="cz-map" href="#/map/${m.id}"><img ${A.src(m.image)} alt=""><span>${esc(m.name)}</span></a>`).join('')}</div>` : '<p class="small muted" style="margin:0">No maps linked yet — use Edit to attach some.</p>'}
        <label>Connections</label>
        ${conns.length ? `<ul class="link-list">${conns.map(l => { const o = cz.bodies.find(b => b.id === (l.a === sel.id ? l.b : l.a)); const kk = LINKS[l.kind] || LINKS.route;
          return `<li><a href="#" data-sel-body="${o?.id || ''}">${kk[0]} ${esc(l.label || kk[1])} → ${esc(o?.name || '?')}</a></li>`; }).join('')}</ul>` : '<p class="small muted" style="margin:0">None yet.</p>'}
        <div class="row" style="margin-top:12px;gap:6px;flex-wrap:wrap"><button id="b-edit">✎ Edit</button><button id="b-link">＋ Connect</button><button id="b-focus">🎯 Focus</button><button class="danger" id="b-del">Delete</button></div>`;
      side.querySelector('#b-edit').onclick = () => bodyDialog(sel);
      side.querySelector('#b-link').onclick = () => linkDialog(null, sel.id);
      side.querySelector('#b-focus').onclick = () => { cam.focus = [sel.x, sel.y, sel.z]; cam.dist = Math.max(120, Math.min(cam.dist, 260)); };
      side.querySelector('#b-del').onclick = async () => {
        if (!(await confirmDialog(`Remove “${sel.name}” from the cosmos? (Its maps are kept.)`))) return;
        cz.bodies = cz.bodies.filter(b => b !== sel); cz.links = cz.links.filter(l => l.a !== sel.id && l.b !== sel.id); save(); selected = null; drawSide();
      };
    } else if (lnk) {
      const k = LINKS[lnk.kind] || LINKS.route, a = cz.bodies.find(b => b.id === lnk.a), b = cz.bodies.find(b => b.id === lnk.b);
      side.innerHTML = `<h4>${k[0]} ${esc(k[1])}</h4><h2 style="margin:0 0 6px;font-family:var(--display)">${esc(lnk.label || k[1])}</h2>
        <p><a href="#" data-sel-body="${a?.id}">${esc(a?.name || '?')}</a> ↔ <a href="#" data-sel-body="${b?.id}">${esc(b?.name || '?')}</a></p>
        ${lnk.desc ? `<div class="prose small">${md(lnk.desc)}</div>` : ''}
        <div class="row" style="margin-top:12px;gap:6px"><button id="l-edit">✎ Edit</button><button class="danger" id="l-del">Delete</button></div>`;
      side.querySelector('#l-edit').onclick = () => linkDialog(lnk);
      side.querySelector('#l-del').onclick = () => { cz.links = cz.links.filter(l => l !== lnk); save(); selected = null; drawSide(); };
    } else {
      side.innerHTML = `<h4>🌌 ${esc(w.name)} — the cosmos</h4>
        ${cz.bodies.length ? `<ul class="link-list">${cz.bodies.map(b => `<li><a href="#" data-sel-body="${b.id}"><span class="cz-dot" style="background:${esc(b.color)}"></span>${kindOf(b)[0]} ${esc(b.name)}</a>${b.mapIds?.length ? ` <span class="muted small">· ${b.mapIds.length} map${b.mapIds.length > 1 ? 's' : ''}</span>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Nothing charted yet.</p>'}
        <label>Key</label>
        <p class="small" style="margin:0">${Object.values(LINKS).map(([i, n, c]) => `<span style="color:${c}">━</span> ${i} ${n}`).join(' &nbsp; ')}</p>
        <p class="small muted">A gold dot on a world means it has maps attached. Click any world to see them.</p>`;
    }
    side.querySelectorAll('[data-sel-body]').forEach(a => a.onclick = e => {
      e.preventDefault(); const b = cz.bodies.find(x => x.id === a.dataset.selBody); if (!b) return;
      selected = { kind: 'body', id: b.id }; cam.focus = [b.x, b.y, b.z]; drawSide();
    });
  }

  // ---------- editing ----------
  function bodyDialog(body) {
    const isNew = !body;
    const n = cz.bodies.length;
    const d = body ? JSON.parse(JSON.stringify(body)) : { id: uid(), name: '', kind: 'planet', typeName: '', color: COLORS[n % COLORS.length], size: 4, rings: false, mapIds: [], entryId: '', desc: '', ...randomSpot() };
    d.mapIds = d.mapIds || [];
    let custom = !!d.typeName;
    openModal(`<h2>${isNew ? 'Add to the cosmos' : 'Edit ' + esc(body.name)}</h2>
      <label>Name</label><input id="bn" value="${esc(d.name)}" placeholder="e.g. Vael, the Feywild, the Silver Moon" autofocus>
      <div class="row"><div><label>Type</label><select id="bt">${Object.entries(KINDS).map(([k, [i, l]]) => `<option value="${k}" ${!custom && d.kind === k ? 'selected' : ''}>${i} ${l}</option>`).join('')}
          <option value="__custom" ${custom ? 'selected' : ''}>✦ Custom…</option></select></div>
        <div style="flex:0 0 84px"><label>Colour</label><input type="color" id="bc" value="${esc(d.color)}"></div></div>
      <div id="bcustom" class="row ${custom ? '' : 'hidden'}"><div><label>Custom type name</label><input id="btn" value="${esc(d.typeName || '')}" placeholder="e.g. Shard, Dreamscape, Prison plane"></div>
        <div><label>Looks like</label><select id="blook">${Object.entries(KINDS).filter(([k]) => k !== 'other').map(([k, [i, l]]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${i} ${l}</option>`).join('')}</select></div></div>
      <label>Size <span class="val" id="bsv">${d.size}</span></label><input type="range" id="bs" min="1" max="10" value="${d.size}">
      <label class="check"><input type="checkbox" id="br" ${d.rings ? 'checked' : ''}> Rings</label>

      <label>Maps of this place</label>
      <div class="picker" id="mp"><div class="chips" id="mchips"></div><input class="pick-search" id="msearch" placeholder="🔍 Search your maps to attach…" autocomplete="off"><div class="pick-results hidden" id="mres"></div></div>

      <label>World Bible entry</label>
      <div class="picker" id="ep"><div id="echip"></div><input class="pick-search" id="esearch" placeholder="🔍 Search entries to link…" autocomplete="off"><div class="pick-results hidden" id="eres"></div></div>

      <label>Notes</label>${editorHTML('bd', d.desc, 4, 'What is this place like? Type @ to link entries.')}
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">${isNew ? 'Add' : 'Save'}</button></div>`, m => {
      attachEditor(m.querySelector('#bd'), v => d.desc = v);
      const $ = q => m.querySelector(q);
      $('#bs').oninput = e => { $('#bsv').textContent = e.target.value; };
      $('#bt').onchange = e => { custom = e.target.value === '__custom'; $('#bcustom').classList.toggle('hidden', !custom); if (!custom) d.kind = e.target.value; else $('#btn').focus(); };
      $('#bn').addEventListener('input', () => drawEntry());

      // ---- maps: chips + search ----
      const drawMaps = () => {
        $('#mchips').innerHTML = d.mapIds.map(getMap).filter(Boolean).map(mp => `<span class="chip"><img ${A.src(mp.image)} alt="">${esc(mp.name)}<button type="button" data-unmap="${mp.id}" title="Remove">✕</button></span>`).join('')
          || '<span class="small muted">No maps attached yet.</span>';
      };
      const searchMaps = () => {
        const q = $('#msearch').value.trim().toLowerCase();
        const hits = w.maps.filter(mp => !d.mapIds.includes(mp.id) && (!q || mp.name.toLowerCase().includes(q))).slice(0, 8);
        $('#mres').innerHTML = hits.length ? hits.map(mp => `<button type="button" class="pick-row" data-addmap="${mp.id}"><img ${A.src(mp.image)} alt=""><span>${esc(mp.name)}${getMap(mp.parentId) ? `<small>inside ${esc(getMap(mp.parentId).name)}</small>` : ''}</span></button>`).join('')
          : `<p class="small muted" style="margin:6px">${w.maps.length ? 'No other maps match.' : 'You have no maps yet.'}</p>`;
        $('#mres').classList.remove('hidden');
      };
      $('#msearch').addEventListener('focus', searchMaps);
      $('#msearch').addEventListener('input', searchMaps);

      // ---- World Bible entry: link an existing one or create it ----
      const drawEntry = () => {
        const ent = getEntry(d.entryId);
        if (ent) {
          $('#echip').innerHTML = `<span class="chip big"><span class="type-dot" style="--tc:${typeColor(ent.type)}"></span>${TYPES[ent.type]?.icon || ''} ${esc(ent.name)}<button type="button" data-unent title="Unlink">✕</button></span>`;
          $('#esearch').classList.add('hidden'); return;
        }
        $('#esearch').classList.remove('hidden');
        const nm = $('#bn').value.trim();
        const same = nm && w.entries.find(e => e.name.toLowerCase() === nm.toLowerCase());
        $('#echip').innerHTML = same ? `<div class="pick-hint">📖 There’s already an entry called <b>${esc(same.name)}</b>. <button type="button" class="small primary" data-linkent="${same.id}">Link it</button></div>`
          : nm ? `<div class="pick-hint">Not in the World Bible yet. <button type="button" class="small" data-newent>＋ Create “${esc(nm)}”</button></div>` : '';
      };
      const searchEntries = () => {
        const q = $('#esearch').value.trim().toLowerCase(), nm = $('#bn').value.trim();
        const hits = w.entries.filter(e => !q || e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
        $('#eres').innerHTML = hits.map(e => `<button type="button" class="pick-row" data-linkent="${e.id}"><span class="type-dot" style="--tc:${typeColor(e.type)}"></span><span>${TYPES[e.type]?.icon || ''} ${esc(e.name)}<small>${esc(TYPES[e.type]?.label || '')}</small></span></button>`).join('')
          + `<button type="button" class="pick-row new" data-newent>＋ Create a new entry${(q || nm) ? ` “${esc($('#esearch').value.trim() || nm)}”` : ''}</button>`;
        $('#eres').classList.remove('hidden');
      };
      $('#esearch').addEventListener('focus', searchEntries);
      $('#esearch').addEventListener('input', searchEntries);
      const newEntryFlow = () => {
        const name = $('#esearch').value.trim() || $('#bn').value.trim() || 'New place';
        const typeChoices = Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === 'location' ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('');
        // small inline form instead of another dialog, so nothing typed so far is lost
        $('#eres').innerHTML = `<div class="pick-new"><label>New entry name</label><input id="nen" value="${esc(name)}">
          <label>Entry type</label><select id="net">${typeChoices}</select>
          <div class="row" style="gap:6px;margin-top:8px"><button type="button" class="small primary" data-makeent>Create &amp; link</button><button type="button" class="small" data-cancelent>Cancel</button></div></div>`;
        $('#eres').classList.remove('hidden'); $('#echip').innerHTML = '';
        $('#nen').focus();
      };
      m.addEventListener('click', e => {
        const t = e.target.closest('[data-unmap],[data-addmap],[data-unent],[data-linkent],[data-newent],[data-makeent],[data-cancelent]');
        if (t) {
          e.preventDefault();
          if (t.dataset.unmap) { d.mapIds = d.mapIds.filter(x => x !== t.dataset.unmap); drawMaps(); }
          else if (t.dataset.addmap) { d.mapIds.push(t.dataset.addmap); $('#msearch').value = ''; drawMaps(); searchMaps(); }
          else if (t.dataset.unent != null) { d.entryId = ''; drawEntry(); }
          else if (t.dataset.linkent) { d.entryId = t.dataset.linkent; $('#esearch').value = ''; $('#eres').classList.add('hidden'); drawEntry(); }
          else if (t.dataset.newent != null) newEntryFlow();
          else if (t.dataset.cancelent != null) { $('#eres').classList.add('hidden'); drawEntry(); }
          else if (t.dataset.makeent != null) {
            const ent = newEntry($('#net').value, $('#nen').value.trim() || 'New place');
            if (d.desc) { ent.summary = d.desc.split('\n')[0].slice(0, 200); ent.body = d.desc; }
            const kf = ent.fields.find(f => f.k === 'Kind');
            if (kf) kf.v = custom ? ($('#btn').value.trim() || 'Custom') : (KINDS[$('#bt').value] || KINDS.other)[1];
            ent.tags = [...(ent.tags || []), 'cosmos'];
            save();
            d.entryId = ent.id; $('#esearch').value = ''; $('#eres').classList.add('hidden'); drawEntry();
            toast(`Created “${ent.name}” in the World Bible`);
          }
          return;
        }
        // clicking elsewhere closes result lists
        if (!e.target.closest('#mp')) $('#mres').classList.add('hidden');
        if (!e.target.closest('#ep')) $('#eres').classList.add('hidden');
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'yes') {
          d.name = $('#bn').value.trim() || 'Unnamed world';
          if (custom) { d.typeName = $('#btn').value.trim() || 'Custom'; d.kind = $('#blook').value; }
          else { d.typeName = ''; d.kind = $('#bt').value; }
          d.color = $('#bc').value; d.size = +$('#bs').value; d.rings = $('#br').checked;
          if (isNew) cz.bodies.push(d); else Object.assign(body, d);
          save(); selected = { kind: 'body', id: d.id };
        }
        closeModal();
        if (a === 'yes' && isNew && cz.bodies.length === 1) render(main); else drawSide();
      });
      drawMaps(); drawEntry();
    });
  }
  function linkDialog(link, fromId) {
    if (cz.bodies.length < 2) { toast('Add at least two worlds or planes first'); return; }
    const isNew = !link;
    const d = link ? { ...link } : { id: uid(), a: fromId || cz.bodies[0].id, b: cz.bodies.find(b => b.id !== (fromId || cz.bodies[0].id))?.id, kind: 'portal', label: '', desc: '' };
    const opts = sel => cz.bodies.map(b => `<option value="${b.id}" ${sel === b.id ? 'selected' : ''}>${kindOf(b)[0]} ${esc(b.name)}</option>`).join('');
    openModal(`<h2>${isNew ? 'New connection' : 'Edit connection'}</h2>
      <div class="row"><div><label>From</label><select id="la">${opts(d.a)}</select></div><div><label>To</label><select id="lb">${opts(d.b)}</select></div></div>
      <label>Kind</label><select id="lk">${Object.entries(LINKS).map(([k, [i, l]]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${i} ${l}</option>`).join('')}</select>
      <p class="small muted" style="margin:4px 0 0">Orbit draws a ring around the “From” body passing through the “To” body.</p>
      <label>Name</label><input id="ll" value="${esc(d.label)}" placeholder="e.g. The Moonwell Gate">
      <label>Notes</label>${editorHTML('ld', d.desc || '', 3, 'How does it work? Who guards it? Type @ to link.')}
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save</button></div>`, m => {
      attachEditor(m.querySelector('#ld'), v => d.desc = v);
      m.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'yes') {
          d.a = m.querySelector('#la').value; d.b = m.querySelector('#lb').value;
          if (d.a === d.b) { toast('Pick two different places'); return; }
          d.kind = m.querySelector('#lk').value; d.label = m.querySelector('#ll').value.trim();
          if (isNew) cz.links.push(d); else Object.assign(link, d);
          save(); selected = { kind: 'link', id: d.id };
        }
        closeModal(); drawSide();
      });
    });
  }
  function randomSpot() {
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
    return { x: Math.cos(a) * r, y: (Math.random() - 0.5) * 50, z: Math.sin(a) * r };
  }
  function example() {
    const topMaps = w.maps.filter(m => !m.parentId).map(m => m.id);
    const B = (name, kind, color, size, pos, extra = {}) => ({ id: uid(), name, kind, color, size, rings: false, mapIds: [], entryId: '', desc: '', x: pos[0], y: pos[1], z: pos[2], ...extra });
    const sun = B('The Ember Sun', 'star', '#f4b740', 6, [0, 0, 0], { desc: 'The old sun, said to be the last coal of the first fire.' });
    const home = B(w.name.replace(/\s*—.*$/, '') || 'Home', 'planet', '#5fa8d3', 5, [120, 6, 30], { mapIds: topMaps, desc: 'The mortal world, where your campaign begins.' });
    const moon = B('The Pale Lantern', 'moon', '#c8cdd8', 3, [150, 14, 55], { desc: 'A silver moon that waxes when the tides turn.' });
    const giant = B('Ossuar', 'planet', '#c9a27e', 7, [-170, -12, -60], { rings: true, desc: 'A ringed giant whose rings are made of bone-white ice.' });
    const fey = B('The Glimmerwild', 'plane', '#81e0a8', 5, [40, 70, -120], { desc: 'An echo of the world where everything is brighter, and bargains bind.' });
    const shadow = B('The Hollow Dark', 'plane', '#8a6fd6', 5, [70, -70, 140], { desc: 'A grey reflection where memories go to fade.' });
    const astral = B('The Silver Sea', 'demiplane', '#a8dadc', 4, [-60, 90, 120], { desc: 'The space between the planes, crossed only by dreamers and the dead.' });
    cz.bodies.push(sun, home, moon, giant, fey, shadow, astral);
    const L = (a, b, kind, label) => cz.links.push({ id: uid(), a: a.id, b: b.id, kind, label, desc: '' });
    L(sun, home, 'orbit', 'Home orbit'); L(home, moon, 'orbit', 'Lunar orbit'); L(sun, giant, 'orbit', 'Outer orbit');
    L(home, fey, 'portal', 'The fairy rings'); L(home, shadow, 'portal', 'The Drowned Gate'); L(fey, astral, 'portal', 'The Dream Stair'); L(shadow, astral, 'bond', 'Where the dead drift');
    save(); selected = { kind: 'body', id: home.id };
    render(main);
  }

  main.querySelector('#cz-add').onclick = () => bodyDialog(null);
  main.querySelector('#cz-link').onclick = () => linkDialog(null, selected?.kind === 'body' ? selected.id : null);
  main.querySelector('#cz-spin').onclick = e => { cam.spin = !cam.spin; e.target.textContent = cam.spin ? '⏸ Pause' : '▶ Spin'; };
  main.querySelector('#cz-example')?.addEventListener('click', example);
  main.querySelector('#cz-add2')?.addEventListener('click', () => bodyDialog(null));
  drawSide();
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

function shade(hex, f) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + f))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
