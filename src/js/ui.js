/* ===== Interface : barre de titre, panneaux, fenêtre de modification, interactions ===== */

function renderAll() {
  document.body.classList.toggle('readonly', state.readonly);
  renderTitlebar();
  renderSaveStatus();
  renderWelcome();
  if (!$('#listpanel').hidden) renderList();
  if (!$('#details').hidden) renderDetails();
  for (const b of $$('[data-action=undo]')) b.disabled = !undoStack.length;
  for (const b of $$('[data-action=redo]')) b.disabled = !redoStack.length;
  $('#btn-quiz').classList.toggle('on', state.quiz);
  document.title = (state.dirty && !state.readonly ? '• ' : '') + (state.doc.title || 'Frise') + ' — Frise chronologique';
  requestRender();
}

/* ---------- Titre et légende ---------- */

function renderTitlebar() {
  const t = $('#doc-title'), s = $('#doc-subtitle');
  if (document.activeElement !== t) t.value = state.doc.title;
  if (document.activeElement !== s) s.value = state.doc.subtitle;
  t.readOnly = s.readOnly = state.readonly;
  s.hidden = state.readonly && !state.doc.subtitle;

  const counts = {};
  for (const it of state.doc.items) {
    const k = getCat(it.categoryId) ? it.categoryId : '';
    counts[k] = (counts[k] || 0) + 1;
  }
  const chip = (id, name, color, n) =>
    `<button class="chip${state.hiddenCats.has(id) ? ' off' : ''}" data-cat="${esc(id)}" title="Cliquer pour masquer ou afficher">` +
    `<span class="sw" style="background:${color}"></span>${esc(name)}${n ? ` <span class="n">${n}</span>` : ''}</button>`;
  let html = '';
  for (const c of state.doc.categories) {
    if (!counts[c.id] && (state.readonly || state.doc.items.length)) continue;
    html += chip(c.id, c.name, c.color, counts[c.id] || 0);
  }
  if (counts['']) html += chip('', 'Sans catégorie', '#64748b', counts['']);
  $('#legend').innerHTML = html;
}

function renderSaveStatus() {
  const el = $('#save-status');
  el.classList.toggle('dirty', state.dirty);
  if (!state.dirty && !state.fileName) { el.innerHTML = ''; return; }
  const name = state.fileName || '';
  el.innerHTML = `<span class="dot"></span><span>${state.dirty ? 'Non enregistré' : 'Enregistré'}</span>` +
    (name ? `<span class="fname">· ${esc(name)}</span>` : '');
  el.title = state.dirty
    ? 'Des modifications ne sont pas encore enregistrées dans un fichier (une copie de secours est gardée dans ce navigateur).'
    : 'Toutes les modifications sont enregistrées' + (name ? ' dans « ' + name + ' »' : '');
}

function renderWelcome() {
  const show = !state.readonly && state.doc.items.length === 0;
  $('#welcome').hidden = !show;
  $('.zoom-hint').hidden = show;
  if (show) renderRecents();
}

async function renderRecents() {
  let recent = [];
  try { recent = (await store.get('recent')) || []; } catch (e) { /* stockage indisponible */ }
  recent = recent.filter(r => r.id !== state.doc.id && r.count > 0).slice(0, 5);
  $('#recents').innerHTML = recent.length
    ? '<h3>Travaux récents sur cet ordinateur</h3>' + recent.map(r =>
      `<button class="recent" data-recent="${esc(r.id)}"><svg class="ic"><use href="#i-clock"/></svg>` +
      `<span class="t">${esc(r.title)}</span><span class="m">${plural(r.count, 'élément')} · ${fmtWhen(r.modifiedAt)}</span></button>`).join('')
    : '';
}

function showBanner(html, buttons) {
  const b = $('#banner');
  b.innerHTML = `<span>${html}</span><span class="spacer"></span>`;
  for (const [label, fn, primary] of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn sm' + (primary ? ' primary' : '');
    btn.textContent = label;
    btn.onclick = () => { b.hidden = true; if (fn) fn(); };
    b.appendChild(btn);
  }
  b.hidden = false;
  requestRender();
}

/* ---------- Panneau de détails ---------- */

function openDetails(id) {
  state.selectedId = id;
  $('#details').hidden = false;
  renderDetails();
  if (!$('#listpanel').hidden) renderList();
  requestRender();
}

