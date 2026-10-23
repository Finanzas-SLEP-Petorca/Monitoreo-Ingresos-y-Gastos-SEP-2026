// compras_avisos_fecha (F-11 / L-05): avisos visibles de fecha y de gasto "sin contabilizar" en las compras. SOLO AVISOS: no cambian ningún total.
//   · Formulario (SEP y fuentes): validación en vivo de las fechas (formato; año distinto de 2026; fecha de pago anterior a la del documento). No impide guardar.
//   · Tabla de compras: insignia por fila ("⚠ fecha fuera de 2026" / "⚠ fecha no válida: no se contabiliza" / "⚠ cuenta no reconocida: no se contabiliza") con `title`,
//     y un resumen sobre la tabla ("N compras con avisos; $X sin contabilizar").
//   · "Datos a revisar" de SEP suma los RBD con compras con avisos (las fuentes no tienen ese contador: ver README).
//   · Qué compras quedan EXCLUIDAS hoy de los totales (documentado y fijado aquí): código de cuenta fuera del catálogo; Fecha Documento que no empieza con aaaa-mm-dd o con
//     un mes inexistente (13, 00). Entran (por su mes, sin mirar el año): 2025-12-30, 2027-01-15, 2026-02-31, 2026-04-99.
import { boot, clickTab, textoDe } from '../lib/boot.mjs';
import { capturarDescarga } from '../lib/capture-utils.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { fixtureSinCompras, compraBase, celdaItem, abrirModalSep, cerrarModalSep, abrirModalFuente } from '../lib/compras.mjs';

const ITEM = 'BIBLIOTECAS, LIBROS Y REVISTAS'; // 410606
const MODAL_SEP = '#modalBody';
const MODAL_OF = '#otrasFuentesModalBody';
const FUERA = '⚠ fecha fuera de 2026', NOVALIDA_EXCL = '⚠ fecha no válida: no se contabiliza', NOVALIDA = '⚠ fecha no válida', CUENTA = '⚠ cuenta no reconocida: no se contabiliza';

// Una compra por caso; el monto es una potencia de 2 para poder leer qué entró en qué mes.
const CASOS = {
  ok:       { fechaDocumento: '2026-03-10', monto: 1000,    mes: 'MARZO' },
  y2025:    { fechaDocumento: '2025-12-30', monto: 2000,    mes: 'DICIEMBRE', fila: [[FUERA]] },
  y2027:    { fechaDocumento: '2027-01-15', monto: 4000,    mes: 'ENERO', fila: [[FUERA]] },
  feb31:    { fechaDocumento: '2026-02-31', monto: 8000,    mes: 'FEBRERO', fila: [[NOVALIDA]] },
  abr99:    { fechaDocumento: '2026-04-99', monto: 16000,   mes: 'ABRIL', fila: [[NOVALIDA]] },
  isoT:     { fechaDocumento: '2026-05-10T00:00:00', monto: 32000, mes: 'MAYO' },
  pago27:   { fechaDocumento: '2026-06-10', fechaPago: '2027-01-05', monto: 3000, mes: 'JUNIO', pago: [FUERA] },
  mes13:    { fechaDocumento: '2026-13-01', monto: 64000,   excl: true, fila: [[NOVALIDA_EXCL]] },
  mes00:    { fechaDocumento: '2026-00-10', monto: 128000,  excl: true, fila: [[NOVALIDA_EXCL]] },
  dmy:      { fechaDocumento: '10/03/2026', monto: 256000,  excl: true, fila: [[NOVALIDA_EXCL]] },
  dmyGuion: { fechaDocumento: '10-03-2026', monto: 512000,  excl: true, fila: [[NOVALIDA_EXCL]] },
  corta:    { fechaDocumento: '2026-3-5',   monto: 1024000, excl: true, fila: [[NOVALIDA_EXCL]] },
  vacia:    { fechaDocumento: '',           monto: 2048000, excl: true, fila: [[NOVALIDA_EXCL]] },
  texto:    { fechaDocumento: 'marzo',      monto: 4096000, excl: true, fila: [[NOVALIDA_EXCL]] },
  cuenta:   { fechaDocumento: '2026-03-12', monto: 8192000, excl: true, codigo: '999999', cuentaAviso: CUENTA },
};
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const EXCLUIDAS = Object.entries(CASOS).filter(([, c]) => c.excl);
const CONTADAS = Object.entries(CASOS).filter(([, c]) => !c.excl);
const SIN_CONTABILIZAR = EXCLUIDAS.reduce((s, [, c]) => s + c.monto, 0); // 16.320.000
const CONTABILIZADO = CONTADAS.reduce((s, [, c]) => s + c.monto, 0);     // 66.000
const N_CON_AVISOS = Object.values(CASOS).filter(c => c.fila || c.pago || c.cuentaAviso).length; // 13
const clp = (n) => '$' + n.toLocaleString('es-CL');

