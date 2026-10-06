/* ===== Enregistrement, ouverture, sauvegarde automatique, export, impression ===== */

/* ---------- Sauvegarde automatique (IndexedDB du navigateur) ---------- */

const store = {
  _db: null,
  db() {
    if (!this._db) {
      this._db = new Promise((res, rej) => {
        const r = indexedDB.open('frise-chronologique', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return this._db;
  },
  async get(k) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async set(k, v) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async del(k) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

let autosaveTimer = null;

function scheduleAutosave() {
  if (state.readonly) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, 700);
}

async function autosaveNow() {
  clearTimeout(autosaveTimer);
  if (state.readonly) return;
  const d = state.doc;
  if (!d.items.length) return;
  try {
    const now = Date.now();
    await store.set('doc:' + d.id, {
      doc: JSON.parse(JSON.stringify(d)), images: usedImages(), modifiedAt: now,
      dirty: state.dirty, fileName: state.fileName,
    });
    let recent = (await store.get('recent')) || [];
    recent = recent.filter(r => r.id !== d.id);
    recent.unshift({ id: d.id, title: d.title, count: d.items.length, modifiedAt: now });
    for (const r of recent.slice(15)) await store.del('doc:' + r.id);
    await store.set('recent', recent.slice(0, 15));
  } catch (e) {
    console.warn('Sauvegarde automatique impossible', e);
  }
}

async function resumeRecent(id) {
  if (!confirmDiscard()) return;
  try {
    const rec = await store.get('doc:' + id);
    if (!rec) { toast('Ce travail n’est plus disponible.'); return; }
    loadPayload(sanitizePayload({ doc: rec.doc, images: rec.images }));
    state.fileName = rec.fileName || null;
    state.dirty = rec.dirty !== false;
    renderAll();
    fitAll();
    toast(`« ${state.doc.title} » a été rouvert. Pensez à l’enregistrer.`, 4000);
  } catch (e) {
    alert('Impossible de rouvrir ce travail.\n' + e.message);
  }
}

async function checkNewerAutosave(p) {
  try {
    const rec = await store.get('doc:' + state.doc.id);
    if (!rec || !rec.dirty || rec.modifiedAt <= (p.savedAt || 0)) return;
    if (JSON.stringify(rec.doc) === JSON.stringify(state.doc)) return;
    showBanner(
      `Une version plus récente de cette frise, <b>non enregistrée</b>, a été retrouvée sur cet ordinateur (modifiée ${esc(fmtWhen(rec.modifiedAt))}).`,
      [
        ['Récupérer cette version', () => {
          const keepName = state.fileName, keepHandle = state.fileHandle;
          const q = sanitizePayload({ doc: rec.doc, images: Object.assign({}, state.images, rec.images) });
          loadPayload(q);
          state.fileName = keepName;
          state.fileHandle = keepHandle;
          state.dirty = true;
          renderAll();
          fitAll();
          toast('Version récupérée. Pensez à enregistrer.');
        }, true],
        ['Ignorer', null],
      ]);
  } catch (e) { /* stockage indisponible */ }
}

/* ---------- Charger / enregistrer ---------- */

function loadPayload(p) {
  resetImages(p.images);
  state.doc = p.doc;
  state.readonly = !!p.readonly;
  state.dirty = false;
  state.fileHandle = null;
  state.selectedId = null;
  state.revealed.clear();
  state.hiddenCats.clear();
  state.quiz = false;
  resetHistory();
  state.version++;
  $('#details').hidden = true;
  $('#banner').hidden = true;
}

function confirmDiscard() {
  if (state.dirty && !state.readonly && state.doc.items.length) {
    return confirm('La frise actuelle n’est pas enregistrée.\n' +
      '(Une copie de secours restera disponible dans « Travaux récents ».)\n\nContinuer quand même ?');
  }
  return true;
}

function newFrise() {
  if (!confirmDiscard()) return;
  autosaveNow();
  loadPayload({ doc: newDoc(), images: {}, readonly: false });
  state.fileName = null;
  renderAll();
  fitAll();
}

function pickFile(accept) {
  return new Promise(res => {
    const inp = $('#file-open');
    inp.value = '';
    inp.accept = accept;
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}

const OPEN_TYPES = [{
  description: 'Frise chronologique',
  accept: { 'text/html': ['.html', '.htm'], 'application/json': ['.json', '.frise'] },
}];

async function openFrise() {
  if (!confirmDiscard()) return;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ id: 'frise', types: OPEN_TYPES });
      await openFromFileObject(await h.getFile(), h, true);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn(e);
    }
  }
  const file = await pickFile('.html,.htm,.json,.frise');
  if (file) openFromFileObject(file, null, true);
}

async function importFriseChronos() {
  if (!confirmDiscard()) return;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ id: 'frisechronos' });
      await openFromFileObject(await h.getFile(), null, true);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn(e);
    }
  }
  const file = await pickFile('');
  if (file) openFromFileObject(file, null, true);
}

