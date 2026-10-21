// semilla_cache (A3 + A6): la siembra inicial y la creación de RBD faltantes solo ocurren con un snapshot confirmado
// por el SERVIDOR; un snapshot vacío (o incompleto) del caché local no genera escrituras. Ningún write envía mapas
// vacíos {} (con merge:true reemplazarían datos existentes en el servidor).
import { boot, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const COL = 'sep_carga_rbd/';
const esSentinela = (v) => v && typeof v === 'object' && '__sentinel' in v;
// Rutas de los mapas vacíos {} dentro de un payload (ignora los centinelas deleteField/serverTimestamp).
function mapasVacios(valor, ruta = '') {
  if (valor === null || typeof valor !== 'object' || esSentinela(valor)) return [];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => mapasVacios(v, `${ruta}[${i}]`));
  const claves = Object.keys(valor);
  if (!claves.length) return [ruta || '(raíz)'];
  return claves.flatMap(k => mapasVacios(valor[k], ruta ? `${ruta}.${k}` : k));
}
const escriturasDeDocs = (writes) => writes.filter(w => w.path.startsWith(COL));
const sembrados = (writes) => writes.filter(w => w.op === 'batch.set' && w.path.startsWith(COL));
async function esperarPrimerSnapshot(h) {
  await h.page.waitForFunction(() => window.__mockfb.events.length >= 1, null, { timeout: 15000 });
  await h.waitIdle();
  await h.page.waitForTimeout(300);
}

