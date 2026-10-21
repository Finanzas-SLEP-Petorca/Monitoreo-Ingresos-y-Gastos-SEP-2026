// 07_documento_envenenado — PR #56 (documentos dañados) contra datos REALES de Firestore (el servidor sí guarda lo que un mock descartaría:
// tipos mezclados, mapas con claves raras, números enormes). Se siembran con un cliente Node del SDK real, ANTES de abrir el panel.
//
//   P1) Los dos documentos de la consigna: rem.meses.ENERO = "1000" (texto) en 1121 e ingreso_items:{x:null} en 1122. El panel los TOLERA
//       (num() convierte "1000" y objetoPlano()/filtros ignoran el nulo): se pintan los 55 RBD, se lee 1000, nada se reescribe. NO hay rojo:
//       no son documentos "inválidos" para el panel (el rojo solo aparece cuando la lectura del documento LANZA, ver P2).
//   P2) Documentos que SÍ no se pueden leer (lastModifiedAt = mapa con un campo "toDate" que no es función): el estado queda ROJO nombrando
//       exactamente esos documentos, el resto del panel se pinta idéntico, no se escribe nada, y al repararlos vuelve el verde.
//   P3) BUG REAL: un monto finito enorme (≥ ~1e17, p. ej. 1e20 editado a mano) hace que renderEjecucion/ejecucionChartSVG lance
//       "RangeError: Invalid array length" FUERA del try/catch por documento: aplicarSnapshot se aborta a medias y el indicador
//       queda VERDE "Sincronizado" (o pierde el rojo de P2).
import { boot, prepararServidor, cargarFixture, estado, abrirSep, celdaRem, cerrarModal } from '../lib/harness.mjs';
import { asegurarEmulador } from '../lib/emulator.mjs';
import { correrSpec } from '../lib/spec.mjs';

const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const filaTexto = (page, rbd) => page.evaluate((r) => { const tr = document.querySelector(`#tableBody tr.rbd-row[data-rbd="${r}"]`); return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null; }, rbd);
const nFilas = (page) => page.evaluate(() => document.querySelectorAll('#tableBody tr.rbd-row').length);

