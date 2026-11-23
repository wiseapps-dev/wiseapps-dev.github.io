/*
 * sky.js: positions, rise and set, the Moon, twilight, tonight's planets and search. Pure (no DOM),
 * shared by app.js, the website's tools and the tests.
 *
 * Sun, Moon and planets come from Astronomy Engine (MIT, Don Cross): VSOP87/ELP-based models checked
 * against JPL Horizons to about an arcminute. test/accuracy.test.js compares this module with JPL
 * Horizons (positions) and with JPL Horizons and USNO tables (rise and set times).
 *
 * Stars are the Bright Star Catalogue (www/data/stars.js) moved by proper motion to the date and then
 * through Astronomy Engine's precession, nutation and Earth-rotation matrix (Rotation_EQJ_HOR).
 *
 * Coordinates handed to the renderer are local ENU unit vectors: x = east, y = north, z = up.
 * Azimuth is degrees clockwise from true north; altitude includes standard refraction unless a
 * name says "Geo" (airless), which is what the ephemeris comparisons use.
 */
(function (root, factory) {
  const A = root.Astronomy || (typeof require === 'function' ? require('astronomy-engine') : null);
  const api = factory(A, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sky = api;
})(typeof window !== 'undefined' ? window : globalThis, function (A, root) {
  'use strict';
  const D = Math.PI / 180;
  const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const NAKED_EYE = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const ABODY = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' };
  const RADIUS_KM = { sun: 695700, moon: 1737.4, mercury: 2439.7, venus: 6051.8, mars: 3389.5, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622 };
  const AU_KM = 149597870.7;
  const SIDEREAL = 1.00273790935;
  const J2000 = Date.UTC(2000, 0, 1, 12);

  const wrap360 = (a) => ((a % 360) + 360) % 360;
  const wrap180 = (a) => ((a + 540) % 360) - 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const toDate = (t) => (t instanceof Date ? t : t && t.date ? t.date : new Date(t));
  const atime = (d) => A.MakeTime(toDate(d));

  /* ---------------- time zones (Intl, offline) ---------------- */
  const fmtCache = {};
  function partsIn(date, tz) {
    const key = tz || '';
    if (!fmtCache[key]) {
      fmtCache[key] = new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    }
    const p = {};
    fmtCache[key].formatToParts(toDate(date)).forEach((x) => { if (x.type !== 'literal') p[x.type] = +x.value; });
    if (p.hour === 24) p.hour = 0;
    return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
  }
  // Minutes east of UTC in a time zone at an instant.
  function tzOffset(date, tz) {
    const d = toDate(date);
    const p = partsIn(d, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  }
  // The instant of local midnight starting the local day that contains `date` (DST safe).
  function dayStart(date, tz, addDays) {
    const p = partsIn(date, tz);
    const base = Date.UTC(p.y, p.m - 1, p.d + (addDays || 0));
    let t = base - tzOffset(new Date(base), tz) * 60000;
    t = base - tzOffset(new Date(t), tz) * 60000;
    return new Date(t);
  }
  // A Date for a local wall-clock time in a zone.
  function fromLocal(y, m, d, h, mi, tz) {
    const base = Date.UTC(y, m - 1, d, h || 0, mi || 0);
    let t = base - tzOffset(new Date(base), tz) * 60000;
    t = base - tzOffset(new Date(t), tz) * 60000;
    return new Date(t);
  }

  /* ---------------- observer and frame ---------------- */
  const observer = (loc) => new A.Observer(loc.lat, loc.lon, loc.elev || 0);

  // EQJ (J2000 equator) -> local ENU matrix (row-major, 3x3) for an instant and place.
  function frame(date, loc) {
    const d = toDate(date);
    const t = A.MakeTime(d);
    const obs = observer(loc);
    const r = A.Rotation_EQJ_HOR(t, obs).rot; // RotateVector convention: out_i = sum_j r[j][i] v_j; HOR: x north, y west, z up
    // ENU rows: east = -west row, north = north row, up = up row
    const M = [
      -r[0][1], -r[1][1], -r[2][1],
      r[0][0], r[1][0], r[2][0],
      r[0][2], r[1][2], r[2][2],
    ];
    return { date: d, t, obs, loc, M };
  }
  const toENU = (F, x, y, z) => [F.M[0] * x + F.M[1] * y + F.M[2] * z, F.M[3] * x + F.M[4] * y + F.M[5] * z, F.M[6] * x + F.M[7] * y + F.M[8] * z];
  const azAltOf = (v) => ({ az: wrap360(Math.atan2(v[0], v[1]) / D), alt: Math.asin(clamp(v[2], -1, 1)) / D });
  const vecOf = (az, alt) => [Math.cos(alt * D) * Math.sin(az * D), Math.cos(alt * D) * Math.cos(az * D), Math.sin(alt * D)];

  // Standard refraction (Saemundsson, as Astronomy Engine's 'normal'), degrees to add to a geometric altitude.
  function refraction(alt) {
    if (alt < -90 || alt > 90) return 0;
    let hd = alt;
    if (hd < -1) hd = -1;
    let r = (1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * D)) / 60;
    if (alt < -1) r *= (alt + 90) / 89;
    return r;
  }

  /* ---------------- stars ---------------- */
  function b64bytes(s) {
    if (typeof atob === 'function') {
      const bin = atob(s);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  function decodeStars(S) {
    const n = S.n;
    const dv = new DataView(b64bytes(S.bin).buffer);
    const cat = { n, ra: new Float64Array(n), dec: new Float64Array(n), mag: new Float32Array(n), bv: new Float32Array(n), pmra: new Float32Array(n), pmde: new Float32Array(n), hr: new Uint16Array(n), desig: S.desig.split('|'), names: {}, byName: {} };
    for (let i = 0; i < n; i++) {
      const o = i * S.stride;
      cat.ra[i] = dv.getFloat32(o, true);
      cat.dec[i] = dv.getFloat32(o + 4, true);
      cat.mag[i] = dv.getInt16(o + 8, true) / 100;
      const bv = dv.getInt16(o + 10, true);
      cat.bv[i] = bv === 32767 ? NaN : bv / 1000;
      cat.pmra[i] = dv.getInt16(o + 12, true);
      cat.pmde[i] = dv.getInt16(o + 14, true);
      cat.hr[i] = dv.getUint16(o + 16, true);
    }
    Object.keys(S.names || {}).forEach((k) => { cat.names[+k] = S.names[k]; cat.byName[S.names[k]] = +k; });
    return cat;
  }
  // J2000-equinox unit vectors at an epoch (proper motion applied). Cached per catalogue and year.
  function starVectors(cat, date) {
    const yrs = (toDate(date).getTime() - J2000) / (365.25 * 864e5);
    const key = Math.round(yrs);
    if (cat._vecKey === key && cat._vec) return cat._vec;
    const v = new Float64Array(cat.n * 3);
    for (let i = 0; i < cat.n; i++) {
      const dec = cat.dec[i] + cat.pmde[i] * key / 3.6e6;
      const cd = Math.cos(cat.dec[i] * D);
      const ra = cat.ra[i] + (cd > 1e-6 ? cat.pmra[i] / cd : 0) * key / 3.6e6;
      const c = Math.cos(dec * D);
      v[i * 3] = c * Math.cos(ra * D);
      v[i * 3 + 1] = c * Math.sin(ra * D);
      v[i * 3 + 2] = Math.sin(dec * D);
    }
    cat._vec = v;
    cat._vecKey = key;
    return v;
  }
  // Rough star colour from B-V (for drawing only).
  function starColour(bv) {
    if (!isFinite(bv)) return [255, 255, 255];
    const t = clamp(bv, -0.4, 2.0);
    const stops = [[-0.4, [155, 176, 255]], [0, [202, 216, 255]], [0.4, [248, 247, 255]], [0.8, [255, 236, 214]], [1.2, [255, 214, 165]], [1.6, [255, 190, 125]], [2.0, [255, 160, 90]]];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i];
        const f = (t - a) / (b - a);
        // softened towards white: star colours are subtle to the eye, and gold is kept for planets
        return [0, 1, 2].map((k) => Math.round((ca[k] + (cb[k] - ca[k]) * f) * 0.55 + 255 * 0.45));
      }
    }
    return stops[stops.length - 1][1].map((c) => Math.round(c * 0.55 + 255 * 0.45));
  }

  /* ---------------- fixed objects (stars, Messier): position, rise and set ---------------- */
  function fixedPosition(raDeg, decDeg, F) {
    const c = Math.cos(decDeg * D);
    const v = toENU(F, c * Math.cos(raDeg * D), c * Math.sin(raDeg * D), Math.sin(decDeg * D));
    const h = azAltOf(v);
    const alt = h.alt + refraction(h.alt);
    return { az: h.az, alt, altGeo: h.alt, vec: vecOf(h.az, alt) };
  }
  // Next rise, set and transit of a fixed point after `date`, using sidereal time (accurate to well
  // under a minute: precession is applied by taking RA/Dec of date). h0: -0.5667 deg (refraction).
  function fixedRiseSet(raDeg, decDeg, date, loc) {
    const d = toDate(date);
    const t = A.MakeTime(d);
    // RA/Dec of date
    const rot = A.Rotation_EQJ_EQD(t);
    const c = Math.cos(decDeg * D);
    const v = A.RotateVector(rot, new A.Vector(c * Math.cos(raDeg * D), c * Math.sin(raDeg * D), Math.sin(decDeg * D), t));
    const eq = A.EquatorFromVector(v);
    const ra = eq.ra * 15, dec = eq.dec;
    const lst = wrap360(A.SiderealTime(t) * 15 + loc.lon);
    const H = wrap180(lst - ra); // hour angle now, deg
    const toTransit = wrap360(-H) / 15 / SIDEREAL; // solar hours to the next transit
    const transit = new Date(d.getTime() + toTransit * 3600e3);
    const h0 = -0.5667 * D, phi = loc.lat * D, del = dec * D;
    const cosH0 = (Math.sin(h0) - Math.sin(phi) * Math.sin(del)) / (Math.cos(phi) * Math.cos(del));
    const maxAlt = 90 - Math.abs(loc.lat - dec);
    if (cosH0 <= -1) return { always: 'up', transit, maxAlt };
    if (cosH0 >= 1) return { always: 'down', transit, maxAlt };
    const H0 = Math.acos(cosH0) / D; // deg
    const day = 24 / SIDEREAL;
    const next = (hours) => new Date(d.getTime() + (((hours % day) + day) % day) * 3600e3);
    return {
      rise: next(toTransit - H0 / 15 / SIDEREAL),
      set: next(toTransit + H0 / 15 / SIDEREAL),
      transit, maxAlt,
    };
  }

  /* ---------------- Sun, Moon and planets ---------------- */
  function body(id, date, loc, F) {
    const f = F || frame(date, loc);
    const B = ABODY[id];
    const eq = A.Equator(B, f.t, f.obs, true, true);       // apparent, of date, topocentric
    const hor = A.Horizon(f.t, f.obs, eq.ra, eq.dec, null); // airless
    const alt = hor.altitude + refraction(hor.altitude);
    const eqj = A.Equator(B, f.t, f.obs, false, true);
    let mag = null, illum = 1, phaseAngle = 0;
    try {
      const il = A.Illumination(B, f.t);
      mag = il.mag; illum = il.phase_fraction; phaseAngle = il.phase_angle;
    } catch (e) { /* the Sun has no phase */ }
    const distKm = eq.dist * AU_KM;
    const size = 2 * Math.asin(Math.min(1, RADIUS_KM[id] / distKm)) / D * 3600; // arcsec
    const elong = id === 'sun' ? 0 : A.AngleFromSun(B, f.t);
    return {
      id, kind: id === 'sun' ? 'sun' : id === 'moon' ? 'moon' : 'planet',
      ra: eq.ra * 15, dec: eq.dec, raJ: eqj.ra * 15, decJ: eqj.dec,
      az: hor.azimuth, alt, altGeo: hor.altitude, vec: vecOf(hor.azimuth, alt),
      distAU: eq.dist, distKm, mag, illum, phaseAngle, size, elong,
      con: A.Constellation(eqj.ra, eqj.dec).symbol,
    };
  }
  function bodies(date, loc, F) {
    const f = F || frame(date, loc);
    return BODIES.map((id) => body(id, date, loc, f));
  }

  const isoOrNull = (at) => (at ? at.date : null);
  // Rise, transit and set within the local day containing `date` (time zone tz).
  function riseSetDay(id, date, loc, tz) {
    const start = dayStart(date, tz);
    const end = dayStart(date, tz, 1);
    const days = (end - start) / 864e5;
    const obs = observer(loc);
    const t0 = A.MakeTime(start);
    const B = ABODY[id];
    const rise = isoOrNull(A.SearchRiseSet(B, obs, +1, t0, days));
    const set = isoOrNull(A.SearchRiseSet(B, obs, -1, t0, days));
    let transit = null, transitAlt = null;
    try {
      const h = A.SearchHourAngle(B, obs, 0, t0, +1);
      if (h && h.time.date < end) { transit = h.time.date; transitAlt = h.hor.altitude; }
    } catch (e) { /* none */ }
    let always = null;
    if (!rise && !set) {
      const mid = new Date((start.getTime() + end.getTime()) / 2);
      always = body(id, transit || mid, loc).alt > -0.5 ? 'up' : 'down';
    }
    return { rise, set, transit, transitAlt, always, start, end };
  }
  // The next rise and set after `date` (within limitDays).
  function nextRiseSet(id, date, loc, limitDays) {
    const obs = observer(loc);
    const t0 = atime(date);
    const lim = limitDays || 1.5;
    const B = ABODY[id];
    const rise = isoOrNull(A.SearchRiseSet(B, obs, +1, t0, lim));
    const set = isoOrNull(A.SearchRiseSet(B, obs, -1, t0, lim));
    let always = null;
    if (!rise && !set) always = body(id, date, loc).alt > -0.5 ? 'up' : 'down';
    return { rise, set, always };
  }

  function sunTimes(date, loc, tz) {
    const start = dayStart(date, tz);
    const days = (dayStart(date, tz, 1) - start) / 864e5;
    const obs = observer(loc);
    const t0 = A.MakeTime(start);
    const alt = (dir, a) => isoOrNull(A.SearchAltitude('Sun', obs, dir, t0, days, a));
    const rs = riseSetDay('sun', date, loc, tz);
    return {
      rise: rs.rise, set: rs.set, transit: rs.transit, transitAlt: rs.transitAlt, always: rs.always,
      civilDawn: alt(+1, -6), civilDusk: alt(-1, -6),
      nauticalDawn: alt(+1, -12), nauticalDusk: alt(-1, -12),
      astroDawn: alt(+1, -18), astroDusk: alt(-1, -18),
    };
  }

  /* ---------------- the Moon ---------------- */
  const PHASES = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'];
  function phaseKey(angle) {
    const a = wrap360(angle);
    if (a < 12 || a >= 348) return 'new';
    if (a < 78) return 'waxingCrescent';
    if (a < 102) return 'firstQuarter';
    if (a < 168) return 'waxingGibbous';
    if (a < 192) return 'full';
    if (a < 258) return 'waningGibbous';
    if (a < 282) return 'lastQuarter';
    return 'waningCrescent';
  }
  // Position angle of the Moon's bright limb (deg from celestial north through east), and of the
  // local zenith (parallactic angle); their difference turns the drawn Moon as it looks in the sky.
  function limbAngles(moon, sun, loc, F) {
    const a = moon.ra * D, d = moon.dec * D, as = sun.ra * D, ds = sun.dec * D;
    const chi = Math.atan2(Math.cos(ds) * Math.sin(as - a), Math.sin(ds) * Math.cos(d) - Math.cos(ds) * Math.sin(d) * Math.cos(as - a)) / D;
    const lst = wrap360(A.SiderealTime(F.t) * 15 + loc.lon);
    const H = (lst - moon.ra) * D, phi = loc.lat * D;
    const q = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(d) - Math.sin(d) * Math.cos(H)) / D;
    return { chi: wrap360(chi), q, fromZenith: wrap360(chi - q) };
  }
  // On-screen rotation (radians, clockwise from screen-up) of the Moon's lit limb, for any projection:
  // find which way the zenith is at the Moon's position on screen, then turn by the limb angle.
  function limbScreenAngle(project, moonVec, fromZenithDeg) {
    const m = moonVec;
    const d = m[2];
    const toward = norm([m[0] - 0.01 * d * m[0], m[1] - 0.01 * d * m[1], m[2] + 0.01 * (1 - d * m[2])]);
    const p0 = project(m), p1 = project(toward);
    if (!p0 || !p1) return 0;
    const thetaZ = Math.atan2(p1[0] - p0[0], -(p1[1] - p0[1])); // clockwise from screen-up
    return thetaZ - fromZenithDeg * D;
  }
  function moonInfo(date, loc, F) {
    const f = F || frame(date, loc);
    const moon = body('moon', date, loc, f);
    const sun = body('sun', date, loc, f);
    const angle = A.MoonPhase(f.t);
    // the last new Moon, searching backwards from the date (a forward search from a month ago finds the
    // new Moon before that in the first day and a half after a new Moon, giving an age of about 30 days)
    const prevNew = A.SearchMoonPhase(0, f.t, -32);
    const age = prevNew ? (f.date - prevNew.date) / 864e5 : null;
    const quarters = [];
    let mq = A.SearchMoonQuarter(f.t);
    for (let i = 0; i < 4; i++) { quarters.push({ quarter: mq.quarter, date: mq.time.date }); mq = A.NextMoonQuarter(mq); }
    const limb = limbAngles(moon, sun, loc, f);
    return { moon, angle, illum: moon.illum, key: phaseKey(angle), age, distKm: moon.distKm, quarters, limb };
  }
  // Full Moon within 360,000 km of Earth (one common definition of a "supermoon").
  const SUPERMOON_KM = 360000;

  /* ---------------- tonight's planets ---------------- */
  // The night that is "tonight" at `date`: from sunset + 20 min (or now, if later) to the next sunrise - 20 min.
  // In the last 20 minutes before sunrise, tonight is the coming night.
  function nightWindow(date, loc, again) {
    const d = toDate(date);
    const obs = observer(loc);
    const sunAlt = body('sun', d, loc).alt;
    let start;
    if (sunAlt < -0.8) start = d; // already dark: tonight starts now
    else {
      const set = A.SearchRiseSet('Sun', obs, -1, A.MakeTime(d), 1);
      if (!set) return null; // midnight sun
      start = new Date(set.date.getTime() + 20 * 60e3);
    }
    const rise = A.SearchRiseSet('Sun', obs, +1, A.MakeTime(start), 1.5);
    if (!rise) return { start, end: new Date(start.getTime() + 18 * 3600e3), polar: true };
    const end = new Date(rise.date.getTime() - 20 * 60e3);
    if (end <= start) {
      if (start === d && !again) return nightWindow(new Date(rise.date.getTime() + 60e3), loc, true); // dawn: the next night
      return null; // a night too short to count
    }
    return { start, end };
  }
  function tonight(date, loc) {
    const win = nightWindow(date, loc);
    if (!win) return { noNight: true, planets: [] };
    const span = win.end - win.start;
    const steps = Math.max(6, Math.min(120, Math.round(span / (10 * 60e3))));
    const samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = new Date(win.start.getTime() + (span * i) / steps);
      samples.push({ t, F: frame(t, loc) });
    }
    const planets = PLANETS.map((id) => {
      let best = null, from = null, to = null, upCount = 0;
      const min = id === 'mercury' || id === 'venus' ? 5 : 10; // degrees above the horizon to count as visible
      samples.forEach((s, i) => {
        const b = body(id, s.t, loc, s.F);
        if (b.alt > min) {
          upCount++;
          if (!from) from = s.t;
          to = s.t;
          if (!best || b.alt > best.alt) best = { t: s.t, alt: b.alt, az: b.az, mag: b.mag, con: b.con, i };
        }
      });
      const mid = samples[Math.floor(samples.length / 2)];
      const b0 = body(id, mid.t, loc, mid.F);
      const naked = NAKED_EYE.includes(id);
      let when = null;
      if (best) {
        const frac = upCount / samples.length;
        const fi = samples.findIndex((s) => s.t === from), li = samples.findIndex((s) => s.t === to);
        if (frac > 0.8) when = 'allNight';
        else if (fi === 0 && li < samples.length * 0.6) when = 'evening';
        else if (li === samples.length - 1 && fi > samples.length * 0.4) when = 'morning';
        else when = 'night';
      }
      return { id, visible: !!best, naked, when, from, to, best, mag: best ? best.mag : b0.mag, con: best ? best.con : b0.con, elong: b0.elong };
    });
    return { start: win.start, end: win.end, polar: !!win.polar, planets };
  }

  /* ---------------- view projection ---------------- */
  // A camera looking along `forward` with `up` roughly towards the top of the screen.
  // proj: 'stereo' (wide views: conformal, as charts use) or 'gnomonic' (the camera, AR).
  function makeView(o) {
    const w = o.w, h = o.h;
    let f = o.forward ? o.forward.slice() : vecOf(o.az, o.alt);
    let u;
    if (o.up) u = o.up.slice();
    else {
      // keep the horizon level: up is the zenith projected perpendicular to forward
      const z = [0, 0, 1];
      const d = f[2];
      u = [z[0] - d * f[0], z[1] - d * f[1], z[2] - d * f[2]];
      if (Math.hypot(u[0], u[1], u[2]) < 1e-6) {
        // looking straight up or down: use north (or the given azimuth) as up
        const a = (o.az || 0) * D;
        u = [Math.sin(a) * (d > 0 ? -1 : 1), Math.cos(a) * (d > 0 ? -1 : 1), 0];
      }
      if (o.roll) {
        // rotate up about forward
        const r0 = cross(f, u);
        const c = Math.cos(o.roll * D), s = Math.sin(o.roll * D);
        u = [u[0] * c + r0[0] * s, u[1] * c + r0[1] * s, u[2] * c + r0[2] * s];
      }
    }
    f = norm(f);
    // orthonormalise
    const dot = u[0] * f[0] + u[1] * f[1] + u[2] * f[2];
    u = norm([u[0] - dot * f[0], u[1] - dot * f[1], u[2] - dot * f[2]]);
    const r = cross(f, u); // right = forward x up
    const proj = o.proj || 'stereo';
    const fov = o.fov || 60; // vertical field of view, deg
    const half = (fov / 2) * D;
    const k = proj === 'stereo' ? (h / 2) / (2 * Math.tan(half / 2)) : (h / 2) / Math.tan(half);
    const cx = w / 2, cy = h / 2;
    function project(v) {
      const x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
      const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
      if (proj === 'stereo') {
        if (z <= -0.98) return null;
        const s = 2 * k / (1 + z);
        return [cx + x * s, cy - y * s, z];
      }
      if (z <= 0.02) return null;
      return [cx + (x / z) * k, cy - (y / z) * k, z];
    }
    function unproject(px, py) {
      const x = (px - cx) / k, y = (cy - py) / k;
      let vx, vy, vz;
      if (proj === 'stereo') {
        const x2 = x / 2, y2 = y / 2;
        const rho2 = x2 * x2 + y2 * y2;
        vz = (1 - rho2) / (1 + rho2);
        const s = (1 + vz);
        vx = x2 * s; vy = y2 * s;
      } else {
        const n = Math.hypot(x, y, 1);
        vx = x / n; vy = y / n; vz = 1 / n;
      }
      return norm([r[0] * vx + u[0] * vy + f[0] * vz, r[1] * vx + u[1] * vy + f[1] * vz, r[2] * vx + u[2] * vy + f[2] * vz]);
    }
    // The cosine of the largest angle from the centre that is on screen (for quick culling).
    const diag = Math.hypot(w, h) / 2;
    const maxAng = proj === 'stereo' ? 2 * Math.atan(diag / (2 * k)) : Math.atan(diag / k);
    return { project, unproject, forward: f, up: u, right: r, w, h, k, fov, proj, cosMax: Math.cos(Math.min(Math.PI * 0.95, maxAng + 2 * D)) };
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(v) { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }
  const angleBetween = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) / D;

  // All-sky chart (zenith at the centre, horizon at radius R), stereographic. mirror: east on the left
  // as when you hold a chart up over your head facing south (true for the printed poster).
  function chartProject(az, alt, R, cx, cy) {
    if (alt < -1) return null;
    const z = (90 - alt) * D;
    const rr = R * Math.tan(z / 2) / Math.tan(Math.PI / 4);
    const a = az * D;
    return [cx - rr * Math.sin(a), cy - rr * Math.cos(a)]; // north up, east left
  }

  /* ---------------- search ---------------- */
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9α-ω ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // entries: [{ kind, id, label, sub, terms: [...], rank }]
  function search(entries, q, limit) {
    const s = fold(q);
    if (!s) return [];
    const out = [];
    entries.forEach((e) => {
      let score = -1;
      e._terms = e._terms || e.terms.map(fold);
      e._terms.forEach((t, i) => {
        let sc = -1;
        if (t === s) sc = 100;
        else if (t.startsWith(s)) sc = 80;
        else if (t.split(' ').some((w) => w.startsWith(s))) sc = 60;
        else if (s.length >= 3 && t.includes(s)) sc = 40;
        if (sc >= 0) sc -= i * 2; // the main name counts more than alternatives
        if (sc > score) score = sc;
      });
      if (score >= 0) out.push([score + (e.rank || 0), e]);
    });
    out.sort((a, b) => b[0] - a[0]);
    return out.slice(0, limit || 30).map((x) => x[1]);
  }

  return {
    A, D, BODIES, PLANETS, NAKED_EYE, ABODY, PHASES, SUPERMOON_KM, SIDEREAL,
    wrap360, wrap180, clamp, tzOffset, dayStart, fromLocal, partsIn,
    observer, frame, toENU, azAltOf, vecOf, refraction,
    decodeStars, starVectors, starColour, fixedPosition, fixedRiseSet,
    body, bodies, riseSetDay, nextRiseSet, sunTimes, moonInfo, phaseKey, limbAngles, limbScreenAngle,
    nightWindow, tonight, makeView, chartProject, angleBetween, cross, norm,
    fold, search,
  };
});
