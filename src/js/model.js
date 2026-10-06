/* ===== Données de la frise, historique (annuler/rétablir), images, validation ===== */

const PALETTE = ['#2563eb', '#0891b2', '#16a34a', '#65a30d', '#ca8a04', '#ea580c',
  '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#78350f', '#475569'];

function newDoc() {
  return {
    id: uid(),
    title: 'Ma frise chronologique',
    subtitle: '',
    settings: { showImages: true, centuries: true, textSize: 1 },
    categories: [
      { id: uid(), name: 'Politique', color: '#2563eb' },
      { id: uid(), name: 'Économie et société', color: '#16a34a' },
      { id: uid(), name: 'Arts, culture et religion', color: '#9333ea' },
      { id: uid(), name: 'Sciences et techniques', color: '#ea580c' },
      { id: uid(), name: 'Guerres et conflits', color: '#dc2626' },
    ],
    items: [],
  };
}

const state = {
  doc: newDoc(),
  images: {},            // id → data URL (contenu des images)
  version: 0,            // incrémenté à chaque modification (cache de mise en page)
  dirty: false,          // modifications non enregistrées dans un fichier
  fileHandle: null,      // fichier ouvert (Edge/Chrome) pour Ctrl+S direct
  fileName: null,
  readonly: false,
  selectedId: null,
  hiddenCats: new Set(),
  quiz: false,
  revealed: new Set(),
  view: { t0: 1700, scale: 3 }, // t0 : année au bord gauche ; scale : pixels par année
};

const undoStack = [];
const redoStack = [];

function snapshot() { return JSON.stringify(state.doc); }

function commit(mutator) {
  if (state.readonly) return;
  undoStack.push(snapshot());
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  mutator(state.doc);
  afterChange();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  state.doc = JSON.parse(undoStack.pop());
  afterChange();
  toast('Modification annulée');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  state.doc = JSON.parse(redoStack.pop());
  afterChange();
  toast('Modification rétablie');
}

function resetHistory() { undoStack.length = 0; redoStack.length = 0; }

function afterChange() {
  state.version++;
  state.dirty = true;
  if (state.selectedId && !getItem(state.selectedId)) closeDetails();
  renderAll();
  scheduleAutosave();
}

function getItem(id) { return state.doc.items.find(i => i.id === id); }
function getCat(id) { return state.doc.categories.find(c => c.id === id); }
function itemColor(it) { return it.color || (getCat(it.categoryId) || {}).color || '#64748b'; }

function isVisible(it) {
  const key = getCat(it.categoryId) ? it.categoryId : '';
  return !state.hiddenCats.has(key);
}

function compareItems(a, b) {
  return itemStartT(a) - itemStartT(b) || itemEndT(b) - itemEndT(a) || (a.title || '').localeCompare(b.title || '');
}

function sortedItems(onlyVisible) {
  const list = onlyVisible ? state.doc.items.filter(isVisible) : state.doc.items.slice();
  return list.sort(compareItems);
}

/* ---------- Images ---------- */

const blobUrls = new Map();

function addImage(dataURL) {
  for (const [id, d] of Object.entries(state.images)) if (d === dataURL) return id;
  const id = 'img-' + uid();
  state.images[id] = dataURL;
  return id;
}

function hasImage(id) { return !!(id && state.images[id]); }

function imageURL(id) {
  if (!hasImage(id)) return '';
  let u = blobUrls.get(id);
  if (!u) {
    try { u = URL.createObjectURL(dataURLtoBlob(state.images[id])); }
    catch (e) { u = state.images[id]; }
    blobUrls.set(id, u);
  }
  return u;
}

function usedImages(doc) {
  const out = {};
  for (const it of (doc || state.doc).items) {
    if (it.imageId && state.images[it.imageId]) out[it.imageId] = state.images[it.imageId];
  }
  return out;
}

