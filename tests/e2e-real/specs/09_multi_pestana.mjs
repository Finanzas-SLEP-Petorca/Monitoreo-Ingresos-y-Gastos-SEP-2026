// 09_multi_pestana — (extra, no estaba en la lista de la consigna) enableIndexedDbPersistence con DOS pestañas del mismo perfil.
//
// El panel usa enableIndexedDbPersistence (modo de UNA sola pestaña): con una segunda pestaña abierta el SDK real rechaza la persistencia
// con `failed-precondition` ("another tab has exclusive access"). El mock no puede modelar eso. El panel debe seguir funcionando con
// caché en memoria y, como lo editado sin conexión en esa pestaña vive SOLO en memoria, avisar al cerrar (hayCambiosSinGuardar usa
// persistenciaOfflineActiva=false) — mientras que en la pestaña con IndexedDB no hace falta avisar.
import { boot, esperarVerde, abrirSep, celdaIng, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';

const beforeunload = (page) => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });

await correrSpec('09_multi_pestana', async (t) => {
  const h = await boot({ fixture: 'default', allowErrors: [/./] });
  const p1 = h.page;
  await t.escenario('multi', async () => {
    t.eq(await h.persistencia(), { ok: true }, 'multi) la 1.ª pestaña activa la persistencia IndexedDB');
    const p2 = await h.context.newPage();
    p2.on('dialog', d => d.accept().catch(() => {}));
    await p2.goto(h.url + '/index.html', { waitUntil: 'load' });
    await esperarVerde(p2, { timeout: 30000 });
    const pers2 = await p2.evaluate(() => window.__fb.persistencia);
    t.ok(pers2 && pers2.ok === false && pers2.code === 'failed-precondition', 'multi) la 2.ª pestaña NO puede activar la persistencia: failed-precondition (el SDK real lo exige; el mock no lo modela)', pers2);
    const e2 = await estado(p2);
    t.ok(e2.color === 'green', 'multi) y aun así el panel de la 2.ª pestaña arranca y queda verde (caché en memoria)', e2);

    // edición SIN conexión en la 2.ª pestaña: vive solo en memoria => al cerrar se avisa
    await p2.click('.tab-btn[data-tab="panel"]');
    await p2.click('#tableBody td.rbd-clickable[data-abrir-rbd="1123"]');
    await p2.waitForSelector(celdaIng('1123', 'ENERO'));
    await p2.evaluate(() => window.__fb.fs.disableNetwork(window.__fb.db));
    await p2.click(celdaIng('1123', 'ENERO'));
    await p2.keyboard.type('777');
    await p2.evaluate(() => document.activeElement.blur());
    await p2.waitForTimeout(800);
    t.eq(await beforeunload(p2), true, 'multi) 2.ª pestaña (sin IndexedDB) con una edición sin enviar y sin red: cerrar la pestaña PIDE confirmación (se perdería)');
    // 1.ª pestaña: lo mismo sin red, queda en IndexedDB => no se avisa
    await abrirSep(h, '1125');
    await p1.evaluate(() => window.__fb.fs.disableNetwork(window.__fb.db));
    await p1.click(celdaIng('1125', 'ENERO'));
    await p1.keyboard.type('888');
    await p1.evaluate(() => document.activeElement.blur());
    await p1.waitForTimeout(800);
    t.eq(await beforeunload(p1), false, 'multi) 1.ª pestaña (con IndexedDB), misma situación: NO se pide confirmación (la cola persiste en el navegador)');
    await p2.evaluate(() => window.__fb.fs.enableNetwork(window.__fb.db));
    await p1.evaluate(() => window.__fb.fs.enableNetwork(window.__fb.db));
    await esperarVerde(p2, { timeout: 30000 });
    await esperarVerde(p1, { timeout: 30000 });
    const d3 = await h.servidor('1123'), d5 = await h.servidor('1125');
    t.eq([d3.data.ingreso_items['Carrera Docente'].meses.ENERO, d5.data.ingreso_items['Carrera Docente'].meses.ENERO], [777, 888], 'multi) al reconectar, ambas pestañas envían su edición y el servidor tiene 777 y 888');
    t.eq(await beforeunload(p2), false, 'multi) y ya sin pendientes la 2.ª pestaña tampoco avisa');
    await p2.close();
  });
  await h.close();
});
