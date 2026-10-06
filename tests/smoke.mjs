// Test de bout en bout : node tests/smoke.mjs [dossier-de-sortie]
// Nécessite Playwright (npm i -D playwright) et un Chromium.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
