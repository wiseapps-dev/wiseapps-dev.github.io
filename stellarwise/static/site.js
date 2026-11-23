/* Stellarwise site helper: the dismissible mobile call-to-action. Everything works without it.
   It shows only while none of the key blocks (page title, tools, tables, call-to-action, footer) is on
   screen, and stays away for the visit once dismissed. CSS hides it on wide screens. */
(function () {
  'use strict';
  var d = document;
  var stk = d.querySelector('[data-stk]');
  if (!stk || !('IntersectionObserver' in window)) return;
  var key = 'zw-stk-off';
  var off = false;
  try { off = sessionStorage.getItem(key) === '1'; } catch (err) { /* storage blocked */ }
  if (off) return;
  var vis = new Map();
  var set = function (show) { stk.hidden = !show; d.body.classList.toggle('stk-on', show); };
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { vis.set(e.target, e.isIntersecting); });
    var any = false;
    vis.forEach(function (v) { if (v) any = true; });
    set(!off && !any);
  });
  Array.prototype.forEach.call(d.querySelectorAll('.lead, .tool, .tbl, .cta, .end, .foot, .rel, .sources'), function (el) { io.observe(el); });
  stk.querySelector('.stk-x').addEventListener('click', function () {
    off = true;
    set(false);
    try { sessionStorage.setItem(key, '1'); } catch (err) { /* storage blocked */ }
  });
})();
