/* ===== Mise en page et dessin de la frise (SVG) ===== */

const PAD = 40;      // marge gauche : position de t0 à l'écran
const ANCHOR = 14;   // décalage entre le bord gauche d'une carte et sa tige

const MIN_SCALE = 1e-7;      // pixels par année
const MAX_SCALE = 372 * 60;  // ≈ 60 px par jour

function metrics() {
  const k = state.doc.settings.textSize || 1;
  const f = (w, s) => `${w ? w + ' ' : ''}${(s * k).toFixed(1)}px ${FONT}`;
  return {
    k,
    titleFont: f(600, 13), titleSize: 13 * k,
    dateFont: f('', 11.5), dateSize: 11.5 * k,
    periodFont: f(600, 12.5), periodSize: 12.5 * k,
    tickFont: f(600, 12), tickSize: 12 * k,
    centFont: f('', 11.5), centSize: 11.5 * k,
    legendFont: f('', 13),
    lineH: Math.round(16.5 * k), dateH: Math.round(15 * k),
    padX: 8, padY: 6,
    thumb: Math.round(46 * k),
    maxTextW: Math.round(170 * k),
    cardGap: 10, laneGap: 8, stemMin: 18,
    barH: Math.round(24 * k), barGap: 6,
    ticksH: Math.round(26 * k), centH: Math.round(20 * k),
  };
}

/* Calcule les positions (en pixels « absolus » : t × échelle) et répartit
   les éléments sur des lignes pour qu'ils ne se chevauchent pas. */
function computeLayout(scale, quiz) {
  const m = metrics();
  const showImg = state.doc.settings.showImages;
  const events = [], periods = [];
  const evRight = [], evH = [], peRight = [];

  for (const it of sortedItems(true)) {
    const title = quiz ? '?' : (it.title || 'Sans titre');
    const img = showImg && hasImage(it.imageId);
    if (it.type === 'period') {
      const x1 = itemStartT(it) * scale;
      let x2 = itemEndT(it) * scale;
      if (x2 - x1 < 6) x2 = x1 + 6;
      const imgW = img ? m.barH - 4 : 0;
      const label = ellipsize(title, m.periodFont, 280 * m.k);
      const labelW = textWidth(label, m.periodFont);
      const contentW = (img ? imgW + 6 : 0) + labelW + 16;
      const inside = x2 - x1 >= contentW;
      const right = inside ? x2 : x2 + 4 + contentW;
      let lane = peRight.findIndex(r => r + 8 <= x1);
      if (lane < 0) { lane = peRight.length; peRight.push(0); }
      peRight[lane] = right;
      periods.push({ it, x1, x2, lane, inside, label, labelW, img, imgW, contentW, right });
    } else {
      const x = itemStartT(it) * scale;
      const date = itemDateText(it, true);
      const lines = wrapText(title, m.titleFont, m.maxTextW, 3);
      const tw = Math.max(textWidth(date, m.dateFont), ...lines.map(l => textWidth(l, m.titleFont)));
      const textW = Math.ceil(Math.min(m.maxTextW, tw));
      const w = m.padX * 2 + textW + (img ? m.thumb + m.padX : 0);
      const h = Math.max(img ? m.thumb + m.padY * 2 : 0, lines.length * m.lineH + m.dateH + m.padY * 2);
      const left = x - ANCHOR;
      let lane = evRight.findIndex(r => r + m.cardGap <= left);
      if (lane < 0) { lane = evRight.length; evRight.push(0); evH.push(0); }
      evRight[lane] = left + w;
      evH[lane] = Math.max(evH[lane], h);
      events.push({ it, x, left, w, h, lane, lines, date, img, textW });
    }
  }

  const laneBottom = [];
  let acc = m.stemMin;
  for (let i = 0; i < evH.length; i++) { laneBottom.push(acc); acc += evH[i] + m.laneGap; }
  const topH = evH.length ? acc - m.laneGap + 16 : 24;
  const bottomH = peRight.length ? 14 + peRight.length * (m.barH + m.barGap) + 16 : 24;
  return { m, events, periods, laneBottom, topH, bottomH, scale };
}

