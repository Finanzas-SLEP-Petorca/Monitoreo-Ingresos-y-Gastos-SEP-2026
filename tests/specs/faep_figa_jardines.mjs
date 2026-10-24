// «Ajustes de fuentes», cambio 1 — FAEP y FIGA incluyen los 13 jardines (GESPARVU) además de los RBD y AC («ya que poseen ingresos y gastos en los Jardines»).
// Hasta ahora FAEP/FIGA listaban 55 RBD + AC (56 filas) y JUNJI / Aporte JUNJI los 13 GESPARVU; ahora FAEP y FIGA listan los tres (69 filas: RBD, luego AC, luego los jardines en el
// orden de JUNJI) y las demás fuentes conservan su universo. Fixture `jardines` (default + montos de FAEP/FIGA en varios jardines; ver generate.mjs) contra un cálculo INDEPENDIENTE desde los
// documentos. Cubre: universo y orden de cada una de las 9 pestañas, cifras por fila y totales (Total / Real / Proyectado) incluyendo jardines, Estado y conteos «de 69», Panel principal
// («Atención», tarjetas y franja), rótulos por TIPO de entidad (RBD / Administración Central / GESPARVU) en modal, PDF y nombres accesibles, guardado con merge sin tocar JUNJI ni Aporte JUNJI,
// corte «Real hasta» (uno y «Aplicar a todas»), % Ejecución, Reportes (Visualizador y Reporte personalizado), Excel exportar / importar (archivo nuevo, archivo antiguo sin jardines y fila de un jardín
// sin FAEP previo), XLS / CSV / PDF por fila de un jardín, respaldo JSON, y que los documentos de los jardines NUNCA se siembran.
// Debe FALLAR contra APP_HTML=@ff7a666 (el index.html anterior: FAEP/FIGA con 56 filas).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, leerXlsx, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';
import { MESES, RBD_IDS, GESPARVU_IDS, FUENTES, idsDeUniverso, tituloEntidad, corteFuente, parseCLP, kpis, clon } from '../lib/corte.mjs';
import { ETIQUETA, esperadoDe, filasFuente, leerDashboard, nDeM, universoSep, conteoFuente } from '../lib/estado.mjs';
import { libroXlsx, importarLibro } from '../lib/compras.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { TESTS_DIR } from '../lib/config.mjs';

const RBDS = JSON.parse(fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'rbds.json'), 'utf8'));
const NOMBRE = {}; RBDS.registros.forEach(r => { NOMBRE[r.rbd] = r.nombre; }); RBDS.gesparvu.forEach(g => { NOMBRE[g.rbd] = g.nombre; }); NOMBRE.AC = 'Administración Central';
const FAEP_FIGA = ['faep', 'figa'];
const ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const RUTA = (id) => `sep_carga_rbd/${id}`;

// ---------------------------------------------------------------- oráculo independiente (fuentes de concepto: FAEP / FIGA)
const nz = (v) => Number(v) || 0;
const sumaMeses = (l, desde = 1, hasta = 12) => MESES.reduce((s, m, i) => ((i + 1 >= desde && i + 1 <= hasta) ? s + nz(l && l.meses && l.meses[m]) : s), 0);
function detalle(docs, id, key) {
  const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes[key]) || {};
  const corte = corteFuente(docs, id, key);
  const items = Object.values(of.bys_items || {});
  const bloque = (d, h) => {
    const ingreso = sumaMeses(of.ingreso, d, h), rem = sumaMeses(of.gasto_rem, d, h), bys = items.reduce((s, it) => s + sumaMeses(it, d, h), 0);
    return { ingreso, rem, bys, gasto: rem + bys, saldo: ingreso - rem - bys };
  };
  return { corte, real: bloque(1, corte), proy: bloque(corte + 1, 12), total: bloque(1, 12) };
}
const sumaBloques = (docs, key, vista) => idsDeUniverso('rbd_ac_gesparvu').reduce((a, id) => {
  const b = detalle(docs, id, key)[vista];
  Object.keys(a).forEach(k => { a[k] += b[k]; });
  return a;
}, { ingreso: 0, rem: 0, bys: 0, gasto: 0, saldo: 0 });

const leerTabla = (page, key) => page.evaluate((k) => Array.from(document.querySelectorAll(`#otrasFuentesTbody-${k} tr[data-rbd]`)).map(tr => ({
  rbd: tr.dataset.rbd, nombre: tr.children[1].textContent.trim(), corte: tr.children[2].textContent.trim(), cifras: [3, 4, 5, 6, 7].map(i => tr.children[i].textContent.trim()),
})), key);
const cifrasDe = (b) => [b.ingreso, b.rem, b.bys, b.gasto, b.saldo];
const tituloModal = (page) => page.evaluate(() => document.getElementById('otrasFuentesModalTitle').textContent.trim());
async function vista(page, key, v) {
  await page.click(`#tab-of-${key} .of-chip[data-of-vista="${v}"]`);
}
async function exportar(page, disparar) {
  const dl = await capturarDescarga(page, disparar);
  return { ...dl, libro: await leerXlsx(page, dl.buffer) };
}

