// (b) persistencia: editar celdas (ingreso, remuneración, compra, ítems) en SEP y en las fuentes produce el write
// esperado (ruta, merge:true, payload parcial, deleteField al borrar), llega al "servidor" y sobrevive a una recarga
// de la página y a un re-emit del snapshot. También cubre el camino de error (write rechazado -> reintento).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const EMAIL = 'wilson.rojas@sleppetorca.gob.cl';

// Escrituras de un doc, en orden.
const writesDe = (writes, id) => writes.filter(w => w.path === RUTA(id));
const ultimo = (arr) => arr[arr.length - 1];
const esMergeSet = (w) => w && w.op === 'setDoc' && w.options && w.options.merge === true;
const marcasAuditoria = (w) => w && w.payload.lastModifiedBy === EMAIL && w.payload.lastModifiedAt && w.payload.lastModifiedAt.__sentinel === 'serverTimestamp';
const DEL = { __sentinel: 'deleteField' };

async function abrirModalSep(h, rbd) {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
async function cerrarModales(h) { await h.page.keyboard.press('Escape'); await h.waitIdle(); }

async function llenarCompra(page, ambito, campos) {
  const base = ambito === 'sep' ? '#modalBody .compra-input' : '#otrasFuentesModalBody .compra-input.of-compra-input';
  for (const [campo, valor] of Object.entries(campos)) {
    const sel = `${base}[data-field="${campo}"]`;
    if (campo === 'codigo' || campo === 'tipoDocumento') await page.selectOption(sel, valor);
    else await page.fill(sel, String(valor));
  }
}

await correrSpec('persistencia', async (t) => {
  const fx = cargarFixture('default').docs;
  const h = await boot({ fixture: 'default' });
  const { page } = h;

  // ---------------------------------------------------------------- SEP: celda de ingreso
  await abrirModalSep(h, '1121');
  const celdaIng = 'input.celda-input[data-rbd="1121"][data-modo="ingreso_item"][data-item="Ingreso SEP Preferente"][data-mes="AGOSTO"]';
  await page.fill(celdaIng, '123456');
  t.eq((await h.writes()).length, 0, 'SEP ingreso: al teclear NO se escribe de inmediato (debounce de ~400 ms)');
  await page.waitForFunction(() => window.__mockfb.writes.length >= 1, null, { timeout: 5000 });
  await h.waitIdle();
  let w = writesDe(await h.writes(), '1121');
  t.eq(w.length, 1, 'SEP ingreso: se produce exactamente 1 write');
  t.ok(esMergeSet(w[0]), 'SEP ingreso: setDoc con merge:true', w[0]);
  t.eq(w[0].path, RUTA('1121'), 'SEP ingreso: ruta sep_carga_rbd/1121');
  t.eq(w[0].payload.ingreso_items['Ingreso SEP Preferente'].meses, { AGOSTO: 123456 }, 'SEP ingreso: payload parcial (solo el mes tocado)');
  t.ok(marcasAuditoria(w[0]), 'SEP ingreso: lastModifiedBy + serverTimestamp()');
  t.eq(w[0].status, 'acked', 'SEP ingreso: el servidor confirma el write');
  let st = await h.store();
  const pref0 = fx['1121'].ingreso_items['Ingreso SEP Preferente'];
  const prefSrv = st[RUTA('1121')].ingreso_items['Ingreso SEP Preferente'];
  t.eq(prefSrv.meses.AGOSTO, 123456, 'SEP ingreso: el servidor guarda el nuevo valor');
  t.eq(prefSrv.meses.ENERO, pref0.meses.ENERO, 'SEP ingreso: la fusión profunda conserva los demás meses');
  t.eq(prefSrv.total, pref0.total - pref0.meses.AGOSTO + 123456, 'SEP ingreso: total recalculado y guardado');
  t.eq(st[RUTA('1121')].ingreso_items['Ingreso SEP Prioritario'], fx['1121'].ingreso_items['Ingreso SEP Prioritario'], 'SEP ingreso: no toca el otro ítem de ingreso');

  // ---------------------------------------------------------------- SEP: remuneraciones
  await h.clearWrites();
  const celdaRem = 'input.celda-input[data-rbd="1121"][data-modo="rem"][data-mes="SEPTIEMBRE"]';
  await page.fill(celdaRem, '987654');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.eq(w.length, 1, 'SEP remuneraciones: 1 write');
  t.ok(esMergeSet(w[0]) && w[0].payload.rem.meses.SEPTIEMBRE === 987654 && Object.keys(w[0].payload.rem.meses).length === 1, 'SEP remuneraciones: merge:true con solo el mes editado', w[0] && w[0].payload);
  st = await h.store();
  t.eq(st[RUTA('1121')].rem.meses.SEPTIEMBRE, 987654, 'SEP remuneraciones: guardado en el servidor');
  t.eq(st[RUTA('1121')].rem.real_hasta_mes, fx['1121'].rem.real_hasta_mes, 'SEP remuneraciones: real_hasta_mes intacto');

  // ---------------------------------------------------------------- SEP: "Remuneraciones reales hasta"
  await h.clearWrites();
  await page.selectOption('#remRealHasta-1121', '9');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.ok(w.length >= 1 && esMergeSet(ultimo(w)) && ultimo(w).payload.rem.real_hasta_mes === 9, 'SEP corte "reales hasta": write inmediato con rem.real_hasta_mes=9', w);

  // ---------------------------------------------------------------- SEP: agregar compra
  await h.clearWrites();
  await llenarCompra(page, 'sep', { codigo: '410605', tipoDocumento: 'Factura', nroDocumento: 'T-1', fechaDocumento: '2026-04-10', fechaPago: '2026-04-20', descripcion: 'Compra de prueba', rutProveedor: '76.1-1', nombreProveedor: 'Proveedor T', montoGasto: '250000', montoDocumento: '297500', documentoOriginal: 'F-1' });
  await page.click('#modalBody .add-compra-btn');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.eq(w.length, 1, 'SEP compra: 1 write inmediato (sin esperar el debounce)');
  const idsCompra = Object.keys(w[0].payload.compras || {});
  t.eq(idsCompra.length, 1, 'SEP compra: el payload trae una sola compra');
  const compraId = idsCompra[0];
  t.ok(esMergeSet(w[0]) && w[0].payload.compras[compraId].codigo === '410605' && w[0].payload.compras[compraId].montoGasto === 250000, 'SEP compra: merge:true con la compra por ID', w[0].payload);
  st = await h.store();
  t.eq(Object.keys(st[RUTA('1121')].compras).length, Object.keys(fx['1121'].compras).length + 1, 'SEP compra: el servidor tiene una compra más y conserva las anteriores');
  t.eq(st[RUTA('1121')].compras.c1121_especial, fx['1121'].compras.c1121_especial, 'SEP compra: la compra con caracteres especiales sigue intacta');

  // ---------------------------------------------------------------- Re-emit del snapshot: la UI no cambia
  const textoFila = () => page.evaluate(() => document.querySelector('#tableBody tr[data-rbd="1121"]').innerText.replace(/\s+/g, ' ').trim());
  const valorCelda = () => page.inputValue(celdaIng);
  const antes = { fila: await textoFila(), celda: await valorCelda(), compras: await page.locator('#modalBody tr[data-compra-id]').count() };
  await h.mock('emitSnapshot');
  await h.waitIdle();
  const despues = { fila: await textoFila(), celda: await valorCelda(), compras: await page.locator('#modalBody tr[data-compra-id]').count() };
  t.eq(despues, antes, 'tras re-emitir el snapshot, la fila, la celda y las compras del modal no cambian');
  t.eq(despues.celda, '123456', 'tras re-emitir el snapshot, la celda editada conserva 123456');

  // ---------------------------------------------------------------- Recarga de la página: lo escrito persiste
  await cerrarModales(h);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'));
  await h.waitIdle();
  await abrirModalSep(h, '1121');
  t.eq(await page.inputValue(celdaIng), '123456', 'tras recargar la página, el ingreso editado sigue en 123456');
  t.eq(await page.inputValue(celdaRem), '987654', 'tras recargar la página, la remuneración editada sigue en 987654');
  t.eq(await page.locator(`#modalBody tr[data-compra-id="${compraId}"]`).count(), 1, 'tras recargar la página, la compra agregada sigue en el registro');
  t.eq(await page.inputValue('#remRealHasta-1121'), '9', 'tras recargar la página, "reales hasta" sigue en Septiembre');

  // ---------------------------------------------------------------- SEP: eliminar compra => deleteField
  await h.clearWrites();
  await page.click(`#modalBody button.compra-del-btn[data-compra-id="${compraId}"]`);
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.ok(w.length === 1 && esMergeSet(w[0]), 'SEP borrar compra: 1 setDoc con merge:true', w);
  t.eq(w[0].payload.compras, { [compraId]: DEL }, 'SEP borrar compra: payload { compras: { <id>: deleteField() } }');
  t.ok(marcasAuditoria(w[0]), 'SEP borrar compra: lleva lastModifiedBy/serverTimestamp');
  st = await h.store();
  t.ok(!(compraId in st[RUTA('1121')].compras), 'SEP borrar compra: el servidor ya no tiene esa compra');
  t.eq(Object.keys(st[RUTA('1121')].compras).sort(), Object.keys(fx['1121'].compras).sort(), 'SEP borrar compra: las demás compras siguen');
  await h.mock('emitSnapshot'); await h.waitIdle();
  t.eq(await page.locator(`#modalBody tr[data-compra-id="${compraId}"]`).count(), 0, 'SEP borrar compra: tras re-emitir el snapshot no reaparece');

  // ---------------------------------------------------------------- SEP: ítem de proyección B&S (agregar / editar / quitar)
  await h.clearWrites();
  await cerrarModales(h);
  await abrirModalSep(h, '1122');
  await page.selectOption('#bysproyAddSelect-1122', '410904');
  await page.click('#modalBody .add-bysproy-btn[data-rbd="1122"]');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1122');
  t.ok(w.length === 1 && esMergeSet(w[0]) && w[0].payload.bys_proyeccion.items['410904'] && w[0].payload.bys_proyeccion.items['410904'].total === 0, 'SEP proyección B&S: agregar ítem escribe bys_proyeccion.items.410904 (merge:true)', w);
  await h.clearWrites();
  await page.fill('input.celda-input[data-rbd="1122"][data-modo="bys_proy"][data-codigo="410904"][data-mes="OCTUBRE"]', '55000');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1122');
  t.eq(w[0].payload.bys_proyeccion.items['410904'].meses, { OCTUBRE: 55000 }, 'SEP proyección B&S: editar un mes escribe solo ese mes');
  await h.clearWrites();
  await page.click('#modalBody button.bysproy-del-btn[data-rbd="1122"][data-codigo="410904"]');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1122');
  t.eq(w[0] && w[0].payload.bys_proyeccion, { items: { '410904': DEL } }, 'SEP proyección B&S: quitar ítem usa deleteField()');
  await cerrarModales(h);

  // ---------------------------------------------------------------- Fuente con compras (General): ingreso, compra, borrar compra
  await h.clearWrites();
  await clickTab(page, 'General');
  await page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="1121"]');
  await h.waitIdle();
  await page.fill('#otrasFuentesModalBody input.celda-input[data-rbd="1121"][data-fuente="general"][data-modo="of_ingreso"][data-mes="OCTUBRE"]', '777000');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.ok(w.length === 1 && esMergeSet(w[0]) && w[0].payload.otras_fuentes.general.ingreso.meses.OCTUBRE === 777000, 'General ingreso: merge:true en otras_fuentes.general.ingreso.meses.OCTUBRE', w);
  st = await h.store();
  t.eq(st[RUTA('1121')].otras_fuentes.general.ingreso.meses.ENERO, fx['1121'].otras_fuentes.general.ingreso.meses.ENERO, 'General ingreso: conserva los demás meses');
  t.eq(st[RUTA('1121')].otras_fuentes.pie, fx['1121'].otras_fuentes.pie, 'General ingreso: no toca otras fuentes del mismo documento');
  await h.clearWrites();
  await llenarCompra(page, 'of', { codigo: '410602', tipoDocumento: 'Boleta', fechaDocumento: '2026-05-05', montoGasto: '88000' });
  await page.click('#otrasFuentesModalBody .of-add-compra-btn');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  const idOf = Object.keys((w[0] && w[0].payload.otras_fuentes.general.compras) || {})[0];
  t.ok(w.length === 1 && esMergeSet(w[0]) && idOf && w[0].payload.otras_fuentes.general.compras[idOf].montoGasto === 88000, 'General compra: agregar escribe otras_fuentes.general.compras.<id>', w);
  await h.clearWrites();
  await page.click(`#otrasFuentesModalBody button.of-compra-del-btn[data-compra-id="${idOf}"]`);
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.eq(w[0] && w[0].payload.otras_fuentes, { general: { compras: { [idOf]: DEL } } }, 'General compra: borrar usa deleteField() en otras_fuentes.general.compras.<id>');
  st = await h.store();
  t.ok(!(idOf in st[RUTA('1121')].otras_fuentes.general.compras), 'General compra: el servidor ya no la tiene');
  await page.keyboard.press('Escape'); await h.waitIdle();

  // ---------------------------------------------------------------- Fuente por concepto (FAEP): ítem B&S agregar / editar / quitar
  await h.clearWrites();
  await clickTab(page, 'FAEP');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="1121"]');
  await h.waitIdle();
  await page.fill('#juncon-1121-faep', 'Concepto de prueba');
  await page.click('#otrasFuentesModalBody .of-add-bysitem-btn[data-lista="bys_items"]');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.ok(w.length === 1 && esMergeSet(w[0]) && w[0].payload.otras_fuentes.faep.bys_items['Concepto de prueba'], 'FAEP ítem B&S: agregar escribe otras_fuentes.faep.bys_items.<concepto>', w);
  await h.clearWrites();
  await page.fill('#otrasFuentesModalBody input.celda-input[data-modo="of_bys_item"][data-concepto="Concepto de prueba"][data-mes="MARZO"]', '31000');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.eq(w[0] && w[0].payload.otras_fuentes.faep.bys_items['Concepto de prueba'].meses, { MARZO: 31000 }, 'FAEP ítem B&S: editar un mes escribe solo ese mes');
  await h.clearWrites();
  await page.click('#otrasFuentesModalBody button.of-bysitem-del-btn[data-concepto="Concepto de prueba"]');
  await h.flushWrites();
  w = writesDe(await h.writes(), '1121');
  t.eq(w[0] && w[0].payload.otras_fuentes, { faep: { bys_items: { 'Concepto de prueba': DEL } } }, 'FAEP ítem B&S: quitar usa deleteField()');
  await page.keyboard.press('Escape'); await h.waitIdle();

  // ---------------------------------------------------------------- JUNJI (GESPARVU, 3 ingresos)
  await h.clearWrites();
  await clickTab(page, 'JUNJI');
  await page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  await page.fill('#otrasFuentesModalBody input.celda-input[data-rbd="5402002"][data-modo="of_ingreso_homologacion"][data-mes="NOVIEMBRE"]', '4321');
  await h.flushWrites();
  w = writesDe(await h.writes(), '5402002');
  t.ok(w.length === 1 && esMergeSet(w[0]) && w[0].payload.otras_fuentes.junji.ingreso_homologacion.meses.NOVIEMBRE === 4321, 'JUNJI: la edición va a otras_fuentes.junji.ingreso_homologacion (doc GESPARVU 5402002)', w);
  await page.keyboard.press('Escape'); await h.waitIdle();

  // ---------------------------------------------------------------- Cambio hecho por OTRO usuario (llega por snapshot)
  const otro = JSON.parse(JSON.stringify(fx['1123']));
  otro.rem.meses.ENERO = 5555555; otro.rem.total = otro.rem.total - fx['1123'].rem.meses.ENERO + 5555555;
  await h.mock('seed', { '1123': otro });
  await h.waitIdle();
  await clickTab(page, 'SEP');
  await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1123"]');
  await h.waitIdle();
  t.eq(await page.inputValue('input.celda-input[data-rbd="1123"][data-modo="rem"][data-mes="ENERO"]'), '5555555', 'un cambio de otro usuario (snapshot) se refleja en la UI sin recargar');
  await page.keyboard.press('Escape'); await h.waitIdle();

  // ---------------------------------------------------------------- Error de escritura: se rechaza, se informa (rojo) y se reintenta a mano
  // (F-03: un error PERMANENTE como permission-denied ya no se reintenta en bucle; el detalle de los estados está en sync_estado)
  await h.clearWrites();
  h.expectErrors(/Error guardando RBD/);
  await abrirModalSep(h, '1128');
  await h.mock('failNextWrite', 'permission-denied');
  await page.fill('input.celda-input[data-rbd="1128"][data-modo="rem"][data-mes="DICIEMBRE"]', '4242');
  await h.flushWrites();
  await page.waitForFunction(() => window.__mockfb.writes.some(x => x.status === 'rejected'), null, { timeout: 5000 });
  w = writesDe(await h.writes(), '1128');
  t.ok(w.length >= 1 && w[0].status === 'rejected' && w[0].error === 'permission-denied', 'write rechazado (permission-denied) queda registrado como rechazado', w[0]);
  await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('red'), null, { timeout: 5000 });
  t.ok(/No tienes permiso/.test(await page.textContent('#sync-text')) && /1 cambio sin guardar/.test(await page.textContent('#sync-text')), 'el indicador de sincronización queda en rojo y avisa del error', await page.textContent('#sync-text'));
  t.eq(await page.inputValue('input.celda-input[data-rbd="1128"][data-modo="rem"][data-mes="DICIEMBRE"]'), '4242', 'lo tecleado sigue en pantalla aunque el servidor lo rechazó');
  await page.click('#rbdModal .modal-sync-retry'); // el aviso también está dentro del modal abierto
  await page.waitForFunction(() => window.__mockfb.writes.some(x => x.status === 'acked'), null, { timeout: 15000 });
  await h.waitIdle();
  w = writesDe(await h.writes(), '1128');
  t.ok(w.length >= 2 && ultimo(w).status === 'acked' && ultimo(w).payload.rem.meses.DICIEMBRE === 4242, 'el reintento manual reenvía el guardado y el servidor lo acepta', w.map(x => x.status));
  st = await h.store();
  t.eq(st[RUTA('1128')].rem.meses.DICIEMBRE, 4242, 'tras el reintento el servidor tiene el valor');
  await h.clearWrites();
  const dialogosAntes = h.dialogs.length;
  // Falla al eliminar una compra: avisa con alert (el usuario no se queda con la duda)
  await page.keyboard.press('Escape'); await h.waitIdle();
  await abrirModalSep(h, '1121');
  const idQuitar = (await page.locator('#modalBody tr[data-compra-id]').first().getAttribute('data-compra-id'));
  await h.mock('failNextWrite', 'unavailable', { optimistic: false });
  await page.click(`#modalBody button.compra-del-btn[data-compra-id="${idQuitar}"]`);
  await h.flushWrites();
  const nuevos = h.dialogs.slice(dialogosAntes).map(d => d.message);
  t.ok(nuevos.some(m => /No se pudo eliminar la compra/.test(m)), 'si falla el borrado de una compra el panel avisa con un alert', nuevos);
  await page.keyboard.press('Escape'); await h.waitIdle();

  t.noErrores(h, 'sin errores inesperados durante toda la prueba');
  await h.close();
});
