/*
 * Cursive (joined) letters. Each lowercase letter is one stroke from its entry stroke on the
 * baseline to its exit stroke, as children first learn them one at a time; i and j have their dot,
 * t its cross and x its second slant after the pen lifts. Authored upright; the style's slant is
 * applied in styles.js. Numbers are the print numbers of the same country.
 *
 *   usCursive  US cursive in the traditional school model: loops on b, e, f, h, k, l; a d without
 *              a loop; the f and q loops close at the baseline on the right; the z descends with a
 *              loop. Capitals are the US print capitals, sloped like the cursive (the cursive
 *              capitals are not drawn yet).
 *   frCursive  French school cursive (écriture cursive): loops on b, f, h, k, l and below the line
 *              on f, g, j, y, z (the f's lower loop closes on the right, at the baseline); the French r and s; p and q with straight tails; t and d without
 *              loops. Capitals are the French print capitals (capitales d'imprimerie).
 *
 * Original drawings that follow each model's published letter-formation rules; no font was
 * copied or traced. Sources: LICENSES/THIRD_PARTY.md.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.StyleSets = root.StyleSets || {}).cursive = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const P = typeof module === 'object' && module.exports ? require('./print.js') : root.StyleSets.print;
  const W = (w, s) => ({ w, s });

  /* ---------------- US cursive ---------------- */
  function usLower() {
    const g = {};
    g.a = W(74, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 92 S 53 100 63 98 72 86']);
    g.b = W(60, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 34 15 70 16 96 K S 22 100 32 98 40 86 41 68 37 57 33 55 K S 38 52 48 52 58 55']);
    g.c = W(60, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 44 53 K S 35 50 24 53 17 65 16 84 24 99 38 99 50 92 58 82']);
    g.d = W(74, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 47 4 K L 47 92 S 53 100 63 98 72 86']);
    g.e = W(58, ['M 0 100 S 12 97 26 86 35 70 36 57 30 51 22 56 18 72 21 91 31 100 44 97 56 86']);
    g.f = W(56, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 100 15 136 19 148 27 142 30 124 25 106 K S 32 100 44 96 54 86']);
    g.g = W(72, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 132 S 42 147 32 149 25 140 30 122 44 108 58 98 70 86']);
    g.h = W(70, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 98 K S 18 74 25 58 35 52 43 58 45 78 45 92 K S 50 100 61 97 70 86']);
    g.i = W(50, ['M 0 100 S 9 92 17 72 22 52 K L 22 92 S 28 100 39 97 48 86', 'D 22 30']);
    g.j = W(50, ['M 0 100 S 9 92 17 72 22 52 K L 22 134 S 17 148 8 149 4 140 10 124 24 109 38 98 48 88', 'D 22 30']);
    g.k = W(66, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 98 K S 18 74 27 58 38 56 42 64 35 72 22 76 K S 32 84 38 96 46 100 56 96 64 86']);
    g.l = W(50, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 90 K S 22 100 34 98 46 86']);
    g.m = W(92, ['M 0 100 S 3 80 9 60 16 52 22 58 23 78 23 100 K S 25 78 30 60 37 52 44 58 45 78 45 100 K S 47 78 52 60 59 52 66 58 67 78 67 92 K S 73 100 83 98 91 86']);
    g.n = W(70, ['M 0 100 S 3 80 9 60 16 52 22 58 23 78 23 100 K S 25 78 30 60 37 52 44 58 45 78 45 92 K S 51 100 61 98 70 86']);
    g.o = W(62, ['M 0 100 S 8 93 15 76 21 60 28 52 36 50 K S 26 52 18 63 16 82 24 99 37 99 45 85 46 65 39 53 33 52 K S 38 50 48 51 58 55']);
    g.p = W(66, ['M 0 100 S 8 90 16 70 21 50 K L 21 148 K L 21 104 S 22 78 28 60 38 52 46 60 47 80 39 97 26 100 K S 38 100 50 96 60 86']);
    g.q = W(72, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 136 S 51 147 59 146 62 132 56 112 49 102 K S 60 98 72 88']);
    g.r = W(62, ['M 0 100 S 9 92 19 72 25 47 K S 31 52 38 51 K L 37 92 S 43 100 53 97 62 86']);
    g.s = W(54, ['M 0 100 S 10 92 19 72 25 47 K S 33 66 35 84 28 98 18 98 14 91 K S 24 100 38 98 52 88']);
    g.t = W(52, ['M 0 100 S 9 90 17 64 22 16 K L 22 92 S 28 100 39 97 50 86', 'M 10 50 L 38 50']);
    g.u = W(72, ['M 0 100 S 9 92 16 72 20 52 K S 20 80 23 96 32 100 40 95 44 80 46 52 K L 46 92 S 52 100 62 98 71 86']);
    g.v = W(66, ['M 0 100 S 3 80 9 60 17 51 23 57 27 78 31 100 K S 38 92 44 72 45 56 41 50 K S 46 48 56 50 65 54']);
    g.w = W(80, ['M 0 100 S 9 92 16 72 20 52 K S 20 80 23 96 31 100 37 94 39 76 40 54 K S 40 80 43 96 51 100 57 94 59 76 59 56 55 50 K S 60 48 70 50 79 54']);
    g.x = W(62, ['M 0 100 S 4 80 10 60 18 51 25 57 28 76 31 95 38 100 50 96 60 86', 'M 40 52 L 17 98']);
    g.y = W(72, ['M 0 100 S 3 80 9 60 17 51 23 57 25 78 29 96 37 100 45 93 47 74 48 52 K L 48 134 S 43 148 33 149 27 140 33 122 47 108 60 98 70 87']);
    g.z = W(62, ['M 0 100 S 3 80 9 60 17 51 28 51 35 58 33 70 22 77 K S 34 84 38 100 36 124 28 145 18 148 14 138 24 120 40 106 52 97 61 88']);
    return g;
  }

  /* ---------------- French school cursive ---------------- */
  function frLower() {
    const g = {};
    // French models start each letter from the baseline too ("le trait d'attaque").
    g.a = W(74, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 92 S 53 100 63 98 72 86']);
    g.b = W(62, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 34 15 70 16 96 K S 22 100 32 98 40 86 41 68 37 57 33 55 K S 38 52 48 52 60 55']);
    g.c = W(60, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 44 53 K S 35 50 24 53 17 65 16 84 24 99 38 99 50 92 58 82']);
    g.d = W(74, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 47 16 K L 47 92 S 53 100 63 98 72 86']);
    g.e = W(58, ['M 0 100 S 12 97 26 86 35 70 36 57 30 51 22 56 18 72 21 91 31 100 44 97 56 86']);
    g.f = W(56, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 100 15 136 19 148 27 142 30 124 25 106 K S 32 100 44 96 54 86']);
    g.g = W(72, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 132 S 42 147 32 149 25 140 30 122 44 108 58 98 70 86']);
    g.h = W(70, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 98 K S 18 74 25 58 35 52 43 58 45 78 45 92 K S 50 100 61 97 70 86']);
    g.i = W(50, ['M 0 100 S 9 92 17 72 22 52 K L 22 92 S 28 100 39 97 48 86', 'D 22 30']);
    g.j = W(50, ['M 0 100 S 9 92 17 72 22 52 K L 22 134 S 17 148 8 149 4 140 10 124 24 109 38 98 48 88', 'D 22 30']);
    g.k = W(66, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 98 K S 18 74 27 58 38 56 42 64 35 72 22 76 K S 32 84 38 96 46 100 56 96 64 86']);
    g.l = W(50, ['M 0 100 S 13 90 25 62 31 30 29 8 23 1 16 8 15 40 15 90 K S 22 100 34 98 46 86']);
    g.m = W(92, ['M 0 100 S 3 80 9 60 16 52 22 58 23 78 23 100 K S 25 78 30 60 37 52 44 58 45 78 45 100 K S 47 78 52 60 59 52 66 58 67 78 67 92 K S 73 100 83 98 91 86']);
    g.n = W(70, ['M 0 100 S 3 80 9 60 16 52 22 58 23 78 23 100 K S 25 78 30 60 37 52 44 58 45 78 45 92 K S 51 100 61 98 70 86']);
    g.o = W(62, ['M 0 100 S 8 93 15 76 21 60 28 52 36 50 K S 26 52 18 63 16 82 24 99 37 99 45 85 46 65 39 53 33 52 K S 38 50 48 51 58 55']);
    // p and q: straight tails; the p's bowl closes on the stem and leaves from the baseline
    g.p = W(66, ['M 0 100 S 8 86 15 66 19 42 K L 21 148 K L 21 104 S 22 78 28 60 38 52 46 60 47 80 39 97 26 100 K S 38 100 50 96 60 86']);
    g.q = W(72, ['M 0 100 S 8 93 15 76 21 60 28 52 38 50 45 53 K S 35 50 24 53 17 65 16 84 24 99 36 99 44 85 47 64 47 52 K L 47 148 K L 47 104 S 54 98 64 92 72 86']);
    // the French r: up past the midline, a small shoulder, then down
    g.r = W(62, ['M 0 100 S 9 92 18 70 22 46 K S 27 52 34 48 38 46 K S 37 70 37 92 43 100 53 97 62 86']);
    g.s = W(54, ['M 0 100 S 10 92 19 72 25 47 K S 33 66 35 84 28 98 18 98 14 91 K S 24 100 38 98 52 88']);
    g.t = W(52, ['M 0 100 S 9 90 17 64 22 22 K L 22 92 S 28 100 39 97 50 86', 'M 10 50 L 38 50']);
    g.u = W(72, ['M 0 100 S 9 92 16 72 20 52 K S 20 80 23 96 32 100 40 95 44 80 46 52 K L 46 92 S 52 100 62 98 71 86']);
    g.v = W(66, ['M 0 100 S 3 80 9 60 17 51 23 57 27 78 31 100 K S 38 92 44 72 45 56 41 50 K S 46 48 56 50 65 54']);
    g.w = W(80, ['M 0 100 S 9 92 16 72 20 52 K S 20 80 23 96 31 100 37 94 39 76 40 54 K S 40 80 43 96 51 100 57 94 59 76 59 56 55 50 K S 60 48 70 50 79 54']);
    g.x = W(62, ['M 0 100 S 4 80 10 60 18 51 25 57 28 76 31 95 38 100 50 96 60 86', 'M 40 52 L 17 98']);
    g.y = W(72, ['M 0 100 S 3 80 9 60 17 51 23 57 25 78 29 96 37 100 45 93 47 74 48 52 K L 48 134 S 43 148 33 149 27 140 33 122 47 108 60 98 70 87']);
    g.z = W(62, ['M 0 100 S 3 80 9 60 17 51 28 51 35 58 33 70 22 77 K S 34 84 38 100 36 124 28 145 18 148 14 138 24 120 40 106 52 97 61 88']);
    return g;
  }

  function make(name, opt) {
    if (name === 'frCursive') {
      return Object.assign(P.printSet({ round: 0.86, capRound: 0.86, t: 'foot', I: 'plain', one: 'flag', seven: 'bar' }), frLower());
    }
    // US: lowercase cursive; capitals and numbers in US print (slanted with the style)
    return Object.assign(P.printSet({ round: 0.86, capRound: 0.86 }), usLower());
  }

  return { make };
});