await correrSpec('faep_figa_jardines', async (t) => {
  const docs = cargarFixture('jardines').docs;
  const E = esperadoDe(docs);
  const h = await boot({ fixture: 'jardines', user: 'authorized' });
  const { page } = h;

  // ---------------------------------------------------------------- 0) oráculo y arranque sin siembra
  t.eq(idsDeUniverso('rbd_ac_gesparvu').length, 69, 'oráculo: el universo combinado son 69 entidades (55 RBD + AC + 13 GESPARVU)');
  t.eq(FUENTES.filter(f => f.universo === 'rbd_ac_gesparvu').map(f => f.key), FAEP_FIGA, 'oráculo: SOLO FAEP y FIGA usan el universo combinado');
  t.eq((await h.writes()).length, 0, 'el arranque no escribe nada (los documentos de los jardines ya existen: no se siembran ni se pisan)');

  // ---------------------------------------------------------------- 1) universo y orden de las 9 pestañas
  for (const f of FUENTES) {
    await clickTab(page, f.key);
    const ids = (await leerTabla(page, f.key)).map(x => x.rbd);
    const esperado = idsDeUniverso(f.universo);
    const orden = { rbd_ac: 'RBD y AC', gesparvu: 'los jardines', rbd_ac_gesparvu: 'RBD, AC y los jardines' }[f.universo];
    t.eq(ids, esperado, `${f.corto}: la tabla lista exactamente ${esperado.length} entidades (${orden}) en ese orden (universo ${f.universo})`);
  }
  await clickTab(page, 'faep');
  const tabla = await leerTabla(page, 'faep');
  t.eq(tabla.slice(55, 57).map(x => x.rbd), ['AC', '5402002'], 'FAEP: después de los 55 RBD viene AC y luego el primer jardín (5402002), en el mismo orden que JUNJI');
  t.eq(tabla.slice(56).map(x => x.rbd), GESPARVU_IDS, 'FAEP: los 13 jardines quedan al final, en el orden de JUNJI');
  t.eq(tabla.slice(56).map(x => x.nombre), RBDS.gesparvu.map(g => g.nombre), 'FAEP: con sus nombres');
  const cab = await page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesTable-faep thead th')).map(x => x.textContent.trim()));
  t.eq(cab[0], 'RBD / GESPARVU', 'FAEP: el primer encabezado dice «RBD / GESPARVU»');
  t.ok(/13 GESPARVU/.test(await page.evaluate(() => document.querySelector('#tab-of-faep .detalle-empty').textContent)) && /13 GESPARVU/.test(await page.evaluate(() => { document.querySelector('.tab-btn[data-tab="of-figa"]').click(); return document.querySelector('#tab-of-figa .detalle-empty').textContent; })), 'los textos de ayuda de FAEP y FIGA explican que las filas incluyen los 13 GESPARVU');

  // ---------------------------------------------------------------- 2) cifras por fila y totales de FAEP y FIGA (Total / Real / Proyectado), jardines incluidos
  for (const key of FAEP_FIGA) {
    await clickTab(page, key);
    for (const v of ['total', 'real', 'proy']) {
      await vista(page, key, v);
      await h.waitIdle();
      const filas = await leerTabla(page, key);
      const malas = filas.filter(f => JSON.stringify(f.cifras.map(parseCLP)) !== JSON.stringify(cifrasDe(detalle(docs, f.rbd, key)[v])));
      t.eq(malas.map(f => f.rbd), [], `${key.toUpperCase()} · ${v}: las cifras de las ${filas.length} filas (Ingreso, Rem., B&S, Gasto, Saldo) coinciden con el cálculo independiente`);
      const suf = { total: 'Total', real: 'Real', proy: 'Proyectado' }[v];
      const k = await kpis(page, `#ofKpiRow-${v}-${key}`);
      const esp = sumaBloques(docs, key, v);
      t.eq([k[`Ingreso (${suf})`], k[`Gasto Remuneraciones (${suf})`], k[`Gasto Bienes y Servicios (${suf})`], k[`Gasto Total (${suf})`], k[`Saldo (${suf})`]].map(parseCLP), cifrasDe(esp),
        `${key.toUpperCase()} · ${v}: las tarjetas KPI = la suma de sus 69 entidades (los jardines suman)`);
    }
    await vista(page, key, 'total');
    // los jardines con datos aparecen con sus cifras (no $0)
    const filas = await leerTabla(page, key);
    const conDatos = filas.filter(f => GESPARVU_IDS.includes(f.rbd) && f.cifras.map(parseCLP).some(Boolean)).map(f => f.rbd);
    t.eq(conDatos, GESPARVU_IDS.filter(id => detalle(docs, id, key).total.gasto || detalle(docs, id, key).total.ingreso), `${key.toUpperCase()}: los jardines con datos muestran sus cifras y el resto queda en $0`);
    t.eq(filas.filter(f => GESPARVU_IDS.includes(f.rbd) && !conDatos.includes(f.rbd)).every(f => f.cifras.every(c => parseCLP(c) === 0)), true, `${key.toUpperCase()}: los jardines sin datos parten en $0`);
  }
  // el corte "Real hasta" de cada jardín sale de su documento
  await clickTab(page, 'faep');
  const tf = await leerTabla(page, 'faep');
  t.eq(tf.find(x => x.rbd === '5402002').corte, 'Jul', 'FAEP · 5402002: «Real hasta» Jul (de su documento)');
  t.eq(tf.find(x => x.rbd === '5402004').corte, 'May', 'FAEP · 5402004: «Real hasta» May');
  t.eq(tf.find(x => x.rbd === '5401003').corte, ABREV[corteFuente(docs, '5401003', 'faep') - 1], 'FAEP · 5401003 (sin FAEP en su documento): «Real hasta» por defecto');

  // ---------------------------------------------------------------- 3) Estado y conteos «de 69»
  for (const key of FAEP_FIGA) {
    await clickTab(page, key);
    const filas = await filasFuente(page, key);
    const malos = Object.keys(filas).filter(id => filas[id].estado !== ETIQUETA[E.fuentes[key][id].estado]);
    t.eq(malos, [], `${key.toUpperCase()}: el Estado de las 69 filas coincide con el cálculo independiente (Déficit ⇔ saldo < 0)`);
    const c = conteoFuente(E, key);
    const kt = await page.evaluate((k) => Array.from(document.querySelectorAll(`#ofKpiRow-total-${k} .kpi-card`)).find(x => x.querySelector('.label').textContent.trim() === 'Saldo (Total)').querySelector('.delta').textContent.trim(), key);
    t.eq(nDeM(kt), { n: c.deficit, m: 69 }, `${key.toUpperCase()}: la tarjeta «Saldo (Total)» dice «${c.deficit} de 69 entidades en déficit»`);
  }
  t.eq(E.fuentes.faep['5402004'].estado, 'deficit', 'oráculo: el jardín 5402004 está en Déficit en FAEP');
  t.eq(E.fuentes.figa['5401002'].estado, 'deficit', 'oráculo: el jardín 5401002 está en Déficit en FIGA');
  await clickTab(page, 'faep');
  t.eq((await filasFuente(page, 'faep'))['5402004'].estado, 'Déficit', 'FAEP · 5402004 (SANTA MARTA): Déficit en su fila');
  await clickTab(page, 'figa');
  t.eq((await filasFuente(page, 'figa'))['5401002'].estado, 'Déficit', 'FIGA · 5401002 (SANTA TERESA): Déficit en su fila');

  // ---------------------------------------------------------------- 4) Panel principal: tarjetas «de N», franja y «Atención»
  await clickTab(page, 'Panel principal');
  const D = await leerDashboard(page);
  const universo = universoSep(docs, E);
  const nEnt = universo.length + FUENTES.reduce((s, f) => s + idsDeUniverso(f.universo).length, 0);
  for (const f of FUENTES) {
    const n = idsDeUniverso(f.universo).length;
    t.eq(nDeM(D.cards[f.key].def), { n: conteoFuente(E, f.key).deficit, m: n }, `Panel principal · tarjeta ${f.corto}: «${conteoFuente(E, f.key).deficit} de ${n} entidades en déficit»`);
  }
  t.eq([nDeM(D.cards.faep.def).m, nDeM(D.cards.figa.def).m, nDeM(D.cards.junji.def).m, nDeM(D.cards.general.def).m], [69, 69, 13, 56], 'FAEP y FIGA cuentan 69 entidades; JUNJI 13 y General 56 (sin cambios)');
  t.ok(D.strip.sub.includes(`de ${nEnt}`), `la franja consolidada suma a todas las entidades: «de ${nEnt}» → ` + D.strip.sub);
  const nDefTotal = universo.filter(id => E.sep[id].estado === 'deficit').length + FUENTES.reduce((s, f) => s + conteoFuente(E, f.key).deficit, 0);
  t.eq(Number(D.strip.valor), nDefTotal, `«Entidades en déficit» de la franja = ${nDefTotal} (SEP + las 9 fuentes, con los jardines de FAEP y FIGA)`);

  // «Atención»: un jardín con un déficit enorme en FAEP encabeza la lista, rotulado «GESPARVU …», y su clic abre FAEP y su modal
  await h.remoto('5402004', `const f = d.otras_fuentes.faep; f.gasto_rem.meses.ENERO = 900000000000; f.gasto_rem.total += 900000000000;`);
  await h.waitIdle();
  const D2 = await leerDashboard(page);
  t.eq(D2.items[0] && [D2.items[0].fuente, D2.items[0].rbd], ['faep', '5402004'], '«Atención»: el jardín 5402004 de FAEP (déficit enorme) es la primera entidad');
  t.eq(await page.evaluate(() => document.querySelector('#dashAtencion li .a-fuente').textContent.trim()), 'FAEP · GESPARVU 5402004', '«Atención» lo rotula «FAEP · GESPARVU 5402004» (no «RBD 5402004»)');
  await page.click('#dashAtencion li:first-child');
  await h.waitIdle();
  t.eq(await page.evaluate(() => (document.querySelector('.tab-btn.active') || {}).dataset.tab), 'of-faep', '«Atención» abre la pestaña FAEP');
  t.eq(await tituloModal(page), 'GESPARVU 5402004 — SANTA MARTA · FAEP', 'y el modal del jardín: «GESPARVU 5402004 — SANTA MARTA · FAEP»');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  await h.remoto('5402004', `const f = d.otras_fuentes.faep; f.gasto_rem.meses.ENERO = 150000; f.gasto_rem.total = ${sumaMeses(docs['5402004'].otras_fuentes.faep.gasto_rem)};`);
  await h.waitIdle();

  // ---------------------------------------------------------------- 5) modal: rótulo por TIPO de entidad (jardín / AC / RBD) y nombre accesible de las celdas
  for (const [key, id, titulo] of [
    ['faep', '5402002', 'GESPARVU 5402002 — RINCONCITO · FAEP'], ['faep', 'AC', 'Administración Central — Administración Central · FAEP'], ['faep', '1121', `RBD 1121 — ${NOMBRE['1121']} · FAEP`],
    ['figa', '5404001', 'GESPARVU 5404001 — LAMPARITA · FIGA'], ['junji', '5402002', 'GESPARVU 5402002 — RINCONCITO · JUNJI'], ['general', 'AC', 'Administración Central — Administración Central · Subvención General'],
  ]) {
    await clickTab(page, key);
    await page.click(`#otrasFuentesTbody-${key} td[data-abrir-otra-fuente="${id}"]`);
    await h.waitIdle();
    t.eq(await tituloModal(page), titulo, `modal ${key.toUpperCase()} · ${id}: título «${titulo}»`);
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  await clickTab(page, 'faep');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  const celdaIng = (mes) => `input.celda-input[data-rbd="5402002"][data-fuente="faep"][data-modo="of_ingreso"][data-mes="${mes}"]`;
  t.eq(await page.getAttribute(celdaIng('MARZO'), 'aria-label'), 'Ingreso (FAEP), marzo, GESPARVU 5402002', 'la celda de ingreso del jardín tiene el nombre accesible «Ingreso (FAEP), marzo, GESPARVU 5402002»');
  t.eq(await page.inputValue(celdaIng('MARZO')), '400000', 'el modal del jardín muestra su ingreso de marzo (400.000)');
  t.ok(/Ingreso Total: \$4\.800\.000/.test(await page.evaluate(() => document.getElementById('otrasFuentesModalSubtitle').textContent)), 'el subtítulo del modal suma su ingreso total ($4.800.000)');

  // ---------------------------------------------------------------- 6) guardado: merge solo de FAEP, sin tocar JUNJI ni Aporte JUNJI del mismo documento
  const antesJar = clon((await h.store())[RUTA('5402002')]);
  await h.clearWrites();
  await page.fill(celdaIng('MARZO'), '555.000');
  await h.flushWrites();
  let w = (await h.writes()).filter(x => x.path === RUTA('5402002'));
  t.eq(w.length, 1, 'editar una celda de FAEP en un jardín = un solo write a su documento');
  t.ok(w[0] && w[0].options.merge === true, 'con merge:true');
  t.eq(w[0] && Object.keys(w[0].payload.otras_fuentes), ['faep'], 'y solo toca otras_fuentes.faep (nada de junji ni aporte_junji)');
  t.eq(w[0] && w[0].payload.nombre, 'RINCONCITO', '…con el nombre del jardín');
  t.eq(w[0] && w[0].payload.otras_fuentes.faep.ingreso.meses, { MARZO: 555000 }, '…y solo el mes editado');
  const despuesJar = (await h.store())[RUTA('5402002')];
  t.eq(despuesJar.otras_fuentes.faep.ingreso.meses.MARZO, 555000, 'el servidor tiene el ingreso nuevo');
  t.eq([despuesJar.otras_fuentes.junji, despuesJar.otras_fuentes.aporte_junji], [antesJar.otras_fuentes.junji, antesJar.otras_fuentes.aporte_junji], 'JUNJI y Aporte JUNJI del mismo documento quedan idénticos (merge por clave: nada se pisa)');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  // un jardín que NO tenía FAEP: el documento gana la clave faep y conserva lo suyo
  const antes3 = clon((await h.store())[RUTA('5401003')]);
  t.ok(!antes3.otras_fuentes.faep, 'oráculo: el documento 5401003 no tenía FAEP');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="5401003"]');
  await h.waitIdle();
  await h.clearWrites();
  await page.fill('input.celda-input[data-rbd="5401003"][data-fuente="faep"][data-modo="of_ingreso"][data-mes="ABRIL"]', '1000');
  await h.flushWrites();
  w = (await h.writes()).filter(x => x.path === RUTA('5401003'));
  t.eq(w.length, 1, '5401003 (sin FAEP): un write');
  const d3 = (await h.store())[RUTA('5401003')];
  t.eq([Object.keys(d3.otras_fuentes).sort(), d3.otras_fuentes.junji, d3.otras_fuentes.aporte_junji, d3.otras_fuentes.faep.ingreso.meses.ABRIL], [['aporte_junji', 'faep', 'junji'], antes3.otras_fuentes.junji, antes3.otras_fuentes.aporte_junji, 1000], 'el documento gana otras_fuentes.faep y conserva JUNJI y Aporte JUNJI intactos');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  // y FIGA del mismo jardín, sin tocar FAEP
  await clickTab(page, 'figa');
  await page.click('#otrasFuentesTbody-figa td[data-abrir-otra-fuente="5401003"]');
  await h.waitIdle();
  await h.clearWrites();
  await page.fill('input.celda-input[data-rbd="5401003"][data-fuente="figa"][data-modo="of_gasto_rem"][data-mes="MAYO"]', '2.500');
  await h.flushWrites();
  w = (await h.writes()).filter(x => x.path === RUTA('5401003'));
  t.eq([w.length, w[0] && Object.keys(w[0].payload.otras_fuentes)], [1, ['figa']], 'FIGA del mismo jardín: write solo de otras_fuentes.figa');
  t.eq((await h.store())[RUTA('5401003')].otras_fuentes.faep.ingreso.meses.ABRIL, 1000, '…y el FAEP recién guardado sigue ahí');
  await page.keyboard.press('Escape');
  await h.waitIdle();

  // ---------------------------------------------------------------- 7) corte «Real hasta»: uno solo y «Aplicar a todas las entidades» (69 de FAEP)
  await clickTab(page, 'faep');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  const junjiAntes = {};
  const sv0 = await h.store();
  GESPARVU_IDS.forEach(id => { junjiAntes[id] = JSON.stringify(sv0[RUTA(id)].otras_fuentes.junji); });
  await h.clearWrites();
  await page.selectOption('#otrasFuentesModalBody .of-modal-corte-select', '10');
  await h.flushWrites();
  w = (await h.writes()).filter(x => x.path === RUTA('5402002'));
  t.eq(w[w.length - 1] && w[w.length - 1].payload.otras_fuentes, { faep: { real_hasta_mes: 10 } }, 'cambiar el «Real hasta» de un jardín en FAEP escribe solo otras_fuentes.faep.real_hasta_mes');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  t.eq((await leerTabla(page, 'faep')).find(x => x.rbd === '5402002').corte, 'Oct', 'la fila del jardín muestra «Oct»');
  await page.selectOption('#ofCorteSelect-faep', '9');
  h.dialogs.length = 0;
  await h.clearWrites();
  await page.click('#ofCorteAplicarBtn-faep');
  await h.flushWrites();
  await h.waitIdle();
  t.ok(/para las 69 entidades de FAEP/.test((h.dialogs.find(d => d.type === 'confirm') || {}).message || ''), '«Aplicar a todas las entidades» de FAEP pide confirmar «para las 69 entidades»', (h.dialogs[0] || {}).message);
  const wc = (await h.writes()).filter(x => x.collection === 'sep_carga_rbd');
  t.eq([...new Set(wc.map(x => x.path))].sort(), idsDeUniverso('rbd_ac_gesparvu').map(RUTA).sort(), 'escribe uno por entidad: los 55 RBD, AC y los 13 jardines');
  t.ok(wc.every(x => JSON.stringify(Object.keys(x.payload.otras_fuentes)) === '["faep"]' && x.payload.otras_fuentes.faep.real_hasta_mes === 9), 'cada write solo fija otras_fuentes.faep.real_hasta_mes = 9');
  const sv = await h.store();
  t.ok(GESPARVU_IDS.every(id => sv[RUTA(id)].otras_fuentes.faep.real_hasta_mes === 9), 'en el servidor los 13 jardines quedan con FAEP en septiembre');
  t.eq(GESPARVU_IDS.filter(id => JSON.stringify(sv[RUTA(id)].otras_fuentes.junji) !== junjiAntes[id]), [], 'y su JUNJI queda intacto (13 de 13)');

  // ---------------------------------------------------------------- 8) % Ejecución, Visualizador y Reporte personalizado
  await h.close();
  const h2 = await boot({ fixture: 'jardines', user: 'authorized' });
  const p2 = h2.page;
  await clickTab(p2, '% Ejecución');
  await p2.click('#ejecFuenteChips .of-chip[data-ejec-fuente="faep"]');
  await h2.waitIdle();
  const opciones = await p2.evaluate(() => Array.from(document.querySelectorAll('#ejecRbdSelect option')).map(o => o.value));
  t.eq(opciones, ['', ...idsDeUniverso('rbd_ac_gesparvu')], '% Ejecución · FAEP: el selector de entidad lista las 69 (los 13 jardines al final)');
  t.eq(await p2.evaluate(() => Array.from(document.querySelectorAll('#ejecRbdSelect option')).find(o => o.value === '5402002').textContent.trim()), '5402002 — RINCONCITO', '…con «5402002 — RINCONCITO»');
  await p2.selectOption('#ejecRbdSelect', '5402002');
  await h2.waitIdle();
  const ejec = await p2.evaluate(() => document.getElementById('tab-ejecucion').innerText);
  t.ok(/RINCONCITO|5402002/.test(ejec), '% Ejecución muestra al jardín seleccionado');
  await p2.click('#ejecFuenteChips .of-chip[data-ejec-fuente="figa"]');
  await h2.waitIdle();
  t.eq((await p2.evaluate(() => document.querySelectorAll('#ejecRbdSelect option').length)), 70, '% Ejecución · FIGA: 70 opciones (Todas + 69)');
  await p2.click('#ejecFuenteChips .of-chip[data-ejec-fuente="junji"]');
  await h2.waitIdle();
  t.eq((await p2.evaluate(() => document.querySelectorAll('#ejecRbdSelect option').length)), 14, '% Ejecución · JUNJI: 14 opciones (Todas + 13), sin cambio');
  await p2.click('#ejecFuenteChips .of-chip[data-ejec-fuente="general"]');
  await h2.waitIdle();
  t.eq((await p2.evaluate(() => document.querySelectorAll('#ejecRbdSelect option').length)), 57, '% Ejecución · General: 57 opciones (Todas + 56), sin cambio');

  await clickTab(p2, 'Reportes');
  t.eq(await p2.evaluate(() => Array.from(document.querySelectorAll('#vzEntList .vz-ent-titulo')).map(x => x.textContent.trim())), ['Establecimientos (RBD)', 'Administración Central', 'GESPARVU (jardines infantiles)'], 'Visualizador: los grupos de entidades (el de los jardines ya no dice «JUNJI»)');
  // Visualizador: solo FAEP y solo el jardín 5402002 → su ingreso anual
  await p2.click('#vzFuentesNinguna');
  await p2.click('#vzFuenteChips [data-vz-fuente="faep"]');
  await p2.evaluate(() => { document.getElementById('vzEntidadesDet').open = true; });
  await p2.click('#vzEntNinguno');
  await p2.evaluate(() => { const cb = document.querySelector('#vzEntList input[data-vz-ent="5402002"]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await h2.waitIdle();
  const vzIng = await p2.evaluate(() => document.getElementById('vzTablaIng').innerText);
  t.ok(/\$4\.800\.000/.test(vzIng), 'Visualizador (FAEP, jardín 5402002): el ingreso anual es $4.800.000 → ' + vzIng.replace(/\s+/g, ' ').slice(0, 160));
  await p2.click('#vzLimpiarBtn');
  // Reporte personalizado
  await p2.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h2.waitIdle();
  const config = async (entidades, conceptos) => {
    await p2.click('#reporteRbdNinguno'); await p2.click('#reporteConceptoNinguno'); await p2.click('#reporteMesTodos');
    await p2.evaluate(([ents, cons]) => {
      ents.forEach(id => { const cb = document.querySelector(`#reporteRbdList input[data-rbd-check="${id}"]`); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
      cons.forEach(k => { const cb = Array.from(document.querySelectorAll('#reporteConceptoList input[data-concepto-check]')).find(e => e.dataset.conceptoCheck === k); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    }, [entidades, conceptos]);
    await h2.waitIdle();
    return p2.evaluate(() => Array.from(document.querySelectorAll('#reporteTbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  };
  let filas = await config(['5402002', '5404001', '1121'], ['of|faep|ingreso']);
  const porId = Object.fromEntries(filas.filter(f => f[0]).map(f => [f[0], f]));
  t.eq(['5402002', '5404001', '1121'].map(id => parseCLP(porId[id] && porId[id][porId[id].length - 1])), ['5402002', '5404001', '1121'].map(id => detalle(docs, id, 'faep').total.ingreso), 'Reporte personalizado: el concepto «[FAEP] Ingreso» da una fila por entidad (jardines y RBD) con su total anual');
  const sub = filas.find(f => /^Subtotal/.test(f[2]));
  t.eq(parseCLP(sub[sub.length - 1]), ['5402002', '5404001', '1121'].reduce((s, id) => s + detalle(docs, id, 'faep').total.ingreso, 0), '…y el subtotal suma los tres');
  filas = await config(['5402002'], ['of|general|ingreso', 'of|faep|ingreso', 'of|junji|ingreso_operacion', 'of|aporte_educ|ingreso']);
  t.eq(filas.map(f => f[2]).sort(), ['[FAEP] Ingreso', '[JUNJI] Ingreso Operación'], 'un jardín genera filas en FAEP y JUNJI y NINGUNA en General ni Aporte Educ. (su universo no los incluye)');
  filas = await config(['1121', 'AC'], ['of|junji|ingreso_operacion', 'of|faep|ingreso', 'of|figa|ingreso']);
  t.eq(filas.filter(f => f[0]).map(f => `${f[0]}|${f[2]}`), ['1121|[FAEP] Ingreso', 'AC|[FAEP] Ingreso', '1121|[FIGA] Ingreso', 'AC|[FIGA] Ingreso'], 'un RBD y AC generan filas en FAEP y FIGA y ninguna en JUNJI');
  t.noErrores(h2);

  // ---------------------------------------------------------------- 9) Excel: exportar, archivo nuevo, archivo antiguo (sin jardines) y fila de un jardín sin FAEP previo
  await clickTab(p2, 'faep');
  const x1 = await exportar(p2, () => p2.click('#downloadExcelOFBtn-faep'));
  t.eq(x1.libro.orden, ['INGRESO', 'REMUNERACIONES', 'BYS_ITEMS', 'META'], 'Excel FAEP: las hojas de siempre');
  const colA = (hoja) => x1.libro.hojas[hoja].slice(1).map(r => String(r[0]));
  t.eq(colA('INGRESO'), idsDeUniverso('rbd_ac_gesparvu'), 'Excel FAEP · INGRESO: 69 filas, RBD, AC y luego los 13 jardines');
  t.eq(colA('META'), idsDeUniverso('rbd_ac_gesparvu'), 'Excel FAEP · META: las 69 entidades (con su «Real hasta»)');
  const fJar = x1.libro.hojas.INGRESO.find(r => String(r[0]) === '5402002');
  t.eq([typeof fJar[0], fJar[1], fJar[2], fJar[14]], ['number', 'RINCONCITO', 400000, 4800000], 'la fila del jardín 5402002: código numérico, nombre, enero 400.000 y total 4.800.000');
  t.eq(x1.libro.hojas.BYS_ITEMS.filter(r => String(r[0]) === '5402002').map(r => r[2]), ['Alimentación', 'Mantención menor'], 'BYS_ITEMS trae los conceptos de B&S del jardín');
  // archivo antiguo: solo RBD y AC (lo que exportaba FAEP antes) → se importa sin error y no toca a los jardines
  const antiguo = {};
  x1.libro.orden.forEach(n => { antiguo[n] = x1.libro.hojas[n].filter((r, i) => i === 0 || !GESPARVU_IDS.includes(String(r[0]))); });
  antiguo.INGRESO = antiguo.INGRESO.map((r, i) => (i && String(r[0]) === '1121' ? r.map((c, j) => (j === 2 ? 123456 : c)) : r));
  const bufAntiguo = await libroXlsx(p2, antiguo);
  const storeA = clon(await h2.store());
  await h2.clearWrites();
  const msgA = await importarLibro(h2, '#importExcelOFInput-faep', bufAntiguo, 'faep_antiguo.xlsx');
  t.ok(/^Carga importada correctamente/.test(msgA[0] || '') && /INGRESO: 56 filas/.test(msgA[0] || ''), 'archivo ANTIGUO de FAEP (solo RBD y AC): se importa sin error («INGRESO: 56 filas»)', msgA);
  const wA = (await h2.writes()).filter(x => x.collection === 'sep_carga_rbd').map(x => x.path);
  t.ok(!wA.some(pth => GESPARVU_IDS.some(id => pth === RUTA(id))), 'y no escribe nada en los documentos de los jardines');
  const storeA2 = await h2.store();
  t.eq(GESPARVU_IDS.filter(id => JSON.stringify(storeA2[RUTA(id)]) !== JSON.stringify(storeA[RUTA(id)])), [], 'los 13 jardines quedan exactamente igual en el servidor');
  t.eq((await h2.store())[RUTA('1121')].otras_fuentes.faep.ingreso.meses.ENERO, 123456, 'mientras que el cambio en un RBD sí se aplica');
  // archivo con filas de jardines (uno sin FAEP previo)
  const nuevo = {};
  x1.libro.orden.forEach(n => { nuevo[n] = x1.libro.hojas[n].map(r => r.slice()); });
  nuevo.INGRESO = nuevo.INGRESO.map((r, i) => (i && String(r[0]) === '5401003' ? r.map((c, j) => (j === 2 ? 777777 : (j === 14 ? 777777 : c))) : r));
  const bufNuevo = await libroXlsx(p2, nuevo);
  await h2.clearWrites();
  const msgN = await importarLibro(h2, '#importExcelOFInput-faep', bufNuevo, 'faep_con_jardines.xlsx');
  t.ok(/^Carga importada correctamente/.test(msgN[0] || '') && /INGRESO: 69 filas/.test(msgN[0] || ''), 'archivo NUEVO (con jardines): «INGRESO: 69 filas»', msgN);
  const sN = await h2.store();
  t.eq([sN[RUTA('5401003')].otras_fuentes.faep.ingreso.meses.ENERO, Object.keys(sN[RUTA('5401003')].otras_fuentes).sort()], [777777, ['aporte_junji', 'faep', 'junji']], 'la fila de un jardín SIN FAEP previo (5401003) crea otras_fuentes.faep y conserva JUNJI y Aporte JUNJI');
  t.eq(sN[RUTA('5401003')].otras_fuentes.junji, storeA[RUTA('5401003')].otras_fuentes.junji, '…con su JUNJI idéntico');
  // el importador rechaza un código de documento inválido (también en filas de jardines): sin cambios respecto de antes
  t.noErrores(h2);

  // ---------------------------------------------------------------- 10) XLS / CSV / PDF por fila de un jardín y respaldo JSON
  await clickTab(p2, 'faep');
  const xj = await exportar(p2, () => p2.click('#otrasFuentesTbody-faep button.row-action-btn[data-action="excel"][data-rbd="5402004"]'));
  t.eq(xj.filename.replace(/_\d{4}-\d{2}-\d{2}/, ''), 'faep_5402004.xlsx', 'XLS de la fila de un jardín: faep_5402004.xlsx');
  t.eq(xj.libro.hojas.INGRESO.slice(1).map(r => String(r[0])), ['5402004'], 'el XLS trae solo la fila de ese jardín');
  t.eq(xj.libro.hojas.INGRESO[1][2], 100000, '…con su ingreso de enero (100.000)');
  const dlCsv = await capturarDescarga(p2, () => p2.click('#otrasFuentesTbody-faep button.row-action-btn[data-action="csv"][data-rbd="5402004"]'));
  const csv = parseCsvPuntoYComa(dlCsv.buffer.toString('utf8'));
  const val = (n) => { const f = csv.find(x => x[0] === n); return f && f[f.length - 1]; };
  const dj = detalle(docs, '5402004', 'faep');
  t.eq([val('Ingreso Total (Real+Proyectado)'), val('Gasto Total (Real+Proyectado)'), val('Saldo Total (Real+Proyectado)'), val('Estado (Total)'), val('Real hasta')], [String(dj.total.ingreso), String(dj.total.gasto), String(dj.total.saldo), 'Déficit', 'Mayo'], 'CSV de detalle del jardín 5402004 en FAEP: totales, Estado Déficit y «Real hasta» Mayo');
  t.ok(dlCsv.filename.startsWith('detalle_faep_5402004_'), 'y se llama detalle_faep_5402004_…');
  await p2.evaluate(() => { window.__prints = []; });
  await p2.click('#otrasFuentesTbody-faep button.row-action-btn[data-action="pdf"][data-rbd="5402004"]');
  const pr = (await h2.prints())[0];
  t.ok(pr && /FAEP — GESPARVU 5402004 · SANTA MARTA/.test(pr.printWrap) && /DÉFICIT/i.test(pr.printWrap) && /Real hasta Mayo/.test(pr.printWrap), 'PDF de la fila: «FAEP — GESPARVU 5402004 · SANTA MARTA», Déficit y Real hasta Mayo');
  t.eq(await p2.getAttribute('#otrasFuentesTbody-faep button.row-action-btn[data-action="pdf"][data-rbd="5402004"]', 'aria-label'), 'Descargar PDF de GESPARVU 5402004', 'el botón de PDF del jardín tiene el nombre accesible «Descargar PDF de GESPARVU 5402004»');
  t.eq(await p2.getAttribute('#otrasFuentesTbody-faep button.row-action-btn[data-action="excel"][data-rbd="1121"]', 'aria-label'), 'Descargar Excel (XLS) de RBD 1121', '…y el de un RBD sigue diciendo «RBD 1121»');
  const dlJson = await capturarDescarga(p2, () => p2.click('#downloadCargaOFBtn-faep'));
  const js = JSON.parse(dlJson.buffer.toString('utf8'));
  t.eq([js.fuente, Object.keys(js.otras_fuentes_por_rbd).length, js.otras_fuentes_por_rbd['5402002'].ingreso.total], ['faep', 69, 4800000], 'respaldo JSON de FAEP: 69 entidades, con el ingreso del jardín (4.800.000)');
  // FIGA también
  await clickTab(p2, 'figa');
  const xf = await exportar(p2, () => p2.click('#downloadExcelOFBtn-figa'));
  t.eq(xf.libro.hojas.INGRESO.length - 1, 69, 'Excel FIGA · INGRESO: 69 filas');
  t.eq(xf.libro.hojas.INGRESO.find(r => String(r[0]) === '5404002')[10], 500000, 'FIGA · 5404002: ingreso desde septiembre (500.000)');

  // ---------------------------------------------------------------- 11) documentos de jardines ausentes: nada se siembra
  await h2.close();
  const sinJardines = clon(docs);
  GESPARVU_IDS.forEach(id => { delete sinJardines[id]; });
  const h3 = await boot({ fixture: sinJardines, user: 'authorized' });
  await clickTab(h3.page, 'faep');
  t.eq((await leerTabla(h3.page, 'faep')).map(x => x.rbd), idsDeUniverso('rbd_ac_gesparvu'), 'sin los documentos de los jardines, FAEP igual lista las 69 entidades (los jardines en $0)');
  t.eq((await h3.writes()).length, 0, 'y no se siembra ningún documento (ensureRbdsFaltantes solo crea RBD faltantes)');
  t.eq((await h3.store())[RUTA('5402002')], undefined, '…ni el del jardín');
  await h3.page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="5402002"]');
  await h3.waitIdle();
  await h3.page.fill('input.celda-input[data-rbd="5402002"][data-fuente="faep"][data-modo="of_ingreso"][data-mes="ENERO"]', '5000');
  await h3.flushWrites();
  const d5 = (await h3.store())[RUTA('5402002')];
  t.eq([d5 && d5.nombre, d5 && d5.otras_fuentes.faep.ingreso.meses.ENERO], ['RINCONCITO', 5000], 'editar un jardín cuyo documento no existe lo crea con merge (nombre + FAEP), como ya pasa con JUNJI');
  t.noErrores(h3);
  await h3.close();
});
