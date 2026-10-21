// sync_estado — F-03 (auditoría): los fallos de escritura NO pueden ser invisibles.
//
// Antes: con permission-denied el indicador seguía verde y se reintentaba sin fin cada 2 s; sin conexión seguía diciendo
// "Sincronizado"; el aviso al cerrar no existía. Ahora el indicador dice la verdad (snapshot.metadata.hasPendingWrites /
// fromCache con includeMetadataChanges + resultado de cada setDoc):
//   verde "Sincronizado" · amarillo "Guardando…" / "Sin conexión: los cambios se guardan en este navegador y se enviarán al
//   reconectar" / reintento automático con espera creciente (errores TRANSITORIOS) · rojo persistente "N cambios sin guardar"
//   + Reintentar (errores PERMANENTES: sin bucle, el cambio se conserva en pantalla y en memoria).
// Además: beforeunload solo si hay cambios sin guardar, y un snapshot solo de metadatos (fromCache pasa a false) ya dispara
// la creación de los RBD que faltan sin repintar nada (resuelve la limitación conocida de la PR anterior).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const celda = (rbd, mes = 'ENERO') => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="ingreso_item"][data-item="Carrera Docente"][data-mes="${mes}"]`;
const estado = (page) => page.evaluate(() => {
  const b = document.getElementById('sync-retry');
  return { txt: document.getElementById('sync-text').textContent, color: ['green', 'yellow', 'red'].find(c => document.getElementById('sync-indicator').classList.contains(c)) || '?', retry: !!b && !b.classList.contains('hidden') };
});
const beforeunloadPrevenido = (page) => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
const escrituras = async (h, rbd) => (await h.writes()).filter(w => w.path === `sep_carga_rbd/${rbd}` && w.options && w.options.merge && w.payload && w.payload.ingreso_items);
const guardado = async (h, rbd, mes = 'ENERO') => (await h.store())[`sep_carga_rbd/${rbd}`].ingreso_items['Carrera Docente'].meses[mes];

async function abrir(h, rbd) {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
async function cerrarModal(h) { await h.page.keyboard.press('Escape'); await h.waitIdle(); }
async function editar(h, rbd, valor, mes = 'ENERO') {
  await h.page.fill(celda(rbd, mes), String(valor));
  await h.flushWrites();
}
async function esperarEstado(page, fn, arg, timeout = 8000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 50 });
}
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 3).join(' | ')); }
}