function closeDetails() {
  state.selectedId = null;
  $('#details').hidden = true;
  if (!$('#listpanel').hidden) renderList();
  requestRender();
}

function renderDetails() {
  const it = getItem(state.selectedId);
  if (!it) { $('#details').hidden = true; return; }
  const list = sortedItems(true);
  const idx = list.findIndex(x => x.id === it.id);
  const color = itemColor(it);
  const cat = getCat(it.categoryId);
  const hide = state.quiz && !state.revealed.has(it.id);
  const dur = durationText(it);
  let h = `<div class="d-top">
    <button class="icon-btn" data-d="prev" title="Élément précédent (←)" ${idx <= 0 ? 'disabled' : ''}><svg class="ic"><use href="#i-left"/></svg></button>
    <button class="icon-btn" data-d="next" title="Élément suivant (→)" ${idx < 0 || idx >= list.length - 1 ? 'disabled' : ''}><svg class="ic"><use href="#i-right"/></svg></button>
    <span class="pos">${idx >= 0 ? (idx + 1) + ' / ' + list.length : ''}</span><span class="spacer"></span>
    <button class="icon-btn" data-d="close" title="Fermer (Échap)"><svg class="ic"><use href="#i-x"/></svg></button>
  </div>`;
  h += `<div class="d-head" style="--c:${color};--cbg:${mixHex(color, '#ffffff', 0.88)}">
    <div class="d-badges">${cat ? `<span class="badge cat">${esc(cat.name)}</span>` : ''}<span class="badge">${it.type === 'period' ? 'Période' : 'Événement'}</span></div>
    <h2>${hide ? '? ? ?' : esc(it.title || 'Sans titre')}</h2>
    <div class="d-date">${esc(cap(itemDateText(it, false)))}</div>
    <div class="d-meta">${esc(itemCenturyText(it))}${dur ? ' · Durée : ' + esc(dur) : ''}</div>
  </div><div class="d-body">`;
  if (hide) h += '<button class="btn primary reveal" data-d="reveal">Révéler la réponse</button>';
  if (hasImage(it.imageId)) {
    h += `<figure><img src="${esc(imageURL(it.imageId))}" alt="" data-d="zoom" title="Cliquer pour agrandir">` +
      (it.imageCaption && !hide ? `<figcaption>${esc(it.imageCaption)}</figcaption>` : '') + '</figure>';
  }
  if (!hide) {
    if (it.details && it.details.trim()) h += `<div class="rich">${mdToHtml(it.details)}</div>`;
    else if (!state.readonly) h += '<p class="muted">Pas encore de texte détaillé. Cliquez sur « Modifier » pour en écrire un.</p>';
    if (it.link) h += `<p><a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">En savoir plus ↗</a></p>`;
  }
  h += '</div>';
  if (!state.readonly) {
    h += `<div class="d-actions">
      <button class="btn primary" data-d="edit"><svg class="ic"><use href="#i-edit"/></svg>Modifier</button>
      <button class="btn" data-d="dup"><svg class="ic"><use href="#i-copy"/></svg>Dupliquer</button>
      <button class="btn danger" data-d="delete" title="Supprimer (Suppr)" style="margin-left:auto"><svg class="ic"><use href="#i-trash"/></svg></button>
    </div>`;
  }
  $('#details').innerHTML = h;
}

function navigate(dir) {
  const list = sortedItems(true);
  if (!list.length) return;
  let idx = list.findIndex(x => x.id === state.selectedId);
  idx = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : clamp(idx + dir, 0, list.length - 1);
  openDetails(list[idx].id);
  focusItem(list[idx]);
}

function deleteItem(id) {
  const it = getItem(id);
  if (!it) return;
  commit(d => { d.items = d.items.filter(i => i.id !== id); });
  closeDetails();
  toast(`« ${it.title || 'Sans titre'} » supprimé — Ctrl+Z pour annuler`, 4000);
}

function duplicateItem(id) {
  const it = getItem(id);
  if (!it) return;
  const copy = JSON.parse(JSON.stringify(it));
  copy.id = uid();
  copy.title = (it.title || '') + ' (copie)';
  commit(d => d.items.push(copy));
  openDetails(copy.id);
  openEditor(getItem(copy.id));
}

