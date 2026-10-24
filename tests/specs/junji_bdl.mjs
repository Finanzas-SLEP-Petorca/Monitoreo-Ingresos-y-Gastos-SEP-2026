// «Ajustes de fuentes», cambio 2 — JUNJI: nueva línea de ingreso «Ingreso Bono Desempeño Laboral (BDL)» (campo ingreso_bdl, hoja Excel ING_BDL).
// DECISIÓN DEL USUARIO: el BDL financia SOLO Remuneraciones, igual que Homologación y Carrera Docente: no puede pagar Bienes y Servicios, así que NO entra en el saldo de Operación para B&S
// (Ingreso Operación − B&S); SÍ entra al ingreso total, a Real / Proyectado según el corte «Real hasta el mes» de la entidad, al Saldo y al Estado (Déficit si el saldo total < 0 o el saldo de
// Operación para B&S < 0, regla de la PR #63). El Aporte Fiscal Extraord. JUNJI (una sola línea) no cambia. Fixture `jardines` (BDL en varios jardines; ver generate.mjs) contra un cálculo INDEPENDIENTE.
// Cubre: modal (4.ª tabla, ayuda, nombre accesible, Real/Proy), cifras por fila y KPI (Total / Real / Proyectado), el BDL fuera del saldo de Operación, Estado con BDL alto y con BDL que salva el saldo,
// edición en vivo y guardado (merge de solo ese campo), Panel principal (tarjeta y franja = serie mensual), % Ejecución, Visualizador, Reporte personalizado, Excel exportar / importar (un Excel
// anterior sin la hoja ING_BDL se importa sin error y sin borrar nada), CSV / PDF por fila, respaldo JSON, documentos antiguos sin ingreso_bdl (se leen como ceros sin escribir) y documentos con un
// ingreso_bdl dañado (no tumban nada). Debe FALLAR contra APP_HTML=@ff7a666 (el index.html anterior: JUNJI con 3 líneas).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';
import { MESES, GESPARVU_IDS, corteFuente, parseCLP, kpis, encabezadosMes, clon } from '../lib/corte.mjs';
import { ETIQUETA, fuenteDe, filasFuente, leerDashboard } from '../lib/estado.mjs';
import { libroXlsx, importarLibro } from '../lib/compras.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const BDL = 'Ingreso Bono Desempeño Laboral (BDL)';
const LINEAS = ['ingreso_operacion', 'ingreso_homologacion', 'ingreso_carrera_docente', 'ingreso_bdl'];
// Igual que num() del panel: número finito, texto numérico → número, cualquier otra cosa (null, true, {}, [], "abc") → 0.
const nz = (v) => { const n = (typeof v === 'number') ? v : ((typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN); return Number.isFinite(n) ? n : 0; };
const sumaMeses = (l, desde = 1, hasta = 12) => MESES.reduce((s, m, i) => ((i + 1 >= desde && i + 1 <= hasta) ? s + nz(l && l.meses && l.meses[m]) : s), 0);
const pctTxt = (v) => v.toFixed(1).replace('.', ',') + '%';

// Oráculo independiente de JUNJI con las 4 líneas. `corteOv` fuerza otro corte «Real hasta».
function junji(docs, id, corteOv) {
  const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes.junji) || {};
  const corte = corteOv || corteFuente(docs, id, 'junji');
  const items = Object.values(of.bys_items || {});
  const bloque = (d, h) => {
    const ing = Object.fromEntries(LINEAS.map(k => [k, sumaMeses(of[k], d, h)]));
    const ingreso = LINEAS.reduce((s, k) => s + ing[k], 0), rem = sumaMeses(of.gasto_rem, d, h), bys = items.reduce((s, it) => s + sumaMeses(it, d, h), 0);
    return { ing, ingreso, rem, bys, gasto: rem + bys, saldo: ingreso - rem - bys };
  };
  const total = bloque(1, 12);
  return { corte, real: bloque(1, corte), proy: bloque(corte + 1, 12), total, saldoOp: total.ing.ingreso_operacion - total.bys, saldoOpConBdl: total.ing.ingreso_operacion + total.ing.ingreso_bdl - total.bys };
}
const cifrasDe = (b) => [b.ingreso, b.rem, b.bys, b.gasto, b.saldo];
const leerTabla = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesTbody-junji tr[data-rbd]')).map(tr => ({
  rbd: tr.dataset.rbd, corte: tr.children[2].textContent.trim(), cifras: [3, 4, 5, 6, 7].map(i => tr.children[i].textContent.trim()),
})));
async function exportar(page, disparar) {
  const dl = await capturarDescarga(page, disparar);
  return { ...dl, libro: await leerXlsx(page, dl.buffer) };
}
const MOD = '#otrasFuentesModalBody';
const celdaBdl = (id, mes) => `${MOD} input.celda-input[data-rbd="${id}"][data-fuente="junji"][data-modo="of_ingreso_bdl"][data-mes="${mes}"]`;
const sub = (page) => page.evaluate(() => document.getElementById('otrasFuentesModalSubtitle').innerText.replace(/\s+/g, ' ').trim());
async function abrir(h, id, fuente = 'junji') {
  await h.clickTab(fuente);
  await h.page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${id}"]`);
  await h.waitIdle();
}
async function cerrar(h) { await h.page.keyboard.press('Escape'); await h.waitIdle(); }

