// Honorarios (PR-1) · catálogo de cuentas y tipos de documento.
//   1. data/honorarios_cuentas_2026.json (dato normativo versionado, generado por scripts/extract_honorarios_cuentas.py) y el bloque HONORARIOS_CUENTAS_2026 de index.html dicen LO MISMO.
//   2. Contenido: 36 cuentas (las 35 del spec + 411404); 410803 es la única «solo Honorarios»; 411801 acepta solo BHE; 410608 y las «sin BHE»; 410801 sin BOLHE; 410304 y 410309
//      están (hoy el panel no las tiene en ningún selector); todas existen en el Plan de Cuentas 2026 con el mismo nombre y están habilitadas en al menos una columna.
//   3. Interfaz (SEP): el selector «Cuenta de honorarios» lista exactamente las cuentas del catálogo habilitadas en la columna SEP del plan (27, 24 con ●); el selector de tipo solo ofrece los 5
//      tipos de honorarios y, con una cuenta elegida, solo los que esa cuenta acepta.
//   4. Compras: el selector «Tipo de documento» ya NO trae los 5 tipos de honorarios (SEP y fuentes).
import fs from 'node:fs';
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { abrirModalSep, abrirModalFuente } from '../lib/compras.mjs';
import { CATALOGO, PLAN, TIPOS_HON, cuentasHabilitadas } from '../lib/honorarios.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';

const TIPOS_COMPRAS_ESPERADOS = ['Boleta', 'Boleta exenta', 'Boleta electrónica', 'Boleta exenta electrónica', 'Factura', 'Factura exenta', 'Factura electrónica', 'Factura exenta electrónica',
  'Otro documento exento', 'Finiquito', 'Documento extranjero', 'Nota de crédito', 'Nota de débito'];
const NOMBRES_HON = ['Boleta de honorarios manual', 'Boleta de honorarios exenta', 'Boleta de honorarios electrónica', 'Boleta honorarios prestación de servicios a terceros', 'Boleta honorarios prestación de servicios a terceros electrónica'];