function bindDetails() {
  $('#details').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const id = state.selectedId;
    switch (b.dataset.d) {
      case 'prev': navigate(-1); break;
      case 'next': navigate(1); break;
      case 'close': closeDetails(); break;
      case 'reveal': state.revealed.add(id); renderDetails(); break;
      case 'zoom': {
        const it = getItem(id);
        openLightbox(imageURL(it.imageId), it.imageCaption);
        break;
      }
      case 'edit': openEditor(getItem(id)); break;
      case 'dup': duplicateItem(id); break;
      case 'delete': deleteItem(id); break;
    }
  });
}

function openLightbox(src, caption) {
  const lb = $('#lightbox');
  $('img', lb).src = src;
  $('.lb-caption', lb).textContent = caption || '';
  lb.hidden = false;
}

/* ---------- Liste et recherche ---------- */

function normText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toggleList(force) {
  const p = $('#listpanel');
  p.hidden = force !== undefined ? !force : !p.hidden;
  if (!p.hidden) { renderList(); $('#list-search').focus(); }
}

function renderList() {
  const q = normText($('#list-search').value.trim());
  const items = sortedItems(false).filter(it =>
    !q || normText(it.title + ' ' + it.details + ' ' + itemDateText(it, false)).includes(q));
  $('#list-items').innerHTML = items.length
    ? items.map(it => {
      const hide = state.quiz && !state.revealed.has(it.id);
      return `<button class="li${it.id === state.selectedId ? ' sel' : ''}" data-li="${esc(it.id)}"${isVisible(it) ? '' : ' style="opacity:.5"'}>` +
        `<span class="sw${it.type === 'period' ? ' bar' : ''}" style="background:${itemColor(it)}"></span>` +
        `<span class="dt">${esc(itemDateText(it, true))}</span><span class="tt">${hide ? '?' : esc(it.title || 'Sans titre')}</span></button>`;
    }).join('')
    : `<div class="li-empty">${state.doc.items.length ? 'Aucun résultat' : 'La frise est vide'}</div>`;
}

/* ---------- Fenêtre de modification ---------- */

let editing = null;
let lastCategoryId;

function edForm() { return $('#editor-form'); }

function fillMonthSelects() {
  for (const sel of [edForm().startM, edForm().endM]) {
    sel.innerHTML = '<option value="">Mois</option>' + MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  }
}

function setDateFields(which, d) {
  const f = edForm();
  f[which + 'D'].value = d && d.d ? d.d : '';
  f[which + 'M'].value = d && d.m ? d.m : '';
  f[which + 'Y'].value = d && d.y ? Math.abs(d.y) : '';
  f[which + 'BC'].checked = !!(d && d.y < 0);
}

function readDateFields(which, label) {
  const f = edForm();
  const raw = f[which + 'Y'].value.trim();
  if (!raw) throw new Error(`Indiquez l’année (${label}).`);
  let y = parseInt(raw, 10);
  if (!Number.isFinite(y)) throw new Error(`L’année (${label}) n’est pas un nombre.`);
  if (y === 0) throw new Error('Il n’y a pas d’année 0 : on passe directement de l’an 1 av. J.-C. à l’an 1.');
  if (f[which + 'BC'].checked && y > 0) y = -y;
  const m = parseInt(f[which + 'M'].value, 10) || null;
  const d = parseInt(f[which + 'D'].value, 10) || null;
  if (d && !m) throw new Error(`Choisissez le mois (${label}), ou effacez le jour.`);
  if (d && m) {
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    if (d < 1 || d > max) throw new Error(`Le jour (${label}) doit être compris entre 1 et ${max}.`);
  }
  return { y, m, d };
}

function editorType() { return edForm().querySelector('input[name=type]:checked').value; }

function updateEditorType() {
  const isPeriod = editorType() === 'period';
  $('fieldset[data-which=end]').hidden = !isPeriod;
  $('#lbl-start').textContent = isPeriod ? 'Début' : 'Date';
  if (!editing.id) $('#editor-title').textContent = isPeriod ? 'Nouvelle période' : 'Nouvel événement';
  edForm().title.placeholder = isPeriod ? 'Ex. : Première Guerre mondiale' : 'Ex. : Prise de la Bastille';
}

