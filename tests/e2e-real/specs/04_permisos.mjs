// 04_permisos — errores de escritura CLASIFICADOS con el SDK REAL: el servidor (emulador con reglas) rechaza la escritura con
// `permission-denied` de verdad (no un error inyectado por un mock).
//
// Esperado en la PR #57: indicador ROJO persistente "🔴 N cambios sin guardar — No tienes permiso…" con botón Reintentar (también dentro
// del modal), SIN bucle de reintentos (un solo intento en 20 s), lo tecleado sigue en pantalla, cerrar la pestaña avisa; al restablecer
// las reglas y pulsar Reintentar el servidor recibe el valor y todo vuelve a verde. En 069f9dd (indicador verde + reintento cada 2 s
// sin fin) este spec FALLA.
//   A) todas las escrituras rechazadas (reglas de solo lectura)
//   B) rechazo PARCIAL: un RBD rechazado y otro aceptado a la vez
//   C) lectura rechazada (permission-denied en el listener)
//   D) las reglas REALES (firestore.rules) con el navegador sin sesión de Auth: nada se puede leer
import fs from 'node:fs';
import path from 'node:path';
import { boot, abrirSep, cerrarModal, celdaIng, estado } from '../lib/harness.mjs';
import { REGLAS_ABIERTAS, REGLAS_SOLO_LECTURA, REGLAS_SIN_ESCRITURA_EN, REGLAS_SIN_LECTURA } from '../lib/emulator.mjs';
import { REPO_DIR } from '../lib/env.mjs';
import { correrSpec } from '../lib/spec.mjs';

const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const guardado = async (h, rbd, mes = 'ENERO') => { const d = await h.servidor(rbd); return d && d.data.ingreso_items && d.data.ingreso_items['Carrera Docente'] && d.data.ingreso_items['Carrera Docente'].meses[mes]; };
const intentos = async (h, rbd) => (await h.writes()).filter(w => w.path === `sep_carga_rbd/${rbd}` && w.payload && w.payload.ingreso_items);
const beforeunload = (page) => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });

