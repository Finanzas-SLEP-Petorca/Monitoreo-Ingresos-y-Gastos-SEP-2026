// modal_fuentes_remoto — F-12 (auditoría): el modal de una entidad de una fuente (Otras Fuentes) debe seguir los cambios
// REMOTOS igual que el modal SEP.
//
// Antes el modal de fuentes no se re-renderizaba ante snapshots remotos: quedaba obsoleto (el cambio de otra persona no se
// veía) y, tras un borrado remoto, la fila borrada seguía ahí y al teclear en ella el panel recreaba el ítem ("resucitaba").
// Ahora el modal se reconcilia con cada snapshot (sin pisar la celda con foco, ni el formulario de compra / concepto, ni
// el scroll) y refleja cambios y borrados remotos. Y no se rompe lo que ya funcionaba: el eco propio no reconstruye el modal
// y teclear sigue siendo estable.
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const MODAL = '#otrasFuentesModalBody';
const celda = (fuente, rbd, modo, mes, extra = '') => `${MODAL} input.celda-input[data-rbd="${rbd}"][data-fuente="${fuente}"][data-modo="${modo}"][data-mes="${mes}"]${extra}`;
const docRbd = async (h, rbd) => (await h.store())[`sep_carga_rbd/${rbd}`];
async function abrir(h, fuente, rbd) {
  await clickTab(h.page, 'of-' + fuente);
  await h.page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${rbd}"]`);
  await h.waitIdle();
}
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 3).join(' | ')); }
}

