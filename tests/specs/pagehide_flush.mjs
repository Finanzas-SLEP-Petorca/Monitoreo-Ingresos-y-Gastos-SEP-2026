// pagehide_flush (A7): si la persona cierra la pestaña / recarga / cambia de app justo después de teclear, la edición
// pendiente (debounce de ~400 ms) se envía YA (pagehide y visibilitychange→hidden), sin escrituras dobles y sin
// cambiar el debounce normal.
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const celdaRem = (rbd, mes) => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="rem"][data-mes="${mes}"]`;
// Escribe en la celda SIN perder el foco y SIN esperar: así el guardado queda pendiente del debounce.
const teclear = (page, selector, valor) => page.evaluate(([s, v]) => {
  const el = document.querySelector(s);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [selector, String(valor)]);
const writesDe = async (h, id) => (await h.writes()).filter(w => w.path === RUTA(id));
const ocultarPagina = (page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
const mostrarPagina = (page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});
async function abrirModalSep(h, rbd) {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}

await correrSpec('pagehide_flush', async (t) => {
  // ---- pagehide
  {
    const h = await boot({ fixture: 'default' });
    await abrirModalSep(h, '1121');
    await h.clearWrites();
    await teclear(h.page, celdaRem('1121', 'AGOSTO'), 4500000);
    t.eq((await writesDe(h, '1121')).length, 0, 'tras teclear NO hay escritura todavía (debounce de ~400 ms)');
    await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    let w = await writesDe(h, '1121');
    t.eq(w.length, 1, 'pagehide: la edición pendiente se envía al instante (1 escritura)');
    t.ok(w[0] && w[0].options.merge === true && w[0].payload.rem.meses.AGOSTO === 4500000, 'pagehide: setDoc merge:true con el mes editado', w[0] && w[0].payload);
    await h.page.waitForTimeout(800); // pasa de sobra el debounce original
    t.eq((await writesDe(h, '1121')).length, 1, 'pagehide: el debounce original no escribe por segunda vez (sin doble escritura)');
    await h.waitIdle();
    t.eq((await h.store())[RUTA('1121')].rem.meses.AGOSTO, 4500000, 'pagehide: el servidor recibió el valor');
    // sin nada pendiente, pagehide no escribe
    await h.clearWrites();
    await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    t.eq((await h.writes()).length, 0, 'pagehide sin ediciones pendientes: no escribe nada');
    t.noErrores(h);
    await h.close();
  }
  // ---- visibilitychange
  {
    const h = await boot({ fixture: 'default' });
    await abrirModalSep(h, '1121');
    await h.clearWrites();
    await teclear(h.page, celdaRem('1121', 'AGOSTO'), 3300000);
    await mostrarPagina(h.page);
    t.eq((await writesDe(h, '1121')).length, 0, 'visibilitychange→visible NO fuerza el guardado');
    await ocultarPagina(h.page);
    const w = await writesDe(h, '1121');
    t.eq(w.length, 1, 'visibilitychange→hidden: se envía al instante (1 escritura)');
    t.ok(w[0] && w[0].payload.rem.meses.AGOSTO === 3300000, 'visibilitychange: payload con el valor tecleado', w[0] && w[0].payload);
    await h.page.waitForTimeout(800);
    t.eq((await writesDe(h, '1121')).length, 1, 'visibilitychange: sin doble escritura tras el debounce');
    t.noErrores(h);
    await h.close();
  }
  // ---- varios RBD con ediciones pendientes a la vez
  {
    const h = await boot({ fixture: 'default' });
    await abrirModalSep(h, '1121');
    await h.clearWrites();
    await teclear(h.page, celdaRem('1121', 'AGOSTO'), 111);
    // abrir otro RBD sin pasar por blur (clic programático): la edición de 1121 sigue pendiente
    await h.page.evaluate(() => document.querySelector('#tableBody td.rbd-clickable[data-abrir-rbd="1122"]').click());
    await teclear(h.page, celdaRem('1122', 'AGOSTO'), 222);
    t.eq((await h.writes()).length, 0, 'dos RBD con edición pendiente y aún sin escrituras');
    await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const w = await h.writes();
    t.eq(w.map(x => x.path).sort(), [RUTA('1121'), RUTA('1122')], 'pagehide envía lo pendiente de TODOS los RBD (1121 y 1122), una vez cada uno');
    await h.waitIdle();
    const st = await h.store();
    t.ok(st[RUTA('1121')].rem.meses.AGOSTO === 111 && st[RUTA('1122')].rem.meses.AGOSTO === 222, 'ambos valores llegaron al servidor');
    t.noErrores(h);
    await h.close();
  }
  // ---- sin conexión: queda en la cola del SDK (se sube al reconectar), no se pierde
  {
    const h = await boot({ fixture: 'default' });
    await abrirModalSep(h, '1121');
    await h.mock('setOffline', true);
    await h.waitIdle();
    await h.clearWrites();
    await teclear(h.page, celdaRem('1121', 'AGOSTO'), 777);
    await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    t.eq((await writesDe(h, '1121')).length, 1, 'sin conexión: pagehide igual entrega la escritura al SDK (queda en cola)');
    t.ok((await h.mock('queueLength')) >= 1, 'la escritura queda en la cola offline');
    await h.mock('setOffline', false);
    await h.waitIdle();
    t.eq((await h.store())[RUTA('1121')].rem.meses.AGOSTO, 777, 'al reconectar, el valor llega al servidor');
    await h.close();
  }
});
