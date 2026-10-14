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
body { font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #1f2937; max-width: 860px; margin: 24px auto; padding: 0 20px; line-height: 1.5; }
h1 { font-size: 26px; margin: 0 0 4px; }
.meta { color: #6b7280; margin: 0 0 18px; }
.frise { margin: 26px 0 0; }
.frise h2 { font-size: 19px; margin: 0; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; }
.frise .file { font-weight: normal; color: #6b7280; font-size: 13px; }
.frise .stats { color: #475569; font-size: 13.5px; margin: 6px 12px 10px; }
.rep { border-left: 4px solid var(--c, #64748b); padding: 6px 0 6px 14px; margin: 14px 0; break-inside: avoid; }
.rep h3 { font-size: 16px; margin: 0; }
.rep .date { color: var(--c, #64748b); font-weight: 600; }
.rep .tags { font-size: 12px; color: #6b7280; }
.rep img { max-width: 100%; max-height: 260px; display: block; margin: 8px 0 2px; border-radius: 6px; }
.rep .cap { font-size: 12px; color: #6b7280; font-style: italic; }
.rep .txt p, .rep .txt ul, .rep .txt ol, .rep .txt blockquote { margin: 6px 0; }
.rep .txt blockquote { border-left: 3px solid #d1d5db; padding: 2px 10px; color: #374151; font-style: italic; }
.rep .empty { color: #9ca3af; font-style: italic; }
.rep .lnk { font-size: 12.5px; word-break: break-all; }
.err { color: #b91c1c; }
.student + .student { break-before: page; }
@media print { body { margin: 0 auto; } a { color: inherit; } }
`;

function reportFriseHtml(f) {
  if (f.error) {
    return `<section class="frise"><h2>${esc(f.fileName)}</h2><p class="err">Impossible de lire ce fichier : ${esc(f.error)}</p></section>`;
  }
  const { doc, images } = f.payload;
  const cats = new Map(doc.categories.map(c => [c.id, c]));
  const items = doc.items.slice().sort(compareItems);
  const nEv = items.filter(i => i.type !== 'period').length;
  const nImg = items.filter(i => i.imageId && images[i.imageId]).length;
  const nTxt = items.filter(i => (i.details || '').trim()).length;
  let h = `<section class="frise"><h2>${esc(doc.title || 'Frise sans titre')} <span class="file">— ${esc(f.fileName)}</span></h2>`;
  if (doc.subtitle) h += `<p class="stats">${esc(doc.subtitle)}</p>`;
  h += `<p class="stats">${plural(items.length, 'repère')} (${plural(nEv, 'événement')}, ${plural(items.length - nEv, 'période')}) · ` +
    `${nImg} avec image · ${nTxt} avec texte</p>`;
  if (!items.length) h += '<p class="empty">Aucun repère.</p>';
  for (const it of items) {
    const cat = cats.get(it.categoryId);
    const color = it.color || (cat && cat.color) || '#64748b';
    h += `<div class="rep" style="--c:${color}">` +
      `<h3>${esc(it.title || 'Sans titre')}</h3>` +
      `<div class="date">${esc(cap(itemDateText(it, false)))}</div>` +
      `<div class="tags">${it.type === 'period' ? 'Période' : 'Événement'}${cat ? ' · ' + esc(cat.name) : ''}</div>`;
    if (it.imageId && images[it.imageId]) {
      h += `<img src="${esc(images[it.imageId])}" alt="">`;
      if (it.imageCaption) h += `<div class="cap">${esc(it.imageCaption)}</div>`;
    }
    h += (it.details || '').trim()
      ? `<div class="txt">${mdToHtml(it.details)}</div>`
      : '<p class="empty">(aucun texte saisi)</p>';
    if (it.link) h += `<div class="lnk">Lien : <a href="${esc(it.link)}">${esc(it.link)}</a></div>`;
    h += '</div>';
  }
  return h + '</section>';
}

function reportStudentHtml(student) {
  const ok = student.frises.filter(f => !f.error).length;
  return `<article class="student"><h1>${esc(student.name)}</h1>` +
    `<p class="meta">Dossier « ${esc(student.folder)} » · ${plural(ok, 'frise')}</p>` +
    (student.frises.length ? student.frises.map(reportFriseHtml).join('') : '<p class="empty">Aucune frise dans ce dossier.</p>') +
    '</article>';
}

function reportPage(title, body) {
  return '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`;
}

/* ---------- Lecture des dossiers et production des fiches ---------- */

async function studentReports() {
  if (window.showDirectoryPicker) {
    let dir = null;
    try {
      dir = await window.showDirectoryPicker({ id: 'fiches-eleves', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Accès direct au dossier impossible : repli sur un fichier .zip', e);
    }
    if (dir) { await reportsFromDirectory(dir); return; }
  }
  const files = await pickDirectoryFiles();
  if (files && files.length) await reportsFromFileList(files);
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
      let out = safeFileName('Fiche - ' + name) + '.html';
      for (let n = 2; used.has(out.toLowerCase()); n++) out = safeFileName(`Fiche - ${name} (${n})`) + '.html';
      used.add(out.toLowerCase());
      return { folder, name, out, frises: byFolder.get(folder) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

function reportFiles(students) {
  const files = students.map(s => ({ name: s.out, html: reportPage(s.name + ' — frises', reportStudentHtml(s)) }));
  if (students.length > 1) {
    files.push({ name: 'Toutes les fiches.html', html: reportPage('Toutes les fiches', students.map(reportStudentHtml).join('')) });
  }
  return files;
}

function reportsSummary(students, where) {
  let h = `<p><b>${plural(students.length, 'fiche produite', 'fiches produites')}</b>` +
    (students.length > 1 ? ', plus « Toutes les fiches.html » pour tout imprimer d’un coup' : '') + '.</p>';
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

async function reportsFromDirectory(dir) {
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
  for (const f of reportFiles(students)) {
    const fh = await outDir.getFileHandle(f.name, { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([f.html], { type: 'text/html' }));
    await w.close();
  }
  reportsSummary(students, `Les fiches ont été enregistrées dans « ${esc(dir.name)} / ${REPORT_DIR} ». Ouvrez-les d’un double-clic ; elles s’impriment directement.`);
}

async function reportsFromFileList(files) {
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
    downloadBlob(makeZip(reportFiles(students).map(f => ({ name: f.name, data: enc.encode(f.html) }))), 'Fiches evaluation.zip');
  }
  reportsSummary(students, students.length
    ? 'Votre navigateur ne permet pas d’écrire directement dans le dossier : les fiches ont été téléchargées dans <b>« Fiches evaluation.zip »</b>.'
    : 'Aucun dossier d’élève n’a été trouvé. Choisissez le dossier qui contient les dossiers des élèves.');
}
