// Honorarios (PR-1) · INVARIANTE entre vistas: con boletas y proyección cargadas, el gasto total y el saldo de SEP son los MISMOS en la pestaña SEP, el Panel principal (tarjeta SEP, franja
// consolidada, evolución mensual, «Atención»), % Ejecución (SEP y Consolidado) y Reportes (Visualizador y Reporte personalizado), en las vistas Total / Real / Proyectado.
// La «tercera serie Honorarios» completa de esas vistas llega con el PR-3; aquí lo que importa es que los honorarios estén DENTRO del gasto total en todas partes (y que se vean como línea o con nota).
import { boot, clickTab, cargarFixture, textoDe } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { honDe, MESES, leerCLP, tarjetas, filaSepTexto, clp } from '../lib/honorarios.mjs';

const dashVista = async (h, v) => { await h.page.click(`.dash-chips button[data-dash-vista="${v}"]`); await h.waitIdle(); };
const strip = (page) => page.evaluate(() => { const o = {}; document.querySelectorAll('#dashStrip .dash-tile').forEach(t => { o[t.querySelector('.t-label').textContent.trim()] = t.querySelector('.t-value').textContent.trim(); }); return o; });
const tarjetaSep = (page) => page.evaluate(() => { const c = document.querySelector('#dashCards .dash-card[data-fuente="sep"]'); return { ing: +c.dataset.ing, rem: +c.dataset.rem, hon: +c.dataset.hon, bys: +c.dataset.bys, gas: +c.dataset.gas, saldo: +c.dataset.saldo }; });
const sumaTarjetas = (page, campo) => page.evaluate((k) => Array.from(document.querySelectorAll('#dashCards .dash-card')).reduce((s, c) => s + Number(c.dataset[k]), 0), campo);
const serieMensual = (page) => page.evaluate(() => { const filas = Array.from(document.querySelectorAll('#dashTablaMesBody tbody tr')); const ult = filas[filas.length - 1]; return { ing: ult.children[1].textContent.trim(), gas: ult.children[2].textContent.trim(), saldo: ult.children[3].textContent.trim() }; });
const atencionSep = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#dashAtencion li[data-atencion-fuente="sep"]')).map(li => ({ rbd: li.dataset.atencionRbd, saldo: li.querySelector('.a-saldo').textContent.trim() })));
const vzTotales = (page, tipo) => page.evaluate((id) => { const tr = document.querySelector(`#${id} tr.vz-total-row`); return Array.from(tr.querySelectorAll('td')).slice(1, 4).map(td => td.textContent.trim()); }, tipo === 'gasto' ? 'vzBodyGas' : 'vzBodyIng');

