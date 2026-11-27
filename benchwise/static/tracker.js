/* Season playing time tracker: type the minutes each player played in each game and see who is owed
   time. A player's fair share of a game is the field time divided by the players who were there.
   Totals are added up with the Benchwise app's own season code (Engine.seasonAdd). Nothing is sent
   anywhere or stored: save the table as a CSV file to keep it, and open the file again next week. */
(function () {
  'use strict';
  const E = window.Engine;
  const root = document.getElementById('tracker');
  if (!root || !E) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
  const MAX_P = 40, MAX_G = 40;
  const st = { on: 7, players: [], games: [] }; // games: [{len, mins: {pid: number|''}}]

  root.innerHTML = `
    <div class="calc-form tr-form">
      <label>Players on the field<input id="kOn" type="number" inputmode="numeric" min="1" max="30" value="7"></label>
      <label class="wide">Squad <span class="hint">one name per line, or separated by commas</span><textarea id="kNames" autocomplete="off" spellcheck="false" placeholder="Ava&#10;Ben&#10;Chloe"></textarea></label>
      <div class="full tr-acts"><button type="button" class="btn btn-navy" id="kAdd">Add a game</button>
        <button type="button" class="btn" id="kSave">Save as CSV</button>
        <label class="btn file">Open a CSV<input type="file" id="kOpen" accept=".csv,text/csv" hidden></label>
        <button type="button" class="btn" id="kPrint">Print</button>
        <button type="button" class="btn" id="kClear">Clear</button></div>
    </div>
    <p class="hint tr-hint">For each game, type its length (all the periods together) and the minutes each player played. Leave a box empty if the player wasn't there; type 0 if they were there but didn't play.</p>
    <div class="tr-out" aria-live="polite"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const out = root.querySelector('.tr-out');

  function readPlayers() {
    const names = $('kNames').value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_P);
    const seen = {};
    st.players = names.map((n) => { let id = n; while (seen[id]) id += '*'; seen[id] = 1; return { id, name: n }; });
  }
  function fairShare(g, id) {
    const here = st.players.filter((p) => g.mins[p.id] !== '' && g.mins[p.id] != null);
    if (!here.length || g.mins[id] === '' || g.mins[id] == null) return null;
    return Math.min(g.len, (st.on * g.len) / here.length);
  }
  function totals() {
    let season = {};
    const fair = {};
    st.games.forEach((g) => {
      const minutes = {};
      st.players.forEach((p) => {
        const v = g.mins[p.id];
        if (v === '' || v == null) return;
        minutes[p.id] = v;
        fair[p.id] = (fair[p.id] || 0) + fairShare(g, p.id);
      });
      season = E.seasonAdd(season, { minutes });
    });
    return st.players.map((p) => {
      const s = season[p.id] || { minutes: 0, games: 0 };
      const f = fair[p.id] || 0;
      return { p, minutes: s.minutes, games: s.games, fair: f, diff: s.minutes - f, pct: f ? (s.minutes / f) * 100 : null };
    });
  }

  function render() {
    if (!st.players.length) {
      out.innerHTML = '<p class="note">Type your squad above, then add a game.</p>';
      return;
    }
    const t = totals();
    const head = st.games.map((g, i) => `<th scope="col" class="g"><span>Game ${i + 1}</span><label class="len">Length<input type="number" inputmode="decimal" min="1" max="200" step="any" data-len="${i}" value="${esc(g.len)}" aria-label="Game ${i + 1} length in minutes"></label><button type="button" class="x" data-del="${i}" aria-label="Remove game ${i + 1}">×</button></th>`).join('');
    const rows = t.map((r) => {
      const cells = st.games.map((g, i) => `<td><input type="number" inputmode="decimal" min="0" max="200" step="any" data-g="${i}" data-p="${esc(r.p.id)}" value="${g.mins[r.p.id] == null ? '' : esc(g.mins[r.p.id])}" aria-label="${esc(r.p.name)}, game ${i + 1}, minutes"></td>`).join('');
      const cls = r.pct == null ? '' : r.pct < 90 ? ' class="owed"' : r.pct > 110 ? ' class="over"' : '';
      return `<tr${cls}><th scope="row">${esc(r.p.name)}</th>${cells}<td class="num">${r.games}</td><td class="num">${r1(r.minutes)}</td><td class="num">${r1(r.fair)}</td><td class="num">${r.games ? (r.diff >= 0 ? '+' : '−') + r1(Math.abs(r.diff)) : '–'}</td><td class="num">${r.pct == null ? '–' : Math.round(r.pct) + '%'}</td></tr>`;
    }).join('');
    const owed = t.filter((r) => r.games && r.diff < -0.5).sort((a, b) => a.diff - b.diff).slice(0, 4);
    const say = !st.games.length ? 'Add a game to start.' : owed.length
      ? 'Owed the most time: ' + owed.map((r) => `<b>${esc(r.p.name)}</b> (${r1(-r.diff)} min)`).join(', ') + '. Start them next game.'
      : 'Everyone is within half a minute of their fair share.';
    out.innerHTML = `
      <div class="rot-wrap" role="region" aria-label="Minutes table (scrolls sideways)" tabindex="0"><table class="track">
        <caption class="vh">Minutes played in each game, with totals and each player's fair share</caption>
        <thead><tr><th scope="col">Player</th>${head}<th scope="col">Games</th><th scope="col">Played</th><th scope="col">Fair share</th><th scope="col">Difference</th><th scope="col">Of fair share</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="calc-say">${say}</p>`;
  }

  function csvCell(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV() {
    const lines = [['Player'].concat(st.games.map((g, i) => 'Game ' + (i + 1) + ' (' + g.len + ' min)')).concat(['On the field: ' + st.on])];
    st.players.forEach((p) => lines.push([p.name].concat(st.games.map((g) => (g.mins[p.id] == null ? '' : g.mins[p.id])))));
    return lines.map((l) => l.map(csvCell).join(',')).join('\n') + '\n';
  }
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }
  function load(text) {
    const rows = parseCSV(text);
    if (!rows.length) return false;
    const head = rows[0];
    const onCol = head.findIndex((h) => /On the field:\s*\d+/.test(h));
    if (onCol >= 0) st.on = +head[onCol].match(/\d+/)[0];
    const gameCols = head.map((h, i) => [h, i]).filter(([h]) => /^Game \d+/.test(h)).slice(0, MAX_G);
    st.games = gameCols.map(([h]) => ({ len: (h.match(/\(([\d.]+) min\)/) || [0, '40'])[1], mins: {} }));
    const names = rows.slice(1, MAX_P + 1).map((r) => r[0]).filter(Boolean);
    $('kNames').value = names.join('\n');
    $('kOn').value = st.on;
    readPlayers();
    rows.slice(1, MAX_P + 1).forEach((r, k) => {
      const p = st.players[k];
      if (!p) return;
      gameCols.forEach(([, col], gi) => { const v = (r[col] || '').trim(); st.games[gi].mins[p.id] = v === '' ? '' : Math.max(0, Number(v) || 0); });
    });
    return true;
  }

  $('kNames').addEventListener('input', () => {
    const old = st.players.map((p) => p.id);
    readPlayers();
    // keep minutes for names that are still there
    st.games.forEach((g) => Object.keys(g.mins).forEach((id) => { if (!st.players.some((p) => p.id === id) && old.includes(id)) delete g.mins[id]; }));
    render();
  });
  $('kOn').addEventListener('input', () => { const v = Number($('kOn').value); if (v >= 1 && v <= 30) { st.on = Math.round(v); render(); } });
  $('kAdd').addEventListener('click', () => {
    if (!st.players.length) { $('kNames').focus(); return; }
    if (st.games.length >= MAX_G) return;
    st.games.push({ len: st.games.length ? st.games[st.games.length - 1].len : '40', mins: {} });
    render();
    const first = out.querySelector(`input[data-g="${st.games.length - 1}"]`);
    if (first) first.focus();
  });
  out.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.len != null) { const v = Number(t.value); if (v > 0) st.games[+t.dataset.len].len = String(v); }
    else if (t.dataset.g != null) st.games[+t.dataset.g].mins[t.dataset.p] = t.value.trim() === '' ? '' : Math.max(0, Number(t.value) || 0);
    else return;
    // update the totals without re-drawing the box being typed in
    const pos = t.selectionStart;
    const key = t.dataset.len != null ? `[data-len="${t.dataset.len}"]` : `[data-g="${t.dataset.g}"][data-p="${CSS.escape(t.dataset.p)}"]`;
    render();
    const again = out.querySelector('input' + key);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) { /* number inputs */ } }
  });
  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (b && confirm('Remove game ' + (+b.dataset.del + 1) + '?')) { st.games.splice(+b.dataset.del, 1); render(); }
  });
  $('kSave').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([toCSV()], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'playing-time.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $('kOpen').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { if (!load(String(rd.result))) alert('That file has no table in it.'); render(); };
    rd.readAsText(f);
    e.target.value = '';
  });
  $('kPrint').addEventListener('click', () => window.print());
  $('kClear').addEventListener('click', () => { if (confirm('Clear the squad and every game?')) { $('kNames').value = ''; st.games = []; readPlayers(); render(); } });
  window.addEventListener('beforeunload', (e) => { if (st.games.length) { e.preventDefault(); e.returnValue = ''; } });
  readPlayers();
  render();
})();
