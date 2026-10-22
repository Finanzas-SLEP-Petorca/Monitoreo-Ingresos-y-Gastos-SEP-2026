// n_dc: campo propio "N° DC" (Documento Contable interno, `documentoContable`) en el registro de compras.
//
// Antes el número de DC (DC_344, DC-33, "DC_22 - No hay PME"…) se anotaba en "Doc. original", que en realidad solo sirve para
// las notas de crédito/débito del CSV de SUPEREDUC. Ahora:
//   · SEP y las 4 fuentes con compras (General, PIE, Mantención, Pro-Retención, también la entidad AC) tienen el campo "N° DC" en el
//     formulario y en la tabla (columna visible siempre, justo antes de "Doc. original"); ✏️ / ⧉ / 🗑 siguen funcionando;
//   · "Doc. original" queda para NC/ND: se ATENÚA (no se deshabilita) con otro tipo de documento;
//   · un DC legado en "Doc. original" se MUESTRA como N° DC (derivado, en cursiva) y el botón admin "Migrar DC (n)" lo mueve;
//   · el CSV de SUPEREDUC NO lleva el N° DC y un DC legado no sale como "Documento Original" (cuenta como "sin Documento Original");
//   · el Excel de respaldo/importación y el XLS/PDF por fila traen la columna "N° DC" (los archivos antiguos sin ella se importan igual).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const DEL = { __sentinel: 'deleteField' };
const MODAL = '#modalBody';
const MODAL_OF = '#otrasFuentesModalBody';
const AYUDA_DC = 'Documento contable interno: carpeta/SET con el respaldo';
const AYUDA_ORIG = 'Solo notas de crédito/débito: número-TIPO, p. ej. 123-FAC';
const TITULO_DERIVADO = 'Tomado de Doc. original; usa «Migrar DC» para moverlo';
const ENCABEZADO_CSV = 'RBD;Subvencion;Codigo Cuenta;Tipo de Documento;Nro Documento;Fecha Documento;Fecha Pago;Descripcion Gasto;Rut Proveedor;Nombre Proveedor;Monto Gasto;Monto Documento;Documento Original';