function renderEditorColors() {
  const c = editing.color;
  let h = `<button type="button" class="swatch auto${!c ? ' sel' : ''}" data-color="" title="Couleur de la catégorie"></button>`;
  for (const p of PALETTE) h += `<button type="button" class="swatch${c === p ? ' sel' : ''}" data-color="${p}" style="background:${p}" title="${p}"></button>`;
  h += `<input type="color" class="swatch-input" value="${c || '#2563eb'}" title="Autre couleur…">`;
  $('#editor-colors').innerHTML = h;
}

function updateImagePreview() {
  const has = hasImage(editing.imageId);
  $('#img-preview').hidden = !has;
  $('.img-empty').hidden = has;
  $('.img-tools').hidden = !has;
  if (has) $('#img-preview').src = imageURL(editing.imageId);
  else $('#img-preview').removeAttribute('src');
}

function showEditorError(msg) {
  const el = $('#editor-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function setMdPreview(on) {
  const f = edForm();
  const prev = $('.md-preview');
  if (on) prev.innerHTML = mdToHtml(f.details.value) || '<p class="muted">(rien à afficher)</p>';
  prev.hidden = !on;
  f.details.hidden = on;
  $('.md-preview-btn').classList.toggle('on', on);
}

function openEditor(item, preset) {
  if (state.readonly) return;
  const f = edForm();
  const it = item || Object.assign({
    type: 'event', title: '', start: null, end: null, approx: false,
    categoryId: lastCategoryId !== undefined ? lastCategoryId : null,
    color: null, imageId: null, imageCaption: '', details: '', link: '',
  }, preset || {});
  editing = { id: item ? item.id : null, imageId: it.imageId || null, color: it.color || null };
  f.querySelector(`input[name=type][value=${it.type === 'period' ? 'period' : 'event'}]`).checked = true;
  f.title.value = it.title || '';
  setDateFields('start', it.start);
  setDateFields('end', it.end);
  f.approx.checked = !!it.approx;
  f.category.innerHTML = '<option value="">Sans catégorie</option>' +
    state.doc.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  f.category.value = getCat(it.categoryId) ? it.categoryId : '';
  f.imageCaption.value = it.imageCaption || '';
  f.details.value = it.details || '';
  f.link.value = it.link || '';
  $('#editor-title').textContent = item ? 'Modifier' : '';
  $('#editor-delete').hidden = !item;
  updateEditorType();
  renderEditorColors();
  updateImagePreview();
  showEditorError('');
  setMdPreview(false);
  $('#editor').showModal();
  if (!item) f.title.focus();
}

async function setEditorImageFromFile(file) {
  try {
    showEditorError('');
    const dataURL = await processImageFile(file);
    editing.imageId = addImage(dataURL);
    updateImagePreview();
  } catch (e) {
    showEditorError(e.message);
  }
}

async function setEditorImageFromUrl(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    await setEditorImageFromFile(new File([blob], 'image', { type: blob.type }));
  } catch (e) {
    showEditorError('Impossible de récupérer cette image directement. Faites un clic droit sur l’image → « Copier l’image », puis Ctrl+V ici ; ou enregistrez-la sur l’ordinateur puis « Choisir un fichier ».');
  }
}

function submitEditor() {
  const f = edForm();
  try {
    const type = editorType();
    const title = f.title.value.trim();
    if (!title) throw new Error('Donnez un titre.');
    const start = readDateFields('start', type === 'period' ? 'début' : 'date');
    const end = type === 'period' ? readDateFields('end', 'fin') : null;
    if (end && dateToT(end) < dateToT(start)) throw new Error('La fin de la période doit être après son début.');
    const rawLink = f.link.value.trim();
    const link = safeUrl(rawLink);
    if (rawLink && !link) throw new Error('Le lien doit être une adresse web commençant par https://');
    const data = {
      type, title, start, end,
      approx: f.approx.checked,
      categoryId: f.category.value || null,
      color: editing.color,
      imageId: editing.imageId,
      imageCaption: f.imageCaption.value.trim(),
      details: f.details.value.replace(/\s+$/, ''),
      link,
    };
    let id = editing.id;
    if (id) commit(d => Object.assign(d.items.find(i => i.id === id), data));
    else { id = uid(); commit(d => d.items.push(Object.assign({ id }, data))); }
    lastCategoryId = data.categoryId;
    $('#editor').close();
    const it = getItem(id);
    const key = getCat(it.categoryId) ? it.categoryId : '';
    if (state.hiddenCats.delete(key)) renderAll();
    if (state.doc.items.length === 1) fitAll();
    else {
      const W = $('#scroller').clientWidth;
      const tL = screenToT(0), tR = screenToT(W - 120);
      if (itemEndT(it) < tL || itemStartT(it) > tR) focusItem(it);
    }
    if (!$('#details').hidden || editing.id) openDetails(id);
    else { state.selectedId = id; requestRender(); }
    if (!editing.id) toast(type === 'period' ? 'Période ajoutée' : 'Événement ajouté');
  } catch (e) {
    showEditorError(e.message);
  }
}

