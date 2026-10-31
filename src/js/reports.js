/* ===== Fiches d'évaluation : une fiche par élève =====

   L'enseignant choisit le dossier qui contient un sous-dossier par élève
   (ex. SNT_B_dupont). Toutes les frises .html de chaque sous-dossier sont lues et
   l'on produit, pour chaque élève, une page avec son nom puis, pour chaque repère,
   un paragraphe : date, titre, image et texte saisi.
   Les fiches sont enregistrées dans le sous-dossier « Fiches evaluation ». */

const REPORT_DIR = 'Fiches evaluation';

function isReportSource(name) { return /\.html?$/i.test(name); }

/* Nom de l'élève : nom du dossier sans le préfixe commun (« SNT_B_ »). */
function studentNames(folders) {
  let prefix = '';
  if (folders.length > 1) {
    prefix = folders.reduce((p, f) => {
      let i = 0;
      while (i < p.length && i < f.length && p[i].toLowerCase() === f[i].toLowerCase()) i++;
      return p.slice(0, i);
    });
    prefix = prefix.slice(0, prefix.lastIndexOf('_') + 1);
  }
  const names = new Map();
  for (const f of folders) {
    let n = prefix && f.length > prefix.length ? f.slice(prefix.length) : f.replace(/^SNT_[^_]+_/i, '');
    n = n.replace(/_+/g, ' ').trim();
    names.set(f, n || f);
  }
  return names;
}

/* ---------- Mise en page d'une fiche ---------- */

const REPORT_CSS = `
@page { margin: 1cm; }
body { font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #1f2937; max-width: 980px; margin: 1cm auto; padding: 0 1cm; line-height: 1.45; }
.head { margin: 0 0 6px; }
.head h1 { display: inline; font-size: 26px; margin: 0 14px 0 0; }
.head .meta { color: #6b7280; }
.frise { margin: 16px 0 0; }
.frise h2 { font-size: 19px; margin: 0; padding-bottom: 2px; border-bottom: 1px solid #cbd5e1; }
.frise .file { font-weight: normal; color: #6b7280; font-size: 13px; }
.frise .stats { color: #475569; font-size: 13px; margin: 3px 0 4px; }
.rep { border-left: 4px solid var(--c, #64748b); padding: 2px 0 2px 12px; margin: 8px 0; break-inside: avoid; display: flow-root; }
.rep h3 { font-size: 16px; margin: 0; }
.rep h3 .date { color: var(--c, #64748b); font-size: 14px; margin-right: 8px; }
.rep img { float: right; width: auto; height: auto; max-width: 16.6%; max-height: 180px; margin: 2px 0 4px 12px; border-radius: 4px; }
.rep .cap { font-size: 12px; color: #6b7280; font-style: italic; }
.rep .txt p, .rep .txt ul, .rep .txt ol, .rep .txt blockquote { margin: 3px 0; }
.rep .txt blockquote { border-left: 3px solid #d1d5db; padding: 1px 10px; color: #374151; font-style: italic; }
.rep .lnk { font-size: 12.5px; word-break: break-all; }
.empty { color: #9ca3af; font-style: italic; }
.err { color: #b91c1c; }
.student + .student { break-before: page; }
@media print { body { margin: 0 auto; padding: 0; max-width: none; } a { color: inherit; } }
`;

function reportFriseHtml(f) {
  if (f.error) {
    return `<section class="frise"><h2>${esc(f.fileName)}</h2><p class="err">Impossible de lire ce fichier : ${esc(f.error)}</p></section>`;
  }
  const { doc, images } = f.payload;
  const items = doc.items.slice().sort(compareItems);
  const cats = new Map(doc.categories.map(c => [c.id, c]));
  const nEv = items.filter(i => i.type !== 'period').length;
  const nImg = items.filter(i => i.imageId && images[i.imageId]).length;
  const nTxt = items.filter(i => (i.details || '').trim()).length;
  let h = `<section class="frise"><h2>${esc(doc.title || 'Frise sans titre')} <span class="file">— ${esc(f.fileName)}</span></h2>`;
  h += `<p class="stats">${doc.subtitle ? esc(doc.subtitle) + ' · ' : ''}${plural(items.length, 'repère')} (${plural(nEv, 'événement')}, ${plural(items.length - nEv, 'période')}) · ` +
    `${nImg} avec image · ${nTxt} avec texte</p>`;
  if (!items.length) h += '<p class="empty">Aucun repère.</p>';
  for (const it of items) {
    const cat = cats.get(it.categoryId);
    const color = it.color || (cat && cat.color) || '#64748b';
    const img = it.imageId && images[it.imageId];
    h += `<div class="rep" style="--c:${color}">` +
      (img ? `<img src="${esc(img)}" alt="">` : '') +
      `<h3><span class="date">${esc(cap(itemDateText(it, false)))}</span>${esc(it.title || 'Sans titre')}</h3>`;
    if ((it.details || '').trim()) h += `<div class="txt">${mdToHtml(it.details)}</div>`;
    if (img && it.imageCaption) h += `<div class="cap">Image : ${esc(it.imageCaption)}</div>`;
    if (it.link) h += `<div class="lnk">Lien : <a href="${esc(it.link)}">${esc(it.link)}</a></div>`;
    h += '</div>';
  }
  return h + '</section>';
}