async function openFromFileObject(file, handle, confirmed) {
  if (!confirmed && !confirmDiscard()) return;
  try {
    const p = parseFrisePayloadText(await readFileAs(file, 'text'), file.name);
    if (state.doc.items.length) autosaveNow();
    loadPayload(p);
    const isHtml = /\.html?$/i.test(file.name);
    state.fileName = isHtml ? file.name : null;
    state.fileHandle = isHtml && handle && !p.readonly ? handle : null;
    if (p.imported) {
      state.dirty = true;
      scheduleAutosave();
    }
    renderAll();
    fitAll();
    if (p.imported) {
      toast(`Frise ${p.imported} importée (${plural(state.doc.items.length, 'élément')}). ` +
        'Enregistrez-la au nouveau format avec « Enregistrer ».', 6000);
      return;
    }
    toast(`« ${state.doc.title} » est ouverte`);
    if (!p.readonly) checkNewerAutosave(p);
  } catch (e) {
    alert('Impossible d’ouvrir ce fichier.\n' + e.message);
  }
}

/* Fichier .html autonome (application + données). Sans doc/images : la frise ouverte. */
function buildHTMLFile(readonly, doc, images) {
  const root = PRISTINE.cloneNode(true);
  const json = JSON.stringify(buildPayload(readonly, doc, images))
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  root.querySelector('#frise-data').textContent = json;
  root.querySelector('title').textContent = (doc || state.doc).title + ' — Frise chronologique';
  return '<!DOCTYPE html>\n' + root.outerHTML;
}

async function saveFrise(saveAs) {
  if (state.readonly) return false;
  const html = buildHTMLFile(false);
  const name = state.fileName || safeFileName(state.doc.title) + '.html';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  if (window.showSaveFilePicker) {
    try {
      let handle = !saveAs && state.fileHandle;
      if (!handle) {
        handle = await window.showSaveFilePicker({
          id: 'frise', suggestedName: name,
          types: [{ description: 'Frise chronologique (page web)', accept: { 'text/html': ['.html'] } }],
        });
      }
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      state.fileHandle = handle;
      state.fileName = handle.name;
      markSaved();
      toast(`Frise enregistrée dans « ${handle.name} »`);
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      console.warn('Enregistrement direct impossible : téléchargement à la place.', e);
      state.fileHandle = null;
    }
  }
  const dlName = safeFileName(name.replace(/\.html?$/i, '')) + '.html';
  downloadBlob(blob, dlName);
  state.fileName = dlName;
  markSaved();
  toast(`Frise téléchargée : « ${dlName} » (dossier Téléchargements)`, 5000);
  return true;
}

function markSaved() {
  state.dirty = false;
  autosaveNow();
  renderAll();
}

async function mergeFrise() {
  let file;
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ id: 'frise', types: OPEN_TYPES });
      file = await h.getFile();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  if (!file) file = await pickFile('.html,.htm,.json,.frise');
  if (!file) return;
  try {
    const p = parseFrisePayloadText(await readFileAs(file, 'text'), file.name);
    commit(d => {
      const catMap = {};
      for (const c of p.doc.categories) {
        let ex = d.categories.find(x => x.name.toLowerCase() === c.name.toLowerCase());
        if (!ex) { ex = { id: uid(), name: c.name, color: c.color }; d.categories.push(ex); }
        catMap[c.id] = ex.id;
      }
      for (const it of p.doc.items) {
        const n = Object.assign({}, it, { id: uid(), categoryId: catMap[it.categoryId] || null });
        n.imageId = it.imageId && p.images[it.imageId] ? addImage(p.images[it.imageId]) : null;
        d.items.push(n);
      }
    });
    fitAll();
    toast(`${plural(p.doc.items.length, 'élément ajouté', 'éléments ajoutés')} depuis « ${p.doc.title} »`, 4000);
  } catch (e) {
    alert('Impossible d’ajouter cette frise.\n' + e.message);
  }
}

