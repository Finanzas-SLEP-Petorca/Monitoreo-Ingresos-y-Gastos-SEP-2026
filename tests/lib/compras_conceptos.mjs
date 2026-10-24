// Ayudas compartidas por los specs del registro de compras por CONCEPTO (JUNJI, FAEP, FIGA y los dos Aportes Fiscales):
// compras_conceptos_modelo / _totales / _excel / _ui. Cálculo INDEPENDIENTE de lo esperado a partir de los documentos del fixture
// (sin pasar por el código del panel) y lectores de las vistas.
//
// Reglas que fijan los specs (las mismas de las compras de las demás fuentes):
//   · mes del gasto = mes de la Fecha de Documento (aaaa-mm-dd con un mes que existe; cualquier año); sin fecha válida o sin concepto → fuera de todo total;
//   · nota de crédito en NEGATIVO y nota de débito en POSITIVO, sin importar el signo guardado; el resto, como se digitó;
//   · lo documentado es SIEMPRE Real; los montos mensuales por concepto (`bys_items`, «sin documento») siguen el corte «Real hasta» de la entidad;
//   · B&S de la entidad = sin documento + documentado; gasto = remuneraciones + B&S; saldo = ingreso − gasto; Déficit ⇔ saldo < 0 (JUNJI: o Operación − B&S < 0).
import { MESES, FUENTES, idsDeUniverso, corteFuente, tituloEntidad } from './corte.mjs';

export const FUENTES_CONCEPTO = ['junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji'];
export const esConcepto = (key) => FUENTES_CONCEPTO.includes(key);
export const fuenteInfo = (key) => FUENTES.find(f => f.key === key);

const num = (v) => { const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN); return Number.isFinite(n) ? n : 0; };
const texto = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''));
const sumaMeses = (o) => MESES.reduce((s, m) => s + num(o && o.meses && o.meses[m]), 0);

// Nota de crédito → siempre negativa; nota de débito → siempre positiva; el resto, como se digitó.
export function montoConSigno(tipo, v) {
  const n = num(v);
  if (/^nota de cr[eé]dito/i.test(tipo || '')) return n === 0 ? 0 : -Math.abs(n);
  if (/^nota de d[eé]bito/i.test(tipo || '')) return n === 0 ? 0 : Math.abs(n);
  return n;
}
/** Índice 0-11 del mes de una fecha 'aaaa-mm-dd…', o null si no cuenta. */
export function indiceMes(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(fecha));
  if (!m) return null;
  const i = Number(m[2]);
  return i >= 1 && i <= 12 ? i - 1 : null;
}

/** Documentado de una entidad en una fuente por concepto: { conceptos: { concepto → [12 montos] }, porMes: [12], total, nDocs, nExcluidas, sinContabilizar }. */
export function documentadoDe(docs, id, key) {
  const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes[key]) || {};
  const conceptos = {};
  const porMes = new Array(12).fill(0);
  let nDocs = 0, nExcluidas = 0, sinContabilizar = 0;
  const compras = of.compras && typeof of.compras === 'object' && !Array.isArray(of.compras) ? of.compras : {};
  Object.values(compras).forEach(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return;
    nDocs++;
    const concepto = texto(c.concepto).trim();
    const i = indiceMes(c.fechaDocumento);
    const monto = montoConSigno(texto(c.tipoDocumento), c.montoGasto);
    if (!concepto || i === null) { nExcluidas++; sinContabilizar += monto; return; }
    (conceptos[concepto] = conceptos[concepto] || new Array(12).fill(0))[i] += monto;
    porMes[i] += monto;
  });
  return { conceptos, porMes, total: porMes.reduce((a, b) => a + b, 0), nDocs, nExcluidas, sinContabilizar };
}

