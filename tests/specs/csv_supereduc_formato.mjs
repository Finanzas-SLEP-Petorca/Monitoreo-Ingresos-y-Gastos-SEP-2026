// csv_supereduc_formato (A4): el CSV "Compras SUPEREDUC" (SEP y fuentes) sigue la plantilla del Manual de Usuario Cap. III
// (Rendición de Cuentas 2026, columnas A–M y Tabla 02): tipo de documento por CÓDIGO (FACEL…), fechas dd-mm-aaaa,
// descripción ≤ 100, RUT sin puntos con guion, "Documento Original" vacío salvo en NOTACRE/NOTADEB (número-TIPO) y, antes de
// descargar, un aviso con el conteo de filas que la plataforma rechazaría y por qué (cancelar no descarga).
// Lo guardado en Firestore, lo que se ve en pantalla y el Excel de respaldo NO cambian.
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';

const ENCABEZADO = 'RBD;Subvencion;Codigo Cuenta;Tipo de Documento;Nro Documento;Fecha Documento;Fecha Pago;Descripcion Gasto;Rut Proveedor;Nombre Proveedor;Monto Gasto;Monto Documento;Documento Original';
const C = { RBD: 0, SUB: 1, CUENTA: 2, TIPO: 3, NRO: 4, FDOC: 5, FPAGO: 6, DESC: 7, RUT: 8, PROV: 9, GASTO: 10, DOC: 11, ORIG: 12 };
const LARGA = 'D'.repeat(130);
const base = { codigo: '410606', tipoDocumento: 'Factura electrónica', nroDocumento: '1001', fechaDocumento: '2026-05-07', fechaPago: '2026-05-07', descripcion: 'Resmas de papel',
  rutProveedor: '76.123.456-7', nombreProveedor: 'Papelera SpA', montoGasto: 1000, montoDocumento: 1000, documentoOriginal: 'DC_045' };
const compra = (extra) => ({ ...base, ...extra });

