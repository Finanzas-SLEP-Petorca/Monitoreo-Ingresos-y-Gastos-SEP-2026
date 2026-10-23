// escritura_modal_tecleo — F-01 (auditoría): los montos tecleados en el modal de detalle NO se pueden alterar por los snapshots.
//
// El bug original: el listener de Firestore está sobre TODA la colección, así que llega un snapshot por cada cambio de
// cualquier RBD y, además, el eco de la propia escritura (≈400 ms después de dejar de teclear y otra vez al resolver
// serverTimestamp()). Cada uno reconstruía el modal con innerHTML: el <input> recuperaba el foco pero con el cursor al
// INICIO (en <input type=number> selectionStart es null), así que "1500000" con pausas de 450 ms quedaba en "51";
// "1","2", pausa, "3" daba "312"; si OTRA persona guardaba otra celda del mismo RBD mientras se tecleaba, "1234" quedaba
// en "412"/"4312"; y el formulario de compra (campos a medias y modo edición) se perdía con un snapshot de OTRO RBD, de modo
// que el siguiente "Agregar compra" creaba una compra DUPLICADA en vez de editar.
//
// Lo correcto: el valor final del campo (y lo guardado) es exactamente lo tecleado, sin importar el ritmo ni los snapshots;
// los nodos del modal no se reemplazan; el formulario de compra y el modo edición sobreviven; los montos aceptan lo que se
// pega ("1.500.000", "1,5"…) con las reglas es-CL y un texto no numérico se rechaza sin tocar lo guardado.
//
// MODO_BUG: 'known-bug' (documenta, no falla) | 'enforced' (la reaparición del bug FALLA). Ver semilla_offline.mjs.
const MODO_BUG = 'enforced'; // el bug se corrigió (F-01): su reaparición hace fallar la suite

import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const TECLEADO = '1500000';
const celdaIng = (rbd, mes, item = 'Carrera Docente') => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="ingreso_item"][data-item="${item}"][data-mes="${mes}"]`;
const celdaRem = (rbd, mes) => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="rem"][data-mes="${mes}"]`;
const docSep = async (h, rbd) => (await h.store())[`sep_carga_rbd/${rbd}`];
const guardadoIng = async (h, rbd, mes, item = 'Carrera Docente') => ((await docSep(h, rbd)).ingreso_items[item].meses || {})[mes];

async function abrirSep(h, rbd) {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
// Simula un PEGADO (inputType insertFromPaste): a diferencia de teclear/fill, no pasa por el bloqueo de letras del teclado.
async function pegar(page, selector, texto) {
  await page.evaluate(([sel, txt]) => {
    const el = document.querySelector(sel);
    el.focus(); el.value = txt;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: txt }));
  }, [selector, texto]);
}
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 3).join(' | ')); }
}

