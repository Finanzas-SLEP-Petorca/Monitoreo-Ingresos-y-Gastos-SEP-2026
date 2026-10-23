// Captura del golden master: recorre cada vista del panel con el fixture determinista y registra
//   - views : texto normalizado de cada panel + cifras clave + valores de inputs + hashes de gráficos
//   - datos : valores sueltos (p. ej. qué pestaña quedó activa al hacer clic en una tarjeta)
//   - exports: SALIDAS de exportación (CSV, libros Excel -> hojas, JSON -> resumen, impresión/PDF -> HTML imprimible)
// Cada sección arranca su propia página (estado limpio) y falla si hay errores de consola/página no esperados.
import { boot } from '../lib/boot.mjs';
import { vista, capturarDescarga, resumenDescarga, resumenImpresion } from '../lib/capture-utils.mjs';

// ---------------------------------------------------------------- helpers de interacción
async function setSelect(page, selector, valor) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!el) throw new Error('no existe ' + s);
    el.value = String(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [selector, valor]);
}
async function setCheck(page, selector, on) {
  return page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!el) return false;
    if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  }, [selector, on]);
}
async function abrirDetails(page, selector) {
  await page.evaluate((s) => document.querySelectorAll(s + ' details').forEach(d => { d.open = true; }), selector);
}

function crearRegistrador(res, h) {
  const { page } = h;
  let dialogosVistos = 0;
  const nuevosDialogos = () => { const n = h.dialogs.slice(dialogosVistos).map(d => `${d.type}: ${d.message}`); dialogosVistos = h.dialogs.length; return n; };
  return {
    async vista(nombre, selector, opts) { await h.waitIdle(); res.views[nombre] = await vista(page, selector, opts); },
    dato(nombre, valor) { res.datos[nombre] = valor; },
    // Exportación que dispara una descarga (o, si no la hay, un alert): registra el contenido.
    async descarga(nombre, disparar, { espera = 4000 } = {}) {
      nuevosDialogos();
      let dl = null;
      try { dl = await capturarDescarga(page, disparar, { timeout: espera }); }
      catch (e) { if (!/Timeout/i.test(e.message)) throw e; }
      await page.waitForTimeout(50);
      const dialogos = nuevosDialogos();
      res.exports[nombre] = dl ? { ...(await resumenDescarga(page, dl)), ...(dialogos.length ? { dialogos } : {}) } : { kind: 'sin-descarga', dialogos };
    },
    // Exportación por window.print() (PDF del navegador): registra lo que se habría impreso.
    async imprimir(nombre, disparar) {
      nuevosDialogos();
      await page.evaluate(() => { window.__prints = []; window.__opens = []; });
      await disparar();
      const prints = await h.prints();
      const opens = await h.opens();
      await page.waitForTimeout(450); // el panel limpia #printSingleWrap ~300 ms después de imprimir
      const dialogos = nuevosDialogos();
      res.exports[nombre] = {
        kind: 'impresion', nPrint: prints.length, nOpen: opens.length,
        ...(prints[0] ? resumenImpresion(prints[0]) : {}),
        ...(opens[0] ? { openUrl: opens[0].url, openHtml: opens[0].html } : {}),
        ...(dialogos.length ? { dialogos } : {}),
      };
    },
  };
}

async function abrirModalOtraFuente(h, R, fuenteKey, id, nombre) {
  const { page } = h;
  await h.clickTab('of-' + fuenteKey);
  await page.click(`#otrasFuentesTbody-${fuenteKey} td[data-abrir-otra-fuente="${id}"]`);
  await h.waitIdle();
  await R.vista(nombre, '#otrasFuentesModal');
  await page.keyboard.press('Escape');
  await h.waitIdle();
}

// ---------------------------------------------------------------- secciones
// Selectores de los paneles de Reportes (se excluyen las listas estáticas de entidades/conceptos).
const SEL_VZ = ['#vzFuenteChips', '#vzEntidadesResumen', '#vzAgruparChips', '#vzNota', '#vzSaldo', '#vzTablaIng', '#vzTablaGas'];
const SEL_PERS = ['#reporteCountChip', '#reporteCorteNota', '#reporteTable'];
const VISTAS_REAL_PROY = ['general', 'junji', 'faep'];
const FUENTES = ['general', 'pie', 'mantenimiento', 'prorretencion', 'junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji'];

