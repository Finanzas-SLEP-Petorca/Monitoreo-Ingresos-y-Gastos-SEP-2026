// 06_siembra — PR #56 (siembra inicial) contra el SDK REAL.
//
//   S1) Perfil NUEVO (sin caché) con el emulador inalcanzable al abrir: el SDK entrega un snapshot VACÍO pero fromCache:true. El panel NO
//       debe escribir NADA (antes sembraba los 55 RBD con remuneraciones en $0 y, al volver la red, esas escrituras pendientes con
//       merge:true pisaban compras y remuneraciones reales). Al volver la red los datos del servidor siguen EXACTAMENTE iguales
//       (mismo contenido y mismo updateTime: el servidor no recibió ni una escritura).
//   S2) Servidor realmente VACÍO y alcanzable (snapshot vacío fromCache:false): se siembra UNA sola vez, sin mapas vacíos `{}` en los
//       writes, y una recarga posterior (servidor ya poblado) no vuelve a sembrar.
// Esperado: PASS en la PR y en @069f9dd (la corrección es de la PR #56); FALLA en @baseline (0f16ace), el panel anterior a la PR #56.
import { boot, cargarFixture, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';

const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const hayMapaVacio = (v, ruta = '') => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !('__sentinel' in v) && !('__ts' in v)) {
    if (Object.keys(v).length === 0) return ruta || '(raíz)';
    for (const k of Object.keys(v)) { const r = hayMapaVacio(v[k], ruta ? ruta + '.' + k : k); if (r) return r; }
  }
  return null;
};

