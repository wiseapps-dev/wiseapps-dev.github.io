/*
 * Free web tools: the first-letter memorisation tool, the taster line-runner,
 * and cast links (/send/ makes them, /open/ opens them). They run on the
 * Scenewise app's own code (engine.js, castlink.js). Nothing is sent anywhere.
 */
(function () {
  'use strict';
  const E = window.Engine;
  if (!E) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nice = (k) => String(k).toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const smooth = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7z"/></svg>';

  // a link the server already wrote (so sub-folder and preview paths stay right)
  function hrefOf(part, fallback) {
    const a = $$('a[href]').find((x) => x.getAttribute('href').indexOf(part) !== -1);
    return a ? a.getAttribute('href') : fallback;
  }

  function setSeg(sg, val) {
    $$('button', sg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));
  }

  // Text with words hidden at a level (0 full .. 4 blank). Hidden words are tappable.
  function maskHtml(text, level, seed) {
    if (!level) return E.segments(text).map((x) => (x.k === 'd' ? `<span class="d">${esc(x.t)}</span>` : esc(x.t))).join('');
    return E.mask(text, level, seed).map((x) => {
      if (x.k === 'd') return `<span class="d">${esc(x.t)}</span>`;
      if (x.k !== 'w' || !x.hide) return esc(x.t);
      if (level === 3) return `<span class="w fl" role="button" tabindex="0" data-t="${esc(x.t)}" data-s="${esc(x.show)}">${esc(x.show)}</span>`;
      return `<span class="w gap" role="button" tabindex="0" aria-label="Hidden word" data-t="${esc(x.t)}">${esc(x.t)}</span>`;
    }).join('');
  }

  function toggleWord(w, force) {
    const on = force == null ? !w.classList.contains('shown') : force;
    w.classList.toggle('shown', on);
    if (w.classList.contains('fl')) w.textContent = on ? w.dataset.t : w.dataset.s;
    else w.setAttribute('aria-label', on ? w.dataset.t : 'Hidden word');
  }

  function wireReveal(el, onChange) {
    el.addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (w && el.contains(w)) { toggleWord(w); if (onChange) onChange(); }
    });
    el.addEventListener('keydown', (e) => {
      const w = e.target.closest && e.target.closest('.w');
      if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleWord(w); if (onChange) onChange(); }
    });
  }

  async function copyText(t) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; }
    } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ------------------------------------------------ first-letter tool */
  const EXAMPLE = "All the world's a stage,\nAnd all the men and women merely players;\nThey have their exits and their entrances,\nAnd one man in his time plays many parts,\nHis acts being seven ages.";
  const LETTER_HELP = {
    0: 'Full text. Read it aloud two or three times before you hide anything.',
    1: 'About a third of the words are hidden. Say it all aloud, filling the gaps.',
    2: 'About two thirds of the words are hidden, including every gap from "Some".',
    3: 'Only the first letter of each word. Punctuation and line breaks stay put.',
    4: 'Nothing but the shape of the text. Say it, then tap to check.',
  };

  function initLetters(root) {
    const ta = $('textarea', root);
    const out = $('[data-role=out]', root);
    const help = $('[data-role=level-help]', root);
    const count = $('[data-role=count]', root);
    const sg = $('[data-seg=level]', root);
    const btnReveal = $('[data-act=reveal]', root);
    const btnShuffle = $('[data-act=shuffle]', root);
    const btnCopy = $('[data-act=copy]', root);
    const st = { level: 3, seed: 1 };

    function revealLabel() {
      const ws = $$('.w', out);
      btnReveal.disabled = !ws.length;
      btnReveal.textContent = ws.length && ws.every((w) => w.classList.contains('shown')) ? 'Hide again' : 'Reveal all';
    }
    function render() {
      setSeg(sg, st.level);
      help.textContent = LETTER_HELP[st.level];
      const text = ta.value.replace(/\s+$/, '');
      btnShuffle.disabled = !(st.level === 1 || st.level === 2) || !text.trim();
      btnCopy.disabled = !text.trim();
      if (!text.trim()) {
        out.className = 'out empty';
        out.textContent = 'Paste some text above, then choose how much to hide.';
        count.textContent = '';
        revealLabel();
        return;
      }
      out.className = 'out';
      out.innerHTML = maskHtml(text, st.level, st.seed);
      const n = E.words(text).length;
      const hidden = $$('.w', out).length;
      count.textContent = `${n} word${n === 1 ? '' : 's'}` + (st.level ? `, ${hidden} hidden` : '');
      revealLabel();
    }

    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    sg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { st.level = Number(b.dataset.v); render(); }
    });
    wireReveal(out, revealLabel);
    root.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'example') { ta.value = EXAMPLE; render(); }
      else if (act === 'clear') { ta.value = ''; render(); ta.focus(); }
      else if (act === 'shuffle') { st.seed++; render(); }
      else if (act === 'reveal') {
        const ws = $$('.w', out);
        const all = ws.every((w) => w.classList.contains('shown'));
        ws.forEach((w) => toggleWord(w, !all));
        revealLabel();
      } else if (act === 'copy') {
        const t = ta.value.trim();
        if (!t) return;
        const ok = await copyText(E.firstLetters(t));
        const lbl = $('span', a);
        lbl.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { lbl.textContent = 'Copy first letters'; }, 1600);
      }
    });
    render();
  }

  /* ------------------------------------------------ speech (browser voices) */
  const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ|Princess)\b/i;
  const Voice = (function () {
    const synth = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
    let voices = [];
    let broken = !synth;
    let onBroken = null;
    const load = () => { try { voices = synth.getVoices() || []; } catch (e) { voices = []; } };
    if (synth) {
      load();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
      else synth.onvoiceschanged = load;
    }
    const want = (navigator.language || 'en-US').toLowerCase();
    // Most natural first: Edge "Natural"/neural, Apple Premium/Enhanced, Google;
    // the old desktop voices (Microsoft David/Zira, eSpeak, Fred…) last.
    function score(v) {
      let s = 0;
      const n = v.name || '';
      if ((v.lang || '').toLowerCase().replace('_', '-') === want) s += 30;
      if (/natural|neural/i.test(n)) s += 60;
      else if (/premium/i.test(n)) s += 55;
      else if (/enhanced/i.test(n)) s += 45;
      else if (/^google/i.test(n)) s += 40;
      else if (/online/i.test(n)) s += 35;
      if (/\b(david|zira|mark|hazel|desktop)\b|espeak|^(fred|junior|kathy|ralph)\b/i.test(n)) s -= 30;
      if (v.default) s += 3;
      return s;
    }
    // voices for the reader's language, best first (online voices included:
    // they're the most natural ones in Edge and Chrome)
    function usable() {
      const base = want.split('-')[0];
      return voices
        .filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(base) && !NOVELTY.test(v.name))
        .sort((a, b) => score(b) - score(a));
    }
    // a voice per character; pitch changes once the voices run out
    function cast(chars) {
      const list = usable();
      const pitches = [1, 0.85, 1.15, 0.95, 1.08, 0.78, 1.22];
      const out = {};
      chars.forEach((c, i) => {
        out[c] = list.length
          ? { voice: list[i % list.length], pitch: pitches[Math.floor(i / list.length) % pitches.length] }
          : { voice: null, pitch: pitches[i % pitches.length] };
      });
      return out;
    }
    function fail() {
      if (broken) return;
      broken = true;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      if (onBroken) onBroken();
    }
    // sentences joined into chunks, so long speeches aren't cut off part-way
    function chunks(t) {
      const parts = t.match(/[^.!?…]+(?:[.!?…]+["'’”)\]]*\s*|$)/g) || [t];
      const out = [];
      let buf = '';
      parts.forEach((p) => {
        if (buf && (buf + p).length > 180) { out.push(buf.trim()); buf = p; } else buf += p;
      });
      if (buf.trim()) out.push(buf.trim());
      return out.length ? out : [t];
    }
    function sayOne(text, v, rate) {
      return new Promise((resolve) => {
        let done = false;
        let started = false;
        const timers = [];
        const fin = (ok) => {
          if (done) return;
          done = true;
          timers.forEach(clearTimeout);
          resolve(ok);
        };
        const u = new window.SpeechSynthesisUtterance(text);
        if (v && v.voice) { u.voice = v.voice; u.lang = v.voice.lang; } else u.lang = navigator.language || 'en-US';
        u.pitch = (v && v.pitch) || 1;
        u.rate = rate || 1;
        u.onstart = () => { started = true; };
        u.onend = () => fin(true);
        u.onerror = (e) => fin(!!e && (e.error === 'interrupted' || e.error === 'canceled'));
        // never started: no working voice here
        timers.push(setTimeout(() => { if (!started) fin(false); }, 3000));
        // some browsers never fire onend: a generous safety net
        timers.push(setTimeout(() => fin(true), 3500 + (text.length * 95) / (rate || 1)));
        try { synth.speak(u); } catch (e) { fin(false); }
      });
    }
    async function pause(text, rate, live) {
      const n = text.split(/\s+/).filter(Boolean).length;
      const end = Date.now() + Math.min(8000, 800 + (n * 330) / (rate || 1));
      while (Date.now() < end && live()) await sleep(100);
    }
    async function say(text, v, rate, live) {
      if (!text) return;
      if (broken) return pause(text, rate, live);
      const parts = chunks(text);
      for (let i = 0; i < parts.length; i++) {
        if (!live()) return;
        const ok = await sayOne(parts[i], v, rate);
        if (!ok && live()) {
          fail();
          return pause(parts.slice(i).join(' '), rate, live);
        }
      }
    }
    // iOS only lets a page speak after a tap: start a silent utterance inside it
    function unlock() {
      if (broken) return;
      try {
        synth.cancel();
        const u = new window.SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch (e) { fail(); }
    }
    function stop() {
      if (!synth) return;
      try { synth.cancel(); } catch (e) { /* ignore */ }
    }
    return { cast, say, stop, unlock, ok: () => !broken, onBroken: (fn) => { onBroken = fn; } };
  })();

  /* ------------------------------------------------ run lines (taster) */
  const RUN_HELP = {
    0: 'Your whole line is shown. Good for a first read.',
    1: 'Some words are missing. Tap a gap to see it.',
    2: 'Most words are missing. Tap a gap to see it.',
    3: 'Only the first letter of each word.',
    4: 'Nothing but the shape of the line. Say it, then reveal.',
  };

  function initRun(root) {
    const FREE = Number(root.dataset.free) || 6;
    const applink = root.dataset.applink || '/#app';
    const panes = {};
    $$('[data-pane]', root).forEach((p) => { panes[p.dataset.pane] = p; });
    const ta = $('textarea', root);
    const feed = $('[data-role=feed]', root);
    const dock = $('[data-role=dock]', root);
    const noSpeech = $('[data-role=nospeech]', root);
    const st = { script: null, chars: [], mine: null, level: 1, cue: 'full', rate: 1, seed: Date.now() % 100000 };
    let rh = null;

    Voice.onBroken(() => { noSpeech.hidden = false; });

    function show(name) {
      Object.keys(panes).forEach((k) => { panes[k].hidden = k !== name; });
    }
    function err(msg) {
      const e = $('[data-role=paste-err]', root);
      e.textContent = msg || '';
      e.hidden = !msg;
    }
    function halt() {
      if (rh) rh.token++;
      Voice.stop();
    }

    function parse(preferred, info) {
      const text = ta.value;
      if (!text.trim()) { err('Paste a script first, or try the sample scene.'); return; }
      load(E.parse(text), preferred, info);
    }

    // A parsed script: pasted, the sample, or handed over from a cast link.
    // preferred: a character key or list of keys to pick; info: {from, forName, note} or null.
    function load(script, preferred, info) {
      const chars = E.characters(script).filter((c) => !c.group && !c.compound);
      if (!chars.length) {
        err('No character names found. Put each name in capitals before the line, like NELL: I came back.');
        show('paste');
        return false;
      }
      err('');
      if (info !== undefined) st.shared = info;
      st.script = script;
      st.chars = chars;
      const prefs = [].concat(preferred || [], st.mine || []);
      st.mine = prefs.find((k) => chars.some((c) => c.key === k)) || chars[0].key;
      $('[data-role=script-title]', root).textContent = script.title && script.title !== 'Untitled script' ? script.title : 'Your script';
      const sh = $('[data-role=shared]', root);
      const x = st.shared;
      if (x && (x.from || x.forName || x.note)) {
        sh.innerHTML = [x.from ? `<span>From <b>${esc(x.from)}</b></span>` : '', x.forName ? `<span>Prepared for <b>${esc(x.forName)}</b></span>` : ''].filter(Boolean).join('') +
          (x.note ? `<span class="q">${esc(x.note)}</span>` : '');
        sh.hidden = false;
      } else sh.hidden = true;
      const note = $('[data-role=setup-note]', root);
      if (chars.length === 1) {
        note.innerHTML = `Only one character found, so there's nobody else to read. For a speech or monologue, the <a href="${esc(hrefOf('first-letter-tool', '/first-letter-tool/'))}">first-letter tool</a> may suit you better.`;
        note.hidden = false;
      } else note.hidden = true;
      renderSetup();
      show('setup');
      root.scrollIntoView({ block: 'start', behavior: smooth() });
      return true;
    }

    // A script handed over by /open/ (#shared) or a cast link code in the address.
    async function fromLink() {
      const h = location.hash || '';
      const C = window.CastLink;
      let r = null;
      if (h === '#shared') {
        try { r = JSON.parse(sessionStorage.getItem('sw.shared') || 'null'); } catch (e) { r = null; }
        if (!r || !r.script) { err('That script is no longer here. Tap the link you were sent again.'); return; }
      } else if (C && C.extract(h)) {
        const code = C.extract(h);
        if (C.isLocked(code)) { err('This script has a password. Open the link you were sent, then choose Rehearse in your browser.'); return; }
        try { r = await C.decode(code); } catch (e) { err('That link is incomplete or damaged. Ask for it again.'); return; }
      } else return;
      ta.value = E.serialize(r.script);
      load(r.script, r.parts || [], { from: r.from || '', forName: r.forName || '', note: r.note || '' });
    }

    function renderSetup() {
      // count lines as the run will (ALL/BOTH lines in your scenes are yours too)
      const count = (k) => E.buildRun(st.script, { mine: [k] }).filter((s) => s.kind === 'mine' && !s.silent).length;
      $('[data-role=chips]', root).innerHTML = st.chars.map((c) => {
        const n = count(c.key);
        return `<button type="button" class="chip" data-char="${esc(c.key)}" aria-pressed="${c.key === st.mine}">${esc(nice(c.key))}<small> ${n} line${n === 1 ? '' : 's'}</small></button>`;
      }).join('');
      setSeg($('[data-seg=level]', root), st.level);
      setSeg($('[data-seg=cue]', root), st.cue);
      setSeg($('[data-seg=rate]', root), st.rate);
      $('[data-role=level-help]', root).textContent = RUN_HELP[st.level];
    }

    function start() {
      Voice.unlock();
      const steps = E.buildRun(st.script, { mine: [st.mine], cue: st.cue });
      let k = 0;
      steps.forEach((s) => { if (s.kind === 'mine' && !s.silent) s.n = ++k; });
      const others = [];
      steps.forEach((s) => { if (s.kind === 'cue' && others.indexOf(s.char) === -1) others.push(s.char); });
      if (rh) rh.token++;
      rh = { steps, i: 0, token: 0, total: k, cast: Voice.cast(others), seed: st.seed++ };
      feed.innerHTML = '';
      noSpeech.hidden = Voice.ok();
      show('run');
      root.scrollIntoView({ block: 'start', behavior: smooth() });
      play(0);
    }

    function lineNo() {
      let n = 0;
      for (let j = 0; j <= rh.i && j < rh.steps.length; j++) if (rh.steps[j].n) n = rh.steps[j].n;
      return n;
    }
    function progress() {
      const cap = Math.min(rh.total, FREE);
      const n = Math.min(lineNo(), cap);
      $('[data-role=progress]', root).innerHTML = rh.total
        ? `<b>${esc(nice(st.mine))}</b><span>Line ${n} of ${cap}${rh.total > FREE ? ' free' : ''}</span>`
        : `<b>${esc(nice(st.mine))}</b>`;
    }

    function bubbleHtml(s, i) {
      if (s.kind === 'head') return `<div class="bubble head" data-i="${i}"><div class="text">${esc(s.text)}</div></div>`;
      if (s.kind === 'dir') return `<div class="bubble dir" data-i="${i}"><div class="text">${esc(s.text)}</div></div>`;
      if (s.kind === 'cue') {
        const t = E.segments(s.text).map((x) => (x.k === 'd' ? `<span class="d">${esc(x.t)}</span>` : esc(x.t))).join('');
        return `<div class="bubble cue" data-i="${i}"><div class="speaker">${esc(nice(s.char))}</div><div class="text">${t}</div></div>`;
      }
      const lvl = s.silent ? 0 : st.level;
      return `<div class="bubble mine" data-i="${i}"><div class="speaker">${esc(nice(s.char))} <span class="you">(you)</span></div><div class="text">${maskHtml(s.text, lvl, rh.seed + E.hash(s.id))}</div></div>`;
    }

    function keepInView(el) {
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const bottom = window.innerHeight - (dock.offsetHeight || 0) - 16;
        if (r.bottom > bottom) window.scrollBy({ top: r.bottom - bottom, behavior: smooth() });
        else if (r.top < 70) window.scrollBy({ top: r.top - 70, behavior: smooth() });
      });
    }

    function bubble(i) {
      let el = $(`.bubble[data-i="${i}"]`, feed);
      if (!el) {
        feed.insertAdjacentHTML('beforeend', bubbleHtml(rh.steps[i], i));
        el = feed.lastElementChild;
      }
      $$('.bubble', feed).forEach((b) => {
        const j = Number(b.dataset.i);
        b.classList.toggle('now', j === i);
        b.classList.toggle('past', j < i);
      });
      keepInView(el);
      return el;
    }

    function setDock(html) { dock.innerHTML = html; }
    function dockPlaying() {
      setDock('<button type="button" class="btn" data-act="pause">Pause</button><button type="button" class="btn" data-act="skip">Skip ›</button>');
    }
    function dockMine() {
      if (st.level === 0) setDock('<span class="hint">Say your line out loud.</span><button type="button" class="btn primary" data-act="next">Next ›</button>');
      else setDock('<button type="button" class="btn" data-act="reveal">Reveal</button><button type="button" class="btn primary" data-act="next">Next ›</button>');
    }

    async function play(from) {
      const my = ++rh.token;
      const run = rh;
      const live = () => rh === run && run.token === my;
      for (let i = from; i < run.steps.length; i++) {
        if (!live()) return;
        run.i = i;
        const s = run.steps[i];
        if (s.kind === 'mine' && s.n > FREE) { locked(); return; }
        const el = bubble(i);
        progress();
        if (s.kind === 'mine') {
          if (s.silent) { await sleep(900); continue; }
          dockMine();
          return;
        }
        if (s.kind === 'cue') {
          dockPlaying();
          el.classList.add('speaking');
          await Voice.say(s.say, run.cast[s.char], st.rate, live);
          el.classList.remove('speaking');
        } else if (s.kind === 'dir') {
          dockPlaying();
          const end = Date.now() + 700;
          while (Date.now() < end && live()) await sleep(100);
        }
      }
      if (live()) finished();
    }

    function endDock() {
      setDock('<button type="button" class="btn" data-act="back">Settings</button><button type="button" class="btn primary" data-act="again">Run again</button>');
    }

    function locked() {
      halt();
      $$('.bubble', feed).forEach((b) => { b.classList.remove('now', 'speaking'); b.classList.add('past'); });
      const more = rh.total - FREE;
      feed.insertAdjacentHTML('beforeend', `<div class="locked" data-role="locked">
        <div class="lock">${LOCK}</div>
        <h3>The rest of your lines are in the Scenewise app</h3>
        <p>That's your ${FREE} free lines. You have ${more} more line${more === 1 ? '' : 's'} in this script.</p>
        <div class="locked-ghost" aria-hidden="true"><span style="width:94%"></span><span style="width:70%"></span><span style="width:86%"></span></div>
        <ul><li>Voices for every character</li><li>PDF and Word import</li><li>Progress saved by scene</li></ul>
        <a class="locked-cta" href="${esc(applink)}">${LOCK}<span>Get the Scenewise app</span></a>
        <div data-role="badges"></div>
      </div>`);
      const box = feed.lastElementChild;
      const tpl = document.getElementById('sw-badges');
      if (tpl && tpl.content) $('[data-role=badges]', box).appendChild(tpl.content.cloneNode(true));
      $('[data-role=progress]', root).innerHTML = `<b>${esc(nice(st.mine))}</b><span>${FREE} free lines done</span>`;
      endDock();
      keepInView(box);
    }

    function finished() {
      $$('.bubble', feed).forEach((b) => { b.classList.remove('now', 'speaking'); b.classList.add('past'); });
      feed.insertAdjacentHTML('beforeend', `<div class="done-panel">
        <h3>End of the scene</h3>
        <p>${rh.total ? `You ran all ${rh.total} of your line${rh.total === 1 ? '' : 's'}. Run it again with more words hidden.` : 'That\'s the end of the script.'} The Scenewise app does whole scripts, with a voice for every character and progress saved by scene.</p>
        <a class="btn primary" href="${esc(applink)}">See the app</a>
      </div>`);
      endDock();
      keepInView(feed.lastElementChild);
    }

    // ---- events
    $('[data-role=chips]', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-char]');
      if (!b) return;
      st.mine = b.dataset.char;
      $$('[data-char]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    $$('[data-seg]', root).forEach((sg) => {
      sg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const name = sg.dataset.seg;
        st[name] = name === 'cue' ? b.dataset.v : Number(b.dataset.v);
        setSeg(sg, b.dataset.v);
        if (name === 'level') $('[data-role=level-help]', root).textContent = RUN_HELP[st.level];
      });
    });
    wireReveal(feed);
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'sample') { ta.value = window.SAMPLE_SCRIPT || ''; parse('NELL', null); }
      else if (act === 'parse') parse(st.mine);
      else if (act === 'edit') { halt(); show('paste'); ta.focus(); }
      else if (act === 'start' || act === 'again') start();
      else if (act === 'stop' || act === 'back') { halt(); renderSetup(); show('setup'); root.scrollIntoView({ block: 'start', behavior: smooth() }); }
      else if (act === 'pause') {
        halt();
        $$('.bubble.speaking', feed).forEach((b) => b.classList.remove('speaking'));
        setDock('<button type="button" class="btn primary" data-act="resume">Resume</button><button type="button" class="btn" data-act="skip">Skip ›</button>');
      } else if (act === 'resume') play(rh.i);
      else if (act === 'skip') { halt(); $$('.bubble.speaking', feed).forEach((b) => b.classList.remove('speaking')); play(rh.i + 1); }
      else if (act === 'next') play(rh.i + 1);
      else if (act === 'reveal') {
        const cur = $(`.bubble[data-i="${rh.i}"]`, feed);
        const ws = cur ? $$('.w', cur) : [];
        const all = ws.length && ws.every((w) => w.classList.contains('shown'));
        ws.forEach((w) => toggleWord(w, !all));
        a.textContent = all ? 'Reveal' : 'Hide';
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && rh && !panes.run.hidden && $('[data-act=pause]', dock)) $('[data-act=pause]', dock).click();
    });
    window.addEventListener('pagehide', () => Voice.stop());
    fromLink();
  }

  /* ------------------------------------------------ open a cast link (/open/) */
  function initOpen(root) {
    const C = window.CastLink;
    const panes = {};
    $$('[data-pane]', root).forEach((p) => { panes[p.dataset.pane] = p; });
    const show = (name) => Object.keys(panes).forEach((k) => { panes[k].hidden = k !== name; });
    const web = $('[data-role=web]', root);
    const runBase = (web.getAttribute('href') || '/run-lines-online/').split('#')[0];
    const pwInput = $('#op-pw', root);
    const pwErr = $('[data-role=pw-err]', root);

    function problem(title, text) {
      $('[data-role=problem-title]', root).textContent = title;
      $('[data-role=problem-text]', root).textContent = text;
      show('problem');
    }
    function codeFrom(raw) {
      if (!C) return null;
      let code = C.extract(raw);
      if (!code) { try { code = C.extract(decodeURIComponent(raw)); } catch (e) { code = null; } }
      return code;
    }

    async function open(pw) {
      const raw = (location.hash || '').slice(1);
      if (!C || !window.crypto) return problem('Your browser can\'t open this link', 'It needs a newer browser. Update it, or open the link in the Scenewise app.');
      if (!raw.trim()) return problem('No script in this link', 'This page opens scripts sent with Scenewise. Tap the link you were sent again, or paste it below.');
      const code = codeFrom(raw);
      if (!code) return problem('This link is incomplete', 'Part of the link is missing. It may have been cut short when it was sent. Paste the whole message below, or ask for it again as a .scenewise file.');
      if (C.isLocked(code) && !pw) { pwErr.hidden = true; show('password'); return; }
      let r;
      try {
        r = await C.decode(code, pw);
      } catch (e) {
        const m = String(e && e.message);
        if (m === 'needs-password' || m === 'bad-password') {
          pwErr.textContent = 'That password didn\'t work. Check it with the person who sent the link.';
          pwErr.hidden = m !== 'bad-password';
          show('password');
          pwInput.select();
          return;
        }
        if (m === 'no-zip') return problem('Your browser can\'t open this link', 'It needs a newer browser. Update it, or open the link in the Scenewise app.');
        return problem('This link is incomplete or damaged', 'It may have been cut short when it was sent. Ask the sender to send it again, or as a .scenewise file, then paste it below.');
      }
      render(code, r);
    }

    function render(code, r) {
      const sc = r.script;
      $('[data-role=title]', root).textContent = sc.title;
      document.title = sc.title + ' | Scenewise';
      $('[data-role=meta]', root).innerHTML = [r.from ? `<span>From <b>${esc(r.from)}</b></span>` : '', r.forName ? `<span>Prepared for <b>${esc(r.forName)}</b></span>` : ''].filter(Boolean).join('');
      const note = $('[data-role=note]', root);
      note.textContent = r.note || '';
      note.hidden = !r.note;
      const parts = new Set(r.parts || []);
      const cs = E.characters(sc).filter((c) => !c.group);
      // counted the way the run counts them (ALL/BOTH lines in your scenes are yours too)
      const count = (k) => E.buildRun(sc, { mine: [k] }).filter((x) => x.kind === 'mine' && !x.silent).length;
      $('[data-role=chars]', root).innerHTML = cs.map((c) => {
        const n = count(c.key);
        return `<span class="chip${parts.has(c.key) ? ' yours' : ''}">${esc(nice(c.key))}<small> ${n} line${n === 1 ? '' : 's'}${parts.has(c.key) ? ', your part' : ''}</small></span>`;
      }).join('');
      const lines = sc.items.filter((it) => it.type === 'line').length;
      $('[data-role=counts]', root).textContent = `${sc.scenes.length} scene${sc.scenes.length === 1 ? '' : 's'}, ${lines} lines in all`;
      $('[data-role=app]', root).href = C.appLink(code);
      // hand the decoded script to the line-runner, so nobody has to paste anything
      let stored = false;
      try {
        sessionStorage.setItem('sw.shared', JSON.stringify({ script: sc, from: r.from, forName: r.forName, note: r.note, parts: r.parts }));
        stored = true;
      } catch (e) { stored = false; }
      web.href = runBase + '#' + (stored || C.isLocked(code) ? 'shared' : code);
      show('script');
    }

    $('[data-role=pwform]', root).addEventListener('submit', (e) => {
      e.preventDefault();
      if (pwInput.value) open(pwInput.value);
    });
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act=paste-open]');
      if (!a) return;
      const text = $('#op-paste', root).value;
      const code = codeFrom(text);
      if (!code) { $('[data-role=problem-text]', root).textContent = 'That doesn\'t look like a Scenewise link. Copy the whole link, or the whole message it came in, and try again.'; return; }
      if (location.hash.slice(1) === code) open();
      else location.hash = code;
    });
    window.addEventListener('hashchange', () => open());
    open();
  }

  /* ------------------------------------------------ send a script (/send/) */
  function initSend(root) {
    const C = window.CastLink;
    const ta = $('#sd-text', root);
    const fileIn = $('[data-role=file]', root);
    const step2 = $('[data-role=step2]', root);
    const result = $('[data-role=result]', root);
    const errEl = $('[data-role=err]', root);
    const f = (n) => $(`[data-f="${n}"]`, root);
    const st = { script: null, parts: new Set(), code: '', link: '' };

    function err(m) { errEl.textContent = m || ''; errEl.hidden = !m; }
    function stale() { result.hidden = true; }

    function parse() {
      const text = ta.value;
      if (!text.trim()) { err('Paste the script text first.'); return; }
      const s = E.parse(text);
      if (!E.characters(s).length) {
        err('No character names found. Put each name in capitals before the line, like NELL: I came back.');
        step2.hidden = true; stale();
        return;
      }
      err('');
      st.script = s;
      st.parts = new Set();
      f('title').value = s.title && s.title !== 'Untitled script' ? s.title : '';
      render();
      step2.hidden = false;
      stale();
      step2.scrollIntoView({ block: 'start', behavior: smooth() });
    }

    function render() {
      const sc = st.script;
      const cs = E.characters(sc);
      st.parts = new Set(Array.from(st.parts).filter((k) => cs.some((c) => c.key === k)));
      const lines = sc.items.filter((it) => it.type === 'line').length;
      $('[data-role=summary]', root).textContent = `${cs.length} character${cs.length === 1 ? '' : 's'}, ${lines} lines, ${sc.scenes.length} scene${sc.scenes.length === 1 ? '' : 's'}. ` +
        (cs.length > 1 ? 'Rename a character, or merge two names that are the same person.' : 'Only one character: fine for a monologue.') +
        (cs.length > 15 ? ' Some may be words that look like names: merge them into the right character.' : '');
      $('[data-role=chars]', root).innerHTML = cs.map((c) => `<div class="char-row" data-k="${esc(c.key)}">
          <span class="nm">${esc(nice(c.key))}<small>${c.lines} line${c.lines === 1 ? '' : 's'}${c.group ? ', group line' : ''}</small></span>
          <button type="button" class="btn ghost" data-act="rename">Rename</button>
          ${cs.length > 1 ? `<select data-act="merge" aria-label="Merge ${esc(nice(c.key))} into another character"><option value="">Merge into…</option>${cs.filter((x) => x.key !== c.key).map((x) => `<option value="${esc(x.key)}">${esc(nice(x.key))}</option>`).join('')}</select>` : ''}
        </div>`).join('');
      $('[data-role=parts]', root).innerHTML = cs.filter((c) => !c.group).map((c) =>
        `<button type="button" class="chip" data-part="${esc(c.key)}" aria-pressed="${st.parts.has(c.key)}">${esc(nice(c.key))}</button>`).join('');
      $('[data-role=preview]', root).innerHTML = sc.items.slice(0, 6).map((it) => {
        if (it.type === 'head') return `<div class="bubble head"><div class="text">${esc(it.text)}</div></div>`;
        if (it.type === 'dir') return `<div class="bubble dir"><div class="text">${esc(it.text)}</div></div>`;
        const t = E.segments(it.text).map((x) => (x.k === 'd' ? `<span class="d">${esc(x.t)}</span>` : esc(x.t))).join('');
        return `<div class="bubble cue"><div class="speaker">${esc(nice(it.char))}</div><div class="text">${t}</div></div>`;
      }).join('');
      const more = sc.items.length - 6;
      $('[data-role=preview-more]', root).textContent = more > 0 ? `…and ${more} more.` : '';
    }

    function swapKey(from, to) {
      if (st.parts.has(from)) { st.parts.delete(from); st.parts.add(to); }
    }
    function renameSave(row) {
      const inp = $('input', row);
      const name = inp ? inp.value.trim() : '';
      const key = row.dataset.k;
      if (name && E.keyOf(name) !== key) {
        st.script = E.renameChar(st.script, key, name);
        swapKey(key, E.keyOf(name));
        stale();
      }
      render();
    }

    async function create(btn) {
      if (!st.script || !C) return;
      const title = f('title').value.trim() || st.script.title || 'Untitled script';
      const script = Object.assign({}, st.script, { title });
      const pw = f('password').value;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Creating…';
      let code;
      try {
        code = await C.encode(script, { from: f('from').value.trim(), forName: f('forName').value.trim(), note: f('note').value.trim(), parts: Array.from(st.parts), password: pw || undefined });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = label;
        err(pw && !(window.crypto && crypto.subtle) ? 'Passwords need a secure (https) page. Try again without one, or on the live site.' : 'Something went wrong making the link. Try again.');
        return;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
      err('');
      st.code = code;
      st.title = title;
      // the same as CastLink.webLink(code) on the live site
      st.link = (root.dataset.web || C.WEB_BASE) + '#' + code;
      $('[data-role=link]', root).value = st.link;
      $('[data-role=len]', root).textContent = `${st.link.length.toLocaleString('en-AU')} characters`;
      $('[data-role=lockstate]', root).textContent = pw ? 'Password protected: send the password separately' : 'No password: anyone with the link can read it';
      $('[data-role=big]', root).hidden = st.link.length <= 60000;
      const base = ($('[data-role=open-base]', root).getAttribute('href') || '/open/').split('#')[0];
      $('[data-role=try]', root).href = base + '#' + code;
      result.hidden = false;
      result.scrollIntoView({ block: 'start', behavior: smooth() });
    }

    root.addEventListener('click', async (e) => {
      const part = e.target.closest('[data-part]');
      if (part) {
        const k = part.dataset.part;
        if (st.parts.has(k)) st.parts.delete(k); else if (st.parts.size < 10) st.parts.add(k);
        part.setAttribute('aria-pressed', String(st.parts.has(k)));
        stale();
        return;
      }
      const a = e.target.closest('[data-act]');
      if (!a || a.tagName === 'SELECT') return;
      const act = a.dataset.act;
      const row = a.closest('.char-row');
      if (act === 'file') fileIn.click();
      else if (act === 'sample') { ta.value = window.SAMPLE_SCRIPT || ''; parse(); }
      else if (act === 'parse') parse();
      else if (act === 'rename') {
        const name = nice(row.dataset.k);
        row.innerHTML = `<input class="input" value="${esc(name)}" maxlength="40" aria-label="New name for ${esc(name)}"><button type="button" class="btn primary" data-act="rename-save">Save</button><button type="button" class="btn ghost" data-act="rename-cancel">Cancel</button>`;
        const inp = $('input', row);
        inp.focus();
        inp.select();
      } else if (act === 'rename-save') renameSave(row);
      else if (act === 'rename-cancel') render();
      else if (act === 'create') create(a);
      else if (act === 'copy') {
        const ok = await copyText(st.link);
        const lbl = $('span', a);
        lbl.textContent = ok ? 'Copied' : 'Copy failed: select the link and copy it';
        setTimeout(() => { lbl.textContent = 'Copy link'; }, 1800);
      } else if (act === 'download') {
        const text = `Scenewise script: open with the Scenewise app or paste into ${root.dataset.web || C.WEB_BASE}\n\n${st.code}\n`;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const dl = document.createElement('a');
        dl.href = url;
        dl.download = ((st.title || 'script').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'script') + '.scenewise';
        document.body.appendChild(dl);
        dl.click();
        dl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    });
    root.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-act=merge]');
      if (!sel || !sel.value) return;
      const from = sel.closest('.char-row').dataset.k;
      st.script = E.mergeChars(st.script, from, sel.value);
      swapKey(from, sel.value);
      stale();
      render();
    });
    root.addEventListener('keydown', (e) => {
      const row = e.target.closest && e.target.closest('.char-row');
      if (!row || e.target.tagName !== 'INPUT') return;
      if (e.key === 'Enter') { e.preventDefault(); renameSave(row); }
      if (e.key === 'Escape') render();
    });
    step2.addEventListener('input', (e) => { if (!e.target.closest('.char-row')) stale(); });
    ta.addEventListener('input', () => { if (st.script) { st.script = null; step2.hidden = true; stale(); err(''); } });
    fileIn.addEventListener('change', () => {
      const file = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!file) return;
      if (/\.(pdf|docx?|pages|rtf|fdx|odt)$/i.test(file.name)) {
        err('That file type can\'t be read here. Copy and paste the text instead, or use the Scenewise app to open PDF, Word and Final Draft files.');
        return;
      }
      const r = new FileReader();
      r.onload = () => { ta.value = String(r.result || ''); st.script = null; parse(); };
      r.onerror = () => err('That file couldn\'t be read. Copy and paste the text instead.');
      r.readAsText(file);
    });
  }

  $$('[data-tool=letters]').forEach(initLetters);
  $$('[data-tool=run]').forEach(initRun);
  $$('[data-tool=open]').forEach(initOpen);
  $$('[data-tool=send]').forEach(initSend);
})();
