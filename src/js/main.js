/* ===== Démarrage ===== */

function readEmbeddedPayload() {
  const el = $('#frise-data');
  const text = el ? el.textContent.trim() : '';
  if (!text) return null;
  try {
    return sanitizePayload(JSON.parse(text));
  } catch (e) {
    console.error(e);
    alert('Les données de cette frise sont endommagées et n’ont pas pu être chargées.');
    return null;
  }
}

function init() {
  bindGlobal();
  bindStage();
  bindDetails();
  bindEditor();
  bindCategories();
  bindSettings();

  const p = readEmbeddedPayload();
  if (p) {
    loadPayload(p);
    let fn = '';
    try { fn = decodeURIComponent(location.pathname.split('/').pop() || ''); } catch (e) { /* ignoré */ }
    state.fileName = /\.html?$/i.test(fn) ? fn : null;
    if (!p.readonly) checkNewerAutosave(p);
  }
  renderAll();
  fitAll();
}

init();
