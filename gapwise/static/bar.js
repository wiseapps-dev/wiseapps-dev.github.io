/* Mobile-only, dismissible app bar for calculator and guide pages.
   It appears after the first screen, hides while you type and when the end-of-page app section is
   on screen, and the page gets bottom padding so the bar never sits over the last content. */
(function () {
  'use strict';
  var bar = document.getElementById('bar');
  if (!bar || !window.matchMedia) return;
  var KEY = 'gapwise-bar-closed';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) { /* storage blocked: show anyway */ }
  var mq = window.matchMedia('(max-width: 699px)');
  var target = document.getElementById('get');
  var closed = false, atEnd = false, typing = false, scrolled = false;

  function update() {
    var on = !closed && mq.matches;
    document.body.classList.toggle('has-bar', on);
    bar.hidden = !(on && scrolled && !atEnd && !typing);
  }
  bar.querySelector('.bar-x').addEventListener('click', function () {
    closed = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    update();
  });
  window.addEventListener('scroll', function () {
    var s = window.scrollY > window.innerHeight * 0.8;
    if (s !== scrolled) { scrolled = s; update(); }
  }, { passive: true });
  if (target && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { atEnd = es[0].isIntersecting; update(); }).observe(target);
  }
  document.addEventListener('focusin', function (e) { typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName); update(); });
  document.addEventListener('focusout', function () { typing = false; update(); });
  if (mq.addEventListener) mq.addEventListener('change', update); else if (mq.addListener) mq.addListener(update);
  update();
})();
