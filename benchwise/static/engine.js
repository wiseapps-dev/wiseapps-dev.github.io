/*
 * Benchwise engine: fair rotation planning, live re-planning, positions,
 * season balancing and a timestamp game clock. Pure functions, no DOM.
 * Times are game minutes (floats) from the first whistle, excluding breaks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const TOL = 1e-4; // minutes (6 ms): clock readings vs rounded window edges

  /* ------------------------------------------------------------------ */
  /* Formats                                                            */
  /* ------------------------------------------------------------------ */

  const NETBALL = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
  const field = (n, gk) => (gk ? ['GK'] : []).concat(Array.from({ length: n - (gk ? 1 : 0) }, () => ''));

  // Starting points only: leagues and age groups differ. Everything is editable.
  const FORMATS = [
    { id: 'soccer4', sport: 'soccer', name: 'Soccer 4v4 (no keeper)', slots: field(4, false), periods: 4, periodMin: 10, subs: 'rolling', every: 5 },
    { id: 'soccer7', sport: 'soccer', name: 'Soccer 7v7', slots: field(7, true), periods: 2, periodMin: 20, keeper: true, subs: 'rolling', every: 5 },
    { id: 'soccer9', sport: 'soccer', name: 'Soccer 9v9', slots: field(9, true), periods: 2, periodMin: 25, keeper: true, subs: 'rolling', every: 6 },
    { id: 'soccer11', sport: 'soccer', name: 'Soccer 11v11', slots: field(11, true), periods: 2, periodMin: 35, keeper: true, subs: 'rolling', every: 7 },
    { id: 'futsal', sport: 'futsal', name: 'Futsal 5-a-side', slots: field(5, true), periods: 2, periodMin: 20, keeper: true, subs: 'rolling', every: 4 },
    { id: 'basketball', sport: 'basketball', name: 'Basketball 5-on-5', slots: field(5, false), periods: 4, periodMin: 10, subs: 'stoppages', every: 5 },
    { id: 'netball', sport: 'netball', name: 'Netball 7-a-side', slots: NETBALL.slice(), periods: 4, periodMin: 10, subs: 'breaks', every: 10 },
    { id: 'hockey7', sport: 'hockey', name: 'Hockey 7-a-side', slots: field(7, true), periods: 2, periodMin: 20, keeper: true, subs: 'rolling', every: 5 },
    { id: 'hockey11', sport: 'hockey', name: 'Hockey 11-a-side', slots: field(11, true), periods: 4, periodMin: 15, keeper: true, subs: 'rolling', every: 5 },
    // Junior handball (a starting point like the others; check your league):
    // 7 on court including the keeper, flying substitutions
    // (IHF rule 4:4, "at any time and repeatedly"). Halves per IHF Rules of the
    // Game rule 2:1: youth teams play 2 x 20 min at ages 8-12 and 2 x 25 min at
    // 12-16. The Swedish federation's Handbollens spelregler 2024 (kap. 2,
    // regel 2:1) uses the same times and notes district series and cups vary.
    // https://www.ihf.info/sites/default/files/2022-03/09A%20-%20Rules%20of%20the%20Game_Indoor%20Handball_E.pdf
    // https://svenskhandboll.se/download/18.1c4cb9c21903ed5c182ed57a/1719834962294/Handbollens_Spelregler_2024__kap_2.pdf
    { id: 'handball', sport: 'handball', name: 'Handball 7-a-side', slots: field(7, true), periods: 2, periodMin: 20, keeper: true, subs: 'rolling', every: 5 },
    { id: 'footy', sport: 'footy', name: 'Junior footy (Aussie rules)', slots: field(12, false), periods: 4, periodMin: 12, subs: 'rolling', every: 6 },
    { id: 'custom', sport: 'custom', name: 'Custom', slots: field(6, false), periods: 2, periodMin: 20, subs: 'rolling', every: 5 },
  ];

  function format(id) {
    const f = FORMATS.find((x) => x.id === id) || FORMATS[FORMATS.length - 1];
    return JSON.parse(JSON.stringify(f));
  }

  // Validate and tidy a format object; returns {format, errors}.
  function checkFormat(f) {
    const errors = [];
    const out = Object.assign({}, f);
    out.slots = Array.isArray(f.slots) ? f.slots.map((s) => String(s || '').trim().toUpperCase()) : [];
    out.periods = Math.round(Number(f.periods));
    out.periodMin = Number(f.periodMin);
    out.every = Number(f.every);
    if (!out.slots.length || out.slots.length > 30) errors.push('players-on');
    if (!(out.periods >= 1 && out.periods <= 8)) errors.push('periods');
    if (!(out.periodMin > 0 && out.periodMin <= 90)) errors.push('period-length');
    if (!['rolling', 'stoppages', 'breaks'].includes(out.subs)) out.subs = 'rolling';
    if (out.subs !== 'breaks' && !(out.every > 0)) errors.push('change-every');
    out.keeper = !!f.keeper;
    if (out.keeper && !out.slots.includes('GK')) out.slots[0] = 'GK';
    if (out.keeper && out.slots.filter((s) => s === 'GK').length > 1) errors.push('two-keepers');
    return { format: out, errors };
  }

  // Equal windows inside each period. Breaks-only subs: one window per period.
  function windows(f) {
    const out = [];
    for (let p = 0; p < f.periods; p++) {
      const n = f.subs === 'breaks' ? 1 : Math.max(1, Math.round(f.periodMin / f.every));
      const len = f.periodMin / n;
      for (let k = 0; k < n; k++) {
        out.push({ period: p, index: out.length, start: p * f.periodMin + k * len, end: p * f.periodMin + (k + 1) * len, first: k === 0 });
      }
    }
    // tidy floating error so the last window ends exactly on time
    out.forEach((w) => { w.start = round6(w.start); w.end = round6(w.end); });
    return out;
  }
  const round6 = (x) => Math.round(x * 1e6) / 1e6;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // Min-cost assignment of rows to columns (rows <= cols). Hungarian algorithm.
  function assign(cost) {
    const n = cost.length;
    if (!n) return [];
    const m = cost[0].length;
    const INF = 1e18;
    const u = new Array(n + 1).fill(0);
    const v = new Array(m + 1).fill(0);
    const p = new Array(m + 1).fill(0);
    const way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(m + 1).fill(INF);
      const used = new Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF;
        let j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Planning                                                           */
  /* ------------------------------------------------------------------ */

  /*
   * plan(input) -> {windows, minutes, events, warnings, gkByPeriod}
   *
   * input.format     a format (see FORMATS)
   * input.players    [{id, name, here (default true), arrive (min, default 0),
   *                    leave (min, default none), gk (bool, may keep goal),
   *                    positions ([] = any), lock (slot label: always on there),
   *                    season: {minutes, games, gkMinutes, pos: {GS: n}}}]
   * input.options    {gk: 'rotate'|'fixed'|'none', gkPlayer, gkEach: 'period'|'game',
   *                   seed, starters: [ids]}
   * input.from       live re-plan: {t, played: {id: min}, gkPlayed: {id: min},
   *                   posCount: {id: {slot: n}}, lineup: [{id, slot}], gk: id}
   */
  function plan(input) {
    const { format: f, errors } = checkFormat(input.format || {});
    const warnings = errors.slice();
    const opts = Object.assign({ gk: 'rotate', gkEach: 'period', seed: 1 }, input.options || {});
    const from = input.from || null;
    const S = f.slots.length;
    const hasGK = f.keeper;
    const gameEnd = f.periods * f.periodMin;
    if (errors.length) return { windows: [], minutes: {}, events: [], warnings, gkByPeriod: [], format: f };

    const slotSet = new Set(f.slots);
    const seen = new Set();
    const players = [];
    (input.players || []).forEach((p) => {
      if (!p || p.id == null || p.here === false) return;
      const id = String(p.id);
      if (seen.has(id)) { warnings.push('duplicate-id:' + id); return; }
      seen.add(id);
      const arrive = Number.isFinite(Number(p.arrive)) ? Math.max(0, Number(p.arrive)) : 0;
      let leave = Infinity;
      if (p.leave != null && String(p.leave).trim() !== '') {
        const n = Number(p.leave);
        if (!Number.isFinite(n)) warnings.push('bad-leave:' + id);
        else {
          if (n < arrive) warnings.push('leave-before-arrive:' + id);
          leave = n;
        }
      }
      let positions = Array.isArray(p.positions) ? p.positions.map((x) => String(x).trim().toUpperCase()).filter(Boolean) : [];
      // positions that aren't on this format's field: the coach is warned
      if (positions.length && !positions.some((x) => slotSet.has(x))) warnings.push('positions-unknown:' + id);
      players.push({
        id,
        name: p.name || id,
        arrive,
        leave,
        gk: !(p.gk === false || p.gk === 0 || /^(false|no|0)$/i.test(String(p.gk))),
        positions,
        lock: p.lock ? String(p.lock).trim().toUpperCase() : '',
        season: p.season || {},
      });
    });
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));

    let wins = windows(f);
    let startT = from ? Number(from.t) : 0;
    if (!Number.isFinite(startT) || startT < 0) startT = 0;
    // snap to a window edge when within a fraction of a second (13-min periods etc.)
    wins.forEach((w) => { if (Math.abs(w.start - startT) <= TOL) startT = w.start; });
    // windows still to plan (a window already started is planned from now on)
    wins = wins.filter((w) => w.end > startT + TOL).map((w) => (w.start < startT - TOL ? Object.assign({}, w, { start: round6(startT), partial: true }) : w));

    const avail = (p, w) => p.arrive <= w.start + TOL && p.leave >= w.end - TOL;

    // locks: a player locked to a slot plays there whenever available
    const lockBySlot = {};
    players.forEach((p) => {
      if (!p.lock) return;
      if (!f.slots.includes(p.lock)) { warnings.push('lock-slot-missing:' + p.id); p.lock = ''; return; }
      const taken = f.slots.filter((s) => s === p.lock).length;
      lockBySlot[p.lock] = lockBySlot[p.lock] || [];
      if (lockBySlot[p.lock].length >= taken) { warnings.push('lock-clash:' + p.id); p.lock = ''; return; }
      lockBySlot[p.lock].push(p.id);
    });
    const gkp = opts.gkPlayer == null || opts.gkPlayer === '' ? null : String(opts.gkPlayer);
    if (hasGK && opts.gk === 'fixed' && gkp && byId[gkp] && !byId[gkp].lock && !lockBySlot.GK) {
      byId[gkp].lock = 'GK';
      lockBySlot.GK = [gkp];
    }

    const played = {};
    const gkPlayed = {};
    const posCount = {};
    players.forEach((p) => {
      played[p.id] = Math.max(0, Number(from && from.played && from.played[p.id]) || 0);
      gkPlayed[p.id] = Math.max(0, Number(from && from.gkPlayed && from.gkPlayed[p.id]) || 0);
      posCount[p.id] = Object.assign({}, (from && from.posCount && from.posCount[p.id]) || {});
    });

    // Fair share accrues only while a player is available and in the pool.
    // A live re-plan rebuilds each player's fair share of the minutes played
    // so far from how long they have been here, so anyone shortchanged by
    // changes on the day is owed time, but a late arrival is not owed the
    // time before they turned up (unless options.late is 'catchup').
    const catchup = opts.late === 'catchup';
    const share = {};
    players.forEach((p) => { share[p.id] = played[p.id]; });
    if (from) {
      const pool = players.filter((p) => !p.lock && p.leave > startT + EPS);
      const total = pool.reduce((a, p) => a + played[p.id], 0);
      const dur = (p) => (catchup ? startT : Math.max(0, startT - p.arrive));
      const sumD = pool.reduce((a, p) => a + dur(p), 0);
      pool.forEach((p) => { share[p.id] = sumD > 0 ? (total * dur(p)) / sumD : played[p.id]; });
    }

    const seasonAvg = (p) => {
      const g = Number(p.season.games) || 0;
      return g ? (Number(p.season.minutes) || 0) / g : null;
    };
    const avgs = players.map(seasonAvg).filter((x) => x != null);
    const teamAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
    const seasonBehind = (p) => { const a = seasonAvg(p); return a == null ? 0 : teamAvg - a; };
    const tie = (p) => hash(opts.seed + '|' + p.id) / 4294967296;

    // Keepers for every period up front, so the planner knows who will be
    // in goal later and doesn't also give them extra field time now.
    const gkByPeriod = [];
    const keeperAt = {};
    const gkProj = Object.assign({}, gkPlayed);
    const lenOf = (w) => w.end - w.start;
    const canKeep = (p) => p.gk && (p.positions.length === 0 || p.positions.includes('GK'));
    const keeperOnly = (p) => p.positions.length > 0 && p.positions.every((x) => x === 'GK');
    function pickKeeper(w, rest, last, first) {
      if (!hasGK) return null;
      if (lockBySlot.GK && lockBySlot.GK.length) {
        const id = lockBySlot.GK[0];
        if (avail(byId[id], w)) return id;
      }
      if (opts.gk === 'none') return null;
      // the keeper in goal now stays for the rest of the period they started
      // at the start of a period they stay only if they haven't just had a full turn
      if (first && from && from.gk && byId[from.gk] && avail(byId[from.gk], w) && canKeep(byId[from.gk]) &&
        (w.partial || !w.first || gkPlayed[from.gk] < f.periodMin / 2)) return from.gk;
      if (opts.gkEach === 'game' && last && byId[last] && avail(byId[last], w) && canKeep(byId[last])) return last;
      let cands = players.filter((p) => !p.lock && avail(p, w) && canKeep(p));
      if (!cands.length) {
        // nobody ticked as a keeper: someone still has to go in goal
        warnings.push('no-keeper');
        cands = players.filter((p) => !p.lock && avail(p, w) && (p.positions.length === 0 || p.positions.includes('GK')));
        if (!cands.length) cands = players.filter((p) => !p.lock && avail(p, w));
        if (!cands.length) return null;
      }
      const full = (p) => rest.every((x) => avail(p, x));
      cands.sort((a, b) =>
        full(b) - full(a) ||
        keeperOnly(b) - keeperOnly(a) ||
        (a.id === last) - (b.id === last) ||
        gkProj[a.id] - gkProj[b.id] ||
        (Number(a.season.gkMinutes) || 0) - (Number(b.season.gkMinutes) || 0) ||
        tie(a) - tie(b));
      return cands[0].id;
    }
    {
      let last = from && from.gk ? String(from.gk) : null;
      const periods = Array.from(new Set(wins.map((w) => w.period)));
      periods.forEach((P, pi) => {
        const pw = wins.filter((w) => w.period === P);
        let k = null;
        pw.forEach((w, j) => {
          if (k && !avail(byId[k], w)) k = null;
          if (!k) k = pickKeeper(w, pw.slice(j), last, pi === 0 && j === 0);
          keeperAt[w.index] = k;
          if (k) gkProj[k] += lenOf(w);
        });
        gkByPeriod[P] = keeperAt[pw[0].index];
        last = k || last;
      });
    }

    // Each player's fair total for the game: the pool's field time shared
    // among whoever is here, window by window.
    const target = Object.assign({}, share);
    wins.forEach((w) => {
      const present = players.filter((p) => avail(p, w));
      const pool = present.filter((p) => !p.lock);
      const poolSlots = Math.max(0, S - present.filter((p) => p.lock).length);
      const accrue = catchup ? players.filter((p) => !p.lock && p.leave >= w.end - EPS) : pool;
      if (accrue.length) accrue.forEach((p) => { target[p.id] += (lenOf(w) * Math.min(poolSlots, pool.length)) / accrue.length; });
    });
    // Season balance: whoever is behind on average minutes gets the odd
    // extra window. Kept under half a window so a game stays fair on its own.
    const behind = players.filter((p) => !p.lock).map((p) => seasonBehind(p));
    const maxBehind = Math.max(0, ...behind.map(Math.abs));
    if (maxBehind > 0 && wins.length) {
      const typical = lenOf(wins[wins.length - 1]);
      const pool = players.filter((p) => !p.lock);
      const raw = pool.map((p) => (seasonBehind(p) / maxBehind) * 0.45 * typical);
      const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
      pool.forEach((p, i) => { target[p.id] += raw[i] - mean; });
    }

    const forcedRem = {};
    const availRem = {};
    players.forEach((p) => { forcedRem[p.id] = 0; availRem[p.id] = 0; });
    wins.forEach((w) => {
      const k = keeperAt[w.index];
      if (k) forcedRem[k] += lenOf(w);
      players.forEach((p) => { if (!p.lock && p.id !== k && avail(p, w)) availRem[p.id] += lenOf(w); });
    });

    const outWins = [];
    let prevLineup = from && from.lineup ? from.lineup.map((x) => ({ id: String(x.id), slot: String(x.slot || '').toUpperCase() })) : null;

    for (const w of wins) {
      const len = lenOf(w);
      const keeper = keeperAt[w.index];
      const present = players.filter((p) => avail(p, w));
      const forced = [];
      players.forEach((p) => { if (p.lock && avail(p, w)) forced.push(p.id); });
      if (keeper && !forced.includes(keeper)) forced.push(keeper);

      let chosen = forced.slice();
      // on a live re-plan the window already under way keeps who is on
      if (w.partial && prevLineup) {
        prevLineup.forEach((x) => { if (byId[x.id] && avail(byId[x.id], w) && !chosen.includes(x.id) && chosen.length < S) chosen.push(x.id); });
      } else if (outWins.length === 0 && !from && Array.isArray(opts.starters) && opts.starters.length) {
        opts.starters.map(String).forEach((id) => { if (byId[id] && avail(byId[id], w) && !chosen.includes(id) && chosen.length < S) chosen.push(id); });
      }
      const prevOn = new Set((prevLineup || []).map((x) => x.id));
      // urgency: field time still owed over field time still possible
      const urgency = (p) => (target[p.id] - played[p.id] - forcedRem[p.id]) / Math.max(availRem[p.id], EPS);
      const rest = present
        .filter((p) => !chosen.includes(p.id))
        .sort((a, b) => {
          const ua = urgency(a);
          const ub = urgency(b);
          if (Math.abs(ua - ub) > 1e-6) return ub - ua;
          if (prevOn.has(a.id) !== prevOn.has(b.id)) return prevOn.has(a.id) ? -1 : 1;
          return tie(a) - tie(b);
        });
      // add the most urgent players whose positions still fit the free slots
      const skipped = [];
      for (const p of rest) {
        if (chosen.length >= S) break;
        if (fits(f, chosen.concat(p.id), keeper, byId)) chosen.push(p.id);
        else skipped.push(p.id);
      }
      for (const id of skipped) { if (chosen.length >= S) break; chosen.push(id); }
      if (chosen.length < S) warnings.push('short:' + w.index);

      const lineup = placeSlots(f, chosen, keeper, byId, posCount, prevLineup, w, warnings);
      lineup.forEach((x) => {
        played[x.id] += len;
        if (hasGK && x.slot === 'GK') gkPlayed[x.id] += len;
        if (x.slot) posCount[x.id][x.slot] = (posCount[x.id][x.slot] || 0) + 1;
      });
      if (keeper) forcedRem[keeper] -= len;
      players.forEach((p) => { if (!p.lock && p.id !== keeper && avail(p, w)) availRem[p.id] -= len; });
      const bench = present.map((p) => p.id).filter((id) => !chosen.includes(id));
      outWins.push({ index: w.index, period: w.period, start: w.start, end: w.end, first: !!w.first, partial: !!w.partial, lineup, bench });
      prevLineup = lineup;
    }

    const minutes = {};
    players.forEach((p) => { minutes[p.id] = round6(played[p.id]); });
    const gkMinutes = {};
    players.forEach((p) => { gkMinutes[p.id] = round6(gkPlayed[p.id]); });
    const events = changes(outWins, from && from.lineup ? from.lineup : null, f);
    return { format: f, windows: outWins, minutes, gkMinutes, posCount, events, warnings: Array.from(new Set(warnings)), gkByPeriod, gameEnd };
  }

  // Can these players all be given a slot they're allowed to play?
  // (Bipartite matching on the slots left after locks and the keeper.)
  function fits(f, ids, keeper, byId) {
    const slots = f.slots.slice();
    const freeIdx = slots.map((s, i) => i);
    const takeLabel = (label) => {
      const k = freeIdx.findIndex((i) => slots[i] === label);
      if (k < 0) return false;
      freeIdx.splice(k, 1);
      return true;
    };
    const rest = [];
    ids.forEach((id) => {
      const p = byId[id];
      if (p.lock && takeLabel(p.lock)) return;
      if (f.keeper && id === keeper && takeLabel('GK')) return;
      rest.push(id);
    });
    const ok = (id, label) => {
      const p = byId[id];
      if (f.keeper && label === 'GK') return p.gk && (p.positions.length === 0 || p.positions.includes('GK'));
      if (!label) return true;
      return p.positions.length === 0 || p.positions.includes(label);
    };
    const match = {};
    const tryAssign = (id, seen) => {
      for (const i of freeIdx) {
        if (seen.has(i) || !ok(id, slots[i])) continue;
        seen.add(i);
        if (match[i] == null || tryAssign(match[i], seen)) { match[i] = id; return true; }
      }
      return false;
    };
    return rest.every((id) => tryAssign(id, new Set()));
  }

  // Put chosen players into slots. Keeper and locks first, then positions
  // with variety (fewest times in that position) and no needless shuffling.
  function placeSlots(f, chosen, keeper, byId, posCount, prevLineup, w, warnings) {
    const slots = f.slots.slice();
    const free = slots.map((s, i) => i);
    const out = new Array(slots.length).fill(null);
    const take = (id, label) => {
      const k = free.find((i) => slots[i] === label);
      if (k == null) return false;
      out[k] = id;
      free.splice(free.indexOf(k), 1);
      return true;
    };
    const placed = new Set();
    chosen.forEach((id) => { const p = byId[id]; if (p.lock && take(id, p.lock)) placed.add(id); });
    if (f.keeper && keeper && chosen.includes(keeper) && !placed.has(keeper) && take(keeper, 'GK')) placed.add(keeper);
    const restIds = chosen.filter((id) => !placed.has(id));
    const named = free.some((i) => slots[i] !== '' && !(f.keeper && slots[i] === 'GK'));
    if (!named) {
      // generic slots (and the GK slot only if no keeper was chosen)
      const order = free.filter((i) => slots[i] === '').concat(free.filter((i) => slots[i] !== ''));
      restIds.forEach((id, j) => { if (order[j] != null) out[order[j]] = id; });
    } else {
      const prevSlot = {};
      (prevLineup || []).forEach((x) => { prevSlot[x.id] = x.slot; });
      const keepPosition = !w.first || w.partial;
      const cost = restIds.map((id) => {
        const p = byId[id];
        return free.map((i) => {
          const label = slots[i];
          if (label && p.positions.length && !p.positions.includes(label)) return 1e7;
          if (f.keeper && label === 'GK' && !p.gk) return 1e7;
          let c = label ? (posCount[id][label] || 0) * 100 : 0;
          if (keepPosition && prevSlot[id] === label) c -= 1000;
          c += hash(id + '|' + label + '|' + w.period) % 7;
          return c;
        });
      });
      const res = assign(cost);
      res.forEach((col, r) => {
        if (col < 0) return;
        if (cost[r][col] >= 1e7) warnings.push('position-forced:' + restIds[r]);
        out[free[col]] = restIds[r];
      });
    }
    return out.map((id, i) => (id == null ? null : { id, slot: slots[i] })).filter(Boolean);
  }

  // Sub events between consecutive windows: who comes off, who goes on, who moves.
  function changes(wins, startLineup, f) {
    const ev = [];
    let prev = startLineup ? startLineup.map((x) => ({ id: String(x.id), slot: String(x.slot || '').toUpperCase() })) : null;
    wins.forEach((w, i) => {
      if (prev && !(w.partial && i === 0)) {
        const was = new Map(prev.map((x) => [x.id, x.slot]));
        const now = new Map(w.lineup.map((x) => [x.id, x.slot]));
        const off = prev.filter((x) => !now.has(x.id)).map((x) => ({ id: x.id, slot: x.slot }));
        const on = w.lineup.filter((x) => !was.has(x.id)).map((x) => ({ id: x.id, slot: x.slot }));
        const moves = w.lineup.filter((x) => was.has(x.id) && was.get(x.id) !== x.slot && (x.slot || was.get(x.id))).map((x) => ({ id: x.id, from: was.get(x.id), to: x.slot }));
        if (off.length || on.length || moves.length) {
          ev.push({ t: w.start, period: w.period, atBreak: w.first, off, on, moves });
        }
      }
      prev = w.lineup;
    });
    return ev;
  }

  // Fairness report for tests and the UI.
  function spread(result, ids) {
    const vals = (ids || Object.keys(result.minutes)).map((id) => result.minutes[id]);
    if (!vals.length) return 0;
    return round6(Math.max(...vals) - Math.min(...vals));
  }

  /* ------------------------------------------------------------------ */
  /* Live changes                                                       */
  /* ------------------------------------------------------------------ */

  /*
   * replan(input, live) -> plan from live.t onwards, plus `immediate`
   * live: {t, played, gkPlayed, posCount, lineup}
   * The players list carries the change: set here/arrive for a late arrival,
   * leave: t for an injury. Anyone leaving before the current stint ends comes
   * off now. `immediate` lists exactly the changes to make now, in an order
   * that can be applied one by one: {off, on, slot} (off or on may be null).
   */
  function replan(input, live) {
    const { format: f } = checkFormat(input.format || {});
    const gameEnd = f.periods * f.periodMin;
    let t = Number(live.t);
    if (!Number.isFinite(t) || t < 0) t = 0;
    const old = dedupeLineup(live.lineup);
    if (t >= gameEnd - TOL) {
      const r = plan(Object.assign({}, input, { from: { t: gameEnd, played: live.played, gkPlayed: live.gkPlayed, lineup: old } }));
      r.windows = [];
      r.events = [];
      r.immediate = [];
      return r;
    }
    const players = input.players || [];
    const byId = Object.fromEntries(players.map((p) => [String(p.id), p]));
    const cur = windows(f).find((w) => w.start <= t + TOL && w.end > t + TOL);
    const curEnd = cur ? cur.end : gameEnd;
    const gone = (p) => {
      if (!p || p.here === false) return true;
      if (p.leave == null || String(p.leave).trim() === '') return false;
      const n = Number(p.leave);
      return Number.isFinite(n) && n < curEnd - TOL;
    };
    const keep = old.filter((x) => !gone(byId[x.id]));
    const keeperFmt = !!f.keeper;
    const gk = keeperFmt ? (keep.find((x) => x.slot === 'GK') || {}).id || null : null;
    const res = plan(Object.assign({}, input, { from: { t, played: live.played, gkPlayed: live.gkPlayed, posCount: live.posCount, lineup: keep, gk } }));
    const first = res.windows[0];
    res.immediate = first && first.start <= t + TOL ? swaps(old, first.lineup) : [];
    return res;
  }

  function dedupeLineup(lineup) {
    const seen = new Set();
    return (lineup || []).map((x) => ({ id: String(x.id), slot: String(x.slot || '').trim().toUpperCase() })).filter((x) => !seen.has(x.id) && seen.add(x.id));
  }

  // Changes that turn lineup a into lineup b, ordered so each one can be
  // applied in turn: someone moving spot is moved off their old spot first.
  function swaps(a, b) {
    const A = dedupeLineup(a);
    const B = dedupeLineup(b);
    const key = (x) => x.id + '@' + x.slot;
    const aSet = new Set(A.map(key));
    const bSet = new Set(B.map(key));
    const leaving = A.filter((x) => !bSet.has(key(x)));
    const arriving = B.filter((x) => !aSet.has(key(x)));
    const pairs = [];
    const left = leaving.slice();
    arriving.forEach((x) => {
      let k = left.findIndex((y) => y.slot === x.slot);
      const off = k >= 0 ? left.splice(k, 1)[0] : null;
      pairs.push({ off: off ? off.id : null, on: x.id, slot: x.slot });
    });
    left.forEach((y) => pairs.push({ off: y.id, on: null, slot: y.slot }));
    // a player who is "on" somewhere must first be taken off their old spot
    const out = [];
    const done = new Set();
    let guard = 0;
    while (out.length < pairs.length && guard++ < pairs.length * pairs.length + 5) {
      let progressed = false;
      pairs.forEach((p, i) => {
        if (done.has(i)) return;
        const blocker = p.on && pairs.findIndex((q, j) => !done.has(j) && j !== i && q.off === p.on);
        if (blocker != null && blocker !== false && blocker >= 0) return;
        out.push(p);
        done.add(i);
        progressed = true;
      });
      if (!progressed) {
        const i = pairs.findIndex((p, j) => !done.has(j));
        out.push(pairs[i]);
        done.add(i);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Game clock (timestamps, survives the app sleeping)                 */
  /* ------------------------------------------------------------------ */

  function clockNew() { return { period: 0, acc: 0, since: null }; }
  function clockStart(c, now) { if (c.since != null) return c; return Object.assign({}, c, { since: now }); }
  function clockPause(c, now) { if (c.since == null) return c; return Object.assign({}, c, { acc: c.acc + Math.max(0, now - c.since), since: null }); }
  function clockRunning(c) { return c.since != null; }
  // seconds into the current period
  function clockSec(c, now) { return (c.acc + (c.since != null ? Math.max(0, now - c.since) : 0)) / 1000; }
  function clockNextPeriod(c) { return { period: c.period + 1, acc: 0, since: null }; }
  // game minute (for the plan) from the clock
  function gameMinute(f, c, now) {
    return Math.min(c.period * f.periodMin + Math.min(clockSec(c, now) / 60, f.periodMin), f.periods * f.periodMin);
  }
  // Adjust the clock by +/- seconds (coach fixes a late start).
  function clockAdjust(c, sec, now) {
    sec = Number(sec) || 0;
    const cur = clockSec(c, now) * 1000;
    const target = Math.max(0, cur + sec * 1000);
    return c.since != null ? { period: c.period, acc: target, since: now } : { period: c.period, acc: target, since: null };
  }

  // What is next: the next planned change after `t`, and period status.
  function upcoming(result, f, t) {
    const periodEnd = (Math.floor(t / f.periodMin + EPS) + 1) * f.periodMin;
    const next = result.events.find((e) => e.t > t + EPS) || null;
    const periodIdx = Math.min(f.periods - 1, Math.floor(t / f.periodMin + EPS));
    return { next, periodEnd: Math.min(periodEnd, f.periods * f.periodMin), period: periodIdx, over: t >= f.periods * f.periodMin - EPS };
  }

  // Track actual minutes from what really happened (for live re-plans).
  // log: [{t, lineup}] snapshots in time order; until: game minute.
  function actualMinutes(log, until, keeper) {
    const played = {};
    const gkPlayed = {};
    for (let i = 0; i < log.length; i++) {
      const a = log[i];
      const b = Math.min(i + 1 < log.length ? log[i + 1].t : until, until);
      const d = Math.max(0, b - a.t);
      a.lineup.forEach((x) => {
        played[x.id] = (played[x.id] || 0) + d;
        if (keeper && x.slot === 'GK') gkPlayed[x.id] = (gkPlayed[x.id] || 0) + d;
      });
    }
    Object.keys(played).forEach((k) => { played[k] = round6(played[k]); });
    Object.keys(gkPlayed).forEach((k) => { gkPlayed[k] = round6(gkPlayed[k]); });
    return { played, gkPlayed };
  }

  /* ------------------------------------------------------------------ */
  /* Season                                                             */
  /* ------------------------------------------------------------------ */

  // Add one game's minutes into the season table.
  function seasonAdd(season, game) {
    const s = JSON.parse(JSON.stringify(season || {}));
    Object.keys(game.minutes || {}).forEach((id) => {
      const r = s[id] || (s[id] = { minutes: 0, games: 0, gkMinutes: 0, pos: {} });
      r.minutes = round6(r.minutes + (game.minutes[id] || 0));
      r.games += 1;
      r.gkMinutes = round6(r.gkMinutes + ((game.gkMinutes && game.gkMinutes[id]) || 0));
      const pc = (game.posCount && game.posCount[id]) || {};
      Object.keys(pc).forEach((k) => { if (k) r.pos[k] = (r.pos[k] || 0) + pc[k]; });
    });
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Formatting                                                         */
  /* ------------------------------------------------------------------ */

  function mmss(min) {
    const x = Number(min) || 0;
    if (x < 0) return '-' + mmss(-x);
    const total = Math.round(x * 60);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // "Q2 5:00" style label for a game minute.
  function when(f, t) {
    const p = Math.min(f.periods - 1, Math.floor(t / f.periodMin + EPS));
    const inP = t - p * f.periodMin;
    const label = f.periods === 4 ? 'Q' + (p + 1) : f.periods === 2 ? (p === 0 ? '1st half' : '2nd half') : 'P' + (p + 1);
    return { period: p, label, clock: mmss(inP) };
  }

  function summaryText(title, players, minutes, f) {
    const total = f.periods * f.periodMin;
    const rows = players
      .filter((p) => minutes[p.id] != null)
      .map((p) => ({ name: p.name || String(p.id), m: minutes[p.id] }))
      .sort((a, b) => Math.round(b.m * 60) - Math.round(a.m * 60) || a.name.localeCompare(b.name));
    const lines = rows.map((r) => `${r.name}: ${mmss(r.m)} (${Math.round((r.m / total) * 100)}%)`);
    return (title ? title + '\n' : '') + lines.join('\n');
  }

  return {
    FORMATS,
    NETBALL,
    format,
    checkFormat,
    windows,
    plan,
    replan,
    spread,
    assign,
    clockNew,
    clockStart,
    clockPause,
    clockRunning,
    clockSec,
    clockNextPeriod,
    clockAdjust,
    gameMinute,
    upcoming,
    actualMinutes,
    seasonAdd,
    mmss,
    when,
    summaryText,
  };
});
