// claves_invalidas — F-03 (c): las claves de mapa que vienen de texto libre (conceptos, ID de compra, ítem de ingreso, RBD de un
// Excel) se validan en el ORIGEN.
//
// Firestore rechaza el write ENTERO si una sola clave de mapa es "__algo__", está vacía o pesa más de 1500 bytes UTF-8; como el
// panel guarda un documento por RBD con merge, un concepto inválido hacía fallar TODOS los guardados de ese RBD (y, antes de F-03,
// reintentaba sin fin sin avisar). Ahora se rechaza con un mensaje claro al crear el concepto y al importar un Excel (la fila
// inválida se omite y se informa; el resto de la importación sigue), y el resto del RBD sigue guardándose con normalidad.
// La barra "/" SÍ es válida en una clave de mapa (solo es inválida en un ID de documento: el RBD de un Excel).
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const MODAL = '#otrasFuentesModalBody';
const docRbd = async (h, rbd) => (await h.store())[`sep_carga_rbd/${rbd}`];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const unoADoce = () => Array.from({ length: 12 }, (_, i) => (i + 1) * 1000);

async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 3).join(' | ')); }
}
async function xlsx(page, hojas) {
  const b64 = await page.evaluate((hojas) => {
    const wb = XLSX.utils.book_new();
    Object.entries(hojas).forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n));
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, hojas);
  return Buffer.from(b64, 'base64');
}
async function importar(h, inputSelector, buffer) {
  const antes = h.dialogs.length;
  await h.page.setInputFiles(inputSelector, { name: 'carga.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  for (let i = 0; i < 200 && h.dialogs.length === antes; i++) await h.page.waitForTimeout(50);
  await h.flushWrites();
  await h.waitIdle();
  await h.page.waitForTimeout(600); // por si alguna escritura agendada se rechaza
  await h.waitIdle();
  return h.dialogs.slice(antes).map(d => d.message).join('\n');
}
const rechazadas = async (h) => (await h.writes()).filter(w => w.status === 'rejected');

await correrSpec('claves_invalidas', async (t) => {
  const h = await boot({ fixture: 'default' });
  const { page } = h;
  h.expectErrors(/Error guardando RBD/);

  // ======================================================================== A) concepto nuevo desde el modal (FAEP, concepto libre)
  await escenario(t, 'A)', async () => {
    await clickTab(page, 'of-faep');
    await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="1121"]');
    await h.waitIdle();
    const filas = () => page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-modo="of_bys_item"][data-mes="ENERO"]')).map(e => e.dataset.concepto));
    const agregar = async (texto) => {
      const antes = h.dialogs.length;
      await page.fill(`${MODAL} #juncon-1121-faep`, texto);
      await page.click(`${MODAL} .of-add-bysitem-btn`);
      await h.flushWrites();
      return h.dialogs.slice(antes).map(d => d.message).join('\n');
    };
    const base = await filas();
    await h.clearWrites();
    const casos = [
      ['__x__', /__/], ['____', /__/], ['__concepto__', /__/],
      ['', /Escribe un concepto/], ['   ', /Escribe un concepto/],
      ['a'.repeat(1501), /demasiado largo/], ['ñ'.repeat(751), /demasiado largo/],
    ];
    for (const [texto, esperado] of casos) {
      const msg = await agregar(texto);
      const etiqueta = texto.length > 20 ? `"${texto.slice(0, 6)}…" (${new TextEncoder().encode(texto).length} bytes)` : JSON.stringify(texto);
      t.ok(esperado.test(msg), `A) ${etiqueta}: se rechaza con un mensaje claro`, msg);
      t.eq((await filas()).length, base.length, `A) ${etiqueta}: no se agrega ninguna fila`);
    }
    t.eq((await h.writes()).filter(w => w.path === 'sep_carga_rbd/1121').length, 0, 'A) ningún concepto inválido llegó a escribirse');
    t.eq(await page.inputValue(`${MODAL} #juncon-1121-faep`), 'ñ'.repeat(751), 'A) el campo conserva lo escrito para que la persona lo corrija');
    // Válidos al borde: "/", un solo "__" de un lado y "__" a secas (no calza con __.*__) se aceptan; 1500 bytes exactos se aceptan
    for (const valido of ['Agua/Luz', '__solo_al_inicio', 'solo_al_final__', '__', 'ñ'.repeat(750)]) {
      const msg = await agregar(valido);
      t.eq(msg, '', `A) "${valido.slice(0, 24)}"${valido.length > 24 ? '…' : ''} (${new TextEncoder().encode(valido).length} bytes) es un concepto válido: sin avisos`);
      t.ok((await filas()).includes(valido), `A) "${valido.slice(0, 24)}" se agregó`);
    }
    // El resto del RBD sigue guardándose
    await h.clearWrites();
    const otro = base[0];
    await page.fill(`${MODAL} input.celda-input[data-modo="of_bys_item"][data-concepto="${otro}"][data-mes="ENERO"]`, '31313');
    await h.flushWrites();
    t.eq((await rechazadas(h)).length, 0, 'A) ninguna escritura del RBD fue rechazada');
    const doc = await docRbd(h, '1121');
    t.eq(doc.otras_fuentes.faep.bys_items[otro].meses.ENERO, 31313, 'A) editar otro concepto del mismo RBD se guarda con normalidad');
    t.ok(!!doc.otras_fuentes.faep.bys_items['Agua/Luz'], 'A) y el concepto con "/" quedó guardado');
    const e = await page.evaluate(() => ({ cls: document.getElementById('sync-indicator').className, txt: document.getElementById('sync-text').textContent }));
    t.ok(/green/.test(e.cls), 'A) el indicador sigue verde', e);
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== B) importar Excel en una fuente
  await escenario(t, 'B)', async () => {
    await clickTab(page, 'of-faep');
    await h.clearWrites();
    const largo = 'x'.repeat(1501);
    const buf = await xlsx(page, {
      BYS_ITEMS: [
        ['RBD', 'Nombre', 'Concepto', ...MESES, 'Total Año'],
        ['1121', 'Liceo', 'Concepto importado OK', ...unoADoce(), 78000],
        ['1121', 'Liceo', '__mal__', ...unoADoce(), 78000],
        ['1121', 'Liceo', largo, ...unoADoce(), 78000],
        ['1121', 'Liceo', 'Otro concepto OK', ...unoADoce(), 78000],
        ['a/b', 'Raro', 'Concepto con RBD malo', ...unoADoce(), 78000],
        ['__rbd__', 'Raro', 'Concepto con RBD malo 2', ...unoADoce(), 78000],
      ],
    });
    const msg = await importar(h, '#importExcelOFInput-faep', buf);
    t.ok(/BYS_ITEMS: 2 filas/.test(msg), 'B) solo las 2 filas válidas se importan', msg);
    t.ok(/4 filas NO se importaron/.test(msg), 'B) el aviso cuenta las 4 filas rechazadas', msg);
    t.ok(/__mal__/.test(msg) && /demasiado largo/.test(msg) && /RBD "a\/b"/.test(msg) && /fila 3/.test(msg), 'B) y dice cuáles (hoja, fila y motivo)', msg);
    const doc = await docRbd(h, '1121');
    const bys = doc.otras_fuentes.faep.bys_items;
    t.ok(bys['Concepto importado OK'] && bys['Otro concepto OK'], 'B) los conceptos válidos quedaron guardados');
    t.ok(!bys['__mal__'] && !bys[largo], 'B) los inválidos no están en el servidor');
    t.ok(!(await h.store())['sep_carga_rbd/a/b'] && !(await h.store())['sep_carga_rbd/__rbd__'], 'B) ni se crearon documentos con un RBD inválido');
    t.eq((await rechazadas(h)).length, 0, 'B) ninguna escritura fue rechazada (el resto del RBD se guarda)');
    const e = await page.evaluate(() => document.getElementById('sync-indicator').className);
    t.ok(/green/.test(e), 'B) el indicador queda verde', e);

    // Compras (General): ID de compra inválido
    await clickTab(page, 'of-general');
    const codigo = Object.values((await docRbd(h, '1121')).otras_fuentes.general.compras)[0].codigo;
    const fila = (id, desc) => [id, '1121', 'Liceo', codigo, 'Factura', 'N-1', '2026-05-05', '', desc, '', 'Proveedor', 1000, 1000, ''];
    const comprasHdr = ['ID', 'RBD', 'Nombre', 'Codigo', 'Tipo Doc', 'N° Doc', 'Fecha Doc', 'Fecha Pago', 'Descripcion', 'RUT Proveedor', 'Nombre Proveedor', 'Monto Gasto', 'Monto Doc', 'Doc Original'];
    const buf2 = await xlsx(page, { COMPRAS: [comprasHdr, fila('__id__', 'ID reservado'), fila('', 'Sin ID (se genera)'), fila('cOK-1', 'ID bueno')] });
    const msg2 = await importar(h, '#importExcelOFInput-general', buf2);
    t.ok(/COMPRAS: 2 filas/.test(msg2) && /1 fila NO se importó/.test(msg2) && /ID de la compra/.test(msg2), 'B) compras: la fila con ID "__id__" se rechaza y se informa; las otras 2 se importan', msg2);
    const compras = (await docRbd(h, '1121')).otras_fuentes.general.compras;
    t.ok(!compras['__id__'] && !!compras['cOK-1'], 'B) compras: solo quedó la de ID válido (y la que generó su ID)');
    t.eq((await rechazadas(h)).length, 0, 'B) compras: ninguna escritura rechazada');
  });

  // ======================================================================== C) importar Excel de SEP
  await escenario(t, 'C)', async () => {
    await clickTab(page, 'SEP');
    await h.clearWrites();
    const compra = (id, desc) => [id, '1122', 'Liceo', '410605', 'Factura', 'N-9', '2026-05-05', '', desc, '', 'Proveedor', 2000, 2000, ''];
    const comprasHdr = ['ID', 'RBD', 'Establecimiento', 'Codigo', 'Tipo Doc', 'N° Doc', 'Fecha Doc', 'Fecha Pago', 'Descripcion', 'RUT Proveedor', 'Nombre Proveedor', 'Monto Gasto', 'Monto Doc', 'Doc Original'];
    const buf = await xlsx(page, {
      INGRESO: [
        ['RBD', 'Nombre', 'Item', ...MESES, 'Total'],
        ['1122', 'Liceo', '__ingreso__', ...unoADoce()],
        ['1122', 'Liceo', '', ...unoADoce()],
        ['1122', 'Liceo', 'Carrera Docente', ...unoADoce()],
      ],
      COMPRAS: [comprasHdr, compra('__reservado__', 'ID reservado'), compra('', 'Compra sin ID'), compra('cSEP-OK', 'Compra con ID bueno')],
    });
    const msg = await importar(h, '#importExcelInput', buf);
    t.ok(/INGRESO: 1 filas/.test(msg) && /COMPRAS: 2 filas/.test(msg), 'C) SEP: se importan las filas válidas (1 de INGRESO, 2 de COMPRAS)', msg);
    t.ok(/3 filas NO se importaron/.test(msg) && /__ingreso__/.test(msg) && /__reservado__/.test(msg) && /no puede estar vacío/.test(msg), 'C) SEP: se informan las 3 rechazadas (ítem "__ingreso__", ítem vacío e ID "__reservado__")', msg);
    const doc = await docRbd(h, '1122');
    t.ok(!Object.keys(doc.ingreso_items).some(k => k === '' || /^__.*__$/.test(k)), 'C) SEP: ningún ítem de ingreso con clave inválida en el servidor', Object.keys(doc.ingreso_items));
    t.eq(doc.ingreso_items['Carrera Docente'].meses.ENERO, 1000, 'C) SEP: el ítem válido quedó guardado');
    t.ok(!doc.compras['__reservado__'] && !!doc.compras['cSEP-OK'], 'C) SEP: solo quedaron compras con ID válido');
    t.eq((await rechazadas(h)).length, 0, 'C) SEP: ninguna escritura rechazada');
  });

  t.noErrores(h);
  await h.close();
}, { modoBug: 'enforced' });
