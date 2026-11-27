/* Stellarwise browser tools: the live sky chart and the planets tonight, today's Moon and the moon
   calendar, full Moon times in your time zone, the meteor shower calendar and the printable star map.
   They run the Stellarwise app's own astronomy code (static/sky/: Astronomy Engine, sky.js, events.js,
   render.js) in the browser. Nothing is sent anywhere. The chosen place is kept in this browser's
   localStorage ('zw-place') so every tool opens on it. */
(function () {
  'use strict';
  var d = document;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var C = window.SKY_CITIES, Sky = window.Sky, R = window.Render, EV = window.SkyEvents;
  if (!C) return;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var FONT = 'Jost, Futura, "Trebuchet MS", sans-serif';
  var NAMES = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' };
  var PHASE = { new: 'New Moon', waxingCrescent: 'Waxing crescent', firstQuarter: 'First quarter', waxingGibbous: 'Waxing gibbous', full: 'Full Moon', waningGibbous: 'Waning gibbous', lastQuarter: 'Last quarter', waningCrescent: 'Waning crescent' };
  var QUARTER = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter'];
  var WHEN = { allNight: 'Up all night', evening: 'In the evening', morning: 'Before dawn', night: 'Later tonight' };
  var DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  var dir = function (az) { return DIRS[Math.round((((az % 360) + 360) % 360) / 45) % 8]; };
  var fold = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var regionName = (function () {
    try { var dn = new Intl.DisplayNames(['en'], { type: 'region' }); return function (cc) { try { return dn.of(cc); } catch (e) { return cc; } }; } catch (e) { return function (cc) { return cc; }; }
  })();

  /* ---------------- the place ---------------- */
  var KEY = 'zw-place';
  var cityAt = function (i) { var r = C.rows[i]; return { name: r[5] || r[0], cc: r[1], lat: r[2], lon: r[3], tz: C.tz[r[4]] }; };
  var validTz = function (tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };
  function guess() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
    var i = -1;
    for (var k = 0; k < C.rows.length; k++) if (C.tz[C.rows[k][4]] === tz) { i = k; break; }
    if (i < 0) for (k = 0; k < C.rows.length; k++) if (C.rows[k][0] === 'London') { i = k; break; }
    return cityAt(i < 0 ? 0 : i);
  }
  function loadPlace() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && typeof p.name === 'string' && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && validTz(p.tz)) return p;
    } catch (e) { /* storage blocked or bad */ }
    return null;
  }
  var place = loadPlace() || guess();
  var listeners = [];
  var label = function (p) { return p.name + (p.cc ? ', ' + regionName(p.cc) : ''); };
  function setPlace(p) {
    place = p;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
    $$('[data-place] input').forEach(function (i) { i.value = label(p); });
    listeners.forEach(function (fn) { fn(); });
  }
  function searchCities(q) {
    q = fold(q.trim());
    if (!q) return [];
    var a = [], b = [];
    for (var i = 0; i < C.rows.length && a.length < 8; i++) {
      var r = C.rows[i], n = fold(r[0]), s = r[5] ? fold(r[5]) : '';
      if (n.indexOf(q) === 0 || (s && s.indexOf(q) === 0)) a.push(i);
      else if (b.length < 8 && q.length >= 3 && (n.indexOf(q) > 0 || (s && s.indexOf(q) > 0))) b.push(i);
    }
    return a.concat(b).slice(0, 8);
  }
  function initPicker(box) {
    var inp = $('input', box), list = $('.sugg', box), items = [], act = -1;
    inp.value = label(place);
    function close() { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); act = -1; }
    function show() {
      items = searchCities(inp.value);
      act = -1;
      if (!items.length) { close(); return; }
      list.innerHTML = items.map(function (i, k) {
        var p = cityAt(i);
        return '<li role="option" id="' + list.id + '-' + k + '" data-i="' + i + '" aria-selected="false">' + esc(p.name) + '<small>' + esc(regionName(p.cc)) + '</small></li>';
      }).join('');
      list.hidden = false;
      inp.setAttribute('aria-expanded', 'true');
    }
    function pick(i) { setPlace(cityAt(i)); close(); }
    function move(k) {
      act = (act + k + items.length) % items.length;
      $$('li', list).forEach(function (li, j) { li.setAttribute('aria-selected', String(j === act)); });
      inp.setAttribute('aria-activedescendant', list.id + '-' + act);
    }
    inp.addEventListener('input', show);
    inp.addEventListener('focus', function () { inp.select(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { if (list.hidden) show(); else move(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { if (!list.hidden) { move(-1); e.preventDefault(); } }
      else if (e.key === 'Enter') { if (!list.hidden && items.length) { pick(items[act < 0 ? 0 : act]); e.preventDefault(); } }
      else if (e.key === 'Escape') { close(); inp.value = label(place); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { close(); inp.value = label(place); }, 150); });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li');
      if (li) { e.preventDefault(); pick(+li.getAttribute('data-i')); }
    });
  }
  $$('[data-place]').forEach(initPicker);

  /* ---------------- formatting in the place's time zone ---------------- */
  var fmtCache = {};
  function fmt(t, opts) {
    var k = place.tz + JSON.stringify(opts);
    if (!fmtCache[k]) fmtCache[k] = new Intl.DateTimeFormat('en', Object.assign({ timeZone: place.tz }, opts));
    return fmtCache[k].format(t);
  }
  var fTime = function (t) { return fmt(t, { hour: 'numeric', minute: '2-digit' }); };
  var fDay = function (t) { return fmt(t, { weekday: 'short', day: 'numeric', month: 'short' }); };
  var fDayY = function (t) { return fmt(t, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  var fZone = function (t) {
    var p = new Intl.DateTimeFormat('en', { timeZone: place.tz, timeZoneName: 'short' }).formatToParts(t);
    var z = p.filter(function (x) { return x.type === 'timeZoneName'; })[0];
    return z ? z.value : '';
  };
  var localDay = function (t) { return fmt(t, { year: 'numeric', month: '2-digit', day: '2-digit' }); };
  function dayWord(t, now) {
    var a = localDay(t), today = localDay(now), tom = localDay(new Date(now.getTime() + 864e5));
    return a === today ? 'today' : a === tom ? 'tomorrow' : fDay(t);
  }
  var timeAndDay = function (t, now) { var w = dayWord(t, now); return fTime(t) + (w === 'today' ? '' : ' ' + w); };

  /* ---------------- tables of fixed times (full Moons, meteor peaks) ---------------- */
  function localiseTimes(root) {
    var now = Date.now();
    $$('td[data-t]', root).forEach(function (td) {
      var t = new Date(td.getAttribute('data-t')), f = td.getAttribute('data-f');
      td.textContent = f === 'time' ? fTime(t) + ' ' + fZone(t) : f === 'datey' ? fDayY(t) : fDay(t);
    });
    $$('tbody', root).forEach(function (tb) {
      var next = false;
      $$('tr', tb).forEach(function (tr) {
        var td = $('td[data-t]', tr);
        if (!td) return;
        var past = new Date(td.getAttribute('data-t')).getTime() < now - 864e5;
        tr.classList.toggle('past', past);
        tr.classList.remove('next');
        if (!past && !next) { next = true; tr.classList.add('next'); }
      });
    });
    $$('[data-tz-note]', root).forEach(function (p) { p.textContent = 'Times for ' + place.name + ' (' + place.tz.replace(/_/g, ' ') + ').'; });
  }

  function initFullMoons(el) {
    var data = $('#full-moons');
    var list = data ? JSON.parse(data.textContent) : null;
    function render() {
      localiseTimes(el);
      if (list) {
        var now = Date.now(), nx = list.filter(function (f) { return new Date(f.t).getTime() > now; })[0], box = $('[data-next-full]', el);
        if (nx && box) {
          var t = new Date(nx.t), days = Math.ceil((t - now) / 864e5);
          box.innerHTML = 'The next full Moon is the ' + esc(nx.name) + ' on ' + esc(fDay(t)) + ' at ' + esc(fTime(t)) + '.' +
            '<small>' + (days <= 1 ? 'Tonight or tomorrow' : 'In ' + days + ' days') + ', ' + esc(place.name) + ' time (' + esc(place.tz.replace(/_/g, ' ')) + ').</small>';
          box.hidden = false;
        }
      }
    }
    listeners.push(render);
    render();
  }
  $$('[data-tool=fullmoons]').forEach(initFullMoons);

  if (!Sky || !R) return;

  /* ---------------- the sky chart ---------------- */
  var cat = null, CONST = window.SKY_CONST;
  var catalogue = function () { return cat || (cat = Sky.decodeStars(window.SKY_STARS)); };
  R.PALETTES.dusk = Object.assign({}, R.PALETTES.night, {
    skyTop: '#0f1130', card: '#b9bde3', grid: 'rgba(185,189,227,0.13)', lines: 'rgba(185,189,227,0.42)', constLabel: 'rgba(200,204,240,0.62)',
    starLabel: 'rgba(242,240,251,0.92)', planet: '#ffd88a', planetLabel: '#ffd88a', moonLit: '#f2ecdc', moonDark: '#2c3166',
  });
  var LABELS = {
    star: function (i) { return cat.names[i]; },
    body: function (id) { return NAMES[id]; },
    con: function (a) { return CONST.names[a][0]; },
    dir: function (q) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][q]; },
  };
  function drawChartAt(ctx, cx, cy, Rr, date, loc, o) {
    var F = Sky.frame(date, loc);
    var bodies = Sky.bodies(date, loc, F);
    var moon = bodies.filter(function (b) { return b.id === 'moon'; })[0], sun = bodies.filter(function (b) { return b.id === 'sun'; })[0];
    var limb = Sky.limbAngles(moon, sun, loc, F);
    var chartPt = function (v) { var h = Sky.azAltOf(v); return Sky.chartProject(h.az, h.alt, Rr, cx, cy); };
    R.drawChart(ctx, cx, cy, Rr, {
      F: F, cat: catalogue(), vec: Sky.starVectors(cat, date), consts: CONST, bodies: bodies, palette: o.palette, dpr: o.dpr, font: FONT,
      layers: { lines: true, names: true }, labels: LABELS, limitMag: o.limitMag, nameMag: o.nameMag, starScale: o.starScale || 1,
      moonScreenAngle: Sky.limbScreenAngle(chartPt, moon.vec, limb.fromZenith),
    });
    return { sun: sun, moon: moon };
  }
  function drawSky(canvas, date) {
    var css = canvas.clientWidth || 560, ratio = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.round(css * ratio);
    if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, W);
    var sunAlt = Sky.body('sun', date, place).alt;
    R.PALETTES.dusk.skyTop = sunAlt > -0.8 ? '#3a4688' : sunAlt > -6 ? '#28306c' : sunAlt > -12 ? '#1a1f4c' : '#0f1130';
    var s = Math.max(0.75, Math.min(1.15, css / 520));
    drawChartAt(ctx, W / 2, W / 2, W / 2 - 24 * ratio, date, place, { palette: 'dusk', dpr: ratio * s, limitMag: css < 400 ? 4.5 : 5.3, nameMag: css < 400 ? 0.9 : 1.4, starScale: 0.95 });
  }

  /* ---------------- tonight: the chart, the time slider and the planets ---------------- */
  function initTonight(el) {
    var canvas = $('[data-chart]', el), range = $('[data-time]', el), out = $('[data-time-label]', el), up = $('[data-up]', el);
    var table = el.getAttribute('data-kind') === 'planets' ? $('[data-planet-table]') : null;
    var STEP = 10 * 60e3, win = null, now = null;
    var at = function () { return new Date(win.start.getTime() + (+range.value) * STEP); };
    function draw() {
      var t = at();
      out.textContent = fTime(t) + (dayWord(t, now) === 'today' ? '' : ' ' + dayWord(t, now));
      range.setAttribute('aria-valuetext', fDay(t) + ' ' + fTime(t));
      drawSky(canvas, t);
    }
    function setup() {
      now = new Date();
      var nw = Sky.nightWindow(now, place);
      win = nw ? { start: nw.start, end: nw.end } : { start: now, end: new Date(now.getTime() + 12 * 3600e3) };
      var n = Math.max(1, Math.round((win.end - win.start) / STEP));
      range.max = String(n);
      range.value = String(win.start > now ? Math.min(n, 4) : 0); // about an hour after sunset, or now if it is already dark
      list(Sky.tonight(now, place), !nw);
      draw();
    }
    function list(info, noNight) {
      var mi = Sky.moonInfo(now, place), rs = Sky.nextRiseSet('moon', now, place, 1.5);
      var moonLine = PHASE[mi.key] + ', ' + Math.round(mi.illum * 100) + '% lit.' +
        (rs.always === 'up' ? ' Up all day and night.' : rs.always === 'down' ? ' Below the horizon all day.' :
          (rs.rise ? ' Rises ' + timeAndDay(rs.rise, now) + '.' : '') + (rs.set ? ' Sets ' + timeAndDay(rs.set, now) + '.' : ''));
      var vis = info.planets.filter(function (p) { return p.visible && p.naked; });
      var off = info.planets.filter(function (p) { return !p.visible && p.naked; });
      var html = '<h2>Tonight from ' + esc(place.name) + '</h2><ul>' +
        '<li><i class="dot moon" aria-hidden="true"></i><b>The Moon</b><span>' + esc(moonLine) + '</span></li>';
      vis.forEach(function (p) {
        html += '<li><i class="dot" aria-hidden="true"></i><b>' + NAMES[p.id] + '</b><span>' + esc(WHEN[p.when] + '. Highest at ' + fTime(p.best.t) + ', ' + dir(p.best.az) + ', ' + Math.round(p.best.alt) + '° up.') + '</span></li>';
      });
      html += '</ul>';
      if (noNight) html += '<p class="none">The Sun doesn’t set far enough tonight for a dark sky here.</p>';
      else if (!vis.length) html += '<p class="none">No bright planets are well placed tonight.</p>';
      if (off.length && !noNight) html += '<p class="none">Not visible tonight: ' + off.map(function (p) { return NAMES[p.id]; }).join(', ') + '.</p>';
      up.innerHTML = html;
      if (table) {
        var rows = info.planets.map(function (p) {
          var nm = '<span class="pname">' + NAMES[p.id] + '</span>';
          var mag = (p.mag > 0 ? '+' : '') + p.mag.toFixed(1).replace('-', '−');
          if (!p.visible) {
            var why = p.elong < 18 ? 'Too close to the Sun' : 'Not up during darkness';
            return '<tr class="off"><th scope="row">' + nm + '</th><td data-label="When">' + why + '</td><td class="hide-s">–</td><td class="hide-s">–</td><td data-label="Brightness">' + mag + '</td></tr>';
          }
          var note = p.naked ? '' : p.id === 'uranus' ? ' (binoculars)' : ' (telescope)';
          return '<tr><th scope="row">' + nm + '</th><td data-label="When">' + WHEN[p.when] + note + '</td><td data-label="Highest">' + fTime(p.best.t) + '</td><td data-label="Where">' + dir(p.best.az) + ', ' + Math.round(p.best.alt) + '° up' +
            (p.best.con ? ', in ' + esc((CONST.names[p.best.con] || [p.best.con])[0]) : '') + '</td><td data-label="Brightness">' + mag + '</td></tr>';
        }).join('');
        $('tbody', table).innerHTML = rows;
        table.hidden = false;
      }
    }
    range.addEventListener('input', draw);
    listeners.push(setup);
    redrawers.push(draw);
    setup();
  }

  /* ---------------- the Moon ---------------- */
  function moonDisc(canvas, illum, angle) {
    var css = canvas.clientWidth || 34, ratio = Math.min(2, window.devicePixelRatio || 1), W = Math.round(css * ratio);
    if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, W);
    R.drawMoon(ctx, W / 2, W / 2, W / 2 - 1, illum, angle, { moonLit: '#f2ecdc', moonDark: '#2c3166' });
  }
  // Lit side as usually drawn for the hemisphere: on the right when waxing in the north, on the left in the south.
  var litSide = function (phaseAngle) { var waxing = phaseAngle < 180; return (waxing === (place.lat >= 0) ? 1 : -1) * Math.PI / 2; };
  function initMoon(el) {
    var big = $('[data-moon]', el), facts = $('[data-moon-facts]', el), cal = $('[data-cal]', el), grid = $('[data-cal-grid]', el), title = $('[data-cal-title]', el);
    var ym = null;
    function today() {
      var now = new Date(), mi = Sky.moonInfo(now, place);
      // the Moon the way it looks from the place: now if it is up, otherwise when it is next highest
      var A = Sky.A, when = now, as = 'now';
      if (mi.moon.alt <= 0) {
        try { var h = A.SearchHourAngle(A.Body.Moon, new A.Observer(place.lat, place.lon, 0), 0, A.MakeTime(now), +1); if (h) { when = h.time.date; as = 'at ' + timeAndDay(when, now) + ', when it is highest'; } } catch (e) { /* keep now */ }
      }
      var m2 = when === now ? mi : Sky.moonInfo(when, place);
      moonDisc(big, mi.illum, -m2.limb.fromZenith * Math.PI / 180);
      big.setAttribute('aria-label', PHASE[mi.key] + ', ' + Math.round(mi.illum * 100) + '% lit, drawn as it looks from ' + place.name + ' ' + as);
      var rs = Sky.nextRiseSet('moon', now, place, 1.5);
      var nf = mi.quarters.filter(function (q) { return q.quarter === 2; })[0], nn = mi.quarters.filter(function (q) { return q.quarter === 0; })[0];
      facts.innerHTML = '<p class="phase">' + PHASE[mi.key] + '</p>' +
        '<p>' + Math.round(mi.illum * 100) + '% lit, ' + (mi.age == null ? '' : mi.age.toFixed(1) + ' days since new Moon') + '</p>' +
        '<p>' + (rs.always === 'up' ? 'Up all day and night' : rs.always === 'down' ? 'Below the horizon all day' :
          [rs.rise ? 'Moonrise ' + esc(timeAndDay(rs.rise, now)) : '', rs.set ? 'moonset ' + esc(timeAndDay(rs.set, now)) : ''].filter(Boolean).join(', ')) + '</p>' +
        (nf ? '<p>Next full Moon: ' + esc(fDay(nf.date) + ', ' + fTime(nf.date)) + '</p>' : '') +
        (nn ? '<p>Next new Moon: ' + esc(fDay(nn.date) + ', ' + fTime(nn.date)) + '</p>' : '') +
        '<p><i>Drawn as it looks from ' + esc(place.name) + ' ' + esc(as) + '.</i></p>';
      if (!ym) { var p = Sky.partsIn(now, place.tz); ym = { y: p.y, m: p.m }; }
      month();
    }
    function month() {
      var A = Sky.A, tz = place.tz, y = ym.y, m = ym.m;
      var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var start = Sky.fromLocal(y, m, 1, 0, 0, tz), end = Sky.fromLocal(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0, tz);
      var marks = {};
      for (var q = A.SearchMoonQuarter(A.MakeTime(new Date(start.getTime() - 864e5))); q.time.date < end; q = A.NextMoonQuarter(q)) {
        if (q.time.date >= start) marks[Sky.partsIn(q.time.date, tz).d] = QUARTER[q.quarter] + ' ' + fTime(q.time.date);
      }
      var sunFirst = ['US', 'CA', 'MX', 'BR', 'JP', 'PH', 'IL'].indexOf(place.cc) >= 0;
      var wd = sunFirst ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      var lead = sunFirst ? first : (first + 6) % 7;
      var nowP = Sky.partsIn(new Date(), tz);
      var html = wd.map(function (w) { return '<li class="wd" aria-hidden="true">' + w + '</li>'; }).join('');
      for (var i = 0; i < lead; i++) html += '<li class="blank" aria-hidden="true"></li>';
      var cells = [];
      for (var dd = 1; dd <= days; dd++) {
        var t = Sky.fromLocal(y, m, dd, 21, 0, tz);
        var ill = A.Illumination(A.Body.Moon, A.MakeTime(t)).phase_fraction, ang = A.MoonPhase(A.MakeTime(t));
        var isToday = nowP.y === y && nowP.m === m && nowP.d === dd;
        var lbl = fmt(t, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + Math.round(ill * 100) + '% lit' + (marks[dd] ? ', ' + marks[dd] : '');
        html += '<li' + (isToday ? ' class="today"' : '') + ' aria-label="' + esc(lbl) + '"><span class="dn">' + dd + '</span><canvas width="34" height="34" aria-hidden="true"></canvas>' + (marks[dd] ? '<span class="q">' + esc(marks[dd]) + '</span>' : '') + '</li>';
        cells.push([ill, ang]);
      }
      for (var tail = (lead + days) % 7; tail && tail < 7; tail++) html += '<li class="blank" aria-hidden="true"></li>';
      grid.innerHTML = html;
      title.textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
      $$('canvas', grid).forEach(function (c, k) { moonDisc(c, cells[k][0], litSide(cells[k][1])); });
      cal.hidden = false;
    }
    $('[data-cal-prev]', el).addEventListener('click', function () { ym = ym.m === 1 ? { y: ym.y - 1, m: 12 } : { y: ym.y, m: ym.m - 1 }; month(); });
    $('[data-cal-next]', el).addEventListener('click', function () { ym = ym.m === 12 ? { y: ym.y + 1, m: 1 } : { y: ym.y, m: ym.m + 1 }; month(); });
    listeners.push(function () { ym = null; today(); });
    redrawers.push(today);
    today();
  }

  /* ---------------- the Moon on any date (a birthday, say) ---------------- */
  function initMoonDate(el) {
    var form = $('[data-md-form]', el), big = $('[data-moon]', el), facts = $('[data-md-facts]', el), again = $('[data-md-again]', el), mapA = $('[data-md-map]', el);
    var dateIn = form.elements.date, timeIn = form.elements.time, A = Sky.A;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var q = query();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) dateIn.value = q.date;
    else { var p0 = Sky.partsIn(new Date(), place.tz); dateIn.value = p0.y + '-' + pad(p0.m) + '-' + pad(p0.d); }
    if (/^\d{2}:\d{2}$/.test(q.time || '')) timeIn.value = q.time;
    var lower = function (k) { return k === 'new' || k === 'full' ? PHASE[k].charAt(0).toLowerCase() + PHASE[k].slice(1) : PHASE[k].toLowerCase(); };
    var dayMonth = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    var exists = function (y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d; };
    var list = function (xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; };
    function read() {
      var a = (dateIn.value || '').split('-').map(Number), b = (timeIn.value || '21:00').split(':').map(Number);
      if (a.length !== 3 || !(a[0] >= 1900 && a[0] <= 2100) || !(a[1] >= 1 && a[1] <= 12) || !exists(a[0], a[1], a[2])) return null;
      return { y: a[0], m: a[1], d: a[2], h: b[0] || 0, mi: b[1] || 0 };
    }
    function moonAt(y, P) {
      var t = Sky.fromLocal(y, P.m, P.d, P.h, P.mi, place.tz), T = A.MakeTime(t), ang = A.MoonPhase(T);
      return { t: t, T: T, ang: ang, ill: A.Illumination(A.Body.Moon, T).phase_fraction, key: Sky.phaseKey(ang) };
    }
    function draw() {
      var P = read();
      if (!P) { facts.innerHTML = '<p>Choose a date from 1900 to 2100.</p>'; again.hidden = true; return; }
      var M = moonAt(P.y, P), t = M.t;
      // the last new Moon: start the search a little before it, never as far back as the one before
      var back = M.ang / 10 + 1, prevNew = A.SearchMoonPhase(0, A.MakeTime(new Date(t.getTime() - back * 864e5)), back + 1);
      var age = prevNew ? (t - prevNew.date) / 864e5 : null;
      var nextFull = A.SearchMoonPhase(180, M.T, 32), nextNew = A.SearchMoonPhase(0, M.T, 32);
      var north = place.lat >= 0;
      moonDisc(big, M.ill, litSide(M.ang));
      big.setAttribute('aria-label', PHASE[M.key] + ', ' + Math.round(M.ill * 100) + '% lit, drawn as seen from the ' + (north ? 'Northern' : 'Southern') + ' Hemisphere');
      facts.innerHTML = '<p class="phase">' + PHASE[M.key] + '</p>' +
        '<p>' + Math.round(M.ill * 100) + '% lit' + (age == null ? '' : ', ' + age.toFixed(1) + ' days since new Moon') + '</p>' +
        '<p>' + esc(fmt(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + fTime(t) + ' in ' + place.name) + '</p>' +
        (nextFull ? '<p>Next full Moon: ' + esc(fDayY(nextFull.date)) + '</p>' : '') +
        (nextNew ? '<p>Next new Moon: ' + esc(fDayY(nextNew.date)) + '</p>' : '') +
        '<p><i>Drawn as seen from the ' + (north ? 'Northern' : 'Southern') + ' Hemisphere.</i></p>';
      if (mapA) mapA.setAttribute('href', mapA.getAttribute('href').split('?')[0] + '?date=' + P.y + '-' + pad(P.m) + '-' + pad(P.d) + '&time=' + pad(P.h) + ':' + pad(P.mi));
      // the same phase on the same date in other years: from this year on, and every 19 years from the date
      var dm = dayMonth.format(new Date(Date.UTC(2000, P.m - 1, P.d))); // 2000 has a 29 February
      var from = Math.max(P.y + 1, Sky.partsIn(new Date(), place.tz).y), same = [];
      for (var y = from; y <= 2100 && same.length < 4; y++) if (exists(y, P.m, P.d) && moonAt(y, P).key === M.key) same.push(y);
      var meton = [];
      for (var k = 1; k <= 4 && P.y + 19 * k <= 2100; k++) {
        if (!exists(P.y + 19 * k, P.m, P.d)) continue;
        var m19 = moonAt(P.y + 19 * k, P);
        meton.push((P.y + 19 * k) + ' (' + Math.round(m19.ill * 100) + '% lit)');
      }
      again.innerHTML = '<h2 class="h3">When this Moon comes back</h2>' +
        (same.length ? '<p>The same phase (' + esc(lower(M.key)) + ') falls on ' + esc(dm) + ' again in ' + list(same) + '.</p>' : '') +
        (meton.length ? '<p>Almost the same Moon every 19 years: ' + esc(list(meton)) + '.</p>' : '');
      again.hidden = !(same.length || meton.length);
    }
    form.addEventListener('input', draw);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    listeners.push(draw);
    redrawers.push(draw);
    draw();
  }

  function query() {
    var q = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) { /* no URLSearchParams */ }
    return q;
  }

  /* ---------------- meteor showers from the place ---------------- */
  function initMeteors(el) {
    var years = $$('tr[data-year]', el).map(function (tr) { return +tr.getAttribute('data-year'); });
    var y0 = Math.min.apply(null, years), y1 = Math.max.apply(null, years);
    function render() {
      localiseTimes(el);
      var from = new Date(Date.UTC(y0, 0, 1) - 10 * 864e5), to = new Date(Date.UTC(y1 + 1, 0, 10));
      var now = new Date();
      EV.meteorShowers(from, to, place).forEach(function (s) {
        var tr = $('tr[data-shower="' + s.shower + '"][data-year="' + s.date.getUTCFullYear() + '"]', el);
        if (!tr) return;
        var cell = $('[data-local]', tr), txt;
        if (s.rate > 0 && s.best) txt = 'Best ' + fDay(s.best) + ' around ' + fTime(s.best) + ': up to ' + s.rate + ' an hour' + (s.moonBright ? ', with a bright Moon' : '');
        else txt = 'Radiant too low from here';
        cell.textContent = txt;
        tr.classList.toggle('past', s.activeTo < now);
      });
    }
    listeners.push(render);
    render();
  }

  /* ---------------- the printable star map ---------------- */
  function initStarMap(el) {
    var form = $('[data-map-form]', el), cv = $('[data-map]', el), save = $('[data-map-save]', el), out = $('.map-out', el);
    var dateIn = form.elements.date, timeIn = form.elements.time, titleIn = form.elements.title;
    var p0 = Sky.partsIn(new Date(), place.tz);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    dateIn.value = p0.y + '-' + pad(p0.m) + '-' + pad(p0.d);
    var q = query();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.date || '') && q.date >= '1900-01-01' && q.date <= '2100-12-31') dateIn.value = q.date;
    if (/^\d{2}:\d{2}$/.test(q.time || '')) timeIn.value = q.time;
    var url = null, img = null, pending = 0;
    function when() {
      var a = (dateIn.value || '').split('-').map(Number), b = (timeIn.value || '21:00').split(':').map(Number);
      if (a.length !== 3 || !a[0]) a = [p0.y, p0.m, p0.d];
      return Sky.fromLocal(a[0], a[1], a[2], b[0] || 0, b[1] || 0, place.tz);
    }
    function draw() {
      var style = (form.querySelector('input[name=style]:checked') || {}).value || 'print', print = style === 'print';
      var t = when(), W = cv.width, H = cv.height, k = W / 2400, ctx = cv.getContext('2d');
      var ink = print ? '#111827' : '#f2f0fb', soft = print ? '#4b5563' : '#b9bde3';
      ctx.fillStyle = print ? '#ffffff' : '#0f1130';
      ctx.fillRect(0, 0, W, H);
      if (!print) R.PALETTES.dusk.skyTop = '#171a3f';
      drawChartAt(ctx, W / 2, 1420 * k, 1020 * k, t, place, { palette: print ? 'print' : 'dusk', dpr: 2.4 * k, limitMag: 5.5, nameMag: 1.8 });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink;
      ctx.font = '500 ' + Math.round(116 * k) + 'px ' + FONT;
      ctx.fillText(titleIn.value.trim() || 'The sky over ' + place.name, W / 2, 220 * k, W - 200 * k);
      ctx.fillStyle = soft;
      ctx.font = '400 ' + Math.round(52 * k) + 'px ' + FONT;
      ctx.fillText(fmt(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }), W / 2, 310 * k, W - 200 * k);
      ctx.fillText(Math.abs(place.lat).toFixed(2) + '° ' + (place.lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(place.lon).toFixed(2) + '° ' + (place.lon >= 0 ? 'E' : 'W'), W / 2, 2600 * k, W - 200 * k);
      ctx.font = '400 ' + Math.round(40 * k) + 'px ' + FONT;
      ctx.fillText('Hold the map above your head with the top towards north.', W / 2, 2700 * k, W - 240 * k);
      ctx.fillText('Made with Stellarwise. Positions: Astronomy Engine. Stars: Yale Bright Star Catalogue.', W / 2, 3080 * k, W - 240 * k);
      cv.setAttribute('aria-label', 'Star map of the sky over ' + place.name + ', ' + fDayY(t) + ', ' + fTime(t));
      var mine = ++pending;
      if (cv.toBlob) cv.toBlob(function (b) {
        if (!b || mine !== pending) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(b);
        save.href = url;
        save.setAttribute('download', 'star-map-' + (dateIn.value || 'tonight') + '.png');
      }, 'image/png');
    }
    form.addEventListener('input', draw);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    $('[data-map-print]', el).addEventListener('click', function () { window.print(); });
    window.addEventListener('beforeprint', function () {
      if (!img) { img = d.createElement('img'); img.className = 'print-img'; img.alt = ''; out.appendChild(img); }
      img.src = cv.toDataURL('image/png');
    });
    save.addEventListener('click', function (e) { if (!url) e.preventDefault(); });
    listeners.push(function () { titleIn.placeholder = 'The sky over ' + place.name; draw(); });
    redrawers.push(draw);
    titleIn.placeholder = 'The sky over ' + place.name;
    draw();
  }

  /* ---------------- month tables: sunrise and sunset, moonrise and moonset ---------------- */
  // A month of rise and set times for the chosen place, worked out in the browser.
  function monthTool(el, rowsFor, summary) {
    var head = $('[data-mt-title]', el), body = $('tbody', el), sum = $('[data-mt-sum]', el), ym = null;
    function render() {
      var now = new Date();
      if (!ym) { var p = Sky.partsIn(now, place.tz); ym = { y: p.y, m: p.m }; }
      var days = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate(), nowP = Sky.partsIn(now, place.tz), html = '';
      for (var dd = 1; dd <= days; dd++) {
        var isToday = nowP.y === ym.y && nowP.m === ym.m && nowP.d === dd;
        html += '<tr' + (isToday ? ' class="today"' : '') + '>' + rowsFor(ym.y, ym.m, dd) + '</tr>';
      }
      body.innerHTML = html;
      head.textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(ym.y, ym.m - 1, 15))) + ', ' + place.name;
      if (sum) sum.innerHTML = summary(now);
      $$('[data-tz-note]', el).forEach(function (n) { n.textContent = 'Times for ' + place.name + ' (' + place.tz.replace(/_/g, ' ') + '), worked out in your browser.'; });
      el.querySelector('.tbl').hidden = false;
    }
    $('[data-mt-prev]', el).addEventListener('click', function () { ym = ym.m === 1 ? { y: ym.y - 1, m: 12 } : { y: ym.y, m: ym.m - 1 }; render(); });
    $('[data-mt-next]', el).addEventListener('click', function () { ym = ym.m === 12 ? { y: ym.y + 1, m: 1 } : { y: ym.y, m: ym.m + 1 }; render(); });
    listeners.push(function () { ym = null; render(); });
    render();
  }
  var dash = '<span aria-label="none">–</span>';
  var tOr = function (t) { return t ? esc(fTime(t)) : dash; };
  var dayCell = function (y, m, dd) { return '<th scope="row">' + esc(fmt(Sky.fromLocal(y, m, dd, 12, 0, place.tz), { weekday: 'short', day: 'numeric', month: 'short' })) + '</th>'; };
  var hm = function (ms) { var mi = Math.round(ms / 60000); return Math.floor(mi / 60) + ' h ' + (mi % 60 < 10 ? '0' : '') + (mi % 60) + ' min'; };

  function initSun(el) {
    var memo = {};
    function day(y, m, dd) {
      var t = Sky.fromLocal(y, m, dd, 12, 0, place.tz), k = place.lat + ',' + place.lon + ',' + t.getTime();
      return memo[k] || (memo[k] = Sky.sunTimes(t, place, place.tz));
    }
    // the next local day (works across the end of a month: fromLocal takes day 32 as the 1st)
    function after(y, m, dd) { var p = Sky.partsIn(new Date(Sky.fromLocal(y, m, dd, 12, 0, place.tz).getTime() + 864e5), place.tz); return day(p.y, p.m, p.d); }
    function len(s) { return s.always === 'up' ? '24 h' : s.always === 'down' ? '0 h' : s.rise && s.set ? hm(s.set - s.rise) : dash; }
    function dark(s, next) {
      if (s.astroDusk && next.astroDawn) return esc(fTime(s.astroDusk)) + ' to ' + esc(fTime(next.astroDawn));
      if (s.always === 'down' && !s.astroDusk) return 'All night';
      return 'No full darkness';
    }
    monthTool(el, function (y, m, dd) {
      var s = day(y, m, dd), nx = after(y, m, dd);
      return dayCell(y, m, dd) +
        '<td data-label="First light">' + tOr(s.civilDawn) + '</td>' +
        '<td data-label="Sunrise">' + (s.always === 'up' ? 'Up all day' : s.always === 'down' ? 'Not up' : tOr(s.rise)) + '</td>' +
        '<td data-label="Sunset">' + (s.always ? dash : tOr(s.set)) + '</td>' +
        '<td data-label="Last light">' + tOr(s.civilDusk) + '</td>' +
        '<td data-label="Day length">' + len(s) + '</td>' +
        '<td data-label="Dark sky">' + dark(s, nx) + '</td>';
    }, function (now) {
      var p = Sky.partsIn(now, place.tz), s = day(p.y, p.m, p.d), nx = after(p.y, p.m, p.d);
      if (s.always === 'up') return '<p class="phase">The Sun doesn’t set today</p><p>It is above the horizon all day and night in ' + esc(place.name) + '.</p>';
      if (s.always === 'down') return '<p class="phase">The Sun doesn’t rise today</p><p>It stays below the horizon all day in ' + esc(place.name) + '.</p>';
      return '<p class="phase">Sunrise ' + tOr(s.rise) + ', sunset ' + tOr(s.set) + '</p>' +
        '<p>Today in ' + esc(place.name) + ': ' + len(s) + ' of daylight. First light ' + tOr(s.civilDawn) + ', last light ' + tOr(s.civilDusk) + '.</p>' +
        '<p>' + (s.astroDusk && nx.astroDawn ? 'Properly dark for stargazing from ' + esc(fTime(s.astroDusk)) + ' to ' + esc(fTime(nx.astroDawn)) + ' tomorrow.' : 'The sky doesn’t get fully dark tonight: the Sun stays less than 18° below the horizon.') + '</p>';
    });
  }

  function initMoonRS(el) {
    monthTool(el, function (y, m, dd) {
      var t = Sky.fromLocal(y, m, dd, 12, 0, place.tz), r = Sky.riseSetDay('moon', t, place, place.tz);
      var mi = Sky.moonInfo(Sky.fromLocal(y, m, dd, 21, 0, place.tz), place);
      return dayCell(y, m, dd) +
        '<td data-label="Moonrise">' + (r.always === 'up' ? 'Up all day' : r.always === 'down' ? 'Not up' : tOr(r.rise)) + '</td>' +
        '<td data-label="Moonset">' + (r.always ? dash : tOr(r.set)) + '</td>' +
        '<td data-label="Highest">' + (r.transit ? esc(fTime(r.transit)) + ' <small>' + Math.round(r.transitAlt) + '°</small>' : dash) + '</td>' +
        '<td data-label="At 9 pm">' + esc(PHASE[mi.key]) + ', ' + Math.round(mi.illum * 100) + '% lit</td>';
    }, function (now) {
      var rs = Sky.nextRiseSet('moon', now, place, 1.5), mi = Sky.moonInfo(now, place);
      return '<p class="phase">' + esc(PHASE[mi.key]) + ', ' + Math.round(mi.illum * 100) + '% lit</p>' +
        '<p>' + (rs.always === 'up' ? 'Up all day and night in ' + esc(place.name) + '.' : rs.always === 'down' ? 'Below the horizon all day in ' + esc(place.name) + '.' :
          'In ' + esc(place.name) + ': ' + [rs.rise ? 'next moonrise ' + esc(timeAndDay(rs.rise, now)) : '', rs.set ? 'next moonset ' + esc(timeAndDay(rs.set, now)) : ''].filter(Boolean).join(', ') + '.') + '</p>';
    });
  }

  /* ---------------- the solar eclipse of 2 August 2027 from any place ---------------- */
  function initEclipse(el) {
    var out = $('[data-ecl]', el), A = Sky.A;
    var peak = Date.parse(el.getAttribute('data-peak'));
    function render() {
      var e;
      try { e = A.SearchLocalSolarEclipse(A.MakeTime(new Date(peak - 8 * 864e5)), new A.Observer(place.lat, place.lon, 0)); } catch (x) { e = null; }
      var seen = e && Math.abs(e.peak.time.date - peak) < 2 * 864e5 && (e.peak.altitude > 0 || e.partial_begin.altitude > 0 || e.partial_end.altitude > 0);
      if (!seen) {
        out.innerHTML = '<p class="phase">Not visible from ' + esc(place.name) + '</p><p>The Moon’s shadow misses ' + esc(place.name) + ', or the Sun is below the horizon there during the eclipse. It is seen from Europe, North and East Africa and the Middle East.</p>';
        return;
      }
      var tot = e.kind === 'total' && e.total_begin;
      var low = e.peak.altitude < 10;
      var secs = tot ? Math.round((e.total_end.time.date - e.total_begin.time.date) / 5000) * 5 : 0; // to 5 s: see the note on the page
      out.innerHTML = '<p class="phase">' + (tot ? 'Total eclipse in ' : 'Partial eclipse in ') + esc(place.name) + '</p>' +
        '<p>' + (tot ? 'The Moon covers the whole Sun for <b>about ' + (secs >= 60 ? Math.floor(secs / 60) + ' min ' : '') + (secs % 60 < 10 && secs >= 60 ? '0' : '') + (secs % 60) + ' s</b>, from ' + esc(fTime(e.total_begin.time.date)) + ' to ' + esc(fTime(e.total_end.time.date)) + '.' :
          'The Moon covers <b>' + Math.round(e.obscuration * 100) + '%</b> of the Sun at the maximum.') + '</p>' +
        '<ul class="ecl-times">' +
        '<li><span>Begins</span><b>' + (e.partial_begin.altitude > 0 ? esc(fTime(e.partial_begin.time.date)) : 'before sunrise') + '</b></li>' +
        '<li><span>Maximum</span><b>' + esc(fTime(e.peak.time.date)) + '</b></li>' +
        '<li><span>Ends</span><b>' + (e.partial_end.altitude > 0 ? esc(fTime(e.partial_end.time.date)) : 'after sunset') + '</b></li>' +
        '<li><span>Sun’s height at maximum</span><b>' + Math.round(e.peak.altitude) + '°</b></li></ul>' +
        '<p class="tz-note">' + esc(fDayY(e.peak.time.date)) + ', ' + esc(place.name) + ' time (' + esc(place.tz.replace(/_/g, ' ')) + ').' + (low ? ' The Sun is low: you need a clear view of the horizon.' : '') + '</p>';
    }
    listeners.push(render);
    render();
  }

  var redrawers = [];
  $$('[data-tool=tonight]').forEach(initTonight);
  $$('[data-tool=moon]').forEach(initMoon);
  $$('[data-tool=moondate]').forEach(initMoonDate);
  $$('[data-tool=meteors]').forEach(initMeteors);
  $$('[data-tool=starmap]').forEach(initStarMap);
  $$('[data-tool=sun]').forEach(initSun);
  $$('[data-tool=moonrs]').forEach(initMoonRS);
  $$('[data-tool=eclipse]').forEach(initEclipse);
  var redraw = function () { redrawers.forEach(function (fn) { fn(); }); };
  if (d.fonts && d.fonts.load) Promise.all([d.fonts.load('500 16px Jost'), d.fonts.load('italic 400 16px Jost')]).then(redraw, function () { /* system font */ });
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 200); });
})();
