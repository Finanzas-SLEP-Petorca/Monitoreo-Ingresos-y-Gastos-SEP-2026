// 03_offline_online — edición sin conexión y reconexión con el SDK REAL (persistencia IndexedDB + emulador).
//
// Se corta la conexión de TRES maneras distintas (cada una ejercita un camino distinto del SDK y del panel):
//   sdk        disableNetwork()/enableNetwork() (la API oficial para simular offline; navigator.onLine sigue en true)
//   navegador  context.setOffline(true/false)   (navigator.onLine=false + conexiones caídas: dispara los eventos online/offline del panel)
//   red        corte TCP real entre el navegador y el emulador (conexiones reseteadas; navigator.onLine sigue en true): lo que ve el
//              SDK cuando el servidor deja de ser alcanzable. El SDK tarda ≈30 s en declararse "sin conexión" (reintentos de WebChannel).
// En cada una: el indicador pasa a amarillo "Sin conexión…" (nunca rojo, nunca "Sincronizado" con cambios sin enviar), lo editado
// queda en la cola local del SDK (2 ediciones de la misma celda + una compra), nada llega al servidor mientras no hay red, y al volver
// el servidor recibe el ÚLTIMO valor, la compra UNA sola vez (sin duplicados ni pérdida) y el indicador vuelve a verde.
// Además (red): la cola sobrevive a una RECARGA de la página sin red (IndexedDB) y la envía el SDK al reconectar.
import { boot, abrirSep, cerrarModal, celdaIng, cargarFixture, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RBD = '1123';
const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const guardadoEnero = async (h) => { const d = await h.servidor(RBD); return d && d.data.ingreso_items && d.data.ingreso_items['Carrera Docente'] && d.data.ingreso_items['Carrera Docente'].meses.ENERO; };
async function llenarCompra(page, campos) {
  for (const [campo, valor] of Object.entries(campos)) {
    const sel = `#modalBody .compra-input[data-field="${campo}"]`;
    if (campo === 'codigo' || campo === 'tipoDocumento') await page.selectOption(sel, valor); else await page.fill(sel, String(valor));
  }
}
// Sale de la celda (guarda ya) SIN esperar la confirmación del servidor (sin red nunca llega).
const salirDeCelda = (page) => page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });

const METODOS = {
  sdk: { titulo: 'disableNetwork (SDK)', cortar: (h) => h.disableNetwork(), restablecer: (h) => h.enableNetwork(), amarillo: 5000, verde: 25000, enAmarilloSinEscribir: 'Sin conexión' },
  navegador: { titulo: 'context.setOffline (navegador)', cortar: (h) => h.setOffline(true), restablecer: (h) => h.setOffline(false), amarillo: 5000, verde: 60000, enAmarilloSinEscribir: 'Sin conexión' },
  red: { titulo: 'corte TCP al emulador (red)', cortar: async (h) => h.red.corta(), restablecer: async (h) => h.red.restablece(), amarillo: 5000, verde: 120000, enAmarilloSinEscribir: 'Sin conexión' },
};

