// Helpers de accesibilidad (WCAG 2.1 AA) para los specs a11y_*: se miden en el navegador, sin dependencias nuevas.
//
//   analizarContraste(page, {scope})   contraste de TODO el texto visible (color compuesto sobre el fondo real)
//   nombresAccesibles(page, {scope})   nombre accesible que calcula Chromium (árbol de accesibilidad por CDP) de cada control visible
//   medirFoco(page, {scope})           contorno de foco (outline / box-shadow computados) y su contraste, control por control
//
// Todo se evalúa dentro de la página (Chromium) y devuelve datos serializables; los specs deciden qué se exige.

// ---------------------------------------------------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Mide el contraste de cada nodo de texto visible dentro de `scope` (selector CSS; por defecto todo el documento).
 *  - Color del texto: `color` calculado (o `fill` en SVG) compuesto con su alfa y con la `opacity` acumulada de sus ancestros.
 *  - Fondo real: se compone, de abajo hacia arriba, el `background-color` (con alfa y opacidad acumulada) de cada ancestro hasta
 *    el primero opaco; los degradados lineales simples (`background-image: linear-gradient`) se evalúan en cada parada de color y
 *    se conserva el PEOR caso. En SVG se componen además las formas (`rect`, `circle`, …) que quedan detrás del texto.
 *  - "Grande": ≥ 24 px, o ≥ 18,66 px en negrita (peso ≥ 700) → umbral 3:1; el resto 4,5:1.
 *  - Se incluyen valores de <input>/<select> y los placeholders visibles. Se EXCLUYEN (y se cuentan en `excluidos`): controles
 *    deshabilitados (WCAG 1.4.3 los exime), texto con opacidad total 0, visibility:hidden / display:none y recuadros de ≤ 1 px.
 * @returns {Promise<{medidos:number, fallas:Array, excluidos:Array, minimo:number|null}>}
 */
export async function analizarContraste(page, { scope = null, incluirPlaceholders = true } = {}) {
  return page.evaluate(fnContraste, { scope, incluirPlaceholders });
}

