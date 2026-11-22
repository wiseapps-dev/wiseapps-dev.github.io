/*
 * Line-rehearsal engine: script parsing, character fixes, memory drills,
 * the run queue (who speaks next), typed-attempt checking and progress.
 * Pure functions, no DOM, no network. Works in the browser and in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Text helpers                                                       */
  /* ------------------------------------------------------------------ */

  const WORD_RE = /[\p{L}\p{N}](?:[\p{L}\p{N}'’\-]*[\p{L}\p{N}])?/gu;

  function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // Index of the bracket that closes the one at i (nesting aware), or -1.
  function closeOf(s, i) {
    const open = s[i];
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === open) depth++;
      else if (s[j] === close) { depth--; if (depth === 0) return j; }
    }
    return -1;
  }

  // Split text into words (w), separators (s) and bracketed directions (d).
  // Directions are "(beat)" or "[aside]" and are never hidden or spoken.
  function segments(text) {
    const out = [];
    const s = String(text == null ? '' : text);
    let buf = '';
    const pushText = (t) => {
      let last = 0;
      for (const m of t.matchAll(WORD_RE)) {
        if (m.index > last) out.push({ k: 's', t: t.slice(last, m.index) });
        out.push({ k: 'w', t: m[0] });
        last = m.index + m[0].length;
      }
      if (last < t.length) out.push({ k: 's', t: t.slice(last) });
    };
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '(' || c === '[') {
        const j = closeOf(s, i);
        if (j !== -1) {
          if (buf) { pushText(buf); buf = ''; }
          out.push({ k: 'd', t: s.slice(i, j + 1) });
          i = j + 1;
          continue;
        }
      }
      buf += c;
      i++;
    }
    if (buf) pushText(buf);
    return out;
  }

  function words(text) {
    return segments(text).filter((x) => x.k === 'w').map((x) => x.t);
  }

  // What the voice should say: no bracketed directions, tidy spacing.
  function spoken(text) {
    return segments(text)
      .map((x) => (x.k === 'd' ? ' ' : x.t))
      .join('')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?…])/g, '$1')
      .replace(/^[\s,.;:—–-]+(?=\p{L}|\p{N})/u, '')
      .trim();
  }

  const ABBR = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Mt|Ft|Lt|Col|Gen|Capt|Sgt|Prof|Rev|Fr|vs|etc|No|Nos|Vol|approx|e\.g|i\.e|Hr|Frl|Nr|bzw|usw|z\.B|Mme|Mlle|Sra|Srta|Sig|Dhr|Mevr)\.$/i;
  // Sentences, without breaking on decimals (3.50), times (10.30) or Mr./St.
  function sentences(s) {
    const out = [];
    let start = 0;
    const re = /[.!?…]+["'’”»)\]]*(?=\s|$)/g;
    let m;
    while ((m = re.exec(s))) {
      const end = m.index + m[0].length;
      const chunk = s.slice(start, end);
      if (m[0][0] === '.' && m[0].length === 1 && ABBR.test(chunk)) continue;
      out.push(chunk.trim());
      start = end;
    }
    const rest = s.slice(start).trim();
    if (rest) out.push(rest);
    return out.filter(Boolean);
  }

  function lastPhrase(text, maxWords) {
    const max = maxWords || 10;
    const s = spoken(text);
    if (!s) return '';
    const sn = sentences(s);
    let last = sn[sn.length - 1];
    // a one-word final sentence ("No.") is a weak cue: take the one before too
    if (sn.length > 1 && words(last).length < 3) last = sn[sn.length - 2] + ' ' + last;
    const segs = segments(last);
    const wIdx = [];
    segs.forEach((x, i) => { if (x.k === 'w') wIdx.push(i); });
    if (wIdx.length <= max) return last;
    const from = wIdx[wIdx.length - max];
    return '…' + segs.slice(from).map((x) => x.t).join('').trim();
  }

  /* ------------------------------------------------------------------ */
  /* Script parsing                                                     */
  /* ------------------------------------------------------------------ */

  // Never character names.
  const STOP = new Set([
    'NOTE', 'NOTES', 'SETTING', 'SETTINGS', 'SCENE', 'ACT', 'CAST', 'CHARACTERS', 'CHARACTER',
    'DRAMATIS PERSONAE', 'PERSONS OF THE PLAY', 'PERSONS REPRESENTED', 'AT RISE', 'AT CURTAIN', 'TITLE', 'AUTHOR',
    'WRITTEN BY', 'DRAFT', 'DRAFT DATE', 'HTTP', 'HTTPS', 'WWW', 'SFX', 'LIGHTING', 'PROPS', 'COSTUME', 'COSTUMES',
    'PS', 'P.S', 'RE', 'CC', 'NB', 'N.B', 'TRANSITION', 'INT', 'EXT', 'CUT TO', 'FADE IN', 'FADE OUT', 'DISSOLVE TO',
    'SMASH CUT TO', 'MATCH CUT TO', 'INTERCUT', 'BACK TO SCENE', 'THE END', 'CONTINUED', 'CURTAIN', 'BLACKOUT',
    'LIGHTS UP', 'LIGHTS DOWN', 'END OF ACT', 'END OF PLAY', 'END OF SCENE', 'INTERVAL', 'INTERMISSION', 'SUPER',
    'TITLE CARD', 'CHYRON', 'MONTAGE', 'FLASHBACK', 'CREDIT', 'CONTACT', 'COPYRIGHT', 'SOURCE', 'REVISION', 'EXIT',
    'EXEUNT', 'ENTER', 'CONTINUOUS', 'MOMENTS LATER', 'CONTENTS', 'INGREDIENTS', 'METHOD', 'SERVES', 'AGENDA',
    'ATTENDEES', 'ACTION ITEMS', 'NEXT STEPS', 'OUTCOME', 'MINUTES',
  ]);
  // European equivalents. Used only when the script reads as a European language,
  // so an English play with a role called CENA or ROLLER is unaffected.
  const STOP_EU = new Set([
    // German
    'PERSONEN', 'DIE PERSONEN', 'PERSONEN DER HANDLUNG', 'BESETZUNG', 'ROLLEN', 'ORT', 'ORT DER HANDLUNG', 'SZENE', 'AKT', 'AUFZUG',
    'AUFTRITT', 'VORHANG', 'ENDE', 'ANMERKUNG', 'ANMERKUNGEN', 'HINWEIS', 'HINWEISE', 'BÜHNE', 'BÜHNENBILD', 'REQUISITEN', 'KOSTÜME',
    'VORBEMERKUNG', 'INHALT', 'INHALTSVERZEICHNIS', 'ZUTATEN', 'ZUBEREITUNG', 'BETREFF', 'ABGANG',
    // French
    'PERSONNAGES', 'LES PERSONNAGES', 'DISTRIBUTION', 'ACTE', 'SCÈNE', 'TABLEAU', 'RIDEAU', 'DÉCOR', 'LIEU', 'REMARQUE', 'AVERTISSEMENT',
    'PRÉFACE', 'OBJET', 'INGRÉDIENTS', 'PRÉPARATION', 'ENTRACTE', 'SORTIE',
    // Spanish
    'PERSONAJES', 'REPARTO', 'ACTO', 'ESCENA', 'CUADRO', 'JORNADA', 'TELÓN', 'MUTIS', 'DECORADO', 'ÉPOCA', 'ACOTACIÓN', 'ASUNTO',
    'INGREDIENTES', 'PREPARACIÓN', 'INTERMEDIO', 'ENTREACTO',
    // Italian
    'PERSONAGGI', 'INTERPRETI', 'ATTO', 'SCENA', 'QUADRO', 'SIPARIO', 'LUOGO', 'OGGETTO', 'INGREDIENTI', 'PREPARAZIONE', 'INTERVALLO',
    'DIDASCALIA',
    // Dutch
    'PERSONAGES', 'ROLVERDELING', 'BEDRIJF', 'TONEEL', 'TAFEREEL', 'DOEK', 'EINDE', 'PAUZE', 'PLAATS', 'ONDERWERP', 'INGREDIËNTEN',
    'BEREIDING',
    // Polish
    'OSOBY', 'OSOBY DRAMATU', 'OBSADA', 'ODSŁONA', 'KURTYNA', 'KONIEC', 'ANTRAKT', 'PRZERWA', 'ZACIEMNIENIE', 'MIEJSCE', 'MIEJSCE AKCJI',
    'TEMAT', 'SKŁADNIKI', 'PRZYGOTOWANIE',
    // Portuguese
    'PERSONAGENS', 'ELENCO', 'ATO', 'CENA', 'PANO', 'FIM', 'INTERVALO', 'CENÁRIO', 'ASSUNTO', 'PREPARAÇÃO', 'RUBRICA',
    // Swedish
    'PERSONER', 'PERSONERNA', 'ROLLISTA', 'ROLLER', 'AKTEN', 'SCEN', 'SCENEN', 'TABLÅ', 'RIDÅ', 'MÖRKLÄGGNING', 'ÄMNE', 'INGREDIENSER',
    'TILLAGNING', 'ANMÄRKNING',
  ]);
  // Usually not names, but real roles in some plays (MORE, PAGE, SILENCE...):
  // accepted only when they speak at least twice.
  const SOFT = new Set([
    'MORE', 'PAGE', 'SILENCE', 'TIME', 'PLACE', 'LOCATION', 'DATE', 'BEAT', 'PAUSE', 'SOUND', 'MUSIC', 'LIGHTS', 'ACTION',
    'LATER', 'END', 'BY', 'FROM', 'TO', 'SUBJECT', 'OK', 'NO', 'YES', 'AH', 'OH', 'WELL', 'SO', 'AND', 'BUT', 'THE', 'HE',
    'SHE', 'THEY', 'WE', 'YOU', 'IT', 'LISTEN', 'LOOK', 'WAIT', 'REMEMBER', 'SEE', 'ANSWER', 'QUESTION', 'REASON', 'RESULT',
    'WARNING', 'TIP', 'HINT', 'EXAMPLE', 'UPDATE', 'IMPORTANT', 'ALSO', 'PLUS', 'BONUS', 'FACT', 'TRUTH', 'PROBLEM', 'SOLUTION', 'STEP',
    'MIX', 'BAKE', 'COOK', 'STIR', 'PREHEAT', 'ADD', 'SERVE', 'TOTAL', 'PRICE', 'COST',
  ]);
  // European soft words (only for European scripts, so English roles like VI, TY or HAN keep working).
  const SOFT_EU = new Set([
    // European pronouns (ER and SIE, ELLE and LUI are real roles in some plays), yes/no, time, place, sound
    'ER', 'SIE', 'ES', 'ICH', 'DU', 'WIR', 'IHR', 'ELLE', 'LUI', 'IL', 'ILS', 'ELLES', 'MOI', 'TOI', 'NOUS', 'VOUS', 'ÉL', 'ELLA', 'YO', 'TÚ',
    'LEI', 'IO', 'TU', 'NOI', 'VOI', 'LORO', 'HIJ', 'ZIJ', 'IK', 'JIJ', 'WIJ', 'ON', 'ONA', 'ONI', 'JA', 'TY', 'MY', 'WY', 'ELE', 'ELA', 'EU',
    'HAN', 'HON', 'JAG', 'VI', 'NI', 'DE', 'NEIN', 'OUI', 'NON', 'SÍ', 'SÌ', 'NEE', 'NEJ', 'TAK', 'NIE', 'SIM', 'NÃO', 'ACH', 'BON', 'BUENO',
    'BENE', 'GOED', 'BRA', 'BEM', 'ALORS', 'ALLORA', 'PUES', 'ZEIT', 'TEMPS', 'TIEMPO', 'TEMPO', 'TIJD', 'CZAS', 'TID', 'LUGAR', 'NOTA',
    'FIN', 'FINE', 'SLUT', 'NOIR', 'BUIO', 'OSCURO', 'DUNKEL', 'ESCURO', 'MÖRKER', 'CIEMNOŚĆ', 'MUSIK', 'MUSIQUE', 'MÚSICA', 'MUSICA',
    'MUZIEK', 'MUZYKA', 'PAUSA', 'PAUS', 'STILLE', 'SILENCIO', 'SILENZIO', 'STILTE', 'CISZA', 'SILÊNCIO', 'TYSTNAD', 'UWAGA', 'OBS',
  ]);
  const CONNECT = new Set(['of', 'the', 'de', 'la', 'le', 'von', 'van', 'du', 'da', 'del', 'der', 'and', '&', 'y', 'in', 'on']);
  const CONNECT_EU = new Set(['und', 'et', 'e', 'i', 'en', 'och', 'zu', 'vom', 'zum', 'della', 'di', 'do', 'dos', 'das', 'des', 'ten', 'ter', 'het', 'af']);
  // Language of the script being parsed ('' outside parse or when unsure).
  let CTX_LANG = '';
  const euOn = () => !!CTX_LANG && CTX_LANG !== 'en';
  const NAME_CHARS = /^[\p{L}\p{N} .'’\-&\/#]+$/u;
  const GROUP = new Set(['ALL', 'BOTH', 'EVERYONE', 'TOGETHER', 'ALL TOGETHER', 'COMPANY', 'ENSEMBLE', 'CHORUS', 'OMNES', 'ALL THREE', 'ALL FOUR',
    'ALLE', 'BEIDE', 'ALLE ZUSAMMEN', 'CHOR', 'TOUS', 'TOUTES', 'TOUS ENSEMBLE', 'LES DEUX', 'TOUS LES DEUX', 'CHŒUR', 'CHOEUR',
    'TODOS', 'TODAS', 'TODOS A LA VEZ', 'TODOS JUNTOS', 'LOS DOS', 'AMBOS', 'AMBAS', 'CORO', 'TUTTI', 'TUTTE', 'TUTTI INSIEME', 'INSIEME',
    'ENTRAMBI', 'ENTRAMBE', 'ALLEN', 'BEIDEN', 'IEDEREEN', 'ALLEN TEGELIJK', 'KOOR', 'WSZYSCY', 'RAZEM', 'OBAJ', 'OBYDWAJ', 'OBYDWIE',
    'CHÓR', 'OS DOIS', 'AS DUAS', 'ALLA', 'BÅDA', 'BÄGGE', 'ALLA TILLSAMMANS', 'KÖR']);
  const TITLE_KEYS = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision|written by)\s*:/i;
  const EXT_TAG = /\((?:V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|CONT'?D|CONT’D|CONTD|CONTINUING|CONT|PRE-?LAP|FILTERED|INTO PHONE|ON PHONE|ON SCREEN|ON TV|ON RADIO|SUBTITLED?)\)/i;
  // screenplay camera/shot lines
  const SHOT_RE = /^(?:INSERT|POV|ANGLE ON|ANOTHER ANGLE|NEW ANGLE|REVERSE ANGLE|REVERSE ON|CLOSE ON|CLOSE UP|CLOSE-UP|CLOSEUP|EXTREME CLOSE|ECU|WIDE ON|WIDE SHOT|WIDE|ESTABLISHING|AERIAL|TRACKING|MONTAGE|SERIES OF SHOTS|FLASHBACK|END FLASHBACK|BACK TO PRESENT|SUPER|TITLE CARD|ON SCREEN|SPLIT SCREEN|OVER BLACK|BLACK SCREEN|MOMENTS LATER|LATER|CONTINUOUS|INTERCUT|BACK TO)\b|\bPOV\b/;
  // unbracketed stage directions in classic texts
  const DIR_LINE = /^(?:(?:Re-?enter|Enter)\s+(?:[\p{Lu}]|the\s|a\s|an\s|two\s|three\s|several\s)|(?:Exit|Exeunt|Manet|Manent)(?:\s+(?:omnes|[\p{Lu}].*))?\.?$|(?:Flourish|Alarums?|Sennet|Hautboys|Trumpets? sound|Thunder and lightning|They fight|They fight\.|Dies|He dies|She dies|Music\.|Excursions)\b)/u;

  function cleanName(raw) {
    let n = String(raw).replace(/^@/, '').replace(/\^\s*$/, '');
    n = n.replace(/(\s*\([^)]*\))+\s*$/, '');
    n = n.replace(/\s*[.:]+\s*$/, '').replace(/\s+/g, ' ').trim();
    return n;
  }
  // All capitals, counting a lower-case ß as a capital (GROßMUTTER).
  const isCaps = (s) => { const x = String(s).replace(/ß/g, 'ẞ'); return x === x.toUpperCase(); };
  // ß becomes ẞ rather than SS, so the name still reads "Großmutter".
  const keyOf = (n) => cleanName(n).replace(/ß/g, 'ẞ').toUpperCase().replace(/’/g, "'");

  // false, or 'soft' when it is a usually-not-a-name word, or true.
  function validName(n, needCaps) {
    if (!n || n.length > 40) return false;
    if (!/\p{L}/u.test(n)) return false;
    if (!NAME_CHARS.test(n)) return false;
    const ws = n.split(/\s+/);
    if (ws.length > 5) return false;
    const up = n.toUpperCase().replace(/’/g, "'");
    if (STOP.has(up) || (euOn() && STOP_EU.has(up)) || SHOT_RE.test(up)) return false;
    let ok;
    if (needCaps) ok = isCaps(n) && /\p{Lu}/u.test(n);
    else ok = ws.every((w) => /^[\p{Lu}\p{N}]/u.test(w) || CONNECT.has(w.toLowerCase()) || (euOn() && CONNECT_EU.has(w.toLowerCase()))) && /^[\p{Lu}\p{N}]/u.test(ws[0]);
    if (!ok) return false;
    return SOFT.has(up) || (euOn() && SOFT_EU.has(up)) ? 'soft' : true;
  }

  const NUMW = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|final|last';
  const ACT_RE = new RegExp(`^(act)\\s+([ivxlc]+|\\d+|${NUMW})\\b(.*)$`, 'i');
  const SCENE_RE = new RegExp(`^(scene)\\s+([ivxlc]+|\\d+[a-z]?|${NUMW})\\b(.*)$`, 'i');
  const SECTION_RE = /^(?:THE\s+)?(PROLOGUE|EPILOGUE|INDUCTION|PROLOG|PRÓLOGO|PROLOGO|PROLOOG|EPILOG|ÉPILOGUE|EPÍLOGO|EPILOGO|EPILOOG|VORSPIEL|NACHSPIEL)\.?$/iu;

  /* European act and scene headings: "ERSTER AKT", "1. Auftritt", "Acte premier", "SCÈNE II",
   * "JORNADA PRIMERA", "ATTO PRIMO. SCENA PRIMA.", "Eerste bedrijf", "Odsłona 2", "Första akten". */
  const EU_ACT_W = ['akt', 'aufzug', 'acte', 'acto', 'jornada', 'atto', 'bedrijf', 'akte', 'ato', 'akten'];
  const EU_SCENE_W = ['szene', 'auftritt', 'bild', 'scène', 'scene', 'tableau', 'escena', 'cuadro', 'scena', 'quadro', 'toneel', 'tooneel',
    'tafereel', 'odsłona', 'obraz', 'cena', 'scen', 'scenen', 'tablå', 'tablån'];
  const EU_ORD_DE = ['erste[rsn]?', 'zweite[rsn]?', 'dritte[rsn]?', 'vierte[rsn]?', 'fünfte[rsn]?', 'sechste[rsn]?', 'siebe?nte[rsn]?', 'achte[rsn]?',
    'neunte[rsn]?', 'zehnte[rsn]?', 'elfte[rsn]?', 'zwölfte[rsn]?', 'letzte[rsn]?'];
  const EU_ORD = EU_ORD_DE.concat([
    'premier', 'première', 'premiere', 'deuxième', 'deuxieme', 'second', 'seconde', 'troisième', 'troisieme', 'quatrième', 'quatrieme',
    'cinquième', 'cinquieme', 'sixième', 'sixieme', 'septième', 'septieme', 'huitième', 'huitieme', 'neuvième', 'neuvieme', 'dixième', 'dixieme',
    'dernier', 'dernière', 'derniere',
    'primer', 'primero', 'primera', 'segundo', 'segunda', 'tercer', 'tercero', 'tercera', 'cuarto', 'cuarta', 'quinto', 'quinta', 'sexto', 'sexta',
    'séptimo', 'séptima', 'septimo', 'septima', 'octavo', 'octava', 'noveno', 'novena', 'décimo', 'décima', 'último', 'última',
    'primeiro', 'primeira', 'terceiro', 'terceira', 'quarto', 'quarta', 'sétimo', 'sétima', 'oitavo', 'oitava', 'nono', 'nona',
    'primo', 'prima', 'secondo', 'seconda', 'terzo', 'terza', 'sesto', 'sesta', 'settimo', 'settima', 'ottavo', 'ottava', 'decimo', 'decima',
    'ultimo', 'ultima',
    'eerste', 'tweede', 'derde', 'vierde', 'vijfde', 'zesde', 'zevende', 'achtste', 'negende', 'tiende', 'laatste',
    'pierwszy', 'pierwsza', 'drugi', 'druga', 'trzeci', 'trzecia', 'czwarty', 'czwarta', 'piąty', 'piąta', 'szósty', 'szósta', 'siódmy', 'siódma',
    'ósmy', 'ósma', 'dziewiąty', 'dziewiąta', 'dziesiąty', 'dziesiąta', 'ostatni', 'ostatnia',
    'första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde', 'sista',
  ]);
  const EU_CARD = ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'un', 'deux', 'trois', 'quatre', 'cinq',
    'six', 'sept', 'huit', 'neuf', 'dix', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'due', 'tre',
    'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'een', 'twee', 'drie', 'vijf', 'zes', 'zeven', 'negen', 'tien', 'jeden',
    'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć', 'dziesięć', 'um', 'dois', 'três', 'quatro', 'sete', 'oito',
    'dez', 'ett', 'två', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio'];
  const alt = (a) => a.slice().sort((x, y) => y.length - x.length).join('|');
  const EU_END = '(?=$|[\\s.,:;!?)\\]\\-–—])';
  const EU_WORD = `(${alt(EU_ACT_W)}|${alt(EU_SCENE_W)})`;
  const EU_PRE = new RegExp(`^(\\d+\\.|${alt(EU_ORD)})\\s+${EU_WORD}${EU_END}(.*)$`, 'iu');
  const EU_POST = new RegExp(`^${EU_WORD}\\s+([ivxlc]+|\\d+[a-z]?|${alt(EU_ORD)}|${alt(EU_CARD)})${EU_END}(.*)$`, 'iu');
  const EU_ACT_SET = new Set(EU_ACT_W);
  const DE_ORD_RE = new RegExp(`^(?:${EU_ORD_DE.join('|')})$`, 'u');

  // {act: bool, name: "Erster Akt", rest} or null
  function euHeadWord(l) {
    let m = EU_PRE.exec(l);
    if (m) return { act: EU_ACT_SET.has(m[2].toLowerCase()), name: euCase(m[1] + ' ' + m[2]), rest: m[3] };
    m = EU_POST.exec(l);
    if (m) return { act: EU_ACT_SET.has(m[1].toLowerCase()), name: euCase(m[1] + ' ' + m[2]), rest: m[3] };
    return null;
  }
  // The script's own words; all capitals become "Erster Akt", "Acte premier", "Scène II".
  function euCase(s) {
    const x = squash(s);
    if (!isCaps(x)) return x;
    const ws = x.toLowerCase().split(' ');
    const german = ws.some((w) => /^(?:aufzug|szene|auftritt|bild)$/.test(w) || DE_ORD_RE.test(w));
    return ws.map((w, i) => (/^[ivxlc]+$/.test(w) ? w.toUpperCase() : i === 0 || german ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  }
  function euRest(rest) {
    const r = rest.trim();
    if (!r) return { ok: true, tail: '' };
    if (/^[.:,;\-–—]/.test(r)) return { ok: true, tail: r.replace(/^[\s.:,;\-–—]+/, '') };
    if (isCaps(r) && /\p{L}/u.test(r)) return { ok: true, tail: r };
    return { ok: false };
  }
  function euHeading(l) {
    const h = euHeadWord(l);
    if (!h) return null;
    if (h.act) {
      const sc = euHeadWord(h.rest.replace(/^[\s,.:;\-–—]+/, ''));
      if (sc && !sc.act) {
        const hr = euRest(sc.rest);
        if (hr.ok) return { kind: 'act', title: h.name, scene: sc.name + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
      }
      const hr = euRest(h.rest);
      if (hr.ok) return { kind: 'act', title: h.name + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
      return null;
    }
    const hr = euRest(h.rest);
    if (hr.ok) return { kind: 'scene', title: h.name + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
    return null;
  }

  function headingRest(rest) {
    // "", ". The garden", ": Elsinore", " - NIGHT", or an all-caps tail
    const r = rest.trim();
    if (!r) return { ok: true, tail: '' };
    if (/^[.:,\-–—]/.test(r)) return { ok: true, tail: r.replace(/^[.:,\-–—]+\s*/, '') };
    if (isCaps(r) && /\p{L}/u.test(r)) return { ok: true, tail: r };
    return { ok: false };
  }

  function cap(w) {
    return /^[ivxlc]+$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }
  const squash = (s) => s.replace(/\s+/g, ' ').trim();

  // Returns {kind, title, text, raw} or null. text is what the reader shows.
  function headingOf(line) {
    const l = line.trim();
    if (!l || l.length > 120) return null;
    let m = /^#{1,3}\s+(.+)$/.exec(l);
    if (m) return { kind: 'section', title: squash(m[1]), text: squash(m[1]), raw: l };
    m = /^\.(?!\.)(\S.*)$/.exec(l);
    if (m) return { kind: 'slug', title: squash(m[1]), text: squash(m[1]), raw: l };
    m = ACT_RE.exec(l);
    if (m && (m[1] === 'ACT' || m[1] === 'Act' || m[1] === 'act')) {
      const rest = m[3];
      const sm = SCENE_RE.exec(rest.replace(/^[\s,.:\-–—]+/, ''));
      const act = 'Act ' + cap(m[2]);
      if (sm) {
        const hr = headingRest(sm[3]);
        if (hr.ok) return { kind: 'act', title: act, scene: 'Scene ' + cap(sm[2]) + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
      }
      const hr = headingRest(rest);
      if (hr.ok) return { kind: 'act', title: act + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
    }
    m = SCENE_RE.exec(l);
    if (m && (m[1] === 'SCENE' || m[1] === 'Scene' || m[1] === 'scene')) {
      const hr = headingRest(m[3]);
      if (hr.ok) return { kind: 'scene', title: 'Scene ' + cap(m[2]) + (hr.tail ? ': ' + hr.tail : ''), text: squash(l), raw: l };
    }
    const eu = euHeading(l);
    if (eu) return eu;
    // screenplay slugline, optionally wrapped in matching scene numbers
    let body = l;
    m = /^(\d+[A-Z]?)\s+(.*?)(?:\s+\1)?$/.exec(l);
    if (m) body = m[2];
    if (/^(?:INT|EXT|EST|I\/E|E\/I|INT\.?\s?\/\s?EXT|EXT\.?\s?\/\s?INT|INNEN|AUSSEN|AUẞEN|AUßEN)(?:\.|\s)/.test(body) || /^(?:int|ext|est|i\/e)\./i.test(body)) {
      return { kind: 'slug', title: squash(body), text: squash(body), raw: squash(body) };
    }
    return null;
  }

  // "Der Vorhang fällt.", "Rideau.", "Cae el telón.", "Sipario.", "Doek.", "Kurtyna.", "Pano.", "Ridå."
  const EU_CURTAIN = /^(?:(?:der\s+)?vorhang(?:\s+fällt)?|(?:le\s+)?rideau(?:\s+tombe)?|(?:cae\s+el\s+)?telón(?:\s+(?:rápido|lento))?|(?:cala\s+il\s+)?sipario|(?:het\s+)?doek(?:\s+valt)?|kurtyna(?:\s+opada)?|(?:(?:cai|desce)\s+o\s+)?pano|ridå(?:n\s+(?:går\s+ned|faller))?)\.?$/iu;
  // "ENDE", "FIN DE L'ACTE PREMIER", "KONIEC AKTU PIERWSZEGO" (capitals only: "Ende." can be a line)
  const EU_END_RE = /^(?:ENDE|FIN|EINDE|KONIEC|FIM)(?:\s+(?:DES|DER|DU|DE|DEL|DO|DA|DAS|VAN|AKTU|SCENY|DRAMATU|ERSTEN|ZWEITEN|DRITTEN|VIERTEN|FÜNFTEN)\s.*)?\.?$/u;
  function isTransition(l) {
    return /^(?:[A-Z][A-Z .'’-]* TO:|FADE (?:IN|OUT)[:.]?|FADE TO BLACK\.?|CUT TO BLACK\.?|THE END\.?|END\.?|BLACKOUT\.?|CURTAIN\.?|LIGHTS (?:UP|DOWN|OUT|FADE)\b.*|INTERCUT\b.*|BACK TO SCENE\.?|END OF (?:ACT|SCENE|PLAY)\b.*|>.*)$/.test(l) ||
      EU_CURTAIN.test(l) || EU_END_RE.test(l);
  }
  // End words that are also English words (FINE, SLUT): only in Italian and Swedish scripts.
  function isLangEnd(l, lang) {
    return (lang === 'it' && /^FINE(?:\s+DEL\S*\s.*)?\.?$/u.test(l)) || (lang === 'sv' && /^SLUT(?:\s+PÅ\s.*)?\.?$/u.test(l));
  }

  /* Unbracketed stage directions in European plays. subj: "<names> sort", "Ferdinand ab."; lead: "Entra Lucía.";
   * bare: a whole line. Names must be speakers in this script (or a pronoun), so "Hau ab." stays dialogue. */
  const LANG_DIR = {
    de: {
      pron: ['er', 'sie', 'es', 'alle', 'beide', 'die vorigen', 'die übrigen', 'die anderen', 'alle anderen', 'alle übrigen'],
      join: /\s*(?:,|\bund\b)\s*/u,
      subj: [/^(.+?)\s+(?:(?:geht|gehen|eilt|eilen|läuft|laufen|stürzt|stürzen|schleicht|schleichen)\s+)?ab\.?$/u, /^(.+?)\s+(?:tritt|treten)\s+(?:auf|ein|herein)(?:\s.{0,40})?\.?$/u],
      lead: [/^(?:Abgang|Auftritt)\s+(.+?)\.?$/u],
      bare: /^(?:Ab|Abgang|ABGANG|Geht ab|Gehen ab|Tritt auf|Treten auf|Tritt ein|Treten ein)\.?$/u,
    },
    fr: {
      pron: ['il', 'elle', 'ils', 'elles', 'tous', 'toutes', 'tous deux', 'toutes deux', 'tous les deux', 'on'],
      join: /\s*(?:,|\bet\b)\s*/u,
      subj: [/^(.+?)\s+(?:sort|sortent|entre|entrent|rentre|rentrent|s['’]en va|s['’]en vont|s['’]éloigne|s['’]éloignent)(?:\s+(?:seul|seule|seuls|seules|tous|toutes|ensemble|vivement|précipitamment|lentement))?\.?$/u],
      lead: [/^(?:Entre|Entrent|Rentre|Rentrent|Sort|Sortent)\s+(.+?)\.?$/u],
      bare: /^(?:Sort|Sortent|Sortie|Fausse sortie)\.?$/u,
    },
    es: {
      pron: ['todos', 'todas', 'ambos', 'ambas', 'los dos', 'las dos', 'él', 'ella', 'ellos', 'ellas'],
      join: /\s*(?:,|\by\b)\s*/u,
      subj: [/^(.+?)\s+(?:sale|salen|entra|entran|se va|se van|hace mutis|hacen mutis)(?:\s+por\s.{1,30})?\.?$/u],
      lead: [/^(?:Sale|Salen|Entra|Entran|Vase|Vanse|Éntrase|Éntranse)\s+(.+?)\.?$/u],
      bare: /^(?:Vase|Vanse|Sale|Salen|Éntrase|Éntranse|Mutis|Hace mutis|Hacen mutis|Se van|Salen todos|Vanse todos)\.?$/u,
    },
    it: {
      pron: ['tutti', 'tutte', 'lui', 'lei', 'loro', 'entrambi', 'entrambe'],
      join: /\s*(?:,|\be\b)\s*/u,
      subj: [/^(.+?)\s+(?:esce|escono|entra|entrano|parte|partono)(?:\s+(?:da|di)\s.{1,30})?\.?$/u],
      lead: [/^(?:Esce|Escono|Entra|Entrano|Parte|Partono)\s+(.+?)\.?$/u],
      bare: /^(?:Esce|Escono|Parte|Partono|Escono tutti|Partono tutti)\.?$/u,
    },
    nl: {
      pron: ['hij', 'zij', 'ze', 'allen', 'beiden', 'iedereen'],
      join: /\s*(?:,|\ben\b)\s*/u,
      subj: [/^(.+?)\s+(?:(?:gaat|gaan|loopt|lopen)\s+)?af\.?$/u, /^(.+?)\s+(?:komt|komen)\s+op\.?$/u],
      lead: [/^Opkomst\s+(.+?)\.?$/u],
      bare: /^(?:Gaat af|Gaan af|Komt op|Komen op)\.?$/u,
    },
    pl: {
      pron: ['on', 'ona', 'oni', 'one', 'wszyscy', 'obaj', 'obie', 'obydwaj'],
      join: /\s*(?:,|\bi\b)\s*/u,
      subj: [/^(.+?)\s+(?:wychodzi|wychodzą|wchodzi|wchodzą|wybiega|wybiegają|wbiega|wbiegają|odchodzi|odchodzą)(?:\s.{0,30})?\.?$/u],
      lead: [/^(?:Wchodzi|Wchodzą|Wychodzi|Wychodzą|Wbiega|Wbiegają|Wybiega|Wybiegają)\s+(.+?)\.?$/u],
      bare: /^(?:Wychodzi|Wychodzą|Odchodzi|Odchodzą|Wybiega|Wybiegają|Wszyscy wychodzą)\.?$/u,
    },
    pt: {
      pron: ['ele', 'ela', 'eles', 'elas', 'todos', 'todas', 'ambos'],
      join: /\s*(?:,|\be\b)\s*/u,
      subj: [/^(.+?)\s+(?:sai|saem|entra|entram)(?:\s+por\s.{1,30})?\.?$/u],
      lead: [/^(?:Sai|Saem|Entra|Entram)\s+(.+?)\.?$/u],
      bare: /^(?:Sai|Saem|Saem todos)\.?$/u,
    },
    sv: {
      pron: ['han', 'hon', 'de', 'alla', 'båda', 'bägge'],
      join: /\s*(?:,|\boch\b)\s*/u,
      subj: [/^(.+?)\s+(?:går ut|går in|går|kommer in|springer ut|rusar ut)\.?$/u],
      lead: [],
      bare: /^(?:Går ut|Går in|Kommer in|Alla går ut)\.?$/u,
    },
  };
  function isLangDir(l, lang, isName) {
    const d = LANG_DIR[lang];
    if (!d || l.length > 90) return false;
    if (d.bare.test(l)) return true;
    const who = (s) => {
      const parts = s.split(d.join).map((x) => x.trim()).filter(Boolean);
      return parts.length > 0 && parts.length <= 4 && parts.every((p) => d.pron.includes(p.toLowerCase()) || (/^\p{Lu}/u.test(p) && isName(p)));
    };
    for (const re of d.subj) { const m = re.exec(l); if (m && who(m[1])) return true; }
    for (const re of d.lead) { const m = re.exec(l); if (m && who(m[1])) return true; }
    return false;
  }
  function isShot(l) {
    return l.length <= 60 && l === l.toUpperCase() && /\p{Lu}/u.test(l) && SHOT_RE.test(l);
  }
  function isDirLine(l) {
    return l.length <= 90 && DIR_LINE.test(l);
  }

  function isJunk(l) {
    return /^\((?:MORE|CONT'?D|CONT’D)\)$/i.test(l) ||
      /^\(?CONTINUED\)?:?\s*\(?\d*\)?$/i.test(l) ||
      /^\d+[A-Z]?\s+\(?CONTINUED\)?:?(?:\s*\(\d+\))?(?:\s+\d+[A-Z]?)?$/i.test(l) ||
      /^page \d+(?: of \d+)?$/i.test(l) ||
      /^\d+\s*(?:\/|of)\s*\d+$/.test(l);
  }
  const isPageNumber = (l) => /^\d{1,3}\.?$/.test(l);

  const COLON_RE = /^([^:()[\]]{1,42}?)\s*(\([^)]{0,40}\))?\s*:\s*(.*)$/;
  const FORCED_COLON = /^@([^:]{1,60}):\s*(.*)$/;
  const HONORIFIC = '(?:MR|MRS|MS|DR|ST|SGT|CAPT|LT|COL|GEN|PROF|REV|FR|SR|JR|Mr|Mrs|Ms|Dr|St|Sgt|Capt|Lt|Col|Gen|Prof|Rev|Fr|Sr|Jr)\\.\\s+';
  const DOT_RE = new RegExp(`^((?:${HONORIFIC})?[^.()[\\]:]{1,40}?)\\s*(\\([^)]{0,40}\\))?\\.\\s+(\\S.*)$`);
  const HONORIFIC_EU = '(?:M|MME|MLLE|Mme|Mlle|HR|Hr|FRL|Frl|SRA|SRTA|Sra|Srta|DHR|Dhr|MEVR|Mevr|SIG|Sig)\\.\\s+';
  const DOT_RE_EU = new RegExp(`^((?:${HONORIFIC}|${HONORIFIC_EU})?[^.()[\\]:]{1,40}?)\\s*(\\([^)]{0,40}\\))?\\.\\s+(\\S.*)$`);

  function colonSpeaker(l) {
    const f = FORCED_COLON.exec(l);
    if (f && f[1].trim()) return { name: f[1].trim(), text: f[2].trim(), forced: true };
    const m = COLON_RE.exec(l);
    if (!m) return null;
    const n = cleanName(m[1]);
    const v = validName(n, false);
    if (!v) return null;
    if (/^\/\//.test(m[3])) return null; // URL
    return { name: n, text: ((m[2] ? m[2] + ' ' : '') + m[3]).trim(), soft: v === 'soft', caps: isCaps(n) };
  }
  const NOT_ABBREV = new Set(['yes', 'no', 'well', 'oh', 'ah', 'so', 'and', 'but', 'then', 'now', 'what', 'why', 'how', 'who', 'come', 'go', 'look',
    'here', 'there', 'ay', 'aye', 'nay', 'sir', 'madam', 'good', 'fie', 'alas', 'peace', 'farewell', 'indeed', 'true', 'exit', 'exeunt', 'enter',
    'okay', 'ok', 'right', 'sure', 'fine', 'thanks', 'please', 'sorry', 'hello', 'hi', 'hey', 'wait', 'stop', 'listen', 'god', 'lord', 'mum', 'mom', 'dad',
    'thank', 'never', 'always', 'yes', 'nothing', 'everything', 'enough', 'again', 'later', 'soon', 'today', 'tomorrow', 'tonight', 'once', 'twice']);
  // "Ja. Ich komme." is not a speaker called Ja (European scripts only).
  const NOT_ABBREV_EU = new Set(['ja', 'nein', 'gut', 'ach', 'nun', 'doch', 'aber', 'und', 'wie', 'wer', 'wo', 'warum', 'hier', 'jetzt', 'bitte',
    'danke', 'genug', 'oui', 'non', 'bon', 'bien', 'eh', 'quoi', 'mais', 'alors', 'voilà', 'merci', 'adieu', 'sí', 'bueno', 'vale', 'pues',
    'gracias', 'adiós', 'ay', 'sì', 'bene', 'beh', 'ecco', 'grazie', 'addio', 'nee', 'goed', 'nou', 'dank', 'tak', 'nie', 'dobrze', 'dobra',
    'cóż', 'sim', 'não', 'bem', 'obrigado', 'obrigada', 'adeus', 'nej', 'bra', 'nå', 'tack', 'kom', 'komm', 'viens', 'ven', 'vieni']);
  // loose: also accept 1-3 Title Case words ("Ham. To be", "Lady Bracknell."),
  // which the caller only trusts when they repeat.
  function dotSpeaker(l, loose) {
    const m = (euOn() ? DOT_RE_EU : DOT_RE).exec(l);
    if (!m) return null;
    const n = cleanName(m[1]);
    const v = validName(n, true);
    let ok = !!v;
    let isLoose = false;
    if (!ok && loose) {
      const ws = n.split(/\s+/);
      const first = ws[0].toLowerCase().replace(/\.$/, '');
      ok = ws.length <= 3 && ws.every((w) => /^\p{Lu}[\p{Ll}'’\-]{1,13}\.?$/u.test(w)) && !NOT_ABBREV.has(first) && !(euOn() && NOT_ABBREV_EU.has(first)) &&
        !STOP.has(n.toUpperCase()) && !(euOn() && STOP_EU.has(n.toUpperCase()));
      isLoose = ok;
    }
    if (!ok) return null;
    const honor = new RegExp('^(?:' + HONORIFIC + (euOn() ? '|' + HONORIFIC_EU : '') + ')').test(n + ' ');
    return { name: n, text: ((m[2] ? m[2] + ' ' : '') + m[3]).trim(), loose: isLoose && !honor, soft: v === 'soft', words: n.split(/\s+/).length };
  }
  // Folger: "NAME  text", "NAME (aside)  text", "NAME, aside to X  text", "NAME [aside]  text"
  const GAP_RE = /^([^\s()[\]:.,][^()[\]:,]{0,40}?)(?:\s*(\([^)]{0,60}\)|\[[^\]]{0,60}\]|,[^,()[\]]{1,60}?)\s+|\s{2,})(\S.*)$/;
  function gapSpeaker(l) {
    const m = GAP_RE.exec(l);
    if (!m) return null;
    const n = cleanName(m[1]);
    const v = validName(n, true);
    if (!v) return null;
    let extra = m[2] ? m[2].trim() : '';
    if (extra.startsWith(',')) extra = '[' + extra.slice(1).trim() + ']';
    if (m[2] && !/\s{2,}\S/.test(l.slice(m[1].length + m[2].length - 1)) && !/^[([]/.test(m[2].trim())) return null;
    return { name: n, text: ((extra ? extra + ' ' : '') + m[3]).trim(), soft: v === 'soft' };
  }
  // NAME on its own line. Returns {name, strong, soft} or null.
  function cueInfo(l) {
    if (l.length > 50) return null;
    if (headingOf(l) || isTransition(l) || isShot(l)) return null;
    if (l[0] === '@') {
      const n = cleanName(l);
      return n && /\p{L}/u.test(n) ? { name: n, strong: true, soft: false } : null;
    }
    if (/[!?,;"“”]/.test(l)) return null;
    const n = cleanName(l);
    const v = validName(n, true);
    if (!v) return null;
    return { name: n, strong: EXT_TAG.test(l), soft: v === 'soft' };
  }
  const cueName = (l) => { const c = cueInfo(l); return c ? c.name : null; };

  function cleanText(raw) {
    let s = String(raw == null ? '' : raw);
    s = s.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n').replace(/\u00a0/g, ' ').replace(/\t/g, '    ')
      .replace(/[\u200b\ufeff\u00ad]/g, '').replace(/\f/g, '\n');
    s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
    for (let k = 0; k < 3; k++) s = s.replace(/(\*{1,3}|_)(\S(?:[^\n]*?\S)?)\1/g, '$2');
    s = s.replace(/^[ \t]*FTLN\s+\d+\s*/gm, '');
    s = s.replace(/^[ \t]*={3,}[ \t]*$/gm, '');
    s = s.replace(/^[ \t]*>\s*(.*?)\s*<[ \t]*$/gm, '$1');
    return s;
  }

  function unquote(t) {
    const m = /^["“]([^"“”]*)["”]$/.exec(String(t).trim());
    return m ? m[1] : t;
  }
  const isQuoted = (t) => /^["“][^"“”]*["”]$/.test(String(t).trim());

  // "(He exits.)" or "[Aside]" with balanced brackets around the whole line.
  function isWrapped(t) {
    const x = String(t).trim().replace(/\.$/, '');
    if (!x || (x[0] !== '(' && x[0] !== '[')) return false;
    return closeOf(x, 0) === x.length - 1;
  }

  function stripWrap(t) {
    const x = String(t).trim();
    if (!isWrapped(x)) return x;
    const dot = /\.$/.test(x) && !/[)\]]$/.test(x);
    const inner = (dot ? x.slice(0, -1) : x).slice(1, -1).trim();
    return inner;
  }

  // Two cue names side by side, with the two speeches in columns below.
  function splitDual(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = /^(\S.*?)\s{3,}(\S.*)$/.exec(l);
      const a = m && cueInfo(m[1].replace(/\s*\^$/, ''));
      const b = m && cueInfo(m[2].replace(/\s*\^$/, ''));
      if (a && b && lines[i + 1] && /\S\s{3,}\S/.test(lines[i + 1])) {
        const left = [];
        const right = [];
        let j = i + 1;
        for (; j < lines.length && lines[j].trim(); j++) {
          const p = /^(.*?\S)?\s{3,}(\S.*)$/.exec(lines[j]);
          if (p) { if (p[1]) left.push(p[1].trim()); right.push(p[2].trim()); } else left.push(lines[j].trim());
        }
        out.push('', m[1].replace(/\s*\^$/, ''), ...left, '', m[2].replace(/\s*\^$/, ''), ...right, '');
        i = j - 1;
        continue;
      }
      out.push(l);
    }
    return out;
  }

  function detectFormat(lines) {
    const tally = { colon: {}, dot: {}, cue: {}, gap: {} };
    const list = { colon: [], dot: [], cue: [], gap: [] };
    let blankCues = 0;
    let directCues = 0;
    const add = (f, n) => { const k = keyOf(n); list[f].push(k); tally[f][k] = (tally[f][k] || 0) + 1; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l || headingOf(l)) continue;
      let sp = colonSpeaker(l);
      if (sp) add('colon', sp.name);
      sp = dotSpeaker(l, true);
      if (sp) add('dot', sp.name);
      sp = gapSpeaker(l);
      if (sp) add('gap', sp.name);
      const gapBelow = lines[i + 1] === '' && lines[i + 2] && !cueName(lines[i + 2]) && !headingOf(lines[i + 2]);
      if (lines[i + 1] || gapBelow) {
        const n = cueName(l);
        if (n) { add('cue', n); if (gapBelow) blankCues++; else directCues++; }
      }
    }
    const score = (f) => list[f].filter((k) => tally[f][k] >= 2).length;
    const sc = { colon: score('colon'), cue: score('cue'), dot: score('dot'), gap: score('gap') };
    let best = 'colon';
    if (sc.cue > sc[best]) best = 'cue';
    if (sc.dot > sc[best]) best = 'dot';
    if (sc.gap > sc[best]) best = 'gap';
    if (sc[best] === 0) {
      if (list.colon.length) best = 'colon';
      else if (list.cue.length) best = 'cue';
      else if (list.dot.length) best = 'dot';
      else if (list.gap.length) best = 'gap';
      else best = 'none';
    }
    return { format: best, known: tally[best === 'none' ? 'colon' : best], cueKnown: tally.cue, blankCueLayout: blankCues > directCues, scores: sc };
  }

  // Looks like a title rather than speech: short, Title Case, no full stop.
  function titleLike(t) {
    const s = String(t).trim();
    if (!s || s.length > 80 || /[.…,;]$/.test(s)) return false;
    const ws = s.split(/\s+/);
    return ws.length <= 10 && ws.filter((w) => w.length > 3).every((w) => /^[\p{Lu}\p{N}"“'(]/u.test(w));
  }

  /*
   * parse(text, opts) -> script
   *   opts.title       default title if none found
   *   opts.monologue   a name: treat every paragraph as that character's line
   */
  /*   opts.lang        script language ('de', 'fr'...); detected when not given
   *   opts.labels      {opening, whole, untitled} scene and title names in the UI language */
  function parse(raw, opts) {
    opts = opts || {};
    const text = cleanText(raw);
    const lang = opts.lang || detectLang(text);
    const before = CTX_LANG;
    CTX_LANG = lang;
    try {
      return parseClean(text, opts, lang);
    } finally {
      CTX_LANG = before;
    }
  }

  const EU_BYLINE = /^(?:von|par|por|di|door|av|de|da)\s+\p{Lu}[\p{L}.'’-]+(?:\s+(?:\p{Lu}[\p{L}.'’-]+|de|da|di|von|van|del|la|y|e))*\s*$/u;

  function parseClean(text, opts, lang) {
    const labels = opts.labels || {};
    const eu = !!lang && lang !== 'en';
    const rawLines = splitDual(text.split('\n').map((l) => l.replace(/\s+$/, '')));
    // drop page furniture; a bare number is dialogue only when it follows a cue
    let lines = [];
    rawLines.forEach((r, i) => {
      const l = r.trim();
      if (isJunk(l)) return;
      if (isPageNumber(l)) {
        const prev = (rawLines[i - 1] || '').trim();
        if (!(prev && cueName(prev))) return;
      }
      lines.push(l);
    });

    // collapse runs of blank lines
    lines = lines.filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== ''));
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();

    let title = '';
    // Fountain-style title page: "Title: ..." block at the top
    if (lines.length && TITLE_KEYS.test(lines[0])) {
      let j = 0;
      while (j < lines.length && lines[j] !== '') {
        const m = /^title\s*:\s*(.*)$/i.exec(lines[j]);
        if (m && m[1]) title = m[1].trim();
        else if (m && !m[1] && lines[j + 1] && !TITLE_KEYS.test(lines[j + 1])) title = lines[j + 1].trim();
        j++;
      }
      lines = lines.slice(j + 1);
    }

    const det = opts.monologue ? { format: 'monologue', known: {}, cueKnown: {} } : detectFormat(lines);
    const fmt = det.format;
    const known = (n) => det.known[keyOf(n)] || 0;
    const screenplay = lines.some((l) => { const h = headingOf(l); return h && h.kind === 'slug'; }) ||
      lines.some((l, i) => /^\([^)]*\)$/.test(l) && i > 0 && lines[i - 1] !== '' && cueName(lines[i - 1]));
    const marksDirections = lines.some((l) => isWrapped(l));

    // A first short line on its own (or with a byline under it) is the title.
    if (!title && lines.length > 1 && lines[0].length <= 80 && !headingOf(lines[0]) && !isTransition(lines[0])) {
      const l0 = lines[0];
      const byline = lines[1] && /^(?:by|written by|a play by|a play in .* by|adapted by|translated by|from the novel by)\b/i.test(lines[1]);
      const euBy = eu && !byline && lines[1] && EU_BYLINE.test(lines[1]);
      if (lines[1] === '' || byline || euBy) {
        const cm = COLON_RE.exec(l0);
        const label = (cm && STOP.has(cleanName(cm[1]).toUpperCase())) || /:$/.test(l0);
        const loose = dotSpeaker(l0, true);
        const cue = fmt === 'cue' && cueName(l0) && known(cueName(l0)) >= 2;
        const sp = colonSpeaker(l0);
        const colonTitle = sp && !sp.forced && titleLike(l0) && /:\s*\p{Lu}/u.test(l0);
        const isSpeech = label || cue || (fmt === 'monologue' ? false : ((sp && !colonTitle) || dotSpeaker(l0) || gapSpeaker(l0) ||
          (loose && known(loose.name) >= 2)));
        const sentence = /[.…]$/.test(l0) && !byline;
        if (byline || (euBy && !isSpeech) || (!euBy && !isSpeech && !sentence)) {
          title = stripWrap(l0);
          let k = byline || euBy ? 2 : 1;
          while (lines[k] === '') k++;
          lines = lines.slice(k);
        }
      }
    }

    // fully quoted speeches: strip quotes only when that's the script's style
    let quotedStyle = false;
    if (fmt === 'colon' || fmt === 'dot' || fmt === 'gap') {
      const sps = lines.map((l) => (fmt === 'colon' ? colonSpeaker(l) : fmt === 'dot' ? dotSpeaker(l) : gapSpeaker(l))).filter(Boolean);
      quotedStyle = sps.length >= 2 && sps.filter((x) => isQuoted(x.text)).length >= sps.length * 0.8;
    }

    const items = [];
    const scenes = [{ title: labels.opening || 'Opening', auto: true }];
    let sceneIdx = 0;
    let curAct = '';
    let cur = null; // current speech item
    let dir = null; // current direction item
    let nextId = 1;
    const joiner = fmt === 'cue' && screenplay ? ' ' : '\n';

    const sceneHasItems = (idx) => items.some((it) => it.scene === idx && it.type !== 'head');
    function newScene(t) {
      if (!sceneHasItems(sceneIdx)) {
        // reuse the empty scene (e.g. "ACT I" followed straight away by "SCENE 1")
        scenes[sceneIdx] = Object.assign({}, scenes[sceneIdx], { title: t, auto: false });
      } else {
        scenes.push({ title: t });
        sceneIdx = scenes.length - 1;
      }
    }
    function closeSpeech() {
      if (cur) {
        cur.text = cur.text.replace(/[ \t]+\n/g, '\n').trim();
        if (!cur.text) items.splice(items.indexOf(cur), 1);
      }
      cur = null;
    }
    function closeDir() { if (dir) { dir.text = stripWrap(dir.text); if (!dir.text) items.splice(items.indexOf(dir), 1); } dir = null; }
    function closeAll() { closeSpeech(); closeDir(); }
    function addHeading(h) {
      closeAll();
      if (h.kind === 'act') {
        curAct = h.title;
        newScene(h.scene ? h.title + ', ' + h.scene : h.title);
      } else if (h.kind === 'scene') {
        newScene(curAct ? curAct.replace(/:.*$/, '') + ', ' + h.title : h.title);
      } else {
        if (h.kind === 'section') curAct = '';
        newScene(h.title.length > 70 ? h.title.slice(0, 69) + '…' : h.title);
      }
      const it = { id: 'i' + nextId++, type: 'head', text: h.text, scene: sceneIdx };
      if (h.raw !== h.text) it.raw = h.raw;
      items.push(it);
    }
    function startSpeech(name, t, contd) {
      closeAll();
      const prev = items[items.length - 1];
      if (contd && prev && prev.type === 'line' && prev.char === keyOf(name)) {
        cur = prev;
        if (t) cur.text += joiner + t;
        return;
      }
      cur = { id: 'i' + nextId++, type: 'line', char: keyOf(name), text: t || '', scene: sceneIdx };
      items.push(cur);
    }
    function appendSpeech(t) {
      cur.text = cur.text ? cur.text + joiner + t : t;
    }
    function addDir(t) {
      if (cur) closeSpeech();
      if (!dir) {
        dir = { id: 'i' + nextId++, type: 'dir', text: t, scene: sceneIdx };
        items.push(dir);
      } else dir.text += ' ' + t;
    }
    // a speaker of this script (for European exits like "Ferdinand ab.")
    const isName = (n) => known(n) >= 1 || (det.cueKnown && det.cueKnown[keyOf(n)] >= 1);
    const langDir = (l) => eu && isLangDir(l, lang, isName);
    // a direction pushed right after the words ("Give you good night.      Exit.")
    function splitTrailingDir(l) {
      const m = /^(.*\S)\s{3,}(\S.{0,60})$/.exec(l);
      if (m && (isDirLine(m[2]) || langDir(m[2]))) return m[1] + ' [' + m[2].replace(/\.$/, '') + ']';
      // German exit at the end of a speech: "Leb wohl! Ab."
      if (lang === 'de') return l.replace(/([.!?…])\s+Ab\.$/u, '$1 [Ab]');
      return l;
    }

    if (fmt === 'monologue') {
      const who = keyOf(opts.monologue) || 'ME';
      let para = [];
      const flush = () => {
        if (!para.length) return;
        const t = para.join('\n');
        if (isWrapped(t)) addDir(t);
        else { closeDir(); items.push({ id: 'i' + nextId++, type: 'line', char: who, text: t, scene: sceneIdx }); }
        closeDir();
        para = [];
      };
      for (const l of lines) {
        if (l === '') { flush(); continue; }
        const h = headingOf(l);
        if (h) { flush(); addHeading(h); continue; }
        para.push(l);
      }
      flush();
    } else {
      let prevBlank = true;
      let afterHead = false;
      let awaitBody = false;
      // abbreviated title-case names ("Ham.", "Oph."): once two repeat, trust one-offs too
      const looseConfirmed = fmt === 'dot' ? Object.keys(det.known).filter((k) => det.known[k] >= 2 && lines.some((l) => { const d = dotSpeaker(l, true); return d && d.loose && keyOf(d.name) === k; })).length : 0;
      const ends = (t) => /[.!?…"”’)\]—–-]$/.test(t.trim());
      for (let i = 0; i < lines.length; i++) {
        let l = lines[i];
        if (l === '') {
          if (fmt === 'cue' && !awaitBody) closeSpeech();
          closeDir();
          prevBlank = true;
          continue;
        }
        const h = headingOf(l);
        if (h) { addHeading(h); prevBlank = false; afterHead = true; continue; }
        if (SECTION_RE.test(l) && !(known(l) >= 2) && !(det.cueKnown[keyOf(l)] >= 2)) {
          addHeading({ kind: 'section', title: cap(l.replace(/\.$/, '').toLowerCase().replace(/^the\s+/, 'the ')).replace(/^The /, 'The '), text: l, raw: l });
          prevBlank = false;
          afterHead = true;
          continue;
        }
        if (l[0] === '!' && l[1] !== '!') { closeAll(); addDir(l.slice(1).trim()); closeDir(); prevBlank = false; continue; }
        if (isTransition(l) || isShot(l)) { closeAll(); addDir(l.replace(/^>\s*/, '')); closeDir(); prevBlank = false; continue; }
        if (isDirLine(l)) { closeAll(); addDir(l); closeDir(); prevBlank = false; continue; }
        // European exits and entrances; not straight after a name, where it is the speech ("PEDRO / Sale.")
        if (eu && (isLangEnd(l, lang) || (langDir(l) && !(cur && !cur.text)))) { closeAll(); addDir(l); closeDir(); prevBlank = false; continue; }
        l = splitTrailingDir(l);
        const wasAfterHead = afterHead;
        afterHead = false;

        if (fmt === 'colon' || fmt === 'dot' || fmt === 'gap' || fmt === 'none') {
          let sp = fmt === 'dot' ? dotSpeaker(l, true) : fmt === 'colon' ? colonSpeaker(l) : fmt === 'gap' ? gapSpeaker(l) : null;
          // "Plan B: we run." in the middle of a speech is not a new character
          if (sp && fmt === 'colon' && !sp.forced && !sp.caps && !prevBlank && cur && known(sp.name) < 2 && sp.name.split(/\s+/).length > 1) sp = null;
          if (sp && sp.soft && known(sp.name) < 2) sp = null;
          if (sp && sp.loose) {
            const k = known(sp.name);
            if (k < 2 && (looseConfirmed < 2 || wasAfterHead || (sp.words > 1 && !prevBlank))) sp = null;
          }
          if (sp) { startSpeech(sp.name, quotedStyle ? unquote(sp.text) : sp.text); prevBlank = false; continue; }
          // Folger mixes "NAME  text" with NAME on its own line
          const own = fmt !== 'none' && lines[i + 1] ? cueInfo(l) : null;
          if (own && !(own.soft && known(own.name) < 2) && (known(own.name) >= 1 || det.cueKnown[keyOf(own.name)] >= 2)) { startSpeech(own.name, ''); prevBlank = false; continue; }
          const opensBracket = l[0] === '(' || l[0] === '[';
          if (cur && !prevBlank) { appendSpeech(l); prevBlank = false; continue; }
          // after a blank line: still the same speech if it's mid-sentence (verse,
          // double-spaced pastes), if the name stood alone, or the script brackets
          // its directions
          if (cur && prevBlank && !opensBracket && (!cur.text || !ends(cur.text) || /^\p{Ll}/u.test(l) || marksDirections)) { appendSpeech(l); prevBlank = false; continue; }
          if (prevBlank) { closeSpeech(); closeDir(); }
          addDir(l);
          prevBlank = false;
          continue;
        }

        // cue format: NAME on its own line, speech below
        const c = cueInfo(l);
        const n = c && !(c.soft && known(c.name) < 2) ? c.name : null;
        if (n && lines[i + 1] && !headingOf(lines[i + 1]) &&
          (prevBlank || c.strong || known(n) >= 2 || !cur || (cur && cur.char !== keyOf(n) && known(n) >= 1 && !cur.text))) {
          const contd = /\((?:CONT'?D|CONT’D|CONTD|CONTINUING|CONT)\)/i.test(l);
          startSpeech(n, '', contd);
          prevBlank = false;
          continue;
        }
        // NAME, blank line, then the speech
        if (n && lines[i + 1] === '' && lines[i + 2] && !cueName(lines[i + 2]) && !headingOf(lines[i + 2]) &&
          known(n) >= (det.blankCueLayout ? 1 : 2)) {
          startSpeech(n, '');
          awaitBody = true;
          prevBlank = false;
          continue;
        }
        const inl = gapSpeaker(l) || dotSpeaker(l);
        if (inl && known(inl.name) >= 2) { startSpeech(inl.name, inl.text); prevBlank = false; continue; }
        if (cur) { appendSpeech(l); awaitBody = false; prevBlank = false; continue; }
        addDir(l);
        prevBlank = false;
      }
    }
    closeAll();

    // an untitled opening with no dialogue (FADE IN:, a title card) joins the first scene
    if (scenes.length > 1 && scenes[0].auto && !items.some((it) => it.scene === 0 && it.type === 'line')) {
      const firstReal = items.find((it) => it.scene > 0);
      if (firstReal) items.forEach((it) => { if (it.scene === 0) it.scene = firstReal.scene; });
    }
    // drop empty scenes and renumber
    const used = new Set(items.map((it) => it.scene));
    const map = {};
    const outScenes = [];
    scenes.forEach((s, i) => {
      if (used.has(i)) { map[i] = outScenes.length; outScenes.push({ title: s.title }); }
    });
    items.forEach((it) => { it.scene = map[it.scene]; });
    if (outScenes.length === 1 && scenes[0].auto && used.has(0)) outScenes[0].title = labels.whole || 'Whole script';

    const script = {
      v: 1,
      title: title || opts.title || labels.untitled || 'Untitled script',
      format: fmt,
      items,
      scenes: outScenes,
      nextId,
    };
    script.warnings = warnings(script);
    return script;
  }

  /* ------------------------------------------------------------------ */
  /* Script language                                                    */
  /* ------------------------------------------------------------------ */

  // Common short words per language. A word may count for several languages;
  // the clear winner decides.
  const LANG_WORDS = {
    en: "the and you that what your have this with for but are they don't i'm it's would just know there when how why who been did from could should about not of it my",
    de: 'und ich nicht der die das du sie ist ein eine mit mich mir auf sich auch noch nur wir aber bin bist sind habe haben nein doch schon kann wenn dass daß für mein dich jetzt nun warum einen was wie',
    fr: "le la les et je vous un une est que qui pas ne il elle nous mon ma des du au ce mais pour avec moi tu toi oui non c'est j'ai suis monsieur madame dans rien cela ça quoi où votre",
    es: 'el los las y que no es un una por con para pero más qué yo está eres soy muy también usted aquí ahora bien sí lo le del al nada señor esto eso como cuando mi me se',
    it: 'il che di non un una è per con mi io ti ma sono lo gli del della si come cosa questo anche ho hai ha sei chi perché qui bene sì signore tutto niente voi noi lui lei mio già più così allora',
    nl: 'de het een en ik je niet dat is van wat zijn met op maar mij jij hij zij we naar ook nog er hoe dit die ze u uw mijn heb ben bent nee ja wel niets waarom hier nu kan wil zal geen zo om te',
    pl: 'i nie się w na to że z jest co jak ja ty mi mnie do tak ale czy o już go jej tylko pan pani mój moja ten ta tu tam był była jestem jesteś wszystko nic dlaczego gdzie kiedy teraz może bardzo ciebie cię',
    pt: 'o os as e que de não é um uma em para com eu se do da dos das no na mas por você isso isto meu minha está são muito também aqui agora bem sim ao ele ela tudo senhor nada quando tu te',
    sv: 'och jag det att är inte du en ett som på med för har han hon vi de mig dig så men till av vad här nu kan ska var om den ni sig min mitt din nej ja inget ingenting varför då också bara mycket hur vill',
  };
  const LANG_SETS = {};
  Object.keys(LANG_WORDS).forEach((k) => { LANG_SETS[k] = new Set(LANG_WORDS[k].split(' ')); });
  const LANG_CHARS = { es: /[ñ¿¡]/g, pt: /[ãõ]/g, pl: /[łąęśźżćń]/g, sv: /å/g, de: /[ßü]/g, fr: /œ/g };
  const langCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  // 'en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt' or 'sv', or '' when unsure. Takes text or a parsed script.
  function detectLang(input) {
    if (input && typeof input === 'object' && Array.isArray(input.items)) {
      const hit = langCache && langCache.get(input.items);
      if (hit && hit.n === input.items.length) return hit.lang;
      const lang = detectLang(input.items.filter((it) => it.type !== 'head').slice(0, 600).map((it) => it.text).join('\n'));
      if (langCache) langCache.set(input.items, { n: input.items.length, lang });
      return lang;
    }
    const s = String(input == null ? '' : input).slice(0, 30000).toLowerCase().replace(/’/g, "'");
    const score = {};
    Object.keys(LANG_SETS).forEach((k) => { score[k] = 0; });
    let n = 0;
    for (const m of s.matchAll(WORD_RE)) {
      n++;
      for (const k in LANG_SETS) if (LANG_SETS[k].has(m[0])) score[k]++;
    }
    for (const k in LANG_CHARS) score[k] += Math.min(n * 0.1, (s.match(LANG_CHARS[k]) || []).length * 0.5);
    const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
    const best = ranked[0];
    if (score[best] < 3 || score[best] < score[ranked[1]] * 1.25) return '';
    return best;
  }

  function warnings(script) {
    const w = [];
    const cs = characters(script);
    if (!cs.length) w.push('no-speakers');
    else if (cs.length === 1) w.push('one-speaker');
    if (cs.length > 40) w.push('many-speakers');
    // a recipe or notes: lots of "names" that each speak once
    if (cs.length >= 3 && cs.filter((c) => c.lines === 1).length >= cs.length * 0.75) w.push('odd-names');
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* Characters                                                         */
  /* ------------------------------------------------------------------ */

  // keys: the script's speakers; European "UND", "ET", "Y"... only split when every part is one of them.
  function splitCompound(key, keys) {
    const parts = key.split(/\s+(?:AND|&)\s+|\s*\/\s*|\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1 || !keys) return parts;
    const eu = key.split(/\s+(?:UND|ET|Y|E|EN|I|OCH)\s+/).map((x) => x.trim()).filter(Boolean);
    return eu.length > 1 && eu.every((p) => keys.has(p)) ? eu : parts;
  }

  function characters(script) {
    const by = {};
    script.items.forEach((it) => {
      if (it.type !== 'line') return;
      const c = by[it.char] || (by[it.char] = { key: it.char, lines: 0, words: 0, scenes: new Set(), first: it.id });
      c.lines++;
      c.words += words(it.text).length;
      c.scenes.add(it.scene);
    });
    const keys = new Set(Object.keys(by));
    return Object.values(by)
      .map((c) => {
        const parts = splitCompound(c.key, keys);
        const compound = parts.length > 1 && parts.every((p) => keys.has(p)) ? parts : null;
        return { key: c.key, lines: c.lines, words: c.words, scenes: Array.from(c.scenes).sort((a, b) => a - b), group: GROUP.has(c.key), compound };
      })
      .sort((a, b) => b.lines - a.lines || b.words - a.words || a.key.localeCompare(b.key));
  }

  function cloneScript(s) { return JSON.parse(JSON.stringify(s)); }

  function renameChar(script, from, to) {
    const s = cloneScript(script);
    const k = keyOf(to);
    if (!k) return s;
    s.items.forEach((it) => { if (it.type === 'line' && it.char === from) it.char = k; });
    s.warnings = warnings(s);
    return s;
  }
  const mergeChars = renameChar;

  function reassign(script, itemId, toChar) {
    const s = cloneScript(script);
    const it = s.items.find((x) => x.id === itemId);
    if (!it) return s;
    if (toChar == null) {
      // turn into a stage direction
      it.type = 'dir';
      delete it.char;
    } else {
      const k = keyOf(toChar);
      if (!k) return s;
      it.type = 'line';
      it.char = k;
    }
    s.warnings = warnings(s);
    return s;
  }

  function editItem(script, itemId, text) {
    const s = cloneScript(script);
    const it = s.items.find((x) => x.id === itemId);
    if (it) it.text = String(text).trim();
    s.items = s.items.filter((x) => x.text);
    return s;
  }

  function deleteItem(script, itemId) {
    const s = cloneScript(script);
    s.items = s.items.filter((x) => x.id !== itemId);
    const used = new Set(s.items.filter((it) => it.type !== 'head').map((it) => it.scene));
    s.items = s.items.filter((it) => used.has(it.scene));
    const map = {};
    const sc = [];
    s.scenes.forEach((x, i) => { if (used.has(i)) { map[i] = sc.length; sc.push(x); } });
    s.items.forEach((it) => { it.scene = map[it.scene]; });
    s.scenes = sc;
    s.warnings = warnings(s);
    return s;
  }

  // Back to plain text (for editing and sharing). Parses back to the same script.
  function serialize(script) {
    const out = [];
    if (script.title) out.push(script.title, '');
    const risky = (l) => !l || headingOf(l) || SECTION_RE.test(l) || isTransition(l) || isShot(l) || isDirLine(l) || colonSpeaker(l) || /^[!@#.([]/.test(l) || isJunk(l) || isPageNumber(l);
    script.items.forEach((it) => {
      if (it.type === 'head') { out.push(it.raw || it.text, ''); return; }
      if (it.type === 'dir') {
        const t = it.text.replace(/\s*\n\s*/g, ' ');
        if (!/[()[\]]/.test(t)) out.push('(' + t + ')', '');
        else out.push('!' + t, '');
        return;
      }
      const sp = colonSpeaker(it.char + ': x');
      const force = !sp || sp.soft || sp.forced || keyOf(sp.name) !== it.char;
      // keep verse line breaks unless a line would be read as something else
      const parts = it.text.split('\n');
      let body = parts[0];
      for (let i = 1; i < parts.length; i++) body += (risky(parts[i].trim()) ? ' ' : '\n') + parts[i];
      out.push((force ? '@' : '') + it.char + ': ' + body, '');
    });
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n') + '\n';
  }

  /* ------------------------------------------------------------------ */
  /* Who is "mine"                                                      */
  /* ------------------------------------------------------------------ */

  // mine: array of character keys. includeGroup: ALL/BOTH lines count when one
  // of my characters speaks in that scene.
  function mineTester(script, mine, includeGroup) {
    const set = new Set((mine || []).map(keyOf));
    const inScene = {};
    const speakers = new Set();
    script.items.forEach((it) => {
      if (it.type === 'line') speakers.add(it.char);
      if (it.type === 'line' && set.has(it.char)) inScene[it.scene] = true;
    });
    return (it) => {
      if (!it || it.type !== 'line') return false;
      if (set.has(it.char)) return true;
      const parts = splitCompound(it.char, speakers);
      if (parts.length > 1 && parts.some((p) => set.has(p))) return true;
      if (includeGroup !== false && GROUP.has(it.char) && inScene[it.scene]) return true;
      return false;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Drills                                                             */
  /* ------------------------------------------------------------------ */

  const LEVELS = [
    { id: 0, name: 'Full text' },
    { id: 1, name: 'Some gaps' },
    { id: 2, name: 'Most gaps' },
    { id: 3, name: 'First letters' },
    { id: 4, name: 'Blank' },
  ];
  const FRACTION = [0, 0.34, 0.67, 1, 1];

  /*
   * mask(text, level, seed) -> [{k, t, hide, hint}]
   * Level 1 hides about a third of the words, level 2 two thirds (always a
   * superset of level 1), level 3 shows first letters, level 4 hides all.
   */
  function mask(text, level, seed) {
    const segs = segments(text);
    const lv = Math.max(0, Math.min(4, level | 0));
    const wIdx = [];
    segs.forEach((x, i) => { if (x.k === 'w') wIdx.push(i); });
    const n = wIdx.length;
    const hideSet = new Set();
    if (lv === 1 || lv === 2) {
      const order = wIdx
        .map((si, j) => {
          const w = segs[si].t;
          const r = hash(String(seed || 0) + '|' + j + '|' + w.toLowerCase()) / 4294967296;
          return { si, score: r + (w.length >= 4 ? 0 : 0.6) };
        })
        .sort((a, b) => a.score - b.score);
      const count = n ? Math.max(1, Math.round(n * FRACTION[lv])) : 0;
      order.slice(0, count).forEach((o) => hideSet.add(o.si));
    }
    return segs.map((x, i) => {
      if (x.k !== 'w') return { k: x.k, t: x.t, hide: false };
      if (lv === 0) return { k: 'w', t: x.t, hide: false };
      if (lv === 3) return { k: 'w', t: x.t, hide: true, show: firstLetter(x.t), hint: x.t };
      if (lv === 4 || hideSet.has(i)) return { k: 'w', t: x.t, hide: true, show: '', hint: firstLetter(x.t) };
      return { k: 'w', t: x.t, hide: false };
    });
  }

  function firstLetter(w) {
    const m = /[\p{L}\p{N}]/u.exec(w);
    return m ? m[0] : '';
  }

  // "To be, or not to be:" -> "T b, o n t b:"
  function firstLetters(text) {
    return mask(text, 3).map((x) => (x.k === 'w' ? x.show : x.t)).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Run queue                                                          */
  /* ------------------------------------------------------------------ */

  /*
   * buildRun(script, opts) -> [{kind, id, char, text, say}]
   *   opts.mine          character keys (required)
   *   opts.scenes        scene indexes to include (default all)
   *   opts.cue           'full' (read every other line) | 'last' (only the
   *                      end of the line just before each of mine)
   *   opts.includeGroup  ALL/BOTH lines count as mine (default true)
   *   opts.readDirections  speak stage directions (default false)
   *   opts.cueWords      words for 'last' cues (default 10)
   * kind: 'cue' (phone speaks), 'mine' (you speak), 'dir', 'head'
   */
  function buildRun(script, opts) {
    opts = opts || {};
    const isMine = mineTester(script, opts.mine, opts.includeGroup);
    const sceneSet = opts.scenes && opts.scenes.length ? new Set(opts.scenes) : null;
    const items = script.items.filter((it) => !sceneSet || sceneSet.has(it.scene));
    const cueMode = opts.cue === 'last' ? 'last' : 'full';
    const steps = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type === 'head') { steps.push({ kind: 'head', id: it.id, text: it.text, scene: it.scene }); continue; }
      if (it.type === 'dir') {
        if (cueMode === 'last') continue;
        steps.push({ kind: 'dir', id: it.id, text: it.text, say: opts.readDirections ? spoken(it.text) : '', scene: it.scene });
        continue;
      }
      if (isMine(it)) {
        steps.push({ kind: 'mine', id: it.id, char: it.char, text: it.text, words: words(spoken(it.text)).length, silent: !spoken(it.text), scene: it.scene });
        continue;
      }
      if (cueMode === 'last') {
        let j = i + 1;
        while (j < items.length && items[j].type !== 'line') j++;
        if (j >= items.length || !isMine(items[j])) continue;
        const say = lastPhrase(it.text, opts.cueWords || 10);
        steps.push({ kind: 'cue', id: it.id, char: it.char, text: say || it.text, say, scene: it.scene });
        continue;
      }
      steps.push({ kind: 'cue', id: it.id, char: it.char, text: it.text, say: spoken(it.text), scene: it.scene });
    }
    // drop headings with nothing after them in this run
    return steps.filter((s, i) => s.kind !== 'head' || (steps[i + 1] && steps[i + 1].kind !== 'head'));
  }

  // Rough minutes for a run: phone at ~165 wpm x rate, you at ~140 wpm.
  function estimateMinutes(steps, rate) {
    let sec = 0;
    steps.forEach((s) => {
      if (s.kind === 'cue' || (s.kind === 'dir' && s.say)) sec += (words(s.say).length / (165 * (rate || 1))) * 60 + 0.4;
      if (s.kind === 'mine') sec += (s.words / 140) * 60 + 1;
    });
    return Math.max(0, Math.round(sec / 6) / 10);
  }

  /* ------------------------------------------------------------------ */
  /* Typed attempt check                                                */
  /* ------------------------------------------------------------------ */

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  function numWords(n) {
    if (n < 20) return [ONES[n]];
    if (n < 100) return [TENS[Math.floor(n / 10)]].concat(n % 10 ? [ONES[n % 10]] : []);
    if (n < 1000) return [ONES[Math.floor(n / 100)], 'hundred'].concat(n % 100 ? numWords(n % 100) : []);
    if (n < 1000000) return numWords(Math.floor(n / 1000)).concat(['thousand'], n % 1000 ? numWords(n % 1000) : []);
    return [String(n)];
  }
  function ordinal(ws) {
    const last = ws[ws.length - 1];
    const o = ORD[last] || (/y$/.test(last) ? last.replace(/y$/, 'ieth') : last + 'th');
    return ws.slice(0, -1).concat(o);
  }
  const CONTRACT = { "won't": 'will not', "can't": 'can not', cannot: 'can not', "shan't": 'shall not', "ain't": 'is not', "let's": 'let us',
    "i'm": 'i am', "it's": 'it is', "that's": 'that is', "what's": 'what is', "he's": 'he is', "she's": 'she is', "there's": 'there is',
    "here's": 'here is', "who's": 'who is', "where's": 'where is', "how's": 'how is', "y'all": 'you all', "'tis": 'it is', "'twas": 'it was' };
  // typed without the apostrophe (only the unambiguous ones)
  ['dont', 'cant', 'doesnt', 'didnt', 'isnt', 'wasnt', 'arent', 'werent', 'couldnt', 'shouldnt', 'wouldnt', 'havent', 'hasnt', 'hadnt', 'mustnt', 'neednt']
    .forEach((w) => { CONTRACT[w] = w === 'cant' ? 'can not' : w.slice(0, -2) + ' not'; });
  Object.assign(CONTRACT, { im: 'i am', ive: 'i have', youre: 'you are', theyre: 'they are', youve: 'you have', theyve: 'they have', weve: 'we have',
    youll: 'you will', theyll: 'they will', thats: 'that is', whats: 'what is' });

  // Words for comparing: lower case, no accents, contractions and hyphenated
  // words split, numbers as words. Each token keeps something to display.
  // lang: the script's language. English contractions ("dont", "im") apply only to
  // English or unknown scripts, so German "im" or French "dont" stay as typed.
  function tokens(text, lang) {
    const english = !lang || lang === 'en';
    const out = [];
    words(String(text == null ? '' : text).replace(/­/g, '')).forEach((w) => {
      let x = w.toLowerCase().replace(/’/g, "'").normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss');
      if (/[œæøł]/.test(x)) x = x.replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/ł/g, 'l');
      let parts;
      if (english && CONTRACT[x]) parts = CONTRACT[x].split(' ');
      else if (english && /n't$/.test(x)) parts = [x.slice(0, -3), 'not'];
      else if (english && /'re$/.test(x)) parts = [x.slice(0, -3), 'are'];
      else if (english && /'ve$/.test(x)) parts = [x.slice(0, -3), 'have'];
      else if (english && /'ll$/.test(x)) parts = [x.slice(0, -3), 'will'];
      else if (english && /'d$/.test(x)) parts = [x.slice(0, -2), 'would'];
      else parts = x.split('-');
      let shown = null;
      if (parts.length > 1) {
        if (english) { if (!CONTRACT[x] && !/'/.test(x)) shown = w.split('-'); } else {
          const wp = w.split('-');
          if (wp.length === parts.length) shown = wp;
        }
      }
      parts.forEach((pt, i) => {
        const y = pt.replace(/'/g, '');
        if (!y) return;
        let m = /^(\d{1,6})(st|nd|rd|th)?$/.exec(y);
        if (m) {
          const ws = numWords(Number(m[1]));
          (m[2] ? ordinal(ws) : ws).forEach((n2, j) => out.push({ n: n2, d: j === 0 ? (shown ? shown[i] : (parts.length > 1 ? pt : w)) : '' }));
          return;
        }
        out.push({ n: y, d: shown ? shown[i] : parts.length > 1 ? pt : w });
      });
    });
    return out;
  }
  // Edit distance with swapped neighbours counting as one edit, stopping early past cap.
  function lev(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > cap) return cap + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  function sameWord(a, b) {
    if (a === b) return 2;
    const len = Math.min(a.length, b.length);
    const cap = len >= 8 ? 2 : len >= 4 ? 1 : 0;
    if (cap && lev(a, b, cap) <= cap) return 1;
    return 0;
  }

  /*
   * check(expected, attempt) -> {score, ok, typo, missing, extra, ops}
   * ops: [{w, s}] where s is 'ok' | 'typo' | 'missing' | 'extra'
   */
  function check(expected, attempt, lang) {
    const TE = tokens(spoken(expected), lang);
    const TA = tokens(attempt, lang);
    const E = TE.map((x) => x.d || x.n);
    const A = TA.map((x) => x.d || x.n);
    const e = TE.map((x) => x.n);
    const a = TA.map((x) => x.n);
    const n = e.length;
    const m = a.length;
    // weighted LCS: exact match 2, typo 1
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const sw = sameWord(e[i], a[j]);
        let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
        if (sw) best = Math.max(best, dp[i + 1][j + 1] + sw);
        dp[i][j] = best;
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m) {
        const sw = sameWord(e[i], a[j]);
        if (sw && dp[i][j] === dp[i + 1][j + 1] + sw) { ops.push({ w: E[i], s: sw === 2 ? 'ok' : 'typo', got: A[j] }); i++; j++; continue; }
        if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ w: E[i], s: 'missing' }); i++; continue; }
        ops.push({ w: A[j], s: 'extra' }); j++;
        continue;
      }
      if (i < n) { ops.push({ w: E[i], s: 'missing' }); i++; } else { ops.push({ w: A[j], s: 'extra' }); j++; }
    }
    const count = (s) => ops.filter((o) => o.s === s).length;
    const ok = count('ok');
    const typo = count('typo');
    const extra = count('extra');
    const missing = count('missing');
    // extras cost half a word each so padding can't hide gaps
    const score = n ? Math.max(0, Math.min(1, (ok + typo - extra * 0.5) / n)) : (m ? 0 : 1);
    return { score, ok, typo, missing, extra, total: n, ops };
  }

  /* ------------------------------------------------------------------ */
  /* Progress                                                           */
  /* ------------------------------------------------------------------ */

  // Stable keys so progress survives edits elsewhere in the script.
  // Per-script facts the scores need, worked out once per version of the script.
  const cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function facts(script) {
    const hit = cache && cache.get(script.items);
    if (hit && hit.n === script.items.length) return hit;
    const seen = {};
    const keys = {};
    const silent = new Set();
    script.items.forEach((it) => {
      if (it.type !== 'line') return;
      const sp = spoken(it.text);
      if (!sp) silent.add(it.id);
      // keyed by the words only, so renaming or reassigning a part keeps progress
      const base = hash(sp.toLowerCase()).toString(36);
      seen[base] = (seen[base] || 0) + 1;
      keys[it.id] = base + ':' + seen[base];
    });
    const f = { n: script.items.length, keys, silent };
    if (cache) cache.set(script.items, f);
    return f;
  }

  // Stable keys so progress survives edits elsewhere in the script.
  function lineKeys(script) {
    return Object.assign({}, facts(script).keys);
  }

  /*
   * grade(entry, result, levelShown) -> new entry
   *   entry: {lvl 0..4 (next level to show), n, got, blankOk, t}
   *   result: 'got' | 'close' | 'miss'
   * Only a 'got' with nothing on screen counts as learnt; any slip un-learns it.
   */
  function grade(entry, result, levelShown, now) {
    const e = Object.assign({ lvl: 0, n: 0, got: 0, blankOk: false, t: 0 }, entry || {});
    const shown = levelShown == null ? e.lvl : Math.max(0, Math.min(4, levelShown | 0));
    e.n++;
    e.t = now || Date.now();
    if (result === 'got') {
      e.got++;
      e.lvl = Math.max(e.lvl, Math.min(4, shown + 1));
      if (shown >= 4) e.blankOk = true;
    } else if (result === 'miss') {
      e.lvl = Math.max(0, Math.min(e.lvl, shown) - 1);
      e.blankOk = false;
    } else {
      e.blankOk = false;
    }
    return e;
  }

  function linePoints(entry) {
    if (!entry) return 0;
    if (entry.blankOk) return 1;
    return Math.min(4, entry.lvl || 0) / 5;
  }

  /*
   * scores(script, progress, mine, includeGroup) -> {all, scenes: [...]}
   * Memorised score for my lines, whole script and per scene, in one pass.
   * pct only reaches 100 when every line is learnt.
   */
  function scores(script, progress, mine, includeGroup) {
    const isMine = mineTester(script, mine, includeGroup);
    const f = facts(script);
    const acc = () => ({ lines: 0, learnt: 0, pts: 0 });
    const all = acc();
    const by = script.scenes.map(acc);
    script.items.forEach((it) => {
      if (!isMine(it) || f.silent.has(it.id)) return;
      const p = linePoints(progress && progress[f.keys[it.id]]);
      [all, by[it.scene]].forEach((a) => {
        if (!a) return;
        a.lines++;
        a.pts += p;
        if (p >= 1) a.learnt++;
      });
    });
    const fin = (a) => ({ lines: a.lines, learnt: a.learnt, pct: !a.lines ? 0 : a.learnt === a.lines ? 100 : Math.min(99, Math.round((a.pts / a.lines) * 100)) });
    return { all: fin(all), scenes: by.map(fin) };
  }

  // Memorised score for my lines in a scene (or the whole script if scene == null).
  function score(script, progress, mine, scene, includeGroup) {
    const r = scores(script, progress, mine, includeGroup);
    return scene == null ? r.all : r.scenes[scene] || { lines: 0, learnt: 0, pct: 0 };
  }

  return {
    LEVELS,
    segments,
    words,
    spoken,
    lastPhrase,
    parse,
    headingOf,
    characters,
    renameChar,
    mergeChars,
    reassign,
    editItem,
    deleteItem,
    serialize,
    mineTester,
    mask,
    firstLetters,
    buildRun,
    estimateMinutes,
    check,
    lineKeys,
    grade,
    score,
    scores,
    tokens,
    keyOf,
    hash,
    detectLang,
  };
});
