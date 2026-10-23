// seguridad_xss (A2): el texto libre (compras de SEP y de las fuentes, conceptos de B&S y de proyección, ids de compra,
// lastModifiedBy…) que llega de Firestore o de un Excel importado se ve LITERAL (una sola vez escapado) y jamás se
// interpreta como HTML: no se ejecuta nada y no aparecen nodos <img src=x>, <svg onload>, <script>, atributos on*.
// Se recorren modales, tablas, Reportes (Visualizador y personalizado), dashboard, % Ejecución y los contenedores de impresión.
// También: ids/atributos construidos a partir de texto con comillas siguen funcionando (editar, guardar, quitar).
import { boot, clickTab, cargarFixture } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const RUTA = (id) => `sep_carga_rbd/${id}`;
const P = {
  img: '<img src=x onerror="window.__xss=1">',
  svg: '"><svg onload=window.__xss=1>',
  script: '<script>window.__xss=1</script>',
  comillas: `a"b'c`,
  amp: 'A & B <b>negrita</b> &amp; &lt;i&gt;',
  attr: 'x" tabindex=0 autofocus onfocus="window.__xss=1" y="',
};
const ID_RARO = 'c"' + P.svg;            // id de compra con comillas y marcado
const ID_RARO_2 = "c'" + P.img;

const MALOS = 'img[src="x"], svg[onload], [onerror], [onfocus], [onload], script:not([type="module"])';
// Cuenta nodos peligrosos en el panel y en el contenedor de impresión (el <script type=module> del propio panel queda fuera).
const nodosMalos = (page) => page.evaluate((sel) => document.querySelectorAll(sel.split(',').map(s => `#app ${s.trim()}, #printSingleWrap ${s.trim()}`).join(', ')).length, MALOS);

const compraPayload = (k, extra = {}) => ({
  codigo: '410606', tipoDocumento: `${k} ${P.img}`, nroDocumento: `${k} ${P.svg}`, fechaDocumento: '2026-03-02', fechaPago: `${k} ${P.script}`,
  descripcion: `${k} ${P.amp} ${P.img}`, rutProveedor: `${k} ${P.svg}`, nombreProveedor: `${k} ${P.comillas} ${P.img}`,
  montoGasto: 1000, montoDocumento: 1200, documentoOriginal: `${k} ${P.script}`, ...extra,
});
const ofCompraPayload = (k, extra = {}) => compraPayload(k, { codigo: '410503', ...extra });
// Boleta de honorarios (Subt. 21): mismos textos libres que una compra (sin documentoOriginal) + N° DC.
const honPayload = (k, extra = {}) => ({
  codigo: '410803', tipoDocumento: `${k} ${P.img}`, nroDocumento: `${k} ${P.svg}`, fechaDocumento: '2026-03-02', fechaPago: `${k} ${P.script}`,
  descripcion: `${k} ${P.amp} ${P.img}`, rutProveedor: `${k} ${P.svg}`, nombreProveedor: `${k} ${P.comillas} ${P.img}`,
  montoGasto: 1000, montoDocumento: 1200, documentoContable: `${k} ${P.attr}`, ...extra,
});

