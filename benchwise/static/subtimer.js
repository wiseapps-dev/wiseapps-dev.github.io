/* Substitution timer: a game clock that beeps and vibrates at every planned change. The change times
   come from the Benchwise app's engine (Engine.windows), and the clock is the app's own timestamp
   clock (Engine.clockStart etc.), so it keeps time even if the phone locks. Nothing is stored. */
(function () {
  'use strict';
  const E = window.Engine;
  const root = document.getElementById('subtimer');
  if (!root || !E) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMin = (m) => (Math.abs(m - Math.round(m)) < 0.01 ? String(Math.round(m)) : E.mmss(m));
  const clock2 = (sec) => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const plabel = (f, i) => (f.periods === 4 ? 'Quarter ' + (i + 1) : f.periods === 2 ? (i === 0 ? '1st half' : '2nd half') : 'Period ' + (i + 1));

  root.innerHTML = `
    <div class="calc-form st-form">
      <label class="wide">Sport and format<select id="sFmt">${E.FORMATS.map((f) => `<option value="${f.id}">${esc(f.id === 'custom' ? 'Other / custom' : f.name)}</option>`).join('')}</select></label>
      <label>Periods<input id="sPer" type="number" inputmode="numeric" min="1" max="8"></label>
      <label>Minutes per period<input id="sMin" type="number" inputmode="decimal" min="1" max="90" step="any"></label>
      <label>Change about every <span class="hint">minutes</span><input id="sEvery" type="number" inputmode="decimal" min="1" max="90" step="any"></label>
      <div class="full sw-row"><label class="switch"><input type="checkbox" id="sSound" checked><span>Beep</span></label><label class="switch"><input type="checkbox" id="sBuzz" checked><span>Vibrate (Android)</span></label><label class="switch"><input type="checkbox" id="sWake" checked><span>Keep the screen on</span></label></div>
    </div>
    <div class="timer" aria-live="off">
      <p class="t-per" id="sPerL">1st half</p>
      <p class="t-clock" id="sClock" role="timer" aria-label="Game clock">0:00</p>
      <p class="t-next" id="sNext"></p>
      <div class="t-btns"><button type="button" class="btn btn-lime big" id="sGo">Start</button><button type="button" class="btn" id="sBack" aria-label="Clock back 10 seconds">−10 s</button><button type="button" class="btn" id="sFwd" aria-label="Clock forward 10 seconds">+10 s</button><button type="button" class="btn" id="sPeriod">Next period</button><button type="button" class="btn" id="sReset">Reset</button></div>
      <p class="vh" aria-live="assertive" id="sSay"></p>
      <ol class="t-list" id="sList"></ol>
    </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const el = { fmt: $('sFmt'), per: $('sPer'), min: $('sMin'), every: $('sEvery') };
  let f = null, changes = [], clock = E.clockNew(), done = new Set(), tick = 0, wake = null, actx = null;

  function preset() {
    const b = E.format(el.fmt.value);
    el.per.value = b.periods; el.min.value = b.periodMin; el.every.value = b.every;
    el.every.disabled = b.subs === 'breaks';
  }
  function build() {
    const b = E.format(el.fmt.value);
    const per = Number(el.per.value), min = Number(el.min.value), every = Number(el.every.value);
    const ok = per >= 1 && per <= 8 && min > 0 && min <= 90 && (b.subs === 'breaks' || (every > 0 && every <= 90));
    [el.per, el.min, el.every].forEach((x) => x.classList.toggle('bad', !ok && !x.disabled && !(Number(x.value) > 0)));
    if (!ok) return false;
    f = Object.assign({}, b, { periods: Math.round(per), periodMin: min, every: b.subs === 'breaks' ? min : every });
    // the change times inside each period: the start of every window except the first of a period
    changes = E.windows(f).filter((w) => !w.first).map((w) => ({ period: w.period, at: w.start - w.period * f.periodMin }));
    return true;
  }
  function list() {
    const sec = E.clockSec(clock, Date.now());
    $('sList').innerHTML = changes.filter((c) => c.period === clock.period).map((c) => {
      const past = sec >= c.at * 60;
      return `<li class="${past ? 'done' : ''}"><b>${E.mmss(c.at)}</b> change${past ? ' <span>done</span>' : ''}</li>`;
    }).join('') + `<li class="${sec >= f.periodMin * 60 ? 'done' : ''}"><b>${E.mmss(f.periodMin)}</b> end of the ${f.periods === 4 ? 'quarter' : f.periods === 2 ? 'half' : 'period'}</li>`;
  }
  function beep(n) {
    if ($('sBuzz').checked && navigator.vibrate) navigator.vibrate(n > 1 ? [400, 150, 400, 150, 400] : [600, 200, 600]);
    if (!$('sSound').checked) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime;
      for (let i = 0; i < (n || 2); i++) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t0 + i * 0.45); g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.45 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.45 + 0.35);
        o.start(t0 + i * 0.45); o.stop(t0 + i * 0.45 + 0.4);
      }
    } catch (x) { /* no audio */ }
  }
  function show() {
    if (!f) return;
    const now = Date.now(), sec = Math.min(E.clockSec(clock, now), f.periodMin * 60);
    $('sPerL').textContent = plabel(f, clock.period) + ' of ' + f.periods;
    $('sClock').textContent = clock2(sec);
    const next = changes.find((c) => c.period === clock.period && c.at * 60 > sec + 0.001);
    const end = f.periodMin * 60;
    $('sNext').textContent = sec >= end ? (clock.period + 1 < f.periods ? 'Break. Press Next period when play restarts.' : 'Full time.')
      : next ? 'Next change in ' + clock2(next.at * 60 - sec) : 'No more changes this ' + (f.periods === 4 ? 'quarter' : f.periods === 2 ? 'half' : 'period') + '. Ends in ' + clock2(end - sec);
    // alerts: each change once, and the end of the period
    changes.forEach((c, i) => {
      const k = c.period + ':' + i;
      if (c.period === clock.period && sec >= c.at * 60 && !done.has(k)) {
        done.add(k);
        if (E.clockRunning(clock) && sec - c.at * 60 < 5) { beep(2); $('sSay').textContent = 'Change now'; root.querySelector('.timer').classList.add('flash'); setTimeout(() => root.querySelector('.timer').classList.remove('flash'), 2500); }
        list();
      }
    });
    const ek = clock.period + ':end';
    if (sec >= end && !done.has(ek)) {
      done.add(ek);
      if (E.clockRunning(clock)) { beep(3); $('sSay').textContent = 'End of the period'; }
      clock = E.clockPause(clock, now);
      $('sGo').textContent = 'Start';
      release();
      list();
    }
    $('sPeriod').disabled = clock.period + 1 >= f.periods;
  }
  async function lock() {
    if (!$('sWake').checked || !('wakeLock' in navigator)) return;
    try { wake = await navigator.wakeLock.request('screen'); } catch (x) { wake = null; }
  }
  function release() { if (wake) { wake.release().catch(() => {}); wake = null; } }
  function reset() {
    clock = E.clockNew(); done = new Set(); release();
    $('sGo').textContent = 'Start';
    if (build()) { list(); show(); }
  }
  // mark changes already passed (after the clock is moved) so they don't all beep at once
  function settle() {
    const sec = E.clockSec(clock, Date.now());
    changes.forEach((c, i) => { if (c.period === clock.period && sec >= c.at * 60) done.add(c.period + ':' + i); else done.delete(c.period + ':' + i); });
  }

  $('sGo').addEventListener('click', () => {
    if (!f) return;
    const now = Date.now();
    if (E.clockRunning(clock)) { clock = E.clockPause(clock, now); $('sGo').textContent = 'Start'; release(); }
    else {
      if (E.clockSec(clock, now) >= f.periodMin * 60) return;
      clock = E.clockStart(clock, now); $('sGo').textContent = 'Pause'; lock();
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (x) { /* no audio */ }
    }
    show();
  });
  $('sBack').addEventListener('click', () => { clock = E.clockAdjust(clock, -10, Date.now()); settle(); done.delete(clock.period + ':end'); list(); show(); });
  $('sFwd').addEventListener('click', () => { clock = E.clockAdjust(clock, 10, Date.now()); settle(); list(); show(); });
  $('sPeriod').addEventListener('click', () => { if (clock.period + 1 < f.periods) { clock = E.clockNextPeriod(clock); $('sGo').textContent = 'Start'; release(); list(); show(); } });
  $('sReset').addEventListener('click', () => { if (E.clockSec(clock, Date.now()) < 1 || confirm('Reset the clock to the start of the game?')) reset(); });
  el.fmt.addEventListener('change', () => { preset(); reset(); });
  [el.per, el.min, el.every].forEach((x) => x.addEventListener('input', reset));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && E.clockRunning(clock)) lock(); });
  const pre = root.dataset.format;
  el.fmt.value = pre && E.FORMATS.some((x) => x.id === pre) ? pre : 'soccer7';
  preset();
  reset();
  tick = setInterval(show, 250);
})();
