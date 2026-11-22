/* Ropewise site: the dismissible app bar on knot pages (mobile only, see site.css).
   It slides in once the reader has scrolled past the title, and steps aside when
   the page's own call to action is on screen. Body padding keeps it off the last lines. */
(function () {
  'use strict';
  var bar = document.querySelector('.stick');
  if (!bar) return;
  try { if (sessionStorage.getItem('rw-bar') === 'off') return; } catch (e) { /* storage blocked: show the bar */ }
  var past = false, atEnd = false;
  function update() { bar.classList.toggle('away', !past || atEnd); }
  bar.classList.add('away');
  bar.hidden = false;
  document.body.classList.add('has-stick');
  bar.querySelector('button').addEventListener('click', function () {
    bar.hidden = true;
    document.body.classList.remove('has-stick');
    try { sessionStorage.setItem('rw-bar', 'off'); } catch (e) { /* ignore */ }
  });
  if (!('IntersectionObserver' in window)) { past = true; update(); return; }
  var h1 = document.querySelector('h1');
  var get = document.getElementById('get');
  if (h1) new IntersectionObserver(function (es) { past = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; update(); }).observe(h1);
  if (get) new IntersectionObserver(function (es) { atEnd = es[0].isIntersecting; update(); }).observe(get);
})();
