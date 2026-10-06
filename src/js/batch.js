/* ===== Conversion par lots des frises FriseChronos (.bin) =====

   L'utilisateur choisit un dossier : tous les fichiers .bin de ses sous-dossiers sont
   convertis et les frises .html sont enregistrées ensemble à la racine de ce dossier.
   Edge/Chrome écrivent directement dans le dossier ; ailleurs, on télécharge un .zip. */

async function* walkDirectory(dir, path) {
  for await (const [name, handle] of dir.entries()) {
    const rel = path ? path + '/' + name : name;
    if (handle.kind === 'directory') {
      if (!name.startsWith('.')) yield* walkDirectory(handle, rel);
    } else {
      yield { name, path: rel, getFile: () => handle.getFile() };
    }
  }
}

function isBatchSource(name) { return /\.bin$/i.test(name); }

/* Nom du fichier produit : le nom d'origine ; en cas de doublon, préfixé
   par le nom du sous-dossier, puis numéroté. */
function batchOutputName(relPath, used) {
  const parts = relPath.split('/');
  const base = safeFileName(parts.pop().replace(/\.[^.]*$/, ''));
  let name = base + '.html';
  if (used.has(name.toLowerCase()) && parts.length) {
    name = safeFileName(parts[parts.length - 1] + ' - ' + base) + '.html';
  }
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    name = name.replace(/( \(\d+\))?\.html$/, ` (${n}).html`);
  }
  used.add(name.toLowerCase());
  return name;
}

async function convertBatchSource(file, relPath) {
  const text = await file.text();
  if (!isFriseChronos(text)) throw new Error('ce n’est pas une frise FriseChronos');
  const p = parseFriseChronos(text, file.name);
  p.doc.subtitle = 'Importée depuis FriseChronos (' + relPath + ')';
  return buildHTMLFile(false, p.doc, p.images);
}

/* ---------- Fenêtre de suivi ---------- */

function batchDialog(html, done) {
  const dlg = $('#dlg-batch');
  $('#batch-body').innerHTML = html;
  $('#batch-close').disabled = !done;
  if (!dlg.open) dlg.showModal();
}

function batchReport(results, where) {
  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const failed = results.filter(r => r.status === 'error').length;
  const icon = { ok: '✓', skip: '–', error: '✗' };
  let h = `<p><b>${plural(ok, 'frise convertie', 'frises converties')}</b>` +
    (skipped ? `, ${plural(skipped, 'déjà présente', 'déjà présentes')} (non remplacée${skipped > 1 ? 's' : ''})` : '') +
    (failed ? `, <span class="danger-text">${plural(failed, 'erreur')}</span>` : '') + '.</p>';
  if (where) h += `<p class="muted">${where}</p>`;
  if (results.length) {
    h += '<table class="batch-table"><thead><tr><th></th><th>Fichier d’origine</th><th>Frise produite</th></tr></thead><tbody>' +
      results.map(r => `<tr class="st-${r.status}"><td>${icon[r.status]}</td><td>${esc(r.path)}</td>` +
        `<td>${r.status === 'error' ? esc(r.message) : esc(r.out) + (r.status === 'skip' ? ' <span class="muted">(déjà présent)</span>' : '')}</td></tr>`).join('') +
      '</tbody></table>';
  }
  batchDialog(h, true);
}

/* ---------- Conversion ---------- */

async function batchConvertFriseChronos() {
  if (window.showDirectoryPicker) {
    let dir = null;
    try {
      dir = await window.showDirectoryPicker({ id: 'frisechronos-lot', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Accès direct au dossier impossible : repli sur un fichier .zip', e);
    }
    if (dir) { await batchFromDirectory(dir); return; }
  }
  const files = await pickDirectoryFiles();
  if (files && files.length) await batchFromFileList(files);
}

async function batchFromDirectory(dir) {
  batchDialog('<p>Recherche des fichiers .bin…</p>', false);
  const sources = [];
  for await (const e of walkDirectory(dir, '')) if (isBatchSource(e.name)) sources.push(e);
  sources.sort((a, b) => a.path.localeCompare(b.path));
  const used = new Set(), results = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    batchDialog(`<p>Conversion… ${i + 1} / ${sources.length}</p><p class="muted">${esc(s.path)}</p>`, false);
    const out = batchOutputName(s.path, used);
    try {
      let exists = false;
      try { await dir.getFileHandle(out); exists = true; } catch (e) { /* n'existe pas encore */ }
      if (exists) { results.push({ status: 'skip', path: s.path, out }); continue; }
      const html = await convertBatchSource(await s.getFile(), s.path);
      const fh = await dir.getFileHandle(out, { create: true });
      const w = await fh.createWritable();
      await w.write(new Blob([html], { type: 'text/html' }));
      await w.close();
      results.push({ status: 'ok', path: s.path, out });
    } catch (e) {
      used.delete(out.toLowerCase());
      results.push({ status: 'error', path: s.path, message: e.message || String(e) });
    }
  }
  batchReport(results, sources.length
    ? `Les frises ont été enregistrées dans le dossier « ${esc(dir.name)} ».`
    : `Aucun fichier .bin n’a été trouvé dans « ${esc(dir.name)} » ni dans ses sous-dossiers.`);
}

function pickDirectoryFiles() {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.webkitdirectory = true;
    inp.hidden = true;
    inp.onchange = () => { res([...inp.files]); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}

async function batchFromFileList(files) {
  // webkitRelativePath commence par le nom du dossier choisi : on le retire
  const sources = files
    .map(f => ({ file: f, path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name }))
    .filter(s => isBatchSource(s.file.name))
    .sort((a, b) => a.path.localeCompare(b.path));
  const used = new Set(), results = [], zipFiles = [];
  const enc = new TextEncoder();
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    batchDialog(`<p>Conversion… ${i + 1} / ${sources.length}</p><p class="muted">${esc(s.path)}</p>`, false);
    const out = batchOutputName(s.path, used);
    try {
      zipFiles.push({ name: out, data: enc.encode(await convertBatchSource(s.file, s.path)) });
      results.push({ status: 'ok', path: s.path, out });
    } catch (e) {
      used.delete(out.toLowerCase());
      results.push({ status: 'error', path: s.path, message: e.message || String(e) });
    }
  }
  if (zipFiles.length) downloadBlob(makeZip(zipFiles), 'Frises converties.zip');
  batchReport(results, zipFiles.length
    ? 'Votre navigateur ne permet pas d’écrire directement dans le dossier : les frises ont été téléchargées dans <b>« Frises converties.zip »</b>. Décompressez-le dans votre répertoire de travail.'
    : 'Aucun fichier .bin n’a été trouvé dans ce dossier ni dans ses sous-dossiers.');
}

/* ---------- Petit créateur de fichiers .zip (sans compression) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data), size = f.data.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true);     // noms en UTF-8
    loc.setUint16(10, time, true);
    loc.setUint16(12, date, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, size, true);
    loc.setUint32(22, size, true);
    loc.setUint16(26, name.length, true);
    parts.push(loc.buffer, name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(cen.buffer, name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((s, b) => s + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
