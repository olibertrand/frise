/* ===== Utilitaires : DOM, texte, dates, couleurs, mise en forme ===== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ---------- Dates ---------- */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.'];

function fmtNumber(n) {
  const a = Math.abs(n);
  return a >= 10000 ? a.toLocaleString('fr-FR') : String(a);
}

function fmtYear(y) {
  return y < 0 ? fmtNumber(y) + ' av. J.-C.' : fmtNumber(y);
}

/* Date {y, m, d} → texte : « 14 juillet 1789 », « juil. 1789 », « 52 av. J.-C. » */
function fmtDate(d, short) {
  if (!d) return '';
  let s = '';
  if (d.m) {
    if (d.d) s += (d.d === 1 ? '1er' : d.d) + ' ';
    s += (short ? MONTHS_SHORT : MONTHS)[d.m - 1] + ' ';
  }
  return s + fmtYear(d.y);
}

/* Position sur l'axe du temps, en années (fractionnaires). */
function dateToT(d) {
  return d.y + ((d.m || 1) - 1) / 12 + ((d.d || 1) - 1) / 372;
}

function itemStartT(it) { return dateToT(it.start); }
function itemEndT(it) { return it.type === 'period' && it.end ? dateToT(it.end) : dateToT(it.start); }

function startsWithVowel(s) { return /^[aeiouyéèêàâîôû]/i.test(s); }

function itemDateText(it, short) {
  if (it.type !== 'period' || !it.end) {
    const t = fmtDate(it.start, short);
    return it.approx ? 'vers ' + t : t;
  }
  const a = fmtDate(it.start, short), b = fmtDate(it.end, short);
  if (short) return (it.approx ? '≈ ' : '') + a + ' – ' + b;
  const from = it.start.m && it.start.d ? 'du ' + a : (startsWithVowel(a) ? 'd’' : 'de ') + a;
  const to = it.end.m && it.end.d ? 'au ' + b : 'à ' + b;
  return from + ' ' + to + (it.approx ? ' (dates approximatives)' : '');
}

function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

function ordinal(n) { return roman(n) + (n === 1 ? 'er' : 'e'); }

function centuryOf(y) {
  return y > 0 ? { n: Math.ceil(y / 100), bc: false } : { n: Math.ceil(-y / 100), bc: true };
}

function centuryText(c) {
  return ordinal(c.n) + ' siècle' + (c.bc ? ' av. J.-C.' : '');
}

function itemCenturyText(it) {
  const a = centuryOf(it.start.y);
  if (it.type !== 'period' || !it.end) return centuryText(a);
  const b = centuryOf(it.end.y);
  if (a.n === b.n && a.bc === b.bc) return centuryText(a);
  if (a.bc === b.bc) return ordinal(a.n) + ' – ' + ordinal(b.n) + ' siècles' + (a.bc ? ' av. J.-C.' : '');
  return centuryText(a) + ' – ' + centuryText(b);
}

function utcTime(d) {
  const dt = new Date(Date.UTC(2000, d.m - 1, d.d));
  dt.setUTCFullYear(d.y < 0 ? d.y + 1 : d.y);
  return dt.getTime();
}

function plural(n, one, many) { return n + ' ' + (n > 1 ? (many || one + 's') : one); }

function durationText(it) {
  if (it.type !== 'period' || !it.end) return '';
  const a = it.start, b = it.end;
  const years = b.y - a.y - (a.y < 0 && b.y > 0 ? 1 : 0); // il n'y a pas d'année 0
  const pre = it.approx ? 'environ ' : '';
  if (a.m && b.m) {
    let months = years * 12 + (b.m - a.m);
    if (a.d && b.d) {
      if (b.d < a.d) months -= 1;
      if (months < 2) {
        const days = Math.round((utcTime(b) - utcTime(a)) / 864e5);
        return days >= 0 ? pre + plural(days, 'jour') : '';
      }
    }
    if (months < 0) return '';
    if (months === 0) return 'moins d’un mois';
    const y = Math.floor(months / 12), m = months % 12;
    if (!y) return pre + m + ' mois';
    return pre + plural(y, 'an') + (m ? ' et ' + m + ' mois' : '');
  }
  if (years < 0) return '';
  if (years === 0) return 'moins d’un an';
  return pre + plural(years, 'an');
}