await correrSpec('sync_estado', async (t) => {
  // ============================================================ conexión, "Guardando…", sin conexión
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await escenario(t, 'S1', async () => {
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt) && !e.retry, 'S1) en reposo: verde "Sincronizado" y sin botón Reintentar', e);
      t.eq(await beforeunloadPrevenido(page), false, 'S1) en reposo no hay aviso al cerrar (no hay nada sin guardar)');
    });

    await escenario(t, 'S2', async () => {
      await abrir(h, '1123');
      await h.mock('setLatency', { ack: 1500 });
      await page.fill(celda('1123'), '5000');
      await page.evaluate(() => document.activeElement.blur());
      await page.waitForTimeout(700);
      const mid = await estado(page);
      t.ok(mid.color === 'yellow' && /Guardando/.test(mid.txt), 'S2) mientras el servidor no confirma: amarillo "Guardando…" (no verde)', mid);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 6000);
      await h.waitIdle();
      const fin = await estado(page);
      t.ok(fin.color === 'green' && /^Sincronizado/.test(fin.txt), 'S2) al confirmarse: vuelve a verde "Sincronizado"', fin);
      t.eq(await guardado(h, '1123'), 5000, 'S2) el servidor tiene el valor');
      await h.mock('setLatency', { ack: 0 });
    });

    await escenario(t, 'S3', async () => {
      await h.mock('setOffline', true);
      await page.waitForTimeout(300);
      const off = await estado(page);
      t.ok(off.color === 'yellow' && /Sin conexión: los cambios se guardan en este navegador y se enviarán al reconectar/.test(off.txt), 'S3) sin conexión: amarillo "Sin conexión: los cambios se guardan en este navegador…"', off);
      await editar(h, '1123', 6000, 'FEBRERO');
      await page.waitForTimeout(400);
      const off2 = await estado(page);
      t.ok(off2.color === 'yellow' && /Sin conexión/.test(off2.txt) && !off2.retry, 'S3) editando sin conexión sigue amarillo (no rojo, no "Sincronizado")', off2);
      t.eq(await page.inputValue(celda('1123', 'FEBRERO')), '6000', 'S3) lo editado sin conexión sigue en pantalla');
      t.eq(await beforeunloadPrevenido(page), false, 'S3) lo editado sin conexión queda en la cola persistente del navegador: no se avisa al cerrar');
      await h.mock('setOffline', false);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 6000);
      await h.waitIdle();
      t.eq(await guardado(h, '1123', 'FEBRERO'), 6000, 'S3) al reconectar se envía lo pendiente');
      const on = await estado(page);
      t.ok(on.color === 'green' && /^Sincronizado/.test(on.txt), 'S3) al reconectar vuelve a verde', on);
      await cerrarModal(h);
    });

    // ------------------------------------------------------------ beforeunload solo con pendientes reales
    await escenario(t, 'S4', async () => {
      await abrir(h, '1125');
      const r = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        el.focus(); el.value = '777';
        el.dispatchEvent(new Event('input', { bubbles: true }));            // queda agendado (debounce de 400 ms)
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      }, celda('1125'));
      t.eq(r, true, 'S4) con un cambio recién tecleado y sin enviar, cerrar la pestaña pide confirmación');
      await h.flushWrites();
      t.eq(await beforeunloadPrevenido(page), false, 'S4) una vez guardado ya no se pide confirmación');
      await cerrarModal(h);
    });
    t.noErrores(h);
    await h.close();
  }

  // ============================================================ error PERMANENTE: rojo, sin bucle, conserva, reintento manual
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    h.expectErrors(/Error guardando RBD/);
    await escenario(t, 'P1', async () => {
      await abrir(h, '1128');
      await h.clearWrites();
      await h.mock('failNextWrite', 'permission-denied');
      await editar(h, '1128', 4242);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('red'), null, 6000);
      const e = await estado(page);
      t.ok(e.color === 'red' && /No tienes permiso/.test(e.txt) && /1 cambio sin guardar/.test(e.txt) && e.retry, 'P1) permission-denied: rojo con "No tienes permiso…", "1 cambio sin guardar" y botón Reintentar', e);
      await page.waitForTimeout(6500);
      t.eq((await escrituras(h, '1128')).length, 1, 'P1) NO se reintenta en bucle: un solo intento tras 6,5 s');
      const e2 = await estado(page);
      t.ok(e2.color === 'red' && e2.retry, 'P1) el rojo es persistente', e2);
      t.eq(await page.inputValue(celda('1128')), '4242', 'P1) lo tecleado sigue en pantalla (no se pierde la edición)');
      t.eq(await beforeunloadPrevenido(page), true, 'P1) con cambios rechazados cerrar la pestaña pide confirmación');
      // otra edición del mismo RBD lleva consigo lo retenido (y, ya sin fallo, todo se guarda)
      await editar(h, '1128', 4343, 'FEBRERO');
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 6000);
      await h.waitIdle();
      t.eq(await guardado(h, '1128', 'ENERO'), 4242, 'P1) una edición posterior reenvía lo retenido: ENERO quedó guardado');
      t.eq(await guardado(h, '1128', 'FEBRERO'), 4343, 'P1) ... y FEBRERO también');
      const e3 = await estado(page);
      t.ok(e3.color === 'green' && !e3.retry, 'P1) vuelve a verde y desaparece Reintentar', e3);
      t.eq(await beforeunloadPrevenido(page), false, 'P1) ya sin pendientes no se pide confirmación');
      await cerrarModal(h);
    });

    await escenario(t, 'P2', async () => {
      await abrir(h, '1128');
      await h.clearWrites();
      await h.mock('failNextWrite', 'permission-denied');
      await editar(h, '1128', 9191, 'MARZO');
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('red'), null, 6000);
      // el modal cubre la barra de estado: el aviso rojo y el botón se replican dentro del modal, donde se está editando
      const espejo = await page.evaluate(() => { const m = document.querySelector('#rbdModal .modal-sync'); return m ? { visible: !m.classList.contains('hidden'), txt: m.textContent, retry: !m.querySelector('.modal-sync-retry').classList.contains('hidden') } : null; });
      t.ok(espejo && espejo.visible && /No tienes permiso/.test(espejo.txt) && espejo.retry, 'P2) el aviso rojo y Reintentar también se ven DENTRO del modal abierto', espejo);
      await page.click('#rbdModal .modal-sync-retry');
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 6000);
      await h.waitIdle();
      t.eq(await page.evaluate(() => document.querySelector('#rbdModal .modal-sync').classList.contains('hidden')), true, 'P2) resuelto, el aviso del modal se oculta');
      t.eq(await guardado(h, '1128', 'MARZO'), 9191, 'P2) el botón Reintentar reenvía el cambio retenido y el servidor lo guarda');
      const w = await escrituras(h, '1128');
      t.eq(w.map(x => x.status), ['rejected', 'acked'], 'P2) exactamente dos intentos: el rechazado y el manual');
      t.eq(await page.evaluate(() => document.getElementById('sync-retry').classList.contains('hidden')), true, 'P2) el botón Reintentar se oculta');
      await cerrarModal(h);
    });

    // Otros códigos permanentes (y uno desconocido): rojo, un solo intento, mensaje propio; un clic reintenta todo
    await escenario(t, 'P3', async () => {
      const casos = [['1121', 'unauthenticated', /sesión/], ['1122', 'invalid-argument', /rechazó un dato/], ['1123', 'failed-precondition', /condición previa/], ['1125', 'internal', /No se pudo guardar \(internal\)/]];
      await h.clearWrites();
      for (const [rbd, codigo] of casos) {
        await abrir(h, rbd);
        await h.mock('failNextWrite', codigo);
        await editar(h, rbd, 1111);
        await cerrarModal(h);
        await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('red'), null, 6000);
        const e = await estado(page);
        t.ok(e.color === 'red' && casos.find(c => c[0] === rbd)[2].test(e.txt), `P3) ${codigo}: rojo con su mensaje`, e);
      }
      await page.waitForTimeout(4500);
      for (const [rbd, codigo] of casos) t.eq((await escrituras(h, rbd)).length, 1, `P3) ${codigo}: un solo intento (sin bucle)`);
      const e = await estado(page);
      t.ok(/4 cambios sin guardar/.test(e.txt), 'P3) el rojo cuenta los cambios retenidos de todos los RBD: "4 cambios sin guardar"', e);
      await page.click('#sync-retry');
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 6000);
      await h.waitIdle();
      for (const [rbd, codigo] of casos) t.eq(await guardado(h, rbd), 1111, `P3) tras Reintentar, ${rbd} (${codigo}) quedó guardado`);
    });
    t.noErrores(h);
    await h.close();
  }

  // ============================================================ cerrar sesión con cambios sin guardar: se avisa, y no se reenvían con otra sesión
  {
    const respuestas = ['cancelar', 'aceptar'];
    const h = await boot({ fixture: 'default', onDialog: (d) => (d.type() === 'confirm' && respuestas.shift() === 'cancelar' ? 'dismiss' : undefined) });
    const { page } = h;
    h.expectErrors(/Error guardando RBD/);
    await escenario(t, 'O1', async () => {
      await abrir(h, '1128');
      await h.clearWrites();
      await h.mock('failNextWrite', 'permission-denied');
      await editar(h, '1128', 5151);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('red'), null, 6000);
      await cerrarModal(h);
      await page.click('#signout-btn');
      const confirmaciones = h.dialogs.filter(d => d.type === 'confirm');
      t.ok(confirmaciones.length === 1 && /1 cambio sin guardar/.test(confirmaciones[0].message), 'O1) cerrar sesión con cambios rechazados pide confirmación y dice cuántos', confirmaciones.map(c => c.message));
      await page.waitForTimeout(300);
      t.eq(await page.evaluate(() => document.getElementById('app').classList.contains('hidden')), false, 'O1) si se cancela, la sesión sigue abierta');
      t.eq((await estado(page)).color, 'red', 'O1) ... y el cambio rechazado sigue pendiente (rojo)');
      await page.click('#signout-btn');
      await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'), null, { timeout: 5000 });
      t.eq(await beforeunloadPrevenido(page), false, 'O1) al confirmar, lo no guardado se descarta de la memoria (no se reenvía con otra sesión)');
    });
    t.noErrores(h);
    await h.close();
  }

  // ============================================================ error TRANSITORIO: amarillo, backoff creciente, no se pierde
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    h.expectErrors(/Error guardando RBD/);
    await escenario(t, 'T1', async () => {
      await abrir(h, '1128');
      await h.clearWrites();
      await h.mock('failNextWrite', 'unavailable');
      await h.mock('failNextWrite', 'unavailable');
      await editar(h, '1128', 3131);
      await esperarEstado(page, () => window.__mockfb.writes.filter(w => w.status === 'rejected').length >= 1, null, 5000);
      await page.waitForTimeout(300);
      const e = await estado(page);
      t.ok(e.color === 'yellow' && /Guardando/.test(e.txt) && !e.retry, 'T1) error transitorio (unavailable): amarillo "Guardando…" (no rojo) mientras se reintenta', e);
      t.eq(await page.inputValue(celda('1128')), '3131', 'T1) lo tecleado sigue en pantalla mientras se reintenta');
      t.eq(await beforeunloadPrevenido(page), true, 'T1) con un reintento pendiente cerrar la pestaña pide confirmación');
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 20000);
      await h.waitIdle();
      const w = await escrituras(h, '1128');
      t.eq(w.map(x => x.status), ['rejected', 'rejected', 'acked'], 'T1) intentos: rechazado, rechazado, aceptado');
      const g1 = w[1].t - w[0].t, g2 = w[2].t - w[1].t;
      t.ok(g1 >= 1700 && g1 <= 3000, `T1) 1.ª espera ≈ 2 s (fue ${g1} ms)`);
      t.ok(g2 >= 3700 && g2 <= 5500 && g2 > g1 * 1.5, `T1) 2.ª espera ≈ 4 s, creciente (fue ${g2} ms)`);
      t.eq(await guardado(h, '1128'), 3131, 'T1) el valor llegó al servidor');
      t.eq(await beforeunloadPrevenido(page), false, 'T1) confirmado: ya no se pide confirmación al cerrar');
      await cerrarModal(h);
    });

    await escenario(t, 'T2', async () => {
      const casos = [['1121', 'deadline-exceeded'], ['1122', 'resource-exhausted'], ['1123', 'aborted']];
      await h.clearWrites();
      for (const [rbd, codigo] of casos) {
        await abrir(h, rbd);
        await h.mock('failNextWrite', codigo);
        await editar(h, rbd, 2222);
        await cerrarModal(h);
      }
      await page.waitForTimeout(500);
      const e = await estado(page);
      t.ok(e.color === 'yellow' && !e.retry, 'T2) deadline-exceeded / resource-exhausted / aborted: amarillo, sin Reintentar manual', e);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 12000);
      await h.waitIdle();
      for (const [rbd, codigo] of casos) {
        const w = await escrituras(h, rbd);
        t.eq(w.map(x => x.status), ['rejected', 'acked'], `T2) ${codigo}: se reintentó solo y se guardó`);
        t.eq(await guardado(h, rbd), 2222, `T2) ${codigo}: el valor llegó al servidor`);
      }
    });
    t.noErrores(h);
    await h.close();
  }

  // ============================================================ arranque con caché: "Sin conexión" y creación de RBD faltantes al confirmar el servidor
  {
    const docs = cargarFixture('default').docs;
    const faltante = '1130';
    t.ok(!!docs[faltante], `fixture: existe el RBD ${faltante} que se quitará del servidor`);
    delete docs[faltante];
    const h = await boot({ fixture: docs, offline: true, waitReady: false });
    const { page } = h;
    await escenario(t, 'C1', async () => {
      await page.waitForFunction(() => window.__mockfb.events.length >= 1, null, { timeout: 15000 });
      await h.waitIdle();
      const ev = (await h.events())[0];
      t.ok(ev && ev.fromCache === true && ev.empty === false, 'C1) primer snapshot: viene del caché (fromCache:true) y trae datos', ev);
      t.eq((await h.writes()).length, 0, 'C1) sin conexión no se escribe nada');
      await page.waitForTimeout(3300); // pasa la gracia inicial de "Sincronizando…"
      const e = await estado(page);
      t.ok(e.color === 'yellow' && /Sin conexión: los cambios se guardan en este navegador y se enviarán al reconectar/.test(e.txt), 'C1) arrancando sin conexión: amarillo "Sin conexión: …" (no "Sincronizado")', e);
      await h.mock('setOffline', false);
      await esperarEstado(page, () => document.getElementById('sync-indicator').classList.contains('green'), null, 8000);
      await h.waitIdle();
      const creados = (await h.writes()).filter(w => w.path === `sep_carga_rbd/${faltante}`);
      t.eq(creados.length, 1, `C1) al confirmar el servidor (solo cambia fromCache, ningún documento) se crea el RBD faltante ${faltante}`);
      const c = creados[0];
      t.ok(c && c.options.merge === true && c.payload.rbd === faltante && !c.payload.rem && !c.payload.compras && !c.payload.ingreso_items, 'C1) ... solo con escalares (rbd, nombre, auditoría): nada que pise datos', c && Object.keys(c.payload));
      const e2 = await estado(page);
      t.ok(e2.color === 'green' && /^Sincronizado/.test(e2.txt), 'C1) y el indicador vuelve a verde', e2);
    });
    t.noErrores(h);
    await h.close();
  }
}, { modoBug: 'enforced' });
