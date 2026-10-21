// 01_tecleo_montos — F-01 contra el SDK REAL: teclear montos en el modal SEP no se altera por los snapshots (eco propio ni ajenos).
//
// Con el SDK real, cada guardado produce DOS snapshots locales (escritura con hasPendingWrites:true y, al confirmar el servidor y
// resolver serverTimestamp(), otro con el valor definitivo) y, además, los cambios de otras personas. En 069f9dd (antes de la PR #57)
// el modal se reconstruía con innerHTML en cada uno: el <input type=number> recuperaba el foco con el cursor al INICIO y "1500000"
// tecleado con pausas > 400 ms quedaba "51". Esperado: PASS en la PR; FALLA en @069f9dd.
import { boot, abrirSep, celdaIng, celdaRem, cerrarModal } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RBD = '1122';
const TECLEADO = '1500000';
const guardadoIng = async (h, mes, item = 'Carrera Docente') => { const d = await h.servidor(RBD); return d && d.data.ingreso_items && d.data.ingreso_items[item] && (d.data.ingreso_items[item].meses || {})[mes]; };

await correrSpec('01_tecleo_montos', async (t) => {
  const h = await boot({ fixture: 'default' });
  const { page } = h;
  await abrirSep(h, RBD);
  // Marca todos los nodos del modal: si algún snapshot reemplaza el DOM, la marca desaparece.
  await page.evaluate(() => { document.querySelectorAll('#modalBody *').forEach((e, i) => { e.__marca = i + 1; }); window.__nNodos = document.querySelectorAll('#modalBody *').length; });

  // ---- A) 1500000 con pausas de 100 / 300 / 450 / 600 ms entre dígitos (las > 400 ms disparan guardado + eco ENTRE dígitos)
  for (const [pausa, mes] of [[100, 'AGOSTO'], [300, 'SEPTIEMBRE'], [450, 'OCTUBRE'], [600, 'NOVIEMBRE']]) {
    await t.escenario(`A) ${pausa} ms`, async () => {
      const sel = celdaIng(RBD, mes);
      t.eq(await page.inputValue(sel), '', `A) ${pausa} ms: la celda parte vacía`);
      await page.click(sel);
      await page.keyboard.type(TECLEADO, { delay: pausa });
      t.eq(await page.inputValue(sel), TECLEADO, `A) ${pausa} ms: con foco, el campo muestra exactamente lo tecleado`);
      await page.waitForTimeout(1200); // último guardado + su eco del servidor
      t.eq(await page.inputValue(sel), TECLEADO, `A) ${pausa} ms: tras el guardado y su eco el campo sigue igual`);
      t.ok(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), `A) ${pausa} ms: la celda conserva el foco`);
      await h.flush();
      t.eq(await guardadoIng(h, mes), 1500000, `A) ${pausa} ms: el SERVIDOR (emulador) guardó 1500000`);
      t.eq(await page.inputValue(sel), TECLEADO, `A) ${pausa} ms: tras salir de la celda sigue 1500000`);
    });
  }

  // ---- B) "1","2", pausa > 400 ms (guarda y llega el eco), "3" → 123 (antes 312)
  await t.escenario('B)', async () => {
    const sel = celdaIng(RBD, 'DICIEMBRE');
    await page.click(sel);
    await page.keyboard.type('12');
    await page.waitForTimeout(1000);
    t.eq(await page.inputValue(sel), '12', 'B) tras el eco de "12" el campo sigue en "12"');
    await page.keyboard.type('3');
    await page.waitForTimeout(1000);
    t.eq(await page.inputValue(sel), '123', 'B) "1","2", pausa, "3" deja 123 (no 312)');
    await h.flush();
    t.eq(await guardadoIng(h, 'DICIEMBRE'), 123, 'B) el servidor guardó 123');
  });

  // ---- C) OTRO cliente (SDK real de Node, otro usuario) guarda OTRAS celdas del mismo RBD mientras se teclea 1234
  for (const [pausa, mes, remoto] of [[60, 'ENERO', 777001], [200, 'FEBRERO', 777101]]) {
    await t.escenario(`C) ${pausa} ms`, async () => {
      const sel = celdaIng(RBD, mes);
      await page.click(sel);
      const tecleo = page.keyboard.type('1234', { delay: pausa });
      for (let i = 0; i < 3; i++) { await page.waitForTimeout(Math.round(pausa * 1.2)); await h.emu.escribirComoOtro(RBD, { rem: { meses: { ENERO: remoto + i } } }); }
      await tecleo;
      await page.waitForTimeout(1200);
      t.eq(await page.inputValue(sel), '1234', `C) ${pausa} ms con otra persona guardando: el campo queda en 1234`);
      await h.flush();
      t.eq(await guardadoIng(h, mes), 1234, `C) ${pausa} ms con otra persona guardando: el servidor guardó 1234`);
      t.eq(await page.inputValue(celdaRem(RBD, 'ENERO')), String(remoto + 2), `C) ${pausa} ms: el cambio de la otra persona sí aparece en SU celda`);
      const d = await h.servidor(RBD);
      t.eq(d.data.rem.meses.ENERO, remoto + 2, `C) ${pausa} ms: y el servidor conserva el valor de la otra persona (nadie pisa a nadie)`);
    });
  }

  // ---- C2) tormenta de escrituras AJENAS (≈25/s, casi todas en otros RBD) mientras se edita una celda y se sale de ella (Tab).
  //         Se mide la línea de tiempo (cada cambio del DOM con su instante) contra la bitácora del SDK real (cuándo se llamó a setDoc y
  //         cuándo el SDK reflejó la escritura LOCAL en un snapshot con hasPendingWrites):
  //           (i)  mientras lo tecleado está "pendiente" (debounce de 400 ms, aún sin enviar) NADA debe retroceder: lo cubre
  //                superponerEdicionesSinConfirmar()  -> aserción dura;
  //           (ii) entre el setDoc y el snapshot local del SDK ("en vuelo": el SDK tarda en aplicar el write local porque lo hace
  //                en su cola asíncrona con IndexedDB, detrás de los eventos remotos) la PR no superpone nada: un snapshot ajeno
  //                en esa ventana repinta el valor viejo  -> BUG REAL (ver README), se documenta con t.bug().
  // E2E_C2_INTENTOS: nº de intentos (por defecto 3; con más sube la probabilidad de ver la ventana "en vuelo")
  const CICLO = ['MAYO', 'JUNIO', 'JULIO', 'MARZO', 'ABRIL'];
  const mesesC2 = Array.from({ length: Number(process.env.E2E_C2_INTENTOS || 3) }, (_, i) => CICLO[i % CICLO.length]);
  let regresionesEnVuelo = 0, ventanasEnVuelo = [];
  // E2E_CPU_RATE=4 simula un equipo lento (CPU del navegador 4x más lenta): alarga la ventana "en vuelo". Por defecto sin límite.
  const cdp = await h.context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.E2E_CPU_RATE || 1) });
  for (let i = 0; i < mesesC2.length; i++) {
    await t.escenario(`C2.${i + 1}`, async () => {
      const mes = mesesC2[i], valor = 100 + i * 7;
      const sel = celdaIng(RBD, mes);
      const selTotal = '#modalBody #ingresoitemtotal-1122-2';
      const num = (s) => Number(String(s || '').replace(/\D/g, ''));
      const valorPrevio = Number(await page.inputValue(sel)) || 0;
      const antes = num(await page.textContent(selTotal));
      await h.clearLog();
      // muestreador propio de este intento (se detiene con su ficha: nada de bucles zombi entre intentos)
      await page.evaluate(([sel, selTotal]) => {
        const ficha = (window.__ficha = {}); window.__muestras = [];
        const ahora = () => Math.round(performance.now() - window.__fb.t0);
        const tomar = () => { const c = document.querySelector(selTotal), el = document.querySelector(sel); if (c && el) { const l = window.__muestras, u = l[l.length - 1], m = { t: ahora(), total: c.textContent, val: el.value }; if (!u || u.total !== m.total || u.val !== m.val) l.push(m); } };
        new MutationObserver(() => { if (window.__ficha === ficha) tomar(); }).observe(document.getElementById('modalBody'), { subtree: true, childList: true, characterData: true, attributes: true });
        const tick = () => { if (window.__ficha !== ficha) return; tomar(); requestAnimationFrame(tick); }; tick();
      }, [sel, selTotal]);
      await page.click(sel);
      await page.keyboard.press('Control+A');
      await page.keyboard.type(String(valor));
      let parar = false, n = 0;
      // otras personas guardando sin parar (≈ 25 escrituras/s) en OTROS RBD (y uno de vez en cuando en éste): cada una llega a este
      // cliente como un snapshot de TODA la colección
      const ajenos = ['1125', '1126', '1128', '1129', RBD];
      const tormenta = (async () => { await page.waitForTimeout(60); while (!parar) { const r = ajenos[n % ajenos.length]; await h.emu.escribirComoOtro(r, { rem: { meses: { ENERO: 900000 + n } } }); n++; } })();
      await page.keyboard.press('Tab');                  // sale de la celda: guarda ya (focusout) y deja de estar enfocada
      await page.waitForTimeout(1800);
      parar = true; await tormenta;
      await h.flush(90000);                              // bajo la tormenta el servidor puede tardar varios segundos en confirmar
      await page.waitForTimeout(500);
      const muestras = await page.evaluate(() => { window.__ficha = null; return window.__muestras; });
      const writes = await h.writes(), events = await h.events();
      const w = writes.find(x => x.payload && x.payload.ingreso_items && x.payload.ingreso_items['Carrera Docente'] && (x.payload.ingreso_items['Carrera Docente'].meses || {})[mes] === valor);
      const tSet = w ? w.t : null;
      const eLocal = w ? events.find(e => e.t >= tSet && e.hasPendingWrites) : null;
      const tLocal = eLocal ? eLocal.t : (w && w.tAck) || Infinity;
      const esperado = antes - valorPrevio + valor;
      // (i) antes del setDoc: tras teclear, el total es 'antes + valor' (o el 1.er dígito) y NUNCA vuelve a 'antes'
      const tecleado = muestras.findIndex(m => num(m.total) === esperado);
      const retrocedePend = muestras.slice(tecleado < 0 ? muestras.length : tecleado).filter(m => (tSet === null || m.t < tSet) && num(m.total) === antes);
      // (ii) entre setDoc y el snapshot local del SDK
      const retrocedeVuelo = muestras.slice(tecleado < 0 ? muestras.length : tecleado).filter(m => tSet !== null && m.t >= tSet && m.t < tLocal && num(m.total) === antes);
      t.ok(tecleado >= 0, `C2.${i + 1}) tecleado "${valor}" en ${mes}: el total de la fila llegó a ${esperado}`, muestras.slice(0, 6));
      t.eq(retrocedePend.length, 0, `C2.${i + 1}) con lo tecleado PENDIENTE (sin enviar) ningún snapshot ajeno hizo retroceder el total (${n} escrituras ajenas)`);
      const v = muestras.filter(m => (tSet === null || m.t < tSet) && tecleado >= 0 && m.val === '' && muestras.indexOf(m) > tecleado);
      t.eq(v.length, 0, `C2.${i + 1}) ... ni vació la celda editada`);
      regresionesEnVuelo += retrocedeVuelo.length;
      ventanasEnVuelo.push({ mes, setDoc_t: tSet, snapshotLocal_t: eLocal ? eLocal.t : null, ack_t: w && w.tAck, ventanaMs: eLocal && tSet !== null ? eLocal.t - tSet : null, regresiones: retrocedeVuelo.length, escriturasAjenas: n });
      const d = await h.servidor(RBD);
      t.eq(d.data.ingreso_items['Carrera Docente'].meses[mes], valor, `C2.${i + 1}) el servidor terminó con ${valor} en ${mes}`);
      t.eq(await page.inputValue(sel), String(valor), `C2.${i + 1}) y la celda terminó mostrando ${valor}`);
    });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  t.info('ventana "en vuelo" (setDoc -> snapshot local del SDK) y regresiones: ' + JSON.stringify(ventanasEnVuelo));
  t.bug('edicion-en-vuelo-retrocede', `entre setDoc y el snapshot local del SDK, un snapshot ajeno repinta el valor ANTERIOR (${regresionesEnVuelo} muestras del DOM con el total viejo en ${mesesC2.length} intentos)`, regresionesEnVuelo > 0);

  // ---- D) ningún nodo del modal fue reemplazado por los decenas de snapshots (eco propio + ajenos)
  await t.escenario('D)', async () => {
    const r = await page.evaluate(() => { const todos = Array.from(document.querySelectorAll('#modalBody *')); return { vivos: todos.filter(e => e.__marca).length, inicial: window.__nNodos, ahora: todos.length }; });
    t.ok(r.vivos === r.inicial && r.ahora === r.inicial, 'D) tras decenas de snapshots reales ningún nodo del modal fue reemplazado (reconciliación en sitio)', r);
  });

  await cerrarModal(h);
  await t.sinErrores(h);
  await h.close();
});