function armarFixture() {
  const docs = JSON.parse(JSON.stringify(cargarFixture('default').docs));
  const d1121 = docs['1121'];
  d1121.nombre = P.img;                                   // el nombre del documento NUNCA se muestra (los nombres salen de la tabla fija)
  d1121.lastModifiedBy = `${P.img}@x`;
  d1121.compras[ID_RARO] = compraPayload('SEP1');
  d1121.compras[ID_RARO_2] = compraPayload('SEP2', { codigo: P.img });   // código de cuenta inexistente con marcado
  d1121.bys_proyeccion.items[P.attr] = { meses: { SEPTIEMBRE: 5 }, total: 5 };
  d1121.honorarios = { [ID_RARO]: honPayload('HON1'), [ID_RARO_2]: honPayload('HON2', { codigo: P.img }) };   // ids con marcado; la 2.ª con una cuenta fuera del catálogo con marcado
  d1121.hon_proyeccion = { items: { [P.attr]: { meses: { SEPTIEMBRE: 6 }, total: 6 } } };                      // «cuenta» de la proyección con forma de atributo HTML
  const of = d1121.otras_fuentes;
  of.general.compras.og1 = ofCompraPayload('GEN');
  of.general.compras.og2 = ofCompraPayload('GENx', { codigo: P.img });  // cuenta no habilitada -> aviso en el title
  of.general.bys_proy_items = { a: { concepto: P.img, meses: { SEPTIEMBRE: 7 }, total: 7 }, b: { concepto: P.attr, meses: { SEPTIEMBRE: 8 }, total: 8 }, c: { concepto: P.amp, meses: { SEPTIEMBRE: 9 }, total: 9 } };
  of.pie.compras.op1 = ofCompraPayload('PIE');
  of.faep.bys_items[P.attr] = { concepto: P.attr, meses: { MARZO: 100 }, total: 100 };
  of.faep.bys_items[P.amp] = { concepto: P.amp, meses: { MARZO: 200 }, total: 200 };
  of.faep.bys_items[P.img] = { concepto: P.img, meses: { MARZO: 300 }, total: 300 };
  of.aporte_educ.bys_items = { s: { concepto: P.svg, meses: { MARZO: 1 }, total: 1 } };
  docs.AC.nombre = P.img;
  docs.AC.otras_fuentes = docs.AC.otras_fuentes || {};
  docs.AC.otras_fuentes.general = docs.AC.otras_fuentes.general || {};
  docs.AC.otras_fuentes.general.compras = { ...(docs.AC.otras_fuentes.general.compras || {}), ac1: ofCompraPayload('AC') };
  docs['5401003'].nombre = P.img;
  docs['5401003'].otras_fuentes = { junji: { bys_items: { j: { concepto: P.img, meses: { MARZO: 1000 }, total: 1000 } } } };
  return docs;
}

