// Registro de compras por documento con CONCEPTO en las 5 fuentes por concepto (JUNJI, FAEP, FIGA, Aporte Fiscal Educ. y Aporte Fiscal JUNJI): MODELO y guardado.
//   · lectura del mapa `otras_fuentes.{fuente}.compras` (sin escribir nada), totales «documentado» por concepto y mes contra un cálculo independiente: mes de la Fecha Documento,
//     nota de crédito en negativo aunque se haya guardado en positivo, siempre Real (también después del corte «Real hasta»), sin concepto / sin fecha válida = fuera de los totales;
//   · lo «sin documento» (montos mensuales por concepto) se MANTIENE y se suma aparte: B&S = sin documento + documentado;
//   · alta / edición (✏️) / duplicado (⧉) / borrado (🗑): un setDoc con merge:true que toca SOLO `otras_fuentes.<fuente>.compras.<id>` (más nombre y auditoría);
//     un concepto nuevo no escribe nada más que la compra; validaciones (concepto vacío, «__x__», fecha, monto) sin write;
//   · otra persona editando otra compra de la misma entidad con el formulario a medias: ni se pisan ni se pierde lo escrito;
//   · documentos dañados (compras que no son objetos, montos de texto, concepto nulo/numérico, `compras` de otro tipo) no rompen nada;
//   · JUNJI: lo documentado entra en el saldo total y en el de Operación para B&S (5403002 pasa de Superávit a Déficit al registrar el documento y vuelve al borrarlo).
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { docsDe, clon, MESES } from '../lib/corte.mjs';
import {
  entidadDe, documentadoDe, abrirModalConcepto, cerrarModalConcepto, llenarFormConcepto, compraCBase, filasRegistroConcepto, leerFilasFuente, clp,
} from '../lib/compras_conceptos.mjs';

const RUTA = 'otras_fuentes.faep.compras';

// Estado del bloque de B&S del modal abierto.
const leerBloque = (page, rbd, fuente) => page.evaluate(([r, f]) => {
  const t = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
  const doc = {};
  document.querySelectorAll(`#otrasFuentesModalBody tr[id^="ofdoc-${r}-${f}-"]`).forEach(tr => {
    const celdas = Array.from(tr.children).map(td => td.textContent.trim());
    doc[celdas[0]] = celdas.slice(1);
  });
  return {
    documentado: t(`ofbysdoc-${r}-${f}`), sin: t(`ofbyssin-${r}-${f}`), total: t(`ofbystot-${r}-${f}`),
    subtitulo: document.getElementById('otrasFuentesModalSubtitle').textContent.replace(/\s+/g, ' ').trim(),
    doc,
    sugerencias: Array.from(document.querySelectorAll(`#ofconceptos-${r}-${f} option`)).map(o => o.value),
    resumenAvisos: (document.querySelector('#otrasFuentesModalBody .compras-avisos-resumen') || {}).textContent || '',
    nFilasSinDoc: document.querySelectorAll(`#otrasFuentesModalBody input.celda-input[data-modo="of_bys_item"]`).length / 12,
  };
}, [rbd, fuente]);

