// Ayudas compartidas por los specs de Honorarios (PR-1: SEP): oráculo INDEPENDIENTE de lo esperado a partir de los documentos del fixture (el catálogo de cuentas sale del
// JSON versionado data/honorarios_cuentas_2026.json, no de index.html) y lectores de lo que muestran las vistas.
//
// Reglas del panel (docs/honorarios_spec.md, decisiones del usuario):
//   · Una boleta entra en los totales si su cuenta está en el catálogo de honorarios (36 cuentas del Plan 2026) y su Fecha Documento empieza con aaaa-mm-dd con un mes que existe
//     (cualquier año: solo se mira el mes). La Fecha de Pago nunca mueve el mes. Se suma el Monto Gasto (bruto; sin retención ni líquido).
//   · La proyección de honorarios (por cuenta) es siempre «proyectada» y se SUMA a las boletas (que son siempre «reales»).
//   · 70/30 «opción B»: gasto_personal = remuneraciones + honorarios (cualquier cuenta); gasto_total = rem + hon + B&S.
import fs from 'node:fs';
import path from 'node:path';
import { TESTS_DIR } from './config.mjs';

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
export const REPO = path.join(TESTS_DIR, '..');
export const CATALOGO = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'honorarios_cuentas_2026.json'), 'utf8'));
export const PLAN = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'plan_cuentas_2026.json'), 'utf8'));
export const CUENTAS_HON = new Set(CATALOGO.cuentas.map(c => c.codigo));
export const TIPOS_HON = ['BOLH', 'BHE', 'BOLHE', 'BPST', 'BPSTE'];
/** Cuentas del catálogo habilitadas para una columna del plan (p. ej. 'sep'), en el orden del manual. */
export const cuentasHabilitadas = (col) => CATALOGO.cuentas.filter(c => c.subvenciones.includes(col));

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Mes (nombre) de una fecha de documento, o null si no entra en los totales (no empieza con aaaa-mm-dd o el mes no existe). */
export function mesDeFecha(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f == null ? '' : f));
  return m ? (MESES[Number(m[2]) - 1] || null) : null;
}
const ceros = () => Object.fromEntries(MESES.map(m => [m, 0]));

/** Honorarios de un documento (RBD) del fixture: { boletasPorMes, proyPorMes, boletas, proy, total, porCuenta, excluidas }. */
export function honDe(doc) {
  const boletasPorMes = ceros(), proyPorMes = ceros(), porCuenta = {};
  const excluidas = [];
  Object.entries((doc && doc.honorarios) || {}).forEach(([id, h]) => {
    const mes = mesDeFecha(h && h.fechaDocumento);
    if (!h || typeof h !== 'object' || !CUENTAS_HON.has(String(h.codigo)) || !mes) { excluidas.push(id); return; }
    boletasPorMes[mes] += num(h.montoGasto);
    porCuenta[h.codigo] = (porCuenta[h.codigo] || 0) + num(h.montoGasto);
  });
  Object.values((doc && doc.hon_proyeccion && doc.hon_proyeccion.items) || {}).forEach(it => {
    MESES.forEach(m => { proyPorMes[m] += num(it && it.meses && it.meses[m]); });
  });
  const suma = (o) => MESES.reduce((s, m) => s + o[m], 0);
  const boletas = suma(boletasPorMes), proy = suma(proyPorMes);
  return { boletasPorMes, proyPorMes, boletas, proy, total: boletas + proy, porCuenta, excluidas };
}
/** Suma de los meses 1..hasta de un {MES: monto}. */
export const hastaMes = (o, hasta) => MESES.slice(0, hasta).reduce((s, m) => s + num(o[m]), 0);

