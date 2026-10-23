// L-09 — % Ejecución (SEP) rotulaba "Real" todos los meses ≤ el selector "Ver resumen acumulado hasta el mes" (por defecto Diciembre: los 12 meses salían "Real" aunque el corte real
// fuera julio o septiembre; los proyectados se veían como reales). Ahora el rótulo y el estilo Real / Proyectado de cada mes salen del CORTE REAL efectivo: ingresos (corte propio del
// RBD > mes de cierre global > DATA.n_meses) y remuneraciones (rem.real_hasta_mes); las compras siempre son reales. El selector solo decide hasta qué mes se acumulan las casillas "a <mes>".
// Convención con varios cortes (la misma de % Ejecución por fuente y del Visualizador): Real si TODOS los cortes cubren el mes (mes ≤ el menor), Proy. si ninguno (mes > el mayor) y Mixto
// entre medio (RBD con cortes distintos, o ingresos y remuneraciones de un mismo RBD con cortes distintos). Las fuentes y el Consolidado ya usaban sus cortes: se prueba que siguen igual.
// Debe FALLAR contra APP_HTML=@3d5b041 (en SEP).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { RBD_IDS, FUENTES, MESES_TITULO, N_MESES, corteIngreso, corteRem, corteFuente } from '../lib/corte.mjs';
import { idsDeFuente } from '../lib/estado.mjs';

const TXT = { real: 'Real', proy: 'Proy.', mixto: 'Mixto' };
const TT = { real: 'Real', proy: 'Proyectado', mixto: 'Mixto' };
const tipoMes = (idx, min, max) => (idx <= min ? 'real' : (idx > max ? 'proy' : 'mixto'));
const tiposDe = (cortes) => { const min = Math.min(...cortes), max = Math.max(...cortes); return { min, max, tipos: MESES_TITULO.map((_, i) => tipoMes(i + 1, min, max)) }; };
const cortesSepRbd = (docs, rbd) => [corteIngreso(docs, rbd), ...(docs[rbd] && docs[rbd].rem ? [corteRem(docs, rbd)] : [])];
const cortesSep = (docs, rbds) => rbds.flatMap(r => cortesSepRbd(docs, r));
const cortesFuente = (docs, key) => idsDeFuente(key).map(id => corteFuente(docs, id, key));