/* ---------- Couleurs ---------- */

function normHex(c) {
  if (typeof c !== 'string') return null;
  const m = c.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return '#' + h;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
}

function mixHex(h, target, a) {
  const [r, g, b] = hexToRgb(h), [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r + (r2 - r) * a, g + (g2 - g) * a, b + (b2 - b) * a);
}

function luminance(h) {
  const [r, g, b] = hexToRgb(h).map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function textOn(h) { return luminance(h) > 0.42 ? '#1f2937' : '#ffffff'; }

/* ---------- Mesure et découpage du texte (pour le dessin SVG) ---------- */

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
const measureCtx = document.createElement('canvas').getContext('2d');
const measureCache = new Map();

function textWidth(text, font) {
  const key = font + '|' + text;
  let w = measureCache.get(key);
  if (w === undefined) {
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    if (measureCache.size > 8000) measureCache.clear();
    measureCache.set(key, w);
  }
  return w;
}

function ellipsize(s, font, maxW) {
  if (textWidth(s, font) <= maxW) return s;
  while (s.length > 1 && textWidth(s + '…', font) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function wrapText(text, font, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || textWidth(t, font) <= maxW) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push('');
  const out = lines.slice(0, maxLines).map(l => ellipsize(l, font, maxW));
  if (lines.length > maxLines) {
    let l = out[maxLines - 1];
    while (l.length > 1 && textWidth(l + '…', font) > maxW) l = l.slice(0, -1);
    out[maxLines - 1] = l.trimEnd() + '…';
  }
  return out;
}

/* ---------- Mise en forme légère du texte détaillé ----------
   **gras**  *italique*  __souligné__  [texte](https://…)  - liste  1. liste  > citation  ## titre */

function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^www\./i.test(u)) u = 'https://' + u;
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
}

function mdInline(s) {
  // s est déjà échappé
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
    (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<u>$1</u>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
  return s;
}

function mdToHtml(src) {
  const lines = esc(src || '').split(/\r?\n/);
  let html = '', list = null, para = [], quote = [];
  const flushP = () => { if (para.length) { html += '<p>' + para.map(mdInline).join('<br>') + '</p>'; para = []; } };
  const flushQ = () => { if (quote.length) { html += '<blockquote>' + quote.map(mdInline).join('<br>') + '</blockquote>'; quote = []; } };
  const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
  const flushAll = () => { flushP(); flushQ(); closeList(); };
  for (const line of lines) {
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      const lvl = m[1].length + 2;
      html += `<h${lvl}>${mdInline(m[2])}</h${lvl}>`;
      continue;
    }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushP(); closeList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushP(); flushQ();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += '<li>' + mdInline(m[1]) + '</li>';
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushP(); flushQ();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += '<li>' + mdInline(m[1]) + '</li>';
      continue;
    }
    flushQ(); closeList();
    para.push(line);
  }
  flushAll();
  return html;
}

/* ---------- Divers ---------- */

/* Nom de fichier sans accents ni caractères interdits sous Windows
   (les navigateurs ignorent parfois les noms accentués proposés au téléchargement). */
function safeFileName(s) {
  s = String(s || '')
    .replace(/[œŒ]/g, m => m === 'œ' ? 'oe' : 'OE').replace(/[æÆ]/g, m => m === 'æ' ? 'ae' : 'AE')
    .replace(/[’‘`´]/g, "'").replace(/[«»“”]/g, '').replace(/[–—]/g, '-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]+/g, '').replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '');
  return s || 'frise';
}

function fmtWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return 'aujourd’hui à ' + time;
  return 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + time;
}

let toastTimer = null;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function dataURLtoBlob(dataURL) {
  const i = dataURL.indexOf(',');
  const meta = dataURL.slice(5, i);
  const mime = meta.split(';')[0] || 'application/octet-stream';
  if (/;base64/i.test(meta)) {
    const bin = atob(dataURL.slice(i + 1));
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(dataURL.slice(i + 1))], { type: mime });
}

function readFileAs(file, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    if (how === 'text') r.readAsText(file); else r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image illisible'));
    img.src = src;
  });
}