// ---------------------------------------------------------------- formato es-CL
export const clp = (n) => (n < 0 ? '-' : '') + '$' + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** '$1.234' → 1234, '-$1.234' → -1234, '—' / '' → 0 */
export function leerCLP(t) {
  const s = String(t == null ? '' : t);
  const n = Number(s.replace(/[^\d-]/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? n : 0;
}

// ---------------------------------------------------------------- lectura de la pantalla
/** Rótulo → valor (texto) de las tarjetas KPI de un contenedor (#kpiRow, #kpiRowReal, #kpiRowProy). */
export function tarjetas(page, contenedor) {
  return page.evaluate((c) => {
    const o = {};
    document.querySelectorAll(c + ' .kpi-card').forEach(card => { o[card.querySelector('.label').textContent.trim()] = card.querySelector('.value').textContent.trim(); });
    return o;
  }, contenedor);
}
/** Una fila de la tabla «Estado por RBD»: data-field → texto de la celda. */
export function filaSepTexto(page, rbd) {
  return page.evaluate((r) => {
    const tr = document.querySelector(`#tableBody tr.rbd-row[data-rbd="${r}"]`);
    if (!tr) return null;
    const o = {};
    tr.querySelectorAll('[data-field]').forEach(td => { o[td.dataset.field] = td.textContent.trim(); });
    return o;
  }, rbd);
}
/** Meses de una fila de solo lectura del detalle de SEP (por la etiqueta de su 1.ª celda): { ENERO: n, …, total } o null si no existe. */
export function filaDetalleMeses(page, etiqueta) {
  return page.evaluate(([et, meses]) => {
    const tr = Array.from(document.querySelectorAll('#modalBody tr')).find(x => { const l = x.querySelector('td.item-label'); return l && l.textContent.trim() === et && !x.querySelector('input'); });
    if (!tr) return null;
    const num = (t) => { const s = t.replace(/[^\d-]/g, ''); return /\d/.test(t) ? Number(s) : 0; };
    const o = {};
    meses.forEach((m, i) => { o[m] = num(tr.children[1 + i].textContent); });
    o.total = num(tr.children[13].textContent);
    return o;
  }, [etiqueta, MESES]);
}
/** Valores de las celdas editables de una fila de proyección del detalle (por cuenta). */
export function filaProyeccion(page, codigo) {
  return page.evaluate(([cod, meses]) => {
    const inputs = Array.from(document.querySelectorAll(`#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="${cod}"]`));
    if (!inputs.length) return null;
    const o = {};
    inputs.forEach(i => { o[i.dataset.mes] = i.value === '' ? 0 : Number(i.value.replace(',', '.')); });
    return meses.reduce((acc, m) => { acc[m] = o[m] || 0; return acc; }, {});
  }, [codigo, MESES]);
}
/** Rellena el formulario de honorarios del modal de SEP (campos: codigo, tipoDocumento, nroDocumento, fechaDocumento, fechaPago, descripcion, rutProveedor, nombreProveedor, montoGasto, montoDocumento, documentoContable). */
export async function llenarFormHon(page, campos) {
  const sel = (f) => `#modalBody .hon-form-grid .hon-input[data-field="${f}"]`;
  if (campos.codigo !== undefined) await page.selectOption(sel('codigo'), campos.codigo);
  for (const [f, v] of Object.entries(campos)) {
    if (f === 'codigo') continue;
    if (f === 'tipoDocumento') await page.selectOption(sel(f), v);
    else await page.fill(sel(f), String(v));
  }
}
/** Lo escrito en los campos del formulario de honorarios, como objeto. */
export function leerFormHon(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll('#modalBody .hon-form-grid .hon-input').forEach(el => { o[el.dataset.field] = el.value; });
    return o;
  });
}
/** Boleta de ejemplo (todos los campos que guarda el panel). */
export const boleta = (extra = {}) => ({
  codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '54', fechaDocumento: '2026-01-21', fechaPago: '2026-01-28', descripcion: 'Taller de ajedrez enero 2026',
  rutProveedor: '11111111-1', nombreProveedor: 'Nombre Apellido Apellido', montoGasto: 600000, montoDocumento: 600000, ...extra,
});
/** Mapa {rbd: documento} del fixture `default` SIN boletas ni proyección de honorarios (lo que el spec agrega es lo único que pesa). */
export function docsSinHonorarios(docs) {
  const o = JSON.parse(JSON.stringify(docs));
  Object.values(o).forEach(d => { delete d.honorarios; delete d.hon_proyeccion; });
  return o;
}