async function seccionEncabezadoYDashboard(h, R) {
  const { page } = h;
  await R.vista('encabezado', 'header.top');
  await abrirDetails(page, '#tab-dashboard');
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await R.vista(`dashboard.${v}`, '#tab-dashboard');
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.waitIdle();
  // Navegación desde una tarjeta de fuente
  await page.click('#dashCards .dash-card[data-fuente="general"]');
  await h.waitIdle();
  R.dato('dashboard.clic-tarjeta-general', await page.evaluate(() => (document.querySelector('.tab-btn.active') || {}).dataset.tab));
  await h.clickTab('Panel principal');
  // Panel "Atención": abre la entidad con peor saldo (cambia de pestaña y abre su modal)
  const primero = await page.evaluate(() => { const li = document.querySelector('#dashAtencion li'); return li ? { fuente: li.dataset.atencionFuente, rbd: li.dataset.atencionRbd } : null; });
  R.dato('dashboard.atencion-primera', primero);
  if (primero) {
    await page.click('#dashAtencion li:first-child');
    await h.waitIdle();
    await R.vista('dashboard.atencion-modal', primero.fuente === 'sep' ? '#rbdModal' : '#otrasFuentesModal');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  await h.clickTab('Panel principal');
  await R.imprimir('print.dashboard', () => page.click('#dashPdfBtn'));
}

async function seccionSep(h, R) {
  const { page } = h;
  await h.clickTab('SEP');
  await R.vista('sep.default', '#tab-panel');
  await setSelect(page, '#estadoFilter', 'deficit');
  await R.vista('sep.filtro-deficit', '#tab-panel');
  await setSelect(page, '#estadoFilter', 'riesgo');
  await R.vista('sep.filtro-riesgo', '#tab-panel');
  await setSelect(page, '#estadoFilter', '');
  await page.fill('#searchInput', 'liceo');
  await R.vista('sep.busqueda-liceo', '#tab-panel');
  await page.fill('#searchInput', '');
  await setSelect(page, '#corteMesSelect', '7');
  await R.vista('sep.corte-julio', '#tab-panel');
  await setSelect(page, '#corteMesSelect', '12');
  // Orden por columna: solo se captura la lista de RBD (en el orden mostrado), no toda la tabla.
  await page.click('#tab-panel th[data-key="rbd"]');
  await R.vista('sep.orden-rbd', '#tableBody td:nth-child(2)');
  await page.click('#tab-panel th[data-key="saldo_total"]');
  await page.click('#tab-panel th[data-key="saldo_total"]'); // vuelve al orden inicial (saldo_total, dir 1)
  await h.waitIdle();
  // Modales de detalle: RBD rico (compras, caracteres especiales, nota de crédito), RBD sin marco SEP con gasto,
  // RBD con corte de remuneraciones distinto y RBD con "real hasta" a diciembre.
  for (const rbd of ['1121', '1120', '1128', '1123', '1125']) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    await R.vista(`modal.sep.${rbd}`, '#rbdModal');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
}

async function seccionFuentes(h, R) {
  const { page } = h;
  for (const key of FUENTES) {
    await h.clickTab('of-' + key);
    await R.vista(`of.${key}.total`, `#tab-of-${key}`);
    if (VISTAS_REAL_PROY.includes(key)) { // una fuente de cada "forma": compras, JUNJI (3 ingresos) y concepto libre
      await page.click(`#tab-of-${key} .of-chip[data-of-vista="real"]`);
      await R.vista(`of.${key}.real`, `#tab-of-${key}`);
      await page.click(`#tab-of-${key} .of-chip[data-of-vista="proy"]`);
      await R.vista(`of.${key}.proy`, `#tab-of-${key}`);
      await page.click(`#tab-of-${key} .of-chip[data-of-vista="total"]`);
      await h.waitIdle();
    }
  }
  // Modales de detalle (compras con ⚠, AC, GESPARVU, fuentes por concepto)
  const casos = [
    ['general', '1121'], ['general', 'AC'], ['pie', '1121'], ['mantenimiento', '1121'], ['mantenimiento', 'AC'],
    ['prorretencion', 'AC'], ['junji', '5402002'], ['junji', '5404002'], ['faep', '1121'], ['faep', 'AC'],
    ['figa', 'AC'], ['aporte_educ', '1121'], ['aporte_junji', '5402002'],
  ];
  for (const [fuente, id] of casos) await abrirModalOtraFuente(h, R, fuente, id, `modal.of.${fuente}.${id}`);
}

async function seccionEjecucion(h, R) {
  const { page } = h;
  await h.clickTab('% Ejecución');
  await R.vista('ejec.sep.agregado', '#tab-ejecucion');
  await setSelect(page, '#ejecRbdSelect', '1121');
  await R.vista('ejec.sep.1121', '#tab-ejecucion');
  await setCheck(page, '#ejecShowRem', false);
  await R.vista('ejec.sep.1121.solo-bys', '#tab-ejecucion');
  await setCheck(page, '#ejecShowRem', true);
  await setSelect(page, '#ejecRbdSelect', '');
  await h.waitIdle();
  for (const key of [...FUENTES, 'consolidado']) {
    await page.click(`#ejecFuenteChips .of-chip[data-ejec-fuente="${key}"]`);
    await R.vista(`ejec.${key}`, '#tab-ejecucion');
  }
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="general"]');
  await setSelect(page, '#ejecRbdSelect', '1121');
  await R.vista('ejec.general.1121', '#tab-ejecucion');
  await setCheck(page, '#ejecShowTotal', false);
  await R.vista('ejec.general.1121.sin-total', '#tab-ejecucion');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="sep"]');
  await setSelect(page, '#ejecRbdSelect', '1128');
  await R.vista('ejec.sep.1128', '#tab-ejecucion');
  await R.imprimir('print.ejecucion-sep-1128', () => page.click('#ejecPdfBtn'));
}

