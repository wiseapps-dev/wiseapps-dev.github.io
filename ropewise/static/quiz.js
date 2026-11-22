/*
 * Ropewise knot quiz: question generation only (no UI, no storage, no network).
 * Every question is built from the bundled knot data (knots.js): finished diagrams, step
 * diagrams and each knot's own "use" lines. Nothing here draws or adds artwork.
 *
 * Games
 *   name  Name that knot: a finished diagram and four knot names.
 *   next  What's next?: step n of a knot and 3 or 4 step diagrams of the same knot.
 *   job   Right knot for the job: one of a knot's own "use" lines and four knot names.
 *
 * Questions hold ids and step numbers only, so the UI can show them in any language:
 *   { game: 'name', knot, choices: [knotId x4], answer }
 *   { game: 'next', knot, step, choices: [stepIndex x3-4], answer }  (shown: step; correct: step + 1)
 *   { game: 'job',  knot, use, job, choices: [knotId x4], answer }
 * choices[answer] is the one correct choice.
 *
 * mixedRound() builds the Refresh round: given knots (picked by review.js), one question each,
 * mixing the three games.
 *
 * Shuffling uses a seeded generator, so a seed always gives the same round (tests rely on it).
 * Used by the app (window.Quiz), the website's free quiz page, and the tests (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Quiz = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const GAMES = ['name', 'next', 'job'];
  const ROUND = 10;

  // Knots whose finished diagrams are the same knot or too close to tell apart reliably.
  // They are never offered together, so a diagram can't have two right names.
  const LOOKALIKE = [
    ['figure-8-follow-through', 'figure-8-loop'], // the same finished knot, tied two ways
    ['double-overhand', 'surgeons-knot'],          // a double overhand, in one line or two
    ['reef-knot', 'elastic-bracelet-knot'],        // a reef knot, with or without the extra turn
  ];

  /*
   * Right knot for the job. The job text is the answer knot's own use line (k.use[use], or its
   * translation), so the data says outright that this knot does the job. To keep a single right
   * answer, a knot is never offered as a wrong choice if it shares one of `goals` with the job,
   * or if it is in `also`: knots whose own data (use, summary, pros) says, or a knowledgeable
   * person could fairly argue, that they do the same job. When in doubt a knot goes in `also`.
   *
   * Safety: jobs are everyday, low-consequence tasks only (tackle, tents, fenders, parcels, laces).
   * No job asks which knot to rely on for a person, a mooring, a vehicle load or anything overhead,
   * and climbing knots (safety 'climbing') are never an answer, a wrong choice or an "also": they
   * appear only in the recognition and recall games ("Name that knot", "What's next?").
   */
  const JOBS = [
    // fishing
    { knot: 'albright', use: 1, goals: [], also: ['double-uni', 'surgeons-knot', 'fg-knot'] },      // blood knot: not for very different lines
    { knot: 'arbor-knot', use: 0, goals: ['spool'], also: ['uni-knot'] },
    { knot: 'blood-knot', use: 0, goals: ['join-ropes'], also: ['double-uni', 'surgeons-knot', 'albright'] }, // FG: "not for joining two monos"
    { knot: 'fg-knot', use: 0, goals: [], also: ['albright', 'double-uni', 'surgeons-knot'] },             // blood knot: "not for braid"
    { knot: 'surgeons-knot', use: 0, goals: [], also: ['blood-knot', 'double-uni', 'albright'] },          // FG: braid to leader only
    { knot: 'palomar', use: 0, goals: [], also: ['uni-knot', 'snell', 'san-diego-jam', 'non-slip-loop'] }, // clinch: "not suited to braid"
    { knot: 'uni-knot', use: 0, goals: [], also: ['palomar', 'san-diego-jam', 'non-slip-loop'] },          // clinch: not braid; snell: hooks only
    { knot: 'non-slip-loop', use: 0, goals: [], also: ['uni-knot'] },                                      // the other hook knots hold a lure stiff
    { knot: 'snell', use: 0, goals: [], also: ['uni-knot', 'dropper-loop'] },                              // only the snell pulls straight down the shank
    { knot: 'dropper-loop', use: 1, goals: ['hook', 'loop-mid'], also: ['snell', 'blood-knot', 'surgeons-knot'] }, // use 0 names the knot in French
    // boating: fenders only (no mooring, anchoring or loaded-line jobs)
    { knot: 'clove-hitch', use: 0, goals: ['tie-to-post'], also: [] },                                    // round turn: "Making a fender line fast to a rail"
    // camping
    { knot: 'taut-line-hitch', use: 0, goals: ['tension'], also: ['rolling-hitch'] },                      // a taut-line is a rolling hitch on its own line
    { knot: 'truckers-hitch', use: 0, goals: ['tension', 'tie-to-post'], also: ['constrictor'] },          // tarp ridgeline or clothesline, never a vehicle load
    { knot: 'siberian-hitch', use: 1, goals: ['tie-to-post'], also: ['slip-knot', 'cleat-hitch'] },          // a tarp or clothesline that releases in one pull
    // home and garden
    { knot: 'constrictor', use: 1, goals: ['bind'], also: ['slip-knot', 'truckers-hitch', 'timber-hitch', 'clove-hitch'] },
    { knot: 'double-overhand', use: 0, goals: ['stopper'], also: [] },                                    // use 1 names the overhand: a giveaway
    { knot: 'overhand', use: 0, goals: ['stopper'], also: [] },
    { knot: 'reef-knot', use: 0, goals: ['bind'], also: ['slip-knot', 'ian-knot', 'surgeons-knot'] },
    { knot: 'slip-knot', use: 0, goals: ['stopper'], also: ['siberian-hitch'] },
    // laces and craft
    { knot: 'ian-knot', use: 0, goals: ['shoelace'], also: ['reef-knot', 'slip-knot', 'overhand', 'double-overhand'] },
    { knot: 'elastic-bracelet-knot', use: 1, goals: [], also: ['surgeons-knot', 'overhand', 'double-overhand'] }, // bead bracelets on slippery cord; use 0 says "elastic": a giveaway
    { knot: 'sliding-bracelet-knot', use: 1, goals: [], also: ['slip-knot', 'taut-line-hitch', 'uni-knot'] },
  ];
  // Knots on hold (marked by bundle.js from tools/verified.json "hold" until they are re-verified) take no part in
  // any game: not asked about, not offered as a choice.
  const playable = (knots) => knots.filter((k) => !k.hold);
  // Knots that never take part in a job question, as answer or as wrong choice.
  const noJob = (k) => !!k && (k.safety === 'climbing' || k.category === 'climbing');

  /* ---------- seeded shuffling ---------- */
  // mulberry32: small, fast and good enough to shuffle a quiz. Same seed, same sequence.
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* ---------- knot text (the chosen language, English as the fallback) ---------- */
  const tr = (k, lang) => (lang && k.i18n && k.i18n[lang]) || null;
  function nameOf(k, lang) { const x = tr(k, lang); return (x && x.name) || k.name; }
  function useOf(k, i, lang) { const x = tr(k, lang); return (x && x.use && x.use[i]) || (k.use || [])[i] || ''; }
  // Compare names ignoring case and accents, so two choices never read the same.
  const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  function lookalikes(id) {
    const out = new Set();
    LOOKALIKE.forEach((g) => { if (g.indexOf(id) >= 0) g.forEach((x) => out.add(x)); });
    out.delete(id);
    return out;
  }

  // Knots that must never be a wrong choice for this job (the answer itself included).
  function jobExcluded(job, knots) {
    const out = new Set([job.knot].concat(job.also || []));
    lookalikes(job.knot).forEach((x) => out.add(x));
    const goals = job.goals || [];
    knots.forEach((k) => { if (noJob(k) || (k.goals || []).some((g) => goals.indexOf(g) >= 0)) out.add(k.id); });
    return out;
  }

  // When a category runs short of wrong choices, borrow from the nearest ones first, so a camping
  // question gets household or boating knots rather than fishing knots.
  const NEAR = {
    fishing: ['boating', 'camping', 'household', 'climbing', 'craft', 'ties'],
    boating: ['camping', 'household', 'climbing', 'fishing', 'craft', 'ties'],
    camping: ['household', 'boating', 'climbing', 'fishing', 'craft', 'ties'],
    household: ['camping', 'boating', 'craft', 'ties', 'climbing', 'fishing'],
    climbing: ['camping', 'boating', 'household', 'fishing', 'craft', 'ties'],
    craft: ['ties', 'household', 'camping', 'boating', 'fishing', 'climbing'],
    ties: ['craft', 'household', 'camping', 'boating', 'fishing', 'climbing'],
  };

  /*
   * Up to n wrong choices for `answer`: knots from the same category first, then the nearest
   * categories, never one in `excluded`, never one whose name reads the same as a choice taken.
   */
  function distractors(knots, answer, n, rand, excluded, lang) {
    const taken = new Set([fold(nameOf(answer, lang))]);
    const ok = (k) => k.id !== answer.id && !excluded.has(k.id) && !taken.has(fold(nameOf(k, lang)));
    const order = [answer.category].concat(NEAR[answer.category] || []);
    const rank = (k) => { const r = order.indexOf(k.category); return r < 0 ? order.length : r; };
    const ranked = shuffle(knots, rand).sort((a, b) => rank(a) - rank(b)); // stable sort keeps the shuffle inside a category
    const out = [];
    const twins = new Set(); // lookalikes of a choice already taken: two of them would cancel out
    for (const k of ranked) {
      if (out.length >= n) break;
      if (!ok(k) || twins.has(k.id)) continue;
      out.push(k);
      taken.add(fold(nameOf(k, lang)));
      lookalikes(k.id).forEach((x) => twins.add(x));
    }
    return out;
  }

  function place(answer, wrong, rand) {
    const choices = shuffle([answer].concat(wrong), rand);
    return { choices, answer: choices.indexOf(answer) };
  }

  /* ---------- Name that knot ---------- */
  function nameQuestion(knots, k, rand, lang) {
    const wrong = distractors(knots, k, 3, rand, lookalikes(k.id), lang);
    if (wrong.length < 3) return null;
    const p = place(k.id, wrong.map((x) => x.id), rand);
    return { game: 'name', knot: k.id, choices: p.choices, answer: p.answer };
  }

  /* ---------- What's next? ---------- */
  // A step's diagram depends only on how much rope is laid (steps[i].to), so steps with the
  // same `to` look the same. For each drawing we keep the first step that makes it.
  function drawings(k) {
    const seen = new Map();
    (k.steps || []).forEach((s, i) => { if (!seen.has(s.to)) seen.set(s.to, i); });
    return seen; // to -> first step index
  }

  // Steps n that can be asked: the next step looks different from step n, and at least two
  // other different-looking steps of the same knot are left to be the wrong choices.
  function nextSteps(k) {
    const steps = k.steps || [];
    const draw = drawings(k);
    const out = [];
    for (let n = 0; n < steps.length - 1; n++) {
      if (steps[n + 1].to === steps[n].to) continue;
      if (draw.get(steps[n + 1].to) !== n + 1) continue;
      const others = Array.from(draw.entries()).filter(([to]) => to !== steps[n].to && to !== steps[n + 1].to);
      if (others.length >= 2) out.push(n);
    }
    return out;
  }

  function nextQuestion(k, rand) {
    const ns = nextSteps(k);
    if (!ns.length) return null;
    const n = ns[Math.floor(rand() * ns.length)];
    const steps = k.steps;
    const draw = drawings(k);
    const pool = Array.from(draw.entries()).filter(([to]) => to !== steps[n].to && to !== steps[n + 1].to).map(([, i]) => i);
    // Later steps first: they look most like the right answer, so the question isn't a giveaway.
    const later = shuffle(pool.filter((i) => i > n + 1), rand);
    const earlier = shuffle(pool.filter((i) => i < n), rand);
    const wrong = later.concat(earlier).slice(0, 3);
    const p = place(n + 1, wrong, rand);
    return { game: 'next', knot: k.id, step: n, choices: p.choices, answer: p.answer };
  }

  /* ---------- Right knot for the job ---------- */
  function jobQuestion(knots, j, rand, lang) {
    const job = JOBS[j];
    const k = knots.find((x) => x.id === job.knot);
    if (!k || noJob(k) || !useOf(k, job.use, lang)) return null;
    const wrong = distractors(knots, k, 3, rand, jobExcluded(job, knots), lang);
    if (wrong.length < 3) return null;
    const p = place(k.id, wrong.map((x) => x.id), rand);
    return { game: 'job', knot: k.id, use: job.use, job: j, choices: p.choices, answer: p.answer };
  }

  /*
   * One round: up to opts.n questions (default 10), each about a different knot.
   * opts: { seed, n, lang }. lang only matters for keeping choice names distinct.
   */
  function round(knots, game, opts) {
    knots = playable(knots);
    opts = opts || {};
    const rand = rng(opts.seed == null ? Date.now() : opts.seed);
    const n = opts.n || ROUND;
    const lang = opts.lang || null;
    const out = [];
    if (game === 'job') {
      const used = new Set();
      for (const j of shuffle(JOBS.map((_, i) => i), rand)) {
        if (out.length >= n) break;
        if (used.has(JOBS[j].knot)) continue;
        const q = jobQuestion(knots, j, rand, lang);
        if (q) { out.push(q); used.add(q.knot); }
      }
      return out;
    }
    for (const k of shuffle(knots, rand)) {
      if (out.length >= n) break;
      const q = game === 'next' ? nextQuestion(k, rand) : nameQuestion(knots, k, rand, lang);
      if (q) out.push(q);
    }
    return out;
  }

  /*
   * A Refresh round: one question for each knot in `ids`, in that order, mixing the three games.
   * Each knot gets the game used least so far that it can be asked in (ties at random): every knot
   * can be named, most have a "What's next?" step, and the 22 everyday knots in JOBS have a job.
   */
  function mixedRound(knots, ids, opts) {
    knots = playable(knots);
    opts = opts || {};
    const rand = rng(opts.seed == null ? Date.now() : opts.seed);
    const lang = opts.lang || null;
    const used = { name: 0, next: 0, job: 0 };
    const out = [];
    for (const id of ids) {
      const k = knots.find((x) => x.id === id);
      if (!k) continue;
      const jobs = [];
      JOBS.forEach((j, i) => { if (j.knot === id) jobs.push(i); });
      const games = ['name'].concat(nextSteps(k).length ? ['next'] : [], jobs.length ? ['job'] : []);
      const order = shuffle(games, rand).sort((a, b) => used[a] - used[b]);
      for (const g of order) {
        const q = g === 'name' ? nameQuestion(knots, k, rand, lang)
          : g === 'next' ? nextQuestion(k, rand)
            : jobQuestion(knots, jobs[Math.floor(rand() * jobs.length)], rand, lang);
        if (q) { used[g] += 1; out.push(q); break; }
      }
    }
    return out;
  }

  // The correct choice: a knot id, or for "next" the step index to show.
  const correct = (q) => q.choices[q.answer];

  return { GAMES, ROUND, LOOKALIKE, JOBS, noJob, playable, rng, shuffle, round, mixedRound, correct, nextSteps, drawings, jobExcluded, lookalikes, nameOf, useOf, fold };
});