/** Todo lo esperado de una entidad en una fuente (JUNJI con sus 4 líneas de ingreso). Montos enteros como los redondea el panel. */
export function entidadDe(docs, id, key) {
  const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes[key]) || {};
  const corte = corteFuente(docs, id, key);
  const lineas = key === 'junji' ? [of.ingreso_operacion, of.ingreso_homologacion, of.ingreso_carrera_docente, of.ingreso_bdl] : [of.ingreso];
  const parte = (l) => {
    let real = 0, proy = 0;
    MESES.forEach((m, i) => { const v = num(l && l.meses && l.meses[m]); if (i + 1 <= corte) real += v; else proy += v; });
    return { real, proy };
  };
  const sum = (arr) => arr.reduce((a, p) => ({ real: a.real + p.real, proy: a.proy + p.proy }), { real: 0, proy: 0 });
  const ing = sum(lineas.map(parte));
  const rem = parte(of.gasto_rem);
  const sin = sum(Object.values((of.bys_items && typeof of.bys_items === 'object') ? of.bys_items : {}).filter(it => it && typeof it === 'object').map(parte));
  const doc = documentadoDe(docs, id, key);
  const r = Math.round;
  const bysDoc = r(doc.total), bysSinReal = r(sin.real), bysSinProy = r(sin.proy);
  const real = { ingreso: r(ing.real), rem: r(rem.real), bysDoc, bysSin: bysSinReal, bys: bysSinReal + bysDoc };
  const proy = { ingreso: r(ing.proy), rem: r(rem.proy), bysDoc: 0, bysSin: bysSinProy, bys: bysSinProy };
  const total = { ingreso: real.ingreso + proy.ingreso, rem: real.rem + proy.rem, bysDoc, bysSin: bysSinReal + bysSinProy, bys: real.bys + proy.bys };
  [real, proy, total].forEach(b => { b.gasto = b.rem + b.bys; b.saldo = b.ingreso - b.gasto; });
  const saldoOp = key === 'junji' ? r(sumaMeses(of.ingreso_operacion)) - total.bys : null;
  const causas = [];
  if (total.saldo < 0) causas.push('saldo');
  if (saldoOp !== null && saldoOp < 0) causas.push('operacion_bys');
  return { id, key, corte, real, proy, total, saldoOp, estado: causas.length ? 'deficit' : 'superavit', causas, doc };
}

/** Esperado de TODAS las entidades de una fuente: { id → entidadDe } y sus sumas { real, proy, total } (con ingreso, rem, bysDoc, bysSin, bys, gasto, saldo) y conteos. */
export function fuenteEsperada(docs, key) {
  const f = fuenteInfo(key);
  const porId = {};
  idsDeUniverso(f.universo).forEach(id => { porId[id] = entidadDe(docs, id, key); });
  const vacio = () => ({ ingreso: 0, rem: 0, bysDoc: 0, bysSin: 0, bys: 0, gasto: 0, saldo: 0 });
  const suma = { real: vacio(), proy: vacio(), total: vacio(), nEntidades: 0, nDeficit: 0 };
  Object.values(porId).forEach(e => {
    ['real', 'proy', 'total'].forEach(k => Object.keys(suma[k]).forEach(c => { suma[k][c] += e[k][c]; }));
    suma.nEntidades++;
    if (e.estado === 'deficit') suma.nDeficit++;
  });
  return { porId, suma };
}

/** Series mensuales (12) esperadas de una fuente: { ing, rem, bys, gas } (cada una { real, proy }) sumando todas sus entidades (o solo `soloId`); lo documentado siempre es Real. */
export function serieMensualEsperada(docs, key, soloId = null) {
  const f = fuenteInfo(key);
  const z = () => new Array(12).fill(0);
  const out = { ing: { real: z(), proy: z() }, rem: { real: z(), proy: z() }, bys: { real: z(), proy: z() }, gas: { real: z(), proy: z() } };
  idsDeUniverso(f.universo).forEach(id => {
    if (soloId && id !== soloId) return;
    const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes[key]) || {};
    const corte = corteFuente(docs, id, key);
    const lineas = key === 'junji' ? [of.ingreso_operacion, of.ingreso_homologacion, of.ingreso_carrera_docente, of.ingreso_bdl] : [of.ingreso];
    const poner = (l, dst) => MESES.forEach((m, i) => { const v = num(l && l.meses && l.meses[m]); (i + 1 <= corte ? dst.real : dst.proy)[i] += v; });
    lineas.forEach(l => poner(l, out.ing));
    poner(of.gasto_rem, out.rem);
    Object.values((of.bys_items && typeof of.bys_items === 'object') ? of.bys_items : {}).filter(it => it && typeof it === 'object').forEach(it => poner(it, out.bys));
    documentadoDe(docs, id, key).porMes.forEach((v, i) => { out.bys.real[i] += v; });
  });
  ['real', 'proy'].forEach(k => { out.gas[k] = out.rem[k].map((v, i) => v + out.bys[k][i]); });
  return out;
}

