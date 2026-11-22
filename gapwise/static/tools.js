/* Free stair and decking calculators with live drawings, drawn with the same marks as calc.js.
   Uses the Gapwise app's engine (static/engine.js, copied from app/www at build time):
   Engine.stairs() and Engine.decking() give exactly the numbers the app gives. */
(function () {
  'use strict';
  const E = window.Engine;
  if (!E || !E.stairs) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (n) => String(Math.round(n * 10) / 10);
  const lang = navigator.language || '';
  const usLocale = /^en-US/i.test(lang);

  /* ------------------------------------------------------------ drawing marks */
  const ln = (x1, y1, x2, y2, c) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"${c ? ` class="${c}"` : ''}/>`;
  const rc = (x, y, w, h, c) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(w, 0.8))}" height="${r1(Math.max(h, 0.8))}" class="${c}"/>`;
  // arrowhead with its tip at (x, y); d = 1 points right, -1 left (horizontal) or, with v, down / up
  const tri = (x, y, d) => `<polygon points="${r1(x)},${r1(y)} ${r1(x - d * 7)},${r1(y - 2.6)} ${r1(x - d * 7)},${r1(y + 2.6)}"/>`;
  const triV = (x, y, d) => `<polygon points="${r1(x)},${r1(y)} ${r1(x - 2.6)},${r1(y - d * 7)} ${r1(x + 2.6)},${r1(y - d * 7)}"/>`;
  const box = (cx, cy, text) => {
    const tw = text.length * 7.2 + 8;
    return `<rect x="${r1(cx - tw / 2)}" y="${r1(cy - 7.5)}" width="${r1(tw)}" height="15"/><text x="${r1(cx)}" y="${r1(cy + 4)}" text-anchor="middle">${esc(text)}</text>`;
  };
  const tw = (text) => text.length * 7.2 + 8;
  // horizontal dimension; label centred (clamped inside W), or with align 'end' kept left of xb
  function hdim(xa, xb, y, text, on, ya, yb, W, align) {
    let s = `<g class="dim${on ? ' on' : ''}">`;
    if (ya != null) s += ln(xa, ya, xa, y - 4, 'ext');
    if (yb != null) s += ln(xb, yb, xb, y - 4, 'ext');
    if (xb - xa >= 18) s += ln(xa, y, xb, y) + tri(xa, y, -1) + tri(xb, y, 1);
    else s += ln(xa - 13, y, xb + 13, y) + tri(xa, y, 1) + tri(xb, y, -1);
    const w = tw(text);
    let cx = align === 'end' ? Math.min((xa + xb) / 2, xb - w / 2) : (xa + xb) / 2;
    cx = Math.min(Math.max(cx, w / 2 + 2), W - w / 2 - 2);
    return s + box(cx, y - 11.5, text) + '</g>';
  }
  function hdimBelow(xa, xb, y, text, on, ytop, W) {
    let s = `<g class="dim${on ? ' on' : ''}">`;
    s += ln(xa, ytop, xa, y + 5, 'ext') + ln(xb, ytop, xb, y + 5, 'ext');
    s += ln(xa, y, xb, y) + tri(xa, y, -1) + tri(xb, y, 1);
    const w = tw(text);
    const cx = Math.min(Math.max((xa + xb) / 2, w / 2 + 2), W - w / 2 - 2);
    return s + box(cx, y - 11.5, text) + '</g>';
  }
  // vertical dimension at x from ya (bottom) to yb (top); label to the left of the line, or centred on it
  function vdim(x, ya, yb, text, on, side) {
    let s = `<g class="dim${on ? ' on' : ''}">`;
    if (ya - yb >= 18) s += ln(x, ya, x, yb) + triV(x, ya, 1) + triV(x, yb, -1);
    else s += ln(x, ya + 13, x, yb - 13) + triV(x, ya, -1) + triV(x, yb, 1);
    const w = tw(text);
    s += side === 'left' ? box(x - 6 - w / 2, (ya + yb) / 2, text) : box(x, (ya + yb) / 2, text);
    return s + '</g>';
  }
  function breakLine(x, y1, y2) {
    const m = (y1 + y2) / 2;
    return `<path class="brk" d="M${r1(x)} ${r1(y1)}V${r1(m - 7)}L${r1(x + 5)} ${r1(m - 3)}L${r1(x - 5)} ${r1(m + 3)}L${r1(x)} ${r1(m + 7)}V${r1(y2)}"/>`;
  }
  function ground(W, y) {
    let hatch = '';
    for (let x = 14; x < W - 8; x += 9) hatch += `M${x} ${y + 1}l-5 5`;
    return ln(8, y, W - 8, y, 'gnd') + `<path class="hatch" d="${hatch}"/>`;
  }

  /* ------------------------------------------------------------ shared calculator plumbing */
  function setup(root, n, defaults, onCalc) {
    const st = { unit: root.dataset.unit || (usLocale ? 'in' : 'mm'), active: null };
    const vals = (st.unit === 'in' ? defaults.in : defaults.mm).slice();
    const inputs = Array.from(root.querySelectorAll('input[data-f]'));
    const ui = {
      st, vals, inputs,
      out: root.querySelector('.calc-out'),
      sheet: root.querySelector('.sheet'),
      svg: root.querySelector('svg.draw'),
      live: root.querySelector('[data-live]'),
      href: esc(root.dataset.applink || '#get'),
      timer: 0,
    };
    ui.fine = (mm) => (st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) + '"' : E.fmtMM(mm, 0.1) + ' mm');
    ui.dim = (mm) => (st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) + '"' : E.fmtMM(mm, 0.1));
    ui.long = (mm) => (st.unit === 'in' ? E.fmtLength(mm, { unit: 'in', denom: 16, feet: true }) : E.fmtMM(mm, 1) + ' mm');
    ui.say = (text) => {
      if (!ui.live) return;
      clearTimeout(ui.timer);
      ui.timer = setTimeout(() => { ui.live.textContent = text; }, 700);
    };
    // value i: NaN if typed but unreadable, '' if blank (optional fields)
    ui.read = (i, optional) => {
      const s = vals[i].trim();
      const v = s === '' ? (optional ? '' : NaN) : E.parseLength(s, st.unit);
      const bad = s !== '' && !(v >= 0);
      inputs[i].parentElement.classList.toggle('bad', bad);
      inputs[i].setAttribute('aria-invalid', String(bad));
      return bad ? (optional ? '' : NaN) : v;
    };
    ui.sync = () => {
      root.querySelectorAll('[data-u]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === st.unit)));
      root.querySelectorAll('.u').forEach((u) => (u.textContent = st.unit === 'in' ? 'in' : 'mm'));
      inputs.forEach((inp, i) => { if (inp.value !== vals[i]) inp.value = vals[i]; });
    };
    ui.size = () => {
      const W = Math.max(260, Math.floor(ui.sheet.clientWidth));
      const H = Math.max(270, Math.min(560, Math.floor(ui.sheet.clientHeight) || 300));
      ui.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      ui.svg.setAttribute('width', W);
      ui.svg.setAttribute('height', H);
      return { W, H };
    };
    const form = root.querySelector('.calc-in');
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
    root.addEventListener('click', (e) => {
      const u = e.target.closest('[data-u]');
      if (u && u.dataset.u !== st.unit) {
        const from = st.unit;
        st.unit = u.dataset.u;
        for (let i = 0; i < n; i++) {
          const mm = E.parseLength(vals[i], from);
          if (isFinite(mm)) vals[i] = st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) : E.fmtMM(mm, 0.5);
        }
        ui.sync(); onCalc();
      }
    });
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => { vals[i] = inp.value; onCalc(); });
      inp.addEventListener('focus', () => { st.active = i; ui.draw(); });
      inp.addEventListener('blur', () => { st.active = null; setTimeout(ui.draw, 0); });
    });
    if ('ResizeObserver' in window) {
      let w0 = 0;
      let h0 = 0;
      new ResizeObserver(() => {
        if (ui.sheet.clientWidth !== w0 || ui.sheet.clientHeight !== h0) { w0 = ui.sheet.clientWidth; h0 = ui.sheet.clientHeight; ui.draw(); }
      }).observe(ui.sheet);
    } else {
      window.addEventListener('resize', () => ui.draw());
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ui.draw());
    return ui;
  }

  /* ================================================================ STAIRS */
  function rangeText(min, max, f) {
    if (min != null && max != null) return `${f(min)} to ${f(max)}`;
    if (min != null) return `min ${f(min)}`;
    return `max ${f(max)}`;
  }

  function initStairs(root) {
    const stairDefault = usLocale ? 'us' : /^en-GB/i.test(lang) ? 'uk' : /^en-NZ/i.test(lang) ? 'nz' : /^es-ES/i.test(lang) ? 'es' : 'au';
    let preset = root.dataset.preset || stairDefault;
    let last = null;
    const ui = setup(root, 2, { mm: ['2700', ''], in: ['108', ''] }, calc);
    const { st } = ui;
    const lim = root.querySelector('[data-lim]');
    const m = (s) => `<span class="m">${esc(s)}</span>`;
    const lenF = (x) => (st.unit === 'in' ? E.fmtFraction(x / E.MM_PER_IN, 32) + '"' : E.fmtMM(x, 0.1) + ' mm');
    const degF = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '') + '°';

    function limitsHTML(p) {
      const parts = [];
      if (p.riserMin != null || p.riserMax != null) parts.push('riser ' + m(rangeText(p.riserMin, p.riserMax, lenF)));
      if (p.goingMin != null || p.goingMax != null) parts.push('going ' + m(rangeText(p.goingMin, p.goingMax, lenF)));
      if (p.sumMin != null) parts.push('2R + G ' + m(rangeText(p.sumMin, p.sumMax, lenF)));
      if (p.pitchMax != null) parts.push('angle ' + m('max ' + degF(p.pitchMax)));
      if (p.maxRisers != null) parts.push(m(String(p.maxRisers)) + ' risers per flight at most');
      return `${esc(p.source)}: ${parts.join(', ')}.`;
    }
    function checkHTML(c) {
      const name = { riser: 'Riser', going: 'Going', sum: '2R + G', pitch: 'Angle', flight: 'Risers in one flight' }[c.key];
      const f = c.key === 'pitch' ? degF : c.key === 'flight' ? String : lenF;
      const value = c.key === 'pitch' ? degF(c.value) : c.key === 'flight' ? String(c.value) : ui.fine(c.value);
      return `<li class="${c.ok ? 'ok' : 'no'}"><b class="mk" aria-hidden="true">${c.ok ? '✓' : '✗'}</b><span>${name} ${m(value)} <small>(${m(rangeText(c.min, c.max, f))})</small>${c.ok ? '' : ' <b>fails</b>'}</span></li>`;
    }

    function calc() {
      const rise = ui.read(0, false);
      const run = ui.read(1, true);
      const r = E.stairs({ rise, run, preset, step: st.unit === 'in' ? E.MM_PER_IN / 16 : 1 });
      last = { r, run };
      root.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === preset)));
      if (lim) lim.innerHTML = limitsHTML(E.STAIR_PRESETS[preset]);
      render();
      ui.draw();
    }

    function render() {
      const { r } = last;
      if (!r.ok) { ui.out.innerHTML = `<p class="res-err">${esc(r.error)}</p>`; ui.say(r.error); return; }
      const p = E.STAIR_PRESETS[preset];
      const big = esc(ui.fine(r.riser).replace(/ mm$/, ''));
      let warn = '';
      if (r.checks.some((c) => c.key === 'flight' && !c.ok)) warn += '<p class="res-warn">Too many risers for one flight: add a landing to split it.</p>';
      if (!r.pass && r.runLimited && r.minRun) warn += `<p class="res-warn">It needs at least ${m(ui.long(r.minRun))} of run to stay within the limits.</p>`;
      ui.out.innerHTML = `
        <p class="res-l">Riser height</p>
        <p class="res-big"><span>${big}</span>${st.unit === 'mm' ? '<small>mm</small>' : ''}</p>
        <dl class="res-stats res-six">
          <div><dt>Risers</dt><dd>${r.risers}</dd></div>
          <div><dt>Treads</dt><dd>${r.treads}</dd></div>
          <div><dt>Going</dt><dd>${esc(ui.fine(r.going))}</dd></div>
          <div><dt>Total run</dt><dd>${esc(ui.long(r.totalRun))}</dd></div>
          <div><dt>Angle</dt><dd>${esc(degF(r.angle))}</dd></div>
          <div><dt>2R + G</dt><dd>${esc(ui.fine(r.sum))}</dd></div>
        </dl>
        <p class="res-line">Stringer length ${m(ui.long(r.stringer))}: the diagonal of the rise and the run. Allow extra for the cuts and fixing.</p>
        <ul class="res-checks" aria-label="Check against the ${esc(p.label)} preset">
          <li class="sum ${r.pass ? 'ok' : 'no'}"><b class="mk" aria-hidden="true">${r.pass ? '✓' : '✗'}</b><span>${r.pass ? 'Within' : 'Outside'} the ${esc(p.label)} limits (${esc(p.source)})</span></li>
          ${r.checks.map(checkHTML).join('')}
        </ul>
        ${warn}
        <p class="hint">Presets are a guide only. Building rules vary by place and change over time, so check yours with your certifier or inspector. Gapwise doesn't certify compliance.</p>
        <a class="cta" href="${ui.href}">Save this stair and its check list in the Gapwise app</a>`;
      ui.say(`${r.risers} risers of ${ui.fine(r.riser)}, ${r.treads} treads with a going of ${ui.fine(r.going)}. ${r.pass ? 'Within' : 'Outside'} the ${p.label} limits.`);
    }

    // Side elevation, drawn to one scale: the flight, the upper floor, the first riser and going, the totals.
    ui.draw = function draw() {
      if (!ui.sheet || !ui.svg) return;
      const { W, H } = ui.size();
      if (!last || !last.r.ok) {
        ui.svg.innerHTML = `<text class="note" x="${W / 2}" y="${H / 2}" text-anchor="middle">Enter the total rise to draw the stair.</text>`;
        ui.svg.setAttribute('aria-label', 'No drawing: the numbers need fixing.');
        return;
      }
      const { r, run } = last;
      const act = st.active == null ? 'riser' : st.active === 0 ? 'rise' : 'run';
      const mL = 78, mR = 76, mT = 34;
      const yF = H - 64; // floor
      const span = Math.max(r.totalRun, run || 0);
      const s = Math.min((W - mL - mR) / span, (yF - mT) / r.rise);
      const xT = mL + span * s; // top nosing
      const x0 = xT - r.totalRun * s; // first riser
      const yT = yF - r.rise * s; // upper floor
      const R = r.riser * s, G = r.going * s;
      let g = ground(W, yF);
      // upper floor slab, ending short of the total-rise dimension
      const slabEnd = W - 46;
      g += rc(xT, yT, slabEnd - xT, 12, 'post');
      // the flight: steps on top, a stringer underside parallel to the pitch line
      let d = `M${r1(x0)} ${r1(yF)}`;
      for (let i = 0; i < r.risers; i++) {
        d += `V${r1(yF - (i + 1) * R)}`;
        if (i < r.treads) d += `H${r1(x0 + (i + 1) * G)}`;
      }
      d += `V${r1(yT + 1.5 * R)}L${r1(x0 + 0.5 * G)} ${r1(yF)}Z`;
      if (act === 'riser') g += rc(x0, yF - R, Math.min(G, xT - x0), R, 'tint');
      g += `<path class="obj" d="${d}"/>`;
      // pitch line through the nosings
      g += ln(x0 - 0.6 * G, yF - 0.4 * R, xT + 0.4 * G, yT - 0.4 * R, 'pitch');
      // available run: where the space ends
      if (run) {
        const xA = xT - run * s;
        g += `<g class="${act === 'run' ? 'avail on' : 'avail'}">${ln(xA, yF, xA, yT - 6)}<text x="${r1(xA + 4)}" y="${r1(yT + 2)}">space</text></g>`;
      }
      // first riser (left) and first going (above it, label kept left of the next riser)
      g += vdim(x0 - 14, yF, yF - R, ui.dim(r.riser), act === 'riser', 'left');
      g += ln(x0 - 20, yF - R, x0 - 2, yF - R, 'dimext');
      g += hdim(x0, x0 + G, yF - R - 16, ui.dim(r.going), act === 'riser', yF - R - 3, yF - R - 3, W, 'end');
      // total rise (right) and total run (below)
      const xR = W - 24;
      g += ln(slabEnd + 3, yT, xR + 6, yT, 'dimext') + ln(xT + 6, yF, xR + 6, yF, 'dimext');
      g += vdim(xR, yF, yT, ui.dim(r.rise), act === 'rise');
      g += hdimBelow(x0, xT, yF + 34, ui.dim(r.totalRun), act === 'run', yF + 9, W);
      g += `<text class="note" x="10" y="${H - 9}">${esc(`${r.risers} risers, ${r.treads} treads, ${(Math.round(r.angle * 10) / 10).toFixed(1)}°`)}</text>`;
      g += `<text class="note dimnote" x="${W - 10}" y="${H - 9}" text-anchor="end">${st.unit === 'in' ? 'Inches' : 'mm'}</text>`;
      ui.svg.innerHTML = g;
      ui.svg.setAttribute('aria-label', `Side elevation: ${r.risers} risers of ${ui.fine(r.riser)} and ${r.treads} treads of ${ui.fine(r.going)}, rising ${ui.long(r.rise)} over a run of ${ui.long(r.totalRun)}.`);
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (b && E.STAIR_PRESETS[b.dataset.p]) { preset = b.dataset.p; calc(); }
    });
    ui.sync();
    calc();
  }

  /* ================================================================ DECKING */
  function initDeck(root) {
    let layout = 'rip';
    let last = null;
    const ui = setup(root, 5, { mm: ['3600', '140', '5', '5400', '4800'], in: ["12'", '5 1/2', '3/16', "16'", "14'"] }, calc);
    const { st } = ui;
    const m = (s) => `<span class="m">${esc(s)}</span>`;
    const stock = (mm) => (st.unit === 'in' ? (Math.abs(mm / E.MM_PER_IN / 12 - Math.round(mm / E.MM_PER_IN / 12)) < 1e-6 ? Math.round(mm / E.MM_PER_IN / 12) + "'" : ui.long(mm)) : mm >= 1000 ? +(mm / 1000).toFixed(3) + ' m' : E.fmtMM(mm, 0.5) + ' mm');

    function calc() {
      const width = ui.read(0, false);
      const board = ui.read(1, false);
      const gap = ui.read(2, true);
      const boardLength = ui.read(3, true);
      const deckLength = ui.read(4, true);
      const r = E.decking({
        width, board, gap: gap === '' ? 0 : gap, layout, boardLength, deckLength,
        kerf: st.unit === 'in' ? E.MM_PER_IN / 8 : 3, unit: st.unit,
      });
      last = { r };
      root.querySelectorAll('[data-lay]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lay === layout)));
      render();
      ui.draw();
    }

    function render() {
      const { r } = last;
      if (!r.ok) { ui.out.innerHTML = `<p class="res-err">${esc(r.error)}</p>`; ui.say(r.error); return; }
      let h = '';
      let said = '';
      if (r.layout === 'rip') {
        h += `<p class="res-l">${r.rip > 0 ? 'Last board, ripped to' : 'Last board'}</p>`;
        h += r.rip > 0
          ? `<p class="res-big"><span>${esc(ui.fine(r.rip).replace(/ mm$/, ''))}</span>${st.unit === 'mm' ? '<small>mm</small>' : ''}</p>`
          : '<p class="res-big res-word">No rip needed</p>';
        h += `<dl class="res-stats"><div><dt>Boards across</dt><dd>${r.boards}</dd></div><div><dt>Full boards</dt><dd>${r.full}</dd></div><div><dt>Gap</dt><dd>${esc(ui.fine(r.gap))}</dd></div></dl>`;
        if (r.edge >= 0.5) h += `<p class="res-line">Leaves ${m(ui.fine(r.edge))} at the edge.</p>`;
        if (r.narrow) h += `<p class="res-warn">That's a thin rip and it may split. Adjust the gap, or rip the first and last boards to ${m(ui.fine(r.balanced))} each.</p>`;
        if (r.even && (r.rip > 0 || r.edge >= 0.5)) h += `<p class="res-line">Or set the gap to ${m(ui.fine(r.even.gap))} and lay ${m(String(r.even.n))} full boards, no rip.</p>`;
        said = r.rip > 0 ? `${r.boards} boards across, the last ripped to ${ui.fine(r.rip)}.` : `${r.boards} full boards, no rip.`;
      } else {
        const diff = r.gap - r.wantGap;
        h += '<p class="res-l">Gap, every board full width</p>';
        h += `<p class="res-big"><span>${esc(ui.fine(r.gap).replace(/ mm$/, ''))}</span>${st.unit === 'mm' ? '<small>mm</small>' : ''}</p>`;
        h += `<dl class="res-stats"><div><dt>Full boards</dt><dd>${r.boards}</dd></div><div><dt>Centres</dt><dd>${esc(ui.fine(r.even.centres))}</dd></div><div><dt>Versus ${esc(ui.fine(r.wantGap))}</dt><dd>${Math.abs(diff) < 0.05 ? 'same' : (diff > 0 ? '+' : '−') + esc(ui.fine(Math.abs(diff)))}</dd></div></dl>`;
        if (r.gap < 1) h += '<p class="res-warn">The gap is under 1 mm.</p>';
        if (r.rip > 0) h += `<p class="res-line">Or keep ${m(ui.fine(r.wantGap))} gaps and rip the last board to ${m(ui.fine(r.rip))}.</p>`;
        said = `${r.boards} full boards with ${ui.fine(r.gap)} gaps.`;
      }
      if (r.buy && !r.buy.ok) {
        h += `<p class="res-err">${esc(r.buy.error)}</p>`;
      } else if (r.buy) {
        h += `<p class="res-l res-ml">Lengths to buy</p><p class="res-buy">${m(String(r.buy.lengths))} × ${m(stock(r.buy.boardLength))}</p>`;
        h += `<dl class="res-stats"><div><dt>Rows</dt><dd>${r.buy.rows}</dd></div><div><dt>Waste</dt><dd>${(Math.round(r.buy.wastePct * 10) / 10).toFixed(1)}%</dd></div><div><dt>Laid</dt><dd>${esc(stock(r.buy.linear))}</dd></div></dl>`;
        h += `<p class="res-line">One row per board across. Offcuts go into other rows, allowing ${m(st.unit === 'in' ? '1/8"' : '3 mm')} per cut.${r.buy.joins ? ' Each row needs a join: stagger them and land each one on a joist.' : ''}</p>`;
        said += ` Buy ${r.buy.lengths} lengths of ${stock(r.buy.boardLength)}.`;
      } else {
        h += '<p class="res-line">Add the board length and the deck length to see how many lengths to buy.</p>';
      }
      h += `<a class="cta" href="${ui.href}">Save this deck with its cut list in the Gapwise app</a>`;
      ui.out.innerHTML = h;
      ui.say(said);
    }

    // Plan: every board across the deck, the last board picked out. Boards are not drawn to length.
    ui.draw = function draw() {
      if (!ui.sheet || !ui.svg) return;
      const { W, H } = ui.size();
      if (!last || !last.r.ok) {
        ui.svg.innerHTML = `<text class="note" x="${W / 2}" y="${H / 2}" text-anchor="middle">Enter the numbers to draw the deck.</text>`;
        ui.svg.setAttribute('aria-label', 'No drawing: the numbers need fixing.');
        return;
      }
      const { r } = last;
      const act = st.active;
      const mx = 26, BREAK = 30, K = 3, M = 3;
      const yTop = 62, yBot = H - 82;
      const usable = W - 2 * mx;
      const its = r.items;
      let s = usable / r.width;
      let broken = false;
      let leftEnd = r.width, rightStart = r.width;
      if (its.length > K + M + 2 && (r.board + r.gap) * s < 9) {
        broken = true;
        leftEnd = its[K - 1].right + r.gap / 2;
        rightStart = its[its.length - M].left - r.gap / 2;
        s = (usable - BREAK) / (leftEnd + (r.width - rightStart));
      }
      const X = (mm) => (!broken || mm <= leftEnd ? mx + mm * s : mx + leftEnd * s + BREAK + (mm - rightStart) * s);
      const shown = broken ? its.filter((it, i) => i < K || i >= its.length - M) : its;
      const lastIt = its[its.length - 1];
      let g = '';
      if ((act === 2 || (act == null && r.layout === 'even')) && its.length > 1) g += rc(X(its[0].right), yTop, X(its[1].left) - X(its[0].right), yBot - yTop, 'tint');
      shown.forEach((it) => {
        const on = it === lastIt;
        g += rc(X(it.left), yTop, X(it.right) - X(it.left), yBot - yTop, on ? 'obj on' : 'obj');
      });
      if (broken) {
        g += `<rect x="${r1(X(leftEnd) + 1)}" y="${yTop - 8}" width="${BREAK - 2}" height="${r1(yBot - yTop + 16)}" class="blank"/>`;
        g += breakLine(X(leftEnd) + 2, yTop - 8, yBot + 8) + breakLine(X(leftEnd) + BREAK - 2, yTop - 8, yBot + 8);
      }
      // top dimension: the board, the gap, or the last board
      const yD = yTop - 14;
      if (act === 1) g += hdim(X(its[0].left), X(its[0].right), yD, ui.dim(r.board), true, yTop - 3, yTop - 3, W);
      else if ((act === 2 || r.layout === 'even') && its.length > 1) g += hdim(X(its[0].right), X(its[1].left), yD, ui.dim(r.gap), true, yTop - 3, yTop - 3, W);
      else g += hdim(X(lastIt.left), X(lastIt.right), yD, ui.dim(lastIt.right - lastIt.left), act !== 0, yTop - 3, yTop - 3, W);
      g += hdimBelow(X(0), X(r.width), yBot + 34, ui.dim(r.width), act === 0, yBot + 4, W);
      const note = r.layout === 'rip'
        ? (r.rip > 0 ? `${r.boards} boards, the last ripped to ${ui.fine(r.rip)}` : `${r.boards} full boards, no rip`)
        : `${r.boards} full boards at ${ui.fine(r.gap)} gaps`;
      g += `<text class="note" x="10" y="${H - 9}">${esc(note)}</text>`;
      g += `<text class="note dimnote" x="${W - 10}" y="${H - 9}" text-anchor="end">${st.unit === 'in' ? 'Inches' : 'mm'}</text>`;
      ui.svg.innerHTML = g;
      ui.svg.setAttribute('aria-label', `Deck plan: ${note}, across ${ui.long(r.width)}.`);
    };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lay]');
      if (b) { layout = b.dataset.lay === 'even' ? 'even' : 'rip'; calc(); }
    });
    ui.sync();
    calc();
  }

  document.querySelectorAll('[data-calc="stairs"]').forEach(initStairs);
  document.querySelectorAll('[data-calc="deck"]').forEach(initDeck);
})();
