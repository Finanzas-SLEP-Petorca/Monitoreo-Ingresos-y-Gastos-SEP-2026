// (c) roundtrip_excel: exportar el Excel de carga (SEP y fuentes), reimportarlo y comprobar que el estado no cambia.
// Invariantes: (1) la pantalla (texto del panel) queda igual, (2) volver a exportar da exactamente las mismas hojas,
// (3) los documentos del servidor quedan iguales salvo ceros/mapas vacíos y la auditoría (lastModified*), y
// (4) no se duplican compras (las filas con ID existente actualizan, no crean).
import { boot, clickTab, cargarFixture, textoDe } from '../lib/boot.mjs';
import { capturarDescarga, leerXlsx } from '../lib/capture-utils.mjs';
import { correrSpec } from '../lib/spec.mjs';

// Quita lo que no cambia el significado del documento: auditoría, ceros, cadenas vacías y mapas vacíos.
function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => {
      if (k === 'lastModifiedAt' || k === 'lastModifiedBy') return;
      const x = limpiar(v[k]);
      if (x === 0 || x === '' || (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(c => c === 'item' || c === 'concepto'))) return; // mapa vacío o ítem "en cero" (solo su nombre)
      o[k] = x;
    });
    return o;
  }
  return v;
}
const documentos = (store) => { const o = {}; Object.keys(store).forEach(p => { o[p] = limpiar(store[p]); }); return o; };

