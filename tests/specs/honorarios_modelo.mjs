// Honorarios (PR-1) · modelo por boleta, bloque «Honorarios (Subt. 21)» del detalle de SEP y guardado.
//   A. Con el fixture `honorarios`: la fila mensual de solo lectura (suma por mes de Fecha Documento, «real»), la proyección por cuenta («proyectada», se SUMA), el aviso de meses con boletas y
//      proyección a la vez, el registro (columnas A–L + N° DC), las marcas ⚠ y el resumen de avisos, el N° DC, y lo que NO entra en los totales.
//   B. Alta / edición / duplicado / eliminación de una boleta: el write es SOLO esa boleta (clave `honorarios.<id>`, merge:true), con el tipo como CÓDIGO; validaciones.
//   C. Proyección por cuenta: agregar, escribir una celda (write parcial), quitar.
//   D. Varias personas a la vez: el formulario a medias y el modo edición sobreviven a cambios ajenos; un alta ajena aparece sin duplicar; la boleta que se editaba y otra persona borró deja el formulario como «nueva».
//   E. Datos dañados en Firestore (boleta que no es objeto, tipos raros, mapas del tipo equivocado): no rompen ni al RBD ni al resto; se leen con tolerancia.
//   F. Recarga: lo guardado sigue ahí; compras con el mismo código de cuenta NO se cuentan dos veces (siguen en B&S).
import { boot, clickTab, cargarFixture, textoDe } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { abrirModalSep, cerrarModalSep } from '../lib/compras.mjs';
import { MESES, honDe, clp, leerCLP, filaDetalleMeses, filaProyeccion, llenarFormHon, leerFormHon, boleta, filaSepTexto } from '../lib/honorarios.mjs';

const ordenar = (v) => (Array.isArray(v) ? v.map(ordenar) : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenar(v[k])])) : v));
const writesDe = async (h, rbd) => (await h.writes()).filter(w => w.path === `sep_carga_rbd/${rbd}`);
const FORM = '#modalBody .hon-form-grid';

