/*
 * Gapwise engine: even spacing, 1D cut list, stairs and decking. Pure functions, no DOM.
 * All lengths in and out are millimetres. Imperial is a display/input concern,
 * except the cut list, which works in exact 1/32" steps when unit === 'in'.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MM_PER_IN = 25.4;
  const TOL = 1e-7;

  /* ------------------------------------------------------------------ */
  /* Parsing                                                            */
  /* ------------------------------------------------------------------ */

  function normalise(str) {
    return String(str == null ? '' : str)
      .trim()
      .toLowerCase()
      .replace(/[′’‘´`]/g, "'")
      .replace(/[″“”]/g, '"')
      .replace(/''/g, '"')
      .replace(/\s+/g, ' ');
  }

  // allowThousands: "2,400" -> 2400 (only for mm or bare numbers)
  function toNum(t, allowThousands) {
    if (allowThousands && /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) return parseFloat(t.replace(/,/g, ''));
    return parseFloat(t.replace(',', '.'));
  }

  // "52", "52.5", "3/16", "52 3/16", "52-3/16"
  function parseMixed(t) {
    t = t.trim();
    let m;
    if ((m = t.match(/^(\d+(?:\.\d+)?|\.\d+)$/))) return parseFloat(m[1]);
    if ((m = t.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] === 0 ? NaN : +m[1] / +m[2];
    if ((m = t.match(/^(\d+)(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+)$/))) return +m[3] === 0 ? NaN : +m[1] + +m[2] / +m[3];
    return NaN;
  }

  // Returns inches or NaN. Accepts 4' 6 1/2", 4'-6", 4ft 6in, 54in, 52 3/16, 3/4
  function parseImperial(s) {
    s = s
      .replace(/(\d|\s|^)(feet|foot|ft)\b\.?/g, "$1'")
      .replace(/(\d|\s|^)(inches|inch|in)\b\.?/g, '$1"')
      .trim();
    let feet = 0;
    let rest = s;
    let hadFeet = false;
    const fi = s.indexOf("'");
    if (fi >= 0) {
      const f = s.slice(0, fi).trim();
      if (!f) return NaN;
      feet = parseMixed(f);
      hadFeet = true;
      rest = s.slice(fi + 1);
    }
    rest = rest.trim();
    if (hadFeet) rest = rest.replace(/^-\s*/, '');
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (/["']/.test(rest)) return NaN;
    if (!rest && !hadFeet) return NaN;
    const inches = rest ? parseMixed(rest) : 0;
    if (!isFinite(feet) || !isFinite(inches)) return NaN;
    return feet * 12 + inches;
  }

  /**
   * Parse a typed length. defaultUnit 'mm' or 'in' applies to bare numbers.
   * Explicit units always win: 2.4m, 240cm, 2400mm, 8', 96", 8ft, 3/4.
   * Returns millimetres, or NaN if it can't be read.
   */
  function parseLength(input, defaultUnit) {
    const s = normalise(input);
    if (!s) return NaN;
    if (s.length > 40 || /^[-\u2212]/.test(s)) return NaN;
    let m = s.match(/^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?|[.,]\d+)\s*(mm|cm|m)$/);
    if (m) {
      const v = toNum(m[1], m[2] === 'mm') * { mm: 1, cm: 10, m: 1000 }[m[2]];
      return isFinite(v) ? v : NaN;
    }
    const imperial = /['"\/]|\d\s*(ft|feet|foot|in|inch|inches)\b/.test(s);
    if (!imperial) {
      m = s.match(/^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?|[.,]\d+)$/);
      if (!m) return NaN;
      const v = toNum(m[1], defaultUnit !== 'in');
      const mm = defaultUnit === 'in' ? v * MM_PER_IN : v;
      return isFinite(mm) ? mm : NaN;
    }
    const inches = parseImperial(s);
    return isFinite(inches) ? inches * MM_PER_IN : NaN;
  }

  /* ------------------------------------------------------------------ */
  /* Formatting                                                         */
  /* ------------------------------------------------------------------ */

  function gcd(a, b) {
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  // inches -> "52 3/16" (no unit mark). denom: 8, 16 or 32.
  function fmtFraction(inches, denom) {
    denom = denom || 16;
    const neg = inches < 0;
    const n = Math.round(Math.abs(inches) * denom);
    const whole = Math.floor(n / denom);
    const num = n % denom;
    let out;
    if (num === 0) out = String(whole);
    else {
      const g = gcd(num, denom);
      const fr = num / g + '/' + denom / g;
      out = whole ? whole + ' ' + fr : fr;
    }
    return (neg && n !== 0 ? '-' : '') + out;
  }

  // inches -> 4' 6 1/2"
  function fmtFeetInches(inches, denom) {
    denom = denom || 16;
    const n = Math.round(Math.abs(inches) * denom);
    const perFoot = 12 * denom;
    const feet = Math.floor(n / perFoot);
    const rem = (n - feet * perFoot) / denom;
    const sign = inches < 0 && n !== 0 ? '-' : '';
    if (!feet) return sign + fmtFraction(rem, denom) + '"';
    return sign + feet + "' " + fmtFraction(rem, denom) + '"';
  }

  // mm -> "1234" or "98.6" (step: 1, 0.5 or 0.1)
  function fmtMM(mm, step) {
    step = step || 1;
    const v = Math.round(mm / step) * step;
    const dp = step >= 1 ? 0 : 1;
    let s = v.toFixed(dp);
    if (dp && /\.0$/.test(s)) s = s.slice(0, -2);
    if (s === '-0') s = '0';
    return s;
  }

  /**
   * Format a length for display.
   * opts: { unit: 'mm'|'in', step (mm rounding), denom (inch fraction), feet (bool) }
   */
  function fmtLength(mm, opts) {
    opts = opts || {};
    if (opts.unit === 'in') {
      const inches = mm / MM_PER_IN;
      if (opts.feet && Math.abs(inches) >= 12) return fmtFeetInches(inches, opts.denom);
      return fmtFraction(inches, opts.denom) + '"';
    }
    return fmtMM(mm, opts.step) + ' mm';
  }

  /* ------------------------------------------------------------------ */
  /* Even spacing                                                       */
  /* ------------------------------------------------------------------ */
  /*
   * Modes (L = length, w = item width, c = centre-to-centre, g = c - w):
   *   between : gap at both ends (balusters between posts)  L = n*w + (n+1)*g  -> c = (L + w)/(n + 1)
   *   flush   : item at both ends (palings, battens, slats) L = n*w + (n-1)*g  -> c = (L - w)/(n - 1)
   *   centres : half a space at each end (downlights)       L = n*c            -> c = L / n
   * Rules:
   *   maxGap      value = largest allowed gap      (strict: gap must be < value)
   *   maxCentres  value = largest allowed centres
   *   target      value = gap you'd like; picks the count whose gap is closest
   *   count       count = number of items
   * Every mark is computed from the start, never by adding up rounded steps.
   */

  const MIN_N = { between: 0, flush: 2, centres: 1 };
  const MAX_N = 2000;

  function centresFor(mode, L, w, n) {
    if (mode === 'between') return (L + w) / (n + 1);
    if (mode === 'flush') return (L - w) / (n - 1);
    return L / n;
  }

  // Real-valued count at which centres exactly equal cLimit
  function nRealFor(mode, L, w, cLimit) {
    if (mode === 'between') return (L + w) / cLimit - 1;
    if (mode === 'flush') return (L - w) / cLimit + 1;
    return L / cLimit;
  }

  function fail(msg, extra) {
    return Object.assign({ ok: false, error: msg }, extra || {});
  }

  /*
   * Options:
   *   mode        'between' | 'flush' | 'centres'
   *   rule        'maxGap' | 'maxCentres' | 'target' | 'count'
   *   length, width, value, count   (mm; width optional)
   *   targetType  'gap' (default) | 'centres': what 'target' value means
   *   strict      true = gap must be UNDER value (sphere rules). A small margin
   *               (default 0.05 mm, i.e. it never rounds up to the limit on
   *               screen) is kept below the limit.
   *   margin      override that margin in mm (e.g. 0.4 for 1/32" displays)
   */
  function spacing(o) {
    o = o || {};
    const mode = o.mode == null ? 'between' : o.mode;
    const rule = o.rule == null ? 'maxGap' : o.rule;
    if (!(mode in MIN_N)) return fail('Unknown layout: ' + mode);
    if (['maxGap', 'maxCentres', 'target', 'count'].indexOf(rule) < 0) return fail('Unknown rule: ' + rule);
    const targetType = o.targetType === 'centres' ? 'centres' : 'gap';
    const L = +o.length;
    const w = o.width === '' || o.width == null ? 0 : +o.width;
    const value = +o.value;
    const strict = !!o.strict;
    const margin = strict ? (o.margin != null && +o.margin >= 0 ? +o.margin : 0.05) : 0;

    if (!(L > 0) || !isFinite(L)) return fail('Enter the length.');
    if (!(w >= 0) || !isFinite(w)) return fail('Enter a valid item width.');

    // value as a limit on centre spacing
    const isCentresValue = rule === 'maxCentres' || (rule === 'target' && targetType === 'centres');
    const toC = (v) => (isCentresValue ? v : v + w);

    let n;
    if (rule === 'count') {
      n = Math.round(+o.count);
      const min = Math.max(1, MIN_N[mode]);
      if (!(n >= min) || !isFinite(n)) {
        return fail(min === 2 ? 'Edge to edge needs at least 2 items.' : 'Enter at least 1 item.');
      }
    } else {
      if (!(value > 0) || !isFinite(value)) {
        return fail(rule === 'maxCentres' ? 'Enter the largest centres allowed.' : rule === 'target' ? 'Enter the ' + targetType + ' you want.' : 'Enter the largest gap allowed.');
      }
      const eff = value - margin;
      if (!(eff > 0)) return fail('That limit is too small.');
      const cLimit = toC(rule === 'target' ? value : eff);
      const nReal = nRealFor(mode, L, w, cLimit);
      if (rule === 'target') {
        let lo = Math.max(MIN_N[mode], 1, Math.floor(nReal + 1e-9));
        let bestN = null;
        let bestDiff = Infinity;
        for (const cand of [lo - 1, lo, lo + 1]) {
          if (cand < Math.max(1, MIN_N[mode])) continue;
          const c = centresFor(mode, L, w, cand);
          if (c - w < -TOL) continue;
          const diff = Math.abs(c - cLimit);
          if (diff < bestDiff - TOL || (Math.abs(diff - bestDiff) <= TOL && cand > bestN)) {
            bestDiff = diff;
            bestN = cand;
          }
        }
        if (bestN == null) return fail("Those items don't fit in that length.");
        n = bestN;
      } else {
        n = Math.max(Math.ceil(nReal - 1e-9), MIN_N[mode]);
      }
    }

    if (n > MAX_N) return fail('That works out to more than ' + MAX_N + ' items. Check the numbers.');

    if (n === 0) {
      return {
        ok: true, mode, rule, n: 0, gap: L, centres: null, endGap: L, items: [], limitOk: true,
        note: 'No items needed: the opening is already within the limit.',
        warnings: [],
      };
    }

    if (mode !== 'centres' && w >= L) return fail('The item is as wide as the whole length.');

    const c = centresFor(mode, L, w, n);
    let g = c - w;
    if (g < -TOL) {
      if (rule === 'count' || rule === 'target' || n - 1 < Math.max(1, MIN_N[mode])) {
        return fail("Doesn't fit: " + n + ' items are wider than the length.', { n });
      }
      return fail(
        "Doesn't fit: " + (n - 1) + ' items go over the limit and ' + n + " won't fit. Change the item width or the limit.",
        { n, fewerN: n - 1 }
      );
    }
    if (g < 0) g = 0;

    const items = [];
    for (let i = 1; i <= n; i++) {
      let left;
      if (mode === 'between') left = g + (i - 1) * c;
      else if (mode === 'flush') left = (i - 1) * c;
      else left = (i - 0.5) * c - w / 2;
      items.push({ i, left, centre: left + w / 2, right: left + w });
    }

    const endGap = mode === 'between' ? g : mode === 'flush' ? 0 : c / 2 - w / 2;
    const warnings = [];
    if (mode === 'centres' && w > 0 && g === 0) warnings.push('Items touch: no gap left between them.');
    if (g > 0 && g < 1) warnings.push('Gap is under 1 mm.');

    let limitOk = null;
    const lim = value - margin + 1e-6;
    if (rule === 'maxGap') limitOk = g <= lim;
    if (rule === 'maxCentres') limitOk = c <= lim;

    return { ok: true, mode, rule, n, gap: g, centres: c, endGap, items, limitOk, warnings };
  }

  /* ------------------------------------------------------------------ */
  /* Cut list (1D cutting stock)                                        */
  /* ------------------------------------------------------------------ */
  /*
   * Works in integer steps: 1 mm or 0.5 mm (metric), 1" down to 1/32" (imperial).
   * Pieces and kerf are rounded UP to the step and stock DOWN, so a plan never
   * asks for more than the timber really has.
   * Kerf model: n pieces from one length need n-1 cuts if they use it exactly,
   * otherwise n cuts. Capacity = usable + kerf, each piece weighs len + kerf.
   * Each length is filled with the best subset (bounded knapsack, exact for
   * that length), choosing the stock option with the best use per length or
   * per dollar. Several variants run and the cheapest plan wins.
   */

  const MAX_PIECES = 5000;
  const MAX_CAP_UNITS = 120000;

  function isIntegral(x) {
    return Math.abs(x - Math.round(x)) < 1e-6;
  }

  function pickScale(unit, valuesMM) {
    if (unit === 'in') {
      const inches = valuesMM.map((v) => v / MM_PER_IN);
      for (const d of [1, 2, 4, 8, 16, 32]) {
        if (inches.every((v) => isIntegral(v * d))) return d;
      }
      return 32;
    }
    if (valuesMM.every((v) => isIntegral(v))) return 1;
    return 2;
  }

  function bestFill(types, rem, cap, kU) {
    const W = [];
    const T = [];
    const C = [];
    for (let t = 0; t < types.length; t++) {
      if (!rem[t]) continue;
      const wt = types[t].u + kU;
      if (wt > cap) continue;
      let q = Math.min(rem[t], Math.floor(cap / wt));
      for (let b = 1; q > 0; b *= 2) {
        const take = Math.min(b, q);
        W.push(take * wt);
        T.push(t);
        C.push(take);
        q -= take;
      }
    }
    if (!W.length) return { n: 0 };
    const from = new Int32Array(cap + 1).fill(-1);
    from[0] = -2;
    let best = 0;
    outer: for (let j = 0; j < W.length; j++) {
      const wj = W[j];
      for (let s = cap; s >= wj; s--) {
        if (from[s] === -1 && from[s - wj] !== -1) {
          from[s] = j;
          if (s > best) {
            best = s;
            if (best === cap) break outer;
          }
        }
      }
    }
    const counts = new Array(types.length).fill(0);
    let s = best;
    let n = 0;
    while (s > 0) {
      const j = from[s];
      counts[T[j]] += C[j];
      n += C[j];
      s -= W[j];
    }
    let piecesU = 0;
    for (let t = 0; t < types.length; t++) piecesU += counts[t] * types[t].u;
    return { n, counts, fillU: best, piecesU };
  }

  function cutList(o) {
    o = o || {};
    const unit = o.unit === 'in' ? 'in' : 'mm';
    const kerf = Math.max(0, +o.kerf || 0);
    const trim = Math.max(0, +o.trim || 0);

    // Read rows. Rows that can't be used are reported, never silently dropped.
    const skipped = [];
    const pieces = [];
    (o.pieces || []).forEach((p, index) => {
      if (!p) return;
      const len = +p.len;
      const qty = p.qty === '' || p.qty == null ? 1 : +p.qty;
      const label = String(p.label == null ? '' : p.label).trim();
      if (!(len > 0) || !isFinite(len)) skipped.push({ kind: 'piece', index, label, reason: 'Length not readable' });
      else if (!(qty >= 1) || !Number.isInteger(qty)) skipped.push({ kind: 'piece', index, label, reason: 'Quantity must be a whole number' });
      else pieces.push({ len, qty, label });
    });
    const stockIn = [];
    (o.stock || []).forEach((st, index) => {
      if (!st) return;
      const len = +st.len;
      if (!(len > 0) || !isFinite(len)) { skipped.push({ kind: 'stock', index, reason: 'Length not readable' }); return; }
      stockIn.push({
        len,
        qty: st.qty === '' || st.qty == null || isNaN(+st.qty) ? null : Math.max(0, Math.floor(+st.qty)),
        cost: st.cost === '' || st.cost == null || isNaN(+st.cost) ? null : Math.max(0, +st.cost),
      });
    });

    if (!pieces.length) return fail('Add the pieces you need.', { skipped });
    if (!stockIn.length) return fail('Add at least one stock length.', { skipped });
    const totalQty = pieces.reduce((a, p) => a + p.qty, 0);
    if (totalQty > MAX_PIECES) return fail('That is more than ' + MAX_PIECES + ' pieces. Split the job.');

    let scale = pickScale(unit, pieces.map((p) => p.len).concat(stockIn.map((s) => s.len), [kerf, trim]));
    const perUnit = unit === 'in' ? 1 / MM_PER_IN : 1;
    const maxStock = Math.max.apply(null, stockIn.map((s) => s.len));
    while (scale > 1 && maxStock * perUnit * scale > MAX_CAP_UNITS) scale = scale / 2;
    if (maxStock * perUnit * scale > MAX_CAP_UNITS) return fail('Stock lengths that long are not supported.');

    const up = (mm) => Math.ceil(mm * perUnit * scale - 1e-6);
    const down = (mm) => Math.floor(mm * perUnit * scale + 1e-6);
    const kU = up(kerf);
    const trimU = up(trim);

    // Merge identical pieces (same length and label), longest first.
    const typeMap = new Map();
    for (const p of pieces) {
      const key = p.len + '|' + p.label;
      if (typeMap.has(key)) typeMap.get(key).qty += p.qty;
      else typeMap.set(key, { u: up(p.len), mm: p.len, qty: p.qty, label: p.label });
    }
    const types = Array.from(typeMap.values()).sort((a, b) => b.u - a.u || b.mm - a.mm || a.label.localeCompare(b.label));

    const opts = stockIn.map((s, i) => {
      const u = down(s.len);
      return {
        i, mm: s.len, u, usable: u - 2 * trimU, qty: s.qty, cost: s.cost,
        onHand: s.qty !== null && !(s.cost > 0),
      };
    });
    const capOf = (s) => s.usable + kU;
    const maxUsable = Math.max.apply(null, opts.map((s) => s.usable));
    const unplaced = [];
    types.forEach((t) => {
      t.oversize = t.u > maxUsable;
      if (t.oversize) {
        unplaced.push({ mm: t.mm, label: t.label, qty: t.qty, reason: trimU > 0 ? 'Longer than any stock length after trimming' : 'Longer than any stock length' });
      }
    });

    const buyable = opts.filter((s) => !s.onHand && s.usable > 0);
    const costMode = buyable.length > 0 && buyable.every((s) => s.cost > 0);
    const priceOf = (s) => (costMode ? s.cost : s.u);

    function score(s, fill) {
      if (s.onHand) return fill.piecesU / s.u;
      return fill.piecesU / priceOf(s);
    }
    function better(a, b) {
      if (!b) return true;
      if (a.s.onHand !== b.s.onHand) return a.s.onHand;
      if (Math.abs(a.score - b.score) > 1e-12) return a.score > b.score;
      if (a.fill.piecesU !== b.fill.piecesU) return a.fill.piecesU > b.fill.piecesU;
      return a.s.u < b.s.u;
    }
    const newRem = () => types.map((t) => (t.oversize ? 0 : t.qty));

    // Strategy 1: fill each length as fully as possible (exact knapsack per length).
    function greedy(allowed) {
      const rem = newRem();
      const used = opts.map(() => 0);
      const bars = [];
      let guard = 0;
      while (rem.some((r) => r > 0) && guard++ < 20000) {
        let best = null;
        for (const s of opts) {
          if (!s.onHand && !allowed.has(s.i)) continue;
          if (s.qty !== null && used[s.i] >= s.qty) continue;
          if (s.usable <= 0) continue;
          const fill = bestFill(types, rem, capOf(s), kU);
          if (!fill.n) continue;
          const cand = { s, fill, score: score(s, fill) };
          if (better(cand, best)) best = cand;
        }
        if (!best) break;
        const { s, fill } = best;
        // Repeat the same pattern while it still fits: it stays optimal.
        for (;;) {
          bars.push({ opt: s.i, counts: fill.counts.slice(), fillU: fill.fillU, piecesU: fill.piecesU });
          used[s.i]++;
          for (let t = 0; t < types.length; t++) rem[t] -= fill.counts[t];
          if (s.qty !== null && used[s.i] >= s.qty) break;
          if (!fill.counts.every((c, t) => c <= rem[t])) break;
        }
      }
      return { bars, rem };
    }

    // Strategy 2: longest piece first into the first (or tightest) length it fits.
    function decreasing(allowed, tight) {
      const rem = newRem();
      const used = opts.map(() => 0);
      const bars = [];
      for (let t = 0; t < types.length; t++) {
        const wt = types[t].u + kU;
        while (rem[t] > 0) {
          let bi = -1;
          for (let j = 0; j < bars.length; j++) {
            const free = capOf(opts[bars[j].opt]) - bars[j].fillU;
            if (free >= wt && (bi < 0 || !tight || free < capOf(opts[bars[bi].opt]) - bars[bi].fillU)) {
              bi = j;
              if (!tight) break;
            }
          }
          if (bi < 0) {
            // open a new length: offcuts on hand first, else the longest buyable
            let pick = null;
            for (const s of opts) {
              if (s.qty !== null && used[s.i] >= s.qty) continue;
              if (!s.onHand && !allowed.has(s.i)) continue;
              if (capOf(s) < wt) continue;
              if (!pick || (s.onHand && !pick.onHand) || (s.onHand === pick.onHand && s.u > pick.u)) pick = s;
            }
            if (!pick) break;
            used[pick.i]++;
            bars.push({ opt: pick.i, counts: types.map(() => 0), fillU: 0, piecesU: 0 });
            bi = bars.length - 1;
          }
          const b = bars[bi];
          b.counts[t]++;
          b.fillU += wt;
          b.piecesU += types[t].u;
          rem[t]--;
        }
      }
      return { bars, rem };
    }

    // Improvement: try to empty the emptiest lengths into spare room elsewhere.
    function consolidate(plan) {
      let guard = 0;
      for (let changed = true; changed && guard++ < 500; ) {
        changed = false;
        const order = plan.bars.map((_, i) => i).sort((a, b) => plan.bars[a].piecesU - plan.bars[b].piecesU);
        for (const bi of order) {
          const src = plan.bars[bi];
          if (opts[src.opt].onHand) continue; // never give up a free offcut for bought timber
          const free = plan.bars.map((x, j) => (j === bi ? -1 : capOf(opts[x.opt]) - x.fillU));
          const moves = [];
          let ok = true;
          for (let t = 0; t < types.length && ok; t++) {
            for (let k = 0; k < src.counts[t]; k++) {
              const wt = types[t].u + kU;
              let best = -1;
              for (let j = 0; j < free.length; j++) if (free[j] >= wt && (best < 0 || free[j] < free[best])) best = j;
              if (best < 0) { ok = false; break; }
              free[best] -= wt;
              moves.push([best, t]);
            }
          }
          if (!ok) continue;
          moves.forEach(([j, t]) => {
            const b = plan.bars[j];
            b.counts[t]++;
            b.fillU += types[t].u + kU;
            b.piecesU += types[t].u;
          });
          plan.bars.splice(bi, 1);
          changed = true;
          break;
        }
      }
      return plan;
    }

    // Improvement: move each bought length to the cheapest/shortest stock that still holds it.
    function downsize(plan) {
      const used = opts.map(() => 0);
      plan.bars.forEach((b) => used[b.opt]++);
      plan.bars
        .slice()
        .sort((a, b) => b.fillU - a.fillU)
        .forEach((b) => {
          if (opts[b.opt].onHand) return;
          let pick = opts[b.opt];
          for (const s of buyable) {
            if (capOf(s) < b.fillU) continue;
            if (s.i !== b.opt && s.qty !== null && used[s.i] >= s.qty) continue;
            if (priceOf(s) < priceOf(pick) - 1e-9 || (Math.abs(priceOf(s) - priceOf(pick)) <= 1e-9 && s.u < pick.u)) pick = s;
          }
          if (pick.i !== b.opt) { used[b.opt]--; used[pick.i]++; b.opt = pick.i; }
        });
      return plan;
    }

    // Subset of the pooled pieces whose weight lands in [lo, hi] (largest such), or null.
    function subsetInRange(counts, lo, hi) {
      if (hi < 0) return null;
      const W = [], T = [], C = [];
      for (let t = 0; t < types.length; t++) {
        const wt = types[t].u + kU;
        let q = Math.min(counts[t], Math.floor(hi / wt));
        for (let b = 1; q > 0; b *= 2) { const take = Math.min(b, q); W.push(take * wt); T.push(t); C.push(take); q -= take; }
      }
      const from = new Int32Array(hi + 1).fill(-1);
      from[0] = -2;
      for (let j = 0; j < W.length; j++) {
        for (let s = hi; s >= W[j]; s--) if (from[s] === -1 && from[s - W[j]] !== -1) from[s] = j;
      }
      for (let s = hi; s >= Math.max(0, lo); s--) {
        if (from[s] === -1) continue;
        const pick = types.map(() => 0);
        for (let x = s; x > 0; x -= W[from[x]]) pick[T[from[x]]] += C[from[x]];
        return { s, pick };
      }
      return null;
    }

    // Improvement: re-pack each pair of bought lengths into the cheapest pair (or one length) that holds them.
    function pairImprove(plan, budgetMs) {
      const t0 = Date.now();
      let rounds = 0;
      for (let improved = true; improved && rounds++ < 50 && Date.now() - t0 < budgetMs; ) {
        improved = false;
        const bars = plan.bars;
        outer: for (let i = 0; i < bars.length; i++) {
          for (let j = i + 1; j < bars.length; j++) {
            if (Date.now() - t0 > budgetMs) break outer;
            const A = bars[i], B = bars[j];
            if (opts[A.opt].onHand || opts[B.opt].onHand) continue;
            const cur = priceOf(opts[A.opt]) + priceOf(opts[B.opt]);
            const counts = A.counts.map((c, t) => c + B.counts[t]);
            const total = A.fillU + B.fillU;
            const used = opts.map(() => 0);
            bars.forEach((b, k) => { if (k !== i && k !== j) used[b.opt]++; });
            const ok = (st, need) => st.qty === null || used[st.i] + need <= st.qty;
            let best = null;
            for (const a of buyable) {
              if (capOf(a) >= total && ok(a, 1) && priceOf(a) < cur - 1e-9 && (!best || priceOf(a) < best.price - 1e-9)) {
                best = { price: priceOf(a), a, b: null, pick: counts, s: total };
              }
            }
            for (const a of buyable) {
              for (const b of buyable) {
                const price = priceOf(a) + priceOf(b);
                if (price >= cur - 1e-9 || (best && price >= best.price - 1e-9)) continue;
                const need = a.i === b.i ? 2 : 1;
                if (!ok(a, need) || !ok(b, need)) continue;
                const sub = subsetInRange(counts, total - capOf(b), capOf(a));
                if (sub) best = { price, a, b, pick: sub.pick, s: sub.s };
              }
            }
            if (!best) continue;
            const mk = (opt, cnt, fillU) => ({ opt: opt.i, counts: cnt, fillU, piecesU: cnt.reduce((acc, c, t) => acc + c * types[t].u, 0) });
            const repl = [mk(best.a, best.pick.slice(), best.s)];
            if (best.b) {
              const rest = counts.map((c, t) => c - best.pick[t]);
              if (rest.some((c) => c > 0)) repl.push(mk(best.b, rest, total - best.s));
            }
            bars.splice(j, 1);
            bars.splice(i, 1, ...repl);
            improved = true;
            break outer;
          }
        }
      }
      return plan;
    }

    function finish(plan) {
      let buyU = 0;
      let cost = 0;
      for (const b of plan.bars) {
        const s = opts[b.opt];
        if (!s.onHand) { buyU += s.u; cost += s.cost || 0; }
      }
      plan.left = plan.rem.reduce((a, r) => a + r, 0);
      plan.buyU = buyU;
      plan.cost = cost;
      return plan;
    }

    function beats(p, q) {
      if (!q) return true;
      if (p.left !== q.left) return p.left < q.left;
      const pv = costMode ? p.cost : p.buyU;
      const qv = costMode ? q.cost : q.buyU;
      if (Math.abs(pv - qv) > 1e-9) return pv < qv;
      if (p.bars.length !== q.bars.length) return p.bars.length < q.bars.length;
      return false;
    }

    const allBuy = new Set(buyable.map((s) => s.i));
    const variantSets = [allBuy];
    if (buyable.length > 1) buyable.forEach((s) => variantSets.push(new Set([s.i])));

    const started = Date.now();
    let plan = null;
    outer: for (const v of variantSets) {
      for (const make of [() => greedy(v), () => decreasing(v, false), () => decreasing(v, true)]) {
        const p = finish(downsize(consolidate(make())));
        if (beats(p, plan)) plan = p;
        if (Date.now() - started > 2000) break outer;
      }
    }
    if (buyable.length) plan = finish(downsize(pairImprove(plan, plan.bars.length > 40 ? 250 : 700)));

    const toMM = (u) => (unit === 'in' ? (u / scale) * MM_PER_IN : u / scale);
    const kerfMM = toMM(kU);
    const trimMM = toMM(trimU);

    // Expand bars into cut sequences with positions.
    const bars = plan.bars.map((b) => {
      const s = opts[b.opt];
      const cuts = [];
      let pos = trimMM;
      types.forEach((t, ti) => {
        for (let k = 0; k < b.counts[ti]; k++) {
          cuts.push({ mm: t.mm, label: t.label, start: pos });
          pos += t.mm + kerfMM;
        }
      });
      const r = s.usable + kU - b.fillU;
      const offcutU = r > kU ? r - kU : 0;
      return { stockMM: s.mm, opt: s.i, onHand: s.onHand, cuts, offcutMM: toMM(offcutU), piecesMM: cuts.reduce((a, c) => a + c.mm, 0) };
    });

    // Group identical bars.
    const groups = [];
    const gIndex = new Map();
    bars.forEach((b) => {
      const key = b.opt + '|' + b.cuts.map((c) => c.mm + ':' + c.label).join(',');
      if (gIndex.has(key)) groups[gIndex.get(key)].count++;
      else {
        gIndex.set(key, groups.length);
        groups.push(Object.assign({ count: 1 }, b));
      }
    });

    const buy = opts
      .map((s) => {
        const count = plan.bars.filter((b) => b.opt === s.i).length;
        return { stockMM: s.mm, count, onHand: s.onHand, cost: s.cost != null ? s.cost * count : null };
      })
      .filter((x) => x.count > 0);

    types.forEach((t, ti) => {
      if (!t.oversize && plan.rem[ti] > 0) {
        unplaced.push({ mm: t.mm, label: t.label, qty: plan.rem[ti], reason: 'Not enough stock' });
      }
    });

    const stockMM = bars.reduce((a, b) => a + b.stockMM, 0);
    const piecesMM = bars.reduce((a, b) => a + b.piecesMM, 0);
    const anyCost = buy.some((b) => !b.onHand && b.cost != null);
    const allCost = buy.filter((b) => !b.onHand).every((b) => b.cost != null);

    return {
      ok: true,
      unit,
      kerfMM,
      trimMM,
      stepNote: unit === 'in' ? (scale === 1 ? '1"' : '1/' + scale + '"') : scale === 1 ? '1 mm' : '0.5 mm',
      bars,
      groups,
      buy,
      totalCost: anyCost && allCost ? buy.reduce((a, b) => a + (b.onHand ? 0 : b.cost || 0), 0) : null,
      lengths: bars.length,
      stockMM,
      piecesMM,
      wasteMM: stockMM - piecesMM,
      wastePct: stockMM > 0 ? ((stockMM - piecesMM) / stockMM) * 100 : 0,
      offcuts: bars.map((b) => b.offcutMM).filter((x) => x > 0).sort((a, b) => b - a),
      placed: bars.reduce((a, b) => a + b.cuts.length, 0),
      requested: totalQty,
      unplaced,
      skipped,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Stairs                                                             */
  /* ------------------------------------------------------------------ */
  /*
   * A straight flight from floor to floor: n risers of R = rise / n and n - 1 treads of going G
   * (the top floor is the last step). Total run = (n - 1) * G. Angle = atan(R / G).
   * Stringer = the diagonal of total rise and total run (foot of the first riser to the top nosing).
   * Every limit is inclusive. Lengths in mm, angles in degrees.
   *
   * Presets, each checked against the official text in November 2026:
   */
  const STAIR_PRESETS = {
    // Australia: NCC 2022, ABCB Housing Provisions Part 11.2, clause 11.2.2 and Table 11.2.2a,
    // "Stairs (other than spiral)": riser (R) 115-190, going (G) 240-355, slope relationship (2R+G) 550-700.
    // 11.2.2(1): "not more than 18 and not less than 2 risers in each flight".
    // https://www.abcb.gov.au/system/files/ncc/abcb-housing-provisions-2022-20230501b.pdf
    // https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/11-safe-movement-and-access/part-112-stairway-and-ramp-construction
    // NCC 2025 (Vic from 1 May 2026, NSW from 1 May 2027): the Building and Plumbing Commission (Vic) summary of
    // the Section 11 changes lists no change to stair geometry. Re-check Table 11.2.2a in the NCC 2025 text when a state adopts it.
    au: { label: 'AU', source: 'NCC Housing Provisions 11.2.2', riserMin: 115, riserMax: 190, goingMin: 240, goingMax: 355, sumMin: 550, sumMax: 700, maxRisers: 18 },
    // US: International Residential Code R311.7.5.1 Risers, "not more than 7 3/4 inches (196 mm)", and
    // R311.7.5.2 Treads, "not less than 10 inches (254 mm)", measured nosing to nosing (2018 and 2021 IRC
    // numbering; the 2024 IRC moved Means of Egress to R318, with the same limits). No minimum riser or 2R+G rule.
    // Quoted in the City of Boise IRC handout #437: https://www.cityofboise.org/media/14405/437-treads-risers_march-2022.pdf
    // ICC 2024 IRC significant changes: https://www.iccsafe.org/wp-content/uploads/Session-1-and-31-2024-IRC-Significant-Changes.pdf
    us: { label: 'US', source: 'IRC R311.7.5', riserMax: 7.75 * MM_PER_IN, goingMin: 10 * MM_PER_IN },
    // England: Approved Document K (2013 edition, still current), Table 1.1, private stair: rise 150-220,
    // going 220-300; note 1: maximum pitch 42 degrees; footnote: 2R + G between 550 and 700.
    // https://assets.publishing.service.gov.uk/media/60d5bdcde90e07716f516cfd/Approved_Document_K.pdf
    uk: { label: 'UK', source: 'Approved Document K, Table 1.1', riserMin: 150, riserMax: 220, goingMin: 220, goingMax: 300, sumMin: 550, sumMax: 700, pitchMax: 42 },
    // New Zealand: Acceptable Solution D1/AS1 (2nd edition, amendment 6, effective 1 January 2017, current),
    // Table 6, "Common and main private" stairs: maximum pitch 37 degrees, maximum riser 190, minimum tread 280.
    // https://building.govt.nz/assets/Uploads/building-code-compliance/d-access/d1-access-routes/asvm/d1-access-routes-2nd-edition-amendment6.pdf
    nz: { label: 'NZ', source: 'NZBC D1/AS1, Table 6', riserMax: 190, goingMin: 280, pitchMax: 37 },
    // Spain: CTE DB SUA 1, 4.1 "Escaleras de uso restringido" (includes the inside of dwellings):
    // "La contrahuella será de 20 cm, como máximo, y la huella de 22 cm, como mínimo."
    // https://www.codigotecnico.org/pdf/Documentos/SUA/DcmSUA.pdf
    es: { label: 'ES', source: 'CTE DB SUA 1, 4.1', riserMax: 200, goingMin: 220 },
  };
  // When the run is free, the going is picked so 2R + G is about 625 mm (the middle of the 550-700 range
  // in the AU and UK rules), then pushed inside the preset's limits.
  const COMFORT_2RG = 625;
  const MAX_RISERS = 200;

  function stairChecks(lim, n, R, G) {
    const angle = (Math.atan2(R, G) * 180) / Math.PI;
    const sum = 2 * R + G;
    const checks = [];
    const add = (key, value, min, max) => {
      if (min == null && max == null) return;
      const ok = (min == null || value >= min - 1e-6) && (max == null || value <= max + 1e-6);
      checks.push({ key, value, min: min == null ? null : min, max: max == null ? null : max, ok });
    };
    add('riser', R, lim.riserMin, lim.riserMax);
    add('going', G, lim.goingMin, lim.goingMax);
    add('sum', sum, lim.sumMin, lim.sumMax);
    add('pitch', angle, null, lim.pitchMax);
    add('flight', n, null, lim.maxRisers);
    return { checks, pass: checks.every((c) => c.ok), angle, sum };
  }

  /*
   * Options: rise (mm, floor to floor), run (mm, optional: the space available), preset ('au' | 'us' | 'uk' |
   * 'nz' | 'es') or limits (an object like a preset), step (going rounding in mm, default 1).
   * Uses the fewest risers that keep the riser within the limit and passes every check if any riser count can.
   * With a run, the going is the comfortable one or whatever fits, whichever is smaller.
   */
  function stairs(o) {
    o = o || {};
    const lim = o.limits || STAIR_PRESETS[o.preset == null ? 'au' : o.preset];
    if (!lim || typeof lim !== 'object') return fail('Unknown stair rules: ' + o.preset);
    const H = +o.rise;
    if (!(H > 0) || !isFinite(H)) return fail('Enter the total rise.');
    const hasRun = !(o.run === '' || o.run == null);
    const run = hasRun ? +o.run : null;
    if (hasRun && (!(run > 0) || !isFinite(run))) return fail('Enter a valid run.');
    const step = +o.step > 0 ? +o.step : 1;
    const rMax = lim.riserMax > 0 ? lim.riserMax : 190;
    const nMin = Math.max(2, Math.ceil(H / rMax - 1e-9));
    if (nMin > MAX_RISERS) return fail('That works out to more than ' + MAX_RISERS + ' risers. Check the numbers.');

    const tanMax = lim.pitchMax ? Math.tan((lim.pitchMax * Math.PI) / 180) : 0;
    // The going range the rules allow at this riser height: [need, cap]
    function range(R) {
      const need = Math.max(lim.goingMin || 0, lim.sumMin ? lim.sumMin - 2 * R : 0, tanMax ? R / tanMax : 0);
      const cap = Math.min(lim.goingMax || Infinity, lim.sumMax ? lim.sumMax - 2 * R : Infinity);
      return { need, cap };
    }
    function design(n) {
      const R = H / n;
      const { need, cap } = range(R);
      let G = Math.round(Math.max(COMFORT_2RG - 2 * R, need) / step) * step;
      if (G < need - 1e-9) G = Math.ceil(need / step - 1e-9) * step;
      if (G > cap + 1e-9 && cap >= need) G = Math.max(Math.floor(cap / step + 1e-9) * step, need);
      let limited = false;
      if (hasRun) {
        const fit = run / (n - 1);
        if (G > fit + 1e-9) {
          limited = true;
          G = Math.floor(fit / step + 1e-9) * step;
          if (G < need - 1e-9 && fit >= need - 1e-9) G = Math.min(fit, Math.ceil(need / step - 1e-9) * step);
          if (!(G > 0)) G = fit;
        }
      }
      return Object.assign({ n, R, G, limited, need, cap }, stairChecks(lim, n, R, G));
    }

    const last = Math.min(MAX_RISERS, nMin + 80);
    let pick = null;
    let first = null;
    for (let n = nMin; n <= last; n++) {
      const d = design(n);
      if (!first) first = d;
      if (d.pass) { pick = d; break; }
      if (lim.riserMin && d.R < lim.riserMin - 1e-9) break;
    }
    const d = pick || first;

    // If the run is what stops it passing: the shortest run that would pass.
    let minRun = null;
    if (hasRun && !d.pass) {
      for (let n = nMin; n <= last; n++) {
        const R = H / n;
        const { need, cap } = range(R);
        if (need > cap + 1e-9) continue;
        const G = Math.min(Math.ceil(need / step - 1e-9) * step, Math.max(cap, need));
        const c = stairChecks(lim, n, R, G);
        if (c.pass && (minRun == null || (n - 1) * G < minRun)) minRun = (n - 1) * G;
        if (lim.riserMin && R < lim.riserMin - 1e-9) break;
      }
    }

    const totalRun = (d.n - 1) * d.G;
    return {
      ok: true,
      rise: H,
      run: hasRun ? run : null,
      risers: d.n,
      treads: d.n - 1,
      riser: d.R,
      going: d.G,
      totalRun,
      angle: d.angle,
      sum: d.sum,
      stringer: Math.hypot(H, totalRun),
      checks: d.checks,
      pass: d.pass,
      runLimited: d.limited,
      minRun,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Decking                                                            */
  /* ------------------------------------------------------------------ */
  /*
   * Boards side by side across the deck width W, board width b, gap g between boards, a board flush at the start.
   *   full boards = the most n with n*b + (n - 1)*g <= W
   *   rip         = W - full*(b + g): the last board, ripped to fit (none if under 1 mm)
   *   even        = the edge-to-edge spacing (spacing(), mode 'flush', rule 'target') whose gap is closest to g:
   *                 every board full width, the gap adjusted a little
   * With a board length and a deck length (along the boards), each board across is one row. Rows longer than a
   * board use whole boards plus one cut piece; cut pieces are planned with cutList() so offcuts get reused.
   * Options: width, board, gap, layout ('rip' | 'even'), boardLength, deckLength, kerf, unit ('mm' | 'in').
   */
  const MIN_RIP = 1;

  function decking(o) {
    o = o || {};
    const W = +o.width;
    const b = +o.board;
    const g = o.gap === '' || o.gap == null ? 0 : +o.gap;
    if (!(W > 0) || !isFinite(W)) return fail('Enter the deck width.');
    if (!(b > 0) || !isFinite(b)) return fail('Enter the board width.');
    if (!(g >= 0) || !isFinite(g)) return fail('Enter a valid gap.');
    if (b > W + TOL) return fail('The board is wider than the deck.');
    const full = Math.max(1, Math.floor((W + g) / (b + g) + 1e-9));
    if (full + 1 > MAX_N) return fail('That works out to more than ' + MAX_N + ' boards. Check the numbers.');
    const leftover = Math.max(0, W - full * b - (full - 1) * g); // space after the last full board
    const ripRaw = leftover - g;
    const rip = ripRaw >= MIN_RIP - 1e-9 ? ripRaw : 0;
    const edge = rip > 0 ? 0 : leftover;

    let even = null;
    if (W >= 2 * b - TOL) {
      const s = spacing({ mode: 'flush', rule: 'target', length: W, width: b, value: Math.max(g, 1e-9) });
      if (s.ok && s.n >= 2) even = { n: s.n, gap: s.gap, centres: s.centres, items: s.items };
    }
    const layout = o.layout === 'even' && even ? 'even' : 'rip';

    let items;
    if (layout === 'even') {
      items = even.items.map((it) => ({ i: it.i, left: it.left, right: it.right, width: b, rip: false }));
    } else {
      items = [];
      for (let i = 0; i < full; i++) items.push({ i: i + 1, left: i * (b + g), right: i * (b + g) + b, width: b, rip: false });
      if (rip > 0) items.push({ i: full + 1, left: full * (b + g), right: W, width: rip, rip: true });
    }
    const boards = items.length;

    // Lengths to buy
    let buy = null;
    const Lb = +o.boardLength;
    const Ld = +o.deckLength;
    if (Lb > 0 && Ld > 0 && isFinite(Lb) && isFinite(Ld)) {
      const k = Ld >= Lb - 1e-9 ? Math.floor(Ld / Lb + 1e-9) : 0; // whole boards per row
      let part = Ld - k * Lb; // the cut piece per row
      if (part <= 0.5) part = 0;
      const wholes = k * boards;
      let cut = null;
      if (part > 0) {
        cut = cutList({ pieces: [{ len: part, qty: boards }], stock: [{ len: Lb }], kerf: o.kerf, unit: o.unit });
        if (!cut.ok) buy = { ok: false, error: cut.error };
      }
      if (!buy) {
        const lengths = wholes + (cut ? cut.lengths : 0);
        const stockMM = lengths * Lb;
        const piecesMM = boards * (k * Lb + part);
        buy = {
          ok: true,
          lengths,
          boardLength: Lb,
          deckLength: Ld,
          rows: boards,
          wholePerRow: k,
          piece: part,
          joins: k > 0 && part > 0,
          kerfMM: cut ? cut.kerfMM : Math.max(0, +o.kerf || 0),
          offcuts: cut ? cut.offcuts : [],
          wastePct: stockMM > 0 ? ((stockMM - piecesMM) / stockMM) * 100 : 0,
          linear: piecesMM,
        };
      }
    }

    return {
      ok: true,
      layout,
      width: W,
      board: b,
      gap: layout === 'even' ? even.gap : g,
      wantGap: g,
      full,
      rip,
      edge: layout === 'even' ? 0 : edge,
      boards,
      even,
      items,
      narrow: layout === 'rip' && rip > 0 && rip < b / 2,
      balanced: rip > 0 ? (rip + b) / 2 : null,
      buy,
    };
  }

  return {
    MM_PER_IN,
    parseLength,
    parseImperial,
    fmtFraction,
    fmtFeetInches,
    fmtMM,
    fmtLength,
    spacing,
    cutList,
    STAIR_PRESETS,
    stairs,
    decking,
    _bestFill: bestFill,
  };
});
