/* Tournament day planner: several short games in one day, with the minutes balanced across the
   whole day and keeper turns shared. Each game is planned by the Benchwise app's engine with the
   minutes so far fed in as the "season", exactly as the app balances a season. Nothing you type
   leaves the browser or is stored. */
(function () {
  'use strict';
  const E = window.Engine;
  const root = document.getElementById('tourney');
  if (!root || !E) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMin = (m) => (Math.abs(m - Math.round(m)) < 0.01 ? String(Math.round(m)) : E.mmss(m));
  const named = (slots) => slots.some((s) => s && s !== 'GK');
  const SQUAD = { soccer4: 6, soccer7: 10, soccer9: 12, soccer11: 15, futsal: 8, basketball: 8, netball: 9, hockey7: 10, hockey11: 14, footy: 15, handball: 10, custom: 8 };
  const MAX_SQUAD = 30;
  const periodLabel = (per, i) => (per === 4 ? 'Q' + (i + 1) : per === 2 ? 'H' + (i + 1) : 'P' + (i + 1));

  root.innerHTML = `
    <div class="calc-form">
      <label class="wide">Sport and format<select id="tFmt">${E.FORMATS.filter((f) => f.id !== 'custom').map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label>
      <label>Players in the squad<input id="tSquad" type="number" inputmode="numeric" min="2" max="${MAX_SQUAD}"></label>
      <label>Games today<input id="tGames" type="number" inputmode="numeric" min="1" max="8" value="4"></label>
      <label>Periods per game <span class="hint">1 = one half, 2 = halves</span><input id="tPer" type="number" inputmode="numeric" min="1" max="4" value="2"></label>
      <label>Minutes per period<input id="tMin" type="number" inputmode="decimal" min="1" max="45" step="any" value="10"></label>
      <label>Change about every <span class="hint">minutes</span><input id="tEvery" type="number" inputmode="decimal" min="1" max="45" step="any" value="5"></label>
      <div class="full"><label class="switch" id="tGkWrap"><input type="checkbox" id="tGk" checked><span id="tGkText">Goalkeeper: turns shared across the day, a whole period each</span></label></div>
      <details class="names"><summary>Add player names (optional)</summary><div>
        <textarea id="tNames" placeholder="One name per line, or separated by commas" autocomplete="off" spellcheck="false"></textarea>
        <span class="hint">Names stay in this browser and are not stored. Without names, players are numbered.</span>
      </div></details>
    </div>
    <div class="calc-out" aria-live="polite"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const el = { fmt: $('tFmt'), squad: $('tSquad'), games: $('tGames'), per: $('tPer'), min: $('tMin'), every: $('tEvery'), gk: $('tGk'), names: $('tNames') };
  const out = root.querySelector('.calc-out');
  const pre = root.dataset.format;
  el.fmt.value = pre && E.FORMATS.some((f) => f.id === pre) ? pre : 'soccer7';
  el.squad.value = SQUAD[el.fmt.value];

  const names = () => el.names.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_SQUAD);
  function num(input, lo, hi) {
    const x = Number(input.value);
    const ok = input.value.trim() !== '' && Number.isFinite(x) && x >= lo && x <= hi;
    input.classList.toggle('bad', !ok);
    return ok ? x : null;
  }
  function sync() {
    const base = E.format(el.fmt.value);
    const pos = named(base.slots);
    el.gk.disabled = pos || !base.keeper;
    $('tGkWrap').classList.toggle('dis', el.gk.disabled);
    $('tGkText').textContent = pos ? 'Positions rotate (' + base.slots.join(', ') + '), shared out across the day' : base.keeper ? 'Goalkeeper: turns shared across the day, a whole period each' : 'No goalkeeper in this format';
  }

  function grid(f, res, ps) {
    const wins = res.windows;
    const counts = Array.from({ length: f.periods }, (_, i) => wins.filter((w) => w.period === i).length);
    const gapH = '<th class="gap" aria-hidden="true"></th>';
    const h1 = counts.map((c, i) => `${i ? gapH : ''}<th colspan="${c}" class="per" scope="colgroup">${periodLabel(f.periods, i)}</th>`).join('');
    const sets = wins.map((w) => new Map(w.lineup.map((x) => [x.id, x.slot])));
    const rows = ps.map((p) => {
      const cells = wins.map((w, i) => {
        const gap = w.first && i ? '<td class="gap"></td>' : '';
        if (!sets[i].has(p.id)) return gap + '<td class="off"></td>';
        const slot = sets[i].get(p.id);
        if (f.keeper && slot === 'GK') return gap + '<td class="gk">GK</td>';
        return gap + `<td class="on">${slot ? esc(slot) : '✓'}</td>`;
      }).join('');
      return `<tr><th scope="row" class="nm">${esc(p.name)}</th>${cells}<td class="m">${fmtMin(res.minutes[p.id] || 0)}</td></tr>`;
    }).join('');
    return `<div class="rot-wrap" role="region" aria-label="Rotation grid (scrolls sideways)" tabindex="0"><table class="rot"><thead><tr><th class="nm" scope="col">Player</th>${h1}<th class="m" scope="col">Min</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function render() {
    sync();
    const squad = num(el.squad, 2, MAX_SQUAD), games = num(el.games, 1, 8), per = num(el.per, 1, 4), min = num(el.min, 1, 45), every = num(el.every, 1, 45);
    if ([squad, games, per, min, every].some((x) => x == null)) { out.innerHTML = '<p class="err">Check the highlighted numbers.</p>'; return; }
    const base = E.format(el.fmt.value);
    const f = Object.assign({}, base, { periods: Math.round(per), periodMin: min, every: base.subs === 'breaks' ? min : every });
    if (!named(base.slots) && base.keeper && !el.gk.checked) { f.keeper = false; f.slots = base.slots.map(() => ''); }
    const chk = E.checkFormat(f);
    if (chk.errors.length || E.windows(chk.format).length > 40) { out.innerHTML = '<p class="err">Those settings don\'t make a game. Check the numbers above.</p>'; return; }
    const nm = names();
    const ps = Array.from({ length: Math.round(squad) }, (_, i) => ({ id: 'p' + (i + 1), name: nm[i] || 'Player ' + (i + 1) }));
    let season = {};
    const plans = [];
    for (let g = 1; g <= games; g++) {
      const res = E.plan({ format: f, players: ps.map((p) => Object.assign({}, p, { season: season[p.id] || {} })), options: { seed: g } });
      const gkMinutes = {};
      const posCount = {};
      res.windows.forEach((w) => w.lineup.forEach((x) => {
        const d = w.end - w.start;
        if (f.keeper && x.slot === 'GK') gkMinutes[x.id] = (gkMinutes[x.id] || 0) + d;
        if (x.slot) { posCount[x.id] = posCount[x.id] || {}; posCount[x.id][x.slot] = (posCount[x.id][x.slot] || 0) + 1; }
      }));
      season = E.seasonAdd(season, { minutes: res.minutes, gkMinutes, posCount });
      plans.push(res);
    }
    const total = (id) => (season[id] ? season[id].minutes : 0);
    const vals = ps.map((p) => total(p.id));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const dayMin = games * f.periods * f.periodMin;
    const head = plans.map((_, i) => `<th scope="col">Game ${i + 1}</th>`).join('');
    const extra = f.keeper ? '<th scope="col">In goal</th>' : named(f.slots) ? '<th scope="col">Positions</th>' : '';
    const rows = ps.map((p) => {
      const s = season[p.id] || { minutes: 0, gkMinutes: 0, pos: {} };
      const ex = f.keeper ? `<td>${s.gkMinutes ? fmtMin(s.gkMinutes) + ' min' : '–'}</td>` : named(f.slots) ? `<td>${Object.keys(s.pos).sort().join(', ') || '–'}</td>` : '';
      return `<tr><th scope="row">${esc(p.name)}</th>${plans.map((r) => `<td>${fmtMin(r.minutes[p.id] || 0)}</td>`).join('')}<td class="tot">${fmtMin(s.minutes)}</td>${ex}</tr>`;
    }).join('');
    const games_html = plans.map((r, i) => `<section class="game"><h3>Game ${i + 1}</h3>${grid(f, r, ps)}</section>`).join('');
    const fname = base.name.replace(/ \(no keeper\)/, '');
    out.innerHTML = `
      <figure class="sheet">
        <figcaption class="sheet-top"><span class="sheet-what">${esc(fname)}: ${ps.length} players, ${games} games of ${f.periods} × ${fmtMin(f.periodMin)} min</span>
          <span class="scores"><span class="score"><b>${lo === hi ? fmtMin(hi) : fmtMin(lo) + '–' + fmtMin(hi)}</b>min each today</span><span class="score"><b>${fmtMin(dayMin)}</b>min of games</span></span></figcaption>
        <div class="rot-wrap" role="region" aria-label="Minutes per game (scrolls sideways)" tabindex="0"><table class="day"><caption class="vh">Minutes for each player in each game</caption><thead><tr><th scope="col">Player</th>${head}<th scope="col">Total</th>${extra}</tr></thead><tbody>${rows}</tbody></table></div>
      </figure>
      <div class="calc-bar"><p class="calc-say">Across the day, every player gets <b>${lo === hi ? fmtMin(hi) : fmtMin(lo) + ' to ' + fmtMin(hi)} minutes</b>. In each game, the players who have had less so far get the extra stint${f.keeper ? ', and keeper turns go to different players' : ''}.</p>
        <span class="acts no-print"><button type="button" class="btn btn-navy" id="tPrint">Print the day</button></span></div>
      <div class="games">${games_html}</div>
      <p class="legend"><span><i class="on">✓</i>On</span>${f.keeper ? '<span><i class="gk">GK</i>In goal</span>' : ''}<span><i class="off"></i>Bench</span>${named(f.slots) ? '<span>Letters show the position</span>' : ''}</p>
      <aside class="cta no-print" aria-label="Get the Benchwise app"><h2 class="cta-h">Run each game live on the sideline</h2>
        <p>In the Benchwise app, the game clock alerts you at every change with who comes off and who goes on, re-plans on the spot when someone arrives late, and keeps the minutes balanced across the whole season, not just one day.</p>
        <a class="btn btn-navy" href="${esc(root.dataset.applink || '/#app')}">Get the free app</a></aside>`;
    out.querySelector('#tPrint').onclick = () => window.print();
  }
  el.fmt.addEventListener('change', () => {
    const b = E.format(el.fmt.value);
    el.squad.value = names().length || SQUAD[b.id];
    el.per.value = Math.min(b.periods, 2);
    el.every.value = Math.min(b.every, 5);
    render();
  });
  root.addEventListener('input', (e) => { if (e.target !== el.fmt) render(); });
  root.addEventListener('change', (e) => { if (e.target === el.gk) render(); });
  render();
})();
