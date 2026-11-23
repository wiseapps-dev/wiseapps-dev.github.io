// Pencilwise site: replay the stroke-order diagrams, and a small dismissible app banner on phones.
(function () {
  document.querySelectorAll('[data-replay]').forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var svg = b.closest('figure').querySelector('svg.dia');
      svg.classList.remove('play');
      void svg.getBoundingClientRect();
      svg.classList.add('play');
    });
  });
  var stk = document.querySelector('[data-stk]');
  if (!stk) return;
  try { if (sessionStorage.getItem('pw-stk') === '0') return; } catch (e) { /* private mode */ }
  var ctas = document.querySelectorAll('.cta, .ws-form');
  var visible = new Set();
  var show = function () { stk.hidden = visible.size > 0 || window.scrollY < 500; };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); }); show(); });
    ctas.forEach(function (c) { io.observe(c); });
  }
  window.addEventListener('scroll', show, { passive: true });
  stk.querySelector('.stk-x').addEventListener('click', function () {
    stk.remove();
    try { sessionStorage.setItem('pw-stk', '0'); } catch (e) { /* ignore */ }
  });
})();
