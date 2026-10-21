// Utilidades de captura compartidas por el golden master y los specs: texto normalizado de un panel,
// cifras clave, descargas (CSV / Excel / JSON) y contenido de los libros Excel leído con SheetJS dentro
// de la página.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { empaquetar } from './pack.mjs';

export const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');

/**
 * Captura una vista: texto normalizado (innerText por líneas, espacios colapsados), cifras clave de las
 * tarjetas, valores de inputs/selects/checkboxes marcados (innerText no los incluye) y hashes de los SVG.
 * No modifica el DOM de forma permanente (oculta los <select> solo mientras calcula innerText).
 */
export async function vista(page, selector, { inputs = true } = {}) {
  const selectores = Array.isArray(selector) ? selector : [selector];
  const r = await page.evaluate(({ sels, withInputs }) => {
    const els = [];
    sels.forEach(s => document.querySelectorAll(s).forEach(e => { if (!els.includes(e)) els.push(e); }));
    if (!els.length) return null;
    const norm = (s) => (s || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    const cyrb53 = (str, seed = 0) => {
      let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
      for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
    };
    const etiqueta = (c) => {
      const ds = Object.entries(c.dataset).map(([k, v]) => `${k}=${v}`).join(',');
      return (c.id ? '#' + c.id : '') + (ds ? '[' + ds + ']' : '') || c.tagName.toLowerCase();
    };
    const campos = [], kpi = [], svg = [], textos = [], html = [];
    els.forEach((el) => {
      // 1) campos (valores que innerText no ve)
      if (withInputs) {
        el.querySelectorAll('input, select, textarea').forEach((c) => {
          if (c.type === 'file' || c.type === 'button') return;
          if (c.tagName === 'SELECT') {
            const opt = c.options[c.selectedIndex];
            campos.push(`select ${etiqueta(c)} = ${opt ? opt.textContent.trim().replace(/\s+/g, ' ') : ''}`);
            if (c.options.length > 20) campos.push(`select ${etiqueta(c)} opciones(${c.options.length}) = ${Array.from(c.options).map(o => o.value).filter(Boolean).join(',')}`);
          } else if (c.type === 'checkbox' || c.type === 'radio') {
            if (c.checked) campos.push(`${c.type} ${etiqueta(c)} = on`);
          } else if (c.value !== '') {
            campos.push(`${c.tagName.toLowerCase()} ${etiqueta(c)} = ${c.value}`);
          }
        });
      }
      // 2) texto sin las listas de opciones de los <select>
      const selects = Array.from(el.querySelectorAll('select'));
      const prev = selects.map(s => s.style.display);
      selects.forEach(s => { s.style.display = 'none'; });
      textos.push(norm(el.innerText));
      selects.forEach((s, i) => { s.style.display = prev[i]; });
      el.querySelectorAll('.vz-chip.active, .of-chip.active, .tab-btn.active, .dash-chips button.active').forEach(c => campos.push(`activo ${etiqueta(c)} = ${norm(c.innerText)}`));
      // 3) cifras clave
      el.querySelectorAll('.kpi-card, .dash-tile').forEach(c => kpi.push(norm(c.innerText).split('\n').slice(0, 2).join(' | ')));
      el.querySelectorAll('.dash-card').forEach(c => kpi.push(`card ${c.dataset.fuente}: ing=${c.dataset.ing} rem=${c.dataset.rem} bys=${c.dataset.bys} gas=${c.dataset.gas} saldo=${c.dataset.saldo}`));
      // 4) gráficos (SVG) y marcado completo (este último solo informativo)
      el.querySelectorAll('svg').forEach(s => svg.push(cyrb53(s.outerHTML)));
      html.push(el.outerHTML);
    });
    return { text: textos.filter(Boolean).join('\n'), campos, kpi, svg, htmlHash: cyrb53(html.join('\n')) };
  }, { sels: selectores, withInputs: inputs });
  if (!r) throw new Error(`vista(): no existe ningún elemento para ${selectores.join(', ')}`);
  const out = { text: r.text };
  if (r.campos.length) out.campos = r.campos;
  if (r.kpi.length) out.kpi = r.kpi;
  if (r.svg.length) out.svg = r.svg;
  out.htmlHash = r.htmlHash;
  return out;
}

// ---------------------------------------------------------------- descargas
export async function capturarDescarga(page, disparar, { timeout = 20000 } = {}) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), disparar()]);
  const ruta = await dl.path();
  const buffer = fs.readFileSync(ruta);
  return { filename: dl.suggestedFilename(), buffer };
}

