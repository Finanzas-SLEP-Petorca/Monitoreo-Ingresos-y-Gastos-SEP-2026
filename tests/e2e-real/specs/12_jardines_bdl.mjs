// 12_jardines_bdl — «ajustes de fuentes» contra el SDK REAL de Firestore + emulador: (1) los jardines (GESPARVU) también son entidades de FAEP y FIGA y (2) JUNJI tiene la línea BDL
// («Ingreso Bono Desempeño Laboral», `ingreso_bdl`).
//
//   J1) Escribir FAEP de un jardín y el BDL de su JUNJI son DOS setDoc con merge:true confirmados que tocan solo `otras_fuentes.faep…` y `otras_fuentes.junji.ingreso_bdl…`: el documento del jardín
//       ya traía `otras_fuentes.junji` y `otras_fuentes.aporte_junji` y NADA se pisa (merge por clave: el resto de las líneas de JUNJI, Aporte JUNJI y los demás documentos quedan idénticos, updateTime
//       intacto). Otra persona escribe OTRO mes de FAEP en el mismo jardín: el panel lo muestra y el servidor conserva ambos. Todo sobrevive a recargar (IndexedDB real) y recargar no escribe.
//   J2) Documentos de jardines con un `ingreso_bdl` DAÑADO que el servidor sí guarda (texto, nulo, arreglo, `meses` de texto, meses con basura): el panel los tolera (verde, 13 jardines, el resto de las
//       líneas intactas, lo numérico se conserva), no escribe nada y ningún documento cambia (updateTime). Un documento sin `ingreso_bdl` (todos los de default) se lee como ceros sin escribir.
//   J3) Los documentos de los jardines NO se siembran: con los 13 documentos ausentes del servidor FAEP los lista igual (en $0), el panel no crea nada, y al editar uno se crea con merge.
// Esperado: PASS en la PR; FALLA en @ff7a666 (FAEP/FIGA sin jardines y JUNJI sin BDL).
import { boot, prepararServidor, cargarFixture, estado, clickTab, cerrarModal } from '../lib/harness.mjs';
import { asegurarEmulador } from '../lib/emulator.mjs';
import { correrSpec } from '../lib/spec.mjs';

const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const clon = (o) => JSON.parse(JSON.stringify(o));
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v)); // sin depender del orden de las claves
const GESPARVU = ['5402002', '5402004', '5401006', '5401007', '5401005', '5401004', '5401003', '5401002', '5403002', '5403001', '5404001', '5404003', '5404002'];
const writesDe = async (h, id) => (await h.writes()).filter(w => w.path === `sep_carga_rbd/${id}`);
const filasIds = (page, key) => page.evaluate((k) => Array.from(document.querySelectorAll(`#otrasFuentesTbody-${k} tr[data-rbd]`)).map(tr => tr.dataset.rbd), key);
const filaTexto = (page, key, id) => page.evaluate(([k, r]) => { const tr = document.querySelector(`#otrasFuentesTbody-${k} tr[data-rbd="${r}"]`); return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null; }, [key, id]);
async function abrirFuente(h, key, id) {
  await clickTab(h.page, 'of-' + key);
  await h.page.click(`#otrasFuentesTbody-${key} td[data-abrir-otra-fuente="${id}"]`);
  await h.page.waitForSelector('#otrasFuentesModal:not(.hidden)');
  await h.page.waitForTimeout(150);
}
const celda = (id, fuente, modo, mes) => `#otrasFuentesModalBody input.celda-input[data-rbd="${id}"][data-fuente="${fuente}"][data-modo="${modo}"][data-mes="${mes}"]`;