const writesDe = (ws, id) => ws.filter(w => w.path === RUTA(id));
const docDe = async (h, id) => (await h.store())[RUTA(id)];
const clon = (o) => JSON.parse(JSON.stringify(o));
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
}
async function abrirSep(h, rbd = '1121') {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
async function abrirFuente(h, fuente, rbd = '1121') {
  await clickTab(h.page, 'of-' + fuente);
  await h.page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${rbd}"]`);
  await h.waitIdle();
}
async function cerrarModales(h) { await h.page.keyboard.press('Escape'); await h.waitIdle(); }
// Llena el formulario de compras de SEP ('sep') o de una fuente ('of') con { campo: valor }.
async function llenar(page, ambito, campos) {
  const base = ambito === 'sep' ? `${MODAL} .compra-input` : `${MODAL_OF} .compra-input.of-compra-input`;
  for (const [campo, valor] of Object.entries(campos)) {
    const sel = `${base}[data-field="${campo}"]`;
    if (campo === 'codigo' || campo === 'tipoDocumento') await page.selectOption(sel, valor);
    else await page.fill(sel, String(valor));
  }
}
const CAMPOS_BASE = { codigo: '410605', tipoDocumento: 'Factura', nroDocumento: 'N-1', fechaDocumento: '2026-04-10', fechaPago: '2026-04-20', descripcion: 'Compra N° DC', rutProveedor: '76.1-1', nombreProveedor: 'Proveedor DC', montoGasto: '250000', montoDocumento: '297500' };
const CAMPOS_BASE_OF = { ...CAMPOS_BASE, codigo: '410503' };
// Celdas de una fila de la tabla de compras (texto de cada <td>).
const celdasFila = (page, modal, id) => page.evaluate(([m, i]) => {
  const tr = document.querySelector(`${m} tr[data-compra-id="${CSS.escape(i)}"]`);
  return tr ? Array.from(tr.children).map(td => td.textContent.trim()) : null;
}, [modal, id]);
const encabezados = (page, modal) => page.evaluate((m) => Array.from(document.querySelectorAll(`${m} table.compras-table thead th`)).map(th => th.textContent.trim()), modal);
const celdaDc = (page, modal, id) => page.evaluate(([m, i]) => {
  const td = document.querySelector(`${m} tr[data-compra-id="${CSS.escape(i)}"] td.col-dc`);
  if (!td) return null;
  const em = td.querySelector('em.dc-derivado');
  return { texto: td.textContent.trim(), derivado: !!em, title: em ? em.title : '', html: td.innerHTML };
}, [modal, id]);

const COMPRA_BASE = { codigo: '410606', tipoDocumento: 'Factura electrónica', nroDocumento: '1001', fechaDocumento: '2026-05-07', fechaPago: '2026-05-07', descripcion: 'Resmas de papel',
  rutProveedor: '76.123.456-7', nombreProveedor: 'Papelera SpA', montoGasto: 1000, montoDocumento: 1000, documentoOriginal: '' };
const compra = (extra) => ({ ...COMPRA_BASE, ...extra });

await correrSpec('n_dc', async (t) => {
  const fx = cargarFixture('default').docs;

  // ============================================================================================ 1) SEP: formulario y tabla
  await escenario(t, 'SEP formulario/tabla', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h);
    const f = await page.evaluate(([modal]) => {
      const grid = document.querySelector(`${modal} .compra-form-grid`);
      const dc = grid.querySelector('.compra-input[data-field="documentoContable"]');
      const orig = grid.querySelector('.compra-input[data-field="documentoOriginal"]');
      const rot = (el) => el.closest('label').querySelector('.compra-field-label').textContent.trim();
      return {
        orden: Array.from(grid.querySelectorAll('.compra-input')).map(e => e.dataset.field),
        dc: { etiqueta: rot(dc), maxlength: dc.maxLength, title: dc.title, titleLabel: dc.closest('label').title, tipo: dc.type, disabled: dc.disabled },
        orig: { etiqueta: rot(orig), title: orig.title, titleLabel: orig.closest('label').title, disabled: orig.disabled, readOnly: orig.readOnly },
        nombresAccesibles: [dc, orig].map(e => e.labels && e.labels[0] ? e.labels[0].textContent.replace(/\s+/g, ' ').trim() : ''),
      };
    }, [MODAL]);
    t.eq(f.orden.slice(-3), ['montoDocumento', 'documentoContable', 'documentoOriginal'], 'SEP: el formulario tiene N° DC (documentoContable) justo antes de Doc. original');
    t.eq(f.dc.etiqueta, 'N° DC', 'SEP: el rótulo del campo es "N° DC"');
    t.eq([f.dc.maxlength, f.dc.tipo, f.dc.disabled], [100, 'text', false], 'SEP: N° DC es texto libre de hasta 100 caracteres');
    t.eq([f.dc.title, f.dc.titleLabel], [AYUDA_DC, AYUDA_DC], 'SEP: la ayuda de N° DC es "Documento contable interno: carpeta/SET con el respaldo"');
    t.eq(f.orig.etiqueta, 'Doc. original (NC/ND)', 'SEP: el rótulo de Doc. original aclara que es solo para NC/ND');
    t.eq([f.orig.title, f.orig.titleLabel], [AYUDA_ORIG, AYUDA_ORIG], 'SEP: la ayuda de Doc. original es "Solo notas de crédito/débito: número-TIPO, p. ej. 123-FAC"');
    t.eq(f.nombresAccesibles, ['N° DC', 'Doc. original (NC/ND)'], 'SEP: ambos campos tienen su <label> (nombre accesible)');
    const ths = await encabezados(page, MODAL);
    t.eq(ths.slice(-4, -1), ['Monto doc.', 'N° DC', 'Doc. original'], 'SEP: la tabla tiene la columna N° DC siempre visible, junto a Doc. original', ths);
    t.eq(await page.evaluate((m) => document.querySelector(`${m} .compras-section .detalle-sub`).textContent.includes('no va en el CSV de SUPEREDUC'), MODAL), true, 'SEP: el encabezado de la sección explica que N° DC es interno y no va en el CSV de SUPEREDUC');

    // DC propio (c1121_5), derivado de Doc. original (c1121_3, c1121_4, c1121_mismo_mes) y compra sin DC (c1121_1)
    const propio = await celdaDc(page, MODAL, 'c1121_5');
    t.ok(propio && propio.texto === 'DC_501' && !propio.derivado, 'SEP: una compra con documentoContable muestra su N° DC (normal, no derivado)', propio);
    const c3 = await celdaDc(page, MODAL, 'c1121_3');
    t.ok(c3 && c3.texto === 'DC_344' && c3.derivado && c3.title === TITULO_DERIVADO, 'SEP: el DC legado de Doc. original ("DC_344") se muestra en N° DC como derivado (cursiva + title "Tomado de Doc. original…")', c3);
    const cursiva = await page.evaluate((m) => getComputedStyle(document.querySelector(`${m} tr[data-compra-id="c1121_3"] td.col-dc em`)).fontStyle, MODAL);
    t.eq(cursiva, 'italic', 'SEP: el N° DC derivado se ve en cursiva');
    t.eq((await celdaDc(page, MODAL, 'c1121_4')).texto, 'DC_22 - No hay PME', 'SEP: "DC_22 - No hay PME" se muestra COMPLETO (sin parsear el comentario)');
    t.eq((await celdaDc(page, MODAL, 'c1121_mismo_mes')).texto, 'DC-33', 'SEP: "DC-33" también se reconoce');
    const sinDc = await celdaDc(page, MODAL, 'c1121_1');
    t.ok(sinDc && sinDc.texto === '' && !sinDc.derivado, 'SEP: una compra sin DC deja la celda vacía (DOC-1121-1 no es un DC)', sinDc);
    const cel3 = await celdasFila(page, MODAL, 'c1121_3');
    t.eq(cel3.slice(-3, -1), ['DC_344', 'DC_344'], 'SEP: Doc. original conserva lo guardado (el valor sigue ahí hasta migrarlo)', cel3);
    const celEsp = await celdaDc(page, MODAL, 'c1121_especial');
    t.eq(celEsp.texto, `DC_<9> & 'Z'; "Q"`, 'SEP: caracteres especiales en N° DC se ven literales (escapados)');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 2) Doc. original: atenuado, no deshabilitado
  await escenario(t, 'Doc. original atenuado', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h);
    const estado = () => page.evaluate((m) => {
      const orig = document.querySelector(`${m} .compra-input[data-field="documentoOriginal"]`);
      const lab = orig.closest('label').querySelector('.compra-field-label');
      const dc = document.querySelector(`${m} .compra-input[data-field="documentoContable"]`);
      return { borde: getComputedStyle(orig).borderTopStyle, color: getComputedStyle(lab).color, disabled: orig.disabled, readOnly: orig.readOnly, tab: orig.tabIndex, bordeDc: getComputedStyle(dc).borderTopStyle, colorDc: getComputedStyle(dc.closest('label').querySelector('.compra-field-label')).color };
    }, MODAL);
    const sin = await estado();
    t.eq([sin.borde, sin.disabled, sin.readOnly, sin.tab], ['dashed', false, false, 0], 'sin tipo de documento: Doc. original se ATENÚA (borde punteado) pero NO se deshabilita ni queda de solo lectura');
    await page.selectOption(`${MODAL} .compra-input[data-field="tipoDocumento"]`, 'Factura');
    const fac = await estado();
    t.eq([fac.borde, fac.color], [sin.borde, sin.color], 'con "Factura": sigue atenuado');
    await page.selectOption(`${MODAL} .compra-input[data-field="tipoDocumento"]`, 'Nota de crédito');
    const nc = await estado();
    t.ok(nc.borde === 'solid' && nc.color !== sin.color && !nc.disabled, 'con "Nota de crédito": Doc. original vuelve al estilo normal', nc);
    await page.selectOption(`${MODAL} .compra-input[data-field="tipoDocumento"]`, 'Nota de débito');
    t.eq((await estado()).borde, 'solid', 'con "Nota de débito": estilo normal');
    t.eq([nc.bordeDc, nc.colorDc], [sin.bordeDc, sin.colorDc], 'N° DC nunca se atenúa (mismo estilo con cualquier tipo)');
    // al cargar una compra por código (✏️) el estado sigue al tipo cargado, sin eventos change
    await page.selectOption(`${MODAL} .compra-input[data-field="tipoDocumento"]`, '');
    await page.click(`${MODAL} button.compra-edit-btn[data-compra-id="c1121_nc"]`);
    t.eq((await estado()).borde, 'solid', '✏️ sobre una nota de crédito: Doc. original en estilo normal');
    await page.click(`${MODAL} button.compra-edit-btn[data-compra-id="c1121_3"]`);
    t.eq((await estado()).borde, 'dashed', '✏️ sobre una factura: Doc. original atenuado');
    await page.click(`${MODAL} .cancelar-edicion-btn`);
    // sigue siendo editable y guarda lo escrito aunque el tipo no sea NC/ND (no se pierde nada)
    await h.clearWrites();
    await llenar(page, 'sep', { ...CAMPOS_BASE, tipoDocumento: 'Factura', documentoOriginal: '123-FAC', documentoContable: 'DC_700' });
    await page.click(`${MODAL} .add-compra-btn`);
    await h.flushWrites();
    const w = writesDe(await h.writes(), '1121');
    const c = w[0] && Object.values(w[0].payload.compras)[0];
    t.ok(c && c.documentoOriginal === '123-FAC' && c.documentoContable === 'DC_700', 'un Doc. original escrito con un tipo que no es NC/ND se guarda igual (nada se bloquea ni se pierde)', c);
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 3) SEP: agregar, editar, duplicar, borrar
  await escenario(t, 'SEP agregar/editar/duplicar/borrar', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h);
    // --- agregar (con espacios alrededor: se recortan)
    await h.clearWrites();
    await llenar(page, 'sep', { ...CAMPOS_BASE, documentoContable: '  DC_999  ' });
    await page.click(`${MODAL} .add-compra-btn`);
    await h.flushWrites();
    let w = writesDe(await h.writes(), '1121');
    t.eq(w.length, 1, 'agregar: 1 write inmediato');
    const ids = Object.keys(w[0].payload.compras || {});
    t.eq(ids.length, 1, 'agregar: el payload trae una sola compra');
    const idNueva = ids[0];
    t.ok(w[0].options.merge === true && w[0].path === RUTA('1121') && w[0].payload.compras[idNueva].documentoContable === 'DC_999', 'agregar: merge:true en sep_carga_rbd/1121 con compras.<id>.documentoContable = "DC_999" (recortado)', w[0].payload);
    t.eq(w[0].payload.compras[idNueva].documentoOriginal, '', 'agregar: documentoOriginal se guarda vacío (como siempre cuando no se escribe)');
    t.eq(Object.keys(w[0].payload).sort(), ['compras', 'lastModifiedAt', 'lastModifiedBy', 'nombre'].sort(), 'agregar: el write solo toca las compras (más auditoría y nombre)');
    t.eq((await docDe(h, '1121')).compras[idNueva].documentoContable, 'DC_999', 'agregar: el servidor guarda el N° DC en el mismo mapa de la compra');
    let dc = await celdaDc(page, MODAL, idNueva);
    t.ok(dc && dc.texto === 'DC_999' && !dc.derivado, 'agregar: la fila nueva muestra DC_999', dc);
    t.eq(await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`), '', 'agregar: el formulario se limpia (también N° DC)');
    // --- límite de 100 caracteres al teclear
    await page.focus(`${MODAL} .compra-input[data-field="documentoContable"]`);
    await page.keyboard.type('X'.repeat(130));
    t.eq((await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`)).length, 100, 'N° DC: al teclear no pasa de 100 caracteres');
    await page.fill(`${MODAL} .compra-input[data-field="documentoContable"]`, '');
    // --- editar (✏️): carga el N° DC, se cambia y se guarda en la MISMA compra
    const antesEdicion = clon((await docDe(h, '1121')).compras.c1121_5);
    const nFilas = await page.locator(`${MODAL} tr[data-compra-id]`).count();
    await page.click(`${MODAL} button.compra-edit-btn[data-compra-id="c1121_5"]`);
    t.eq(await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`), 'DC_501', '✏️: el formulario recibe el N° DC de la compra');
    t.eq(await page.inputValue(`${MODAL} .compra-input[data-field="documentoOriginal"]`), '', '✏️: y su Doc. original (vacío)');
    await page.fill(`${MODAL} .compra-input[data-field="documentoContable"]`, 'DC_502');
    await h.clearWrites();
    await page.click(`${MODAL} .add-compra-btn`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    t.eq(Object.keys(w[0].payload.compras), ['c1121_5'], '✏️: el write es sobre la misma compra (no crea otra)');
    t.ok(w[0].payload.compras.c1121_5.documentoContable === 'DC_502' && w[0].payload.compras.c1121_5.documentoOriginal === antesEdicion.documentoOriginal, '✏️: cambia documentoContable y NO toca documentoOriginal', w[0].payload.compras.c1121_5);
    const despuesEdicion = (await docDe(h, '1121')).compras.c1121_5;
    t.eq({ ...despuesEdicion, documentoContable: 'DC_501' }, antesEdicion, '✏️: el resto de la compra queda igual');
    t.eq(await page.locator(`${MODAL} tr[data-compra-id]`).count(), nFilas, '✏️: no se duplicó la fila');
    // --- editar una compra con DC legado: no se migra sola, no se pierde nada
    await page.click(`${MODAL} button.compra-edit-btn[data-compra-id="c1121_3"]`);
    t.eq([await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`), await page.inputValue(`${MODAL} .compra-input[data-field="documentoOriginal"]`)], ['', 'DC_344'], '✏️ sobre una compra con DC legado: el formulario muestra Doc. original = DC_344 y N° DC vacío (no migra solo)');
    await h.clearWrites();
    await page.click(`${MODAL} .add-compra-btn`);
    await h.flushWrites();
    const c3 = (await docDe(h, '1121')).compras.c1121_3;
    t.eq(c3.documentoOriginal, 'DC_344', '✏️ guardar sin tocar: el DC legado sigue en Doc. original (no se pierde)');
    dc = await celdaDc(page, MODAL, 'c1121_3');
    t.ok(dc && dc.derivado && dc.texto === 'DC_344', '✏️ guardar sin tocar: la celda N° DC sigue mostrando el derivado', dc);
    // --- duplicar (⧉): mismos datos incluido el N° DC, queda como compra nueva
    await page.click(`${MODAL} button.compra-dup-btn[data-compra-id="c1121_5"]`);
    t.eq(await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`), 'DC_502', '⧉: el formulario recibe el N° DC');
    t.eq(await page.evaluate((m) => ({ edit: document.querySelector(`${m} .compra-form-grid`).dataset.editingId || null, boton: document.querySelector(`${m} .add-compra-btn`).textContent }), MODAL), { edit: null, boton: '+ Agregar compra' }, '⧉: no está en modo edición (se creará una compra nueva)');
    await h.clearWrites();
    await page.click(`${MODAL} .add-compra-btn`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    const idDup = Object.keys(w[0].payload.compras)[0];
    t.ok(idDup !== 'c1121_5' && w[0].payload.compras[idDup].documentoContable === 'DC_502', '⧉: la copia es una compra nueva con el mismo N° DC', w[0].payload);
    t.eq((await docDe(h, '1121')).compras.c1121_5.documentoContable, 'DC_502', '⧉: la original no cambia');
    // --- borrar (🗑): deleteField sobre la compra entera
    await h.clearWrites();
    await page.click(`${MODAL} button.compra-del-btn[data-compra-id="${idDup}"]`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    t.eq(w[0].payload.compras, { [idDup]: DEL }, '🗑: payload { compras: { <id>: deleteField() } } (el N° DC se va con la compra)');
    t.ok(!(idDup in (await docDe(h, '1121')).compras), '🗑: el servidor ya no tiene la compra');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 4) XSS en N° DC (escrito, derivado y en las fuentes)
  await escenario(t, 'XSS', async () => {
    const P = { img: '<img src=x onerror="window.__xss=(window.__xss||0)+1">', svg: '"><svg onload=window.__xss=2>', script: '<script>window.__xss=3</script>' };
    const docs = clon(fx);
    docs['1121'].compras.xDc = compra({ nroDocumento: 'X1', documentoContable: `DC_1 ${P.img}` });
    docs['1121'].compras.xLeg = compra({ nroDocumento: 'X2', documentoOriginal: `DC_2 ${P.svg} ${P.script}` });    // legado con marcado: se muestra derivado, escapado
    docs['1121'].otras_fuentes.general.compras.xDcOf = compra({ codigo: '410503', nroDocumento: 'X3', documentoContable: `DC_3 ${P.svg}` });
    docs['1121'].otras_fuentes.pie.compras.xLegOf = compra({ codigo: '410503', nroDocumento: 'X4', documentoOriginal: `DC_4 ${P.img}` });
    const h = await boot({ fixture: docs });
    const { page } = h;
    const malos = () => page.evaluate(() => ({ xss: window.__xss || 0, nodos: document.querySelectorAll('#app img[src="x"], #app svg[onload], #app [onerror], #app [onload], #printSingleWrap img[src="x"], #printSingleWrap svg[onload]').length, scripts: document.querySelectorAll('#app script:not([type="module"]), #printSingleWrap script').length }));
    await abrirSep(h);
    let m = await malos();
    t.eq(m, { xss: 0, nodos: 0, scripts: 0 }, 'SEP: ni el N° DC ni un DC legado con marcado ejecutan ni crean nodos');
    t.eq((await celdaDc(page, MODAL, 'xDc')).texto, `DC_1 ${P.img}`, 'SEP: el N° DC con <img onerror> se ve literal');
    const leg = await celdaDc(page, MODAL, 'xLeg');
    t.ok(leg.derivado && leg.texto === `DC_2 ${P.svg} ${P.script}`, 'SEP: el DC legado derivado con marcado se ve literal (y sigue en cursiva)', leg);
    // editar una compra con N° DC peligroso: el formulario recibe el texto exacto
    await page.click(`${MODAL} button.compra-edit-btn[data-compra-id="xDc"]`);
    t.eq(await page.inputValue(`${MODAL} .compra-input[data-field="documentoContable"]`), `DC_1 ${P.img}`, '✏️: el formulario recibe el N° DC exacto (sin escapes)');
    await page.click(`${MODAL} .cancelar-edicion-btn`);
    await cerrarModales(h);
    // PDF por fila (HTML imprimible)
    await page.evaluate(() => document.querySelector('.row-action-btn[data-action="pdf"][data-rbd="1121"]').click());
    await h.waitIdle();
    m = await malos();
    t.eq(m, { xss: 0, nodos: 0, scripts: 0 }, 'SEP PDF por fila: sin nodos peligrosos');
    await cerrarModales(h);
    await abrirFuente(h, 'general');
    t.eq((await celdaDc(page, MODAL_OF, 'xDcOf')).texto, `DC_3 ${P.svg}`, 'General: el N° DC con marcado se ve literal');
    t.eq(await malos(), { xss: 0, nodos: 0, scripts: 0 }, 'General: sin nodos peligrosos');
    await cerrarModales(h);
    await page.evaluate(() => document.querySelector('#otrasFuentesTbody-general .row-action-btn[data-action="pdf"][data-rbd="1121"]').click());
    await h.waitIdle();
    t.eq(await malos(), { xss: 0, nodos: 0, scripts: 0 }, 'General PDF por entidad: sin nodos peligrosos');
    await cerrarModales(h);
    await abrirFuente(h, 'pie');
    const legOf = await celdaDc(page, MODAL_OF, 'xLegOf');
    t.ok(legOf.derivado && legOf.texto === `DC_4 ${P.img}`, 'PIE: el DC legado derivado con marcado se ve literal', legOf);
    t.eq(await malos(), { xss: 0, nodos: 0, scripts: 0 }, 'PIE: sin nodos peligrosos');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 5) Detección del DC legado (tolerante, no calza con 123-FAC)
  await escenario(t, 'Detección del DC legado', async () => {
    const muestras = [
      ['DC_344', 'DC_344'], ['DC-33', 'DC-33'], ['dc 12', 'dc 12'], ['  DC_9  ', 'DC_9'], ['DC_22 - No hay PME', 'DC_22 - No hay PME'], ['DC344', 'DC344'], ['DC__7 (carpeta azul)', 'DC__7 (carpeta azul)'],
      ['123-FAC', null], ['45 - Factura electrónica', null], ['DCX', null], ['Folio DC_3', null], ['DC_', null], ['', null], ['D-33', null],
    ];
    const docs = clon(fx);
    docs['1121'].compras = {};
    muestras.forEach(([v], i) => { docs['1121'].compras['m' + i] = compra({ nroDocumento: 'M' + i, documentoOriginal: v }); });
    docs['1121'].compras.mConDc = compra({ nroDocumento: 'MD', documentoOriginal: 'DC_5', documentoContable: 'DC_6' });   // el N° DC propio manda sobre el legado
    const h = await boot({ fixture: docs });
    await abrirSep(h);
    for (let i = 0; i < muestras.length; i++) {
      const [orig, esperado] = muestras[i];
      const dc = await celdaDc(h.page, MODAL, 'm' + i);
      if (esperado === null) t.ok(dc && dc.texto === '' && !dc.derivado, `"${orig}" NO es un DC legado: la celda N° DC queda vacía`, dc);
      else t.ok(dc && dc.texto === esperado && dc.derivado && dc.title === TITULO_DERIVADO, `"${orig}" es un DC legado: se muestra derivado`, dc);
    }
    const dcPropio = await celdaDc(h.page, MODAL, 'mConDc');
    t.ok(dcPropio.texto === 'DC_6' && !dcPropio.derivado, 'con N° DC propio ("DC_6") y un legado en Doc. original ("DC_5"): se muestra el propio, sin cursiva', dcPropio);
    t.eq((await celdasFila(h.page, MODAL, 'mConDc')).slice(-3, -1), ['DC_6', 'DC_5'], 'y Doc. original conserva "DC_5" tal cual');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 6) Fuentes con compras (General, PIE, Mantención, Pro-Retención y la entidad AC)
  await escenario(t, 'Fuentes', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    for (const [fuente, rbd] of [['general', '1121'], ['general', 'AC'], ['pie', '1121'], ['mantenimiento', '1121'], ['prorretencion', '1121'], ['pie', 'AC']]) {
      await abrirFuente(h, fuente, rbd);
      const f = await page.evaluate((m) => {
        const grid = document.querySelector(`${m} .compra-form-grid`);
        const dc = grid.querySelector('.compra-input[data-field="documentoContable"]');
        const orig = grid.querySelector('.compra-input[data-field="documentoOriginal"]');
        return { orden: Array.from(grid.querySelectorAll('.compra-input')).map(e => e.dataset.field).slice(-2), etiqueta: dc.closest('label').querySelector('.compra-field-label').textContent.trim(), ofClase: dc.classList.contains('of-compra-input'), maxlength: dc.maxLength, title: dc.title, etiquetaOrig: orig.closest('label').querySelector('.compra-field-label').textContent.trim(), titleOrig: orig.title, disabledOrig: orig.disabled };
      }, MODAL_OF);
      t.eq(f, { orden: ['documentoContable', 'documentoOriginal'], etiqueta: 'N° DC', ofClase: true, maxlength: 100, title: AYUDA_DC, etiquetaOrig: 'Doc. original (NC/ND)', titleOrig: AYUDA_ORIG, disabledOrig: false }, `${fuente} › ${rbd}: formulario con N° DC (100 caracteres, ayuda) y Doc. original (NC/ND) sin deshabilitar`);
      const ths = await encabezados(page, MODAL_OF);
      t.eq(ths.slice(-4, -1), ['Monto doc.', 'N° DC', 'Doc. original'], `${fuente} › ${rbd}: la tabla tiene la columna N° DC junto a Doc. original`, ths);
      await cerrarModales(h);
    }
    // General › 1121: DC legado derivado
    await abrirFuente(h, 'general');
    const leg = await celdaDc(page, MODAL_OF, 'oge_1121_1');
    t.ok(leg && leg.texto === 'DC_77' && leg.derivado && leg.title === TITULO_DERIVADO, 'General › 1121: el DC legado de Doc. original se muestra derivado', leg);
    // agregar con N° DC en General: la ruta es otras_fuentes.general.compras.<id>
    await h.clearWrites();
    await llenar(page, 'of', { ...CAMPOS_BASE_OF, documentoContable: 'DC_1000' });
    await page.click(`${MODAL_OF} .of-add-compra-btn`);
    await h.flushWrites();
    let w = writesDe(await h.writes(), '1121');
    const ids = Object.keys((w[0].payload.otras_fuentes.general || {}).compras || {});
    t.ok(w.length === 1 && ids.length === 1 && w[0].options.merge === true && w[0].payload.otras_fuentes.general.compras[ids[0]].documentoContable === 'DC_1000', 'General › 1121: el write contiene otras_fuentes.general.compras.<id>.documentoContable en merge', w[0] && w[0].payload);
    t.eq(Object.keys(w[0].payload.otras_fuentes), ['general'], 'General › 1121: el write solo toca la fuente General');
    t.eq((await docDe(h, '1121')).otras_fuentes.general.compras[ids[0]].documentoContable, 'DC_1000', 'General › 1121: el servidor lo guarda en el mapa de la compra');
    const nueva = await celdaDc(page, MODAL_OF, ids[0]);
    t.ok(nueva && nueva.texto === 'DC_1000' && !nueva.derivado, 'General › 1121: la fila nueva muestra el N° DC', nueva);
    t.eq(await page.inputValue(`${MODAL_OF} .of-compra-input[data-field="documentoContable"]`), '', 'General › 1121: el formulario se limpia');
    // borrar
    await h.clearWrites();
    await page.click(`${MODAL_OF} button.of-compra-del-btn[data-compra-id="${ids[0]}"]`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    t.eq(w[0].payload.otras_fuentes.general.compras, { [ids[0]]: DEL }, 'General › 1121: borrar sigue siendo deleteField sobre la compra');
    await cerrarModales(h);
    // AC (Administración Central)
    await abrirFuente(h, 'general', 'AC');
    const ac1 = await celdaDc(page, MODAL_OF, 'oge_AC_1');
    t.ok(ac1 && ac1.texto === 'DC_900' && !ac1.derivado, 'General › AC: muestra el N° DC propio', ac1);
    const ac3 = await celdaDc(page, MODAL_OF, 'oge_AC_3');
    t.ok(ac3 && ac3.texto === 'DC_12 - carpeta azul' && ac3.derivado, 'General › AC: muestra el DC legado derivado', ac3);
    await h.clearWrites();
    await llenar(page, 'of', { ...CAMPOS_BASE_OF, documentoContable: 'DC_AC_1' });
    await page.click(`${MODAL_OF} .of-add-compra-btn`);
    await h.flushWrites();
    w = writesDe(await h.writes(), 'AC');
    const idsAc = Object.keys(((w[0] || {}).payload || {}).otras_fuentes?.general?.compras || {});
    t.ok(w.length === 1 && idsAc.length === 1 && w[0].payload.otras_fuentes.general.compras[idsAc[0]].documentoContable === 'DC_AC_1', 'General › AC: el write va a sep_carga_rbd/AC con documentoContable', w[0] && w[0].payload);
    await cerrarModales(h);
    // PIE y Mantención: mismo comportamiento
    await abrirFuente(h, 'pie');
    t.eq((await celdaDc(page, MODAL_OF, 'opi_1121_1')).texto, 'DC_88', 'PIE › 1121: muestra su N° DC propio');
    await cerrarModales(h);
    await abrirFuente(h, 'mantenimiento');
    await h.clearWrites();
    await llenar(page, 'of', { ...CAMPOS_BASE_OF, codigo: '410601', documentoContable: 'DC_M_1' });
    await page.click(`${MODAL_OF} .of-add-compra-btn`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    const idsM = Object.keys(((w[0] || {}).payload || {}).otras_fuentes?.mantenimiento?.compras || {});
    t.ok(idsM.length === 1 && w[0].payload.otras_fuentes.mantenimiento.compras[idsM[0]].documentoContable === 'DC_M_1', 'Mantención: el write incluye documentoContable en otras_fuentes.mantenimiento.compras', w[0] && w[0].payload);
    await cerrarModales(h);
    await abrirFuente(h, 'prorretencion');
    await h.clearWrites();
    await llenar(page, 'of', { ...CAMPOS_BASE_OF, codigo: '410901', documentoContable: 'DC_PR_1' });
    await page.click(`${MODAL_OF} .of-add-compra-btn`);
    await h.flushWrites();
    w = writesDe(await h.writes(), '1121');
    const idsPr = Object.keys(((w[0] || {}).payload || {}).otras_fuentes?.prorretencion?.compras || {});
    t.ok(idsPr.length === 1 && w[0].payload.otras_fuentes.prorretencion.compras[idsPr[0]].documentoContable === 'DC_PR_1', 'Pro-Retención: el write incluye documentoContable en otras_fuentes.prorretencion.compras', w[0] && w[0].payload);
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 7) Migrar DC: solo admin, confirmación, idempotente, valor completo
  await escenario(t, 'Migrar DC (no admin)', async () => {
    const h = await boot({ fixture: 'default', user: 'authorized-nonadmin' });
    const { page } = h;
    await clickTab(page, 'SEP');
    const v = await page.evaluate(() => { const b = document.getElementById('migrarDcBtn'); const r = b.getBoundingClientRect(); return { existe: !!b, oculto: b.classList.contains('hidden'), visible: r.width > 0 && r.height > 0, texto: b.textContent.trim(), duplicados: document.getElementById('limpiarDuplicadosBtn').classList.contains('hidden') }; });
    t.ok(v.existe && v.oculto && !v.visible && v.duplicados, 'una persona autorizada que NO es admin no ve "Migrar DC" (igual que "Revisar duplicados")', v);
    await h.clearWrites();
    await page.evaluate(() => document.getElementById('migrarDcBtn').click());   // aun forzando el clic, la herramienta se niega
    await h.waitIdle();
    t.ok(h.dialogs.some(d => /restringida a Wilson Rojas/.test(d.message)), 'forzando el clic, la herramienta responde que está restringida');
    t.eq((await h.writes()).length, 0, 'y no escribe nada');
    await h.close();
  });

  await escenario(t, 'Migrar DC (admin)', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await clickTab(page, 'SEP');
    const btn = () => page.evaluate(() => { const b = document.getElementById('migrarDcBtn'); const r = b.getBoundingClientRect(); return { oculto: b.classList.contains('hidden'), visible: r.width > 0 && r.height > 0, texto: b.textContent.replace(/\s+/g, ' ').trim() }; });
    let b = await btn();
    t.ok(!b.oculto && b.visible, 'el admin ve el botón "Migrar DC"', b);
    t.ok(/Migrar DC \(5\)$/.test(b.texto), 'el botón muestra el contador: 5 compras con un DC en Doc. original (3 SEP + 2 General)', b.texto);
    t.eq(await page.evaluate(() => document.getElementById('migrarDcBtn').previousElementSibling.id), 'limpiarDuplicadosBtn', 'está junto al botón admin "Revisar duplicados"');
    // cancelar: no escribe
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.evaluate(() => { window.__confirmOriginal = window.confirm; window.confirm = (m) => { (window.__confirms = window.__confirms || []).push(m); return false; }; });
    await page.click('#migrarDcBtn');
    await h.waitIdle();
    const confirms = await page.evaluate(() => window.__confirms);
    t.ok(confirms.length === 1 && /5 compras/.test(confirms[0]) && /SEP: 3/.test(confirms[0]) && /Subvención General: 2/.test(confirms[0]), 'la confirmación muestra cuántas compras se verán afectadas (5: SEP 3, Subvención General 2)', confirms[0]);
    t.ok(/COMPLETO/.test(confirms[0]) && /quedará vacío/.test(confirms[0]), 'y explica que mueve el valor completo y deja Doc. original vacío');
    t.eq((await h.writes()).length, 0, 'cancelar la confirmación no escribe nada');
    t.eq((await btn()).texto.replace(/^\S+\s/, ''), 'Migrar DC (5)', 'cancelar no cambia el contador');
    // aceptar
    await page.evaluate(() => { window.confirm = window.__confirmOriginal; });
    const antes = clon(await h.store());
    await page.click('#migrarDcBtn');
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.map(w => w.path).sort(), [RUTA('1121'), RUTA('AC')].sort(), 'los writes van solo a los 2 documentos afectados (1121 y AC)');
    t.ok(ws.every(w => w.op === 'batch.set' && w.options.merge === true), 'son batch.set con merge:true (writeBatch)', ws.map(w => [w.op, w.options]));
    t.ok(ws.length * 2 <= 400 && new Set(ws.map(w => w.batchId)).size === 1, 'un solo lote (≤ 400 operaciones)', ws.map(w => w.batchId));
    const p1121 = ws.find(w => w.path === RUTA('1121')).payload;
    t.eq(p1121.compras, {
      c1121_3: { documentoContable: 'DC_344', documentoOriginal: '' },
      c1121_4: { documentoContable: 'DC_22 - No hay PME', documentoOriginal: '' },
      c1121_mismo_mes: { documentoContable: 'DC-33', documentoOriginal: '' },
    }, '1121 SEP: mueve el valor COMPLETO ("DC_22 - No hay PME" sin parsear) y deja documentoOriginal vacío, solo en las compras afectadas');
    t.eq(p1121.otras_fuentes, { general: { compras: { oge_1121_1: { documentoContable: 'DC_77', documentoOriginal: '' } } } }, '1121 General: otras_fuentes.general.compras.oge_1121_1');
    t.eq(ws.find(w => w.path === RUTA('AC')).payload.otras_fuentes, { general: { compras: { oge_AC_3: { documentoContable: 'DC_12 - carpeta azul', documentoOriginal: '' } } } }, 'AC General: oge_AC_3 con el comentario completo');
    const st = await h.store();
    t.eq(st[RUTA('1121')].compras.c1121_3.documentoContable, 'DC_344', 'servidor: c1121_3.documentoContable = DC_344');
    t.eq(st[RUTA('1121')].compras.c1121_3.documentoOriginal, '', 'servidor: c1121_3.documentoOriginal queda vacío');
    t.eq(st[RUTA('1121')].compras.c1121_4.documentoContable, 'DC_22 - No hay PME', 'servidor: "DC_22 - No hay PME" completo');
    // nada más cambia: montos, tipos, fechas y las compras no afectadas (incluida la que ya tenía N° DC propio y las NC)
    const igualSalvo = (a, b, quitar) => JSON.stringify(a, (k, v) => (quitar.includes(k) ? undefined : v)) === JSON.stringify(b, (k, v) => (quitar.includes(k) ? undefined : v));
    t.ok(igualSalvo(antes[RUTA('1121')], st[RUTA('1121')], ['documentoContable', 'documentoOriginal', 'lastModifiedAt', 'lastModifiedBy']), 'el resto del documento 1121 (montos, tipos, fechas, ingresos, remuneraciones…) no cambia');
    t.eq(st[RUTA('1121')].compras.c1121_5, antes[RUTA('1121')].compras.c1121_5, 'una compra que ya tenía N° DC propio no se toca');
    t.eq(st[RUTA('1121')].compras.c1121_1, antes[RUTA('1121')].compras.c1121_1, 'una compra sin DC (nota de crédito DOC-1121-1) no se toca');
    for (let i = 0; i < 100 && !h.dialogs.some(d => d.type === 'alert' && /Listo/.test(d.message)); i++) await page.waitForTimeout(50);
    t.ok(h.dialogs.some(d => d.type === 'alert' && /Listo: se movieron 5/.test(d.message)), 'avisa "Listo: se movieron 5 números de DC"', h.dialogs.map(d => d.message.slice(0, 60)));
    // pantalla
    await abrirSep(h);
    const dc3 = await celdaDc(page, MODAL, 'c1121_3');
    t.ok(dc3 && dc3.texto === 'DC_344' && !dc3.derivado, 'pantalla SEP: N° DC ya no es derivado (valor propio)', dc3);
    t.eq((await celdasFila(page, MODAL, 'c1121_3')).slice(-3, -1), ['DC_344', ''], 'pantalla SEP: Doc. original quedó vacío');
    await cerrarModales(h);
    // contador y idempotencia
    b = await btn();
    t.eq(b.texto.replace(/^\S+\s/, ''), 'Migrar DC', 'tras migrar, el botón queda sin contador (n = 0) y sigue visible para el admin');
    t.ok(!b.oculto && b.visible, 'y sigue visible', b);
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.click('#migrarDcBtn');
    await h.waitIdle();
    t.eq((await h.writes()).length, 0, 'idempotente: repetirlo no escribe nada');
    t.ok(h.dialogs.some(d => d.type === 'alert' && /nada que migrar/.test(d.message)) && !h.dialogs.some(d => d.type === 'confirm'), 'idempotente: avisa que no hay nada que migrar (sin pedir confirmación)');
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'Migrar DC (cambio remoto actualiza el contador)', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    const texto = () => page.evaluate(() => document.getElementById('migrarDcBtn').textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, ''));
    t.eq(await texto(), 'Migrar DC (5)', 'contador inicial 5');
    await h.remoto('1121', `d.compras.c1121_1.documentoOriginal = 'DC_1000 - nueva'`);
    await h.waitIdle();
    t.eq(await texto(), 'Migrar DC (6)', 'una persona anota un DC en Doc. original: el contador sube a 6');
    await h.remoto('1121', `d.compras.c1121_3.documentoContable = 'DC_344'`);   // ya tiene N° DC propio: deja de contar
    await h.waitIdle();
    t.eq(await texto(), 'Migrar DC (5)', 'una compra con N° DC propio ya no cuenta (documentoContable manda)');
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'Migrar DC (lotes de ≤ 400 operaciones)', async () => {
    const docs = clon(fx);
    const N = 450;
    for (let i = 0; i < N; i++) {
      const id = 'Z' + String(i).padStart(4, '0');
      docs[id] = { rbd: id, nombre: id, compras: { c1: compra({ nroDocumento: String(i), documentoOriginal: `DC_${i} - nota ${i}` }) }, lastModifiedBy: 'juan.bustamante@sleppetorca.gob.cl', lastModifiedAt: { __ts: Date.UTC(2026, 7, 10) } };
    }
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    t.eq(await page.evaluate(() => document.getElementById('migrarDcBtn').textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, '')), `Migrar DC (${N + 5})`, `contador: ${N + 5} (450 documentos sintéticos + 5 del fixture)`);
    await h.clearWrites();
    await page.click('#migrarDcBtn');
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    const porLote = {};
    ws.forEach(w => { porLote[w.batchId] = (porLote[w.batchId] || 0) + 1; });
    const tam = Object.values(porLote).sort((a, b) => b - a);
    t.eq(ws.length, N + 2, `${N + 2} documentos escritos (450 sintéticos + 1121 + AC), uno por documento`);
    t.eq(tam, [200, 200, 52], 'se reparten en 3 lotes de 200, 200 y 52 documentos');
    t.ok(tam.every(n => n * 2 <= 400), 'ningún lote pasa de 400 operaciones (cada documento cuenta 2: el set y la marca de hora)', tam);
    const st = await h.store();
    t.ok(st[RUTA('Z0000')].compras.c1.documentoContable === 'DC_0 - nota 0' && st[RUTA('Z0000')].compras.c1.documentoOriginal === '' && st[RUTA('Z0449')].compras.c1.documentoContable === 'DC_449 - nota 449', 'primer y último documento migrados con el valor completo');
    t.eq(await page.evaluate(() => document.getElementById('migrarDcBtn').textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, '')), 'Migrar DC', 'al terminar el contador desaparece');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 8) CSV SUPEREDUC: sin N° DC y el DC legado no sale como Documento Original
  await escenario(t, 'CSV SUPEREDUC', async () => {
    const sepBase = {
      a: compra({ nroDocumento: '1001', documentoOriginal: 'DC_344' }),                                                                   // factura con DC legado
      b: compra({ nroDocumento: '1002', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-20', fechaPago: '2026-05-20', documentoOriginal: '1001-FAC', montoGasto: -1000, montoDocumento: -1000 }),
      c: compra({ nroDocumento: '1003', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-21', fechaPago: '2026-05-21', documentoOriginal: 'DC_22 - No hay PME', montoGasto: -500, montoDocumento: -500 }), // NC con DC legado
      d: compra({ nroDocumento: '1004', tipoDocumento: 'Nota de débito', fechaDocumento: '2026-05-22', fechaPago: '2026-05-22', documentoOriginal: 'DC-33' }),  // ND con DC legado
      e: compra({ nroDocumento: '1005', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-23', fechaPago: '2026-05-23', documentoOriginal: '', montoGasto: -100, montoDocumento: -100 }), // NC sin nada
      f: compra({ nroDocumento: '1006', tipoDocumento: 'Nota de débito', fechaDocumento: '2026-05-24', fechaPago: '2026-05-24', documentoOriginal: '45 - Factura electrónica' }),
      g: compra({ nroDocumento: '1007', tipoDocumento: 'Boleta', documentoOriginal: 'dc 12' }),
    };
    const conDc = clon(sepBase);
    conDc.a.documentoContable = 'DC_344'; conDc.b.documentoContable = 'DC_600'; conDc.f.documentoContable = 'DC_9'; conDc.g.documentoContable = 'DC_7 <x>; "y"';
    const armar = (compras) => {
      const docs = clon(fx);
      Object.values(docs).forEach(d => { if (d.compras) d.compras = {}; Object.values(d.otras_fuentes || {}).forEach(o => { if (o && o.compras) o.compras = {}; }); });
      docs['1121'].compras = clon(compras);                          // SEP: solo 1121
      docs['1121'].otras_fuentes.pie.compras = clon(compras);        // PIE: solo 1121
      docs.AC.otras_fuentes.general.compras = clon(compras);         // General: solo AC
      return docs;
    };
    const csv = async (h, disparar) => (await capturarDescarga(h.page, disparar)).buffer.toString('utf8');
    const ultimoConfirm = (h) => { const c = h.dialogs.filter(d => d.type === 'confirm'); return c.length ? c[c.length - 1].message : null; };
    const salidas = {};
    for (const [nombre, compras] of [['sin', sepBase], ['con', conDc]]) {
      const h = await boot({ fixture: armar(compras) });
      await clickTab(h.page, 'SEP');
      salidas[nombre] = { sep: await csv(h, () => h.page.click('#downloadComprasSepBtn')), confirmSep: ultimoConfirm(h) };
      salidas[nombre].fila = await csv(h, () => h.page.evaluate(() => document.querySelector('.row-action-btn[data-action="csvsep"][data-rbd="1121"]').click()));
      await clickTab(h.page, 'PIE');
      h.dialogs.length = 0;
      salidas[nombre].pie = await csv(h, () => h.page.click('#downloadComprasOFBtn-pie'));
      salidas[nombre].confirmPie = ultimoConfirm(h);
      salidas[nombre].pieFila = await csv(h, () => h.page.evaluate(() => document.querySelector('#otrasFuentesTbody-pie .row-action-btn[data-action="csv"][data-rbd="1121"]').click()));
      await clickTab(h.page, 'General');
      h.dialogs.length = 0;
      salidas[nombre].general = await csv(h, () => h.page.click('#downloadComprasOFBtn-general'));
      salidas[nombre].confirmGeneral = ultimoConfirm(h);
      t.eq((await h.writes()).length, 0, `CSV (${nombre} N° DC): exportar no escribe en Firestore`);
      await h.close();
    }
    t.eq(salidas.con.sep, salidas.sin.sep, 'SEP: el CSV es idéntico con y sin N° DC (el campo no sale en el CSV)');
    t.eq(salidas.con.fila, salidas.sin.fila, 'SEP ⬇ CSV SEP de la fila: idéntico con y sin N° DC');
    t.eq(salidas.con.pie, salidas.sin.pie, 'PIE: el CSV es idéntico con y sin N° DC');
    t.eq(salidas.con.pieFila, salidas.sin.pieFila, 'PIE ⬇ CSV SUPEREDUC de la fila (1121): idéntico con y sin N° DC');
    t.eq(salidas.con.pieFila, salidas.con.pie, 'PIE ⬇ CSV SUPEREDUC de la fila: mismo contenido que el CSV de la pestaña');
    t.eq(salidas.con.general, salidas.sin.general, 'General: el CSV es idéntico con y sin N° DC');
    const txt = salidas.con.sep;
    t.eq(txt.replace(/^﻿/, '').split('\r\n')[0], ENCABEZADO_CSV, 'el encabezado sigue siendo A–M (13 columnas, sin N° DC)');
    t.ok(!/DC[_-]/i.test(txt) && !/N° DC|documentoContable/i.test(txt), 'ningún N° DC ni DC legado aparece en el CSV');
    const filas = parseCsvPuntoYComa(txt).filter(f => f.length > 1);
    t.ok(filas.every(f => f.length === 13), 'todas las filas tienen exactamente 13 columnas', filas.map(f => f.length));
    const porNro = Object.fromEntries(filas.slice(1).map(f => [f[4], f]));
    t.eq(porNro['1001'][12], '', 'factura con "DC_344" en Doc. original: Documento Original vacío');
    t.eq(porNro['1002'][12], '1001-FAC', 'nota de crédito con 1001-FAC: Documento Original intacto');
    t.eq(porNro['1003'][12], '', 'nota de crédito con "DC_22 - No hay PME": NO se exporta como Documento Original (queda vacío)');
    t.eq(porNro['1004'][12], '', 'nota de débito con "DC-33": vacío');
    t.eq(porNro['1005'][12], '', 'nota de crédito sin nada: vacío');
    t.eq(porNro['1006'][12], '45-FACEL', 'nota de débito con "45 - Factura electrónica": 45-FACEL como siempre');
    t.eq(porNro['1007'][12], '', 'boleta con "dc 12": vacío');
    // aviso previo: las 3 NC/ND con DC legado o vacío (1003, 1004, 1005) cuentan como "sin Documento Original"
    for (const [nombre, msg] of [['SEP', salidas.con.confirmSep], ['PIE', salidas.con.confirmPie], ['General (AC)', salidas.con.confirmGeneral]]) {
      t.ok(msg && /en 3 de 7 compras/.test(msg), `${nombre}: el aviso previo cuenta 3 de 7 compras con problema`, msg && msg.split('\n')[0]);
      const lista = (msg || '').split('\n').filter(l => /^\s*•/.test(l)).map(l => l.trim());
      t.eq(lista.length, 1, `${nombre}: el único motivo del aviso es el de Documento Original`, lista);
      t.ok(lista[0] && /3 filas/.test(lista[0]) && /sin "Documento Original" con formato número-TIPO/.test(lista[0]), `${nombre}: motivo docOrig con 3 filas (la NC con DC legado, la ND con DC legado y la NC vacía)`, lista[0]);
    }
    // sin legado ni problemas no hay aviso
    {
      const limpias = { a: compra({ nroDocumento: '1' }), b: compra({ nroDocumento: '2', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-20', fechaPago: '2026-05-20', documentoOriginal: '1-FAC', montoGasto: -100, montoDocumento: -100, documentoContable: 'DC_5' }) };
      const h = await boot({ fixture: armar(limpias) });
      await clickTab(h.page, 'SEP');
      const dl = await csv(h, () => h.page.click('#downloadComprasSepBtn'));
      t.eq(h.dialogs.filter(d => d.type === 'confirm').length, 0, 'compras sin DC legado y correctas: no hay aviso');
      t.ok(dl.includes(';1-FAC'), 'y la NC conserva 1-FAC (el N° DC no lo reemplaza)', dl.split('\r\n')[2]);
      await h.close();
    }
  });

  // ============================================================================================ 9) Excel de respaldo/importación y XLS/PDF por fila
  await escenario(t, 'Excel SEP', async () => {
    const docs = clon(fx);
    docs['1121'].compras.f1 = compra({ nroDocumento: 'F1', documentoContable: '=HYPERLINK("http://x","y")' });
    docs['1121'].compras.f2 = compra({ nroDocumento: 'F2', documentoContable: '@SUM(1,1)' });
    docs['1121'].compras.f3 = compra({ nroDocumento: 'F3', documentoContable: '-5' });               // número: no se neutraliza
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    const exportar = async (disparar) => { const dl = await capturarDescarga(page, disparar); return { ...dl, libro: await leerXlsx(page, dl.buffer) }; };
    const importar = async (dl) => {
      const antes = h.dialogs.length;
      await page.setInputFiles('#importExcelInput', { name: dl.filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: dl.buffer });
      for (let i = 0; i < 200 && h.dialogs.length === antes; i++) await page.waitForTimeout(50);
      await page.waitForTimeout(700);                       // el panel guarda lo importado con un debounce de 400 ms
      await h.flushWrites(); await h.waitIdle();
      return h.dialogs.slice(antes).map(d => d.message);
    };
    // Reescribe el libro dentro de la página con SheetJS: `cuerpo` recibe (aoa) de la hoja COMPRAS y devuelve el nuevo aoa.
    const reescribir = (dl, cuerpo) => page.evaluate(([b64, codigo]) => {
      const wb = XLSX.read(b64, { type: 'base64' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets.COMPRAS, { header: 1, defval: '', raw: true });
      const nuevo = (new Function('aoa', codigo))(aoa);
      wb.Sheets.COMPRAS = XLSX.utils.aoa_to_sheet(nuevo);
      return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    }, [dl.buffer.toString('base64'), cuerpo]).then(b64 => ({ filename: dl.filename, buffer: Buffer.from(b64, 'base64') }));

    const x1 = await exportar(() => page.click('#downloadExcelBtn'));
    const hoja = x1.libro.hojas.COMPRAS;
    t.eq(hoja[0], ['ID', 'RBD', 'Establecimiento', 'Codigo', 'TipoDocumento', 'NroDocumento', 'FechaDocumento', 'FechaPago', 'Descripcion', 'RutProveedor', 'NombreProveedor', 'MontoGasto', 'MontoDocumento', 'DocumentoOriginal', 'N° DC'], 'SEP: la hoja COMPRAS agrega la columna "N° DC" al final (las 14 anteriores no cambian de lugar)');
    const fila = (id) => hoja.find(r => r[0] === id);
    t.eq([fila('c1121_5')[13], fila('c1121_5')[14]], ['', 'DC_501'], 'SEP Excel: c1121_5 → Doc. original vacío, N° DC = DC_501');
    t.eq([fila('c1121_3')[13], fila('c1121_3')[14]], ['DC_344', ''], 'SEP Excel: un DC legado se respalda tal cual en Doc. original (el N° DC derivado NO se exporta como propio)');
    t.eq(fila('c1121_especial')[14], `DC_<9> & 'Z'; "Q"`, 'SEP Excel: caracteres especiales intactos');
    t.eq(fila('f1')[14], `'=HYPERLINK("http://x","y")`, 'SEP Excel: un N° DC que empieza con "=" lleva apóstrofo (neutralizaFormula)');
    t.eq(fila('f2')[14], `'@SUM(1,1)`, 'SEP Excel: "@SUM(1,1)" neutralizado');
    t.eq(fila('f3')[14], '-5', 'SEP Excel: un N° DC que es un número ("-5") no se toca');
    // ---- ida y vuelta con la columna
    const storeAntes = clon(await h.store());
    const msgs = await importar(x1);
    t.ok(/^Carga importada correctamente/.test(msgs[0] || ''), 'SEP: importa el Excel con la columna N° DC', msgs);
    const storeDespues = await h.store();
    const sinAudit = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'lastModifiedAt' || k === 'lastModifiedBy' ? undefined : v)));
    t.eq(sinAudit(storeDespues[RUTA('1121')].compras), sinAudit(storeAntes[RUTA('1121')].compras), 'SEP: exportar → importar no altera ninguna compra (los N° DC con "=" / "@" vuelven sin apóstrofo)');
    t.ok(!('documentoContable' in storeDespues[RUTA('1121')].compras.c1121_3), 'SEP: una compra que nunca tuvo N° DC no gana la clave al reimportar (celda vacía)');
    const x2 = await exportar(() => page.click('#downloadExcelBtn'));
    t.eq(x2.libro.hojas.COMPRAS, hoja, 'SEP: exportar → importar → exportar da la misma hoja COMPRAS');
    // ---- editar el N° DC en el Excel: cambia y se limpia
    const editado = await reescribir(x1, `const idx = aoa[0].indexOf('N° DC');
      aoa.forEach((r, i) => { if (r[0] === 'c1121_5') r[idx] = 'DC_EXCEL'; if (r[0] === 'c1121_4') r[idx] = 'DC_NUEVO'; });
      return aoa;`);
    await importar(editado);
    let st = await h.store();
    t.eq([st[RUTA('1121')].compras.c1121_5.documentoContable, st[RUTA('1121')].compras.c1121_4.documentoContable], ['DC_EXCEL', 'DC_NUEVO'], 'SEP: un N° DC editado en el Excel se importa');
    t.eq(st[RUTA('1121')].compras.c1121_4.documentoOriginal, 'DC_22 - No hay PME', 'SEP: importar un N° DC no toca Doc. original');
    const limpiado = await reescribir(x1, `const idx = aoa[0].indexOf('N° DC'); aoa.forEach(r => { if (r[0] === 'c1121_5') r[idx] = ''; }); return aoa;`);
    await importar(limpiado);
    st = await h.store();
    t.eq(st[RUTA('1121')].compras.c1121_5.documentoContable, '', 'SEP: una celda N° DC vacía en el Excel limpia el N° DC que tenía la compra');
    // ---- archivo antiguo (sin la columna): se importa igual y NO borra el N° DC existente
    await importar(x1);   // vuelve DC_501 y los demás
    t.eq((await h.store())[RUTA('1121')].compras.c1121_5.documentoContable, 'DC_501', 'SEP: (se restablece DC_501 con el Excel completo)');
    const antiguo = await reescribir(x1, `return aoa.map(r => r.slice(0, 14));`);
    const nuevaFila = await reescribir(antiguo, `aoa.push(['', 1121, 'x', '410606', 'Factura', 'ANT-1', '2026-06-01', '2026-06-02', 'Compra de un Excel antiguo', '', 'Prov', 5000, 5000, 'DC_44 (Excel antiguo)']); return aoa;`);
    const msgsAnt = await importar(nuevaFila);
    t.ok(/^Carga importada correctamente/.test(msgsAnt[0] || '') && /COMPRAS: \d+ filas/.test(msgsAnt[0] || ''), 'SEP: un Excel antiguo (14 columnas, sin N° DC) se importa sin errores', msgsAnt);
    st = await h.store();
    t.eq(st[RUTA('1121')].compras.c1121_5.documentoContable, 'DC_501', 'SEP: el Excel antiguo NO borra el N° DC que ya tenía la compra');
    t.eq(st[RUTA('1121')].compras.c1121_especial.documentoContable, `DC_<9> & 'Z'; "Q"`, 'SEP: ni el de la compra con caracteres especiales');
    const idAnt = Object.keys(st[RUTA('1121')].compras).find(k => st[RUTA('1121')].compras[k].nroDocumento === 'ANT-1');
    t.ok(idAnt && !('documentoContable' in st[RUTA('1121')].compras[idAnt]) && st[RUTA('1121')].compras[idAnt].documentoOriginal === 'DC_44 (Excel antiguo)', 'SEP: una compra nueva de un Excel antiguo queda sin N° DC y con su Doc. original (se muestra derivada)', st[RUTA('1121')].compras[idAnt]);
    await abrirSep(h);
    const dcAnt = await celdaDc(page, MODAL, idAnt);
    t.ok(dcAnt && dcAnt.derivado && dcAnt.texto === 'DC_44 (Excel antiguo)', 'SEP: y la pantalla la muestra como N° DC derivado', dcAnt);
    await cerrarModales(h);
    // ---- XLS por fila
    const xf = await exportar(() => page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1121"]'));
    t.eq(xf.libro.hojas.COMPRAS[0].slice(-2), ['DocumentoOriginal', 'N° DC'], 'SEP XLS por fila: la hoja COMPRAS trae la columna N° DC');
    t.eq(xf.libro.hojas.COMPRAS.find(r => r[0] === 'c1121_5').slice(-2), ['', 'DC_501'], 'SEP XLS por fila: con el valor de cada compra');
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'Excel fuentes', async () => {
    const docs = clon(fx);
    docs['1121'].otras_fuentes.pie.compras.opi_f = compra({ codigo: '410503', nroDocumento: 'PF', documentoContable: '=2+2' });
    const h = await boot({ fixture: docs });
    const { page } = h;
    const exportar = async (disparar) => { const dl = await capturarDescarga(page, disparar); return { ...dl, libro: await leerXlsx(page, dl.buffer) }; };
    const importar = async (input, dl) => {
      const antes = h.dialogs.length;
      await page.setInputFiles(input, { name: dl.filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: dl.buffer });
      for (let i = 0; i < 200 && h.dialogs.length === antes; i++) await page.waitForTimeout(50);
      await page.waitForTimeout(700);                       // el panel guarda lo importado con un debounce de 400 ms
      await h.flushWrites(); await h.waitIdle();
      return h.dialogs.slice(antes).map(d => d.message);
    };
    const sinAudit = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'lastModifiedAt' || k === 'lastModifiedBy' ? undefined : v)));
    for (const [fuente, idsDc] of [['general', { propio: ['oge_AC_1', 'DC_900'], legado: ['oge_1121_1', 'DC_77'] }], ['pie', { propio: ['opi_1121_1', 'DC_88'], neutral: ['opi_f', "'=2+2"] }]]) {
      await clickTab(page, 'of-' + fuente);
      const x1 = await exportar(() => page.click(`#downloadExcelOFBtn-${fuente}`));
      const hoja = x1.libro.hojas.COMPRAS;
      t.eq(hoja[0].slice(-2), ['DocumentoOriginal', 'N° DC'], `${fuente}: la hoja COMPRAS trae la columna "N° DC" al final`);
      const fila = (id) => hoja.find(r => r[0] === id);
      if (idsDc.propio) t.eq([fila(idsDc.propio[0])[13], fila(idsDc.propio[0])[14]], ['', idsDc.propio[1]], `${fuente}: ${idsDc.propio[0]} → N° DC ${idsDc.propio[1]}`);
      if (idsDc.legado) t.eq([fila(idsDc.legado[0])[13], fila(idsDc.legado[0])[14]], [idsDc.legado[1], ''], `${fuente}: un DC legado se respalda en Doc. original (no se exporta como N° DC propio)`);
      if (idsDc.neutral) t.eq(fila(idsDc.neutral[0])[14], idsDc.neutral[1], `${fuente}: un N° DC que empieza con "=" se neutraliza`);
      const storeAntes = clon(await h.store());
      const msgs = await importar(`#importExcelOFInput-${fuente}`, x1);
      t.ok(/^Carga importada correctamente/.test(msgs[0] || ''), `${fuente}: importa el Excel con la columna N° DC`, msgs);
      const storeDespues = await h.store();
      t.eq(sinAudit(storeDespues[RUTA('1121')].otras_fuentes[fuente].compras), sinAudit(storeAntes[RUTA('1121')].otras_fuentes[fuente].compras), `${fuente}: exportar → importar no altera ninguna compra de 1121`);
      t.eq(sinAudit(storeDespues[RUTA('AC')].otras_fuentes[fuente].compras), sinAudit(storeAntes[RUTA('AC')].otras_fuentes[fuente].compras), `${fuente}: ni las de AC`);
      const x2 = await exportar(() => page.click(`#downloadExcelOFBtn-${fuente}`));
      t.eq(x2.libro.hojas.COMPRAS, hoja, `${fuente}: exportar → importar → exportar da la misma hoja COMPRAS`);
      // Excel antiguo (sin la columna): no borra los N° DC existentes
      const antiguo = await page.evaluate(([b64]) => {
        const wb = XLSX.read(b64, { type: 'base64' });
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets.COMPRAS, { header: 1, defval: '', raw: true }).map(r => r.slice(0, 14));
        wb.Sheets.COMPRAS = XLSX.utils.aoa_to_sheet(aoa);
        return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      }, [x1.buffer.toString('base64')]);
      await importar(`#importExcelOFInput-${fuente}`, { filename: x1.filename, buffer: Buffer.from(antiguo, 'base64') });
      const st = await h.store();
      t.eq(sinAudit(st[RUTA('1121')].otras_fuentes[fuente].compras), sinAudit(storeAntes[RUTA('1121')].otras_fuentes[fuente].compras), `${fuente}: un Excel antiguo (sin N° DC) se importa y conserva los N° DC existentes`);
      t.eq(sinAudit(st[RUTA('AC')].otras_fuentes[fuente].compras), sinAudit(storeAntes[RUTA('AC')].otras_fuentes[fuente].compras), `${fuente}: también en AC`);
    }
    // XLS por entidad
    await clickTab(page, 'of-general');
    const xe = await exportar(() => page.click('#otrasFuentesTbody-general button.row-action-btn[data-action="excel"][data-rbd="AC"]'));
    t.eq(xe.libro.hojas.COMPRAS[0].slice(-1), ['N° DC'], 'General XLS por entidad (AC): la hoja COMPRAS trae N° DC');
    t.ok(xe.libro.hojas.COMPRAS.some(r => r[0] === 'oge_AC_1' && r[14] === 'DC_900'), 'General XLS por entidad (AC): con el valor de la compra');
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'PDF por fila y CSV por fila', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    const ultimoPrint = async () => { const p = await h.prints(); return p[p.length - 1]; };
    // SEP
    await clickTab(page, 'SEP');
    await page.evaluate(() => document.querySelector('#tableBody .row-action-btn[data-action="pdf"][data-rbd="1121"]').click());
    await h.waitIdle();
    let p = await ultimoPrint();
    t.ok(p && /Monto doc\. N° DC Doc\. original/.test(p.printWrap), 'SEP PDF por fila: la tabla de compras trae las columnas "N° DC" y "Doc. original"', p && p.printWrap.slice(0, 120));
    t.ok(p && /DC_501/.test(p.printWrap) && /DC_344/.test(p.printWrap) && /DC_22 - No hay PME/.test(p.printWrap), 'SEP PDF por fila: con los valores (propio y derivado)');
    t.ok(p && /N° DC es interno/.test(p.printWrap), 'SEP PDF por fila: la nota explica que N° DC es interno');
    // General: PDF por entidad
    await clickTab(page, 'General');
    await page.evaluate(() => document.querySelector('#otrasFuentesTbody-general .row-action-btn[data-action="pdf"][data-rbd="AC"]').click());
    await h.waitIdle();
    p = await ultimoPrint();
    t.ok(p && /Monto doc\. N° DC Doc\. original/.test(p.printWrap), 'General PDF por entidad (AC): la tabla de compras trae "N° DC" y "Doc. original"', p && p.printWrap.slice(0, 80));
    t.ok(p && /DC_900/.test(p.printWrap) && /DC_12 - carpeta azul/.test(p.printWrap), 'General PDF por entidad (AC): con los valores (propio y derivado)');
    // CSV por fila: sigue siendo el de SUPEREDUC (13 columnas, sin DC)
    const csv = async (disparar) => (await capturarDescarga(page, disparar)).buffer.toString('utf8');
    const csvGen = await csv(() => page.evaluate(() => document.querySelector('#otrasFuentesTbody-general .row-action-btn[data-action="csv"][data-rbd="AC"]').click()));
    t.eq(csvGen.replace(/^﻿/, '').split('\r\n')[0], ENCABEZADO_CSV, 'General CSV por fila (AC): encabezado SUPEREDUC A–M');
    t.ok(!/DC_900|DC_12/.test(csvGen), 'General CSV por fila (AC): sin N° DC ni DC legado');
    await clickTab(page, 'SEP');
    const csvSep = await csv(() => page.evaluate(() => document.querySelector('.row-action-btn[data-action="csvsep"][data-rbd="1121"]').click()));
    t.ok(csvSep.replace(/^﻿/, '').split('\r\n')[0] === ENCABEZADO_CSV && !/DC_501|DC_344|DC_22 - No hay PME|DC-33/.test(csvSep), 'SEP CSV por fila: encabezado A–M y sin N° DC ni DC legado');
    t.noErrores(h);
    await h.close();
  });
});
