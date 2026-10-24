// Registro de compras por CONCEPTO · INVARIANTE entre vistas: con documentos cargados en las 5 fuentes por concepto (fixture `compras_conceptos`), «Documentado» y «Sin documento» se suman
// (B&S = sin documento + documentado) y las MISMAS cifras salen en: la pestaña de cada fuente (tarjetas Real / Proyectado / Total y filas, con el desglose «Doc. · S/doc.»), el Panel principal
// (tarjetas por fuente, franja, evolución mensual, «Atención»), % Ejecución (cada fuente, una entidad y Consolidado), el Visualizador (por fuente y por código) y el Reporte personalizado.
// Todo contra un cálculo independiente (tests/lib/compras_conceptos.mjs) a partir de los documentos del fixture. Lo documentado es SIEMPRE Real aunque su mes sea posterior al corte.
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { docsDe, parseCLP, MESES } from '../lib/corte.mjs';
import { FUENTES_CONCEPTO, fuenteInfo, fuenteEsperada, entidadDe, documentadoDe, serieMensualEsperada, leerTarjetasFuente, leerFilasFuente, clp } from '../lib/compras_conceptos.mjs';

const dashVista = async (h, v) => { await h.page.click(`.dash-chips button[data-dash-vista="${v}"]`); await h.waitIdle(); };
const strip = (page) => page.evaluate(() => { const o = {}; document.querySelectorAll('#dashStrip .dash-tile').forEach(t => { o[t.querySelector('.t-label').textContent.trim()] = t.querySelector('.t-value').textContent.trim(); }); return o; });
const cardsDash = (page) => page.evaluate(() => { const o = {}; document.querySelectorAll('#dashCards .dash-card').forEach(c => { o[c.dataset.fuente] = { ing: +c.dataset.ing, rem: +c.dataset.rem, bys: +c.dataset.bys, gas: +c.dataset.gas, saldo: +c.dataset.saldo }; }); return o; });
const serieMensual = (page) => page.evaluate(() => { const filas = Array.from(document.querySelectorAll('#dashTablaMesBody tbody tr')); const ult = filas[filas.length - 1]; return { ing: ult.children[1].textContent.trim(), gas: ult.children[2].textContent.trim(), saldo: ult.children[3].textContent.trim() }; });
const vzTotales = (page, id) => page.evaluate((i) => { const tr = document.querySelector(`#${i} tr.vz-total-row`); return Array.from(tr.querySelectorAll('td')).slice(1, 4).map(td => td.textContent.trim()); }, id);
const marcar = (page, sel, v) => page.evaluate(([s, val]) => { const el = document.querySelector(s); if (!el) return false; el.checked = val; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [sel, v]);

await correrSpec('compras_conceptos_totales', async (t) => {
  const docs = docsDe('compras_conceptos');
  const esp = Object.fromEntries(FUENTES_CONCEPTO.map(k => [k, fuenteEsperada(docs, k)]));
  // Sanidad del oráculo: cada fuente por concepto tiene documentos y lo documentado nunca va a Proyectado.
  FUENTES_CONCEPTO.forEach(k => {
    const s = esp[k].suma;
    t.ok(s.total.bysDoc > 0 && s.proy.bysDoc === 0 && s.real.bysDoc === s.total.bysDoc, `oráculo ${k}: lo documentado (${s.total.bysDoc}) es todo Real y no hay nada en Proyectado`);
    t.eq([s.real.bys + s.proy.bys, s.real.gasto + s.proy.gasto, s.real.saldo + s.proy.saldo], [s.total.bys, s.total.gasto, s.total.saldo], `oráculo ${k}: Real + Proyectado = Total`);
    t.eq(s.total.bys, s.total.bysDoc + s.total.bysSin, `oráculo ${k}: B&S = documentado + sin documento`);
  });
  const sumaTodas = { real: {}, proy: {}, total: {} };

  const h = await boot({ fixture: 'compras_conceptos' });
  const { page } = h;

  // ================================================================ pestaña de cada fuente: tarjetas y filas
  for (const k of FUENTES_CONCEPTO) {
    await clickTab(page, 'of-' + k);
    const tarj = await leerTarjetasFuente(page, k);
    for (const [tipo, suf] of [['total', 'Total'], ['real', 'Real'], ['proy', 'Proyectado']]) {
      const e = esp[k].suma[tipo];
      const leidos = {
        ingreso: parseCLP(tarj[tipo][`Ingreso (${suf})`].valor), rem: parseCLP(tarj[tipo][`Gasto Remuneraciones (${suf})`].valor), bys: parseCLP(tarj[tipo][`Gasto Bienes y Servicios (${suf})`].valor),
        gasto: parseCLP(tarj[tipo][`Gasto Total (${suf})`].valor), saldo: parseCLP(tarj[tipo][`Saldo (${suf})`].valor),
      };
      t.eq(leidos, { ingreso: e.ingreso, rem: e.rem, bys: e.bys, gasto: e.gasto, saldo: e.saldo }, `${k}, tarjetas ${tipo}: ingreso / rem / B&S / gasto / saldo = cálculo independiente (B&S incluye lo documentado)`);
      t.eq(tarj[tipo][`Gasto Bienes y Servicios (${suf})`].nota, `Documentado ${e.bysDoc < 0 ? '-' : ''}$${Math.abs(e.bysDoc).toLocaleString('es-CL')} · Sin documento ${e.bysSin < 0 ? '-' : ''}$${Math.abs(e.bysSin).toLocaleString('es-CL')}`, `${k}, tarjeta de B&S ${tipo}: «Documentado $X · Sin documento $Y» por separado`);
      Object.entries(e).forEach(([c, v]) => { if (typeof v === 'number') sumaTodas[tipo][c] = (sumaTodas[tipo][c] || 0) + v; });
    }
    t.eq(tarj.total['Saldo (Total)'].nota.includes(`${esp[k].suma.nDeficit} de ${esp[k].suma.nEntidades} entidades en déficit`), true, `${k}: «N de M entidades en déficit» = cálculo independiente (${esp[k].suma.nDeficit} de ${esp[k].suma.nEntidades})`);
    // Filas: una por entidad y por vista (la columna «Real hasta» y la tabla siguen el chip de vista).
    let malas = [];
    for (const vista of ['total', 'real', 'proy']) {
      await page.click(`#tab-of-${k} .of-chip[data-of-vista="${vista}"]`);
      await h.waitIdle();
      const filas = await leerFilasFuente(page, k);
      Object.entries(esp[k].porId).forEach(([id, e]) => {
        const f = filas[id], b = e[vista];
        if (!f) { malas.push(`${id}: sin fila`); return; }
        const ok = clp(f.ingreso) === b.ingreso && clp(f.rem) === b.rem && clp(f.bys) === b.bys && clp(f.gasto) === b.gasto && clp(f.saldo) === b.saldo;
        if (!ok) malas.push(`${vista} ${id}: ${JSON.stringify(f)} ≠ ${JSON.stringify(b)}`);
        const splitEsperado = b.bysDoc ? `Doc. ${b.bysDoc < 0 ? '-' : ''}$${Math.abs(b.bysDoc).toLocaleString('es-CL')} · S/doc. ${b.bysSin < 0 ? '-' : ''}$${Math.abs(b.bysSin).toLocaleString('es-CL')}` : '';
        if (f.split !== splitEsperado) malas.push(`${vista} ${id}: desglose «${f.split}» ≠ «${splitEsperado}»`);
      });
    }
    t.ok(!malas.length, `${k}: cada fila (ingreso, rem, B&S, gasto, saldo y el desglose Doc./S/doc.) = cálculo independiente en Total, Real y Proyectado`, malas.slice(0, 5));
    await page.click(`#tab-of-${k} .of-chip[data-of-vista="total"]`);
  }

  // ================================================================ Panel principal
  await clickTab(page, 'Panel principal');
  const tot = {};
  for (const vista of ['total', 'real', 'proy']) {
    await dashVista(h, vista);
    const cards = await cardsDash(page);
    for (const k of FUENTES_CONCEPTO) {
      const e = esp[k].suma[vista];
      t.eq(cards[k], { ing: e.ingreso, rem: e.rem, bys: e.bys, gas: e.gasto, saldo: e.saldo }, `Panel principal (${vista}): la tarjeta de ${k} tiene la misma B&S, gasto y saldo que su pestaña (documentado + sin documento)`);
    }
    const s = await strip(page);
    const gastoStrip = parseCLP(s['Gasto Total']);
    t.eq(Object.values(cards).reduce((a, c) => a + c.gas, 0), gastoStrip, `Panel principal (${vista}): el gasto total de la franja es la suma de las 10 tarjetas`);
    t.eq(parseCLP(s['Gasto Remuneraciones']) + parseCLP(s['Gasto Honorarios (Subt. 21)']) + parseCLP(s['Gasto Bienes y Servicios']), gastoStrip, `Panel principal (${vista}): Rem. + Hon. + B&S = Gasto Total en la franja`);
    t.eq(Object.values(cards).reduce((a, c) => a + c.saldo, 0), parseCLP(s['Saldo consolidado']), `Panel principal (${vista}): el saldo consolidado es la suma de los saldos de las tarjetas`);
    const m = await serieMensual(page);
    t.eq([parseCLP(m.gas), parseCLP(m.saldo)], [gastoStrip, parseCLP(s['Saldo consolidado'])], `Panel principal (${vista}): la evolución mensual suma el mismo gasto total y saldo que la franja`);
    tot[vista] = gastoStrip;
    if (vista === 'total') {
      // «Atención»: el saldo de cada entidad de estas fuentes en déficit = el de la tabla (con lo documentado dentro).
      const at = await page.evaluate(() => Array.from(document.querySelectorAll('#dashAtencion li[data-atencion-rbd]')).map(li => ({ fuente: li.dataset.atencionFuente, rbd: li.dataset.atencionRbd, saldo: li.querySelector('.a-saldo').textContent.trim() })));
      const deConcepto = at.filter(a => FUENTES_CONCEPTO.includes(a.fuente));
      let bien = 0, mal = [];
      for (const a of deConcepto) {
        const e = esp[a.fuente].porId[a.rbd];
        if (a.saldo.replace(/^▼\s*/, '') === (e.total.saldo < 0 ? '-' : '') + '$' + Math.abs(e.total.saldo).toLocaleString('es-CL') && e.estado === 'deficit') bien++; else mal.push([a, e.total.saldo, e.estado]);
      }
      t.ok(deConcepto.length > 0 && bien === deConcepto.length, `«Atención»: ${deConcepto.length} entidades de las fuentes por concepto, todas en Déficit con el saldo del cálculo independiente (documentado incluido)`, mal.slice(0, 3));
    }
  }
  await dashVista(h, 'total');

  // ================================================================ % Ejecución: cada fuente, una entidad y Consolidado
  await clickTab(page, '% Ejecución');
  const filasEjec = () => page.evaluate(() => Array.from(document.querySelectorAll('#ejecTbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  for (const k of FUENTES_CONCEPTO) {
    await page.click(`#ejecFuenteChips .of-chip[data-ejec-fuente="${k}"]`);
    await page.selectOption('#ejecRbdSelect', '');
    await h.waitIdle();
    let filas = await filasEjec();
    const ser = serieMensualEsperada(docs, k);
    const e = esp[k].suma.total;
    t.eq(filas.map(f => parseCLP(f[6])), ser.bys.real.map((v, i) => Math.round(v + ser.bys.proy[i])), `% Ejecución ${k}: «Gasto B&S (mes)» es mes a mes sin documento + documentado`);
    t.eq(filas.map(f => parseCLP(f[3])), ser.rem.real.map((v, i) => Math.round(v + ser.rem.proy[i])), `% Ejecución ${k}: «Gasto Rem. (mes)» mes a mes`);
    t.eq(filas.reduce((s, f) => s + parseCLP(f[6]), 0), e.bys, `% Ejecución ${k}: los 12 meses de B&S suman el B&S de la pestaña (${e.bys})`);
    const kc = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card')).map(c => ({ l: c.querySelector('.label').textContent.trim(), d: c.querySelector('.delta').textContent.trim() })));
    const monto = (rotulo) => { const c = kc.find(x => x.l === rotulo); const m = c && /\((-?\$[\d.]+)\)/.exec(c.d); return m ? parseCLP(m[1]) : null; };
    t.eq([monto('% Ejec. B&S — Real+Proy a diciembre'), monto('% Ejec. Total — Real+Proy a diciembre'), monto('% Ejec. B&S — Real'), monto('% Ejec. Total — Real')],
      [e.bys, e.gasto, esp[k].suma.real.bys, esp[k].suma.real.gasto], `% Ejecución ${k}: tarjetas B&S y Total (Real+Proy y Real) = cálculo independiente`);
  }
  // Una entidad: FAEP / 1121 (con documentos) y FIGA / 5404001 (jardín).
  for (const [k, id] of [['faep', '1121'], ['figa', '5404001'], ['junji', '5403002']]) {
    await page.click(`#ejecFuenteChips .of-chip[data-ejec-fuente="${k}"]`);
    await page.selectOption('#ejecRbdSelect', id);
    await h.waitIdle();
    const filas = await filasEjec();
    const ser = serieMensualEsperada(docs, k, id);
    t.eq(filas.map(f => parseCLP(f[6])), ser.bys.real.map((v, i) => Math.round(v + ser.bys.proy[i])), `% Ejecución ${k} / ${id}: «Gasto B&S (mes)» incluye lo documentado`);
    t.eq(filas.reduce((s, f) => s + parseCLP(f[6]), 0), esp[k].porId[id].total.bys, `% Ejecución ${k} / ${id}: la suma anual = B&S de la entidad`);
  }
  await page.selectOption('#ejecRbdSelect', '');
  // Consolidado: el gasto total a diciembre es EXACTAMENTE el «Gasto Total» de la franja del Panel principal (vista Total).
  await page.click('#ejecFuenteChips .of-chip[data-ejec-fuente="consolidado"]');
  await h.waitIdle();
  const kcc = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecKpiRow .kpi-card')).map(c => ({ l: c.querySelector('.label').textContent.trim(), d: c.querySelector('.delta').textContent.trim() })));
  const anual = kcc.find(k => k.l === '% Ejec. Total — Real+Proy a diciembre');
  const mm = /\((-?\$[\d.]+)\)/.exec(anual.d);
  t.eq(mm && parseCLP(mm[1]), tot.total, 'Consolidado: el gasto total a diciembre es EXACTAMENTE el «Gasto Total» de la franja del Panel principal (con lo documentado de las 5 fuentes)');

  // ================================================================ Reportes: Visualizador
  await clickTab(page, 'Reportes');
  const claves = { real: 0, proy: 1, total: 2 };
  for (const k of FUENTES_CONCEPTO) {
    await page.click('#vzFuentesNinguna');
    await page.click(`#vzFuenteChips [data-vz-fuente="${k}"]`);
    await h.waitIdle();
    const e = esp[k].suma;
    const gas = (await vzTotales(page, 'vzBodyGas')).map(parseCLP);
    t.eq(gas, [e.real.gasto, e.proy.gasto, e.total.gasto], `Visualizador (${k}): Total Gastos Real / Proyectado / Total = pestaña (con lo documentado dentro)`);
    const saldo = await page.evaluate(() => Array.from(document.querySelectorAll('#vzSaldo .dash-tile .t-value')).map(x => x.textContent.trim()));
    t.eq(saldo.map(parseCLP), [e.real.saldo, e.proy.saldo, e.total.saldo], `Visualizador (${k}): Saldo Real / Proyectado / Total = pestaña`);
    await page.click('#vzExpGas');
    const nodos = await page.evaluate(() => Array.from(document.querySelectorAll('#vzBodyGas tr.vz-row')).map(tr => ({ n: tr.querySelector('.vz-name').textContent.trim().replace(/^[▸▾]\s*/, ''), real: tr.children[1].textContent.trim(), proy: tr.children[2].textContent.trim(), tot: tr.children[3].textContent.trim() })));
    const nodoDoc = nodos.find(n => n.n === 'Bienes y Servicios — documentado (compras por concepto)');
    t.eq(nodoDoc && [parseCLP(nodoDoc.real), parseCLP(nodoDoc.proy), parseCLP(nodoDoc.tot)], [e.total.bysDoc, 0, e.total.bysDoc], `Visualizador (${k}): nodo «Bienes y Servicios — documentado (compras por concepto)» = todo lo documentado, todo Real`);
    const nodoBys = nodos.find(n => n.n === 'Bienes y Servicios');
    t.eq(nodoBys && [parseCLP(nodoBys.real), parseCLP(nodoBys.proy)], [e.real.bysSin, e.proy.bysSin], `Visualizador (${k}): nodo «Bienes y Servicios» = solo lo «sin documento» (Real hasta el corte, Proyectado después)`);
    // Una línea por concepto: documentado (grupo bys_doc, siempre Real) y sin documento (grupo bys_concepto), cada una con su total.
    const nodosPorId = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#vzBodyGas tr.vz-row')).map(tr => [tr.dataset.vzId, [tr.children[1].textContent.trim(), tr.children[2].textContent.trim(), tr.children[3].textContent.trim()]])));
    const docPorConcepto = {}, sinPorConcepto = {};
    Object.values(esp[k].porId).forEach(en => {
      Object.entries(en.doc.conceptos).forEach(([c, arr]) => { docPorConcepto[c] = (docPorConcepto[c] || 0) + arr.reduce((a, b) => a + b, 0); });
      Object.values((docs[en.id].otras_fuentes[k] || {}).bys_items || {}).forEach(it => { sinPorConcepto[it.concepto] = (sinPorConcepto[it.concepto] || 0) + MESES.reduce((a, m) => a + (it.meses[m] || 0), 0); });
    });
    const malLineas = [];
    Object.entries(docPorConcepto).forEach(([c, v]) => {
      const n = nodosPorId[`gasto|f:${k}|bys_doc||${c}`];
      if (!n || parseCLP(n[0]) !== v || parseCLP(n[1]) !== 0 || parseCLP(n[2]) !== v) malLineas.push(['doc', c, n, v]);
    });
    Object.entries(sinPorConcepto).forEach(([c, v]) => {
      const n = nodosPorId[`gasto|f:${k}|bys_concepto||${c}`];
      if (!n || parseCLP(n[2]) !== v) malLineas.push(['sin', c, n, v]);
    });
    t.ok(!malLineas.length && Object.keys(docPorConcepto).length > 0, `Visualizador (${k}): una línea por concepto documentado (todo Real) y otra por concepto «sin documento», con sus totales`, malLineas.slice(0, 3));
    await page.click('#vzAgruparChips [data-vz-agrupar="codigo"]');
    await h.waitIdle();
    t.eq((await vzTotales(page, 'vzBodyGas')).map(parseCLP), [e.real.gasto, e.proy.gasto, e.total.gasto], `Visualizador por código (${k}): los mismos totales de gasto`);
    t.ok(await page.evaluate(() => /documentado \(compras por concepto\)/.test(document.getElementById('vzBodyGas').innerText)), `Visualizador por código (${k}): aparece el grupo «documentado (compras por concepto)»`);
    await page.click('#vzAgruparChips [data-vz-agrupar="fuente"]');
    await h.waitIdle();
  }
  // Las 5 fuentes juntas.
  await page.click('#vzFuentesNinguna');
  for (const k of FUENTES_CONCEPTO) await page.click(`#vzFuenteChips [data-vz-fuente="${k}"]`);
  await h.waitIdle();
  t.eq((await vzTotales(page, 'vzBodyGas')).map(parseCLP), [sumaTodas.real.gasto, sumaTodas.proy.gasto, sumaTodas.total.gasto], 'Visualizador (las 5 fuentes): Total Gastos = suma de las 5 pestañas');

  // ================================================================ Reporte personalizado
  await page.click('#vzLimpiarBtn');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  await page.click('#reporteRbdNinguno');
  await page.click('#reporteConceptoNinguno');
  const entidades = ['1121', 'AC', '5402002', '5403002', '5404001'];
  for (const id of entidades) t.ok(await marcar(page, `#reporteRbdList input[data-rbd-check="${id}"]`, true), `Reporte personalizado: la entidad ${id} está en la lista`);
  const keys = ['of|faep|bys_total', 'of|faep|bys_doc', 'of|faep|bys_sindoc', 'of|faep|bys_doc_item|Alimentación', 'of|figa|bys_total', 'of|figa|bys_doc', 'of|junji|bys_total', 'of|junji|bys_doc_item|Alimentación', 'of|aporte_educ|bys_doc'];
  const catalogo = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).map(e => e.dataset.conceptoCheck));
  for (const k of keys) t.ok(catalogo.includes(k), `Reporte personalizado: el catálogo trae «${k}»`);
  for (const k of keys) await marcar(page, `#reporteConceptoList input[data-concepto-check="${k}"]`, true);
  await h.waitIdle();
  const filasRep = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteTbody tr')).map(tr => ({ celdas: Array.from(tr.children).map(td => td.textContent.trim()), clases: Array.from(tr.querySelectorAll('td.num')).slice(0, 12).map(td => td.classList.contains('mes-real') ? 'R' : (td.classList.contains('mes-proy') ? 'P' : '-')).join('') })));
  const rotulo = { 'of|faep|bys_total': '[FAEP] Bienes y Servicios — total (Real+Proy)', 'of|faep|bys_doc': '[FAEP] Bienes y Servicios — documentado (compras)', 'of|faep|bys_sindoc': '[FAEP] Bienes y Servicios — sin documento (montos mensuales)',
    'of|faep|bys_doc_item|Alimentación': '[FAEP] B&S documentado — Alimentación', 'of|figa|bys_total': '[FIGA] Bienes y Servicios — total (Real+Proy)', 'of|figa|bys_doc': '[FIGA] Bienes y Servicios — documentado (compras)',
    'of|junji|bys_total': '[JUNJI] Bienes y Servicios — total (Real+Proy)', 'of|junji|bys_doc_item|Alimentación': '[JUNJI] B&S documentado — Alimentación', 'of|aporte_educ|bys_doc': '[Aporte Fiscal Educ.] Bienes y Servicios — documentado (compras)' };
  const celdaRep = (id, key) => { const f = filasRep.find(r => r.celdas[0] === id && r.celdas[2] === rotulo[key]); return f ? { total: parseCLP(f.celdas[f.celdas.length - 1]), clases: f.clases } : null; };
  const aplica = (key, id) => { const k = key.split('|')[1]; return fuenteInfo(k).universo === 'gesparvu' ? /^54/.test(id) : (fuenteInfo(k).universo === 'rbd_ac' ? !/^54/.test(id) : true); };
  let malRep = [];
  for (const key of keys) {
    const [, fk, tipo, arg] = key.split('|');
    for (const id of entidades) {
      if (!aplica(key, id)) { if (celdaRep(id, key)) malRep.push([id, key, 'no debería generar fila']); continue; }
      const e = entidadDe(docs, id, fk);
      const doc = e.doc;
      let esperado;
      if (tipo === 'bys_total') esperado = e.total.bys; else if (tipo === 'bys_doc') esperado = e.total.bysDoc; else if (tipo === 'bys_sindoc') esperado = e.total.bysSin;
      else esperado = (doc.conceptos[arg] || []).reduce((a, b) => a + b, 0);
      const r = celdaRep(id, key);
      if (!r || r.total !== esperado) malRep.push([id, key, r && r.total, esperado]);
    }
  }
  t.ok(!malRep.length, 'Reporte personalizado: por entidad, «total», «documentado», «sin documento» y «documentado por concepto» = cálculo independiente', malRep.slice(0, 5));
  const sub = (key) => { const f = filasRep.find(r => r.celdas[2] === 'Subtotal — ' + rotulo[key]); return f ? parseCLP(f.celdas[f.celdas.length - 1]) : null; };
  const sumaEnt = (key, campo) => entidades.filter(id => aplica(key, id)).reduce((a, id) => a + entidadDe(docs, id, key.split('|')[1]).total[campo], 0);
  t.eq([sub('of|faep|bys_total'), sub('of|faep|bys_doc'), sub('of|faep|bys_sindoc')], [sumaEnt('of|faep|bys_total', 'bys'), sumaEnt('of|faep|bys_doc', 'bysDoc'), sumaEnt('of|faep|bys_sindoc', 'bysSin')], 'Reporte personalizado: los subtotales de FAEP cuadran (total = documentado + sin documento)');
  // Colores real / proyectado por celda: lo documentado siempre Real; el total, mixto el mes en que hay real y proyectado a la vez.
  const clasesDe = (id, key) => celdaRep(id, key).clases;
  t.eq(clasesDe('1121', 'of|faep|bys_doc'), 'RRRRRRRRRRRR', 'Reporte personalizado: lo documentado se colorea «real» en los 12 meses');
  const e1121 = entidadDe(docs, '1121', 'faep');
  const sinMes = new Array(12).fill(0);
  const ofx = docs['1121'].otras_fuentes.faep;
  Object.values(ofx.bys_items).forEach(it => MESES.forEach((m, i) => { sinMes[i] += it.meses[m] || 0; }));
  const docMes = e1121.doc.porMes;
  const esperadoClases = MESES.map((m, i) => { const real = (i + 1 <= e1121.corte ? sinMes[i] : 0) + docMes[i], proy = i + 1 > e1121.corte ? sinMes[i] : 0; return real && proy ? '-' : (real ? 'R' : (proy ? 'P' : (i + 1 <= e1121.corte ? 'R' : 'P'))); }).join('');
  t.eq(clasesDe('1121', 'of|faep|bys_total'), esperadoClases, 'Reporte personalizado: el total de B&S se colorea real / proyectado / mixto mes a mes (septiembre = mixto: documento real + sin documento proyectado)');
  t.ok(esperadoClases.includes('-'), 'el caso de prueba incluye al menos un mes mixto');
  t.noErrores(h);
  await h.close();
}, { modoBug: 'enforced' });