// Lee un .xlsx con la librería SheetJS que ya está embebida en el panel. Devuelve { orden, hojas: {nombre: filas[][]} }.
export async function leerXlsx(page, buffer) {
  const b64 = buffer.toString('base64');
  return page.evaluate((datos) => {
    const wb = XLSX.read(datos, { type: 'base64' });
    const hojas = {};
    wb.SheetNames.forEach(n => { hojas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }); });
    return { orden: wb.SheetNames.slice(), hojas };
  }, b64);
}

// Representación compacta (y estable) de un libro para el golden master. Las hojas con muchísimas filas
// conservan solo las que tienen algún número distinto de cero (más el encabezado); el hash cubre TODO.
export function compactarLibro(libro, { maxFilasCompletas = 400 } = {}) {
  const hojas = {};
  libro.orden.forEach((nombre) => {
    const filas = libro.hojas[nombre];
    const fmt = (celda) => (typeof celda === 'number' ? String(Math.round(celda * 1e6) / 1e6) : String(celda));
    const textos = filas.map(f => f.map(fmt).join('|'));
    let guardar = textos.map((t, i) => [i, t]);
    let omitidas = 0;
    if (filas.length > maxFilasCompletas) {
      guardar = guardar.filter(([i]) => i === 0 || filas[i].some(c => typeof c === 'number' && c !== 0));
      omitidas = filas.length - guardar.length;
    }
    hojas[nombre] = {
      nFilas: filas.length, nCols: filas.reduce((m, f) => Math.max(m, f.length), 0), sha1: sha1(textos.join('\n')),
      ...(omitidas ? { filasSinCifras: omitidas } : {}),
      ...empaquetar(guardar.map(([, t]) => t), 60),
    };
  });
  return { orden: libro.orden, hojas };
}

export function resumenCsv(buffer) {
  const crudo = buffer.toString('utf8');
  const bom = crudo.charCodeAt(0) === 0xFEFF;
  const texto = bom ? crudo.slice(1) : crudo;
  const eol = texto.includes('\r\n') ? 'CRLF' : (texto.includes('\n') ? 'LF' : 'ninguno');
  const lineas = texto.split(/\r?\n/);
  return { kind: 'csv', bom, eol, nLineas: lineas.length, sha1: sha1(texto), ...empaquetar(lineas, 60) };
}

export function resumenJson(buffer) {
  const texto = buffer.toString('utf8');
  let obj;
  try { obj = JSON.parse(texto); } catch (e) { return { kind: 'json', error: 'JSON inválido: ' + e.message, sha1: sha1(texto) }; }
  const claves = {};
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      claves[k] = { tipo: Array.isArray(v) ? 'array' : typeof v, n: Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : undefined), sha1: sha1(JSON.stringify(v)).slice(0, 12) };
    });
  }
  return { kind: 'json', size: texto.length, sha1: sha1(texto), claves };
}

// Decide el tipo por extensión y devuelve el resumen estable de un archivo descargado.
export async function resumenDescarga(page, dl) {
  const nombre = dl.filename;
  if (/\.csv$/i.test(nombre)) return { filename: nombre, ...resumenCsv(dl.buffer) };
  if (/\.xlsx$/i.test(nombre)) return { filename: nombre, kind: 'xlsx', ...compactarLibro(await leerXlsx(page, dl.buffer)) };
  if (/\.json$/i.test(nombre)) return { filename: nombre, ...resumenJson(dl.buffer) };
  return { filename: nombre, kind: 'otro', size: dl.buffer.length, sha1: sha1(dl.buffer) };
}

// Resumen estable de una llamada capturada a window.print() / window.open().
export function resumenImpresion(p) {
  return {
    bodyClass: p.bodyClass, activeTab: p.activeTab, visibleTabs: p.visibleTabs,
    printWrap: p.printWrap, visibleLineas: p.visibleText ? p.visibleText.split('\n').length : 0, visibleSha1: sha1(p.visibleText || ''),
  };
}

// ---------------------------------------------------------------- CSV mínimo (separador ;, comillas dobles)
export function parseCsvPuntoYComa(texto) {
  const t = texto.charCodeAt(0) === 0xFEFF ? texto.slice(1) : texto;
  const filas = []; let fila = []; let celda = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else q = false; } else celda += c; }
    else if (c === '"') q = true;
    else if (c === ';') { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda.replace(/\r$/, '')); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda.replace(/\r$/, '')); filas.push(fila); }
  return filas;
}