function resetImages(map) {
  for (const u of blobUrls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  blobUrls.clear();
  state.images = map || {};
}

/* Réduit les grosses images pour que les fichiers restent légers. */
async function processImageFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Ce fichier n’est pas une image.');
  const dataURL = await readFileAs(file, 'dataURL');
  if ((file.type === 'image/svg+xml' || file.type === 'image/gif') && file.size < 800e3) return dataURL;
  const img = await loadImage(dataURL);
  const max = 1400;
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error('Image illisible.');
  if (file.size < 300e3 && Math.max(w, h) <= max) return dataURL;
  const r = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r);
  c.height = Math.round(h * r);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/* ---------- Format de fichier ---------- */

function buildPayload(readonly) {
  return {
    format: 'frise-chronologique',
    version: 1,
    readonly: !!readonly,
    savedAt: Date.now(),
    doc: state.doc,
    images: usedImages(),
  };
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

function cleanDate(d) {
  if (!d || typeof d !== 'object') return null;
  let y = Math.trunc(Number(d.y));
  if (!Number.isFinite(y) || Math.abs(y) > 5e9) return null;
  if (y === 0) y = 1;
  let m = Math.trunc(Number(d.m)) || null;
  if (m !== null && (m < 1 || m > 12)) m = null;
  let dd = Math.trunc(Number(d.d)) || null;
  if (dd !== null && (dd < 1 || dd > 31 || !m)) dd = null;
  return { y, m, d: dd };
}

function sanitizePayload(raw) {
  if (raw && raw.doc && !Array.isArray(raw.items)) raw = Object.assign({}, raw.doc, { _images: raw.images, _readonly: raw.readonly, _savedAt: raw.savedAt });
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    throw new Error('Ce fichier ne contient pas de frise chronologique.');
  }
  const doc = newDoc();
  doc.id = str(raw.id, 40) || uid();
  doc.title = str(raw.title, 200) || 'Frise sans titre';
  doc.subtitle = str(raw.subtitle, 300);
  const s = raw.settings || {};
  doc.settings = {
    showImages: s.showImages !== false,
    centuries: s.centuries !== false,
    textSize: clamp(Number(s.textSize) || 1, 0.7, 2),
  };
  if (Array.isArray(raw.categories)) {
    doc.categories = raw.categories.filter(c => c && typeof c === 'object').slice(0, 60).map(c => ({
      id: str(c.id, 40) || uid(),
      name: str(c.name, 80) || 'Catégorie',
      color: normHex(c.color) || '#64748b',
    }));
  }
  const images = {};
  const rawImages = raw._images || raw.images || {};
  for (const [k, v] of Object.entries(rawImages)) {
    if (typeof v === 'string' && /^data:image\/[a-z0-9.+-]+[;,]/i.test(v)) images[str(k, 60)] = v;
  }
  doc.items = raw.items.filter(i => i && typeof i === 'object').slice(0, 5000).map(i => {
    const type = i.type === 'period' ? 'period' : 'event';
    const start = cleanDate(i.start) || { y: 2000, m: null, d: null };
    let end = type === 'period' ? (cleanDate(i.end) || Object.assign({}, start)) : null;
    if (end && dateToT(end) < dateToT(start)) end = Object.assign({}, start);
    const imageId = images[i.imageId] ? i.imageId : null;
    return {
      id: str(i.id, 40) || uid(),
      type,
      title: str(i.title, 200),
      start,
      end,
      approx: !!i.approx,
      categoryId: str(i.categoryId, 40) || null,
      color: normHex(i.color),
      imageId,
      imageCaption: str(i.imageCaption, 300),
      details: str(i.details, 100000),
      link: safeUrl(i.link),
    };
  });
  const ids = new Set();
  for (const it of doc.items) { if (ids.has(it.id)) it.id = uid(); ids.add(it.id); }
  return { doc, images, readonly: !!raw._readonly, savedAt: Number(raw._savedAt) || 0 };
}

/* Extrait les données d'un fichier .html enregistré par l'application (ou d'un .json). */
function parseFrisePayloadText(text, fileName) {
  if (isFriseChronos(text)) return parseFriseChronos(text, fileName);
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.startsWith('{')) return sanitizePayload(JSON.parse(trimmed));
  const html = new DOMParser().parseFromString(text, 'text/html');
  const el = html.getElementById('frise-data');
  if (!el || !el.textContent.trim()) throw new Error('Ce fichier ne contient pas de frise chronologique.');
  return sanitizePayload(JSON.parse(el.textContent));
}