async function configurarPersonalizado(h, R, { entidades, conceptos, meses }) {
  const { page } = h;
  await page.click('#reporteRbdNinguno');
  await page.click('#reporteConceptoNinguno');
  await page.click('#reporteMesNinguno');
  const faltantes = [];
  for (const id of entidades) if (!await setCheck(page, `#reporteRbdList input[data-rbd-check="${id}"]`, true)) faltantes.push('entidad:' + id);
  for (const k of conceptos) {
    const ok = await page.evaluate((key) => {
      const el = Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).find(e => e.dataset.conceptoCheck === key);
      if (!el) return false;
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, k);
    if (!ok) faltantes.push('concepto:' + k);
  }
  for (const m of meses) if (!await setCheck(page, `#reporteMesList input[data-mes-check="${m}"]`, true)) faltantes.push('mes:' + m);
  await h.waitIdle();
  return faltantes;
}

async function seccionReportes(h, R) {
  const { page } = h;
  await h.clickTab('Reportes');
  // ---- Visualizador
  await R.vista('rep.vz.default', SEL_VZ);
  await page.click('#vzExpIng'); await page.click('#vzExpGas');
  await R.vista('rep.vz.expandido', SEL_VZ);
  await R.descarga('exp.vz.fuente.csv', () => page.click('#vzCsvBtn'));
  await R.descarga('exp.vz.fuente.excel-ingresos', () => page.click('#vzExcelIng'));
  await R.descarga('exp.vz.fuente.excel-gastos', () => page.click('#vzExcelGas'));
  await R.imprimir('print.vz.fuente', () => page.click('#vzPdfBtn'));
  await page.click('#vzAgruparChips [data-vz-agrupar="codigo"]');
  await page.click('#vzExpIng'); await page.click('#vzExpGas');
  await R.vista('rep.vz.por-codigo', SEL_VZ);
  await R.descarga('exp.vz.codigo.csv', () => page.click('#vzCsvBtn'));
  await R.descarga('exp.vz.codigo.excel-gastos', () => page.click('#vzExcelGas'));
  // subconjunto: SEP + General, 3 entidades, detalle mensual de la primera fila
  await page.click('#vzLimpiarBtn');
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
  await page.click('#vzFuenteChips [data-vz-fuente="general"]');
  await page.evaluate(() => { document.getElementById('vzEntidadesDet').open = true; });
  await page.click('#vzEntNinguno');
  for (const id of ['1121', '1122', 'AC']) await setCheck(page, `#vzEntList input[data-vz-ent="${id}"]`, true);
  await page.evaluate(() => document.querySelector('#vzEntList input[data-vz-ent="1121"]').dispatchEvent(new Event('change', { bubbles: true })));
  await page.click('#vzExpIng'); await page.click('#vzExpGas');
  await page.click('#vzBodyGas .vz-mes-btn');
  await R.vista('rep.vz.subconjunto', SEL_VZ);
  await R.descarga('exp.vz.subconjunto.csv', () => page.click('#vzCsvBtn'));
  // sin selección: alert, sin descarga
  await page.click('#vzFuentesNinguna');
  await R.vista('rep.vz.sin-seleccion', SEL_VZ);
  await R.descarga('exp.vz.sin-seleccion.csv', () => page.click('#vzCsvBtn'), { espera: 1500 });
  await page.click('#vzLimpiarBtn');
  await h.waitIdle();

  // ---- Reporte personalizado
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  const f1 = await configurarPersonalizado(h, R, {
    entidades: ['1121', '1122', '1123'],
    conceptos: ['ingreso|Ingreso SEP Preferente', 'ingreso|Ingreso SEP Prioritario', 'rem', '22|BIBLIOTECAS, LIBROS Y REVISTAS', 'bys_proy'],
    meses: ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO'],
  });
  R.dato('rep.pers.sep.faltantes', f1);
  await R.vista('rep.pers.catalogo-grupos', '#reporteConceptoList summary');
  R.dato('rep.pers.catalogo', await page.evaluate(() => {
    const keys = Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).map(e => e.dataset.conceptoCheck);
    const dinamicos = keys.filter(k => /^of\|[a-z_]+\|(bys_codigo|bys_concepto|bys_proy_item)\|/.test(k));
    return { n: keys.length, dinamicos };
  }));
  await R.vista('rep.pers.sep', SEL_PERS);
  await R.descarga('exp.pers.sep.csv', () => page.click('#reporteCsvBtn'));
  await R.descarga('exp.pers.sep.excel', () => page.click('#reporteExcelBtn'));
  await R.imprimir('print.pers.sep', () => page.click('#reportePdfBtn'));
  const f2 = await configurarPersonalizado(h, R, {
    entidades: ['1121', 'AC', '5402002'],
    conceptos: ['of|general|ingreso', 'of|general|rem', 'of|general|bys_total', 'of|junji|ingreso_operacion', 'of|junji|bys_total', 'of|faep|bys_concepto|Alimentación', 'of|aporte_junji|ingreso'],
    meses: ['ENERO', 'JUNIO', 'JULIO', 'AGOSTO', 'DICIEMBRE'],
  });
  R.dato('rep.pers.multifuente.faltantes', f2);
  await R.vista('rep.pers.multifuente', SEL_PERS);
  await R.descarga('exp.pers.multifuente.csv', () => page.click('#reporteCsvBtn'));
  await R.descarga('exp.pers.multifuente.excel', () => page.click('#reporteExcelBtn'));
}

