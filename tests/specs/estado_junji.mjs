// L-08 — JUNJI: el Estado ignoraba el saldo de Operación y las líneas solo-remuneraciones. En JUNJI (incomeShape 'junji3', universo GESPARVU) el ingreso tiene 4 líneas:
// Operación (puede financiar Bienes y Servicios y Remuneraciones) y Homologación + Carrera Docente + Bono Desempeño Laboral (BDL; TODO lo que ingresa por ahí se va a Remuneraciones: no puede
// financiar B&S; decisión del usuario; el BDL se agregó en «ajustes de fuentes» y suma al saldo total pero NO al de Operación: ver la sección 7). Regla: JUNJI es Déficit si el saldo total < 0 O si el saldo de Operación para B&S (Operación − B&S) < 0; la fila, el modal, "Atención" y el tooltip
// dicen la causa. En las demás fuentes (una sola línea de ingreso) nada cambia. Fixture `estado`: 5402002 (solo Operación), 5402004 (solo saldo total), 5401006 (ambas),
// 5401007 (saldo 0 y Operación − B&S = 0: Superávit), 5401005 (Operación − B&S = -$1 con saldo total positivo). Debe FALLAR contra APP_HTML=@3d5b041.
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { capturarDescarga, parseCsvPuntoYComa } from '../lib/capture-utils.mjs';
import { FUENTES, GESPARVU_IDS } from '../lib/corte.mjs';
import { ETIQUETA, esperadoDe, filasFuente, leerDashboard, tarjeta, nDeM, conteoFuente } from '../lib/estado.mjs';

const CORTO_OP = 'Saldo Operación para B&S negativo';
const CORTO_AMBAS = 'Saldo total y saldo Operación para B&S negativos';

