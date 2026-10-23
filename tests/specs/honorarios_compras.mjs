// Honorarios (PR-1) · cambio en COMPRAS: los 5 tipos de honorarios (BOLH, BHE, BOLHE, BPST, BPSTE) ya no están en el selector «Tipo de documento» (solo se registran en Honorarios).
// Las compras ANTIGUAS con esos tipos las mueve el usuario a mano (NO hay botón de migración): el panel conserva el mapa nombre ↔ código para leerlas y avisa «muévelo al registro de Honorarios»
//   · en la tabla de compras (marca en la columna «Tipo doc.») y en un resumen sobre la tabla (SEP y fuentes), sin tocar los avisos de fecha/cuenta ni «Datos a revisar»;
//   · en el aviso previo al CSV de SUPEREDUC;
//   · mientras no se muevan siguen sumando en Bienes y Servicios (cero cambio de cifras); editar una de ellas no pierde su tipo.
import { boot, clickTab, textoDe } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { abrirModalSep, cerrarModalSep, abrirModalFuente, compraBase, fixtureSinCompras } from '../lib/compras.mjs';
import { filaSepTexto, tarjetas } from '../lib/honorarios.mjs';

const MARCA = '⚠ muévelo a Honorarios';
const RESUMEN = (n) => `⚠ ${n} compra${n === 1 ? '' : 's'} con un tipo de documento de honorarios (BOLH, BHE, BOLHE, BPST, BPSTE): muévela${n === 1 ? '' : 's'} al registro de Honorarios (Subt. 21). Mientras tanto ${n === 1 ? 'sigue sumando' : 'siguen sumando'} en Bienes y Servicios.`;
const TITULO = 'Este tipo de documento es de honorarios y ya no se registra como compra: muévelo al registro de Honorarios (Subt. 21). Mientras tanto sigue sumando en Bienes y Servicios.';
const ultimoConfirm = (h) => { const c = h.dialogs.filter(d => d.type === 'confirm'); return c.length ? c[c.length - 1].message : null; };

