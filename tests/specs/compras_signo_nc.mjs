// compras_signo_nc (L-03): el signo de una nota de crédito / débito ya no depende de lo que escriba la persona.
//   · Nota de crédito (NOTACRE): montoGasto y montoDocumento SIEMPRE negativos; nota de débito (NOTADEB): SIEMPRE positivos; los demás tipos
//     (p. ej. una factura en negativo) se dejan como se digitaron.
//   · Se aplica en TODO el flujo: lectura de Firestore (en memoria, sin escribir), formulario (agregar / editar / duplicar) de SEP y de las fuentes con
//     compras, importación de Excel (SEP y fuentes), exportar → reimportar, y todos los cálculos (ítem/mes del RBD, KPI, tabla, Panel principal,
//     Reporte personalizado, Visualizador, CSV de SUPEREDUC y Excel).
// Contra el index.html anterior (ca7a883) este spec FALLA: la NC cargada en positivo SUMABA gasto.
import { boot, clickTab, textoDe } from '../lib/boot.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';
import { correrSpec } from '../lib/spec.mjs';
import {
  fixtureSinCompras, compraBase, libroXlsx, importarLibro, filaCompra, ENC_COMPRAS_SEP, ENC_COMPRAS_FUENTE,
  celdaItem, montosFilaCompra, abrirModalSep, cerrarModalSep, abrirModalFuente,
} from '../lib/compras.mjs';

const ITEM = 'BIBLIOTECAS, LIBROS Y REVISTAS'; // código 410606 (Subt. 22)
const MODAL_SEP = '#modalBody';
const MODAL_OF = '#otrasFuentesModalBody';

// SEP / RBD 1121, marzo de 2026, cuenta 410606. Lo guardado en Firestore es lo que dejó la persona (¡con signos mezclados!).
const SEP = {
  fac:    compraBase({ nroDocumento: '100', montoGasto: 400000, montoDocumento: 476000 }),                                                                              // factura normal
  ncPos:  compraBase({ nroDocumento: '101', tipoDocumento: 'Nota de crédito', montoGasto: 100000, montoDocumento: 119000, documentoOriginal: '100-FACEL' }),                 // NC cargada en POSITIVO (el error)
  ncNeg:  compraBase({ nroDocumento: '102', tipoDocumento: 'Nota de crédito', montoGasto: -50000, montoDocumento: -59500, documentoOriginal: '100-FACEL' }),               // NC ya en negativo (correcta)
  ndNeg:  compraBase({ nroDocumento: '103', tipoDocumento: 'Nota de débito', montoGasto: -20000, montoDocumento: -23800, documentoOriginal: '100-FACEL' }),                // ND cargada en NEGATIVO (el error)
  ndPos:  compraBase({ nroDocumento: '104', tipoDocumento: 'Nota de débito', montoGasto: 10000, montoDocumento: 11900, documentoOriginal: '100-FACEL' }),                  // ND correcta
  facNeg: compraBase({ nroDocumento: '105', tipoDocumento: 'Factura', montoGasto: -30000, montoDocumento: -35700 }),                                                      // factura en negativo: se queda tal cual
};
// 400.000 − 100.000 (ncPos) − 50.000 (ncNeg) + 20.000 (ndNeg) + 10.000 (ndPos) − 30.000 (facNeg)
const TOTAL_MARZO = 250000;
const clp = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-CL');

// General / RBD 1121, cuenta 410601 (habilitada para General), marzo de 2026.
const GEN = {
  g1: compraBase({ codigo: '410601', nroDocumento: '300', montoGasto: 300000, montoDocumento: 357000 }),
  g2: compraBase({ codigo: '410601', nroDocumento: '301', tipoDocumento: 'Nota de crédito', montoGasto: 60000, montoDocumento: 71400, documentoOriginal: '300-FACEL' }), // NC en positivo
  g3: compraBase({ codigo: '410601', nroDocumento: '302', tipoDocumento: 'Nota de débito', montoGasto: -5000, montoDocumento: -5950, documentoOriginal: '300-FACEL' }),   // ND en negativo
};
const TOTAL_GENERAL = 300000 - 60000 + 5000; // 245.000