await correrSpec('03_offline_online', async (t) => {
  const fx = cargarFixture('default');
  const nComprasFixture = Object.keys(fx[RBD].compras || {}).length;

  for (const [clave, M] of Object.entries(METODOS)) {
    const h = await boot({ fixture: 'default', allowErrors: [/./] });   // los cortes de red generan errores de consola esperados del navegador/SDK
    const { page } = h;
    await t.escenario(clave, async () => {
      await abrirSep(h, RBD);
      await h.vigilarIndicador();
      const e0 = await estado(page);
      t.ok(e0.color === 'green', `${clave}) antes del corte: verde`, e0);
      const valorAntes = await guardadoEnero(h);
      await h.clearLog();

      // ---- corte
      const tCorte = Date.now();
      await M.cortar(h);
      // ---- edición sin conexión: 2 ediciones de la misma celda + 1 compra
      await page.click(celdaIng(RBD, 'ENERO'));
      await page.keyboard.type('111'); await salirDeCelda(page);
      await page.waitForTimeout(150);
      await page.click(celdaIng(RBD, 'ENERO'));
      await page.keyboard.press('Control+A');
      await page.keyboard.type('222'); await salirDeCelda(page);
      await llenarCompra(page, { codigo: '410605', tipoDocumento: 'Factura', nroDocumento: 'OFF-1', fechaDocumento: '2026-04-10', fechaPago: '2026-04-20', descripcion: 'Compra hecha sin conexión', rutProveedor: '76.1-1', nombreProveedor: 'Proveedor offline', montoGasto: 250000, montoDocumento: 250000 });
      await page.click('#modalBody .add-compra-btn');
      await page.waitForTimeout(600);

      // ---- "Sin conexión…" amarillo (con la gracia ya vencida: el panel lleva rato abierto)
      const detectado = await esperar(async () => { const e = await estado(page); return /^Sin conexión/.test(e.txt) ? e : null; }, clave === 'red' ? 70000 : M.amarillo, 150);
      const tDeteccion = Date.now() - tCorte;
      t.ok(!!detectado && detectado.color === 'yellow' && !detectado.retry, `${clave}) sin conexión: amarillo "Sin conexión: los cambios se guardan en este navegador…" (tardó ${tDeteccion} ms) — ${M.titulo}`, detectado);
      await page.waitForTimeout(3500);
      const e1 = await estado(page);
      t.ok(e1.color === 'yellow' && /^Sin conexión/.test(e1.txt) && !e1.retry, `${clave}) 3,5 s después sigue amarillo "Sin conexión…" (ni rojo ni "Sincronizado")`, e1);
      const espejo = await page.evaluate(() => { const m = document.querySelector('#rbdModal .modal-sync'); return m ? { visible: !m.classList.contains('hidden'), txt: m.textContent } : null; });
      t.ok(espejo && espejo.visible && /Sin conexión/.test(espejo.txt), `${clave}) el aviso también se ve DENTRO del modal abierto`, espejo);
      t.eq(await page.inputValue(celdaIng(RBD, 'ENERO')), '222', `${clave}) la edición sigue en pantalla (222)`);
      const w = await h.writes();
      t.eq(w.length, 3, `${clave}) el panel envió al SDK 3 escrituras (2 ediciones de la celda + 1 compra)`);
      t.ok(w.every(x => x.status === 'pending'), `${clave}) y las 3 siguen pendientes (el SDK las retiene: ninguna se resolvió ni se rechazó)`, w.map(x => x.status));
      t.eq(await guardadoEnero(h), valorAntes, `${clave}) el SERVIDOR (emulador) no recibió nada mientras no hubo red`);
      t.eq(Object.keys((await h.servidor(RBD)).data.compras || {}).length, nComprasFixture, `${clave}) ni la compra`);
      const bu = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
      t.eq(bu, false, `${clave}) cerrar la pestaña no avisa: la cola queda en IndexedDB del navegador (persistencia activa)`);

      // ---- vuelve la red
      const tVuelta = Date.now();
      await M.restablecer(h);
      const verde = await esperar(async () => { const e = await estado(page); return e.color === 'green' ? e : null; }, M.verde, 100);
      t.ok(!!verde, `${clave}) al volver la red el indicador vuelve a verde (tardó ${Date.now() - tVuelta} ms)`, await estado(page));
      // en el instante en que el panel dice "Sincronizado", el servidor YA tiene todo
      t.eq(await guardadoEnero(h), 222, `${clave}) en cuanto dice "Sincronizado" el servidor tiene el ÚLTIMO valor (222), no el intermedio`);
      const dd = await h.servidor(RBD);
      const compras = dd.data.compras || {};
      const mias = Object.entries(compras).filter(([id, c]) => c.nroDocumento === 'OFF-1');
      t.eq(Object.keys(compras).length, nComprasFixture + 1, `${clave}) el servidor tiene exactamente UNA compra más (sin duplicados)`);
      t.eq(mias.length, 1, `${clave}) y es la hecha sin conexión`);
      t.eq(dd.data.lastModifiedBy, 'wilson.rojas@sleppetorca.gob.cl', `${clave}) con la auditoría del usuario`);
      const w2 = await h.writes();
      t.eq(w2.length, 3, `${clave}) el panel no reintentó ni duplicó escrituras (siguen siendo 3)`);
      t.ok(w2.every(x => x.status === 'acked'), `${clave}) las 3 fueron confirmadas por el servidor`, w2.map(x => x.status));
      const tl = await h.leerIndicador();
      t.ok(!tl.some(x => x.color === 'red'), `${clave}) en toda la línea de tiempo el indicador NUNCA pasó por rojo`, tl.map(x => `${x.t}ms ${x.color}: ${x.txt.slice(0, 40)}`));
      t.info(`${clave}) línea de tiempo del indicador: ` + tl.map(x => `${x.t}ms ${x.color} «${x.txt.slice(0, 32)}»`).join(' → '));
      const ev = await h.events();
      t.info(`${clave}) eventos del SDK tras el corte: ` + ev.map(e => `${e.t}ms ${e.fromCache ? 'caché' : 'srv'}${e.hasPendingWrites ? '+pend' : ''} n=${e.nCambios}`).join(', '));
    });
    await h.close();
  }

  // ============================================================ la cola sobrevive a una recarga SIN red (IndexedDB) y la envía el SDK al reconectar
  {
    const h = await boot({ fixture: 'default', allowErrors: [/./] });
    const { page } = h;
    await t.escenario('recarga', async () => {
      await abrirSep(h, RBD);
      const valorAntes = await guardadoEnero(h);
      h.red.corta();
      await page.click(celdaIng(RBD, 'ENERO'));
      await page.keyboard.type('333'); await salirDeCelda(page);
      await page.waitForTimeout(1500);                       // el SDK ya aplicó el write localmente y lo persistió en IndexedDB
      t.eq(await guardadoEnero(h), valorAntes, 'recarga) con el corte, el servidor no tiene el 333');
      await h.recargar();                                    // la página se recarga SIN red
      await h.persistencia();
      await esperar(async () => (await h.events()).length >= 1, 20000);
      const ev0 = (await h.events())[0];
      t.ok(ev0 && ev0.fromCache === true && ev0.hasPendingWrites === true, 'recarga) tras recargar, el SDK entrega el snapshot del caché CON la escritura pendiente (hasPendingWrites:true)', ev0);
      t.eq((await h.persistencia()), { ok: true }, 'recarga) la persistencia IndexedDB está activa');
      await abrirSep(h, RBD);
      t.eq(await page.inputValue(celdaIng(RBD, 'ENERO')), '333', 'recarga) el panel recargado SIN red muestra lo editado (333) desde el caché local');
      t.eq((await h.writes()).length, 0, 'recarga) el panel recargado no envió nada: la cola la conserva el SDK, no el panel');
      h.red.restablece();
      await h.esperarVerde({ timeout: 120000 });
      t.ok(!!(await esperar(async () => (await guardadoEnero(h)) === 333, 20000)), 'recarga) al volver la red el SDK envía lo pendiente de la sesión anterior: el servidor tiene 333');
      t.eq((await h.writes()).length, 0, 'recarga) y el panel nuevo sigue sin haber escrito nada (no hay duplicado)');
    });
    await h.close();
  }
});
