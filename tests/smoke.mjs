// Test de bout en bout : node tests/smoke.mjs [dossier-de-sortie]
// Nécessite Playwright (npm i -D playwright) et un Chromium.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'tests', 'out'));
mkdirSync(out, { recursive: true });

const errors = [];
const check = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); console.log('  ✓ ' + msg); };

const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

const browser = await playwright.chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });

async function openPage(url) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  // force le repli « téléchargement » (pas de sélecteur de fichier en test automatisé)
  await page.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; });
  await page.goto(url);
  return page;
}

const appUrl = pathToFileURL(join(root, 'Frise.html')).href;
const page = await openPage(appUrl);

console.log('Accueil');
check(await page.isVisible('#welcome'), 'écran d’accueil visible');
await page.screenshot({ path: join(out, '01-accueil.png') });

console.log('Exemple');
await page.click('#welcome [data-action=example]');
await settle(page);
check(await page.locator('#svg-host .event').count() > 5, 'événements dessinés');
check(await page.locator('#svg-host .period').count() >= 5, 'périodes dessinées');
await page.screenshot({ path: join(out, '02-exemple.png') });

console.log('Fiche détaillée');
await page.locator('#svg-host .event', { hasText: 'Prise de la Bastille' }).first().click();
check(await page.isVisible('#details'), 'panneau de détails ouvert');
check((await page.textContent('#details')).includes('forteresse'), 'texte détaillé affiché');
check((await page.textContent('#details')).includes('14 juillet 1789'), 'date complète affichée');
await page.screenshot({ path: join(out, '03-details.png') });
await page.keyboard.press('ArrowRight');
await settle(page);
check((await page.textContent('#details h2')).includes('Abolition'), 'navigation → élément suivant');
await page.keyboard.press('Escape');
await settle(page);

console.log('Ajout d’un événement avec image');
// petite image PNG générée dans la page
const png = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 200;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 300, 200); g.addColorStop(0, '#f59e0b'); g.addColorStop(1, '#7c3aed');
  x.fillStyle = g; x.fillRect(0, 0, 300, 200);
  x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.fillText('1792', 100, 115);
  return c.toDataURL('image/png').split(',')[1];
});
const pngPath = join(out, 'test-image.png');
writeFileSync(pngPath, Buffer.from(png, 'base64'));
await page.click('#toolbar [data-action=addEvent]');
await settle(page);
check(await page.isVisible('#editor'), 'fenêtre de modification ouverte');
await page.fill('#editor [name=title]', 'Bataille de Valmy');
await page.fill('#editor [name=startD]', '20');
await page.selectOption('#editor [name=startM]', '9');
await page.fill('#editor [name=startY]', '1792');
await page.selectOption('#editor [name=category]', { label: 'Guerres' });
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#editor .img-empty [data-pick-image]')]);
await chooser.setFiles(pngPath);
await page.waitForSelector('#img-preview:not([hidden])');
await page.fill('#editor [name=imageCaption]', 'Image de test');
await page.fill('#editor [name=details]', 'Première **victoire** de la République.\n\n- point 1\n- point 2\n\n> « Vive la Nation ! »');
await page.click('#editor button[type=submit]');
await settle(page);
check(!(await page.isVisible('#editor')), 'fenêtre fermée après validation');
check(await page.locator('#svg-host .event', { hasText: 'Bataille de Valmy' }).count() === 1, 'nouvel événement sur la frise');
check(await page.locator('#svg-host .event image').count() >= 1, 'vignette affichée sur la frise');
await page.locator('#svg-host .event', { hasText: 'Valmy' }).click();
check(await page.locator('#details strong', { hasText: 'victoire' }).count() === 1, 'gras rendu dans la fiche');
check(await page.locator('#details blockquote').count() === 1, 'citation rendue');
check(await page.locator('#details figure img').count() === 1, 'image dans la fiche');
await page.screenshot({ path: join(out, '04-ajout-image.png') });

console.log('Validation des dates');
await page.click('#toolbar [data-action=addPeriod]');
await settle(page);
await page.fill('#editor [name=title]', 'Test');
await page.fill('#editor [name=startY]', '1900');
await page.fill('#editor [name=endY]', '1850');
await page.click('#editor button[type=submit]');
await settle(page);
check((await page.textContent('#editor-error')).includes('après'), 'erreur si la fin précède le début');
await page.fill('#editor [name=startY]', '0');
await page.click('#editor button[type=submit]');
await settle(page);
check((await page.textContent('#editor-error')).includes('année 0'), 'erreur pour l’année 0');
await page.click('#editor [data-close]');
await settle(page);

