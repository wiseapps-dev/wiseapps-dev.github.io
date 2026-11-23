/*
 * glyphs.js: the stroke geometry behind every letter (no DOM, used by the app, the tests,
 * the worksheet maker and the website).
 *
 * Coordinates are SVG-style (y grows downwards) on the four writing lines:
 *   top line (capitals and tall letters)  y = 0
 *   midline (x-height)                     y = 50
 *   baseline                               y = 100
 *   descender line                         y = 150
 * Letters are authored upright. A style's slant shears them about the baseline.
 *
 * One string per stroke, in writing order and in the direction the pencil moves:
 *   M x y                 start here
 *   L x y                 straight line
 *   C x1 y1 x2 y2 x y     cubic Bézier
 *   Q x1 y1 x y           quadratic Bézier
 *   O cx cy rx ry a0 a1   elliptical arc from angle a0 to a1, in degrees: 0 is 3 o'clock and
 *                         90 is 12 o'clock; a1 > a0 turns anticlockwise on screen, a1 < a0
 *                         clockwise. If the pencil isn't at the arc's start, a line joins them.
 *   S x y x y ...         smooth curve through the points (Catmull-Rom). It leaves the current
 *                         point in the direction the previous curve was heading, unless the
 *                         previous piece was a line or there was none.
 *   K                     a corner: the next S starts fresh (no inherited direction)
 *   D x y                 a dot (a tap)
 * Strokes that are closed loops (o, O, 0) are marked with a trailing Z, so the checker can
 * accept a start anywhere near the model's start.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Glyphs = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const TOP = 0, MID = 50, BASE = 100, DESC = 150;
  const rad = (d) => (d * Math.PI) / 180;
  const r1 = (v) => Math.round(v * 10) / 10;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const len = (a) => Math.hypot(a[0], a[1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function lineSeg(p, q) { return [p, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3), q]; }

  // Elliptical arc as cubic pieces of at most 90 degrees.
  function arcSegs(cx, cy, rx, ry, a0, a1) {
    const out = [];
    const sweep = a1 - a0;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / 90 - 1e-9));
    const step = sweep / n;
    const pt = (a) => [cx + rx * Math.cos(rad(a)), cy - ry * Math.sin(rad(a))];
    const d = (a) => [-rx * Math.sin(rad(a)), -ry * Math.cos(rad(a))]; // dP/da, a in radians
    for (let i = 0; i < n; i++) {
      const s = a0 + step * i;
      const e = s + step;
      const k = (4 / 3) * Math.tan(rad(step) / 4);
      const p0 = pt(s), p3 = pt(e);
      out.push([p0, add(p0, mul(d(s), k)), sub(p3, mul(d(e), k)), p3]);
    }
    return out;
  }

  // Catmull-Rom through pts (pts[0] is the current point). t0: optional start tangent.
  function splineSegs(pts, t0) {
    const out = [];
    const n = pts.length;
    if (n < 2) return out;
    const tan = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) tan.push(t0 ? mul(t0, dist(pts[0], pts[1])) : sub(pts[1], pts[0]));
      else if (i === n - 1) tan.push(sub(pts[n - 1], pts[n - 2]));
      else tan.push(mul(sub(pts[i + 1], pts[i - 1]), 0.5));
    }
    for (let i = 0; i < n - 1; i++) {
      out.push([pts[i], add(pts[i], mul(tan[i], 1 / 3)), sub(pts[i + 1], mul(tan[i + 1], 1 / 3)), pts[i + 1]]);
    }
    return out;
  }

  const unit = (v) => { const l = len(v); return l > 1e-9 ? [v[0] / l, v[1] / l] : [1, 0]; };
  function endTangent(seg) {
    const [p0, p1, p2, p3] = seg;
    let v = sub(p3, p2);
    if (len(v) < 1e-6) v = sub(p3, p1);
    if (len(v) < 1e-6) v = sub(p3, p0);
    return unit(v);
  }

  // Parse one stroke string into { segs, dot, closed }.
  function parse(src) {
    const toks = String(src).trim().split(/[\s,]+/).filter(Boolean);
    const segs = [];
    let cur = null;
    let smooth = false; // may the next S inherit the direction?
    let dot = null;
    let closed = false;
    let i = 0;
    const num = () => {
      const v = parseFloat(toks[i++]);
      if (!isFinite(v)) throw new Error('glyph stroke: bad number in "' + src + '"');
      return v;
    };
    const isNum = () => i < toks.length && /^[-+.\d]/.test(toks[i]);
    while (i < toks.length) {
      const c = toks[i++];
      if (c === 'M') { cur = [num(), num()]; smooth = false; }
      else if (c === 'L') { const p = [num(), num()]; segs.push(lineSeg(cur, p)); cur = p; smooth = false; }
      else if (c === 'C') { const a = [num(), num()], b = [num(), num()], p = [num(), num()]; segs.push([cur, a, b, p]); cur = p; smooth = true; }
      else if (c === 'Q') {
        const q = [num(), num()], p = [num(), num()];
        segs.push([cur, lerp(cur, q, 2 / 3), lerp(p, q, 2 / 3), p]); cur = p; smooth = true;
      } else if (c === 'O') {
        const cx = num(), cy = num(), rx = num(), ry = num(), a0 = num(), a1 = num();
        const s = [cx + rx * Math.cos(rad(a0)), cy - ry * Math.sin(rad(a0))];
        if (cur && dist(cur, s) > 0.05) segs.push(lineSeg(cur, s));
        const arc = arcSegs(cx, cy, rx, ry, a0, a1);
        segs.push(...arc);
        cur = arc[arc.length - 1][3]; smooth = true;
      } else if (c === 'S') {
        const pts = [cur];
        while (isNum()) pts.push([num(), num()]);
        const t0 = smooth && segs.length ? endTangent(segs[segs.length - 1]) : null;
        const sp = splineSegs(pts, t0);
        segs.push(...sp);
        cur = pts[pts.length - 1]; smooth = true;
      } else if (c === 'K') { smooth = false; }
      else if (c === 'D') { dot = [num(), num()]; cur = dot; }
      else if (c === 'Z') { closed = true; }
      else throw new Error('glyph stroke: unknown command ' + c + ' in "' + src + '"');
      if (c !== 'D' && c !== 'K' && c !== 'Z' && !cur) throw new Error('glyph stroke: no start point in "' + src + '"');
    }
    if (dot) return { segs: [], dot, closed: false };
    if (!segs.length) throw new Error('glyph stroke: empty "' + src + '"');
    return { segs, dot: null, closed };
  }

  // Affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
  const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  const compose = (m2, m1) => [ // m2 after m1
    m2[0] * m1[0] + m2[2] * m1[1], m2[1] * m1[0] + m2[3] * m1[1],
    m2[0] * m1[2] + m2[2] * m1[3], m2[1] * m1[2] + m2[3] * m1[3],
    m2[0] * m1[4] + m2[2] * m1[5] + m2[4], m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
  ];
  const ID = [1, 0, 0, 1, 0, 0];
  const translate = (x, y) => [1, 0, 0, 1, x, y];
  const scale = (sx, sy) => [sx, 0, 0, sy == null ? sx : sy, 0, 0];
  // Shear to the right by deg degrees about the baseline (y = 100).
  const slant = (deg) => { const k = Math.tan(rad(deg)); return [1, 0, -k, 1, k * BASE, 0]; };

  function transformStroke(st, m) {
    if (st.dot) return Object.assign({}, st, { dot: apply(m, st.dot) });
    return Object.assign({}, st, { segs: st.segs.map((s) => s.map((p) => apply(m, p))) });
  }

  // Polyline of a stroke, about one point per `step` units.
  function sampleStroke(st, step) {
    const h = step || 1;
    if (st.dot) return [st.dot.slice()];
    const out = [st.segs[0][0].slice()];
    for (const s of st.segs) {
      const approx = (dist(s[0], s[1]) + dist(s[1], s[2]) + dist(s[2], s[3]) + dist(s[0], s[3])) / 2;
      const n = Math.max(1, Math.ceil(approx / h));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        out.push([
          u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
          u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
        ]);
      }
    }
    return out;
  }

  function polyLength(pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
    return l;
  }

  // n points evenly spaced along a polyline.
  function resample(pts, n) {
    if (!pts.length) return [];
    if (pts.length === 1) return Array.from({ length: n }, () => pts[0].slice());
    const total = polyLength(pts);
    if (total < 1e-9) return Array.from({ length: n }, () => pts[0].slice());
    const out = [pts[0].slice()];
    const step = total / (n - 1);
    let acc = 0, i = 1, prev = pts[0];
    let want = step;
    while (out.length < n - 1 && i < pts.length) {
      const d = dist(prev, pts[i]);
      if (acc + d >= want) {
        const t = (want - acc) / d;
        const p = lerp(prev, pts[i], t);
        out.push(p);
        acc = want;
        prev = p;
        want += step;
      } else {
        acc += d;
        prev = pts[i];
        i++;
      }
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out;
  }

  // Shortest distance from p to a polyline.
  function distToPoly(p, pts) {
    if (pts.length === 1) return dist(p, pts[0]);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const ab = sub(b, a);
      const l2 = ab[0] * ab[0] + ab[1] * ab[1];
      let t = l2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
      if (d < best) best = d;
    }
    return best;
  }

  function pathD(st) {
    if (st.dot) return '';
    let d = 'M' + r1(st.segs[0][0][0]) + ' ' + r1(st.segs[0][0][1]);
    for (const s of st.segs) {
      const straight = Math.abs((s[1][0] - s[0][0]) * (s[3][1] - s[0][1]) - (s[1][1] - s[0][1]) * (s[3][0] - s[0][0])) < 1e-6 &&
        Math.abs((s[2][0] - s[0][0]) * (s[3][1] - s[0][1]) - (s[2][1] - s[0][1]) * (s[3][0] - s[0][0])) < 1e-6;
      if (straight) d += 'L' + r1(s[3][0]) + ' ' + r1(s[3][1]);
      else d += 'C' + [s[1], s[2], s[3]].map((p) => r1(p[0]) + ' ' + r1(p[1])).join(' ');
    }
    return d;
  }

  function bbox(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of strokes) {
      for (const p of sampleStroke(st, 2)) {
        if (p[0] < x0) x0 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[0] > x1) x1 = p[0];
        if (p[1] > y1) y1 = p[1];
      }
    }
    return { x0, y0, x1, y1 };
  }

  // Start point and the direction the pencil sets off in (for start dots and arrows).
  function startOf(st) {
    if (st.dot) return { p: st.dot.slice(), dir: [0, 1] };
    const pts = sampleStroke(st, 1);
    const p = pts[0];
    let j = 1;
    while (j < pts.length - 1 && dist(p, pts[j]) < 8) j++;
    return { p: p.slice(), dir: unit(sub(pts[j], p)) };
  }
  function endOf(st) {
    if (st.dot) return st.dot.slice();
    const s = st.segs[st.segs.length - 1];
    return s[3].slice();
  }

  // A point and heading part-way along a stroke (0..1 of its length), for arrows and the demo.
  function along(st, f) {
    const pts = sampleStroke(st, 1);
    const total = polyLength(pts);
    let want = Math.max(0, Math.min(1, f)) * total, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      if (acc + d >= want && d > 0) {
        const t = (want - acc) / d;
        return { p: lerp(pts[i - 1], pts[i], t), dir: unit(sub(pts[i], pts[i - 1])) };
      }
      acc += d;
    }
    const n = pts.length;
    return { p: pts[n - 1].slice(), dir: n > 1 ? unit(sub(pts[n - 1], pts[n - 2])) : [1, 0] };
  }

  return {
    TOP, MID, BASE, DESC,
    parse, transformStroke, sampleStroke, resample, polyLength, distToPoly, pathD, bbox,
    startOf, endOf, along, dist,
    matrix: { ID, apply, compose, translate, scale, slant },
  };
});
