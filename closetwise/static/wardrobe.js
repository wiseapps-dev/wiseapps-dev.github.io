/* Two free wardrobe tools: the capsule wardrobe calculator (how many outfits a set of pieces makes, and
   which piece to add next) and the printable outfit calendar (built with the app's own month grid,
   Engine.monthWeeks). Everything runs in the browser; nothing is sent anywhere or stored. */
(function () {
  'use strict';
  var E = window.Engine;
  var n = function (form, name) { var v = String(form.elements[name].value).trim(); var x = Number(v); return v === '' ? 0 : x >= 0 && x <= 999 ? Math.floor(x) : NaN; };
  var fmt = function (x) { return x.toLocaleString('en-US'); };

  /* ---------------- capsule wardrobe calculator ---------------- */
  var cf = document.querySelector('[data-capsule]');
  if (cf) {
    var big = document.querySelector('[data-outfits]'), detail = document.querySelector('[data-cap-detail]'), next = document.querySelector('[data-cap-next]');
    var count = function (t, b, d, s, l, opt) {
      var base = t * b + d;
      var shoes = Math.max(1, s);
      var layers = l > 0 ? (opt ? l + 1 : l) : 1;
      return base * shoes * layers;
    };
    var run = function () {
      var t = n(cf, 'tops'), b = n(cf, 'bottoms'), d = n(cf, 'dresses'), s = n(cf, 'shoes'), l = n(cf, 'layers');
      var opt = cf.elements.optional.checked;
      if ([t, b, d, s, l].some(isNaN)) { big.textContent = '–'; detail.textContent = 'Enter whole numbers from 0 up.'; next.textContent = ''; return; }
      var o = count(t, b, d, s, l, opt), pieces = t + b + d + s + l;
      big.textContent = fmt(o);
      if (!o) { detail.textContent = 'Add at least one top and one bottom, or one dress, to make an outfit.'; next.textContent = ''; return; }
      var days = o;
      detail.textContent = fmt(pieces) + ' pieces make ' + fmt(o) + ' different outfit' + (o === 1 ? '' : 's') + ', if every piece goes with every other. ' +
        (days >= 365 ? 'That is a different outfit every day for more than a year.' : days >= 30 ? 'That is a different outfit every day for ' + Math.floor(days / 7) + ' weeks.' : 'That is ' + days + ' days before you repeat an outfit.') +
        (s ? '' : ' Shoes aren’t counted until you add a pair.');
      var opts = [['top', count(t + 1, b, d, s, l, opt)], ['bottom', count(t, b + 1, d, s, l, opt)], ['dress', count(t, b, d + 1, s, l, opt)], ['pair of shoes', count(t, b, d, s + 1, l, opt)], ['layer', count(t, b, d, s, l + 1, opt)]]
        .map(function (x) { return [x[0], x[1] - o]; }).sort(function (a, c) { return c[1] - a[1]; });
      next.innerHTML = 'Adding one more ' + opts[0][0] + ' adds the most outfits: <b>+' + fmt(opts[0][1]) + '</b>. ' +
        'One more ' + opts[1][0] + ' adds ' + fmt(opts[1][1]) + ', and one more ' + opts[opts.length - 1][0] + ' ' + fmt(opts[opts.length - 1][1]) + '.';
    };
    cf.addEventListener('input', run);
    cf.addEventListener('change', run);
    cf.addEventListener('submit', function (e) { e.preventDefault(); });
    run();
  }

  /* ---------------- printable outfit calendar ---------------- */
  var of = document.querySelector('[data-ocal]');
  if (of && E && E.monthWeeks) {
    var sheet = document.querySelector('[data-ocal-sheet]');
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var now = new Date();
    of.elements.month.value = String(now.getMonth() + 1);
    of.elements.year.value = String(now.getFullYear());
    var lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    if (/-(US|CA|MX|BR|JP|PH)\b/i.test(lang)) { of.elements.week.value = '0'; of.elements.paper.value = 'letter'; }
    var pageStyle = document.createElement('style');
    document.head.appendChild(pageStyle);
    var draw = function () {
      var m = Number(of.elements.month.value), y = Number(of.elements.year.value), ws = Number(of.elements.week.value);
      if (!(m >= 1 && m <= 12) || !(y >= 1900 && y <= 2200)) return;
      var weeks = E.monthWeeks(y, m, ws);
      var mm = (m < 10 ? '0' : '') + m;
      var head = '';
      for (var i = 0; i < 7; i++) head += '<th scope="col">' + DAYS[(ws + i) % 7] + '</th>';
      var rows = weeks.map(function (w) {
        return '<tr>' + w.map(function (d) {
          var inMonth = d.slice(0, 7) === y + '-' + mm;
          return '<td class="' + (inMonth ? 'in' : 'out') + '">' + (inMonth ? '<span class="dn">' + Number(d.slice(8)) + '</span><span class="ln"></span><span class="ln"></span>' : '') + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var tally = of.elements.tally.checked
        ? '<table class="otally"><caption>Most worn this month</caption><thead><tr><th scope="col">Piece</th><th scope="col">Wears</th></tr></thead><tbody>' + new Array(7).join('<tr><td></td><td></td></tr>') + '</tbody></table>'
        : '';
      sheet.className = 'osheet rows' + weeks.length + (of.elements.tally.checked ? ' with-tally' : '');
      sheet.innerHTML = '<p class="otitle">' + MONTHS[m - 1] + ' ' + y + '<span>What I wore</span></p>' +
        '<table class="ocal"><caption class="sr">Outfit calendar for ' + MONTHS[m - 1] + ' ' + y + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>' + tally +
        '<p class="ofoot">closetwise</p>';
      pageStyle.textContent = '@page { size: ' + (of.elements.paper.value === 'letter' ? 'letter' : 'A4') + ' portrait; margin: 10mm; }';
    };
    of.addEventListener('input', draw);
    of.addEventListener('change', draw);
    of.addEventListener('submit', function (e) { e.preventDefault(); window.print(); });
    draw();
  }
})();
