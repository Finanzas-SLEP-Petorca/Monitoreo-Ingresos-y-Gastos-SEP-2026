// Honorarios (PR-1) · Excel de respaldo de SEP: hojas HONORARIOS y HON_PROYECCION.
//   1. Exportación: columnas (ID, RBD, Establecimiento, Codigo, TipoDocumento [código], NroDocumento, FechaDocumento, FechaPago, Descripcion, RutProveedor, NombreProveedor, MontoGasto,
//      MontoDocumento, N° DC) y una fila por boleta; HON_PROYECCION como BYS_PROYECCION; el Excel individual de un RBD trae solo lo suyo; neutralización de fórmulas SOLO en texto libre.
//   2. Exportar → reimportar → exportar es idempotente (mismas hojas, mismos documentos, misma pantalla, sin duplicados).
//   3. Importación: filas sin ID reciben una clave determinista (reimportar el mismo archivo no duplica), una fila con ID existente actualiza solo esa boleta, las filas inválidas se rechazan con su motivo
//      (RBD inexistente, cuenta fuera del catálogo, tipo que no es de honorarios o que la cuenta no acepta, sin fecha, monto 0, ID reservado) y las buenas sí entran.
//   4. Compatibilidad: un archivo antiguo (sin esas hojas) no borra ni toca los honorarios que ya están.
import { boot, clickTab, cargarFixture, textoDe } from '../lib/boot.mjs';
import { capturarDescarga, leerXlsx } from '../lib/capture-utils.mjs';
import { libroXlsx, importarLibro } from '../lib/compras.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { leerCLP, boleta, MESES } from '../lib/honorarios.mjs';

