// documento_corrupto (A5): Firestore no valida tipos. Un documento con valores no numéricos, nulos o de otro tipo
// (editado a mano en la consola, un script, otro panel del mismo proyecto) NO debe romper al resto de los usuarios:
// los números se leen de forma tolerante (num()), cada documento se procesa dentro de su propio try/catch, el estado
// queda en rojo nombrando el documento omitido y el documento dañado nunca se recrea ni se pisa.
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
// Hace que el documento 1123 "explote" al leerlo (data() lanza): simula algo que ni num() ni objetoPlano() pueden arreglar.
// Se instala ANTES de que cargue el panel: envuelve onSnapshot del mock en cuanto core.js crea window.__mockfb.
const PARCHE_DOC_QUE_EXPLOTA = `(() => {
  let val;
  Object.defineProperty(window, '__mockfb', { configurable: true, get() { return val; }, set(v) {
    val = v;
    const fs = v.api && v.api.firestore;
    if (!fs) return;
    const orig = fs.onSnapshot;
    fs.onSnapshot = function (target, ...args) {
      const i = args.findIndex(a => typeof a === 'function');
      if (i >= 0) {
        const cb = args[i];
        args[i] = (snap) => { if (window.__rompe1123) snap.docs.forEach(d => { if (d.id === '1123') d.data = () => { throw new Error('documento corrupto de prueba'); }; }); return cb(snap); };
      }
      return orig.call(this, target, ...args);
    };
  } });
  window.__rompe1123 = true;
})();`;

const filaTexto = (page, rbd) => page.evaluate((r) => { const tr = document.querySelector(`#tableBody tr.rbd-row[data-rbd="${r}"]`); return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null; }, rbd);
const estado = (page) => page.evaluate(() => ({ txt: document.getElementById('sync-text').textContent, cls: document.getElementById('sync-indicator').className }));