await correrSpec('06_siembra', async (t) => {
  // ============================================================ S1) perfil nuevo, emulador inalcanzable al abrir, servidor CON datos reales
  {
    const h = await boot({ fixture: 'default', cortada: true, waitReady: false, allowErrors: [/./] });
    const { page } = h;
    await t.escenario('S1', async () => {
      const antes = await h.emu.instantanea();
      const nAntes = Object.keys(antes).length;
      t.ok(nAntes >= 55 && Object.values(antes).some(d => d.data.compras && Object.keys(d.data.compras).length), `S1) el servidor parte con ${nAntes} documentos reales (compras y remuneraciones precargadas)`);
      t.ok(await esperar(async () => (await h.events()).length >= 1, 30000), 'S1) el SDK entrega un primer snapshot aunque no haya red');
      const ev0 = (await h.events())[0];
      t.ok(ev0 && ev0.empty === true && ev0.fromCache === true, 'S1) ese snapshot es VACÍO y viene del caché (fromCache:true): caché nuevo + servidor inalcanzable', ev0);
      await page.waitForTimeout(3500);                                // pasa la gracia inicial
      const e1 = await estado(page);
      t.ok(e1.color === 'yellow' && /^Sin conexión con el servidor — esperando datos \(no se escribió nada\)/.test(e1.txt), 'S1) amarillo "Sin conexión con el servidor — esperando datos (no se escribió nada)"', e1);
      t.eq((await h.writes()).length, 0, 'S1) mientras no hay red el panel no escribió NADA (no sembró)');
      await page.waitForTimeout(8000);                                // 12 s en total con la red cortada
      t.eq((await h.writes()).length, 0, 'S1) tras 12 s sin red sigue sin escribir nada');

      h.red.restablece();                                             // vuelve la red
      await h.esperarVerde({ timeout: 90000 });
      await h.esperarEscriturasListas(60000).catch(() => {});         // si el panel hubiera encolado algo, que termine de enviarse
      await page.waitForTimeout(3000);
      const ev = await h.events();
      const real = ev.find(e => e.fromCache === false);
      t.ok(real && real.size === nAntes && !real.empty, `S1) al volver la red llega el snapshot REAL del servidor con los ${nAntes} documentos`, real);
      const despues = await h.emu.instantanea();
      const distintos = Object.keys(antes).filter(id => JSON.stringify(antes[id].data) !== JSON.stringify((despues[id] || {}).data));
      const movidos = Object.keys(antes).filter(id => antes[id].updateTime !== (despues[id] || {}).updateTime);
      t.eq(Object.keys(despues).length, nAntes, 'S1) el servidor tiene los mismos documentos tras reconectar');
      if (Object.keys(antes).some(id => JSON.stringify(antes[id].data) !== JSON.stringify((despues[id] || {}).data))) {
        // diagnóstico del daño (solo si hubo): qué cambió en los primeros documentos
        const resumen = ['1121', '1122', '1123'].map(id => { const a = antes[id].data, d = (despues[id] || {}).data || {}; return `${id}: compras ${Object.keys(a.compras || {}).length}→${Object.keys(d.compras || {}).length}, rem.meses ${JSON.stringify((a.rem || {}).meses) === JSON.stringify((d.rem || {}).meses) ? 'igual' : 'CAMBIÓ'}, ingreso_items ${JSON.stringify(a.ingreso_items) === JSON.stringify(d.ingreso_items) ? 'igual' : 'CAMBIÓ'}`; });
        t.info('S1) DAÑO en el servidor tras reconectar: ' + resumen.join(' | '));
      }
      t.eq(distintos, [], 'S1) NINGÚN documento cambió de contenido (compras, remuneraciones e ingresos siguen intactos)');
      t.eq(movidos, [], 'S1) y ninguno cambió de updateTime: el servidor no recibió ni una escritura del panel');
      t.eq((await h.writes()).length, 0, 'S1) el panel no escribió nada en toda la sesión (ni siembra ni RBD "faltantes": no falta ninguno)');
      const e2 = await estado(page);
      t.ok(e2.color === 'green' && /^Sincronizado/.test(e2.txt), 'S1) el indicador queda verde', e2);
    });
    await h.close();
  }

  // ============================================================ S2) servidor realmente vacío y alcanzable: se siembra una vez, sin mapas {}
  {
    const h = await boot({ fixture: null, allowErrors: [/./] });
    const { page } = h;
    await t.escenario('S2', async () => {
      await esperar(async () => (await h.emu.contar()) >= 55, 20000);
      await h.esperarEscriturasListas(30000).catch(() => {});
      await page.waitForTimeout(1500);
      t.eq(await h.emu.contar(), 55, 'S2) tras abrir con el servidor vacío: el panel sembró 55 documentos (los RBD de DATA.registros)');
      const ev = await h.events();
      t.ok(ev[0] && ev[0].empty === true && ev[0].fromCache === false, 'S2) el 1.er snapshot es vacío pero confirmado por el servidor (fromCache:false)', ev[0]);
      const w = (await h.writes()).filter(x => x.op === 'batch.set');
      const lotes = [...new Set(w.map(x => x.batchId))];
      t.eq(lotes.length, 1, 'S2) se siembra UNA sola vez (un solo batch)');
      t.eq(w.length, 55, 'S2) con 55 operaciones (una por RBD)');
      t.ok(w.every(x => x.options && x.options.merge === true), 'S2) todas con merge:true');
      const vacios = w.map(x => ({ path: x.path, vacio: hayMapaVacio(x.payload) })).filter(x => x.vacio);
      t.eq(vacios, [], 'S2) ningún write lleva mapas vacíos {} (con merge:true pisarían lo que ya exista en el servidor)');
      t.ok(w.every(x => x.status === 'acked'), 'S2) el servidor confirmó todo el batch', [...new Set(w.map(x => x.status))]);
      const d = await h.servidor('1121');
      t.ok(d && d.data.rbd === '1121' && d.data.nombre && d.data.rem && d.data.rem.real_hasta_mes && d.data.lastModifiedBy === 'wilson.rojas@sleppetorca.gob.cl', 'S2) cada documento trae rbd, nombre, rem.real_hasta_mes y auditoría', d && Object.keys(d.data));
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'S2) el indicador queda verde', e);

      // recarga con el servidor ya poblado y el caché poblado: no se vuelve a sembrar
      const updateTimes = Object.fromEntries(Object.entries(await h.emu.instantanea()).map(([id, x]) => [id, x.updateTime]));
      await h.recargar();
      await h.esperarVerde({ timeout: 30000 });
      await page.waitForTimeout(1500);
      t.eq((await h.writes()).length, 0, 'S2) la recarga posterior no escribe nada (no vuelve a sembrar)');
      const updateTimes2 = Object.fromEntries(Object.entries(await h.emu.instantanea()).map(([id, x]) => [id, x.updateTime]));
      t.eq(updateTimes2, updateTimes, 'S2) y ningún documento del servidor cambió de updateTime');
    });
    await h.close();
  }
});
