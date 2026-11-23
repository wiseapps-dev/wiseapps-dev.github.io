/*
 * render.js: draws the sky on a 2D canvas: the live view (any direction, any zoom) and the round
 * all-sky chart used for the poster. Positions come from sky.js; nothing here does astronomy.
 *
 * Palettes: 'night' (dark blue sky), 'red' (night-vision: red on black only), 'print' (dark ink on
 * white, for posters people print).
 */
(function (root, factory) {
  const api = factory(root.Sky || (typeof require === 'function' ? require('./sky.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Render = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Sky) {
  'use strict';
  const D = Math.PI / 180;

  const PALETTES = {
    night: {
      skyTop: '#05070f', skyHorizon: '#0d1630', ground: 'rgba(14,18,22,0.94)', groundLine: '#3a4a5e', card: '#8fa3bf',
      grid: 'rgba(120,150,200,0.16)', lines: 'rgba(130,170,230,0.42)', constLabel: 'rgba(160,185,225,0.62)', starLabel: 'rgba(225,232,245,0.82)',
      planet: '#ffd88a', planetLabel: '#ffe3a8', moonLit: '#f4efe2', moonDark: 'rgba(40,46,60,0.92)', sun: '#ffe07a', dso: 'rgba(150,215,190,0.85)',
      select: '#ffd88a', target: '#ffd88a', ecliptic: 'rgba(255,200,120,0.22)', star: null,
    },
    red: {
      skyTop: '#000000', skyHorizon: '#0a0000', ground: 'rgba(12,0,0,0.95)', groundLine: '#5a1010', card: '#a83030',
      grid: 'rgba(170,30,30,0.18)', lines: 'rgba(190,40,40,0.45)', constLabel: 'rgba(190,50,50,0.7)', starLabel: 'rgba(220,70,60,0.85)',
      planet: '#ff5a4a', planetLabel: '#ff6a5a', moonLit: '#e0463a', moonDark: 'rgba(40,0,0,0.92)', sun: '#ff5040', dso: 'rgba(200,60,60,0.85)',
      select: '#ff6a5a', target: '#ff6a5a', ecliptic: 'rgba(160,40,30,0.3)', star: [235, 70, 60],
    },
    print: {
      skyTop: '#ffffff', skyHorizon: '#ffffff', ground: '#ffffff', groundLine: '#111827', card: '#111827',
      grid: 'rgba(17,24,39,0.12)', lines: 'rgba(17,24,39,0.55)', constLabel: 'rgba(17,24,39,0.7)', starLabel: '#111827',
      planet: '#9a3412', planetLabel: '#9a3412', moonLit: '#ffffff', moonDark: '#1f2937', sun: '#b45309', dso: '#0f766e',
      select: '#9a3412', target: '#9a3412', ecliptic: 'rgba(154,52,18,0.35)', star: [17, 24, 39],
    },
  };

  // Star radius in px for a magnitude at a zoom (smaller field of view -> fainter stars show).
  function limitMag(fov) {
    return Math.max(4.6, Math.min(6.5, 4.6 + (90 - fov) / 30));
  }
  function starRadius(mag, scale) {
    return Math.max(0.55, (1.9 + (4.0 - mag) * 0.62) * 0.9) * (scale || 1);
  }

  // The Moon's phase as it looks: lit fraction and the direction of the lit limb on screen (radians, 0 = up).
  function drawMoon(ctx, x, y, r, illum, limbScreenAngle, P, waxingLitRight) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(limbScreenAngle);
    // dark disc
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = P.moonDark; ctx.fill();
    // lit part: the bright limb points to -y (up) after rotation
    const k = 1 - 2 * illum; // terminator ellipse: x-radius r*|k|, on the lit side when k < 0
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0, false); // the lit half (top)
    ctx.ellipse(0, 0, r, Math.abs(k) * r, 0, 0, Math.PI, k > 0); // back along the terminator
    ctx.closePath();
    ctx.fillStyle = P.moonLit;
    ctx.fill();
    ctx.restore();
  }

  function drawSunGlyph(ctx, x, y, r, P) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2);
    g.addColorStop(0, P.sun); g.addColorStop(0.35, P.sun + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.sun; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function dsoGlyph(ctx, x, y, type, r, P) {
    ctx.strokeStyle = P.dso; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (type === 'gc') { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
    else if (type === 'oc' || type === 'pos') { ctx.setLineDash([2, 2]); ctx.arc(x, y, r, 0, Math.PI * 2); }
    else if (type === 'pn') { ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.6, y); ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r, y); }
    else if (/^(s|e|i|g|s0|sd)$/.test(type)) ctx.ellipse(x, y, r, r * 0.5, -0.5, 0, Math.PI * 2);
    else ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); // nebulae
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /*
   * scene: {
   *   F (sky.frame), cat (stars), vec (star J2000 vectors), consts (SKY_CONST), dso rows, bodies (sky.bodies),
   *   moon: moonInfo, labels: { star(i), body(id), con(abbr), dso(id) } -> text,
   *   layers: { lines, names, grid, dso, ground }, palette, selected: {kind,id}, target: {vec}, sunUp
   * }
   * Returns hit targets [{x, y, r, kind, id}] for tapping.
   */
  function drawView(ctx, view, scene) {
    const P = PALETTES[scene.palette] || PALETTES.night;
    const L = scene.layers || {};
    const W = view.w, H = view.h;
    const hits = [];
    const fov = view.fov;
    const dpr = scene.dpr || 1;
    const font = scene.font || 'system-ui, sans-serif';
    const proj = (v) => view.project(v);
    // ---- sky background: darker overhead, lighter at the horizon; brighter in daylight/twilight
    const sunAlt = scene.sunAlt == null ? -30 : scene.sunAlt;
    ctx.save();
    const top = proj([0, 0, 1]), hz = proj(Sky.vecOf(Sky.azAltOf(view.forward).az, 0));
    let g;
    if (top && hz && scene.palette !== 'print') {
      g = ctx.createLinearGradient(top[0], top[1], hz[0], hz[1]);
      const day = sunAlt > -6 ? Math.min(1, (sunAlt + 6) / 12) : 0;
      const mix = (a, b, f) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f)); return `rgb(${c.join(',')})`; };
      if (scene.palette === 'red') { g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyHorizon); }
      else { g.addColorStop(0, mix(P.skyTop, '#2a5aa8', day)); g.addColorStop(1, mix(P.skyHorizon, '#7fb0e6', day)); }
    } else g = scene.palette === 'print' ? '#fff' : P.skyTop;
    if (!scene.transparent) { ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const starDim = sunAlt > -12 ? Math.max(0.25, 1 - (sunAlt + 12) / 18) : 1;

    // ---- alt/az grid
    if (L.grid) {
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
      for (let alt = -60; alt <= 80; alt += 20) polyline(ctx, view, (s) => Sky.vecOf(s * 360, alt), 72);
      for (let az = 0; az < 360; az += 30) polyline(ctx, view, (s) => Sky.vecOf(az, -80 + s * 168), 30);
    }

    // ---- constellation lines and names
    const F = scene.F;
    const cat = scene.cat;
    const sv = scene.vec;
    const starPx = new Map();
    const starXY = (i) => {
      if (starPx.has(i)) return starPx.get(i);
      const e = Sky.toENU(F, sv[i * 3], sv[i * 3 + 1], sv[i * 3 + 2]);
      const alt = Math.asin(Math.max(-1, Math.min(1, e[2]))) / D;
      const ra = alt + Sky.refraction(alt);
      const az = Math.atan2(e[0], e[1]) / D;
      const v = Sky.vecOf(az, ra);
      const p = proj(v);
      const out = p ? [p[0], p[1], v] : null;
      starPx.set(i, out);
      return out;
    };
    if (L.lines && scene.consts) {
      ctx.strokeStyle = P.lines; ctx.lineWidth = Math.max(1, 1.1 * dpr * 0.7);
      ctx.beginPath();
      const lines = scene.consts.lines;
      for (const abbr in lines) {
        for (const poly of lines[abbr]) {
          for (let k = 1; k < poly.length; k++) {
            const a = starXY(poly[k - 1]), b = starXY(poly[k]);
            if (!a || !b) continue;
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) > Math.max(W, H)) continue; // wrapped through the back
            // gap at each end so the line doesn't touch the star
            const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
            if (len < 8) continue;
            const gap = Math.min(len / 3, 4 * dpr);
            ctx.moveTo(a[0] + dx / len * gap, a[1] + dy / len * gap);
            ctx.lineTo(b[0] - dx / len * gap, b[1] - dy / len * gap);
          }
        }
      }
      ctx.stroke();
    }
    // Labels are queued and placed at the end, most important first, skipping any that would
    // overlap one already placed (planets, then bright stars, then constellations, then Messier).
    const queue = [];
    const label = (text, x, y, opt) => queue.push(Object.assign({ text, x, y }, opt));
    if (L.names !== false && L.lines && scene.consts && scene.labels.con) {
      const lab = scene.consts.labels;
      for (const abbr in lab) {
        lab[abbr].forEach(([ra, dec]) => {
          const p = Sky.fixedPosition(ra, dec, F);
          if (p.alt < -2 && L.ground !== false) return;
          const q = proj(p.vec);
          if (!q || q[0] < -60 || q[0] > W + 60 || q[1] < -20 || q[1] > H + 20) return;
          label(scene.labels.con(abbr), q[0], q[1], { font: `italic 400 ${Math.round(12 * dpr)}px ${font}`, color: P.constLabel, center: true, pri: 2 });
        });
      }
    }

    // ---- stars
    const lim = scene.limitMag || limitMag(fov);
    const scale = (scene.starScale || 1) * dpr * Math.max(0.75, Math.min(1.6, Math.sqrt(90 / fov)));
    const fwd = view.forward;
    const cosMax = view.cosMax;
    const named = [];
    for (let i = 0; i < cat.n; i++) {
      const m = cat.mag[i];
      if (m > lim) break; // sorted by magnitude
      const e = Sky.toENU(F, sv[i * 3], sv[i * 3 + 1], sv[i * 3 + 2]);
      if (e[0] * fwd[0] + e[1] * fwd[1] + e[2] * fwd[2] < cosMax) continue;
      if (e[2] < -0.035 && L.ground !== false) continue; // below the horizon (the ground hides it)
      const alt = Math.asin(Math.max(-1, Math.min(1, e[2]))) / D;
      const v = Sky.vecOf(Math.atan2(e[0], e[1]) / D, alt + Sky.refraction(alt));
      const p = proj(v);
      if (!p || p[0] < -5 || p[0] > W + 5 || p[1] < -5 || p[1] > H + 5) continue;
      starPx.set(i, [p[0], p[1], v]);
      const r = starRadius(m, scale);
      const c = P.star || Sky.starColour(cat.bv[i]);
      const a = Math.max(0.35, Math.min(1, (lim + 0.6 - m) / 2.2)) * starDim;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
      if (m < 1.5 && scene.palette !== 'print' && scene.palette !== 'red') {
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.12 * starDim})`;
        ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (m < 4.8) hits.push({ x: p[0], y: p[1], r: Math.max(r, 3), kind: 'star', id: i, mag: m });
      if (cat.names[i] && m < (fov > 100 ? 1.6 : fov > 60 ? 2.4 : fov > 30 ? 3.4 : 5)) named.push([i, p, r]);
    }
    if (L.names !== false && scene.labels.star) {
      named.forEach(([i, p, r]) => label(scene.labels.star(i), p[0], p[1], { gap: r + 4 * dpr, font: `${Math.round(11 * dpr)}px ${font}`, color: P.starLabel, pri: 5 - cat.mag[i] }));
    }

    // ---- deep-sky objects (Messier)
    if (L.dso && scene.dso) {
      scene.dso.forEach((row) => {
        const [id, ra, dec, type, mag] = row;
        if (fov > 120 && (mag == null || mag > 6)) return;
        const p = Sky.fixedPosition(ra, dec, F);
        if (p.alt < 0 && L.ground !== false) return;
        const q = proj(p.vec);
        if (!q || q[0] < -10 || q[0] > W + 10 || q[1] < -10 || q[1] > H + 10) return;
        const r = Math.max(3.5, Math.min(9, (row[5] || 5) / Math.max(1, fov / 30))) * dpr;
        dsoGlyph(ctx, q[0], q[1], type, r, P);
        if (fov < 100 || (mag != null && mag < 5)) label(id, q[0], q[1], { gap: r + 3 * dpr, font: `${Math.round(10 * dpr)}px ${font}`, color: P.dso, pri: 1 });
        hits.push({ x: q[0], y: q[1], r: r + 4, kind: 'dso', id });
      });
    }

    // ---- planets, Moon, Sun
    (scene.bodies || []).forEach((b) => {
      if (b.alt < -1 && L.ground !== false && !(scene.selected && scene.selected.id === b.id)) return;
      const q = proj(b.vec);
      if (!q || q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40) return;
      let r;
      const pxPerDeg = view.k * D * (view.proj === 'stereo' ? 1 : 1);
      if (b.id === 'moon') {
        r = Math.max(7 * dpr, (b.size / 3600 / 2) * pxPerDeg);
        drawMoon(ctx, q[0], q[1], r, b.illum, scene.moonScreenAngle || 0, P);
      } else if (b.id === 'sun') {
        r = Math.max(7 * dpr, (b.size / 3600 / 2) * pxPerDeg);
        drawSunGlyph(ctx, q[0], q[1], r, P);
      } else {
        r = Math.max(2.4, (2.6 + (1.5 - Math.min(6, b.mag)) * 0.55)) * dpr * Math.max(1, Math.min(1.4, Math.sqrt(90 / fov)));
        ctx.fillStyle = P.planet;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill();
      }
      if (scene.labels.body) label(scene.labels.body(b.id), q[0], q[1], { gap: r + 5 * dpr, font: `600 ${Math.round(12 * dpr)}px ${font}`, color: b.id === 'sun' || b.id === 'moon' ? P.starLabel : P.planetLabel, pri: 100 });
      hits.push({ x: q[0], y: q[1], r: Math.max(r, 10) + 4, kind: 'body', id: b.id, pri: 1 });
    });

    // ---- the ground and the horizon
    if (L.ground !== false) drawGround(ctx, view, P, scene, dpr, font);

    // ---- labels, most important first, never on top of each other
    const placed = [];
    const pad = 2 * dpr;
    queue.sort((a, b) => b.pri - a.pri);
    ctx.textBaseline = 'middle';
    queue.forEach((l) => {
      if (!l.center && (l.x < 0 || l.x > W || l.y < 0 || l.y > H)) return; // its object is off the edge: no cut-off name
      ctx.font = l.font;
      const w = ctx.measureText(l.text).width, h = parseFloat(/(\d+(?:\.\d+)?)px/.exec(l.font)[1]);
      let x, align;
      if (l.center) { x = l.x - w / 2; align = 'center'; }
      else if (l.x + l.gap + w > W - 4 * dpr) { x = l.x - l.gap - w; align = 'right'; } // near the right edge: label on the left
      else { x = l.x + l.gap; align = 'left'; }
      const box = [x - pad, l.y - h / 2 - pad, x + w + pad, l.y + h / 2 + pad];
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return;
      placed.push(box);
      ctx.fillStyle = l.color;
      ctx.textAlign = align;
      ctx.fillText(l.text, align === 'center' ? l.x : align === 'right' ? l.x - l.gap : l.x + l.gap, l.y);
    });

    // ---- selection and target
    const markers = [scene.selected, scene.target].filter(Boolean);
    markers.forEach((m, k) => {
      if (!m.vec) return;
      const q = proj(m.vec);
      if (!q || q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) return;
      ctx.strokeStyle = k === 0 ? P.select : P.target;
      ctx.lineWidth = 2 * dpr;
      const rr = 15 * dpr;
      ctx.beginPath();
      // four corner brackets
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        ctx.moveTo(q[0] + sx * rr, q[1] + sy * rr * 0.45); ctx.lineTo(q[0] + sx * rr, q[1] + sy * rr); ctx.lineTo(q[0] + sx * rr * 0.45, q[1] + sy * rr);
      });
      ctx.stroke();
    });
    ctx.restore();
    return hits;
  }

  function polyline(ctx, view, fn, n) {
    ctx.beginPath();
    let pen = false, prev = null;
    for (let k = 0; k <= n; k++) {
      const q = view.project(fn(k / n));
      if (!q || (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > Math.max(view.w, view.h) * 0.6)) { pen = false; prev = q; continue; }
      if (!pen) { ctx.moveTo(q[0], q[1]); pen = true; } else ctx.lineTo(q[0], q[1]);
      prev = q;
    }
    ctx.stroke();
  }

  function drawGround(ctx, view, P, scene, dpr, font) {
    const W = view.w, H = view.h;
    // The ground is the lower hemisphere, filled as small quads (3 deg of azimuth, rows down to the
    // nadir) in one path, so it works for any direction, roll, zoom and projection without seams.
    ctx.save();
    ctx.fillStyle = P.ground;
    ctx.beginPath();
    // over the camera picture the real ground shows: only the horizon line is drawn
    const rows = scene.transparent ? [] : [0, -4, -12, -25, -45, -70, -90];
    const big = Math.max(W, H) * 1.5;
    const ok = (q) => q && Math.abs(q[0] - W / 2) < big * 4 && Math.abs(q[1] - H / 2) < big * 4;
    const ring = rows.map((alt) => {
      const out = [];
      for (let az = 0; az <= 360; az += 3) out.push(view.project(Sky.vecOf(az, alt)));
      return out;
    });
    for (let r = 0; r < rows.length - 1; r++) {
      const a = ring[r], b = ring[r + 1];
      for (let k = 0; k < a.length - 1; k++) {
        const p1 = a[k], p2 = a[k + 1], p3 = b[k + 1], p4 = b[k];
        if (!ok(p1) || !ok(p2) || !ok(p3) || !ok(p4)) continue;
        if (Math.max(Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), Math.hypot(p1[0] - p4[0], p1[1] - p4[1]), Math.hypot(p2[0] - p3[0], p2[1] - p3[1])) > big) continue;
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath();
      }
    }
    ctx.fill('nonzero');
    // horizon line
    ctx.strokeStyle = P.groundLine; ctx.lineWidth = 1.5 * dpr;
    polyline(ctx, view, (s) => Sky.vecOf(s * 360, 0), 180);
    // cardinal points
    if (scene.labels.dir) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let k = 0; k < 8; k++) {
        const q = view.project(Sky.vecOf(k * 45, 0));
        if (!q || q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) continue;
        ctx.fillStyle = k % 2 ? P.groundLine : P.card;
        ctx.font = `${k % 2 ? 500 : 700} ${Math.round((k % 2 ? 11 : 14) * dpr)}px ${font}`;
        ctx.fillText(scene.labels.dir(k), q[0], q[1] + 6 * dpr);
      }
    }
    ctx.restore();
  }

  /*
   * Round all-sky chart: zenith in the centre, the horizon as the circle, north at the top and east on
   * the left (hold it over your head facing south). Used by the poster and the website's printable map.
   */
  function drawChart(ctx, cx, cy, R, scene) {
    const P = PALETTES[scene.palette] || PALETTES.night;
    const dpr = scene.dpr || 1;
    const font = scene.font || 'system-ui, sans-serif';
    const F = scene.F;
    const cat = scene.cat, sv = scene.vec;
    const at = (az, alt) => Sky.chartProject(az, alt, R, cx, cy);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = scene.palette === 'print' ? '#ffffff' : P.skyTop; ctx.fill();
    ctx.clip();
    // grid: altitude circles every 30 deg
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1 * dpr;
    [30, 60].forEach((a) => { const r = R * Math.tan((90 - a) * D / 2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
    const pos = (i) => {
      const e = Sky.toENU(F, sv[i * 3], sv[i * 3 + 1], sv[i * 3 + 2]);
      const h = Sky.azAltOf(e);
      return h.alt > -0.5 ? at(h.az, h.alt + Sky.refraction(h.alt)) : null;
    };
    if (scene.layers.lines) {
      ctx.strokeStyle = P.lines; ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath();
      for (const abbr in scene.consts.lines) {
        for (const poly of scene.consts.lines[abbr]) {
          for (let k = 1; k < poly.length; k++) {
            const a = pos(poly[k - 1]), b = pos(poly[k]);
            if (!a || !b) continue;
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          }
        }
      }
      ctx.stroke();
    }
    const lim = scene.limitMag || 5.2;
    const queue = [];
    for (let i = 0; i < cat.n; i++) {
      const m = cat.mag[i];
      if (m > lim) break;
      const q = pos(i);
      if (!q) continue;
      const r = Math.max(0.6, (1.7 + (4 - m) * 0.55)) * dpr * (scene.starScale || 1);
      const c = P.star || Sky.starColour(cat.bv[i]);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill();
      if (scene.labels.star && cat.names[i] && m < (scene.nameMag || 1.6)) {
        queue.push({ text: scene.labels.star(i), x: q[0], y: q[1], gap: r + 3 * dpr, font: `${Math.round(10 * dpr)}px ${font}`, color: P.starLabel, pri: 10 - m });
      }
    }
    if (scene.layers.names && scene.labels.con) {
      for (const abbr in scene.consts.labels) {
        scene.consts.labels[abbr].forEach(([ra, dec]) => {
          const p = Sky.fixedPosition(ra, dec, F);
          if (p.alt < 3) return;
          const q = at(p.az, p.alt);
          queue.push({ text: scene.labels.con(abbr), x: q[0], y: q[1], center: true, font: `italic 400 ${Math.round(10 * dpr)}px ${font}`, color: P.constLabel, pri: 1 });
        });
      }
    }
    (scene.bodies || []).forEach((b) => {
      if (b.alt < 0 || b.id === 'sun') return;
      const q = at(b.az, b.alt);
      if (b.id === 'moon') drawMoon(ctx, q[0], q[1], 7 * dpr, b.illum, scene.moonScreenAngle || 0, P);
      else { ctx.fillStyle = P.planet; ctx.beginPath(); ctx.arc(q[0], q[1], 3.2 * dpr, 0, Math.PI * 2); ctx.fill(); }
      if (scene.labels.body) {
        queue.push({ text: scene.labels.body(b.id), x: q[0], y: q[1], gap: (b.id === 'moon' ? 10 : 6) * dpr, font: `600 ${Math.round(10.5 * dpr)}px ${font}`, color: P.planetLabel, pri: 100 - (b.id === 'moon' ? 0 : 1) });
      }
    });
    // labels, most important first: on the right of their object, else on the left, else left out
    const placed = [];
    const pad = 1.5 * dpr;
    queue.sort((a, b) => b.pri - a.pri);
    ctx.textBaseline = 'middle';
    queue.forEach((l) => {
      ctx.font = l.font;
      const w = ctx.measureText(l.text).width, h = parseFloat(/(\d+(?:\.\d+)?)px/.exec(l.font)[1]);
      const tries = l.center ? [l.x - w / 2] : [l.x + l.gap, l.x - l.gap - w];
      const free = (x) => !placed.some((p) => x - pad < p[2] && x + w + pad > p[0] && l.y - h / 2 - pad < p[3] && l.y + h / 2 + pad > p[1]);
      const x = tries.find(free);
      if (x == null) return;
      placed.push([x - pad, l.y - h / 2 - pad, x + w + pad, l.y + h / 2 + pad]);
      ctx.fillStyle = l.color; ctx.textAlign = 'left';
      ctx.fillText(l.text, x, l.y);
    });
    ctx.restore();
    // the horizon ring and the compass points (east on the left)
    ctx.strokeStyle = P.card; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    if (scene.labels.dir) {
      ctx.font = `700 ${Math.round(14 * dpr)}px ${font}`; ctx.fillStyle = P.card; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [0, 2, 4, 6].forEach((k) => {
        const a = k * 45 * D;
        ctx.fillText(scene.labels.dir(k), cx - (R + 16 * dpr) * Math.sin(a), cy - (R + 16 * dpr) * Math.cos(a));
      });
    }
  }

  return { PALETTES, drawView, drawChart, drawMoon, limitMag, starRadius };
});