await correrSpec('compras_conceptos_modelo', async (t) => {
  // ============================== 1. LECTURA y totales contra el cálculo independiente (FAEP / 1121) ==============================
  const docsBase = docsDe('compras_conceptos');
  let h = await boot({ fixture: 'compras_conceptos' });
  await abrirModalConcepto(h, 'faep', '1121');
  const esp = entidadDe(docsBase, '1121', 'faep');
  const b = await leerBloque(h.page, '1121', 'faep');
  t.eq((await h.writes()).length, 0, 'leer el mapa de compras no escribe nada en Firestore');
  t.eq([clp(b.documentado), clp(b.sin), clp(b.total)], [esp.total.bysDoc, esp.total.bysSin, esp.total.bys], 'modal 1121 FAEP: «Documentado · Sin documento · Total» = cálculo independiente');
  t.ok(b.subtitulo.includes('Documentado') && b.subtitulo.includes('Sin documento'), 'el subtítulo del modal también muestra Documentado y Sin documento');
  t.eq(esp.total.bysDoc, 1090000, 'cálculo independiente: documentado = 500.000 + 300.000 − 50.000 (NC) + 120.000 + 70.000 (2025) + 150.000');
  t.eq(Object.keys(b.doc).sort(), Object.keys(esp.doc.conceptos).sort(), 'Documentado por concepto: un renglón por concepto (3 + el especial; sin el vacío ni el de fecha no válida)');
  // Cada renglón: 12 meses + total, contra el cálculo (la celda vacía se muestra "—").
  let okMeses = true, detalleMeses = '';
  Object.entries(esp.doc.conceptos).forEach(([concepto, arr]) => {
    const celdas = b.doc[concepto] || [];
    arr.forEach((v, i) => { const txt = celdas[i]; const ok = v ? clp(txt) === v : txt === '—'; if (!ok) { okMeses = false; detalleMeses += `${concepto} ${MESES[i]}: ${txt} ≠ ${v}\n`; } });
    if (clp(celdas[12]) !== arr.reduce((a, c) => a + c, 0)) { okMeses = false; detalleMeses += `${concepto} total\n`; }
  });
  t.ok(okMeses, 'Documentado por concepto y mes = cálculo independiente (NC resta, fecha de 2025 en diciembre, septiembre después del corte)', detalleMeses);
  const filas = await filasRegistroConcepto(h.page);
  t.eq(filas.length, 8, 'el registro lista las 8 compras del documento (también las que no entran en los totales)');
  const nc = filas.find(f => f.id === 'fa1121_nc');
  t.eq([nc.celdas[0], nc.celdas[1], nc.celdas[8], nc.celdas[9], nc.celdas[11]], ['Alimentación', 'Nota de crédito', '-$50.000', '-$59.500', '1001-FACEL'], 'nota de crédito guardada en POSITIVO se lee en NEGATIVO (gasto y documento) y conserva su Doc. original');
  t.eq(filas.find(f => f.id === 'fa1121_1').celdas[10], 'DC_701', 'N° DC visible en la tabla');
  t.ok(/3 compras con avisos; \$130\.000 sin contabilizar \(2 compras que no entran/.test(b.resumenAvisos), 'resumen de avisos: 3 compras (2025, concepto vacío, fecha no válida) y $130.000 sin contabilizar', b.resumenAvisos);
  t.ok(/1 sin concepto \(no se contabiliza\)/.test(b.resumenAvisos), 'el equivalente a «cuenta no reconocida» es «sin concepto»');
  const marcas = await h.page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody table.compras-table tbody tr[data-compra-id]')).map(tr => [tr.dataset.compraId, Array.from(tr.querySelectorAll('.compra-aviso-fecha')).map(x => x.textContent.trim())]).filter(x => x[1].length));
  t.eq(marcas.sort((a, c) => a[0].localeCompare(c[0])), [
    ['fa1121_2025', ['⚠ fecha fuera de 2026']], ['fa1121_invalida', ['⚠ fecha no válida: no se contabiliza']], ['fa1121_sinconcepto', ['⚠ concepto vacío: no se contabiliza']],
  ], 'marcas ⚠ por fila: fecha fuera de 2026, fecha no válida (no se contabiliza) y concepto vacío (no se contabiliza)');
  // Lo «sin documento» se mantiene tal cual (2 conceptos tecleados) y las sugerencias unen conceptos tecleados y documentados.
  t.eq(b.nFilasSinDoc, 2, 'los montos mensuales «sin documento» ya cargados se mantienen (2 conceptos)');
  t.eq(b.sugerencias, ['Alimentación', 'Mobiliario administrativo', 'Reparación "sala" & <cuna> O\'Higgins', 'Servicios básicos'], 'sugerencias del campo Concepto: los de «sin documento» y los de las compras, sin repetir y ordenados');
  t.eq(await h.page.evaluate(() => document.querySelector('#otrasFuentesModalBody .compra-form-grid .compra-input[data-field="concepto"]').getAttribute('list')), 'ofconceptos-1121-faep', 'el campo Concepto apunta a su lista de sugerencias');
  t.eq(await h.page.evaluate(() => document.querySelectorAll('#otrasFuentesModalBody .compra-input[data-field="codigo"]').length), 0, 'el registro NO tiene «Código de cuenta»: lleva Concepto');
  // Real/Proy: lo documentado es Real aunque su mes sea posterior al corte (septiembre > julio); el sin documento sigue el corte.
  await cerrarModalConcepto(h);
  const fila1121 = (await leerFilasFuente(h.page, 'faep'))['1121'];
  t.eq(clp(fila1121.bys), esp.total.bys, 'fila 1121 de FAEP: B&S de la tabla = sin documento + documentado');
  t.eq(fila1121.split, `Doc. $1.090.000 · S/doc. $28.904.570`, 'la fila muestra «Doc. · S/doc.» cuando hay algo documentado');
  const filasSin = await leerFilasFuente(h.page, 'faep');
  t.eq(filasSin['1122'].split, '', 'una fila sin documentos no muestra el desglose (la tabla no se satura)');
  t.noErrores(h);
  await h.close();

  // ============================== 2. ALTA / EDICIÓN / DUPLICADO / BORRADO: un write por compra ==============================
  h = await boot({ fixture: 'compras_conceptos' });
  await abrirModalConcepto(h, 'faep', '1122');   // entidad SIN compras: se crea el mapa solo con la compra
  const antes = await leerBloque(h.page, '1122', 'faep');
  t.eq(antes.documentado, '$0', 'entidad sin documentos: Documentado $0');
  await llenarFormConcepto(h.page, compraCBase({ concepto: 'Concepto nuevo de prueba', documentoContable: 'DC_5', montoGasto: 250000, montoDocumento: 297500, descripcion: 'Alta de prueba' }));
  await h.page.click('#otrasFuentesModalBody .of-add-compra-btn');
  await h.flushWrites(); await h.waitIdle();
  let w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1122');
  t.eq(w.length, 1, 'agregar una compra = un solo write en el documento de la entidad');
  t.ok(w[0].options && w[0].options.merge === true, 'setDoc con merge:true');
  const compraGuardada = w[0].payload.otras_fuentes && w[0].payload.otras_fuentes.faep && w[0].payload.otras_fuentes.faep.compras;
  const ids = compraGuardada ? Object.keys(compraGuardada) : [];
  t.eq(ids.length, 1, 'el payload trae exactamente UNA compra');
  t.eq(Object.keys(w[0].payload.otras_fuentes.faep), ['compras'], 'bajo faep solo viaja `compras` (no se tocan ingreso, remuneraciones ni los ítems «sin documento»)');
  t.eq(Object.keys(w[0].payload).filter(k => !['nombre', 'otras_fuentes', 'lastModifiedBy', 'lastModifiedAt'].includes(k)), [], 'el documento solo recibe nombre, auditoría y esa compra');
  const c0 = compraGuardada[ids[0]];
  t.eq({ concepto: c0.concepto, tipoDocumento: c0.tipoDocumento, nroDocumento: c0.nroDocumento, fechaDocumento: c0.fechaDocumento, fechaPago: c0.fechaPago, montoGasto: c0.montoGasto, montoDocumento: c0.montoDocumento, documentoContable: c0.documentoContable, documentoOriginal: c0.documentoOriginal },
    { concepto: 'Concepto nuevo de prueba', tipoDocumento: 'Factura electrónica', nroDocumento: '9001', fechaDocumento: '2026-03-10', fechaPago: '2026-03-20', montoGasto: 250000, montoDocumento: 297500, documentoContable: 'DC_5', documentoOriginal: '' },
    'la compra guarda concepto, tipo, N°, fechas, montos, N° DC y Doc. original');
  t.ok(!('codigo' in c0), 'la compra por concepto no lleva `codigo`');
  const despues = await leerBloque(h.page, '1122', 'faep');
  t.eq([clp(despues.documentado), clp(despues.total)], [250000, clp(antes.total) + 250000], 'Documentado y Total suben en lo registrado');
  t.eq(despues.sugerencias.includes('Concepto nuevo de prueba'), true, 'un concepto nuevo escrito en una compra pasa a existir como concepto de la entidad (sugerencia y renglón documentado)');
  t.ok(Object.keys(despues.doc).includes('Concepto nuevo de prueba'), 'aparece en «Documentado por concepto»');
  t.eq(despues.nFilasSinDoc, antes.nFilasSinDoc, 'sin escribir un ítem «sin documento»: lo tecleado no cambia');
  const formVacio = await h.page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody .compra-form-grid .compra-input')).map(e => e.value).filter(Boolean));
  t.eq(formVacio, [], 'el formulario queda limpio después de guardar');
  const idNuevo = ids[0];

  // Edición (✏️): carga la compra, cambia el monto y guarda con el MISMO id.
  await h.clearWrites();
  await h.page.click(`#otrasFuentesModalBody button.of-compra-edit-btn[data-compra-id="${idNuevo}"]`);
  const enEdicion = await h.page.evaluate(() => {
    const g = document.querySelector('#otrasFuentesModalBody .compra-form-grid');
    return { editing: g.dataset.editingId, cls: g.classList.contains('editing'), boton: g.querySelector('.of-add-compra-btn').textContent.trim(),
      cancelar: !g.querySelector('.of-cancelar-edicion-btn').classList.contains('hidden'), concepto: g.querySelector('[data-field="concepto"]').value, monto: g.querySelector('[data-field="montoGasto"]').value };
  });
  t.eq(enEdicion, { editing: idNuevo, cls: true, boton: '💾 Guardar cambios', cancelar: true, concepto: 'Concepto nuevo de prueba', monto: '250000' }, '✏️ carga la compra en el formulario (modo edición con «Guardar cambios» y «Cancelar edición»)');
  await llenarFormConcepto(h.page, { montoGasto: 300000, concepto: 'Concepto renombrado' });
  await h.page.click('#otrasFuentesModalBody .of-add-compra-btn');
  await h.flushWrites(); await h.waitIdle();
  w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1122');
  t.eq(w.length, 1, 'editar = un solo write');
  t.eq(Object.keys(w[0].payload.otras_fuentes.faep.compras), [idNuevo], 'la edición escribe la MISMA compra (sin crear otra)');
  t.eq([w[0].payload.otras_fuentes.faep.compras[idNuevo].montoGasto, w[0].payload.otras_fuentes.faep.compras[idNuevo].concepto], [300000, 'Concepto renombrado'], 'con el monto y el concepto nuevos');
  const trasEdicion = await leerBloque(h.page, '1122', 'faep');
  t.eq(Object.keys(trasEdicion.doc), ['Concepto renombrado'], 'renombrar el concepto mueve el total al concepto nuevo (el viejo ya no aparece)');
  t.eq(await h.page.evaluate(() => document.querySelector('#otrasFuentesModalBody .compra-form-grid').dataset.editingId || ''), '', 'después de guardar sale del modo edición');

  // Duplicar (⧉): carga los datos SIN modo edición; guardar crea una compra NUEVA.
  await h.clearWrites();
  await h.page.click(`#otrasFuentesModalBody button.of-compra-dup-btn[data-compra-id="${idNuevo}"]`);
  t.eq(await h.page.evaluate(() => { const g = document.querySelector('#otrasFuentesModalBody .compra-form-grid'); return [g.dataset.editingId || '', g.querySelector('[data-field="concepto"]').value]; }), ['', 'Concepto renombrado'], '⧉ carga los datos pero NO entra en modo edición');
  await h.page.click('#otrasFuentesModalBody .of-add-compra-btn');
  await h.flushWrites(); await h.waitIdle();
  w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1122');
  const idDup = Object.keys(w[0].payload.otras_fuentes.faep.compras)[0];
  t.ok(w.length === 1 && idDup && idDup !== idNuevo, 'duplicar guarda una compra con otro id (un solo write)');
  t.eq(clp((await leerBloque(h.page, '1122', 'faep')).documentado), 600000, 'las dos compras suman 600.000');

  // Borrado (🗑): deleteField SOLO de esa compra.
  await h.clearWrites();
  await h.page.click(`#otrasFuentesModalBody button.of-compra-del-btn[data-compra-id="${idDup}"]`);
  await h.flushWrites(); await h.waitIdle();
  w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1122');
  t.eq(w.length, 1, 'borrar = un solo write');
  t.eq(JSON.stringify(w[0].payload.otras_fuentes), JSON.stringify({ faep: { compras: { [idDup]: { __sentinel: 'deleteField' } } } }), 'deleteField solo de `otras_fuentes.faep.compras.<id>`');
  t.ok(w[0].options && w[0].options.merge === true, 'con merge:true');
  t.eq(clp((await leerBloque(h.page, '1122', 'faep')).documentado), 300000, 'el total baja en lo borrado');
  const servidor = await h.store();
  t.eq(Object.keys(servidor['sep_carga_rbd/1122'].otras_fuentes.faep.compras), [idNuevo], 'el servidor conserva solo la compra que queda');
  t.noErrores(h);
  await h.close();

  // ============================== 3. VALIDACIONES: sin write ==============================
  h = await boot({ fixture: 'compras_conceptos' });
  await abrirModalConcepto(h, 'figa', '5404001');
  const intentar = async (campos, patron, desc) => {
    await h.clearWrites();
    const n0 = h.dialogs.length;
    await llenarFormConcepto(h.page, campos);
    await h.page.click('#otrasFuentesModalBody .of-add-compra-btn');
    await h.waitIdle();
    const msg = h.dialogs.slice(n0).map(d => d.message).join(' | ');
    t.ok(patron.test(msg), desc + ' — aviso: ' + msg);
    t.eq((await h.writes()).length, 0, desc + ' — no escribe nada');
  };
  await intentar({ ...compraCBase(), concepto: '' }, /concepto/i, 'concepto vacío');
  await intentar({ ...compraCBase(), concepto: '__interno__' }, /no es válido/, 'concepto «__x__» (Firestore lo rechaza como clave)');
  await intentar({ ...compraCBase(), concepto: 'C'.repeat(1500) }, /demasiado largo/, 'concepto de más de 1400 bytes');
  await intentar({ ...compraCBase(), fechaDocumento: '' }, /fecha del documento/, 'sin fecha de documento');
  await intentar({ ...compraCBase(), montoGasto: '' }, /monto del gasto/, 'sin monto de gasto');
  t.noErrores(h);
  await h.close();

  // ============================== 4. OTRA PERSONA edita otra compra de la MISMA entidad con el formulario a medias ==============================
  h = await boot({ fixture: 'compras_conceptos' });
  await abrirModalConcepto(h, 'faep', '1121');
  await llenarFormConcepto(h.page, { concepto: 'Borrador a medias', descripcion: 'sin terminar', montoGasto: 77777, fechaDocumento: '2026-02-02' });
  await h.page.focus('#otrasFuentesModalBody .compra-form-grid [data-field="descripcion"]');
  await h.remoto('1121', 'd.otras_fuentes.faep.compras.fa1121_1.montoGasto = 600000; d.otras_fuentes.faep.compras.fa1121_1.montoDocumento = 714000;');
  await h.waitIdle();
  const trasRemoto = await h.page.evaluate(() => {
    const g = document.querySelector('#otrasFuentesModalBody .compra-form-grid');
    return { concepto: g.querySelector('[data-field="concepto"]').value, desc: g.querySelector('[data-field="descripcion"]').value, monto: g.querySelector('[data-field="montoGasto"]').value,
      foco: document.activeElement && document.activeElement.dataset.field };
  });
  t.eq(trasRemoto, { concepto: 'Borrador a medias', desc: 'sin terminar', monto: '77777', foco: 'descripcion' }, 'un cambio ajeno NO borra lo escrito a medias en el formulario ni le quita el foco');
  t.eq(clp((await leerBloque(h.page, '1121', 'faep')).documentado), 1190000, 'el total refleja la compra que cambió la otra persona (500.000 → 600.000)');
  await h.page.click('#otrasFuentesModalBody .of-add-compra-btn');
  await h.flushWrites(); await h.waitIdle();
  const servidor2 = (await h.store())['sep_carga_rbd/1121'].otras_fuentes.faep.compras;
  t.eq(servidor2.fa1121_1.montoGasto, 600000, 'guardar la compra propia NO pisa el cambio de la otra persona en otra compra');
  t.eq(Object.keys(servidor2).length, 9, 'el servidor tiene las 8 compras de antes + la nueva');
  const wPropio = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121' && x.payload.otras_fuentes);
  t.ok(wPropio.length === 1 && Object.keys(wPropio[0].payload.otras_fuentes.faep.compras).length === 1, 'el write propio lleva solo su compra');
  // Modo edición: si otra persona BORRA la compra que se está editando, el formulario pasa a «compra nueva».
  await h.page.click('#otrasFuentesModalBody button.of-compra-edit-btn[data-compra-id="fa1121_nuevo"]');
  t.eq(await h.page.evaluate(() => document.querySelector('#otrasFuentesModalBody .compra-form-grid').dataset.editingId), 'fa1121_nuevo', 'editando fa1121_nuevo');
  await h.remoto('1121', 'delete d.otras_fuentes.faep.compras.fa1121_nuevo;');
  await h.waitIdle();
  const trasBorrado = await h.page.evaluate(() => { const g = document.querySelector('#otrasFuentesModalBody .compra-form-grid'); return { editing: g.dataset.editingId || '', boton: g.querySelector('.of-add-compra-btn').textContent.trim(), concepto: g.querySelector('[data-field="concepto"]').value }; });
  t.eq(trasBorrado, { editing: '', boton: '+ Agregar compra', concepto: 'Mobiliario administrativo' }, 'si borran la compra en edición, el formulario conserva lo escrito pero pasa a «compra nueva» (no la recrea)');
  t.noErrores(h);
  await h.close();

  // ============================== 5. DOCUMENTOS DAÑADOS ==============================
  const dañados = clon(docsBase);
  const cm = (id, key, valor) => { dañados[id].otras_fuentes[key].compras = valor; };
  cm('1121', 'faep', {
    ok: compraCBase({ concepto: 'Bueno', montoGasto: 1000, fechaDocumento: '2026-02-03' }),
    texto: 'esto no es una compra', nulo: null, arreglo: [1, 2, 3], numero: 42,
    montoTexto: compraCBase({ concepto: 'Monto de texto', montoGasto: '2500', montoDocumento: 'abc', fechaDocumento: '2026-04-04' }),
    montoRaro: compraCBase({ concepto: 'Monto raro', montoGasto: { x: 1 }, fechaDocumento: '2026-04-05' }),
    conceptoNulo: compraCBase({ concepto: null, montoGasto: 700 }),
    conceptoNumerico: compraCBase({ concepto: 123, montoGasto: 800, fechaDocumento: '2026-05-05' }),
    conceptoObjeto: compraCBase({ concepto: { a: 1 }, montoGasto: 900 }),
    fechaObjeto: compraCBase({ concepto: 'Fecha rara', montoGasto: 600, fechaDocumento: { a: 1 } }),
  });
  cm('AC', 'faep', 'texto en vez de mapa');
  cm('5402002', 'faep', [1, 2]);
  cm('5404001', 'figa', null);
  cm('1121', 'aporte_educ', 12345);
  h = await boot({ fixture: dañados });
  await h.clickTab('of-faep');
  const filasD = await leerFilasFuente(h.page, 'faep');
  const espD = entidadDe(dañados, '1121', 'faep');
  t.eq(clp(filasD['1121'].bys), espD.total.bys, 'compras dañadas (no objetos, montos de texto, concepto nulo/numérico/objeto): el total sigue el cálculo y no se rompe nada');
  t.eq(espD.doc.total, 1000 + 2500 + 800, 'cálculo independiente: solo cuentan las 3 válidas (concepto numérico = «123»)');
  for (const [fuente, id] of [['faep', 'AC'], ['faep', '5402002'], ['figa', '5404001'], ['aporte_educ', '1121']]) {
    const e = entidadDe(dañados, id, fuente);
    await h.clickTab('of-' + fuente);
    const f = (await leerFilasFuente(h.page, fuente))[id];
    t.eq(clp(f.bys), e.total.bys, `${fuente} ${id}: \`compras\` que no es un mapa se ignora (B&S = solo lo «sin documento»)`);
  }
  await abrirModalConcepto(h, 'faep', '1121');
  t.eq((await filasRegistroConcepto(h.page)).length, 7, 'el registro lista solo las entradas que son objetos (compras válidas o con campos dañados)');
  await cerrarModalConcepto(h);
  t.eq(await h.page.evaluate(() => document.getElementById('sync-indicator').className), await h.page.evaluate(() => document.getElementById('sync-indicator').className), 'el indicador sigue vivo');
  t.eq((await h.writes()).length, 0, 'leer documentos dañados no escribe');
  t.noErrores(h);
  await h.close();

  // ============================== 6. JUNJI: lo documentado entra en el saldo de Operación para B&S ==============================
  h = await boot({ fixture: 'compras_conceptos' });
  const e5403002 = entidadDe(docsBase, '5403002', 'junji');
  t.eq([e5403002.total.bys, e5403002.total.saldo, e5403002.saldoOp, e5403002.estado, e5403002.causas], [2100000, -1100000, -100000, 'deficit', ['saldo', 'operacion_bys']], 'cálculo independiente: 500.000 sin documento + 1.600.000 documentado → saldo -1.100.000 y Operación − B&S = -100.000 → Déficit (antes Superávit)');
  await abrirModalConcepto(h, 'junji', '5403002');
  const sub = await h.page.evaluate(() => ({
    saldoOp: document.getElementById('ofsaldoopbys-5403002-junji').textContent.trim(),
    cabecera: document.getElementById('otrasFuentesModalSubtitle').textContent.replace(/\s+/g, ' ').trim(),
  }));
  t.eq(clp(sub.saldoOp), -100000, 'el saldo de Operación del modal incluye lo documentado');
  t.ok(/DÉFICIT/i.test(sub.cabecera), 'el Estado de la entidad es Déficit por el saldo de Operación', sub.cabecera);
  // Borrar el documento devuelve el Superávit.
  await h.page.click('#otrasFuentesModalBody button.of-compra-del-btn[data-compra-id="jn5403002_1"]');
  await h.flushWrites(); await h.waitIdle();
  const sub2 = await h.page.evaluate(() => ({ saldoOp: document.getElementById('ofsaldoopbys-5403002-junji').textContent.trim(), cabecera: document.getElementById('otrasFuentesModalSubtitle').textContent.replace(/\s+/g, ' ').trim() }));
  t.eq(clp(sub2.saldoOp), 1500000, 'sin el documento el saldo de Operación vuelve a +1.500.000');
  t.ok(/SUPERÁVIT/i.test(sub2.cabecera), 'y la entidad vuelve a Superávit', sub2.cabecera);
  t.noErrores(h);
  await h.close();

  // ============================== 7. TODAS las entidades y fuentes: el modal de cada una calcula igual que el cálculo independiente ==============================
  h = await boot({ fixture: 'compras_conceptos' });
  const casos = [['faep', '1121'], ['faep', 'AC'], ['faep', '5402002'], ['figa', '5404001'], ['figa', '1121'], ['junji', '5403002'], ['junji', '5402002'], ['aporte_educ', '1121'], ['aporte_educ', 'AC'], ['aporte_junji', '5402002']];
  for (const [fuente, id] of casos) {
    await abrirModalConcepto(h, fuente, id);
    const e = entidadDe(docsBase, id, fuente);
    const bl = await leerBloque(h.page, id, fuente);
    t.eq([clp(bl.documentado), clp(bl.sin), clp(bl.total)], [e.total.bysDoc, e.total.bysSin, e.total.bys], `${fuente} / ${id}: Documentado, Sin documento y Total`);
    t.eq(Object.keys(bl.doc).sort(), Object.keys(e.doc.conceptos).sort(), `${fuente} / ${id}: conceptos documentados`);
    await cerrarModalConcepto(h);
  }
  t.ok(documentadoDe(docsBase, '5402002', 'junji').total === 920000, 'cálculo independiente de JUNJI 5402002: 800.000 + 120.000 (octubre, después del corte)');
  t.noErrores(h);
  await h.close();
}, { modoBug: 'enforced' });
