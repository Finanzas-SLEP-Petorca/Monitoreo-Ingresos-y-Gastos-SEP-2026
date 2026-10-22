// formato_numeros (U-16): los montos, porcentajes y millones se PRESENTAN con un único formato es-CL en todo el panel.
//
// Reglas de presentación (los CSV/Excel de respaldo y de SUPEREDUC NO se tocan: su formato es contrato y aquí se comprueba que siguen igual):
//   · pesos       $1.234.567 · negativo con el signo ANTES del $ (-$1.234.567; antes: "$-1.234.567"); los de 4 dígitos también agrupan ($5.000)
//   · porcentaje  54,6%  — una decimal con COMA y miles con punto (antes la tabla SEP, sus KPI, el PDF individual y % Ejecución usaban punto: "54.6%";
//                 el Panel principal ya usaba coma) y SIEMPRE con la decimal (antes "100%" a veces y "54.6%" otras)
//   · millones    1,23 M · 5.061 M
// Se recorre el texto visible de las 13 pestañas, los modales, % Ejecución (tarjetas, tabla, tooltip, etiqueta del gráfico) y lo que se imprime.
import fs from 'node:fs';
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const MONTO_OK = /^-?\$(0|[1-9]\d{0,2}(\.\d{3})*)$/;
const MILLONES_OK = /^-?(0|[1-9]\d{0,2}(\.\d{3})*)(,\d+)? M$/;
const PCT_OK = /^(0|[1-9]\d{0,2}(\.\d{3})*),\d%$/;
const TABS = ['dashboard', 'panel', 'of-general', 'of-pie', 'of-mantenimiento', 'of-prorretencion', 'of-junji', 'of-faep', 'of-figa', 'of-aporte_educ', 'of-aporte_junji', 'ejecucion', 'reportes'];

// Defectos de formato dentro de un texto
function defectos(texto) {
  const r = [];
  (texto.match(/\$-\s?\d/g) || []).forEach((m) => r.push(`signo después del $: "${m}"`));
  (texto.match(/-?\$\d[\d.,]*\d|-?\$\d/g) || []).filter((m) => !MONTO_OK.test(m) && !/^\$-/.test(m)).forEach((m) => r.push(`monto sin formato es-CL: "${m}"`));
  (texto.match(/-?\d[\d.,]*\d M(?![\wáéíóú])|-?\d M(?![\wáéíóú])/g) || []).filter((m) => !MILLONES_OK.test(m)).forEach((m) => r.push(`millones sin formato es-CL: "${m}"`));
  (texto.match(/\d+\.\d+%/g) || []).forEach((m) => r.push(`porcentaje con punto decimal: "${m}"`));
  return [...new Set(r)];
}

