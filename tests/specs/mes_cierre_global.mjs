// mes_cierre_global: mes de cierre global del panel (documento `sep_carga_rbd/_meta`, campos `mes_cierre` 1–12, `mes_cierre_por`, `mes_cierre_en`) y su control
// en la pestaña SEP (L-01: el ingreso real de SEP estaba clavado en julio mientras Remuneraciones tenía otro corte).
//
//   · Solo quien está en ADMIN_EMAILS ve el selector "Cambiar a:" y el botón "Aplicar a todas las entidades"; el resto lo ve como texto de solo lectura.
//     (La restricción es SOLO del cliente: firestore.rules no distingue administradores. El spec fuerza los eventos para comprobar que el cliente se niega.)
//   · Cambiar el mes de cierre guarda en `_meta` con merge (sin pisar items_22 / items_29) y solo mueve el default de los INGRESOS de SEP sin corte propio:
//     no toca ningún corte explícito de ninguna entidad.
//   · "Aplicar a todas las entidades" pide confirmación (cuántas entidades cambian y por origen) y fija el corte en SEP (ingreso_real_hasta_mes y
//     rem.real_hasta_mes) y en las 9 fuentes (otras_fuentes.{fuente}.real_hasta_mes), en writeBatch de ≤ 400 operaciones, idempotente y reintentable.
//   · El aviso "N entidades con corte distinto al cierre global" (desplegable con la lista y enlace al detalle) es visible para todos, solo cuenta con mes de
//     cierre definido y desaparece cuando todo coincide. El Panel principal muestra el mes de cierre como texto.
//   · Un `_meta` sin el campo, ausente, ilegible o con valores dañados equivale a "sin definir".
// Contra el index.html anterior (APP_HTML=@a94c2fb) este spec FALLA: no existe el control, ni el campo, ni el botón.
import fs from 'node:fs';
import path from 'node:path';
import { boot, clickTab, esperarPanelListo } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';
import { TMP_DIR } from '../lib/config.mjs';
import { N_MESES, MESES_TITULO, RBD_IDS, GESPARVU_IDS, FUENTES, idsDeUniverso, docsDe, clon, cortesDistintosEsperados, porOrigen, encabezadosMes, mesesRealesDe } from '../lib/corte.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const ADMIN = 'wilson.rojas@sleppetorca.gob.cl';
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.stack || e.message).split('\n').slice(0, 5).join(' | ')); }
}
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }, sel);
const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
async function irSep(h) { await clickTab(h.page, 'SEP'); }
const alertas = (h) => h.dialogs.filter(d => d.type === 'alert').map(d => d.message);
const confirmas = (h) => h.dialogs.filter(d => d.type === 'confirm').map(d => d.message);
// Filas del aviso (lista desplegable): [{ entidad, fuente, corte }]
const filasAviso = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#cierreAvisoLista tbody tr')).map(tr => ({ entidad: tr.children[0].textContent.trim(), fuente: tr.children[1].textContent.trim(), corte: tr.children[2].textContent.trim() })));
const esperadasComoFilas = (docs) => cortesDistintosEsperados(docs).map(f => ({ entidad: f.rbd === 'AC' ? f.titulo : `${f.titulo} — ${nombres[f.rbd]}`, fuente: f.etiqueta, corte: MESES_TITULO[f.corte - 1] }));
const nombres = {};
{
  const r = JSON.parse(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'fixtures', 'rbds.json'), 'utf8'));
  r.registros.forEach(x => { nombres[x.rbd] = x.nombre; });
  r.gesparvu.forEach(x => { nombres[x.rbd] = x.nombre; });
}
const clave = (f) => `${f.entidad}|${f.fuente}|${f.corte}`;
const normaliza = (filas) => filas.map(clave).sort();
// Documentos de la colección menos `_meta` y menos los campos de corte (para comprobar que NO se tocó nada más).
function sinCortes(doc) {
  const c = clon(doc);
  delete c.lastModifiedAt; delete c.lastModifiedBy; delete c.ingreso_real_hasta_mes;
  if (c.rem) delete c.rem.real_hasta_mes;
  Object.keys(c.otras_fuentes || {}).forEach(k => { delete c.otras_fuentes[k].real_hasta_mes; if (!Object.keys(c.otras_fuentes[k]).length) delete c.otras_fuentes[k]; });
  if (c.otras_fuentes && !Object.keys(c.otras_fuentes).length) delete c.otras_fuentes;
  return c;
}