await correrSpec('honorarios_modelo', async (t) => {
  const fx = cargarFixture('honorarios').docs;
  const esp = honDe(fx['1121']);
  t.eq([esp.boletas, esp.proy, esp.total], [2960000, 2400000, 5360000], 'oráculo: 1121 tiene $2.960.000 en boletas que cuentan (sin las 2 excluidas) y $2.400.000 de proyección');

  // ================================================================ A. detalle con el fixture `honorarios`
  {
    const h = await boot({ fixture: 'honorarios' });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1121');
    const filaReal = await filaDetalleMeses(page, 'Honorarios (Subt. 21)');
    t.eq(filaReal, { ...esp.boletasPorMes, total: esp.boletas }, 'fila «Honorarios (Subt. 21)»: cada mes es la suma de las boletas por mes de Fecha Documento (la de 2025 suma en diciembre; la de fecha no válida y la de cuenta fuera del catálogo no cuentan)');
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody tr')).find(tr => { const l = tr.querySelector('td.item-label'); return l && l.textContent.trim() === 'Honorarios (Subt. 21)'; }).querySelectorAll('input').length), 0, 'la fila de boletas es de solo lectura (sin celdas editables)');
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table')).find(tb => /Honorarios \(Subt\. 21\) — boletas/.test(tb.querySelector('th').textContent)).querySelectorAll('thead th.mes-real .mes-tag').length), 12, 'los 12 meses de la fila de boletas se rotulan «Real»');
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody td.num.mes-real')).filter(td => td.closest('tr').querySelector('td.item-label').textContent.trim() === 'Honorarios (Subt. 21)').length), 12, 'y sus 12 celdas llevan la clase mes-real');
    const p803 = await filaProyeccion(page, '410803'), p304 = await filaProyeccion(page, '410304');
    t.eq(p803, Object.fromEntries(MESES.map((m, i) => [m, i === 0 ? 100000 : (i >= 7 ? 300000 : 0)])), 'proyección 410803: las celdas editables traen lo guardado');
    t.eq(p304, Object.fromEntries(MESES.map((m, i) => [m, i >= 8 ? 200000 : 0])), 'proyección 410304: idem');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"]').length), 24, 'la proyección son 2 cuentas × 12 meses de celdas editables');
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"]')).every(i => i.closest('td').classList.contains('mes-proy'))), true, 'todas las celdas de proyección son «Proy.» (siempre proyectadas)');
    t.eq(leerCLP(await textoDe(page, '#honproytotal-1121')), esp.proy, 'el total de la proyección es la suma de sus cuentas');
    t.eq(await page.evaluate(() => (document.querySelector('#modalBody .hon-aviso-doble') || {}).textContent || ''), '⚠ Enero, Diciembre: hay boletas y también proyección de honorarios. Ambas se SUMAN; si la proyección ya se cumplió con una boleta, réstala de la proyección para no contarla dos veces.', 'enero (boleta + proyección) y diciembre (la boleta de 2025 suma ahí + proyección) tienen ambas: se avisa de esos 2 meses y de ningún otro');
    t.eq(await page.evaluate(() => document.querySelector('#modalSubtitle').textContent.includes('Gasto Honorarios: $5.360.000')), true, 'el subtítulo del modal muestra «Gasto Honorarios» = boletas + proyección');

    // registro: columnas, filas, marcas y resumen
    const cols = await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table.hon-table thead th')).map(th => th.textContent.trim() || th.getAttribute('aria-label')));
    t.eq(cols, ['Cuenta', 'Tipo doc.', 'N° doc.', 'Fecha doc.', 'Fecha pago', 'Descripción', 'RUT prestador', 'Nombre prestador', 'Monto gasto', 'Monto doc.', 'N° DC', 'Acciones de honorarios'], 'el registro trae las columnas A–L del Libro de Honorarios y el N° DC (sin Documento original)');
    const filas = await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]')).map(tr => ({ id: tr.dataset.honId, celdas: Array.from(tr.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()) })));
    t.eq(filas.length, 12, 'el registro lista las 12 boletas del RBD (también las que no cuentan, para poder corregirlas)');
    t.eq(filas.map(f => f.id), Object.entries(fx['1121'].honorarios).sort((a, b) => b[1].fechaDocumento.localeCompare(a[1].fechaDocumento)).map(([id]) => id), 'ordenadas por Fecha Documento, la más reciente primero');
    const fila = (id) => filas.find(f => f.id === id).celdas;
    t.eq(fila('h1121_1').slice(0, 11), ['410803 · TALLERES EXTRAPROGRAMÁTICOS', 'Boleta de honorarios electrónica', '54', '2026-01-21', '2026-01-28', 'Taller de ajedrez enero 2026', '11111111-1', 'Nombre Apellido Apellido', '$600.000', '$600.000', ''], 'una boleta se ve con su cuenta, el tipo con nombre, N°, fechas, descripción, prestador y montos');
    t.eq(await page.evaluate(() => document.querySelector('#modalBody tr[data-hon-id="h1121_1"] td:nth-child(2)').title), 'BOLHE', 'el tipo se guarda como CÓDIGO: el nombre se muestra y el código va en el title');
    t.eq(fila('h1121_4').slice(8, 10), ['$200.000', '$500.000'], 'una boleta repartida muestra Monto gasto $200.000 de un documento de $500.000');
    t.eq(fila('h1121_3')[10], 'DC_601', 'el N° DC se ve en su columna');
    t.ok(fila('h1121_f2025')[3].includes('⚠ fecha fuera de 2026'), 'la boleta con fecha de 2025 lleva la marca «fecha fuera de 2026»');
    t.ok(fila('h1121_invalida')[3].includes('⚠ fecha no válida: no se contabiliza'), 'la de fecha con formato no reconocido, «no se contabiliza»');
    t.ok(fila('h1121_cuenta_x')[0].includes('⚠ cuenta no reconocida: no se contabiliza'), 'la de cuenta fuera del catálogo, «cuenta no reconocida: no se contabiliza»');
    t.ok(fila('h1121_nohab')[0].includes('⚠ cuenta no habilitada para SEP'), 'la de una cuenta del catálogo que SEP no habilita lo dice (y sí suma)');
    t.ok(fila('h1121_tipo_fac')[1].includes('⚠ no es un tipo de honorarios'), 'una factura registrada como honorario lo dice');
    t.ok(fila('h1121_tipo_np')[1].includes('⚠ tipo no permitido para la cuenta'), 'un tipo que la cuenta no acepta (BHE en 410904) lo dice');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody table.hon-table .compra-aviso-fecha').length), 6, 'son exactamente 6 marcas (una por boleta con aviso)');
    t.eq(await textoDe(page, '#modalBody .hon-avisos-resumen'), '⚠ 6 boletas con avisos; $200.000 sin contabilizar (2 boletas que no entran en ningún total). 1 con fecha no válida (no se contabiliza), 1 con fecha de documento fuera de 2026, 1 con una cuenta fuera del catálogo de honorarios (no se contabiliza), 1 con una cuenta no habilitada para esta subvención, 1 con un tipo de documento que no es de honorarios, 1 con un tipo de documento que su cuenta no acepta. Pasa el cursor sobre la marca ⚠ de cada fila para ver el detalle.', 'el resumen cuenta las boletas con avisos y lo que queda sin contabilizar');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody .compras-avisos-resumen').length), 0, 'el resumen de honorarios no se confunde con el de compras');
    // totales del RBD en la tabla SEP
    await cerrarModalSep(h);
    const f1121 = await filaSepTexto(page, '1121');
    t.eq(leerCLP(f1121.gasto_hon), esp.total, 'tabla «Estado por RBD»: «Gasto Hon.» = boletas + proyección');
    // el RBD 1120 (sin marco SEP) con una boleta dispara la alerta
    t.ok(await page.evaluate(() => document.querySelector('#tableBody tr.rbd-row[data-rbd="1120"]').classList.contains('alerta-critica')), 'el RBD sin marco SEP con una boleta de honorarios queda en alerta (⚠ Gasto SEP sin marco)');
    t.noErrores(h);
    await h.close();
  }

  // ================================================================ B. alta / edición / duplicado / eliminación
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1121');
    t.eq(await filaDetalleMeses(page, 'Honorarios (Subt. 21)'), { ...Object.fromEntries(MESES.map(m => [m, 0])), total: 0 }, 'sin boletas la fila de honorarios está en $0');
    t.eq(await page.evaluate(() => document.querySelector('#modalBody table.hon-table tbody').textContent.trim()), 'Sin boletas de honorarios registradas todavía.', 'y el registro lo dice');
    await h.clearWrites();

    // --- validaciones: nada se guarda ---
    const dialogos0 = h.dialogs.length;
    const intento = async (campos, esperado, desc) => {
      await page.click(`${FORM} .add-hon-btn`);
      await h.waitIdle();
      const nuevos = h.dialogs.slice(dialogos0).map(d => d.message);
      t.ok(nuevos.some(m => m.includes(esperado)), `validación: ${desc}`, nuevos);
    };
    await intento({}, 'Elige una cuenta de honorarios', 'sin cuenta no guarda');
    await llenarFormHon(page, { codigo: '410803' });
    await intento({}, 'Elige el tipo de documento de honorarios', 'sin tipo no guarda');
    await llenarFormHon(page, { tipoDocumento: 'BOLHE' });
    await intento({}, 'Ingresa la fecha de la boleta', 'sin fecha no guarda');
    await llenarFormHon(page, { fechaDocumento: '2026-01-21' });
    await intento({}, 'Ingresa el monto del gasto (mayor que 0)', 'sin monto no guarda');
    await llenarFormHon(page, { montoGasto: '-500' });
    await intento({}, 'Ingresa el monto del gasto (mayor que 0)', 'un monto negativo no guarda (las boletas son gasto positivo)');
    await llenarFormHon(page, { montoGasto: 'abc' });
    await intento({}, 'Monto no válido', 'un monto que no es número no guarda');
    await llenarFormHon(page, { montoGasto: '600.000', montoDocumento: '12x' });
    await intento({}, 'Monto no válido', 'un monto de documento inválido no guarda');
    t.eq((await writesDe(h, '1121')).length, 0, 'ninguna validación fallida escribió en Firestore');

    // --- alta ---
    await llenarFormHon(page, { montoDocumento: '', nroDocumento: '54', fechaPago: '2026-01-28', descripcion: 'Taller de ajedrez enero 2026', rutProveedor: '11111111-1', nombreProveedor: 'Nombre Apellido Apellido', documentoContable: 'DC_77' });
    t.ok(await page.evaluate(() => /Monto no válido/.test(document.querySelector('#modalBody .hon-form-avisos').textContent)) === false, 'con los montos válidos el aviso en vivo de monto desaparece');
    await page.click(`${FORM} .add-hon-btn`);
    await h.flushWrites();
    let w = await writesDe(h, '1121');
    t.eq(w.length, 1, 'el alta hace UN solo write');
    const [idAlta] = Object.keys(w[0].payload.honorarios || {});
    t.ok(!!idAlta && /^c[0-9a-z]+$/.test(idAlta), 'la boleta recibe un id generado (como las compras)');
    t.eq(ordenar(w[0].payload), ordenar({
      nombre: 'LICEO PULMAHUE DE LA LIGUA', lastModifiedBy: 'wilson.rojas@sleppetorca.gob.cl', lastModifiedAt: { __sentinel: 'serverTimestamp' },
      honorarios: { [idAlta]: { codigo: '410803', tipoDocumento: 'BOLHE', nroDocumento: '54', fechaDocumento: '2026-01-21', fechaPago: '2026-01-28', descripcion: 'Taller de ajedrez enero 2026',
        rutProveedor: '11111111-1', nombreProveedor: 'Nombre Apellido Apellido', montoGasto: 600000, montoDocumento: 600000, documentoContable: 'DC_77' } },
    }), 'el write lleva solo esa boleta (tipo como CÓDIGO, Monto documento = Monto gasto cuando se deja vacío, N° DC) más el nombre y la auditoría');
    t.eq(w[0].options, { merge: true }, 'con merge:true (no pisa lo que otra persona edite en otras boletas del RBD)');
    t.eq(await leerFormHon(page), Object.fromEntries(['codigo', 'tipoDocumento', 'nroDocumento', 'fechaDocumento', 'fechaPago', 'descripcion', 'rutProveedor', 'nombreProveedor', 'montoGasto', 'montoDocumento', 'documentoContable'].map(k => [k, ''])), 'tras guardar el formulario queda limpio');
    t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).ENERO, 600000, 'la fila de honorarios suma la boleta en ENERO (mes de la Fecha Documento)');
    const f = await filaSepTexto(page, '1121');
    t.eq(leerCLP(f.gasto_hon), 600000, 'la tabla de SEP muestra «Gasto Hon.» $600.000');
    t.eq(leerCLP(f.gasto_rem_anual_proy), 1940570, 'y «Gasto Rem.» no cambia (los honorarios no son remuneración)');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]').length), 1, 'el registro muestra la boleta nueva');

    // --- monto del documento mayor que el gasto (reparto) y montos con separador de miles ---
    await llenarFormHon(page, { codigo: '411601', tipoDocumento: 'BPST', fechaDocumento: '2026-03-18', montoGasto: '200.000', montoDocumento: '500000' });
    t.eq(await page.evaluate(() => document.querySelector('#modalBody .hon-form-avisos').textContent), '', 'un reparto (gasto menor que el documento) no genera aviso');
    await llenarFormHon(page, { montoDocumento: '100000' });
    t.ok(await page.evaluate(() => /El monto gasto es mayor que el monto del documento/.test(document.querySelector('#modalBody .hon-form-avisos').textContent)), 'un gasto mayor que el documento avisa en vivo (sin impedir guardar)');
    await llenarFormHon(page, { montoDocumento: '500000' });
    await page.click(`${FORM} .add-hon-btn`);
    await h.flushWrites();
    w = await writesDe(h, '1121');
    const w2 = w[w.length - 1];
    const [id2] = Object.keys(w2.payload.honorarios);
    t.eq([w2.payload.honorarios[id2].montoGasto, w2.payload.honorarios[id2].montoDocumento, w2.payload.honorarios[id2].tipoDocumento], [200000, 500000, 'BPST'], '«200.000» se guarda como 200000 y el documento de 500000 se conserva');
    t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).MARZO, 200000, 'el mes suma el Monto Gasto (no el del documento)');

    // --- edición ---
    await page.click(`#modalBody tr[data-hon-id="${idAlta}"] .hon-edit-btn`);
    t.eq(await page.evaluate(() => document.querySelector('#modalBody .add-hon-btn').textContent), '💾 Guardar cambios de honorario', 'editar cambia el botón a «Guardar cambios de honorario»');
    t.eq(await page.evaluate(() => !document.querySelector('#modalBody .cancelar-edicion-hon-btn').classList.contains('hidden')), true, 'y muestra «Cancelar edición de honorario»');
    const form = await leerFormHon(page);
    t.eq([form.codigo, form.tipoDocumento, form.nroDocumento, form.fechaDocumento, form.montoGasto, form.montoDocumento, form.documentoContable], ['410803', 'BOLHE', '54', '2026-01-21', '600000', '600000', 'DC_77'], 'el formulario se llena con los datos de la boleta (montos sin separador)');
    await llenarFormHon(page, { montoGasto: '650000', montoDocumento: '650000' });
    await h.clearWrites();
    await page.click(`${FORM} .add-hon-btn`);
    await h.flushWrites();
    w = await writesDe(h, '1121');
    t.eq(w.length, 1, 'guardar la edición hace un solo write');
    t.eq(Object.keys(w[0].payload.honorarios), [idAlta], 'que toca solo esa boleta (mismo id: no se duplica)');
    t.eq([w[0].payload.honorarios[idAlta].montoGasto, w[0].payload.honorarios[idAlta].descripcion], [650000, 'Taller de ajedrez enero 2026'], 'con el monto nuevo y el resto de los campos');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]').length), 2, 'siguen siendo 2 boletas');
    t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).ENERO, 650000, 'la fila mensual refleja el monto editado');
    t.eq(await page.evaluate(() => document.querySelector('#modalBody .add-hon-btn').textContent), '+ Agregar honorario', 'tras guardar el formulario vuelve a «+ Agregar honorario»');

    // --- cancelar edición ---
    await page.click(`#modalBody tr[data-hon-id="${idAlta}"] .hon-edit-btn`);
    await page.click(`${FORM} .cancelar-edicion-hon-btn`);
    t.eq([await page.inputValue(`${FORM} [data-field="montoGasto"]`), await page.evaluate(() => document.querySelector('#modalBody .hon-form-grid').classList.contains('editing'))], ['', false], 'cancelar la edición limpia el formulario y sale del modo edición');

    // --- duplicado ---
    await h.clearWrites();
    await page.click(`#modalBody tr[data-hon-id="${idAlta}"] .hon-dup-btn`);
    t.eq(await page.evaluate(() => document.querySelector('#modalBody .hon-form-grid').classList.contains('editing')), false, 'duplicar carga los datos SIN entrar en modo edición');
    t.eq(await page.inputValue(`${FORM} [data-field="nroDocumento"]`), '54', 'con los datos de la boleta origen');
    await llenarFormHon(page, { nroDocumento: '55', fechaDocumento: '2026-02-10' });
    await page.click(`${FORM} .add-hon-btn`);
    await h.flushWrites();
    w = await writesDe(h, '1121');
    const idDup = Object.keys(w[w.length - 1].payload.honorarios)[0];
    t.ok(idDup !== idAlta && idDup !== id2, 'la copia es una boleta nueva (id distinto)');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]').length), 3, 'ahora hay 3 boletas');

    // --- eliminación ---
    await h.clearWrites();
    await page.click(`#modalBody tr[data-hon-id="${idDup}"] .hon-del-btn`);
    await h.flushWrites();
    t.ok(h.dialogs.some(d => d.type === 'confirm' && /Eliminar esta boleta de honorarios/.test(d.message)), 'eliminar pide confirmación');
    w = await writesDe(h, '1121');
    t.eq(w.length, 1, 'eliminar hace un write');
    t.eq(ordenar(w[0].payload.honorarios), { [idDup]: { __sentinel: 'deleteField' } }, 'que borra solo esa boleta (deleteField sobre su id) y nada más');
    t.eq(w[0].options, { merge: true }, 'con merge:true');
    const store = await h.store();
    t.eq(Object.keys(store['sep_carga_rbd/1121'].honorarios).sort(), [idAlta, id2].sort(), 'en el servidor quedan las otras 2 boletas');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]').length), 2, 'y la tabla muestra 2');
    t.noErrores(h);
    await h.close();
  }

  // ================================================================ C. proyección por cuenta
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1122');
    const opcionesAgregar = () => page.evaluate(() => Array.from(document.querySelectorAll('#honproyAddSelect-1122 option')).map(o => o.value).filter(Boolean));
    t.eq((await opcionesAgregar()).length, 27, 'el selector de proyección ofrece las 27 cuentas de honorarios habilitadas para SEP');
    await page.click('#modalBody .add-honproy-btn');
    t.ok(h.dialogs.some(d => /Elige una cuenta de la lista/.test(d.message)), 'agregar sin elegir cuenta avisa');
    await h.clearWrites();
    await page.selectOption('#honproyAddSelect-1122', '410803');
    await page.click('#modalBody .add-honproy-btn');
    await h.flushWrites();
    let w = await writesDe(h, '1122');
    t.eq(w.length, 1, 'agregar una cuenta a la proyección hace un write');
    t.eq(Object.keys(w[0].payload.hon_proyeccion.items), ['410803'], 'con la cuenta como clave de `hon_proyeccion.items`');
    t.eq(w[0].payload.hon_proyeccion.items['410803'].total, 0, 'en $0 (se completa después)');
    t.ok(!(await opcionesAgregar()).includes('410803'), 'la cuenta agregada sale del selector');
    t.eq(await page.evaluate(() => document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410803"]').length), 12, 'y aparecen sus 12 celdas editables');
    await h.clearWrites();
    const celda = (mes) => `#modalBody input.celda-input[data-modo="hon_proy"][data-codigo="410803"][data-mes="${mes}"]`;
    await page.fill(celda('AGOSTO'), '1.500.000');
    await page.fill(celda('SEPTIEMBRE'), '250000');
    await h.flushWrites();
    w = await writesDe(h, '1122');
    t.ok(w.length >= 1 && w.every(x => Object.keys(x.payload).every(k => ['nombre', 'hon_proyeccion', 'lastModifiedBy', 'lastModifiedAt'].includes(k))), 'escribir celdas guarda solo `hon_proyeccion` (más nombre y auditoría)');
    const ultimo = w[w.length - 1].payload.hon_proyeccion.items['410803'];
    t.eq([ultimo.meses.SEPTIEMBRE, ultimo.total], [250000, 1750000], 'el write lleva el mes tecleado y el total de la cuenta');
    t.eq(leerCLP(await textoDe(page, '#honproytotal-1122')), 1750000, 'el total de la proyección se actualiza en vivo');
    t.eq(leerCLP((await filaSepTexto(page, '1122')).gasto_hon), 1750000, 'y la fila de SEP muestra «Gasto Hon.» con la proyección (sin boletas)');
    t.eq(await filaDetalleMeses(page, 'Honorarios (Subt. 21)'), { ...Object.fromEntries(MESES.map(m => [m, 0])), total: 0 }, 'la proyección NO se mezcla con la fila de boletas (reales)');
    t.eq(await page.evaluate(() => (document.querySelector('#modalBody .hon-aviso-doble') || {}).textContent || null), null, 'sin boletas no hay aviso de doble conteo');
    // quitar la cuenta
    await h.clearWrites();
    await page.click('#modalBody .honproy-del-btn[data-codigo="410803"]');
    await h.flushWrites();
    w = await writesDe(h, '1122');
    t.eq(ordenar(w[0].payload.hon_proyeccion), { items: { '410803': { __sentinel: 'deleteField' } } }, 'quitar la cuenta borra solo ese ítem de la proyección (deleteField)');
    t.eq(leerCLP((await filaSepTexto(page, '1122')).gasto_hon), 0, 'y «Gasto Hon.» vuelve a $0');
    t.eq((await opcionesAgregar()).includes('410803'), true, 'la cuenta vuelve al selector');
    t.noErrores(h);
    await h.close();
  }

  // ================================================================ D. varias personas a la vez
  {
    const h = await boot({ fixture: 'honorarios' });
    const { page } = h;
    await clickTab(page, 'SEP');
    await abrirModalSep(h, '1122');
    // formulario a medias + otra persona agrega una boleta y borra otra
    await llenarFormHon(page, { codigo: '410803', tipoDocumento: 'BOLH', nroDocumento: '777' });
    await page.focus(`${FORM} [data-field="descripcion"]`);
    await page.keyboard.type('texto a medias');
    await h.remoto('1122', `d.honorarios = d.honorarios || {}; d.honorarios.h1122_remota = ${JSON.stringify(boleta({ nroDocumento: '900', fechaDocumento: '2026-05-04', montoGasto: 123000, montoDocumento: 123000, descripcion: 'Boleta de otra persona' }))}; delete d.honorarios.h1122_2;`);
    await h.waitIdle();
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]')).map(tr => tr.dataset.honId).sort()), ['h1122_1', 'h1122_remota'], 'la boleta que agregó otra persona aparece y la que borró desaparece, sin recargar');
    t.eq(await page.evaluate(() => document.activeElement && document.activeElement.dataset.field), 'descripcion', 'el foco sigue en el campo que se estaba tecleando');
    t.eq(await page.inputValue(`${FORM} [data-field="descripcion"]`), 'texto a medias', 'lo tecleado no se pierde');
    t.eq([await page.inputValue(`${FORM} [data-field="codigo"]`), await page.inputValue(`${FORM} [data-field="tipoDocumento"]`), await page.inputValue(`${FORM} [data-field="nroDocumento"]`)], ['410803', 'BOLH', '777'], 'ni lo elegido ni lo escrito antes en el formulario');
    t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).MAYO, 123000, 'la fila mensual refleja la boleta ajena');
    // modo edición: otra persona borra la boleta que se estaba editando
    await page.click('#modalBody tr[data-hon-id="h1122_remota"] .hon-edit-btn');
    t.eq(await page.evaluate(() => document.querySelector('#modalBody .hon-form-grid').dataset.editingId), 'h1122_remota', 'se edita la boleta remota');
    await h.remoto('1122', 'delete d.honorarios.h1122_remota;');
    await h.waitIdle();
    t.eq(await page.evaluate(() => ({ edit: document.querySelector('#modalBody .hon-form-grid').dataset.editingId || null, boton: document.querySelector('#modalBody .add-hon-btn').textContent })), { edit: null, boton: '+ Agregar honorario' }, 'si la boleta en edición desaparece, el formulario conserva lo escrito pero pasa a «boleta nueva» (no la recrea al guardar)');
    t.eq(await page.inputValue(`${FORM} [data-field="nroDocumento"]`), '900', 'y conserva lo que mostraba');
    await cerrarModalSep(h);
    t.noErrores(h);
    await h.close();
  }

  // ================================================================ E. datos dañados
  {
    const docs = JSON.parse(JSON.stringify(cargarFixture('default').docs));
    docs['1121'].honorarios = {
      buena: boleta({ nroDocumento: '1', fechaDocumento: '2026-04-05', montoGasto: 100000, montoDocumento: 100000 }),
      texto: 'esto no es una boleta',
      nula: null,
      arreglo: [1, 2],
      numeros: { codigo: 410803, tipoDocumento: 7, nroDocumento: 12, fechaDocumento: '2026-04-05', fechaPago: null, descripcion: { x: 1 }, rutProveedor: [], nombreProveedor: true, montoGasto: '250000', montoDocumento: 'abc' },
      sinfecha: { codigo: '410803', tipoDocumento: 'BOLH', montoGasto: 5000 },
      montos_raros: { codigo: '410803', tipoDocumento: 'BOLH', fechaDocumento: '2026-04-10', montoGasto: { a: 1 }, montoDocumento: NaN },
      nombre_tipo: boleta({ tipoDocumento: 'Boleta de honorarios exenta', nroDocumento: '3', fechaDocumento: '2026-04-11', montoGasto: 40000, montoDocumento: 40000 }),
    };
    docs['1121'].hon_proyeccion = { items: { '410304': { meses: { ENERO: 10, FEBRERO: 'x', MARZO: null }, total: 'zzz' }, '410803': 'texto', '410309': { meses: 5 } } };
    docs['1122'].honorarios = 'esto tampoco'; docs['1122'].hon_proyeccion = ['x'];
    docs['1123'].honorarios = { a: boleta({ montoGasto: 70000, fechaDocumento: '2026-06-01' }) };
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    t.eq(await page.evaluate(() => document.getElementById('sync-indicator').className.includes('green')), true, 'el indicador de sincronización sigue verde (ningún documento fue omitido por dañado)');
    await abrirModalSep(h, '1121');
    const filas = await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody table.hon-table tbody tr[data-hon-id]')).map(tr => tr.dataset.honId).sort());
    t.eq(filas, ['buena', 'montos_raros', 'nombre_tipo', 'numeros', 'sinfecha'], 'las entradas que no son objetos (texto, null, arreglo) se descartan; las que sí lo son se leen con tolerancia');
    const real = await filaDetalleMeses(page, 'Honorarios (Subt. 21)');
    t.eq([real.ABRIL, real.total], [100000 + 250000 + 40000, 390000], 'los montos numéricos o numéricos en texto cuentan; los que no son número valen 0; sin fecha o sin cuenta no entran');
    t.eq(await page.evaluate(() => document.querySelector('#modalBody tr[data-hon-id="nombre_tipo"] td:nth-child(2)').title), 'BHE', 'un tipo guardado con su NOMBRE se lee como código (BHE)');
    t.eq(leerCLP(await textoDe(page, '#honproytotal-1121')), 10, 'la proyección dañada se lee con tolerancia (solo cuenta lo numérico)');
    t.eq(leerCLP((await filaSepTexto(page, '1122')).gasto_hon), 0, 'un RBD con `honorarios` / `hon_proyeccion` del tipo equivocado queda en $0 sin romper');
    t.eq(leerCLP((await filaSepTexto(page, '1123')).gasto_hon), 70000, 'y los demás RBD siguen normales');
    await cerrarModalSep(h);
    const sinEscrituras = (await h.writes()).filter(x => /^sep_carga_rbd\/(1121|1122|1123)$/.test(x.path));
    t.eq(sinEscrituras.length, 0, 'leer datos dañados no escribe nada en Firestore');
    t.noErrores(h);
    await h.close();
  }

  // ================================================================ F. recarga y no doble conteo con compras
  {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await clickTab(page, 'SEP');
    const antes = await filaSepTexto(page, '1122');
    await abrirModalSep(h, '1122');
    await llenarFormHon(page, { codigo: '410803', tipoDocumento: 'BOLHE', fechaDocumento: '2026-03-09', montoGasto: '500000' });
    await page.click(`${FORM} .add-hon-btn`);
    await h.flushWrites();
    await cerrarModalSep(h);
    const despues = await filaSepTexto(page, '1122');
    t.eq(leerCLP(despues.gasto_bys), leerCLP(antes.gasto_bys), 'una boleta de honorarios NO suma en Bienes y Servicios (no hay doble conteo con las compras)');
    t.eq(leerCLP(despues.saldo_total), leerCLP(antes.saldo_total) - 500000, 'pero sí baja el saldo total en $500.000');
    await page.reload({ waitUntil: 'load' });
    await h.waitIdle();
    await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'));
    await clickTab(page, 'SEP');
    t.eq(await filaSepTexto(page, '1122'), despues, 'tras recargar la fila de SEP queda idéntica (lo guardado en el servidor vuelve)');
    await abrirModalSep(h, '1122');
    t.eq((await filaDetalleMeses(page, 'Honorarios (Subt. 21)')).MARZO, 500000, 'y la boleta sigue en el detalle');
    t.ok(clp(500000) === '$500.000', 'sanity del formato');
    t.noErrores(h);
    await h.close();
  }
});
