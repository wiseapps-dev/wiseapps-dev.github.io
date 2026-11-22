/*
 * The home page rehearsal: six lines from the sample play. Ross's lines are
 * cues; Nell's (yours) start in full, then fade to the first letter of each
 * word (the rest of each word becomes a blank of the same width) until you
 * check them. Tap, click or press Space to move the light to the next line.
 */
(function () {
  'use strict';
  var root = document.querySelector('[data-stage]');
  if (!root) return;
  var lines = Array.prototype.slice.call(root.querySelectorAll('.ln'));
  var bar = root.querySelector('.cuebar');
  var next = root.querySelector('[data-next]');
  var status = root.querySelector('[data-status]');
  var sound = root.querySelector('[data-sound]');
  var synth = window.speechSynthesis && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
  var steps = [];
  lines.forEach(function (el, i) {
    steps.push({ i: i, check: false });
    if (el.classList.contains('mine')) steps.push({ i: i, check: true });
  });
  var k = 0;
  var speak = false;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var intro = !still;

  var note = root.querySelector('[data-vnote]');
  var clip = null;

  // Fallback only: the best browser voice (Natural/Online/Google/Premium
  // first, the old desktop voices last).
  function bestVoice() {
    var list = synth ? synth.getVoices() : [];
    var best = null, top = -1;
    list.forEach(function (v) {
      if (!/^en/i.test(v.lang || '')) return;
      var n = v.name || '', s = 0;
      if (/natural|neural/i.test(n)) s += 60;
      else if (/premium/i.test(n)) s += 55;
      else if (/enhanced/i.test(n)) s += 45;
      else if (/^google/i.test(n)) s += 40;
      else if (/online/i.test(n)) s += 35;
      if (/david|zira|mark|desktop|espeak|fred|albert/i.test(n)) s -= 30;
      if (/en[-_](us|gb|au)/i.test(v.lang)) s += 5;
      if (s > top) { top = s; best = v; }
    });
    return best;
  }

  function hush() {
    if (clip) { try { clip.pause(); } catch (e) { /* ignore */ } }
    if (synth) synth.cancel();
  }

  function synthSay(text) {
    if (!synth) return;
    try {
      var u = new window.SpeechSynthesisUtterance(text);
      var v = bestVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en';
      u.rate = 0.95;
      synth.speak(u);
    } catch (e) { /* no voice here: the line is on screen anyway */ }
  }

  // Ross's lines are pre-recorded with a neural voice; the browser voice is
  // only used if a recording can't play.
  function say(el) {
    if (!speak || !el) return;
    hush();
    var text = el.getAttribute('data-say');
    var src = el.getAttribute('data-src');
    if (!src || !window.Audio) { synthSay(text); return; }
    clip = clip || new window.Audio();
    clip.src = src;
    var p = clip.play();
    if (p && p.catch) p.catch(function () { synthSay(text); });
  }

  function render(fromUser) {
    var s = steps[k];
    lines.forEach(function (el, i) {
      var now = !!s && s.i === i;
      el.classList.toggle('now', now);
      el.classList.toggle('past', !s || i < s.i);
      el.classList.toggle('later', !!s && i > s.i);
      if (now) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      if (el.classList.contains('mine')) {
        var open = !s || i < s.i || (now && s.check);
        el.classList.toggle('open', open);
      }
    });
    if (!s) {
      next.textContent = 'Run it again';
      status.textContent = 'That’s the scene. In the app the letters fade to a blank page, and the reader keeps going.';
      return;
    }
    var mine = lines[s.i].classList.contains('mine');
    if (!mine) {
      next.textContent = 'Next line';
      status.textContent = k === 0 ? 'Ross gives you your cue. Tap the script or press Space to go on.' : 'Ross gives you your cue.';
      if (fromUser) say(lines[s.i]);
    } else if (!s.check) {
      next.textContent = 'Check my line';
      status.textContent = 'Your line, cut to first letters. Say it out loud, then check it.';
    } else {
      next.textContent = 'Next line';
      status.textContent = 'How close were you?';
    }
  }

  function advance() {
    hush();
    if (intro) { endIntro(); return; }
    k = k >= steps.length ? 0 : k + 1;
    render(true);
  }

  // First look: Nell's lines in full, then each word fades to its first letter.
  function startIntro() {
    lines.forEach(function (el) { if (el.classList.contains('mine')) el.classList.add('open'); });
    next.textContent = 'Start';
    status.textContent = 'Here’s Nell’s part in full. Watch each word fade to its first letter.';
  }
  function endIntro() {
    if (!intro) return;
    intro = false;
    render(false);
  }

  root.classList.add('live');
  bar.hidden = false;
  if (!synth && !window.Audio) sound.hidden = true;
  if (intro) {
    startIntro();
    var later = function () { setTimeout(endIntro, 1800); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); later(); }
      }, { threshold: 0.5 });
      io.observe(root.querySelector('.script'));
    } else later();
  } else render(false);

  next.addEventListener('click', advance);
  root.querySelector('.script').addEventListener('click', advance);
  sound.addEventListener('click', function () {
    speak = !speak;
    sound.setAttribute('aria-pressed', String(speak));
    if (note) note.hidden = !speak;
    if (!speak) hush();
    else if (!intro && steps[k] && !lines[steps[k].i].classList.contains('mine')) say(lines[steps[k].i]);
  });
  // Space moves the scene on while it's on screen and nothing else has focus.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var a = document.activeElement;
    if (a && a !== document.body && !root.contains(a)) return;
    if (a && a.tagName === 'BUTTON') return; // buttons handle Space themselves
    var r = root.getBoundingClientRect();
    if (r.bottom < 80 || r.top > window.innerHeight - 80) return;
    e.preventDefault();
    advance();
  });
})();