function comprasDe(codigoBase) {
  const m = {};
  Object.entries(CASOS).forEach(([id, c], i) => {
    m[id] = compraBase({ codigo: c.codigo || codigoBase, nroDocumento: String(100 + i), fechaDocumento: c.fechaDocumento, fechaPago: c.fechaPago || '2026-07-01', montoGasto: c.monto, montoDocumento: c.monto, descripcion: `caso ${id}` });
  });
  return m;
}
// Marcas ⚠ de una fila: { celdas: {doc:[texto], pago:[texto], cuenta:[texto]}, titulos }
const marcasDeFila = (page, modal, id) => page.evaluate(([m, compraId]) => {
  const tr = Array.from(document.querySelectorAll(`${m} tr[data-compra-id]`)).find(x => x.dataset.compraId === compraId);
  if (!tr) return null;
  const tds = Array.from(tr.children);
  const marcas = (td) => Array.from(td.querySelectorAll('.compra-aviso-fecha')).map(x => ({ texto: x.textContent.trim(), titulo: x.getAttribute('title') || '' }));
  return { cuenta: marcas(tds[0]), doc: marcas(tds[3]), pago: marcas(tds[4]), resto: tds.slice(1).filter((_, i) => ![2, 3].includes(i)).some(td => td.querySelector('.compra-aviso-fecha')) };
}, [modal, id]);
const resumenTexto = (page, modal) => page.evaluate((m) => { const e = document.querySelector(`${m} .compras-avisos-resumen`); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, modal);
const avisosForm = (page, modal) => page.evaluate((m) => { const c = document.querySelector(`${m} .compra-form-avisos`); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; }, modal);

await correrSpec('compras_avisos_fecha', async (t) => {
  // =================================================================== 1. SEP: tabla, resumen, Datos a revisar y totales intactos
  {
    const docs = fixtureSinCompras();
    docs['1121'].compras = comprasDe('410606');
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    const kpi = await textoDe(page, '#kpiRow');
    t.ok(kpi.includes(`Gasto Bienes y Servicios (a Diciembre)\n${clp(CONTABILIZADO)}`), `SEP: el KPI de Gasto B&S NO cambia: solo suma lo que ya sumaba (${clp(CONTABILIZADO)})`, kpi.split('\n').slice(6, 8));
    t.ok(/Datos a revisar\n1\n/.test(kpi), 'SEP: "Datos a revisar" cuenta 1 (el RBD 1121 con compras con avisos)', kpi.split('\n').filter(l => /revisar|avisos/.test(l)));
    t.ok(/incluye 1 RBD con avisos de fecha o cuenta en sus compras/.test(kpi), 'SEP: la tarjeta aclara que incluye 1 RBD con avisos en sus compras');
    const tag = await page.evaluate(() => { const e = document.querySelector('#tableBody tr[data-rbd="1121"] .tag.anomalia'); return e ? { texto: e.textContent.trim(), titulo: e.getAttribute('title') } : null; });
    t.ok(tag && tag.texto === 'revisar' && /13 compras con avisos/.test(tag.titulo), 'SEP: el RBD 1121 muestra la marca "revisar" con el motivo en el title', tag);
    t.eq(await page.evaluate(() => document.querySelectorAll('#tableBody .tag.anomalia').length), 1, 'SEP: ningún otro RBD queda marcado');

    await abrirModalSep(h, '1121');
    // lo que entra y lo que no entra en los totales (la regla de hoy, sin cambios)
    for (const mes of MESES) {
      const esperado = CONTADAS.filter(([, c]) => c.mes === mes).reduce((s, [, c]) => s + c.monto, 0);
      t.eq(await celdaItem(page, ITEM, mes), esperado ? clp(esperado) : '—', `SEP: totales del ítem en ${mes} = ${esperado ? clp(esperado) : '—'} (se cuenta por el mes de la Fecha Documento, sin mirar el año)`);
    }
    // marcas por fila
    for (const [id, c] of Object.entries(CASOS)) {
      const m = await marcasDeFila(page, MODAL_SEP, id);
      const esperadoDoc = (c.fila || []).flat();
      t.eq(m.doc.map(x => x.texto), esperadoDoc, `SEP: fila "${id}" (${c.fechaDocumento || 'sin fecha'}): marca de fecha de documento = ${esperadoDoc.join(' / ') || 'ninguna'}`);
      if (c.pago) t.eq(m.pago.map(x => x.texto), c.pago, `SEP: fila "${id}": marca de fecha de pago fuera de 2026`);
      else t.eq(m.pago.length, 0, `SEP: fila "${id}": sin marca en la fecha de pago`);
      if (c.cuentaAviso) t.eq(m.cuenta.map(x => x.texto), [c.cuentaAviso], `SEP: fila "${id}": cuenta fuera del catálogo = "${c.cuentaAviso}"`);
      else t.eq(m.cuenta.length, 0, `SEP: fila "${id}": sin marca en la cuenta`);
      t.ok([...m.doc, ...m.pago, ...m.cuenta].every(x => x.titulo.length > 30), `SEP: fila "${id}": cada marca trae un title explicativo`, [...m.doc, ...m.pago, ...m.cuenta]);
    }
    const titulos = await marcasDeFila(page, MODAL_SEP, 'y2025');
    t.ok(/2025-12-30/.test(titulos.doc[0].titulo) && /Diciembre de 2026/.test(titulos.doc[0].titulo), 'SEP: el title de "fecha fuera de 2026" dice a qué mes se suma', titulos.doc[0].titulo);
    t.ok(/NO entra en ningún total/.test((await marcasDeFila(page, MODAL_SEP, 'dmy')).doc[0].titulo), 'SEP: el title de "no válida" avisa que no entra en ningún total');
    // resumen sobre la tabla
    const res = await resumenTexto(page, MODAL_SEP);
    t.ok(res && res.startsWith(`⚠ ${N_CON_AVISOS} compras con avisos; ${clp(SIN_CONTABILIZAR)} sin contabilizar (8 compras que no entran en ningún total)`), `SEP: resumen sobre la tabla: "${N_CON_AVISOS} compras con avisos; ${clp(SIN_CONTABILIZAR)} sin contabilizar"`, res);
    t.ok(/2 con fecha de documento fuera de 2026/.test(res) && /7 con fecha no válida \(no se contabilizan\)/.test(res) && /2 con una fecha que no existe en el calendario/.test(res) && /1 con fecha de pago fuera de 2026/.test(res) && /1 con una cuenta no reconocida/.test(res), 'SEP: el resumen detalla las causas', res);
    // el CSV y el Excel NO cambian por los avisos (ninguna marca ⚠ en las exportaciones)
    await cerrarModalSep(h);
    const csv = (await capturarDescarga(page, () => page.click('#downloadComprasSepBtn'))).buffer.toString('utf8');
    t.ok(!csv.includes('⚠'), 'SEP: el CSV de SUPEREDUC no lleva las marcas de aviso');
    await page.evaluate(() => { document.querySelector('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1121"]').click(); });
    await h.waitIdle();
    const impreso = (await h.prints())[0];
    t.ok(impreso && !/fecha fuera de 2026|fecha no válida|cuenta no reconocida|con avisos/.test(impreso.printWrap), 'SEP: el PDF por fila no cambia (sin marcas de aviso)');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 2. SEP: sin avisos, nada se ve (fixture limpio)
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await clickTab(page, 'SEP');
    const kpi = await textoDe(page, '#kpiRow');
    t.ok(/Datos a revisar\n\d+\nposible error de imputación(\n|$)/.test(kpi), 'default: "Datos a revisar" no cambia su texto cuando no hay avisos', kpi.split('\n').filter(l => /revisar|imputación/.test(l)));
    await abrirModalSep(h, '1121');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody .compra-aviso-fecha, #modalBody .compras-avisos-resumen').length), 0, 'default: el detalle del RBD 1121 no muestra ningún aviso de fecha ni resumen');
    await cerrarModalSep(h);
    await abrirModalFuente(h, 'general', '1121');
    t.eq(await page.evaluate(() => document.querySelectorAll('#otrasFuentesModalBody .compra-aviso-fecha, #otrasFuentesModalBody .compras-avisos-resumen').length), 0, 'default: General › 1121 no muestra ningún aviso de fecha ni resumen');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 3. SEP: validación en vivo del formulario (no impide guardar)
  {
    const h = await boot({ fixture: fixtureSinCompras() });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1121');
    const F = (campo) => `${MODAL_SEP} .compra-input[data-field="${campo}"]`;
    t.eq(await avisosForm(page, MODAL_SEP), '', 'formulario SEP: vacío = sin avisos');
    await page.fill(F('fechaDocumento'), '2026-03-10');
    t.eq(await avisosForm(page, MODAL_SEP), '', 'formulario SEP: fecha de 2026 = sin avisos');
    await page.fill(F('fechaDocumento'), '2025-12-30');
    t.ok(/La fecha de documento \(2025-12-30\) está fuera de 2026/.test(await avisosForm(page, MODAL_SEP)), 'formulario SEP: fecha de documento de 2025 → "está fuera de 2026"', await avisosForm(page, MODAL_SEP));
    await page.fill(F('fechaDocumento'), '2026-03-10');
    await page.fill(F('fechaPago'), '2026-03-01');
    t.ok(/La fecha de pago es anterior a la fecha del documento/.test(await avisosForm(page, MODAL_SEP)), 'formulario SEP: pago anterior al documento → aviso', await avisosForm(page, MODAL_SEP));
    await page.fill(F('fechaPago'), '2027-01-05');
    t.ok(/La fecha de pago \(2027-01-05\) está fuera de 2026/.test(await avisosForm(page, MODAL_SEP)), 'formulario SEP: pago de 2027 → "está fuera de 2026"');
    await page.fill(F('fechaPago'), '2026-03-20');
    t.eq(await avisosForm(page, MODAL_SEP), '', 'formulario SEP: fechas correctas = sin avisos');
    // fecha a medio teclear (mes sin día ni año): el campo queda vacío pero el navegador lo marca inválido
    await page.fill(F('fechaDocumento'), '');
    await page.click(F('fechaDocumento'));
    await page.keyboard.type('12');
    t.ok(/incompleta o no es válida/.test(await avisosForm(page, MODAL_SEP)), 'formulario SEP: fecha de documento incompleta → aviso "incompleta o no es válida"', await avisosForm(page, MODAL_SEP));
    // los avisos no impiden guardar: se agrega una compra con fecha de 2025 y de pago anterior
    await page.fill(F('fechaDocumento'), '2025-12-30');
    await page.fill(F('fechaPago'), '2025-12-01');
    await page.selectOption(F('codigo'), '410606');
    await page.fill(F('montoGasto'), '12345');
    await page.click(`${MODAL_SEP} .add-compra-btn`);
    await h.flushWrites();
    const guardadas = Object.values((await h.store())['sep_carga_rbd/1121'].compras || {});
    t.eq(guardadas.length, 1, 'formulario SEP: los avisos NO impiden guardar (la compra de 2025 se guardó)');
    t.eq(guardadas[0] && guardadas[0].fechaDocumento, '2025-12-30', 'formulario SEP: se guardó con la fecha tal como se digitó');
    t.eq(await avisosForm(page, MODAL_SEP), '', 'formulario SEP: tras agregar, el formulario queda limpio y sin avisos');
    // la tabla ya muestra la marca y el resumen, y "Datos a revisar" sube
    const m = await marcasDeFila(page, MODAL_SEP, Object.keys((await h.store())['sep_carga_rbd/1121'].compras)[0]);
    t.eq(m.doc.map(x => x.texto), [FUERA], 'formulario SEP: la compra recién agregada muestra "⚠ fecha fuera de 2026"');
    t.ok(/⚠ 1 compra con avisos\. 1 con fecha de documento fuera de 2026/.test(await resumenTexto(page, MODAL_SEP)), 'formulario SEP: el resumen aparece (1 compra con avisos, nada sin contabilizar porque sí se suma)', await resumenTexto(page, MODAL_SEP));
    t.ok(!/sin contabilizar/.test(await resumenTexto(page, MODAL_SEP)), 'formulario SEP: una fecha fuera de 2026 no se marca como "sin contabilizar" (sí entra en los totales)');
    t.eq(await celdaItem(page, ITEM, 'DICIEMBRE'), '$12.345', 'formulario SEP: y se suma igual en Diciembre (el total no cambia)');
    t.ok(/Datos a revisar\n1\n/.test(await textoDe(page, '#kpiRow')), 'formulario SEP: "Datos a revisar" pasa a 1');
    // editar la compra y corregir la fecha: los avisos desaparecen
    const id = Object.keys((await h.store())['sep_carga_rbd/1121'].compras)[0];
    await page.click(`${MODAL_SEP} tr[data-compra-id="${id}"] .compra-edit-btn`);
    t.ok(/fuera de 2026/.test(await avisosForm(page, MODAL_SEP)), 'editar: al cargar la compra el formulario avisa de su fecha');
    await page.fill(F('fechaDocumento'), '2026-03-10');
    await page.fill(F('fechaPago'), '2026-03-12');
    await page.click(`${MODAL_SEP} .add-compra-btn`);
    await h.flushWrites();
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody .compra-aviso-fecha, #modalBody .compras-avisos-resumen').length), 0, 'editar: corregida la fecha desaparecen la marca y el resumen');
    t.ok(/Datos a revisar\n0\n/.test(await textoDe(page, '#kpiRow')), 'editar: "Datos a revisar" vuelve a 0');
    t.noErrores(h);
    await h.close();
  }

  // =================================================================== 4. Fuentes (General): tabla, resumen y formulario
  {
    const docs = fixtureSinCompras();
    docs['1121'].otras_fuentes.general.compras = comprasDe('410601');
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'of-general');
    const total = await page.evaluate(() => Array.from(document.querySelectorAll('#tab-of-general .kpi-card')).map(k => k.innerText.replace(/\s+/g, ' ')).find(x => /^Gasto Bienes y Servicios \(Total\)/.test(x)));
    t.ok(total && total.includes(clp(CONTABILIZADO)), `General: el KPI de Gasto B&S (Total) NO cambia (${clp(CONTABILIZADO)})`, total);
    await abrirModalFuente(h, 'general', '1121');
    for (const [id, c] of Object.entries(CASOS)) {
      const m = await marcasDeFila(page, MODAL_OF, id);
      t.eq(m.doc.map(x => x.texto), (c.fila || []).flat(), `General: fila "${id}": marca de fecha de documento`);
      if (c.pago) t.eq(m.pago.map(x => x.texto), c.pago, `General: fila "${id}": marca de fecha de pago fuera de 2026`);
      if (c.cuentaAviso) t.eq(m.cuenta.map(x => x.texto), [c.cuentaAviso], `General: fila "${id}": cuenta fuera del catálogo`);
    }
    const res = await resumenTexto(page, MODAL_OF);
    t.ok(res && res.startsWith(`⚠ ${N_CON_AVISOS} compras con avisos; ${clp(SIN_CONTABILIZAR)} sin contabilizar (8 compras que no entran en ningún total)`), `General: resumen sobre la tabla: "${N_CON_AVISOS} compras con avisos; ${clp(SIN_CONTABILIZAR)} sin contabilizar"`, res);
    // formulario en vivo
    const F = (campo) => `${MODAL_OF} .of-compra-input[data-field="${campo}"]`;
    await page.fill(F('fechaDocumento'), '2025-06-01');
    t.ok(/La fecha de documento \(2025-06-01\) está fuera de 2026/.test(await avisosForm(page, MODAL_OF)), 'formulario General: fecha de 2025 → "está fuera de 2026"', await avisosForm(page, MODAL_OF));
    await page.fill(F('fechaDocumento'), '2026-06-01');
    await page.fill(F('fechaPago'), '2026-05-01');
    t.ok(/La fecha de pago es anterior a la fecha del documento/.test(await avisosForm(page, MODAL_OF)), 'formulario General: pago anterior al documento → aviso');
    await page.fill(F('fechaPago'), '2026-06-05');
    t.eq(await avisosForm(page, MODAL_OF), '', 'formulario General: fechas correctas = sin avisos');
    // una compra con fecha de 2025 se guarda igual
    await page.selectOption(F('codigo'), '410601');
    await page.fill(F('fechaDocumento'), '2025-06-01');
    await page.fill(F('montoGasto'), '777');
    await page.click(`${MODAL_OF} .of-add-compra-btn`);
    await h.flushWrites();
    const n = Object.keys((await h.store())['sep_carga_rbd/1121'].otras_fuentes.general.compras).length;
    t.eq(n, Object.keys(CASOS).length + 1, 'formulario General: los avisos NO impiden guardar');
    t.ok(/⚠ 14 compras con avisos/.test(await resumenTexto(page, MODAL_OF)), 'formulario General: el resumen sube a 14 compras con avisos', await resumenTexto(page, MODAL_OF));
    // las fuentes no tienen el contador "Datos a revisar": no hay ninguna tarjeta con ese nombre
    t.eq(await page.evaluate(() => /Datos a revisar/.test(document.getElementById('tab-of-general').innerText)), false, 'General: las fuentes no tienen "Datos a revisar" (no se inventa uno)');
    t.noErrores(h);
    await h.close();
  }
});