console.log('Annuler / rétablir');
const before = await page.locator('#svg-host .event').count();
await page.keyboard.press('Control+z');
await settle(page);
check(await page.locator('#svg-host .event').count() === before - 1, 'Ctrl+Z annule l’ajout');
await page.keyboard.press('Control+y');
await settle(page);
check(await page.locator('#svg-host .event').count() === before, 'Ctrl+Y rétablit');

console.log('Avant J.-C. et zoom arrière');
await page.click('#toolbar [data-action=addPeriod]');
await settle(page);
await page.fill('#editor [name=title]', 'Empire romain');
await page.fill('#editor [name=startY]', '27');
await page.check('#editor [name=startBC]');
await page.fill('#editor [name=endY]', '476');
await page.click('#editor button[type=submit]');
await settle(page);
await page.click('#toolbar [data-action=addEvent]');
await settle(page);
await page.fill('#editor [name=title]', 'Fondation de Rome');
await page.fill('#editor [name=startY]', '-753');
await page.check('#editor [name=approx]');
await page.click('#editor button[type=submit]');
await settle(page);
await page.click('#toolbar [data-action=fit]');
await settle(page);
await page.screenshot({ path: join(out, '05-avant-jc.png') });
check((await page.textContent('#svg-host')).includes('av. J.-C.'), 'graduations avant J.-C.');
check((await page.textContent('#svg-host')).includes('vers 753 av. J.-C.'), 'date approximative avant J.-C.');
await page.locator('#svg-host .period', { hasText: 'Empire romain' }).click();
check((await page.textContent('#details .d-date')).includes('27 av. J.-C. à 476'), 'dates de période en toutes lettres');
check((await page.textContent('#details .d-meta')).includes('502 ans'), 'durée calculée sans année 0');
await page.keyboard.press('Escape');
await settle(page);

console.log('Mode révision');
await page.click('#btn-quiz');
await settle(page);
await page.locator('#svg-host .event').first().click();
check(await page.isVisible('#details [data-d=reveal]'), 'bouton « Révéler » en mode révision');
await page.screenshot({ path: join(out, '06-revision.png') });
await page.click('#details [data-d=reveal]');
await settle(page);
check(!(await page.textContent('#details h2')).includes('?'), 'titre révélé');
await page.click('#btn-quiz');
await settle(page);
await page.keyboard.press('Escape');
await settle(page);

console.log('Enregistrement');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#toolbar .tb[data-action=save]')]);
const savedPath = join(out, dl.suggestedFilename());
await dl.saveAs(savedPath);
check(dl.suggestedFilename().endsWith('.html'), 'fichier .html proposé : ' + dl.suggestedFilename());
const saved = readFileSync(savedPath, 'utf8');
check(saved.includes('"format":"frise-chronologique"'), 'données intégrées au fichier');
check((await page.textContent('#save-status')).includes('Enregistré'), 'statut « Enregistré »');

console.log('Réouverture du fichier enregistré (double-clic simulé)');
const page2 = await openPage(pathToFileURL(savedPath).href);
check(await page2.locator('#svg-host .event', { hasText: 'Bataille de Valmy' }).count() === 1, 'événement retrouvé');
check(await page2.locator('#svg-host .event image').count() >= 1, 'image retrouvée');
check(await page2.inputValue('#doc-title') === 'La Révolution française et l’Empire', 'titre retrouvé');
check(!(await page2.evaluate(() => document.body.classList.contains('readonly'))), 'fichier modifiable');
// enregistrer à nouveau depuis le fichier rouvert : le fichier reste valide
await page2.fill('#doc-title', 'Titre modifié');
await page2.press('#doc-title', 'Enter');
await settle(page2);
const [dl2] = await Promise.all([page2.waitForEvent('download'), page2.keyboard.press('Control+s')]);
const saved2 = join(out, 'resave-' + dl2.suggestedFilename());
await dl2.saveAs(saved2);
check(dl2.suggestedFilename() === dl.suggestedFilename(), 'même nom de fichier proposé');
const page3 = await openPage(pathToFileURL(saved2).href);
check(await page3.inputValue('#doc-title') === 'Titre modifié', 'second enregistrement relu');
check((readFileSync(saved2, 'utf8').match(/id="frise-data"/g) || []).length === 1, 'un seul bloc de données');
await page3.close();

