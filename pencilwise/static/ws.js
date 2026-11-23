// The name tracing worksheet maker: runs the app's own worksheet.js in the page. The name never
// leaves the browser.
(function () {
  var form = document.querySelector('[data-ws]');
  if (!form || !window.Worksheet || !window.Styles) return;
  var prev = document.querySelector('[data-preview]');
  var msg = form.querySelector('[data-msg]');
  var clean = function (s) { return String(s || '').normalize('NFC').replace(/[^\p{L}\p{M} '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20); };
  var paper = function () { var r = form.querySelector('input[name=paper]:checked'); return r ? r.value : 'a4'; };
  // A guess at the paper size from the browser's language (US Letter in the Americas, else A4)
  var guess = window.Worksheet.paperFor((navigator.languages && navigator.languages[0]) || navigator.language || 'en-US');
  var pr = form.querySelector('input[name=paper][value=' + guess + ']');
  if (pr) pr.checked = true;
  function rowSVG(style, text, mode) {
    var lay = window.Styles.layout(style, text, 14);
    var w = Math.max(lay.width + 40, 640);
    var body = '';
    lay.items.forEach(function (it) {
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
    return '<svg viewBox="0 -30 ' + w + ' 200" role="img" aria-label="' + text.replace(/"/g, '') + '">' + lines + body + '</svg>';
  }
  function preview() {
    var name = clean(form.elements.name.value) || 'Mia';
    var style = form.elements.style.value;
    prev.innerHTML = rowSVG(style, name, 'model') + rowSVG(style, name, 'trace') + rowSVG(style, name, 'start');
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  form.querySelector('[data-make]').addEventListener('click', function () {
    var name = clean(form.elements.name.value);
    if (!name) { msg.textContent = 'Type a name first.'; return; }
    var style = form.elements.style.value;
    var r = window.Worksheet.build({ style: style, title: name, rows: window.Worksheet.nameRows(style, name), paper: paper() });
    var url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url;
    var slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[łŁ]/g, 'l').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = 'name-tracing-' + (slug || 'worksheet') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    msg.textContent = 'Your worksheet is downloading.';
  });
  preview();
})();