async function seccionExportsSep(h, R) {
  const { page } = h;
  await h.clickTab('SEP');
  await R.descarga('exp.sep.csv-resumen', () => page.click('#downloadBtn'));
  await R.descarga('exp.sep.excel-resumen', () => page.click('#downloadResumenExcelBtn'));
  await R.descarga('exp.sep.excel-carga', () => page.click('#downloadExcelBtn'));
  await R.descarga('exp.sep.csv-compras', () => page.click('#downloadComprasSepBtn'));
  await R.descarga('exp.sep.json-carga', () => page.click('#downloadCargaBtn'));
  await R.imprimir('print.sep.general', () => page.click('#exportPdfBtn'));
  await page.fill('#searchInput', 'liceo');
  await h.waitIdle();
  await R.descarga('exp.sep.csv-resumen-filtrado-liceo', () => page.click('#downloadBtn'));
  await page.fill('#searchInput', '');
  await h.waitIdle();
  const fila = (rbd, accion) => `#tableBody button.row-action-btn[data-action="${accion}"][data-rbd="${rbd}"]`;
  await R.descarga('exp.sep.fila.1121.xls', () => page.click(fila('1121', 'excel')));
  await R.descarga('exp.sep.fila.1121.csv', () => page.click(fila('1121', 'csvsep')));
  await R.descarga('exp.sep.fila.1125.csv-sin-compras', () => page.click(fila('1125', 'csvsep')), { espera: 1500 });
  await R.descarga('exp.sep.fila.1120.xls-sin-marco', () => page.click(fila('1120', 'excel')));
  await R.imprimir('print.sep.fila.1121', () => page.click(fila('1121', 'pdf')));
}

