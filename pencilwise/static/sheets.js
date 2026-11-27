// The worksheet maker on the style pages: runs the app's own worksheet.js in the page. Nothing you type
// leaves the browser, and nothing is stored.
(function () {
  var form = document.querySelector('[data-sheets]');
  if (!form || !window.Worksheet || !window.Styles) return;
  var W = window.Worksheet;
  var prev = document.querySelector('[data-preview]');
  var msg = form.querySelector('[data-msg]');
  var clean = function (s) { return String(s || '').normalize('NFC').replace(/[^\p{L}\p{M}0-9 '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20); };
  var val = function (n) { var r = form.querySelector('input[name=' + n + ']:checked'); return r ? r.value : ''; };
  var SETS = { lowercase: ['abc', 'abcdefghijklmnopqrstuvwxyz'], capitals: ['ABC', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], numbers: ['123', '0123456789'] };
  // A guess at the paper size from the browser's language (US Letter in the Americas, else A4)
  var guess = W.paperFor((navigator.languages && navigator.languages[0]) || navigator.language || 'en-US');
  var pr = form.querySelector('input[name=paper][value=' + guess + ']');
  if (pr) pr.checked = true;

  function job() {
    var style = form.elements.style.value, what = val('what'), size = val('size'), paper = val('paper');
    var rows, title, file;
    if (SETS[what]) {
      var chars = Array.from(SETS[what][1]);
      var per = W.build({ style: style, rows: [{ mode: 'blank' }], paper: paper, size: size }).perPage;
      var k = Math.max(1, Math.floor(per / 3));
      rows = [];
      for (var i = 0; i < chars.length; i += k) {
        chars.slice(i, i + k).forEach(function (ch) { rows.push({ repeat: ch, mode: 'model' }, { repeat: ch, mode: 'trace' }, { repeat: ch, mode: 'start' }); });
        while (rows.length % per) rows.push({ mode: 'blank' });
      }
      title = SETS[what][0];
      file = style + '-' + what;
    } else if (what === 'letter') {
      var ch = form.elements.letter.value;
      rows = W.letterRows(style, ch, { pair: true });
      title = ch.toUpperCase() + ch;
      file = style + '-letter-' + ch;
    } else {
      var word = clean(form.elements.word.value);
      if (!word) return null;
      rows = W.nameRows(style, word);
      title = word;
      var slug = word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      file = style + '-' + (slug || 'word');
    }
    return { style: style, rows: rows, title: title, paper: paper, size: size, file: 'worksheet-' + file + '.pdf' };
  }

  // The document info names Wise Apps as creator and producer. The info object is the last one before
  // the cross-reference table, so only the startxref offset moves.
  function brand(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    s = s.replace('/Creator (Pencilwise) /Producer (Pencilwise)', '/Creator (Wise Apps) /Producer (Wise Apps)');
    s = s.replace(/startxref\n\d+\n/, 'startxref\n' + (s.lastIndexOf('endobj\nxref\n') + 7) + '\n');
    var out = new Uint8Array(s.length);
    for (var j = 0; j < s.length; j++) out[j] = s.charCodeAt(j) & 255;
    return out;
  }

  function rowSVG(style, row) {
    var text = row.repeat ? Array(8).join(row.repeat + ' ').trim() : row.text || '';
    var lay = window.Styles.layout(style, text, 14);
    var w = Math.max(lay.width + 40, 640);
    var body = '';
    var mode = row.mode;
    if (mode !== 'blank') lay.items.forEach(function (it) {
      it.g.strokes.forEach(function (st) {
        var dx = it.x + 20;
        if (st.dot) {
          if (mode !== 'start') body += '<circle cx="' + (st.dot[0] + dx) + '" cy="' + st.dot[1] + '" r="4" fill="' + (mode === 'model' ? '#1d2b4f' : '#8b93a8') + '"/>';
          return;
        }
        var d = window.Glyphs.pathD(st);
        if (mode === 'model') body += '<path d="' + d + '" transform="translate(' + dx + ' 0)" fill="none" stroke="#1d2b4f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
        if (mode === 'trace') body += '<path d="' + d + '" transform="translate(' + dx + ' 0)" fill="none" stroke="#8b93a8" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 9"/>';
      });
      var first = it.g.strokes.find(function (s) { return !s.dot; });
      if (first && mode !== 'trace' && !it.joined) { var a = window.Glyphs.startOf(first); body += '<circle cx="' + (a.p[0] + it.x + 20) + '" cy="' + a.p[1] + '" r="6" fill="#22b46e"/>'; }
    });
    var lines = '<path d="M0 0H' + w + 'M0 150H' + w + '" stroke="#a8c6ea" stroke-width="1.5"/><path d="M0 50H' + w + '" stroke="#a8c6ea" stroke-width="1.5" stroke-dasharray="7 7"/><path d="M0 100H' + w + '" stroke="#dd6a6a" stroke-width="2"/>';
    return '<svg viewBox="0 -30 ' + w + ' 200" role="img" aria-label="' + (mode === 'blank' ? 'Blank writing lines' : text.replace(/"/g, '') + ', ' + (mode === 'model' ? 'solid with start dots' : mode === 'trace' ? 'dotted to trace' : 'start dots only')) + '">' + lines + body + '</svg>';
  }
  function sync() {
    var what = val('what');
    form.querySelectorAll('[data-show]').forEach(function (el) { el.hidden = el.getAttribute('data-show') !== what; });
  }
  function preview() {
    sync();
    var j = job();
    if (!j) { prev.innerHTML = ''; return; }
    prev.innerHTML = j.rows.slice(0, 3).map(function (r) { return rowSVG(j.style, r); }).join('');
  }
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var j = job();
    if (!j) { msg.textContent = 'Type a word or name first.'; return; }
    var r = W.build({ style: j.style, title: j.title, rows: j.rows, paper: j.paper, size: j.size });
    var url = URL.createObjectURL(new Blob([brand(r.bytes)], { type: 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = j.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    msg.textContent = 'Your worksheet is downloading (' + r.pages + (r.pages === 1 ? ' page).' : ' pages).');
  });
  preview();
})();
