/*
 * Cast links: a whole cleaned-up script packed into a link (or a .scenewise
 * file) so a teacher, director or casting office can send every actor a
 * ready-to-rehearse copy. The script travels inside the link's #fragment,
 * which browsers never send to any server. Optional password (AES-GCM).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CastLink = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEB_BASE = 'https://wiseapps-dev.github.io/scenewise/open/'; // update to the live site at launch
  const APP_BASE = 'scenewise://open';
  const T = { line: 'l', dir: 'd', head: 'h' };
  const TR = { l: 'line', d: 'dir', h: 'head' };

  const enc = (s) => new TextEncoder().encode(s);
  const dec = (b) => new TextDecoder().decode(b);

  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '==='.slice((t.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function pipe(bytes, Stream) {
    const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  async function keyFrom(password, salt) {
    const base = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Compact form of a parsed script (only what an actor needs).
  function pack(script, extra) {
    const e = extra || {};
    const o = {
      v: 1,
      t: script.title,
      s: script.scenes.map((x) => x.title),
      i: script.items.map((it) => {
        const row = [T[it.type] || 'd', it.type === 'line' ? it.char : '', it.text, it.scene];
        if (it.raw) row.push(it.raw);
        return row;
      }),
    };
    if (e.note) o.n = String(e.note).slice(0, 600);
    if (e.from) o.f = String(e.from).slice(0, 80);
    if (e.parts && e.parts.length) o.p = e.parts.slice(0, 10);
    if (e.due) o.d = String(e.due).slice(0, 10);
    if (e.forName) o.w = String(e.forName).slice(0, 80);
    return o;
  }

  function unpack(o) {
    if (!o || o.v !== 1 || !Array.isArray(o.i) || !Array.isArray(o.s)) throw new Error('bad-link');
    let n = 1;
    const items = o.i.map((r) => {
      const it = { id: 'i' + n++, type: TR[r[0]] || 'dir', text: String(r[2] || ''), scene: Math.max(0, Math.min(o.s.length - 1, r[3] | 0)) };
      if (it.type === 'line') it.char = String(r[1] || '').toUpperCase() || 'UNKNOWN';
      if (r[4]) it.raw = String(r[4]);
      return it;
    }).filter((it) => it.text);
    return {
      script: { v: 1, title: String(o.t || 'Shared script'), format: 'link', items, scenes: o.s.map((t) => ({ title: String(t) })), nextId: n, warnings: [] },
      note: o.n || '',
      from: o.f || '',
      parts: Array.isArray(o.p) ? o.p.map(String) : [],
      due: o.d || '',
      forName: o.w || '',
    };
  }

  /*
   * encode(script, {note, from, parts, due, password}) -> 'v1.<mode>.<data>'
   * mode: z = deflate, r = plain; e prefix = password protected.
   */
  async function encode(script, extra) {
    const e = extra || {};
    let bytes = enc(JSON.stringify(pack(script, e)));
    let mode = 'r';
    if (canZip()) { bytes = await pipe(bytes, CompressionStream); mode = 'z'; }
    if (e.password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await keyFrom(e.password, salt);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
      return 'v1.e' + mode + '.' + b64url(salt) + '.' + b64url(iv) + '.' + b64url(ct);
    }
    return 'v1.' + mode + '.' + b64url(bytes);
  }

  // Pull the code out of anything the user pasted: a full link, a fragment or the code itself.
  function extract(text) {
    const s = String(text || '').trim();
    const m = /v1\.(?:e?[zr])\.[A-Za-z0-9_\-.]+/.exec(s);
    return m ? m[0] : null;
  }

  function isLocked(code) { return /^v1\.e/.test(code || ''); }

  /*
   * decode(codeOrLink, password) -> {script, note, from, parts, due}
   * Throws: 'not-a-link', 'needs-password', 'bad-password', 'bad-link', 'no-zip'
   */
  async function decode(text, password) {
    const code = extract(text);
    if (!code) throw new Error('not-a-link');
    const parts = code.split('.');
    const mode = parts[1];
    let bytes;
    if (mode[0] === 'e') {
      if (!password) throw new Error('needs-password');
      const [salt, iv, ct] = parts.slice(2).map(unb64url);
      try {
        const key = await keyFrom(password, salt);
        bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
      } catch (err) {
        throw new Error('bad-password');
      }
    } else {
      bytes = unb64url(parts[2] || '');
    }
    if (mode.slice(-1) === 'z') {
      if (!canZip()) throw new Error('no-zip');
      try { bytes = await pipe(bytes, DecompressionStream); } catch (err) { throw new Error('bad-link'); }
    }
    let o;
    try { o = JSON.parse(dec(bytes)); } catch (err) { throw new Error('bad-link'); }
    return unpack(o);
  }

  const webLink = (code) => WEB_BASE + '#' + code;
  const appLink = (code) => APP_BASE + '#' + code;

  return { encode, decode, extract, isLocked, webLink, appLink, pack, unpack, WEB_BASE, APP_BASE };
});
