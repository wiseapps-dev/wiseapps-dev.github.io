/*
 * Pre-cursive print styles: print letters whose downstrokes end with a small exit stroke at the
 * baseline, the step most schools take before joining. Built from the print letters (print.js)
 * with each model's own options; capitals and numbers stay print.
 *
 *   slanted       US slanted print with tails: sloped letters, a looped k, a curly y with a
 *                 fishhook, a q with a U-turn and rounded "tails" on a, d, h, i, k, l, m, n, t, u
 *   ukPrecursive  UK print with exit flicks on a, d, h, i, k, l, m, n, t, u
 *   deGrund       German Grundschrift style: upright print with small exit curves on a, d, h, i,
 *                 k, l, m, n, t, u
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.StyleSets = root.StyleSets || {}).precursive = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const P = typeof module === 'object' && module.exports ? require('./print.js') : root.StyleSets.print;
  const FLICK = 'adhiklmntu';
  const PRESETS = {
    slanted: { round: 0.86, capRound: 0.86, k: 'loop', y: 'u', q: 'flick', flick: FLICK, tail: 'tail' },
    ukPrecursive: { round: 0.84, capRound: 0.84, k: 'loop', y: 'u', q: 'flick', flick: FLICK },
    deGrund: { round: 0.86, capRound: 0.86, t: 'foot', flick: FLICK, one: 'flag', seven: 'bar' },
  };
  function make(name, opt) {
    return P.printSet(Object.assign({}, PRESETS[name] || {}, opt || {}, { flick: (PRESETS[name] || {}).flick || '' }, PRESETS[name] && PRESETS[name].tail ? { tail: PRESETS[name].tail } : {}));
  }
  return { make, PRESETS };
});