function mdApply(kind) {
  const ta = edForm().details;
  if (ta.hidden) setMdPreview(false);
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  const sel = v.slice(s, e);
  const insert = (text, a, b, selStart, selEnd) => {
    ta.focus();
    ta.setSelectionRange(a, b);
    if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, a, b, 'end');
    ta.setSelectionRange(selStart, selEnd);
  };
  const wrap = (before, after, placeholder) => {
    const t = sel || placeholder;
    insert(before + t + after, s, e, s + before.length, s + before.length + t.length);
  };
  const prefix = p => {
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(ls, e);
    const lines = block.split('\n');
    const all = lines.every(l => l.startsWith(p));
    const out = lines.map(l => all ? l.slice(p.length) : (l.startsWith(p) ? l : p + l)).join('\n');
    insert(out, ls, e, ls, ls + out.length);
  };
  switch (kind) {
    case 'bold': wrap('**', '**', 'texte en gras'); break;
    case 'italic': wrap('*', '*', 'texte en italique'); break;
    case 'underline': wrap('__', '__', 'texte souligné'); break;
    case 'h': prefix('## '); break;
    case 'list': prefix('- '); break;
    case 'quote': prefix('> '); break;
    case 'link': {
      const url = prompt('Adresse du lien :', 'https://');
      const safe = safeUrl(url);
      if (!safe) { if (url && url !== 'https://') alert('Adresse invalide : elle doit commencer par https://'); return; }
      wrap('[', '](' + safe + ')', 'texte du lien');
      break;
    }
    case 'preview': setMdPreview(!$('.md-preview-btn').classList.contains('on')); break;
  }
}

function bindEditor() {
  const f = edForm();
  fillMonthSelects();
  f.addEventListener('submit', e => { e.preventDefault(); submitEditor(); });
  for (const r of $$('input[name=type]', f)) r.addEventListener('change', updateEditorType);
  $('#editor-delete').addEventListener('click', () => {
    const id = editing.id;
    $('#editor').close();
    deleteItem(id);
  });
  $('#editor-colors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    editing.color = b.dataset.color || null;
    renderEditorColors();
  });
  $('#editor-colors').addEventListener('input', e => {
    if (e.target.type !== 'color') return;
    editing.color = normHex(e.target.value);
    for (const s of $$('.swatch', $('#editor-colors'))) s.classList.remove('sel');
  });
  f.category.addEventListener('change', () => { editing.color = null; renderEditorColors(); });
  for (const b of $$('[data-pick-image]', f)) {
    b.addEventListener('click', () => {
      const inp = $('#file-image');
      inp.value = '';
      inp.onchange = () => { if (inp.files[0]) setEditorImageFromFile(inp.files[0]); };
      inp.click();
    });
  }
  $('[data-remove-image]', f).addEventListener('click', () => { editing.imageId = null; updateImagePreview(); });
  const drop = $('#img-drop');
  drop.addEventListener('click', e => { if (!e.target.closest('button') && !hasImage(editing.imageId)) $('[data-pick-image]', f).click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('over');
    handleEditorDrop(e.dataTransfer);
  });
  $('.md-toolbar').addEventListener('click', e => {
    const b = e.target.closest('[data-md]');
    if (b) mdApply(b.dataset.md);
  });
  f.details.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'g') { e.preventDefault(); mdApply('bold'); }
    else if (k === 'i') { e.preventDefault(); mdApply('italic'); }
    else if (k === 'u') { e.preventDefault(); mdApply('underline'); }
  });
  f.title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitEditor(); } });
}