await correrSpec('mes_cierre_global', async (t) => {
  const base = docsDe('default');
  const cierre = docsDe('cierre');

  // ============================================================================================ 1) Control: solo lectura vs. administrador
  await escenario(t, 'control (admin)', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await irSep(h);
    t.ok(await visible(page, '#cierreControl'), 'la pestaña SEP muestra el control del mes de cierre arriba de los KPI');
    const orden = await page.evaluate(() => { const c = document.getElementById('cierreControl'); const k = document.getElementById('kpiRowReal'); return !!(c.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING); });
    t.ok(orden, 'y está antes de las tarjetas KPI y de la tabla');
    t.eq(await texto(page, '#cierreMesTexto'), 'sin definir', 'sin mes de cierre en _meta: "sin definir"');
    t.ok(/los ingresos de SEP usan Julio/.test(await texto(page, '#cierreMeta')), 'y dice qué usan mientras tanto los ingresos de SEP (Julio, el último mes con datos reales)');
    t.ok(await visible(page, '#cierreAdmin') && await visible(page, '#cierreMesSelect') && await visible(page, '#cierreAplicarBtn'), 'el administrador ve el selector y el botón "Aplicar a todas las entidades"');
    t.eq(await texto(page, '#cierreAplicarBtn'), 'Aplicar a todas las entidades', 'con ese texto');
    t.eq(await page.evaluate(() => ({ v: document.getElementById('cierreMesSelect').value, n: document.getElementById('cierreMesSelect').options.length, dis: document.getElementById('cierreAplicarBtn').disabled })), { v: '', n: 13, dis: true }, 'selector sin mes elegido (12 meses + "Elegir mes…") y botón inactivo mientras no haya mes de cierre');
    t.eq(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')), true, 'sin mes de cierre no hay aviso de entidades con corte distinto (aunque los cortes del fixture son variados)');
    await clickTab(page, 'Panel principal');
    t.ok(/Mes de cierre: sin definir \(los ingresos de SEP usan Julio\)/.test(await texto(page, '#dashCierre')), 'el Panel principal lo menciona como texto: "Mes de cierre: sin definir (los ingresos de SEP usan Julio)"');
    t.eq(await page.evaluate(() => document.querySelectorAll('#dashCierre select, #dashCierre input').length), 0, 'sin ningún control editable en el Panel principal');
    t.ok(!(await h.writes()).some(w => w.path === RUTA('_meta')), 'abrir el panel no escribe nunca en _meta');
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'control (no admin)', async () => {
    const docs = clon(cierre);
    const h = await boot({ fixture: docs, user: 'authorized-nonadmin' });
    const { page } = h;
    await irSep(h);
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'una persona autorizada que NO es admin ve el mes de cierre como texto (Septiembre)');
    t.ok(/fijado por Wilson Rojas el 20\/10\/2026 a las 11:30 \(hora Chile\)/.test(await texto(page, '#cierreMeta')), 'con quién lo fijó y cuándo (hora de Chile)', await texto(page, '#cierreMeta'));
    t.ok(!(await visible(page, '#cierreAdmin')) && !(await visible(page, '#cierreMesSelect')) && !(await visible(page, '#cierreAplicarBtn')), 'y NO ve el selector ni el botón');
    t.ok(await visible(page, '#cierreAviso'), 'pero sí ve el aviso de entidades con corte distinto');
    t.ok(/solo un administrador puede cambiar el mes de cierre/.test(await texto(page, '#cierreAyuda')), 'y la ayuda aclara que solo un administrador puede cambiarlo');
    // aun forzando los eventos, el cliente se niega y no escribe nada
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.evaluate(() => { const s = document.getElementById('cierreMesSelect'); s.value = '10'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => document.getElementById('cierreAplicarBtn').click());
    await h.waitIdle();
    t.eq(alertas(h).filter(m => /restringida a Wilson Rojas/.test(m)).length, 2, 'forzando el cambio y el botón, ambos responden que la herramienta está restringida');
    t.eq(confirmas(h), [], 'sin pedir confirmación');
    t.eq((await h.writes()).length, 0, 'y no escribe nada');
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'el mes de cierre sigue siendo Septiembre');
    t.eq(await page.evaluate(() => document.getElementById('cierreMesSelect').value), '9', 'y el selector oculto vuelve a su valor');
    await clickTab(page, 'Panel principal');
    t.ok(/Mes de cierre: Septiembre/.test(await texto(page, '#dashCierre')), 'Panel principal (no admin): "Mes de cierre: Septiembre"');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 2) Fijar el mes de cierre: guardado en _meta con merge
  await escenario(t, 'fijar el mes de cierre', async () => {
    const docs = clon(base);
    docs._meta.items_22 = ['Alimentación', 'Útiles']; docs._meta.items_29 = ['Mobiliario'];
    const h = await boot({ fixture: docs });
    const { page } = h;
    await irSep(h);
    await h.clearWrites();
    await page.selectOption('#cierreMesSelect', '9');
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.map(w => w.path), [RUTA('_meta')], 'un solo write, al documento _meta');
    t.ok(ws[0] && ws[0].op === 'setDoc' && ws[0].options.merge === true, 'setDoc con merge:true (no reemplaza el documento)', ws[0] && [ws[0].op, ws[0].options]);
    const p = ws[0].payload;
    t.eq(Object.keys(p).sort(), ['lastModifiedAt', 'lastModifiedBy', 'mes_cierre', 'mes_cierre_en', 'mes_cierre_por'], 'payload: mes_cierre, mes_cierre_por, mes_cierre_en y la auditoría; nada más');
    t.eq([p.mes_cierre, p.mes_cierre_por, p.lastModifiedBy], [9, ADMIN, ADMIN], 'mes_cierre = 9 (entero), mes_cierre_por = el correo del administrador');
    t.eq(p.mes_cierre_en, { __sentinel: 'serverTimestamp' }, 'mes_cierre_en = hora del servidor (serverTimestamp)');
    const st = await h.store();
    t.eq([st[RUTA('_meta')].items_22, st[RUTA('_meta')].items_29], [['Alimentación', 'Útiles'], ['Mobiliario']], 'en el servidor _meta conserva items_22 / items_29 (no se pisan)');
    t.ok(st[RUTA('_meta')].mes_cierre === 9 && st[RUTA('_meta')].mes_cierre_por === ADMIN && st[RUTA('_meta')].mes_cierre_en && typeof st[RUTA('_meta')].mes_cierre_en.__ts === 'number', 'y trae mes_cierre = 9, mes_cierre_por y mes_cierre_en (timestamp)');
    // Ningún otro documento cambió: ni los cortes explícitos de las entidades
    const igual = Object.keys(base).filter(id => id !== '_meta').every(id => JSON.stringify(st[RUTA(id)]) === JSON.stringify(base[id]) || (() => { const a = clon(st[RUTA(id)]), b = clon(base[id]); return JSON.stringify(a) === JSON.stringify(b); })());
    t.ok(igual, 'ningún otro documento cambió: cambiar el selector NO modifica los cortes de las entidades');
    // Pantalla
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'el texto muestra Septiembre');
    t.ok(/fijado por Wilson Rojas/.test(await texto(page, '#cierreMeta')), 'con quién lo fijó');
    t.eq(await page.evaluate(() => document.getElementById('cierreAplicarBtn').disabled), false, 'y el botón "Aplicar a todas" se activa');
    const esp = clon(base); esp._meta.mes_cierre = 9;
    const distintas = cortesDistintosEsperados(esp);
    t.eq((await texto(page, '#cierreAvisoResumen')), `⚠ ${distintas.length} entidades con corte distinto al cierre global (Septiembre)`, `aparece el aviso: ${distintas.length} entidades con corte distinto (las remuneraciones y fuentes siguen con su propio corte)`);
    await irSep(h);
    // Los ingresos sin corte propio siguen al cierre; la nota del modal lo dice
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1122"]');
    await h.waitIdle();
    t.eq([await page.evaluate(() => document.getElementById('ingRealHasta-1122').value), mesesRealesDe(await encabezadosMes(page, 0))], ['9', 9], 'los ingresos de un RBD sin corte propio pasan a Septiembre (modal)');
    t.eq(mesesRealesDe(await encabezadosMes(page, 1)), base['1122'].rem.real_hasta_mes || N_MESES, 'mientras su Remuneraciones conserva su propio corte');
    await page.keyboard.press('Escape'); await h.waitIdle();
    await clickTab(page, 'Panel principal');
    t.ok(/Mes de cierre: Septiembre/.test(await texto(page, '#dashCierre')) && new RegExp(`${distintas.length} entidades con corte distinto al cierre global`).test(await texto(page, '#dashCierre')), 'el Panel principal muestra "Mes de cierre: Septiembre" y el aviso');
    t.ok(/el mes de cierre es Septiembre, se aplica con "Aplicar a todas las entidades"/.test(await texto(page, '#dashNota')), 'y la nota del Panel principal aclara que el "por defecto" de las fuentes sigue siendo Julio mientras no se aplique');
    // Recarga: persiste
    await page.reload();
    await esperarPanelListo(page);
    await irSep(h);
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'tras recargar sigue en Septiembre');
    // Cambiar de nuevo: otro write, solo a _meta
    await h.clearWrites();
    await page.selectOption('#cierreMesSelect', '10');
    await h.flushWrites();
    const ws2 = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq([ws2.map(w => w.path), ws2[0] && ws2[0].payload.mes_cierre], [[RUTA('_meta')], 10], 'mover a Octubre: otro write solo a _meta (mes_cierre = 10)');
    t.eq(await texto(page, '#cierreMesTexto'), 'Octubre', 'el texto muestra Octubre');
    // Elegir el placeholder no hace nada
    await h.clearWrites();
    await page.selectOption('#cierreMesSelect', '');
    await h.waitIdle();
    t.eq([(await h.writes()).length, await texto(page, '#cierreMesTexto'), await page.evaluate(() => document.getElementById('cierreMesSelect').value)], [0, 'Octubre', '10'], 'elegir "Elegir mes…" no escribe ni cambia el mes de cierre (el selector vuelve a Octubre)');
    // Otra persona (admin) lo cambia: se ve sin recargar
    await h.remoto('_meta', 'd.mes_cierre = 11; d.mes_cierre_por = "wilson.rojasabarca@gmail.com"');
    await h.waitIdle();
    t.eq([await texto(page, '#cierreMesTexto'), await page.evaluate(() => document.getElementById('cierreMesSelect').value)], ['Noviembre', '11'], 'un cambio remoto del mes de cierre se ve al instante (texto y selector)');
    t.ok(/fijado por Wilson Rojas Abarca/.test(await texto(page, '#cierreMeta')), 'con el nombre de quien lo fijó');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 3) Indicador de sincronización con un error de guardado
  await escenario(t, 'error al guardar el mes de cierre', async () => {
    const h = await boot({ fixture: 'default' });
    const { page } = h;
    await irSep(h);
    await h.mock('failNextWrite', 'permission-denied', { optimistic: false });
    await page.selectOption('#cierreMesSelect', '9');
    await h.flushWrites();
    await h.waitIdle();
    t.ok(/1 cambio sin guardar/.test(await texto(page, '#sync-text')), 'si el servidor rechaza el guardado el indicador queda rojo: "1 cambio sin guardar"', await texto(page, '#sync-text'));
    t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', 'el cambio sigue en pantalla (no se pierde)');
    await h.clearWrites();
    await page.click('#sync-retry');
    await h.flushWrites();
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd' && w.status !== 'rejected');
    t.eq(ws.map(w => w.path), [RUTA('_meta')], 'Reintentar lo vuelve a enviar a _meta');
    t.ok(ws[0] && ws[0].payload.mes_cierre === 9 && ws[0].payload.mes_cierre_en && ws[0].payload.mes_cierre_en.__sentinel === 'serverTimestamp', 'con mes_cierre y la hora del servidor otra vez');
    t.ok(/Sincronizado/.test(await texto(page, '#sync-text')), 'y el indicador vuelve a verde');
    t.eq((await h.store())[RUTA('_meta')].mes_cierre, 9, 'servidor: mes_cierre = 9');
    h.expectErrors(/simulated permission-denied/); // el rechazo simulado se registra con console.error: es lo esperado
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 4) Aviso de entidades con corte distinto
  await escenario(t, 'aviso de cortes distintos', async () => {
    const h = await boot({ fixture: clon(cierre) });
    const { page } = h;
    await irSep(h);
    const esperadas = esperadasComoFilas(cierre);
    t.eq(esperadas.length, 8, 'el fixture "cierre" tiene 8 cortes distintos al cierre (2 de ingresos, 3 de remuneraciones y 3 de fuentes)');
    t.eq(await texto(page, '#cierreAvisoResumen'), '⚠ 8 entidades con corte distinto al cierre global (Septiembre)', 'resumen: "⚠ 8 entidades con corte distinto al cierre global (Septiembre)"');
    t.eq(await page.evaluate(() => document.getElementById('cierreAviso').open), false, 'el aviso es un desplegable, cerrado al principio');
    await page.click('#cierreAviso summary');
    t.eq(await page.evaluate(() => document.getElementById('cierreAviso').open), true, 'se abre con un clic');
    t.eq(normaliza(await filasAviso(page)), normaliza(esperadas), 'la lista trae (entidad, fuente, corte actual) de exactamente esas 8 entidades');
    t.eq(await page.evaluate(() => { const r = document.getElementById('cierreAvisoLista'); return { rol: r.getAttribute('role'), nombre: !!r.getAttribute('aria-label'), tab: r.tabIndex }; }), { rol: 'region', nombre: true, tab: 0 }, 'la lista es una región con nombre y alcanzable con el teclado');
    t.eq(await page.evaluate(() => new Set(Array.from(document.querySelectorAll('#cierreAvisoLista button')).map(b => b.getAttribute('aria-label'))).size), 8, 'los 8 botones "Abrir detalle" tienen nombre accesible distinto');
    // Enlace al detalle (SEP)
    await page.click('#cierreAvisoLista tbody tr:has(td:text-is("RBD 1121 — LICEO PULMAHUE DE LA LIGUA")) button >> nth=0');
    await h.waitIdle();
    t.eq(await page.evaluate(() => ({ abierto: !document.getElementById('rbdModal').classList.contains('hidden'), rbd: document.getElementById('modalBody').dataset.rbd })), { abierto: true, rbd: '1121' }, '"Abrir detalle" de una fila de SEP abre el modal de ese RBD');
    await page.keyboard.press('Escape'); await h.waitIdle();
    // Enlace al detalle (fuente): cambia de pestaña y abre el modal de la entidad
    await clickTab(page, 'SEP');
    await page.click('#cierreAvisoLista tbody tr:has(td:text-is("FAEP")) button');
    await h.waitIdle();
    t.eq(await page.evaluate(() => ({ tab: document.querySelector('.tab-btn.active').dataset.tab, abierto: !document.getElementById('otrasFuentesModal').classList.contains('hidden'), rbd: document.getElementById('otrasFuentesModalBody').dataset.rbd })), { tab: 'of-faep', abierto: true, rbd: 'AC' }, '"Abrir detalle" de una fila de FAEP cambia a la pestaña FAEP y abre la entidad (AC)');
    await page.keyboard.press('Escape'); await h.waitIdle();
    // Panel principal: mención + enlace
    await clickTab(page, 'Panel principal');
    t.ok(/Mes de cierre: Septiembre · ⚠ 8 entidades con corte distinto al cierre global/.test(await texto(page, '#dashCierre')), 'Panel principal: "Mes de cierre: Septiembre · ⚠ 8 entidades con corte distinto al cierre global"');
    await page.click('#dashCierre button');
    await h.waitIdle();
    t.eq(await page.evaluate(() => document.querySelector('.tab-btn.active').dataset.tab), 'panel', 'y su enlace lleva a la pestaña SEP');
    // Se actualiza con los cambios de otras personas: cuenta y desaparece
    await h.remoto('1128', 'd.rem.real_hasta_mes = 9');
    await h.waitIdle();
    t.eq(await texto(page, '#cierreAvisoResumen'), '⚠ 7 entidades con corte distinto al cierre global (Septiembre)', 'si alguien corrige una remuneración (1128 → Septiembre) la cuenta baja a 7');
    t.eq(await page.evaluate(() => document.getElementById('cierreAviso').open), true, 'sin cerrar el desplegable');
    await h.remoto('1121', 'd.rem.real_hasta_mes = 9; d.ingreso_real_hasta_mes = 9; d.otras_fuentes.general.real_hasta_mes = 9');
    await h.remoto('1123', 'd.rem.real_hasta_mes = 9; d.ingreso_real_hasta_mes = 9');
    await h.remoto('AC', 'd.otras_fuentes.faep.real_hasta_mes = 9');
    await h.waitIdle();
    t.eq(await texto(page, '#cierreAvisoResumen'), '⚠ 1 entidad con corte distinto al cierre global (Septiembre)', 'con una sola queda en singular: "1 entidad con corte distinto"');
    t.ok(/⚠ 1 entidad con corte distinto al cierre global/.test(await texto(page, '#dashCierre')), 'también en el Panel principal');
    await h.remoto('5402002', 'd.otras_fuentes.junji.real_hasta_mes = 9');
    await h.waitIdle();
    t.ok(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')) && !(await visible(page, '#cierreAviso')), 'cuando todo coincide con el cierre el aviso desaparece');
    t.ok(!/entidad/.test(await texto(page, '#dashCierre')) && /Mes de cierre: Septiembre/.test(await texto(page, '#dashCierre')), 'y del Panel principal también');
    // Si el cierre cambia a otro mes, vuelven a aparecer todas
    await h.remoto('_meta', 'd.mes_cierre = 10');
    await h.waitIdle();
    t.ok(/^⚠ \d+ entidades con corte distinto al cierre global \(Octubre\)$/.test(await texto(page, '#cierreAvisoResumen')), 'al mover el cierre a Octubre el aviso reaparece (todo está en Septiembre)', await texto(page, '#cierreAvisoResumen'));
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 5) Aplicar a todas las entidades
  await escenario(t, 'aplicar (fixture cierre)', async () => {
    const h = await boot({ fixture: clon(cierre) });
    const { page } = h;
    await irSep(h);
    const cambios = cortesDistintosEsperados(cierre);
    const docsAfectados = [...new Set(cambios.map(c => c.rbd))].sort();
    t.eq(docsAfectados, ['1121', '1123', '1128', '5402002', 'AC'], 'los 8 cortes distintos viven en 5 documentos');
    // cancelar
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.evaluate(() => { window.__confirmOriginal = window.confirm; window.confirm = (m) => { (window.__confirms = window.__confirms || []).push(m); return false; }; });
    await page.click('#cierreAplicarBtn');
    await h.waitIdle();
    const msgs = await page.evaluate(() => window.__confirms);
    t.eq(msgs.length, 1, 'pide confirmación');
    const m = msgs[0] || '';
    t.ok(/Se fijará Septiembre como corte Real\/Proyectado en 8 entidades \(5 documentos\)/.test(m), 'la confirmación dice el mes y cuántas entidades cambian (8, en 5 documentos)', m);
    const origen = porOrigen(cambios);
    t.eq(origen, { 'SEP — Ingresos': 2, 'SEP — Remuneraciones': 3, 'Subvención General': 1, 'JUNJI': 1, 'FAEP': 1 }, 'conteo esperado por origen');
    t.ok(Object.entries(origen).every(([k, n]) => m.includes(`  • ${k}: ${n}`)), 'y lista cuántas cambian por origen (SEP — Ingresos: 2, SEP — Remuneraciones: 3, Subvención General: 1, JUNJI: 1, FAEP: 1)', m);
    t.ok(/No se modifica ningún monto ni otro dato/.test(m) && /Es seguro repetirlo/.test(m), 'y aclara que no toca montos y que es seguro repetirlo');
    t.eq((await h.writes()).length, 0, 'cancelar no escribe nada');
    t.eq(await texto(page, '#cierreAvisoResumen'), '⚠ 8 entidades con corte distinto al cierre global (Septiembre)', 'ni cambia nada en pantalla');
    // aceptar
    await page.evaluate(() => { window.confirm = window.__confirmOriginal; });
    const antes = clon(await h.store());
    h.dialogs.length = 0;
    await page.click('#cierreAplicarBtn');
    await h.flushWrites();
    await h.waitIdle();
    for (let i = 0; i < 100 && !alertas(h).some(a => /Listo/.test(a)); i++) await page.waitForTimeout(50);
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.map(w => w.path).sort(), docsAfectados.map(RUTA).sort(), 'escribe solo los 5 documentos con un corte distinto (las demás entidades no se tocan)');
    t.ok(ws.every(w => w.op === 'batch.set' && w.options.merge === true), 'son batch.set con merge:true (writeBatch)', ws.map(w => [w.op, w.options]));
    t.ok(new Set(ws.map(w => w.batchId)).size === 1 && ws.length * 2 <= 400, 'en un solo lote, de ≤ 400 operaciones (cada documento cuenta 2: el set y el serverTimestamp)');
    const por = (id) => ws.find(w => w.path === RUTA(id)).payload;
    const aud = { lastModifiedBy: ADMIN, lastModifiedAt: { __sentinel: 'serverTimestamp' } };
    t.eq(por('1121'), { nombre: nombres['1121'], ingreso_real_hasta_mes: 9, rem: { real_hasta_mes: 9 }, otras_fuentes: { general: { real_hasta_mes: 9 } }, ...aud }, '1121: ingreso_real_hasta_mes, rem.real_hasta_mes y otras_fuentes.general.real_hasta_mes (solo esos campos)');
    t.eq(por('1123'), { nombre: nombres['1123'], ingreso_real_hasta_mes: 9, rem: { real_hasta_mes: 9 }, ...aud }, '1123: ingresos y remuneraciones');
    t.eq(por('1128'), { nombre: nombres['1128'], rem: { real_hasta_mes: 9 }, ...aud }, '1128: solo remuneraciones (su ingreso ya seguía al cierre)');
    t.eq(por('AC'), { nombre: 'Administración Central', otras_fuentes: { faep: { real_hasta_mes: 9 } }, ...aud }, 'AC: otras_fuentes.faep.real_hasta_mes');
    t.eq(por('5402002'), { nombre: nombres['5402002'], otras_fuentes: { junji: { real_hasta_mes: 9 } }, ...aud }, 'GESPARVU 5402002: otras_fuentes.junji.real_hasta_mes');
    const st = await h.store();
    t.ok(Object.keys(base).every(id => JSON.stringify(sinCortes(st[RUTA(id)])) === JSON.stringify(sinCortes(antes[RUTA(id)]))), 'no se tocó ningún otro campo de ningún documento (montos, compras, ítems, nombres…)');
    t.eq(JSON.stringify(st[RUTA('_meta')]), JSON.stringify(antes[RUTA('_meta')]), 'ni el documento _meta');
    const todos9 = RBD_IDS.every(id => (!st[RUTA(id)].rem || st[RUTA(id)].rem.real_hasta_mes === 9));
    t.ok(todos9, 'servidor: la remuneración de TODOS los RBD queda en Septiembre');
    t.ok(RBD_IDS.every(id => st[RUTA(id)].ingreso_real_hasta_mes === undefined ? true : st[RUTA(id)].ingreso_real_hasta_mes === 9), 'y todo corte propio de ingresos que existía queda en Septiembre');
    t.ok(alertas(h).some(a => /Listo: se fijó Septiembre como corte en 8 entidades \(5 documentos\)/.test(a)), 'avisa "Listo: se fijó Septiembre como corte en 8 entidades (5 documentos)"', alertas(h));
    // pantalla
    t.ok(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')), 'el aviso desaparece: todas las entidades coinciden con el cierre');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    t.eq([mesesRealesDe(await encabezadosMes(page, 0)), mesesRealesDe(await encabezadosMes(page, 1))], [9, 9], 'modal de 1121: ingresos y remuneraciones Reales hasta Septiembre');
    await page.keyboard.press('Escape'); await h.waitIdle();
    // idempotente
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.click('#cierreAplicarBtn');
    await h.waitIdle();
    t.eq((await h.writes()).length, 0, 'idempotente: repetirlo no escribe nada');
    t.ok(alertas(h).some(a => /Todas las entidades ya tienen el corte en Septiembre: no hay nada que cambiar/.test(a)) && !confirmas(h).length, 'y avisa que no hay nada que cambiar (sin pedir confirmación)', alertas(h));
    t.noErrores(h);
    await h.close();
  });

  await escenario(t, 'aplicar (fixture default + cierre)', async () => {
    const docs = clon(base); docs._meta.mes_cierre = 9; docs._meta.mes_cierre_por = ADMIN;
    const h = await boot({ fixture: docs });
    const { page } = h;
    await irSep(h);
    const cambios = cortesDistintosEsperados(docs);
    const docsAfectados = [...new Set(cambios.map(c => c.rbd))];
    t.eq(await texto(page, '#cierreAvisoResumen'), `⚠ ${cambios.length} entidades con corte distinto al cierre global (Septiembre)`, `el aviso cuenta ${cambios.length} entidades en SEP (remuneraciones) y fuentes`);
    t.ok(!cambios.some(c => c.origen === 'sep_ingreso'), 'ningún ingreso de SEP cuenta: sin corte propio siguen al cierre global');
    t.eq(new Set(cambios.map(c => c.origen)).size, 1 + FUENTES.length, 'cuenta SEP — Remuneraciones y las 9 fuentes (cada una con sus entidades)');
    await h.clearWrites();
    h.dialogs.length = 0;
    await page.click('#cierreAplicarBtn');
    await h.flushWrites();
    await h.waitIdle();
    for (let i = 0; i < 100 && !alertas(h).some(a => /Listo/.test(a)); i++) await page.waitForTimeout(50);
    const m = confirmas(h)[0] || '';
    t.ok(new RegExp(`en ${cambios.length} entidades \\(${docsAfectados.length} documentos\\)`).test(m), `la confirmación dice ${cambios.length} entidades en ${docsAfectados.length} documentos`, m.slice(0, 200));
    t.ok(Object.entries(porOrigen(cambios)).every(([k, n]) => m.includes(`  • ${k}: ${n}`)), 'y el conteo por origen (SEP y cada una de las 9 fuentes)', m);
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.length, docsAfectados.length, `escribe ${docsAfectados.length} documentos (uno por entidad, con todo lo suyo junto)`);
    t.ok(new Set(ws.map(w => w.batchId)).size === 1 && ws.length * 2 <= 400, `un solo lote de ${ws.length * 2} operaciones (≤ 400)`);
    const st = await h.store();
    // cada fuente en el universo correcto, cada RBD en su remuneración; ningún ingreso_real_hasta_mes nuevo (siguen al cierre)
    t.ok(FUENTES.every(f => idsDeUniverso(f.universo).every(id => st[RUTA(id)].otras_fuentes[f.key].real_hasta_mes === 9)), 'servidor: las 9 fuentes quedan en Septiembre en TODAS sus entidades (RBD + AC; GESPARVU en JUNJI y Aporte JUNJI; los tres en FAEP y FIGA)');
    t.ok(GESPARVU_IDS.every(id => !['general', 'pie', 'mantenimiento', 'prorretencion', 'aporte_educ'].some(k => st[RUTA(id)].otras_fuentes && st[RUTA(id)].otras_fuentes[k])), 'sin crear fuentes que no corresponden al universo de un GESPARVU (los jardines SÍ tienen FAEP y FIGA)');
    t.ok([...RBD_IDS, 'AC'].every(id => !['junji', 'aporte_junji'].some(k => st[RUTA(id)].otras_fuentes && st[RUTA(id)].otras_fuentes[k])), 'ni fuentes de jardines (JUNJI, Aporte JUNJI) en un RBD o en AC');
    t.ok(RBD_IDS.every(id => !st[RUTA(id)].rem || st[RUTA(id)].rem.real_hasta_mes === 9), 'y la remuneración de los 55 RBD');
    t.ok(RBD_IDS.every(id => st[RUTA(id)].ingreso_real_hasta_mes === undefined), 'los ingresos sin corte propio NO reciben campo (ya seguían al cierre global: no cambian)');
    t.ok(Object.keys(base).every(id => JSON.stringify(sinCortes(st[RUTA(id)])) === JSON.stringify(sinCortes(docs[id]))), 'no se tocó ningún otro campo de ningún documento');
    t.ok(await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')), 'el aviso desaparece');
    // las cifras de todas las vistas siguen el nuevo corte: remuneraciones reales de SEP = suma hasta septiembre de cada RBD
    const remReal = RBD_IDS.reduce((s, id) => s + Object.entries((docs[id].rem && docs[id].rem.meses) || {}).filter(([mes]) => ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE'].includes(mes)).reduce((a, [, v]) => a + v, 0), 0);
    const kpi = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('#kpiRowReal .kpi-card')).find(x => x.querySelector('.label').textContent.trim() === 'Gasto Remuneraciones (Real)'); return c.querySelector('.value').textContent; });
    t.eq(Number(kpi.replace(/[^\d]/g, '')), remReal, 'KPI "Gasto Remuneraciones (Real)" = remuneraciones de los 55 RBD hasta Septiembre');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 6) Lotes y reintento (con un tope de operaciones chico para que haya varios lotes)
  await escenario(t, 'lotes y reintento', async () => {
    const { ruta } = resolverAppHtml();
    let html = fs.readFileSync(ruta, 'utf8');
    const original = 'const MAX_OPERACIONES_POR_LOTE = 400;';
    t.ok(html.includes(original), 'el index.html declara MAX_OPERACIONES_POR_LOTE = 400 (el spec lo baja a 40 en una copia para forzar varios lotes)');
    html = html.replace(original, 'const MAX_OPERACIONES_POR_LOTE = 40;');
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const copia = path.join(TMP_DIR, 'index_lote_chico.html');
    fs.writeFileSync(copia, html);
    const docs = clon(base); docs._meta.mes_cierre = 9; docs._meta.mes_cierre_por = ADMIN;
    const h = await boot({ fixture: docs, html: copia });
    const { page } = h;
    await irSep(h);
    const cambios = cortesDistintosEsperados(docs);
    const nDocs = new Set(cambios.map(c => c.rbd)).size;
    t.eq(nDocs, 69, 'el fixture tiene 69 entidades por actualizar (55 RBD + AC + 13 GESPARVU)');
    await h.clearWrites();
    h.dialogs.length = 0;
    // el primer lote que se envíe es rechazado (error transitorio); los demás se confirman
    await h.mock('failNextWrite', 'unavailable', { optimistic: false });
    await page.click('#cierreAplicarBtn');
    await h.flushWrites();
    await h.waitIdle();
    for (let i = 0; i < 100 && !alertas(h).some(a => /No se pudo guardar/.test(a)); i++) await page.waitForTimeout(50);
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    const porLote = {};
    ws.forEach(w => { porLote[w.batchId] = (porLote[w.batchId] || []).concat(w); });
    const tam = Object.values(porLote).map(l => l.length);
    t.eq(tam, [20, 20, 20, 9], '69 documentos en 4 lotes de 20, 20, 20 y 9 (con el tope de 40 operaciones y 2 por documento)');
    t.ok(tam.every(n => n * 2 <= 40), 'ningún lote pasa del tope de operaciones');
    const rechazado = Object.values(porLote).filter(l => l.every(w => w.status === 'rejected'));
    t.eq(rechazado.length, 1, 'un lote fue rechazado');
    t.ok(alertas(h).some(a => /No se pudo guardar el corte para el resto del equipo/.test(a) && /Puedes repetir "Aplicar a todas las entidades": solo reintenta lo que falte/.test(a)), 'avisa que no se pudo guardar y que se puede repetir (solo reintenta lo que falte)', alertas(h));
    const stParcial = await h.store();
    const guardados = RBD_IDS.filter(id => stParcial[RUTA(id)].rem.real_hasta_mes === 9).length + (stParcial[RUTA('AC')].otras_fuentes && stParcial[RUTA('AC')].otras_fuentes.general && stParcial[RUTA('AC')].otras_fuentes.general.real_hasta_mes === 9 ? 1 : 0);
    t.ok(guardados > 0 && guardados < 56, 'los otros 3 lotes sí se guardaron (cambios parciales en el servidor)', guardados);
    // reintento: solo lo que falta
    await h.clearWrites();
    h.dialogs.length = 0;
    const aunDistintas = await page.evaluate(() => Number(/⚠ (\d+) entidad/.exec(document.getElementById('cierreAvisoResumen').textContent)?.[1] || 0));
    t.ok(aunDistintas > 0 && aunDistintas < cambios.length, 'el aviso vuelve a contar solo lo que quedó sin guardar (la pantalla se reconcilia con el servidor)', aunDistintas);
    await page.click('#cierreAplicarBtn');
    await h.flushWrites();
    await h.waitIdle();
    for (let i = 0; i < 100 && !alertas(h).some(a => /Listo/.test(a)); i++) await page.waitForTimeout(50);
    const ws2 = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(new Set(ws2.map(w => w.batchId)).size, 1, 'el reintento envía un solo lote');
    t.eq(ws2.length, 20, 'con los 20 documentos del lote que había fallado (los ya guardados no se vuelven a tocar)');
    const st = await h.store();
    t.ok(FUENTES.every(f => idsDeUniverso(f.universo).every(id => st[RUTA(id)].otras_fuentes[f.key].real_hasta_mes === 9)) && RBD_IDS.every(id => st[RUTA(id)].rem.real_hasta_mes === 9), 'al final todo está en Septiembre en el servidor');
    h.expectErrors(/Firebase: simulated unavailable/);
    await h.close();
  });

  // ============================================================================================ 7) _meta ausente, vacío o dañado
  await escenario(t, '_meta ausente o dañado', async () => {
    const casos = [
      ['sin documento _meta', (d) => { delete d._meta; }],
      ['_meta vacío', (d) => { d._meta = {}; }],
      ['solo items_22/items_29', (d) => { d._meta = { items_22: ['a'], items_29: ['b'] }; }],
      ['mes_cierre "x"', (d) => { d._meta.mes_cierre = 'x'; }],
      ['mes_cierre 0', (d) => { d._meta.mes_cierre = 0; }],
      ['mes_cierre 13', (d) => { d._meta.mes_cierre = 13; }],
      ['mes_cierre null', (d) => { d._meta.mes_cierre = null; }],
      ['mes_cierre 9.5', (d) => { d._meta.mes_cierre = 9.5; }],
      ['mes_cierre -1', (d) => { d._meta.mes_cierre = -1; }],
      ['mes_cierre objeto', (d) => { d._meta.mes_cierre = { mes: 9 }; }],
      ['mes_cierre arreglo', (d) => { d._meta.mes_cierre = [9]; }],
      ['mes_cierre booleano', (d) => { d._meta.mes_cierre = true; }],
    ];
    for (const [nombre, f] of casos) {
      const docs = clon(base); f(docs);
      const h = await boot({ fixture: docs });
      const { page } = h;
      await irSep(h);
      const ok = (await texto(page, '#cierreMesTexto')) === 'sin definir' && await page.evaluate(() => document.getElementById('cierreAviso').classList.contains('hidden')) && await page.evaluate(() => document.getElementById('cierreAplicarBtn').disabled);
      t.ok(ok, `${nombre}: "sin definir", sin aviso y con "Aplicar" inactivo`);
      await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1122"]');
      await h.waitIdle();
      t.eq(mesesRealesDe(await encabezadosMes(page, 0)), N_MESES, `${nombre}: los ingresos usan DATA.n_meses (Julio), como siempre`);
      t.ok(!(await h.writes()).some(w => w.path === RUTA('_meta')) || nombre === 'sin documento _meta', `${nombre}: el panel no escribe en _meta por sí solo`);
      t.noErrores(h);
      await h.close();
    }
  });

  await escenario(t, '_meta con datos de auditoría dañados', async () => {
    const casos = [
      ['mes_cierre_por con HTML', (m) => { m.mes_cierre_por = '<img src=x onerror="window.__xss=1">@x.cl'; m.mes_cierre_en = { __ts: Date.UTC(2026, 9, 20, 14, 30) }; }, /fijado por/],
      ['mes_cierre_por objeto', (m) => { m.mes_cierre_por = { a: 1 }; }, null],
      ['mes_cierre_en texto', (m) => { m.mes_cierre_en = 'ayer'; m.mes_cierre_por = ADMIN; }, /fijado por Wilson Rojas$/],
      ['mes_cierre_en objeto vacío', (m) => { m.mes_cierre_en = {}; m.mes_cierre_por = ADMIN; }, /fijado por Wilson Rojas$/],
      ['sin mes_cierre_por ni mes_cierre_en', (m) => { delete m.mes_cierre_por; delete m.mes_cierre_en; }, null],
    ];
    for (const [nombre, f, rx] of casos) {
      const docs = clon(base); docs._meta.mes_cierre = 9; f(docs._meta);
      const h = await boot({ fixture: docs });
      const { page } = h;
      await irSep(h);
      t.eq(await texto(page, '#cierreMesTexto'), 'Septiembre', `${nombre}: el mes de cierre válido se respeta`);
      const meta = await texto(page, '#cierreMeta');
      if (rx) t.ok(rx.test(meta), `${nombre}: la nota de auditoría es texto seguro`, meta); else t.eq(meta, '', `${nombre}: sin nota de auditoría`);
      t.eq(await page.evaluate(() => ({ img: document.querySelectorAll('#cierreControl img, #dashCierre img').length, xss: window.__xss === undefined })), { img: 0, xss: true }, `${nombre}: no se inyecta HTML ni se ejecuta nada`);
      t.noErrores(h);
      await h.close();
    }
  });

  await escenario(t, '_meta que lanza al leerse', async () => {
    const PARCHE = `(() => {
      let val;
      Object.defineProperty(window, '__mockfb', { configurable: true, get() { return val; }, set(v) {
        val = v; const fs = v.api && v.api.firestore; if (!fs) return;
        const orig = fs.onSnapshot;
        fs.onSnapshot = function (target, ...args) {
          const i = args.findIndex(a => typeof a === 'function');
          if (i >= 0) { const cb = args[i]; args[i] = (snap) => { snap.docs.forEach(d => { if (d.id === '_meta') d.data = () => { throw new Error('_meta corrupto de prueba'); }; }); return cb(snap); }; }
          return orig.call(this, target, ...args);
        };
      } });
    })();`;
    const h = await boot({ fixture: 'default', initScripts: [PARCHE] });
    const { page } = h;
    await irSep(h);
    t.eq(await texto(page, '#cierreMesTexto'), 'sin definir', 'un _meta que lanza al leerse no rompe el panel: "sin definir"');
    t.ok(!/inválid/.test(await texto(page, '#sync-text')), 'y no se marca como documento inválido (no es un RBD)');
    t.eq(await page.evaluate(() => document.querySelectorAll('#tableBody tr.rbd-row').length), 55, 'los 55 RBD se ven');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 8) _meta no se recrea ni se siembra
  await escenario(t, 'siembra y RBD faltantes', async () => {
    const docs = clon(cierre);
    delete docs['1122'];
    const h = await boot({ fixture: docs });
    await h.waitIdle();
    const ws = (await h.writes()).filter(w => w.collection === 'sep_carga_rbd');
    t.eq(ws.map(w => w.path), [RUTA('1122')], 'un RBD faltante se crea (solo escalares) y nunca se escribe en _meta');
    t.eq(Object.keys(ws[0].payload).sort(), ['lastModifiedAt', 'lastModifiedBy', 'nombre', 'rbd'], 'con rbd, nombre y auditoría, sin mapas ni cortes');
    await clickTab(h.page, 'SEP');
    t.eq(await texto(h.page, '#cierreMesTexto'), 'Septiembre', 'el mes de cierre sigue leyéndose de _meta');
    t.noErrores(h);
    await h.close();
  });

  // ============================================================================================ 9) Cambio del cierre por otra persona con el modal abierto + escape
  await escenario(t, 'lista del aviso sin marcado inesperado', async () => {
    const docs = clon(cierre);
    const h = await boot({ fixture: docs });
    const { page } = h;
    await irSep(h);
    await page.click('#cierreAviso summary');
    const html = await page.evaluate(() => document.getElementById('cierreAvisoLista').innerHTML);
    t.ok(!/<script|onerror|<img/i.test(html), 'la lista del aviso no contiene marcado inesperado');
    t.ok(await page.evaluate(() => Array.from(document.querySelectorAll('#cierreAvisoLista td')).every(td => td.children.length === 0 || td.querySelector('button'))), 'las celdas de la lista son solo texto (y el botón)');
    t.noErrores(h);
    await h.close();
  });
});
