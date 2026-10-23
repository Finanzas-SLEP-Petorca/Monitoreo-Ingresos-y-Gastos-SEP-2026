// 11_honorarios — Honorarios (Subt. 21) por boleta en SEP (PR-1) contra el SDK REAL de Firestore + emulador.
//
// Lo que el mock modela por nuestra cuenta y aquí se prueba de verdad (rutas anidadas, merge, deleteField y datos que el servidor sí guarda):
//   H1) Alta, edición y borrado de UNA boleta desde el modal: cada acción es UN setDoc con merge:true, confirmado por el servidor, que toca solo
//       `honorarios.<id>` (más auditoría): el resto del documento del RBD y los demás documentos no cambian (updateTime intacto). El tipo se guarda como
//       CÓDIGO (BOLHE) y los montos como números. Borrar usa deleteField en esa sola boleta. Todo sobrevive a recargar (IndexedDB real).
//   H2) Dos personas, MISMO RBD: otra persona agrega una boleta con su propio id y el panel la muestra sin duplicar ni perder la suya; al editar o borrar la
//       del panel, la de la otra persona queda intacta en el servidor (el merge es por id, no por documento completo).
//   H3) Proyección por cuenta: agregar la cuenta, teclear un mes y quitarla escriben solo `hon_proyeccion.items.<cuenta>…` (quitar = deleteField de esa cuenta).
//   H4) Documentos con honorarios DAÑADOS que el servidor sí guarda (boleta nula / de texto / con monto no numérico, `honorarios` o `hon_proyeccion` del tipo
//       equivocado, proyección con una cuenta fuera del catálogo): el panel los tolera, no se pone en rojo, los demás RBD se ven idénticos y no escribe nada.
// Esperado: PASS en la PR; FALLA en @069f9dd (no existe el registro de honorarios).
import { boot, prepararServidor, cargarFixture, estado, abrirSep, cerrarModal } from '../lib/harness.mjs';
import { asegurarEmulador } from '../lib/emulator.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { filaDetalleMeses } from '../../lib/honorarios.mjs';

const esperar = async (cond, timeout = 20000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };
const clon = (o) => JSON.parse(JSON.stringify(o));
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v)); // sin depender del orden de las claves
const sinAuditoria = (d) => { const c = clon(d); delete c.lastModifiedAt; delete c.lastModifiedBy; return c; };
const sinHon = (d) => { const c = sinAuditoria(d); delete c.honorarios; delete c.hon_proyeccion; return c; };
const filaTexto = (page, rbd) => page.evaluate((r) => { const tr = document.querySelector(`#tableBody tr.rbd-row[data-rbd="${r}"]`); return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null; }, rbd);
const nFilas = (page) => page.evaluate(() => document.querySelectorAll('#tableBody tr.rbd-row').length);
const idsBoletas = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]')).map(tr => tr.dataset.honId).sort());
const hon = async (page, mes) => { const f = await filaDetalleMeses(page, 'Honorarios (Subt. 21)'); return f ? f[mes] : null; };
const FORM = '#modalBody .hon-form-grid';
const llenar = async (page, c) => {
  const sel = (f) => `${FORM} .hon-input[data-field="${f}"]`;
  if (c.codigo !== undefined) await page.selectOption(sel('codigo'), c.codigo);
  for (const [f, v] of Object.entries(c)) {
    if (f === 'codigo') continue;
    if (f === 'tipoDocumento') await page.selectOption(sel(f), v); else await page.fill(sel(f), String(v));
  }
};
const BOLETA = { codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '54', fechaDocumento: '2026-01-21', fechaPago: '2026-01-28', descripcion: 'Taller de ajedrez enero 2026', rutProveedor: '11111111-1', nombreProveedor: 'Nombre Apellido Apellido', montoGasto: '600000', montoDocumento: '600000', documentoContable: 'DC_77' };
const BOLETA_AJENA = { codigo: '410304', tipoDocumento: 'BHE', nroDocumento: '12', fechaDocumento: '2026-03-05', fechaPago: '2026-03-12', descripcion: 'Servicio de apoyo administrativo', rutProveedor: '12345678-5', nombreProveedor: 'Juan Pérez Soto', montoGasto: 300000, montoDocumento: 300000 };
const writesDe = async (h, rbd) => (await h.writes()).filter(w => w.path === `sep_carga_rbd/${rbd}`);