await correrSpec('honorarios_compras', async (t) => {
  // fixture: SEP/1121 con una compra «Boleta de honorarios electrónica» (BOLHE) y una «Factura»; General/1121 con una «Boleta honorarios prestación de servicios a terceros» (BPST)
  const docs = fixtureSinCompras();
  docs['1121'].compras = {
    cHon: compraBase({ tipoDocumento: 'Boleta de honorarios electrónica', nroDocumento: '10', montoGasto: 80000, montoDocumento: 80000, fechaDocumento: '2026-04-10', fechaPago: '2026-04-20' }),
    cFac: compraBase({ nroDocumento: '11', montoGasto: 50000, montoDocumento: 59500, fechaDocumento: '2026-04-12', fechaPago: '2026-04-22' }),
  };
  docs['1121'].otras_fuentes = docs['1121'].otras_fuentes || {};
  docs['1121'].otras_fuentes.general = { ...(docs['1121'].otras_fuentes.general || {}), compras: {
    gHon: compraBase({ codigo: '410601', tipoDocumento: 'Boleta honorarios prestación de servicios a terceros', nroDocumento: '20', montoGasto: 70000, montoDocumento: 70000 }),
    gFac: compraBase({ codigo: '410601', nroDocumento: '21', montoGasto: 30000, montoDocumento: 35700 }),
  } };
  const sinHon = JSON.parse(JSON.stringify(docs));
  sinHon['1121'].compras.cHon.tipoDocumento = 'Factura electrónica';
  sinHon['1121'].otras_fuentes.general.compras.gHon.tipoDocumento = 'Factura electrónica';

  // ================================================================ SEP
  const h = await boot({ fixture: docs });
  const hs = await boot({ fixture: sinHon });
  const { page } = h;
  await clickTab(page, 'SEP'); await clickTab(hs.page, 'SEP');
  t.eq(await filaSepTexto(page, '1121'), await filaSepTexto(hs.page, '1121'), 'una compra con tipo de honorarios sigue sumando en B&S: la fila de SEP es idéntica a la de las mismas compras con otro tipo (cero cambio de cifras)');
  t.eq(await tarjetas(page, '#kpiRow'), await tarjetas(hs.page, '#kpiRow'), 'y las tarjetas KPI también (ni «Datos a revisar»: el aviso de tipo no es de fecha/cuenta)');
  await abrirModalSep(h, '1121');
  const f = await page.evaluate(([i, marca]) => { const tr = document.querySelector(`#modalBody tr[data-compra-id="${i}"]`); const m = tr.querySelector('.compra-aviso-tipo-hon'); return { celda: tr.children[1].textContent.replace(marca, '').trim(), marca: m ? m.textContent : null, title: m ? m.title : null }; }, ['cHon', MARCA]);
  t.eq(f, { celda: 'Boleta de honorarios electrónica', marca: MARCA, title: TITULO }, 'SEP: la compra con tipo de honorarios lleva la marca «⚠ muévelo a Honorarios» (con la explicación en el title)');
  t.eq(await page.evaluate(() => document.querySelector('#modalBody tr[data-compra-id="cFac"] .compra-aviso-tipo-hon')), null, 'SEP: la factura no lleva marca');
  t.eq(await textoDe(page, '#modalBody .compras-hon-resumen'), RESUMEN(1), 'SEP: un resumen sobre la tabla dice cuántas compras hay que mover');
  t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody .compra-aviso-fecha, #modalBody .compras-avisos-resumen').length), 0, 'SEP: no se mezcla con los avisos de fecha/cuenta (sus marcas y su resumen siguen ausentes)');
  t.eq(await page.evaluate(() => /Mover a Honorarios|Migrar honorarios|Migrar Hon/i.test(document.body.innerText)), false, 'NO hay botón de migración: las compras antiguas las mueve el usuario a mano');
  // editar la compra antigua: el tipo no se pierde
  await page.click('#modalBody tr[data-compra-id="cHon"] .compra-edit-btn');
  t.eq(await page.inputValue('#modalBody .compra-form-grid select[data-field="tipoDocumento"]'), 'Boleta de honorarios electrónica', 'editar la compra antigua conserva su tipo en el formulario (aunque ya no sea una opción)');
  t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody .compra-form-grid select[data-field="tipoDocumento"] option[data-legado]')).map(o => o.textContent)), ['Boleta de honorarios electrónica (no disponible para registros nuevos)'], 'como una opción marcada «no disponible para registros nuevos»');
  await page.fill('#modalBody .compra-form-grid input[data-field="descripcion"]', 'corregida');
  await h.clearWrites();
  await page.click('#modalBody .add-compra-btn');
  await h.flushWrites();
  const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121');
  t.eq(w.map(x => Object.keys(x.payload.compras)), [['cHon']], 'guardar la edición escribe solo esa compra');
  t.eq(w[0].payload.compras.cHon.tipoDocumento, 'Boleta de honorarios electrónica', 'y el tipo guardado sigue siendo el de siempre (no se borra ni se convierte)');
  t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody .compra-form-grid select[data-field="tipoDocumento"] option[data-legado]').length), 0, 'tras guardar, la opción temporal desaparece del selector');
  // nueva compra: ya no se puede elegir honorarios
  t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody .compra-form-grid select[data-field="tipoDocumento"] option')).some(o => /honorarios/i.test(o.textContent))), false, 'el selector de compras no ofrece honorarios');
  await cerrarModalSep(h);
  // PDF de la fila: sin marcas (el PDF no cambia)
  await page.click('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1121"]');
  await h.waitIdle();
  const impreso = (await h.prints())[0];
  t.ok(impreso && !/muévelo a Honorarios|muévela/.test(impreso.printWrap), 'el PDF por fila no lleva las marcas de aviso');

  // ---- aviso previo al CSV de SUPEREDUC (SEP, por fila)
  await page.click('#tableBody button.row-action-btn[data-action="csvsep"][data-rbd="1121"]');
  await h.waitIdle();
  const aviso = ultimoConfirm(h) || '';
  t.ok(aviso.includes('en 1 de 2 compras hay datos que la plataforma de SUPEREDUC rechazaría'), 'el aviso previo al CSV cuenta 1 de 2 compras', aviso);
  t.ok(aviso.includes('• 1 fila: documento de honorarios (BOLH, BHE, BOLHE, BPST, BPSTE): no va en el Libro de Compras, muévelo al registro de Honorarios (SUPEREDUC lo recibe en el Libro de Honorarios, Cap. IV)'), 'y dice «muévelo al registro de Honorarios»', aviso);
  t.ok(!/lo recibe en el Libro de Honorarios \(Cap\. IV\), no en el de Compras/.test(aviso), 'ya no usa el texto antiguo');

  // ================================================================ fuentes (General)
  await abrirModalFuente(h, 'general', '1121');
  const fg = await page.evaluate((marca) => { const tr = document.querySelector('#otrasFuentesModalBody tr[data-compra-id="gHon"]'); const m = tr.querySelector('.compra-aviso-tipo-hon'); return { celda: tr.children[1].textContent.replace(marca, '').trim(), marca: m ? m.textContent : null }; }, MARCA);
  t.eq(fg, { celda: 'Boleta honorarios prestación de servicios a terceros', marca: MARCA }, 'General: la compra con tipo de honorarios lleva la misma marca');
  t.eq(await textoDe(page, '#otrasFuentesModalBody .compras-hon-resumen'), RESUMEN(1), 'General: y el mismo resumen sobre la tabla');
  t.eq(await page.evaluate(() => document.querySelector('#otrasFuentesModalBody tr[data-compra-id="gFac"] .compra-aviso-tipo-hon')), null, 'General: la factura no lleva marca');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  await clickTab(page, 'of-general');
  await page.click('#otrasFuentesTbody-general button.row-action-btn[data-action="csv"][data-rbd="1121"]');
  await h.waitIdle();
  t.ok((ultimoConfirm(h) || '').includes('muévelo al registro de Honorarios'), 'General: el aviso previo al CSV también dice «muévelo al registro de Honorarios»', ultimoConfirm(h));
  t.noErrores(h); t.noErrores(hs);
  await h.close(); await hs.close();
});