async function tipos(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#ejecTbody tr')).map(tr => ({ mes: tr.children[0].textContent.trim(), txt: tr.children[1].textContent.trim(), clase: tr.children[1].className })));
}
async function elegirFuente(page, h, key) { await page.click(`#ejecFuenteChips .of-chip[data-ejec-fuente="${key}"]`); await h.waitIdle(); }
async function elegirRbd(page, h, rbd) {
  await page.evaluate((v) => { const s = document.getElementById('ejecRbdSelect'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, rbd);
  await h.waitIdle();
}
async function elegirCorte(page, h, mes) {
  await page.evaluate((v) => { const s = document.getElementById('corteMesSelect'); s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }, mes);
  await h.waitIdle();
}
// posición x (en el SVG de 900 px) de la línea "Corte" y ¿hay tramo punteado (Proyectado)?
async function grafico(page) {
  return page.evaluate(() => {
    const l = document.querySelector('#ejecChartWrap .ejec-corte-line');
    return { corteX: l ? Number(l.getAttribute('x1')) : null, etiqueta: !!document.querySelector('#ejecChartWrap .ejec-corte-label'), punteado: document.querySelectorAll('#ejecChartWrap polyline.proy').length };
  });
}
const xDeMes = (mes) => 44 + (mes - 1) / 11 * (900 - 44 - 54);   // margen izq. 44, derecho 54 (SEP): x del mes `mes` (1–12)
async function tooltip(page, idx) {
  await page.dispatchEvent(`#ejecChartWrap .ejec-hit-col[data-idx="${idx}"]`, 'pointerenter');
  return page.evaluate(() => (document.querySelector('#ejecTooltip .tt-title') || {}).textContent || '');
}

async function revisarSep(t, h, docs, rbds, etiqueta, cortes) {
  const { page } = h;
  const { min, max, tipos: esperado } = tiposDe(cortes);
  const filas = await tipos(page);
  t.eq(filas.map(f => f.txt), esperado.map(x => TXT[x]), `${etiqueta}: la columna Corte de la tabla = Real hasta ${MESES_TITULO[min - 1]}, Mixto hasta ${MESES_TITULO[max - 1]}, Proy. después`);
  t.eq(filas.map(f => f.clase.replace(/\s+/g, ' ').trim()), esperado.map(x => `mes-${x}`), `${etiqueta}: y el estilo de cada celda (clase mes-real / mes-mixto / mes-proy)`);
  const g = await grafico(page);
  if (min < 12) t.ok(g.etiqueta && Math.abs(g.corteX - xDeMes(min)) < 0.6, `${etiqueta}: la línea "Corte" del gráfico está en ${MESES_TITULO[min - 1]} (x=${g.corteX})`);
  else t.ok(!g.etiqueta, `${etiqueta}: todos los cortes son diciembre → el gráfico no dibuja línea de corte`);
  t.eq(g.punteado > 0, min < 12, `${etiqueta}: tramo punteado (proyectado) en el gráfico ⇔ el corte real es anterior a diciembre`);
  // tooltip de tres meses característicos
  for (const idx of new Set([0, Math.min(11, min), 11])) {
    const txt = await tooltip(page, idx);
    t.eq(txt, `${MESES_TITULO[idx]} · ${TT[esperado[idx]]}`, `${etiqueta}: tooltip de ${MESES_TITULO[idx]} → ${TT[esperado[idx]]}`);
  }
  return { min, max, esperado };
}

await correrSpec('ejecucion_rotulos', async (t) => {
  // ============================================================== fixture default: sin mes de cierre (ingresos reales hasta julio) y remuneraciones con cortes variados
  const docs = cargarFixture('default').docs;
  let h = await boot({ fixture: 'default', user: 'authorized' });
  let page = h.page;
  await clickTab(page, 'SEP');
  t.eq(await page.evaluate(() => document.getElementById('corteMesSelect').value), '12', 'el selector "Ver resumen … hasta el mes" arranca en Diciembre (el valor por defecto que provocaba el defecto)');
  await clickTab(page, '% Ejecución');
  const cDefault = cortesSep(docs, RBD_IDS);
  const A = await revisarSep(t, h, docs, RBD_IDS, 'SEP agregado (default, selector en Diciembre)', cDefault);
  t.ok(A.min < 12 && A.max === 12, `en el fixture los cortes reales van de ${MESES_TITULO[A.min - 1]} a Diciembre: con el defecto antiguo los 12 meses saldrían "Real"`);
  const filas0 = await tipos(page);
  t.ok(filas0.filter(f => f.txt === 'Real').length < 12, 'no todos los meses se rotulan "Real" aunque el selector esté en Diciembre');

  // cambiar el selector de acumulación NO cambia qué es Real o Proyectado (solo las casillas "a <mes>")
  await clickTab(page, 'SEP');
  await elegirCorte(page, h, 3);
  await clickTab(page, '% Ejecución');
  const kpiMarzo = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card .label')).map(e => e.textContent.trim()));
  t.ok(kpiMarzo.some(l => /\(a Marzo\)/.test(l)), 'con el selector en Marzo las casillas dicen "(a Marzo)": el selector sí decide hasta dónde se acumula → ' + kpiMarzo.join(' | '));
  await revisarSep(t, h, docs, RBD_IDS, 'SEP agregado (default, selector en Marzo)', cDefault);
  const nota = await page.evaluate(() => document.getElementById('ejecCorteNota').textContent);
  t.ok(/según el corte real de cada RBD/.test(nota) && /ese selector no cambia qué meses son Real o Proyectados/.test(nota) && /Mixto/.test(nota), 'la nota explica el corte real y que el selector no cambia Real / Proyectado → ' + nota);
  await clickTab(page, 'SEP');
  await elegirCorte(page, h, 12);
  await clickTab(page, '% Ejecución');

  // un RBD: ingresos y remuneraciones con el mismo corte, con cortes distintos, y remuneraciones sin corte propio
  for (const rbd of ['1121', '1123', '1128', '1139']) {
    await elegirRbd(page, h, rbd);
    const c = cortesSepRbd(docs, rbd);
    const r = await revisarSep(t, h, docs, [rbd], `SEP RBD ${rbd} (ingresos ${c[0]}, remuneraciones ${c[1]})`, c);
    if (c[0] !== c[1]) t.ok(r.max > r.min, `RBD ${rbd}: con ingresos y remuneraciones en cortes distintos el mes intermedio es Mixto`);
  }
  await elegirRbd(page, h, '');

  // ============================================================== consolidado y fuentes (ya usaban sus cortes; se fija que siguen igual, también al mover el selector)
  await clickTab(page, 'SEP');
  await elegirCorte(page, h, 3);
  await clickTab(page, '% Ejecución');
  for (const f of FUENTES) {
    await elegirFuente(page, h, f.key);
    const { tipos: esp } = tiposDe(cortesFuente(docs, f.key));
    t.eq((await tipos(page)).map(x => x.txt), esp.map(x => TXT[x]), `${f.corto}: Real / Proy. / Mixto según el "Real hasta" de cada entidad (selector en Marzo; no interviene)`);
  }
  await elegirFuente(page, h, 'consolidado');
  const cons = tiposDe([...cortesSep(docs, RBD_IDS), ...FUENTES.flatMap(f => cortesFuente(docs, f.key))]);
  t.eq((await tipos(page)).map(x => x.txt), cons.tipos.map(x => TXT[x]), 'Consolidado: cortes de SEP (ingresos y remuneraciones) y de las 9 fuentes, con el selector en Marzo');
  await h.close();

  // ============================================================== fixture cierre: mes de cierre = septiembre, ingresos con corte propio en 3 RBD y remuneraciones con cortes propios
  const docsC = cargarFixture('cierre').docs;
  h = await boot({ fixture: 'cierre', user: 'authorized' });
  page = h.page;
  await clickTab(page, '% Ejecución');
  const cC = cortesSep(docsC, RBD_IDS);
  const B = await revisarSep(t, h, docsC, RBD_IDS, 'SEP agregado (cierre = septiembre)', cC);
  t.eq([B.min, B.max], [5, 12], 'con el fixture cierre los cortes reales van de Mayo (remuneraciones de 1128) a Diciembre');
  for (const [rbd, esp] of [['1121', [8, 7]], ['1122', [9, 9]], ['1123', [12, 12]], ['1125', [9, 9]]]) {
    await elegirRbd(page, h, rbd);
    t.eq(cortesSepRbd(docsC, rbd), esp, `fixture cierre: RBD ${rbd} tiene cortes de ingresos y remuneraciones ${esp.join(' / ')}`);
    await revisarSep(t, h, docsC, [rbd], `SEP RBD ${rbd} (cierre; ingresos ${esp[0]}, remuneraciones ${esp[1]})`, esp);
  }
  // 1121: ingresos reales hasta agosto y remuneraciones hasta julio → agosto es Mixto (un RBD, dos cortes)
  await elegirRbd(page, h, '1121');
  t.eq((await tipos(page))[7].txt, 'Mixto', 'RBD 1121 (ingresos hasta Agosto, remuneraciones hasta Julio): Agosto = Mixto');
  // 1123: todo real hasta diciembre → los 12 meses Real, sin tramo punteado
  await elegirRbd(page, h, '1123');
  t.eq((await tipos(page)).every(x => x.txt === 'Real'), true, 'RBD 1123 (todo real hasta Diciembre): los 12 meses son Real');
  t.eq((await grafico(page)).punteado, 0, '…y el gráfico no tiene tramo punteado');
  await elegirRbd(page, h, '');
  // el mes de cierre es el default de los ingresos: si se mueve el cierre desde "otra persona" cambian los rótulos del RBD que lo sigue
  await h.remoto('_meta', 'd.mes_cierre = 6; d.mes_cierre_por = "juan.bustamante@sleppetorca.gob.cl";');
  await h.waitIdle();
  await elegirRbd(page, h, '1125');
  const docs6 = JSON.parse(JSON.stringify(docsC)); docs6._meta = { ...docs6._meta, mes_cierre: 6 };
  const c1125 = cortesSepRbd(docs6, '1125');
  t.eq(c1125, [6, 9], 'tras mover el mes de cierre a Junio: 1125 tiene ingresos hasta Junio y remuneraciones hasta Septiembre (su corte propio)');
  await revisarSep(t, h, docs6, ['1125'], 'SEP RBD 1125 tras mover el mes de cierre a Junio', c1125);
  t.noErrores(h);
  await h.close();
});