function editCopy() {
  state.readonly = false;
  state.doc.id = uid();
  state.fileName = null;
  state.fileHandle = null;
  state.dirty = true;
  renderAll();
  toast('Vous pouvez modifier cette frise. Pensez à l’enregistrer (Ctrl+S).', 4500);
}

/* ---------- Export ---------- */

function exportReadonlyHTML() {
  const html = buildHTMLFile(true);
  const name = safeFileName(state.doc.title) + ' (consultation).html';
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
  toast(`Page de consultation téléchargée : « ${name} »`, 5000);
}

function wholeView(width) {
  const items = sortedItems(true);
  let [a, b] = itemsExtent(items);
  if (b - a < 20) { const c = (a + b) / 2; a = c - 10; b = c + 10; }
  const room = Math.min(260, width * 0.25);
  const scale = (width - PAD - room) / (b - a);
  return { t0: a - 10 / scale, scale };
}

async function exportPNG(all) {
  if (!state.doc.items.length) { toast('La frise est vide.'); return; }
  try {
    let width = $('#scroller').clientWidth, t0 = state.view.t0, scale = state.view.scale;
    if (all) {
      width = Math.max(1600, width);
      ({ t0, scale } = wholeView(width));
    }
    const L = computeLayout(scale, state.quiz);
    const r = buildSVG({
      width, minHeight: 0, t0, scale, L, selectedId: null,
      imgHref: id => state.images[id], header: true, background: '#ffffff',
    });
    const ratio = Math.min(2, Math.sqrt(100e6 / (width * r.height)));
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg));
    const c = document.createElement('canvas');
    c.width = Math.round(width * ratio);
    c.height = Math.round(r.height * ratio);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const name = safeFileName(state.doc.title) + '.png';
    downloadBlob(blob, name);
    toast(`Image téléchargée : « ${name} »`, 4000);
  } catch (e) {
    console.error(e);
    alert('L’export en image a échoué.\n' + e.message);
  }
}

async function doPrint() {
  const withFrise = $('#print-frise').checked, withCards = $('#print-cards').checked;
  $('#dlg-print').close();
  const d = state.doc;
  const items = sortedItems(true);
  let html = `<div class="pa-head"><h1>${esc(d.title)}</h1>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</div>`;
  if (withFrise && items.length) {
    const width = 1400;
    const { t0, scale } = wholeView(width);
    const r = buildSVG({
      width, minHeight: 0, t0, scale, L: computeLayout(scale, state.quiz), selectedId: null,
      imgHref: imageURL, header: true, background: '#ffffff',
    });
    html = `<div class="pa-frise">${r.svg}</div>`;
  }
  if (withCards) {
    html += '<div class="pa-cards">' + items.map(it => {
      const hide = state.quiz;
      return `<div class="pa-card" style="--c:${itemColor(it)}">` +
        `<h2>${hide ? '?' : esc(it.title)}</h2><div class="d">${esc(cap(itemDateText(it, false)))}</div>` +
        (hasImage(it.imageId) ? `<img src="${esc(imageURL(it.imageId))}" alt="">` : '') +
        (it.imageCaption && !hide ? `<div class="cap">${esc(it.imageCaption)}</div>` : '') +
        (it.details && !hide ? `<div class="rich">${mdToHtml(it.details)}</div>` : '') +
        (it.link && !hide ? `<div class="lnk">${esc(it.link)}</div>` : '') +
        '</div>';
    }).join('') + '</div>';
  }
  const area = $('#print-area');
  area.innerHTML = html;
  await Promise.all($$('img', area).map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => {})));
  window.print();
}
