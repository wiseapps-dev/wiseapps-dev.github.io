/* Free web spacing calculator with a live elevation drawing.
   Uses the same engine as the Gapwise app (static/engine.js, copied from app/www at build time).
   The numbers come from exactly the same Engine.spacing() call as the previous site. */
(function () {
  'use strict';
  const E = window.Engine;
  if (!E) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PRESETS = [
    { id: 'au', label: 'AU under 125 mm', mm: 125 },
    { id: 'nzuk', label: 'NZ/UK under 100 mm', mm: 100 },
    { id: 'us', label: 'US under 4"', mm: 101.6 },
  ];
  const SHOW_MARKS = 4;
  const r1 = (n) => String(Math.round(n * 10) / 10);

  document.querySelectorAll('[data-calc]').forEach((root) => {
    const mode = root.dataset.calc === 'flush' ? 'flush' : 'between';
    const between = mode === 'between';
    const us = /^en-US/i.test(navigator.language || '');
    const hundred = /^en-(NZ|GB|IE)/i.test(navigator.language || '');
    const st = {
      unit: root.dataset.unit || (us ? 'in' : 'mm'),
      preset: between ? (root.dataset.preset || (us ? 'us' : hundred ? 'nzuk' : 'au')) : null,
      active: null, // which input has focus: 0 length, 1 width, 2 gap. The matching dimension is picked out in yellow.
    };
    const defaults = {
      between: { mm: ['2400', '42', hundred ? '100' : '125'], in: ['72', '1 1/2', '4'] },
      flush: { mm: ['2400', '70', '25'], in: ['96', '3 1/2', '1'] },
    }[mode];
    const vals = (st.unit === 'in' ? defaults.in : defaults.mm).slice();
    if (st.preset === 'au' && st.unit === 'mm') vals[2] = '125';
    if (st.preset === 'nzuk' && st.unit === 'mm') vals[2] = '100';
    if (root.dataset.w && st.unit === 'mm') vals[1] = root.dataset.w; // e.g. 41 mm spindles on the UK page

    const form = root.querySelector('.calc-in');
    const inputs = Array.from(root.querySelectorAll('input[data-f]'));
    const out = root.querySelector('.calc-out');
    const sheet = root.querySelector('.sheet');
    const svg = root.querySelector('svg.draw');
    const live = root.querySelector('[data-live]');
    const item = root.dataset.item || (between ? 'baluster' : 'picket'); // 'spindle' on the UK page
    const items = item + 's';
    const post = root.dataset.post || 'post';
    let last = null;
    let liveTimer = 0;

    function fmtFine(mm) {
      return st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) + '"' : E.fmtMM(mm, 0.1) + ' mm';
    }
    function fmtMark(mm) {
      return st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 16) + '"' : E.fmtMM(mm, 1);
    }
    function fmtDim(mm) {
      return st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) + '"' : E.fmtMM(mm, 0.1);
    }
    function sync() {
      root.querySelectorAll('[data-u]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === st.unit)));
      root.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === st.preset)));
      root.querySelectorAll('.u').forEach((u) => (u.textContent = st.unit === 'in' ? 'in' : 'mm'));
      inputs.forEach((inp, i) => { if (inp.value !== vals[i]) inp.value = vals[i]; });
    }
    function say(text) {
      if (!live) return;
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { live.textContent = text; }, 700);
    }

    function calc() {
      const L = E.parseLength(vals[0], st.unit);
      const w = vals[1].trim() === '' ? 0 : E.parseLength(vals[1], st.unit);
      const p = PRESETS.find((x) => x.id === st.preset);
      const v = p ? p.mm : E.parseLength(vals[2], st.unit);
      [L, w, v].forEach((x, i) => {
        const bad = vals[i].trim() !== '' && !(x >= 0);
        inputs[i].parentElement.classList.toggle('bad', bad);
        inputs[i].setAttribute('aria-invalid', String(bad));
      });
      const r = E.spacing({ mode, rule: 'maxGap', length: L, width: w, value: v, strict: !!p, margin: st.unit === 'in' ? 0.4 : 0.05 });
      last = { r, L, w, v, p };
      render();
      draw();
    }

    function render() {
      const { r, v, p } = last;
      if (!r.ok) { out.innerHTML = `<p class="res-err">${esc(r.error)}</p>`; say(r.error); return; }
      if (!r.n) { out.innerHTML = `<p class="res-note">${esc(r.note)}</p>`; say(r.note); return; }
      const shown = r.items.slice(0, SHOW_MARKS);
      const big = esc(fmtFine(r.gap).replace(/ mm$/, ''));
      const href = esc(root.dataset.applink || '#get');
      const cta = r.n > SHOW_MARKS
        ? `Save this job with all ${r.n} marks and a cut list in the Gapwise app`
        : 'Save this job with the marks and a cut list in the Gapwise app';
      out.innerHTML = `
        <p class="res-l">Equal gap</p>
        <p class="res-big"><span>${big}</span>${st.unit === 'mm' ? '<small>mm</small>' : ''}</p>
        <dl class="res-stats">
          <div><dt>${items.charAt(0).toUpperCase() + items.slice(1)}</dt><dd>${r.n}</dd></div>
          <div><dt>Centres</dt><dd>${esc(fmtFine(r.centres))}</dd></div>
          <div><dt>Every gap</dt><dd>${r.limitOk ? `${p ? 'under' : 'at most'} ${esc(fmtFine(v))}` : 'over the limit'}</dd></div>
        </dl>
        <p class="res-l res-ml">Marks from the ${between ? post + ' face' : 'start'} to the left edge of each ${item}, in ${st.unit === 'in' ? 'inches' : 'mm'}</p>
        <ol class="marks">${shown.map((it) => `<li><i>${it.i}</i>${esc(fmtMark(it.left))}</li>`).join('')}${
          r.n > SHOW_MARKS ? `<li class="locked"><i>${SHOW_MARKS + 1} to ${r.n}</i>in the app</li>` : ''}</ol>
        <a class="cta" href="${href}">${cta}</a>`;
      say(`${r.n} ${items}, equal gap ${fmtFine(r.gap)}, centres ${fmtFine(r.centres)}.`);
    }

    /* ------------------------------------------------------------ drawing */
    const ln = (x1, y1, x2, y2, c) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"${c ? ` class="${c}"` : ''}/>`;
    const rc = (x, y, w, h, c) => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(w, 0.8))}" height="${r1(h)}" class="${c}"/>`;
    // arrowhead with its tip at x; d = 1 points right, d = -1 points left
    const tri = (x, y, d) => `<polygon points="${r1(x)},${r1(y)} ${r1(x - d * 7)},${r1(y - 2.6)} ${r1(x - d * 7)},${r1(y + 2.6)}"/>`;

    function hdim(xa, xb, y, text, on, ya, yb, W) {
      let s = `<g class="dim${on ? ' on' : ''}">`;
      if (ya != null) s += ln(xa, ya, xa, y - 4, 'ext');
      if (yb != null) s += ln(xb, yb, xb, y - 4, 'ext');
      if (xb - xa >= 18) s += ln(xa, y, xb, y) + tri(xa, y, -1) + tri(xb, y, 1);
      else s += ln(xa - 13, y, xb + 13, y) + tri(xa, y, 1) + tri(xb, y, -1);
      const tw = text.length * 7.2 + 8;
      const cx = Math.min(Math.max((xa + xb) / 2, tw / 2 + 2), W - tw / 2 - 2);
      s += `<rect x="${r1(cx - tw / 2)}" y="${r1(y - 19)}" width="${r1(tw)}" height="15"/>`;
      s += `<text x="${r1(cx)}" y="${r1(y - 7.5)}" text-anchor="middle">${esc(text)}</text></g>`;
      return s;
    }
    // overall dimension below the object: extension lines run downward from the object
    function hdimBelow(xa, xb, y, text, on, ytop, W) {
      let s = `<g class="dim${on ? ' on' : ''}">`;
      s += ln(xa, ytop, xa, y + 5, 'ext') + ln(xb, ytop, xb, y + 5, 'ext');
      s += ln(xa, y, xb, y) + tri(xa, y, -1) + tri(xb, y, 1);
      const tw = text.length * 7.2 + 8;
      const cx = Math.min(Math.max((xa + xb) / 2, tw / 2 + 2), W - tw / 2 - 2);
      s += `<rect x="${r1(cx - tw / 2)}" y="${r1(y - 19)}" width="${r1(tw)}" height="15"/>`;
      s += `<text x="${r1(cx)}" y="${r1(y - 7.5)}" text-anchor="middle">${esc(text)}</text></g>`;
      return s;
    }
    function breakLine(x, y1, y2) {
      const m = (y1 + y2) / 2;
      return `<path class="brk" d="M${r1(x)} ${r1(y1)}V${r1(m - 7)}L${r1(x + 5)} ${r1(m - 3)}L${r1(x - 5)} ${r1(m + 3)}L${r1(x)} ${r1(m + 7)}V${r1(y2)}"/>`;
    }

    function draw() {
      if (!sheet || !svg) return;
      const W = Math.max(260, Math.floor(sheet.clientWidth));
      const H = Math.max(270, Math.min(480, Math.floor(sheet.clientHeight) || 300));
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      if (!last || !last.r.ok) {
        svg.innerHTML = `<text class="note" x="${W / 2}" y="${H / 2}" text-anchor="middle">Enter the numbers to draw the run.</text>`;
        svg.setAttribute('aria-label', 'No drawing: the numbers need fixing.');
        return;
      }
      const { r, L, w } = last;
      const act = st.active == null ? 2 : st.active;
      const mx = between ? 34 : 26;
      const usable = W - 2 * mx;
      const BREAK = 30;
      let s = usable / L;
      let broken = false;
      let leftEnd = L;
      let rightStart = L;
      const K = 3;
      const M = 2;
      if (r.n > 8 && r.centres * s < 11) {
        broken = true;
        leftEnd = r.items[K - 1].right + r.gap / 2;
        rightStart = r.items[r.n - M].left - r.gap / 2;
        s = (usable - BREAK) / (leftEnd + (L - rightStart));
      }
      const X = (mm) => (!broken || mm <= leftEnd ? mx + mm * s : mx + leftEnd * s + BREAK + (mm - rightStart) * s);
      const shown = broken ? r.items.filter((it) => it.i <= K || it.i > r.n - M) : r.items;
      const x0 = X(0);
      const xL = X(L);
      const yTop = 30;
      const yDeck = H - 64;
      let g = '';

      // ground line with hatching
      g += ln(8, yDeck, W - 8, yDeck, 'gnd');
      let hatch = '';
      for (let x = 14; x < W - 8; x += 9) hatch += `M${x} ${yDeck + 1}l-5 5`;
      g += `<path class="hatch" d="${hatch}"/>`;

      if (between) {
        const yPost = 52;
        const yR1 = 62;
        const yB1 = yR1 + 9;
        const yR2b = yDeck - 24;
        const yB2 = yR2b - 8;
        const segs = broken ? [[0, leftEnd], [rightStart, L]] : [[0, L]];
        // active tint first so it sits behind the outlines
        if (act === 2) {
          const xb = r.n ? X(r.items[0].left) : xL;
          g += rc(x0, yB1, xb - x0, yB2 - yB1, 'tint');
        }
        segs.forEach(([a, b]) => {
          g += rc(X(a), yR1, X(b) - X(a), yB1 - yR1, 'obj');
          g += rc(X(a), yB2, X(b) - X(a), yR2b - yB2, 'obj');
        });
        shown.forEach((it) => {
          const on = act === 1 && it.i === r.n;
          g += rc(X(it.left), yB1, X(it.right) - X(it.left), yB2 - yB1, on ? 'obj on' : 'obj');
        });
        if (broken) {
          g += `<rect x="${r1(X(leftEnd) + 1)}" y="${yR1 - 10}" width="${BREAK - 2}" height="${r1(yR2b - yR1 + 20)}" class="blank"/>`;
          g += breakLine(X(leftEnd) + 2, yR1 - 10, yR2b + 10) + breakLine(X(leftEnd) + BREAK - 2, yR1 - 10, yR2b + 10);
        }
        // posts, with caps
        g += rc(x0 - 16, yPost, 16, yDeck - yPost, 'post') + rc(xL, yPost, 16, yDeck - yPost, 'post');
        g += rc(x0 - 18, yPost - 4, 20, 4, 'obj') + rc(xL - 2, yPost - 4, 20, 4, 'obj');
        // dimensions
        if (r.n) {
          const a = r.items[0];
          g += hdim(x0, X(a.left), yTop, fmtDim(r.gap), act === 2, yPost - 7, yR1 - 3, W);
          const z = r.items[r.n - 1];
          if (w > 0) g += hdim(X(z.left), X(z.right), yTop, fmtDim(w), act === 1, yR1 - 3, yR1 - 3, W);
        } else {
          g += hdim(x0, xL, yTop, fmtDim(r.gap), act === 2, yPost - 7, yPost - 7, W);
        }
        g += hdimBelow(x0, xL, yDeck + 34, fmtDim(L), act === 0, yDeck + 9, W);
      } else {
        const yPt = 44;
        const yBot = yDeck - 14;
        const pw = (r.items[0].right - r.items[0].left) * s;
        const ptH = Math.max(2, Math.min(12, pw * 0.7));
        const ySh = yPt + ptH;
        const span = yBot - ySh;
        const yR1 = ySh + span * 0.2;
        const yR2 = yBot - span * 0.2 - 10;
        const segs = broken ? [[0, leftEnd], [rightStart, L]] : [[0, L]];
        segs.forEach(([a, b]) => {
          g += rc(X(a), yR1, X(b) - X(a), 10, 'obj') + rc(X(a), yR2, X(b) - X(a), 10, 'obj');
        });
        if (act === 2 && r.n > 1) {
          g += rc(X(r.items[0].right), ySh, X(r.items[1].left) - X(r.items[0].right), yBot - ySh, 'tint');
        }
        shown.forEach((it) => {
          const xl = X(it.left);
          const xr = X(it.right);
          const on = act === 1 && it.i === r.n;
          g += `<polygon class="${on ? 'obj on' : 'obj'}" points="${r1(xl)},${r1(yBot)} ${r1(xl)},${r1(ySh)} ${r1((xl + xr) / 2)},${yPt} ${r1(xr)},${r1(ySh)} ${r1(xr)},${r1(yBot)}"/>`;
        });
        if (broken) {
          g += `<rect x="${r1(X(leftEnd) + 1)}" y="${yR1 - 10}" width="${BREAK - 2}" height="${r1(yR2 - yR1 + 30)}" class="blank"/>`;
          g += breakLine(X(leftEnd) + 2, yR1 - 10, yR2 + 20) + breakLine(X(leftEnd) + BREAK - 2, yR1 - 10, yR2 + 20);
        }
        if (r.n > 1) {
          g += hdim(X(r.items[0].right), X(r.items[1].left), yTop, fmtDim(r.gap), act === 2, ySh - 3, ySh - 3, W);
        }
        const z = r.items[r.n - 1];
        if (w > 0 && r.n > 2) g += hdim(X(z.left), X(z.right), yTop, fmtDim(w), act === 1, ySh - 3, ySh - 3, W);
        g += hdimBelow(x0, xL, yDeck + 34, fmtDim(L), act === 0, yBot + 3, W);
      }

      const note = r.n
        ? `${r.n} ${r.n === 1 ? item : items} at ${fmtFine(r.centres)} centres`
        : `No ${items} needed`;
      g += `<text class="note" x="${between ? 18 : 10}" y="${H - 9}">${esc(note)}</text>`;
      g += `<text class="note dimnote" x="${W - 10}" y="${H - 9}" text-anchor="end">${st.unit === 'in' ? 'Inches' : 'mm'}</text>`;
      svg.innerHTML = g;
      svg.setAttribute('aria-label', r.n
        ? `Elevation: ${r.n} ${items} over ${fmtFine(L)}, equal gaps of ${fmtFine(r.gap)}${between ? ' including at both ' + post + 's' : ''}.`
        : `Elevation: ${fmtFine(L)} opening, no ${items} needed.`);
    }

    /* ------------------------------------------------------------ events */
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
    root.addEventListener('click', (e) => {
      const u = e.target.closest('[data-u]');
      if (u && u.dataset.u !== st.unit) {
        const from = st.unit;
        st.unit = u.dataset.u;
        for (let i = 0; i < 3; i++) {
          const mm = E.parseLength(vals[i], from);
          if (isFinite(mm)) vals[i] = st.unit === 'in' ? E.fmtFraction(mm / E.MM_PER_IN, 32) : E.fmtMM(mm, 0.5);
        }
        const p = PRESETS.find((x) => x.id === st.preset);
        if (p) vals[2] = p.id === 'us' && st.unit === 'in' ? '4' : st.unit === 'in' ? E.fmtFraction(p.mm / E.MM_PER_IN, 32) : String(p.mm);
        sync(); calc();
      }
      const pr = e.target.closest('[data-p]');
      if (pr) {
        const p = PRESETS.find((x) => x.id === pr.dataset.p);
        st.preset = p.id;
        vals[2] = p.id === 'us' && st.unit === 'in' ? '4' : st.unit === 'in' ? E.fmtFraction(p.mm / E.MM_PER_IN, 32) : String(p.mm);
        sync(); calc();
      }
    });
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        vals[i] = inp.value;
        if (i === 2 && st.preset) { st.preset = null; sync(); }
        calc();
      });
      inp.addEventListener('focus', () => { st.active = i; draw(); });
      inp.addEventListener('blur', () => { st.active = null; setTimeout(draw, 0); });
    });
    if ('ResizeObserver' in window) {
      let w0 = 0;
      let h0 = 0;
      new ResizeObserver(() => {
        if (sheet.clientWidth !== w0 || sheet.clientHeight !== h0) { w0 = sheet.clientWidth; h0 = sheet.clientHeight; draw(); }
      }).observe(sheet);
    } else {
      window.addEventListener('resize', draw);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    sync(); calc();
  });
})();