await correrSpec('seguridad_xss', async (t) => {
  const h = await boot({ fixture: armarFixture() });
  const { page } = h;
  // En cada impresión se revisa el DOM de impresión en ese instante (el panel lo vacía 300 ms después).
  await page.evaluate((sel) => {
    window.__imprimiendo = [];
    const previo = window.print;
    window.print = function () {
      const contar = (s) => document.querySelectorAll(sel.split(',').map(x => `#app ${x.trim()}, #printSingleWrap ${x.trim()}`).join(', ')).length;
      window.__imprimiendo.push({ malos: contar(sel), wrap: (document.getElementById('printSingleWrap') || {}).innerHTML || '' });
      return previo.apply(this, arguments);
    };
  }, MALOS);

  const limpio = async (donde) => {
    const xss = await page.evaluate(() => window.__xss);
    const malos = await nodosMalos(page);
    t.ok(xss === undefined && malos === 0, `${donde}: no se ejecuta nada ni aparecen nodos peligrosos`, { __xss: xss, nodosPeligrosos: malos });
  };
  const textoDe = (sel) => page.evaluate((s) => document.querySelector(s).innerText, sel);

  await limpio('al cargar los datos (tablas, KPI, dashboard)');
  await clickTab(page, 'dashboard'); await limpio('dashboard (incluye el panel "Atención")');

  // ---------------------------------------------------------------- SEP: tabla y modal
  await clickTab(page, 'SEP');
  await limpio('tabla SEP');
  await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
  await h.waitIdle();
  await limpio('modal SEP 1121');
  let txt = await textoDe('#modalBody');
  t.ok(txt.includes(`SEP1 ${P.amp} ${P.img}`), 'modal SEP: la descripción se ve LITERAL (con & < > " y etiquetas como texto, escapada una sola vez)');
  t.ok(txt.includes(`SEP1 ${P.svg}`) && txt.includes(`SEP1 ${P.script}`) && txt.includes(`SEP1 ${P.comillas} ${P.img}`), 'modal SEP: N° documento, RUT, proveedor y documento original se ven literales');
  t.ok(!txt.includes('&amp;amp;') && !txt.includes('&lt;img'), 'modal SEP: no hay doble escape (nada de &amp;amp; ni &lt;img)');
  t.ok(txt.includes(P.attr) && /onerror|onfocus/.test(txt), 'modal SEP: la ítem de proyección con clave tipo atributo se muestra como texto');
  const info = await textoDe('#modalBody .rbd-editor-info');
  t.ok(/onerror/.test(info), 'modal SEP: "última edición" muestra lastModifiedBy como texto', info);
  // los ids/atributos con texto raro siguen funcionando: editar y quitar
  const idsFilas = await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody tr[data-compra-id]')).map(tr => tr.dataset.compraId));
  t.ok(idsFilas.includes(ID_RARO) && idsFilas.includes(ID_RARO_2), 'modal SEP: los ids de compra con comillas y marcado llegan intactos al DOM (data-compra-id)', idsFilas.slice(0, 4));
  await page.evaluate((id) => { Array.from(document.querySelectorAll('#modalBody .compra-edit-btn')).find(b => b.dataset.compraId === id).click(); }, ID_RARO);
  const campo = (c) => page.evaluate((f) => document.querySelector(`#modalBody .compra-input[data-field="${f}"]`).value, c);
  t.eq(await campo('descripcion'), `SEP1 ${P.amp} ${P.img}`, 'editar compra con id raro: el formulario recibe la descripción exacta (sin escapes)');
  t.eq(await campo('nombreProveedor'), `SEP1 ${P.comillas} ${P.img}`, 'editar compra con id raro: el proveedor exacto');
  await page.click('#modalBody .cancelar-edicion-btn');
  await h.clearWrites();
  await page.evaluate((id) => { Array.from(document.querySelectorAll('#modalBody .compra-del-btn')).find(b => b.dataset.compraId === id).click(); }, ID_RARO);
  await h.waitIdle();
  const wDel = (await h.writes()).filter(w => w.path === RUTA('1121'));
  t.ok(wDel.length === 1 && wDel[0].payload.compras && wDel[0].payload.compras[ID_RARO] && wDel[0].payload.compras[ID_RARO].__sentinel === 'deleteField', 'quitar la compra con id raro: deleteField sobre la clave EXACTA', wDel[0] && Object.keys(wDel[0].payload.compras || {}));
  // ítem de proyección con código raro: el total de su fila se actualiza al teclear
  await page.evaluate((cod) => {
    const i = Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="bys_proy"]')).find(x => x.dataset.codigo === cod && x.dataset.mes === 'OCTUBRE');
    i.focus(); i.value = '40'; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, P.attr);
  const totProy = await page.evaluate((cod) => {
    const i = Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="bys_proy"]')).find(x => x.dataset.codigo === cod && x.dataset.mes === 'OCTUBRE');
    return i.closest('tr').querySelector('.item-total').textContent.replace(/\D/g, '');
  }, P.attr);
  t.eq(Number(totProy), 45, 'proyección con código raro: el total de su fila se actualiza (5 + 40)');
  // ---------------------------------------------------------------- SEP: Honorarios (Subt. 21) — boletas y proyección con texto libre peligroso
  txt = await textoDe('#modalBody .hon-section');
  t.ok(txt.includes(`HON1 ${P.amp} ${P.img}`), 'honorarios: la descripción se ve LITERAL (una sola vez escapada)');
  t.ok(txt.includes(`HON1 ${P.svg}`) && txt.includes(`HON1 ${P.script}`) && txt.includes(`HON1 ${P.comillas} ${P.img}`) && txt.includes(`HON1 ${P.attr}`), 'honorarios: N° de boleta, RUT, prestador y N° DC se ven literales');
  t.ok(!txt.includes('&amp;amp;') && !txt.includes('&lt;img'), 'honorarios: no hay doble escape');
  const idsHon = await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody tr[data-hon-id]')).map(tr => tr.dataset.honId));
  t.ok(idsHon.includes(ID_RARO) && idsHon.includes(ID_RARO_2), 'honorarios: los ids con comillas y marcado llegan intactos al DOM (data-hon-id)', idsHon);
  t.ok(await page.evaluate(() => /onfocus/.test(document.querySelector('#modalBody table.hon-table').innerText)), 'honorarios: el N° DC con forma de atributo se muestra como texto');
  t.ok(await page.evaluate((cod) => Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"]')).some(i => i.dataset.codigo === cod), P.attr), 'honorarios: la «cuenta» de la proyección con forma de atributo llega intacta a data-codigo');
  await page.evaluate((id) => { Array.from(document.querySelectorAll('#modalBody .hon-edit-btn')).find(b => b.dataset.honId === id).click(); }, ID_RARO);
  const campoHon = (c) => page.evaluate((f) => document.querySelector(`#modalBody .hon-input[data-field="${f}"]`).value, c);
  t.eq(await campoHon('descripcion'), `HON1 ${P.amp} ${P.img}`, 'editar boleta con id raro: el formulario recibe la descripción exacta (sin escapes)');
  t.eq(await campoHon('nombreProveedor'), `HON1 ${P.comillas} ${P.img}`, 'editar boleta con id raro: el prestador exacto');
  t.eq(await campoHon('documentoContable'), `HON1 ${P.attr}`, 'editar boleta con id raro: el N° DC exacto');
  await page.click('#modalBody .cancelar-edicion-hon-btn');
  await h.clearWrites();
  await page.evaluate((id) => { Array.from(document.querySelectorAll('#modalBody .hon-del-btn')).find(b => b.dataset.honId === id).click(); }, ID_RARO);
  await h.waitIdle();
  const wDelHon = (await h.writes()).filter(w => w.path === RUTA('1121'));
  t.ok(wDelHon.length === 1 && wDelHon[0].payload.honorarios && wDelHon[0].payload.honorarios[ID_RARO] && wDelHon[0].payload.honorarios[ID_RARO].__sentinel === 'deleteField', 'quitar la boleta con id raro: deleteField sobre la clave EXACTA', wDelHon[0] && wDelHon[0].payload);
  await page.evaluate((cod) => {
    const i = Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"]')).find(x => x.dataset.codigo === cod && x.dataset.mes === 'OCTUBRE');
    i.focus(); i.value = '40'; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, P.attr);
  const totHonProy = await page.evaluate((cod) => {
    const i = Array.from(document.querySelectorAll('#modalBody input.celda-input[data-modo="hon_proy"]')).find(x => x.dataset.codigo === cod && x.dataset.mes === 'OCTUBRE');
    return i.closest('tr').querySelector('.item-total').textContent.replace(/\D/g, '');
  }, P.attr);
  t.eq(Number(totHonProy), 46, 'proyección de honorarios con código raro: el total de su fila se actualiza (6 + 40)');
  await h.flushWrites();
  await limpio('modal SEP tras editar');
  await page.keyboard.press('Escape');

  // PDF individual SEP
  await page.evaluate(() => document.querySelector('.row-action-btn[data-action="pdf"][data-rbd="1121"]').click());
  await h.waitIdle();
  let imp = await page.evaluate(() => window.__imprimiendo.slice());
  t.ok(imp.length === 1 && imp[0].malos === 0, 'PDF individual SEP: el contenedor de impresión no tiene nodos peligrosos', imp.map(x => x.malos));
  t.ok(imp[0].wrap.includes('&lt;img src=x onerror=') && !imp[0].wrap.includes('<img src=x'), 'PDF individual SEP: el HTML imprimible lleva el texto escapado');
  const pr = await h.prints();
  t.ok(pr.length === 1 && pr[0].printWrap.includes(`SEP2 ${P.amp} ${P.img}`), 'PDF individual SEP: el texto impreso es el literal', pr[0] && pr[0].printWrap.slice(0, 120));
  await page.evaluate(() => { window.__imprimiendo = []; });
  await page.click('#exportPdfBtn'); await limpio('PDF general SEP');

  // ---------------------------------------------------------------- fuentes con compras (General) y por concepto (FAEP)
  for (const f of ['general', 'pie']) {
    await clickTab(page, f);
    await limpio(`tabla ${f}`);
    await page.click(`#otrasFuentesTbody-${f} td[data-abrir-otra-fuente="1121"]`);
    await h.waitIdle();
    await limpio(`modal ${f} 1121`);
    txt = await textoDe('#otrasFuentesModalBody');
    const k = f === 'general' ? 'GEN' : 'PIE';
    t.ok(txt.includes(`${k} ${P.amp} ${P.img}`) && txt.includes(`${k} ${P.svg}`), `modal ${f}: descripción, N° documento y RUT se ven literales`);
    t.ok(!txt.includes('&amp;amp;'), `modal ${f}: sin doble escape`);
    if (f === 'general') {
      const aviso = await page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody .compra-aviso')).map(e => e.title));
      t.ok(aviso.length >= 1 && aviso.some(a => a.includes(P.img)), 'modal general: el aviso (title) de cuenta no habilitada lleva el código como texto, sin romper el atributo', aviso);
      t.ok(txt.includes(P.img) && txt.includes(P.amp), 'modal general: los conceptos de proyección de B&S se ven literales');
    }
    await page.keyboard.press('Escape');
    await page.evaluate((fu) => document.querySelector(`#otrasFuentesTbody-${fu} .row-action-btn[data-action="pdf"][data-rbd="1121"]`).click(), f);
    await h.waitIdle();
    imp = await page.evaluate(() => window.__imprimiendo.slice());
    t.ok(imp.length >= 1 && imp.every(x => x.malos === 0), `PDF de la entidad (${f}): sin nodos peligrosos`, imp.map(x => x.malos));
    const prf = (await h.prints()).slice(-1)[0];
    t.ok(prf && prf.printWrap.includes(`${k} ${P.amp}`), `PDF de la entidad (${f}): el texto impreso es el literal`);
    await page.evaluate(() => { window.__imprimiendo = []; });
  }
  await clickTab(page, 'general');
  await page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="AC"]');
  await h.waitIdle(); await limpio('modal General · Administración Central');
  t.ok((await textoDe('#otrasFuentesModalBody')).includes(`AC ${P.amp}`), 'modal AC: compra con texto libre se ve literal');
  await page.keyboard.press('Escape');

  await clickTab(page, 'faep');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="1121"]');
  await h.waitIdle();
  await limpio('modal FAEP 1121 (conceptos con comillas y marcado)');
  txt = await textoDe('#otrasFuentesModalBody');
  t.ok(txt.includes(P.attr) && txt.includes(P.amp) && txt.includes(P.img), 'modal FAEP: los conceptos se ven literales');
  const conceptos = await page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-concepto]')).map(i => i.dataset.concepto));
  t.ok([P.attr, P.amp, P.img].every(c => conceptos.includes(c)), 'FAEP: data-concepto conserva el texto EXACTO (comillas y & incluidos)', conceptos.slice(0, 4));
  // editar el concepto con atributo roto: la clave guardada es la exacta y el total de su fila se actualiza
  await h.clearWrites();
  await page.evaluate((c) => {
    const i = Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-concepto]')).find(x => x.dataset.concepto === c && x.dataset.mes === 'ABRIL');
    i.focus(); i.value = '55'; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, P.attr);
  const totFaep = await page.evaluate((c) => {
    const i = Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-concepto]')).find(x => x.dataset.concepto === c && x.dataset.mes === 'ABRIL');
    return i.closest('tr').querySelector('.item-total').textContent.replace(/\D/g, '');
  }, P.attr);
  t.eq(Number(totFaep), 155, 'FAEP concepto con comillas: el total de su fila se actualiza (100 + 55)');
  await h.flushWrites();
  const wf = (await h.writes()).filter(w => w.path === RUTA('1121'));
  t.ok(wf.length === 1 && Object.keys(wf[0].payload.otras_fuentes.faep.bys_items).join('|') === P.attr, 'FAEP concepto con comillas: se guarda bajo la clave exacta (no se crea un ítem paralelo)', wf[0] && Object.keys(wf[0].payload.otras_fuentes.faep.bys_items));
  // concepto con "&amp;": se edita y se guarda bajo su propia clave (antes iba a otra clave por el escape a medias)
  await h.clearWrites();
  await page.evaluate((c) => {
    const i = Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-concepto]')).find(x => x.dataset.concepto === c && x.dataset.mes === 'ABRIL');
    i.focus(); i.value = '9'; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, P.amp);
  await h.flushWrites();
  const wa = (await h.writes()).filter(w => w.path === RUTA('1121'));
  t.ok(wa.length === 1 && Object.keys(wa[0].payload.otras_fuentes.faep.bys_items).join('|') === P.amp, 'FAEP concepto con "&amp;": se guarda bajo su clave exacta', wa[0] && Object.keys(wa[0].payload.otras_fuentes.faep.bys_items));
  await limpio('modal FAEP tras editar');
  // quitar el concepto raro
  await h.clearWrites();
  await page.evaluate((c) => { Array.from(document.querySelectorAll('#otrasFuentesModalBody .of-bysitem-del-btn')).find(b => b.dataset.concepto === c).click(); }, P.attr);
  await h.waitIdle();
  const wq = (await h.writes()).filter(w => w.path === RUTA('1121'));
  t.ok(wq.length === 1 && wq[0].payload.otras_fuentes.faep.bys_items[P.attr].__sentinel === 'deleteField', 'FAEP: quitar el concepto raro borra la clave exacta (deleteField)');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#otrasFuentesTbody-faep .row-action-btn[data-action="pdf"][data-rbd="1121"]').click());
  await h.waitIdle();
  imp = await page.evaluate(() => window.__imprimiendo.slice());
  t.ok(imp.length >= 1 && imp.every(x => x.malos === 0), 'PDF de la entidad (FAEP): sin nodos peligrosos', imp.map(x => x.malos));
  await page.evaluate(() => { window.__imprimiendo = []; });

  await clickTab(page, 'junji');
  await page.click('#otrasFuentesTbody-junji td[data-abrir-otra-fuente="5401003"]');
  await h.waitIdle(); await limpio('modal JUNJI (GESPARVU con nombre de documento con marcado)');
  await page.keyboard.press('Escape');
  await clickTab(page, 'Aporte Educ.'); await limpio('tabla Aporte Educ.');

  // ---------------------------------------------------------------- % Ejecución
  await clickTab(page, '% Ejecución'); await limpio('% Ejecución (SEP)');
  for (const chip of ['general', 'faep', 'consolidado']) {
    await page.evaluate((c) => document.querySelector(`#ejecFuenteChips [data-ejec-fuente="${c}"]`).click(), chip);
    await h.waitIdle();
    await limpio(`% Ejecución (${chip})`);
  }
  await page.click('#ejecPdfBtn'); await limpio('PDF de % Ejecución');
  t.eq(await page.evaluate(() => window.__xss), undefined, 'PDF de % Ejecución: nada se ejecutó');

  // ---------------------------------------------------------------- Reportes
  await clickTab(page, 'Reportes');
  await limpio('Reportes · Visualizador');
  for (let ronda = 0; ronda < 16; ronda++) {   // cada clic redibuja el árbol y aparecen nuevos nodos por expandir (los nodos de Honorarios de SEP suman rondas)
    const quedan = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#vzBodyGas [data-vz-toggle]')).find(x => x.getAttribute('aria-expanded') !== 'true'); if (b) b.click(); return !!b; });
    if (!quedan) break;
  }
  await page.evaluate(() => { document.querySelectorAll('#vzBodyGas [data-vz-mes]').forEach(b => b.click()); });
  await limpio('Visualizador expandido con detalle mensual');
  const vz = await textoDe('#vzBodyGas');
  t.ok(vz.includes(P.img) || vz.includes(P.amp), 'Visualizador: los conceptos con texto libre se ven literales');
  await page.click('#vzPdfBtn'); await h.waitIdle();
  imp = await page.evaluate(() => window.__imprimiendo.slice());
  t.ok(imp.length >= 1 && imp.every(x => x.malos === 0), 'PDF del Visualizador: sin nodos peligrosos', imp.map(x => x.malos));
  await page.evaluate(() => { window.__imprimiendo = []; });
  await page.evaluate(() => document.querySelector('[data-reporte-vista="personalizado"]').click());
  await page.evaluate(() => {
    document.querySelectorAll('#reporteConceptoList details').forEach(d => { d.open = true; });
    document.querySelectorAll('#reporteConceptoList input[data-concepto-check]').forEach(i => { if (!i.checked) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  });
  await h.waitIdle();
  await limpio('Reportes · personalizado con todos los conceptos');
  const celdas = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteTbody td:nth-child(3)')).map(td => td.textContent));
  t.ok(celdas.some(c => c.includes(P.img)) && celdas.some(c => c.includes(P.attr)) && celdas.some(c => c.includes(P.amp)), 'Reporte personalizado: las etiquetas "B&S — <concepto>" se ven literales', celdas.filter(c => /x"|<img|&/.test(c)).slice(0, 3));
  const lista = await page.evaluate(() => Array.from(document.querySelectorAll('#reporteConceptoList label')).map(l => l.textContent));
  t.ok(lista.some(c => c.includes(P.img)), 'lista de conceptos del reporte: el concepto con marcado se ve literal');
  await page.click('#reportePdfBtn');
  t.eq(await page.evaluate(() => window.__xss), undefined, 'PDF del reporte personalizado: nada se ejecutó');

  // ---------------------------------------------------------------- resumen
  await limpio('al terminar el recorrido completo');
  t.ok(await page.evaluate(() => document.querySelectorAll('#tableBody tr.rbd-row').length) === 55, 'la tabla SEP sigue completa (55 filas)');
  t.noErrores(h);
  await h.close();
});