function primeraDiferencia(a, b, ruta = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = primeraDiferencia(a[k], b[k], ruta + '/' + k);
      if (d) return d;
    }
  }
  return `${ruta}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
}

async function exportar(h, disparar) {
  const dl = await capturarDescarga(h.page, disparar);
  return { ...dl, libro: await leerXlsx(h.page, dl.buffer) };
}
async function importar(h, inputSelector, dl) {
  const antes = h.dialogs.length;
  await h.page.setInputFiles(inputSelector, { name: dl.filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: dl.buffer });
  for (let i = 0; i < 200 && h.dialogs.length === antes; i++) await h.page.waitForTimeout(50); // el alert llega tras leer el archivo
  await h.flushWrites();
  await h.waitIdle();
  return h.dialogs.slice(antes).map(d => d.message);
}
function igualLibros(a, b) {
  if (JSON.stringify(a.orden) !== JSON.stringify(b.orden)) return `hojas distintas: ${a.orden} vs ${b.orden}`;
  for (const n of a.orden) {
    const A = a.hojas[n], B = b.hojas[n];
    if (A.length !== B.length) return `hoja ${n}: ${A.length} filas -> ${B.length} filas`;
    for (let i = 0; i < A.length; i++) if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) return `hoja ${n}, fila ${i + 1}: ${JSON.stringify(A[i])} -> ${JSON.stringify(B[i])}`;
  }
  return null;
}

await correrSpec('roundtrip_excel', async (t) => {
  const fx = cargarFixture('default').docs;
  const h = await boot({ fixture: 'default' });
  const { page } = h;
  const relevantes = (store) => documentos(store);

  // ================================================================ SEP (hojas INGRESO, REMUNERACIONES, COMPRAS, BYS_PROYECCION)
  await clickTab(page, 'SEP');
  const textoAntes = await textoDe(page, '#tab-panel');
  const storeAntes = relevantes(await h.store());
  const comprasAntes = Object.values(storeAntes).reduce((n, d) => n + Object.keys(d.compras || {}).length, 0);
  const x1 = await exportar(h, () => page.click('#downloadExcelBtn'));
  t.eq(x1.libro.orden, ['INGRESO', 'REMUNERACIONES', 'SUBT22', 'SUBT29', 'COMPRAS', 'BYS_PROYECCION', 'HONORARIOS', 'HON_PROYECCION'], 'SEP: el libro de carga trae las 8 hojas esperadas (las 6 de siempre + HONORARIOS y HON_PROYECCION)');
  t.eq(x1.libro.hojas.COMPRAS.length - 1, comprasAntes, 'SEP: la hoja COMPRAS trae una fila por compra del servidor');
  const filaEspecial = x1.libro.hojas.COMPRAS.find(r => r[0] === 'c1121_especial');
  t.ok(filaEspecial && filaEspecial[5] === 'A&B-<7>' && filaEspecial[8].includes('<b>Matemática</b>') && filaEspecial[10] === 'Editorial "El Tío" & Hijos <Ltda>', 'SEP: los caracteres especiales (& < > " \') viajan intactos al Excel', filaEspecial);
  const filaNC = x1.libro.hojas.COMPRAS.find(r => r[0] === 'c1121_nc');
  t.ok(filaNC && filaNC[4] === 'Nota de crédito' && filaNC[11] < 0, 'SEP: la nota de crédito conserva su monto negativo en el Excel', filaNC);

  const msgs = await importar(h, '#importExcelInput', x1);
  t.ok(msgs.length === 1 && /^Carga importada correctamente/.test(msgs[0]), 'SEP: la importación informa "Carga importada correctamente"', msgs);
  t.ok(/INGRESO: \d+ filas/.test(msgs[0] || '') && /COMPRAS: \d+ filas/.test(msgs[0] || ''), 'SEP: el resumen de importación lista INGRESO y COMPRAS', msgs[0]);
  t.eq(await textoDe(page, '#tab-panel'), textoAntes, 'SEP: la pantalla queda idéntica tras reimportar');
  const x2 = await exportar(h, () => page.click('#downloadExcelBtn'));
  t.eq(igualLibros(x1.libro, x2.libro), null, 'SEP: exportar → importar → exportar da exactamente las mismas hojas');
  const storeDespues = relevantes(await h.store());
  t.eq(primeraDiferencia(storeAntes, storeDespues), null, 'SEP: los documentos del servidor quedan iguales (salvo ceros y auditoría)');
  const comprasDespues = Object.values(storeDespues).reduce((n, d) => n + Object.keys(d.compras || {}).length, 0);
  t.eq(comprasDespues, comprasAntes, 'SEP: no se duplican compras al reimportar');
  t.eq(primeraDiferencia(fx['1121'].compras.c1121_especial, (await h.store())['sep_carga_rbd/1121'].compras.c1121_especial), null, 'SEP: la compra con caracteres especiales sobrevive al viaje de ida y vuelta');

  // Excel individual (fila de la tabla) -> reimportable
  const f1 = await exportar(h, () => page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1121"]'));
  const msgs1 = await importar(h, '#importExcelInput', f1);
  t.ok(/^Carga importada correctamente/.test(msgs1[0] || ''), 'SEP: el Excel individual de un RBD se puede reimportar', msgs1);
  const f2 = await exportar(h, () => page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1121"]'));
  t.eq(igualLibros(f1.libro, f2.libro), null, 'SEP: el Excel individual (RBD 1121) no cambia tras reimportarlo');
  t.eq(primeraDiferencia(storeAntes, relevantes(await h.store())), null, 'SEP: tras el Excel individual los documentos siguen iguales');

  // ================================================================ Fuentes (una por "forma": compras, JUNJI de 3 ingresos, concepto libre)
  for (const [key, etiqueta] of [['general', 'General (compras)'], ['junji', 'JUNJI (GESPARVU, 3 ingresos)'], ['faep', 'FAEP (concepto libre)']]) {
    await clickTab(page, 'of-' + key);
    const tAntes = await textoDe(page, '#tab-of-' + key);
    const sAntes = relevantes(await h.store());
    const e1 = await exportar(h, () => page.click(`#downloadExcelOFBtn-${key}`));
    t.ok(e1.libro.orden.includes('META') && e1.libro.orden.includes('REMUNERACIONES'), `${etiqueta}: el libro trae META y REMUNERACIONES`, e1.libro.orden);
    const m = await importar(h, `#importExcelOFInput-${key}`, e1);
    t.ok(/^Carga importada correctamente/.test(m[0] || ''), `${etiqueta}: la importación informa éxito`, m);
    t.eq(await textoDe(page, '#tab-of-' + key), tAntes, `${etiqueta}: la pestaña queda idéntica tras reimportar`);
    const e2 = await exportar(h, () => page.click(`#downloadExcelOFBtn-${key}`));
    t.eq(igualLibros(e1.libro, e2.libro), null, `${etiqueta}: exportar → importar → exportar da las mismas hojas`);
    t.eq(primeraDiferencia(sAntes, relevantes(await h.store())), null, `${etiqueta}: los documentos del servidor quedan iguales (salvo ceros y auditoría)`);
  }

  // Excel individual de una entidad (fila) de la fuente con compras: AC con una cuenta no habilitada (⚠) no se pierde
  await clickTab(page, 'of-general');
  const ac1 = await exportar(h, () => page.click('#otrasFuentesTbody-general button.row-action-btn[data-action="excel"][data-rbd="AC"]'));
  const sAc = relevantes(await h.store());
  const mAc = await importar(h, '#importExcelOFInput-general', ac1);
  t.ok(/^Carga importada correctamente/.test(mAc[0] || ''), 'General › AC: el Excel individual se reimporta', mAc);
  t.ok(/cuenta no habilitada/.test(mAc[0] || ''), 'General › AC: el resumen de importación advierte de las compras con cuenta no habilitada', mAc[0]);
  t.eq(primeraDiferencia(sAc, relevantes(await h.store())), null, 'General › AC: los documentos quedan iguales tras reimportar');

  t.noErrores(h);
  await h.close();

  // ================================================================ SEP con Honorarios (Subt. 21): hojas HONORARIOS y HON_PROYECCION
  // Boletas que el panel puede crear y reimportar tal cual (las que no —cuenta fuera del catálogo, tipo que no es de honorarios, fecha dd/mm/aaaa— están en honorarios_excel).
  {
    const docs = JSON.parse(JSON.stringify(cargarFixture('honorarios').docs));
    ['h1121_cuenta_x', 'h1121_tipo_fac', 'h1121_tipo_np', 'h1121_invalida'].forEach(id => { delete docs['1121'].honorarios[id]; });
    const hh = await boot({ fixture: docs });
    await clickTab(hh.page, 'SEP');
    const tAntes = await textoDe(hh.page, '#tab-panel');
    const sAntes = documentos(await hh.store());
    const nHon = Object.values(sAntes).reduce((n, d) => n + Object.keys(d.honorarios || {}).length, 0);
    const e1 = await exportar(hh, () => hh.page.click('#downloadExcelBtn'));
    t.eq(e1.libro.hojas.HONORARIOS.length - 1, nHon, 'SEP + honorarios: la hoja HONORARIOS trae una fila por boleta del servidor');
    t.eq(e1.libro.hojas.HON_PROYECCION.length - 1, 4, 'SEP + honorarios: HON_PROYECCION trae las 4 cuentas con proyección');
    const m = await importar(hh, '#importExcelInput', e1);
    t.ok(/^Carga importada correctamente/.test(m[0] || '') && /HONORARIOS: \d+ filas/.test(m[0] || '') && !/NO se import/.test(m[0] || ''), 'SEP + honorarios: la importación informa éxito, lista HONORARIOS y no rechaza ninguna fila', m);
    t.eq(await textoDe(hh.page, '#tab-panel'), tAntes, 'SEP + honorarios: la pantalla queda idéntica tras reimportar');
    const e2 = await exportar(hh, () => hh.page.click('#downloadExcelBtn'));
    t.eq(igualLibros(e1.libro, e2.libro), null, 'SEP + honorarios: exportar → importar → exportar da exactamente las mismas hojas (también HONORARIOS y HON_PROYECCION)');
    t.eq(primeraDiferencia(sAntes, documentos(await hh.store())), null, 'SEP + honorarios: los documentos del servidor quedan iguales (salvo ceros y auditoría)');
    t.eq(Object.values(await hh.store()).reduce((n, d) => n + Object.keys(d.honorarios || {}).length, 0), nHon, 'SEP + honorarios: no se duplican boletas al reimportar');
    const f1 = await exportar(hh, () => hh.page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1122"]'));
    const mf = await importar(hh, '#importExcelInput', f1);
    t.ok(/^Carga importada correctamente/.test(mf[0] || ''), 'SEP + honorarios: el Excel individual de un RBD se reimporta', mf);
    const f2 = await exportar(hh, () => hh.page.click('#tableBody button.row-action-btn[data-action="excel"][data-rbd="1122"]'));
    t.eq(igualLibros(f1.libro, f2.libro), null, 'SEP + honorarios: el Excel individual (RBD 1122) no cambia tras reimportarlo');
    t.eq(primeraDiferencia(sAntes, documentos(await hh.store())), null, 'SEP + honorarios: tras el Excel individual los documentos siguen iguales');
    t.noErrores(hh);
    await hh.close();
  }

  // ================================================================ «Ajustes de fuentes»: FAEP y FIGA con los 13 jardines, y JUNJI con la línea BDL (hoja ING_BDL). Fixture `jardines`.
  {
    const hj = await boot({ fixture: 'jardines' });
    for (const [key, etiqueta, hojaClave, nFilas] of [['faep', 'FAEP (69 entidades, con jardines)', 'INGRESO', 69], ['figa', 'FIGA (69 entidades, con jardines)', 'INGRESO', 69], ['junji', 'JUNJI (con ING_BDL)', 'ING_BDL', 13]]) {
      await clickTab(hj.page, 'of-' + key);
      const tAntes = await textoDe(hj.page, '#tab-of-' + key);
      const sAntes = documentos(await hj.store());
      const e1 = await exportar(hj, () => hj.page.click(`#downloadExcelOFBtn-${key}`));
      t.eq(e1.libro.hojas[hojaClave].length - 1, nFilas, `${etiqueta}: la hoja ${hojaClave} trae ${nFilas} filas`);
      const m = await importar(hj, `#importExcelOFInput-${key}`, e1);
      t.ok(/^Carga importada correctamente/.test(m[0] || '') && (key !== 'junji' || /ING_BDL: 13 filas/.test(m[0] || '')), `${etiqueta}: la importación informa éxito`, m);
      t.eq(await textoDe(hj.page, '#tab-of-' + key), tAntes, `${etiqueta}: la pestaña queda idéntica tras reimportar`);
      const e2 = await exportar(hj, () => hj.page.click(`#downloadExcelOFBtn-${key}`));
      t.eq(igualLibros(e1.libro, e2.libro), null, `${etiqueta}: exportar → importar → exportar da exactamente las mismas hojas`);
      t.eq(primeraDiferencia(sAntes, documentos(await hj.store())), null, `${etiqueta}: los documentos del servidor quedan iguales (salvo ceros y auditoría)`);
    }
    // Excel individual de un jardín (FAEP y JUNJI): se reimporta y no cambia nada
    for (const [key, id] of [['faep', '5402002'], ['junji', '5402002']]) {
      await clickTab(hj.page, 'of-' + key);
      const sAntes = documentos(await hj.store());
      const f1 = await exportar(hj, () => hj.page.click(`#otrasFuentesTbody-${key} button.row-action-btn[data-action="excel"][data-rbd="${id}"]`));
      const mf = await importar(hj, `#importExcelOFInput-${key}`, f1);
      t.ok(/^Carga importada correctamente/.test(mf[0] || ''), `${key.toUpperCase()} › jardín ${id}: el Excel individual se reimporta`, mf);
      const f2 = await exportar(hj, () => hj.page.click(`#otrasFuentesTbody-${key} button.row-action-btn[data-action="excel"][data-rbd="${id}"]`));
      t.eq(igualLibros(f1.libro, f2.libro), null, `${key.toUpperCase()} › jardín ${id}: el Excel individual no cambia tras reimportarlo`);
      t.eq(primeraDiferencia(sAntes, documentos(await hj.store())), null, `${key.toUpperCase()} › jardín ${id}: los documentos siguen iguales`);
    }
    t.noErrores(hj);
    await hj.close();
  }
});