async function seccionExportsFuentes(h, R) {
  const { page } = h;
  const fila = (key, rbd, accion) => `#otrasFuentesTbody-${key} button.row-action-btn[data-action="${accion}"][data-rbd="${rbd}"]`;
  // Fuentes con libro de compras (formato SUPEREDUC)
  for (const key of ['general', 'pie', 'mantenimiento', 'prorretencion']) {
    await h.clickTab('of-' + key);
    await R.descarga(`exp.of.${key}.csv-compras`, () => page.click(`#downloadComprasOFBtn-${key}`));
    await R.descarga(`exp.of.${key}.excel`, () => page.click(`#downloadExcelOFBtn-${key}`));
  }
  await h.clickTab('of-general');
  await R.descarga('exp.of.general.json-carga', () => page.click('#downloadCargaOFBtn-general'));
  await R.imprimir('print.of.general', () => page.click('#exportPdfOFBtn-general'));
  await R.descarga('exp.of.general.fila.1121.xls', () => page.click(fila('general', '1121', 'excel')));
  await R.descarga('exp.of.general.fila.1121.csv', () => page.click(fila('general', '1121', 'csv')));
  await R.descarga('exp.of.general.fila.AC.csv', () => page.click(fila('general', 'AC', 'csv')));
  await R.imprimir('print.of.general.fila.1121', () => page.click(fila('general', '1121', 'pdf')));
  await R.imprimir('print.of.general.fila.AC', () => page.click(fila('general', 'AC', 'pdf')));
  await R.descarga('exp.of.general.fila.1125.csv-sin-compras', () => page.click(fila('general', '1125', 'csv')), { espera: 1500 });
  // Fuentes por concepto (sin formato SUPEREDUC): CSV de detalle mensual por entidad
  for (const key of ['junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji']) {
    await h.clickTab('of-' + key);
    await R.descarga(`exp.of.${key}.excel`, () => page.click(`#downloadExcelOFBtn-${key}`));
  }
  await h.clickTab('of-junji');
  await R.descarga('exp.of.junji.json-carga', () => page.click('#downloadCargaOFBtn-junji'));
  await R.descarga('exp.of.junji.fila.5402002.xls', () => page.click(fila('junji', '5402002', 'excel')));
  await R.descarga('exp.of.junji.fila.5402002.csv-detalle', () => page.click(fila('junji', '5402002', 'csv')));
  await R.imprimir('print.of.junji.fila.5402002', () => page.click(fila('junji', '5402002', 'pdf')));
  await h.clickTab('of-faep');
  await R.descarga('exp.of.faep.fila.1121.csv-detalle', () => page.click(fila('faep', '1121', 'csv')));
  await R.imprimir('print.of.faep.fila.1121', () => page.click(fila('faep', '1121', 'pdf')));
  await h.clickTab('of-aporte_junji');
  await R.descarga('exp.of.aporte_junji.fila.5402002.csv-detalle', () => page.click(fila('aporte_junji', '5402002', 'csv')));
  await h.clickTab('of-mantenimiento');
  await R.descarga('exp.of.mantenimiento.fila.1121.csv', () => page.click(fila('mantenimiento', '1121', 'csv')));
}