await correrSpec('formato_numeros', async (t) => {
  const h = await boot({ viewport: { width: 1500, height: 1000 } });
  const { page } = h;
  const texto = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText : ''; }, sel);
  const reporta = (donde, texto_) => { const d = defectos(texto_); t.ok(d.length === 0, `${donde}: sin defectos de formato`, d.slice(0, 5).join(' | ')); return d.length === 0; };

  // 1) Las 13 pestañas
  for (const tab of TABS) {
    await h.clickTab(tab);
    reporta(`pestaña ${tab}`, await texto('#tab-' + (tab === 'dashboard' ? 'dashboard' : tab)));
  }

  // 2) SEP: columnas de porcentaje, saldos negativos y KPI
  await h.clickTab('panel');
  const sep = await page.evaluate(() => {
    const col = (campo) => Array.from(document.querySelectorAll(`#tableBody td[data-field="${campo}"]`)).map((c) => c.innerText.trim());
    return {
      barras: Array.from(document.querySelectorAll('#tableBody .pct-bar-text')).map((e) => e.textContent.trim()),
      remIng: col('pct_rem_ing_total'), bysIng: col('pct_bys_ing_total'), ejecTotal: col('pct_ejec_total'), saldoTotal: col('saldo_total'), saldoRem: col('saldo_rem'),
      kpi: Array.from(document.querySelectorAll('#tab-panel .kpi-card')).map((c) => c.innerText.replace(/\s+/g, ' ')),
    };
  });
  const noOk = (arr, re) => arr.filter((x) => !re.test(x));
  t.eq(noOk(sep.barras, PCT_OK), [], `SEP: las ${sep.barras.length} barras de % Ejec. (Rem. y B&S) usan "54,6%"`);
  t.eq(noOk(sep.remIng, PCT_OK), [], 'SEP: % Rem./Ingreso con coma y una decimal');
  t.eq(noOk(sep.bysIng, PCT_OK), [], 'SEP: % B&S/Ingreso con coma y una decimal');
  t.eq(noOk(sep.ejecTotal, PCT_OK), [], 'SEP: % Ejec. Total con coma y una decimal (también los enteros: "100,0%")');
  t.ok(sep.ejecTotal.some((x) => /^\d+,0%$/.test(x)) || sep.ejecTotal.includes('0,0%'), 'SEP: un porcentaje entero se muestra con su decimal ("0,0%")', sep.ejecTotal.slice(0, 5));
  t.ok(sep.saldoTotal.concat(sep.saldoRem).some((x) => /^-\$[\d.]+$/.test(x)), 'SEP: los saldos negativos se muestran "-$1.234.567"');
  t.eq(noOk(sep.saldoTotal.concat(sep.saldoRem), MONTO_OK), [], 'SEP: todos los saldos cumplen el formato de pesos');
  t.ok(sep.kpi.some((x) => /\d,\d% del marco/.test(x)), 'SEP: la tarjeta de Gasto Remuneraciones dice "54,6% del marco"', sep.kpi.filter((x) => /del marco/.test(x)));

  // 3) Modales de detalle (SEP y fuentes)
  for (const rbd of ['1121', '1128', '11206']) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    reporta(`modal SEP ${rbd}`, await texto('#rbdModal'));
    await page.keyboard.press('Escape');
  }
  for (const [f, id] of [['general', '1121'], ['general', 'AC'], ['junji', '5402002'], ['faep', '1121']]) {
    await h.clickTab('of-' + f);
    await page.click(`#otrasFuentesTbody-${f} td[data-abrir-otra-fuente="${id}"]`);
    await h.waitIdle();
    reporta(`modal ${f} ${id}`, await texto('#otrasFuentesModal'));
    await page.keyboard.press('Escape');
  }

  // 4) % Ejecución: tarjetas, tabla, tooltip y etiqueta final del gráfico
  await h.clickTab('ejecucion');
  const selecciones = [['', 'SEP agregado'], ['1121', 'SEP RBD 1121'], ['1128', 'SEP RBD 1128']];
  for (const [val, nombre] of selecciones) {
    await page.evaluate((v) => { const s = document.getElementById('ejecRbdSelect'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, val);
    await h.waitIdle();
    reporta(`% Ejecución ${nombre}`, await texto('#tab-ejecucion'));
    const e = await page.evaluate(() => ({
      kpi: Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card .value')).map((x) => x.textContent.trim()),
      tabla: Array.from(document.querySelectorAll('#ejecTable tbody td.num')).map((x) => x.textContent.trim()).filter((x) => /%$|^—$/.test(x)),
      fin: Array.from(document.querySelectorAll('.ejec-end-label')).map((x) => x.textContent.trim()),
    }));
    t.eq(noOk(e.kpi, PCT_OK), [], `% Ejecución ${nombre}: las ${e.kpi.length} tarjetas usan "54,6%"`);
    t.eq(noOk(e.tabla, /^(—|(0|[1-9]\d{0,2}(\.\d{3})*),\d%)$/), [], `% Ejecución ${nombre}: las ${e.tabla.length} celdas de % de la tabla usan coma`);
    t.eq(noOk(e.fin, PCT_OK), [], `% Ejecución ${nombre}: las etiquetas finales del gráfico (${e.fin.length}) usan coma`);
    await page.hover('.ejec-hit-col[data-idx="3"]');
    const tip = await page.evaluate(() => document.getElementById('ejecTooltip').innerText);
    t.ok(/\d,\d%/.test(tip) && defectos(tip).length === 0, `% Ejecución ${nombre}: el tooltip del gráfico usa coma`, tip);
  }
  for (const f of ['general', 'junji']) {
    await page.evaluate((k) => { const b = Array.from(document.querySelectorAll('#tab-ejecucion button, #tab-ejecucion [data-ejec-fuente]')).find((x) => (x.dataset.ejecFuente || x.dataset.fuente) === k); if (b) b.click(); }, f);
    await h.waitIdle();
    reporta(`% Ejecución (${f})`, await texto('#tab-ejecucion'));
  }

  // 5) Lo que se imprime (PDF individual SEP, de entidad y de % Ejecución)
  await h.clickTab('panel');
  const imprimirYLeer = async (disparar) => { await page.evaluate(() => { window.__prints = []; }); await disparar(); const p = (await h.prints())[0]; await page.waitForTimeout(450); return p ? (p.printWrap || p.visibleText || '') : ''; };
  const pdfFila = await imprimirYLeer(() => page.click('#tableBody .row-action-btn[data-action="pdf"][data-rbd="1121"]'));
  t.ok(/\d,\d%/.test(pdfFila), 'PDF individual SEP: los porcentajes salen con coma', pdfFila.slice(0, 200));
  reporta('PDF individual SEP (RBD 1121)', pdfFila);
  const pdfFila2 = await imprimirYLeer(() => page.click('#tableBody .row-action-btn[data-action="pdf"][data-rbd="11206"]'));
  reporta('PDF individual SEP (RBD 11206, con saldos negativos)', pdfFila2);
  await h.clickTab('of-junji');
  reporta('PDF de entidad (JUNJI)', await imprimirYLeer(() => page.click('#otrasFuentesTbody-junji .row-action-btn[data-action="pdf"][data-rbd="5402002"]')));
  await h.clickTab('ejecucion');
  reporta('PDF de % Ejecución', await imprimirYLeer(() => page.click('#ejecPdfBtn')));

  // 6) Los respaldos NO cambian: el CSV resumen de SEP conserva "54.6%" (contrato) y los montos sin separadores
  await h.clickTab('panel');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#downloadBtn')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  t.ok(/\d+\.\d+%/.test(csv) && !/\d+,\d+%/.test(csv), 'CSV resumen SEP: los porcentajes conservan el punto decimal (formato de respaldo, no cambia)', csv.split('\n')[1]);
  t.ok(!/\$-?\d|-\$\d/.test(csv), 'CSV resumen SEP: sin signo $ ni separadores de miles en los montos');

  t.noErrores(h);
  await h.close();
});