function handleEditorDrop(dt) {
  const file = [...(dt.files || [])].find(x => /^image\//.test(x.type));
  if (file) { setEditorImageFromFile(file); return; }
  const url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n')[0].trim();
  if (/^data:image\//.test(url)) { editing.imageId = addImage(url); updateImagePreview(); return; }
  if (/^https?:\/\//.test(url)) setEditorImageFromUrl(url);
}

/* ---------- Catégories ---------- */

function openCategories() {
  renderCategories();
  $('#dlg-categories').showModal();
}

function renderCategories() {
  const counts = {};
  for (const it of state.doc.items) counts[it.categoryId] = (counts[it.categoryId] || 0) + 1;
  $('#cat-list').innerHTML = state.doc.categories.map(c => `<div class="cat-row" data-cat-id="${esc(c.id)}">
      <input type="color" value="${c.color}" data-f="color" title="Changer la couleur">
      <input type="text" value="${esc(c.name)}" data-f="name" maxlength="80" aria-label="Nom de la catégorie">
      <span class="n">${plural(counts[c.id] || 0, 'élément')}</span>
      <button type="button" class="icon-btn" data-f="del" title="Supprimer la catégorie"><svg class="ic"><use href="#i-trash"/></svg></button>
    </div>`).join('') || '<p class="muted">Aucune catégorie.</p>';
}

function bindCategories() {
  const list = $('#cat-list');
  list.addEventListener('change', e => {
    const row = e.target.closest('[data-cat-id]');
    if (!row) return;
    const id = row.dataset.catId;
    const f = e.target.dataset.f;
    const val = e.target.value;
    if (f === 'color') commit(d => { d.categories.find(c => c.id === id).color = normHex(val) || '#64748b'; });
    if (f === 'name') commit(d => { d.categories.find(c => c.id === id).name = val.trim() || 'Catégorie'; });
  });
  list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f === 'name') e.target.blur(); });
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-f=del]');
    if (!b) return;
    const id = b.closest('[data-cat-id]').dataset.catId;
    const cat = getCat(id);
    const n = state.doc.items.filter(i => i.categoryId === id).length;
    if (n && !confirm(`Supprimer la catégorie « ${cat.name} » ?\nSes ${plural(n, 'élément')} passeront « Sans catégorie ».`)) return;
    commit(d => {
      d.categories = d.categories.filter(c => c.id !== id);
      for (const it of d.items) if (it.categoryId === id) it.categoryId = null;
    });
    state.hiddenCats.delete(id);
    renderCategories();
  });
  $('#cat-add').addEventListener('click', () => {
    const used = new Set(state.doc.categories.map(c => c.color));
    const color = PALETTE.find(p => !used.has(p)) || PALETTE[state.doc.categories.length % PALETTE.length];
    commit(d => d.categories.push({ id: uid(), name: 'Nouvelle catégorie', color }));
    renderCategories();
    const inputs = $$('#cat-list input[type=text]');
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.select(); }
  });
}

/* ---------- Réglages ---------- */

function openSettings() {
  const s = state.doc.settings;
  $('#set-images').checked = s.showImages;
  $('#set-centuries').checked = s.centuries;
  const sel = $('#set-textsize');
  sel.value = String(s.textSize);
  if (sel.value !== String(s.textSize)) sel.value = '1';
  $('#dlg-settings').showModal();
}

function bindSettings() {
  $('#set-images').addEventListener('change', e => commit(d => { d.settings.showImages = e.target.checked; }));
  $('#set-centuries').addEventListener('change', e => commit(d => { d.settings.centuries = e.target.checked; }));
  $('#set-textsize').addEventListener('change', e => commit(d => { d.settings.textSize = Number(e.target.value) || 1; }));
}

/* ---------- Interactions avec la frise ---------- */

