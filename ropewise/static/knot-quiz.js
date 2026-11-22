/* Ropewise site: the free "Name that knot" round on /knot-quiz/.
   Without JavaScript the page lists five questions with their answers in <details>. With it, this
   script plays them one at a time: four buttons, the answer straight away with a link to the knot,
   a score, and a new round of five drawn by the app's own quiz.js (window.Quiz) from the same data.
   Images and links for new rounds are made from the first printed question's own src and href,
   so the BASE prefix and the relative links of the private preview keep working. */
(function () {
  'use strict';
  var root = document.getElementById('quiz');
  var dataEl = document.getElementById('quiz-data');
  if (!root || !dataEl || !window.Quiz || !root.querySelector) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var N = data.n || 5;
  var byId = {};
  data.knots.forEach(function (k) { byId[k.id] = k; });
  var list = root.querySelector('.qlist');
  var help = root.querySelector('.qhelp');
  var play = root.querySelector('.qplay');
  var tpl = root.getAttribute('data-first');
  var tplImg = list.querySelector('.q img');
  var tplLink = list.querySelector('.qans a');
  if (!list || !play || !tpl || !tplImg || !tplLink) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function src(id) { return tplImg.getAttribute('src').replace('/' + tpl + '.svg', '/' + id + '.svg'); }
  function href(id) { return tplLink.getAttribute('href').replace('/' + tpl + '/', '/' + id + '/'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // The first round is the one printed in the page.
  var round = Array.prototype.map.call(list.querySelectorAll('.q'), function (li) {
    var choices = li.getAttribute('data-choices').split(',');
    return { knot: li.getAttribute('data-knot'), choices: choices, answer: choices.indexOf(li.getAttribute('data-knot')) };
  });
  var i = 0, score = 0, picked = null, missed = [];

  function scrollTo(el) { if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); }

  function showQuestion() {
    var q = round[i];
    picked = null;
    play.innerHTML =
      '<p class="qstatus"><span class="qn">Question ' + (i + 1) + ' of ' + round.length + '</span><span>Score ' + score + '</span></p>' +
      '<h3 class="qq" id="qq" tabindex="-1">Which knot is this?</h3>' +
      '<figure class="qfigure"><img src="' + esc(src(q.knot)) + '" alt="Question ' + (i + 1) + ': a finished knot" width="' + byId[q.knot].w + '" height="' + byId[q.knot].h + '" decoding="async"></figure>' +
      '<div class="qbtns" role="group" aria-labelledby="qq">' + q.choices.map(function (c, n) {
        return '<button type="button" class="qbtn" data-i="' + n + '"><span class="ql" aria-hidden="true">' + 'abcd'.charAt(n) + '</span><span class="qt">' + esc(byId[c].name) + '</span><span class="qm" aria-hidden="true"></span><span class="qsr"></span></button>';
      }).join('') + '</div>' +
      '<div class="qfb" id="qfb" tabindex="-1" hidden></div>';
  }

  function choose(n) {
    if (picked != null) return;
    var q = round[i];
    picked = n;
    var right = n === q.answer;
    if (right) score++; else missed.push(q.knot);
    Array.prototype.forEach.call(play.querySelectorAll('.qbtn'), function (b, m) {
      b.disabled = true;
      if (m === q.answer) { b.classList.add('right'); b.querySelector('.qm').textContent = '✓'; b.querySelector('.qsr').textContent = ', correct answer'; }
      else if (m === n) { b.classList.add('wrong'); b.querySelector('.qm').textContent = '✗'; b.querySelector('.qsr').textContent = ', your answer'; }
      else b.classList.add('dim');
    });
    var k = byId[q.knot];
    var last = i === round.length - 1;
    var fb = play.querySelector('#qfb');
    fb.className = 'qfb ' + (right ? 'ok' : 'no');
    fb.innerHTML = '<p><b class="verdict">' + (right ? 'Right.' : 'Not quite.') + '</b> It&rsquo;s the <a href="' + esc(href(k.id)) + '">' + esc(k.lc) + '</a>. ' + esc(k.summary) + '</p>' +
      '<p><button type="button" class="qnext">' + (last ? 'See your score' : 'Next question') + '</button></p>';
    fb.hidden = false;
    play.querySelector('.qstatus span:last-child').textContent = 'Score ' + score;
    fb.focus();
  }

  function showEnd() {
    var all = round.length;
    var msg = score === all ? 'Every one right. You know your knots.' : score >= all - 1 ? 'Nearly all of them. Have a look at the one you missed.' : 'Worth another look: each knot below has step-by-step diagrams.';
    play.innerHTML =
      '<div class="qend"><h3 id="qend" tabindex="-1">You named ' + score + ' of ' + all + ' knots</h3><p>' + msg + '</p>' +
      (missed.length ? '<ul class="qmissed">' + missed.map(function (id) { return '<li><a href="' + esc(href(id)) + '">' + esc(byId[id].name) + '</a></li>'; }).join('') + '</ul>' : '') +
      '<p class="qmore">The app has two more games, <i>What&rsquo;s next?</i> and <i>Right knot for the job</i>, with ten questions a round. <a href="#get">Get the app</a></p>' +
      '<p><button type="button" class="qagain">Play another round of five</button></p></div>';
    var h = play.querySelector('#qend');
    h.focus({ preventScroll: true }); scrollTo(h);
  }

  function newRound() {
    var seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    var last = {};
    round.forEach(function (q) { last[q.knot] = 1; });
    // Prefer five knots that weren't in the round just played.
    var pool = data.knots.filter(function (k) { return !last[k.id]; });
    round = window.Quiz.round(data.knots, 'name', { seed: seed, n: N * 4 }).filter(function (q) { return pool.some(function (k) { return k.id === q.knot; }); }).slice(0, N);
    if (round.length < N) round = window.Quiz.round(data.knots, 'name', { seed: seed, n: N });
    i = 0; score = 0; missed = [];
    showQuestion();
    var h = play.querySelector('#qq');
    h.focus({ preventScroll: true }); scrollTo(play);
  }

  play.addEventListener('click', function (e) {
    var b = e.target.closest('.qbtn');
    if (b) { choose(+b.getAttribute('data-i')); return; }
    if (e.target.closest('.qnext')) {
      i++;
      if (i >= round.length) { showEnd(); return; }
      showQuestion();
      var h = play.querySelector('#qq');
      h.focus({ preventScroll: true }); scrollTo(play);
      return;
    }
    if (e.target.closest('.qagain')) newRound();
  });

  list.hidden = true;
  if (help) help.hidden = true;
  play.hidden = false;
  root.classList.add('live');
  showQuestion();
})();
