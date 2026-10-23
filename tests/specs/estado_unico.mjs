// L-07 — Estado ÚNICO y sin redondear (SEP y las 9 fuentes). Antes había dos definiciones: SEP decidía con el % redondeado a 1 decimal (99,996 % → "100,0 %" → Déficit con
// saldo positivo; 100 % exacto con saldo 0 → Déficit; recurso 0 con gasto → 0 % → Superávit) y las fuentes con el signo del saldo. Regla nueva, una sola función:
//   Déficit ⇔ saldo < 0 · Riesgo (solo SEP) ⇔ gasto/recurso ≥ 90 % exacto y saldo ≥ 0 · si no, Superávit.
// Con el fixture `estado` (tests/fixtures/generate.mjs) se prueban los bordes (saldo 0, 99,996 %, -$1, 89,999 % vs 90,000 %, recurso 0, Carrera Docente) y que TODO lugar que
// cuenta o lista "entidades en déficit" coincide entre sí y con un cálculo independiente (tests/lib/estado.mjs, con BigInt): tabla y filtro de SEP, tarjeta KPI de SEP y de cada fuente,
// tarjetas por fuente y franja del Panel principal, lista "Atención", y las exportaciones (CSV/Excel de resumen, PDF, CSV de detalle de las fuentes).
// Debe FALLAR contra el index.html anterior (APP_HTML=@3d5b041).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';
import { RBD_IDS, FUENTES } from '../lib/corte.mjs';
import {
  ETIQUETA, esperadoDe, universoSep, conteoSep, conteoFuente, estadoAntiguoSep, sepPorFiltro, filaSep, filasFuente, tarjeta, leerDashboard, nDeM, idsDeFuente, SIN_MARCO,
} from '../lib/estado.mjs';

const ordenar = (a) => a.slice().sort();