// Con el fixture "cierre" (mes de cierre = septiembre en _meta; cortes propios de ingresos en 1121 → agosto, 1122 → septiembre y 1123 → diciembre; casi todas las
// remuneraciones y "Real hasta" de las fuentes en septiembre, salvo 8 entidades): el corte Real/Proyectado de los ingresos de SEP y el control del mes de cierre.
// Los montos son los de default.json; solo cambian los cortes. En default.json (sin mes de cierre ni cortes de ingresos) las vistas son las de siempre.
async function seccionCierre(h, R) {
  const { page } = h;
  await abrirDetails(page, '#tab-dashboard');
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await R.vista(`cierre.dashboard.${v}`, '#tab-dashboard');
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.clickTab('SEP');
  await page.evaluate(() => { document.getElementById('cierreAviso').open = true; });
  await R.vista('cierre.sep', '#tab-panel');
  for (const rbd of ['1121', '1122', '1123', '1128']) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    await R.vista(`cierre.modal.sep.${rbd}`, '#rbdModal');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  await R.descarga('cierre.exp.sep.json-carga', () => page.click('#downloadCargaBtn'));
  await R.imprimir('cierre.print.sep.fila.1121', () => page.click('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1121"]'));
  await R.imprimir('cierre.print.sep.fila.1128', () => page.click('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1128"]'));
  await h.clickTab('% Ejecución');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
  await R.vista('cierre.ejec.consolidado', '#tab-ejecucion');
  await h.clickTab('Reportes');
  await R.vista('cierre.rep.vz.default', SEL_VZ);
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
  await page.click('#vzExpIng'); await page.click('#vzExpGas');
  await R.vista('cierre.rep.vz.sep', SEL_VZ);
  await R.descarga('cierre.exp.vz.sep.csv', () => page.click('#vzCsvBtn'));
  await page.click('#vzLimpiarBtn');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  const f = await configurarPersonalizado(h, R, {
    entidades: ['1121', '1122', '1123', '1128'],
    conceptos: ['ingreso|Ingreso SEP Preferente', 'ingreso|Ingreso SEP Prioritario', 'rem'],
    meses: ['JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'],
  });
  R.dato('cierre.rep.pers.sep.faltantes', f);
  await R.vista('cierre.rep.pers.sep', SEL_PERS);
  await R.descarga('cierre.exp.pers.sep.csv', () => page.click('#reporteCsvBtn'));
}