const ENC_HON = ['ID', 'RBD', 'Establecimiento', 'Codigo', 'TipoDocumento', 'NroDocumento', 'FechaDocumento', 'FechaPago', 'Descripcion', 'RutProveedor', 'NombreProveedor', 'MontoGasto', 'MontoDocumento', 'N° DC'];
const ENC_PROY = ['RBD', 'Establecimiento', 'Codigo', 'Item', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Total Año'];
const MESES_TITLE = MESES.map(m => m.charAt(0) + m.slice(1).toLowerCase());

const exportar = async (h, disparar) => { const dl = await capturarDescarga(h.page, disparar); return { ...dl, libro: await leerXlsx(h.page, dl.buffer) }; };
function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => {
      if (k === 'lastModifiedAt' || k === 'lastModifiedBy') return;
      const x = limpiar(v[k]);
      if (x === 0 || x === '' || (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(c => c === 'item' || c === 'concepto'))) return;
      o[k] = x;
    });
    return o;
  }
  return v;
}
const honDelStore = (store) => Object.fromEntries(Object.entries(store).map(([p, d]) => [p, limpiar({ honorarios: d.honorarios || {}, hon_proyeccion: d.hon_proyeccion || {} })]));
const primeraDiferencia = (a, b, ruta = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = primeraDiferencia(a[k], b[k], ruta + '/' + k); if (d) return d; }
  return `${ruta}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
};
const igualLibros = (a, b) => {
  if (JSON.stringify(a.orden) !== JSON.stringify(b.orden)) return `hojas distintas: ${a.orden} vs ${b.orden}`;
  for (const n of a.orden) {
    if (a.hojas[n].length !== b.hojas[n].length) return `hoja ${n}: ${a.hojas[n].length} filas -> ${b.hojas[n].length}`;
    for (let i = 0; i < a.hojas[n].length; i++) if (JSON.stringify(a.hojas[n][i]) !== JSON.stringify(b.hojas[n][i])) return `hoja ${n}, fila ${i + 1}: ${JSON.stringify(a.hojas[n][i])} -> ${JSON.stringify(b.hojas[n][i])}`;
  }
  return null;
};
const nombre1121 = 'LICEO PULMAHUE DE LA LIGUA';

await correrSpec('honorarios_excel', async (t) => {
  const fx = JSON.parse(JSON.stringify(cargarFixture('honorarios').docs));
  // texto libre peligroso (fórmulas) en una boleta más: se neutraliza SOLO en descripción, nombre y N° DC
  fx['1123'].honorarios = { h1123_f: boleta({ codigo: '410304', tipoDocumento: 'BHE', nroDocumento: '-5', fechaDocumento: '2026-05-05', descripcion: '=HYPERLINK("http://x","y")', nombreProveedor: '+cmd|calc', rutProveedor: '-1234567-8', documentoContable: '@SUM(A1)', montoGasto: 90000, montoDocumento: 90000 }) };
  // El ciclo de ida y vuelta se prueba con boletas que el panel puede crear y reimportar tal cual. Las 4 del fixture que no (cuenta fuera del catálogo, un tipo que no es de honorarios, un tipo que
  // la cuenta no acepta y una fecha dd/mm/aaaa) se prueban aparte, al final: la importación las rechaza con su motivo o las repara, y el servidor no las pierde.
  const DURAS = ['h1121_cuenta_x', 'h1121_tipo_fac', 'h1121_tipo_np', 'h1121_invalida'];
  const fxCompleto = JSON.parse(JSON.stringify(fx));
  DURAS.forEach(id => { delete fx['1121'].honorarios[id]; });
  const nBoletas = Object.values(fx).reduce((n, d) => n + Object.keys(d.honorarios || {}).length, 0);

  // ================================================================ 1 y 2. exportación y ciclo exportar → importar → exportar
  const h = await boot({ fixture: fx });
  const { page } = h;
  await clickTab(page, 'SEP');
  const textoAntes = await textoDe(page, '#tab-panel');
  const storeAntes = honDelStore(await h.store());
  const x1 = await exportar(h, () => page.click('#downloadExcelBtn'));
  t.eq(x1.libro.orden.slice(-2), ['HONORARIOS', 'HON_PROYECCION'], 'el libro de carga de SEP termina con las hojas HONORARIOS y HON_PROYECCION (a continuación de BYS_PROYECCION)');
  t.eq(x1.libro.hojas.HONORARIOS[0], ENC_HON, 'HONORARIOS: encabezado ID | RBD | Establecimiento | Codigo | TipoDocumento | NroDocumento | FechaDocumento | FechaPago | Descripcion | RutProveedor | NombreProveedor | MontoGasto | MontoDocumento | N° DC');
  t.eq(x1.libro.hojas.HONORARIOS.length - 1, nBoletas, `HONORARIOS: una fila por boleta del servidor (${nBoletas})`);
  const fila = (id) => x1.libro.hojas.HONORARIOS.find(r => r[0] === id);
  t.eq(fila('h1121_1'), ['h1121_1', 1121, nombre1121, '410803', 'BOLHE', '54', '2026-01-21', '2026-01-28', 'Taller de ajedrez enero 2026', '11111111-1', 'Nombre Apellido Apellido', 600000, 600000, ''], 'una boleta sale con su ID, el tipo como CÓDIGO, los montos como número y el N° DC vacío');
  t.eq([fila('h1121_4')[11], fila('h1121_4')[12]], [200000, 500000], 'el reparto conserva Monto Gasto y Monto Documento distintos');
  t.eq(fila('h1121_3')[13], 'DC_601', 'el N° DC sale en su columna');
  t.eq([fila('h1121_especial')[5], fila('h1121_especial')[8], fila('h1121_especial')[10]], ['A&B-<7>', 'Taller "Robótica" & <b>Lego</b>; O\'Higgins, 2° ciclo', 'Ñandú <Ltda> & "Co"'], 'los caracteres especiales (& < > " \') viajan intactos');
  t.eq([fila('h1121_f2025')[6], fila('h1121_nohab')[3]], ['2025-12-30', '411101'], 'también salen las boletas con aviso (fecha de 2025, cuenta que SEP no habilita) tal cual, sin «corregirlas»');
  const f = fila('h1123_f');
  t.eq([f[5], f[8], f[9], f[10], f[13]], ['-5', "'=HYPERLINK(\"http://x\",\"y\")", '-1234567-8', "'+cmd|calc", "'@SUM(A1)"], 'neutralización de fórmulas: solo descripción, nombre y N° DC llevan apóstrofo; N° de documento y RUT (aunque empiecen con «-») no');
  t.eq(typeof f[11] + typeof f[12], 'numbernumber', 'los montos son números (nunca texto con apóstrofo)');
  t.eq(x1.libro.hojas.HON_PROYECCION[0], ENC_PROY, 'HON_PROYECCION: encabezado como BYS_PROYECCION (RBD | Establecimiento | Codigo | Item | 12 meses | Total Año)');
  t.eq(MESES_TITLE.join(','), ENC_PROY.slice(4, 16).join(','), 'sanity: los meses del encabezado');
  const proyFilas = x1.libro.hojas.HON_PROYECCION.slice(1);
  t.eq(proyFilas.map(r => [r[0], r[2]]), [[1121, '410304'], [1121, '410803'], [1122, '410803'], [1123, '410304']].sort(), 'HON_PROYECCION: una fila por cuenta con proyección (1121 ×2, 1122, 1123), solo las agregadas');
  const f410803 = proyFilas.find(r => r[0] === 1121 && r[2] === '410803');
  t.eq([f410803[3], f410803[4], f410803[11], f410803[16]], ['410803 · TALLERES EXTRAPROGRAMÁTICOS', 100000, 300000, 1600000], 'una fila de proyección: ítem con código y nombre, meses y total');

  const msgs = await importarLibro(h, '#importExcelInput', x1.buffer, x1.filename);
  t.ok(msgs.length === 1 && /^Carga importada correctamente/.test(msgs[0]), 'reimportar el libro propio informa «Carga importada correctamente»', msgs);
  t.ok(new RegExp(`HONORARIOS: ${nBoletas} filas`).test(msgs[0]) && /HON_PROYECCION: 4 filas/.test(msgs[0]), 'el resumen lista HONORARIOS y HON_PROYECCION con sus filas', msgs[0]);
  t.ok(!/NO se import/.test(msgs[0]), 'ninguna fila del propio respaldo se rechaza (ni las boletas con aviso)', msgs[0]);
  t.eq(await textoDe(page, '#tab-panel'), textoAntes, 'la pantalla de SEP queda idéntica tras reimportar');
  const x2 = await exportar(h, () => page.click('#downloadExcelBtn'));
  t.eq(igualLibros(x1.libro, x2.libro), null, 'exportar → importar → exportar da exactamente las mismas hojas');
  t.eq(primeraDiferencia(storeAntes, honDelStore(await h.store())), null, 'los honorarios del servidor quedan iguales (la neutralización de fórmulas se deshace al importar)');
  t.eq(Object.values(await h.store()).reduce((n, d) => n + Object.keys(d.honorarios || {}).length, 0), nBoletas, 'no se duplican boletas');

  // Excel individual (fila de la tabla de SEP)
  const i1 = await exportar(h, () => page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1121"]'));
  t.eq(i1.libro.hojas.HONORARIOS.slice(1).map(r => r[1]), Array(8).fill(1121), 'el Excel individual del RBD 1121 trae solo sus 8 boletas');
  t.eq(i1.libro.hojas.HON_PROYECCION.slice(1).map(r => r[0]), [1121, 1121], 'y solo su proyección');
  const mi = await importarLibro(h, '#importExcelInput', i1.buffer, i1.filename);
  t.ok(/^Carga importada correctamente/.test(mi[0] || ''), 'el Excel individual se puede reimportar', mi);
  t.eq(primeraDiferencia(storeAntes, honDelStore(await h.store())), null, 'y no cambia nada');

  // ================================================================ 3. importación: filas nuevas, actualización, rechazos
  const nueva = (extra = {}) => { const b = boleta({ nroDocumento: '901', fechaDocumento: '2026-08-10', fechaPago: '2026-08-15', montoGasto: 123456, montoDocumento: 123456, descripcion: 'Boleta importada', ...extra }); return [extra.id !== undefined ? extra.id : '', extra.rbd !== undefined ? extra.rbd : 1122, 'X', b.codigo, b.tipoDocumento, b.nroDocumento, b.fechaDocumento, b.fechaPago, b.descripcion, b.rutProveedor, b.nombreProveedor, b.montoGasto, b.montoDocumento, extra.dc !== undefined ? extra.dc : '']; };
  await h.clearWrites();
  const libroNuevas = await libroXlsx(page, { HONORARIOS: [ENC_HON, nueva(), nueva({ id: 0, nroDocumento: '902', montoGasto: 20000, montoDocumento: 20000 }), nueva({ id: '0', nroDocumento: '903', montoGasto: 30000, montoDocumento: 30000, dc: 'DC_9' })] });
  const m1 = await importarLibro(h, '#importExcelInput', libroNuevas);
  t.ok(/HONORARIOS: 3 filas/.test(m1[0] || '') && !/NO se import/.test(m1[0] || ''), 'importar 3 boletas sin ID: las 3 entran', m1);
  const claves1 = Object.keys((await h.store())['sep_carga_rbd/1122'].honorarios).filter(k => /^imp-/.test(k)).sort();
  t.eq(claves1.length, 3, 'cada boleta nueva recibe una clave determinista «imp-…» (ninguna queda bajo la clave «0»)');
  t.ok(!('0' in (await h.store())['sep_carga_rbd/1122'].honorarios), 'nada queda bajo la clave "0"');
  await importarLibro(h, '#importExcelInput', libroNuevas);
  const claves2 = Object.keys((await h.store())['sep_carga_rbd/1122'].honorarios).filter(k => /^imp-/.test(k)).sort();
  t.eq(claves2, claves1, 'reimportar el mismo archivo da las mismas claves: no duplica');
  t.eq(Object.keys((await h.store())['sep_carga_rbd/1122'].honorarios).length, 2 + 3, 'el RBD 1122 queda con sus 2 boletas originales + las 3 nuevas');
  const dc9 = Object.values((await h.store())['sep_carga_rbd/1122'].honorarios).find(b => b.nroDocumento === '903');
  t.eq([dc9.documentoContable, dc9.tipoDocumento, dc9.montoGasto], ['DC_9', 'BOLHE', 30000], 'el N° DC y el tipo (código) se guardan');
  t.eq((await h.store())['sep_carga_rbd/1122'].honorarios.h1122_1.montoGasto, 500000, 'las boletas que no vienen en el archivo (h1122_1) no se tocan');
  // fila con ID existente: actualiza solo esa
  await h.clearWrites();
  const upd = nueva({ id: 'h1122_1', nroDocumento: '7', fechaDocumento: '2026-03-09', montoGasto: 510000, montoDocumento: 510000, descripcion: 'Taller de teatro' });
  upd[3] = '410803'; upd[4] = 'BOLHE';
  const m2 = await importarLibro(h, '#importExcelInput', await libroXlsx(page, { HONORARIOS: [ENC_HON, upd] }));
  t.ok(/HONORARIOS: 1 filas/.test(m2[0] || ''), 'una fila con ID existente se importa', m2);
  const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1122');
  t.eq(w.map(x => Object.keys(x.payload.honorarios || {})), [['h1122_1']], 'el write toca solo esa boleta');
  t.eq((await h.store())['sep_carga_rbd/1122'].honorarios.h1122_1.montoGasto, 510000, 'con el monto nuevo');
  t.eq(Object.keys((await h.store())['sep_carga_rbd/1122'].honorarios).length, 5, 'sin crear una boleta nueva');

  // rechazos
  await h.clearWrites();
  const antesRech = JSON.stringify(honDelStore(await h.store()));
  const filasMalas = [
    nueva({ rbd: 9999, nroDocumento: 'r1' }),                                  // fila 2: RBD que no existe
    (() => { const r = nueva({ nroDocumento: 'r2' }); r[3] = '999999'; return r; })(),   // fila 3: cuenta fuera del catálogo
    (() => { const r = nueva({ nroDocumento: 'r3' }); r[4] = 'FAC'; return r; })(),      // fila 4: tipo que no es de honorarios
    (() => { const r = nueva({ nroDocumento: 'r4' }); r[3] = '410904'; r[4] = 'BHE'; return r; })(), // fila 5: tipo que la cuenta no acepta
    nueva({ nroDocumento: 'r5', fechaDocumento: '' }),                         // fila 6: sin fecha
    nueva({ nroDocumento: 'r6', montoGasto: 0, montoDocumento: 0 }),           // fila 7: monto 0
    nueva({ id: '__x__', nroDocumento: 'r7' }),                                // fila 8: ID reservado
    nueva({ nroDocumento: 'ok1', descripcion: 'La única buena' }),             // fila 9: buena
  ];
  const m3 = await importarLibro(h, '#importExcelInput', await libroXlsx(page, { HONORARIOS: [ENC_HON, ...filasMalas] }));
  const msg = m3[0] || '';
  t.ok(/HONORARIOS: 1 filas/.test(msg), 'de 8 filas entra solo la buena', msg);
  t.ok(/7 filas NO se importaron por tener un dato inválido/.test(msg), 'se informa que 7 filas NO se importaron', msg);
  [['fila 2', 'el RBD "9999" no existe en el panel'], ['fila 3', 'la cuenta "999999" no acepta honorarios'], ['fila 4', 'el tipo de documento "FAC" no es de honorarios'], ['fila 5', 'la cuenta 410904 no acepta el tipo BHE'],
    ['fila 6', 'falta la fecha del documento'], ['fila 7', 'el monto gasto debe ser mayor que 0'], ['fila 8', 'ID de la boleta']].forEach(([fila, motivo]) => t.ok(new RegExp(`HONORARIOS, ${fila}: [^\\n]*${motivo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(msg), `rechazo ${fila}: ${motivo}`, msg));
  const despues = JSON.stringify(honDelStore(await h.store()));
  t.ok(antesRech !== despues && Object.values((await h.store())['sep_carga_rbd/1122'].honorarios).filter(b => /^(r\d|ok1)$/.test(b.nroDocumento)).map(b => b.nroDocumento).join() === 'ok1', 'en el servidor solo quedó la boleta buena (ninguna de las rechazadas)');

  // hoja de proyección: una cuenta fuera del catálogo o un RBD inexistente se informan; una cuenta del catálogo que SEP no habilita entra (se marcaría en el detalle), como las fuentes
  const filaProy = (rbd, cod, v) => [rbd, 'X', cod, 'item', ...MESES.map((m, i) => (i === 8 ? v : 0)), v];
  const m4 = await importarLibro(h, '#importExcelInput', await libroXlsx(page, { HON_PROYECCION: [ENC_PROY, filaProy(1125, '410304', 777000), filaProy(1125, '411801', 1), filaProy(9999, '410304', 2), filaProy(1125, '123456', 3)] }));
  const msg4 = m4[0] || '';
  t.ok(/HON_PROYECCION: 2 filas/.test(msg4) && /2 filas NO se importaron/.test(msg4), 'proyección: de 4 filas entran 2 y 2 se rechazan', msg4);
  t.ok(/HON_PROYECCION, fila 4: el RBD "9999" no existe en el panel/.test(msg4) && /HON_PROYECCION, fila 5: la cuenta "123456" no acepta honorarios/.test(msg4), 'proyección: se informa cada fila rechazada con su motivo', msg4);
  t.eq(Object.keys((await h.store())['sep_carga_rbd/1125'].hon_proyeccion.items).sort(), ['410304', '411801'], 'en el servidor quedaron las 2 cuentas buenas del RBD 1125');
  t.eq((await h.store())['sep_carga_rbd/1125'].hon_proyeccion.items['410304'].total, 777000, 'con su total');

  // ================================================================ 4. compatibilidad con archivos antiguos
  const stAntes = JSON.stringify(honDelStore(await h.store()));
  const antiguo = await libroXlsx(page, {
    INGRESO: [['RBD', 'Establecimiento', 'Item', ...MESES_TITLE, 'Total Año']],
    REMUNERACIONES: [['RBD', 'Establecimiento', 'Item', ...MESES_TITLE, 'Total Año'], [1121, nombre1121, '', 1940570, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1940570]],
    COMPRAS: [['ID', 'RBD', 'Establecimiento', 'Codigo', 'TipoDocumento', 'NroDocumento', 'FechaDocumento', 'FechaPago', 'Descripcion', 'RutProveedor', 'NombreProveedor', 'MontoGasto', 'MontoDocumento', 'DocumentoOriginal', 'N° DC']],
  });
  const m5 = await importarLibro(h, '#importExcelInput', antiguo);
  t.ok(/^Carga importada correctamente/.test(m5[0] || '') && !/HONORARIOS/.test(m5[0] || ''), 'un archivo antiguo (sin hojas de honorarios) se importa sin mencionarlas', m5);
  t.eq(JSON.stringify(honDelStore(await h.store())), stAntes, 'y no borra ni cambia ningún honorario');
  t.eq(leerCLP((await page.evaluate(() => document.querySelector('#tableBody tr.rbd-row[data-rbd="1122"] [data-field="gasto_hon"]').textContent))) > 0, true, 'la tabla sigue mostrando los honorarios');
  t.noErrores(h);
  await h.close();

  // ================================================================ 5. las boletas «duras» del fixture: se rechazan con motivo o se reparan, y el servidor no las pierde
  {
    const h2 = await boot({ fixture: fxCompleto });
    await clickTab(h2.page, 'SEP');
    const e1 = await exportar(h2, () => h2.page.click('#downloadExcelBtn'));
    const fila2 = (id) => e1.libro.hojas.HONORARIOS.find(r => r[0] === id);
    t.eq([fila2('h1121_invalida')[6], fila2('h1121_cuenta_x')[3], fila2('h1121_tipo_fac')[4], fila2('h1121_tipo_np')[4]], ['10/03/2026', '999999', 'FAC', 'BHE'], 'el respaldo exporta también esas 4 boletas tal como están guardadas');
    const antes = JSON.stringify((await h2.store())['sep_carga_rbd/1121'].honorarios);
    const mm = await importarLibro(h2, '#importExcelInput', e1.buffer, e1.filename);
    const txt = mm[0] || '';
    t.ok(/3 filas NO se importaron por tener un dato inválido/.test(txt), 'reimportar ese respaldo informa que 3 filas NO se importaron', txt);
    t.ok(/la cuenta "999999" no acepta honorarios/.test(txt) && /el tipo de documento "FAC" no es de honorarios/.test(txt) && /la cuenta 410904 no acepta el tipo BHE/.test(txt), 'cada una con su motivo (cuenta fuera del catálogo, tipo que no es de honorarios, tipo que la cuenta no acepta)', txt);
    const despues = (await h2.store())['sep_carga_rbd/1121'].honorarios;
    t.eq(['h1121_cuenta_x', 'h1121_tipo_fac', 'h1121_tipo_np'].map(id => JSON.stringify(despues[id]) === JSON.stringify(cargarFixture('honorarios').docs['1121'].honorarios[id])), [true, true, true], 'las 3 rechazadas siguen intactas en el servidor (importar nunca borra)');
    t.eq(despues.h1121_invalida.fechaDocumento, '2026-03-10', 'la fecha «10/03/2026» (dd/mm/aaaa, como la escribe Excel) se repara a 2026-03-10 al importar (igual que en las compras)');
    t.eq(JSON.parse(antes).h1121_invalida.fechaDocumento, '10/03/2026', 'sanity: antes estaba sin reparar');
    t.noErrores(h2);
    await h2.close();
  }
});
