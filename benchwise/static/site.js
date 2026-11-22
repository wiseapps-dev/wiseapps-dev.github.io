/* Small helpers for rotation, guide and hub pages: print button, dismissible mobile call-to-action,
   and the sport / squad size filter on /rotations/. Everything works without it. */
(function () {
  'use strict';
  var d = document;

  // Print this chart
  Array.prototype.forEach.call(d.querySelectorAll('[data-print]'), function (b) {
    b.hidden = false;
    b.addEventListener('click', function () { window.print(); });
  });

  // Mobile sticky call-to-action (CSS hides it on wide screens). It only shows while none of the
  // key blocks (title, rotation grid, the in-page call-to-action, footer) is on screen, so it never
  // sits over them, and it stays away for the visit once dismissed.
  var stk = d.querySelector('[data-stk]');
  if (stk) {
    var key = 'bw-stk-off';
    var off = false;
    try { off = sessionStorage.getItem(key) === '1'; } catch (e) { /* storage blocked */ }
    if (!off) {
      var guard = d.querySelectorAll('.page-head, .sheet, .cta, .end-cta, .foot');
      if ('IntersectionObserver' in window && guard.length) {
        var vis = new Map();
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { vis.set(e.target, e.isIntersecting); });
          var any = false;
          vis.forEach(function (v) { if (v) any = true; });
          stk.hidden = off || any;
        });
        Array.prototype.forEach.call(guard, function (el) { io.observe(el); });
      } else {
        stk.hidden = false;
      }
      stk.querySelector('.stk-x').addEventListener('click', function () {
        off = true;
        stk.hidden = true;
        try { sessionStorage.setItem(key, '1'); } catch (e) { /* storage blocked */ }
      });
    }
  }

  // Rotation hub filter
  var f = d.querySelector('[data-filters]');
  if (!f) return;
  var sport = '';
  var size = '';
  var count = f.querySelector('.fl-count');
  var none = d.querySelector('.dir-none');
  function apply() {
    var shown = 0;
    Array.prototype.forEach.call(d.querySelectorAll('.dir-sport'), function (sec) {
      var okSport = !sport || sec.getAttribute('data-sport') === sport;
      var any = false;
      Array.prototype.forEach.call(sec.querySelectorAll('.dir-fmt'), function (row) {
        var vis = 0;
        Array.prototype.forEach.call(row.querySelectorAll('li[data-n]'), function (li) {
          var ok = okSport && (!size || li.getAttribute('data-n') === size);
          li.hidden = !ok;
          if (ok) vis++;
        });
        row.hidden = !vis;
        if (vis) any = true;
        shown += vis;
      });
      sec.hidden = !any;
    });
    count.textContent = shown + (shown === 1 ? ' chart' : ' charts');
    none.hidden = shown > 0;
  }
  f.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    Array.prototype.forEach.call(b.parentNode.querySelectorAll('button'), function (x) {
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
    if (b.hasAttribute('data-sport')) sport = b.getAttribute('data-sport');
    else size = b.getAttribute('data-n');
    apply();
  });
  f.hidden = false;
  apply();
})();