await correrSpec('honorarios_consistencia', async (t) => {
  const fx = cargarFixture('honorarios').docs;
  const rbds = Object.keys(fx).filter(k => /^\d+$/.test(k));
  const oracle = rbds.reduce((a, k) => { const e = honDe(fx[k]); a.bol += e.boletas; a.proy += e.proy; return a; }, { bol: 0, proy: 0 });
  t.eq([oracle.bol, oracle.proy], [13390000, 4450000], 'oráculo: $13.390.000 en boletas y $4.450.000 de proyección entre todos los RBD del fixture');
  const hon = oracle.bol + oracle.proy;

  const h = await boot({ fixture: 'honorarios' });
  const { page } = h;
  await clickTab(page, 'SEP');
  const T = await tarjetas(page, '#kpiRow'), R = await tarjetas(page, '#kpiRowReal'), P = await tarjetas(page, '#kpiRowProy');
  const sep = {
    total: { rem: leerCLP(T['Gasto Remuneraciones (a Diciembre)']), hon: leerCLP(T['Gasto Honorarios (a Diciembre)']), bys: leerCLP(T['Gasto Bienes y Servicios (a Diciembre)']), saldo: leerCLP(T['Saldo (a Diciembre)']) },
    real: { rem: leerCLP(R['Gasto Remuneraciones (Real)']), hon: leerCLP(R['Gasto Honorarios (Real)']), bys: leerCLP(R['Gasto Bienes y Servicios (Real)']), saldo: leerCLP(R['Saldo (Real)']) },
    proy: { rem: leerCLP(P['Gasto Remuneraciones (Proyectado)']), hon: leerCLP(P['Gasto Honorarios (Proyectado)']), bys: leerCLP(P['Gasto Bienes y Servicios (Proyectado)']), saldo: leerCLP(P['Saldo (Proyectado)']) },
  };
  Object.values(sep).forEach(v => { v.gas = v.rem + v.hon + v.bys; });
  t.eq(sep.total.hon, hon, 'pestaña SEP: «Gasto Honorarios» (Total) = boletas + proyección de todo el fixture');
  t.eq([sep.real.hon, sep.proy.hon], [oracle.bol, oracle.proy], 'pestaña SEP: Real = boletas y Proyectado = proyección');
  t.eq(sep.total.gas, sep.real.gas + sep.proy.gas, 'pestaña SEP: gasto total = rem + hon + B&S y Real + Proyectado = Total');

  // ================================================================ Panel principal
  await clickTab(page, 'Panel principal');
  for (const [vista, k] of [['total', 'total'], ['real', 'real'], ['proy', 'proy']]) {
    await dashVista(h, vista);
    const c = await tarjetaSep(page);
    t.eq([c.gas, c.saldo, c.hon, c.rem, c.bys], [sep[k].gas, sep[k].saldo, sep[k].hon, sep[k].rem, sep[k].bys], `Panel principal (${vista}): la tarjeta SEP tiene el mismo gasto, saldo, honorarios, remuneraciones y B&S que la pestaña SEP`);
    const s = await strip(page);
    const gastoStrip = leerCLP(s['GASTO TOTAL'] || s['Gasto Total']);
    t.eq(gastoStrip, await sumaTarjetas(page, 'gas'), `Panel principal (${vista}): el «Gasto Total» de la franja es la suma del gasto de las 10 tarjetas`);
    const parts = leerCLP(s['Gasto Remuneraciones'] || s['GASTO REMUNERACIONES']) + leerCLP(s['Gasto Honorarios (Subt. 21)'] || s['GASTO HONORARIOS (SUBT. 21)']) + leerCLP(s['Gasto Bienes y Servicios'] || s['GASTO BIENES Y SERVICIOS']);
    t.eq(parts, gastoStrip, `Panel principal (${vista}): Remuneraciones + Honorarios + B&S = Gasto Total en la franja (los números cuadran)`);
    t.eq(leerCLP(s['Gasto Honorarios (Subt. 21)'] || s['GASTO HONORARIOS (SUBT. 21)']), sep[k].hon, `Panel principal (${vista}): la tile «Gasto Honorarios» = los honorarios de SEP (solo SEP los tiene todavía)`);
    t.eq(await sumaTarjetas(page, 'saldo'), leerCLP(s['Saldo consolidado'] || s['SALDO CONSOLIDADO']), `Panel principal (${vista}): el saldo consolidado es la suma de los saldos de las tarjetas`);
    const mensual = await serieMensual(page);
    t.eq([leerCLP(mensual.gas), leerCLP(mensual.saldo)], [gastoStrip, leerCLP(s['Saldo consolidado'] || s['SALDO CONSOLIDADO'])], `Panel principal (${vista}): la evolución mensual suma el mismo gasto total y saldo que la franja`);
    if (vista === 'total') {
      const filaTabla = await page.evaluate(() => Array.from(document.querySelectorAll('#dashTablaFuentesBody tbody tr')).find(tr => tr.children[0].textContent.trim() === 'SEP').children[3].textContent.trim());
      t.eq(leerCLP(filaTabla), sep.total.hon, 'la tabla «por fuente» tiene su columna «Honorarios (Subt. 21)» (SEP con sus honorarios)');
      const at = await atencionSep(page);
      let bien = 0;
      for (const a of at) { const f = await (async () => { await clickTab(page, 'SEP'); const r = await filaSepTexto(page, a.rbd); await clickTab(page, 'Panel principal'); return r; })(); if (a.saldo === '▼ ' + f.saldo_total) bien++; }
      t.eq([at.length > 0, bien], [true, at.length], '«Atención»: el saldo de cada RBD de SEP en la lista es el mismo que el de la tabla de SEP (con los honorarios dentro)');
      await dashVista(h, 'total');
    }
  }
  await dashVista(h, 'total');
  const total = leerCLP((await strip(page))['GASTO TOTAL'] || (await strip(page))['Gasto Total']);

  // ================================================================ % Ejecución (SEP)
  await clickTab(page, '% Ejecución');
  const leerEjecSep = () => page.evaluate(() => Array.from(document.querySelectorAll('#ejecTbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  const num = (txt) => leerCLP(txt);
  let filas = await leerEjecSep();
  t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#ejecTable thead th')).map(th => th.textContent.trim())),
    ['Mes', 'Corte', 'Gasto Rem. (mes)', 'Δ vs mes anterior', 'Gasto Hon. (mes)', '% Ejec. Personal (Rem.+Hon.) acumulado', 'Gasto B&S (mes)', 'Δ vs mes anterior', '% Ejec. B&S acumulado'], '% Ejecución SEP: la tabla trae «Gasto Hon. (mes)» y el % de personal (Rem.+Hon.)');
  const sumaCol = (i) => filas.reduce((s, f) => s + num(f[i]), 0);
  t.eq([sumaCol(2), sumaCol(4), sumaCol(6)], [sep.total.rem, sep.total.hon, sep.total.bys], '% Ejecución SEP (todos los RBD): los 12 meses suman las mismas remuneraciones, honorarios y B&S que la pestaña SEP');
  t.eq(sumaCol(2) + sumaCol(4) + sumaCol(6), sep.total.gas, '% Ejecución SEP: el gasto total (rem + hon + B&S) es el de la pestaña SEP');
  t.eq(filas.map(f => num(f[4])), MESES.map(m => rbds.reduce((s, k) => s + honDe(fx[k]).boletasPorMes[m] + honDe(fx[k]).proyPorMes[m], 0)), '% Ejecución SEP: «Gasto Hon. (mes)» es mes a mes lo que dicen las boletas (por Fecha Documento) + la proyección del fixture');
  const kpiEjec = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card')).map(c => c.querySelector('.label').textContent.trim()));
  t.eq(kpiEjec, ['% Ejec. Personal (Rem.+Hon.) (a Diciembre)', '% Ejec. Personal (Rem.+Hon.) (proy. a diciembre)', '% Ejec. B&S (a Diciembre)', '% Ejec. B&S (proy. a diciembre)'], '% Ejecución SEP: las tarjetas hablan de Personal (Rem.+Hon.)');
  t.eq(await page.evaluate(() => document.getElementById('ejecLblRem').textContent), 'Personal (Remuneraciones + Honorarios)', 'y la serie del gráfico se llama «Personal (Remuneraciones + Honorarios)»');
  // un RBD
  await page.selectOption('#ejecRbdSelect', '1121');
  await h.waitIdle();
  filas = await leerEjecSep();
  const e1121 = honDe(fx['1121']);
  t.eq([sumaCol(4), sumaCol(2)], [e1121.total, num((await filaSepTexto(await (async () => { await clickTab(page, 'SEP'); return page; })(), '1121')).gasto_rem_anual_proy)], '% Ejecución (RBD 1121): honorarios y remuneraciones de la serie = los de la fila de la pestaña SEP');
  await clickTab(page, '% Ejecución');
  await page.selectOption('#ejecRbdSelect', '');

  // ================================================================ % Ejecución (Consolidado)
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
  await h.waitIdle();
  const kc = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card')).map(c => ({ l: c.querySelector('.label').textContent.trim(), d: c.querySelector('.delta').textContent.trim() })));
  const montoDe = (txt, antes) => { const m = new RegExp(antes + ' \\((-?\\$[\\d.]+)\\)').exec(txt); return m ? leerCLP(m[1]) : null; };
  const anual = kc.find(k => k.l === '% Ejec. Total — Real+Proy a diciembre');
  t.ok(/^Rem\. \+ Hon\. \+ B&S a diciembre/.test(anual.d), 'Consolidado: el Total se rotula «Rem. + Hon. + B&S»', anual.d);
  t.eq(montoDe(anual.d, 'Rem\\. \\+ Hon\\. \\+ B&S a diciembre'), total, 'Consolidado: el gasto total a diciembre es EXACTAMENTE el «Gasto Total» de la franja del Panel principal');
  const nota = await textoDe(page, '#ejecCorteNota');
  t.ok(nota.includes(`El Total incluye los honorarios (Subt. 21) de SEP — ${clp(oracle.bol)} reales y ${clp(hon)} a diciembre —, que todavía no tienen columna ni serie propia en esta vista`), 'Consolidado: una nota dice que el Total incluye los honorarios de SEP (aún sin serie propia)', nota);
  const tbl = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecTbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  t.eq(tbl.length, 12, 'Consolidado: 12 meses');
  // fuente que NO es SEP: sin nota ni cambio
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="general"]');
  await h.waitIdle();
  t.ok(!/honorarios/i.test(await textoDe(page, '#ejecCorteNota')), 'General: sin honorarios, su nota no cambia');

  // ================================================================ Reportes (Visualizador, solo SEP)
  await clickTab(page, 'Reportes');
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
  await h.waitIdle();
  const gas = await vzTotales(page, 'gasto');
  t.eq(gas.map(leerCLP), [sep.real.gas, sep.proy.gas, sep.total.gas], 'Visualizador (solo SEP): Total Gastos Real / Proyectado / Total = los de la pestaña SEP (con los honorarios dentro)');
  const saldoVz = await page.evaluate(() => Array.from(document.querySelectorAll('#vzSaldo .dash-tile .t-value')).map(x => x.textContent.trim()));
  t.eq(saldoVz.map(leerCLP), [sep.real.saldo, sep.proy.saldo, sep.total.saldo], 'Visualizador (solo SEP): Saldo Real / Proyectado / Total = los de la pestaña SEP');
  await page.click('#vzExpGas');
  const nodos = await page.evaluate(() => Array.from(document.querySelectorAll('#vzBodyGas tr.vz-row')).map(tr => ({ n: tr.querySelector('.vz-name').textContent.trim(), real: tr.children[1].textContent.trim(), proy: tr.children[2].textContent.trim() })));
  const nodoHon = nodos.find(n => n.n.replace(/^[▸▾]\s*/, '') === 'Honorarios (Subt. 21)'), nodoProy = nodos.find(n => n.n.replace(/^[▸▾]\s*/, '') === 'Honorarios — Proyección');
  t.eq([nodoHon && leerCLP(nodoHon.real), nodoProy && leerCLP(nodoProy.proy)], [oracle.bol, oracle.proy], 'Visualizador: nodos «Honorarios (Subt. 21)» (real) y «Honorarios — Proyección» (proyectado) con los totales de las boletas y de la proyección');
  await page.click('#vzAgruparChips [data-vz-agrupar="codigo"]');
  await h.waitIdle();
  t.eq((await vzTotales(page, 'gasto')).map(leerCLP), [sep.real.gas, sep.proy.gas, sep.total.gas], 'Visualizador por código: los mismos totales de gasto');
  t.ok(await page.evaluate(() => /Honorarios \(Subt\. 21\)/.test(document.getElementById('vzBodyGas').innerText)), 'Visualizador por código: aparece el grupo «Honorarios (Subt. 21)»');
  // Reporte personalizado: conceptos «Honorarios (Subt. 21)» y «Honorarios (Proyección) — total» para los RBD del fixture
  await page.click('#vzLimpiarBtn');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  await page.click('#reporteRbdNinguno');
  await page.click('#reporteConceptoNinguno');
  const marcar = (sel, v) => page.evaluate(([s, val]) => { const el = document.querySelector(s); if (!el) return false; el.checked = val; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [sel, v]);
  const conHon = rbds.filter(k => honDe(fx[k]).total > 0);
  for (const id of conHon) t.ok(await marcar(`#reporteRbdList input[data-rbd-check="${id}"]`, true), `Reporte personalizado: la entidad ${id} está en la lista`);
  t.ok(await page.evaluate(() => Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).some(e => e.dataset.conceptoCheck === 'hon')), 'Reporte personalizado: el catálogo trae el concepto «hon» (Honorarios (Subt. 21))');
  await marcar('#reporteConceptoList input[data-concepto-check="hon"]', true);
  await marcar('#reporteConceptoList input[data-concepto-check="hon_proy"]', true);
  await h.waitIdle();
  const filasRep = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteTbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  const totalDe = (rbd, concepto) => { const f = filasRep.find(r => r[0] === rbd && r[2] === concepto); return f ? leerCLP(f[f.length - 1]) : null; };
  let malRep = [];
  conHon.forEach(id => {
    const e = honDe(fx[id]);
    if (totalDe(id, 'Honorarios (Subt. 21)') !== e.boletas) malRep.push([id, 'boletas', totalDe(id, 'Honorarios (Subt. 21)'), e.boletas]);
    if (totalDe(id, 'Honorarios (Proyección) — total') !== e.proy) malRep.push([id, 'proyección', totalDe(id, 'Honorarios (Proyección) — total'), e.proy]);
  });
  t.ok(!malRep.length, 'Reporte personalizado: por RBD, «Honorarios (Subt. 21)» = boletas y «Honorarios (Proyección) — total» = proyección del fixture', malRep);
  const sub = filasRep.filter(r => /^Subtotal — /.test(r[2])).map(r => [r[2], leerCLP(r[r.length - 1])]);
  t.eq(sub, [['Subtotal — Honorarios (Subt. 21)', oracle.bol], ['Subtotal — Honorarios (Proyección) — total', oracle.proy]], 'Reporte personalizado: los subtotales son los totales de boletas y de proyección');
  // las celdas se colorean: boletas siempre reales, proyección siempre proyectada
  t.eq(await page.evaluate(() => {
    const fila = (c) => Array.from(document.querySelectorAll('#reporteTbody tr')).find(tr => tr.children[0].textContent.trim() === '1121' && tr.children[2].textContent.trim() === c);
    const clases = (tr) => Array.from(tr.querySelectorAll('td.num')).slice(0, 12).map(td => td.classList.contains('mes-real') ? 'R' : (td.classList.contains('mes-proy') ? 'P' : '-')).join('');
    return [clases(fila('Honorarios (Subt. 21)')), clases(fila('Honorarios (Proyección) — total'))];
  }), ['RRRRRRRRRRRR', 'PPPPPPPPPPPP'], 'Reporte personalizado: las boletas se colorean «real» y la proyección «proyectada» en los 12 meses');
  t.noErrores(h);
  await h.close();
});
