/* Cost per wear calculator: price ÷ (wears a month × months kept). Wears are whole days. */
(function () {
  'use strict';
  var form = document.querySelector('[data-calc]');
  if (!form) return;
  var out = document.querySelector('[data-cpw]');
  var detail = document.querySelector('[data-detail]');
  var num = function (name) {
    var v = String(form.elements[name].value).replace(',', '.').trim();
    return v === '' ? NaN : Number(v);
  };
  var fmt = function (n, dp) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  var plural = function (n, one, many) { return n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many); };

  function run() {
    var price = num('price');
    var perMonth = num('perMonth');
    var months = num('months');
    if (!(price >= 0) || !(perMonth >= 0) || !(months >= 0)) {
      out.textContent = '–';
      detail.textContent = 'Enter a price, how many days a month you’ll wear it and how many months you’ll keep it.';
      return;
    }
    var wears = Math.round(perMonth * months);
    if (wears < 1) {
      out.textContent = '–';
      detail.textContent = 'At this rate it won’t be worn at all. Try more wears a month or more months.';
      return;
    }
    var cpw = price / wears;
    out.textContent = fmt(cpw, cpw >= 1000 ? 0 : 2);
    var text = plural(wears, 'wear', 'wears') + ' over ' + plural(months, 'month', 'months') + '. ';
    var need = Math.max(1, Math.ceil(price - 1e-9));
    if (price <= 0) {
      text += 'Free pieces cost nothing a wear.';
    } else if (perMonth > 0) {
      var by = Math.ceil(need / perMonth - 1e-9);
      text += by <= months
        ? 'It reaches $1 a wear after ' + plural(need, 'wear', 'wears') + ', in month ' + by.toLocaleString('en-US') + '.'
        : 'It would need ' + plural(need, 'wear', 'wears') + ' to reach $1 a wear: ' + plural(by, 'month', 'months') + ' at this rate.';
    }
    detail.textContent = text;
  }
  form.addEventListener('input', run);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  run();
})();