await correrSpec('estado_unico', async (t) => {
  const docs = cargarFixture('estado').docs;
  const E = esperadoDe(docs);
  const universo = universoSep(docs, E);
  const cSep = conteoSep(E, universo);
  const h = await boot({ fixture: 'estado', user: 'authorized' });
  const { page } = h;

  // ---------------------------------------------------------------- 0) el oráculo mismo (para que un fixture roto no pase por casualidad)
  t.eq(E.sep['1130'], { recurso: 10000000, gasto: 10000000, saldo: 0, estado: 'riesgo' }, 'oráculo: 1130 = saldo exactamente 0 → Riesgo');
  t.eq(E.sep['1131'].estado, 'riesgo', 'oráculo: 99,996 % → Riesgo (no Déficit)');
  t.eq(E.sep['1132'], { recurso: 10000000, gasto: 10000001, saldo: -1, estado: 'deficit' }, 'oráculo: saldo -$1 → Déficit');
  t.eq([E.sep['1133'].estado, E.sep['1134'].estado], ['superavit', 'riesgo'], 'oráculo: 89,999 % → Superávit, 90,000 % → Riesgo');
  t.eq([E.sep['1135'].estado, E.sep['1136'].estado], ['superavit', 'deficit'], 'oráculo: recurso 0 sin gasto → Superávit; recurso 0 con gasto → Déficit');
  t.eq(E.sep['1137'], { recurso: 12000000, gasto: 12000000, saldo: 0, estado: 'riesgo' }, 'oráculo: la Carrera Docente suma al recurso (saldo 0 → Riesgo)');
  t.ok(['deficit', 'riesgo', 'superavit'].every(k => cSep[k] > 0), `el fixture cubre los 3 estados de SEP (déficit ${cSep.deficit}, riesgo ${cSep.riesgo}, superávit ${cSep.superavit})`);
  // Con la regla antigua (% redondeado) los bordes caían en otro Estado: es lo que hace que este spec falle contra 3d5b041.
  const cambian = ['1130', '1131', '1133', '1136', '1137'].filter(r => estadoAntiguoSep(E.sep[r].recurso, E.sep[r].gasto) !== E.sep[r].estado);
  t.eq(cambian, ['1130', '1131', '1133', '1136', '1137'], 'los 5 bordes que antes caían en otro Estado');

  // ---------------------------------------------------------------- 1) SEP: filas y filtro
  await clickTab(page, 'SEP');
  const esperadoFila = {
    1130: ['$0', '100,0%', 'En riesgo'], 1131: ['$400', '100,0%', 'En riesgo'], 1132: ['-$1', '100,0%', 'Déficit'], 1133: ['$1.000.100', '90,0%', 'Superávit'],
    1134: ['$1.000.000', '90,0%', 'En riesgo'], 1135: ['$0', '0,0%', 'Superávit'], 1136: ['-$500.000', '0,0%', 'Déficit'], 1137: ['$0', '100,0%', 'En riesgo'],
    1139: ['$500.000', '95,0%', 'En riesgo'], 1140: ['$5.000.000', '50,0%', 'Superávit'],
  };
  for (const [rbd, [saldo, pct, estado]] of Object.entries(esperadoFila)) {
    const f = await filaSep(page, rbd);
    t.eq([f.saldo, f.pct, f.estado], [saldo, pct, estado], `SEP ${rbd}: saldo ${saldo} · % ${pct} · Estado ${estado}`);
  }
  const fSin = await filaSep(page, '1120');
  t.ok(/Sin marco SEP/.test(fSin.estado), 'SEP 1120 (sin marco, con gasto) conserva la alerta "Sin marco SEP" en la etiqueta');
  const porFiltro = await sepPorFiltro(page);
  const esperadoFiltro = { deficit: [], riesgo: [], superavit: [] };
  RBD_IDS.forEach(rbd => esperadoFiltro[E.sep[rbd].estado].push(rbd));
  ['deficit', 'riesgo', 'superavit'].forEach(k => t.eq(ordenar(porFiltro[k]), ordenar(esperadoFiltro[k]), `filtro "${ETIQUETA[k]}" de SEP = el Estado calculado de forma independiente (${esperadoFiltro[k].length} RBD)`));
  t.ok(porFiltro.deficit.includes('1120'), 'el RBD sin marco con gasto (saldo negativo) está en el filtro Déficit');
  t.eq(porFiltro.deficit.length + porFiltro.riesgo.length + porFiltro.superavit.length, RBD_IDS.length, 'cada RBD está en exactamente un Estado');

  // ---------------------------------------------------------------- 2) SEP: tarjeta KPI
  const kDef = await tarjeta(page, '#kpiRow', 'RBD en déficit');
  t.eq(Number(kDef.valor), cSep.deficit, `tarjeta SEP "RBD en déficit" = ${cSep.deficit} (los de la tabla, incluido el sin marco con gasto)`);
  t.ok(kDef.nota.includes(`de ${universo.length}`), 'la tarjeta explica el universo: ' + kDef.nota);
  t.ok(/sin marco con gasto SEP/.test(kDef.nota), 'y menciona los sin marco con gasto');

  // ---------------------------------------------------------------- 3) fuentes: tabla, tarjeta KPI y filtro implícito (cada fila)
  let totalDeficitFuentes = 0, totalEntidadesFuentes = 0;
  for (const f of FUENTES) {
    await clickTab(page, f.key);
    const filas = await filasFuente(page, f.key);
    const ids = idsDeFuente(f.key);
    t.eq(Object.keys(filas).length, ids.length, `${f.corto}: ${ids.length} filas`);
    const malas = ids.filter(id => !filas[id] || filas[id].estado !== ETIQUETA[E.fuentes[f.key][id].estado]);
    t.eq(malas, [], `${f.corto}: el Estado de cada fila (${ids.length}) coincide con el cálculo independiente`);
    const c = conteoFuente(E, f.key);
    const card = await tarjeta(page, `#ofKpiRow-total-${f.key}`, 'Saldo (Total)');
    const dm = nDeM(card.nota);
    t.eq(dm, { n: c.deficit, m: ids.length }, `${f.corto}: tarjeta "Saldo (Total)" dice ${c.deficit} de ${ids.length} entidades en déficit`);
    t.eq(Object.values(filas).filter(x => x.estado === 'Déficit').length, c.deficit, `${f.corto}: filas en Déficit = tarjeta`);
    totalDeficitFuentes += c.deficit; totalEntidadesFuentes += ids.length;
  }
  // bordes concretos de las fuentes
  await clickTab(page, 'faep');
  const faep = await filasFuente(page, 'faep');
  t.eq(['1130', '1131', '1132', '1133', '1134'].map(r => faep[r].estado), ['Superávit', 'Déficit', 'Superávit', 'Déficit', 'Superávit'], 'FAEP: saldo 0 → Superávit · -$1 → Déficit · 99,996 % → Superávit · ingreso 0 con gasto → Déficit · sin nada → Superávit');
  await clickTab(page, 'general');
  const gen = await filasFuente(page, 'general');
  t.eq([gen['1130'].estado, gen['1131'].estado], ['Superávit', 'Déficit'], 'Subvención General: saldo 0 → Superávit · -$1 → Déficit');
  t.ok(!Object.values(faep).some(x => x.estado === 'En riesgo') && !Object.values(gen).some(x => x.estado === 'En riesgo'), 'las fuentes no tienen nivel Riesgo');

  // ---------------------------------------------------------------- 4) Panel principal: franja, tarjetas por fuente, Atención
  await clickTab(page, 'Panel principal');
  const D = await leerDashboard(page);
  const nDef = cSep.deficit + totalDeficitFuentes, nEnt = universo.length + totalEntidadesFuentes;
  t.eq(D.strip.valor, String(nDef), `franja "Entidades en déficit" = ${nDef} (SEP + 9 fuentes)`);
  t.ok(D.strip.sub.includes(`de ${nEnt}`), 'y su denominador es el universo de todas las filas: ' + D.strip.sub);
  t.eq(nDeM(D.cards.sep.def), { n: cSep.deficit, m: universo.length }, `tarjeta SEP: ${cSep.deficit} de ${universo.length} (la misma cuenta que la tarjeta KPI de la pestaña SEP)`);
  for (const f of FUENTES) {
    const c = conteoFuente(E, f.key);
    t.eq(nDeM(D.cards[f.key].def), { n: c.deficit, m: idsDeFuente(f.key).length }, `tarjeta ${f.corto}: ${c.deficit} de ${idsDeFuente(f.key).length} (igual a la de su pestaña)`);
  }
  // Atención (vista Total) = TODAS las entidades en Déficit, de más negativa a menos; el total del texto es el de la franja.
  const deficitarias = [];
  RBD_IDS.forEach(rbd => { if (E.sep[rbd].estado === 'deficit') deficitarias.push({ fkey: 'sep', rbd, saldo: E.sep[rbd].saldo }); });
  FUENTES.forEach(f => Object.entries(E.fuentes[f.key]).forEach(([id, e]) => { if (e.estado === 'deficit') deficitarias.push({ fkey: f.key, rbd: id, saldo: e.saldo < 0 ? e.saldo : e.saldoOp }); }));
  deficitarias.sort((a, b) => a.saldo - b.saldo);
  t.ok(new RegExp(`— ${nDef} en total`).test(D.nota), `Atención: "${nDef} en total" = la franja`);
  t.eq(D.items.length, Math.min(8, nDef), 'Atención lista las 8 peores');
  t.eq(D.items.map(i => i.saldo.replace('▼ ', '')).join(','), deficitarias.slice(0, 8).map(d => fmt(d.saldo)).join(','), 'con los saldos más negativos del cálculo independiente, en orden');
  // La entidad sin marco con gasto es déficit en todas partes (tarjeta, franja, filtro, Atención): su saldo es -gasto.
  t.ok(deficitarias.some(d => d.fkey === 'sep' && d.rbd === '1120'), 'el RBD 1120 (sin marco, con gasto) cuenta como déficit en el cálculo independiente');
  // En la vista Total ninguna entidad con saldo ≥ 0 puede salir en Atención salvo JUNJI por el saldo de Operación (spec estado_junji): aquí todas son déficit del cálculo.
  const idsAtencion = D.items.map(i => `${i.fkey || i.fuente}:${i.rbd}`);
  t.ok(idsAtencion.every(k => deficitarias.slice(0, 8).some(d => `${d.fkey}:${d.rbd}` === k)), 'cada entidad de Atención está entre las 8 en déficit más negativas');
  // Vistas Real / Proyectado: el saldo de esa vista (la misma regla: negativo; $0 no cuenta). Las 8 listadas son todas negativas.
  for (const v of ['real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await h.waitIdle();
    const Dv = await leerDashboard(page);
    t.ok(Dv.items.every(i => /^▼ -\$/.test(i.saldo)), `Atención en la vista ${v}: solo saldos negativos`);
    t.ok(/en total\./.test(Dv.nota), `Atención en la vista ${v}: el texto dice "N en total"`);
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.waitIdle();

  // ---------------------------------------------------------------- 5) exportaciones de SEP: CSV y Excel de resumen, PDF general y PDF por fila
  await clickTab(page, 'SEP');
  const csv = await capturarDescarga(page, () => page.click('#downloadBtn'));
  const filasCsv = parseCsvPuntoYComa(csv.buffer.toString('utf8'));
  const iEstado = filasCsv[0].indexOf('Estado');
  const iRbd = filasCsv[0].indexOf('RBD');
  const delCsv = {};
  filasCsv.slice(1).filter(f => f.length > iEstado).forEach(f => { delCsv[f[iRbd]] = f[iEstado]; });
  t.eq(RBD_IDS.filter(r => delCsv[r] !== ETIQUETA[E.sep[r].estado]), [], `CSV de resumen: la columna Estado de los ${RBD_IDS.length} RBD coincide con el cálculo independiente`);
  const xls = await capturarDescarga(page, () => page.click('#downloadResumenExcelBtn'));
  const libro = await leerXlsx(page, xls.buffer);
  const hoja = libro.hojas[libro.orden[0]];
  const jE = hoja[0].indexOf('Estado'), jR = hoja[0].indexOf('RBD');
  const delXls = {};
  hoja.slice(1).forEach(f => { delXls[String(f[jR])] = f[jE]; });
  t.eq(RBD_IDS.filter(r => delXls[r] !== ETIQUETA[E.sep[r].estado]), [], 'Excel de resumen: la columna Estado coincide también');
  await page.evaluate(() => { window.__prints = []; });
  await page.click('#exportPdfBtn');
  const prints = await h.prints();
  const textoPdf = (prints[0] && prints[0].visibleText) || '';
  // innerText parte cada fila en varias líneas (las barras de %) y aplica la mayúscula del CSS (EN RIESGO): se agrupa por fila y se compara sin distinguir mayúsculas.
  const porFila = {};
  let actual = null;
  textoPdf.split('\n').forEach(l => { const m = /^▸ (\d+) /.exec(l); if (m) { actual = m[1]; porFila[actual] = ''; } if (actual) porFila[actual] += ' ' + l; });
  const bordes = ['1130', '1131', '1132', '1133', '1134', '1135', '1137', '1139', '1140'];
  const malasPdf = bordes.filter(r => !(porFila[r] || '').toUpperCase().includes(ETIQUETA[E.sep[r].estado].toUpperCase()));
  t.eq(malasPdf, [], 'PDF general: la fila de cada RBD borde trae su Estado (' + bordes.length + ' filas)');
  // PDF individual de un RBD borde
  await page.evaluate(() => { window.__prints = []; });
  await page.click('#tableBody .row-action-btn[data-action="pdf"][data-rbd="1131"]');
  const p1131 = (await h.prints())[0];
  t.ok(p1131 && /EN RIESGO/i.test(p1131.printWrap) && !/DÉFICIT/i.test(p1131.printWrap), 'PDF de la fila 1131 (99,996 %): Estado "En riesgo", no "Déficit"');

  // ---------------------------------------------------------------- 6) exportación por entidad de las fuentes sin SUPEREDUC: "Estado (Total)"
  await clickTab(page, 'faep');
  const csvF = await capturarDescarga(page, () => page.click('#otrasFuentesTbody-faep tr[data-rbd="1131"] .row-action-btn[data-action="csv"]'));
  const lineasF = parseCsvPuntoYComa(csvF.buffer.toString('utf8'));
  const filaEstadoF = lineasF.find(f => f[0] === 'Estado (Total)');
  t.eq(filaEstadoF && filaEstadoF[filaEstadoF.length - 1], 'Déficit', 'CSV de detalle FAEP 1131 (saldo -$1): "Estado (Total)" = Déficit');
  const csvG = await capturarDescarga(page, () => page.click('#otrasFuentesTbody-faep tr[data-rbd="1130"] .row-action-btn[data-action="csv"]'));
  const filaEstadoG = parseCsvPuntoYComa(csvG.buffer.toString('utf8')).find(f => f[0] === 'Estado (Total)');
  t.eq(filaEstadoG && filaEstadoG[filaEstadoG.length - 1], 'Superávit', 'CSV de detalle FAEP 1130 (saldo 0): "Estado (Total)" = Superávit');

  // ---------------------------------------------------------------- 7) la regla sigue valiendo tras un cambio de otra persona (todo se recalcula con el mismo Estado)
  await clickTab(page, 'SEP');
  await h.remoto('1133', 'd.rem.meses.ENERO = 9000000; d.rem.total = 9000000;');   // 8.999.900 → 9.000.000: 89,999 % → 90,000 %
  await h.waitIdle();
  const f33 = await filaSep(page, '1133');
  t.eq(f33.estado, 'En riesgo', 'un cambio remoto que lleva 1133 a 90,000 % lo pasa a Riesgo en la fila');
  const k2 = await tarjeta(page, '#kpiRow', 'RBD en déficit');
  t.eq(Number(k2.valor), cSep.deficit, 'y el conteo de déficit no cambia (Riesgo no es Déficit)');
  await h.remoto('1131', 'd.rem.meses.ENERO = 10000001; d.rem.total = 10000001;');   // pasa a saldo -$1
  await h.waitIdle();
  t.eq((await filaSep(page, '1131')).estado, 'Déficit', 'otro cambio remoto que deja 1131 en saldo -$1 lo pasa a Déficit');
  t.eq(Number((await tarjeta(page, '#kpiRow', 'RBD en déficit')).valor), cSep.deficit + 1, 'y la tarjeta cuenta uno más');
  await clickTab(page, 'Panel principal');
  const D2 = await leerDashboard(page);
  t.eq(D2.strip.valor, String(nDef + 1), 'la franja del Panel principal también suma uno');

  t.noErrores(h);
  await h.close();
});

// Pesos como los muestra el panel: $1.234.567 / -$1.234 (punto de miles también en 4 dígitos).
function fmt(n) { return (n < 0 ? '-' : '') + '$' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