function bindStage() {
  const host = $('#svg-host'), sc = $('#scroller');
  const pointers = new Map();
  let drag = null, pinch = null, lastTap = null;

  const pinchInfo = () => {
    const [p1, p2] = [...pointers.values()];
    const rect = host.getBoundingClientRect();
    return { cx: (p1.x + p2.x) / 2 - rect.left, d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1 };
  };

  host.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    closeMenus();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    if (pointers.size === 1) {
      const el = e.target.closest('[data-id]');
      drag = { x: e.clientX, y: e.clientY, t0: state.view.t0, st: sc.scrollTop, moved: false, id: el ? el.getAttribute('data-id') : null };
    } else if (pointers.size === 2) {
      const { cx, d } = pinchInfo();
      pinch = { d, scale: state.view.scale, t: screenToT(cx) };
      if (drag) drag.moved = true;
    }
  });

  host.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const { cx, d } = pinchInfo();
      state.view.scale = clamp(pinch.scale * d / pinch.d, MIN_SCALE, MAX_SCALE);
      state.view.t0 = pinch.t - (cx - PAD) / state.view.scale;
      requestRender();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; host.classList.add('dragging'); }
    if (drag.moved) {
      state.view.t0 = drag.t0 - dx / state.view.scale;
      sc.scrollTop = drag.st - dy;
      requestRender();
    }
  });

  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2 && pinch) {
      pinch = null;
      const rest = [...pointers.values()][0];
      if (rest) drag = { x: rest.x, y: rest.y, t0: state.view.t0, st: sc.scrollTop, moved: true, id: null };
    }
    if (pointers.size === 0) {
      host.classList.remove('dragging');
      if (drag && !drag.moved && e.type === 'pointerup') onTap(drag, e);
      drag = null;
    }
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  function onTap(d, e) {
    const now = Date.now();
    const isDouble = lastTap && now - lastTap.time < 450 && lastTap.id === d.id &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14;
    lastTap = isDouble ? null : { time: now, x: e.clientX, y: e.clientY, id: d.id };
    if (d.id) {
      if (isDouble && !state.readonly) openEditor(getItem(d.id));
      else if (!isDouble) openDetails(d.id);
      return;
    }
    if (isDouble && !state.readonly) {
      const rect = host.getBoundingClientRect();
      const t = screenToT(e.clientX - rect.left);
      const y = Math.floor(t) || 1;
      const below = lastRender && e.clientY - rect.top > lastRender.axisY;
      if (below) {
        const span = Math.max(1, Math.round(($('#scroller').clientWidth / state.view.scale) / 10));
        openEditor(null, { type: 'period', start: { y, m: null, d: null }, end: { y: y + span, m: null, d: null } });
      } else {
        openEditor(null, { type: 'event', start: { y, m: null, d: null } });
      }
    } else if (!isDouble) {
      closeDetails();
    }
  }

  host.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 30; dy *= 30; } else if (e.deltaMode === 2) { dx *= 300; dy *= 300; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (Math.abs(dx) > Math.abs(dy)) {
      state.view.t0 += dx / state.view.scale;
      requestRender();
    } else if (dy) {
      zoomAt(e.clientX - rect.left, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }
  }, { passive: false });

  if (window.ResizeObserver) new ResizeObserver(() => requestRender()).observe(sc);
  else window.addEventListener('resize', requestRender);
}

/* ---------- Menus, boutons, clavier ---------- */

function closeMenus() { for (const m of $$('.menu')) m.hidden = true; }

function toggleQuiz() {
  state.quiz = !state.quiz;
  state.revealed.clear();
  renderAll();
  toast(state.quiz
    ? 'Mode révision : les titres sont masqués. Cliquez sur un élément puis sur « Révéler ».'
    : 'Mode révision désactivé', 4000);
}

const actions = {
  new: () => newFrise(),
  open: () => openFrise(),
  importFC: () => importFriseChronos(),
  batchFC: () => batchConvertFriseChronos(),
  save: () => saveFrise(false),
  saveAs: () => saveFrise(true),
  merge: () => mergeFrise(),
  example: () => loadExample(),
  addEvent: () => openEditor(null, { type: 'event' }),
  addPeriod: () => openEditor(null, { type: 'period' }),
  undo: () => undo(),
  redo: () => redo(),
  zoomIn: () => zoomCenter(1.5),
  zoomOut: () => zoomCenter(1 / 1.5),
  fit: () => fitAll(),
  toggleList: () => toggleList(),
  categories: () => openCategories(),
  toggleQuiz: () => toggleQuiz(),
  settings: () => openSettings(),
  help: () => $('#dlg-help').showModal(),
  exportPngView: () => exportPNG(false),
  exportPngAll: () => exportPNG(true),
  exportHtmlRo: () => exportReadonlyHTML(),
  print: () => $('#dlg-print').showModal(),
  editCopy: () => editCopy(),
};

