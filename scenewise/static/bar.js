/*
 * The small "Get the app" bar on guide pages (phones only, see site.css).
 * It appears once you've started reading, steps aside while a tool or the
 * call-to-action at the end is on screen, and stays gone once dismissed.
 */
(function () {
  'use strict';
  var bar = document.querySelector('[data-bar]');
  if (!bar || !window.matchMedia) return;
  var KEY = 'sw.bar.hidden';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* storage blocked: show it */ }
  var phone = window.matchMedia('(max-width: 719px)');
  var blockers = 0;
  var dismissed = false;

  function update() {
    var show = !dismissed && phone.matches && window.scrollY > 500 && blockers === 0;
    bar.hidden = !show;
    document.body.classList.toggle('has-bar', show);
  }

  if ('IntersectionObserver' in window) {
    var seen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target);
      });
      blockers = seen.size;
      update();
    });
    document.querySelectorAll('.embed, .plug, .finale, .foot').forEach(function (el) { io.observe(el); });
  }
  bar.querySelector('[data-bar-x]').addEventListener('click', function () {
    dismissed = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* fine: hidden for this page */ }
    update();
  });
  window.addEventListener('scroll', update, { passive: true });
  if (phone.addEventListener) phone.addEventListener('change', update);
  update();
})();