let layoutCache = null;
function getLayout(scale) {
  const key = [scale, state.version, state.quiz, [...state.hiddenCats].join(',')].join('|');
  if (layoutCache && layoutCache.key === key) return layoutCache.L;
  const L = computeLayout(scale, state.quiz);
  layoutCache = { key, L };
  return L;
}

/* ---------- Graduations ---------- */

const YEAR_STEPS = (() => {
  const s = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  for (let e = 3; e <= 10; e++) for (const k of [1, 2, 2.5, 5]) s.push(k * Math.pow(10, e));
  return s;
})();

function chooseStep(tL, tR, scale, m) {
  if (scale / 12 >= 46 * m.k) return 1 / 12;
  if (scale / 4 >= 52 * m.k) return 3 / 12;
  if (scale / 2 >= 52 * m.k) return 6 / 12;
  const big = Math.abs(tL) > Math.abs(tR) ? tL : tR;
  const sample = fmtYear(Math.round(big) || 1);
  const minPx = Math.max(56 * m.k, textWidth(sample, m.tickFont) + 18);
  for (const s of YEAR_STEPS) if (s * scale >= minPx) return s;
  return YEAR_STEPS[YEAR_STEPS.length - 1];
}

function minorStep(s) {
  if (s < 1) return null;
  if (s === 1) return 3 / 12;
  const e = Math.pow(10, Math.floor(Math.log10(s)));
  const lead = Math.round(s / e * 10) / 10;
  return lead === 2 ? s / 4 : s / 5;
}

function tickLabel(t, step) {
  if (step < 1) {
    const mi = Math.round(t * 12);
    const y = Math.floor(mi / 12), mo = mi - y * 12;
    return mo === 0 ? { text: y === 0 ? '0' : fmtYear(y), strong: true } : { text: MONTHS_SHORT[mo], strong: false };
  }
  const y = Math.round(t);
  return { text: y === 0 ? '0' : fmtYear(y), strong: true };
}

function bandLabel(n, bc, unit, avail, m) {
  const o = ordinal(n);
  const av = bc ? ' av. J.-C.' : '';
  const variants = unit === 100
    ? [o + ' siècle' + av, o + ' s.' + av, bc ? o + ' s. av.' : null, o]
    : [o + ' millénaire' + av, o + ' mill.' + av, bc ? o + ' mill. av.' : null, o];
  for (const v of variants) if (v && textWidth(v, m.centFont) <= avail) return v;
  return null;
}

/* ---------- Dessin ---------- */