await correrSpec('04_permisos', async (t) => {
  // ============================================================ A) todas las escrituras rechazadas
  {
    const h = await boot({ fixture: 'default', allowErrors: [/Error guardando RBD/, /Missing or insufficient permissions/, /permission-denied/] });
    const { page } = h;
    await t.escenario('A', async () => {
      await abrirSep(h, '1128');
      await h.vigilarIndicador();
      const valorAntes = await guardado(h, '1128');
      await h.emu.reglas(REGLAS_SOLO_LECTURA);
      // muestreo por cuadro del valor de la celda editada (nunca debe volver a verse el valor anterior)
      const sel = celdaIng('1128', 'ENERO');
      await page.evaluate((s) => { window.__vals = []; const f = (window.__fic = {}); const tick = () => { if (window.__fic !== f) return; const el = document.querySelector(s); if (el) { const l = window.__vals, v = el.value; if (!l.length || l[l.length - 1] !== v) l.push(v); } requestAnimationFrame(tick); }; tick(); }, sel);
      await h.clearLog();
      await page.click(sel);
      await page.keyboard.type('4242');
      await page.evaluate(() => document.activeElement.blur());
      await esperar(async () => (await estado(page)).color === 'red', 15000, 50);
      const e = await estado(page);
      t.ok(e.color === 'red' && /No tienes permiso para guardar/.test(e.txt) && /1 cambio sin guardar/.test(e.txt) && e.retry, 'A) permission-denied REAL: rojo "1 cambio sin guardar — No tienes permiso…" con botón Reintentar', e);
      const espejo = await page.evaluate(() => { const m = document.querySelector('#rbdModal .modal-sync'); return m ? { visible: !m.classList.contains('hidden'), txt: m.textContent, retry: !m.querySelector('.modal-sync-retry').classList.contains('hidden') } : null; });
      t.ok(espejo && espejo.visible && /No tienes permiso/.test(espejo.txt) && espejo.retry, 'A) el aviso rojo y Reintentar también se ven DENTRO del modal abierto', espejo);
      // ventana de 20 s: sin bucle de reintentos
      await page.waitForTimeout(20000);
      const w = await intentos(h, '1128');
      t.eq(w.length, 1, 'A) en una ventana de 20 s hay UN solo intento de escritura (sin bucle de reintentos)');
      t.eq(w.map(x => x.status), ['rejected'], 'A) y fue rechazado');
      t.eq(w[0] && w[0].error && w[0].error.code, 'permission-denied', 'A) con el código REAL del SDK: permission-denied (no el mensaje: el panel clasifica por code)');
      const e2 = await estado(page);
      t.ok(e2.color === 'red' && e2.retry, 'A) el rojo es persistente tras 20 s', e2);
      t.eq(await page.inputValue(sel), '4242', 'A) lo tecleado sigue en pantalla (la edición no se pierde)');
      t.eq(await beforeunload(page), true, 'A) con cambios rechazados, cerrar la pestaña pide confirmación');
      t.eq(await guardado(h, '1128'), valorAntes, 'A) el servidor NO tiene el cambio (reglas de solo lectura): conserva el valor anterior');
      const vals = await page.evaluate(() => { window.__fic = null; return window.__vals; });
      t.ok(vals[vals.length - 1] === '4242' && !vals.slice(1).includes(''), 'A) cuadro a cuadro, el campo nunca volvió a mostrar el valor anterior (ni cuando el SDK revirtió la escritura local rechazada)', vals);

      // ---- se restablecen las reglas y se pulsa Reintentar
      await h.emu.reglas(REGLAS_ABIERTAS);
      if (await page.$('#rbdModal .modal-sync-retry') && e.retry) await page.click('#rbdModal .modal-sync-retry');
      else t.info('A) (esta versión del panel no tiene botón Reintentar: se espera al reintento automático)');
      await h.esperarVerde({ timeout: 30000 }).catch(() => {});
      t.ok(!!(await esperar(async () => (await guardado(h, '1128')) === 4242, 10000)), 'A) con las reglas restablecidas, Reintentar hace que el SERVIDOR reciba 4242');
      const e3 = await estado(page);
      t.ok(e3.color === 'green' && !e3.retry, 'A) el indicador vuelve a verde y desaparece Reintentar', e3);
      const w2 = await intentos(h, '1128');
      t.eq(w2.map(x => x.status), ['rejected', 'acked'], 'A) exactamente dos intentos en total: el rechazado y el manual');
      t.eq(await beforeunload(page), false, 'A) ya sin pendientes no se pide confirmación al cerrar');
      const tl = await h.leerIndicador();
      t.info('A) línea de tiempo del indicador: ' + tl.map(x => `${x.t}ms ${x.color}${x.retry ? '+Reintentar' : ''} «${x.txt.slice(0, 40)}»`).join(' → '));
    });
    await h.close();
  }

  // ============================================================ B) rechazo parcial: 1128 rechazado, 1129 aceptado
  {
    const h = await boot({ fixture: 'default', allowErrors: [/Error guardando RBD/, /Missing or insufficient permissions/, /permission-denied/] });
    const { page } = h;
    await t.escenario('B', async () => {
      const antes1128 = await guardado(h, '1128');
      await h.emu.reglas(REGLAS_SIN_ESCRITURA_EN('1128'));
      await abrirSep(h, '1128');
      await page.click(celdaIng('1128', 'ENERO')); await page.keyboard.type('111'); await page.evaluate(() => document.activeElement.blur());
      await cerrarModal(h);
      await abrirSep(h, '1129');
      await page.click(celdaIng('1129', 'ENERO')); await page.keyboard.type('222'); await page.evaluate(() => document.activeElement.blur());
      await esperar(async () => (await estado(page)).color === 'red', 15000, 50);
      await page.waitForTimeout(1500);
      const e = await estado(page);
      t.ok(e.color === 'red' && /1 cambio sin guardar/.test(e.txt) && e.retry, 'B) con un RBD rechazado y otro aceptado: rojo con "1 cambio sin guardar" (solo cuenta el rechazado)', e);
      t.eq(await guardado(h, '1129'), 222, 'B) el RBD permitido (1129) sí se guardó en el servidor');
      t.eq(await guardado(h, '1128'), antes1128, 'B) el RBD rechazado (1128) no: conserva su valor anterior');
      await h.emu.reglas(REGLAS_ABIERTAS);
      await cerrarModal(h);                                         // el modal cubre la barra de estado; se puede usar el botón del modal o cerrarlo
      if (e.retry) await page.click('#sync-retry');
      await h.esperarVerde({ timeout: 30000 }).catch(() => {});
      t.ok(!!(await esperar(async () => (await guardado(h, '1128')) === 111, 10000)), 'B) tras restablecer las reglas y Reintentar, 1128 queda guardado (111)');
      t.eq(await guardado(h, '1129'), 222, 'B) y 1129 sigue intacto');
      t.eq((await intentos(h, '1129')).length, 1, 'B) el RBD aceptado no se reenvió (un solo intento)');
    });
    await h.close();
  }

  // ============================================================ C) lectura rechazada: el listener muere con permission-denied
  {
    const h = await boot({ fixture: 'default', waitReady: false, allowErrors: [/./] });
    const { page } = h;
    await t.escenario('C', async () => {
      await h.esperarVerde({ timeout: 30000 });
      await h.emu.reglas(REGLAS_SIN_LECTURA);
      await h.recargar();                                          // nueva escucha bajo reglas que prohíben leer
      await esperar(async () => (await estado(page)).color === 'red', 20000, 50);
      const e = await estado(page);
      t.ok(e.color === 'red' && /No tienes permiso para leer los datos \(permission-denied\)/.test(e.txt), 'C) lectura rechazada: rojo "No tienes permiso para leer los datos (permission-denied)"', e);
      await h.emu.reglas(REGLAS_ABIERTAS);
    });
    await h.close();
  }

  // ============================================================ D) reglas REALES del repo + navegador sin sesión de Auth
  {
    const h = await boot({ fixture: 'default', waitReady: false, allowErrors: [/./] });
    const { page } = h;
    await t.escenario('D', async () => {
      await h.esperarVerde({ timeout: 30000 });
      await h.emu.reglas(fs.readFileSync(path.join(REPO_DIR, 'firestore.rules'), 'utf8'));
      await h.recargar();
      await esperar(async () => (await estado(page)).color === 'red', 20000, 50);
      const e = await estado(page);
      t.ok(e.color === 'red' && /permission-denied/.test(e.txt), 'D) con firestore.rules REALES y sin token de Auth (el stub no emite uno) el panel muestra rojo permission-denied al leer', e);
      t.info('D) (sirve de control: el SDK del navegador solo cumple las reglas reales con un token de Auth válido; ver spec 08 para las reglas con tokens)');
      await h.emu.reglas(REGLAS_ABIERTAS);
    });
    await h.close();
  }
});