function reportStudentHtml(student) {
  const ok = student.frises.filter(f => !f.error).length;
  return `<article class="student"><div class="head"><h1>${esc(student.name)}</h1>` +
    `<span class="meta">Dossier « ${esc(student.folder)} » · ${plural(ok, 'frise')}</span></div>` +
    (student.frises.length ? student.frises.map(reportFriseHtml).join('') : '<p class="empty">Aucune frise dans ce dossier.</p>') +
    '</article>';
}

function reportPage(title, body) {
  return '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`;
}

/* ---------- Lecture des dossiers et production des fiches ---------- */

function openReportsDialog() {
  try { const v = localStorage.getItem('frise-fiches-pages'); if (v) $('#rep-pages').value = v; } catch (e) { /* ignoré */ }
  $('#dlg-reports').showModal();
}

function reportFormats() {
  const minPages = clamp(parseInt($('#rep-pages').value, 10) || 1, 1, 20);
  try { localStorage.setItem('frise-fiches-pages', String(minPages)); } catch (e) { /* ignoré */ }
  return { html: $('#rep-html').checked, pdf: $('#rep-pdf').checked, tex: $('#rep-tex').checked, minPages };
}

async function studentReports(formats) {
  if (!formats.html && !formats.pdf && !formats.tex) { toast('Choisissez au moins un format.'); return; }
  if (window.showDirectoryPicker) {
    let dir = null;
    try {
      dir = await window.showDirectoryPicker({ id: 'fiches-eleves', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Accès direct au dossier impossible : repli sur un fichier .zip', e);
    }
    if (dir) { await reportsFromDirectory(dir, formats); return; }
  }
  const files = await pickDirectoryFiles();
  if (files && files.length) await reportsFromFileList(files, formats);
}

/* sources : [{ folder, path, read: () => Promise<string> }] → élèves avec leurs frises */
async function buildStudents(sources, folders) {
  const names = studentNames(folders);
  const byFolder = new Map(folders.map(f => [f, []]));
  sources.sort((a, b) => a.path.localeCompare(b.path));
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    batchDialog(`<p>Lecture des frises… ${i + 1} / ${sources.length}</p><p class="muted">${esc(s.path)}</p>`, false);
    const fileName = s.path.split('/').slice(1).join('/');
    try {
      byFolder.get(s.folder).push({ fileName, payload: parseFrisePayloadText(await s.read(), fileName) });
    } catch (e) {
      byFolder.get(s.folder).push({ fileName, error: e.message || String(e) });
    }
  }
  const used = new Set();
  return folders
    .map(folder => {
      const name = names.get(folder);
      let base = safeFileName('Fiche - ' + name);
      for (let n = 2; used.has(base.toLowerCase()); n++) base = safeFileName(`Fiche - ${name} (${n})`);
      used.add(base.toLowerCase());
      return { folder, name, base, frises: byFolder.get(folder) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

/* → [{ name: chemin relatif, data: texte ou octets }] */
async function reportFiles(students, formats) {
  const files = [];
  const multi = students.length > 1;
  if (formats.html) {
    for (const s of students) files.push({ name: s.base + '.html', data: reportPage(s.name + ' — frises', reportStudentHtml(s)) });
    if (multi) files.push({ name: 'Toutes les fiches.html', data: reportPage('Toutes les fiches', students.map(reportStudentHtml).join('')) });
  }
  if (formats.pdf) {
    const cache = new Map();
    for (let i = 0; i < students.length; i++) {
      batchDialog(`<p>Création des PDF… ${i + 1} / ${students.length}</p>`, false);
      files.push({ name: students[i].base + '.pdf', data: await reportPdf([students[i]], students[i].name, cache, formats.minPages) });
    }
    if (multi) {
      batchDialog('<p>Création de « Toutes les fiches.pdf »…</p>', false);
      files.push({ name: 'Toutes les fiches.pdf', data: await reportPdf(students, 'Toutes les fiches', cache, formats.minPages) });
    }
  }
  if (formats.tex) {
    batchDialog('<p>Création des fichiers LaTeX…</p>', false);
    files.push(...await reportLatex(students, formats.minPages));
  }
  return files;
}

function formatsText(formats) {
  return [formats.html && 'pages web', formats.pdf && 'PDF', formats.tex && 'LaTeX (dossier « latex »)'].filter(Boolean).join(', ');
}

async function writeReportFile(dir, path, data) {
  const parts = path.split('/');
  const name = parts.pop();
  let d = dir;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([data]));
  await w.close();
}

function reportsSummary(students, where, formats) {
  let h = `<p><b>${plural(students.length, 'fiche produite', 'fiches produites')}</b>` +
    (formats && students.length ? ` (${formatsText(formats)})` : '') +
    (students.length > 1 ? ', plus « Toutes les fiches » pour tout imprimer d’un coup' : '') + '.</p>';
  if (where) h += `<p class="muted">${where}</p>`;
  if (students.length) {
    h += '<table class="batch-table"><thead><tr><th></th><th>Élève</th><th>Frises</th><th>Repères</th></tr></thead><tbody>' +
      students.map(s => {
        const bad = s.frises.filter(f => f.error);
        const reps = s.frises.reduce((n, f) => n + (f.payload ? f.payload.doc.items.length : 0), 0);
        const status = bad.length || !s.frises.length ? 'error' : 'ok';
        return `<tr class="st-${status}"><td>${status === 'ok' ? '✓' : '!'}</td><td>${esc(s.name)}</td>` +
          `<td>${!s.frises.length ? 'aucune' : s.frises.length - bad.length}${bad.length ? ` (+ ${plural(bad.length, 'fichier illisible', 'fichiers illisibles')})` : ''}</td>` +
          `<td>${reps}</td></tr>`;
      }).join('') + '</tbody></table>';
  }
  batchDialog(h, true);
}

async function reportsFromDirectory(dir, formats) {
  batchDialog('<p>Recherche des dossiers d’élèves…</p>', false, 'Fiches d’évaluation');
  const folders = [], sources = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'directory' || name.startsWith('.') || name === REPORT_DIR) continue;
    folders.push(name);
    for await (const e of walkDirectory(handle, name)) {
      if (isReportSource(e.name)) sources.push({ folder: name, path: e.path, read: async () => (await e.getFile()).text() });
    }
  }
  if (!folders.length) {
    reportsSummary([], `Aucun sous-dossier n’a été trouvé dans « ${esc(dir.name)} ». Choisissez le dossier qui contient les dossiers des élèves.`);
    return;
  }
  const students = await buildStudents(sources, folders.sort());
  const outDir = await dir.getDirectoryHandle(REPORT_DIR, { create: true });
  const files = await reportFiles(students, formats);
  batchDialog('<p>Enregistrement des fichiers…</p>', false);
  for (const f of files) await writeReportFile(outDir, f.name, f.data);
  reportsSummary(students, `Les fiches ont été enregistrées dans « ${esc(dir.name)} / ${REPORT_DIR} ».` +
    (formats.tex ? ' Pour LaTeX : compilez les fichiers .tex du dossier « latex » avec pdflatex, ou importez ce dossier dans Overleaf.' : ''), formats);
}

async function reportsFromFileList(files, formats) {
  batchDialog('<p>Lecture des dossiers…</p>', false, 'Fiches d’évaluation');
  const folders = new Set(), sources = [];
  for (const f of files) {
    // webkitRelativePath : dossier-choisi/dossier-élève/…/frise.html
    const parts = (f.webkitRelativePath || '').split('/');
    if (parts.length < 3 || parts[1].startsWith('.') || parts[1] === REPORT_DIR) continue;
    folders.add(parts[1]);
    if (isReportSource(f.name)) sources.push({ folder: parts[1], path: parts.slice(1).join('/'), read: () => f.text() });
  }
  const students = await buildStudents(sources, [...folders].sort());
  if (students.length) {
    const enc = new TextEncoder();
    const files = await reportFiles(students, formats);
    downloadBlob(makeZip(files.map(f => ({ name: f.name, data: typeof f.data === 'string' ? enc.encode(f.data) : f.data }))), 'Fiches evaluation.zip');
  }
  reportsSummary(students, students.length
    ? 'Votre navigateur ne permet pas d’écrire directement dans le dossier : les fiches ont été téléchargées dans <b>« Fiches evaluation.zip »</b>.'
    : 'Aucun dossier d’élève n’a été trouvé. Choisissez le dossier qui contient les dossiers des élèves.', formats);
}
