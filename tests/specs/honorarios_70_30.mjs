// Honorarios (PR-1) · regla 70/30 «opción B» (decisión del usuario) y totales de SEP.
//   TODO honorario cuenta del lado del PERSONAL (el 70 %) junto con las remuneraciones, pero se muestra en su propia línea y tarjeta:
//       gasto_personal = gasto_rem + gasto_hon (cualquier cuenta; NO se usan las 4 cuentas de personal del manual)
//       saldo_rem = meta_70 − gasto_personal      % Ejec. Personal = gasto_personal / meta_70      gasto_total = rem + hon + B&S
//   «Gasto Remuneraciones» queda SOLO con remuneraciones; B&S no cambia (una boleta de 411601 NO suma en B&S). El Estado sale del saldo con los honorarios dentro.
//   Todo se compara contra un cálculo independiente hecho con los documentos del fixture (tests/lib/honorarios.mjs, tests/lib/estado.mjs).
import { boot, clickTab, cargarFixture, textoDe } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { honDe, hastaMes, leerCLP, tarjetas, filaSepTexto, boleta, MESES } from '../lib/honorarios.mjs';
import { estadoEsperado } from '../lib/estado.mjs';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sumaMeses = (o) => MESES.reduce((s, m) => s + num(o && o.meses && o.meses[m]), 0);
const pct1 = (v) => Math.round(v * 10) / 10;
const leerPct = (t) => Number(String(t).replace('%', '').replace(',', '.').trim());
const RBD_CON_HON = ['1120', '1121', '1122', '1123', '1125', '1128'];
const setCorte = async (page, mes) => { await page.selectOption('#corteMesSelect', String(mes)); };

