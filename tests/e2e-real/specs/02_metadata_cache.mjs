// 02_metadata_cache — includeMetadataChanges con el SDK REAL (IndexedDB persistente + emulador).
//
// Con caché poblada el SDK entrega un 1.er snapshot fromCache:true (desde IndexedDB) y, cuando el servidor confirma SIN cambiar ningún
// documento, un 2.º evento solo de METADATOS (fromCache:false, docChanges() vacío). La PR #57 usa { includeMetadataChanges: true } para
// reaccionar a ese 2.º evento: pone el indicador en verde, ejecuta ensureRbdsFaltantesEnFirestore (el RBD que falta en el servidor y
// en el caché) y NO repinta nada ni mueve el foco. Antes de la PR (069f9dd) ese evento nunca llegaba: el RBD faltante no se creaba y el
// indicador no se enteraba.
//   A1) recarga con caché poblada -> [fromCache:true] + [fromCache:false sin cambios] -> se crea el RBD faltante, solo con escalares
//   A2) arranque desde caché SIN red (corte real del proxy), luego vuelve la red -> amarillo "Sin conexión" -> verde, RBD creado
//   B)  evento solo-metadatos con el modal abierto y el foco en una celda (disable/enableNetwork): ni repinta ni mueve el foco
//   C)  conteo de repintados: 1 escritura propia, 1 ajena y los eventos de metadatos (sin tormenta)
import { boot, abrirSep, cerrarModal, celdaIng, cargarFixture, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';

const X = '1130'; // RBD que NO está en el servidor (ni en el caché) y que DATA.registros sí contiene
const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };

await correrSpec('02_metadata_cache', async (t) => {
  const sinX = cargarFixture('default'); delete sinX[X];
  const N = Object.keys(sinX).length; // documentos que el servidor y el caché tienen (todos menos X)

  // ============================================================ A1) recarga con caché poblada
  {
    const h = await boot({ fixture: sinX });
    await t.escenario('A1', async () => {
      // Sesión 1: el servidor no tiene X -> la app lo crea (y lo anota como "en creación": no lo recrea en esta misma sesión)
      t.ok(!!(await esperar(() => h.servidor(X))), `A1) sesión 1: el panel creó el RBD faltante ${X} en el servidor`);
      await h.emu.borrar(X);                                         // el "admin" lo borra del servidor
      t.ok(!!(await esperar(async () => (await h.events()).some(e => e.ids.includes('removed:' + X)))), `A1) sesión 1: el panel recibe el borrado (removed:${X}): el caché local ya no lo tiene`);
      await h.page.waitForTimeout(1500);
      t.eq(await h.servidor(X), null, `A1) sesión 1: el panel no lo recrea en la misma sesión; el servidor y el caché quedan SIN ${X}`);

      await h.recargar();                                            // misma IndexedDB (mismo contexto): caché poblada
      await h.esperarVerde({ timeout: 30000 });
      t.ok(!!(await esperar(() => h.servidor(X))), `A1) tras la recarga se crea el RBD faltante ${X} en el servidor`);
      await h.page.waitForTimeout(500);
      const ev = await h.events(), w = await h.writes();
      t.eq((await h.persistencia()), { ok: true }, 'A1) la persistencia IndexedDB está activa en la recarga');
      t.ok(ev[0] && ev[0].fromCache === true && ev[0].nCambios > 0 && ev[0].size === N, `A1) 1.er snapshot: fromCache:true con los ${N} documentos del caché`, ev[0]);
      const meta = ev.find((e, i) => i > 0 && e.fromCache === false);
      t.ok(meta && meta.nCambios === 0 && meta.size === N, 'A1) luego un evento SOLO de metadatos: fromCache:false y ningún documento cambió', meta);
      const creaciones = w.filter(x => x.path === `sep_carga_rbd/${X}`);
      t.eq(creaciones.length, 1, `A1) exactamente UNA escritura sobre ${X} (batch con merge)`);
      t.ok(creaciones[0] && meta && creaciones[0].t >= meta.t, 'A1) y ocurre DESPUÉS del evento fromCache:false (con el snapshot del caché no se escribe nada)', { escritura: creaciones[0] && creaciones[0].t, meta: meta && meta.t });
      t.eq(w.filter(x => x.t < (meta ? meta.t : 0)).length, 0, 'A1) ninguna escritura antes de la confirmación del servidor');
      const d = await h.servidor(X);
      t.eq(d && Object.keys(d.data).sort(), ['lastModifiedAt', 'lastModifiedBy', 'nombre', 'rbd'], 'A1) el documento creado solo trae escalares (rbd, nombre, auditoría): ningún mapa vacío que pise datos');
      const e = await estado(h.page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'A1) el indicador queda verde', e);
      await t.sinErrores(h);
    });
    await h.close();
  }

  // ============================================================ A2) arranque desde caché sin red, luego vuelve la red
  {
    const h = await boot({ fixture: sinX });
    await t.escenario('A2', async () => {
      await esperar(() => h.servidor(X));
      await h.emu.borrar(X);
      await esperar(async () => (await h.events()).some(e => e.ids.includes('removed:' + X)));
      await h.page.waitForTimeout(800);
      h.red.corta();                                                 // corte REAL: el emulador queda inalcanzable (conexiones reseteadas)
      await h.recargar();
      const t0 = Date.now();
      await esperar(async () => (await h.events()).length >= 1, 15000);
      const ev0 = (await h.events())[0];
      t.ok(ev0 && ev0.fromCache === true && ev0.size === N, `A2) sin red: el panel arranca igual con los ${N} documentos del caché (fromCache:true)`, ev0);
      const e1 = await estado(h.page);
      t.ok(e1.color === 'yellow' && /Sincronizando/.test(e1.txt), 'A2) durante la gracia inicial (3 s) el indicador dice "Sincronizando...", no alarma', e1);
      await h.page.waitForTimeout(Math.max(0, 3600 - (Date.now() - t0)));
      const e2 = await estado(h.page);
      t.ok(e2.color === 'yellow' && /^Sin conexión: los cambios se guardan en este navegador/.test(e2.txt), 'A2) pasada la gracia: amarillo "Sin conexión: los cambios se guardan en este navegador…"', e2);
      t.eq(await h.servidor(X), null, 'A2) mientras no hay red no se crea nada');
      t.eq((await h.writes()).length, 0, 'A2) ni siquiera se intenta escribir con el snapshot del caché');
      h.red.restablece();                                            // vuelve la red
      await h.esperarVerde({ timeout: 90000 });
      t.ok(!!(await esperar(() => h.servidor(X), 15000)), `A2) al volver la red y confirmar el servidor se crea ${X}`);
      const ev = await h.events();
      const meta = ev.find((e, i) => i > 0 && e.fromCache === false);
      t.ok(meta && meta.nCambios === 0, 'A2) la confirmación llega como evento solo-metadatos (sin cambios de documentos)', meta);
      const e3 = await estado(h.page);
      t.ok(e3.color === 'green' && /^Sincronizado/.test(e3.txt), 'A2) y el indicador vuelve a verde', e3);
    });
    h.expectErrors(/./);                                             // el corte de red genera errores de consola del SDK/navegador: son esperados aquí
    await h.close();
  }

  // ============================================================ B) + C) modal abierto, foco, repintados
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h, '1122');
    const sel = celdaIng('1122', 'ENERO');
    await page.evaluate(() => {
      document.querySelectorAll('#modalBody *').forEach((e, i) => { e.__marca = i + 1; }); window.__nNodos = document.querySelectorAll('#modalBody *').length;
      window.__rep = { tabla: 0, quitados: 0, agregados: 0 };
      new MutationObserver((l) => { window.__rep.tabla += l.length; }).observe(document.getElementById('tableBody'), { childList: true });
      new MutationObserver((l) => l.forEach(r => { r.removedNodes.forEach(n => { if (n.nodeType === 1) window.__rep.quitados++; }); r.addedNodes.forEach(n => { if (n.nodeType === 1) window.__rep.agregados++; }); })).observe(document.getElementById('modalBody'), { childList: true, subtree: true });
    });
    const rep = () => page.evaluate(() => ({ ...window.__rep }));
    const cero = () => page.evaluate(() => { window.__rep.tabla = 0; window.__rep.quitados = 0; window.__rep.agregados = 0; });
    const conCambios = async () => (await h.events()).filter(e => e.nCambios > 0).length;
    const soloMeta = async () => (await h.events()).filter(e => e.nCambios === 0).length;

    await t.escenario('B', async () => {
      try {
      await page.click(sel);
      await page.keyboard.type('9');
      await page.waitForTimeout(1300);                               // guardado + eco ya resueltos; el foco sigue en la celda
      await h.clearLog(); await cero();
      const antes = await page.evaluate((s) => { const el = document.querySelector(s); return { foco: document.activeElement === el, v: el.value, caret: el.selectionStart }; }, sel);
      t.ok(antes.foco && antes.v === '9', 'B) antes: la celda tiene el foco y su valor', antes);

      await h.disableNetwork();                                      // evento { fromCache:true, sin cambios }
      await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('yellow'), null, { timeout: 5000 });
      const off = await estado(page);
      t.ok(off.color === 'yellow' && /^Sin conexión: los cambios se guardan en este navegador/.test(off.txt), 'B) corte (disableNetwork): amarillo "Sin conexión: los cambios se guardan en este navegador…"', off);
      const espejo = await page.evaluate(() => { const m = document.querySelector('#rbdModal .modal-sync'); return m ? { visible: !m.classList.contains('hidden'), txt: m.textContent } : null; });
      t.ok(espejo && espejo.visible && /Sin conexión/.test(espejo.txt), 'B) y el aviso también se ve DENTRO del modal abierto', espejo);
      t.eq((await h.events()).map(e => ({ fromCache: e.fromCache, nCambios: e.nCambios })), [{ fromCache: true, nCambios: 0 }], 'B) el SDK entregó UN evento solo de metadatos (fromCache:true, ningún documento cambió)');
      t.eq((await rep()).tabla, 0, 'B) ese evento no repintó la tabla');

      await h.enableNetwork();                                       // evento { fromCache:false, sin cambios }
      await h.esperarVerde({ timeout: 20000 });
      await page.waitForTimeout(300);
      const on = await estado(page);
      t.ok(on.color === 'green' && /^Sincronizado/.test(on.txt), 'B) al reconectar: verde "Sincronizado"', on);
      t.eq((await h.events()).map(e => ({ fromCache: e.fromCache, nCambios: e.nCambios })), [{ fromCache: true, nCambios: 0 }, { fromCache: false, nCambios: 0 }], 'B) el SDK entregó el 2.º evento solo-metadatos (fromCache:false)');
      const r = await rep();
      t.eq(r, { tabla: 0, quitados: 0, agregados: 0 }, 'B) los dos eventos de metadatos NO repintaron ni la tabla ni el modal (0 nodos agregados/quitados)');
      const despues = await page.evaluate((s) => { const el = document.querySelector(s); return { foco: document.activeElement === el, v: el.value, caret: el.selectionStart, marca: !!el.__marca, nodos: document.querySelectorAll('#modalBody *').length }; }, sel);
      t.ok(despues.foco && despues.v === '9' && despues.marca, 'B) la celda sigue siendo el MISMO nodo, con foco y con su valor', despues);
      t.eq(despues.caret, antes.caret, 'B) y el cursor no se movió');
      await page.keyboard.type('8');                                 // se puede seguir tecleando sin haber perdido el foco
      await h.flush();
      t.eq((await h.servidor('1122')).data.ingreso_items['Carrera Docente'].meses.ENERO, 98, 'B) se sigue tecleando en la misma celda y el servidor guarda 98');
      t.eq((await h.writes()).filter(w => w.path === 'sep_carga_rbd/1130' && w.op === 'batch.set').length, 0, 'B) el evento de metadatos no creó RBD espurios (no faltaba ninguno)');
      } finally { await h.enableNetwork().catch(() => {}); }
    });

    await t.escenario('C', async () => {
      await page.click(celdaIng('1122', 'FEBRERO'));
      await page.waitForTimeout(100);
      // C1) UNA escritura propia
      await h.clearLog(); await cero();
      await page.keyboard.type('5');
      await h.flush(); await page.waitForTimeout(1200);
      const r1 = await rep(), cc1 = await conCambios(), sm1 = await soloMeta();
      t.info(`C) 1 escritura propia: repintados de la tabla=${r1.tabla}, eventos con cambios=${cc1}, solo-metadatos=${sm1}, nodos del modal agregados/quitados=${r1.agregados}/${r1.quitados}`);
      t.eq(r1.tabla, cc1, 'C) 1 escritura propia: un repintado por cada snapshot CON cambios (local + confirmación), ninguno por los de solo metadatos');
      t.ok(r1.tabla <= 2, 'C) 1 escritura propia: como máximo 2 repintados (no hay tormenta)', r1);
      t.eq([r1.agregados, r1.quitados], [0, 0], 'C) 1 escritura propia: el modal no agregó ni quitó ningún nodo');
      // C2) UNA escritura ajena (otro usuario, SDK real de Node)
      await h.clearLog(); await cero();
      await h.emu.escribirComoOtro('1125', { rem: { meses: { ENERO: 1234 } } });
      await page.waitForTimeout(1200);
      const r2 = await rep(), cc2 = await conCambios(), sm2 = await soloMeta();
      t.info(`C) 1 escritura ajena: repintados de la tabla=${r2.tabla}, eventos con cambios=${cc2}, solo-metadatos=${sm2}`);
      t.eq(r2.tabla, 1, 'C) 1 escritura ajena: exactamente 1 repintado');
      t.eq(r2.tabla, cc2, 'C) 1 escritura ajena: tantos repintados como snapshots con cambios');
      t.eq([r2.agregados, r2.quitados], [0, 0], 'C) 1 escritura ajena: el modal no agregó ni quitó ningún nodo');
      const nodos = await page.evaluate(() => { const todos = Array.from(document.querySelectorAll('#modalBody *')); return { vivos: todos.filter(e => e.__marca).length, inicial: window.__nNodos, ahora: todos.length }; });
      t.ok(nodos.vivos === nodos.inicial && nodos.ahora === nodos.inicial, 'C) al final ningún nodo del modal fue reemplazado', nodos);
    });
    await cerrarModal(h);
    await t.sinErrores(h);
    await h.close();
  }
});
