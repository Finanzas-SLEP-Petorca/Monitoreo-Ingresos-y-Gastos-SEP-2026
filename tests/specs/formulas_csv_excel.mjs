// formulas_csv_excel (A2): una celda de TEXTO LIBRE (descripción, proveedor, concepto) que empieza con = + - @ (o tab/CR)
// se exporta con un apóstrofo delante para que Excel no la evalúe como fórmula; NUNCA se toca un monto, una fecha, un
// código, un RUT ni un N° de documento (aunque sea "-77"); y al IMPORTAR un Excel se quita ese único apóstrofo, de modo que
// exportar → reimportar no altera los datos.
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const F1 = '=HYPERLINK("http://x","y")';
const F2 = "+cmd|' /C calc'!A0";
const F3 = '@SUM(1,1)';
const F4 = '-2+3';
const F5 = '\t=1+1';   // empieza con tabulador (se prueba en la fuente PIE)
const F6 = '=2+2';

const compra = (extra) => ({ codigo: '410606', tipoDocumento: 'Factura electrónica', nroDocumento: '-77', fechaDocumento: '2026-03-02', fechaPago: '2026-03-05',
  descripcion: 'Compra normal', rutProveedor: '11.111.111-1', nombreProveedor: 'Proveedor SpA', montoGasto: -1500, montoDocumento: -1500, documentoOriginal: '', ...extra });

function armarFixture() {
  const docs = JSON.parse(JSON.stringify(cargarFixture('default').docs));
  const d = docs['1121'];
  d.compras = {
    f1: compra({ descripcion: F1, nombreProveedor: F2 }),
    f2: compra({ nroDocumento: '-78', descripcion: F3, nombreProveedor: F4 }),
    f3: compra({ nroDocumento: '-79', descripcion: F6, nombreProveedor: 'Normal' }),
    f4: compra({ nroDocumento: '80', descripcion: '-1500', nombreProveedor: 'Aseo & Cía' }),   // texto que ES un número: no se toca
    f5: compra({ nroDocumento: '81', descripcion: 'Compra normal', nombreProveedor: 'Proveedor SpA', montoGasto: 1000, montoDocumento: 1000 }),
  };
  // Honorarios (Subt. 21): texto libre = descripción, nombre del prestador y N° DC; N° de boleta, RUT, fechas, cuenta, tipo (código) y montos nunca se tocan.
  d.honorarios = {
    h1: { codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '-91', fechaDocumento: '2026-03-02', fechaPago: '2026-03-05', descripcion: F1, rutProveedor: '-1234567-8', nombreProveedor: F2, montoGasto: 1500, montoDocumento: 1500, documentoContable: F3 },
    h2: { codigo: '410803', tipoDocumento: 'BOLH', nroDocumento: '92', fechaDocumento: '2026-03-03', fechaPago: '2026-03-06', descripcion: '-1500', rutProveedor: '11111111-1', nombreProveedor: 'Aseo & Cía', montoGasto: 2500, montoDocumento: 2500 },
  };
  d.otras_fuentes.pie.compras = {
    p1: compra({ nroDocumento: '-5', descripcion: '=1+1', nombreProveedor: '@cmd' }),
    p2: compra({ nroDocumento: '-6', descripcion: F5, nombreProveedor: 'Normal' }),
  };
  d.otras_fuentes.faep.bys_items = {
    [F1]: { concepto: F1, meses: { MARZO: 100 }, total: 100 },
    [F4]: { concepto: F4, meses: { MARZO: 200 }, total: 200 },
    Aseo: { concepto: 'Aseo', meses: { MARZO: 300 }, total: 300 },
  };
  return docs;
}
const COL = { RBD: 0, SUB: 1, CODIGO: 2, TIPO: 3, NRO: 4, FDOC: 5, FPAGO: 6, DESC: 7, RUT: 8, PROV: 9, GASTO: 10, DOC: 11, ORIG: 12 };

async function guardarTodo(h) { await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await h.waitIdle(); }

