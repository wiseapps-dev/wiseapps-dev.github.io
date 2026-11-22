/* Packing list generator. Quantities come from the Closetwise app's own engine (engine.js,
   copied unchanged at build time): Engine.packRules and Engine.tripEssentials. Labels are the
   app's English strings. Ticks live only in the page. */
(function () {
  'use strict';
  var E = window.Engine;
  var form = document.querySelector('[data-packer]');
  var list = document.querySelector('[data-list]');
  var strEl = document.getElementById('pk-strings');
  if (!E || !form || !list || !strEl) return;
  var S = JSON.parse(strEl.textContent);
  var days = form.elements.days;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var t = function (k, n) {
    var v = S[k];
    if (v && typeof v === 'object') v = v[n === 1 ? 'one' : 'other'];
    return String(v == null ? k : v).replace('{n}', n);
  };
  var picked = function (name) {
    return Array.prototype.filter.call(form.querySelectorAll('input[name=' + name + ']'), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  };

  // Start from the URL (?days=7&laundry=1&climate=hot,rain&act=beach), so trip pages can link here.
  var q = new URLSearchParams(location.search);
  if (q.has('days')) days.value = Math.max(1, Math.min(90, parseInt(q.get('days'), 10) || 3));
  if (q.has('laundry')) form.elements.laundry.checked = q.get('laundry') === '1';
  [['climate', 'climate'], ['act', 'act']].forEach(function (p) {
    if (!q.has(p[0])) return;
    var want = q.get(p[0]).split(',');
    Array.prototype.forEach.call(form.querySelectorAll('input[name=' + p[1] + ']'), function (i) { i.checked = want.indexOf(i.value) >= 0; });
  });

  function params() {
    var n = parseInt(days.value, 10);
    return {
      days: isFinite(n) ? Math.max(1, Math.min(90, n)) : 1,
      laundry: form.elements.laundry.checked,
      climate: picked('climate'),
      activities: picked('act'),
    };
  }

  function render(save) {
    var p = params();
    var rules = E.packRules(p);
    var ess = E.tripEssentials(p, null).map(function (e) { return e.key; });
    var on = {};
    Array.prototype.forEach.call(list.querySelectorAll('input:checked'), function (i) { on[i.getAttribute('data-k')] = true; });
    var note = rules.laundry && rules.days > 7 ? t('trip.laundryNote', rules.packFor) : t('trip.packingFor', rules.packFor);
    list.querySelector('[data-note]').textContent = note;
    list.querySelector('[data-clothes]').innerHTML = rules.lines.map(function (l) {
      return '<li><label><input type="checkbox" data-k="' + l.key + '"' + (on[l.key] ? ' checked' : '') + '><span class="q">' + l.qty +
        '</span><span class="n">' + esc(t('pack.' + l.key)) + '<small>' + esc(t('rule.' + l.rule)) + '</small></span></label></li>';
    }).join('');
    list.querySelector('[data-ess]').innerHTML = ess.map(function (k) {
      var id = 'ess-' + k;
      return '<li><label><input type="checkbox" data-k="' + id + '"' + (on[id] ? ' checked' : '') + '>' +
        '<span class="n">' + esc(t('ess.' + k)) + '</span></label></li>';
    }).join('');
    if (!save) return;
    var u = new URLSearchParams();
    u.set('days', p.days);
    u.set('laundry', p.laundry ? '1' : '0');
    if (p.climate.length) u.set('climate', p.climate.join(','));
    if (p.activities.length) u.set('act', p.activities.join(','));
    try { history.replaceState(null, '', location.pathname + '?' + u.toString().replace(/%2C/g, ',')); } catch (e) { /* file:// */ }
  }

  Array.prototype.forEach.call(form.querySelectorAll('[data-step]'), function (b) {
    b.addEventListener('click', function () {
      days.value = Math.max(1, Math.min(90, (parseInt(days.value, 10) || 1) + Number(b.getAttribute('data-step'))));
      render(true);
    });
  });
  form.addEventListener('input', function () { render(true); });
  form.addEventListener('change', function () {
    var n = parseInt(days.value, 10);
    days.value = isFinite(n) ? Math.max(1, Math.min(90, n)) : 1;
    render(true);
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  render(false);
})();
