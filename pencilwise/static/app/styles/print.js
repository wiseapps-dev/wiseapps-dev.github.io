/*
 * Print letters (manuscript), shared by every print style and adjusted by each style's options.
 * Coordinates and the stroke language are described in glyphs.js. Each letter is
 * { w: advance width, s: [stroke, ...] } with the strokes in the model's writing order.
 *
 * Original drawings: these are not copied or traced from any font. They follow the letter-formation
 * rules published for each school model (see LICENSES/THIRD_PARTY.md, "Letter-formation sources").
 *
 * Options (all optional):
 *   round      lowercase bowl width / height (1 = circles, as in ball-and-stick; < 1 = ovals)
 *   capRound   the same for O, C, G, Q, S and 0
 *   k          'straight' (two slants) | 'loop' (down, up, around and kick)
 *   y          'straight' (two slants) | 'u' (down, around, up, down and curl)
 *   t          'straight' | 'foot' (curves right at the bottom)
 *   q          'straight' | 'flick' (a small flick to the right at the bottom)
 *   l          'straight' | 'foot'
 *   I          'bars' (with top and bottom bars) | 'plain'
 *   J          'plain' | 'bar' (with a top bar)
 *   T          'down-first' (stem, then the bar) | 'across-first'
 *   E          'down-first' (stem, then top, middle, bottom) | 'continuous' (top bar, down, bottom bar as one stroke; middle last)
 *   A          'apex' (both slants start at the top) | 'continuous' (up and down in one stroke)
 *   M          'base' (the middle reaches the baseline) | 'mid' (the middle stops halfway)
 *   G          'plain' | 'bar' (the G turns in with a short bar after a downstroke)
 *   one        'plain' | 'flag' (up-stroke, then down)
 *   four       'open' | 'closed'
 *   seven      'plain' | 'bar'
 *   nine       'straight' | 'curved'
 *   flick      lowercase letters that end with a small flick (exit stroke) to the right at the
 *              baseline instead of stopping, e.g. 'adhiklmntu' (pre-cursive and Grundschrift styles)
 *   tail       'flick' | 'tail': the shape of that ending (a short upturn, or a rounder tail)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.StyleSets = root.StyleSets || {}).print = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const f = (v) => Math.round(v * 100) / 100;

  function printSet(opt) {
    const o = Object.assign({
      round: 1, capRound: 1, k: 'straight', y: 'straight', t: 'straight', q: 'straight', l: 'straight',
      I: 'bars', J: 'plain', T: 'down-first', E: 'down-first', A: 'apex', M: 'base', G: 'plain',
      one: 'plain', four: 'open', seven: 'plain', nine: 'straight',
    }, opt || {});
    const m = 8; // side bearing
    const RX = f(25 * o.round); // lowercase bowl, half width
    const CX = f(50 * o.capRound); // capital O, half width
    const H = f(16 * Math.max(0.85, o.round)); // m's half hump
    const g = {};
    const W = (w, s) => ({ w: f(w), s });
    const fl = o.flick || '';
    // The end of a downstroke that lands on the baseline at x: a plain stop, or a flick.
    const foot = (ch, x) => (fl.includes(ch)
      ? (o.tail === 'tail' ? `L ${f(x)} 84 Q ${f(x)} 102 ${f(x + 13)} 95` : `L ${f(x)} 87 Q ${f(x)} 101 ${f(x + 12)} 94`)
      : `L ${f(x)} 100`);
    const fw = (ch) => (fl.includes(ch) ? 11 : 0); // extra width for the flick

    /* ---------- lowercase ---------- */
    {
      const cx = m + RX, sx = cx + RX;
      g.a = W(2 * RX + 2 * m + fw('a'), [`O ${cx} 75 ${RX} 25 40 360 L ${sx} 50 ${foot('a', sx)}`]);
      g.b = W(2 * RX + 2 * m, [`M ${m} 0 L ${m} 100 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 -180`]);
      g.c = W(2 * RX * 0.92 + 2 * m, [`O ${cx} 75 ${RX} 25 45 315`]);
      g.d = W(2 * RX + 2 * m + fw('d'), [`O ${cx} 75 ${RX} 25 40 360 L ${sx} 0 ${foot('d', sx)}`]);
      g.e = W(2 * RX + 2 * m, [`M ${m} 75 L ${sx} 75 O ${cx} 75 ${RX} 25 0 318`]);
    }
    {
      const s = m + 12;
      g.f = W(s + 26 + m * 0.5, [`O ${s + 13} 15 13 15 35 180 L ${s} 100`, `M ${s - 12} 50 L ${s + 18} 50`]);
    }
    {
      const cx = m + RX, sx = cx + RX;
      g.g = W(2 * RX + 2 * m, [`O ${cx} 75 ${RX} 25 40 360 L ${sx} 50 L ${sx} 130 O ${f(sx - RX * 0.95)} 130 ${f(RX * 0.95)} 18 0 -160`]);
      g.h = W(2 * RX + 2 * m + fw('h'), [`M ${m} 0 L ${m} 100 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 0 ${foot('h', m + 2 * RX)}`]);
    }
    g.i = W(2 * m + 2 + fw('i'), [`M ${m + 1} 50 ${foot('i', m + 1)}`, `D ${m + 1} 28`]);
    {
      const hr = f(RX * 0.72), sx = m + 2 * hr;
      g.j = W(sx + m, [`M ${sx} 50 L ${sx} 130 O ${sx - hr} 130 ${hr} 18 0 -160`, `D ${sx} 28`]);
    }
    if (o.k === 'loop') {
      g.k = W(m + 40 + m + fw('k'), [`M ${m} 0 L ${m} 100 L ${m} 74 S ${m + 13} 54 ${m + 29} 55 ${m + 31} 68 ${m + 8} 77 K ${fl.includes('k') ? `L ${m + 30} 94 Q ${m + 36} 101 ${m + 46} 95` : `L ${m + 38} 100`}`]);
    } else {
      g.k = W(m + 38 + m + fw('k'), [`M ${m} 0 L ${m} 100`, `M ${m + 34} 50 L ${m + 1} 76 ${fl.includes('k') ? `L ${m + 30} 95 Q ${m + 37} 101 ${m + 47} 95` : `L ${m + 38} 100`}`]);
    }
    g.l = fl.includes('l')
      ? W(2 * m + 2 + fw('l'), [`M ${m + 1} 0 ${foot('l', m + 1)}`])
      : o.l === 'foot'
        ? W(m + 14 + m, [`M ${m} 0 L ${m} 88 Q ${m} 100 ${m + 13} 99`])
        : W(2 * m + 2, [`M ${m + 1} 0 L ${m + 1} 100`]);
    g.m = W(4 * H + 2 * m + fw('m'), [`M ${m} 50 L ${m} 100 L ${m} 75 O ${m + H} 75 ${H} 25 180 0 L ${m + 2 * H} 100 L ${m + 2 * H} 75 O ${m + 3 * H} 75 ${H} 25 180 0 ${foot('m', m + 4 * H)}`]);
    g.n = W(2 * RX + 2 * m + fw('n'), [`M ${m} 50 L ${m} 100 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 0 ${foot('n', m + 2 * RX)}`]);
    g.o = W(2 * RX + 2 * m, [`O ${m + RX} 75 ${RX} 25 85 445 Z`]);
    g.p = W(2 * RX + 2 * m, [`M ${m} 50 L ${m} 150 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 -180`]);
    {
      const cx = m + RX, sx = cx + RX;
      g.q = o.q === 'flick'
        ? W(2 * RX + 2 * m + 8, [`O ${cx} 75 ${RX} 25 40 360 L ${sx} 50 L ${sx} 138 Q ${sx} 150 ${sx + 11} 143`])
        : W(2 * RX + 2 * m, [`O ${cx} 75 ${RX} 25 40 360 L ${sx} 50 L ${sx} 150`]);
    }
    g.r = W(m + RX * 1.6 + m, [`M ${m} 50 L ${m} 100 L ${m} 75 O ${m + RX * 0.85} 75 ${f(RX * 0.85)} 25 180 35`]);
    {
      const rs = f(RX * 0.78), cx = m + rs;
      g.s = W(2 * rs + 2 * m, [`O ${cx} 62.5 ${rs} 12.5 35 270 O ${cx} 87.5 ${rs} 12.5 90 -150`]);
    }
    {
      const s = m + 14;
      g.t = fl.includes('t')
        ? W(s + 16 + m * 0.5 + fw('t'), [`M ${s} 15 ${foot('t', s)}`, `M ${s - 14} 50 L ${s + 15} 50`])
        : o.t === 'foot'
        ? W(s + 18 + m * 0.5, [`M ${s} 15 L ${s} 86 Q ${s} 100 ${s + 14} 99`, `M ${s - 14} 50 L ${s + 16} 50`])
        : W(s + 16 + m * 0.5, [`M ${s} 15 L ${s} 100`, `M ${s - 14} 50 L ${s + 15} 50`]);
    }
    g.u = W(2 * RX + 2 * m + fw('u'), [`M ${m} 50 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 360 L ${m + 2 * RX} 50 ${foot('u', m + 2 * RX)}`]);
    g.v = W(2 * 22 + 2 * m, [`M ${m} 50 L ${m + 22} 100 L ${m + 44} 50`]);
    g.w = W(60 + 2 * m, [`M ${m} 50 L ${m + 15} 100 L ${m + 30} 50 L ${m + 45} 100 L ${m + 60} 50`]);
    g.x = W(42 + 2 * m, [`M ${m} 50 L ${m + 42} 100`, `M ${m + 42} 50 L ${m} 100`]);
    if (o.y === 'u') {
      const hr = f(RX * 0.8);
      g.y = W(2 * RX + 2 * m, [`M ${m} 50 L ${m} 75 O ${m + RX} 75 ${RX} 25 180 360 L ${m + 2 * RX} 50 L ${m + 2 * RX} 130 O ${f(m + 2 * RX - hr)} 130 ${hr} 18 0 -165`]);
    } else {
      g.y = W(44 + 2 * m, [`M ${m} 50 L ${m + 22} 100`, `M ${m + 44} 50 L ${m} 150`]);
    }
    g.z = W(40 + 2 * m, [`M ${m} 50 L ${m + 40} 50 L ${m} 100 L ${m + 40} 100`]);

    /* ---------- capitals ---------- */
    g.A = o.A === 'continuous'
      ? W(72 + 2 * m, [`M ${m} 100 L ${m + 36} 0 L ${m + 72} 100`, `M ${m + 14} 62 L ${m + 58} 62`])
      : W(72 + 2 * m, [`M ${m + 36} 0 L ${m} 100`, `M ${m + 36} 0 L ${m + 72} 100`, `M ${m + 14} 62 L ${m + 58} 62`]);
    g.B = W(58 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 28} 0 O ${m + 28} 25 22 25 90 -90 L ${m} 50 L ${m + 32} 50 O ${m + 32} 75 25 25 90 -90 L ${m} 100`]);
    g.C = W(2 * CX * 0.94 + 2 * m, [`O ${m + CX} 50 ${CX} 50 45 315`]);
    g.D = W(62 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 18} 0 O ${m + 18} 50 44 50 90 -90 L ${m} 100`]);
    g.E = o.E === 'continuous'
      ? W(52 + 2 * m, [`M ${m + 52} 0 L ${m} 0 L ${m} 100 L ${m + 52} 100`, `M ${m} 50 L ${m + 44} 50`])
      : W(52 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 52} 0`, `M ${m} 50 L ${m + 44} 50`, `M ${m} 100 L ${m + 52} 100`]);
    g.F = W(52 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 52} 0`, `M ${m} 50 L ${m + 44} 50`]);
    g.G = o.G === 'bar'
      ? W(2 * CX + 2 * m, [`O ${m + CX} 50 ${CX} 50 45 340 L ${m + 2 * CX - 1} 56 L ${m + 2 * CX - 1} 100`, `M ${f(m + CX * 1.25)} 56 L ${m + 2 * CX + 4} 56`])
      : W(2 * CX + 2 * m, [`O ${m + CX} 50 ${CX} 50 45 360 L ${f(m + CX * 1.3)} 50`]);
    g.H = W(60 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m + 60} 0 L ${m + 60} 100`, `M ${m} 50 L ${m + 60} 50`]);
    g.I = o.I === 'plain'
      ? W(2 * m + 2, [`M ${m + 1} 0 L ${m + 1} 100`])
      : W(40 + 2 * m, [`M ${m + 20} 0 L ${m + 20} 100`, `M ${m} 0 L ${m + 40} 0`, `M ${m} 100 L ${m + 40} 100`]);
    g.J = o.J === 'bar'
      ? W(54 + 2 * m, [`M ${m + 40} 0 L ${m + 40} 72 O ${m + 20} 72 20 28 0 -170`, `M ${m + 22} 0 L ${m + 58} 0`])
      : W(40 + 2 * m, [`M ${m + 40} 0 L ${m + 40} 72 O ${m + 20} 72 20 28 0 -170`]);
    g.K = W(56 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m + 54} 0 L ${m + 1} 54 L ${m + 56} 100`]);
    g.L = W(50 + 2 * m, [`M ${m} 0 L ${m} 100 L ${m + 50} 100`]);
    g.M = o.M === 'mid'
      ? W(72 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 36} 62 L ${m + 72} 0 L ${m + 72} 100`])
      : W(72 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 36} 100 L ${m + 72} 0 L ${m + 72} 100`]);
    g.N = W(58 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 58} 100 L ${m + 58} 0`]);
    g.O = W(2 * CX + 2 * m, [`O ${m + CX} 50 ${CX} 50 85 445 Z`]);
    g.P = W(54 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 28} 0 O ${m + 28} 26 26 26 90 -90 L ${m} 52`]);
    g.Q = W(2 * CX + 2 * m + 6, [`O ${m + CX} 50 ${CX} 50 85 445 Z`, `M ${f(m + CX * 1.15)} 68 L ${f(m + CX * 2.05)} 106`]);
    g.R = W(58 + 2 * m, [`M ${m} 0 L ${m} 100`, `M ${m} 0 L ${m + 28} 0 O ${m + 28} 26 26 26 90 -90 L ${m} 52 L ${m + 58} 100`]);
    {
      const cx = m + f(CX * 0.62);
      g.S = W(2 * f(CX * 0.62) + 2 * m, [`O ${cx} 25 ${f(CX * 0.56)} 25 35 270 O ${cx} 75 ${f(CX * 0.62)} 25 90 -150`]);
    }
    g.T = o.T === 'across-first'
      ? W(64 + 2 * m, [`M ${m} 0 L ${m + 64} 0`, `M ${m + 32} 0 L ${m + 32} 100`])
      : W(64 + 2 * m, [`M ${m + 32} 0 L ${m + 32} 100`, `M ${m} 0 L ${m + 64} 0`]);
    g.U = W(60 + 2 * m, [`M ${m} 0 L ${m} 68 O ${m + 30} 68 30 32 180 360 L ${m + 60} 0`]);
    g.V = W(70 + 2 * m, [`M ${m} 0 L ${m + 35} 100 L ${m + 70} 0`]);
    g.W = W(92 + 2 * m, [`M ${m} 0 L ${m + 23} 100 L ${m + 46} 0 L ${m + 69} 100 L ${m + 92} 0`]);
    g.X = W(62 + 2 * m, [`M ${m} 0 L ${m + 62} 100`, `M ${m + 62} 0 L ${m} 100`]);
    g.Y = W(66 + 2 * m, [`M ${m} 0 L ${m + 33} 50`, `M ${m + 66} 0 L ${m + 33} 50 L ${m + 33} 100`]);
    g.Z = W(58 + 2 * m, [`M ${m} 0 L ${m + 58} 0 L ${m} 100 L ${m + 58} 100`]);

    /* ---------- numbers (as tall as capitals) ---------- */
    const DX = f(28 * Math.min(1, o.capRound + 0.1));
    g['0'] = W(2 * DX + 2 * m, [`O ${m + DX} 50 ${DX} 50 90 450 Z`]);
    g['1'] = o.one === 'flag'
      ? W(32 + 2 * m, [`M ${m} 26 L ${m + 26} 0 L ${m + 26} 100`])
      : W(2 * m + 2, [`M ${m + 1} 0 L ${m + 1} 100`]);
    g['2'] = W(54 + 2 * m, [`O ${m + 27} 26 26 26 160 -38 L ${m} 100 L ${m + 54} 100`]);
    g['3'] = W(52 + 2 * m, [`O ${m + 24} 25 22 25 150 -90 O ${m + 24} 75 27 25 90 -150`]);
    g['4'] = o.four === 'closed'
      ? W(58 + 2 * m, [`M ${m + 42} 0 L ${m} 66 L ${m + 58} 66`, `M ${m + 42} 0 L ${m + 42} 100`])
      : W(58 + 2 * m, [`M ${m + 2} 0 L ${m} 62 L ${m + 58} 62`, `M ${m + 42} 0 L ${m + 42} 100`]);
    g['5'] = W(54 + 2 * m, [`M ${m + 3} 0 L ${m + 1} 46 O ${m + 25} 69 27 31 145 -155`, `M ${m + 3} 0 L ${m + 50} 0`]);
    g['6'] = W(50 + 2 * m, [`M ${m + 43} 6 C ${m + 22} -5 ${m + 3} 22 ${m + 3} 74 O ${m + 25} 74 22 26 180 515`]);
    g['7'] = o.seven === 'bar'
      ? W(54 + 2 * m, [`M ${m} 0 L ${m + 54} 0 L ${m + 18} 100`, `M ${m + 16} 50 L ${m + 50} 50`])
      : W(54 + 2 * m, [`M ${m} 0 L ${m + 54} 0 L ${m + 18} 100`]);
    g['8'] = W(50 + 2 * m, [`M ${m + 42} 12 S ${m + 25} 0 ${m + 7} 10 ${m + 7} 30 ${m + 25} 47 ${m + 45} 64 ${m + 45} 88 ${m + 25} 100 ${m + 5} 88 ${m + 5} 64 ${m + 25} 47 ${m + 41} 32 ${m + 43} 14`]);
    g['9'] = o.nine === 'curved'
      ? W(50 + 2 * m, [`O ${m + 25} 27 23 27 40 360 L ${m + 48} 70 S ${m + 40} 96 ${m + 18} 99`])
      : W(50 + 2 * m, [`O ${m + 25} 27 23 27 40 360 L ${m + 48} 100`]);

    /* ---------- German sharp s ---------- */
    g['ß'] = W(50 + 2 * m, [`M ${m} 100 L ${m} 24 S ${m + 6} 6 ${m + 19} 0 ${m + 33} 4 ${m + 39} 18 ${m + 31} 36 ${m + 16} 46 K S ${m + 36} 52 ${m + 47} 70 ${m + 42} 92 ${m + 27} 100 ${m + 14} 96`]);
    return g;
  }

  return { printSet };
});