await correrSpec('formulas_csv_excel', async (t) => {
  const h = await boot({ fixture: armarFixture() });
  const { page } = h;

  // ---------------------------------------------------------------- CSV de compras SEP (formato SUPEREDUC)
  await clickTab(page, 'SEP');
  const csv = await capturarDescarga(page, () => page.click('#downloadComprasSepBtn'));
  const filas = parseCsvPuntoYComa(csv.buffer.toString('utf8')).filter(f => f.length > 1);
  const porNro = Object.fromEntries(filas.slice(1).filter(f => f[COL.RBD] === '1121').map(f => [f[COL.NRO], f]));
  t.eq(Object.keys(porNro).sort(), ['-77', '-78', '-79', '80', '81'], 'CSV SEP: salen las 5 compras de 1121 y el N° de documento "-77" queda SIN apóstrofo');
  t.eq(porNro['-77'][COL.DESC], `'${F1}`, 'CSV SEP: descripción =HYPERLINK(...) sale con apóstrofo');
  t.eq(porNro['-77'][COL.PROV], `'${F2}`, 'CSV SEP: proveedor +cmd|... sale con apóstrofo');
  t.eq(porNro['-78'][COL.DESC], `'${F3}`, 'CSV SEP: descripción @SUM sale con apóstrofo');
  t.eq(porNro['-78'][COL.PROV], `'${F4}`, 'CSV SEP: proveedor -2+3 sale con apóstrofo');
  t.eq(porNro['-79'][COL.DESC], `'${F6}`, 'CSV SEP: descripción =2+2 sale con apóstrofo');
  t.eq(porNro['80'][COL.DESC], '-1500', 'CSV SEP: un texto que es un número ("-1500") no se toca');
  t.eq(porNro['80'][COL.PROV], 'Aseo & Cía', 'CSV SEP: el texto normal no se toca');
  t.eq(porNro['81'][COL.DESC], 'Compra normal', 'CSV SEP: "Compra normal" no se toca');
  t.eq([porNro['-77'][COL.RUT], porNro['-77'][COL.FDOC], porNro['-77'][COL.FPAGO], porNro['-77'][COL.CODIGO], porNro['-77'][COL.TIPO]], ['11111111-1', '02-03-2026', '05-03-2026', '410606', 'FACEL'],
    'CSV SEP: RUT, fechas, código de cuenta y tipo de documento NO llevan apóstrofo');
  t.eq([porNro['-77'][COL.GASTO], porNro['-77'][COL.DOC]], ['-1500', '-1500'], 'CSV SEP: los montos negativos NO llevan apóstrofo');

  // ---------------------------------------------------------------- CSV de compras de una fuente (PIE)
  await clickTab(page, 'PIE');
  const csvPie = await capturarDescarga(page, () => page.click('#downloadComprasOFBtn-pie'));
  const filasPie = parseCsvPuntoYComa(csvPie.buffer.toString('utf8')).filter(f => f.length > 1).slice(1).filter(f => f[COL.RBD] === '1121');
  const fp = filasPie.find(f => f[COL.NRO] === '-5');
  t.ok(fp && fp[COL.DESC] === "'=1+1" && fp[COL.PROV] === "'@cmd" && fp[COL.NRO] === '-5' && fp[COL.GASTO] === '-1500', 'CSV PIE: descripción y proveedor con apóstrofo; N° de documento y monto intactos', fp);
  t.eq(filasPie.find(f => f[COL.NRO] === '-6')[COL.DESC], "'=1+1", 'CSV PIE: la descripción con tabulador inicial sale sin el espacio y con apóstrofo (la plantilla oficial recorta espacios)');
  const xlPie = await leerXlsx(page, (await capturarDescarga(page, () => page.click('#downloadExcelOFBtn-pie'))).buffer);
  const pie6 = xlPie.hojas.COMPRAS.slice(1).find(r => String(r[1]) === '1121' && String(r[5]) === '-6');
  t.eq(pie6 && pie6[8], `'${F5}`, 'Excel PIE: la descripción que empieza con tabulador sale con apóstrofo');

  // ---------------------------------------------------------------- Excel de respaldo SEP
  await clickTab(page, 'SEP');
  const xl = await capturarDescarga(page, () => page.click('#downloadExcelBtn'));
  const libro = await leerXlsx(page, xl.buffer);
  const hoja = libro.hojas.COMPRAS;
  const rx = Object.fromEntries(hoja.slice(1).filter(r => String(r[1]) === '1121').map(r => [String(r[0]), r]));
  // columnas: ID, RBD, Establecimiento, Codigo, TipoDocumento, NroDocumento, FechaDocumento, FechaPago, Descripcion, RutProveedor, NombreProveedor, MontoGasto, MontoDocumento, DocumentoOriginal
  t.eq([rx.f1[8], rx.f1[10]], [`'${F1}`, `'${F2}`], 'Excel SEP: descripción y proveedor con fórmula salen con apóstrofo');
  t.eq([rx.f2[8], rx.f2[10], rx.f3[8]], [`'${F3}`, `'${F4}`, `'${F6}`], 'Excel SEP: @, - y = iniciales también');
  t.eq([rx.f4[8], rx.f4[10], rx.f5[8]], ['-1500', 'Aseo & Cía', 'Compra normal'], 'Excel SEP: texto numérico y texto normal sin apóstrofo');
  t.eq([rx.f1[5], rx.f1[9], rx.f1[6], rx.f1[7], rx.f1[3]], ['-77', '11.111.111-1', '2026-03-02', '2026-03-05', '410606'], 'Excel SEP: N° de documento, RUT, fechas y código NO llevan apóstrofo (en el Excel de respaldo el RUT va como se guardó)');
  t.ok(typeof rx.f1[11] === 'number' && rx.f1[11] === -1500 && typeof rx.f1[12] === 'number', 'Excel SEP: los montos negativos siguen siendo NÚMEROS (no texto con apóstrofo)', [rx.f1[11], rx.f1[12]]);

  // Honorarios: hoja HONORARIOS (ID, RBD, Establecimiento, Codigo, TipoDocumento, NroDocumento, FechaDocumento, FechaPago, Descripcion, RutProveedor, NombreProveedor, MontoGasto, MontoDocumento, N° DC)
  const hon = Object.fromEntries(libro.hojas.HONORARIOS.slice(1).filter(r => String(r[1]) === '1121').map(r => [String(r[0]), r]));
  t.eq([hon.h1[8], hon.h1[10], hon.h1[13]], [`'${F1}`, `'${F2}`, `'${F3}`], 'Excel SEP (honorarios): descripción, nombre del prestador y N° DC con fórmula salen con apóstrofo');
  t.eq([hon.h2[8], hon.h2[10], hon.h2[13]], ['-1500', 'Aseo & Cía', ''], 'Excel SEP (honorarios): texto numérico y texto normal sin apóstrofo');
  t.eq([hon.h1[5], hon.h1[9], hon.h1[6], hon.h1[7], hon.h1[3], hon.h1[4]], ['-91', '-1234567-8', '2026-03-02', '2026-03-05', '410803', 'BOLHE'], 'Excel SEP (honorarios): N° de boleta, RUT (aunque empiece con «-»), fechas, cuenta y tipo NO llevan apóstrofo');
  t.ok(typeof hon.h1[11] === 'number' && hon.h1[11] === 1500 && typeof hon.h1[12] === 'number', 'Excel SEP (honorarios): los montos son NÚMEROS', [hon.h1[11], hon.h1[12]]);

  // ---------------------------------------------------------------- Excel FAEP (conceptos de B&S)
  await clickTab(page, 'FAEP');
  const xlFaep = await capturarDescarga(page, () => page.click('#downloadExcelOFBtn-faep'));
  const libroFaep = await leerXlsx(page, xlFaep.buffer);
  const bys = libroFaep.hojas.BYS_ITEMS.slice(1).filter(r => String(r[0]) === '1121').map(r => r[2]);
  t.ok(bys.includes(`'${F1}`) && bys.includes(`'${F4}`) && bys.includes('Aseo'), 'Excel FAEP: conceptos con fórmula salen con apóstrofo, "Aseo" no', bys);

  // ---------------------------------------------------------------- Visualizador y Reporte personalizado
  await clickTab(page, 'Reportes');
  const vzCsv = await capturarDescarga(page, () => page.click('#vzCsvBtn'));
  const vzRows = parseCsvPuntoYComa(vzCsv.buffer.toString('utf8')).filter(f => f.length > 1);
  const hdr = vzRows[0];
  const iConcepto = hdr.indexOf('Concepto');
  const conceptosVz = vzRows.slice(1).map(r => r[iConcepto]);
  t.ok(conceptosVz.includes(`'${F1}`) && conceptosVz.includes(`'${F4}`) && !conceptosVz.includes(F1), 'Visualizador CSV: la columna Concepto lleva apóstrofo en los conceptos con fórmula', conceptosVz.filter(c => /HYPER|2\+3/.test(c)));
  t.ok(vzRows.slice(1).every(r => !String(r[hdr.indexOf('Real')]).startsWith("'") && !String(r[hdr.indexOf('Total')]).startsWith("'")), 'Visualizador CSV: las cifras no llevan apóstrofo');
  const vzXl = await leerXlsx(page, (await capturarDescarga(page, () => page.click('#vzExcelGas'))).buffer);
  const conceptosXl = vzXl.hojas.Detalle.slice(1).map(r => r[3]);
  t.ok(conceptosXl.includes(`'${F1}`) && !conceptosXl.includes(F1), 'Visualizador Excel (Detalle): el concepto con fórmula lleva apóstrofo', conceptosXl.filter(c => /HYPER/.test(c)));

  // ---------------------------------------------------------------- ciclo exportar → reimportar: no cambia nada
  await h.clearWrites();
  await clickTab(page, 'SEP');
  await page.setInputFiles('#importExcelInput', { name: 'respaldo.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xl.buffer });
  await h.waitIdle();
  await guardarTodo(h);
  const w1121 = (await h.writes()).filter(w => w.path === RUTA('1121') && w.payload.compras);
  const comprasEscritas = Object.assign({}, ...w1121.map(w => w.payload.compras));
  t.ok(Object.keys(comprasEscritas).length >= 5, 'reimportar SEP: se vuelven a guardar las compras del Excel', Object.keys(comprasEscritas));
  t.eq([comprasEscritas.f1.descripcion, comprasEscritas.f1.nombreProveedor], [F1, F2], 'reimportar SEP: la descripción y el proveedor vuelven SIN el apóstrofo (=HYPERLINK…, +cmd…)');
  t.eq([comprasEscritas.f2.descripcion, comprasEscritas.f2.nombreProveedor, comprasEscritas.f3.descripcion], [F3, F4, F6], 'reimportar SEP: @SUM, -2+3 y =2+2 también vuelven idénticos');
  t.eq([comprasEscritas.f4.descripcion, comprasEscritas.f5.descripcion], ['-1500', 'Compra normal'], 'reimportar SEP: textos que no se tocaron siguen iguales');
  t.eq([comprasEscritas.f1.nroDocumento, comprasEscritas.f1.montoGasto], ['-77', -1500], 'reimportar SEP: N° de documento y monto idénticos');
  t.ok(Object.values(comprasEscritas).every(c => !String(c.descripcion).startsWith("'") && !String(c.nombreProveedor).startsWith("'")), 'reimportar SEP: ninguna compra queda con apóstrofo inicial');
  const xl2 = await capturarDescarga(page, () => page.click('#downloadExcelBtn'));
  const hoja2 = (await leerXlsx(page, xl2.buffer)).hojas.COMPRAS;
  t.eq(hoja2, hoja, 'exportar → reimportar → exportar: la hoja COMPRAS queda IDÉNTICA');
  const wHon = (await h.writes()).filter(w => w.path === RUTA('1121') && w.payload.honorarios);
  const honEscritas = Object.assign({}, ...wHon.map(w => w.payload.honorarios));
  t.eq([honEscritas.h1.descripcion, honEscritas.h1.nombreProveedor, honEscritas.h1.documentoContable], [F1, F2, F3], 'reimportar SEP (honorarios): descripción, prestador y N° DC vuelven SIN el apóstrofo');
  t.eq([honEscritas.h1.nroDocumento, honEscritas.h1.rutProveedor, honEscritas.h1.montoGasto, honEscritas.h2.descripcion], ['-91', '-1234567-8', 1500, '-1500'], 'reimportar SEP (honorarios): N° de boleta, RUT, monto y el texto numérico idénticos');
  t.ok(Object.values(honEscritas).every(b => !String(b.descripcion).startsWith("'") && !String(b.nombreProveedor).startsWith("'") && !String(b.documentoContable || '').startsWith("'")), 'reimportar SEP (honorarios): ninguna boleta queda con apóstrofo inicial');
  t.eq((await leerXlsx(page, xl2.buffer)).hojas.HONORARIOS, libro.hojas.HONORARIOS, 'exportar → reimportar → exportar: la hoja HONORARIOS queda IDÉNTICA');
  // FAEP: la clave del concepto no cambia (no aparece "'=HYPERLINK…" como ítem nuevo)
  await h.clearWrites();
  await clickTab(page, 'FAEP');
  await page.setInputFiles('#importExcelOFInput-faep', { name: 'faep.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlFaep.buffer });
  await h.waitIdle();
  await guardarTodo(h);
  const wf = (await h.writes()).filter(w => w.path === RUTA('1121') && w.payload.otras_fuentes && w.payload.otras_fuentes.faep && w.payload.otras_fuentes.faep.bys_items);
  const claves = [...new Set(wf.flatMap(w => Object.keys(w.payload.otras_fuentes.faep.bys_items)))];
  t.eq(claves.sort(), [F1, F4, 'Aseo'].sort(), 'reimportar FAEP: los conceptos se guardan con su clave original (sin apóstrofo, sin ítems duplicados)');
  const xl3 = await capturarDescarga(page, () => page.click('#downloadExcelOFBtn-faep'));
  t.eq((await leerXlsx(page, xl3.buffer)).hojas.BYS_ITEMS, libroFaep.hojas.BYS_ITEMS, 'FAEP: exportar → reimportar → exportar deja BYS_ITEMS idéntica');
  t.noErrores(h);
  await h.close();
});