await correrSpec('11_honorarios', async (t) => {
  const emu = await asegurarEmulador();
  const fx = cargarFixture('default');

  // ---- referencia: el mismo panel con datos limpios (sin honorarios)
  let ref;
  {
    const h = await boot({ fixture: 'default' });
    ref = { '1129': await filaTexto(h.page, '1129'), '1130': await filaTexto(h.page, '1130') };
    await h.close();
  }

  // ============================================================ H1 + H2) una boleta: alta, edición, otra persona, borrado
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await t.escenario('H1', async () => {
      await abrirSep(h, '1121');
      const base = await emu.instantanea();
      t.eq(base['1121'].data.honorarios, undefined, 'H1) el documento 1121 del servidor no trae honorarios');
      await llenar(page, BOLETA);
      await h.clearLog();
      await page.click(`${FORM} .add-hon-btn`);
      await h.flush();
      const w = await writesDe(h, '1121');
      t.eq(w.length, 1, 'H1) agregar una boleta hace UN solo write al documento del RBD');
      t.ok(w[0] && w[0].op === 'setDoc' && w[0].options && w[0].options.merge === true && w[0].status === 'acked', 'H1) setDoc con merge:true, confirmado por el servidor', w[0] && { op: w[0].op, options: w[0].options, status: w[0].status });
      const [id] = Object.keys((w[0] || { payload: { honorarios: {} } }).payload.honorarios);
      t.eq(Object.keys(w[0].payload).sort(), ['honorarios', 'lastModifiedAt', 'lastModifiedBy', 'nombre'], 'H1) el payload lleva solo `honorarios`, el nombre y la auditoría');
      const s1 = await emu.leer('1121');
      t.eq(canon(s1.data.honorarios[id]), canon({ codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '54', fechaDocumento: '2026-01-21', fechaPago: '2026-01-28', descripcion: 'Taller de ajedrez enero 2026', rutProveedor: '11111111-1', nombreProveedor: 'Nombre Apellido Apellido', montoGasto: 600000, montoDocumento: 600000, documentoContable: 'DC_77' }), 'H1) servidor: la boleta queda con el tipo como CÓDIGO (BOLHE), los montos como números y el N° DC');
      t.eq(canon(sinHon(s1.data)), canon(sinHon(base['1121'].data)), 'H1) servidor: el resto del documento del RBD no cambió (ingresos, remuneraciones, compras…)');
      const d1 = await emu.instantanea();
      t.eq(Object.keys(d1).filter(k => k !== '1121' && d1[k].updateTime !== base[k].updateTime), [], 'H1) ningún otro documento recibió una escritura');
      t.eq(await idsBoletas(page), [id], 'H1) el registro muestra la boleta');
      t.eq(await hon(page, 'ENERO'), 600000, 'H1) la fila mensual suma la boleta en ENERO');
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'H1) el indicador queda verde', e);

      // ---- H2: otra persona agrega OTRA boleta al mismo RBD (mismo documento, distinto id)
      await emu.escribirComoOtro('1121', { honorarios: { ajena_1: BOLETA_AJENA } });
      t.ok(!!(await esperar(async () => (await idsBoletas(page)).includes('ajena_1'))), 'H2) la boleta de otra persona aparece en el registro abierto, sin recargar');
      t.eq((await idsBoletas(page)).sort(), [id, 'ajena_1'].sort(), 'H2) y la boleta propia sigue ahí (no se duplica ni se pierde)');
      t.eq(await hon(page, 'MARZO'), 300000, 'H2) la fila mensual suma también la boleta ajena (MARZO)');

      // ---- editar la propia: el write toca solo su id; la ajena queda intacta en el servidor
      await h.clearLog();
      await page.click(`#modalBody tr[data-hon-id="${id}"] .hon-edit-btn`);
      await llenar(page, { montoGasto: '650000', montoDocumento: '650000' });
      await page.click(`${FORM} .add-hon-btn`);
      await h.flush();
      const w2 = await writesDe(h, '1121');
      t.eq([w2.length, Object.keys(w2[0].payload.honorarios)], [1, [id]], 'H2) editar la boleta propia: un write que toca solo ese id');
      const s2 = await emu.leer('1121');
      t.eq([s2.data.honorarios[id].montoGasto, canon(s2.data.honorarios.ajena_1)], [650000, canon(BOLETA_AJENA)], 'H2) servidor: la boleta propia cambió y la de la otra persona quedó EXACTAMENTE igual');
      t.eq(await hon(page, 'ENERO'), 650000, 'H2) la fila mensual refleja el monto editado');

      // ---- la otra persona edita SU boleta mientras la propia no se toca
      await emu.escribirComoOtro('1121', { honorarios: { ajena_1: { montoGasto: 310000, montoDocumento: 310000 } } });
      t.ok(!!(await esperar(async () => (await hon(page, 'MARZO')) === 310000)), 'H2) un cambio ajeno en su boleta se refleja en la fila mensual');
      t.eq((await emu.leer('1121')).data.honorarios[id].montoGasto, 650000, 'H2) servidor: la boleta propia sigue en 650000');

      // ---- borrar la propia: deleteField de ese id solo
      await h.clearLog();
      await page.click(`#modalBody tr[data-hon-id="${id}"] .hon-del-btn`);
      await h.flush();
      const w3 = await writesDe(h, '1121');
      t.eq(w3.length, 1, 'H1) borrar hace UN write');
      t.eq(w3[0] && w3[0].payload.honorarios, { [id]: { __sentinel: 'deleteField' } }, 'H1) que borra solo esa boleta (deleteField)');
      t.ok(w3[0] && w3[0].options && w3[0].options.merge === true && w3[0].status === 'acked', 'H1) con merge:true, confirmado');
      const s3 = await emu.leer('1121');
      t.eq([Object.keys(s3.data.honorarios), s3.data.honorarios.ajena_1.montoGasto], [['ajena_1'], 310000], 'H1) servidor: la boleta propia ya no está y la de la otra persona sigue');
      t.eq(await idsBoletas(page), ['ajena_1'], 'H1) el registro queda con la boleta de la otra persona');
      await cerrarModal(h);
      t.ok(/\$310\.000/.test((await filaTexto(page, '1121')) || ''), 'H1) la fila de SEP muestra el Gasto Honorarios $310.000', await filaTexto(page, '1121'));
      t.eq(await nFilas(page), 55, 'H1) la tabla de SEP sigue con sus 55 filas');

      // ---- recarga (IndexedDB real): todo sigue igual
      await h.clearLog();
      await h.recargar();
      await h.esperarVerde({ timeout: 40000 });
      await abrirSep(h, '1121');
      t.eq(await idsBoletas(page), ['ajena_1'], 'H1) tras recargar el panel sigue mostrando solo la boleta restante');
      t.eq((await h.writes()).length, 0, 'H1) y recargar no escribe nada');
      await cerrarModal(h);
      await t.sinErrores(h);
    });

    // ============================================================ H3) proyección por cuenta
    await t.escenario('H3', async () => {
      await abrirSep(h, '1122');
      const antes = await emu.instantanea();
      await h.clearLog();
      await page.selectOption('#honproyAddSelect-1122', '410803');
      await page.click('#modalBody .add-honproy-btn');
      await h.flush();
      let ws = await writesDe(h, '1122');
      t.eq([ws.length, Object.keys(ws[0].payload.hon_proyeccion.items)], [1, ['410803']], 'H3) agregar la cuenta a la proyección: un write con `hon_proyeccion.items.410803`');
      await h.clearLog();
      const celda = (mes) => `#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410803"][data-mes="${mes}"]`;
      await page.fill(celda('AGOSTO'), '1.500.000');
      await h.flush();
      ws = await writesDe(h, '1122');
      t.ok(ws.length >= 1 && ws.every(x => x.options && x.options.merge === true && x.status === 'acked'), 'H3) teclear un mes: setDoc con merge:true confirmado');
      const s = await emu.leer('1122');
      t.eq([s.data.hon_proyeccion.items['410803'].meses.AGOSTO, s.data.hon_proyeccion.items['410803'].total], [1500000, 1500000], 'H3) servidor: AGOSTO = 1.500.000 y el total de la cuenta');
      t.eq(canon(sinHon(s.data)), canon(sinHon(antes['1122'].data)), 'H3) servidor: el resto del documento no cambió');
      // otra persona agrega OTRA cuenta a la proyección del mismo RBD: se mezcla por cuenta
      await emu.escribirComoOtro('1122', { hon_proyeccion: { items: { '410304': { meses: { SEPTIEMBRE: 200000 }, total: 200000 } } } });
      t.ok(!!(await esperar(async () => page.evaluate(() => !!document.querySelector('#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410304"]')))), 'H3) la cuenta que agregó otra persona aparece en la proyección');
      t.eq(await page.inputValue(celda('AGOSTO')), '1500000', 'H3) y la cuenta propia conserva su monto');
      // quitar la propia: deleteField de esa cuenta solo
      await h.clearLog();
      await page.click('#modalBody .honproy-del-btn[data-codigo="410803"]');
      await h.flush();
      ws = await writesDe(h, '1122');
      t.eq(ws[0] && ws[0].payload.hon_proyeccion, { items: { '410803': { __sentinel: 'deleteField' } } }, 'H3) quitar la cuenta: deleteField de esa cuenta solo');
      const s2 = await emu.leer('1122');
      t.eq(Object.keys(s2.data.hon_proyeccion.items), ['410304'], 'H3) servidor: queda solo la cuenta de la otra persona');
      await cerrarModal(h);
      await t.sinErrores(h);
    });
    await h.close();
  }

  // ============================================================ H4) honorarios dañados en el servidor
  {
    await prepararServidor(emu, fx);
    const bueno = { codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '1', fechaDocumento: '2026-02-10', fechaPago: '2026-02-12', descripcion: 'Boleta sana', rutProveedor: '11111111-1', nombreProveedor: 'Prestador', montoGasto: 400000, montoDocumento: 400000 };
    await emu.sembrar({
      '1122': { honorarios: { bueno, nulo: null, texto: 'no soy una boleta', numero: 42, arreglo: [1, 2], sinMonto: { ...bueno, nroDocumento: '2', montoGasto: 'abc', montoDocumento: null }, fechaRara: { ...bueno, nroDocumento: '3', fechaDocumento: 20260210, montoGasto: 70000 }, tipoRaro: { ...bueno, nroDocumento: '4', tipoDocumento: { x: 1 }, montoGasto: 90000 } } },
      '1123': { honorarios: 'esto debería ser un mapa', hon_proyeccion: { items: 5 } },
      '1125': { hon_proyeccion: { items: { '999999': { meses: { ENERO: 123456 }, total: 123456 }, '410803': { meses: { MARZO: 'texto', ABRIL: null, MAYO: 50000 }, total: 'x' } } } },
      '1128': { honorarios: [bueno], hon_proyeccion: 'texto' },
    }, { merge: true, conAuditoria: false });
    const h = await boot({ prepararServidor: false, waitReady: false });
    const { page } = h;
    await t.escenario('H4', async () => {
      const antes = await emu.instantanea();
      await h.esperarVerde({ timeout: 40000 });
      await page.waitForTimeout(1000);
      const e = await estado(page);
      t.ok(e.color === 'green' && /^Sincronizado/.test(e.txt), 'H4) el panel queda VERDE: son datos tolerados, no documentos ilegibles', e);
      t.eq(await nFilas(page), 55, 'H4) se pintan los 55 RBD');
      t.eq(await filaTexto(page, '1129'), ref['1129'], 'H4) un RBD sano (1129) se ve idéntico al panel sin honorarios');
      t.eq(await filaTexto(page, '1130'), ref['1130'], 'H4) otro RBD sano (1130) idéntico');
      await abrirSep(h, '1122');
      // febrero: la boleta sana (400.000) + la de tipo raro (90.000: el tipo solo genera un aviso, el monto sí cuenta); la de monto «abc» vale 0 y la de fecha NUMÉRICA
      // (20260210, no es texto aaaa-mm-dd) no entra en ningún mes
      const feb = await hon(page, 'FEBRERO');
      t.eq(feb, 490000, 'H4) 1122: febrero suma la boleta sana y la de tipo raro (400.000 + 90.000); la de monto «abc» vale 0 y la de fecha numérica no entra', feb);
      t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).total, 490000, 'H4) 1122: y el año completo suma lo mismo (nada se cuenta dos veces)');
      t.ok(!!(await page.evaluate(() => document.querySelector('#modalBody tr[data-hon-id="bueno"]'))), 'H4) 1122: la boleta sana está en el registro');
      t.ok(!(await page.evaluate(() => document.querySelector('#modalBody tr[data-hon-id="nulo"], #modalBody tr[data-hon-id="texto"], #modalBody tr[data-hon-id="numero"], #modalBody tr[data-hon-id="arreglo"]'))), 'H4) 1122: las entradas que no son boletas (null, texto, número, arreglo) no son filas');
      await cerrarModal(h);
      await abrirSep(h, '1123');
      t.eq(await hon(page, 'ENERO'), 0, 'H4) 1123: `honorarios` de texto y `hon_proyeccion.items` numérico se leen como vacíos');
      await cerrarModal(h);
      await abrirSep(h, '1125');
      t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="999999"]').length), 12, 'H4) 1125: una cuenta de proyección fuera del catálogo se muestra (como cualquier ítem de proyección) para poder corregirla o quitarla');
      t.eq(await page.inputValue('#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410803"][data-mes="MAYO"]'), '50000', 'H4) 1125: lo legible de una cuenta con meses dañados se conserva (MAYO = 50000)');
      t.eq(await page.inputValue('#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410803"][data-mes="MARZO"]'), '', 'H4) 1125: un mes de texto vale 0 (la celda queda vacía)');
      t.eq(await page.evaluate(() => document.getElementById('honproytotal-1125').textContent.replace(/[^\d]/g, '')), '173456', 'H4) 1125: el total se recalcula desde los meses (123456 + 50000), no del campo `total` dañado');
      await cerrarModal(h);
      t.eq((await h.writes()).length, 0, 'H4) el panel no escribió nada');
      const despues = await emu.instantanea();
      t.eq(Object.keys(antes).filter(id => antes[id].updateTime !== despues[id].updateTime), [], 'H4) ningún documento del servidor cambió (no se recrean ni se pisan)');
      t.eq(h.errors.filter(x => x.kind === 'pageerror'), [], 'H4) sin errores de página (pageerror)');
      await t.sinErrores(h);
    });
    await h.close();
  }
});
