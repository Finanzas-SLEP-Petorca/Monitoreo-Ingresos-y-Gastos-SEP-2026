// Ayudas compartidas por los specs de compras (signo de notas de crédito/débito, ID "0" al importar, avisos de fecha).
//   fixtureSinCompras()      documentos del fixture `default` SIN compras ni proyección de B&S: lo que el spec agrega es lo único que pesa en los totales
//   compraBase(extra)        una compra SEP/fuente válida (código 410606, factura electrónica, fecha de 2026)
//   libroXlsx(page, hojas)   arma un .xlsx dentro de la página (SheetJS embebido) a partir de { HOJA: filas[][] } y devuelve el Buffer
//   importarLibro(h, sel, b) sube un .xlsx por el <input type=file> del panel y espera el alert de resumen + el guardado
//   celdaItem(page, item, mes)  texto de la celda de un ítem (Subt. 22/29) del modal de SEP para un mes
import { cargarFixture } from './boot.mjs';

export function fixtureSinCompras() {
  const docs = JSON.parse(JSON.stringify(cargarFixture('default').docs));
  Object.values(docs).forEach(d => {
    if (d.compras) d.compras = {};
    if (d.bys_proyeccion) d.bys_proyeccion = { items: {} };
    Object.values(d.otras_fuentes || {}).forEach(o => {
      if (!o) return;
      if (o.compras) o.compras = {};
      if (o.bys_proy_items) o.bys_proy_items = {};
    });
  });
  return docs;
}

export const compraBase = (extra = {}) => ({
  codigo: '410606', tipoDocumento: 'Factura electrónica', nroDocumento: '1', fechaDocumento: '2026-03-10', fechaPago: '2026-03-20',
  descripcion: 'Compra de prueba', rutProveedor: '76.123.456-7', nombreProveedor: 'Proveedor SpA', montoGasto: 1000, montoDocumento: 1190, documentoOriginal: '',
  ...extra,
});

// Encabezados de la hoja COMPRAS (SEP: "Establecimiento"; fuentes: "Nombre"), igual que los exporta el panel.
export const ENC_COMPRAS_SEP = ['ID', 'RBD', 'Establecimiento', 'Codigo', 'TipoDocumento', 'NroDocumento', 'FechaDocumento', 'FechaPago', 'Descripcion', 'RutProveedor', 'NombreProveedor', 'MontoGasto', 'MontoDocumento', 'DocumentoOriginal', 'N° DC'];
export const ENC_COMPRAS_FUENTE = ['ID', 'RBD', 'Nombre', 'Codigo', 'TipoDocumento', 'NroDocumento', 'FechaDocumento', 'FechaPago', 'Descripcion', 'RutProveedor', 'NombreProveedor', 'MontoGasto', 'MontoDocumento', 'DocumentoOriginal', 'N° DC'];

// Fila de la hoja COMPRAS a partir de una compra (id puede ser '', 0, '0' o un ID real).
export function filaCompra(id, rbd, nombre, c) {
  return [id, rbd, nombre, c.codigo, c.tipoDocumento, c.nroDocumento, c.fechaDocumento, c.fechaPago, c.descripcion, c.rutProveedor, c.nombreProveedor, c.montoGasto, c.montoDocumento, c.documentoOriginal || '', c.documentoContable || ''];
}

export async function libroXlsx(page, hojas) {
  const bytes = await page.evaluate((h) => {
    const wb = XLSX.utils.book_new();
    Object.keys(h).forEach(n => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h[n]), n));
    return Array.from(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })));
  }, hojas);
  return Buffer.from(bytes);
}

export async function importarLibro(h, inputSelector, buffer, nombre = 'carga.xlsx') {
  const antes = h.dialogs.length;
  await h.page.setInputFiles(inputSelector, { name: nombre, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  for (let i = 0; i < 200 && h.dialogs.length === antes; i++) await h.page.waitForTimeout(50); // el alert llega tras leer el archivo
  await h.flushWrites();
  await h.waitIdle();
  return h.dialogs.slice(antes).map(d => d.message);
}

// Texto de la celda (ítem de Subt. 22/29, mes) del detalle de un RBD de SEP; null si no existe la fila.
export async function celdaItem(page, nombreItem, mes) {
  return page.evaluate(([item, m]) => {
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const fila = Array.from(document.querySelectorAll('#modalBody tr')).find(tr => { const l = tr.querySelector('td.item-label'); return l && l.textContent.trim() === item && !tr.querySelector('input'); });
    if (!fila) return null;
    return fila.children[1 + meses.indexOf(m)].textContent.trim();
  }, [nombreItem, mes]);
}

// Texto de las celdas de monto de la fila de una compra en la tabla del modal (SEP o fuente): { gasto, documento }.
export async function montosFilaCompra(page, modalSelector, compraId) {
  return page.evaluate(([sel, id]) => {
    const tr = Array.from(document.querySelectorAll(`${sel} tr[data-compra-id]`)).find(x => x.dataset.compraId === id);
    if (!tr) return null;
    const nums = Array.from(tr.querySelectorAll('td.num')).map(td => td.textContent.trim());
    return { gasto: nums[0], documento: nums[1] };
  }, [modalSelector, compraId]);
}

// Abre el modal de un RBD de SEP (y espera a que se pinte).
export async function abrirModalSep(h, rbd) {
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
export async function cerrarModalSep(h) {
  await h.page.keyboard.press('Escape');
  await h.waitIdle();
}
export async function abrirModalFuente(h, fuente, id) {
  await h.clickTab('of-' + fuente);
  await h.page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${id}"]`);
  await h.waitIdle();
}
