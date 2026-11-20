// Spinning globe for whole-world maps: an orthographic projection of the flat (equirectangular) map.
import { openModal, closeModal, esc } from '../util.js';

export function openGlobe(mapCanvas, title) {
  // texture: the flat map scaled to a 2:1 sample grid
  const TW = 2048, TH = 1024;
  const tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
  const tctx = tc.getContext('2d'); tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(mapCanvas, 0, 0, TW, TH);
  const tex = new Uint32Array(tctx.getImageData(0, 0, TW, TH).data.buffer);

  openModal(`<div class="globe-head"><h2>🌐 ${esc(title)}</h2><div class="row" style="gap:6px">
      <button class="small" id="g-spin">⏸ Pause</button><button class="small" id="g-reset">⟲ Reset</button><button class="small" data-a="close">Close</button></div></div>
    <div class="globe-wrap"><canvas id="globe"></canvas></div>
    <p class="small muted" style="margin:8px 0 0;text-align:center">Drag to turn the world · scroll to zoom</p>`, m => {
    m.closest('.modal')?.classList.add('wide');
    const cv = m.querySelector('#globe'), wrap = m.querySelector('.globe-wrap');
    const st = { lon: 0, lat: 0.35, zoom: 1, spin: true, drag: null, raf: 0, dirty: true };
    let ctx, img, buf, S;
    function size() {
      const w = Math.min(wrap.clientWidth - 28, 720, innerHeight * 0.68), dpr = Math.min(1.25, devicePixelRatio || 1);
      S = Math.round(w * dpr);
      cv.width = cv.height = S; cv.style.width = cv.style.height = w + 'px';
      ctx = cv.getContext('2d'); img = ctx.createImageData(S, S); buf = new Uint32Array(img.data.buffer);
      st.dirty = true;
    }
    function draw(fast) {
      const step = fast ? 2 : 1;
      const R = S * 0.44 * st.zoom, cx = S / 2, cy = S / 2;
      const cl = Math.cos(st.lat), sl = Math.sin(st.lat);
      buf.fill(0);
      const lx = -0.45, ly = -0.5, lz = 0.74; // light from the upper left
      for (let y = 0; y < S; y += step) {
        const ny = (cy - y) / R;
        if (ny < -1 || ny > 1) continue;
        for (let x = 0; x < S; x += step) {
          const nx = (x - cx) / R, rr = nx * nx + ny * ny;
          if (rr > 1) continue;
          const nz = Math.sqrt(1 - rr);
          // undo the tilt (rotation about the x axis), then read longitude/latitude
          const y2 = ny * cl + nz * sl, z2 = -ny * sl + nz * cl;
          const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
          let lon = Math.atan2(nx, z2) + st.lon;
          lon = ((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1;
          const u = (lon * TW) | 0, v = Math.min(TH - 1, ((0.5 - lat / Math.PI) * TH) | 0);
          const c = tex[v * TW + u];
          const light = 0.38 + 0.62 * Math.max(0, nx * lx + ny * -ly + nz * lz) + 0.1 * nz;
          const r = Math.min(255, (c & 255) * light), g = Math.min(255, ((c >> 8) & 255) * light), b = Math.min(255, ((c >> 16) & 255) * light);
          const px = (255 << 24) | (b << 16) | (g << 8) | r;
          buf[y * S + x] = px;
          if (step === 2) { buf[y * S + x + 1] = px; if (y + 1 < S) { buf[(y + 1) * S + x] = px; buf[(y + 1) * S + x + 1] = px; } }
        }
      }
      ctx.putImageData(img, 0, 0);
      // atmosphere
      const g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.12);
      g.addColorStop(0, 'rgba(140,190,255,.35)'); g.addColorStop(1, 'rgba(140,190,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2); ctx.fill();
    }
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (st.spin && !st.drag) { st.lon += dt * 0.25; st.dirty = true; }
      if (st.dirty) { draw(!!st.drag); st.dirty = false; st.idle = 0; }
      else if (++st.idle === 8) draw(false); // sharpen once things settle
      st.raf = requestAnimationFrame(loop);
    }
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); st.drag = { x: e.clientX, y: e.clientY, lon: st.lon, lat: st.lat }; });
    cv.addEventListener('pointermove', e => {
      if (!st.drag) return;
      const k = 2.6 / (cv.clientWidth * st.zoom);
      st.lon = st.drag.lon - (e.clientX - st.drag.x) * k;
      st.lat = Math.max(-1.4, Math.min(1.4, st.drag.lat + (e.clientY - st.drag.y) * k));
      st.dirty = true;
    });
    const up = () => { st.drag = null; st.dirty = true; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); st.zoom = Math.max(0.5, Math.min(4, st.zoom * Math.exp(-e.deltaY * 0.0015))); st.dirty = true; }, { passive: false });
    m.querySelector('#g-spin').onclick = e => { st.spin = !st.spin; e.target.textContent = st.spin ? '⏸ Pause' : '▶ Spin'; };
    m.querySelector('#g-reset').onclick = () => { st.lon = 0; st.lat = 0.35; st.zoom = 1; st.dirty = true; };
    m.querySelector('[data-a="close"]').onclick = () => closeModal();
    size();
    st.raf = requestAnimationFrame(loop);
    // stop animating once the dialog is gone
    const mo = new MutationObserver(() => { if (!document.body.contains(cv)) { cancelAnimationFrame(st.raf); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}