/* eslint-disable */
function fnContraste({ scope, incluirPlaceholders }) {
  const raiz = scope ? document.querySelector(scope) : document.body;
  if (!raiz) return { medidos: 0, fallas: [], excluidos: [], minimo: null, error: 'no existe el scope ' + scope };

  // ---- color ----
  const cacheColor = new Map();
  const RGBA = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/;
  const SRGB = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/;
  function parseColor(s) {
    if (s == null) return [0, 0, 0, 0];
    s = String(s).trim();
    if (cacheColor.has(s)) return cacheColor.get(s);
    let r = null, m;
    if (s === 'transparent' || s === '') r = [0, 0, 0, 0];
    else if ((m = RGBA.exec(s))) r = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4])];
    else if ((m = SRGB.exec(s))) r = [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4])];
    else { // cualquier otra sintaxis (color-mix, oklch, nombres…): que la normalice el navegador
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.clearRect(0, 0, 1, 1); x.fillStyle = s; x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data; r = [d[0], d[1], d[2], d[3] / 255];
    }
    cacheColor.set(s, r);
    return r;
  }
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const sobre = (fg, bg) => { // fg (con alfa) sobre bg opaco
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const hex = (c) => '#' + [c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // ---- opacidad acumulada ----
  const cacheOp = new WeakMap();
  function opAcum(n) {
    if (!n || n.nodeType !== 1) return 1;
    if (cacheOp.has(n)) return cacheOp.get(n);
    const o = parseFloat(getComputedStyle(n).opacity);
    const v = (isNaN(o) ? 1 : o) * opAcum(n.parentElement);
    cacheOp.set(n, v);
    return v;
  }

  // ---- fondo ----
  // Devuelve variantes de fondo opaco (varias si hay degradados): cada una es [r,g,b,1].
  function fondos(el) {
    const capas = []; // de arriba (el) hacia abajo
    let opaco = false;
    for (let n = el; n && n.nodeType === 1 && !opaco; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const op = opAcum(n);
      const bg = parseColor(cs.backgroundColor);
      const a = bg[3] * op;
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient\(/.test(img)) {
        const paradas = (img.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map((s) => { const c = parseColor(s); return [c[0], c[1], c[2], c[3] * op]; });
        if (paradas.length) capas.push({ grad: paradas });
      }
      if (a > 0.001) { capas.push({ color: [bg[0], bg[1], bg[2], a] }); if (a >= 0.999) opaco = true; }
    }
    // variantes: producto cartesiano de las paradas de cada degradado (acotado)
    let variantes = [[]];
    for (const capa of capas) {
      if (capa.grad) {
        const nuevas = [];
        for (const v of variantes) for (const p of capa.grad) { if (nuevas.length < 64) nuevas.push(v.concat([p])); }
        variantes = nuevas;
      } else variantes = variantes.map((v) => v.concat([capa.color]));
    }
    return variantes.map((v) => {
      let base = [255, 255, 255, 1]; // lienzo por defecto
      for (let i = v.length - 1; i >= 0; i--) base = sobre(v[i], base);
      return base;
    });
  }

  // Fondo detrás de un <text> SVG: formas del mismo <svg> que lo cubren y están antes en el documento.
  function capasSvgDetras(t) {
    const svg = t.ownerSVGElement;
    if (!svg) return [];
    const rt = t.getBoundingClientRect();
    const cx = rt.left + rt.width / 2, cy = rt.top + rt.height / 2;
    const out = [];
    svg.querySelectorAll('rect, circle, ellipse, path, polygon').forEach((s) => {
      if (!(s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      if (s.closest('defs, marker, clipPath, mask')) return;
      const cs = getComputedStyle(s);
      if (!cs.fill || cs.fill === 'none') return;
      const b = s.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return;
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) return;
      const c = parseColor(cs.fill);
      const a = c[3] * (parseFloat(cs.fillOpacity) || 1) * opAcum(s);
      if (a > 0.001) out.push([c[0], c[1], c[2], a]);
    });
    return out;
  }

  // ---- descriptor legible ----
  function desc(el) {
    const parte = (n) => {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cl = Array.from(n.classList).filter((c) => !/^(active|hidden)$/.test(c)).slice(0, 3);
      if (cl.length) s += '.' + cl.join('.');
      return s;
    };
    const cadena = [parte(el)];
    let p = el.parentElement;
    for (let i = 0; p && i < 2 && p !== document.body; i++, p = p.parentElement) {
      if (p.id || i === 1 || /^(tr|table|section|li|label|summary|details|button)$/i.test(p.tagName)) { cadena.unshift(parte(p)); if (p.id) break; }
    }
    return cadena.join(' > ');
  }

  const fallas = [], excluidos = [];
  let medidos = 0, minimo = null;
  const vistos = new Set();

  function evaluar(el, texto, fgStr, kind, extra = {}) {
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize) * (extra.escala || 1);
    const negrita = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const grande = px >= 24 || (px >= 18.66 && negrita);
    const umbral = grande ? 3 : 4.5;
    const op = opAcum(el);
    let fg = parseColor(fgStr); fg = [fg[0], fg[1], fg[2], fg[3] * (extra.fillOpacity == null ? 1 : extra.fillOpacity) * op];
    if (fg[3] < 0.01) { excluidos.push({ sel: desc(el), razon: 'texto con opacidad efectiva 0' }); return; }
    let bgs = fondos(el);
    if (extra.capasSvg && extra.capasSvg.length) {
      bgs = bgs.map((b) => { let base = b; extra.capasSvg.forEach((c) => { base = sobre(c, base); }); return base; });
    }
    let peor = null;
    for (const bg of bgs) {
      const c = sobre(fg, bg);
      const r = ratio(c, bg);
      if (!peor || r < peor.r) peor = { r, c, bg };
    }
    medidos++;
    if (minimo === null || peor.r < minimo) minimo = peor.r;
    if (peor.r < umbral) {
      const clave = [desc(el), hex(peor.c), hex(peor.bg), Math.round(px * 10), negrita, kind].join('|');
      if (vistos.has(clave)) { fallas.find((f) => f.clave === clave).n++; return; }
      vistos.add(clave);
      fallas.push({
        clave, n: 1, sel: desc(el), texto: texto.slice(0, 60), color: hex(peor.c), fondo: hex(peor.bg),
        ratio: Math.round(peor.r * 100) / 100, requerido: umbral, tamano: Math.round(px * 10) / 10, negrita, kind,
        razon: `${(Math.round(peor.r * 100) / 100).toFixed(2)}:1 < ${umbral}:1 (${grande ? 'texto grande' : 'texto normal'})`,
      });
    }
  }

  const visible = (el) => {
    try { return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }); } catch (e) { return !!el.getClientRects().length; }
  };

  // ---- recorrido de nodos de texto ----
  const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const SALTAR = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|OPTGROUP|TITLE|HEAD)$/;
  for (let nodo = tw.nextNode(); nodo; nodo = tw.nextNode()) {
    const txt = nodo.nodeValue.replace(/[\s​]+/g, ' ').trim();
    if (!txt) continue;
    const el = nodo.parentElement;
    if (!el || SALTAR.test(el.tagName) || el.closest('script,style,noscript,template,option')) continue;
    if (!visible(el)) continue;
    const r = document.createRange(); r.selectNodeContents(nodo);
    const rects = Array.from(r.getClientRects()).filter((q) => q.width > 1 && q.height > 1);
    if (!rects.length) continue;
    if (el.closest(':disabled, [aria-disabled="true"]')) { excluidos.push({ sel: desc(el), razon: 'control deshabilitado (exento, WCAG 1.4.3)', texto: txt.slice(0, 40) }); continue; }
    const cs = getComputedStyle(el);
    if (el instanceof SVGElement) {
      const t = el.closest('text') || el;
      const fill = getComputedStyle(t).fill;
      if (!fill || fill === 'none') continue;
      const ctm = t.getScreenCTM ? t.getScreenCTM() : null;
      evaluar(el, txt, fill, 'svg', { escala: ctm ? Math.abs(ctm.a) : 1, fillOpacity: parseFloat(getComputedStyle(t).fillOpacity), capasSvg: capasSvgDetras(t) });
    } else {
      evaluar(el, txt, cs.color, 'texto');
    }
  }

  // ---- valores de campos (el texto de un <input>/<select> no es un nodo de texto) ----
  raiz.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!visible(el) || /^(checkbox|radio|file|hidden|button|submit|range|color)$/.test(el.type)) return;
    const b = el.getBoundingClientRect(); if (b.width <= 1 || b.height <= 1) return;
    let texto = '';
    if (el.tagName === 'SELECT') texto = (el.selectedOptions[0] || {}).textContent || '';
    else texto = el.value || '';
    texto = texto.trim();
    if (el.matches(':disabled')) { if (texto) excluidos.push({ sel: desc(el), razon: 'campo deshabilitado (exento, WCAG 1.4.3)', texto: texto.slice(0, 40) }); return; }
    if (texto) evaluar(el, texto, getComputedStyle(el).color, el.tagName === 'SELECT' ? 'select' : 'valor');
    else if (incluirPlaceholders && el.placeholder) {
      let c = null;
      try { c = getComputedStyle(el, '::placeholder').color; } catch (e) { /* sin soporte */ }
      if (c) evaluar(el, el.placeholder, c, 'placeholder');
    }
  });

  fallas.sort((a, b) => a.ratio - b.ratio);
  fallas.forEach((f) => { delete f.clave; });
  return { medidos, fallas, excluidos, minimo: minimo === null ? null : Math.round(minimo * 100) / 100 };
}
/* eslint-enable */

