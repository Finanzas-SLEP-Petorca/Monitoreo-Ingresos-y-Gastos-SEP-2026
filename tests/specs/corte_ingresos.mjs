// corte_ingresos: corte Real/Proyectado PROPIO de los ingresos de SEP por RBD (hallazgo L-01 de la auditoría: "Ingreso real de SEP clavado en julio;
// Saldo Real mezcla períodos").
//
// Antes el ingreso de SEP era "real" hasta DATA.n_meses (julio, fijo) mientras Remuneraciones tenía su selector propio por RBD. Ahora:
//   · el modal de cada RBD (pestaña SEP) trae "Ingresos reales hasta: [mes]" arriba de la tabla de ingresos (igual que Remuneraciones), guardado en el
//     documento del RBD como `ingreso_real_hasta_mes` (campo raíz, entero 1–12);
//   · corte efectivo del ingreso de un RBD = corte propio > mes de cierre global (documento `_meta`) > DATA.n_meses;
//   · el corte mueve el color/etiqueta Real/Proy. de la tabla de ingresos y TODAS las cifras de ingreso Real/Proyectado de ese RBD: KPI de SEP, Panel principal
//     (tarjeta, serie mensual), Visualizador, Reporte personalizado, % Ejecución consolidado y el PDF de la fila;
//   · sin mes de cierre ni cortes propios las cifras son las de siempre (corte = DATA.n_meses = julio);
//   · un valor dañado (0, 13, 7.5, "x", null…) equivale a "sin corte propio" y no rompe nada.
// Contra el index.html anterior (APP_HTML=@a94c2fb) este spec FALLA: no hay selector, ni campo, ni mes de cierre.
import { boot, clickTab, esperarPanelListo } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx } from '../lib/capture-utils.mjs';
import {
  N_MESES, MESES, MESES_TITULO, RBD_IDS, docsDe, clon, ingresoEsperado, parseCLP, kpis, encabezadosMes, celdasIngresoReal, mesesRealesDe,
} from '../lib/corte.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const suma = (a) => a.reduce((s, v) => s + v, 0);
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.stack || e.message).split('\n').slice(0, 5).join(' | ')); }
}
async function abrirModal(h, rbd = '1121') {
  await clickTab(h.page, 'SEP');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.waitIdle();
}
async function cerrarModal(h) { await h.page.keyboard.press('Escape'); await h.waitIdle(); }
// Cifras de ingreso que muestra la pestaña SEP (tarjetas Real / Proyectado), como números.
async function ingresosSep(page) {
  const r = await kpis(page, '#kpiRowReal'), p = await kpis(page, '#kpiRowProy');
  return {
    prefPrioReal: parseCLP(r['Ingreso SEP (Real)']), carreraReal: parseCLP(r['Carrera Docente (Real)']),
    prefPrioProy: parseCLP(p['Ingreso SEP (Proyectado)']), carreraProy: parseCLP(p['Carrera Docente (Proyectado)']),
    saldoReal: parseCLP(r['Saldo (Real)']), saldoProy: parseCLP(p['Saldo (Proyectado)']),
  };
}
const soloIngresos = (e) => ({ prefPrioReal: e.prefPrioReal, carreraReal: e.carreraReal, prefPrioProy: e.prefPrioProy, carreraProy: e.carreraProy });
// Serie mensual del Panel principal (tabla "Evolución mensual consolidada") en la vista pedida: { ing:[12], gas:[12] }.
async function serieDashboard(page, vista) {
  await clickTab(page, 'Panel principal');
  await page.click(`.dash-chips button[data-dash-vista="${vista}"]`);
  return page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll('#dashTablaMesBody tbody tr')).slice(0, 12);
    const n = (td) => { const s = td.textContent.replace(/\s/g, ''); return (s.startsWith('-') ? -1 : 1) * Number(s.replace(/[^\d]/g, '')); };
    return { ing: filas.map(tr => n(tr.children[1])), gas: filas.map(tr => n(tr.children[2])) };
  });
}
// Tarjeta SEP del Panel principal (la vista elegida): { ing, rem, bys, gas, saldo } (atributos data-* de la tarjeta).
async function tarjetaSepDashboard(page, vista) {
  await clickTab(page, 'Panel principal');
  await page.click(`.dash-chips button[data-dash-vista="${vista}"]`);
  return page.evaluate(() => { const c = document.querySelector('#dashCards .dash-card[data-fuente="sep"]'); return { ing: Number(c.dataset.ing), rem: Number(c.dataset.rem), bys: Number(c.dataset.bys), gas: Number(c.dataset.gas), saldo: Number(c.dataset.saldo) }; });
}
// Visualizador: "Ingresos X · Gastos Y" de las tarjetas Saldo Real / Proyectado / Total (solo SEP seleccionado).
async function visualizadorSep(page) {
  await clickTab(page, 'Reportes');
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
  await page.waitForTimeout(50);
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#vzSaldo .dash-tile').forEach(t => {
      const sub = t.querySelector('.t-sub').textContent;
      const m = /Ingresos\s+(-?\$?[\d.]+)/.exec(sub.replace(/\s/g, ' '));
      out[t.querySelector('.t-label').textContent.trim()] = m ? Number(m[1].replace(/[^\d]/g, '')) * (m[1].startsWith('-') ? -1 : 1) : null;
    });
    out.nota = document.getElementById('vzNota').textContent;
    return out;
  });
}
// Reporte personalizado: configura entidades/conceptos/meses y devuelve las filas { rbd, concepto, celdas:[{texto, clase}] }.
async function reportePersonalizado(page, { entidades, conceptos, meses }) {
  await clickTab(page, 'Reportes');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await page.click('#reporteRbdNinguno'); await page.click('#reporteConceptoNinguno'); await page.click('#reporteMesNinguno');
  for (const id of entidades) await page.evaluate((v) => { const e = document.querySelector(`#reporteRbdList input[data-rbd-check="${v}"]`); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }, id);
  for (const k of conceptos) await page.evaluate((key) => { const e = Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).find(x => x.dataset.conceptoCheck === key); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }, k);
  for (const m of meses) await page.evaluate((v) => { const e = document.querySelector(`#reporteMesList input[data-mes-check="${v}"]`); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }, m);
  await page.waitForTimeout(80);
  return page.evaluate(() => Array.from(document.querySelectorAll('#reporteTable tbody tr')).map(tr => ({
    subtotal: tr.classList.contains('report-subtotal-row'),
    rbd: tr.children[0].textContent.trim(), concepto: tr.children[2].textContent.trim(),
    celdas: Array.from(tr.children).slice(3, -1).map(td => ({ texto: td.textContent.trim(), clase: td.classList.contains('mes-real') ? 'real' : td.classList.contains('mes-proy') ? 'proy' : '' })),
  })));
}
async function notaEjecucionConsolidado(page) {
  await clickTab(page, '% Ejecución');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
  await page.waitForTimeout(50);
  return page.evaluate(() => document.getElementById('ejecCorteNota').textContent);
}