await correrSpec('escritura_modal_tecleo', async (t) => {
  // ======================================================================== SEP
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h, '1122');

    // Marca todos los nodos del modal: si algún snapshot reemplaza el DOM, la marca desaparece.
    await page.evaluate(() => { document.querySelectorAll('#modalBody *').forEach((e, i) => { e.__marca = i + 1; }); window.__nNodos = document.querySelectorAll('#modalBody *').length; });

    // ---- A) teclear 1500000 con distintos ritmos (100 / 300 / 450 / 600 ms entre dígitos): las pausas > 400 ms disparan
    //         un guardado + su eco entre dígitos (el caso que dejaba "51").
    for (const [pausa, mes] of [[100, 'AGOSTO'], [300, 'SEPTIEMBRE'], [450, 'OCTUBRE'], [600, 'NOVIEMBRE']]) {
      await escenario(t, `A) ${pausa} ms`, async () => {
        const sel = celdaIng('1122', mes);
        t.eq(await page.inputValue(sel), '', `A) ${pausa} ms: la celda parte vacía`);
        await page.click(sel);
        await page.keyboard.type(TECLEADO, { delay: pausa });
        t.eq(await page.inputValue(sel), TECLEADO, `A) ${pausa} ms: con foco, el campo muestra exactamente lo tecleado`);
        await page.waitForTimeout(1100); // último guardado + eco
        await h.waitIdle();
        t.eq(await page.inputValue(sel), TECLEADO, `A) ${pausa} ms: tras el guardado y su eco el campo sigue igual`);
        t.eq(await guardadoIng(h, '1122', mes), 1500000, `A) ${pausa} ms: se guardó 1500000`);
        t.ok(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), `A) ${pausa} ms: la celda conserva el foco`);
        await h.flushWrites();
        t.eq(await guardadoIng(h, '1122', mes), 1500000, `A) ${pausa} ms: tras salir de la celda sigue guardado 1500000`);
      });
    }

    // ---- B) "1", "2", pausa > 400 ms (guarda y llega el eco), "3" → 123 (antes 312)
    await escenario(t, 'B)', async () => {
      const sel = celdaIng('1122', 'DICIEMBRE');
      await page.click(sel);
      await page.keyboard.type('12');
      await page.waitForTimeout(900);
      await h.waitIdle();
      t.eq(await page.inputValue(sel), '12', 'B) tras el eco de "12" el campo sigue en "12"');
      await page.keyboard.type('3');
      await page.waitForTimeout(900);
      await h.waitIdle();
      t.eq(await page.inputValue(sel), '123', 'B) "1","2", pausa, "3" deja 123 (no 312)');
      t.eq(await guardadoIng(h, '1122', 'DICIEMBRE'), 123, 'B) se guardó 123');
      await h.flushWrites();
    });

    // ---- C) otra persona guarda OTRA celda del mismo RBD mientras se teclea 1234 (antes 412 con 60 ms y 4312 con 200 ms)
    for (const [pausa, mes, remoto] of [[60, 'ENERO', 777001], [200, 'FEBRERO', 777002]]) {
      await escenario(t, `C) ${pausa} ms`, async () => {
        const sel = celdaIng('1122', mes);
        await page.click(sel);
        const tecleo = page.keyboard.type('1234', { delay: pausa });
        for (let i = 0; i < 3; i++) { await page.waitForTimeout(Math.round(pausa * 1.2)); await h.remoto('1122', `d.rem.meses.ENERO = ${remoto + i}`); }
        await tecleo;
        await page.waitForTimeout(900);
        await h.waitIdle();
        t.eq(await page.inputValue(sel), '1234', `C) ${pausa} ms con otra persona guardando: el campo queda en 1234`);
        t.eq(await guardadoIng(h, '1122', mes), 1234, `C) ${pausa} ms con otra persona guardando: se guardó 1234`);
        t.eq(await page.inputValue(celdaRem('1122', 'ENERO')), String(remoto + 2), `C) ${pausa} ms: el cambio de la otra persona sí se ve en su celda`);
        await h.flushWrites();
      });
    }

    // ---- C2) lo tecleado y aún no enviado se superpone a lo que llega: el total de la fila no retrocede con un snapshot ajeno
    await escenario(t, 'C2)', async () => {
      const sel = celdaIng('1122', 'MAYO');
      const total = async () => Number((await page.textContent('#modalBody #ingresoitemtotal-1122-2')).replace(/\D/g, ''));
      const t0 = await total(); // la fila ya trae lo tecleado en los casos anteriores
      const t0Texto = await page.textContent('#modalBody #ingresoitemtotal-1122-2');
      await page.click(sel);
      await page.keyboard.type('12'); // queda pendiente (debounce de 400 ms)
      // Registra TODO valor que muestre el total de la fila desde ahora (aunque sea un instante): un retroceso transitorio también cuenta.
      await page.evaluate(() => {
        window.__totales = [];
        new MutationObserver(() => { const c = document.getElementById('ingresoitemtotal-1122-2'); window.__totales.push(c ? c.textContent : null); })
          .observe(document.getElementById('modalBody'), { subtree: true, childList: true, characterData: true, attributes: true });
      });
      await page.waitForTimeout(120);
      await h.remoto('1125', 'd.rem.meses.ENERO = 31313');          // snapshot de otro RBD
      await h.remoto('1122', 'd.rem.meses.MARZO = 424242');         // y de este mismo RBD, aún sin guardar lo tecleado
      await page.waitForTimeout(80);
      t.eq(await total(), t0 + 12, 'C2) con "12" sin enviar, un snapshot ajeno no retrocede el total de la fila (se superpone lo tecleado)');
      t.eq(await page.inputValue(sel), '12', 'C2) y el campo sigue en "12"');
      await page.waitForTimeout(900);
      await h.waitIdle();
      t.eq(await total(), t0 + 12, 'C2) tras el guardado y su eco el total sigue igual');
      const vistos = await page.evaluate(() => window.__totales);
      t.ok(!vistos.includes(t0Texto), 'C2) el total de la fila nunca retrocedió, ni un instante, al valor anterior a lo tecleado', { t0Texto, vistos });
      await h.flushWrites();
    });

    // ---- D) el eco propio y los snapshots ajenos no reemplazaron ningún nodo del modal
    await escenario(t, 'D)', async () => {
      const r = await page.evaluate(() => {
        const todos = Array.from(document.querySelectorAll('#modalBody *'));
        return { vivos: todos.filter(e => e.__marca).length, inicial: window.__nNodos };
      });
      t.ok(r.vivos === r.inicial, 'D) tras decenas de snapshots (eco propio + cambios ajenos) ningún nodo del modal fue reemplazado', r);
    });

    // ---- F) lo que se pega o se teclea con formato es-CL
    const casos = [
      ['1.500.000', 1500000, '1500000'], ['1500000', 1500000, '1500000'], ['1.234,5', 1234.5, '1234,5'], ['1,5', 1.5, '1,5'],
      ['1.5', 1.5, '1,5'], ['1.500', 1500, '1500'], ['1.5000', 1.5, '1,5'], ['1234.567', 1234.567, '1234,567'], ['1,234', 1.234, '1,234'],
      ['$ 1.500.000', 1500000, '1500000'], ['-2.500', -2500, '-2500'], ['007', 7, '7'], ['12.345.678', 12345678, '12345678'], ['', 0, ''],
    ];
    await escenario(t, 'F)', async () => {
      const sel = celdaIng('1122', 'MARZO');
      for (const [pegado, esperado, mostrado] of casos) {
        await page.fill(sel, pegado);
        const conFoco = await page.inputValue(sel);
        await h.flushWrites(); // blur: guarda y normaliza
        t.eq(await guardadoIng(h, '1122', 'MARZO'), esperado, `F) "${pegado}" se guarda como ${esperado}`);
        t.eq(conFoco, pegado, `F) "${pegado}": mientras tiene foco se muestra tal cual se tecleó/pegó`);
        t.eq(await page.inputValue(sel), mostrado, `F) "${pegado}": al salir se normaliza a "${mostrado}"`);
      }
      // Texto no numérico: se rechaza sin tocar lo guardado ni agendar escrituras
      await page.fill(sel, '1234');
      await h.flushWrites();
      for (const malo of ['abc', '1.2.3', '1,2,3', '12a', '--5', '1.234,56,7', ',', '1e5x']) {
        await h.clearWrites();
        await pegar(page, sel, malo);
        t.ok(await page.evaluate((s) => document.querySelector(s).classList.contains('celda-invalida'), sel), `F) "${malo}" se marca como no válido`);
        await page.waitForTimeout(600);
        t.eq(await guardadoIng(h, '1122', 'MARZO'), 1234, `F) "${malo}" no cambia lo guardado`);
        t.eq((await h.writes()).filter(w => w.path === 'sep_carga_rbd/1122').length, 0, `F) "${malo}" no genera ninguna escritura`);
        await h.flushWrites();
        t.eq(await page.inputValue(sel), '1234', `F) "${malo}": al salir el campo vuelve a lo guardado`);
      }
      // Teclear letras no hace nada (como en un campo numérico), pero sí separadores
      await page.click(sel);
      await page.keyboard.press('Control+A');
      await page.keyboard.type('12ab3.4');
      t.eq(await page.inputValue(sel), '123.4', 'F) al teclear solo entran dígitos y separadores ("12ab3.4" → "123.4")');
      await h.flushWrites();
      t.eq(await guardadoIng(h, '1122', 'MARZO'), 123.4, 'F) "123.4" se guarda como 123,4');
    });

    // ---- G) el cursor no salta: insertar un dígito en medio de un número con eco de por medio
    await escenario(t, 'G)', async () => {
      const sel = celdaIng('1122', 'ABRIL');
      await page.fill(sel, '1500000');
      await page.waitForTimeout(700);
      await h.waitIdle();
      await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.setSelectionRange(2, 2); }, sel);
      await page.keyboard.type('9');
      await page.waitForTimeout(900);
      await h.waitIdle();
      await page.keyboard.type('8');
      await page.waitForTimeout(900);
      await h.waitIdle();
      t.eq(await page.inputValue(sel), '159800000', 'G) al insertar dígitos en medio de un número el cursor se queda donde está (con ecos de por medio)');
      t.eq(await guardadoIng(h, '1122', 'ABRIL'), 159800000, 'G) y se guardó 159800000');
      await h.flushWrites();
    });

    // ---- E) una fila NUEVA que agrega otra persona (el reconciliador inserta nodos nuevos) es plenamente editable
    await escenario(t, 'E)', async () => {
      const meses0 = '{ ENERO: 0, FEBRERO: 0, MARZO: 0, ABRIL: 0, MAYO: 0, JUNIO: 0, JULIO: 0, AGOSTO: 0, SEPTIEMBRE: 0, OCTUBRE: 0, NOVIEMBRE: 0, DICIEMBRE: 0 }';
      await h.remoto('1122', `d.bys_proyeccion = d.bys_proyeccion || {}; d.bys_proyeccion.items = d.bys_proyeccion.items || {}; d.bys_proyeccion.items['410605'] = { meses: ${meses0}, total: 0 };`);
      await h.waitIdle();
      const sel = '#modalBody input.celda-input[data-modo="bys_proy"][data-codigo="410605"][data-mes="ENERO"]';
      t.eq(await page.locator(sel).count(), 1, 'E) el ítem de proyección agregado por otra persona aparece en el modal');
      await page.click(sel);
      await page.keyboard.type('8800', { delay: 30 });
      await h.flushWrites();
      t.eq((await docSep(h, '1122')).bys_proyeccion.items['410605'].meses.ENERO, 8800, 'E) y se puede editar (el handler de la fila nueva funciona y se guarda)');
      await h.remoto('1122', `delete d.bys_proyeccion.items['410605']`);
      await h.waitIdle();
      t.eq(await page.locator(sel).count(), 0, 'E) si otra persona lo borra, la fila desaparece del modal');
    });

    t.noErrores(h);
    await h.close();
  }

  // ======================================================================== SEP: formulario de compra y modo edición
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirSep(h, '1121');
    const campo = (f) => `#modalBody .compra-form-grid .compra-input[data-field="${f}"]`;
    const filas = () => page.locator('#modalBody tr[data-compra-id]').count();
    const boton = () => page.textContent('#modalBody .add-compra-btn');
    const editando = () => page.getAttribute('#modalBody .compra-form-grid', 'data-editing-id');

    await escenario(t, 'H) formulario a medias', async () => {
      await page.fill(campo('descripcion'), 'Compra a medias');
      await page.fill(campo('nroDocumento'), 'F-7788');
      await page.fill(campo('nombreProveedor'), 'Proveedor en curso');
      await page.selectOption(campo('codigo'), '410605');
      await page.fill(campo('montoGasto'), '12345');
      await h.remoto('1122', 'd.rem.meses.ENERO = 4242424'); // snapshot de OTRO RBD
      await h.remoto('1125', 'd.rem.meses.ENERO = 4242425');
      await page.waitForTimeout(300);
      await h.waitIdle();
      t.eq(await page.inputValue(campo('descripcion')), 'Compra a medias', 'H) un snapshot de otro RBD no vacía la descripción a medias');
      t.eq(await page.inputValue(campo('nroDocumento')), 'F-7788', 'H) ... ni el N° de documento');
      t.eq(await page.inputValue(campo('nombreProveedor')), 'Proveedor en curso', 'H) ... ni el proveedor');
      t.eq(await page.inputValue(campo('codigo')), '410605', 'H) ... ni el código de cuenta');
      t.eq(await page.inputValue(campo('montoGasto')), '12345', 'H) ... ni el monto');
      await h.remoto('1121', 'd.rem.meses.FEBRERO = 888888'); // snapshot del MISMO RBD
      await h.waitIdle();
      t.eq(await page.inputValue(campo('descripcion')), 'Compra a medias', 'H) tampoco un cambio remoto del mismo RBD');
      await page.evaluate(() => document.querySelectorAll('#modalBody .compra-form-grid .compra-input').forEach(e => { e.value = ''; }));
    });

    await escenario(t, 'I) modo edición', async () => {
      const antes = await filas();
      const compraAntes = JSON.parse(JSON.stringify((await docSep(h, '1121')).compras));
      await h.clearWrites();
      await page.click('#modalBody button.compra-edit-btn[data-compra-id="c1121_2"]');
      t.eq(await editando(), 'c1121_2', 'I) ✏️ marca el modo edición (data-editing-id)');
      t.ok(/Guardar cambios/.test(await boton()), 'I) el botón dice "Guardar cambios"', await boton());
      const desc0 = await page.inputValue(campo('descripcion'));
      t.ok(desc0.length > 0, 'I) el formulario se llenó con la compra', desc0);
      await h.remoto('1122', 'd.rem.meses.MARZO = 5151515');       // otro RBD
      await h.remoto('1121', 'd.rem.meses.MARZO = 5151516');       // el mismo RBD
      await h.remoto('1121', 'd.compras.c1121_4.descripcion = "Editada por otra persona"'); // otra compra del mismo RBD
      await page.waitForTimeout(300);
      await h.waitIdle();
      t.eq(await editando(), 'c1121_2', 'I) tras snapshots ajenos el modo edición sigue (data-editing-id)');
      t.ok(/Guardar cambios/.test(await boton()), 'I) ... y el botón sigue diciendo "Guardar cambios"', await boton());
      t.eq(await page.inputValue(campo('descripcion')), desc0, 'I) ... y el formulario conserva los datos de la compra');
      t.ok((await page.textContent('#modalBody tr[data-compra-id="c1121_4"]')).includes('Editada por otra persona'), 'I) la tabla de compras sí refleja el cambio remoto de otra compra');
      await page.fill(campo('descripcion'), 'Descripción corregida en edición');
      await page.click('#modalBody .add-compra-btn');
      await h.flushWrites();
      t.eq(await filas(), antes, 'I) "Guardar cambios" edita la compra: NO se crea una duplicada');
      const doc = await docSep(h, '1121');
      t.eq(Object.keys(doc.compras).length, Object.keys(compraAntes).length, 'I) en Firestore sigue la misma cantidad de compras');
      t.eq(doc.compras.c1121_2.descripcion, 'Descripción corregida en edición', 'I) la compra editada quedó con el cambio');
      const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121' && x.payload && x.payload.compras);
      t.ok(w.length >= 1 && w.every(x => Object.keys(x.payload.compras).every(id => id === 'c1121_2')), 'I) el write de compras solo toca c1121_2', w.map(x => Object.keys(x.payload.compras)));
      t.eq(await editando(), null, 'I) tras guardar se sale del modo edición');
      t.ok(/Agregar compra/.test(await boton()), 'I) ... y el botón vuelve a "+ Agregar compra"', await boton());
      t.eq(await page.inputValue(campo('descripcion')), '', 'I) ... y el formulario queda limpio');
    });

    await escenario(t, 'J) agregar compra nueva', async () => {
      const antes = await filas();
      await page.selectOption(campo('codigo'), '410605');
      await page.fill(campo('fechaDocumento'), '2026-05-05');
      await page.fill(campo('montoGasto'), '99000');
      await page.fill(campo('descripcion'), 'Compra nueva J');
      await page.click('#modalBody .add-compra-btn');
      await h.flushWrites();
      t.eq(await filas(), antes + 1, 'J) "Agregar compra" crea una compra');
      t.eq(await page.inputValue(campo('descripcion')), '', 'J) y deja el formulario limpio');
      t.eq(await editando(), null, 'J) y fuera del modo edición');
    });

    await escenario(t, 'K) borrado remoto de la compra en edición', async () => {
      await page.click('#modalBody button.compra-edit-btn[data-compra-id="c1121_3"]');
      t.eq(await editando(), 'c1121_3', 'K) se está editando c1121_3');
      const desc = await page.inputValue(campo('descripcion'));
      await h.remoto('1121', 'delete d.compras.c1121_3');
      await h.waitIdle();
      t.eq(await page.locator('#modalBody tr[data-compra-id="c1121_3"]').count(), 0, 'K) la compra borrada por otra persona desaparece de la tabla');
      t.eq(await page.inputValue(campo('descripcion')), desc, 'K) el formulario conserva lo escrito');
      t.eq(await editando(), null, 'K) pero ya no está en modo edición (guardar no resucita la compra borrada)');
      t.ok(/Agregar compra/.test(await boton()), 'K) el botón pasa a "+ Agregar compra"', await boton());
    });

    t.noErrores(h);
    await h.close();
  }

  // ======================================================================== SEP: Honorarios (celdas de la proyección y formulario de la boleta)
  {
    const h = await boot({ fixture: 'honorarios' });
    const { page } = h;
    await abrirSep(h, '1122');
    const celdaHon = (mes) => `#modalBody input.celda-input[data-rbd="1122"][data-modo="hon_proy"][data-codigo="410803"][data-mes="${mes}"]`;
    const guardadoHon = async (mes) => (((await docSep(h, '1122')).hon_proyeccion.items['410803'].meses) || {})[mes];
    await page.evaluate(() => { document.querySelectorAll('#modalBody *').forEach((e, i) => { e.__marca = i + 1; }); });
    // H1) teclear 1500000 con pausas > 400 ms en una celda de la proyección de honorarios (guardado + eco entre dígitos)
    await escenario(t, 'H1)', async () => {
      const sel = celdaHon('ENERO');
      await page.click(sel);
      await page.keyboard.type(TECLEADO, { delay: 450 });
      await page.waitForTimeout(1100);
      await h.waitIdle();
      t.eq(await page.inputValue(sel), TECLEADO, 'H1) honorarios (proyección): tras el guardado y su eco el campo sigue siendo lo tecleado');
      t.eq(await guardadoHon('ENERO'), 1500000, 'H1) honorarios (proyección): se guardó 1500000');
      t.ok(await page.evaluate((s) => document.activeElement === document.querySelector(s), sel), 'H1) honorarios (proyección): la celda conserva el foco');
      await h.flushWrites();
    });
    // H2) otra persona guarda OTRA celda de la misma cuenta y OTRA boleta mientras se teclea: lo tecleado no cambia
    await escenario(t, 'H2)', async () => {
      const sel = celdaHon('FEBRERO');
      await page.click(sel);
      await page.keyboard.type('12', { delay: 80 });
      await h.remoto('1122', "d.hon_proyeccion.items['410803'].meses.MARZO = 777; d.honorarios.h1122_x = { codigo: '410803', tipoDocumento: 'BOLH', nroDocumento: 'X', fechaDocumento: '2026-05-05', fechaPago: '', descripcion: 'otra', rutProveedor: '', nombreProveedor: '', montoGasto: 5, montoDocumento: 5 };");
      await page.keyboard.type('34', { delay: 80 });
      await page.waitForTimeout(700);
      await h.waitIdle();
      t.eq(await page.inputValue(sel), '1234', 'H2) honorarios (proyección): con otra persona guardando en el mismo RBD, lo tecleado sigue siendo 1234');
      t.eq(await page.inputValue(celdaHon('MARZO')), '777', 'H2) honorarios (proyección): y la celda que cambió la otra persona se actualiza');
      await h.flushWrites();
      t.eq(await guardadoHon('FEBRERO'), 1234, 'H2) honorarios (proyección): se guardó 1234');
    });
    // H3) montos pegados y texto no numérico
    await escenario(t, 'H3)', async () => {
      const sel = celdaHon('ABRIL');
      await pegar(page, sel, '$ 1.500.000');
      await h.flushWrites();
      t.eq(await guardadoHon('ABRIL'), 1500000, 'H3) honorarios (proyección): «$ 1.500.000» pegado se guarda como 1500000');
      await pegar(page, sel, 'abc');
      t.ok(await page.evaluate((s) => document.querySelector(s).classList.contains('celda-invalida'), sel), 'H3) honorarios (proyección): un texto no numérico marca la celda como inválida');
      await h.flushWrites();
      t.eq(await guardadoHon('ABRIL'), 1500000, 'H3) honorarios (proyección): y NO toca lo guardado');
    });
    // H4) formulario de la boleta a medias y modo edición sobreviven a un snapshot de OTRO RBD y a uno propio (sin boletas duplicadas)
    await escenario(t, 'H4)', async () => {
      await page.click('#modalBody tr[data-hon-id="h1122_1"] .hon-edit-btn');
      await page.focus('#modalBody .hon-form-grid [data-field="descripcion"]');
      await page.keyboard.type(' EDITANDO', { delay: 30 });
      await h.remoto('1121', "d.rem.meses.ENERO = 4242;");           // snapshot de otro RBD
      await h.remoto('1122', "d.rem.meses.ENERO = 1111;");           // snapshot del mismo RBD (cambio ajeno)
      await h.waitIdle();
      t.eq(await page.evaluate(() => ({ edit: document.querySelector('#modalBody .hon-form-grid').dataset.editingId, descripcion: document.querySelector('#modalBody .hon-form-grid [data-field="descripcion"]').value, boton: document.querySelector('#modalBody .add-hon-btn').textContent })),
        { edit: 'h1122_1', descripcion: 'Taller de teatro EDITANDO', boton: '💾 Guardar cambios de honorario' }, 'H4) honorarios: el formulario a medias y el modo edición sobreviven a snapshots ajenos');
      await page.click('#modalBody .add-hon-btn');
      await h.flushWrites();
      const hon = (await docSep(h, '1122')).honorarios;
      t.eq([Object.keys(hon).filter(k => k.startsWith('h1122_')).sort(), hon.h1122_1.descripcion], [['h1122_1', 'h1122_2', 'h1122_x'], 'Taller de teatro EDITANDO'], 'H4) honorarios: guardar la edición actualiza la MISMA boleta (no se crea una copia)');
    });
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody input.celda-input')).filter(i => i.dataset.modo === 'hon_proy').every(i => i.__marca)), true, 'honorarios: los nodos de la proyección no se reemplazaron durante todo el escenario');
    t.noErrores(h);
    await h.close();
  }

  // ======================================================================== Fuentes (no deben romperse)
  {
    const h = await boot({ fixture: 'default' });
    const sel = 'input.celda-input[data-rbd="1122"][data-fuente="prorretencion"][data-modo="of_gasto_rem"][data-mes="DICIEMBRE"]';
    await escenario(t, 'L) fuentes', async () => {
      await clickTab(h.page, 'Pro-Retención');
      await h.page.click('#otrasFuentesTbody-prorretencion td[data-abrir-otra-fuente="1122"]');
      await h.waitIdle();
      await h.page.evaluate(() => { document.querySelectorAll('#otrasFuentesModalBody *').forEach((e, i) => { e.__marca = i + 1; }); window.__nNodosOF = document.querySelectorAll('#otrasFuentesModalBody *').length; });
      const inicial = await h.page.inputValue(sel);
      await h.page.click(sel);
      await h.page.keyboard.press('Control+A');
      await h.page.keyboard.type(TECLEADO, { delay: 450 });
      await h.page.waitForTimeout(1200);
      await h.waitIdle();
      t.eq(await h.page.inputValue(sel), TECLEADO, `L) fuentes: teclear ${TECLEADO} con pausas de 450 ms conserva lo tecleado (antes: "${inicial}")`);
      t.eq((await h.store())['sep_carga_rbd/1122'].otras_fuentes.prorretencion.gasto_rem.meses.DICIEMBRE, 1500000, 'L) fuentes: se guardó 1500000');
      await h.page.fill(sel, '2.500.000');
      await h.flushWrites();
      t.eq((await h.store())['sep_carga_rbd/1122'].otras_fuentes.prorretencion.gasto_rem.meses.DICIEMBRE, 2500000, 'L) fuentes: "2.500.000" pegado se guarda como 2500000');
      await h.page.fill(sel, 'xyz');
      await h.page.waitForTimeout(600);
      await h.flushWrites();
      t.eq((await h.store())['sep_carga_rbd/1122'].otras_fuentes.prorretencion.gasto_rem.meses.DICIEMBRE, 2500000, 'L) fuentes: un texto no numérico no cambia lo guardado');
      t.eq(await h.page.inputValue(sel), '2500000', 'L) fuentes: ... y al salir vuelve a lo guardado');
      const r = await h.page.evaluate(() => ({ vivos: Array.from(document.querySelectorAll('#otrasFuentesModalBody *')).filter(e => e.__marca).length, inicial: window.__nNodosOF }));
      t.ok(r.vivos === r.inicial, 'L) fuentes: ningún nodo del modal se reemplazó con los ecos', r);
    });
    t.noErrores(h);
    await h.close();
  }
}, { modoBug: MODO_BUG });
