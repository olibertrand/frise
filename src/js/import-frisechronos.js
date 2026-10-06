/* ===== Import des frises enregistrées avec FriseChronos (frisechronos.fr) =====

   Format observé : une empreinte MD5 (32 caractères hexadécimaux) suivie d'enregistrements
   séparés par « | », dont les champs sont séparés par « : ».
     B2:début:fin:pas:…                      réglages de la frise
     E3:année:titre:…:image?:ligne:…:texte:uuid:…:imageBase64:largeur:hauteur   événement
     A2:début:fin:titre:couleur:…:texte:uuid  période
   Le format n'est pas documenté : la lecture est volontairement tolérante. */

const FC_RGBA = /^\d{1,3},\d{1,3},\d{1,3},\d{1,3}$/;
const FC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFriseChronos(text) {
  return /^[0-9a-f]{32}[A-Z]\d*:/i.test(text.replace(/^﻿/, '').trim());
}

/* Repère la fin du titre : le titre peut contenir des « : », on cherche donc
   le premier champ « couleur » (r,g,b,a) qui suit, précédé d'un code d'une lettre. */
function fcTitleEnd(f, from) {
  for (let k = from; k + 2 < f.length; k++) {
    if (/^[A-Z]$/.test(f[k + 1]) && FC_RGBA.test(f[k + 2])) return k;
  }
  return from;
}

function fcYear(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(-?\d+)$/);
  if (m) return { y: parseInt(m[1], 10) || 1, m: null, d: null };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(-?\d+)$/);               // jj/mm/aaaa
  if (m) return { y: parseInt(m[3], 10) || 1, m: +m[2] || null, d: +m[1] || null };
  m = s.match(/^(\d{1,2})\/(-?\d+)$/);                           // mm/aaaa
  if (m) return { y: parseInt(m[2], 10) || 1, m: +m[1] || null, d: null };
  return null;
}

function fcColor(rgba) {
  if (!FC_RGBA.test(rgba || '')) return null;
  const [r, g, b] = rgba.split(',').map(Number);
  if (r > 235 && g > 235 && b > 235) return null; // blanc = pas de couleur choisie
  return rgbToHex(r, g, b);
}

function fcText(v) {
  const s = String(v || '').trim();
  return s === '.' ? '' : s;
}

function fcImage(f) {
  for (const v of f) {
    if (v.length < 40 || !/^[A-Za-z0-9+/=\r\n]+$/.test(v)) continue;
    const mime = v.startsWith('/9j/') ? 'image/jpeg'
      : v.startsWith('iVBOR') ? 'image/png'
        : v.startsWith('R0lGOD') ? 'image/gif'
          : v.startsWith('UklGR') ? 'image/webp' : null;
    if (mime) return `data:${mime};base64,${v.replace(/\s+/g, '')}`;
  }
  return null;
}

function parseFriseChronos(text, fileName) {
  const body = text.replace(/^﻿/, '').trim().slice(32);
  const records = body.split('|').map(r => r.split(':'));
  const items = [], images = {};
  const groups = new Map(); // numéro de ligne FriseChronos → catégorie
  const doc = newDoc();
  doc.categories = [];
  const base = String(fileName || '').replace(/\.[^.]*$/, '').replace(/[_]+/g, ' ').trim();
  doc.title = base ? cap(base) : 'Frise importée de FriseChronos';
  doc.subtitle = 'Importée depuis FriseChronos';

  for (const f of records) {
    const kind = (f[0] || '').charAt(0).toUpperCase();
    if (kind !== 'E' && kind !== 'A') continue;
    const u = f.findIndex(v => FC_UUID.test(v));
    if (kind === 'E') {
      const start = fcYear(f[1]);
      if (!start) continue;
      const k = fcTitleEnd(f, 2);
      const title = f.slice(2, k + 1).join(':').trim();
      // E3 : 18 champs fixes entre le titre et le texte ; le numéro de ligne est le 14e
      const descStart = k + 19;
      const details = u > descStart ? fcText(f.slice(descStart, u).join(':')) : (u > 0 ? fcText(f[u - 1]) : '');
      const row = /^\d+$/.test(f[k + 14] || '') ? f[k + 14] : null;
      const it = {
        id: uid(), type: 'event', title, start, end: null, approx: false,
        categoryId: null, color: fcColor(f[k + 2]), imageId: null, imageCaption: '', details, link: '',
      };
      const img = fcImage(f.slice(u > 0 ? u : 0));
      if (img) { it.imageId = 'img-' + uid(); images[it.imageId] = img; }
      if (row) {
        if (!groups.has(row)) groups.set(row, { id: uid(), name: 'Ligne ' + row, color: PALETTE[groups.size % PALETTE.length] });
        it.categoryId = groups.get(row).id;
      }
      items.push(it);
    } else {
      const start = fcYear(f[1]), end = fcYear(f[2]);
      if (!start || !end) continue;
      const k = fcTitleEnd(f, 3);
      const title = f.slice(3, k + 1).join(':').trim();
      // A2 : 17 champs fixes entre le titre et le texte
      const descStart = k + 18;
      const details = u > descStart ? fcText(f.slice(descStart, u).join(':')) : (u > 0 ? fcText(f[u - 1]) : '');
      const [a, b] = dateToT(end) < dateToT(start) ? [end, start] : [start, end];
      const it = {
        id: uid(), type: 'period', title, start: a, end: b, approx: false,
        categoryId: null, color: fcColor(f[k + 2]), imageId: null, imageCaption: '', details, link: '',
      };
      const img = fcImage(f.slice(u > 0 ? u : 0));
      if (img) { it.imageId = 'img-' + uid(); images[it.imageId] = img; }
      items.push(it);
    }
  }
  if (!items.length) throw new Error('Aucun événement ni aucune période n’a été trouvé dans ce fichier FriseChronos.');

  // Une seule ligne utilisée : pas besoin de catégories.
  if (groups.size > 1) doc.categories = [...groups.values()];
  else for (const it of items) it.categoryId = null;
  if (items.some(it => !it.categoryId && it.type === 'period' && !it.color)) {
    const used = new Set(doc.categories.map(c => c.color));
    const pc = { id: uid(), name: 'Périodes', color: ['#ea580c', '#9333ea', '#db2777'].find(c => !used.has(c)) || '#475569' };
    doc.categories.push(pc);
    for (const it of items) if (it.type === 'period' && !it.color) it.categoryId = pc.id;
  }
  doc.items = items;
  const p = sanitizePayload({ doc, images });
  p.imported = 'FriseChronos';
  return p;
}
