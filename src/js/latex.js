/* ===== Fiches d'élève au format LaTeX =====
   Produit un dossier « latex » : un .tex par élève, un .tex pour toute la classe
   et un sous-dossier « images ». À compiler avec pdflatex (ou dans Overleaf). */

const TEX_ESC = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', '$': '\\$',
  '#': '\\#', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
};

function texEsc(s) {
  return String(s == null ? '' : s)
    .replace(/[\\{}&%$#_^~]/g, c => TEX_ESC[c])
    .replace(/[\u00A0\u202F\u2009\u2007]/g, '~')
    .replace(/[\u2010\u2011]/g, '-')
    // caractères que pdflatex ne connaît pas (émojis, autres alphabets…)
    .replace(/[^\t\n\x20-\x7E\u00A0-\u017F\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u20AC\u00AB\u00BB]/gu, '?');
}

function texUrl(u) { return String(u).replace(/[\\%#]/g, '\\$&'); }

function texColor(hex) { return (normHex(hex) || '#64748b').slice(1).toUpperCase(); }

function texSlug(s) {
  return safeFileName(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'eleve';
}

function texRich(html) {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const inline = node => [...node.childNodes].map(ch => {
    if (ch.nodeType === 3) return texEsc(ch.nodeValue.replace(/\s+/g, ' '));
    if (ch.nodeType !== 1) return '';
    switch (ch.tagName) {
      case 'BR': return '\\newline\n';
      case 'STRONG': case 'B': return `\\textbf{${inline(ch)}}`;
      case 'EM': case 'I': return `\\emph{${inline(ch)}}`;
      case 'U': return `\\underline{${inline(ch)}}`;
      case 'A': return `\\href{${texUrl(ch.getAttribute('href') || '')}}{${inline(ch)}}`;
      default: return inline(ch);
    }
  }).join('');
  let out = '';
  for (const el of body.children) {
    const tag = el.tagName;
    if (/^H\d$/.test(tag)) out += `\\textbf{${inline(el)}}\\par\n`;
    else if (tag === 'UL' || tag === 'OL') {
      const env = tag === 'UL' ? 'itemize' : 'enumerate';
      out += `\\begin{${env}}\n` + [...el.children].map(li => `  \\item ${inline(li)}\n`).join('') + `\\end{${env}}\n`;
    } else if (tag === 'BLOCKQUOTE') out += `\\begin{quote}\\itshape ${inline(el)}\\end{quote}\n`;
    else out += inline(el) + '\n\n';
  }
  return out;
}

/* Image → fichier utilisable par pdflatex (JPEG ou PNG). */
async function texImageFile(dataURL) {
  const m = dataURL.match(/^data:image\/(jpeg|jpg|png);base64,(.*)$/i);
  if (m) return { ext: m[1].toLowerCase() === 'png' ? 'png' : 'jpg', bytes: base64ToBytes(m[2]) };
  const img = await loadImage(dataURL);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 300;
  c.height = img.naturalHeight || 200;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { ext: 'png', bytes: base64ToBytes(c.toDataURL('image/png').split(',')[1]) };
}

const TEX_PREAMBLE = `\\documentclass[11pt,a4paper]{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[french]{babel}
\\usepackage{lmodern}
\\usepackage[margin=1cm,includefoot]{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage[hidelinks]{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{2pt}
% Fiches de N pages (ou d'un multiple de N) pour l'impression recto-verso
\\newcounter{debutfiche}\\newcounter{pagesfiche}
\\newcommand{\\debutfiche}{\\setcounter{debutfiche}{\\value{page}}}
\\newcommand{\\finfiche}[1]{\\clearpage
  \\setcounter{pagesfiche}{\\value{page}}\\addtocounter{pagesfiche}{-\\value{debutfiche}}%
  \\loop\\ifnum\\value{pagesfiche}>#1 \\addtocounter{pagesfiche}{-#1}\\repeat
  \\loop\\ifnum\\value{pagesfiche}<#1 \\null\\thispagestyle{empty}\\clearpage\\stepcounter{pagesfiche}\\repeat}
\\pagestyle{plain}
`;

async function texStudent(s, images) {
  // nom, dossier et nombre de frises sur une seule ligne
  let t = `\\noindent{\\Large\\bfseries ${texEsc(s.name)}}\\quad` +
    `{\\small\\color{gray} Dossier « ${texEsc(s.folder)} » · ${plural(s.frises.filter(f => !f.error).length, 'frise')}}\\par\n`;
  if (!s.frises.length) t += '\\emph{Aucune frise dans ce dossier.}\\par\n';
  let n = 0;
  for (const f of s.frises) {
    t += '\n\\medskip\n';
    if (f.error) {
      t += `\\noindent{\\large\\bfseries ${texEsc(f.fileName)}}\\par\n{\\color{red} Impossible de lire ce fichier : ${texEsc(f.error)}}\\par\n`;
      continue;
    }
    const { doc } = f.payload;
    const cats = new Map(doc.categories.map(c => [c.id, c]));
    const items = doc.items.slice().sort(compareItems);
    const nEv = items.filter(i => i.type !== 'period').length;
    const nImg = items.filter(i => i.imageId && f.payload.images[i.imageId]).length;
    const nTxt = items.filter(i => (i.details || '').trim()).length;
    t += `\\noindent{\\large\\bfseries ${texEsc(doc.title || 'Frise sans titre')}} {\\small\\color{gray} --- ${texEsc(f.fileName)}}\\par\\vspace{-2pt}\\hrule\\vspace{2pt}\n`;
    t += `{\\small\\color{gray} ${doc.subtitle ? texEsc(doc.subtitle) + ' · ' : ''}${plural(items.length, 'repère')} (${plural(nEv, 'événement')}, ${plural(items.length - nEv, 'période')}) · ${nImg} avec image · ${nTxt} avec texte}\\par\n`;
    if (!items.length) t += '\\emph{Aucun repère.}\\par\n';
    for (const it of items) {
      const cat = cats.get(it.categoryId);
      const col = texColor(it.color || (cat && cat.color));
      // date et titre sur la même ligne
      let block = `\\noindent{\\color[HTML]{${col}}\\rule[-0.2em]{3pt}{1.1em}}\\enspace` +
        `{\\color[HTML]{${col}}\\bfseries ${texEsc(cap(itemDateText(it, false)))}}\\enspace\\textbf{\\large ${texEsc(it.title || 'Sans titre')}}\\par\n`;
      if ((it.details || '').trim()) block += texRich(mdToHtml(it.details));
      let img = '';
      const data = it.imageId && f.payload.images[it.imageId];
      if (data) {
        try {
          const file = await texImageFile(data);
          const name = `images/${texSlug(s.name)}-${String(++n).padStart(2, '0')}.${file.ext}`;
          images.push({ name: 'latex/' + name, data: file.bytes });
          img = `\\includegraphics[width=\\linewidth,height=1.4\\linewidth,keepaspectratio]{${name}}`;
        } catch (e) { /* image illisible : ignorée */ }
        if (img && it.imageCaption) block += `{\\footnotesize\\itshape\\color{gray} Image : ${texEsc(it.imageCaption)}}\\par\n`;
      }
      if (it.link) block += `{\\footnotesize Lien : \\href{${texUrl(it.link)}}{${texEsc(it.link)}}}\\par\n`;
      t += '\n\\smallskip\n';
      // image à droite, limitée à 1/6 de la largeur
      t += img
        ? `\\noindent\\begin{minipage}[t]{0.80\\linewidth}\\vspace{0pt}\n${block}\\end{minipage}\\hfill` +
          `\\begin{minipage}[t]{0.1667\\linewidth}\\vspace{0pt}\n${img}\n\\end{minipage}\\par\n`
        : block;
    }
  }
  return t;
}

async function reportLatex(students, minPages) {
  const per = Math.max(1, Math.floor(minPages) || 1);
  const wrap = body => `\\debutfiche\n${body}\\finfiche{${per}}\n`;
  const files = [], images = [];
  const bodies = [];
  for (const s of students) {
    const body = await texStudent(s, images);
    bodies.push(body);
    files.push({
      name: `latex/fiche-${texSlug(s.base.replace(/^Fiche - /, ''))}.tex`,
      data: TEX_PREAMBLE + `\\title{${texEsc(s.name)}}\n\\begin{document}\n` + wrap(body) + '\\end{document}\n',
    });
  }
  if (students.length > 1) {
    files.push({
      name: 'latex/toutes-les-fiches.tex',
      data: TEX_PREAMBLE + '\\begin{document}\n' + bodies.map(wrap).join('\n') + '\\end{document}\n',
    });
  }
  files.push({
    name: 'latex/LISEZMOI.txt',
    data: 'Fiches d’évaluation au format LaTeX.\r\n\r\n' +
      'Compilez chaque fichier .tex avec pdflatex (par exemple : pdflatex fiche-dupont.tex),\r\n' +
      'ou importez tout ce dossier « latex » (avec le sous-dossier « images ») dans Overleaf.\r\n',
  });
  return files.concat(images);
}
