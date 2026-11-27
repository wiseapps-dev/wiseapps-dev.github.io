/*
 * More free script tools: the cue script maker, the script breakdown (lines per character and a
 * scene chart) and the monologue timer. They read scripts with the Scenewise app's own parser
 * (engine.js). Everything runs in the browser: nothing is uploaded or stored.
 */
(function () {
  'use strict';
  const E = window.Engine;
  if (!E) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const nice = (k) => String(k).toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const setSeg = (sg, val) => $$('button', sg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));
  const segVal = (root, name) => { const b = $(`[data-seg=${name}] button[aria-pressed=true]`, root); return b ? b.dataset.v : null; };
  const nWords = (t) => E.words(t).length;
  const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const dirHtml = (t) => E.segments(t).map((x) => (x.k === 'd' ? `<span class="d">${esc(x.t)}</span>` : esc(x.t))).join('');
  function wireSegs(root, on) {
    $$('[data-seg]', root).forEach((sg) => sg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setSeg(sg, b.dataset.v);
      on();
    }));
  }
  function sample(root, ta, go) {
    const b = $('[data-act=sample]', root);
    if (b) b.addEventListener('click', () => { ta.value = window.SAMPLE_SCRIPT || ''; go(); });
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function parse(text) {
    const s = E.parse(text || '');
    return { s, chars: E.characters(s).filter((c) => !c.group) };
  }
  function chipsHtml(chars, mine) {
    return chars.map((c) => `<button type="button" class="chip" data-char="${esc(c.key)}" aria-pressed="${c.key === mine}">${esc(nice(c.key))}<small> ${c.lines} line${c.lines === 1 ? '' : 's'}</small></button>`).join('');
  }

  /* ---------------- cue script maker ---------------- */
  function initCues(root) {
    const ta = $('textarea', root), out = $('[data-role=out]', root), chips = $('[data-role=chips]', root), note = $('[data-role=note]', root);
    let P = null, mine = null;
    function render() {
      const text = ta.value;
      if (!text.trim()) { P = null; chips.innerHTML = ''; out.innerHTML = '<p class="help">Paste a script above, or try the sample scene.</p>'; note.textContent = ''; return; }
      P = parse(text);
      if (!P.chars.length) { chips.innerHTML = ''; out.innerHTML = '<p class="help err">No characters found. Put each name in capitals before the line, like <i>NELL: I came back.</i></p>'; return; }
      if (!mine || !P.chars.some((c) => c.key === mine)) mine = P.chars[0].key;
      chips.innerHTML = chipsHtml(P.chars, mine);
      const cueLen = segVal(root, 'cuelen'), show = segVal(root, 'show'), dirs = segVal(root, 'dirs') === 'yes';
      const items = P.s.items;
      let html = '', n = 0, lastScene = -1, prevLine = null;
      const plain = [];
      items.forEach((it) => {
        if (it.type === 'line' && it.char !== mine) { prevLine = it; return; }
        if (it.type !== 'line') return;
        if (it.scene !== lastScene) {
          const t = (P.s.scenes[it.scene] || {}).title || '';
          if (t) { html += `<h3 class="cs-scene">${esc(t)}</h3>`; plain.push('', t.toUpperCase(), ''); }
          lastScene = it.scene;
        }
        n++;
        let cue = '';
        if (prevLine && prevLine.scene === it.scene) {
          const words = cueLen === 'all' ? null : +cueLen;
          const ct = words ? E.lastPhrase(prevLine.text, words) : prevLine.text;
          cue = `<p class="cs-cue"><span class="cs-who">${esc(nice(prevLine.char))}</span> ${dirs ? dirHtml(ct) : esc(E.spoken(ct) || ct)}</p>`;
          plain.push(nice(prevLine.char) + ': ' + (dirs ? ct : (E.spoken(ct) || ct)));
        } else {
          cue = '<p class="cs-cue cs-none">(You start)</p>';
          plain.push('(You start)');
        }
        const body = dirs ? it.text : (E.spoken(it.text) || it.text);
        const shown = show === 'letters' ? esc(E.firstLetters(body)) : show === 'blank' ? '<span class="cs-blank" aria-label="Your line, hidden">' + '&nbsp;'.repeat(Math.min(60, body.length)) + '</span>' : dirs ? dirHtml(body) : esc(body);
        html += `<div class="cs-pair">${cue}<p class="cs-mine"><span class="cs-who">${esc(nice(mine))}</span> ${shown}</p></div>`;
        plain.push('    ' + nice(mine) + ': ' + (show === 'letters' ? E.firstLetters(body) : show === 'blank' ? '______' : body), '');
        prevLine = it;
      });
      const total = P.chars.find((c) => c.key === mine);
      note.textContent = `${n} line${n === 1 ? '' : 's'} for ${nice(mine)}, ${total ? total.words : 0} words.`;
      out.innerHTML = `<div class="cs-sheet"><p class="cs-title">${esc(P.s.title && P.s.title !== 'Untitled script' ? P.s.title + ': ' : '')}${esc(nice(mine))}, cue script</p>${html}</div>`;
      out.dataset.plain = plain.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }
    ta.addEventListener('input', render);
    chips.addEventListener('click', (e) => { const b = e.target.closest('[data-char]'); if (b) { mine = b.dataset.char; render(); } });
    wireSegs(root, render);
    sample(root, ta, render);
    $('[data-act=print]', root).addEventListener('click', () => window.print());
    $('[data-act=save]', root).addEventListener('click', () => { if (out.dataset.plain) download('cue-script-' + String(mine || 'part').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt', out.dataset.plain); });
    render();
  }

  /* ---------------- script breakdown ---------------- */
  const WPM = 140; // the Scenewise app's estimate for spoken lines
  function initBreakdown(root) {
    const ta = $('textarea', root), out = $('[data-role=out]', root);
    function render() {
      if (!ta.value.trim()) { out.innerHTML = '<p class="help">Paste a script above, or try the sample scene.</p>'; return; }
      const P = parse(ta.value);
      if (!P.chars.length) { out.innerHTML = '<p class="help err">No characters found. Put each name in capitals before the line, like <i>NELL: I came back.</i></p>'; return; }
      const totalW = P.chars.reduce((a, c) => a + c.words, 0), totalL = P.chars.reduce((a, c) => a + c.lines, 0);
      const scenes = P.s.scenes.length ? P.s.scenes : [{ title: 'Whole script' }];
      const rows = P.chars.map((c) => `<tr><th scope="row">${esc(nice(c.key))}</th><td>${c.lines}</td><td>${c.words}</td><td>${totalW ? Math.round((c.words / totalW) * 100) : 0}%</td><td>${c.scenes.length} of ${scenes.length}</td><td>${mmss((c.words / WPM) * 60)}</td></tr>`).join('');
      // scene chart: lines per character in each scene
      const per = scenes.map(() => ({}));
      P.s.items.forEach((it) => { if (it.type === 'line' && per[it.scene]) per[it.scene][it.char] = (per[it.scene][it.char] || 0) + 1; });
      const head = P.chars.map((c) => `<th scope="col"><span>${esc(nice(c.key))}</span></th>`).join('');
      const srows = scenes.map((sc, i) => `<tr><th scope="row">${esc(sc.title || 'Scene ' + (i + 1))}</th>${P.chars.map((c) => (per[i][c.key] ? `<td class="in">${per[i][c.key]}</td>` : '<td class="out-c"></td>')).join('')}</tr>`).join('');
      const pairs = [];
      for (let a = 0; a < P.chars.length; a++) for (let b = a + 1; b < P.chars.length; b++) {
        const n = scenes.filter((_, i) => per[i][P.chars[a].key] && per[i][P.chars[b].key]).length;
        if (n) pairs.push([n, P.chars[a].key, P.chars[b].key]);
      }
      pairs.sort((x, y) => y[0] - x[0]);
      out.innerHTML = `
        <p class="bd-sum"><b>${P.chars.length}</b> characters, <b>${scenes.length}</b> scene${scenes.length === 1 ? '' : 's'}, <b>${totalL}</b> lines and <b>${totalW.toLocaleString('en')}</b> spoken words: about <b>${Math.round(totalW / WPM)} minutes</b> of dialogue at ${WPM} words a minute, before pauses and action.</p>
        <div class="bd-wrap"><table class="bd"><caption>Lines per character</caption><thead><tr><th scope="col">Character</th><th scope="col">Lines</th><th scope="col">Words</th><th scope="col">Share</th><th scope="col">Scenes</th><th scope="col">Speaking time</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="bd-wrap"><table class="bd chart"><caption>Who is in each scene (lines spoken)</caption><thead><tr><th scope="col">Scene</th>${head}</tr></thead><tbody>${srows}</tbody></table></div>
        ${pairs.length ? `<p class="help">Most scenes together: ${pairs.slice(0, 3).map((p) => `${esc(nice(p[1]))} and ${esc(nice(p[2]))} (${p[0]})`).join(', ')}.</p>` : ''}`;
      out.dataset.csv = ['Character,Lines,Words,Scenes'].concat(P.chars.map((c) => `"${nice(c.key).replace(/"/g, '""')}",${c.lines},${c.words},${c.scenes.length}`)).join('\n') + '\n';
    }
    ta.addEventListener('input', render);
    sample(root, ta, render);
    $('[data-act=print]', root).addEventListener('click', () => window.print());
    $('[data-act=save]', root).addEventListener('click', () => { if (out.dataset.csv) download('script-breakdown.csv', out.dataset.csv); });
    render();
  }

  /* ---------------- monologue timer ---------------- */
  const PACES = [['Slow', 120], ['Steady', 140], ['Brisk', 160]];
  function initMono(root) {
    const ta = $('textarea', root), out = $('[data-role=out]', root), clock = $('[data-role=clock]', root), go = $('[data-act=go]', root), log = $('[data-role=log]', root);
    let t0 = null, acc = 0, timer = 0;
    const runs = [];
    function words() {
      // a character name in capitals at the start of a line ("NELL:") isn't spoken, so it isn't counted
      return nWords(ta.value.split('\n').map((l) => l.replace(/^\s*[\p{Lu}][\p{Lu} .'’-]{0,30}:\s*/u, '')).join('\n'));
    }
    function render() {
      const n = words(), target = +segVal(root, 'target');
      if (!n) { out.innerHTML = '<p class="help">Paste your monologue above to see how long it runs.</p>'; return; }
      const est = PACES.map(([l, w]) => `<li><span>${l}, ${w} words a minute</span><b>${mmss((n / w) * 60)}</b></li>`).join('');
      const steady = (n / 140) * 60;
      let fit = '';
      if (target) {
        const maxW = Math.floor((target / 60) * 140);
        fit = steady > target ? `<p class="mono-fit over">At a steady pace it runs about ${mmss(steady - target)} over ${mmss(target)}. Cut about <b>${n - maxW} words</b> (to ${maxW}), or check your own pace with the stopwatch.</p>`
          : `<p class="mono-fit">At a steady pace it fits in ${mmss(target)}, with about ${mmss(target - steady)} to spare for pauses.</p>`;
      }
      out.innerHTML = `<p class="mono-n"><b>${n}</b> spoken words</p><ul class="mono-est">${est}</ul>${fit}`;
    }
    function now() { return acc + (t0 != null ? (Date.now() - t0) / 1000 : 0); }
    function tick() { clock.textContent = mmss(now()); }
    go.addEventListener('click', () => {
      if (t0 == null) { t0 = Date.now(); go.textContent = 'Stop'; timer = setInterval(tick, 200); }
      else {
        acc = now(); t0 = null; clearInterval(timer); tick(); go.textContent = 'Start';
        const n = words();
        runs.push(acc);
        log.innerHTML = runs.map((s, i) => `<li>Run ${i + 1}: <b>${mmss(s)}</b>${n && s > 0 ? `, ${Math.round(n / (s / 60))} words a minute` : ''}</li>`).join('');
        acc = 0;
      }
    });
    $('[data-act=reset]', root).addEventListener('click', () => { clearInterval(timer); t0 = null; acc = 0; go.textContent = 'Start'; tick(); });
    ta.addEventListener('input', render);
    wireSegs(root, render);
    const ex = $('[data-act=example]', root);
    if (ex) ex.addEventListener('click', () => { ta.value = ex.dataset.text; render(); });
    render();
    tick();
  }

  $$('[data-tool=cues]').forEach(initCues);
  $$('[data-tool=breakdown]').forEach(initBreakdown);
  $$('[data-tool=mono]').forEach(initMono);
})();