console.log('Page en lecture seule');
const [dl3] = await Promise.all([page.waitForEvent('download'), (async () => {
  await page.click('[data-menu=menu-export]');
await settle(page);
  await page.click('[data-action=exportHtmlRo]');
await settle(page);
})()]);
const roPath = join(out, 'lecture-seule.html');
await dl3.saveAs(roPath);
const ro = await openPage(pathToFileURL(roPath).href);
check(await ro.evaluate(() => document.body.classList.contains('readonly')), 'mode lecture seule');
check(!(await ro.isVisible('#toolbar [data-action=addEvent]')), 'pas de bouton d’ajout');
await ro.locator('#svg-host .event').first().click();
check(await ro.isVisible('#details') && !(await ro.isVisible('#details [data-d=edit]')), 'fiche lisible sans bouton Modifier');
await ro.screenshot({ path: join(out, '07-lecture-seule.png') });

console.log('Export PNG');
const [dl4] = await Promise.all([page.waitForEvent('download'), (async () => {
  await page.click('[data-menu=menu-export]');
await settle(page);
  await page.click('[data-action=exportPngAll]');
await settle(page);
})()]);
const pngOut = join(out, '08-export.png');
await dl4.saveAs(pngOut);
const sig = readFileSync(pngOut).subarray(0, 8).toString('hex');
check(sig === '89504e470d0a1a0a', 'image PNG valide');

console.log('Import FriseChronos');
const fcPage = await openPage(appUrl);
const [fcChooser] = await Promise.all([fcPage.waitForEvent('filechooser'), fcPage.click('#welcome [data-action=importFC]')]);
await fcChooser.setFiles(join(root, 'tests', 'fixtures', 'frisechronos-exemple'));
await fcPage.waitForSelector('#svg-host .event');
await settle(fcPage);
check(await fcPage.locator('#svg-host .event').count() === 2, 'événements importés');
check(await fcPage.locator('#svg-host .period', { hasText: 'Première Guerre mondiale' }).count() === 1, 'période importée');
check(await fcPage.locator('#svg-host .event', { hasText: 'Prise de la Bastille : Paris' }).count() === 1, 'titre contenant « : » conservé');
check(await fcPage.locator('#svg-host .event image').count() === 1, 'image importée');
check((await fcPage.textContent('#svg-host')).includes('52 av. J.-C.'), 'année négative → av. J.-C.');
await fcPage.locator('#svg-host .event', { hasText: 'Bastille' }).click();
await settle(fcPage);
check((await fcPage.textContent('#details')).includes('forteresse'), 'texte détaillé importé');
check((await fcPage.textContent('#save-status')).includes('Non enregistré'), 'frise importée à enregistrer');
await fcPage.close();

console.log('Conversion d’un dossier FriseChronos (Edge/Chrome)');
const fcText = readFileSync(join(root, 'tests', 'fixtures', 'frisechronos-exemple'), 'utf8');
const batchPage = await context.newPage();
batchPage.on('pageerror', e => errors.push(String(e)));
await batchPage.addInitScript(fc => {
  const file = (name, text) => ({ kind: 'file', name, getFile: async () => new File([text], name) });
  const dir = (name, children) => {
    const map = new Map(children.map(c => [c.name, c]));
    return {
      kind: 'directory', name, map,
      async *entries() { for (const e of [...map]) yield e; },
      async getFileHandle(n, opt) {
        if (map.has(n)) return map.get(n);
        if (!opt || !opt.create) { const e = new Error('absent'); e.name = 'NotFoundError'; throw e; }
        const fh = { kind: 'file', name: n, written: null,
          async createWritable() { return { async write(b) { fh.written = await b.text(); }, async close() {} }; } };
        map.set(n, fh);
        return fh;
      },
    };
  };
  window.__root = dir('travail', [
    file('notes.txt', 'rien'),
    file('deja.html', 'ancienne conversion'),
    dir('3eA', [file('frise.bin', fc), dir('thomas', [file('frise_thomas.bin', fc)]), file('deja.bin', fc)]),
    dir('3eB', [file('frise.bin', fc), file('abime.bin', 'pas une frise')]),
  ]);
  window.showDirectoryPicker = async () => window.__root;
}, fcText);
await batchPage.goto(appUrl);
await batchPage.click('[data-menu=menu-file]');
await batchPage.click('[data-action=batchFC]');
await batchPage.waitForSelector('#batch-close:not([disabled])');
const written = await batchPage.evaluate(() => Object.fromEntries([...window.__root.map]
  .filter(([, h]) => h.written).map(([n, h]) => [n, h.written])));