function bindGlobal() {
  document.addEventListener('click', e => {
    const mb = e.target.closest('[data-menu]');
    if (mb) {
      const menu = $('#' + mb.dataset.menu);
      const wasHidden = menu.hidden;
      closeMenus();
      menu.hidden = !wasHidden;
      return;
    }
    const a = e.target.closest('[data-action]');
    if (a) {
      closeMenus();
      const fn = actions[a.dataset.action];
      if (fn) fn();
      return;
    }
    if (!e.target.closest('.menu')) closeMenus();
    const c = e.target.closest('[data-close]');
    if (c) c.closest('dialog').close();
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      const id = chip.dataset.cat;
      if (state.hiddenCats.has(id)) state.hiddenCats.delete(id); else state.hiddenCats.add(id);
      if (state.selectedId && !isVisible(getItem(state.selectedId))) closeDetails();
      renderAll();
    }
    const rec = e.target.closest('[data-recent]');
    if (rec) resumeRecent(rec.dataset.recent);
    const li = e.target.closest('[data-li]');
    if (li) {
      const it = getItem(li.dataset.li);
      const key = getCat(it.categoryId) ? it.categoryId : '';
      if (state.hiddenCats.delete(key)) renderAll();
      openDetails(it.id);
      focusItem(it);
    }
  });

  // fermer une boîte de dialogue en cliquant à côté
  for (const d of $$('dialog')) {
    d.addEventListener('mousedown', e => { d._downOutside = e.target === d; });
    d.addEventListener('click', e => {
      if (e.target === d && d._downOutside && d.id !== 'editor') d.close();
    });
  }

  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
  $('#list-search').addEventListener('input', renderList);

  const title = $('#doc-title'), sub = $('#doc-subtitle');
  title.addEventListener('change', () => {
    const v = title.value.trim() || 'Frise sans titre';
    if (v !== state.doc.title) commit(d => { d.title = v; });
  });
  sub.addEventListener('change', () => {
    const v = sub.value.trim();
    if (v !== state.doc.subtitle) commit(d => { d.subtitle = v; });
  });
  for (const inp of [title, sub]) inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });

  $('#print-go').addEventListener('click', doPrint);
  window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });

  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); if (!state.readonly) saveFrise(e.shiftKey); return; }
    if (ctrl && k === 'o') { e.preventDefault(); openFrise(); return; }
    if (document.querySelector('dialog[open]')) return;
    if (!$('#lightbox').hidden) { if (e.key === 'Escape') $('#lightbox').hidden = true; return; }
    if (e.target.closest('input, textarea, select, [contenteditable]')) {
      if (e.key === 'Escape' && e.target.id === 'list-search') toggleList(false);
      return;
    }
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl || e.altKey) return;
    switch (e.key) {
      case '+': case '=': zoomCenter(1.5); break;
      case '-': case '_': zoomCenter(1 / 1.5); break;
      case '0': fitAll(); break;
      case 'ArrowLeft': navigate(-1); break;
      case 'ArrowRight': navigate(1); break;
      case 'Delete': if (state.selectedId && !state.readonly) deleteItem(state.selectedId); break;
      case 'Escape':
        if (!$('#details').hidden) closeDetails();
        else if (!$('#listpanel').hidden) toggleList(false);
        else closeMenus();
        break;
      case 'e': case 'E': if (!state.readonly) actions.addEvent(); break;
      case 'p': case 'P': if (!state.readonly) actions.addPeriod(); break;
      default: return;
    }
    e.preventDefault();
  });

  document.addEventListener('paste', e => {
    if (!$('#editor').open) return;
    const items = [...((e.clipboardData && e.clipboardData.items) || [])];
    const img = items.find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (!img) return;
    e.preventDefault();
    setEditorImageFromFile(img.getAsFile());
  });

  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].some(t => t === 'Files' || t === 'text/uri-list');
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if ($('#editor').open) { handleEditorDrop(e.dataTransfer); return; }
    if (document.querySelector('dialog[open]')) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (/^image\//.test(file.type)) {
      if (state.readonly) return;
      openEditor(null, { type: 'event' });
      setEditorImageFromFile(file);
    } else {
      openFromFileObject(file, null, false);
    }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty && !state.readonly && state.doc.items.length) {
      autosaveNow();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