// ---------------------------------------------------------------- lectores de la pantalla
/** "$1.234.567" / "-$1.234" → número entero. */
export const clp = (t) => {
  const s = String(t).replace(/\s/g, '');
  const n = Number(s.replace(/[^\d]/g, ''));
  return /^-/.test(s) ? -n : n;
};
export const fmt = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');

/** Tarjetas KPI de la pestaña de una fuente: { real: {...}, proy: {...}, total: {...} } con valor numérico de ingreso/rem/bys/gasto/saldo y el texto de la nota de B&S. */
export function leerTarjetasFuente(page, key) {
  return page.evaluate((k) => {
    const out = {};
    for (const tipo of ['real', 'proy', 'total']) {
      const cards = Array.from(document.querySelectorAll(`#ofKpiRow-${tipo}-${k} .kpi-card`));
      const por = {};
      cards.forEach(c => { por[c.querySelector('.label').textContent.trim()] = { valor: c.querySelector('.value').textContent.trim(), nota: c.querySelector('.delta').textContent.trim() }; });
      out[tipo] = por;
    }
    return out;
  }, key);
}
/** Filas de la tabla de una fuente: { id: { bys, bysTexto, gasto, saldo, ingreso, rem, split } } (texto de las celdas). */
export function leerFilasFuente(page, key) {
  return page.evaluate((k) => {
    const out = {};
    document.querySelectorAll(`#otrasFuentesTbody-${k} tr[data-rbd]`).forEach(tr => {
      const c = Array.from(tr.children).map(td => td.cloneNode(true));
      const split = tr.querySelector('.of-bys-split');
      const bysCell = c[5];
      const sp = bysCell.querySelector('.of-bys-split');
      if (sp) sp.remove();
      out[tr.dataset.rbd] = {
        ingreso: c[3].textContent.trim(), rem: c[4].textContent.trim(), bys: bysCell.textContent.trim(), gasto: c[6].textContent.trim(), saldo: c[7].textContent.trim(),
        split: split ? split.textContent.trim() : '',
      };
    });
    return out;
  }, key);
}
export async function abrirModalConcepto(h, fuente, id) {
  await h.clickTab('of-' + fuente);
  await h.page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${id}"]`);
  await h.waitIdle();
}
export async function cerrarModalConcepto(h) {
  await h.page.keyboard.press('Escape');
  await h.waitIdle();
}
/** Rellena el formulario del registro de compras por concepto del modal abierto (campos por data-field). Los selects reciben el texto de la opción. */
export async function llenarFormConcepto(page, campos) {
  await page.evaluate((cs) => {
    const wrap = document.querySelector('#otrasFuentesModalBody .compra-form-grid');
    Object.entries(cs).forEach(([field, valor]) => {
      const el = wrap.querySelector(`.compra-input[data-field="${field}"]`);
      if (!el) throw new Error('no existe el campo ' + field);
      el.value = valor;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, campos);
}
/** Compra base válida (concepto «Alimentación», factura electrónica, marzo de 2026). */
export const compraCBase = (extra = {}) => ({
  concepto: 'Alimentación', tipoDocumento: 'Factura electrónica', nroDocumento: '9001', fechaDocumento: '2026-03-10', fechaPago: '2026-03-20',
  descripcion: 'Compra de prueba', rutProveedor: '76.123.456-7', nombreProveedor: 'Proveedor SpA', montoGasto: 1000, montoDocumento: 1190, documentoOriginal: '',
  ...extra,
});
/** Filas del registro de compras del modal abierto: [{ id, celdas:[texto…] }]. */
export function filasRegistroConcepto(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody table.compras-table tbody tr[data-compra-id]')).map(tr => ({
    id: tr.dataset.compraId, celdas: Array.from(tr.children).slice(0, 12).map(td => td.textContent.replace(/\s+/g, ' ').trim()),
  })));
}
export { MESES, tituloEntidad };