await correrSpec('modal_fuentes_remoto', async (t) => {
  const h = await boot({ fixture: 'default' });
  const { page } = h;

  // ======================================================================== General (compras + proyección B&S)
  await abrir(h, 'general', '1121');
  await page.evaluate(() => { document.querySelectorAll('#otrasFuentesModalBody *').forEach((e, i) => { e.__marca = i + 1; }); window.__nNodosOF = document.querySelectorAll('#otrasFuentesModalBody *').length; });

  await escenario(t, 'M1', async () => {
    const sel = celda('general', '1121', 'of_gasto_rem', 'ENERO');
    const antes = await page.inputValue(sel);
    const subtituloAntes = await page.textContent('#otrasFuentesModalSubtitle');
    const totalAntes = await page.textContent(`${MODAL} #oftotal-1121-general-of_gasto_rem`);
    await h.remoto('1121', 'd.otras_fuentes.general.gasto_rem.meses.ENERO = 9876543');
    await h.waitIdle();
    t.eq(await page.inputValue(sel), '9876543', `M1) un cambio remoto se ve en el modal abierto sin cerrarlo (antes: "${antes}")`);
    t.ok((await page.textContent('#otrasFuentesModalSubtitle')) !== subtituloAntes, 'M1) y los totales del encabezado del modal se actualizan', subtituloAntes);
    t.ok((await page.textContent(`${MODAL} #oftotal-1121-general-of_gasto_rem`)) !== totalAntes, 'M1) y el total de la fila también', totalAntes);
  });

  await escenario(t, 'M2', async () => {
    const filas = () => page.locator(`${MODAL} tr[data-compra-id]`).count();
    const n0 = await filas();
    await h.remoto('1121', `const c = d.otras_fuentes.general.compras; const base = Object.values(c)[0]; c.cRemota1 = Object.assign({}, base, { descripcion: 'Compra agregada por otra persona', montoGasto: 12345, montoDocumento: 12345 });`);
    await h.waitIdle();
    t.eq(await filas(), n0 + 1, 'M2) una compra agregada por otra persona aparece en el modal');
    t.ok((await page.textContent(`${MODAL} tr[data-compra-id="cRemota1"]`)).includes('Compra agregada por otra persona'), 'M2) con su contenido');
    await h.remoto('1121', 'delete d.otras_fuentes.general.compras.cRemota1');
    await h.waitIdle();
    t.eq(await filas(), n0, 'M2) una compra borrada por otra persona desaparece del modal');
  });

  await escenario(t, 'M3', async () => {
    // Proyección de B&S (concepto libre) de General: borrado remoto de un ítem
    const filaProy = (c) => page.locator(`${MODAL} input.celda-input[data-modo="of_bys_proy_item"][data-concepto="${c}"][data-mes="ENERO"]`);
    const conceptos = await page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-modo="of_bys_proy_item"][data-mes="ENERO"]')).map(e => e.dataset.concepto));
    t.ok(conceptos.length >= 1, 'M3) General 1121 tiene ítems de proyección de B&S', conceptos);
    const borrar = conceptos[0];
    await h.remoto('1121', `delete d.otras_fuentes.general.bys_proy_items[arg]`, borrar);
    await h.waitIdle();
    t.eq(await filaProy(borrar).count(), 0, `M3) el ítem "${borrar}" borrado por otra persona desaparece del modal`);
    t.ok(!((await docRbd(h, '1121')).otras_fuentes.general.bys_proy_items || {})[borrar], 'M3) y sigue borrado en el servidor (no resucita)');
    // si aún quedara la fila obsoleta, teclear en ella lo resucitaría: con el modal al día no hay fila donde teclear
    if (await filaProy(borrar).count()) { await filaProy(borrar).fill('777'); await h.flushWrites(); }
    t.ok(!((await docRbd(h, '1121')).otras_fuentes.general.bys_proy_items || {})[borrar], 'M3) teclear en el modal no recrea el ítem borrado');
    // un ítem NUEVO agregado por otra persona aparece
    await h.remoto('1121', `d.otras_fuentes.general.bys_proy_items['Concepto remoto'] = { concepto: 'Concepto remoto', meses: { ENERO: 5000, FEBRERO: 0, MARZO: 0, ABRIL: 0, MAYO: 0, JUNIO: 0, JULIO: 0, AGOSTO: 0, SEPTIEMBRE: 0, OCTUBRE: 0, NOVIEMBRE: 0, DICIEMBRE: 0 }, total: 5000 }`);
    await h.waitIdle();
    const selNuevo = celda('general', '1121', 'of_bys_proy_item', 'ENERO', '[data-concepto="Concepto remoto"]');
    t.eq(await page.inputValue(selNuevo), '5000', 'M3) un ítem agregado por otra persona aparece con su valor');
    await page.fill(selNuevo, '6100');
    await h.flushWrites();
    t.eq((await docRbd(h, '1121')).otras_fuentes.general.bys_proy_items['Concepto remoto'].meses.ENERO, 6100, 'M3) y la fila nueva es editable (se guarda lo que se teclea)');
  });

  await escenario(t, 'M4', async () => {
    // Foco y texto en curso intactos mientras llegan cambios remotos
    const sel = celda('general', '1121', 'of_ingreso', 'MARZO');
    const sel2 = celda('general', '1121', 'of_gasto_rem', 'FEBRERO');
    await page.click(sel);
    await page.keyboard.press('Control+A');
    const tecleo = page.keyboard.type('1234', { delay: 150 });
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(170);
      await h.remoto('1121', `d.otras_fuentes.general.gasto_rem.meses.FEBRERO = ${111000 + i}; d.otras_fuentes.general.compras.cRemota2 = Object.assign({}, Object.values(d.otras_fuentes.general.compras)[0], { descripcion: 'Remota ${i}' });`);
    }
    await tecleo;
    t.eq(await page.inputValue(sel), '1234', 'M4) la celda que se está tecleando conserva su texto aunque lleguen cambios remotos');
    t.ok(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), 'M4) ... y su foco');
    t.eq(await page.inputValue(sel2), '111002', 'M4) mientras, la otra celda sí toma el valor remoto');
    await page.waitForTimeout(800);
    await h.waitIdle();
    t.eq(((await docRbd(h, '1121')).otras_fuentes.general.ingreso.meses.MARZO), 1234, 'M4) lo tecleado se guardó completo (1234)');
    await h.flushWrites();
    // formulario de compra a medias + campo de concepto: los cambios remotos no los vacían
    const campo = (f) => `${MODAL} .compra-form-grid .of-compra-input[data-field="${f}"]`;
    await page.fill(campo('descripcion'), 'Compra OF a medias');
    await page.fill(campo('nroDocumento'), 'OF-1');
    await page.fill(campo('montoGasto'), '555');
    await page.selectOption(campo('tipoDocumento'), { index: 1 });
    const tipo = await page.inputValue(campo('tipoDocumento'));
    await h.remoto('1121', 'd.otras_fuentes.general.gasto_rem.meses.MARZO = 24680');
    await h.remoto('1125', 'd.rem = d.rem || { meses: {} }; d.rem.meses = d.rem.meses || {}; d.rem.meses.ENERO = 1');
    await h.waitIdle();
    t.eq(await page.inputValue(campo('descripcion')), 'Compra OF a medias', 'M4) el formulario de compra a medias no se vacía con cambios remotos (descripción)');
    t.eq(await page.inputValue(campo('nroDocumento')), 'OF-1', 'M4) ... (N° documento)');
    t.eq(await page.inputValue(campo('montoGasto')), '555', 'M4) ... (monto)');
    t.eq(await page.inputValue(campo('tipoDocumento')), tipo, 'M4) ... (tipo de documento)');
    const tablaCompras = (await page.textContent(`${MODAL} .compras-table`)).replace(/\s+/g, ' ');
    t.ok(tablaCompras.includes('Remota 2'), 'M4) la tabla de compras sí recibió las compras remotas', tablaCompras.slice(0, 200));
    await page.evaluate(() => document.querySelectorAll('#otrasFuentesModalBody .compra-form-grid .of-compra-input').forEach(e => { e.value = ''; }));
  });

  await escenario(t, 'M5', async () => {
    // el corte "Real hasta" cambiado por otra persona se refleja (selector y etiquetas Real/Proy.)
    const sel = `${MODAL} select.of-modal-corte-select`;
    const antes = await page.inputValue(sel);
    const nuevo = antes === '3' ? '4' : '3';
    await h.remoto('1121', `d.otras_fuentes.general.real_hasta_mes = ${nuevo}`);
    await h.waitIdle();
    t.eq(await page.inputValue(sel), nuevo, `M5) el corte "Real hasta" cambiado por otra persona se ve en el selector (antes ${antes})`);
    const tags = await page.evaluate(() => Array.from(document.querySelector('#otrasFuentesModalBody table.detalle-table').querySelectorAll('thead th .mes-tag')).map(e => e.textContent));
    t.eq(tags.filter(x => x === 'Real').length, Number(nuevo), 'M5) y las columnas Real/Proy. cambian en consecuencia', tags);
  });

  await escenario(t, 'M6', async () => {
    // se agregaron/quitaron filas, pero lo que existía desde el principio no se reemplazó
    const r = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      return {
        celdaIngreso: !!(q('#otrasFuentesModalBody input.celda-input[data-modo="of_ingreso"][data-mes="MARZO"]') || {}).__marca,
        formulario: !!(q('#otrasFuentesModalBody .compra-form-grid') || {}).__marca,
        selectorCorte: !!(q('#otrasFuentesModalBody select.of-modal-corte-select') || {}).__marca,
        tablaCompras: !!(q('#otrasFuentesModalBody .compras-table') || {}).__marca,
      };
    });
    t.ok(r.celdaIngreso && r.formulario && r.selectorCorte && r.tablaCompras, 'M6) el modal no se reconstruyó: la celda, el formulario, el selector de corte y la tabla siguen siendo los mismos nodos', r);
    await page.keyboard.press('Escape');
    await h.waitIdle();
    t.eq(await page.evaluate(() => document.getElementById('otrasFuentesModalBody').children.length), 0, 'M6) al cerrar el modal se vacía');
    // al reabrir se construye de cero y con lo último
    await h.page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="1121"]');
    await h.waitIdle();
    t.eq(await page.inputValue(celda('general', '1121', 'of_gasto_rem', 'FEBRERO')), '111002', 'M6) al reabrir el modal muestra lo último');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== FAEP (concepto libre): borrado remoto + campo "Agregar concepto"
  await escenario(t, 'M7', async () => {
    await abrir(h, 'faep', '1121');
    const filas = () => page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-modo="of_bys_item"][data-mes="ENERO"]')).map(e => e.dataset.concepto));
    const conceptos = await filas();
    t.ok(conceptos.includes('Servicios básicos') && conceptos.length >= 2, 'M7) FAEP 1121 tiene varios conceptos de B&S', conceptos);
    // la persona está escribiendo el nombre de un concepto nuevo
    await page.fill(`${MODAL} #juncon-1121-faep`, 'Concepto a medias');
    // otra persona borra "Servicios básicos"
    await h.remoto('1121', `delete d.otras_fuentes.faep.bys_items['Servicios básicos']`);
    await h.waitIdle();
    t.ok(!(await filas()).includes('Servicios básicos'), 'M7) el concepto borrado por otra persona desaparece del modal');
    t.eq(await page.inputValue(`${MODAL} #juncon-1121-faep`), 'Concepto a medias', 'M7) y el nombre de concepto que se estaba escribiendo no se pierde');
    // seguir trabajando en otro concepto no resucita el borrado
    const otro = (await filas())[0];
    await page.fill(celda('faep', '1121', 'of_bys_item', 'ENERO', `[data-concepto="${otro}"]`), '4545');
    await h.flushWrites();
    const bys = (await docRbd(h, '1121')).otras_fuentes.faep.bys_items;
    t.eq(bys[otro].meses.ENERO, 4545, 'M7) editar otro concepto se guarda');
    t.ok(!bys['Servicios básicos'], 'M7) y "Servicios básicos" sigue borrado (no resucita)');
    // el botón Agregar concepto usa lo escrito
    await page.click(`${MODAL} .of-add-bysitem-btn`);
    await h.flushWrites();
    t.ok((await filas()).includes('Concepto a medias'), 'M7) "+ Agregar concepto" agrega lo que se estaba escribiendo');
    t.eq(await page.inputValue(`${MODAL} #juncon-1121-faep`), '', 'M7) y deja el campo limpio');
    t.ok(!!(await docRbd(h, '1121')).otras_fuentes.faep.bys_items['Concepto a medias'], 'M7) y queda guardado');
    // borrado propio (botón 🗑) sigue funcionando
    await page.click(`${MODAL} button.of-bysitem-del-btn[data-concepto="Concepto a medias"]`);
    await h.flushWrites();
    t.ok(!(await filas()).includes('Concepto a medias'), 'M7) el botón 🗑 propio sigue quitando el concepto del modal');
    t.ok(!(await docRbd(h, '1121')).otras_fuentes.faep.bys_items['Concepto a medias'], 'M7) y del servidor');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== JUNJI (GESPARVU): cambio remoto de una celda de ingreso
  await escenario(t, 'M8', async () => {
    await abrir(h, 'junji', '5402002');
    const sel = celda('junji', '5402002', 'of_ingreso_homologacion', 'NOVIEMBRE');
    await h.remoto('5402002', 'd.otras_fuentes.junji.ingreso_homologacion.meses.NOVIEMBRE = 3030303');
    await h.waitIdle();
    t.eq(await page.inputValue(sel), '3030303', 'M8) JUNJI: el cambio remoto de otra persona se ve en el modal');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  t.noErrores(h);
  await h.close();
}, { modoBug: 'enforced' });