await correrSpec('semilla_cache', async (t) => {
  const fx = cargarFixture('default').docs;

  // ---- A) sin conexión y sin caché: snapshot vacío fromCache:true => NO se escribe nada
  {
    const h = await boot({ fixture: null, offline: true, waitReady: false });
    await esperarPrimerSnapshot(h);
    const ev = (await h.events())[0];
    t.ok(ev && ev.empty === true && ev.fromCache === true, 'el primer snapshot es vacío y viene del caché (fromCache:true)', ev);
    t.eq((await h.writes()).length, 0, 'snapshot vacío fromCache:true: CERO escrituras (no siembra)');
    t.eq(await h.mock('queueLength'), 0, 'snapshot vacío fromCache:true: nada en la cola offline');
    const estado = await h.page.evaluate(() => ({ txt: document.getElementById('sync-text').textContent, cls: document.getElementById('sync-indicator').className }));
    t.ok(/Sin conexión/.test(estado.txt) && /yellow/.test(estado.cls), 'el estado avisa "Sin conexión" en amarillo (no "Sincronizado")', estado);
    // Al volver la red con el servidor realmente vacío el SDK solo cambia el metadato fromCache (ningún documento cambia). Desde F-03
    // el listener usa includeMetadataChanges, así que ese evento SÍ llega: es la confirmación del servidor que faltaba (antes, con
    // "solo un snapshot de caché y sin evento posterior del servidor", la siembra y ensureRbdsFaltantes no corrían hasta la próxima carga).
    await h.mock('setOffline', false);
    await h.waitIdle();
    await h.page.waitForTimeout(300);
    t.eq(sembrados(await h.writes()).length, 55, 'al reconectar, el evento fromCache→false confirma el vacío del servidor: se siembra una sola vez (55 RBD)');
    t.noErrores(h);
    await h.close();
  }

  // ---- A2) vacío CONFIRMADO por el servidor (fromCache:false) => la migración inicial sí siembra, sin mapas vacíos
  {
    const h = await boot({ fixture: null });
    const ev = (await h.events())[0];
    t.ok(ev && ev.empty === true && ev.fromCache === false, 'el primer snapshot es vacío y viene del servidor (fromCache:false)', ev);
    const w = await h.writes();
    const sem = sembrados(w);
    t.eq(sem.length, 55, 'vacío confirmado por el servidor: se siembran los 55 RBD');
    const vacios = escriturasDeDocs(w).flatMap(x => mapasVacios(x.payload).map(r => `${x.id}:${r}`));
    t.eq(vacios, [], 'la siembra no envía ningún mapa vacío {}');
    const p = sem.find(x => x.id === '1121');
    t.ok(p && p.options.merge === true && p.payload.rbd === '1121' && p.payload.nombre && p.payload.rem && p.payload.rem.real_hasta_mes && p.payload.ingreso_items && Object.keys(p.payload.ingreso_items).length === 3,
      'cada documento sembrado trae rbd, nombre, rem y las 3 filas de ingreso (merge:true)', p && Object.keys(p.payload));
    t.ok(!('compras' in (p ? p.payload : {})) && !('bys_proyeccion' in (p ? p.payload : {})) && !('otras_fuentes' in (p ? p.payload : {})), 'la siembra no incluye compras / bys_proyeccion / otras_fuentes (nunca pisan datos)');
    await h.waitIdle();
    t.eq(Object.keys(await h.store()).filter(k => k.startsWith(COL)).length, 55, 'el servidor queda con 55 documentos');
    t.noErrores(h);
    await h.close();
  }

  // ---- B) el servidor SÍ tiene datos, pero el cliente arranca sin conexión y sin caché => al reconectar NO se pisa nada
  {
    const h = await boot({ fixture: 'default', seedCache: false, offline: true, waitReady: false });
    await esperarPrimerSnapshot(h);
    t.eq((await h.writes()).length, 0, 'offline sin caché con datos en el servidor: cero escrituras mientras no hay conexión');
    await h.mock('setOffline', false);
    await h.waitIdle();
    await h.page.waitForTimeout(300);
    await h.waitIdle();
    t.eq((await h.writes()).length, 0, 'al reconectar con datos reales en el servidor: CERO escrituras (no hay siembra ni "creación" de RBD)');
    const st = await h.store();
    const alterados = Object.entries(fx).filter(([id, d]) => {
      const s = st[COL + id];
      return s && ['rem', 'ingreso_items', 'compras', 'otras_fuentes', 'bys_proyeccion'].some(k => JSON.stringify(s[k]) !== JSON.stringify(d[k]));
    }).map(([id]) => id);
    t.eq(alterados, [], 'ningún documento del servidor fue alterado');
    t.noErrores(h);
    await h.close();
  }

  // ---- C) un RBD falta en el servidor (snapshot de servidor): se crea SOLO con escalares, sin mapas vacíos
  {
    const sin1121 = JSON.parse(JSON.stringify(fx));
    delete sin1121['1121'];
    const h = await boot({ fixture: sin1121 });
    const w = escriturasDeDocs(await h.writes());
    t.eq(w.map(x => x.id), ['1121'], 'snapshot de servidor sin el RBD 1121: se crea únicamente el 1121');
    t.eq(Object.keys(w[0].payload).sort(), ['lastModifiedAt', 'lastModifiedBy', 'nombre', 'rbd'], 'el documento nuevo lleva solo escalares {rbd, nombre, lastModifiedBy, lastModifiedAt}');
    t.ok(w[0].options.merge === true, 'con merge:true');
    t.eq(escriturasDeDocs(w).flatMap(x => mapasVacios(x.payload)), [], 'sin mapas vacíos');
    t.eq(Object.keys(await h.store()).filter(k => k.startsWith(COL)).length, Object.keys(fx).length, 'el servidor queda con todos los documentos');
    t.noErrores(h);
    await h.close();
  }

  // ---- D) el caché trae SOLO una parte (falta 1121) y el servidor aún no respondió: no se crea nada hasta que el servidor confirme
  {
    const sin1121 = JSON.parse(JSON.stringify(fx));
    delete sin1121['1121'];
    const h = await boot({ fixture: sin1121, cacheFirst: true, latency: { ack: 700 }, waitReady: false });
    await h.page.waitForFunction(() => window.__mockfb.events.length >= 1, null, { timeout: 15000 });
    const primero = (await h.events())[0];
    t.ok(primero && primero.fromCache === true && primero.empty === false, 'el primer snapshot viene del caché y trae datos (fromCache:true)', primero);
    await h.page.waitForTimeout(150);
    t.eq((await h.writes()).length, 0, 'con solo el snapshot del caché (que no tiene el 1121) NO se crea ningún documento');
    await h.waitIdle();
    await h.page.waitForTimeout(900);
    await h.waitIdle();
    const w = escriturasDeDocs(await h.writes());
    t.eq(w.map(x => x.id), ['1121'], 'cuando llega el snapshot del servidor (sin el 1121) recién ahí se crea el RBD faltante');
    t.noErrores(h);
    await h.close();
  }

  // ---- E) control: servidor completo => ninguna escritura automática
  {
    const h = await boot({ fixture: 'default' });
    t.eq((await h.writes()).length, 0, 'control: con todos los documentos presentes el panel no escribe nada al abrir');
    await h.close();
  }
});