await correrSpec('07_documento_envenenado', async (t) => {
  const emu = await asegurarEmulador();
  const fx = cargarFixture('default');

  // ---- referencia: el mismo panel con datos limpios
  let ref;
  {
    const h = await boot({ fixture: 'default' });
    ref = { '1129': await filaTexto(h.page, '1129'), '1130': await filaTexto(h.page, '1130'), '1125': await filaTexto(h.page, '1125') };
    await h.close();
  }
  const abrirConVeneno = async (veneno, opts = {}) => {
    await prepararServidor(emu, fx);
    await emu.sembrar(veneno, { merge: true, conAuditoria: false });
    return boot({ prepararServidor: false, waitReady: false, allowErrors: opts.allowErrors || [] });
  };

  // ============================================================ P1) los dos documentos de la consigna
  {
    const h = await abrirConVeneno({ '1121': { rem: { meses: { ENERO: '1000' } } }, '1122': { ingreso_items: { x: null } } });
    await t.escenario('P1', async () => {
      const antes = await emu.instantanea();
      t.eq(typeof (await h.servidor('1121')).data.rem.meses.ENERO, 'string', 'P1) el servidor guarda ENERO de 1121 como TEXTO "1000"');
      t.eq((await h.servidor('1122')).data.ingreso_items.x, null, 'P1) y 1122 tiene ingreso_items.x = null');
      await h.esperarVerde({ timeout: 30000 });
      await h.page.waitForTimeout(1000);
      t.eq(await nFilas(h.page), 55, 'P1) el resto del panel se pinta completo: 55 filas en la tabla SEP');
      t.eq(await filaTexto(h.page, '1129'), ref['1129'], 'P1) un RBD sano (1129) se ve idéntico al panel con datos limpios');
      await abrirSep(h, '1121');
      t.eq(await h.page.inputValue(celdaRem('1121', 'ENERO')), '1000', 'P1) 1121: el texto "1000" se lee como 1000');
      await cerrarModal(h);
      await abrirSep(h, '1122');
      const filasIng = await h.page.evaluate(() => Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="ingreso_item"]')).map(i => i.dataset.item).filter((v, i, a) => a.indexOf(v) === i));
      t.ok(!filasIng.includes('x'), '1122: el ítem nulo (x:null) se ignora (no aparece como fila)', filasIng);
      await cerrarModal(h);
      const e = await estado(h.page);
      t.ok(e.color === 'green', 'P1) estado VERDE: son documentos tolerados, no inválidos (NO hay rojo para estos dos casos)', e);
      t.eq((await h.writes()).length, 0, 'P1) el panel no escribió nada');
      const despues = await emu.instantanea();
      t.eq(Object.keys(antes).filter(id => antes[id].updateTime !== despues[id].updateTime), [], 'P1) ningún documento del servidor cambió (no se recrean ni se pisan)');
      await t.sinErrores(h);
    });
    await h.close();
  }

  // ============================================================ P2) documentos que NO se pueden leer -> rojo nombrándolos
  {
    const h = await abrirConVeneno({ '1123': { lastModifiedAt: { toDate: 'x' } }, '1125': { lastModifiedAt: { toDate: 5 } } }, { allowErrors: [/Documento con datos inválidos/] });
    await t.escenario('P2', async () => {
      const antes = await emu.instantanea();
      await h.page.waitForFunction(() => /Documentos?/.test(document.getElementById('sync-text').textContent), null, { timeout: 30000, polling: 50 });
      await h.page.waitForTimeout(800);
      const e = await estado(h.page);
      t.ok(e.color === 'red' && /Documentos con datos inválidos \(1123, 1125\)/.test(e.txt), 'P2) estado ROJO que nombra exactamente los documentos omitidos (1123, 1125)', e);
      t.eq(await nFilas(h.page), 55, 'P2) el resto del panel se pinta completo: 55 filas');
      t.eq(await filaTexto(h.page, '1129'), ref['1129'], 'P2) un RBD sano (1129) idéntico al panel con datos limpios');
      t.eq(await filaTexto(h.page, '1130'), ref['1130'], 'P2) otro RBD sano (1130) idéntico');
      t.ok((await filaTexto(h.page, '1123')) !== null, 'P2) la fila del RBD omitido (1123) sigue en la tabla (sin sus datos)');
      t.eq((await h.writes()).length, 0, 'P2) el panel no escribió nada: los documentos dañados no se recrean ni se pisan');
      const despues = await emu.instantanea();
      t.eq(Object.keys(antes).filter(id => antes[id].updateTime !== despues[id].updateTime), [], 'P2) el servidor quedó intacto (ningún updateTime cambió)');
      t.eq(h.errors.filter(x => x.kind === 'pageerror'), [], 'P2) sin errores de página (pageerror)');
      // se reparan en el servidor (otra persona/admin): vuelve el verde y el RBD aparece con sus datos
      await emu.sembrar({ '1123': { lastModifiedAt: new Date(Date.now()) }, '1125': { lastModifiedAt: new Date(Date.now()) } }, { merge: true, conAuditoria: false });
      t.ok(!!(await esperar(async () => (await estado(h.page)).color === 'green', 15000)), 'P2) al reparar los documentos en el servidor, el estado vuelve a verde');
      t.eq(await filaTexto(h.page, '1125'), ref['1125'].replace(/\s+/g, ' '), 'P2) y el RBD 1125 reparado se ve igual que con datos limpios');
    });
    await h.close();
  }

  // ============================================================ P3) número enorme en un documento: rompe el render fuera del try/catch por documento
  {
    const h = await abrirConVeneno({ '1131': { rem: { meses: { ENERO: 1e20 } } } }, { allowErrors: [/Invalid array length/, /Invalid string length/] });
    let roto = false, verde = false, detalle = {};
    await t.escenario('P3', async () => {
      await h.page.waitForFunction(() => window.__fb && window.__fb.events.length >= 1, null, { timeout: 90000 });
      await h.page.waitForTimeout(4000);
      const errs = [...(await h.erroresEnPagina()), ...[...h.errors, ...h.permitidos].filter(x => x.kind === 'pageerror').map(x => x.text)];
      const e = await estado(h.page);
      roto = errs.some(x => /Invalid (array|string) length/.test(x));
      verde = e.color === 'green';
      detalle = { errores: [...new Set(errs)], estado: e, filas: await nFilas(h.page), bloqueosMs: await h.tareasLargas() };
      t.info('P3) rem.meses.ENERO = 1e20 en 1131 → ' + JSON.stringify(detalle));
      t.eq(await nFilas(h.page), 55, 'P3) la tabla SEP sí se alcanza a pintar (55 filas): el error ocurre después, al dibujar el gráfico de % Ejecución');
    });
    await h.close();
    // combinado con un documento ilegible: se pierde el rojo
    const h2 = await abrirConVeneno({ '1123': { lastModifiedAt: { toDate: 'x' } }, '1131': { rem: { meses: { ENERO: 1e20 } } } }, { allowErrors: [/Invalid array length/, /Invalid string length/, /Documento con datos inválidos/] });
    let pierdeRojo = false;
    await t.escenario('P3b', async () => {
      await h2.page.waitForFunction(() => window.__fb && window.__fb.events.length >= 1, null, { timeout: 90000 });
      await h2.page.waitForTimeout(4000);
      const e = await estado(h2.page);
      pierdeRojo = e.color !== 'red';
      t.info('P3b) 1123 ilegible + 1131 con 1e20 → estado: ' + JSON.stringify(e));
    });
    await h2.close();
    t.bug('numero-enorme-rompe-aplicarSnapshot', `un monto finito enorme (1e20) en un documento lanza "RangeError: Invalid array length" en ejecucionChartSVG (yTicks.push en un bucle de yMax/25 pasos), fuera del try/catch por documento: aplicarSnapshot se aborta a medias (no se pintan fuentes, dashboard ni visualizador) y el indicador queda ${verde ? 'VERDE "Sincronizado" (sin "última edición")' : 'sin avisar'}${pierdeRojo ? '; combinado con un documento ilegible (1123) tampoco queda el rojo que lo nombra' : ''}`, roto);
  }

  // ============================================================ P4) montos enormes: el panel acepta hasta MONTO_ABS_MAX (1e13) y rechaza 15 dígitos; el gráfico no debe congelar el navegador de todos
  {
    const h = await boot({ fixture: 'default', allowErrors: [/Invalid array length/, /Invalid string length/] });
    let bloqueoMax = 0, bloqueos = [];
    await t.escenario('P4', async () => {
      await abrirSep(h, '1131');
      const sel = celdaRem('1131', 'ENERO');
      await h.page.click(sel, { clickCount: 3 });                  // selecciona el valor actual
      await h.limpiarTareasLargas();
      await h.page.keyboard.type('9999999999999');                 // 13 dígitos: < 1e13 (MONTO_ABS_MAX), el panel lo acepta como válido
      await h.page.evaluate(() => document.activeElement.blur());
      const t0 = Date.now();
      await h.page.evaluate(() => 1);                              // vuelve cuando el hilo principal responde de nuevo
      const esperaMs = Date.now() - t0;
      await h.page.waitForTimeout(500);
      await h.esperarEscriturasListas(120000).catch(() => {});
      await h.page.evaluate(() => 1);
      bloqueos = await h.tareasLargas();
      bloqueoMax = Math.max(0, ...bloqueos);
      t.info(`P4) tecleando 9999999999999 en remuneraciones: el hilo principal se bloqueó ${JSON.stringify(bloqueos)} ms (la página tardó ${esperaMs} ms en volver a responder)`);
      t.eq((await h.servidor('1131')).data.rem.meses.ENERO, 9999999999999, 'P4) el panel guardó 9999999999999 (lo acepta: es < 1e13)');
      // 15 dígitos (antes lo aceptaba, y congelaba el panel de todos): ahora se rechaza al teclear y no se guarda
      await h.page.click(sel, { clickCount: 3 });
      await h.page.keyboard.type('999999999999999');
      await h.page.evaluate(() => document.activeElement.blur());
      await h.page.waitForTimeout(1500);
      await h.esperarEscriturasListas(60000).catch(() => {});
      t.eq((await h.servidor('1131')).data.rem.meses.ENERO, 9999999999999, 'P4) 999999999999999 se rechaza (MONTO_ABS_MAX = 1e13): el servidor conserva 9999999999999');
    });
    await h.close();
    t.bug('monto-15-digitos-congela-el-panel', `un monto de 15 dígitos (aceptado por MONTO_ABS_MAX=1e15) bloquea el hilo principal ${Math.round(bloqueoMax / 1000)} s en CADA repintado de CADA navegador (bucle yTicks.push(v+=25) de ejecucionChartSVG con yMax enorme); bloqueos: ${JSON.stringify(bloqueos)} ms`, bloqueoMax > 5000);
  }
});
