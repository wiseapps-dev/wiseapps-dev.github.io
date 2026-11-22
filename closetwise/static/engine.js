/*
 * Closetwise engine: the data model and every calculation, with no DOM.
 * Runs in the app (window.Engine) and in Node for the tests.
 *
 * Dates are local calendar days as 'YYYY-MM-DD' strings. Wears are stored per
 * day, one wear per item per day:  wears['2026-11-21'] = ['i1', 'i7'].
 * Cost per wear = price / (wears logged in the app + "worn before" estimate).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- taxonomy ---------------- */
  const CATS = ['tops', 'bottoms', 'dresses', 'outerwear', 'knitwear', 'shoes', 'bags', 'accessories', 'jewellery', 'activewear', 'swim', 'sleepwear', 'other'];
  const SUBS = {
    tops: ['tshirt', 'shirt', 'blouse', 'tank', 'polo', 'bodysuit'],
    bottoms: ['jeans', 'trousers', 'shorts', 'skirt', 'leggings'],
    dresses: ['mini', 'midi', 'maxi', 'jumpsuit'],
    outerwear: ['coat', 'jacket', 'blazer', 'trench', 'raincoat', 'puffer'],
    knitwear: ['sweater', 'cardigan', 'sweatshirt', 'knitvest'],
    shoes: ['sneakers', 'boots', 'heels', 'flats', 'sandals', 'loafers', 'running', 'formal', 'slippers'],
    bags: ['handbag', 'tote', 'crossbody', 'backpack', 'clutch', 'travel'],
    accessories: ['belt', 'scarf', 'hat', 'sunglasses', 'gloves', 'tie', 'watch', 'hair'],
    jewellery: ['earrings', 'necklace', 'ring', 'bracelet', 'brooch'],
    activewear: ['activetop', 'activebottom', 'sportsbra', 'activejacket'],
    swim: ['swimsuit', 'bikini', 'trunks', 'coverup'],
    sleepwear: ['pyjamas', 'nightdress', 'robe', 'lounge'],
    other: [],
  };
  // Swatches for picking and naming. Detection references live in colour.js.
  const COLOURS = [
    ['black', '#1c1c1e'], ['white', '#f7f7f4'], ['cream', '#eee5cf'], ['grey', '#8e8f92'], ['beige', '#d6c2a4'],
    ['camel', '#b88a58'], ['brown', '#6a4a31'], ['navy', '#1f2b48'], ['blue', '#2f62b5'], ['lightblue', '#9fc4e6'],
    ['green', '#3b7a47'], ['olive', '#6c6b3c'], ['yellow', '#e6c245'], ['orange', '#e07a37'], ['red', '#be3230'],
    ['burgundy', '#6b1f2f'], ['pink', '#efa5b9'], ['purple', '#77519c'], ['gold', '#c7a24a'], ['silver', '#b9bdc3'], ['multi', ''],
  ];
  const COLOUR_IDS = COLOURS.map((c) => c[0]);
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const OCCASIONS = ['work', 'casual', 'evening', 'formal', 'sport', 'travel', 'lounge', 'outdoor'];
  const CONDITIONS = ['new', 'excellent', 'good', 'worn', 'repair'];
  const CLIMATES = ['hot', 'mild', 'cold', 'rain', 'snow'];
  const ACTIVITIES = ['city', 'beach', 'hiking', 'business', 'formal', 'gym', 'evening'];
  const ESSENTIALS = ['toothbrush', 'toiletries', 'deodorant', 'medication', 'charger', 'adapter', 'passport', 'tickets', 'wallet', 'keys', 'headphones', 'glasses'];
  // Extra checklist lines for a climate or activity.
  const EXTRAS = { hot: ['sunscreen'], rain: ['umbrella'], beach: ['beachtowel'], hiking: ['waterbottle'], business: ['laptop'] };

  /* ---------------- small helpers ---------------- */
  const isObj = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
  const str = (x, max) => (typeof x === 'string' ? x : x == null ? '' : typeof x === 'number' && isFinite(x) ? String(x) : '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || 200);
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const isId = (x) => typeof x === 'string' && ID_RE.test(x);
  let idSeq = 0;
  function newId(prefix) {
    idSeq = (idSeq + 1) % 1296;
    return (prefix || 'x') + Date.now().toString(36) + idSeq.toString(36).padStart(2, '0') + Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
  }
  const uniq = (a) => Array.from(new Set(a));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(',', '.')) : NaN);
  // Accent- and case-insensitive text for search.
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/[øœ]/g, (c) => (c === 'ø' ? 'o' : 'oe')).replace(/æ/g, 'ae');

  /* ---------------- dates ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  function dayStr(d) {
    const x = d instanceof Date ? d : new Date(d == null ? Date.now() : d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function dayNum(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }
  function fromNum(n) {
    const x = new Date(n * 86400000);
    return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  }
  const addDays = (s, n) => fromNum(dayNum(s) + n);
  const daysBetween = (a, b) => dayNum(b) - dayNum(a);
  // Weeks for a month view: arrays of 7 day strings, padded with neighbouring days.
  function monthWeeks(year, month, weekStart) {
    const first = `${year}-${pad(month)}-01`;
    const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const lead = (dow - (weekStart || 0) + 7) % 7;
    let n = dayNum(first) - lead;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = dayNum(`${year}-${pad(month)}-${pad(lastDay)}`);
    const weeks = [];
    while (n <= end) {
      const w = [];
      for (let i = 0; i < 7; i++) w.push(fromNum(n++));
      weeks.push(w);
    }
    return weeks;
  }

  /* ---------------- catalogue ---------------- */
  function newCatalogue() {
    return { v: 1, items: [], outfits: [], wears: {}, outfitWears: {}, plans: {}, trips: [], templates: [], essentials: null };
  }
  const essentialDefaults = () => ESSENTIALS.map((k) => ({ id: 'e-' + k, key: k }));

  function normImg(x) {
    if (!isObj(x)) return null;
    const ext = ['webp', 'png', 'jpg', 'svg'].includes(x.ext) ? x.ext : null;
    if (!ext) return null;
    return {
      v: Math.max(1, Math.floor(num(x.v)) || 1),
      ext,
      w: clamp(Math.round(num(x.w)) || 0, 0, 8192),
      h: clamp(Math.round(num(x.h)) || 0, 0, 8192),
      cut: !!x.cut,
      orig: !!x.orig,
      // where the picture sits in the original photo, as fractions (for touch-ups)
      crop: isObj(x.crop) && [x.crop.x, x.crop.y, x.crop.w, x.crop.h].every((v) => isFinite(num(v)) && num(v) >= 0 && num(v) <= 1) && num(x.crop.w) > 0 && num(x.crop.h) > 0
        ? { x: num(x.crop.x), y: num(x.crop.y), w: num(x.crop.w), h: num(x.crop.h) } : null,
    };
  }
  function normTags(a) {
    if (!Array.isArray(a)) return [];
    const seen = new Set();
    const out = [];
    a.forEach((t) => {
      const s = str(t, 40).replace(/\s+/g, ' ');
      const k = fold(s);
      if (s && !seen.has(k) && out.length < 30) { seen.add(k); out.push(s); }
    });
    return out;
  }
  function normItem(raw, today) {
    if (!isObj(raw)) return null;
    const cat = CATS.includes(raw.cat) ? raw.cat : 'other';
    const price = num(raw.price);
    const it = {
      id: isId(raw.id) ? raw.id : newId('i'),
      cat,
      sub: (SUBS[cat] || []).includes(raw.sub) ? raw.sub : '',
      name: str(raw.name, 120),
      brand: str(raw.brand, 80),
      size: str(raw.size, 30),
      price: isFinite(price) && price >= 0 && price < 1e9 ? Math.round(price * 100) / 100 : null,
      bought: isDay(raw.bought) ? raw.bought : '',
      colours: uniq((Array.isArray(raw.colours) ? raw.colours : []).filter((c) => COLOUR_IDS.includes(c))).slice(0, 3),
      hex: typeof raw.hex === 'string' && /^#[0-9a-f]{6}$/i.test(raw.hex) ? raw.hex.toLowerCase() : '',
      seasons: SEASONS.filter((s) => Array.isArray(raw.seasons) && raw.seasons.includes(s)),
      tags: normTags(raw.tags),
      condition: CONDITIONS.includes(raw.condition) ? raw.condition : '',
      wornBefore: clamp(Math.floor(num(raw.wornBefore)) || 0, 0, 100000),
      notes: str(raw.notes, 2000),
      added: isDay(raw.added) ? raw.added : (today || dayStr()),
      updated: Math.max(0, Math.floor(num(raw.updated)) || 0),
      img: normImg(raw.img),
    };
    if (raw.sample === true) it.sample = true;
    return it;
  }
  function normOutfit(raw, itemIds) {
    if (!isObj(raw)) return null;
    const layout = [];
    const seen = new Set();
    (Array.isArray(raw.layout) ? raw.layout : []).forEach((p) => {
      if (!isObj(p) || !isId(p.id) || seen.has(p.id) || (itemIds && !itemIds.has(p.id))) return;
      seen.add(p.id);
      const w = num(p.w);
      layout.push({
        id: p.id,
        x: clamp(isFinite(num(p.x)) ? num(p.x) : 0.5, -0.5, 1.5),
        y: clamp(isFinite(num(p.y)) ? num(p.y) : 0.5, -0.5, 1.5),
        w: clamp(isFinite(w) && w > 0 ? w : 0.35, 0.05, 1.5),
        z: Math.floor(num(p.z)) || 0,
      });
    });
    return {
      id: isId(raw.id) ? raw.id : newId('o'),
      name: str(raw.name, 80),
      mode: raw.mode === 'grid' ? 'grid' : 'canvas',
      layout,
      tags: normTags(raw.tags),
      created: Math.max(0, Math.floor(num(raw.created)) || 0),
      updated: Math.max(0, Math.floor(num(raw.updated)) || 0),
    };
  }
  function normDayMap(raw, valid) {
    const out = {};
    if (!isObj(raw)) return out;
    Object.keys(raw).forEach((d) => {
      if (!isDay(d) || !Array.isArray(raw[d])) return;
      const ids = uniq(raw[d].filter((id) => isId(id) && (!valid || valid.has(id))));
      if (ids.length) out[d] = ids;
    });
    return out;
  }
  function normEssential(e) {
    if (!isObj(e)) return null;
    const key = ESSENTIALS.includes(e.key) || Object.values(EXTRAS).some((a) => a.includes(e.key)) ? e.key : '';
    const text = str(e.text, 80);
    if (!key && !text) return null;
    const o = { id: isId(e.id) ? e.id : newId('e') };
    if (key) o.key = key; else o.text = text;
    if (e.packed) o.packed = true;
    return o;
  }
  function normTripParams(raw) {
    const days = Math.floor(num(raw.days));
    return {
      name: str(raw.name, 80),
      start: isDay(raw.start) ? raw.start : '',
      days: clamp(isFinite(days) ? days : 3, 1, 90),
      laundry: !!raw.laundry,
      climate: CLIMATES.filter((c) => Array.isArray(raw.climate) && raw.climate.includes(c)),
      activities: ACTIVITIES.filter((a) => Array.isArray(raw.activities) && raw.activities.includes(a)),
    };
  }
  function normTrip(raw, itemIds) {
    if (!isObj(raw)) return null;
    const t = Object.assign({ id: isId(raw.id) ? raw.id : newId('t') }, normTripParams(raw));
    t.picks = {};
    if (isObj(raw.picks)) {
      CATS.forEach((c) => {
        if (Array.isArray(raw.picks[c])) {
          const ids = uniq(raw.picks[c].filter((id) => isId(id) && (!itemIds || itemIds.has(id))));
          if (ids.length) t.picks[c] = ids;
        }
      });
    }
    t.packed = {};
    if (isObj(raw.packed)) Object.keys(raw.packed).forEach((k) => { if (raw.packed[k] === true && /^[a-z]+:[A-Za-z0-9_-]{1,40}$/.test(k)) t.packed[k] = true; });
    t.essentials = (Array.isArray(raw.essentials) ? raw.essentials : []).map(normEssential).filter(Boolean).slice(0, 200);
    t.created = Math.max(0, Math.floor(num(raw.created)) || 0);
    return t;
  }
  function normTemplate(raw) {
    if (!isObj(raw)) return null;
    const t = Object.assign({ id: isId(raw.id) ? raw.id : newId('p') }, normTripParams(raw));
    t.essentials = (Array.isArray(raw.essentials) ? raw.essentials : []).map(normEssential).filter(Boolean).map((e) => { delete e.packed; return e; }).slice(0, 200);
    return t;
  }

  // Clean any catalogue-like object. Never throws; reports what it dropped.
  function sanitize(raw, today) {
    const problems = [];
    const c = newCatalogue();
    if (!isObj(raw)) { problems.push('not-an-object'); return { cat: c, problems }; }
    const seen = new Set();
    (Array.isArray(raw.items) ? raw.items : []).forEach((x, i) => {
      const it = normItem(x, today);
      if (!it) { problems.push('item-' + i); return; }
      if (seen.has(it.id)) { problems.push('dup-item-' + it.id); return; }
      seen.add(it.id);
      c.items.push(it);
    });
    if (raw.items != null && !Array.isArray(raw.items)) problems.push('items-not-a-list');
    const oSeen = new Set();
    (Array.isArray(raw.outfits) ? raw.outfits : []).forEach((x, i) => {
      const o = normOutfit(x, seen);
      if (!o || oSeen.has(o.id)) { problems.push('outfit-' + i); return; }
      oSeen.add(o.id);
      c.outfits.push(o);
    });
    c.wears = normDayMap(raw.wears, seen);
    c.outfitWears = normDayMap(raw.outfitWears, oSeen);
    c.plans = normDayMap(raw.plans, oSeen);
    const tSeen = new Set();
    (Array.isArray(raw.trips) ? raw.trips : []).forEach((x) => { const t = normTrip(x, seen); if (t && !tSeen.has(t.id)) { tSeen.add(t.id); c.trips.push(t); } });
    const pSeen = new Set();
    (Array.isArray(raw.templates) ? raw.templates : []).forEach((x) => { const t = normTemplate(x); if (t && !pSeen.has(t.id)) { pSeen.add(t.id); c.templates.push(t); } });
    c.essentials = Array.isArray(raw.essentials) ? raw.essentials.map(normEssential).filter(Boolean).map((e) => { delete e.packed; return e; }).slice(0, 200) : null;
    return { cat: c, problems };
  }

  // Merge an imported catalogue into this one. Same id: the newer edit wins.
  function merge(base, inc) {
    const out = sanitize(base).cat;
    const add = sanitize(inc).cat;
    const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
    const items = byId(out.items);
    add.items.forEach((it) => { const cur = items.get(it.id); if (!cur || (it.updated || 0) > (cur.updated || 0)) items.set(it.id, it); });
    out.items = Array.from(items.values());
    const outfits = byId(out.outfits);
    add.outfits.forEach((o) => { const cur = outfits.get(o.id); if (!cur || (o.updated || 0) > (cur.updated || 0)) outfits.set(o.id, o); });
    out.outfits = Array.from(outfits.values());
    const unionMap = (a, b) => { const r = Object.assign({}, a); Object.keys(b).forEach((d) => { r[d] = uniq((r[d] || []).concat(b[d])); }); return r; };
    out.wears = unionMap(out.wears, add.wears);
    out.outfitWears = unionMap(out.outfitWears, add.outfitWears);
    out.plans = unionMap(out.plans, add.plans);
    const trips = byId(out.trips);
    add.trips.forEach((t) => { if (!trips.has(t.id)) trips.set(t.id, t); });
    out.trips = Array.from(trips.values());
    const tpl = byId(out.templates);
    add.templates.forEach((t) => { if (!tpl.has(t.id)) tpl.set(t.id, t); });
    out.templates = Array.from(tpl.values());
    if (!out.essentials && add.essentials) out.essentials = add.essentials;
    return sanitize(out).cat;
  }

  /* ---------------- items and wears ---------------- */
  function removeItems(c, ids) {
    const gone = new Set(ids);
    c.items = c.items.filter((x) => !gone.has(x.id));
    Object.keys(c.wears).forEach((d) => { c.wears[d] = c.wears[d].filter((id) => !gone.has(id)); if (!c.wears[d].length) delete c.wears[d]; });
    c.outfits.forEach((o) => { o.layout = o.layout.filter((p) => !gone.has(p.id)); });
    c.trips.forEach((t) => Object.keys(t.picks).forEach((k) => { t.picks[k] = t.picks[k].filter((id) => !gone.has(id)); if (!t.picks[k].length) delete t.picks[k]; }));
    return c;
  }
  function removeOutfit(c, id) {
    c.outfits = c.outfits.filter((o) => o.id !== id);
    ['outfitWears', 'plans'].forEach((m) => Object.keys(c[m]).forEach((d) => { c[m][d] = c[m][d].filter((x) => x !== id); if (!c[m][d].length) delete c[m][d]; }));
    return c;
  }
  const isWorn = (c, id, day) => !!(c.wears[day] && c.wears[day].includes(id));
  // Turn wears on or off for some items on one day. One wear per item per day.
  function setWorn(c, ids, day, on) {
    if (!isDay(day)) throw new Error('bad day');
    const cur = new Set(c.wears[day] || []);
    ids.forEach((id) => (on ? cur.add(id) : cur.delete(id)));
    if (cur.size) c.wears[day] = Array.from(cur); else delete c.wears[day];
    return c;
  }
  // "Wore this today": the outfit and every item in it.
  function wearOutfit(c, outfitId, day, on) {
    const o = c.outfits.find((x) => x.id === outfitId);
    if (!o || !isDay(day)) return c;
    const list = new Set(c.outfitWears[day] || []);
    if (on) list.add(outfitId); else list.delete(outfitId);
    if (list.size) c.outfitWears[day] = Array.from(list); else delete c.outfitWears[day];
    let ids = o.layout.map((p) => p.id);
    if (!on) {
      // keep items that another outfit worn that day still covers
      const keep = new Set();
      (c.outfitWears[day] || []).forEach((oid) => { const x = c.outfits.find((y) => y.id === oid); if (x) x.layout.forEach((p) => keep.add(p.id)); });
      ids = ids.filter((id) => !keep.has(id));
    }
    return setWorn(c, ids, day, on);
  }
  function setPlan(c, outfitId, day, on) {
    if (!isDay(day)) return c;
    const list = new Set(c.plans[day] || []);
    if (on) list.add(outfitId); else list.delete(outfitId);
    if (list.size) c.plans[day] = Array.from(list); else delete c.plans[day];
    return c;
  }

  // itemId -> { n: days logged, last, first }
  function wearIndex(c) {
    const idx = new Map();
    Object.keys(c.wears).sort().forEach((d) => {
      c.wears[d].forEach((id) => {
        const s = idx.get(id);
        if (!s) idx.set(id, { n: 1, first: d, last: d });
        else { s.n++; s.last = d; }
      });
    });
    return idx;
  }
  const costPerWear = (price, wears) => (price == null || !isFinite(price) || !(wears > 0) ? null : price / wears);
  function itemStats(it, idx) {
    const s = idx.get(it.id);
    const logged = s ? s.n : 0;
    const total = logged + (it.wornBefore || 0);
    return { logged, total, last: s ? s.last : '', first: s ? s.first : '', cpw: costPerWear(it.price, total) };
  }
  // Days since last logged wear (or since it was added if never logged).
  function idleDays(it, idx, today) {
    const s = idx.get(it.id);
    return daysBetween(s ? s.last : it.added, today);
  }

  /* ---------------- insights ---------------- */
  function streaks(c, today) {
    const days = new Set(Object.keys(c.wears).concat(Object.keys(c.outfitWears)).filter((d) => d <= today));
    let current = 0;
    let d = days.has(today) ? today : addDays(today, -1);
    while (days.has(d)) { current++; d = addDays(d, -1); }
    let best = 0;
    let run = 0;
    let prev = null;
    Array.from(days).sort().forEach((x) => {
      run = prev && dayNum(x) - dayNum(prev) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    });
    return { current, best, days: days.size };
  }

  function insights(c, today, opts) {
    const o = Object.assign({ top: 5, idle: 90 }, opts);
    const idx = wearIndex(c);
    const items = c.items;
    const st = new Map(items.map((it) => [it.id, itemStats(it, idx)]));
    const byCatMap = {};
    let value = 0;
    let valued = 0;
    items.forEach((it) => {
      const b = byCatMap[it.cat] || (byCatMap[it.cat] = { cat: it.cat, count: 0, value: 0, valued: 0 });
      b.count++;
      if (it.price != null) { b.value += it.price; b.valued++; value += it.price; valued++; }
    });
    const byCat = Object.values(byCatMap).sort((a, b) => b.count - a.count || b.value - a.value || CATS.indexOf(a.cat) - CATS.indexOf(b.cat));
    const ranked = items.map((it) => ({ id: it.id, total: st.get(it.id).total, added: it.added }));
    const most = ranked.filter((r) => r.total > 0).sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1)).slice(0, o.top);
    const least = ranked.slice().sort((a, b) => a.total - b.total || (a.added < b.added ? -1 : a.added > b.added ? 1 : a.id < b.id ? -1 : 1)).slice(0, o.top);
    const cleanIds = items.filter((it) => idleDays(it, idx, today) >= o.idle)
      .sort((a, b) => idleDays(b, idx, today) - idleDays(a, idx, today) || (a.id < b.id ? -1 : 1)).map((it) => it.id);
    const cleanValue = cleanIds.reduce((a, id) => a + (items.find((x) => x.id === id).price || 0), 0);
    const since = addDays(today, -(o.idle - 1));
    const wornRecently = new Set();
    Object.keys(c.wears).forEach((d) => { if (d >= since && d <= today) c.wears[d].forEach((id) => wornRecently.add(id)); });
    const withCpw = items.map((it) => ({ id: it.id, cpw: st.get(it.id).cpw })).filter((x) => x.cpw != null);
    let spent = 0;
    let wears = 0;
    items.forEach((it) => { const s = st.get(it.id); if (it.price != null && s.total > 0) { spent += it.price; wears += s.total; } });
    const logged = Object.values(c.wears).reduce((a, l) => a + l.length, 0);
    return {
      count: items.length,
      value,
      valued,
      byCat,
      most,
      least,
      cleanOut: { ids: cleanIds, value: cleanValue, days: o.idle },
      recent: { count: wornRecently.size, share: items.length ? wornRecently.size / items.length : 0, days: o.idle },
      cpw: {
        avg: wears ? spent / wears : null,
        best: withCpw.slice().sort((a, b) => a.cpw - b.cpw || (a.id < b.id ? -1 : 1)).slice(0, 3),
        worst: withCpw.slice().sort((a, b) => b.cpw - a.cpw || (a.id < b.id ? -1 : 1)).slice(0, 3),
      },
      logged,
      streak: streaks(c, today),
      stats: st,
    };
  }

  /* ---------------- search and filter ---------------- */
  const SORTS = ['added', 'worn', 'least', 'cpw', 'price', 'name'];
  function filterItems(items, f, ctx) {
    f = f || {};
    ctx = ctx || {};
    const idx = ctx.idx || new Map();
    const today = ctx.today || dayStr();
    const tokens = fold(f.q).split(/\s+/).filter(Boolean);
    const want = (a) => (Array.isArray(a) && a.length ? a : null);
    const cats = want(f.cats);
    const colours = want(f.colours);
    const seasons = want(f.seasons);
    const tags = want(f.tags) && f.tags.map(fold);
    const idle = Number(f.idle) > 0 ? Number(f.idle) : 0;
    let out = items.filter((it) => {
      if (cats && !cats.includes(it.cat)) return false;
      if (colours && !it.colours.some((c) => colours.includes(c))) return false;
      // No season set means all seasons.
      if (seasons && it.seasons.length && !it.seasons.some((s) => seasons.includes(s))) return false;
      if (tags && !it.tags.some((t) => tags.includes(fold(t)))) return false;
      if (idle && idleDays(it, idx, today) < idle) return false;
      if (tokens.length) {
        const hay = fold([it.name, it.brand, it.size, it.notes, it.cat, it.sub].concat(it.tags, it.colours, it.seasons).join(' ') + ' ' + (ctx.label ? ctx.label(it) : ''));
        if (!tokens.every((tk) => hay.includes(tk))) return false;
      }
      return true;
    });
    const sort = SORTS.includes(f.sort) ? f.sort : 'added';
    const stat = new Map(out.map((it) => [it.id, itemStats(it, idx)]));
    const byAdded = (a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : (b.updated || 0) - (a.updated || 0) || (a.id < b.id ? 1 : -1));
    const cmp = {
      added: byAdded,
      worn: (a, b) => stat.get(b.id).total - stat.get(a.id).total || byAdded(a, b),
      least: (a, b) => stat.get(a.id).total - stat.get(b.id).total || byAdded(b, a),
      cpw: (a, b) => {
        const x = stat.get(a.id).cpw;
        const y = stat.get(b.id).cpw;
        if (x == null && y == null) return byAdded(a, b);
        if (x == null) return 1;
        if (y == null) return -1;
        return y - x || byAdded(a, b);
      },
      price: (a, b) => (b.price == null ? -1 : 0) - (a.price == null ? -1 : 0) || (b.price || 0) - (a.price || 0) || byAdded(a, b),
      name: (a, b) => fold(a.name || a.sub || a.cat).localeCompare(fold(b.name || b.sub || b.cat)) || byAdded(a, b),
    }[sort];
    out = out.sort(cmp);
    return out;
  }
  // Every tag in use, most used first.
  function allTags(items) {
    const m = new Map();
    items.forEach((it) => it.tags.forEach((t) => { const k = fold(t); const e = m.get(k); if (e) e.n++; else m.set(k, { tag: t, n: 1 }); }));
    return Array.from(m.values()).sort((a, b) => b.n - a.n || fold(a.tag).localeCompare(fold(b.tag))).map((e) => e.tag);
  }

  /* ---------------- shoes ---------------- */
  // Rest days for collectors. Worn Monday with 2 rest days: rests Tuesday and
  // Wednesday, ready Thursday. `rested` counts the full days since it was worn.
  function shoeRest(it, idx, today, rest) {
    const s = idx.get(it.id);
    if (!s) return { since: null, rested: null, resting: false, readyOn: '' };
    const since = daysBetween(s.last, today);
    return {
      since,
      rested: Math.max(0, since - 1),
      resting: rest > 0 && since >= 0 && since <= rest,
      readyOn: rest > 0 ? addDays(s.last, rest + 1) : '',
    };
  }

  /* ---------------- packing ---------------- */
  // Quantities by clear rules. E = days to pack for (laundry caps it at 7).
  function packRules(trip) {
    const p = normTripParams(trip || {});
    const D = p.days;
    const E = p.laundry ? Math.min(D, 7) : D;
    const has = (x) => p.climate.includes(x) || p.activities.includes(x);
    const climate = p.climate.length ? p.climate : ['mild'];
    const hot = climate.includes('hot');
    const cold = climate.includes('cold') || climate.includes('snow');
    const mild = climate.includes('mild');
    const rain = climate.includes('rain');
    const up = (n, k) => Math.max(1, Math.ceil(n / k));
    const L = [];
    const add = (key, cat, qty, rule) => { if (qty > 0) L.push({ key, cat, qty, rule }); };
    add('underwear', null, E + 1, 'dayPlusOne');
    add('socks', null, E + 1, 'dayPlusOne');
    add('tops', 'tops', E, 'perDay');
    add('bottoms', 'bottoms', up(E, 3) + (has('business') ? 1 : 0), has('business') ? 'per3Business' : 'per3');
    add('dresses', 'dresses', (has('evening') ? up(E, 4) : 0) + (has('formal') ? 1 : 0), 'evening');
    add('knitwear', 'knitwear', cold ? up(E, 4) : mild ? 1 : 0, cold ? 'coldPer4' : 'mildOne');
    add('outerwear', 'outerwear', Math.min(3, (cold ? 1 : 0) + (rain ? 1 : 0) + (mild && !cold && !rain ? 1 : 0) + (has('business') ? 1 : 0)), 'outer');
    add('shoes', 'shoes', Math.min(4, 1 + (has('hiking') ? 1 : 0) + (has('gym') ? 1 : 0) + (has('formal') || has('business') || has('evening') ? 1 : 0) + (has('beach') ? 1 : 0)), 'shoes');
    add('activewear', 'activewear', has('gym') || has('hiking') ? up(E, 3) : 0, 'per3');
    add('swim', 'swim', has('beach') ? (E >= 4 ? 2 : 1) : 0, 'swim');
    add('sleepwear', 'sleepwear', up(E, 4), 'per4');
    add('bags', 'bags', 1 + (has('evening') || has('formal') ? 1 : 0), 'bags');
    add('accessories', 'accessories', (hot ? 1 : 0) + (cold ? 2 : 0), 'accessories');
    return { lines: L, days: D, packFor: E, laundry: p.laundry };
  }

  const SEASON_FOR = { hot: ['summer'], mild: ['spring', 'autumn'], cold: ['winter', 'autumn'], snow: ['winter'], rain: ['spring', 'autumn'] };
  const TAG_FOR = { business: ['work', 'formal'], formal: ['formal', 'evening'], evening: ['evening'], gym: ['sport'], hiking: ['outdoor', 'sport'], beach: ['travel', 'casual'], city: ['casual', 'travel'] };
  const SHOE_FOR = { hiking: ['boots', 'running', 'sneakers'], gym: ['running', 'sneakers'], formal: ['heels', 'formal', 'loafers', 'flats'], business: ['loafers', 'formal', 'flats', 'heels'], evening: ['heels', 'flats', 'loafers'], beach: ['sandals'] };

  // Best closet items for each line. Season fit, occasion tags, then the ones you wear most.
  function suggest(trip, c) {
    const p = normTripParams(trip || {});
    const rules = packRules(p);
    const idx = wearIndex(c);
    const climate = p.climate.length ? p.climate : ['mild'];
    const good = uniq([].concat(...climate.map((x) => SEASON_FOR[x] || [])));
    const wantTags = uniq([].concat(...p.activities.map((a) => TAG_FOR[a] || [])));
    const score = (it) => {
      let s = 0;
      if (it.seasons.length) {
        if (it.seasons.some((x) => good.includes(x))) s += 3; else return -Infinity;
      } else s += 1;
      if (it.tags.some((t) => wantTags.includes(fold(t)))) s += 2;
      s += Math.log(1 + itemStats(it, idx).total) / 2;
      return s;
    };
    const usable = c.items.filter((it) => it.condition !== 'repair');
    const picks = {};
    rules.lines.forEach((l) => {
      if (!l.cat) return;
      const pool = usable.filter((it) => it.cat === l.cat).map((it) => ({ it, s: score(it) })).filter((x) => x.s > -Infinity)
        .sort((a, b) => b.s - a.s || (a.it.id < b.it.id ? -1 : 1));
      let chosen = [];
      if (l.cat === 'shoes') {
        const needs = [];
        p.activities.forEach((a) => { if (SHOE_FOR[a] && !(['formal', 'business', 'evening'].includes(a) && needs.some((n) => n.dress))) needs.push({ subs: SHOE_FOR[a], dress: ['formal', 'business', 'evening'].includes(a) }); });
        const taken = new Set();
        // specialist pairs first (boots for hiking), then the best everyday pair left
        const special = [];
        needs.forEach((n) => {
          const m = pool.find((x) => !taken.has(x.it.id) && n.subs.includes(x.it.sub));
          if (m) { special.push(m.it.id); taken.add(m.it.id); }
        });
        const everyday = pool.find((x) => !taken.has(x.it.id) && !['heels', 'formal', 'slippers', 'sandals'].includes(x.it.sub));
        chosen = (everyday ? [everyday.it.id] : []).concat(special).slice(0, l.qty);
      } else {
        chosen = pool.slice(0, l.qty).map((x) => x.it.id);
      }
      if (chosen.length) picks[l.cat] = chosen;
    });
    return picks;
  }

  function tripEssentials(p, defaults) {
    const base = (defaults && defaults.length ? defaults : essentialDefaults()).map((e) => (e.key ? { id: newId('e'), key: e.key } : { id: newId('e'), text: e.text }));
    const extra = uniq([].concat(...p.climate.concat(p.activities).map((x) => EXTRAS[x] || [])));
    extra.forEach((k) => { if (!base.some((e) => e.key === k)) base.push({ id: newId('e'), key: k }); });
    return base;
  }
  function newTrip(params, c, opts) {
    const p = normTripParams(params || {});
    const t = Object.assign({ id: newId('t') }, p, { picks: suggest(p, c), packed: {}, essentials: [], created: Date.now() });
    t.essentials = opts && opts.essentials ? opts.essentials.map((e) => Object.assign({}, e, { id: newId('e'), packed: false })) : tripEssentials(p, c.essentials);
    t.essentials.forEach((e) => delete e.packed);
    return t;
  }
  function templateFrom(trip, name) {
    return normTemplate({ id: newId('p'), name: name || trip.name, days: trip.days, laundry: trip.laundry, climate: trip.climate, activities: trip.activities, essentials: trip.essentials });
  }
  // Every checkbox on the list: picked items, count-only lines and essentials.
  function packList(trip, c) {
    const rules = packRules(trip);
    const have = new Set(c.items.map((x) => x.id));
    const rows = [];
    rules.lines.forEach((l) => {
      if (!l.cat) { rows.push({ key: 'count:' + l.key, line: l }); return; }
      (trip.picks[l.cat] || []).filter((id) => have.has(id)).forEach((id) => rows.push({ key: 'item:' + id, line: l, item: id }));
    });
    // picks in categories the rules no longer ask for still count
    Object.keys(trip.picks).forEach((cat) => {
      if (rules.lines.some((l) => l.cat === cat)) return;
      trip.picks[cat].filter((id) => have.has(id)).forEach((id) => rows.push({ key: 'item:' + id, line: { key: cat, cat, qty: 0, rule: 'extra' }, item: id }));
    });
    trip.essentials.forEach((e) => rows.push({ key: 'ess:' + e.id, ess: e }));
    const done = rows.filter((r) => (r.ess ? r.ess.packed : trip.packed[r.key])).length;
    return { rules, rows, done, total: rows.length };
  }

  /* ---------------- outfits ---------------- */
  const LAYER = { outerwear: 0, knitwear: 1, tops: 2, dresses: 2, activewear: 2, swim: 2, sleepwear: 2, bottoms: 3, shoes: 4, bags: 5, accessories: 6, jewellery: 7, other: 8 };
  // Quick grid: two columns, clothes on the left in wearing order, the rest on the right.
  function gridLayout(ids, byId) {
    const its = ids.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => LAYER[a.cat] - LAYER[b.cat]);
    const main = its.filter((x) => LAYER[x.cat] <= 4);
    const side = its.filter((x) => LAYER[x.cat] > 4);
    const left = side.length ? main : main.slice(0, Math.ceil(main.length / 2));
    const right = side.length ? side : main.slice(Math.ceil(main.length / 2));
    const col = (list, x, w) => list.map((it, i) => ({ id: it.id, x, y: (i + 0.5) / Math.max(list.length, 1), w: Math.min(w, 0.9 / Math.max(list.length, 1) * 1.25), z: i }));
    return col(left, side.length ? 0.33 : 0.27, side.length ? 0.5 : 0.42).concat(col(right, side.length ? 0.8 : 0.73, side.length ? 0.3 : 0.42));
  }
  // Starting canvas: wearing order down the middle, accessories at the side, outerwear behind.
  function canvasLayout(ids, byId) {
    const g = gridLayout(ids, byId);
    return g.map((p) => { const it = byId.get(p.id); return Object.assign({}, p, { z: it && it.cat === 'outerwear' ? 0 : LAYER[it ? it.cat : 'other'] + 1 }); });
  }

  return {
    CATS, SUBS, COLOURS, COLOUR_IDS, SEASONS, OCCASIONS, CONDITIONS, CLIMATES, ACTIVITIES, ESSENTIALS, EXTRAS, SORTS,
    newId, isId, fold, str,
    dayStr, isDay, dayNum, addDays, daysBetween, monthWeeks,
    newCatalogue, essentialDefaults, normItem, normOutfit, normTrip, normTemplate, sanitize, merge,
    removeItems, removeOutfit, isWorn, setWorn, wearOutfit, setPlan,
    wearIndex, itemStats, costPerWear, idleDays, streaks, insights,
    filterItems, allTags, shoeRest,
    packRules, suggest, newTrip, templateFrom, packList, tripEssentials,
    gridLayout, canvasLayout,
  };
});
