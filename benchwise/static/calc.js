/* Free playing time calculator. Uses the same engine as the Benchwise app.
   Query string prefill: ?format=basketball&squad=8&on=5&periods=4&min=10&every=5&subs=rolling&gk=1&seed=1 */
(function () {
  'use strict';
  const E = window.Engine;
  const root = document.getElementById('calc');
  if (!root || !E) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SQUAD = { soccer4: 6, soccer7: 10, soccer9: 12, soccer11: 15, futsal: 8, basketball: 8, netball: 9, hockey7: 10, hockey11: 14, footy: 15, handball: 10, custom: 8 };
  const SUBS = [['rolling', 'Any time'], ['stoppages', 'At stoppages'], ['breaks', 'Only at breaks']];
  const MAX_STINTS = 64;
  const MAX_SQUAD = 40;
  const named = (slots) => slots.some((s) => s && s !== 'GK');
  const fmtMin = (m) => (Math.abs(m - Math.round(m)) < 0.01 ? String(Math.round(m)) : E.mmss(m));
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const word = (n) => words[n] || String(n);
  const periodLabel = (per, i, short) => (per === 4 ? 'Q' + (i + 1) : per === 2 ? (short ? 'H' + (i + 1) : i === 0 ? '1st half' : '2nd half') : 'P' + (i + 1));

  function preset(fid) {
    const f = E.format(fid);
    return { fid: f.id, on: f.slots.length, squad: SQUAD[f.id] || f.slots.length + 3, periods: f.periods, min: f.periodMin, subs: f.subs, every: f.every, gk: !!f.keeper, seed: 1 };
  }

  // ---------------------------------------------------------------- state from the query string
  const q = new URLSearchParams(location.search);
  const qFmt = q.get('format');
  let st = preset(qFmt && E.FORMATS.some((x) => x.id === qFmt) ? qFmt : 'soccer7');
  const qNum = (k, key, lo, hi, int) => {
    if (!q.has(k)) return;
    const x = Number(q.get(k));
    if (Number.isFinite(x) && x >= lo && x <= hi) st[key] = int ? Math.round(x) : x;
  };
  qNum('on', 'on', 1, 30, true);
  qNum('squad', 'squad', 1, MAX_SQUAD, true);
  qNum('periods', 'periods', 1, 8, true);
  qNum('min', 'min', 1, 90, false);
  qNum('every', 'every', 1, 90, false);
  qNum('seed', 'seed', 1, 1e9, true);
  if (SUBS.some(([k]) => k === q.get('subs'))) st.subs = q.get('subs');
  if (q.has('gk')) st.gk = q.get('gk') === '1';

  // ---------------------------------------------------------------- form
  root.innerHTML = `
    <div class="calc-form">
      <label class="wide">Sport and format<select id="cFmt">${E.FORMATS.map((f) => `<option value="${f.id}">${esc(f.id === 'custom' ? 'Other / custom' : f.name)}</option>`).join('')}</select></label>
      <label>Players on the field<input id="cOn" type="number" inputmode="numeric" min="1" max="30"></label>
      <label>Players in the squad<input id="cSquad" type="number" inputmode="numeric" min="1" max="${MAX_SQUAD}"></label>
      <label>Periods <span class="hint">2 = halves, 4 = quarters</span><input id="cPer" type="number" inputmode="numeric" min="1" max="8"></label>
      <label>Minutes per period<input id="cMin" type="number" inputmode="decimal" min="1" max="90" step="any"></label>
      <label>Subs allowed<select id="cSubs">${SUBS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Change about every <span class="hint">minutes</span><input id="cEvery" type="number" inputmode="decimal" min="1" max="90" step="any"></label>
      <div class="full"><label class="switch" id="gkWrap"><input type="checkbox" id="cGk"><span id="gkText">Goalkeeper: a whole period each, taking turns</span></label></div>
      <details class="names"><summary>Add player names (optional)</summary><div>
        <textarea id="cNames" placeholder="One name per line, or separated by commas" autocomplete="off" spellcheck="false"></textarea>
        <span class="hint">Names stay in your browser and aren't added to the link. Without names, players are numbered.</span>
      </div></details>
    </div>
    <div class="calc-out" aria-live="polite"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const out = root.querySelector('.calc-out');
  const el = { fmt: $('cFmt'), on: $('cOn'), squad: $('cSquad'), per: $('cPer'), min: $('cMin'), subs: $('cSubs'), every: $('cEvery'), gk: $('cGk'), names: $('cNames') };

  function names() {
    return el.names.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_SQUAD);
  }

  function fill() {
    el.fmt.value = st.fid;
    el.on.value = st.on;
    el.squad.value = st.squad;
    el.per.value = st.periods;
    el.min.value = st.min;
    el.subs.value = st.subs;
    el.every.value = st.every;
    el.gk.checked = st.gk;
  }

  // positions (netball) are kept while the number on court matches the preset
  function usesPositions() {
    const base = E.format(st.fid);
    return named(base.slots) && st.on === base.slots.length;
  }

  function sync() {
    const pos = usesPositions();
    const base = E.format(st.fid);
    el.gk.disabled = pos;
    $('gkWrap').classList.toggle('dis', pos);
    $('gkText').textContent = pos
      ? 'Positions rotate (' + base.slots.join(', ') + '), so there\'s no separate keeper'
      : named(base.slots) ? 'Goalkeeper (positions are used when ' + base.slots.length + ' are on)' : 'Goalkeeper: a whole period each, taking turns';
    el.every.disabled = st.subs === 'breaks';
  }

  function buildFormat() {
    const base = E.format(st.fid);
    const f = Object.assign({}, base);
    if (usesPositions()) {
      f.slots = base.slots.slice();
      f.keeper = false;
    } else {
      f.keeper = st.gk;
      f.slots = Array.from({ length: st.on }, (_, i) => (st.gk && i === 0 ? 'GK' : ''));
    }
    f.periods = st.periods;
    f.periodMin = st.min;
    f.subs = st.subs;
    f.every = st.subs === 'breaks' ? st.min : st.every;
    return f;
  }

  function players() {
    const nm = names();
    return Array.from({ length: st.squad }, (_, i) => ({ id: 'p' + (i + 1), name: nm[i] || 'Player ' + (i + 1) }));
  }

  // ---------------------------------------------------------------- read the form
  function read() {
    const bad = [];
    st.subs = el.subs.value;
    st.gk = el.gk.checked;
    const num = (input, key, lo, hi, int) => {
      const x = Number(input.value);
      const ok = input.value.trim() !== '' && Number.isFinite(x) && x >= lo && x <= hi;
      input.classList.toggle('bad', !ok && !input.disabled);
      if (ok) st[key] = int ? Math.round(x) : x;
      else if (!input.disabled) bad.push(input);
      return ok;
    };
    num(el.on, 'on', 1, 30, true);
    num(el.squad, 'squad', 1, MAX_SQUAD, true);
    num(el.per, 'periods', 1, 8, true);
    num(el.min, 'min', 1, 90, false);
    if (st.subs !== 'breaks') num(el.every, 'every', 1, 90, false);
    return bad;
  }

  function saveUrl() {
    const p = preset(st.fid);
    const qs = new URLSearchParams();
    qs.set('format', st.fid);
    qs.set('squad', st.squad);
    if (st.on !== p.on) qs.set('on', st.on);
    if (st.periods !== p.periods) qs.set('periods', st.periods);
    if (st.min !== p.min) qs.set('min', st.min);
    if (st.subs !== p.subs) qs.set('subs', st.subs);
    if (st.subs !== 'breaks' && st.every !== p.every) qs.set('every', st.every);
    if (!usesPositions() && st.gk !== p.gk) qs.set('gk', st.gk ? '1' : '0');
    if (st.seed !== 1) qs.set('seed', st.seed);
    try { history.replaceState(null, '', location.pathname + '?' + qs.toString()); } catch (e) { /* preview frames */ }
  }

  // ---------------------------------------------------------------- output
  function grid(f, res, ps, label) {
    const wins = res.windows;
    const per = f.periods;
    const counts = Array.from({ length: per }, (_, i) => wins.filter((w) => w.period === i).length);
    const times = counts.some((c) => c > 1);
    const gapH = '<th class="gap" aria-hidden="true"></th>';
    const h1 = counts.map((c, i) => `${i ? gapH : ''}<th colspan="${c}" class="per" scope="colgroup">${periodLabel(per, i, c < 2)}</th>`).join('');
    const h2 = times ? wins.map((w, i) => `${w.first && i ? gapH : ''}<th class="t">${E.mmss(w.start - w.period * f.periodMin)}</th>`).join('') : '';
    const rs = times ? ' rowspan="2"' : '';
    const sets = wins.map((w) => new Map(w.lineup.map((x) => [x.id, x.slot])));
    const rows = ps.map((p) => {
      const cells = wins.map((w, i) => {
        const gap = w.first && i ? '<td class="gap"></td>' : '';
        if (!sets[i].has(p.id)) return gap + '<td class="off"></td>';
        const slot = sets[i].get(p.id);
        if (f.keeper && slot === 'GK') return gap + '<td class="gk">GK</td>';
        return gap + `<td class="on">${slot ? esc(slot) : '✓'}</td>`;
      }).join('');
      const nm = esc(p.name).replace(/^Player (\d+)$/, '<span class="pl">Player </span>$1');
      return `<tr><th scope="row" class="nm">${nm}</th>${cells}<td class="m">${fmtMin(res.minutes[p.id] || 0)}</td></tr>`;
    }).join('');
    const legend = '<span><i class="on">✓</i>On</span>' + (f.keeper ? '<span><i class="gk">GK</i>In goal</span>' : '') + '<span><i class="off"></i>Bench</span>' + (named(f.slots) ? '<span>Letters show the position</span>' : '');
    return `<div class="rot-wrap" role="region" aria-label="Rotation grid (scrolls sideways)" tabindex="0"><table class="rot" aria-label="${esc(label)}"><thead><tr><th class="nm"${rs} scope="col">Player</th>${h1}<th class="m"${rs} scope="col">Min</th></tr>${times ? `<tr>${h2}</tr>` : ''}</thead><tbody>${rows}</tbody></table></div><p class="legend">${legend}</p>`;
  }

  function sentence(f, res, ps, stint) {
    const game = f.periods * f.periodMin;
    if (ps.length < f.slots.length) return `Only <b>${ps.length}</b> players for ${f.slots.length} spots, so everyone plays the whole game.`;
    if (ps.length === f.slots.length) return `Nobody on the bench: everyone plays all <b>${fmtMin(game)}</b> minutes.`;
    const groups = new Map();
    ps.forEach((p) => { const k = Math.round((res.minutes[p.id] || 0) * 1000) / 1000; groups.set(k, (groups.get(k) || 0) + 1); });
    const keys = Array.from(groups.keys()).sort((a, b) => b - a);
    let s;
    if (keys.length === 1) s = `Everyone plays exactly <b>${fmtMin(keys[0])} minutes</b> of the ${fmtMin(game)}.`;
    else {
      const parts = keys.map((k, i) => `<b>${groups.get(k)}</b> ${i === 0 ? (groups.get(k) === 1 ? 'player gets' : 'players get') : (groups.get(k) === 1 ? 'gets' : 'get')} <b>${fmtMin(k)} min</b>`);
      s = parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] + '.';
      if (keys.length === 2 && Math.abs(keys[0] - keys[1] - stint) < 1e-3) {
        s += ` That's one extra ${f.subs === 'breaks' ? (f.periods === 4 ? 'quarter' : f.periods === 2 ? 'half' : 'period') : E.mmss(stint) + ' stint'}, as even as whole stints allow. Give it to different players next time.`;
      }
    }
    if (f.keeper) {
      const ks = Array.from(new Set(res.gkByPeriod.filter(Boolean)));
      const nm = (id) => (ps.find((p) => p.id === id) || {}).name || id;
      if (ks.length) s += ` In goal: ${ks.map((k) => esc(nm(k))).join(', ')}. Keeper time counts as playing time.`;
    }
    return s;
  }

  function render() {
    const bad = read();
    sync();
    if (bad.length) { out.innerHTML = '<p class="err">Check the highlighted numbers.</p>'; return; }
    const f = buildFormat();
    const chk = E.checkFormat(f);
    if (chk.errors.length) { out.innerHTML = '<p class="err">Those settings don\'t make a game. Check the numbers above.</p>'; return; }
    const wins = E.windows(chk.format);
    if (wins.length > MAX_STINTS) {
      out.innerHTML = `<p class="err">That's ${wins.length} stints. Try changing less often, or fewer periods.</p>`;
      return;
    }
    const ps = players();
    const res = E.plan({ format: f, players: ps, options: { seed: st.seed } });
    if (!res.windows.length) { out.innerHTML = '<p class="err">No rotation for those settings.</p>'; return; }
    saveUrl();
    const vals = ps.map((p) => res.minutes[p.id] || 0);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const stint = res.windows[0].end - res.windows[0].start;
    const fname = st.fid === 'custom' ? 'Custom' : E.format(st.fid).name.replace(/ \(no keeper\)/, '');
    const subsTxt = f.subs === 'breaks' ? 'changes at the breaks' : 'a change about every ' + fmtMin(f.every) + ' min' + (f.subs === 'stoppages' ? ' at stoppages' : '');
    const title = `${fname}: ${ps.length} players, ${f.slots.length} on, ${f.periods} × ${fmtMin(f.periodMin)} min, ${subsTxt}`;
    const forced = res.warnings.some((w) => w.startsWith('position-forced'));
    const bench = Math.max(0, ps.length - f.slots.length);
    out.innerHTML = `
      <figure class="sheet">
        <figcaption class="sheet-top"><span class="sheet-what">${esc(title)}</span>
          <span class="scores"><span class="score"><b>${lo === hi ? fmtMin(hi) : fmtMin(lo) + '–' + fmtMin(hi)}</b>min each</span><span class="score"><b>${bench}</b>on the bench</span><span class="score"><b>${res.events.length}</b>${res.events.length === 1 ? 'change' : 'changes'}</span></span></figcaption>
        ${grid(f, res, ps, title)}
      </figure>
      <div class="calc-bar"><p class="calc-say">${sentence(f, res, ps, stint)}</p>
        <span class="acts no-print"><button type="button" class="btn" id="cShuffle" title="A different fair rotation">Shuffle</button><button type="button" class="btn btn-navy" id="cPrint">Print chart</button></span></div>
      ${forced ? '<p class="note">Some players had to play a position you didn\'t expect. Check the numbers on court.</p>' : ''}
      ${f.subs === 'stoppages' ? '<p class="note">Subs at stoppages: treat each time as a target and change at the next dead ball. The referee decides.</p>' : ''}
      <aside class="cta no-print" aria-label="Get the Benchwise app"><h2 class="cta-h">Run it live on the sideline</h2>
        <p>This chart is free and unlimited, and so is the planner in the Benchwise app. On game day, a one-time unlock runs the game clock with an alert at every change, showing who comes off and who goes on. It re-plans on the spot for late arrivals and injuries, balances minutes across the season, and shares a minutes summary with parents.</p>
        <a class="btn btn-navy" href="${esc(root.dataset.applink || '/#app')}">Get the free app</a></aside>`;
    out.querySelector('#cPrint').onclick = () => window.print();
    out.querySelector('#cShuffle').onclick = () => { st.seed = (st.seed % 999) + 1; render(); };
  }

  // ---------------------------------------------------------------- events
  el.fmt.addEventListener('change', () => {
    const k = names().length;
    st = preset(el.fmt.value);
    if (k) st.squad = k;
    fill();
    render();
  });
  el.names.addEventListener('input', () => {
    const k = names().length;
    if (k) el.squad.value = k;
    render();
  });
  [el.on, el.squad, el.per, el.min, el.every].forEach((x) => x.addEventListener('input', render));
  [el.subs, el.gk].forEach((x) => x.addEventListener('change', render));

  fill();
  render();
})();