const names = Object.keys(written).sort();
check(JSON.stringify(names) === JSON.stringify(['3eB - frise.html', 'frise.html', 'frise_thomas.html']), 'frises écrites à la racine : ' + names.join(', '));
check((await batchPage.textContent('#batch-body')).includes('3 frises converties'), 'bilan : 3 conversions');
check((await batchPage.textContent('#batch-body')).includes('déjà présente'), 'fichier déjà converti non remplacé');
check((await batchPage.textContent('#batch-body')).includes('pas une frise FriseChronos'), 'fichier abîmé signalé');
await batchPage.screenshot({ path: join(out, '10-conversion-lot.png') });
const convPath = join(out, 'converti-frise_thomas.html');
writeFileSync(convPath, written['frise_thomas.html']);
const conv = await openPage(pathToFileURL(convPath).href);
check(await conv.locator('#svg-host .event').count() === 2, 'frise convertie lisible');
check((await conv.inputValue('#doc-subtitle')).includes('3eA/thomas/frise_thomas.bin'), 'chemin d’origine en sous-titre');
await conv.close();
await batchPage.close();

console.log('Fiches d’évaluation d’une classe');
const friseA = readFileSync(savedPath, 'utf8');
const friseB = written['frise_thomas.html'];
const repPage = await context.newPage();
repPage.on('pageerror', e => errors.push(String(e)));
await repPage.addInitScript(([a, b]) => {
  const file = (name, text) => ({ kind: 'file', name, getFile: async () => new File([text], name) });
  const dir = (name, children) => {
    const map = new Map(children.map(c => [c.name, c]));
    const d = {
      kind: 'directory', name, map,
      async *entries() { for (const e of [...map]) yield e; },
      async getDirectoryHandle(n, opt) {
        if (!map.has(n)) { if (!opt || !opt.create) throw Object.assign(new Error('absent'), { name: 'NotFoundError' }); map.set(n, dir(n, [])); }
        return map.get(n);
      },
      async getFileHandle(n, opt) {
        if (map.has(n)) return map.get(n);
        if (!opt || !opt.create) throw Object.assign(new Error('absent'), { name: 'NotFoundError' });
        const fh = { kind: 'file', name: n, written: null,
          async createWritable() { return { async write(x) {
            const b = new Uint8Array(await x.arrayBuffer());
            let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
            fh.written = btoa(s);
          }, async close() {} }; } };
        map.set(n, fh);
        return fh;
      },
    };
    return d;
  };
  window.__classe = dir('SNT', [
    file('consignes.html', '<p>consignes</p>'),
    dir('SNT_B_martin', [file('ma frise.html', a), dir('brouillons', [file('v2.html', b)])]),
    dir('SNT_B_mathieu_lea', [file('frise.html', b), file('notes.html', '<html><body>pas une frise</body></html>')]),
    dir('SNT_B_zoe', [file('image.png', 'x')]),
  ]);
  window.showDirectoryPicker = async () => window.__classe;
}, [friseA, friseB]);
await repPage.goto(appUrl);
await repPage.click('[data-menu=menu-file]');
await repPage.click('[data-action=reports]');
await repPage.check('#rep-tex');
await repPage.fill('#rep-pages', '2');
await repPage.click('#rep-go');
await repPage.waitForSelector('#batch-close:not([disabled])', { timeout: 60000 });
// tout ce qui a été écrit, sous-dossiers compris (contenu en base64)
const reportsAll = await repPage.evaluate(() => {
  const out = {};
  const walk = (d, prefix) => {
    for (const [n, h] of d.map) {
      if (h.kind === 'directory') walk(h, prefix + n + '/');
      else if (h.written != null) out[prefix + n] = h.written;
    }
  };
  const root = window.__classe.map.get('Fiches evaluation');
  if (root) walk(root, '');
  return out;
});
const reportsBin = Object.fromEntries(Object.entries(reportsAll).map(([n, b64]) => [n, Buffer.from(b64, 'base64')]));
const reports = Object.fromEntries(Object.entries(reportsBin).filter(([n]) => n.endsWith('.html')).map(([n, b]) => [n, b.toString('utf8')]));
const repNames = Object.keys(reports).sort();
check(JSON.stringify(repNames) === JSON.stringify(['Fiche - martin.html', 'Fiche - mathieu lea.html', 'Fiche - zoe.html', 'Toutes les fiches.html']),
  'une fiche par élève + fiche globale : ' + repNames.join(', '));
