// Assemble l'application en un seul fichier autonome : Frise.html
// Utilisation : node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(root, 'src', p), 'utf8');

const JS_FILES = ['boot.js', 'util.js', 'model.js', 'import-frisechronos.js', 'render.js', 'ui.js', 'io.js', 'batch.js', 'example.js', 'main.js'];

const js = "(function () {\n'use strict';\n" +
  JS_FILES.map(f => `/* ---- ${f} ---- */\n` + src('js/' + f)).join('\n') +
  '\n})();';
const css = src('style.css');

for (const [name, text] of [['JS', js], ['CSS', css]]) {
  if (/<\/script/i.test(text) || text.includes('<!--') || (name === 'CSS' && /<\/style/i.test(text))) {
    throw new Error(`${name} contient une séquence interdite dans une balise inline.`);
  }
}

const html = src('index.html')
  .split('/*__CSS__*/').join(css)
  .split('/*__JS__*/').join(js);

writeFileSync(join(root, 'Frise.html'), html);
console.log(`Frise.html généré (${Math.round(html.length / 1024)} Ko)`);