// Con el fixture "compras" (default + casos de la PR D1: notas de crédito/débito con el signo "equivocado" en Firestore, fechas de 2025 / con formato no reconocido / de pago
// en 2027, una cuenta fuera del catálogo y una compra bajo la clave "0"): el signo normalizado en todas las vistas y exportaciones, los avisos de fecha/cuenta (marcas por
// fila, resumen sobre la tabla, "Datos a revisar") y el ID "0" en el Excel. Las compras AGREGADAS son lo único que difiere de default.json (ver generate.mjs).
async function seccionCompras(h, R) {
  const { page } = h;
  const fila = (rbd, accion) => `#tableBody button.row-action-btn[data-action="${accion}"][data-rbd="${rbd}"]`;
  await abrirDetails(page, '#tab-dashboard');
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await R.vista(`compras.dashboard.${v}`, '#tab-dashboard');
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.clickTab('SEP');
  await R.vista('compras.sep', '#tab-panel');
  for (const rbd of ['1121', '1122']) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    await R.vista(`compras.modal.sep.${rbd}`, '#rbdModal');
    if (rbd === '1121') { // el formulario con la ayuda de signo y los avisos de fecha en vivo
      await page.selectOption('#modalBody .compra-input[data-field="tipoDocumento"]', 'Nota de crédito');
      await page.fill('#modalBody .compra-input[data-field="fechaDocumento"]', '2025-12-30');
      await page.fill('#modalBody .compra-input[data-field="fechaPago"]', '2025-12-01');
      await R.vista('compras.modal.sep.1121.formulario-nc-2025', '#modalBody .compra-form-grid');
      await page.selectOption('#modalBody .compra-input[data-field="tipoDocumento"]', '');
      await page.fill('#modalBody .compra-input[data-field="fechaDocumento"]', '');
      await page.fill('#modalBody .compra-input[data-field="fechaPago"]', '');
    }
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  await R.vista('compras.sep.1122-1120', '#tableBody tr[data-rbd="1122"], #tableBody tr[data-rbd="1120"]');
  await h.clickTab('of-general');
  await R.vista('compras.of.general.total', '#tab-of-general');
  await abrirModalOtraFuente(h, R, 'general', '1121', 'compras.modal.of.general.1121');
  await abrirModalOtraFuente(h, R, 'general', 'AC', 'compras.modal.of.general.AC');
  await abrirModalOtraFuente(h, R, 'pie', '1121', 'compras.modal.of.pie.1121');
  await h.clickTab('% Ejecución');
  await R.vista('compras.ejec.sep.agregado', '#tab-ejecucion');
  await setSelect(page, '#ejecRbdSelect', '1121');
  await R.vista('compras.ejec.sep.1121', '#tab-ejecucion');
  await setSelect(page, '#ejecRbdSelect', '');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="general"]');
  await R.vista('compras.ejec.general', '#tab-ejecucion');
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
  await R.vista('compras.ejec.consolidado', '#tab-ejecucion');
  await h.clickTab('Reportes');
  await page.click('#vzFuentesNinguna');
  await page.click('#vzFuenteChips [data-vz-fuente="sep"]');
  await page.click('#vzFuenteChips [data-vz-fuente="general"]');
  await page.click('#vzAgruparChips [data-vz-agrupar="codigo"]');
  await page.click('#vzExpIng'); await page.click('#vzExpGas');
  await R.vista('compras.rep.vz.por-codigo', SEL_VZ);
  await R.descarga('compras.exp.vz.por-codigo.csv', () => page.click('#vzCsvBtn'));
  await page.click('#vzLimpiarBtn');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  const f = await configurarPersonalizado(h, R, {
    entidades: ['1121', '1122'],
    conceptos: ['22|BIBLIOTECAS, LIBROS Y REVISTAS', '22|MATERIAL Y RECURSOS DIDACTICOS'],
    meses: ['MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'DICIEMBRE'],
  });
  R.dato('compras.rep.pers.faltantes', f);
  await R.vista('compras.rep.pers', SEL_PERS);
  await R.descarga('compras.exp.pers.csv', () => page.click('#reporteCsvBtn'));
  await h.clickTab('SEP');
  await R.descarga('compras.exp.sep.csv-compras', () => page.click('#downloadComprasSepBtn'));
  await R.descarga('compras.exp.sep.excel-carga', () => page.click('#downloadExcelBtn'));
  await R.descarga('compras.exp.sep.excel-resumen', () => page.click('#downloadResumenExcelBtn'));
  await R.descarga('compras.exp.sep.json-carga', () => page.click('#downloadCargaBtn'));
  await R.descarga('compras.exp.sep.fila.1121.xls', () => page.click(fila('1121', 'excel')));
  await R.descarga('compras.exp.sep.fila.1121.csv', () => page.click(fila('1121', 'csvsep')));
  await R.imprimir('compras.print.sep.fila.1121', () => page.click(fila('1121', 'pdf')));
  await h.clickTab('of-general');
  await R.descarga('compras.exp.of.general.csv-compras', () => page.click('#downloadComprasOFBtn-general'));
  await R.descarga('compras.exp.of.general.excel', () => page.click('#downloadExcelOFBtn-general'));
  await R.descarga('compras.exp.of.general.fila.AC.csv', () => page.click('#otrasFuentesTbody-general button.row-action-btn[data-action="csv"][data-rbd="AC"]'));
  await R.imprimir('compras.print.of.general.fila.1121', () => page.click('#otrasFuentesTbody-general button.row-action-btn[data-action="pdf"][data-rbd="1121"]'));
  await h.clickTab('of-pie');
  await R.descarga('compras.exp.of.pie.csv-compras', () => page.click('#downloadComprasOFBtn-pie'));
}