check((await repPage.textContent('#batch-body')).includes('3 fiches produites'), 'bilan des fiches');
await repPage.screenshot({ path: join(out, '11-fiches-bilan.png') });
const fichePath = join(out, 'Fiche - martin.html');
writeFileSync(fichePath, reports['Fiche - martin.html']);
writeFileSync(join(out, 'Toutes les fiches.html'), reports['Toutes les fiches.html']);
const fiche = await openPage(pathToFileURL(fichePath).href);
check((await fiche.textContent('h1')) === 'martin', 'nom de l’élève en tête');
check(await fiche.locator('section.frise').count() === 2, 'les deux frises de l’élève (y compris sous-dossier)');
check(await fiche.locator('.rep', { hasText: 'Bataille de Valmy' }).locator('img').count() === 1, 'image du repère');
check((await fiche.locator('.rep', { hasText: 'Bataille de Valmy' }).textContent()).includes('victoire'), 'texte saisi du repère');
check(!(await fiche.textContent('body')).includes('aucun texte saisi'), 'pas de ligne « aucun texte saisi »');
check((await fiche.locator('.rep h3', { hasText: 'Bataille de Valmy' }).textContent()).includes('20 septembre 1792'), 'date et titre sur la même ligne');
check(await fiche.locator('.head h1 + .meta').count() === 1, 'nom et dossier sur la même ligne');
await fiche.screenshot({ path: join(out, '12-fiche-eleve.png'), fullPage: false });
await fiche.close();
check(reports['Fiche - mathieu lea.html'].includes('Impossible de lire ce fichier'), 'fichier HTML non-frise signalé');
check(reports['Fiche - zoe.html'].includes('Aucune frise'), 'élève sans frise signalé');

const pdfNames = Object.keys(reportsBin).filter(n => n.endsWith('.pdf')).sort();
check(JSON.stringify(pdfNames) === JSON.stringify(['Fiche - martin.pdf', 'Fiche - mathieu lea.pdf', 'Fiche - zoe.pdf', 'Toutes les fiches.pdf']),
  'PDF par élève + PDF global : ' + pdfNames.join(', '));
const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
for (const n of pdfNames) writeFileSync(join(out, n), reportsBin[n]);
check(reportsBin['Fiche - martin.pdf'].subarray(0, 5).toString() === '%PDF-', 'en-tête PDF');
if (has('pdftotext')) {
  const txt = execFileSync('pdftotext', ['-layout', join(out, 'Fiche - martin.pdf'), '-'], { encoding: 'utf8' });
  check(txt.includes('martin') && txt.includes('Bataille de Valmy') && txt.includes('victoire'), 'texte lisible dans le PDF (nom, repère, texte saisi)');
  check(/martin\s+Dossier « SNT_B_martin »/.test(txt), 'PDF : nom et dossier sur la même ligne');
  check(/20 septembre 1792\s+Bataille de Valmy/.test(txt), 'PDF : date et titre sur la même ligne');
  check(!txt.includes('aucun texte saisi') && !/^\s*Événement/m.test(txt), 'PDF : pas de lignes inutiles');
  check(txt.includes('Révolution française') && txt.includes('« Vive la Nation ! »'), 'accents et guillemets français dans le PDF');
  const pagesOf = f => +(execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1];
  const perStudent = ['Fiche - martin.pdf', 'Fiche - mathieu lea.pdf', 'Fiche - zoe.pdf'].map(n => pagesOf(join(out, n)));
  check(perStudent.every(p => p >= 2 && p % 2 === 0), `fiches PDF de 2 pages minimum, nombre pair (${perStudent.join(', ')})`);
  check(pagesOf(join(out, 'Toutes les fiches.pdf')) === perStudent.reduce((a, b) => a + b, 0), 'PDF global = somme des fiches (chaque élève commence sur un recto)');
  const all = execFileSync('pdfinfo', [join(out, 'Toutes les fiches.pdf')], { encoding: 'utf8' });
  const pages = +(all.match(/Pages:\s+(\d+)/) || [])[1];
  check(pages >= 3, `PDF global lisible (${pages} pages)`);
  const imgs = execFileSync('pdfimages', ['-list', join(out, 'Fiche - martin.pdf')], { encoding: 'utf8' }).trim().split('\n').length - 2;
  check(imgs >= 1, 'images incluses dans le PDF');
}