await correrSpec('documento_corrupto', async (t) => {
  const limpio = cargarFixture('default').docs;
  const corrupto = JSON.parse(JSON.stringify(limpio));
  const cMeses = (d) => d.rem.meses;
  // 1121: remuneraciones con basura; ingreso y compras con nulos / textos; proyección con texto numérico
  Object.assign(cMeses(corrupto['1121']), { ENERO: '1000', FEBRERO: true, MARZO: null, ABRIL: 'abc' });
  corrupto['1121'].ingreso_items.x = null;
  corrupto['1121'].ingreso_items.y = 'zz';
  corrupto['1121'].compras.c_nula = null;
  corrupto['1121'].compras.c_texto = 'texto';
  corrupto['1121'].compras.c_monto_texto = { codigo: '410605', tipoDocumento: 'Factura', nroDocumento: 7, fechaDocumento: '2026-03-02', fechaPago: '2026-03-03', descripcion: 5, rutProveedor: null, nombreProveedor: 'Prov', montoGasto: '2500', montoDocumento: 'x', documentoOriginal: {} };
  // 1122: otras fuentes con tipos cambiados
  corrupto['1122'].rem = 'texto';
  corrupto['1122'].bys_proyeccion = 'malo';
  corrupto['1122'].otras_fuentes = { pie: { ingreso: { meses: { ENERO: '5', FEBRERO: 'x' } }, compras: 5, bys_proy_items: { a: null } }, junji: 'x', faep: { bys_items: { a: null, b: { concepto: 5, meses: { ENERO: '9' } } } } };
  // 1131: metadatos raros
  corrupto['1131'].lastModifiedAt = 'basura';
  corrupto['1131'].lastModifiedBy = { a: 1 };
  const remEsperado1121 = 1000 + MESES.slice(4).reduce((s, m) => s + (limpio['1121'].rem.meses[m] || 0), 0);

  // ---- referencia: el mismo panel con datos limpios
  const ref = await boot({ fixture: 'default' });
  const filaRef = { '1125': await filaTexto(ref.page, '1125'), '1130': await filaTexto(ref.page, '1130') };
  await ref.close();

  // ---- panel con documentos dañados (y uno que lanza al leerse)
  const h = await boot({ fixture: corrupto, initScripts: [PARCHE_DOC_QUE_EXPLOTA], waitReady: false });
  h.expectErrors(/Documento con datos inválidos|documento corrupto de prueba/);
  await h.page.waitForFunction(() => document.getElementById('app') && !document.getElementById('app').classList.contains('hidden') && /Documento/.test(document.getElementById('sync-text').textContent), null, { timeout: 20000 });
  await h.waitIdle();
  let e = await estado(h.page);
  t.ok(/red/.test(e.cls) && /1123/.test(e.txt) && /inválidos/.test(e.txt), 'estado en ROJO que nombra el documento omitido (1123)', e);
  const filas = await h.page.evaluate(() => document.querySelectorAll('#tableBody tr.rbd-row').length);
  t.eq(filas, 55, 'el resto del panel se pinta completo: 55 filas en la tabla SEP');
  t.eq(await filaTexto(h.page, '1125'), filaRef['1125'], 'un RBD sin problemas (1125) se ve idéntico al panel con datos limpios');
  t.eq(await filaTexto(h.page, '1130'), filaRef['1130'], 'otro RBD sin problemas (1130) se ve idéntico al panel con datos limpios');
  t.ok(await filaTexto(h.page, '1123') !== null, 'la fila del RBD omitido (1123) sigue en la tabla (sin sus datos)');

  // los valores no numéricos valen 0 y los textos numéricos se leen como número
  await clickTab(h.page, 'SEP');
  await h.page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
  await h.waitIdle();
  const rem1121 = await h.page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="rem"]')).map(i => [i.dataset.mes, i.value])));
  t.eq([rem1121.ENERO, rem1121.FEBRERO, rem1121.MARZO, rem1121.ABRIL], ['1000', '', '', ''], '1121 remuneraciones: "1000" se lee como 1000; true / null / "abc" valen 0');
  const totalRem = await h.page.evaluate(() => document.getElementById('simpletotal-1121-rem').textContent.replace(/\D/g, ''));
  t.eq(Number(totalRem), remEsperado1121, 'el total de remuneraciones suma números (no concatena textos)', { totalRem, remEsperado1121 });
  const compras = await h.page.evaluate(() => Array.from(document.querySelectorAll('#modalBody tr[data-compra-id]')).map(tr => tr.dataset.compraId));
  t.ok(!compras.includes('c_nula') && !compras.includes('c_texto'), 'las compras nulas o de tipo texto se ignoran', compras.length);
  t.ok(compras.includes('c_monto_texto'), 'la compra con montos de tipo texto se conserva (monto "2500" → 2500, "x" → 0)');
  await h.page.keyboard.press('Escape');
  // fuentes y gráficos: no se rompen con textos numéricos
  await clickTab(h.page, 'PIE');
  await h.page.click('#otrasFuentesTbody-pie td[data-abrir-otra-fuente="1122"]');
  await h.waitIdle();
  const ingPie = await h.page.evaluate(() => { const i = document.querySelector('#otrasFuentesModalBody input.celda-input[data-modo="of_ingreso"][data-mes="ENERO"]'); return i ? i.value : null; });
  t.eq(ingPie, '5', 'PIE 1122: el ingreso "5" (texto) se lee como 5 (no "05")');
  await h.page.keyboard.press('Escape');
  for (const tab of ['dashboard', '% Ejecución', 'Reportes', 'FAEP', 'JUNJI']) await clickTab(h.page, tab);
  t.eq(await h.page.evaluate(() => document.querySelectorAll('#ejecChartWrap svg').length), 1, 'el gráfico de % Ejecución se dibuja (sin RangeError por valores de tipo texto)');

  // el documento dañado nunca se recrea ni se pisa
  t.eq((await h.writes()).filter(w => w.path === RUTA('1123')).length, 0, 'no se escribe nada sobre el documento omitido (1123): no se recrea');
  t.eq((await h.writes()).length, 0, 'ninguna escritura automática al abrir el panel con documentos dañados');
  const errs = h.errors.filter(x => x.kind === 'pageerror');
  t.eq(errs, [], 'sin errores de página (pageerror)');

  // ---- se corrige el documento: vuelve el estado verde y el RBD aparece completo
  await h.page.evaluate(() => { window.__rompe1123 = false; });
  // El documento del servidor ya era correcto: solo hace falta que "explote" menos y que llegue un cambio de ese documento (el
  // listener usa includeMetadataChanges: una re-entrega sin cambios de documentos solo actualiza el indicador y no repinta).
  await h.remoto('1123', '');
  await h.waitIdle();
  await h.page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'), null, { timeout: 10000 });
  e = await estado(h.page);
  t.ok(/green/.test(e.cls) && !/inválidos/.test(e.txt), 'al reparar el documento, el estado vuelve a verde', e);
  t.eq(await filaTexto(h.page, '1123'), (await (async () => { const r = await boot({ fixture: 'default' }); const x = await filaTexto(r.page, '1123'); await r.close(); return x; })()), 'el RBD 1123 reparado se ve igual que con datos limpios');
  t.noErrores(h);
  await h.close();
});