await correrSpec('honorarios_cuentas', async (t) => {
  // ============================================================ 1. JSON ↔ index.html
  const html = fs.readFileSync(resolverAppHtml().ruta, 'utf8');
  const bloque = (/\/\/ <honorarios-cuentas-2026:begin>[\s\S]*?\/\/ <honorarios-cuentas-2026:end>/.exec(html) || [''])[0];
  t.ok(bloque.length > 0, 'index.html trae el bloque HONORARIOS_CUENTAS_2026 entre las marcas begin/end');
  const filas = [...bloque.matchAll(/^\s*\["(\d{6})", "([^"]*)", "(H|CH)", "([A-Z ]+)"\],$/gm)].map(m => ({ codigo: m[1], nombre: m[2], libro: m[3], docs: m[4].split(' ') }));
  t.eq(filas.length, CATALOGO.cuentas.length, 'el bloque de index.html tiene tantas cuentas como el JSON');
  t.eq(filas.map(f => [f.codigo, f.nombre, f.libro === 'H' ? 'honorarios' : 'compras+honorarios', f.docs]),
    CATALOGO.cuentas.map(c => [c.codigo, c.nombre, c.libro, c.docs]), 'cada cuenta del bloque (código, nombre, libro y tipos) coincide con el JSON, en el mismo orden');
  t.eq(CATALOGO.tipos_honorarios.map(x => x.codigo), TIPOS_HON, 'el JSON declara los 5 tipos de honorarios en el orden del manual');
  t.eq(CATALOGO.tipos_honorarios.map(x => x.nombre), NOMBRES_HON, 'con los nombres que ya usaba el panel');

  // ============================================================ 2. contenido del catálogo
  const por = Object.fromEntries(CATALOGO.cuentas.map(c => [c.codigo, c]));
  t.eq(CATALOGO.cuentas.length, 36, 'son 36 cuentas: las 35 de la investigación previa + 411404 (su recuadro y la matriz del manual habilitan BOLH, BOLHE, BPST y BPSTE)');
  t.eq(CATALOGO.diferencias_con_el_spec, { solo_en_el_texto: ['411404'], solo_en_el_spec: [] }, 'la única diferencia con la lista del spec es 411404 (documentada en el JSON)');
  t.ok(!!por['411404'] && !!por['411404'].observacion, '411404 queda con su observación explicando por qué está');
  t.eq(CATALOGO.cuentas.filter(c => c.libro === 'honorarios').map(c => c.codigo), ['410803'], '410803 TALLERES EXTRAPROGRAMÁTICOS es la única cuenta cuyo libro es solo «Honorarios»');
  t.eq(por['411801'].docs, ['BHE'], '411801 acepta solo BHE (recuadro del manual págs. 109 y matriz pág. 124 revisada en imagen)');
  t.eq(por['410608'].docs, ['BOLH', 'BOLHE', 'BPST', 'BPSTE'], '410608 acepta todos menos BHE');
  t.eq(por['410801'].docs, ['BOLH', 'BHE', 'BPST', 'BPSTE'], '410801 acepta todos menos BOLHE');
  t.eq(por['410304'].docs, TIPOS_HON, '410304 OTROS GASTOS EN PERSONAL acepta los 5');
  t.eq(por['410309'].docs, TIPOS_HON, '410309 SALA CUNA acepta los 5');
  ['410304', '410309'].forEach(c => t.ok(!!por[c] && por[c].libro === 'compras+honorarios', `${c} está en el catálogo (libro «Compras y Otros Gastos – Honorarios»)`));
  const sinBhe = CATALOGO.cuentas.filter(c => !c.docs.includes('BHE')).map(c => c.codigo);
  t.eq(sinBhe.length, 18, '18 cuentas no aceptan BHE (410608, 410901, 410904, 410908, 410918, 411101, 411102, 411404, 4116xx, …)');
  const planGasto = Object.fromEntries(PLAN.cuentas.map(c => [c.codigo, c]));
  CATALOGO.cuentas.forEach(c => {
    const p = planGasto[c.codigo];
    if (!p) { t.ok(false, `${c.codigo} existe en el Plan de Cuentas 2026`); return; }
    const habil = Object.entries(p.subvenciones).filter(([, v]) => v).map(([k]) => k);
    if (p.nombre !== c.nombre || JSON.stringify(habil) !== JSON.stringify(c.subvenciones) || !habil.length) t.ok(false, `${c.codigo}: nombre y columnas del JSON coinciden con el Plan de Cuentas y hay al menos una`, { json: c.nombre, plan: p.nombre, habil, mio: c.subvenciones });
  });
  t.ok(true, 'las 36 cuentas existen en el Plan de Cuentas 2026 con el mismo nombre y las mismas columnas habilitadas');
  const sepCols = cuentasHabilitadas('sep');
  t.eq([sepCols.length, sepCols.filter(c => c.pertinencia.includes('sep')).length], [27, 24], 'en SEP son 27 las cuentas con honorarios (24 con ● sujeta a pertinencia)');
  t.ok(['410304', '410309', '410803'].every(c => sepCols.some(x => x.codigo === c)), 'SEP incluye 410304, 410309 y 410803');
  t.ok(['410908', '411101', '411102', '411103', '411605', '411801'].every(c => !sepCols.some(x => x.codigo === c)), 'SEP NO incluye cuentas que el plan no habilita para SEP (410908, 4111xx, 411605, 411801)');

  // ============================================================ 3. selectores del modal de SEP
  const h = await boot({ fixture: 'default' });
  const { page } = h;
  await clickTab(page, 'SEP');
  await abrirModalSep(h, '1121');
  const opciones = (sel) => page.evaluate((s) => Array.from(document.querySelector(s).options).map(o => ({ valor: o.value, texto: o.textContent.trim() })), sel);
  const SEL_CUENTA = '#modalBody .hon-form-grid select[data-field="codigo"]';
  const SEL_TIPO = '#modalBody .hon-form-grid select[data-field="tipoDocumento"]';
  const cuentas = (await opciones(SEL_CUENTA)).filter(o => o.valor);
  t.eq(cuentas.map(o => o.valor), sepCols.map(c => c.codigo), 'el selector «Cuenta de honorarios» lista exactamente las 27 cuentas del catálogo habilitadas para SEP, en el orden del manual');
  t.ok(cuentas.every(o => o.texto.startsWith(o.valor + ' · ')), 'cada opción se ve como «código · nombre»');
  t.ok(cuentas.find(o => o.valor === '410803').texto.includes('solo honorarios'), '410803 se rotula «(solo honorarios)»');
  t.eq((await opciones(SEL_TIPO)).filter(o => o.valor).map(o => o.valor), TIPOS_HON, 'sin cuenta elegida el selector de tipo ofrece los 5 tipos de honorarios (y ningún otro)');
  t.eq((await opciones(SEL_TIPO)).filter(o => o.valor).map(o => o.texto.replace(/ \([A-Z]+\)$/, '')), NOMBRES_HON, 'con su nombre completo');
  for (const [cuenta, esperados] of [['410608', ['BOLH', 'BOLHE', 'BPST', 'BPSTE']], ['410803', TIPOS_HON], ['410801', ['BOLH', 'BHE', 'BPST', 'BPSTE']], ['410904', ['BOLH', 'BOLHE', 'BPST', 'BPSTE']], ['411404', ['BOLH', 'BOLHE', 'BPST', 'BPSTE']]]) {
    await page.selectOption(SEL_CUENTA, cuenta);
    t.eq((await opciones(SEL_TIPO)).filter(o => o.valor).map(o => o.valor), esperados, `con la cuenta ${cuenta} el selector de tipo solo ofrece lo que esa cuenta acepta`);
  }
  await page.selectOption(SEL_CUENTA, '410803');
  await page.selectOption(SEL_TIPO, 'BHE');
  await page.selectOption(SEL_CUENTA, '410904'); // 410904 no acepta BHE: el tipo elegido se descarta
  t.eq(await page.inputValue(SEL_TIPO), '', 'al cambiar a una cuenta que no acepta el tipo elegido, el tipo se limpia');
  await page.selectOption(SEL_CUENTA, '410803');
  await page.selectOption(SEL_TIPO, 'BPST');
  await page.selectOption(SEL_CUENTA, '410304'); // 410304 sí acepta BPST: se conserva
  t.eq(await page.inputValue(SEL_TIPO), 'BPST', 'si la nueva cuenta sí acepta el tipo elegido, se conserva');
  t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('#modalBody .hon-form-grid label')).map(l => l.querySelector('.compra-field-label').textContent.trim())),
    ['Cuenta de honorarios', 'Tipo de documento (honorarios)', 'N° boleta', 'Fecha boleta', 'Fecha pago de la boleta', 'Descripción de la boleta', 'RUT del prestador', 'Nombre del prestador', 'Monto gasto de la boleta', 'Monto documento de la boleta', 'N° DC de la boleta'],
    'el formulario trae las columnas A–L del Libro de Honorarios (sin RBD ni subvención, que son el contexto) y el N° DC');
  t.ok(await page.evaluate(() => /27 cuentas aceptan documentos de honorarios de 36 \(24 sujetas a exigencias de pertinencia/.test(document.querySelector('#modalBody .hon-section').innerText)), 'una nota dice cuántas cuentas aceptan honorarios en SEP');

  // ============================================================ 4. compras: sin los 5 tipos de honorarios
  const opcionesCompras = (await opciones('#modalBody .compra-form-grid select[data-field="tipoDocumento"]')).filter(o => o.valor).map(o => o.valor);
  t.eq(opcionesCompras, TIPOS_COMPRAS_ESPERADOS, 'SEP: el selector «Tipo de documento» de compras ya no trae los 5 tipos de honorarios (quedan los 13 del Cap. III)');
  t.ok(opcionesCompras.every(o => !NOMBRES_HON.includes(o)), 'SEP: ningún nombre de honorarios en el selector de compras');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  await abrirModalFuente(h, 'general', '1121');
  const opcionesFuente = (await opciones('#otrasFuentesModalBody .compra-form-grid select[data-field="tipoDocumento"]')).filter(o => o.valor).map(o => o.valor);
  t.eq(opcionesFuente, TIPOS_COMPRAS_ESPERADOS, 'General: el selector «Tipo de documento» de compras tampoco trae los de honorarios');
  t.noErrores(h);
  await h.close();
});