// Con el fixture "estado" (default + casos de borde del Estado, PR D2 — ver generate.mjs): saldo 0, 99,996 %, -$1, 89,999 % / 90,000 %, recurso 0, Carrera Docente, FAEP / General con saldo 0 y
// -$1, y los GESPARVU de JUNJI con el saldo de Operación para B&S negativo (solo, con el total, o ninguno). Cubre el Estado en TODAS las vistas que lo cuentan o lo listan.
async function seccionEstado(h, R) {
  const { page } = h;
  await abrirDetails(page, '#tab-dashboard');
  for (const v of ['total', 'real', 'proy']) {
    await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
    await R.vista(`estado.dashboard.${v}`, '#tab-dashboard');
  }
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.clickTab('SEP');
  await R.vista('estado.sep', '#tab-panel');
  for (const ef of ['deficit', 'riesgo', 'superavit']) {
    await setSelect(page, '#estadoFilter', ef);
    await R.vista(`estado.sep.filtro-${ef}`, '#tab-panel');
  }
  await setSelect(page, '#estadoFilter', '');
  await page.fill('#searchInput', '113');
  await R.vista('estado.sep.busqueda-113', '#tab-panel');
  await page.fill('#searchInput', '');
  for (const rbd of ['1131', '1136']) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    await R.vista(`estado.modal.sep.${rbd}`, '#rbdModal');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  for (const fk of ['faep', 'general', 'junji', 'aporte_junji']) {
    await h.clickTab('of-' + fk);
    await R.vista(`estado.of.${fk}`, '#tab-of-' + fk);
  }
  for (const [fk, id] of [['junji', '5402002'], ['junji', '5402004'], ['junji', '5401006'], ['junji', '5401005'], ['junji', '5401007'], ['faep', '1131']]) {
    await abrirModalOtraFuente(h, R, fk, id, `estado.modal.of.${fk}.${id}`);
  }
  await h.clickTab('SEP');
  await R.descarga('estado.exp.sep.csv-resumen', () => page.click('#downloadBtn'));
  await R.descarga('estado.exp.sep.excel-resumen', () => page.click('#downloadResumenExcelBtn'));
  await R.imprimir('estado.print.sep.general', () => page.click('#exportPdfBtn'));
  await R.imprimir('estado.print.sep.fila.1131', () => page.click('#tableBody button.row-action-btn[data-action="pdf"][data-rbd="1131"]'));
  await h.clickTab('of-junji');
  await R.descarga('estado.exp.of.junji.fila.5402002.csv', () => page.click('#otrasFuentesTbody-junji button.row-action-btn[data-action="csv"][data-rbd="5402002"]'));
  await R.descarga('estado.exp.of.junji.fila.5401005.csv', () => page.click('#otrasFuentesTbody-junji button.row-action-btn[data-action="csv"][data-rbd="5401005"]'));
  await R.imprimir('estado.print.of.junji.fila.5402002', () => page.click('#otrasFuentesTbody-junji button.row-action-btn[data-action="pdf"][data-rbd="5402002"]'));
  await h.clickTab('faep');
  await R.descarga('estado.exp.of.faep.fila.1131.csv', () => page.click('#otrasFuentesTbody-faep button.row-action-btn[data-action="csv"][data-rbd="1131"]'));
  await h.clickTab('% Ejecución');
  for (const rbd of ['', '1130']) {
    await setSelect(page, '#ejecRbdSelect', rbd);
    await R.vista(`estado.ejec.sep.${rbd || 'agregado'}`, '#tab-ejecucion');
  }
}

export const SECCIONES = [
  { nombre: 'dashboard', fn: seccionEncabezadoYDashboard },
  { nombre: 'sep', fn: seccionSep },
  { nombre: 'fuentes', fn: seccionFuentes },
  { nombre: 'ejecucion', fn: seccionEjecucion },
  { nombre: 'reportes', fn: seccionReportes },
  { nombre: 'exports-sep', fn: seccionExportsSep },
  { nombre: 'exports-fuentes', fn: seccionExportsFuentes },
  { nombre: 'cierre', fixture: 'cierre', fn: seccionCierre },
  { nombre: 'compras', fixture: 'compras', fn: seccionCompras },
  { nombre: 'estado', fixture: 'estado', fn: seccionEstado },
];

export async function capturar({ log = () => {}, solo = null, html = undefined } = {}) {
  const res = { views: {}, datos: {}, exports: {} };
  for (const s of SECCIONES) {
    if (solo && !solo.includes(s.nombre)) continue;
    const t0 = Date.now();
    const h = await boot({ fixture: s.fixture || 'default', html });
    try {
      const R = crearRegistrador(res, h);
      await s.fn(h, R);
      if (h.errors.length) throw new Error(`Errores no esperados en la sección "${s.nombre}":\n` + h.errors.map(e => `  [${e.kind}] ${e.text}`).join('\n'));
    } finally {
      await h.close();
    }
    log(`  sección ${s.nombre} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  return res;
}

