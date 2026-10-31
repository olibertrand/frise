/* ===== Petit générateur de PDF, sans bibliothèque externe =====
   Polices standard Helvetica (aucune police à intégrer), encodage WinAnsi
   (couvre le français), images en JPEG, flux compressés si le navigateur le permet.
   Les largeurs de texte sont mesurées avec Arial, dont les dimensions sont
   identiques à celles d'Helvetica. */

const PDF_PAGE_W = 595.28, PDF_PAGE_H = 841.89, PDF_MARGIN = 28.35, PDF_FOOTER = 12;   // marges de 1 cm
const PDF_FONT = {
  r: ['F1', 'Helvetica', ''],
  b: ['F2', 'Helvetica-Bold', 'bold '],
  i: ['F3', 'Helvetica-Oblique', 'italic '],
  bi: ['F4', 'Helvetica-BoldOblique', 'italic bold '],
};
const WIN_ANSI_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
};

/* Ramène un texte aux caractères disponibles dans les polices standard. */
function pdfText(s) {
  let out = '';
  for (const ch of String(s).normalize('NFC')) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c < 0x7F) || (c >= 0xA0 && c <= 0xFF) || WIN_ANSI_EXTRA[ch]) out += ch;
    else if (c === 0x202F || c === 0x2009 || c === 0x2007) out += ' ';
    else if (c === 0x2010 || c === 0x2011) out += '-';
    else if (c === 0x09) out += ' ';
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += /^[\x20-\x7e]$/.test(base) ? base : '?';
    }
  }
  return out;
}

function pdfHex(s) {
  let h = '';
  for (const ch of s) h += (WIN_ANSI_EXTRA[ch] || ch.charCodeAt(0)).toString(16).padStart(2, '0');
  return '<' + h + '>';
}

function pdfUtf16(s) {
  let h = 'FEFF';
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
  return '<' + h + '>';
}

function pdfColor(hex) {
  return hexToRgb(normHex(hex) || '#000000').map(v => (v / 255).toFixed(3)).join(' ');
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pdfDeflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    return null;
  }
}

/* Image quelconque (data URL) → JPEG RGB prêt pour le PDF. */
async function pdfJpeg(dataURL) {
  const img = await loadImage(dataURL);
  let w = img.naturalWidth || 300, h = img.naturalHeight || 200;
  const r = Math.min(1, 1200 / Math.max(w, h));
  w = Math.max(1, Math.round(w * r));
  h = Math.max(1, Math.round(h * r));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { bytes: base64ToBytes(c.toDataURL('image/jpeg', 0.85).split(',')[1]), w, h };
}

class PdfWriter {
  constructor(title) {
    this.title = title;
    this.pages = [];
    this.images = [];
    this.bar = null;      // couleur de la barre verticale du repère en cours
    this.footer = '';
    this.newPage();
  }

  newPage() {
    this.page = { ops: [], footer: this.footer };
    this.pages.push(this.page);
    this.y = PDF_PAGE_H - PDF_MARGIN;
    this.float = null;    // image placée à droite, que le texte contourne
  }

  ensure(h) { if (this.y - h < PDF_MARGIN + PDF_FOOTER) this.newPage(); }

  space(h) {
    if (this.y - h < PDF_MARGIN + PDF_FOOTER) { this.newPage(); return; }
    if (this.bar) this.fillRect(PDF_MARGIN, this.y - h, 3, h, this.bar);
    this.y -= h;
  }