await correrSpec('corte_ingresos', async (t) => {
  const base = docsDe('default');

  // ============================================================================================ 1) Estado inicial: sin mes de cierre ni cortes propios
  await escenario(t, 'estado inicial', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirModal(h);
    const sel = await page.evaluate(() => { const s = document.getElementById('ingRealHasta-1121'); return s ? { valor: s.value, n: s.options.length, texto: s.options[s.selectedIndex].textContent, etiqueta: document.querySelector('label[for="ingRealHasta-1121"]').textContent.trim(), nota: s.parentElement.querySelector('.corte-origen').textContent.trim() } : null; });
    t.ok(sel, 'el modal del RBD trae el selector "Ingresos reales hasta"');
    t.eq(sel.etiqueta, 'Ingresos reales hasta:', 'con su etiqueta (igual que "Remuneraciones reales hasta:")');
    t.eq([sel.valor, sel.texto, sel.n], ['7', 'Julio', 12], 'sin nada definido muestra Julio (DATA.n_meses) con los 12 meses como opciones');
    t.eq(sel.nota, 'por defecto', 'y una nota dice que es el valor por defecto');
    const pos = await page.evaluate(() => {
      const ing = document.querySelector('#modalBody .ing-corte-control'), rem = document.querySelector('#modalBody .rem-corte-control:not(.ing-corte-control)');
      return { ingAntesTabla: ing.nextElementSibling.tagName === 'TABLE' && /Ingreso SEP \(detalle\)/.test(ing.nextElementSibling.textContent), remAntesTabla: rem.nextElementSibling.tagName === 'TABLE',
        mismaClase: ing.classList.contains('rem-corte-control'), ingPrimero: !!(ing.compareDocumentPosition(rem) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    t.ok(pos.ingAntesTabla && pos.remAntesTabla && pos.mismaClase && pos.ingPrimero, 'ubicación y apariencia análogas a las de Remuneraciones: control arriba de su tabla, misma clase', pos);
    const enc = await encabezadosMes(page, 0);
    t.eq(enc.map(e => e.tag), [...Array(N_MESES).fill('Real'), ...Array(12 - N_MESES).fill('Proy.')], 'tabla de ingresos: Ene–Jul "Real" y Ago–Dic "Proy." (como siempre)');
    t.eq(await celdasIngresoReal(page), MESES.map((m, i) => i + 1 <= N_MESES), 'y las celdas de monto llevan el mismo color Real/Proy.');
    t.eq(mesesRealesDe(await encabezadosMes(page, 1)), base['1121'].rem.real_hasta_mes || N_MESES, 'Remuneraciones conserva su propio corte, independiente del de ingresos');
    await cerrarModal(h);
    // Las cifras son las de siempre (corte = DATA.n_meses = julio para todos los RBD).
    const esp = ingresoEsperado(base);
    t.eq(soloIngresos(await ingresosSep(page)), soloIngresos(esp), 'KPI de SEP: ingreso y Carrera Docente Real / Proyectado = los del fixture cortados en julio');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 2) Cambiar el corte de un RBD: guardado y efecto en todas las vistas
  await escenario(t, 'cambiar el corte de un RBD', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    const antes = await ingresosSep(page);
    const serieAntes = await serieDashboard(page, 'real');
    const serieProyAntes = await serieDashboard(page, 'proy');
    const sepAntes = await tarjetaSepDashboard(page, 'real');
    const vzAntes = await visualizadorSep(page);
    const notaAntes = await notaEjecucionConsolidado(page);
    t.ok(/el ingreso es real hasta Julio y las remuneraciones/.test(notaAntes), '% Ejecución consolidado, antes: "el ingreso es real hasta Julio…"', notaAntes);
    t.ok(/ingreso real hasta Julio, remuneraciones según el corte de cada RBD/.test(vzAntes.nota), 'Visualizador, antes: "ingreso real hasta Julio…"', vzAntes.nota);

    await abrirModal(h);
    await h.clearWrites();
    await page.evaluate(() => { window.__selIng = document.getElementById('ingRealHasta-1121'); window.__tablaIng = document.querySelector('#modalBody table.detalle-table'); });
    await page.selectOption('#ingRealHasta-1121', '9');
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.map(w => w.path), [RUTA('1121')], 'un solo write, al documento del RBD');
    t.ok(ws[0] && ws[0].options.merge === true, 'con merge:true');
    t.eq(Object.keys(ws[0].payload).sort(), ['ingreso_real_hasta_mes', 'lastModifiedAt', 'lastModifiedBy', 'nombre'], 'el payload trae solo el campo nuevo (+ nombre y auditoría)');
    t.eq(ws[0].payload.ingreso_real_hasta_mes, 9, 'ingreso_real_hasta_mes = 9 (entero, campo raíz)');
    const st = await h.store();
    t.eq(st[RUTA('1121')].ingreso_real_hasta_mes, 9, 'servidor: ingreso_real_hasta_mes = 9');
    const sinCampo = (d) => { const c = clon(d); delete c.ingreso_real_hasta_mes; delete c.lastModifiedAt; delete c.lastModifiedBy; return c; };
    t.eq(sinCampo(st[RUTA('1121')]), sinCampo(base['1121']), 'el resto del documento (ingresos, remuneraciones, compras, fuentes…) no cambia');
    t.eq(h.dialogs.length, 0, 'sin avisos ni confirmaciones');

    // Modal: encabezados, celdas y nota
    const enc = await encabezadosMes(page, 0);
    t.eq(enc.map(e => e.tag), [...Array(9).fill('Real'), ...Array(3).fill('Proy.')], 'tabla de ingresos: Ene–Sep "Real", Oct–Dic "Proy."');
    t.eq(await celdasIngresoReal(page, 'Ingreso SEP Prioritario'), MESES.map((m, i) => i < 9), 'las celdas de monto (también Prioritario) cambian de color con el corte');
    t.eq(await celdasIngresoReal(page, 'Carrera Docente'), MESES.map((m, i) => i < 9), 'y Carrera Docente');
    t.eq(mesesRealesDe(await encabezadosMes(page, 1)), base['1121'].rem.real_hasta_mes || N_MESES, 'Remuneraciones no se mueve');
    t.eq(await page.evaluate(() => document.querySelector('#ingRealHasta-1121').parentElement.querySelector('.corte-origen').textContent.trim()), 'corte propio', 'la nota pasa a "corte propio"');
    t.ok(await page.evaluate(() => document.getElementById('ingRealHasta-1121') === window.__selIng && document.querySelector('#modalBody table.detalle-table') === window.__tablaIng), 'el modal se reconcilia sin reconstruirse: el selector y la tabla son los mismos nodos');
    await cerrarModal(h);

    // KPI de SEP: solo cambia lo del RBD 1121 (agosto y septiembre pasan de Proyectado a Real)
    const docsMod = clon(base); docsMod['1121'].ingreso_real_hasta_mes = 9;
    const espAntes = ingresoEsperado(base), espDesp = ingresoEsperado(docsMod);
    const despues = await ingresosSep(page);
    t.eq(soloIngresos(despues), soloIngresos(espDesp), 'KPI de SEP: ingreso Real / Proyectado = fixture con el corte 9 en 1121');
    t.eq(despues.prefPrioReal - antes.prefPrioReal, espDesp.porRbd['1121'].prefPrioReal - espAntes.porRbd['1121'].prefPrioReal, 'el ingreso Real sube exactamente lo de agosto+septiembre de 1121 (Preferente+Prioritario)');
    t.eq(despues.prefPrioReal + despues.prefPrioProy, antes.prefPrioReal + antes.prefPrioProy, 'el ingreso anual (Real+Proy) NO cambia: solo se reparte distinto');
    t.eq(despues.saldoReal - antes.saldoReal, (despues.prefPrioReal + despues.carreraReal) - (antes.prefPrioReal + antes.carreraReal), 'el Saldo Real sube lo mismo que el ingreso Real (los gastos no cambian)');
    // Panel principal: tarjeta SEP y serie mensual
    const sepDesp = await tarjetaSepDashboard(page, 'real');
    t.eq(sepDesp.ing - sepAntes.ing, (espDesp.prefPrioReal + espDesp.carreraReal) - (espAntes.prefPrioReal + espAntes.carreraReal), 'Panel principal, tarjeta SEP (vista Real): el ingreso sube lo mismo');
    t.eq(sepDesp.rem, sepAntes.rem, 'y la remuneración Real no cambia');
    const serieDesp = await serieDashboard(page, 'real');
    const serieProyDesp = await serieDashboard(page, 'proy');
    const dReal = serieDesp.ing.map((v, i) => v - serieAntes.ing[i]);
    t.eq(dReal, espDesp.porMesReal.map((v, i) => v - espAntes.porMesReal[i]), 'serie mensual (Real): solo cambian agosto y septiembre, por el ingreso de 1121');
    t.ok(dReal[7] > 0 && dReal[8] > 0 && dReal.filter((v, i) => i !== 7 && i !== 8).every(v => v === 0), 'agosto y septiembre suben; el resto de los meses queda igual', dReal);
    t.eq(serieProyDesp.ing.map((v, i) => v - serieProyAntes.ing[i]), dReal.map(v => -v), 'serie mensual (Proy.): baja exactamente lo que subió Real');
    t.eq(serieDesp.gas, serieAntes.gas, 'y el gasto de la serie no cambia');
    // Visualizador
    const vzDesp = await visualizadorSep(page);
    const totalIngReal = (e) => suma(e.porMesReal), totalIngProy = (e) => suma(e.porMesProy);
    t.eq(vzDesp['Saldo Real'] - vzAntes['Saldo Real'], totalIngReal(espDesp) - totalIngReal(espAntes), 'Visualizador: los Ingresos Real suben lo mismo (incluye Carrera Docente)');
    t.eq(vzDesp['Saldo Proyectado'] - vzAntes['Saldo Proyectado'], totalIngProy(espDesp) - totalIngProy(espAntes), 'y los Ingresos Proyectado bajan lo mismo');
    t.ok(/ingreso real entre Julio y Septiembre \(corte propio de cada RBD\), remuneraciones/.test(vzDesp.nota), 'la nota del Visualizador deja de decir "hasta Julio": "entre Julio y Septiembre (corte propio de cada RBD)"', vzDesp.nota);
    // Reporte personalizado: colores por celda y subtotal solo si todos coinciden
    const filas = await reportePersonalizado(page, { entidades: ['1121', '1122'], conceptos: ['ingreso|Ingreso SEP Preferente'], meses: ['JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE'] });
    const f1121 = filas.find(f => f.rbd === '1121'), f1122 = filas.find(f => f.rbd === '1122'), sub = filas.find(f => f.subtotal);
    t.eq(f1121.celdas.map(c => c.clase), ['real', 'real', 'real', 'real', 'proy'], 'Reporte personalizado, 1121 (corte 9): junio–septiembre Real, octubre Proy.');
    t.eq(f1122.celdas.map(c => c.clase), ['real', 'real', 'proy', 'proy', 'proy'], 'Reporte personalizado, 1122 (sin corte propio, julio): junio–julio Real, agosto en adelante Proy.');
    t.eq(sub.celdas.map(c => c.clase), ['real', 'real', '', '', 'proy'], 'el subtotal solo se colorea en los meses en que los dos RBD coinciden (agosto y septiembre quedan sin color)');
    // % Ejecución consolidado
    const notaDesp = await notaEjecucionConsolidado(page);
    t.ok(/el ingreso es real entre Julio y Septiembre \(corte propio de cada RBD\) y las remuneraciones/.test(notaDesp), '% Ejecución consolidado: "el ingreso es real entre Julio y Septiembre (corte propio de cada RBD)…"', notaDesp);
    await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
    const tipos = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecTbody tr')).map(tr => tr.children[1].textContent.trim()));
    t.eq(tipos.slice(0, 3), ['Real', 'Real', 'Real'], 'la tabla de % Ejecución sigue clasificando los meses con los cortes de todas las entidades (enero–marzo Real)');

    // PDF de la fila
    await clickTab(page, 'SEP');
    await page.evaluate(() => { const orig = window.print; window.print = function () { window.__htmlFila = document.getElementById('printSingleWrap').innerHTML; return orig.apply(this, arguments); }; });
    await page.click('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1121"]');
    await h.waitIdle();
    const htmlFila = await page.evaluate(() => window.__htmlFila || '');
    t.ok(/Ingresos reales hasta: <strong>Septiembre<\/strong>/.test(htmlFila), 'PDF de la fila: "Ingresos reales hasta: Septiembre"');
    t.ok(!/<select/.test(htmlFila.slice(0, htmlFila.indexOf('Ingreso SEP (detalle)'))), 'y en el PDF va como texto (sin selector)');
    const kpiPdf = await page.evaluate(() => Array.from(document.querySelectorAll('#printSingleWrap .kpi-row-real .kpi-card')).map(c => c.textContent.replace(/\s+/g, ' ').trim()));
    t.ok(kpiPdf.some(x => x.includes('Ingreso SEP (Real)') && x.includes(parseInt(espDesp.porRbd['1121'].prefPrioReal, 10).toLocaleString('es-CL'))), 'las tarjetas Real del PDF de la fila usan el corte propio', kpiPdf);
    // Respaldo JSON: lleva el corte solo en el RBD que lo tiene
    const dl = await page.evaluate(async () => {
      const store = [];
      const orig = URL.createObjectURL;
      URL.createObjectURL = (b) => { store.push(b); return orig.call(URL, b); };
      document.getElementById('downloadCargaBtn').click();
      await new Promise(r => setTimeout(r, 100));
      URL.createObjectURL = orig;
      return store.length ? await store[0].text() : null;
    });
    const json = JSON.parse(dl);
    t.eq(json.ingreso_items_por_rbd['1121'].real_hasta_mes, 9, 'respaldo JSON: el RBD con corte propio lo trae (ingreso_items_por_rbd.1121.real_hasta_mes)');
    t.ok(!('real_hasta_mes' in json.ingreso_items_por_rbd['1122']), 'y los RBD sin corte propio no ganan la clave');
    // Recarga: el corte persiste
    await page.reload();
    await esperarPanelListo(page);
    await abrirModal(h);
    t.eq(await page.evaluate(() => document.getElementById('ingRealHasta-1121').value), '9', 'tras recargar la página el corte sigue en Septiembre');
    t.eq(mesesRealesDe(await encabezadosMes(page, 0)), 9, 'y las columnas también');
    // Otra persona cambia el corte de ese RBD: el modal abierto lo refleja
    await h.remoto('1121', 'd.ingreso_real_hasta_mes = 10');
    await h.waitIdle();
    t.eq(await page.evaluate(() => document.getElementById('ingRealHasta-1121').value), '10', 'un cambio remoto del corte se ve en el modal abierto (Octubre)');
    t.eq(mesesRealesDe(await encabezadosMes(page, 0)), 10, 'con sus columnas');
    await h.remoto('1121', 'delete d.ingreso_real_hasta_mes');
    await h.waitIdle();
    t.eq([await page.evaluate(() => document.getElementById('ingRealHasta-1121').value), mesesRealesDe(await encabezadosMes(page, 0))], ['7', 7], 'si la otra persona borra el corte propio, vuelve al valor por defecto (Julio)');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 3) El selector no cambia al RBD vecino ni a Remuneraciones; volver al mismo valor
  await escenario(t, 'aislamiento entre RBD', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await abrirModal(h, '1122');
    await page.selectOption('#ingRealHasta-1122', '12');
    await h.flushWrites();
    t.eq(mesesRealesDe(await encabezadosMes(page, 0)), 12, '1122 con corte 12: todas las columnas Real');
    await cerrarModal(h);
    await abrirModal(h, '1121');
    t.eq(mesesRealesDe(await encabezadosMes(page, 0)), N_MESES, 'el RBD 1121 sigue en julio (el corte es por RBD)');
    const st = await h.store();
    t.ok(!('ingreso_real_hasta_mes' in st[RUTA('1121')]), 'y su documento no ganó el campo');
    t.eq(st[RUTA('1122')].ingreso_real_hasta_mes, 12, 'el de 1122 sí');
    const esp = ingresoEsperado({ ...clon(base), 1122: { ...clon(base['1122']), ingreso_real_hasta_mes: 12 } });
    t.eq(soloIngresos(await ingresosSep(page)), soloIngresos(esp), 'KPI de SEP coincide con el fixture con 1122 en 12');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 4) Fallback: propio > mes de cierre global > DATA.n_meses
  await escenario(t, 'fallback con mes de cierre', async () => {
    const docs = docsDe('cierre');   // _meta.mes_cierre = 9; 1121 → 8, 1122 → 9, 1123 → 12; el resto sin corte propio
    const h = await boot({ fixture: docs });
    const { page } = h;
    const nota = async (rbd) => page.evaluate((r) => document.querySelector(`#ingRealHasta-${r}`).parentElement.querySelector('.corte-origen').textContent.trim(), rbd);
    const lee = async (rbd) => { await abrirModal(h, rbd); const o = { sel: await page.evaluate((r) => document.getElementById(`ingRealHasta-${r}`).value, rbd), reales: mesesRealesDe(await encabezadosMes(page, 0)), nota: await nota(rbd) }; await cerrarModal(h); return o; };
    t.eq(await lee('1128'), { sel: '9', reales: 9, nota: 'sigue el mes de cierre' }, 'RBD sin corte propio: usa el mes de cierre (Septiembre) y lo dice');
    t.eq(await lee('1121'), { sel: '8', reales: 8, nota: 'corte propio, distinto al mes de cierre (Septiembre)' }, 'RBD con corte propio distinto: manda el propio (Agosto) y avisa que difiere del cierre');
    t.eq(await lee('1122'), { sel: '9', reales: 9, nota: 'corte propio' }, 'RBD con corte propio igual al cierre: "corte propio"');
    t.eq(await lee('1123'), { sel: '12', reales: 12, nota: 'corte propio, distinto al mes de cierre (Septiembre)' }, 'corte propio 12: todo Real');
    t.eq(soloIngresos(await ingresosSep(page)), soloIngresos(ingresoEsperado(docs)), 'KPI de SEP = fixture con esos cortes (todos los demás RBD en septiembre)');
    // El cierre global cambia (otra persona): solo se mueven los RBD sin corte propio
    await h.remoto('_meta', 'd.mes_cierre = 10; d.mes_cierre_por = "wilson.rojas@sleppetorca.gob.cl"');
    await h.waitIdle();
    t.eq([(await lee('1128')).reales, (await lee('1121')).reales], [10, 8], 'cierre → Octubre: el RBD sin corte propio pasa a 10; el que tiene corte propio (Agosto) no se mueve');
    const d2 = clon(docs); d2._meta.mes_cierre = 10;
    t.eq(soloIngresos(await ingresosSep(page)), soloIngresos(ingresoEsperado(d2)), 'y los KPI siguen al fixture con cierre 10');
    // Sin mes de cierre (o con uno dañado): vuelve a DATA.n_meses
    for (const malo of [undefined, null, 0, 13, -3, 7.5, 'x', '', true, [], {}]) {
      await h.remoto('_meta', 'if (arg === "__undef__") delete d.mes_cierre; else d.mes_cierre = arg;', malo === undefined ? '__undef__' : malo);
      await h.waitIdle();
      const r = await lee('1128');
      t.eq([r.reales, r.nota], [N_MESES, 'por defecto'], `mes_cierre ${malo === undefined ? 'ausente' : JSON.stringify(malo)}: se ignora y el RBD sin corte propio usa DATA.n_meses (Julio)`);
    }
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 5) Valores dañados del corte propio
  await escenario(t, 'corte propio dañado', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    for (const [malo, esperado] of [[13, 7], [0, 7], [-1, 7], [7.5, 7], ['x', 7], [null, 7], [true, 7], [[], 7], [{}, 7], ['9', 9], [12, 12], [1, 1]]) {
      await h.remoto('1121', 'd.ingreso_real_hasta_mes = arg', malo);
      await h.waitIdle();
      await abrirModal(h);
      t.eq(await page.evaluate(() => document.getElementById('ingRealHasta-1121').value), String(esperado), `ingreso_real_hasta_mes ${JSON.stringify(malo)} → ${esperado === 7 ? 'se ignora (Julio)' : 'se acepta como ' + esperado}`);
      await cerrarModal(h);
    }
    const sinNada = soloIngresos(ingresoEsperado(base));
    await h.remoto('1121', 'd.ingreso_real_hasta_mes = "x"');
    await h.waitIdle();
    t.eq(soloIngresos(await ingresosSep(page)), sinNada, 'con un valor dañado las cifras son las de siempre');
    t.eq(await page.evaluate(() => document.getElementById('sync-text').textContent.includes('inválid')), false, 'y no se marca el documento como inválido');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 6) Excel de respaldo de SEP: no lleva cortes (ni el de remuneraciones ni el de ingresos) y reimportarlo no los toca
  await escenario(t, 'Excel de respaldo', async () => {
    const docs = docsDe('cierre');   // 1121 con corte propio de ingresos en agosto
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    const dl = await capturarDescarga(page, () => page.click('#downloadExcelBtn'));
    const libro = await leerXlsx(page, dl.buffer);
    t.eq(libro.orden, ['INGRESO', 'REMUNERACIONES', 'SUBT22', 'SUBT29', 'COMPRAS', 'BYS_PROYECCION', 'HONORARIOS', 'HON_PROYECCION'], 'el Excel de carga de SEP conserva sus 6 hojas de siempre y solo suma las 2 de Honorarios (sin hoja nueva de cortes)');
    t.ok(libro.orden.every(n => !(libro.hojas[n][0] || []).some(c => /hasta|corte|cierre/i.test(String(c)))), 'ninguna hoja trae una columna de corte (tampoco el de remuneraciones, que nunca la tuvo): los archivos antiguos siguen siendo válidos');
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.setInputFiles('#importExcelInput', { name: dl.filename, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: dl.buffer });
    for (let i = 0; i < 200 && !h.dialogs.length; i++) await page.waitForTimeout(50);
    await page.waitForTimeout(900);   // la importación agenda los guardados con el debounce de 400 ms
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.ok(ws.length > 0, 'reimportar el Excel escribe los documentos como siempre', ws.length);
    t.ok(ws.every(w => !('ingreso_real_hasta_mes' in w.payload) && !(w.payload.rem && 'real_hasta_mes' in w.payload.rem)), 'pero ningún write lleva ingreso_real_hasta_mes ni rem.real_hasta_mes: el corte no se pisa ni se borra');
    t.eq((await h.store())[RUTA('1121')].ingreso_real_hasta_mes, 8, 'servidor: el corte propio de 1121 sigue en Agosto');
    await abrirModal(h);
    t.eq(mesesRealesDe(await encabezadosMes(page, 0)), 8, 'y el modal sigue con las columnas Real hasta Agosto');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 7) Sin cambio de cifras mientras no se defina nada (comparación contra "cierre = julio")
  await escenario(t, 'sin cambio de cifras', async () => {
    const leer = async (docs) => {
      const h = await boot({ fixture: docs });
      const { page } = h;
      const o = { sep: await ingresosSep(page), real: await serieDashboard(page, 'real'), proy: await serieDashboard(page, 'proy'), total: await serieDashboard(page, 'total'), vz: (await visualizadorSep(page)) };
      delete o.vz.nota;
      o.rep = await reportePersonalizado(page, { entidades: ['1121', '1122', '1123'], conceptos: ['ingreso|Ingreso SEP Preferente', 'ingreso|Ingreso SEP Prioritario', 'rem'], meses: MESES });
      o.dash = await tarjetaSepDashboard(page, 'real');
      t.noErrores(h);
      await h.close();
      return o;
    };
    const inicial = await leer(base);
    const conCierreJulio = clon(base); conCierreJulio._meta.mes_cierre = N_MESES;
    const conTodosJulio = clon(base); RBD_IDS.forEach(r => { if (conTodosJulio[r]) conTodosJulio[r].ingreso_real_hasta_mes = N_MESES; });
    t.eq(await leer(conCierreJulio), inicial, 'definir el mes de cierre en Julio (= DATA.n_meses) no cambia ninguna cifra ni color del Panel principal, SEP, Visualizador ni Reportes');
    t.eq(await leer(conTodosJulio), inicial, 'ni fijar el corte propio de todos los RBD en Julio');
  });
});