await correrSpec('junji_bdl', async (t) => {
  const docs = cargarFixture('jardines').docs;
  const h = await boot({ fixture: 'jardines', user: 'authorized' });
  const { page } = h;

  // ---------------------------------------------------------------- 0) oráculo
  const J = Object.fromEntries(GESPARVU_IDS.map(id => [id, junji(docs, id)]));
  t.eq([J['5402002'].total.ing.ingreso_bdl, J['5402002'].real.ing.ingreso_bdl, J['5402002'].proy.ing.ingreso_bdl], [1440000, 840000, 600000], 'oráculo: BDL de 5402002 = 1.440.000 (7 meses Real = 840.000, 5 Proyectados = 600.000)');
  t.eq([J['5401002'].total.saldo > 0, J['5401002'].saldoOp, fuenteDe(docs, '5401002', 'junji').causas], [true, -500000, ['operacion_bys']], 'oráculo: 5401002 (BDL alto) tiene saldo total positivo y saldo de Operación -500.000 → Déficit solo por Operación');
  t.eq([J['5403002'].total.saldo, J['5403002'].saldoOp, fuenteDe(docs, '5403002', 'junji').estado], [500000, 1500000, 'superavit'], 'oráculo: 5403002 (el BDL cubre Remuneraciones) → saldo +500.000, Operación +1.500.000, Superávit');
  t.eq(J['5403002'].total.saldo - J['5403002'].total.ing.ingreso_bdl, -2500000, 'oráculo: sin el BDL, 5403002 estaría en -2.500.000');

  // ---------------------------------------------------------------- 1) tabla de JUNJI y tarjetas: el BDL suma al ingreso (Total / Real / Proyectado)
  await clickTab(page, 'junji');
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`#tab-of-junji .of-chip[data-of-vista="${v}"]`);
    await h.waitIdle();
    const filas = await leerTabla(page);
    t.eq(filas.filter(f => JSON.stringify(f.cifras.map(parseCLP)) !== JSON.stringify(cifrasDe(J[f.rbd][v]))).map(f => f.rbd), [], `JUNJI · ${v}: Ingreso, Rem., B&S, Gasto y Saldo de las 13 filas coinciden con el cálculo independiente (el ingreso incluye el BDL)`);
    const suf = { total: 'Total', real: 'Real', proy: 'Proyectado' }[v];
    const k = await kpis(page, `#ofKpiRow-${v}-junji`);
    const esp = GESPARVU_IDS.reduce((a, id) => { cifrasDe(J[id][v]).forEach((x, i) => { a[i] += x; }); return a; }, [0, 0, 0, 0, 0]);
    t.eq([k[`Ingreso (${suf})`], k[`Gasto Remuneraciones (${suf})`], k[`Gasto Bienes y Servicios (${suf})`], k[`Gasto Total (${suf})`], k[`Saldo (${suf})`]].map(parseCLP), esp, `JUNJI · ${v}: las tarjetas KPI = la suma de los 13 jardines`);
  }
  await page.click('#tab-of-junji .of-chip[data-of-vista="total"]');
  const filasJ = await filasFuente(page, 'junji');
  t.eq(GESPARVU_IDS.filter(id => filasJ[id].estado !== ETIQUETA[fuenteDe(docs, id, 'junji').estado]), [], 'JUNJI: el Estado de las 13 filas coincide con el cálculo independiente (con el BDL en el saldo total)');
  t.eq([filasJ['5401002'].estado, filasJ['5401002'].causa, filasJ['5401002'].saldo], ['Déficit', 'Saldo Operación para B&S negativo', '$16.500.000'], '5401002 (BDL de $20 M): Déficit SOLO por el saldo de Operación (aunque el saldo total es +$16.500.000)');
  t.ok(/Homologación, Carrera Docente ni BDL/.test(filasJ['5401002'].title) && /\(-\$500\.000\)/.test(filasJ['5401002'].title), 'y su tooltip explica que B&S no puede pagarse con Homologación, Carrera Docente ni BDL, con el monto (-$500.000)');
  t.eq([filasJ['5403002'].estado, filasJ['5403002'].causa], ['Superávit', ''], '5403002: Superávit (el BDL financia sus Remuneraciones) y sin aviso');
  t.ok(/Bono Desempeño\s+Laboral \(BDL\)/.test(await page.evaluate(() => document.querySelector('#tab-of-junji .detalle-empty').textContent)), 'el texto de ayuda de la pestaña JUNJI nombra al Bono Desempeño Laboral (BDL) entre las líneas que solo pagan Remuneraciones');
  t.ok(/4 líneas de Ingreso/.test(await page.getAttribute('#downloadExcelOFBtn-junji', 'title')), 'y el botón «⬇ Excel» dice «4 líneas de Ingreso»');

  // ---------------------------------------------------------------- 2) modal: cuarta línea, orden, ayuda, nombre accesible, Real/Proyectado y saldo de Operación sin BDL
  await abrir(h, '5402002');
  const tablas = await page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody table.detalle-table thead th:first-child')).map(x => x.textContent.trim()));
  t.eq(tablas.slice(0, 5), ['Ingreso Operación', 'Ingreso Homologación', 'Ingreso Carrera Docente', BDL, 'Gasto Remuneraciones'], 'modal de JUNJI: 4 líneas de ingreso (la cuarta es «Ingreso Bono Desempeño Laboral (BDL)») y luego Gasto Remuneraciones');
  t.ok(/Homologación, Carrera Docente y BDL financian solo Remuneraciones/.test(await page.evaluate(() => document.querySelector('#otrasFuentesModalBody .detalle-header').textContent + document.querySelector('#otrasFuentesModalBody .detalle-wrap').textContent)), 'el encabezado del modal dice «Homologación, Carrera Docente y BDL financian solo Remuneraciones»');
  t.eq(await page.getAttribute(celdaBdl('5402002', 'MARZO'), 'aria-label'), `${BDL}, marzo, GESPARVU 5402002`, 'la celda del BDL tiene el nombre accesible «Ingreso Bono Desempeño Laboral (BDL), marzo, GESPARVU 5402002»');
  t.eq(await page.inputValue(celdaBdl('5402002', 'MARZO')), '120000', 'muestra el BDL de marzo (120000)');
  t.eq(await page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_bdl').textContent.trim()), '$1.440.000', 'y el total de la línea ($1.440.000)');
  const enc = await encabezadosMes(page, 3, MOD);
  t.eq([enc.filter(e => e.real).length, enc.filter(e => e.proy).length], [7, 5], 'la tabla del BDL marca 7 meses Real y 5 Proyectados según el «Real hasta» de la entidad (Julio)');
  const opTxt = await page.evaluate(() => document.querySelector('#otrasFuentesModalBody [id^="ofsaldoopbys-"]').textContent.trim());
  t.eq(parseCLP(opTxt), J['5402002'].saldoOp, 'el «Saldo Operación disponible para B&S» es Ingreso Operación − B&S (el BDL NO suma) = ' + opTxt);
  t.ok(J['5402002'].saldoOp !== J['5402002'].saldoOpConBdl, 'oráculo: con el BDL sumado sería otro valor (la prueba distingue)');
  const s0 = await sub(page);
  t.ok(s0.includes('Ingreso Total: $' + J['5402002'].total.ingreso.toLocaleString('es-CL')), 'el subtítulo del modal suma el BDL al Ingreso Total ($' + J['5402002'].total.ingreso.toLocaleString('es-CL') + ') → ' + s0.slice(0, 120));
  // cambiar el «Real hasta» de la entidad mueve el BDL entre Real y Proyectado
  await page.selectOption(`${MOD} .of-modal-corte-select`, '3');
  await h.flushWrites();
  const enc3 = await encabezadosMes(page, 3, MOD);
  t.eq(enc3.filter(e => e.real).length, 3, 'con «Real hasta» Marzo, la tabla del BDL marca 3 meses Real');
  await cerrar(h);
  await page.click('#tab-of-junji .of-chip[data-of-vista="real"]');
  await h.waitIdle();
  const j3 = junji(docs, '5402002', 3);
  t.eq((await leerTabla(page)).find(f => f.rbd === '5402002').cifras.map(parseCLP), cifrasDe(j3.real), 'vista Real de la tabla con corte en Marzo: el ingreso trae solo 3 meses de BDL (360.000) → ' + j3.real.ing.ingreso_bdl);
  t.eq(j3.real.ing.ingreso_bdl, 360000, 'oráculo: BDL Real con corte en Marzo = 360.000');
  await page.click('#tab-of-junji .of-chip[data-of-vista="total"]');
  await page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  await page.selectOption(`${MOD} .of-modal-corte-select`, '7');
  await h.flushWrites();
  await cerrar(h);

  // ---------------------------------------------------------------- 3) edición en vivo y guardado: el BDL cubre Remuneraciones (5403002) pero no mueve el saldo de Operación
  await abrir(h, '5403002');
  const opAntes = await page.evaluate(() => document.querySelector('#otrasFuentesModalBody [id^="ofsaldoopbys-"]').textContent.trim());
  t.eq(parseCLP(opAntes), 1500000, '5403002: saldo de Operación para B&S +$1.500.000');
  const estadoSub = async () => (/DÉFICIT/i.test(await sub(page)) ? 'Déficit' : (/SUPERÁVIT/i.test(await sub(page)) ? 'Superávit' : '?'));
  await h.clearWrites();
  for (const [valor, esperado, saldo] of [['0', 'Déficit', '-$2.500.000'], ['2499999', 'Déficit', '-$1'], ['2500000', 'Superávit', '$0'], ['3000000', 'Superávit', '$500.000'], ['0', 'Déficit', '-$2.500.000']]) {
    await page.fill(celdaBdl('5403002', 'ENERO'), valor);
    await h.waitIdle();
    const s = await sub(page);
    t.eq([await estadoSub(), (/Saldo: (-?\$[\d.]+)/.exec(s) || [])[1]], [esperado, saldo], `BDL de enero = ${valor}: ${esperado} con saldo ${saldo} (el BDL entra al saldo total y al Estado)`);
    const op = await page.evaluate(() => document.querySelector('#otrasFuentesModalBody [id^="ofsaldoopbys-"]').textContent.trim());
    t.eq(op, opAntes, '…y el saldo de Operación para B&S sigue en ' + opAntes + ' (el BDL no lo toca)');
    const f = (await filasFuente(page, 'junji'))['5403002'];
    t.eq([f.estado, f.causa], [esperado, ''], '…la fila de la tabla también (sin aviso de Operación: no hay causa de Operación)');
  }
  await page.fill(celdaBdl('5403002', 'ENERO'), '3000000');
  await h.flushWrites();
  let w = (await h.writes()).filter(x => x.path === RUTA('5403002'));
  const ultimo = w[w.length - 1];
  t.ok(ultimo && ultimo.options.merge === true, 'el guardado es con merge:true');
  t.eq(ultimo && ultimo.payload.nombre, 'BARQUITO DE PAPEL', '…con el nombre del jardín');
  t.eq(ultimo && ultimo.payload.otras_fuentes, { junji: { ingreso_bdl: { meses: { ENERO: 3000000 }, total: 3000000 } } }, '…y SOLO otras_fuentes.junji.ingreso_bdl del mes editado (ninguna otra línea ni fuente)');
  t.ok(w.every(x => !/estado|causa|saldo_operacion|\brp\b/i.test(JSON.stringify(x.payload))), 'lo derivado (Estado, causa, saldo de Operación) nunca se guarda');
  const stj = (await h.store())[RUTA('5403002')].otras_fuentes.junji;
  t.eq([stj.ingreso_bdl.meses.ENERO, stj.ingreso_operacion.meses.ENERO, stj.gasto_rem.meses.ENERO], [3000000, 2000000, 4000000], 'en el servidor las demás líneas de JUNJI siguen intactas');
  await cerrar(h);

  // 5401002: BDL aún más alto no lo saca del Déficit por Operación; subir Operación sí
  await h.remoto('5401002', `const j = d.otras_fuentes.junji; j.ingreso_bdl.meses.ENERO = 1000000000; j.ingreso_bdl.total = 1000000000;`);
  await h.waitIdle();
  let f2 = (await filasFuente(page, 'junji'))['5401002'];
  t.eq([f2.estado, f2.causa], ['Déficit', 'Saldo Operación para B&S negativo'], '5401002 con BDL de $1.000 M: sigue en Déficit por el saldo de Operación (un BDL alto no puede pagar B&S)');
  await h.remoto('5401002', `const j = d.otras_fuentes.junji; j.ingreso_operacion.meses.ENERO = 1500000; j.ingreso_operacion.total = 1500000;`);
  await h.waitIdle();
  f2 = (await filasFuente(page, 'junji'))['5401002'];
  t.eq([f2.estado, f2.causa], ['Superávit', ''], '…y con Operación = B&S ($1.500.000) pasa a Superávit');
  await h.remoto('5401002', `const j = d.otras_fuentes.junji; j.ingreso_bdl.meses.ENERO = 20000000; j.ingreso_bdl.total = 20000000; j.ingreso_operacion.meses.ENERO = 1000000; j.ingreso_operacion.total = 1000000;`);
  await h.waitIdle();

  // ---------------------------------------------------------------- 4) Panel principal: tarjeta JUNJI y franja = serie mensual (las 3 vistas)
  await clickTab(page, 'Panel principal');
  const dashIngreso = () => page.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('#dashStrip .dash-tile')).find(x => x.querySelector('.t-label').textContent.trim() === 'Ingreso');
    const tabla = document.querySelectorAll('#dashTablaMesBody tbody tr');
    const ult = tabla[tabla.length - 1];
    return { franja: tile.querySelector('.t-value').textContent.trim(), serie: ult.children[1].textContent.trim(), junji: document.querySelector('#dashCards .dash-card[data-fuente="junji"]').dataset.ing };
  });
  // (el estado del servidor cambió en las secciones 2 y 3: se lee de los documentos actuales)
  const stNow = await h.store();
  const docsNow = Object.fromEntries(Object.entries(stNow).map(([p, d]) => [p.split('/')[1], d]));
  const jEspNow = GESPARVU_IDS.reduce((a, id) => { const j = junji(docsNow, id); ['total', 'real', 'proy'].forEach(v => { a[v] += j[v].ingreso; }); return a; }, { total: 0, real: 0, proy: 0 });
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await h.waitIdle();
    const d = await dashIngreso();
    t.eq(d.franja, d.serie, `Panel principal · ${v}: el ingreso de la franja consolidada = el total de la evolución mensual (el BDL está en ambos) → ${d.franja}`);
    t.eq(Number(d.junji), jEspNow[v], `Panel principal · ${v}: el ingreso de la tarjeta JUNJI = Σ de los 13 jardines con el BDL (${jEspNow[v]})`);
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');

  // ---------------------------------------------------------------- 5) % Ejecución de JUNJI (un jardín): el Ingreso anual Total incluye el BDL
  await clickTab(page, '% Ejecución');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="junji"]');
  await page.selectOption('#ejecRbdSelect', '5402002');
  await h.waitIdle();
  const jj = junji(docsNow, '5402002');
  const nota = await page.evaluate(() => document.getElementById('ejecCorteNota').textContent);
  t.ok(nota.includes('(' + (jj.total.ingreso < 0 ? '-' : '') + '$' + jj.total.ingreso.toLocaleString('es-CL') + ')'), '% Ejecución · JUNJI · 5402002: «Ingreso anual Total» = ' + jj.total.ingreso + ' (incluye el BDL de 1.440.000)', nota.slice(0, 220));
  const kEj = await kpis(page, '#ejecKpiRow');
  t.eq(kEj['% Ejec. Remuneraciones — Real+Proy a diciembre'], pctTxt(jj.total.rem / jj.total.ingreso * 100), '% Ejec. Remuneraciones a diciembre = Rem. / Ingreso con BDL (' + pctTxt(jj.total.rem / jj.total.ingreso * 100) + ')');

  // ---------------------------------------------------------------- 6) Reportes: Visualizador y Reporte personalizado
  await clickTab(page, 'Reportes');
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="junji"]');
  await page.evaluate(() => { document.getElementById('vzEntidadesDet').open = true; });
  await page.click('#vzEntNinguno');
  await page.evaluate(() => { const cb = document.querySelector('#vzEntList input[data-vz-ent="5402002"]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#vzExpIng');
  await h.waitIdle();
  const vz = await page.evaluate(() => Array.from(document.querySelectorAll('#vzTablaIng tr')).map(tr => Array.from(tr.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()).join('|')));
  const filaVz = vz.find(x => x.includes(BDL));
  t.ok(filaVz, 'Visualizador (JUNJI, jardín 5402002): el árbol de Ingresos trae la línea «' + BDL + '»', vz);
  t.eq(filaVz && filaVz.split('|').slice(1, 4).map(parseCLP), [jj.real.ing.ingreso_bdl, jj.proy.ing.ingreso_bdl, jj.total.ing.ingreso_bdl], '…con sus columnas Real / Proyectado / Total (840.000 / 600.000 / 1.440.000)');
  await page.click('#vzLimpiarBtn');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  const catalogo = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).map(e => ({ key: e.dataset.conceptoCheck, label: e.closest('label').textContent.trim() })).filter(x => x.key.startsWith('of|junji|ingreso')));
  t.eq(catalogo.map(c => c.key), ['of|junji|ingreso_operacion', 'of|junji|ingreso_homologacion', 'of|junji|ingreso_carrera_docente', 'of|junji|ingreso_bdl'], 'Reporte personalizado: JUNJI ofrece 4 conceptos de ingreso (el último, ingreso_bdl)');
  t.eq(catalogo[3].label, '[JUNJI] ' + BDL, '…con la etiqueta «[JUNJI] ' + BDL + '»');
  await page.click('#reporteRbdNinguno'); await page.click('#reporteConceptoNinguno'); await page.click('#reporteMesTodos');
  await page.evaluate(() => {
    ['5402002', '5401007'].forEach(id => { const cb = document.querySelector(`#reporteRbdList input[data-rbd-check="${id}"]`); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    const c = document.querySelector('#reporteConceptoList input[data-concepto-check="of|junji|ingreso_bdl"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await h.waitIdle();
  const filasRep = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteTbody tr')).map(tr => ({ rbd: tr.children[0].textContent.trim(), concepto: tr.children[2].textContent.trim(), celdas: Array.from(tr.querySelectorAll('td.num')).map(td => ({ t: td.textContent.trim(), c: td.className })) })));
  const f5402002 = filasRep.find(f => f.rbd === '5402002'), f5401007 = filasRep.find(f => f.rbd === '5401007');
  t.eq(f5402002.celdas.slice(0, 12).map(c => parseCLP(c.t)), MESES.map((m) => nz(docsNow['5402002'].otras_fuentes.junji.ingreso_bdl.meses[m])), 'Reporte personalizado: el BDL de 5402002 mes a mes (120.000 × 12)');
  t.eq(f5402002.celdas.slice(0, 12).map(c => (/mes-real/.test(c.c) ? 'R' : (/mes-proy/.test(c.c) ? 'P' : '?'))).join(''), 'RRRRRRRPPPPP', '…con los 7 primeros meses Real y los 5 siguientes Proyectados (su «Real hasta» es Julio)');
  t.eq(f5401007.celdas.slice(0, 12).map(c => (/mes-real/.test(c.c) ? 'R' : (/mes-proy/.test(c.c) ? 'P' : '?'))).join(''), 'RRRRRRRPPPPP', '5401007 (BDL desde agosto, corte en Julio): sus 5 meses con monto son Proyectados');
  t.eq(parseCLP(f5401007.celdas[12].t), 1500000, '…y su total anual es 1.500.000 (5 × 300.000)');
  t.eq(filasRep.filter(f => f.rbd === '').length, 1, 'con dos entidades hay una fila de subtotal');
  t.noErrores(h);

  // ---------------------------------------------------------------- 7) Excel: hoja ING_BDL (exportar, reimportar, archivo anterior sin la hoja, archivo con cambios)
  await clickTab(page, 'junji');
  const x1 = await exportar(page, () => page.click('#downloadExcelOFBtn-junji'));
  t.eq(x1.libro.orden, ['ING_OPERACION', 'ING_HOMOLOGACION', 'ING_CARRERA_DOCENTE', 'ING_BDL', 'REMUNERACIONES', 'BYS_ITEMS', 'META'], 'Excel de JUNJI: hojas ING_OPERACION, ING_HOMOLOGACION, ING_CARRERA_DOCENTE, ING_BDL, REMUNERACIONES, BYS_ITEMS, META');
  t.eq(x1.libro.hojas.ING_BDL[0].slice(0, 3), ['RBD', 'Nombre', 'Enero'], 'ING_BDL tiene las mismas columnas que las otras hojas de ingreso');
  t.eq(x1.libro.hojas.ING_BDL.slice(1).map(r => String(r[0])), GESPARVU_IDS, 'ING_BDL: una fila por jardín (13), en el orden de JUNJI');
  const fb = x1.libro.hojas.ING_BDL.find(r => String(r[0]) === '5402002');
  t.eq([fb[1], fb[2], fb[14]], ['RINCONCITO', 120000, 1440000], 'la fila de 5402002: nombre, enero 120.000 y total 1.440.000');
  // exportar → importar → exportar: idéntico
  let msg = await importarLibroDesde(h, x1);
  t.ok(/ING_BDL: 13 filas/.test(msg[0] || ''), 'importar el mismo Excel informa «ING_BDL: 13 filas»', msg);
  const x2 = await exportar(page, () => page.click('#downloadExcelOFBtn-junji'));
  t.eq(JSON.stringify(x2.libro.hojas), JSON.stringify(x1.libro.hojas), 'exportar → importar → exportar da exactamente las mismas hojas (incluida ING_BDL)');
  // archivo ANTERIOR (sin la hoja ING_BDL): se importa sin error y NO borra el BDL guardado
  const anterior = {}; x1.libro.orden.filter(n => n !== 'ING_BDL').forEach(n => { anterior[n] = x1.libro.hojas[n].map(r => r.slice()); });
  anterior.ING_OPERACION = anterior.ING_OPERACION.map((r, i) => (i && String(r[0]) === '5402002' ? r.map((c, j) => (j === 2 ? 999000 : c)) : r));
  const bufAnt = await libroXlsx(page, anterior);
  await h.clearWrites();
  msg = await importarLibro(h, '#importExcelOFInput-junji', bufAnt, 'junji_anterior.xlsx');
  t.ok(/^Carga importada correctamente/.test(msg[0] || '') && !/ING_BDL/.test(msg[0] || ''), 'un Excel ANTERIOR (sin hoja ING_BDL) se importa sin error y el resumen no menciona ING_BDL', msg);
  t.ok(!(await h.writes()).some(x => JSON.stringify(x.payload || {}).includes('ingreso_bdl')), 'y no escribe nada de ingreso_bdl');
  const s1 = await h.store();
  t.eq([s1[RUTA('5402002')].otras_fuentes.junji.ingreso_bdl.total, s1[RUTA('5402002')].otras_fuentes.junji.ingreso_operacion.meses.ENERO], [1440000, 999000], 'el BDL guardado sigue ahí (1.440.000) y el cambio de Operación del mismo archivo sí se aplicó');
  // archivo NUEVO con cambios en ING_BDL, incluida una fila de un jardín sin BDL previo
  const nuevo = {}; x1.libro.orden.forEach(n => { nuevo[n] = x1.libro.hojas[n].map(r => r.slice()); });
  nuevo.ING_BDL = nuevo.ING_BDL.map((r, i) => (i && String(r[0]) === '5401003' ? r.map((c, j) => (j === 3 ? 654321 : (j === 14 ? 654321 : c))) : r));
  const bufNue = await libroXlsx(page, nuevo);
  await h.clearWrites();
  msg = await importarLibro(h, '#importExcelOFInput-junji', bufNue, 'junji_bdl.xlsx');
  t.ok(/ING_BDL: 13 filas/.test(msg[0] || ''), 'un Excel con la hoja ING_BDL la importa («ING_BDL: 13 filas»)', msg);
  const s2 = await h.store();
  t.eq([s2[RUTA('5401003')].otras_fuentes.junji.ingreso_bdl.meses.FEBRERO, s2[RUTA('5401003')].otras_fuentes.junji.ingreso_bdl.total], [654321, 654321], 'el BDL de febrero de 5401003 (un jardín sin BDL antes) llega al servidor');
  const wBdl = (await h.writes()).filter(x => x.path === RUTA('5401003'));
  t.ok(wBdl.length > 0 && wBdl.every(x => x.options.merge === true), 'con merge:true');
  t.noErrores(h);

  // ---------------------------------------------------------------- 8) CSV / PDF por fila, respaldo JSON y Aporte JUNJI (una sola línea: sin BDL)
  const dlCsv = await capturarDescarga(page, () => page.click('#otrasFuentesTbody-junji button.row-action-btn[data-action="csv"][data-rbd="5402002"]'));
  const csv = parseCsvPuntoYComa(dlCsv.buffer.toString('utf8'));
  const lineasCsv = csv.map(f => f[0]);
  t.eq(lineasCsv.slice(1, 6), ['Ingreso Operación', 'Ingreso Homologación', 'Ingreso Carrera Docente', BDL, 'Gasto Remuneraciones'], 'CSV de detalle de 5402002: la fila «' + BDL + '» va después de Carrera Docente');
  const filaCsv = csv.find(f => f[0] === BDL);
  t.eq([filaCsv[1], filaCsv.length, parseCLP(filaCsv[filaCsv.length - 1])], ['Mixto (Real hasta Jul)', 15, 1440000], '…con su Tipo (Mixto según el corte), 12 meses y el total 1.440.000');
  const jNow = junji(docsNow, '5402002');
  t.eq(parseCLP(csv.find(f => f[0] === 'Ingreso Total (Real+Proyectado)').slice(-1)[0]), jNow.total.ingreso, 'y «Ingreso Total (Real+Proyectado)» incluye el BDL');
  await page.evaluate(() => { window.__prints = []; });
  await page.click('#otrasFuentesTbody-junji button.row-action-btn[data-action="pdf"][data-rbd="5402002"]');
  const pr = (await h.prints())[0];
  t.ok(pr && pr.printWrap.includes(BDL), 'el PDF de la fila trae la tabla «' + BDL + '»');
  const dlJson = await capturarDescarga(page, () => page.click('#downloadCargaOFBtn-junji'));
  const js = JSON.parse(dlJson.buffer.toString('utf8')).otras_fuentes_por_rbd;
  t.eq([js['5402002'].ingreso_bdl.total, js['5402002'].rp.total.ingreso, Object.keys(js).length], [1440000, jNow.total.ingreso, 13], 'respaldo JSON de JUNJI: cada entidad trae ingreso_bdl y su ingreso total lo incluye');
  t.ok(js['5402002'].saldo_operacion_bys === jNow.saldoOp, 'y saldo_operacion_bys = Operación − B&S (sin BDL)');
  await clickTab(page, 'aporte_junji');
  await page.click('#otrasFuentesTbody-aporte_junji td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  const txtAj = await page.evaluate(() => document.getElementById('otrasFuentesModalBody').innerText);
  t.ok(!/Bono Desempeño|BDL/.test(txtAj) && /Ingreso \(Aporte Fiscal Extraord\. JUNJI\)/.test(txtAj), 'el modal del Aporte Fiscal Extraord. JUNJI sigue con su única línea de ingreso (sin BDL)');
  await cerrar(h);
  const xa = await exportar(page, () => page.click('#downloadExcelOFBtn-aporte_junji'));
  t.eq(xa.libro.orden, ['INGRESO', 'REMUNERACIONES', 'BYS_ITEMS', 'META'], 'el Excel del Aporte JUNJI conserva sus hojas (sin ING_BDL)');
  // «Cómo usar»
  await page.click('#helpBtn');
  const ayuda = await page.evaluate(() => document.getElementById('helpModal').textContent);
  t.ok(/Homologación, Carrera Docente ni BDL/.test(ayuda), '«Cómo usar» menciona que B&S no se paga con Homologación, Carrera Docente ni BDL');
  await page.click('#helpModalCloseBtn');
  await h.close();

  // ---------------------------------------------------------------- 9) documentos antiguos SIN ingreso_bdl (fixture default): se leen como ceros y no se escribe nada
  const h2 = await boot({ fixture: 'default', user: 'authorized' });
  const dDef = cargarFixture('default').docs;
  t.ok(!GESPARVU_IDS.some(id => dDef[id].otras_fuentes.junji && 'ingreso_bdl' in dDef[id].otras_fuentes.junji), 'oráculo: ningún documento del fixture default trae ingreso_bdl');
  await clickTab(h2.page, 'junji');
  const filasDef = await leerTabla(h2.page);
  t.eq(filasDef.filter(f => JSON.stringify(f.cifras.map(parseCLP)) !== JSON.stringify(cifrasDe(junji(dDef, f.rbd).total))).map(f => f.rbd), [], 'documentos antiguos: las 13 filas de JUNJI son las de siempre (BDL = 0)');
  await h2.page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h2.waitIdle();
  t.eq(await h2.page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_bdl').textContent.trim()), '$0', 'el modal muestra la línea del BDL en $0');
  t.eq(await h2.page.evaluate((s) => Array.from(document.querySelectorAll(s)).every(i => i.value === ''), celdaBdl('5402002', 'ENERO').replace('[data-mes="ENERO"]', '')), true, '…con todas sus celdas vacías (placeholder 0)');
  await h2.page.keyboard.press('Escape');
  await h2.waitIdle();
  t.eq((await h2.writes()).length, 0, 'leer documentos antiguos y abrir el modal no escribe nada en Firestore');
  t.ok(!Object.values(await h2.store()).some(d => d.otras_fuentes && d.otras_fuentes.junji && 'ingreso_bdl' in d.otras_fuentes.junji), 'y ningún documento del servidor gana la clave ingreso_bdl');
  t.noErrores(h2);
  await h2.close();

  // ---------------------------------------------------------------- 10) ingreso_bdl DAÑADO: no tumba el documento ni al resto
  const dañados = clon(docs);
  dañados['5402002'].otras_fuentes.junji.ingreso_bdl = 'texto';
  dañados['5402004'].otras_fuentes.junji.ingreso_bdl = null;
  dañados['5401006'].otras_fuentes.junji.ingreso_bdl = [1, 2, 3];
  dañados['5401007'].otras_fuentes.junji.ingreso_bdl = { meses: 'x', total: 'y' };
  dañados['5403001'].otras_fuentes.junji.ingreso_bdl = { meses: { ENERO: 'abc', FEBRERO: null, MARZO: '1000', ABRIL: {}, MAYO: true }, total: 'basura' };
  dañados['5403002'].otras_fuentes.junji.ingreso_bdl = 12345;
  const h3 = await boot({ fixture: dañados, user: 'authorized' });
  t.ok(await h3.page.evaluate(() => document.getElementById('sync-indicator').classList.contains('green')), 'con 6 documentos de jardines con un ingreso_bdl dañado el indicador sigue verde (ningún documento se omite)');
  await clickTab(h3.page, 'junji');
  const dEsp = clon(dañados);
  const filasD = await leerTabla(h3.page);
  t.eq(filasD.length, 13, 'JUNJI sigue listando los 13 jardines');
  const J3 = (id) => junji(dEsp, id);
  t.eq(filasD.filter(f => JSON.stringify(f.cifras.map(parseCLP)) !== JSON.stringify(cifrasDe(J3(f.rbd).total))).map(f => f.rbd), [], 'cada fila coincide con el cálculo que toma el BDL dañado como ceros (texto numérico «1000» = 1.000) y conserva el resto de sus líneas');
  t.eq(J3('5403001').total.ing.ingreso_bdl, 1000, 'oráculo: el único BDL que vale algo es el «1000» de marzo de 5403001');
  const ef = await filasFuente(h3.page, 'junji');
  t.eq(GESPARVU_IDS.filter(id => ef[id].estado !== ETIQUETA[fuenteDe(dEsp, id, 'junji').estado]), [], 'y el Estado de las 13 filas es el esperado');
  await h3.page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h3.waitIdle();
  t.eq(await h3.page.evaluate(() => document.getElementById('oftotal-5402002-junji-of_ingreso_bdl').textContent.trim()), '$0', 'abrir el modal de uno con ingreso_bdl = "texto": línea del BDL en $0, sin errores');
  await h3.page.keyboard.press('Escape');
  await h3.waitIdle();
  await h3.page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5403001"]');
  await h3.waitIdle();
  t.eq(await h3.page.inputValue(celdaBdl('5403001', 'MARZO')), '1000', 'y el de meses sucios muestra solo lo numérico (marzo = 1000)');
  await h3.page.keyboard.press('Escape');
  await clickTab(h3.page, 'Panel principal');
  t.ok((await leerDashboard(h3.page)).strip, 'el Panel principal se pinta');
  t.eq((await h3.writes()).length, 0, 'leer los documentos dañados no escribe nada (no se «arreglan» solos)');
  t.noErrores(h3);
  await h3.close();
});

// Sube un libro ya leído (x.buffer) por el <input> de JUNJI y devuelve los alert.
async function importarLibroDesde(h, x) {
  return importarLibro(h, '#importExcelOFInput-junji', x.buffer, 'junji.xlsx');
}