await correrSpec('estado_junji', async (t) => {
  const docs = cargarFixture('estado').docs;
  const E = esperadoDe(docs);
  const h = await boot({ fixture: 'estado', user: 'authorized' });
  const { page } = h;

  // ---------------------------------------------------------------- 0) oráculo
  const J = E.fuentes.junji;
  t.eq(['5402002', '5402004', '5401006', '5401007', '5401005'].map(id => [J[id].estado, J[id].saldo >= 0 ? 'saldo≥0' : 'saldo<0', J[id].saldoOp >= 0 ? 'op≥0' : 'op<0']),
    [['deficit', 'saldo≥0', 'op<0'], ['deficit', 'saldo<0', 'op≥0'], ['deficit', 'saldo<0', 'op<0'], ['superavit', 'saldo≥0', 'op≥0'], ['deficit', 'saldo≥0', 'op<0']],
    'oráculo: Operación con saldo total suficiente → Déficit; saldo total negativo → Déficit; ambos; saldo 0 y Operación − B&S = 0 → Superávit; Operación − B&S = -$1 → Déficit');
  t.eq([J['5402002'].saldoOp, J['5401005'].saldoOp, J['5401007'].saldoOp], [-500000, -1, 0], 'oráculo: saldos de Operación para B&S -$500.000, -$1 y $0');

  // ---------------------------------------------------------------- 1) tabla de JUNJI: Estado, causa visible y tooltip
  await clickTab(page, 'junji');
  const filas = await filasFuente(page, 'junji');
  t.eq(GESPARVU_IDS.filter(id => filas[id].estado !== ETIQUETA[J[id].estado]), [], 'JUNJI: el Estado de las 13 filas coincide con el cálculo independiente');
  t.eq(filas['5402002'].estado, 'Déficit', 'GESPARVU 5402002: Déficit aunque su saldo total sea positivo');
  t.eq(filas['5402002'].saldo, '$500.000', '…con saldo total $500.000');
  t.eq(filas['5402002'].causa, CORTO_OP, '…y la fila dice la causa: saldo de Operación para B&S negativo');
  t.ok(/saldo de Operación para Bienes y Servicios es negativo \(-\$500\.000\)/.test(filas['5402002'].title) && !/saldo total es negativo/.test(filas['5402002'].title), 'tooltip de 5402002: solo la causa de Operación, con su monto (-$500.000)');
  t.ok(/Homologación, Carrera Docente ni BDL/.test(filas['5402002'].title), 'y explica por qué: B&S no puede pagarse con Homologación, Carrera Docente ni BDL');
  t.eq([filas['5402004'].estado, filas['5402004'].causa], ['Déficit', ''], '5402004 (saldo total -$1.000.000): Déficit sin aviso aparte');
  t.ok(/el saldo total es negativo \(-\$1\.000\.000\)/.test(filas['5402004'].title) && !/Operación/.test(filas['5402004'].title), 'tooltip de 5402004: solo el saldo total negativo');
  t.eq([filas['5401006'].estado, filas['5401006'].causa], ['Déficit', CORTO_AMBAS], '5401006: Déficit por ambas causas, lo dice la fila');
  t.ok(/saldo total es negativo \(-\$1\.200\.000\); además el saldo de Operación para Bienes y Servicios es negativo \(-\$200\.000\)/.test(filas['5401006'].title), 'tooltip de 5401006: las dos causas con sus montos');
  t.eq([filas['5401007'].estado, filas['5401007'].causa, filas['5401007'].title, filas['5401007'].saldo], ['Superávit', '', '', '$0'], '5401007 (saldo $0 y Operación − B&S = $0): Superávit, sin aviso');
  t.eq([filas['5401005'].estado, filas['5401005'].saldo, filas['5401005'].causa], ['Déficit', '$999.999', CORTO_OP], '5401005 (Operación − B&S = -$1, saldo +$999.999): Déficit por Operación');
  t.ok(/\(-\$1\)/.test(filas['5401005'].title), 'tooltip de 5401005: -$1');
  const conAviso = Object.entries(filas).filter(([, f]) => f.causa).map(([id]) => id).sort();
  t.eq(conAviso, GESPARVU_IDS.filter(id => J[id].causas.includes('operacion_bys')).sort(), 'el aviso visible aparece exactamente en las entidades en Déficit por el saldo de Operación (solo o junto al saldo total)');

  // ---------------------------------------------------------------- 2) conteos: tarjeta KPI, tarjeta del Panel principal, franja
  const cJ = conteoFuente(E, 'junji');
  const kJ = await tarjeta(page, '#ofKpiRow-total-junji', 'Saldo (Total)');
  t.eq(nDeM(kJ.nota), { n: cJ.deficit, m: 13 }, `tarjeta "Saldo (Total)" de JUNJI: ${cJ.deficit} de 13 en déficit (cuenta también las de Operación)`);
  await clickTab(page, 'Panel principal');
  const D = await leerDashboard(page);
  t.eq(nDeM(D.cards.junji.def), { n: cJ.deficit, m: 13 }, `tarjeta JUNJI del Panel principal: ${cJ.deficit} de 13`);
  const totalFranja = Object.keys(E.fuentes).reduce((s, k) => s + conteoFuente(E, k).deficit, 0);
  t.ok(Number(D.strip.valor) >= totalFranja, `la franja suma las de JUNJI (${D.strip.valor} ≥ ${totalFranja} de las fuentes)`);

  // ---------------------------------------------------------------- 3) "Atención": una entidad con Operación negativa pero saldo total grande entra, con su causa
  await h.remoto('5402002', `const j = d.otras_fuentes.junji;
    j.ingreso_homologacion.meses.ENERO = 100000000; j.ingreso_homologacion.total = 100000000;
    j.bys_items['Alimentación'].meses.ENERO = 60000000; j.bys_items['Alimentación'].total = 60000000;`);
  await h.waitIdle();
  const D2 = await leerDashboard(page);
  t.eq(D2.items[0] && [D2.items[0].fuente, D2.items[0].rbd, D2.items[0].saldo, D2.items[0].causa], ['junji', '5402002', '▼ -$59.000.000', CORTO_OP], 'Atención (Total): la primera es JUNJI 5402002 con su saldo de Operación (-$59.000.000; el saldo total es positivo) y la causa');
  t.ok(D2.items.slice(1).every(i => !i.causa || i.fuente === 'junji'), 'solo las de JUNJI llevan causa');
  // las vistas Real y Proyectado listan por el signo del saldo de esa vista: aquí todo el ingreso/gasto está en enero (Real), así que 5402002 (saldo total positivo) no entra
  await page.click('.dash-chips button[data-dash-vista="real"]');
  await h.waitIdle();
  const D3 = await leerDashboard(page);
  t.ok(!D3.items.some(i => i.fuente === 'junji' && i.rbd === '5402002'), 'vista Real: 5402002 no aparece (su saldo Real es positivo; el Estado se calcula siempre sobre el Total)');
  await page.click('.dash-chips button[data-dash-vista="total"]');
  await h.waitIdle();
  await h.remoto('5402002', `const j = d.otras_fuentes.junji;
    j.ingreso_homologacion.meses.ENERO = 2000000; j.ingreso_homologacion.total = 2000000;
    j.bys_items['Alimentación'].meses.ENERO = 1500000; j.bys_items['Alimentación'].total = 1500000;`);
  await h.waitIdle();

  // ---------------------------------------------------------------- 4) modal: el subtítulo y el saldo de Operación; la edición en vivo cambia el Estado sin reabrir
  await clickTab(page, 'junji');
  await page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  const sub = () => page.evaluate(() => document.getElementById('otrasFuentesModalSubtitle').innerText.replace(/\s+/g, ' ').trim());
  const saldoOp = () => page.evaluate(() => { const e = document.querySelector('#otrasFuentesModalBody [id^="ofsaldoopbys-"]'); return e ? { texto: e.textContent.trim(), rojo: getComputedStyle(e).color } : null; });
  t.ok(/Saldo: \$500\.000/.test(await sub()) && /DÉFICIT/i.test(await sub()) && /Saldo Operación para B&S negativo/i.test(await sub()), 'modal de 5402002: subtítulo con Saldo $500.000, Déficit y la causa → ' + await sub());
  const op0 = await saldoOp();
  t.eq(op0 && op0.texto, '-$500.000', 'el modal muestra "Saldo Operación disponible para B&S: -$500.000"');
  t.ok(/si es negativo, la entidad queda en Déficit/.test(await page.evaluate(() => document.getElementById('otrasFuentesModalBody').innerText)), 'y avisa que, si es negativo, la entidad queda en Déficit');
  const celdaBys = 'input.celda-input[data-rbd="5402002"][data-fuente="junji"][data-modo="of_bys_item"][data-concepto="Alimentación"][data-mes="ENERO"]';
  const estadoSub = async () => (/DÉFICIT/i.test(await sub()) ? 'Déficit' : (/SUPERÁVIT/i.test(await sub()) ? 'Superávit' : '?'));
  const estadoFila = async () => (await filasFuente(page, 'junji'))['5402002'];
  h.clearWrites && await h.clearWrites();
  for (const [valor, esperado, op] of [['1000000', 'Superávit', '$0'], ['1000001', 'Déficit', '-$1'], ['500000', 'Superávit', '$500.000'], ['1500000', 'Déficit', '-$500.000']]) {
    await page.fill(celdaBys, valor);
    await h.waitIdle();
    t.eq([await estadoSub(), (await saldoOp()).texto], [esperado, op], `editar B&S a ${valor}: subtítulo del modal → ${esperado} (Operación − B&S = ${op})`);
    const f = await estadoFila();
    t.eq([f.estado, f.causa], [esperado, esperado === 'Déficit' ? CORTO_OP : ''], `…y la fila de la tabla (detrás del modal) → ${esperado}${esperado === 'Déficit' ? ' con la causa' : ''}`);
  }
  const rojo = (await saldoOp()).rojo;
  t.ok(/^rgb\(181, 47, 47\)$/.test(rojo), 'el saldo de Operación negativo sigue en rojo');
  await h.flushWrites();
  const w = await h.writes();
  t.ok(w.length > 0 && !w.some(x => /estado|causa|saldo_operacion/i.test(JSON.stringify(x.payload || {}))), 'lo derivado (Estado, causa, saldo de Operación) nunca se guarda en Firestore: ' + w.length + ' writes sin esos campos');
  await page.keyboard.press('Escape');
  await h.waitIdle();

  // ---------------------------------------------------------------- 5) exportaciones por entidad de JUNJI (CSV de detalle y PDF)
  const csv = await capturarDescarga(page, () => page.click('#otrasFuentesTbody-junji tr[data-rbd="5401005"] .row-action-btn[data-action="csv"]'));
  const lineas = parseCsvPuntoYComa(csv.buffer.toString('utf8'));
  const val = (nombre) => { const f = lineas.find(x => x[0] === nombre); return f && f[f.length - 1]; };
  t.eq([val('Saldo Total (Real+Proyectado)'), val('Estado (Total)')], ['999999', 'Déficit'], 'CSV de detalle de 5401005: saldo total +999.999 pero "Estado (Total)" = Déficit');
  await page.evaluate(() => { window.__prints = []; });
  await page.click('#otrasFuentesTbody-junji tr[data-rbd="5401005"] .row-action-btn[data-action="pdf"]');
  const pr = (await h.prints())[0];
  t.ok(pr && /DÉFICIT/i.test(pr.printWrap) && /Saldo Operación para B&S negativo/i.test(pr.printWrap), 'PDF individual de 5401005: Estado Déficit con la causa');

  // ---------------------------------------------------------------- 6) sin cambio donde no aplica
  t.eq(FUENTES.filter(f => f.key !== 'junji').length, 8, 'las otras 8 fuentes tienen una sola línea de ingreso (incomeShape single): no hay líneas restringidas');
  for (const f of FUENTES.filter(f => f.key !== 'junji')) {
    await clickTab(page, f.key);
    const fs = await filasFuente(page, f.key);
    const raros = Object.entries(fs).filter(([id, x]) => x.causa !== '' || (x.estado === 'Déficit') !== (E.fuentes[f.key][id].saldo < 0)).map(([id]) => id);
    t.eq(raros, [], `${f.corto}: Déficit ⇔ saldo negativo, sin avisos de Operación`);
  }
  await clickTab(page, 'aporte_junji');
  const aj = await filasFuente(page, 'aporte_junji');
  t.eq([aj['5401004'].estado, aj['5401004'].causa], ['Superávit', ''], 'Aporte Fiscal JUNJI 5401004 (B&S = 90 % de su única línea de ingreso): Superávit, sin restricción de líneas');
  await page.click('#otrasFuentesTbody-aporte_junji td[data-abrir-otra-fuente="5401004"]');
  await h.waitIdle();
  t.ok(!/Saldo Operación disponible/.test(await page.evaluate(() => document.getElementById('otrasFuentesModalBody').innerText)), 'el modal de Aporte JUNJI no tiene "Saldo Operación disponible para B&S" (solo JUNJI)');
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- 7) BDL (4.ª línea de ingreso, solo Remuneraciones): suma al saldo total y al Estado, NO al saldo de Operación para B&S
  // El fixture `estado` no trae ingreso_bdl (documentos anteriores a la línea): «otra persona» lo escribe aquí.
  await clickTab(page, 'junji');
  const conBdl = async (id, valor) => {
    await h.remoto(id, `const j = d.otras_fuentes.junji; j.ingreso_bdl = { meses: { ENERO: ${valor} }, total: ${valor} };`);
    await h.waitIdle();
    return (await filasFuente(page, 'junji'))[id];
  };
  // 5402004: saldo total -$1.000.000 y Operación − B&S = +$1.500.000 → solo el saldo total decide, y el BDL lo mueve (bordes exactos)
  for (const [valor, estado, saldo] of [[1000000, 'Superávit', '$0'], [1000001, 'Superávit', '$1'], [999999, 'Déficit', '-$1'], [0, 'Déficit', '-$1.000.000']]) {
    const f = await conBdl('5402004', valor);
    t.eq([f.estado, f.saldo, f.causa], [estado, saldo, ''], `5402004 con BDL de $${valor}: saldo ${saldo} → ${estado} (el BDL cubre Remuneraciones y entra al saldo total)`);
  }
  // 5402002: Operación − B&S = -$500.000: ningún BDL, por alto que sea, lo saca del Déficit por Operación
  const f5 = await conBdl('5402002', 100000000);
  t.eq([f5.estado, f5.causa, f5.saldo], ['Déficit', CORTO_OP, '$100.500.000'], '5402002 con BDL de $100 M: saldo total +$100.500.000 pero sigue en Déficit por el saldo de Operación (B&S no puede pagarse con el BDL)');
  t.ok(/saldo de Operación para Bienes y Servicios es negativo \(-\$500\.000\)/.test(f5.title) && !/saldo total es negativo/.test(f5.title), '…y el tooltip da solo la causa de Operación con el mismo monto (-$500.000): el BDL no lo cambia');
  // 5401006 (ambas causas): con BDL el saldo total deja de ser negativo y queda solo la de Operación
  const f6 = await conBdl('5401006', 5000000);
  t.eq([f6.estado, f6.causa, f6.saldo], ['Déficit', CORTO_OP, '$3.800.000'], '5401006 (-$1.200.000 y Operación -$200.000) con BDL de $5 M: saldo +$3.800.000, queda solo la causa de Operación');
  // el modal: el saldo de Operación no suma el BDL; el subtítulo (Saldo) sí
  await page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5402002"]');
  await h.waitIdle();
  const opBdl = await page.evaluate(() => document.querySelector('#otrasFuentesModalBody [id^="ofsaldoopbys-"]').textContent.trim());
  t.eq(opBdl, '-$500.000', 'modal de 5402002: «Saldo Operación disponible para B&S» sigue en -$500.000 con $100 M de BDL');
  t.ok(/Saldo: \$100\.500\.000/.test(await sub()), 'mientras que el Saldo del subtítulo sí lo incluye → ' + await sub());
  await page.keyboard.press('Escape');
  await h.waitIdle();
  // Panel principal: la causa y el saldo que explican la entrada en «Atención» siguen siendo los de Operación
  const D4 = await leerDashboard(page);
  const a5 = D4.items.find(i => i.fuente === 'junji' && i.rbd === '5402002');
  t.ok(!a5 || (a5.causa === CORTO_OP && a5.saldo === '▼ -$500.000'), '«Atención»: 5402002 (si entra en el top 8) muestra el saldo de Operación (-$500.000) y la causa, no el saldo total con BDL');
  t.noErrores(h);
  await h.close();
});