/** Resumen legible (una línea por incumplimiento) para imprimir en un spec. */
export function formatearFallasContraste(res, max = 40) {
  return res.fallas.slice(0, max).map((f) => `${f.sel} «${f.texto}» ${f.color} sobre ${f.fondo} → ${f.razon}${f.n > 1 ? ` (×${f.n})` : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Nombre accesible (árbol de accesibilidad de Chromium, vía CDP)
// ---------------------------------------------------------------------------------------------------------------------

const ROLES_CON_NOMBRE = new Set(['button', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'spinbutton', 'slider',
  'tab', 'link', 'menuitem', 'listbox', 'option', 'treeitem', 'DisclosureTriangle', 'PopUpButton', 'ComboBox', 'TextField', 'SearchBox']);

/**
 * Para cada control visible dentro de `scope` devuelve su nombre accesible calculado por Chromium:
 *   { sel, tag, tipo, rol, nombre, fuente, soloTitleOPlaceholder, visible }
 * Controles considerados: input, select, textarea, button, summary, a[href], [role=button|tab|link|checkbox|…] y [tabindex].
 * `fuente` indica de dónde sale el nombre (contents | attribute:aria-label | relatedElement:label | title | placeholder …).
 */
export async function nombresAccesibles(page, { scope = null } = {}) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    // 1) elementos candidatos (visibles) dentro del scope: se marcan con data-a11y-n y se describen
    const desc = await page.evaluate(({ scope }) => {
      const raiz = scope ? document.querySelector(scope) : document.body;
      const sel = 'input, select, textarea, button, summary, a[href], [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="textbox"], [role="combobox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
      const out = [];
      if (!raiz) return out;
      const parte = (n) => { let s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; const cl = Array.from(n.classList).filter((c) => !/^(active|hidden)$/.test(c)).slice(0, 2); if (cl.length) s += '.' + cl.join('.'); return s; };
      const nodos = Array.from(raiz.querySelectorAll(sel));
      if (raiz.matches && raiz.matches(sel)) nodos.unshift(raiz);
      for (const el of nodos) {
        if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
        let vis = false;
        try { vis = el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }); } catch (e) { vis = !!el.getClientRects().length; }
        if (!vis) continue;
        const b = el.getBoundingClientRect();
        if (b.width <= 0 && b.height <= 0) continue;
        const n = out.length;
        el.setAttribute('data-a11y-n', String(n));
        const datos = Array.from(el.attributes).filter((a) => /^data-(rbd|mes|modo|codigo|concepto|fuente|tab|field|compra-id|abrir)/.test(a.name)).map((a) => a.name.replace(/^data-/, '') + '=' + a.value).slice(0, 4);
        out.push({
          n, sel: parte(el) + (datos.length ? '[' + datos.join(',') + ']' : ''), tag: el.tagName.toLowerCase(), tipo: el.type || null, enModal: !!el.closest('.modal-overlay'),
          ariaLabel: el.getAttribute('aria-label'), title: el.getAttribute('title'), placeholder: el.getAttribute('placeholder'), id: el.id || null,
          texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        });
      }
      return out;
    }, { scope });
    // 2) backendNodeId de cada marcado
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-a11y-n]' });
    const backendDe = new Map();
    for (let i = 0; i < nodeIds.length; i += 50) {
      const lote = nodeIds.slice(i, i + 50);
      const res = await Promise.all(lote.map((nodeId) => cdp.send('DOM.describeNode', { nodeId }).then((r) => r.node)));
      res.forEach((nd) => { const at = nd.attributes || []; const k = at.indexOf('data-a11y-n'); if (k >= 0) backendDe.set(Number(at[k + 1]), nd.backendNodeId); });
    }
    await page.evaluate(() => document.querySelectorAll('[data-a11y-n]').forEach((el) => el.removeAttribute('data-a11y-n')));
    // 3) árbol de accesibilidad completo → nombre por backendNodeId
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const porBackend = new Map();
    for (const n of nodes) if (n.backendDOMNodeId !== undefined) porBackend.set(n.backendDOMNodeId, n);
    return desc.map((it) => {
      const ax = porBackend.get(backendDe.get(it.n));
      const nombre = ax && ax.name && ax.name.value ? String(ax.name.value).trim() : '';
      let fuente = null;
      if (ax && ax.name && Array.isArray(ax.name.sources)) {
        const usada = ax.name.sources.find((s) => !s.superseded && s.value && s.value.value);
        if (usada) fuente = usada.type + (usada.attribute ? ':' + usada.attribute : '') + (usada.nativeSource ? ':' + usada.nativeSource : '');
      }
      return {
        sel: it.sel, tag: it.tag, tipo: it.tipo, enModal: it.enModal, rol: ax && ax.role ? ax.role.value : null, nombre, fuente,
        ignorado: !!(ax && ax.ignored), sinNodo: !ax, title: it.title, placeholder: it.placeholder, ariaLabel: it.ariaLabel, texto: it.texto,
        soloTitleOPlaceholder: !!nombre && /^(title|placeholder)/.test(fuente || '') && !it.ariaLabel,
      };
    });
  } finally {
    try { await cdp.detach(); } catch (e) { /* ya cerrado */ }
  }
}

/** Rol, nombre y descripción accesibles (según Chromium) del primer elemento que coincide con `selector`; null si no existe. */
export async function axDe(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    const ok = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.setAttribute('data-a11y-uno', '1'); return true; }, selector);
    if (!ok) return null;
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-a11y-uno]' });
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    await page.evaluate(() => document.querySelectorAll('[data-a11y-uno]').forEach((el) => el.removeAttribute('data-a11y-uno')));
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const ax = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
    if (!ax) return { rol: null, nombre: '', descripcion: '', ignorado: true, sinNodo: true };
    return {
      rol: ax.role && ax.role.value, nombre: ax.name && ax.name.value ? String(ax.name.value).trim() : '', descripcion: ax.description && ax.description.value ? String(ax.description.value).trim() : '',
      ignorado: !!ax.ignored, propiedades: Object.fromEntries((ax.properties || []).map((p) => [p.name, p.value && p.value.value])),
    };
  } finally {
    try { await cdp.detach(); } catch (e) { /* ya cerrado */ }
  }
}

/** Landmarks que expone el árbol de accesibilidad (no ignorados): [{rol, nombre}]. */
export async function landmarks(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const ROLES = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'form', 'search']);
    return nodes.filter((n) => !n.ignored && n.role && ROLES.has(n.role.value)).map((n) => ({ rol: n.role.value, nombre: n.name && n.name.value ? String(n.name.value) : '' }));
  } finally {
    try { await cdp.detach(); } catch (e) { /* ya cerrado */ }
  }
}

/** Controles sin nombre (vacío) o cuyo único nombre es `title`/`placeholder`. */
export function controlesSinNombre(lista) {
  return lista.filter((c) => !c.ignorado && !c.sinNodo && (!c.nombre || c.soloTitleOPlaceholder));
}

// ---------------------------------------------------------------------------------------------------------------------
// Foco visible
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Mide el contorno de foco del elemento que tiene el foco AHORA (document.activeElement): outline / box-shadow calculados, su grosor, su contraste frente al fondo que
 * lo rodea (y frente al relleno del control si el anillo queda pegado a él) y si algún ancestro con overflow lo recorta. Devuelve null si el foco está en <body>.
 */
export function medirFocoActivo(page) { return page.evaluate(fnMedirFocoActivo); }

/* eslint-disable */
function fnMedirFocoActivo() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const RGBA = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/;
  const parse = (s) => { s = String(s || '').trim(); if (s === 'transparent' || !s) return [0, 0, 0, 0]; const m = RGBA.exec(s); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4])];
    const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = s; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const sobre = (fg, bg) => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
  const opAcum = (n) => { let o = 1; for (; n && n.nodeType === 1; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); o *= isNaN(v) ? 1 : v; } return o; };
  const fondoDe = (n) => {
    const capas = [];
    for (; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n); const op = opAcum(n); const bg = parse(cs.backgroundColor); const a = bg[3] * op;
      if (a > 0.001) { capas.push([bg[0], bg[1], bg[2], a]); if (a >= 0.999) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
    return base;
  };
  const hex = (c) => '#' + [c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const cs = getComputedStyle(el);
  const outline = { estilo: cs.outlineStyle, ancho: parseFloat(cs.outlineWidth) || 0, color: cs.outlineColor, offset: parseFloat(cs.outlineOffset) || 0 };
  const sombras = (cs.boxShadow && cs.boxShadow !== 'none') ? cs.boxShadow.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !/inset/.test(s)) : [];
  let sombraAnillo = null;
  for (const s of sombras) {
    const mc = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(s); if (!mc) continue;
    const resto = s.replace(mc[0], '').trim().split(/\s+/).map((v) => parseFloat(v));
    const [x, y, blur, spread] = [resto[0] || 0, resto[1] || 0, resto[2] || 0, resto[3] || 0];
    if (spread >= 1 && blur <= 1 && x === 0 && y === 0) { if (!sombraAnillo || spread > sombraAnillo.spread) sombraAnillo = { color: mc[0], spread }; }
  }
  const outlineVisible = outline.estilo !== 'none' && outline.estilo !== 'hidden' && outline.ancho > 0 && parse(outline.color)[3] > 0.01;
  const esAuto = outline.estilo === 'auto';
  const anillos = [];
  if (outlineVisible && !esAuto) anillos.push({ tipo: 'outline', grosor: outline.ancho, color: outline.color, offset: outline.offset });
  if (sombraAnillo) anillos.push({ tipo: 'box-shadow', grosor: sombraAnillo.spread, color: sombraAnillo.color, offset: 0 });
  const mejor = anillos.sort((a, b) => b.grosor - a.grosor)[0] || null;
  const fuera = fondoDe(el.parentElement);
  const propio = fondoDe(el);
  let cFuera = null, cDentro = null;
  if (mejor) {
    const colorAnillo = sobre(parse(mejor.color), fuera);
    cFuera = Math.round(ratio(colorAnillo, fuera) * 100) / 100;
    if (mejor.offset <= 0 || mejor.tipo === 'box-shadow') cDentro = Math.round(ratio(colorAnillo, propio) * 100) / 100;
  }
  // ¿lo recorta algún ancestro con overflow ≠ visible? (el anillo ocupa offset + grosor hacia afuera del borde del control; con offset negativo va hacia adentro)
  const r = el.getBoundingClientRect();
  let recorte = null;
  if (mejor) {
    const ext = Math.max(0, mejor.offset + mejor.grosor); // un anillo con offset negativo (hacia adentro) no sobresale del control
    const caja = { l: r.left - ext, t: r.top - ext, r: r.right + ext, b: r.bottom + ext };
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const ca = getComputedStyle(a);
      const ox = ca.overflowX !== 'visible', oy = ca.overflowY !== 'visible';
      if (!ox && !oy) continue;
      const ar = a.getBoundingClientRect();
      const clip = { l: ar.left + a.clientLeft, t: ar.top + a.clientTop, r: ar.left + a.clientLeft + a.clientWidth, b: ar.top + a.clientTop + a.clientHeight };
      const lados = [];
      if (ox && caja.l < clip.l - 0.5 && r.left >= clip.l - 0.5) lados.push('izquierda');
      if (ox && caja.r > clip.r + 0.5 && r.right <= clip.r + 0.5) lados.push('derecha');
      if (oy && caja.t < clip.t - 0.5 && r.top >= clip.t - 0.5) lados.push('arriba');
      if (oy && caja.b > clip.b + 0.5 && r.bottom <= clip.b + 0.5) lados.push('abajo');
      if (lados.length) { recorte = { por: a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.classList.length ? '.' + a.classList[0] : ''), lados }; break; }
    }
  }
  return {
    sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + Array.from(el.classList).slice(0, 3).join('.') : ''),
    texto: ((el.getAttribute('aria-label') || el.textContent || el.value || '') + '').replace(/\s+/g, ' ').trim().slice(0, 30),
    focusVisible: el.matches(':focus-visible'), enfocado: true,
    outline, esAuto, sombra: sombraAnillo, grosor: mejor ? mejor.grosor : 0, tipoAnillo: mejor ? mejor.tipo : null,
    colorAnillo: mejor ? hex(sobre(parse(mejor.color), fuera)) : null, fondoFuera: hex(fuera), fondoPropio: hex(propio),
    contraste: { fuera: cFuera, dentro: cDentro }, offset: mejor ? mejor.offset : null, ancho: Math.round(r.width), alto: Math.round(r.height), recorte,
  };
}
/* eslint-enable */

/** Veredicto sobre una medición de `medirFocoActivo`: null si el foco es claramente visible; si no, el motivo. */
export function motivoFocoInvisible(med) {
  if (!med) return 'el foco no está en ningún control';
  if (!med.focusVisible) return ':focus-visible no aplica con foco de teclado';
  if (!med.tipoAnillo) return med.esAuto ? 'solo el anillo "auto" del navegador (sin contorno propio)' : 'sin contorno visible (outline: none y sin box-shadow de anillo)';
  if (med.grosor < 2) return `anillo de ${med.grosor}px (< 2px)`;
  if (med.contraste.fuera !== null && med.contraste.fuera < 3) return `contraste del anillo frente al fondo ${med.contraste.fuera}:1 (< 3:1)`;
  if (med.contraste.dentro !== null && med.contraste.dentro < 3) return `contraste del anillo frente al relleno del control ${med.contraste.dentro}:1 (< 3:1)`;
  if (med.recorte) return `el anillo queda recortado por ${med.recorte.por} (${med.recorte.lados.join(', ')})`;
  return null;
}

/**
 * Pone el foco (con modalidad de teclado, para que :focus-visible aplique) en una muestra de los controles tabulables de `scope` —hasta `porGrupo` de cada "firma"
 * (etiqueta + tipo + clases + rol)— y mide el contorno de cada uno (ver medirFocoActivo / motivoFocoInvisible):
 *   { sel, firma, focusVisible, outline, sombra, grosor, colorAnillo, contraste:{fuera, dentro}, recorte, ok, motivo }
 */
export async function medirFoco(page, { scope = null, porGrupo = 2, max = 120 } = {}) {
  // Los elementos se guardan por referencia (window.__a11yFocoEls), NO con un atributo: el reconciliador de los modales borra los atributos que no conoce.
  const plan = await page.evaluate(({ scope, porGrupo, max }) => {
    const raiz = scope ? document.querySelector(scope) : document.body;
    window.__a11yFocoEls = [];
    if (!raiz) return [];
    const cand = Array.from(raiz.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]'))
      .filter((el) => {
        if (el.disabled || el.closest('[inert]') || (el.getAttribute('tabindex') === '-1' && !el.matches('button, input, select, textarea, a[href], summary'))) return false;
        if (el.tagName === 'INPUT' && /^(hidden|file)$/.test(el.type)) return false;
        let vis = false;
        try { vis = el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }); } catch (e) { vis = !!el.getClientRects().length; }
        const b = el.getBoundingClientRect();
        return vis && b.width > 0 && b.height > 0;
      });
    const firma = (el) => [el.tagName.toLowerCase(), el.type || '', el.getAttribute('role') || '', Array.from(el.classList).filter((c) => !/^(active|hidden|editing)$/.test(c)).slice(0, 3).join('.'), el.closest('.modal-overlay') ? 'modal' : '', el.closest('.tab-group') ? 'tabgroup' : ''].join('|');
    const cuenta = new Map();
    const elegidos = [];
    cand.forEach((el) => {
      const f = firma(el);
      const n = cuenta.get(f) || 0;
      cuenta.set(f, n + 1);
      if (n < porGrupo && elegidos.length < max) { window.__a11yFocoEls.push(el); elegidos.push({ f }); }
    });
    return elegidos.map((e, k) => ({ k, firma: e.f }));
  }, { scope, porGrupo, max });

  const out = [];
  for (const p of plan) {
    await page.keyboard.press('Shift+Tab').catch(() => {}); // modalidad de teclado para :focus-visible
    const ok = await page.evaluate((k) => {
      const el = window.__a11yFocoEls[k];
      if (!el || !el.isConnected) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' }); // centrado: con 'nearest' el control queda pegado al borde del scroller y el anillo se recorta por el propio scroll
      el.focus({ preventScroll: true });
      return document.activeElement === el;
    }, p.k);
    if (!ok) { out.push({ sel: `(control ${p.k})`, firma: p.firma, ok: false, motivo: 'no pudo recibir el foco', enfocado: false }); continue; }
    const med = await medirFocoActivo(page);
    const motivo = motivoFocoInvisible(med);
    out.push({ ...med, firma: p.firma, ok: motivo === null, motivo });
  }
  await page.evaluate(() => { delete window.__a11yFocoEls; });
  return out;
}
