/*
 * events.js: the sky calendar (Moon phases, eclipses, meteor showers, planet events, seasons) and
 * the plan of local notifications for it. Pure (no DOM); app.js, the website and test/events.test.js use it.
 *
 * Meteor showers: peak solar longitude, ZHR and radiant from the International Meteor Organization's
 * working list of visual meteor showers (IMO Meteor Shower Calendar). The peak date of any year is
 * found from the solar longitude, so the table never goes out of date. Real rates vary from year to
 * year; the app says "up to" and explains the Moon and radiant height.
 */
(function (root, factory) {
  const S = root.Sky || (typeof require === 'function' ? require('./sky.js') : null);
  const api = factory(S);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkyEvents = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Sky) {
  'use strict';
  const A = Sky.A;
  const DAY = 864e5;

  // id, peak solar longitude (deg, J2000), ZHR, radiant RA, Dec (deg), active days before/after the peak
  const SHOWERS = [
    ['quadrantids', 283.15, 80, 230, 49, 8, 12],
    ['lyrids', 32.32, 18, 271, 34, 8, 8],
    ['etaAquariids', 45.5, 50, 338, -1, 17, 22],
    ['deltaAquariids', 127, 25, 340, -16, 18, 24],
    ['perseids', 140.0, 100, 48, 58, 26, 12],
    ['draconids', 195.4, 10, 262, 54, 2, 2],
    ['orionids', 208, 20, 95, 16, 19, 17],
    ['leonids', 235.27, 15, 152, 22, 11, 13],
    ['geminids', 262.2, 150, 112, 33, 10, 6],
    ['ursids', 270.7, 10, 217, 76, 5, 4],
  ];
  const OPPOSITION = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const CONJ_PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const MOON_CONJ_DEG = 4;    // Moon near a planet: closer than this (geocentric)
  const PLANET_CONJ_DEG = 2;  // two planets close together

  const t = (d) => A.MakeTime(d instanceof Date ? d : new Date(d));
  const sepDeg = (a, b) => Sky.angleBetween(a, b);
  const geoVec = (id, d) => { const v = A.GeoVector(Sky.ABODY[id], t(d), true); const n = Math.hypot(v.x, v.y, v.z); return [v.x / n, v.y / n, v.z / n]; };

  function moonPhases(from, to) {
    const out = [];
    let mq = A.SearchMoonQuarter(t(from));
    while (mq.time.date < to) {
      const e = { kind: 'moon', q: mq.quarter, date: mq.time.date };
      if (mq.quarter === 2) {
        const v = A.GeoMoon(mq.time);
        e.distKm = Math.hypot(v.x, v.y, v.z) * 149597870.7;
        e.supermoon = e.distKm < Sky.SUPERMOON_KM;
      }
      out.push(e);
      mq = A.NextMoonQuarter(mq);
    }
    return out;
  }

  function lunarEclipses(from, to, loc) {
    const out = [];
    let e = A.SearchLunarEclipse(t(from));
    while (e.peak.date < to) {
      const peak = e.peak.date;
      const sd = e.kind === 'penumbral' ? e.sd_penum : e.sd_partial; // semi-duration of the part people notice, minutes
      const begin = new Date(peak.getTime() - sd * 60e3), end = new Date(peak.getTime() + sd * 60e3);
      // visible if the Moon is up at some point between begin and end
      let visible = false;
      for (let k = 0; k <= 8; k++) {
        const d = new Date(begin.getTime() + ((end - begin) * k) / 8);
        if (Sky.body('moon', d, loc).alt > 0) { visible = true; break; }
      }
      out.push({ kind: 'lunarEclipse', eclipse: e.kind, date: peak, begin, end, totalMin: e.sd_total * 2, visible });
      e = A.NextLunarEclipse(e.peak);
    }
    return out;
  }

  function solarEclipses(from, to, loc) {
    const out = [];
    const obs = Sky.observer(loc);
    let e;
    try { e = A.SearchLocalSolarEclipse(t(from), obs); } catch (x) { return out; }
    while (e && e.peak.time.date < to) {
      if (e.peak.altitude > 0 || (e.partial_begin && e.partial_begin.altitude > 0) || (e.partial_end && e.partial_end.altitude > 0)) {
        out.push({ kind: 'solarEclipse', eclipse: e.kind, date: e.peak.time.date, begin: e.partial_begin.time.date, end: e.partial_end.time.date,
          obscuration: e.obscuration, peakAlt: e.peak.altitude, safety: true });
      }
      try { e = A.NextLocalSolarEclipse(e.peak.time, obs); } catch (x) { break; }
    }
    return out;
  }

  // The best hour on the peak night for a shower: radiant highest while the sky is dark (Sun below -12).
  function showerNight(peak, ra, dec, loc) {
    const from = new Date(peak.getTime() - 14 * 3600e3), to = new Date(peak.getTime() + 14 * 3600e3);
    let best = null;
    for (let d = from.getTime(); d <= to.getTime(); d += 20 * 60e3) {
      const date = new Date(d);
      const F = Sky.frame(date, loc);
      if (Sky.body('sun', date, loc, F).alt > -12) continue;
      const p = Sky.fixedPosition(ra, dec, F);
      if (!best || p.alt > best.alt) best = { date, alt: p.alt, az: p.az, F };
    }
    if (!best) return { dark: false };
    const moon = Sky.body('moon', best.date, loc, best.F);
    return { dark: true, best: best.date, radiantAlt: best.alt, moonUp: moon.alt > 0, moonIllum: moon.illum };
  }
  function meteorShowers(from, to, loc) {
    const out = [];
    for (const [id, lon, zhr, ra, dec, before, after] of SHOWERS) {
      let start = new Date(from.getTime() - 40 * DAY);
      for (;;) {
        const p = A.SearchSunLongitude(lon, t(start), 400);
        if (!p || p.date > new Date(to.getTime() + after * DAY)) break;
        const peak = p.date;
        if (peak >= new Date(from.getTime() - after * DAY)) {
          const n = showerNight(peak, ra, dec, loc);
          const rate = n.dark && n.radiantAlt > 0 ? Math.round(zhr * Math.sin(n.radiantAlt * Math.PI / 180)) : 0;
          out.push({ kind: 'meteor', shower: id, date: peak, zhr, ra, dec, activeFrom: new Date(peak.getTime() - before * DAY), activeTo: new Date(peak.getTime() + after * DAY),
            best: n.best || null, radiantAlt: n.dark ? n.radiantAlt : null, rate, moonUp: !!n.moonUp, moonIllum: n.moonIllum == null ? null : n.moonIllum,
            moonBright: !!n.moonUp && n.moonIllum > 0.5 });
        }
        start = new Date(peak.getTime() + 300 * DAY);
      }
    }
    return out.filter((e) => e.date >= from && e.date < to);
  }

  function planetEvents(from, to, loc) {
    const out = [];
    OPPOSITION.forEach((id) => {
      let d = from;
      for (;;) {
        const tm = A.SearchRelativeLongitude(Sky.ABODY[id], 0, t(d));
        if (!tm || tm.date >= to) break;
        const b = Sky.body(id, tm.date, loc);
        out.push({ kind: 'opposition', body: id, date: tm.date, mag: b.mag, con: b.con });
        d = new Date(tm.date.getTime() + 30 * DAY);
      }
    });
    ['mercury', 'venus'].forEach((id) => {
      let d = from;
      for (;;) {
        const e = A.SearchMaxElongation(Sky.ABODY[id], t(d));
        if (!e || e.time.date >= to) break;
        out.push({ kind: 'elongation', body: id, date: e.time.date, elong: e.elongation, sky: e.visibility });
        d = new Date(e.time.date.getTime() + 20 * DAY);
      }
    });
    return out;
  }

  // Close approaches: the Moon and a bright planet, and two bright planets (geocentric minimum separation).
  function conjunctions(from, to) {
    const out = [];
    const pairs = [];
    CONJ_PLANETS.forEach((p) => pairs.push(['moon', p, MOON_CONJ_DEG, 0.25]));
    for (let i = 0; i < CONJ_PLANETS.length; i++) for (let j = i + 1; j < CONJ_PLANETS.length; j++) pairs.push([CONJ_PLANETS[i], CONJ_PLANETS[j], PLANET_CONJ_DEG, 1]);
    pairs.forEach(([a, b, lim, stepDays]) => {
      const step = stepDays * DAY;
      let prev2 = null, prev = null;
      for (let d = from.getTime() - step; d <= to.getTime() + step; d += step) {
        const s = sepDeg(geoVec(a, new Date(d)), geoVec(b, new Date(d)));
        if (prev && prev2 && prev.s < prev2.s && prev.s <= s && prev.s < lim + 1) {
          // refine the minimum (golden-section-ish ternary search)
          let lo = prev.d - step, hi = prev.d + step;
          for (let k = 0; k < 30; k++) {
            const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
            const s1 = sepDeg(geoVec(a, new Date(m1)), geoVec(b, new Date(m1)));
            const s2 = sepDeg(geoVec(a, new Date(m2)), geoVec(b, new Date(m2)));
            if (s1 < s2) hi = m2; else lo = m1;
          }
          const tm = new Date((lo + hi) / 2);
          const ms = sepDeg(geoVec(a, tm), geoVec(b, tm));
          // skip close approaches next to the Sun (lost in the glare)
          const elong = Math.min(A.AngleFromSun(Sky.ABODY[b], t(tm)), a === 'moon' ? 180 : A.AngleFromSun(Sky.ABODY[a], t(tm)));
          if (ms < lim && tm >= from && tm < to && elong > 15) out.push({ kind: 'conjunction', a, b, date: tm, sep: ms });
        }
        prev2 = prev;
        prev = { d, s };
      }
    });
    return out;
  }

  function seasons(from, to) {
    const out = [];
    for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
      const s = A.Seasons(y);
      [['marchEquinox', s.mar_equinox], ['juneSolstice', s.jun_solstice], ['septemberEquinox', s.sep_equinox], ['decemberSolstice', s.dec_solstice]].forEach(([k, tm]) => {
        if (tm.date >= from && tm.date < to) out.push({ kind: 'season', which: k, date: tm.date });
      });
    }
    return out;
  }

  // Everything from `from` for `days` days at a place, sorted by date.
  function compute(from, days, loc, opts) {
    const o = opts || {};
    const f = from instanceof Date ? from : new Date(from);
    const to = new Date(f.getTime() + (days || 365) * DAY);
    let list = [];
    const want = (k) => !o.kinds || o.kinds.includes(k);
    if (want('moon')) list = list.concat(moonPhases(f, to));
    if (want('lunarEclipse')) list = list.concat(lunarEclipses(f, to, loc));
    if (want('solarEclipse')) list = list.concat(solarEclipses(f, to, loc));
    if (want('meteor')) list = list.concat(meteorShowers(f, to, loc));
    if (want('opposition') || want('elongation')) list = list.concat(planetEvents(f, to, loc).filter((e) => want(e.kind)));
    if (want('conjunction')) list = list.concat(conjunctions(f, to));
    if (want('season')) list = list.concat(seasons(f, to));
    list.sort((a, b) => a.date - b.date);
    return list;
  }

  // Which alert group an event belongs to (Settings has one switch per group).
  function group(e) {
    if (e.kind === 'moon') return e.q === 2 ? 'fullMoon' : null;
    if (e.kind === 'lunarEclipse') return e.visible ? 'eclipse' : null;
    if (e.kind === 'solarEclipse') return 'eclipse';
    if (e.kind === 'meteor') return 'meteor';
    if (e.kind === 'opposition' || e.kind === 'elongation' || e.kind === 'conjunction') return 'planet';
    return null;
  }

  // When to send each alert: a local evening time, or just before an eclipse begins.
  // Returns [{ id, at: Date, event }], nearest first, at most `max` (iOS keeps 64 pending).
  function plan(events, groups, now, tz, max) {
    const on = groups || {};
    const out = [];
    const evening = (d, h, mi) => {
      const p = Sky.partsIn(d, tz);
      return Sky.fromLocal(p.y, p.m, p.d, h, mi || 0, tz);
    };
    events.forEach((e) => {
      const g = group(e);
      if (!g || !on[g]) return;
      const key = e.kind + ':' + (e.shower || e.body || e.q || e.eclipse || '') + ':' + Math.round(e.date.getTime() / 60000);
      const add = (at, when) => { if (at > now) out.push({ key: key + ':' + when, at, event: e, when }); };
      if (e.kind === 'moon') {
        // the evening nearest the full Moon (the previous evening if it is full before noon)
        const p = Sky.partsIn(e.date, tz);
        const at = p.h >= 12 ? evening(e.date, 18, 30) : evening(new Date(e.date.getTime() - DAY), 18, 30);
        add(at, 'evening');
      } else if (e.kind === 'meteor') {
        // the evening before the best hour (or the peak)
        const ref = e.best || e.date;
        const p = Sky.partsIn(ref, tz);
        add(p.h >= 15 ? evening(ref, 20) : evening(new Date(ref.getTime() - DAY), 20), 'evening');
      } else if (e.kind === 'lunarEclipse' || e.kind === 'solarEclipse') {
        add(evening(new Date(e.begin.getTime() - DAY), 18), 'dayBefore');
        add(new Date(e.begin.getTime() - 30 * 60e3), 'soon');
      } else {
        add(evening(e.date, 19), 'evening');
      }
    });
    out.sort((a, b) => a.at - b.at);
    const seen = new Set();
    return out.filter((x) => (seen.has(x.key) ? false : seen.add(x.key))).slice(0, max || 48).map((x, i) => Object.assign(x, { id: 5000 + i }));
  }

  return { SHOWERS, compute, moonPhases, lunarEclipses, solarEclipses, meteorShowers, planetEvents, conjunctions, seasons, group, plan, MOON_CONJ_DEG, PLANET_CONJ_DEG };
});