/* o : { width, minHeight, t0, scale, L, selectedId, imgHref, header, background } */
function buildSVG(o) {
  const { L, width, t0, scale } = o;
  const m = L.m;
  const doc = state.doc;
  const off = PAD - t0 * scale;              // x écran = x absolu + off
  const visL = -60, visR = width + 60;
  const tL = t0 - PAD / scale, tR = t0 + (width - PAD) / scale;
  const showCent = doc.settings.centuries;
  const clips = [];
  let clipN = 0;
  const clip = (x, y, w, h, r) => {
    const id = 'cp' + (++clipN);
    clips.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`);
    return id;
  };

  /* En-tête (export et impression) */
  let header = '', headerH = 0;
  if (o.header) {
    let y = Math.round(34 * m.k);
    header += `<text x="${PAD}" y="${y}" font-size="${(24 * m.k).toFixed(1)}" font-weight="700" fill="#111827">${esc(doc.title)}</text>`;
    if (doc.subtitle) {
      y += Math.round(22 * m.k);
      header += `<text x="${PAD}" y="${y}" font-size="${(14 * m.k).toFixed(1)}" fill="#6b7280">${esc(doc.subtitle)}</text>`;
    }
    const counts = {};
    for (const it of doc.items) if (isVisible(it)) counts[it.categoryId] = (counts[it.categoryId] || 0) + 1;
    const used = doc.categories.filter(c => counts[c.id]);
    if (used.length) {
      y += Math.round(28 * m.k);
      let x = PAD;
      for (const c of used) {
        const w = textWidth(c.name, m.legendFont) + 34;
        if (x + w > width - PAD && x > PAD) { x = PAD; y += Math.round(22 * m.k); }
        header += `<circle cx="${x + 6}" cy="${y - 4 * m.k}" r="${6 * m.k}" fill="${c.color}"/>` +
          `<text x="${x + 17}" y="${y}" font-size="${(13 * m.k).toFixed(1)}" fill="#374151">${esc(c.name)}</text>`;
        x += w;
      }
    }
    headerH = y + Math.round(20 * m.k);
  }

  const axisH = m.ticksH + (showCent ? m.centH : 0);
  const contentH = headerH + L.topH + axisH + L.bottomH;
  const height = Math.ceil(Math.max(o.minHeight || 0, contentH));
  const axisY = Math.round(headerH + L.topH + (height - contentH) / 2);
  const axisB = axisY + axisH;

  /* Graduations */
  const step = chooseStep(tL, tR, scale, m);
  let grid = '', ticks = '';
  const i0 = Math.ceil(tL / step), i1 = Math.floor(tR / step);
  for (let i = i0; i <= i1 && i - i0 < 3000; i++) {
    const t = i * step;
    const x = +(t * scale + off).toFixed(1);
    const lab = tickLabel(t, step);
    grid += `<line x1="${x}" y1="${headerH}" x2="${x}" y2="${height}" stroke="${lab.strong ? '#e8eaee' : '#f1f2f4'}"/>`;
    ticks += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 7}" stroke="#94a3b8" stroke-width="1.5"/>` +
      `<text x="${x}" y="${axisY + m.ticksH * 0.7}" text-anchor="middle" font-size="${m.tickSize.toFixed(1)}" font-weight="${lab.strong ? 600 : 400}" fill="${lab.strong ? '#ffffff' : '#cbd5e1'}">${esc(lab.text)}</text>`;
  }
  const minor = minorStep(step);
  if (minor && minor * scale >= 7) {
    const j0 = Math.ceil(tL / minor), j1 = Math.floor(tR / minor);
    for (let j = j0; j <= j1 && j - j0 < 6000; j++) {
      const t = j * minor;
      if (Math.abs(t / step - Math.round(t / step)) < 1e-6) continue;
      const x = +(t * scale + off).toFixed(1);
      ticks += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 4}" stroke="#64748b"/>`;
    }
  }

  /* Bande des siècles / millénaires */
  let bands = '';
  if (showCent) {
    const unit = 100 * scale >= 60 ? 100 : (1000 * scale >= 60 ? 1000 : 0);
    const by = axisY + m.ticksH;
    bands += `<rect x="0" y="${by}" width="${width}" height="${m.centH}" fill="#e2e8f0"/>`;
    if (unit) {
      const k0 = Math.floor(tL / unit), k1 = Math.floor(tR / unit);
      for (let k = k0; k <= k1 && k - k0 < 400; k++) {
        const bx1 = k * unit * scale + off, bx2 = (k + 1) * unit * scale + off;
        const vx1 = Math.max(bx1, 0), vx2 = Math.min(bx2, width);
        if (k % 2 === 0) bands += `<rect x="${vx1.toFixed(1)}" y="${by}" width="${(vx2 - vx1).toFixed(1)}" height="${m.centH}" fill="#f1f5f9"/>`;
        bands += `<line x1="${bx1.toFixed(1)}" y1="${by}" x2="${bx1.toFixed(1)}" y2="${by + m.centH}" stroke="#cbd5e1"/>`;
        const n = k >= 0 ? k + 1 : -k;
        const label = bandLabel(n, k < 0, unit, vx2 - vx1 - 12, m);
        if (label) bands += `<text x="${((vx1 + vx2) / 2).toFixed(1)}" y="${by + m.centH * 0.7}" text-anchor="middle" font-size="${m.centSize.toFixed(1)}" fill="#475569">${esc(label)}</text>`;
      }
    }
  }

  /* Périodes (sous l'axe) */
  let under = '', periods = '';
  const pTop0 = axisB + 14;
  for (const p of L.periods) {
    const sx1 = p.x1 + off, sx2 = p.x2 + off;
    if (p.right + off < visL || sx1 > visR) continue;
    const it = p.it;
    const y = pTop0 + p.lane * (m.barH + m.barGap);
    const color = itemColor(it);
    const sel = it.id === o.selectedId;
    const dx1 = Math.max(sx1, -20), dx2 = Math.min(sx2, width + 20);
    if (sel) {
      under += `<rect x="${dx1.toFixed(1)}" y="${axisY}" width="${(dx2 - dx1).toFixed(1)}" height="${y + m.barH - axisY}" fill="${color}" opacity="0.12"/>`;
    }
    let g = `<g class="item period${sel ? ' sel' : ''}" data-id="${esc(it.id)}">`;
    g += `<rect class="bar" x="${dx1.toFixed(1)}" y="${y}" width="${Math.max(2, dx2 - dx1).toFixed(1)}" height="${m.barH}" rx="5" fill="${color}"/>`;
    let cx, fg;
    if (p.inside) {
      fg = textOn(color);
      cx = clamp(Math.max(sx1, 0) + 8, sx1 + 8, sx2 - p.contentW + 8);
    } else {
      fg = mixHex(color, '#000000', 0.35);
      cx = sx2 + 8;
      g += `<rect x="${(sx2 + 2).toFixed(1)}" y="${y}" width="${p.contentW}" height="${m.barH}" fill="transparent"/>`;
    }
    if (p.img) {
      const iy = y + 2, cid = clip(cx.toFixed(1), iy, p.imgW, p.imgW, 4);
      g += `<image href="${esc(o.imgHref(it.imageId))}" x="${cx.toFixed(1)}" y="${iy}" width="${p.imgW}" height="${p.imgW}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
      cx += p.imgW + 6;
    }
    g += `<text x="${cx.toFixed(1)}" y="${(y + m.barH / 2 + m.periodSize * 0.36).toFixed(1)}" font-size="${m.periodSize.toFixed(1)}" font-weight="600" fill="${fg}">${esc(p.label)}</text>`;
    g += '</g>';
    periods += g;
  }

  /* Événements (au-dessus de l'axe) */
  let stems = '', cards = '', dots = '';
  for (const e of L.events) {
    const sx = e.x + off, left = e.left + off;
    if (left + e.w < visL || left > visR) continue;
    const it = e.it;
    const color = itemColor(it);
    const sel = it.id === o.selectedId;
    const bottom = axisY - L.laneBottom[e.lane];
    const top = bottom - e.h;
    const fx = sx.toFixed(1);
    stems += `<line x1="${fx}" y1="${bottom}" x2="${fx}" y2="${axisY}" stroke="${color}" stroke-width="${sel ? 2.5 : 1.5}"/>`;
    dots += `<circle class="item" data-id="${esc(it.id)}" cx="${fx}" cy="${axisY}" r="${sel ? 6.5 : 5}" fill="${color}" stroke="#fff" stroke-width="2"/>`;
    let g = `<g class="item event${sel ? ' sel' : ''}" data-id="${esc(it.id)}">`;
    g += `<rect class="card" x="${left.toFixed(1)}" y="${top}" width="${e.w}" height="${e.h}" rx="7" fill="${mixHex(color, '#ffffff', 0.9)}" stroke="${color}"/>`;
    let tx = left + m.padX;
    if (e.img) {
      const ix = tx.toFixed(1), iy = top + m.padY;
      const cid = clip(ix, iy, m.thumb, m.thumb, 5);
      g += `<image href="${esc(o.imgHref(it.imageId))}" x="${ix}" y="${iy}" width="${m.thumb}" height="${m.thumb}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
      tx += m.thumb + m.padX;
    }
    const ftx = tx.toFixed(1);
    e.lines.forEach((line, i) => {
      g += `<text x="${ftx}" y="${(top + m.padY + i * m.lineH + m.lineH * 0.78).toFixed(1)}" font-size="${m.titleSize.toFixed(1)}" font-weight="600" fill="#111827">${esc(line)}</text>`;
    });
    g += `<text x="${ftx}" y="${(top + m.padY + e.lines.length * m.lineH + m.dateH * 0.8).toFixed(1)}" font-size="${m.dateSize.toFixed(1)}" fill="${mixHex(color, '#000000', 0.3)}">${esc(e.date)}</text>`;
    g += '</g>';
    cards += g;
  }

  const axis = `<rect x="0" y="${axisY}" width="${width}" height="${m.ticksH}" fill="#1e293b"/>` + ticks + bands;

  const style = `<style>
text{font-family:${FONT}}
.item{cursor:pointer}
.event:hover .card{stroke-width:2}
.event.sel .card{stroke-width:2.5;filter:drop-shadow(0 3px 6px rgba(0,0,0,.2))}
.period:hover .bar{filter:brightness(1.1)}
.period.sel .bar{stroke:#0f172a;stroke-width:2}
</style>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    style +
    `<rect width="${width}" height="${height}" fill="${o.background || '#fbfbfc'}"/>` +
    `<defs>${clips.join('')}</defs>` +
    grid + under + periods + stems + cards + axis + dots + header +
    '</svg>';
  return { svg, height, axisY, headerH };
}

/* ---------- Rendu à l'écran ---------- */

let renderQueued = false;
let lastRender = null;

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderTimeline(); });
}

function renderTimeline() {
  const sc = $('#scroller');
  const width = sc.clientWidth;
  if (!width) return;
  const L = getLayout(state.view.scale);
  lastRender = buildSVG({
    width, minHeight: sc.clientHeight, t0: state.view.t0, scale: state.view.scale, L,
    selectedId: state.selectedId, imgHref: imageURL,
  });
  $('#svg-host').innerHTML = lastRender.svg;
}

function screenToT(x) { return state.view.t0 + (x - PAD) / state.view.scale; }

function zoomAt(px, factor) {
  const v = state.view;
  const t = screenToT(px);
  v.scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  v.t0 = t - (px - PAD) / v.scale;
  requestRender();
}

function zoomCenter(factor) { zoomAt($('#scroller').clientWidth / 2, factor); }

function itemsExtent(items) {
  let a = Infinity, b = -Infinity;
  for (const it of items) { a = Math.min(a, itemStartT(it)); b = Math.max(b, itemEndT(it)); }
  return [a, b];
}

function fitAll() {
  const sc = $('#scroller');
  const W = Math.max(300, sc.clientWidth);
  const items = sortedItems(true);
  if (!items.length) {
    state.view.scale = (W - 2 * PAD) / 300;
    state.view.t0 = 1700;
  } else {
    let [a, b] = itemsExtent(items);
    if (b - a < 2) { a -= 1; b += 1; }
    // place à droite pour les étiquettes des derniers éléments
    const room = Math.min(240, W * 0.3);
    state.view.scale = clamp((W - PAD - room) / (b - a), MIN_SCALE, MAX_SCALE);
    state.view.t0 = a;
  }
  renderTimeline();
  if (lastRender) sc.scrollTop = Math.max(0, lastRender.axisY - sc.clientHeight / 2);
}

function focusItem(it) {
  const sc = $('#scroller');
  const W = sc.clientWidth;
  const v = state.view;
  const a = itemStartT(it), b = itemEndT(it);
  if (b > a && (b - a) * v.scale > W * 0.8) v.scale = clamp(W * 0.6 / (b - a), MIN_SCALE, MAX_SCALE);
  const detailsOpen = !$('#details').hidden && W > 820;
  const center = detailsOpen ? (W - 400) / 2 : W / 2;
  v.t0 = (a + b) / 2 - (center - PAD) / v.scale;
  renderTimeline();
  const el = $(`#svg-host [data-id="${CSS.escape(it.id)}"]`);
  if (el) {
    const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
    if (r.top < s.top + 10) sc.scrollTop += r.top - s.top - 40;
    else if (r.bottom > s.bottom - 10) sc.scrollTop += r.bottom - s.bottom + 40;
  }
}