// 10 compras: 3 correctas (FACEL, NOTACRE, NOTADEB) + 7 con algún problema distinto cada una
const COMPRAS = {
  a: compra({ nroDocumento: '1001', descripcion: LARGA }),                                                               // descripción > 100
  b: compra({ nroDocumento: '1002', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-20', fechaPago: '2026-05-20', documentoOriginal: '1001-FAC', montoGasto: -1000, montoDocumento: -1000 }),
  c: compra({ nroDocumento: '1003', tipoDocumento: 'Nota de débito', fechaDocumento: '2026-05-21', fechaPago: '2026-05-21', documentoOriginal: '45 - Factura electrónica' }),
  d: compra({ nroDocumento: '1004', tipoDocumento: 'Factura', fechaPago: '2025-12-30', documentoOriginal: 'DC_045' }),                // pago en 2025 (fuera de 2026 y anterior al documento)
  e: compra({ nroDocumento: '1005', tipoDocumento: 'Boleta de honorarios electrónica' }),                              // honorarios
  f: compra({ nroDocumento: '1006', tipoDocumento: 'Vale' }),                                                            // tipo sin código oficial
  g: compra({ nroDocumento: '1007', fechaDocumento: '2026-02-31' }),                                                     // fecha inexistente
  h: compra({ nroDocumento: '1008', montoGasto: 5000, montoDocumento: 4000 }),                                           // gasto > documento
  i: compra({ nroDocumento: '1009', tipoDocumento: 'Nota de crédito', documentoOriginal: 'DC_1', montoGasto: -500, montoDocumento: -500 }), // NC sin número-TIPO
  j: compra({ nroDocumento: '1010', tipoDocumento: 'Boleta', rutProveedor: '111111111' }),                               // correcta; RUT sin guion
};
const TIPOS_PANEL = ['Boleta', 'Boleta exenta', 'Boleta electrónica', 'Boleta exenta electrónica', 'Boleta de honorarios manual', 'Boleta de honorarios exenta', 'Boleta de honorarios electrónica',
  'Boleta honorarios prestación de servicios a terceros', 'Boleta honorarios prestación de servicios a terceros electrónica', 'Factura', 'Factura exenta', 'Factura electrónica', 'Factura exenta electrónica',
  'Otro documento exento', 'Finiquito', 'Documento extranjero', 'Nota de crédito', 'Nota de débito'];
const CODIGOS_ESPERADOS = ['BOL', 'BOLE', 'BOLEC', 'BOLEX', 'BOLH', 'BHE', 'BOLHE', 'BPST', 'BPSTE', 'FAC', 'FACE', 'FACEL', 'FACEX', 'ODE', 'FIN', 'DOCEX', 'NOTACRE', 'NOTADEB'];

function fixtureCon({ sep, pie, mant, general, ac }) {
  const docs = JSON.parse(JSON.stringify(cargarFixture('default').docs));
  Object.values(docs).forEach(d => { if (d.compras) d.compras = {}; Object.values(d.otras_fuentes || {}).forEach(o => { if (o && o.compras) o.compras = {}; }); });
  if (sep) docs['1121'].compras = sep;
  if (pie) docs['1121'].otras_fuentes.pie.compras = pie;
  if (mant) docs['1121'].otras_fuentes.mantenimiento.compras = mant;
  if (general) docs['1121'].otras_fuentes.general.compras = general;
  if (ac) docs.AC.otras_fuentes.general.compras = ac;
  return docs;
}
const filasCsv = (buffer) => parseCsvPuntoYComa(buffer.toString('utf8')).filter(f => f.length > 1);
const porNro = (filas) => Object.fromEntries(filas.slice(1).map(f => [f[C.NRO], f]));
const ultimoConfirm = (h) => { const c = h.dialogs.filter(d => d.type === 'confirm'); return c.length ? c[c.length - 1].message : null; };

await correrSpec('csv_supereduc_formato', async (t) => {
  // =============================================================== SEP
  {
    const h = await boot({ fixture: fixtureCon({ sep: COMPRAS }) });
    const { page } = h;
    await clickTab(page, 'SEP');
    await h.clearWrites();
    const dl = await capturarDescarga(page, () => page.click('#downloadComprasSepBtn'));
    const texto = dl.buffer.toString('utf8');
    const lineas = texto.replace(/^﻿/, '').split('\r\n');
    t.eq(lineas[0], ENCABEZADO, 'SEP: encabezado de la plantilla (columnas A–M) intacto');
    t.ok(texto.charCodeAt(0) === 0xFEFF && texto.includes('\r\n'), 'SEP: BOM UTF-8 y CRLF como antes');
    const filas = filasCsv(dl.buffer);
    t.eq(filas.length - 1, 10, 'SEP: una fila por compra (10)');
    const f = porNro(filas);
    t.eq([f[1001][C.RBD], f[1001][C.SUB], f[1001][C.CUENTA]], ['1121', 'SEP', '410606'], 'SEP: columnas A, B y C (RBD, subvención, cuenta) sin cambios');
    t.eq(f[1001][C.TIPO], 'FACEL', 'SEP: "Factura electrónica" sale como el código FACEL');
    t.eq([f[1001][C.FDOC], f[1001][C.FPAGO]], ['07-05-2026', '07-05-2026'], 'SEP: fecha 2026-05-07 sale como 07-05-2026 (dd-mm-aaaa) en documento y pago');
    t.eq(f[1001][C.DESC], LARGA.slice(0, 100), 'SEP: descripción de 130 caracteres sale recortada a 100');
    t.ok(filas.slice(1).every(r => r[C.DESC].length <= 100), 'SEP: ninguna descripción supera 100 caracteres');
    t.eq(f[1001][C.RUT], '76123456-7', 'SEP: RUT sin puntos y con guion y dígito verificador');
    t.eq(f[1010][C.RUT], '11111111-1', 'SEP: RUT sin guion ("111111111") sale con guion');
    t.eq([f[1001][C.GASTO], f[1001][C.DOC]], ['1000', '1000'], 'SEP: montos sin cambios');
    t.eq(f[1001][C.ORIG], '', 'SEP: Documento Original VACÍO en una factura (aunque el panel guarde "DC_045")');
    t.eq(f[1004][C.ORIG], '', 'SEP: Documento Original vacío en toda factura/boleta con referencia interna');
    t.eq([f[1002][C.TIPO], f[1002][C.ORIG]], ['NOTACRE', '1001-FAC'], 'SEP: NOTACRE lleva Documento Original = número-TIPO (1001-FAC)');
    t.eq([f[1003][C.TIPO], f[1003][C.ORIG]], ['NOTADEB', '45-FACEL'], 'SEP: NOTADEB con "45 - Factura electrónica" sale como 45-FACEL');
    t.eq(filas.slice(1).filter(r => r[C.ORIG] !== '').map(r => r[C.NRO]).sort(), ['1002', '1003', '1009'], 'SEP: Documento Original solo en las notas de crédito/débito (nunca en otro tipo)');
    t.eq(f[1005][C.TIPO], 'BOLHE', 'SEP: boleta de honorarios electrónica → BOLHE (Sección 12 del Manual de Cuentas)');
    t.eq([f[1006][C.TIPO], f[1007][C.FDOC]], ['Vale', '2026-02-31'], 'SEP: un tipo sin código oficial o una fecha inexistente se exportan tal cual (igual se descarga)');
    // aviso previo con el conteo
    const msg = ultimoConfirm(h);
    t.ok(msg && /en 7 de 10 compras/.test(msg), 'SEP: antes de descargar avisa "en 7 de 10 compras" hay datos que la plataforma rechazaría', msg && msg.split('\n')[0]);
    const lista = (msg || '').split('\n').filter(l => /^\s*•/.test(l)).map(l => l.trim());
    const tiene = (re, n) => lista.some(l => re.test(l) && l.includes(`• ${n} fila`));
    t.ok(tiene(/sin código oficial/, 1), 'aviso: 1 fila con tipo de documento sin código oficial', lista);
    t.ok(tiene(/fecha de documento inválida/, 1), 'aviso: 1 fila con fecha de documento inválida');
    t.ok(tiene(/fuera de 2026/, 1), 'aviso: 1 fila con fecha de pago fuera de 2026 (la de 2025)');
    t.ok(tiene(/anterior a la fecha del documento/, 1), 'aviso: 1 fila con fecha de pago anterior a la del documento');
    t.ok(tiene(/monto gasto mayor/, 1), 'aviso: 1 fila con monto gasto mayor que el monto del documento (y NO se marca la nota de crédito en negativo)');
    t.ok(tiene(/más de 100 caracteres/, 1), 'aviso: 1 fila con descripción de más de 100 caracteres');
    t.ok(tiene(/número-TIPO/, 1), 'aviso: 1 nota de crédito sin Documento Original con formato número-TIPO');
    t.ok(tiene(/honorarios/, 1), 'aviso: 1 documento de honorarios (van en otro libro de SUPEREDUC)');
    // lo guardado y lo que se ve NO cambian
    t.eq((await h.writes()).length, 0, 'la exportación no escribe nada en Firestore');
    const st = await h.store();
    t.eq(st['sep_carga_rbd/1121'].compras.b.tipoDocumento, 'Nota de crédito', 'Firestore sigue guardando el nombre del tipo ("Nota de crédito")');
    t.eq(st['sep_carga_rbd/1121'].compras.a.fechaDocumento, '2026-05-07', 'Firestore sigue guardando la fecha aaaa-mm-dd');
    t.eq(st['sep_carga_rbd/1121'].compras.a.descripcion.length, 130, 'Firestore conserva la descripción completa (130)');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    const pantalla = await page.evaluate(() => document.getElementById('modalBody').innerText);
    t.ok(pantalla.includes('Factura electrónica') && pantalla.includes('2026-05-07') && pantalla.includes(LARGA) && pantalla.includes('DC_045'), 'la pantalla sigue mostrando nombre del tipo, fecha aaaa-mm-dd, descripción completa y la referencia interna');
    await page.keyboard.press('Escape');
    await clickTab(page, 'SEP');
    const xl = await leerXlsx(page, (await capturarDescarga(page, () => page.click('#downloadExcelBtn'))).buffer);
    const rx = Object.fromEntries(xl.hojas.COMPRAS.slice(1).filter(r => String(r[1]) === '1121').map(r => [String(r[0]), r]));
    t.eq([rx.a[4], rx.a[6], rx.a[8].length, rx.a[13]], ['Factura electrónica', '2026-05-07', 130, 'DC_045'], 'el Excel de respaldo conserva tipo por nombre, fecha ISO, descripción completa y referencia interna');
    // el CSV de la fila de la tabla = mismas filas (solo 1121 tiene compras)
    const dlFila = await capturarDescarga(page, () => page.evaluate(() => document.querySelector('.row-action-btn[data-action="csvsep"][data-rbd="1121"]').click()));
    t.eq(dlFila.buffer.toString('utf8'), texto, 'CSV de la fila (⬇ CSV SEP): mismo contenido y mismas reglas que el CSV general');
    t.ok(/en 7 de 10 compras/.test(ultimoConfirm(h) || ''), 'CSV de la fila: también avisa antes de descargar');
    // títulos de los botones
    const titulos = await page.evaluate(() => ['downloadComprasSepBtn', ...['general', 'pie', 'mantenimiento', 'prorretencion'].map(k => 'downloadComprasOFBtn-' + k)].map(id => document.getElementById(id).title));
    t.ok(titulos.every(x => !/formato exacto/i.test(x) && /plantilla SUPEREDUC/.test(x) && /un CSV por/.test(x)), 'los 5 botones ya no prometen "formato exacto": explican la plantilla y que la plataforma carga un CSV por RBD', titulos);
    t.noErrores(h);
    await h.close();
  }

  // =============================================================== cancelar el aviso no descarga
  {
    const h = await boot({ fixture: fixtureCon({ sep: COMPRAS }), onDialog: (d) => (d.type() === 'confirm' ? 'dismiss' : undefined) });
    await clickTab(h.page, 'SEP');
    let descargas = 0;
    h.page.on('download', () => { descargas++; });
    await h.page.click('#downloadComprasSepBtn');
    await h.page.waitForTimeout(800);
    t.eq(descargas, 0, 'cancelar el aviso (¿Descargar de todos modos? → Cancelar): NO se descarga nada');
    t.ok(/¿Descargar de todos modos\?/.test(ultimoConfirm(h) || ''), 'el aviso pregunta si se descarga de todos modos');
    await h.close();
  }

  // =============================================================== sin problemas: no hay aviso
  {
    const limpias = { a: compra({ nroDocumento: '1' }), b: compra({ nroDocumento: '2', tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-05-20', fechaPago: '2026-05-20', documentoOriginal: '1-FAC', montoGasto: -100, montoDocumento: -100 }) };
    const h = await boot({ fixture: fixtureCon({ sep: limpias }) });
    await clickTab(h.page, 'SEP');
    const dl = await capturarDescarga(h.page, () => h.page.click('#downloadComprasSepBtn'));
    t.eq(h.dialogs.filter(d => d.type === 'confirm').length, 0, 'compras sin problemas: no hay aviso, se descarga directo');
    t.eq(filasCsv(dl.buffer).length - 1, 2, 'compras sin problemas: 2 filas');
    await h.close();
  }

  // =============================================================== fuentes (PIE, Mantención, General y AC): misma función de normalización
  {
    const todos = Object.fromEntries(TIPOS_PANEL.map((tp, i) => ['t' + i, compra({ nroDocumento: String(2000 + i), tipoDocumento: tp,
      ...(tp === 'Nota de crédito' || tp === 'Nota de débito' ? { documentoOriginal: '7-FACEL' } : {}) })]));
    const general = { g1: compra({ nroDocumento: '3001', descripcion: 'Compra general' }) };
    const ac = { ac1: compra({ nroDocumento: '4001', tipoDocumento: 'Documento extranjero', descripcion: 'Compra AC' }) };
    const h = await boot({ fixture: fixtureCon({ pie: COMPRAS, mant: todos, general, ac }) });
    const { page } = h;
    // PIE
    await clickTab(page, 'PIE');
    const pie = await capturarDescarga(page, () => page.click('#downloadComprasOFBtn-pie'));
    const fp = filasCsv(pie.buffer);
    const p = porNro(fp);
    t.eq(fp[0].join(';'), ENCABEZADO, 'PIE: mismo encabezado');
    t.eq([p[1001][C.SUB], p[1001][C.TIPO], p[1001][C.FDOC], p[1001][C.DESC].length, p[1001][C.RUT], p[1001][C.ORIG]], ['PIE', 'FACEL', '07-05-2026', 100, '76123456-7', ''], 'PIE: FACEL, fecha dd-mm-aaaa, descripción ≤ 100, RUT con guion, Documento Original vacío (misma función que SEP)');
    t.eq([p[1002][C.TIPO], p[1002][C.ORIG], p[1003][C.ORIG]], ['NOTACRE', '1001-FAC', '45-FACEL'], 'PIE: Documento Original solo en las notas (1001-FAC, 45-FACEL)');
    t.ok(/en 7 de 10 compras/.test(ultimoConfirm(h) || ''), 'PIE: avisa "en 7 de 10 compras" antes de descargar', (ultimoConfirm(h) || '').split('\n')[0]);
    // por entidad
    h.dialogs.length = 0;
    const pieFila = await capturarDescarga(page, () => page.evaluate(() => document.querySelector('#otrasFuentesTbody-pie .row-action-btn[data-action="csv"][data-rbd="1121"]').click()));
    t.eq(pieFila.buffer.toString('utf8'), pie.buffer.toString('utf8'), 'PIE ⬇ CSV SUPEREDUC de la fila: mismo contenido');
    t.ok(/en 7 de 10 compras/.test(ultimoConfirm(h) || ''), 'PIE de la fila: también avisa antes de descargar');
    // Mantención: los 18 tipos del panel
    await clickTab(page, 'Mantención');
    h.dialogs.length = 0;
    const mant = await capturarDescarga(page, () => page.click('#downloadComprasOFBtn-mantenimiento'));
    const fm = filasCsv(mant.buffer).slice(1);
    t.eq(fm.map(r => r[C.TIPO]), CODIGOS_ESPERADOS.map(c => c), 'Mantención: los 18 tipos de documento del panel salen con su código oficial (Tabla 02 y Sección 12)');
    t.ok(fm.every(r => r[C.SUB] === 'MANTENIMIENTO'), 'Mantención: columna Subvención = MANTENIMIENTO');
    t.ok(fm.filter(r => r[C.TIPO] === 'NOTACRE' || r[C.TIPO] === 'NOTADEB').every(r => r[C.ORIG] === '7-FACEL') && fm.filter(r => r[C.TIPO] !== 'NOTACRE' && r[C.TIPO] !== 'NOTADEB').every(r => r[C.ORIG] === ''), 'Mantención: Documento Original solo en NOTACRE/NOTADEB');
    t.ok(/honorarios/.test(ultimoConfirm(h) || '') && /en 5 de 18 compras/.test(ultimoConfirm(h) || ''), 'Mantención: el aviso cuenta las 5 boletas de honorarios (en 5 de 18)', (ultimoConfirm(h) || '').split('\n')[0]);
    // General + AC (sin problemas: sin aviso)
    await clickTab(page, 'General');
    h.dialogs.length = 0;
    const gen = await capturarDescarga(page, () => page.click('#downloadComprasOFBtn-general'));
    const fg = filasCsv(gen.buffer).slice(1);
    t.eq(fg.map(r => [r[C.RBD], r[C.SUB], r[C.TIPO], r[C.FDOC]]), [['1121', 'GENERAL', 'FACEL', '07-05-2026'], ['AC', 'GENERAL', 'DOCEX', '07-05-2026']], 'General: entidades 1121 y la sigla AC; códigos y fechas normalizados');
    t.eq(h.dialogs.filter(d => d.type === 'confirm').length, 0, 'General (sin problemas): no hay aviso');
    t.eq((await h.writes()).length, 0, 'ninguna exportación escribe en Firestore');
    t.noErrores(h);
    await h.close();
  }
});
