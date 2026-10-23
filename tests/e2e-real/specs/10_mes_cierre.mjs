// 10_mes_cierre — mes de cierre global (documento `sep_carga_rbd/_meta`) y "Aplicar a todas las entidades" contra el SDK REAL + emulador.
//
// Lo que el mock modela por nuestra cuenta y aquí se prueba de verdad:
//   M1) Fijar el mes de cierre escribe `_meta` con setDoc + merge (mes_cierre, mes_cierre_por, mes_cierre_en = hora del SERVIDOR, auditoría) SIN pisar
//       items_22 / items_29 ni tocar ningún otro documento (updateTime intacto); sobrevive a recargar la página (IndexedDB real).
//   M2) "Aplicar a todas las entidades": UN writeBatch real con los 69 documentos (138 operaciones ≤ 400), todos confirmados; en el servidor cada RBD
//       queda con rem.real_hasta_mes = 9, cada entidad con otras_fuentes.{fuente}.real_hasta_mes = 9 en las fuentes de su universo, ningún otro campo cambia, y
//       repetirlo no escribe nada (idempotente).
//   M3) Un lote rechazado por las reglas es ATÓMICO (el servidor no recibe nada de ese lote), el panel avisa y deja repetir; con las reglas restablecidas,
//       repetir lo guarda todo.
//   M4) La restricción a administradores es solo del cliente: con las reglas reales (firestore.rules) un correo autorizado que NO es administrador SÍ puede
//       escribir `_meta` (riesgo residual documentado en el README). Se prueba con @firebase/rules-unit-testing como el spec 08.
// Esperado: PASS en la PR; FALLA en @069f9dd (no existe el control).
import fs from 'node:fs';
import path from 'node:path';
import { boot, cargarFixture, clickTab, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { asegurarEmulador, REGLAS_ABIERTAS, REGLAS_SIN_ESCRITURA_EN } from '../lib/emulator.mjs';
import { PROJECT_ID, REPO_DIR, requireDeps } from '../lib/env.mjs';

const ADMIN = 'wilson.rojas@sleppetorca.gob.cl';
const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const clon = (o) => JSON.parse(JSON.stringify(o));
const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const quitaCortes = (d) => {
  const c = clon(d);
  delete c.ingreso_real_hasta_mes;
  if (c.rem) delete c.rem.real_hasta_mes;
  Object.keys(c.otras_fuentes || {}).forEach(k => { delete c.otras_fuentes[k].real_hasta_mes; if (!Object.keys(c.otras_fuentes[k]).length) delete c.otras_fuentes[k]; });
  if (c.otras_fuentes && !Object.keys(c.otras_fuentes).length) delete c.otras_fuentes;
  return c;
};
const FUENTES_RBD_AC = ['general', 'pie', 'mantenimiento', 'prorretencion', 'faep', 'figa', 'aporte_educ'];
const FUENTES_GESPARVU = ['junji', 'aporte_junji'];

await correrSpec('10_mes_cierre', async (t) => {
  const docs = cargarFixture('default');
  docs._meta = { ...docs._meta, items_22: ['Alimentación', 'Útiles'], items_29: ['Mobiliario'] };
  const ids = Object.keys(docs).filter(id => id !== '_meta');
  const rbds = ids.filter(id => id !== 'AC' && !/^54/.test(id));
  const gesparvu = ids.filter(id => /^54/.test(id));

  const h = await boot({ fixture: docs, allowErrors: [/./] });
  const { page } = h;
  await t.escenario('M1', async () => {
    await clickTab(page, 'panel');
    t.eq(await texto(page, '#cierreMesTexto'), 'sin definir', 'M1) con el servidor sin mes de cierre el panel dice "sin definir"');
    const antes = await h.emu.instantanea();
    t.eq(antes._meta.data.items_22, ['Alimentación', 'Útiles'], 'M1) el documento _meta del servidor trae items_22 / items_29 (como el de producción)');
    await h.clearLog();
    await page.selectOption('#cierreMesSelect', '9');
    await h.flush();
    const ws = (await h.writes()).filter(w => w.path && w.path.endsWith('/_meta'));
    t.eq(ws.length, 1, 'M1) un solo write a _meta');
    t.ok(ws[0] && ws[0].op === 'setDoc' && ws[0].options && ws[0].options.merge === true && ws[0].status === 'acked', 'M1) setDoc con merge:true, confirmado por el servidor', ws[0]);
    const despues = await h.emu.instantanea();
    const m = despues._meta.data;
    t.eq([m.mes_cierre, m.mes_cierre_por], [9, ADMIN], 'M1) servidor: mes_cierre = 9 y mes_cierre_por = el administrador');
    t.ok(m.mes_cierre_en && typeof m.mes_cierre_en.__ts === 'number' && m.lastModifiedAt && typeof m.lastModifiedAt.__ts === 'number', 'M1) servidor: mes_cierre_en y lastModifiedAt son marcas de tiempo del servidor', m);
    t.eq([m.items_22, m.items_29], [['Alimentación', 'Útiles'], ['Mobiliario']], 'M1) servidor: items_22 / items_29 siguen intactos (el merge no los pisa)');
    const otros = Object.keys(despues).filter(id => id !== '_meta' && despues[id].updateTime !== antes[id].updateTime);
    t.eq(otros, [], 'M1) ningún otro documento recibió una escritura (updateTime intacto)');
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'M1) el panel muestra Septiembre');
    const e = await estado(page);
    t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'M1) el indicador queda verde', e);
    await h.recargar();
    await h.esperarVerde({ timeout: 40000 });
    await clickTab(page, 'panel');
    t.eq([await texto(page, '#cierreMesTexto'), await page.evaluate(() => document.getElementById('cierreMesSelect').value)], ['Septiembre', '9'], 'M1) tras recargar (IndexedDB real) sigue en Septiembre');
    t.eq((await h.writes()).length, 0, 'M1) y recargar no escribe nada');
  });

  await t.escenario('M3', async () => {
    // Un documento cuyas reglas rechazan la escritura hace fallar TODO el lote (los lotes de Firestore son atómicos).
    await h.emu.reglas(REGLAS_SIN_ESCRITURA_EN('1128'));
    const antes = await h.emu.instantanea();
    h.dialogs.length = 0;
    await h.clearLog();
    await page.click('#cierreAplicarBtn');
    const hayAlerta = await esperar(async () => h.dialogs.some(d => d.type === 'alert' && /No se pudo guardar el corte/.test(d.message)), 20000);
    t.ok(hayAlerta, 'M3) con un documento rechazado por las reglas el panel avisa "No se pudo guardar el corte para el resto del equipo"', h.dialogs.map(d => d.message.slice(0, 80)));
    t.ok(h.dialogs.some(d => /Puedes repetir "Aplicar a todas las entidades": solo reintenta lo que falte/.test(d.message)), 'M3) y dice que se puede repetir');
    const ws = (await h.writes()).filter(w => w.op === 'batch.set');
    t.eq([new Set(ws.map(w => w.batchId)).size, ws.length], [1, 69], 'M3) un solo lote de 69 documentos (138 operaciones ≤ 400)');
    t.ok(ws.every(w => w.status === 'rejected' || w.status === 'error'), 'M3) rechazado por el servidor', [...new Set(ws.map(w => w.status))]);
    const despues = await h.emu.instantanea();
    const cambiados = Object.keys(despues).filter(id => despues[id].updateTime !== antes[id].updateTime);
    t.eq(cambiados, [], 'M3) el lote es atómico: el servidor no recibió NADA (ningún updateTime cambió)');
    await esperar(async () => /⚠ \d+ entidades? con corte distinto/.test(await texto(page, '#cierreAvisoResumen') || ''), 15000);
    t.ok(/⚠ \d+ entidades con corte distinto al cierre global \(Septiembre\)/.test(await texto(page, '#cierreAvisoResumen')), 'M3) la pantalla se reconcilia con el servidor: el aviso vuelve a contar todas las entidades', await texto(page, '#cierreAvisoResumen'));
    await h.emu.reglas(REGLAS_ABIERTAS);
  });

  await t.escenario('M2', async () => {
    const antes = await h.emu.instantanea();
    h.dialogs.length = 0;
    await h.clearLog();
    await page.click('#cierreAplicarBtn');
    await esperar(async () => h.dialogs.some(d => d.type === 'alert' && /Listo/.test(d.message)), 30000);
    const conf = h.dialogs.find(d => d.type === 'confirm');
    t.ok(conf && /Se fijará Septiembre como corte Real\/Proyectado en \d+ entidades \(69 documentos\)/.test(conf.message), 'M2) confirmación: "Se fijará Septiembre como corte … (69 documentos)"', conf && conf.message.slice(0, 160));
    await h.esperarEscriturasListas(30000);
    const ws = (await h.writes()).filter(w => w.op === 'batch.set');
    t.eq([new Set(ws.map(w => w.batchId)).size, ws.length], [1, 69], 'M2) UN writeBatch real con 69 documentos (138 operaciones, bajo el tope de 400)');
    t.ok(ws.every(w => w.options && w.options.merge === true && w.status === 'acked'), 'M2) todos con merge:true y confirmados por el servidor', [...new Set(ws.map(w => w.status))]);
    const despues = await h.emu.instantanea();
    t.ok(rbds.every(id => despues[id].data.rem.real_hasta_mes === 9), 'M2) servidor: la remuneración de los 55 RBD queda en Septiembre');
    t.ok([...rbds, 'AC'].every(id => FUENTES_RBD_AC.every(k => despues[id].data.otras_fuentes[k].real_hasta_mes === 9)), 'M2) servidor: las 7 fuentes de RBD/AC quedan en Septiembre en los 55 RBD y en AC');
    t.ok(gesparvu.length === 13 && gesparvu.every(id => FUENTES_GESPARVU.every(k => despues[id].data.otras_fuentes[k].real_hasta_mes === 9)), 'M2) servidor: JUNJI y Aporte JUNJI en Septiembre en los 13 GESPARVU');
    t.ok(gesparvu.every(id => !FUENTES_RBD_AC.some(k => despues[id].data.otras_fuentes && despues[id].data.otras_fuentes[k])), 'M2) sin crear fuentes fuera del universo de cada entidad');
    t.ok(ids.every(id => despues[id].data.ingreso_real_hasta_mes === undefined), 'M2) los ingresos sin corte propio no reciben campo (siguen al mes de cierre)');
    const limpio = (id) => { const d = clon(despues[id].data); delete d.lastModifiedAt; delete d.lastModifiedBy; return quitaCortes(d); };
    const orig = (id) => { const d = clon(antes[id].data); delete d.lastModifiedAt; delete d.lastModifiedBy; return quitaCortes(d); };
    const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v)); // sin depender del orden de las claves
    const distintosIds = ids.filter(id => canon(limpio(id)) !== canon(orig(id)));
    t.eq(distintosIds, [], 'M2) ningún otro campo de ningún documento cambió (montos, compras, ítems, nombres…)');
    t.eq(despues._meta.updateTime, antes._meta.updateTime, 'M2) y _meta no se tocó');
    t.ok(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')), 'M2) el aviso desaparece: todas las entidades coinciden con el cierre');
    const e = await estado(page);
    t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'M2) el indicador queda verde', e);
    // idempotente
    h.dialogs.length = 0;
    await h.clearLog();
    await page.click('#cierreAplicarBtn');
    await page.waitForTimeout(800);
    t.eq((await h.writes()).length, 0, 'M2) idempotente: repetirlo no escribe nada');
    t.ok(h.dialogs.some(d => d.type === 'alert' && /no hay nada que cambiar/.test(d.message)) && !h.dialogs.some(d => d.type === 'confirm'), 'M2) avisa que no hay nada que cambiar');
    const final = await h.emu.instantanea();
    t.eq(ids.filter(id => final[id].updateTime !== despues[id].updateTime), [], 'M2) el servidor no recibió ninguna escritura más');
    // recarga: todo sigue en Septiembre y la pantalla coincide
    await h.recargar();
    await h.esperarVerde({ timeout: 40000 });
    await clickTab(page, 'panel');
    t.ok(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')), 'M2) tras recargar el aviso sigue sin aparecer');
  });
  t.ok(!(await h.inesperados()).filter(x => !/permission|PERMISSION|Missing or insufficient|rechaz/i.test(x)).length, 'sin errores inesperados (los rechazos de M3 son los esperados)', (await h.inesperados()).slice(0, 4));
  await h.close();

  // ============================================================ M4) la restricción a administradores es solo del cliente: las reglas reales no la imponen
  await t.escenario('M4', async () => {
    const emu = await asegurarEmulador();
    const { initializeTestEnvironment, assertSucceeds, assertFails } = requireDeps('@firebase/rules-unit-testing');
    const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: emu.host, port: emu.port, rules: fs.readFileSync(path.join(REPO_DIR, 'firestore.rules'), 'utf8') } });
    const ok = async (p) => { try { await assertSucceeds(p); return true; } catch (e) { return false; } };
    const no = async (p) => { try { await assertFails(p); return true; } catch (e) { return false; } };
    try {
      const noAdmin = env.authenticatedContext('uid-catalina', { email: 'catalina.brito@sleppetorca.gob.cl' }).firestore();
      t.ok(await ok(noAdmin.doc('sep_carga_rbd/_meta').set({ mes_cierre: 10, mes_cierre_por: 'catalina.brito@sleppetorca.gob.cl' }, { merge: true })),
        'M4) con las firestore.rules REALES un correo autorizado que NO es administrador SÍ puede escribir _meta.mes_cierre: la restricción a administradores es solo del cliente (riesgo residual documentado)');
      const intruso = env.authenticatedContext('uid-x', { email: 'intruso@example.com' }).firestore();
      t.ok(await no(intruso.doc('sep_carga_rbd/_meta').set({ mes_cierre: 1 }, { merge: true })), 'M4) y un correo que NO está en la lista sigue sin poder escribirlo');
      t.ok(await no(noAdmin.doc('sep_carga_rbd/_meta').delete()), 'M4) nadie puede borrar _meta (allow delete: if false)');
    } finally { await env.cleanup(); }
  });
});