await correrSpec('12_jardines_bdl', async (t) => {
  const emu = await asegurarEmulador();
  const fx = cargarFixture('default');

  // ============================================================ J1) FAEP de un jardín + BDL de JUNJI: merge por clave, sin pisar nada
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await t.escenario('J1', async () => {
      const base = await emu.instantanea();
      const j0 = clon(base['5402002'].data.otras_fuentes);
      t.ok(j0.junji && j0.aporte_junji && !j0.faep, 'J1) el documento 5402002 del servidor trae junji y aporte_junji, y todavía no faep', Object.keys(j0));
      await clickTab(page, 'of-faep');
      t.eq((await filasIds(page, 'faep')).length, 69, 'J1) la pestaña FAEP lista 69 entidades (55 RBD + AC + 13 jardines)');
      t.eq((await filasIds(page, 'faep')).slice(56), GESPARVU, 'J1) los 13 jardines al final, en el orden de JUNJI');
      await clickTab(page, 'of-figa');
      t.eq((await filasIds(page, 'figa')).length, 69, 'J1) FIGA también lista 69 entidades');
      t.eq((await h.writes()).length, 0, 'J1) abrir el panel no escribe nada');

      // ---- FAEP del jardín
      await abrirFuente(h, 'faep', '5402002');
      await h.clearLog();
      await page.fill(celda('5402002', 'faep', 'of_ingreso', 'ENERO'), '1357');
      await h.flush();
      const w = await writesDe(h, '5402002');
      t.eq(w.length, 1, 'J1) editar una celda de FAEP en el jardín = UN write a su documento');
      t.ok(w[0] && w[0].op === 'setDoc' && w[0].options && w[0].options.merge === true && w[0].status === 'acked', 'J1) setDoc con merge:true, confirmado por el servidor', w[0] && { op: w[0].op, options: w[0].options, status: w[0].status });
      t.eq(w[0] && Object.keys(w[0].payload.otras_fuentes), ['faep'], 'J1) el payload toca solo otras_fuentes.faep (nada de junji ni aporte_junji)');
      t.eq(w[0] && Object.keys(w[0].payload).sort(), ['lastModifiedAt', 'lastModifiedBy', 'nombre', 'otras_fuentes'], 'J1) y lleva solo el nombre y la auditoría además');
      const s1 = await emu.leer('5402002');
      t.eq(s1.data.otras_fuentes.faep.ingreso.meses.ENERO, 1357, 'J1) servidor: FAEP ENERO = 1357');
      t.eq([canon(s1.data.otras_fuentes.junji), canon(s1.data.otras_fuentes.aporte_junji)], [canon(j0.junji), canon(j0.aporte_junji)], 'J1) servidor: JUNJI y Aporte JUNJI del mismo documento quedan EXACTAMENTE iguales');
      const d1 = await emu.instantanea();
      t.eq(Object.keys(d1).filter(k => k !== '5402002' && d1[k].updateTime !== base[k].updateTime), [], 'J1) ningún otro documento recibió una escritura');
      await cerrarModal(h);

      // ---- BDL de JUNJI del mismo jardín
      await abrirFuente(h, 'junji', '5402002');
      t.eq(await page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_bdl').textContent.trim()), '$0', 'J1) el modal de JUNJI muestra la línea BDL en $0 (el documento no trae ingreso_bdl)');
      await h.clearLog();
      await page.fill(celda('5402002', 'junji', 'of_ingreso_bdl', 'DICIEMBRE'), '2468');
      await h.flush();
      const w2 = await writesDe(h, '5402002');
      t.eq(w2.length, 1, 'J1) editar el BDL = UN write');
      t.ok(w2[0] && w2[0].options && w2[0].options.merge === true && w2[0].status === 'acked', 'J1) con merge:true, confirmado');
      t.eq(w2[0] && w2[0].payload.otras_fuentes, { junji: { ingreso_bdl: { meses: { DICIEMBRE: 2468 }, total: 2468 } } }, 'J1) el payload es SOLO otras_fuentes.junji.ingreso_bdl del mes editado');
      const s2 = await emu.leer('5402002');
      const sinBdl = clon(s2.data.otras_fuentes.junji); delete sinBdl.ingreso_bdl;
      t.eq(canon(sinBdl), canon(j0.junji), 'J1) servidor: las demás líneas de JUNJI (Operación, Homologación, Carrera Docente, Rem., B&S, corte) quedan EXACTAMENTE iguales');
      t.eq([s2.data.otras_fuentes.junji.ingreso_bdl.meses.DICIEMBRE, s2.data.otras_fuentes.junji.ingreso_bdl.total, s2.data.otras_fuentes.faep.ingreso.meses.ENERO], [2468, 2468, 1357], 'J1) servidor: BDL guardado y el FAEP de antes sigue ahí (conviven en el documento)');
      t.eq(canon(s2.data.otras_fuentes.aporte_junji), canon(j0.aporte_junji), 'J1) servidor: Aporte JUNJI intacto');
      await cerrarModal(h);

      // ---- otra persona escribe OTRO mes de FAEP en el mismo jardín (merge anidado de verdad)
      await abrirFuente(h, 'faep', '5402002');
      await emu.escribirComoOtro('5402002', { otras_fuentes: { faep: { ingreso: { meses: { FEBRERO: 999 } } } } });
      t.ok(!!(await esperar(async () => (await page.inputValue(celda('5402002', 'faep', 'of_ingreso', 'FEBRERO'))) === '999')), 'J1) el mes que escribió otra persona aparece en el modal abierto, sin recargar');
      t.eq(await page.inputValue(celda('5402002', 'faep', 'of_ingreso', 'ENERO')), '1357', 'J1) y el mes propio conserva su valor');
      const s3 = await emu.leer('5402002');
      t.eq([s3.data.otras_fuentes.faep.ingreso.meses.ENERO, s3.data.otras_fuentes.faep.ingreso.meses.FEBRERO, s3.data.otras_fuentes.junji.ingreso_bdl.meses.DICIEMBRE], [1357, 999, 2468], 'J1) servidor: ENERO (panel), FEBRERO (otra persona) y el BDL conviven');
      await cerrarModal(h);

      // ---- recarga (IndexedDB real): todo sigue igual y no escribe
      await h.clearLog();
      await h.recargar();
      await h.esperarVerde({ timeout: 40000 });
      await abrirFuente(h, 'faep', '5402002');
      t.eq([await page.inputValue(celda('5402002', 'faep', 'of_ingreso', 'ENERO')), await page.inputValue(celda('5402002', 'faep', 'of_ingreso', 'FEBRERO'))], ['1357', '999'], 'J1) tras recargar el panel sigue mostrando el FAEP del jardín');
      await cerrarModal(h);
      t.eq((await h.writes()).length, 0, 'J1) y recargar no escribe nada');
      t.eq((await filasIds(page, 'faep')).length, 69, 'J1) FAEP sigue con 69 filas');
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'J1) el indicador queda verde', e);
      await t.sinErrores(h);
    });
    await h.close();
  }

  // ============================================================ J2) ingreso_bdl DAÑADO en el servidor
  {
    await prepararServidor(emu, fx);
    // referencia: JUNJI de un jardín sano con los datos del fixture
    const bdlSano = { meses: { ENERO: 50000, FEBRERO: 50000 }, total: 100000 };
    await emu.sembrar({
      '5402002': { otras_fuentes: { junji: { ingreso_bdl: 'texto' } } },
      '5402004': { otras_fuentes: { junji: { ingreso_bdl: null } } },
      '5401006': { otras_fuentes: { junji: { ingreso_bdl: [1, 2, 3] } } },
      '5401007': { otras_fuentes: { junji: { ingreso_bdl: { meses: 'x', total: 'y' } } } },
      '5403001': { otras_fuentes: { junji: { ingreso_bdl: { meses: { ENERO: 'abc', FEBRERO: null, MARZO: '1000', ABRIL: 5, MAYO: true }, total: 'basura' } } } },
      '5403002': { otras_fuentes: { junji: { ingreso_bdl: 12345 } } },
      '5401004': { otras_fuentes: { junji: { ingreso_bdl: bdlSano } } },
    }, { merge: true, conAuditoria: false });
    const h = await boot({ prepararServidor: false, waitReady: false });
    const { page } = h;
    await t.escenario('J2', async () => {
      const antes = await emu.instantanea();
      await h.esperarVerde({ timeout: 40000 });
      await page.waitForTimeout(1000);
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'J2) el panel queda VERDE: son datos tolerados, no documentos ilegibles', e);
      await clickTab(page, 'of-junji');
      t.eq((await filasIds(page, 'junji')).length, 13, 'J2) JUNJI lista los 13 jardines');
      // un jardín con ingreso_bdl = "texto": su fila es la de siempre (BDL = 0), con sus otras líneas
      await abrirFuente(h, 'junji', '5402002');
      t.eq(await page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_bdl').textContent.trim()), '$0', 'J2) 5402002 (ingreso_bdl = "texto"): la línea BDL queda en $0');
      const op = await page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_operacion').textContent.trim());
      t.ok(/^\$[\d.]+$/.test(op) && op !== '$0', 'J2) …y sus otras líneas se leen normal (Operación ' + op + ')');
      await cerrarModal(h);
      await abrirFuente(h, 'junji', '5403001');
      t.eq([await page.inputValue(celda('5403001', 'junji', 'of_ingreso_bdl', 'MARZO')), await page.inputValue(celda('5403001', 'junji', 'of_ingreso_bdl', 'ABRIL')), await page.inputValue(celda('5403001', 'junji', 'of_ingreso_bdl', 'ENERO'))], ['1000', '5', ''], 'J2) 5403001 (meses sucios): lo numérico se conserva («1000» → 1000, 5) y el texto vale 0');
      t.eq(await page.evaluate(() => document.getElementById('oftotal-5403001-junji-of_ingreso_bdl').textContent.trim()), '$1.005', 'J2) …y el total se recalcula desde los meses ($1.005), no del campo `total` dañado');
      await cerrarModal(h);
      await abrirFuente(h, 'junji', '5401004');
      t.eq(await page.evaluate(() => document.getElementById('oftotal-5401004-junji-of_ingreso_bdl').textContent.trim()), '$100.000', 'J2) un jardín sano con BDL sigue mostrándolo ($100.000)');
      await cerrarModal(h);
      // los jardines sin ingreso_bdl (todos los del fixture default) y FAEP/FIGA con jardines sin datos
      t.ok(/SUPERÁVIT|DÉFICIT/.test((await filaTexto(page, 'junji', '5402004')) || ''), 'J2) 5402004 (ingreso_bdl nulo): su fila se pinta con su Estado', await filaTexto(page, 'junji', '5402004'));
      await clickTab(page, 'of-faep');
      t.eq((await filasIds(page, 'faep')).length, 69, 'J2) FAEP sigue con 69 entidades');
      t.eq((await h.writes()).length, 0, 'J2) el panel no escribió nada (no «arregla» solo los documentos dañados)');
      const despues = await emu.instantanea();
      t.eq(Object.keys(antes).filter(id => antes[id].updateTime !== despues[id].updateTime), [], 'J2) ningún documento del servidor cambió (updateTime intacto)');
      t.eq(h.errors.filter(x => x.kind === 'pageerror'), [], 'J2) sin errores de página (pageerror)');
      await t.sinErrores(h);
    });
    await h.close();
  }

  // ============================================================ J3) los documentos de los jardines no se siembran
  {
    const docs = clon(fx);
    GESPARVU.forEach(id => { delete docs[id]; });
    await prepararServidor(emu, docs);
    const h = await boot({ prepararServidor: false });
    const { page } = h;
    await t.escenario('J3', async () => {
      await clickTab(page, 'of-faep');
      t.eq((await filasIds(page, 'faep')).slice(56), GESPARVU, 'J3) sin los documentos de los jardines, FAEP igual los lista (en $0)');
      await page.waitForTimeout(800);
      t.eq((await h.writes()).length, 0, 'J3) el panel no sembró ni creó ningún documento');
      const s = await emu.instantanea();
      t.eq(GESPARVU.filter(id => s[id]), [], 'J3) servidor: los 13 documentos de jardines siguen sin existir');
      await abrirFuente(h, 'faep', '5402002');
      await h.clearLog();
      await page.fill(celda('5402002', 'faep', 'of_ingreso', 'ENERO'), '5000');
      await h.flush();
      const w = await writesDe(h, '5402002');
      t.ok(w.length === 1 && w[0].options && w[0].options.merge === true && w[0].status === 'acked', 'J3) editar un jardín cuyo documento no existe: un setDoc con merge:true confirmado', w[0] && { op: w[0].op, options: w[0].options, status: w[0].status });
      const d = await emu.leer('5402002');
      t.eq([d.data && d.data.nombre, d.data && d.data.otras_fuentes.faep.ingreso.meses.ENERO], ['RINCONCITO', 5000], 'J3) el documento se crea con su nombre y el FAEP editado');
      await cerrarModal(h);
      await t.sinErrores(h);
    });
    await h.close();
  }
});