await correrSpec('honorarios_70_30', async (t) => {
  const fx = cargarFixture('honorarios').docs;
  const fxBase = cargarFixture('default').docs;

  // ================================================================ 1. cada RBD con honorarios: identidades contra el oráculo
  {
    const h = await boot({ fixture: 'honorarios' });
    const hb = await boot({ fixture: 'default' });
    await clickTab(h.page, 'SEP');
    await clickTab(hb.page, 'SEP');
    let ok = 0;
    for (const rbd of RBD_CON_HON) {
      const d = fx[rbd];
      const f = await filaSepTexto(h.page, rbd), fb = await filaSepTexto(hb.page, rbd);
      const hon = honDe(d).total;
      const marco = ['Ingreso SEP Preferente', 'Ingreso SEP Prioritario'].reduce((s, k) => s + sumaMeses((d.ingreso_items || {})[k]), 0);
      const carrera = sumaMeses((d.ingreso_items || {})['Carrera Docente']);
      const rem = leerCLP(f.gasto_rem_anual_proy), bys = leerCLP(f.gasto_bys);
      const meta70 = Math.round(0.7 * Math.round(marco)) + Math.round(carrera);
      const recurso = Math.round(marco) + Math.round(carrera);
      const personal = rem + hon;
      const mal = [];
      if (leerCLP(f.gasto_hon) !== hon) mal.push(['gasto_hon', f.gasto_hon, hon]);
      if (rem !== Math.round(sumaMeses(d.rem))) mal.push(['gasto_rem', rem, Math.round(sumaMeses(d.rem))]);
      if (f.gasto_rem_anual_proy !== fb.gasto_rem_anual_proy) mal.push(['Gasto Rem. cambió por los honorarios', f.gasto_rem_anual_proy, fb.gasto_rem_anual_proy]);
      if (f.gasto_bys !== fb.gasto_bys) mal.push(['Gasto B&S cambió por los honorarios', f.gasto_bys, fb.gasto_bys]);
      if (leerCLP(f.saldo_total) !== recurso - personal - bys) mal.push(['saldo_total = recurso − (rem + hon) − B&S', f.saldo_total, recurso - personal - bys]);
      if (leerCLP(f.saldo_total) !== leerCLP(fb.saldo_total) - hon) mal.push(['saldo con honorarios = saldo sin honorarios − hon', f.saldo_total, leerCLP(fb.saldo_total) - hon]);
      if (leerCLP(f.saldo_rem) !== meta70 - personal) mal.push(['saldo_rem = meta 70 % − (rem + hon)', f.saldo_rem, meta70 - personal]);
      if (meta70 && leerPct(f.pct_ejec_rem) !== pct1(personal / meta70 * 100)) mal.push(['% Ejec. Personal', f.pct_ejec_rem, pct1(personal / meta70 * 100)]);
      if (recurso && leerPct(f.pct_rem_ing_total) !== pct1(personal / recurso * 100)) mal.push(['% Personal / Ingreso', f.pct_rem_ing_total, pct1(personal / recurso * 100)]);
      if (recurso && leerPct(f.pct_ejec_total) !== pct1((personal + bys) / recurso * 100)) mal.push(['% Ejec. Total', f.pct_ejec_total, pct1((personal + bys) / recurso * 100)]);
      if (recurso && leerPct(f.pct_bys_ing_total) !== pct1(bys / recurso * 100)) mal.push(['% B&S / Ingreso', f.pct_bys_ing_total, pct1(bys / recurso * 100)]);
      const estadoEsp = estadoEsperado(recurso, personal + bys, true);
      const etiqueta = { deficit: 'Déficit', riesgo: 'En riesgo', superavit: 'Superávit' }[estadoEsp].toUpperCase();
      if (rbd !== '1120' && f.estado.toUpperCase() !== etiqueta) mal.push(['Estado (con los honorarios dentro del gasto)', f.estado, etiqueta]);
      t.ok(!mal.length, `RBD ${rbd}: gasto_personal = rem + hon, saldo y % sobre el personal, Rem. y B&S sin cambio, Estado con los honorarios dentro`, mal);
      ok += mal.length ? 0 : 1;
    }
    t.eq(ok, RBD_CON_HON.length, `las identidades valen en los ${RBD_CON_HON.length} RBD con honorarios del fixture`);
    // una boleta de una cuenta de mantención (411601: el manual NO la cuenta como personal) igual cuenta del lado del personal, no en B&S
    const f1121 = await filaSepTexto(h.page, '1121'), f1121b = await filaSepTexto(hb.page, '1121');
    t.eq(leerCLP(f1121.gasto_bys), leerCLP(f1121b.gasto_bys), 'RBD 1121 (con la boleta de 411601 MANTENCIÓN Y REPARACIÓN): sigue sin sumar en Bienes y Servicios');
    t.eq(honDe(fx['1121']).porCuenta['411601'], 200000, 'oráculo: esa boleta de 411601 son $200.000');
    // encabezados y leyendas
    const enc = await h.page.evaluate(() => ({
      grupo: document.querySelector('table.data-table thead tr:first-child th[colspan="4"]').textContent.trim(),
      cols: Array.from(document.querySelectorAll('table.data-table thead tr.th-row-2 th')).map(th => th.textContent.trim()),
      leyenda: document.querySelector('.sep-notas .legend-row').textContent.replace(/\s+/g, ' '),
      info: document.querySelector('table.data-table thead th.th-group-alt').textContent.trim(),
    }));
    t.eq(enc.grupo, 'Personal (Rem. + Hon.) — % sobre meta 70%', 'el encabezado del grupo pasa a «Personal (Rem. + Hon.) — % sobre meta 70%»');
    t.eq(enc.cols, ['Gasto Rem.', 'Gasto Hon.', '% Ejec. Personal', 'Saldo post Personal', 'Gasto B&S', '% Ejec. B&S', '% Personal / Ingreso', '% B&S / Ingreso'], 'las columnas: Gasto Rem. y Gasto Hon. por separado, % Ejec. Personal y Saldo post Personal');
    t.ok(/% Ejec\. Personal \(Rem\.\+Hon\.\)\s*: \(gasto en remuneraciones \+ gasto en honorarios\) \/ meta de personal/.test(enc.leyenda), 'la leyenda explica el % Ejec. Personal (Rem.+Hon.)');
    t.ok(/Los honorarios \(Subt\. 21, registrados por boleta\) no son remuneración, pero cuentan del lado del personal: todos, en cualquier cuenta/.test(enc.leyenda), 'y dice que TODOS los honorarios cuentan del lado del personal, en cualquier cuenta');
    t.ok(!/% Ejec\. Remuneraciones/.test(enc.leyenda), 'ya no queda el rótulo «% Ejec. Remuneraciones»');
    t.noErrores(h); t.noErrores(hb);
    await h.close(); await hb.close();
  }

  // ================================================================ 2. tarjetas KPI (Total / Real / Proyectado) y el corte «hasta el mes»
  {
    const h = await boot({ fixture: 'honorarios' });
    const hb = await boot({ fixture: 'default' });
    await clickTab(h.page, 'SEP');
    await clickTab(hb.page, 'SEP');
    const todos = Object.keys(fx).filter(k => /^\d+$/.test(k) && (fx[k].honorarios !== undefined || fx[k].hon_proyeccion !== undefined));
    const total = (hasta) => todos.reduce((s, k) => { const e = honDe(fx[k]); return s + hastaMes(e.boletasPorMes, hasta) + hastaMes(e.proyPorMes, hasta); }, 0);
    for (const [mes, nombre] of [[12, 'Diciembre'], [3, 'Marzo'], [1, 'Enero']]) {
      await setCorte(h.page, mes); await setCorte(hb.page, mes);
      await h.waitIdle(); await hb.waitIdle();
      const k = await tarjetas(h.page, '#kpiRow'), kb = await tarjetas(hb.page, '#kpiRow');
      const esperado = total(mes);
      t.eq(leerCLP(k[`Gasto Honorarios (a ${nombre})`]), esperado, `a ${nombre}: la tarjeta «Gasto Honorarios» suma boletas + proyección de los RBD hasta ese mes (${esperado})`);
      t.eq(k[`Gasto Remuneraciones (a ${nombre})`], kb[`Gasto Remuneraciones (a ${nombre})`], `a ${nombre}: «Gasto Remuneraciones» no cambia por los honorarios`);
      t.eq(k[`Gasto Bienes y Servicios (a ${nombre})`], kb[`Gasto Bienes y Servicios (a ${nombre})`], `a ${nombre}: ni «Gasto Bienes y Servicios»`);
      t.eq(leerCLP(k[`Saldo (a ${nombre})`]), leerCLP(kb[`Saldo (a ${nombre})`]) - esperado, `a ${nombre}: «Saldo» baja exactamente lo que suman los honorarios`);
    }
    await setCorte(h.page, 12); await setCorte(hb.page, 12);
    await h.waitIdle();
    const real = await tarjetas(h.page, '#kpiRowReal'), proy = await tarjetas(h.page, '#kpiRowProy'), tot = await tarjetas(h.page, '#kpiRow');
    const bol = todos.reduce((s, k) => s + honDe(fx[k]).boletas, 0), pro = todos.reduce((s, k) => s + honDe(fx[k]).proy, 0);
    t.eq([leerCLP(real['Gasto Honorarios (Real)']), leerCLP(proy['Gasto Honorarios (Proyectado)'])], [bol, pro], 'Real = solo las boletas (reales por definición) y Proyectado = solo la proyección (siempre proyectada)');
    t.eq(bol + pro, leerCLP(tot['Gasto Honorarios (a Diciembre)']), 'Real + Proyectado = Total');
    t.eq(leerCLP(real['Saldo (Real)']) + leerCLP(proy['Saldo (Proyectado)']), leerCLP(tot['Saldo (a Diciembre)']), 'Saldo Real + Saldo Proyectado = Saldo Total (los honorarios no se pierden ni se cuentan dos veces entre las 3 filas)');
    t.eq(Object.keys(real), ['Ingreso SEP (Real)', 'Carrera Docente (Real)', 'Gasto Remuneraciones (Real)', 'Gasto Honorarios (Real)', 'Gasto Bienes y Servicios (Real)', 'Saldo (Real)'], 'la fila Real trae su tarjeta «Gasto Honorarios (Real)» entre Remuneraciones y B&S');
    t.eq(Object.keys(proy)[3], 'Gasto Honorarios (Proyectado)', 'la fila Proyectado, su tarjeta «Gasto Honorarios (Proyectado)»');
    t.eq(Object.keys(tot).slice(0, 6), ['Ingreso SEP (a Diciembre)', 'Carrera Docente', 'Gasto Remuneraciones (a Diciembre)', 'Gasto Honorarios (a Diciembre)', 'Gasto Bienes y Servicios (a Diciembre)', 'Saldo (a Diciembre)'], 'y la fila Total, «Gasto Honorarios (a Diciembre)»');
    t.ok(/Subt\. 21 · boletas \+ proyección · cuenta del lado del personal \(70 %\)/.test(await h.page.evaluate(() => Array.from(document.querySelectorAll('#kpiRow .kpi-card')).find(c => /Gasto Honorarios/.test(c.textContent)).textContent)), 'la tarjeta aclara que son boletas + proyección y que cuentan del lado del personal');
    const revisar = await h.page.evaluate(() => { const c = Array.from(document.querySelectorAll('#kpiRow .kpi-card')).find(x => x.querySelector('.label').textContent.trim() === 'Datos a revisar'); return [c.querySelector('.value').textContent.trim(), c.querySelector('.delta').textContent.trim()]; });
    t.eq(revisar, ['1', 'posible error de imputación · incluye 1 RBD con avisos en sus honorarios'], '«Datos a revisar» cuenta el RBD con boletas con avisos (1121) y lo dice');
    t.noErrores(h); t.noErrores(hb);
    await h.close(); await hb.close();
  }

  // ================================================================ 3. el Estado sale del saldo CON los honorarios dentro
  {
    // fixture `estado` (1130: recurso $10.000.000, remuneraciones $10.000.000 → saldo 0, 100 % → Riesgo; 1133: 89,999 % → Superávit; 1140: 50 %)
    const docs = JSON.parse(JSON.stringify(cargarFixture('estado').docs));
    docs['1130'].honorarios = { a: boleta({ codigo: '411701', fechaDocumento: '2026-01-15', montoGasto: 1, montoDocumento: 1 }) };            // gasto $1 sobre el recurso → saldo -$1
    docs['1133'].honorarios = { a: boleta({ codigo: '410803', fechaDocumento: '2026-01-15', montoGasto: 100, montoDocumento: 100 }) };       // 8.999.900 + 100 = 9.000.000 = 90,000 % → Riesgo
    docs['1140'].hon_proyeccion = { items: { '410304': { meses: { DICIEMBRE: 4000000 }, total: 4000000 } } };                                  // solo proyección: 5.000.000 + 4.000.000 = 90 % → Riesgo
    const h = await boot({ fixture: docs });
    const { page } = h;
    await clickTab(page, 'SEP');
    const lee = async (rbd) => (await filaSepTexto(page, rbd)).estado.toUpperCase();
    t.eq(await lee('1130'), 'DÉFICIT', 'saldo $0 + una boleta de $1 → Déficit (con el fixture sin honorarios era Riesgo)');
    t.eq(await lee('1133'), 'EN RIESGO', '89,999 % + una boleta de $100 → 90,000 % → En riesgo (antes Superávit)');
    t.eq(await lee('1140'), 'EN RIESGO', 'la PROYECCIÓN de honorarios también entra en el Estado (50 % + 40 % = 90 % → En riesgo)');
    t.eq(await lee('1131'), 'EN RIESGO', 'sin honorarios nada cambia (1131: 99,996 % → En riesgo)');
    t.eq(leerCLP((await filaSepTexto(page, '1130')).saldo_total), -1, 'el saldo de 1130 es -$1');
    // las 3 cuentas del manual y una que no es de personal pesan igual: 410803 / 411701 / 410304
    t.eq(leerPct((await filaSepTexto(page, '1130')).pct_ejec_rem), pct1(10000001 / 7000000 * 100), 'el % Ejec. Personal de 1130 = (10.000.000 + 1) / meta 7.000.000 (la boleta de 411701 cuenta como personal)');
    // tarjeta «RBD en déficit» y filtro por Estado
    await page.selectOption('#estadoFilter', 'deficit');
    t.ok((await page.evaluate(() => Array.from(document.querySelectorAll('#tableBody tr.rbd-row')).map(tr => tr.dataset.rbd))).includes('1130'), 'el filtro «Déficit» incluye al RBD que cayó en déficit por una boleta');
    t.noErrores(h);
    await h.close();
  }
});
