/*
 * styles.js: the school handwriting styles, which letters each one has, and the glyphs ready to draw
 * and check. No DOM; works in the app, the tests, the worksheet maker and the website.
 *
 *   Styles.list()                       every style (id, kind, lang, region, flags)
 *   Styles.get(id)                      one style
 *   Styles.defaultFor('de-AT')          the style for a device language/region
 *   Styles.glyph(id, 'a')               { ch, w, strokes, src, any } with strokes parsed and slanted
 *   Styles.alphabet(id, lang)           { upper, lower, digits } in the style's own alphabet order
 *                                       (lang: the child's language, used by School print)
 *   Styles.langOf(id, lang)             the language of the style's letters, words and voice
 *   Styles.has(id, ch)                  can the style draw this character (diacritics are composed)
 *   Styles.layout(id, text, gap)        glyphs placed along a line, for names and worksheets
 *
 * Most letter shapes are original drawings: the US, UK and Australian (NSW & ACT) styles, the
 * German Grundschrift and French school cursive follow those models' published formation rules;
 * School print is a common print with the letters of German, French, Spanish, Italian, Dutch,
 * Polish, Portuguese or Swedish. The other Australian states, New Zealand and Spanish school
 * cursive are drawn from openly licensed fonts of those models (styles/fitted.js, SIL OFL 1.1,
 * made by app/tools/fit). Each style is "in the style of" its model; none is endorsed.
 * Sources: LICENSES/THIRD_PARTY.md.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Styles = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const G = typeof module === 'object' && module.exports ? require('./glyphs.js') : root.Glyphs;
  const sets = () => (typeof module === 'object' && module.exports
    ? { print: require('./styles/print.js'), precursive: require('./styles/precursive.js'), cursive: require('./styles/cursive.js'), fitted: require('./styles/fitted.js') }
    : root.StyleSets || {});

  // Each style: kind (print | precursive | cursive), lang (alphabet and voice), region, slant in
  // degrees, the letter options for its print set, and which characters may be written in any order
  // (models disagree, so the checker doesn't insist). loose: characters whose stroke order and
  // direction the model's sources don't settle: shown one way, any order and direction accepted.
  // set 'fitted': letters drawn from an openly licensed font of that model (styles/fitted.js,
  // SIL OFL 1.1), already at the font's own slant.
  const DEFS = [
    { id: 'us', kind: 'print', lang: 'en', region: 'US', slant: 0,
      opt: { round: 1, capRound: 1 }, any: '' },
    { id: 'us-slant', kind: 'precursive', lang: 'en', region: 'US', slant: 12, set: 'slanted', pro: true, any: '' },
    { id: 'us-cursive', kind: 'cursive', lang: 'en', region: 'US', slant: 12, set: 'usCursive', pro: true, any: 'TEFHIJKXY' },
    { id: 'uk', kind: 'print', lang: 'en', region: 'GB', slant: 0,
      opt: { round: 0.84, capRound: 0.84, k: 'loop', y: 'u', t: 'foot', q: 'flick', I: 'plain', T: 'across-first' }, any: 'TEFHIJKXY' },
    { id: 'uk-precursive', kind: 'precursive', lang: 'en', region: 'GB', slant: 0, set: 'ukPrecursive', pro: true,
      opt: { round: 0.84, capRound: 0.84, I: 'plain', T: 'across-first' }, any: 'TEFHIJKXY' },
    { id: 'au-nsw', kind: 'print', lang: 'en', region: 'AU', slant: 5,
      opt: { round: 0.82, capRound: 0.84, k: 'loop', y: 'u', q: 'flick', I: 'plain' }, any: '' },
    // The other Australian states' beginners' print, from the AU School Handwriting fonts. Victoria
    // (also WA and NT) has an Arrows version that settles every first stroke; Queensland, South
    // Australia and Tasmania don't, so the letters the state charts write differently are loose.
    { id: 'au-vic', kind: 'print', lang: 'en', region: 'AU', slant: 0, set: 'fitted', pro: true, fallback: 'au-nsw', any: '' },
    { id: 'au-qld', kind: 'print', lang: 'en', region: 'AU', slant: 0, set: 'fitted', pro: true, fallback: 'au-nsw', any: '', loose: 'EIJMN057' },
    { id: 'au-sa', kind: 'print', lang: 'en', region: 'AU', slant: 0, set: 'fitted', pro: true, fallback: 'au-nsw', any: '', loose: 'EIJMN057' },
    { id: 'au-tas', kind: 'print', lang: 'en', region: 'AU', slant: 0, set: 'fitted', pro: true, fallback: 'au-nsw', any: '', loose: 'EIJMN057' },
    // New Zealand's sloped print, from Playwrite NZ's unjoined letters; no arrows source either.
    { id: 'nz', kind: 'print', lang: 'en', region: 'NZ', slant: 0, set: 'fitted', pro: true, fallback: 'au-nsw', any: '', loose: 'EIJMN057' },
    { id: 'de-grund', kind: 'precursive', lang: 'de', region: 'DE', slant: 0, set: 'deGrund', pro: true,
      opt: { round: 0.86, capRound: 0.86, I: 'plain', T: 'across-first', one: 'flag', seven: 'bar' }, any: 'TEFHKXY' },
    { id: 'fr-cursive', kind: 'cursive', lang: 'fr', region: 'FR', slant: 10, set: 'frCursive', pro: true, any: 'TEFHKXY' },
    // Spanish school cursive, from Playwrite ES: joined lowercase, print capitals and numbers.
    { id: 'es-cursive', kind: 'cursive', lang: 'es', region: 'ES', slant: 0, set: 'fitted', pro: true, fallback: 'school', any: 'TEFHIKXY', loose: 'x' },
    // School print: one common continental print (single-storey a and g, t with a foot, a 1 with an
    // up-stroke, a crossed 7) with the letters of the child's language. The first builds had eight
    // print styles here (German, French, Spanish, Italian, Dutch, Polish, Portuguese, Swedish) whose
    // letters were drawn the same; it is one style now, and not presented as any country's model.
    // Germany and France keep their own distinct styles: the Grundschrift and French school cursive.
    { id: 'school', kind: 'print', lang: null, langs: ['de', 'fr', 'es', 'it', 'nl', 'pl', 'pt-PT', 'sv'], region: 'EU', slant: 0,
      opt: { round: 0.86, capRound: 0.86, t: 'foot', I: 'plain', one: 'flag', seven: 'bar' }, any: 'TEFHKXY' },
  ];

  // Alphabets in each language's own order (capitals; lowercase follows). ß has no school capital.
  const ALPHA = {
    en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    de: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
    fr: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    es: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ',
    it: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    nl: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    pl: 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ',
    'pt-PT': 'ABCÇDEFGHIJKLMNOPQRSTUVWXYZ',
    sv: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ',
  };
  const EXTRA_LOWER = { de: 'ß' };
  // Style ids of the first builds, merged into School print: old id -> the letters' language.
  const LEGACY = { de: 'de', fr: 'fr', es: 'es', it: 'it', nl: 'nl', pl: 'pl', pt: 'pt-PT', sv: 'sv' };
  const DIGITS = '0123456789';

  // Default style for a device language and region.
  function defaultFor(tag) {
    const t = String(tag || 'en-US').replace('_', '-');
    const [l, r] = [t.split('-')[0].toLowerCase(), (t.split('-')[1] || '').toUpperCase()];
    if (l === 'en') {
      if (r === 'AU') return 'au-nsw';
      if (['GB', 'IE', 'NZ', 'ZA', 'IN', 'SG', 'HK', 'MT'].includes(r)) return 'uk';
      return 'us';
    }
    const byLang = { de: 'school', fr: 'school', es: 'school', it: 'school', nl: 'school', pl: 'school', pt: 'school', sv: 'school' };
    return byLang[l] || 'us';
  }

  /* ---------------- diacritics, composed onto a base letter ---------------- */
  const BASE = {
    'Ä': ['A', 'uml'], 'Ö': ['O', 'uml'], 'Ü': ['U', 'uml'], 'ä': ['a', 'uml'], 'ö': ['o', 'uml'], 'ü': ['u', 'uml'],
    'Å': ['A', 'ring'], 'å': ['a', 'ring'], 'Ñ': ['N', 'tilde'], 'ñ': ['n', 'tilde'],
    'Ç': ['C', 'cedil'], 'ç': ['c', 'cedil'], 'Ą': ['A', 'ogon'], 'ą': ['a', 'ogon'], 'Ę': ['E', 'ogon'], 'ę': ['e', 'ogon'],
    'Ł': ['L', 'bar'], 'ł': ['l', 'bar'], 'Ż': ['Z', 'dot'], 'ż': ['z', 'dot'],
    'Ć': ['C', 'acute'], 'ć': ['c', 'acute'], 'Ń': ['N', 'acute'], 'ń': ['n', 'acute'], 'Ó': ['O', 'acute'], 'ó': ['o', 'acute'],
    'Ś': ['S', 'acute'], 'ś': ['s', 'acute'], 'Ź': ['Z', 'acute'], 'ź': ['z', 'acute'],
    'Á': ['A', 'acute'], 'á': ['a', 'acute'], 'É': ['E', 'acute'], 'é': ['e', 'acute'], 'Í': ['I', 'acute'], 'í': ['i', 'acute'],
    'Ú': ['U', 'acute'], 'ú': ['u', 'acute'], 'Ý': ['Y', 'acute'], 'ý': ['y', 'acute'],
    'À': ['A', 'grave'], 'à': ['a', 'grave'], 'È': ['E', 'grave'], 'è': ['e', 'grave'], 'Ì': ['I', 'grave'], 'ì': ['i', 'grave'],
    'Ò': ['O', 'grave'], 'ò': ['o', 'grave'], 'Ù': ['U', 'grave'], 'ù': ['u', 'grave'],
    'Â': ['A', 'circ'], 'â': ['a', 'circ'], 'Ê': ['E', 'circ'], 'ê': ['e', 'circ'], 'Î': ['I', 'circ'], 'î': ['i', 'circ'],
    'Ô': ['O', 'circ'], 'ô': ['o', 'circ'], 'Û': ['U', 'circ'], 'û': ['u', 'circ'],
    'Ë': ['E', 'uml'], 'ë': ['e', 'uml'], 'Ï': ['I', 'uml'], 'ï': ['i', 'uml'], 'ÿ': ['y', 'uml'], 'Ÿ': ['Y', 'uml'],
    'Ã': ['A', 'tilde'], 'ã': ['a', 'tilde'], 'Õ': ['O', 'tilde'], 'õ': ['o', 'tilde'],
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  // Marks sit above the x-height for lowercase and above the top line for capitals; drawn after the letter.
  function markStrokes(kind, cx, upper, box, w, base) {
    const y = upper ? -24 : 26; // top of the mark zone
    const ys = upper ? -10 : 40; // bottom of the mark zone
    const h = ys - y;
    switch (kind) {
      case 'acute': return [`M ${r1(cx + 6)} ${y} L ${r1(cx - 5)} ${ys}`];
      case 'grave': return [`M ${r1(cx - 6)} ${y} L ${r1(cx + 5)} ${ys}`];
      case 'circ': return [`M ${r1(cx - 9)} ${ys} L ${r1(cx)} ${y} L ${r1(cx + 9)} ${ys}`];
      case 'uml': return [`D ${r1(cx - 9)} ${r1(y + h / 2)}`, `D ${r1(cx + 9)} ${r1(y + h / 2)}`];
      case 'dot': return [`D ${r1(cx)} ${r1(y + h / 2)}`];
      case 'ring': return [`O ${r1(cx)} ${r1(y + h / 2)} 7 7 90 450 Z`];
      case 'tilde': return [`M ${r1(cx - 11)} ${r1(ys - 2)} S ${r1(cx - 5)} ${r1(y + 2)} ${r1(cx + 4)} ${r1(ys - 3)} ${r1(cx + 11)} ${r1(y + 1)}`];
      case 'cedil': return [`M ${r1(cx)} 100 L ${r1(cx - 2)} 108 S ${r1(cx + 7)} 113 ${r1(cx + 4)} 123 ${r1(cx - 7)} 124`];
      case 'ogon': {
        // hangs from the foot of the right stem (a, A) or just right of the bottom of the curve (e, E)
        const x = r1(base === 'e' ? cx + 5 : base === 'E' ? box.x1 - 10 : box.x1 - 2);
        return [`M ${x} 100 S ${r1(x - 7)} 109 ${r1(x - 6)} 119 ${r1(x + 2)} 124 ${r1(x + 9)} 121`];
      }
      case 'bar': { const x = r1(box.x0); return upper ? [`M ${r1(x - 10)} 62 L ${r1(x + 16)} 40`] : [`M ${r1(x - 9)} 58 L ${r1(x + 11)} 36`]; }
      default: return [];
    }
  }

  /* ---------------- building and caching glyphs ---------------- */
  const byId = {};
  DEFS.forEach((d) => { byId[d.id] = d; });
  const rawCache = {};
  function rawSet(id) {
    if (rawCache[id]) return rawCache[id];
    const d = byId[id];
    const S = sets();
    let set;
    if (d.set === 'fitted') set = S.fitted.get(id);
    else if (d.kind === 'print') set = S.print.printSet(d.opt);
    else if (d.set === 'slanted' || d.set === 'ukPrecursive' || d.set === 'deGrund') set = S.precursive.make(d.set, d.opt);
    else set = S.cursive.make(d.set, d.opt);
    rawCache[id] = set;
    return set;
  }

  const cache = {};
  function glyph(id, ch) {
    const key = id + '|' + ch;
    if (cache[key]) return cache[key];
    const d = byId[id];
    if (!d) return null;
    const set = rawSet(id);
    let src = set[ch];
    let slant = d.slant;
    let w;
    let strokes;
    if (src) {
      w = src.w;
      strokes = src.s.slice();
    } else if (BASE[ch] && set[BASE[ch][0]]) {
      const [b, mark] = BASE[ch];
      const base = set[b];
      // dotless i and j under a mark
      strokes = base.s.filter((s) => !((b === 'i' || b === 'j') && /^D /.test(s)));
      w = base.w;
      const parsed = strokes.map(G.parse);
      const box = G.bbox(parsed);
      const upper = b !== b.toLowerCase();
      const cx = (box.x0 + box.x1) / 2;
      strokes = strokes.concat(markStrokes(mark, cx, upper, box, w, b));
      src = { w, s: strokes, composed: true, j: base.j };
    } else if (d.fallback && rawSet(d.fallback)[ch]) {
      // a letter the style's font doesn't cover (ß): the closest drawn style's
      src = rawSet(d.fallback)[ch];
      w = src.w;
      strokes = src.s.slice();
      slant = byId[d.fallback].slant;
    } else {
      return null;
    }
    const m = slant ? G.matrix.slant(slant) : null;
    const parsed = strokes.map((s) => {
      const p = G.parse(s);
      return m ? G.transformStroke(p, m) : p;
    });
    const loose = !!d.loose && d.loose.includes(BASE[ch] ? BASE[ch][0] : ch);
    const anyOrder = loose || ((d.any || '').includes(ch.toUpperCase()) && ch === ch.toUpperCase() && ch !== ch.toLowerCase());
    // A slanted letter leans right above the baseline and left below it: widen the box to fit.
    const box = G.bbox(parsed);
    const x0 = Math.min(0, box.x0 - 6);
    const w2 = Math.max(w, box.x1 + 6) - x0;
    const g = { ch, style: id, w: w2, x0, strokes: parsed, src: strokes, any: anyOrder, loose, box };
    if (src.j) g.join = src.j;
    cache[key] = g;
    return g;
  }

  // The language of a style's letters, words and voice: fixed for most styles; for School print
  // the child's chosen language (a tag such as 'pl' or 'pt-BR'), else the first of its languages.
  function langOf(id, want) {
    const d = byId[id];
    if (!d) return 'en';
    if (d.lang) return d.lang;
    const w = String(want || '').replace('_', '-');
    const l = w.split('-')[0].toLowerCase();
    const hit = d.langs.find((x) => x === w || x.split('-')[0] === l);
    return hit || d.langs[0];
  }

  function alphabet(id, want) {
    const d = byId[id];
    const lang = d ? langOf(id, want) : 'en';
    const up = Array.from(ALPHA[lang] || ALPHA.en);
    const lower = up.map((c) => c.toLowerCase()).concat(Array.from(EXTRA_LOWER[lang] || ''));
    return { upper: up, lower, digits: Array.from(DIGITS) };
  }

  const has = (id, ch) => !!glyph(id, ch);

  // Cursive joins. A lowercase cursive letter starts on the baseline with an entry stroke.
  // - After a letter whose exit ends low (a, c, d, e, ...), the next letter moves left so that its
  //   entry runs through the end of that exit, and the word reads as joined.
  // - After a high exit at the middle line (b, o, v, w), the next letter's entry is replaced by a
  //   short bridge from the exit, as schools teach it; for e, whose loop is made by the entry, the
  //   bridge dips down into the lower part of the entry so the loop stays.
  const joinCache = {};
  const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  function joinInfo(g) {
    const key = g.style + ':' + g.ch;
    if (joinCache[key]) return joinCache[key];
    const idx = g.strokes.findIndex((x) => !x.dot);
    const info = { entry: false, exit: null, high: false, idx };
    const st = g.strokes[idx];
    if (st && !st.closed) {
      const a = st.segs[0][0];
      info.entry = Math.abs(a[0]) < 0.5 && Math.abs(a[1] - 100) < 0.5 && st.segs[0][3][1] < 99;
      const last = st.segs[st.segs.length - 1];
      const e = last[3];
      if (info.entry && e[1] > 75 && e[1] < 95) info.exit = e;
      if (info.entry && e[1] > 40 && e[1] < 65) { info.exit = e; info.high = true; }
      info.exitDir = norm([e[0] - last[2][0], e[1] - last[2][1]]);
      info.st = st;
      // Letters from a joined font are placed as the font places them (fitted.js: j).
      if (info.entry && g.join) { info.adv = g.join[0]; info.inX = g.join[1]; }
    }
    joinCache[key] = info;
    return info;
  }
  // x (glyph units) where the entry stroke first rises to height y
  function entryAt(info, y) {
    for (const p of G.sampleStroke(info.st, 1)) if (p[1] <= y) return p[0];
    return 0;
  }
  // The segment where a bridge from a high exit at height y meets the entry, and whether it dips.
  function bridgeTo(info, y) {
    const segs = info.st.segs;
    let k = segs.findIndex((sg) => sg[0][1] <= y + 6);
    if (k <= 0) return null;
    // keep the entry's loop when the stroke turns back left straight after that point (e)
    const turns = segs[k][3][0] < segs[k][0][0] - 0.5;
    if (turns) {
      k = segs.findIndex((sg) => sg[0][1] <= 88);
      if (k <= 0) return null;
    }
    return { k, dip: turns };
  }
  function bridged(g, info, k, from) {
    const st = info.st;
    const q = st.segs[k][0];
    const sd = st.segs[k];
    const qDir = norm([sd[1][0] - sd[0][0], sd[1][1] - sd[0][1]]);
    const L = Math.hypot(q[0] - from.p[0], q[1] - from.p[1]) * 0.4;
    const c1 = [from.p[0] + from.dir[0] * L, from.p[1] + from.dir[1] * L];
    const c2 = [q[0] - qDir[0] * L, q[1] - qDir[1] * L];
    const stroke = Object.assign({}, st, { segs: [[from.p.slice(), c1, c2, q.slice()]].concat(st.segs.slice(k)) });
    const strokes = g.strokes.slice();
    strokes[info.idx] = stroke;
    return Object.assign({}, g, { strokes, joined: true });
  }

  // A low exit and the next letter's entry rise from the same point: the exit stops where the
  // entry starts, so the join is drawn once.
  function trimExit(g, at) {
    let si = -1, best = -Infinity;
    g.strokes.forEach((st, i) => { if (!st.dot && st.segs.length) { const e = st.segs[st.segs.length - 1][3]; if (e[0] > best) { best = e[0]; si = i; } } });
    if (si < 0) return g;
    const segs = g.strokes[si].segs;
    let k = -1, d = 8;
    for (let i = Math.floor(segs.length * 0.6); i < segs.length; i++) {
      const q = segs[i][0];
      const di = Math.hypot(q[0] - at[0], q[1] - at[1]);
      if (di < d) { d = di; k = i; }
    }
    if (k <= 0) return g;
    const strokes = g.strokes.slice();
    strokes[si] = Object.assign({}, strokes[si], { segs: segs.slice(0, k) });
    return Object.assign({}, g, { strokes });
  }

  // Glyphs placed left to right; a space is a fixed gap. Unknown characters are skipped. In
  // cursive styles, lowercase letters join (see joinInfo).
  function layout(id, text, gap) {
    const sp = gap == null ? 10 : gap;
    const d = byId[id];
    const cursive = !!d && d.kind === 'cursive';
    let x = 0;
    let prev = null;
    const out = [];
    for (const ch of Array.from(String(text || ''))) {
      if (ch === ' ') { x += 42; prev = null; continue; }
      let g = glyph(id, ch);
      if (!g) { prev = null; continue; }
      let ix = x - g.x0;
      const info = cursive ? joinInfo(g) : null;
      const pe = prev && prev.info && prev.info.exit;
      if (prev && !pe && info && info.entry) ix -= sp + 6; // after a print capital: close up, unjoined
      if (pe && info && info.entry && prev.info.adv != null && info.inX != null) {
        // a joined font: the next letter's origin is the previous one's advance; after a high
        // exit, the entry is replaced by a bridge from the exit, as the font's connectors do
        ix = prev.item.x + prev.info.adv + info.inX;
        const b = prev.info.high ? bridgeTo(info, pe[1]) : null;
        if (b) g = bridged(g, info, b.k, { p: [prev.item.x + pe[0] - ix, pe[1]], dir: prev.info.exitDir });
        else prev.item.g = trimExit(prev.item.g, [ix - prev.item.x, 100]);
      } else if (pe && info && info.entry && !prev.info.high) {
        ix = prev.item.x + pe[0] - entryAt(info, pe[1]);
      } else if (pe && info && info.entry && prev.info.high) {
        const b = bridgeTo(info, pe[1]);
        if (b) {
          const q = info.st.segs[b.k][0];
          ix = prev.item.x + pe[0] + (b.dip ? 16 : 9) - q[0];
          // a slanted ascender loop (b, h, k, l) reaches back left of its upstroke: keep it clear of
          // the previous letter
          let minX = Infinity;
          g.strokes.forEach((st2, i) => {
            const pts = G.sampleStroke(i === info.idx ? Object.assign({}, st2, { segs: st2.segs.slice(b.k) }) : st2, 1);
            pts.forEach((pt) => { if (pt[0] < minX) minX = pt[0]; });
          });
          ix = Math.max(ix, prev.item.x + pe[0] + 4 - minX);
          g = bridged(g, info, b.k, { p: [prev.item.x + pe[0] - ix, pe[1]], dir: prev.info.exitDir });
        }
      }
      const item = { g, x: ix };
      if (pe && info && info.entry) item.joined = true;
      out.push(item);
      x = Math.max(x, ix + g.x0 + g.w + sp);
      prev = cursive ? { item, info } : null;
    }
    return { items: out, width: Math.max(0, x - sp) };
  }

  const list = () => DEFS.map((d) => Object.assign({}, d));
  const get = (id) => (byId[id] ? Object.assign({}, byId[id]) : null);
  const forLang = (lang) => DEFS.filter((d) => (d.lang ? [d.lang] : d.langs).some((x) => x === lang || x.split('-')[0] === String(lang).split('-')[0])).map((d) => d.id);

  return { list, get, glyph, alphabet, langOf, has, layout, defaultFor, forLang, BASE, ALPHA, LEGACY };
});
