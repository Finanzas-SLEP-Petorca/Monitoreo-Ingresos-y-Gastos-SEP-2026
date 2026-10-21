// (d) semilla_offline — BUG CONOCIDO: el panel siembra la colección con sus datos embebidos cuando el primer snapshot
// llega VACÍO pero desde el CACHÉ local (metadata.fromCache === true), p. ej. al abrirlo sin conexión por primera vez.
// Un snapshot vacío de caché NO significa "la colección está vacía en el servidor": al reconectar, esas escrituras
// pendientes (setDoc con merge:true) pisan los montos reales que el equipo ya había cargado.
//
// Lo correcto es sembrar SOLO ante un snapshot vacío confirmado por el servidor (fromCache === false).
//
// MODO_BUG:
//   'known-bug'  -> documenta el comportamiento actual: si el bug está presente imprime
//                   "BUG CONOCIDO presente (esperado)" y NO falla; si ya no se reproduce avisa que hay que pasar a 'enforced'.
//   'enforced'   -> el bug presente HACE FALLAR el spec (cambiar a este modo tras corregirlo, para que no reaparezca).
// También se puede forzar desde fuera: KNOWN_BUG_EXPECTED=1 (known-bug) / KNOWN_BUG_EXPECTED=0 (enforced), o --expect-known-bugs / --enforce-bugs.
const MODO_BUG = 'known-bug'; // <-- el agente que corrija el bug debe cambiarlo a 'enforced'

import { boot, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
// Espera a que el panel reciba su primer snapshot y reaccione (la siembra, si ocurre, se arma en el mismo callback).
async function esperarPrimerSnapshot(h) {
  await h.page.waitForFunction(() => window.__mockfb.events.length >= 1, null, { timeout: 15000 });
  await h.waitIdle();
  await h.page.waitForTimeout(300);
}

await correrSpec('semilla_offline', async (t) => {
  const fx = cargarFixture('default').docs;

  // ---- Escenario A: sin conexión, caché local vacío -> snapshot vacío con fromCache:true
  {
    const h = await boot({ fixture: null, offline: true, waitReady: false });
    await esperarPrimerSnapshot(h);
    const eventos = await h.events();
    const primero = eventos[0];
    t.ok(primero && primero.empty === true && primero.fromCache === true, 'el primer snapshot es vacío y viene del caché (fromCache:true)', primero);
    const writes = (await h.writes()).filter(w => w.path.startsWith('sep_carga_rbd/'));
    const siembra = writes.filter(w => w.op === 'batch.set').length;
    t.info(`escrituras de siembra encoladas tras el snapshot vacío de caché: ${siembra}`);
    t.bug('siembra-con-snapshot-de-cache-vacio',
      `con un snapshot vacío fromCache:true el panel intentó sembrar ${siembra} documentos (debería esperar el snapshot confirmado por el servidor)`,
      siembra > 0);
    t.noErrores(h);
    await h.close();
  }

  // ---- Escenario B: el servidor SÍ tiene datos, pero el cliente arranca sin conexión y sin caché -> al reconectar,
  //      la siembra pendiente (merge:true) pisa los montos reales.
  {
    const h = await boot({ fixture: 'default', seedCache: false, offline: true, waitReady: false });
    await esperarPrimerSnapshot(h);
    const pendientes = await h.mock('queueLength');
    t.info(`escrituras pendientes en cola mientras está sin conexión: ${pendientes}`);
    await h.mock('setOffline', false); // vuelve la conexión
    await h.waitIdle();
    await h.page.waitForTimeout(300);
    await h.waitIdle();
    const store = await h.store();
    const pisados = [];
    Object.entries(fx).forEach(([id, d]) => {
      const s = store[RUTA(id)];
      if (!s) return;
      if (d.rem && d.rem.meses && Object.keys(d.rem.meses).length && JSON.stringify(s.rem.meses) !== JSON.stringify(d.rem.meses)) pisados.push(`${id}.rem`);
      else if (d.ingreso_items && Object.keys(d.ingreso_items).length && JSON.stringify(s.ingreso_items) !== JSON.stringify(d.ingreso_items)) pisados.push(`${id}.ingreso_items`);
    });
    t.info(`documentos del servidor con montos distintos a los reales tras reconectar: ${pisados.length}${pisados.length ? ' (p. ej. ' + pisados.slice(0, 3).join(', ') + ')' : ''}`);
    t.bug('siembra-pisa-datos-al-reconectar',
      `al reconectar, ${pisados.length} documento(s) del servidor fueron sobrescritos por la siembra inicial (pérdida de datos)`,
      pisados.length > 0);
    t.noErrores(h);
    await h.close();
  }

  // ---- Control (informativo): colección realmente vacía y CONFIRMADA por el servidor -> la migración inicial sí debe sembrar.
  {
    const h = await boot({ fixture: null, waitReady: true });
    const siembra = (await h.writes()).filter(w => w.op === 'batch.set' && w.path.startsWith('sep_carga_rbd/')).length;
    const primero = (await h.events())[0];
    t.ok(primero && primero.empty === true && primero.fromCache === false, 'control: el snapshot vacío viene del servidor (fromCache:false)', primero);
    t.info(`control: con colección vacía confirmada por el servidor el panel siembra ${siembra} documentos (comportamiento legítimo de la migración inicial)`);
    t.noErrores(h);
    await h.close();
  }
}, { modoBug: MODO_BUG });