  fillRect(x, y, w, h, color) {
    this.page.ops.push(`${pdfColor(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  drawText(x, y, text, style, size, color) {
    this.page.ops.push(`BT /${PDF_FONT[style][0]} ${size} Tf ${pdfColor(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfHex(text)} Tj ET`);
  }

  measure(text, style, size) {
    return textWidth(text, `${PDF_FONT[style][2]}${size}px Arial, Helvetica, "Liberation Sans", sans-serif`);
  }

  get left() { return PDF_MARGIN + (this.bar ? 11 : 0); }

  /* Largeur disponible pour une ligne qui commence à la hauteur actuelle. */
  availWidth(x0) {
    let right = PDF_PAGE_W - PDF_MARGIN;
    if (this.float && this.y > this.float.bottom) right -= this.float.w;
    return right - x0;
  }

  /* runs : [{ text, style: 'r'|'b'|'i'|'bi', color, size }]
     Les lignes sont composées une à une : leur largeur dépend de l'image à droite. */
  paragraph(runs, o = {}) {
    const size = o.size || 10, lineH = o.lineH || Math.round(size * 1.38 * 10) / 10;
    const tokens = [];
    for (const r of runs) {
      const st = r.style || 'r', col = r.color || o.color || '#1f2937', sz = r.size || size;
      for (const part of String(r.text).split(/(\n| +)/)) {
        if (!part) continue;
        if (part === '\n') tokens.push({ nl: true });
        else tokens.push({ t: pdfText(part), st, col, sz, space: /^ +$/.test(part) });
      }
    }
    let line = [], w = 0, maxW = 0, x0 = 0, started = false, drawn = 0;
    const begin = () => {
      this.ensure(lineH);
      x0 = this.left + (o.indent || 0);
      maxW = this.availWidth(x0);
      started = true;
    };
    const draw = () => {
      while (line.length && line[line.length - 1].space) line.pop();
      if (!started) begin();
      if (this.bar) this.fillRect(PDF_MARGIN, this.y - lineH, 3, lineH, this.bar);
      const base = this.y - lineH * 0.76;
      let x = x0;
      for (const tk of line) {
        if (!tk.space) this.drawText(x, base, tk.t, tk.st, tk.sz, tk.col);
        x += tk.w;
      }
      this.y -= lineH;
      line = [];
      w = 0;
      started = false;
      drawn++;
    };
    for (const tk of tokens) {
      if (tk.nl) { draw(); continue; }
      if (tk.space && !line.length) continue;
      if (!started) begin();
      const tw = this.measure(tk.t, tk.st, tk.sz);
      if (!tk.space && w + tw > maxW && line.length) { draw(); begin(); }
      if (!tk.space && tw > maxW) {
        // mot trop long (adresse web…) : coupé sur plusieurs lignes
        let s = tk.t;
        while (s) {
          let n = s.length;
          while (n > 1 && this.measure(s.slice(0, n), tk.st, tk.sz) > maxW) n--;
          const piece = s.slice(0, n);
          s = s.slice(n);
          line.push(Object.assign({}, tk, { t: piece, w: this.measure(piece, tk.st, tk.sz) }));
          w += line[line.length - 1].w;
          if (s) { draw(); begin(); }
        }
        continue;
      }
      line.push(Object.assign({}, tk, { w: tw }));
      w += tw;
    }
    if (line.length || !drawn) draw();
  }

  rule(color) {
    this.ensure(4);
    this.fillRect(PDF_MARGIN, this.y - 1, PDF_PAGE_W - 2 * PDF_MARGIN, 0.8, color || '#cbd5e1');
    this.y -= 4;
  }

  addImage(jpeg) {
    const img = Object.assign({ key: 'Im' + (this.images.length + 1) }, jpeg);
    this.images.push(img);
    return img;
  }

  /* Image en haut à droite du bloc courant ; le texte qui suit la contourne. */
  floatImage(img, maxW, maxH) {
    const sc = Math.min(1, maxW / img.w, maxH / img.h);
    const w = img.w * sc, h = img.h * sc;
    this.ensure(h + 8);
    const x = PDF_PAGE_W - PDF_MARGIN - w;
    this.page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.y - h - 2).toFixed(2)} cm /${img.key} Do Q`);
    this.float = { bottom: this.y - h - 4, w: w + 10 };
  }

  /* Fin du bloc : on descend sous l'image si le texte était plus court. */
  clearFloat() {
    if (this.float && this.y > this.float.bottom) this.space(this.y - this.float.bottom);
    this.float = null;
  }

  async toBytes() {
    const enc = new TextEncoder();
    const n = { v: 0 };
    const ref = () => ++n.v;
    const catalog = ref(), pagesRef = ref();
    const fonts = {};
    for (const k of Object.keys(PDF_FONT)) fonts[k] = ref();
    const imgRefs = this.images.map(() => ref());
    const pageRefs = this.pages.map(() => [ref(), ref()]);
    const info = ref();

    const body = new Map();
    body.set(catalog, [`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`]);
    body.set(pagesRef, [`<< /Type /Pages /Kids [${pageRefs.map(p => p[0] + ' 0 R').join(' ')}] /Count ${this.pages.length} >>`]);
    for (const k of Object.keys(PDF_FONT)) {
      body.set(fonts[k], [`<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONT[k][1]} /Encoding /WinAnsiEncoding >>`]);
    }
    this.images.forEach((im, i) => body.set(imgRefs[i], [
      `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`,
      im.bytes, '\nendstream']));
    const resources = `<< /Font << ${Object.keys(PDF_FONT).map(k => `/${PDF_FONT[k][0]} ${fonts[k]} 0 R`).join(' ')} >>` +
      (this.images.length ? ` /XObject << ${this.images.map((im, i) => `/${im.key} ${imgRefs[i]} 0 R`).join(' ')} >>` : '') + ' >>';
    const total = this.pages.length;
    for (let i = 0; i < total; i++) {
      const p = this.pages[i];
      const label = pdfText((p.footer ? p.footer + ' — ' : '') + `page ${i + 1} / ${total}`);
      const fw = this.measure(label, 'r', 8);
      const ops = p.ops.concat(`BT /F1 8 Tf ${pdfColor('#9ca3af')} rg ${((PDF_PAGE_W - fw) / 2).toFixed(2)} ${(PDF_MARGIN - 18).toFixed(2)} Td ${pdfHex(label)} Tj ET`);
      const raw = enc.encode(ops.join('\n'));
      const packed = await pdfDeflate(raw);
      const data = packed || raw;
      body.set(pageRefs[i][0], [`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PDF_PAGE_W} ${PDF_PAGE_H}] /Resources ${resources} /Contents ${pageRefs[i][1]} 0 R >>`]);
      body.set(pageRefs[i][1], [`<< /Length ${data.length}${packed ? ' /Filter /FlateDecode' : ''} >>\nstream\n`, data, '\nendstream']);
    }
    const d = new Date(), pad = v => String(v).padStart(2, '0');
    const stamp = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    body.set(info, [`<< /Title ${pdfUtf16(this.title)} /Producer (Frise chronologique) /CreationDate (${stamp}) >>`]);

    const chunks = [];
    let pos = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    add('%PDF-1.4\n');
    add(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    const offsets = [];
    for (let k = 1; k <= n.v; k++) {
      offsets[k] = pos;
      add(`${k} 0 obj\n`);
      for (const part of body.get(k)) add(part);
      add('\nendobj\n');
    }
    const xref = pos;
    add(`xref\n0 ${n.v + 1}\n0000000000 65535 f \n`);
    for (let k = 1; k <= n.v; k++) add(String(offsets[k]).padStart(10, '0') + ' 00000 n \n');
    add(`trailer\n<< /Size ${n.v + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

/* Texte détaillé (déjà converti en HTML par mdToHtml) → blocs de texte mis en forme. */
function richBlocks(html) {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const inline = (node, st, out) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) { out.push({ text: ch.nodeValue.replace(/\s+/g, ' '), style: st }); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName;
      if (tag === 'BR') out.push({ text: '\n', style: st });
      else if (tag === 'STRONG' || tag === 'B') inline(ch, st.includes('i') ? 'bi' : 'b', out);
      else if (tag === 'EM' || tag === 'I') inline(ch, st.includes('b') ? 'bi' : 'i', out);
      else if (tag === 'A') {
        inline(ch, st, out);
        const href = ch.getAttribute('href') || '';
        if (href && ch.textContent.trim() !== href) out.push({ text: ` (${href})`, style: st, color: '#6b7280' });
      } else inline(ch, st, out);
    }
    return out;
  };
  const blocks = [];
  for (const el of body.children) {
    const tag = el.tagName;
    if (/^H\d$/.test(tag)) blocks.push({ kind: 'h', runs: inline(el, 'b', []) });
    else if (tag === 'UL' || tag === 'OL') {
      [...el.children].forEach((li, i) => blocks.push({
        kind: 'li', runs: [{ text: (tag === 'UL' ? '•' : (i + 1) + '.') + ' ', style: 'r' }].concat(inline(li, 'r', [])),
      }));
    } else if (tag === 'BLOCKQUOTE') blocks.push({ kind: 'quote', runs: inline(el, 'i', []) });
    else blocks.push({ kind: 'p', runs: inline(el, 'r', []) });
  }
  return blocks;
}

/* ---------- Fiche d'élève au format PDF ---------- */

async function pdfImage(pdf, dataURL, cache) {
  let jpeg = cache.get(dataURL);
  if (!jpeg) {
    try { jpeg = await pdfJpeg(dataURL); } catch (e) { jpeg = null; }
    cache.set(dataURL, jpeg);
  }
  if (!jpeg) return null;
  if (!pdf._imgs) pdf._imgs = new Map();
  if (!pdf._imgs.has(dataURL)) pdf._imgs.set(dataURL, pdf.addImage(jpeg));
  return pdf._imgs.get(dataURL);
}

async function pdfFrise(pdf, f, cache) {
  pdf.ensure(60);
  pdf.space(10);
  if (f.error) {
    pdf.paragraph([{ text: f.fileName, style: 'b' }], { size: 13 });
    pdf.paragraph([{ text: 'Impossible de lire ce fichier : ' + f.error, color: '#b91c1c' }]);
    return;
  }
  const { doc, images } = f.payload;
  const cats = new Map(doc.categories.map(c => [c.id, c]));
  const items = doc.items.slice().sort(compareItems);
  const nEv = items.filter(i => i.type !== 'period').length;
  const nImg = items.filter(i => i.imageId && images[i.imageId]).length;
  const nTxt = items.filter(i => (i.details || '').trim()).length;
  pdf.paragraph([
    { text: doc.title || 'Frise sans titre', style: 'b' },
    { text: '  — ' + f.fileName, size: 9.5, color: '#6b7280' },
  ], { size: 14, lineH: 19 });
  pdf.rule();
  const stats = `${plural(items.length, 'repère')} (${plural(nEv, 'événement')}, ${plural(items.length - nEv, 'période')}) · ${nImg} avec image · ${nTxt} avec texte`;
  pdf.paragraph([{ text: (doc.subtitle ? doc.subtitle + ' · ' : '') + stats, color: '#475569' }], { size: 9 });
  if (!items.length) pdf.paragraph([{ text: 'Aucun repère.', style: 'i', color: '#9ca3af' }]);
  const imgW = (PDF_PAGE_W - 2 * PDF_MARGIN) / 6;
  for (const it of items) {
    const cat = cats.get(it.categoryId);
    const color = it.color || (cat && cat.color) || '#64748b';
    const img = it.imageId && images[it.imageId] ? await pdfImage(pdf, images[it.imageId], cache) : null;
    pdf.ensure(img ? Math.min(img.h * Math.min(1, imgW / img.w), imgW * 1.4) + 12 : 36);
    pdf.space(6);
    pdf.bar = color;
    if (img) pdf.floatImage(img, imgW, imgW * 1.4);
    // date et titre sur la même ligne
    pdf.paragraph([
      { text: cap(itemDateText(it, false)), style: 'b', color, size: 10.5 },
      { text: '   ' },
      { text: it.title || 'Sans titre', style: 'b', size: 12 },
    ], { size: 12, lineH: 16 });
    if ((it.details || '').trim()) {
      for (const b of richBlocks(mdToHtml(it.details))) {
        if (b.kind === 'h') pdf.paragraph(b.runs, { size: 10.5 });
        else if (b.kind === 'li') pdf.paragraph(b.runs, { indent: 10 });
        else if (b.kind === 'quote') pdf.paragraph(b.runs, { indent: 12, color: '#374151' });
        else pdf.paragraph(b.runs);
        pdf.space(1.5);
      }
    }
    if (img && it.imageCaption) pdf.paragraph([{ text: 'Image : ' + it.imageCaption, style: 'i', color: '#6b7280' }], { size: 8 });
    if (it.link) pdf.paragraph([{ text: 'Lien : ' + it.link, color: '#475569' }], { size: 8 });
    pdf.clearFloat();
    pdf.bar = null;
  }
}

async function reportPdf(students, title, cache) {
  const pdf = new PdfWriter(title);
  for (let si = 0; si < students.length; si++) {
    const s = students[si];
    pdf.footer = s.name;
    if (si > 0) pdf.newPage();
    pdf.page.footer = s.name;
    const ok = s.frises.filter(f => !f.error).length;
    // nom, dossier et nombre de frises sur une seule ligne
    pdf.paragraph([
      { text: s.name, style: 'b', size: 22 },
      { text: `    Dossier « ${s.folder} » · ${plural(ok, 'frise')}`, color: '#6b7280', size: 10 },
    ], { size: 22, lineH: 28 });
    if (!s.frises.length) pdf.paragraph([{ text: 'Aucune frise dans ce dossier.', style: 'i', color: '#9ca3af' }]);
    for (const f of s.frises) await pdfFrise(pdf, f, cache);
  }
  return pdf.toBytes();
}