const texNames = Object.keys(reportsBin).filter(n => n.startsWith('latex/'));
check(texNames.includes('latex/fiche-martin.tex') && texNames.includes('latex/toutes-les-fiches.tex'), 'fichiers LaTeX produits');
check(texNames.some(n => n.startsWith('latex/images/')), 'images exportées pour LaTeX');
const texDir = join(out, 'latex');
for (const n of texNames) { mkdirSync(dirname(join(out, n)), { recursive: true }); writeFileSync(join(out, n), reportsBin[n]); }
if (has('pdflatex')) {
  for (const t of ['fiche-martin.tex', 'fiche-mathieu-lea.tex', 'fiche-zoe.tex', 'toutes-les-fiches.tex']) {
    let ok = true;
    try { execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', t], { cwd: texDir, stdio: 'pipe' }); }
    catch (e) { ok = false; console.error(String(e.stdout).split('\n').filter(l => l.startsWith('!')).join('\n')); }
    check(ok, 'compilation pdflatex de ' + t);
    if (ok && has('pdfinfo')) {
      const p = +(execFileSync('pdfinfo', [join(texDir, t.replace('.tex', '.pdf'))], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1];
      check(p % 2 === 0, `LaTeX : ${t} compte un nombre pair de pages (${p})`);
    }
  }
}
await repPage.close();

console.log('Conversion d’un dossier FriseChronos (repli .zip)');
const srcDir = join(out, 'travail');
mkdirSync(join(srcDir, 'classe1', 'eleve'), { recursive: true });
writeFileSync(join(srcDir, 'classe1', 'eleve', 'chronos.bin'), fcText);
writeFileSync(join(srcDir, 'classe1', 'autre.bin'), fcText);
const zipPage = await openPage(appUrl);
await zipPage.evaluate(() => { delete window.showDirectoryPicker; });
await zipPage.click('[data-menu=menu-file]');
const [dirChooser] = await Promise.all([zipPage.waitForEvent('filechooser'), zipPage.click('[data-action=batchFC]')]);
const [zipDl] = await Promise.all([zipPage.waitForEvent('download'), dirChooser.setFiles(srcDir)]);
const zipPath = join(out, 'frises-converties.zip');
await zipDl.saveAs(zipPath);
check(zipDl.suggestedFilename() === 'Frises converties.zip', 'archive .zip téléchargée');
const zipBuf = readFileSync(zipPath);
check(zipBuf.subarray(0, 4).toString('hex') === '504b0304', 'archive .zip valide');
check(zipBuf.includes('chronos.html') && zipBuf.includes('autre.html'), 'les deux frises sont dans l’archive');
await zipPage.close();

console.log('Travaux récents');
const page4 = await openPage(appUrl);
await page4.waitForSelector('#recents .recent');
check(await page4.locator('#recents .recent').count() >= 1, 'travail récent proposé à l’accueil');

console.log('Petit écran');
const mobile = await browser.newPage({ viewport: { width: 390, height: 800 } });
mobile.on('pageerror', e => errors.push(String(e)));
await mobile.goto(pathToFileURL(savedPath).href);
await mobile.screenshot({ path: join(out, '09-mobile.png') });

await browser.close();
if (errors.length) { console.error('Erreurs JavaScript :\n' + errors.join('\n')); process.exit(1); }
console.log('\nTous les tests sont passés.');
