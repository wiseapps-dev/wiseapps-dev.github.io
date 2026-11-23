/*
 * worksheet.js: printable handwriting worksheets as PDF, made on the device (no DOM, no network,
 * no fonts: every letter on the page, the title included, is drawn from the style's own strokes).
 *
 *   const r = Worksheet.build({ style: 'us', title: 'Mia', rows: Worksheet.nameRows('us', 'Mia') })
 *   r.bytes  // Uint8Array, a PDF 1.4 file;  r.pages  // page count
 *
 * Row modes: 'model' (solid, with green start dots and stroke numbers), 'trace' (dotted grey),
 * 'start' (only the start dot of each letter), 'blank' (empty lines). A row is either { text } or
 * { repeat: 'a' }, which repeats a character (or a short group such as 'Aa') to fill the line.
 * Paper: 'a4' or 'letter'; Worksheet.paperFor('en-US') picks the local one.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Worksheet = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const G = node ? require('./glyphs.js') : root.Glyphs;
  const S = node ? require('./styles.js') : root.Styles;

  const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
  const LETTER_REGIONS = ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'PR', 'SV'];
  function paperFor(tag) {
    const r = (String(tag || '').replace('_', '-').split('-')[1] || '').toUpperCase();
    return LETTER_REGIONS.includes(r) ? 'letter' : 'a4';
  }

  const INK = [0.114, 0.169, 0.31]; // #1d2b4f
  const GREY = [0.55, 0.58, 0.64];
  const LINE = [0.6, 0.76, 0.94];
  const BASE = [0.86, 0.36, 0.36];
  const GO = [0.18, 0.64, 0.42];
  const n = (v) => { const s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; };
  const rgb = (c, stroke) => c.map(n).join(' ') + (stroke ? ' RG\n' : ' rg\n');

  // A glyph's strokes as PDF path operators, in glyph units (the caller sets the transform).
  function strokePaths(g) {
    let out = '';
    for (const st of g.strokes) {
      if (st.dot) continue;
      const s0 = st.segs[0][0];
      out += `${n(s0[0])} ${n(s0[1])} m\n`;
      for (const s of st.segs) out += `${n(s[1][0])} ${n(s[1][1])} ${n(s[2][0])} ${n(s[2][1])} ${n(s[3][0])} ${n(s[3][1])} c\n`;
    }
    return out;
  }
  function circle(x, y, r) {
    const k = 0.5523 * r;
    return `${n(x + r)} ${n(y)} m ${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c ${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c ${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c ${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c f\n`;
  }
  function dots(g) {
    let out = '';
    for (const st of g.strokes) if (st.dot) out += circle(st.dot[0], st.dot[1], 3.4);
    return out;
  }

  // One glyph at (x, baselineTop) with scale s (points per glyph unit), PDF y up.
  function drawGlyph(g, x, yTop, s, mode, number, joined) {
    const first = g.strokes.findIndex((st) => !st.dot);
    let out = `q ${n(s)} 0 0 ${n(-s)} ${n(x)} ${n(yTop)} cm 1 J 1 j\n`;
    const lw = (pt) => n(pt / s);
    if (mode === 'model') {
      out += `${rgb(INK, true)} ${lw(1.9)} w [] 0 d\n${strokePaths(g)}S\n${rgb(INK, false)}${dots(g)}`;
      const starts = [];
      g.strokes.forEach((st, i) => {
        if (st.dot || (joined && i === first)) return; // a joined cursive letter flows on from the last one
        const a = G.startOf(st);
        out += rgb(GO, false) + circle(a.p[0], a.p[1], 2.6 / s);
        // two strokes that start at the same point (M, N): the second number goes on the right
        const shared = starts.some((p) => G.dist(p, a.p) < 8);
        starts.push(a.p);
        if (number) out += numberMark(i + 1, a.p[0] + (shared ? 8 : -14), a.p[1] - 8, s);
      });
    } else if (mode === 'trace') {
      out += `${rgb(GREY, true)} ${lw(1.6)} w [0 ${lw(3.1)}] 0 d\n${strokePaths(g)}S\n[] 0 d ${rgb(GREY, false)}${dots(g)}`;
    } else if (mode === 'start') {
      const st = joined ? null : g.strokes[first];
      if (st) { const a = G.startOf(st); out += rgb(GO, false) + circle(a.p[0], a.p[1], 2.6 / s); }
    }
    return out + 'Q\n';
  }

  // Small stroke numbers, drawn with the digit strokes of the plain US print style.
  function numberMark(k, x, y, s) {
    const g = S.glyph('us', String(k));
    if (!g) return '';
    const f = 0.17; // relative size
    return `q ${n(f)} 0 0 ${n(f)} ${n(x - 3)} ${n(y - 7)} cm ${rgb(GO, true)} ${n(1.3 / (s * f))} w [] 0 d\n${strokePaths(g)}S Q\n`;
  }

  // The four writing lines for one row.
  function ruling(x0, x1, yTop, s) {
    const y = (u) => yTop - u * s;
    let out = `q 0.6 w [] 0 d ${rgb(LINE, true)}\n${n(x0)} ${n(y(0))} m ${n(x1)} ${n(y(0))} l S\n`;
    out += `[3 3] 0 d ${n(x0)} ${n(y(50))} m ${n(x1)} ${n(y(50))} l S\n[] 0 d\n`;
    out += `${n(x0)} ${n(y(150))} m ${n(x1)} ${n(y(150))} l S\n`;
    out += `0.9 w ${rgb(BASE, true)} ${n(x0)} ${n(y(100))} m ${n(x1)} ${n(y(100))} l S Q\n`;
    return out;
  }

  // Lay out a row's text, scaled to fit the width; repeat fills the line.
  function rowItems(style, row, width, s, gap) {
    if (row.repeat) {
      const unit = S.layout(style, row.repeat, gap);
      const step = unit.width + (Array.from(row.repeat).length > 2 ? 72 : 34); // words get a wider gap
      const count = Math.max(1, Math.floor((width / s + 34) / step));
      const items = [];
      for (let i = 0; i < count; i++) unit.items.forEach((it) => items.push({ g: it.g, x: it.x + i * step, joined: it.joined }));
      return { items, scale: s };
    }
    const lay = S.layout(style, row.text || '', gap);
    const fit = lay.width * s > width ? width / lay.width : s;
    return { items: lay.items, scale: fit };
  }

  function build(o) {
    const style = o.style;
    const [W, H] = PAPER[o.paper] || PAPER.a4;
    const M = 42;
    const s = o.size === 'small' ? 0.24 : o.size === 'medium' ? 0.3 : 0.36; // points per glyph unit
    const rowH = 150 * s + 34 * s + 14; // lines, a little room above for accents, and a gap
    const headH = 70;
    const footH = 26;
    const perPage = Math.max(1, Math.floor((H - 2 * M - headH - footH) / rowH));
    const rows = o.rows || [];
    const pages = [];
    for (let i = 0; i < Math.max(1, rows.length); i += perPage) pages.push(rows.slice(i, i + perPage));
    const streams = pages.map((pageRows, pi) => {
      let c = '';
      // title in the style's own letters
      if (o.title) {
        const lay = S.layout(style, o.title, 8);
        const ts = Math.min(0.26, (W - 2 * M) / Math.max(1, lay.width));
        const top = H - M - 8;
        c += `q ${rgb(INK, true)} 1.6 w 1 J [] 0 d\n`;
        lay.items.forEach((it) => {
          c += `q ${n(ts)} 0 0 ${n(-ts)} ${n(M + it.x * ts)} ${n(top)} cm ${n(2.2 / ts)} w\n${strokePaths(it.g)}S\n${rgb(INK, false)}${dots(it.g)}Q\n`;
        });
        c += 'Q\n';
      }
      c += `q 0.5 w ${rgb(LINE, true)} ${n(M)} ${n(H - M - headH + 12)} m ${n(W - M)} ${n(H - M - headH + 12)} l S Q\n`;
      pageRows.forEach((row, ri) => {
        const yTop = H - M - headH - ri * rowH - 34 * s;
        c += ruling(M, W - M, yTop, s);
        if (row.mode === 'blank') return;
        const lay = rowItems(style, row, W - 2 * M - 8, s, 14);
        const sc = lay.scale;
        const lift = (s - sc) * 100; // a scaled-down row keeps its baseline on the line
        lay.items.forEach((it, k) => {
          c += drawGlyph(it.g, M + 6 + it.x * sc, yTop - lift, sc, row.mode, row.mode === 'model' && (k === 0 || !row.repeat), it.joined);
        });
      });
      // footer: the app name, small, and the page number
      const foot = S.layout('us', 'pencilwise', 6);
      const fs = 0.07;
      c += `q ${rgb(GREY, true)} 1 J 1 j [] 0 d\n`;
      foot.items.forEach((it) => { c += `q ${n(fs)} 0 0 ${n(-fs)} ${n(M + it.x * fs)} ${n(M - 4)} cm ${n(0.8 / fs)} w\n${strokePaths(it.g)}S\n${rgb(GREY, false)}${dots(it.g)}Q\n`; });
      if (pages.length > 1) {
        const num = S.layout('us', `${pi + 1}`, 6);
        num.items.forEach((it) => { c += `q ${n(fs)} 0 0 ${n(-fs)} ${n(W - M - 10 + it.x * fs)} ${n(M - 4)} cm ${n(0.8 / fs)} w\n${strokePaths(it.g)}S Q\n`; });
      }
      c += 'Q\n';
      return c;
    });
    const bytes = writePdf(streams, W, H);
    return { bytes, pages: pages.length, perPage };
  }

  // A minimal PDF 1.4: catalog, page tree, one content stream per page, info, xref.
  function writePdf(streams, W, H) {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null);
    const pagesObj = add(null);
    const kids = [];
    for (const st of streams) {
      const content = add(`<< /Length ${utf8(st).length} >>\nstream\n${st}endstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << >> /Contents ${content} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const info = add('<< /Title (Pencilwise worksheet) /Creator (Pencilwise) /Producer (Pencilwise) >>');
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const parts = [latin1(out)];
    let pos = parts[0].length;
    const offsets = [];
    objs.forEach((body, i) => {
      offsets.push(pos);
      const b = utf8(`${i + 1} 0 obj\n${body}\nendobj\n`);
      parts.push(b);
      pos += b.length;
    });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => { xref += String(o).padStart(10, '0') + ' 00000 n \n'; });
    xref += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(utf8(xref));
    const total = parts.reduce((a, p) => a + p.length, 0);
    const bytes = new Uint8Array(total);
    let k = 0;
    for (const p of parts) { bytes.set(p, k); k += p.length; }
    return bytes;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function latin1(s) { return Uint8Array.from(Array.from(s), (c) => c.charCodeAt(0) & 255); }

  /* ---------------- ready-made sheets ---------------- */
  // One letter: its capital and lowercase together where the style has both (Pro), else alone.
  function letterRows(style, ch, opts) {
    const pair = opts && opts.pair && ch.toLowerCase() !== ch.toUpperCase() ? ch.toUpperCase() + ch.toLowerCase() : ch;
    return [
      { repeat: pair, mode: 'model' },
      { repeat: pair, mode: 'trace' },
      { repeat: pair, mode: 'trace' },
      { repeat: pair, mode: 'trace' },
      { repeat: pair, mode: 'start' },
      { repeat: pair, mode: 'start' },
      { mode: 'blank' },
    ];
  }
  function nameRows(style, name) {
    return [
      { repeat: name, mode: 'model' },
      { repeat: name, mode: 'trace' },
      { repeat: name, mode: 'trace' },
      { repeat: name, mode: 'trace' },
      { repeat: name, mode: 'start' },
      { mode: 'blank' },
      { mode: 'blank' },
    ];
  }
  // A whole set (for example the capitals): each line holds as many as fit, dotted to trace.
  function setRows(style, chars, perRow) {
    const rows = [];
    const k = perRow || 7;
    for (let i = 0; i < chars.length; i += k) rows.push({ text: chars.slice(i, i + k).join(' '), mode: 'trace' });
    return rows;
  }

  return { build, letterRows, nameRows, setRows, paperFor, PAPER };
});