function docsBase() {
  const d = fixtureSinCompras();
  d['1121'].compras = JSON.parse(JSON.stringify(SEP));
  d['1121'].otras_fuentes.general.compras = JSON.parse(JSON.stringify(GEN));
  return d;
}
const idsNuevos = (antes, despues) => Object.keys(despues).filter(k => !(k in antes));
async function llenarFormulario(page, modal, claseInput, campos) {
  for (const [campo, valor] of Object.entries(campos)) {
    const sel = `${modal} .compra-input${claseInput}[data-field="${campo}"]`;
    if (campo === 'codigo' || campo === 'tipoDocumento') await page.selectOption(sel, valor);
    else await page.fill(sel, String(valor));
  }
}
const textoAvisosForm = (page, modal) => page.evaluate((m) => { const c = document.querySelector(`${m} .compra-form-avisos`); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; }, modal); // '' = sin caja o sin avisos

await correrSpec('compras_signo_nc', async (t) => {
  // =================================================================== 1. Lectura de Firestore (SEP): se normaliza en memoria, sin escribir
  {
    const h = await boot({ fixture: docsBase() });
    const { page } = h;
    await clickTab(page, 'SEP');
    await h.clearWrites();
    const kpi = await textoDe(page, '#kpiRow');
    t.ok(kpi.includes(`Gasto Bienes y Servicios (a Diciembre)\n${clp(TOTAL_MARZO)}`), `SEP: el KPI de Gasto B&S resta las notas de crédito y suma las de débito (${clp(TOTAL_MARZO)})`, kpi.split('\n').slice(6, 8));
    const celdaGasto = await page.evaluate(() => document.querySelector('#tableBody tr[data-rbd="1121"] td[data-field="gasto_bys"]').textContent.trim());
    t.eq(celdaGasto, clp(TOTAL_MARZO), 'SEP: la fila del RBD 1121 muestra el gasto B&S con el signo correcto');
    await abrirModalSep(h, '1121');
    t.eq(await celdaItem(page, ITEM, 'MARZO'), clp(TOTAL_MARZO), 'SEP: el ítem/mes de marzo (Real) resta la NC aunque Firestore la tenga en positivo');
    const esperado = { fac: ['$400.000', '$476.000'], ncPos: ['-$100.000', '-$119.000'], ncNeg: ['-$50.000', '-$59.500'], ndNeg: ['$20.000', '$23.800'], ndPos: ['$10.000', '$11.900'], facNeg: ['-$30.000', '-$35.700'] };
    for (const [id, [g, d]] of Object.entries(esperado)) {
      const m = await montosFilaCompra(page, MODAL_SEP, id);
      t.eq([m && m.gasto, m && m.documento], [g, d], `SEP: tabla de compras, "${id}" se ve ${g} / ${d}`);
    }
    t.eq((await h.writes()).length, 0, 'SEP: leer y mostrar NO escribe en Firestore (el valor guardado se corrige al editar la compra)');
    const st = await h.store();
    t.eq([st['sep_carga_rbd/1121'].compras.ncPos.montoGasto, st['sep_carga_rbd/1121'].compras.ndNeg.montoGasto], [100000, -20000], 'SEP: en Firestore la NC en positivo y la ND en negativo siguen como estaban');

    // ---- ayuda del formulario
    t.eq(await textoAvisosForm(page, MODAL_SEP), '', 'SEP: formulario sin tipo de documento: sin ayuda de signo');
    await page.selectOption(`${MODAL_SEP} .compra-input[data-field="tipoDocumento"]`, 'Nota de crédito');
    t.ok((await textoAvisosForm(page, MODAL_SEP)).includes('Las notas de crédito se registran con monto negativo; se ajusta automáticamente'), 'SEP: con "Nota de crédito" el formulario muestra la ayuda de signo');
    await page.selectOption(`${MODAL_SEP} .compra-input[data-field="tipoDocumento"]`, 'Nota de débito');
    t.ok((await textoAvisosForm(page, MODAL_SEP)).includes('Las notas de débito se registran con monto positivo; se ajusta automáticamente'), 'SEP: con "Nota de débito" la ayuda habla de monto positivo');
    await page.selectOption(`${MODAL_SEP} .compra-input[data-field="tipoDocumento"]`, 'Factura');
    t.eq(await textoAvisosForm(page, MODAL_SEP), '', 'SEP: con "Factura" no hay ayuda de signo');
    await page.selectOption(`${MODAL_SEP} .compra-input[data-field="tipoDocumento"]`, '');
    await cerrarModalSep(h);

    // ---- Panel principal, Reporte personalizado y Visualizador: leen los mismos ítems
    await clickTab(page, 'Panel principal');
    const bys = await page.evaluate(() => document.querySelector('#dashCards .dash-card[data-fuente="sep"]').dataset.bys);
    t.eq(bys, String(TOTAL_MARZO), 'Panel principal: la tarjeta SEP suma el gasto B&S con el signo correcto');
    await clickTab(page, 'Reportes');
    await page.click('#vzFuentesNinguna');
    await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
    await page.click('#vzAgruparChips [data-vz-agrupar="codigo"]');
    await page.click('#vzExpGas');
    const vz = (await capturarDescarga(page, () => page.click('#vzCsvBtn'))).buffer.toString('utf8').split(/\r?\n/);
    t.ok(vz.some(l => l.startsWith('Gasto;Bienes y Servicios — Subt. 22;410606;') && l.includes(';SEP;') && l.endsWith(`;${TOTAL_MARZO}`)), `Visualizador (por código): la cuenta 410606 de SEP suma ${TOTAL_MARZO}`, vz.filter(l => l.includes('410606')));
    await page.click('#vzLimpiarBtn');
    await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
    await h.waitIdle();
    const marcar = (sel, on = true) => page.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return false; if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); } return true; }, [sel, on]);
    await page.click('#reporteRbdNinguno'); await page.click('#reporteConceptoNinguno'); await page.click('#reporteMesNinguno');
    await marcar('#reporteRbdList input[data-rbd-check="1121"]');
    await page.evaluate((k) => { const el = Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).find(e => e.dataset.conceptoCheck === k); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }, `22|${ITEM}`);
    await marcar('#reporteMesList input[data-mes-check="MARZO"]');
    await h.waitIdle();
    const pers = (await capturarDescarga(page, () => page.click('#reporteCsvBtn'))).buffer.toString('utf8').split(/\r?\n/);
    t.ok(pers.some(l => l.startsWith('1121;') && l.includes(ITEM) && l.endsWith(`;${TOTAL_MARZO};${TOTAL_MARZO}`)), `Reporte personalizado: concepto ${ITEM}, marzo = ${TOTAL_MARZO}`, pers);

    // ---- CSV de SUPEREDUC (SEP): montos con el signo del tipo; el aviso previo NO marca "gasto mayor" por el signo
    await clickTab(page, 'SEP');
    const dl = await capturarDescarga(page, () => page.click('#downloadComprasSepBtn'));
    const filas = parseCsvPuntoYComa(dl.buffer.toString('utf8')).filter(f => f.length > 1);
    const por = Object.fromEntries(filas.slice(1).map(f => [f[4], f]));
    t.eq([por[101][10], por[101][11], por[101][3]], ['-100000', '-119000', 'NOTACRE'], 'CSV SUPEREDUC (SEP): la NC guardada en positivo sale en NEGATIVO');
    t.eq([por[102][10], por[102][11]], ['-50000', '-59500'], 'CSV SUPEREDUC (SEP): la NC ya negativa no cambia');
    t.eq([por[103][10], por[103][11], por[103][3]], ['20000', '23800', 'NOTADEB'], 'CSV SUPEREDUC (SEP): la ND guardada en negativo sale en POSITIVO');
    t.eq([por[105][10], por[105][11]], ['-30000', '-35700'], 'CSV SUPEREDUC (SEP): una factura en negativo se queda como se digitó');
    const confirmaciones = h.dialogs.filter(d => d.type === 'confirm');
    t.ok(!confirmaciones.some(c => /monto gasto mayor/.test(c.message)), 'CSV SUPEREDUC: el aviso previo no marca "monto gasto mayor que el documento" por el signo (se compara en valor absoluto)', confirmaciones.map(c => c.message));

    // ---- Excel de respaldo (SEP): la hoja COMPRAS lleva el valor normalizado; exportar → reimportar → exportar no cambia nada
    const x1 = await capturarDescarga(page, () => page.click('#downloadExcelBtn'));
    const l1 = await leerXlsx(page, x1.buffer);
    const fila = (libro, id) => libro.hojas.COMPRAS.find(r => r[0] === id);
    t.eq([fila(l1, 'ncPos')[11], fila(l1, 'ncPos')[12], fila(l1, 'ndNeg')[11], fila(l1, 'ndNeg')[12], fila(l1, 'facNeg')[11]], [-100000, -119000, 20000, 23800, -30000], 'Excel (SEP): NC en negativo, ND en positivo, factura tal cual');
    await h.clearWrites();
    const msgs = await importarLibro(h, '#importExcelInput', x1.buffer, x1.filename);
    t.ok(/Carga importada correctamente/.test(msgs[0] || ''), 'SEP: reimportar el Excel exportado funciona', msgs);
    const st2 = (await h.store())['sep_carga_rbd/1121'].compras;
    t.eq(Object.keys(st2).sort(), Object.keys(SEP).sort(), 'SEP: exportar → reimportar no duplica ni pierde compras');
    t.eq([st2.ncPos.montoGasto, st2.ncPos.montoDocumento, st2.ndNeg.montoGasto, st2.ndNeg.montoDocumento, st2.facNeg.montoGasto], [-100000, -119000, 20000, 23800, -30000], 'SEP: tras reimportar, Firestore ya guarda los signos correctos (NC negativa, ND positiva, factura tal cual)');
    const x2 = await capturarDescarga(page, () => page.click('#downloadExcelBtn'));
    const l2 = await leerXlsx(page, x2.buffer);
    t.eq(l2.hojas.COMPRAS, l1.hojas.COMPRAS, 'SEP: exportar → importar → exportar da la misma hoja COMPRAS');
    t.eq((await textoDe(page, '#kpiRow')).includes(clp(TOTAL_MARZO)), true, 'SEP: el KPI sigue igual tras reimportar');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 2. Formulario de SEP: agregar / editar / duplicar
  {
    const h = await boot({ fixture: docsBase() });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1121');
    const antes = (await h.store())['sep_carga_rbd/1121'].compras;
    const base = { codigo: '410606', fechaDocumento: '2026-04-02', fechaPago: '2026-04-10', descripcion: 'alta desde el formulario', rutProveedor: '76.123.456-7', nombreProveedor: 'Proveedor SpA' };
    const agregar = async (extra) => {
      const previo = (await h.store())['sep_carga_rbd/1121'].compras;
      await llenarFormulario(page, MODAL_SEP, '', { ...base, ...extra });
      await page.click(`${MODAL_SEP} .add-compra-btn`);
      await h.flushWrites();
      const ahora = (await h.store())['sep_carga_rbd/1121'].compras;
      const nuevos = idsNuevos(previo, ahora);
      return { id: nuevos[0], compra: ahora[nuevos[0]], nuevos };
    };
    const a = await agregar({ tipoDocumento: 'Nota de crédito', nroDocumento: '201', montoGasto: 80000, montoDocumento: 95200, documentoOriginal: '100-FACEL' });
    t.eq(a.nuevos.length, 1, 'formulario SEP: la NC se agrega una sola vez');
    t.eq([a.compra.montoGasto, a.compra.montoDocumento], [-80000, -95200], 'formulario SEP: NC digitada en POSITIVO se guarda en NEGATIVO (Firestore)');
    const b = await agregar({ tipoDocumento: 'Nota de crédito', nroDocumento: '202', montoGasto: -3000, montoDocumento: -3570, documentoOriginal: '100-FACEL' });
    t.eq([b.compra.montoGasto, b.compra.montoDocumento], [-3000, -3570], 'formulario SEP: NC digitada en negativo se queda en negativo');
    const c = await agregar({ tipoDocumento: 'Nota de débito', nroDocumento: '203', montoGasto: -5000, montoDocumento: -5950, documentoOriginal: '100-FACEL' });
    t.eq([c.compra.montoGasto, c.compra.montoDocumento], [5000, 5950], 'formulario SEP: ND digitada en NEGATIVO se guarda en POSITIVO');
    const d = await agregar({ tipoDocumento: 'Factura', nroDocumento: '204', montoGasto: -7000, montoDocumento: -8330 });
    t.eq([d.compra.montoGasto, d.compra.montoDocumento], [-7000, -8330], 'formulario SEP: factura en negativo queda tal cual (no se inventan signos)');
    const e = await agregar({ tipoDocumento: 'Factura', nroDocumento: '205', montoGasto: 9000, montoDocumento: 10710 });
    t.eq([e.compra.montoGasto, e.compra.montoDocumento], [9000, 10710], 'formulario SEP: factura en positivo queda en positivo');
    t.eq(await montosFilaCompra(page, MODAL_SEP, a.id), { gasto: '-$80.000', documento: '-$95.200' }, 'formulario SEP: la tabla muestra la NC nueva en negativo');
    t.eq(await celdaItem(page, ITEM, 'ABRIL'), clp(-80000 - 3000 + 5000 - 7000 + 9000), 'formulario SEP: el ítem de abril suma con los signos correctos');

    // editar la NC que estaba en positivo en Firestore: el formulario la carga en negativo y "Guardar cambios" corrige lo guardado
    await page.click(`${MODAL_SEP} tr[data-compra-id="ncPos"] .compra-edit-btn`);
    t.eq(await page.inputValue(`${MODAL_SEP} .compra-input[data-field="montoGasto"]`), '-100000', 'editar: el formulario carga la NC (guardada en positivo) con el monto en negativo');
    t.ok((await textoAvisosForm(page, MODAL_SEP)).includes('Las notas de crédito se registran con monto negativo'), 'editar: con una NC cargada se ve la ayuda de signo');
    await h.clearWrites();
    await page.click(`${MODAL_SEP} .add-compra-btn`);
    await h.flushWrites();
    const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121');
    t.ok(w.length >= 1 && w[0].payload.compras.ncPos.montoGasto === -100000 && w[0].payload.compras.ncPos.montoDocumento === -119000, 'editar: el write de la NC editada lleva los montos en NEGATIVO', w.map(x => x.payload));
    const stE = (await h.store())['sep_carga_rbd/1121'].compras;
    t.eq([stE.ncPos.montoGasto, stE.ncPos.montoDocumento], [-100000, -119000], 'editar: el valor guardado de la NC queda corregido en Firestore');
    t.eq(Object.keys(stE).length, Object.keys(antes).length + 5, 'editar: editar no crea una compra nueva');

    // duplicar la ND que estaba en negativo en Firestore: el formulario la carga en positivo y crea una compra nueva en positivo
    await page.click(`${MODAL_SEP} tr[data-compra-id="ndNeg"] .compra-dup-btn`);
    t.eq(await page.inputValue(`${MODAL_SEP} .compra-input[data-field="montoGasto"]`), '20000', 'duplicar: el formulario carga la ND (guardada en negativo) en positivo');
    const previo = (await h.store())['sep_carga_rbd/1121'].compras;
    await page.click(`${MODAL_SEP} .add-compra-btn`);
    await h.flushWrites();
    const ahora = (await h.store())['sep_carga_rbd/1121'].compras;
    const nuevo = ahora[idsNuevos(previo, ahora)[0]];
    t.eq([nuevo && nuevo.montoGasto, nuevo && nuevo.montoDocumento, nuevo && nuevo.tipoDocumento], [20000, 23800, 'Nota de débito'], 'duplicar: la compra nueva queda con la ND en positivo');
    t.eq(await textoAvisosForm(page, MODAL_SEP), '', 'tras agregar el formulario queda limpio y sin ayuda');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 3. Importación de un Excel con NC en positivo y ND en negativo (SEP)
  {
    const h = await boot({ fixture: fixtureSinCompras() });
    const { page } = h;
    await clickTab(page, 'SEP');
    const c = (id, extra) => filaCompra(id, 1121, 'LICEO PULMAHUE DE LA LIGUA', compraBase(extra));
    const libro = await libroXlsx(page, { COMPRAS: [ENC_COMPRAS_SEP,
      c('x1', { nroDocumento: '1', montoGasto: 500000, montoDocumento: 595000 }),
      c('x2', { nroDocumento: '2', tipoDocumento: 'Nota de crédito', montoGasto: 120000, montoDocumento: 142800, documentoOriginal: '1-FACEL' }),
      c('x3', { nroDocumento: '3', tipoDocumento: 'Nota de crédito', montoGasto: -30000, montoDocumento: -35700, documentoOriginal: '1-FACEL' }),
      c('x4', { nroDocumento: '4', tipoDocumento: 'Nota de débito', montoGasto: -8000, montoDocumento: -9520, documentoOriginal: '1-FACEL' }),
      c('x5', { nroDocumento: '5', tipoDocumento: 'Factura', montoGasto: -2000, montoDocumento: -2380 }),
      c('', { nroDocumento: '6', tipoDocumento: 'nota de credito', montoGasto: 4000, montoDocumento: 4760, documentoOriginal: '1-FACEL' }), // sin ID, tipo sin tilde ni mayúscula
    ] });
    await h.clearWrites();
    const msgs = await importarLibro(h, '#importExcelInput', libro);
    t.ok(/COMPRAS: 6 filas/.test(msgs[0] || ''), 'importar (SEP): se importan las 6 filas', msgs);
    const compras = (await h.store())['sep_carga_rbd/1121'].compras;
    t.eq([compras.x1.montoGasto, compras.x2.montoGasto, compras.x2.montoDocumento, compras.x3.montoGasto, compras.x4.montoGasto, compras.x4.montoDocumento, compras.x5.montoGasto],
      [500000, -120000, -142800, -30000, 8000, 9520, -2000], 'importar (SEP): NC positiva → negativa, NC negativa igual, ND negativa → positiva, factura negativa tal cual');
    const sinId = Object.entries(compras).find(([id, v]) => !['x1', 'x2', 'x3', 'x4', 'x5'].includes(id));
    t.eq([sinId && sinId[1].montoGasto, sinId && sinId[1].montoDocumento], [-4000, -4760], 'importar (SEP): una NC sin ID y con el tipo escrito "nota de credito" también queda en negativo');
    await abrirModalSep(h, '1121');
    t.eq(await celdaItem(page, ITEM, 'MARZO'), clp(500000 - 120000 - 30000 + 8000 - 2000 - 4000), 'importar (SEP): el ítem/mes resta las NC y suma la ND');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 4. Fuentes con compras (General): lectura, formulario, importación
  {
    const h = await boot({ fixture: docsBase() });
    const { page } = h;
    await clickTab(page, 'of-general');
    await h.clearWrites();
    const total = await page.evaluate(() => Array.from(document.querySelectorAll('#tab-of-general .kpi-card')).map(k => k.innerText.replace(/\s+/g, ' ')).find(x => /^Gasto Bienes y Servicios \(Total\)/.test(x)));
    t.ok(total && total.includes(clp(TOTAL_GENERAL)), `General: el KPI Gasto B&S (Total) resta la NC y suma la ND (${clp(TOTAL_GENERAL)})`, total);
    await abrirModalFuente(h, 'general', '1121');
    const m = Object.fromEntries(await Promise.all(['g1', 'g2', 'g3'].map(async id => [id, await montosFilaCompra(page, MODAL_OF, id)])));
    t.eq([m.g1.gasto, m.g2.gasto, m.g2.documento, m.g3.gasto, m.g3.documento], ['$300.000', '-$60.000', '-$71.400', '$5.000', '$5.950'], 'General: tabla de compras con NC en negativo y ND en positivo aunque Firestore las tenga al revés');
    t.eq((await h.writes()).length, 0, 'General: leer y mostrar NO escribe en Firestore');
    t.eq(await textoAvisosForm(page, MODAL_OF), '', 'General: formulario sin ayuda de signo mientras no haya tipo');
    await page.selectOption(`${MODAL_OF} .of-compra-input[data-field="tipoDocumento"]`, 'Nota de crédito');
    t.ok((await textoAvisosForm(page, MODAL_OF)).includes('Las notas de crédito se registran con monto negativo; se ajusta automáticamente'), 'General: con "Nota de crédito" el formulario muestra la ayuda de signo');
    await page.selectOption(`${MODAL_OF} .of-compra-input[data-field="tipoDocumento"]`, '');

    // formulario: NC en positivo → negativa; ND en negativo → positiva; factura negativa tal cual
    const previo0 = (await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras;
    const agregarG = async (extra) => {
      const previo = (await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras;
      await llenarFormulario(page, MODAL_OF, '.of-compra-input', { codigo: '410601', fechaDocumento: '2026-05-04', fechaPago: '2026-05-09', descripcion: 'alta General', ...extra });
      await page.click(`${MODAL_OF} .of-add-compra-btn`);
      await h.flushWrites();
      const ahora = (await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras;
      return ahora[idsNuevos(previo, ahora)[0]];
    };
    const n1 = await agregarG({ tipoDocumento: 'Nota de crédito', nroDocumento: '401', montoGasto: 25000, montoDocumento: 29750, documentoOriginal: '300-FACEL' });
    t.eq([n1.montoGasto, n1.montoDocumento], [-25000, -29750], 'General (formulario): NC digitada en positivo se guarda en negativo');
    const n2 = await agregarG({ tipoDocumento: 'Nota de débito', nroDocumento: '402', montoGasto: -4000, montoDocumento: -4760, documentoOriginal: '300-FACEL' });
    t.eq([n2.montoGasto, n2.montoDocumento], [4000, 4760], 'General (formulario): ND digitada en negativo se guarda en positivo');
    const n3 = await agregarG({ tipoDocumento: 'Factura', nroDocumento: '403', montoGasto: -1500, montoDocumento: -1785 });
    t.eq([n3.montoGasto, n3.montoDocumento], [-1500, -1785], 'General (formulario): factura negativa tal cual');
    t.eq(Object.keys((await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras).length, Object.keys(previo0).length + 3, 'General (formulario): se agregaron exactamente 3 compras');

    // CSV SUPEREDUC de la fuente y Excel de respaldo
    await cerrarModalFuente(page, h);
    const dl = await capturarDescarga(page, () => page.click('#downloadComprasOFBtn-general'));
    const filas = parseCsvPuntoYComa(dl.buffer.toString('utf8')).filter(f => f.length > 1);
    const por = Object.fromEntries(filas.slice(1).map(f => [f[4], f]));
    t.eq([por[301][10], por[301][11]], ['-60000', '-71400'], 'CSV SUPEREDUC (General): la NC en positivo sale en negativo');
    t.eq([por[302][10], por[302][11]], ['5000', '5950'], 'CSV SUPEREDUC (General): la ND en negativo sale en positivo');
    const x1 = await capturarDescarga(page, () => page.click('#downloadExcelOFBtn-general'));
    const l1 = await leerXlsx(page, x1.buffer);
    const fg = (id) => l1.hojas.COMPRAS.find(r => r[0] === id);
    t.eq([fg('g2')[11], fg('g2')[12], fg('g3')[11], fg('g3')[12]], [-60000, -71400, 5000, 5950], 'Excel (General): NC en negativo y ND en positivo');
    const e1 = await importarLibro(h, '#importExcelOFInput-general', x1.buffer, x1.filename);
    t.ok(/COMPRAS: \d+ filas/.test(e1[0] || ''), 'General: reimportar el Excel exportado funciona', e1);
    const x2 = await capturarDescarga(page, () => page.click('#downloadExcelOFBtn-general'));
    t.eq((await leerXlsx(page, x2.buffer)).hojas.COMPRAS, l1.hojas.COMPRAS, 'General: exportar → importar → exportar da la misma hoja COMPRAS (sin duplicados)');
    t.noErrores(h);
    await h.close();
  }
  {
    // importación (General): NC positiva y ND negativa en un Excel hecho a mano
    const h = await boot({ fixture: fixtureSinCompras() });
    const { page } = h;
    await clickTab(page, 'of-general');
    const c = (id, extra) => filaCompra(id, 1121, 'LICEO PULMAHUE DE LA LIGUA', compraBase({ codigo: '410601', ...extra }));
    const libro = await libroXlsx(page, { COMPRAS: [ENC_COMPRAS_FUENTE,
      c('y1', { nroDocumento: '1', montoGasto: 90000, montoDocumento: 107100 }),
      c('y2', { nroDocumento: '2', tipoDocumento: 'Nota de crédito', montoGasto: 20000, montoDocumento: 23800, documentoOriginal: '1-FACEL' }),
      c('y3', { nroDocumento: '3', tipoDocumento: 'Nota de débito', montoGasto: -6000, montoDocumento: -7140, documentoOriginal: '1-FACEL' }),
      c('y4', { nroDocumento: '4', tipoDocumento: 'Factura', montoGasto: -1000, montoDocumento: -1190 }),
    ] });
    await importarLibro(h, '#importExcelOFInput-general', libro);
    const compras = (await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras;
    t.eq([compras.y1.montoGasto, compras.y2.montoGasto, compras.y2.montoDocumento, compras.y3.montoGasto, compras.y3.montoDocumento, compras.y4.montoGasto],
      [90000, -20000, -23800, 6000, 7140, -1000], 'importar (General): NC positiva → negativa, ND negativa → positiva, factura negativa tal cual');
    const total = await page.evaluate(() => Array.from(document.querySelectorAll('#tab-of-general .kpi-card')).map(k => k.innerText.replace(/\s+/g, ' ')).find(x => /^Gasto Bienes y Servicios \(Total\)/.test(x)));
    t.ok(total && total.includes(clp(90000 - 20000 + 6000 - 1000)), 'importar (General): el KPI de Gasto B&S resta la NC', total);
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 5. Equivalencia: NC "mal" guardada ≡ NC "bien" guardada, en TODAS las vistas
  // Los mismos datos con los signos corregidos a mano en Firestore (NC negativa, ND positiva) tienen que verse EXACTAMENTE igual que los datos con los
  // signos "mal" guardados: Panel principal, SEP (tabla y KPI), % Ejecución (agregado, RBD 1121 y consolidado), General, Reportes (Visualizador).
  {
    const corregidos = docsBase();
    const arreglar = (mapa) => Object.values(mapa).forEach(c => {
      if (c.tipoDocumento === 'Nota de crédito') { c.montoGasto = -Math.abs(c.montoGasto); c.montoDocumento = -Math.abs(c.montoDocumento); }
      if (c.tipoDocumento === 'Nota de débito') { c.montoGasto = Math.abs(c.montoGasto); c.montoDocumento = Math.abs(c.montoDocumento); }
    });
    arreglar(corregidos['1121'].compras); arreglar(corregidos['1121'].otras_fuentes.general.compras);
    const recorrer = async (docs) => {
      const h = await boot({ fixture: docs });
      const { page } = h;
      const v = {};
      await clickTab(page, 'Panel principal'); v.dashboard = await textoDe(page, '#tab-dashboard');
      await clickTab(page, 'SEP'); v.sep = await textoDe(page, '#tab-panel');
      await clickTab(page, 'of-general'); v.general = await textoDe(page, '#tab-of-general');
      await clickTab(page, '% Ejecución');
      v.ejecSep = await textoDe(page, '#tab-ejecucion');
      await page.selectOption('#ejecRbdSelect', '1121'); await h.waitIdle(); v.ejecSep1121 = await textoDe(page, '#tab-ejecucion');
      await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="general"]'); await h.waitIdle(); v.ejecGeneral = await textoDe(page, '#tab-ejecucion');
      await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]'); await h.waitIdle(); v.ejecConsolidado = await textoDe(page, '#tab-ejecucion');
      await clickTab(page, 'Reportes'); v.reportes = await textoDe(page, '#tab-reportes');
      await abrirModalFuente(h, 'general', '1121'); v.modalGeneral = await textoDe(page, '#otrasFuentesModal');
      await page.keyboard.press('Escape'); await h.waitIdle();
      await clickTab(page, 'SEP'); await abrirModalSep(h, '1121'); v.modalSep = await textoDe(page, '#rbdModal');
      await h.close();
      return v;
    };
    const mal = await recorrer(docsBase());
    const bien = await recorrer(corregidos);
    for (const vista of Object.keys(mal)) t.eq(mal[vista], bien[vista], `equivalencia: la vista "${vista}" es idéntica con la NC/ND guardada con el signo equivocado o con el correcto`);
  }
});

async function cerrarModalFuente(page, h) {
  await page.keyboard.press('Escape');
  await h.waitIdle();
}
