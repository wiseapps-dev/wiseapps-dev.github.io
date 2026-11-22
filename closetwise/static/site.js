/* Closetwise site helpers: the closet demo filter on the home page, checklist tools (print, copy,
   untick), and the dismissible mobile call-to-action. Everything works without it. */
(function () {
  'use strict';
  var d = document;
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || d).querySelectorAll(sel), fn); };

  // ---- closet demo: filter chips, as in the app's closet screen
  var closet = d.querySelector('[data-closet]');
  if (closet) {
    var grid = closet.querySelector('.grid');
    var sum = closet.querySelector('[data-sum]');
    var tiles = Array.prototype.slice.call(grid.children);
    var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
    each('.chip', function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-f');
        each('.chip', function (c) { c.setAttribute('aria-pressed', String(c === chip)); }, closet);
        var all = tiles.filter(function (t) { return f === 'all' || t.getAttribute('data-cat') === f; });
        tiles.forEach(function (t) { t.hidden = true; });
        all.slice(0, 12).forEach(function (t, i) { t.hidden = false; t.style.setProperty('--i', i); });
        var total = all.reduce(function (a, t) { return a + Number(t.getAttribute('data-price') || 0); }, 0);
        var n = all.length;
        sum.textContent = (f === 'shoes' ? n + (n === 1 ? ' pair' : ' pairs') : n + (n === 1 ? ' piece' : ' pieces')) + ', ' + money(total) + ' in total';
        grid.classList.remove('anim');
        void grid.offsetWidth;
        grid.classList.add('anim');
      });
    });
  }

  // ---- checklists: print, copy as text, untick (lists may be re-rendered by pack.js)
  each('[data-print], [data-copy], [data-reset]', function (b) { b.hidden = false; });
  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-print], [data-copy], [data-reset]');
    if (!b) return;
    var list = b.closest('[data-list]');
    if (b.hasAttribute('data-print')) { window.print(); return; }
    if (b.hasAttribute('data-reset')) { each('input[type=checkbox]', function (i) { i.checked = false; }, list); return; }
    var lines = [];
    var title = d.querySelector('h1');
    if (title) lines.push(title.textContent.trim(), '');
    each('h3, li', function (el) {
      if (el.tagName === 'H3') { lines.push((lines.length > 2 ? '\n' : '') + el.textContent.trim()); return; }
      var qe = el.querySelector('.q');
      var q = qe ? qe.textContent.trim() : '';
      var n = el.querySelector('.n').firstChild.textContent.trim();
      var done = el.querySelector('input').checked ? '[x] ' : '[ ] ';
      lines.push(done + n + (q ? ', ' + q : ''));
    }, list);
    var text = lines.join('\n') + '\n';
    var said = list.querySelector('[data-copied]');
    var ok = function () { said.textContent = 'Copied'; setTimeout(function () { said.textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { fallback(text); ok(); });
    } else { fallback(text); ok(); }
  });
  function fallback(text) {
    var t = d.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    d.body.appendChild(t); t.select();
    try { d.execCommand('copy'); } catch (err) { /* nothing to do */ }
    d.body.removeChild(t);
  }

  // ---- mobile sticky call-to-action (CSS hides it on wide screens). It shows only while none of the
  // key blocks (page title, tools, lists, in-page call-to-action, footer) is on screen, and stays
  // away for the visit once dismissed.
  var stk = d.querySelector('[data-stk]');
  if (!stk || !('IntersectionObserver' in window)) return;
  var key = 'cw-stk-off';
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
  each('.lead, .calc, .packer, .trip, .look, .cta, .end, .foot, .rel', function (el) { io.observe(el); });
  stk.querySelector('.stk-x').addEventListener('click', function () {
    off = true;
    set(false);
    try { sessionStorage.setItem(key, '1'); } catch (err) { /* storage blocked */ }
  });
})();
