// modal_equivalencia — el reconciliador de los modales (morphContenedor) debe dejar EXACTAMENTE lo mismo que una reconstrucción
// completa: tras una secuencia aleatoria (pero fija: semilla) de cambios remotos —altas y bajas de compras, boletas de honorarios, ítems y conceptos,
// cambios de montos y del corte "Real hasta"— el modal abierto y el modal cerrado y vuelto a abrir (construcción desde cero) tienen
// la misma estructura, los mismos textos, los mismos atributos y los mismos valores en celdas y selectores.
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// Firma estructural del contenido de un modal (sin los formularios de compra ni de honorarios, que no se reconcilian y parten vacíos en ambos casos).
const FIRMA = (sel) => {
  const raiz = document.querySelector(sel);
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) out.push('T:' + t); return; }
    if (n.nodeType !== 1) return;
    const attrs = Array.from(n.attributes).filter(a => !(n.tagName === 'INPUT' && a.name === 'value') && !['title', 'aria-invalid', 'style'].includes(a.name)).map(a => a.name + '=' + a.value).sort().join(';');
    out.push('<' + n.tagName + (attrs ? ' ' + attrs : '') + ((n.tagName === 'INPUT' || n.tagName === 'SELECT') && !n.closest('.compra-form-grid, .hon-form-grid') ? ' val=' + n.value : '') + '>');
    n.childNodes.forEach(walk);
    out.push('</' + n.tagName + '>');
  };
  walk(raiz);
  return out;
};
const primeraDiferencia = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `línea ${i}: «${a[i]}» ≠ «${b[i]}»`; return null; };

await correrSpec('modal_equivalencia', async (t) => {
  const h = await boot({ fixture: 'default' });
  const { page } = h;
  const rnd = prng(20260821);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const meses0 = (v = 0) => `{ ${MESES.map(m => `${m}: ${v}`).join(', ')} }`;
  const compra = (n) => `{ codigo: '410605', tipoDocumento: 'Factura', nroDocumento: 'F-${n}', fechaDocumento: '2026-0${1 + (n % 9)}-1${n % 9}', fechaPago: '', descripcion: 'Compra ${n} <b>&</b> "q"', rutProveedor: '', nombreProveedor: 'Prov ${n}', montoGasto: ${1000 * (n + 1)}, montoDocumento: ${1000 * (n + 1)}, documentoOriginal: '' }`;
  let fallas = 0;
  const comparar = async (sel, reabrir, etiqueta) => {
    await h.waitIdle();
    const A = await page.evaluate(FIRMA, sel);
    await reabrir();
    const B = await page.evaluate(FIRMA, sel);
    const d = primeraDiferencia(A, B);
    if (d) { fallas++; t.ok(false, `${etiqueta}: el modal reconciliado difiere del reconstruido desde cero — ${d}`); }
    return !d;
  };

  // ============================================================ SEP (RBD 1121: compras + proyección + ingresos)
  await clickTab(page, 'SEP');
  const abrirSep = async () => { await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]'); await h.waitIdle(); };
  const reabrirSep = async () => { await page.keyboard.press('Escape'); await h.waitIdle(); await abrirSep(); };
  await abrirSep();
  let ok = 0;
  const PASOS_SEP = 40;
  for (let i = 0; i < PASOS_SEP; i++) {
    const op = pick(['addCompra', 'delCompra', 'editCompra', 'addBys', 'delBys', 'ingreso', 'rem', 'corte', 'addHon', 'delHon', 'editHon', 'addHonProy', 'delHonProy', 'editHonProy']);
    const n = Math.floor(rnd() * 1000);
    const codigo = pick(['410605', '410904', '411601']);
    const mes = pick(MESES);
    const cuerpo = {
      addCompra: `d.compras = d.compras || {}; d.compras['cA${n}'] = ${compra(n)};`,
      delCompra: `const ids = Object.keys(d.compras || {}); if (ids.length > 2) delete d.compras[ids[${n} % ids.length]];`,
      editCompra: `const ids = Object.keys(d.compras || {}); if (ids.length) d.compras[ids[${n} % ids.length]].descripcion = 'Editada ${n} & <i>';`,
      addBys: `d.bys_proyeccion = d.bys_proyeccion || {}; d.bys_proyeccion.items = d.bys_proyeccion.items || {}; d.bys_proyeccion.items['${codigo}'] = { meses: ${meses0(n)}, total: 0 };`,
      delBys: `if (d.bys_proyeccion && d.bys_proyeccion.items) delete d.bys_proyeccion.items['${codigo}'];`,
      ingreso: `d.ingreso_items['Carrera Docente'].meses.${mes} = ${n * 7};`,
      rem: `d.rem.meses.${mes} = ${n * 13};`,
      corte: `d.rem.real_hasta_mes = ${1 + (n % 12)};`,
      // Honorarios (Subt. 21): boletas por id y proyección por cuenta (incluye cuentas del catálogo y una fuera de él, textos con & < > ")
      addHon: `d.honorarios = d.honorarios || {}; d.honorarios['hA${n}'] = { codigo: '${pick(['410803', '410304', '411601', '999999'])}', tipoDocumento: '${pick(['BOLHE', 'BOLH', 'BPST', 'FAC'])}', nroDocumento: 'B-${n}', fechaDocumento: '2026-0${1 + (n % 9)}-1${n % 9}', fechaPago: '2026-0${1 + (n % 9)}-2${n % 9}', descripcion: 'Boleta ${n} <b>&</b> "q"', rutProveedor: '1-9', nombreProveedor: 'Prest ${n}', montoGasto: ${1000 + n}, montoDocumento: ${1000 + n}, documentoContable: 'DC_${n}' };`,
      delHon: `const ids = Object.keys(d.honorarios || {}); if (ids.length) delete d.honorarios[ids[${n} % ids.length]];`,
      editHon: `const ids = Object.keys(d.honorarios || {}); if (ids.length) d.honorarios[ids[${n} % ids.length]].descripcion = 'Editada ${n} & <i>';`,
      addHonProy: `d.hon_proyeccion = d.hon_proyeccion || {}; d.hon_proyeccion.items = d.hon_proyeccion.items || {}; d.hon_proyeccion.items['${pick(['410803', '410304', '410501'])}'] = { meses: ${meses0(n)}, total: 0 };`,
      delHonProy: `if (d.hon_proyeccion && d.hon_proyeccion.items) delete d.hon_proyeccion.items['${pick(['410803', '410304', '410501'])}'];`,
      editHonProy: `const ks = Object.keys((d.hon_proyeccion && d.hon_proyeccion.items) || {}); if (ks.length) d.hon_proyeccion.items[ks[${n} % ks.length]].meses.${mes} = ${n * 5};`,
    }[op];
    await h.remoto('1121', cuerpo);
    if (await comparar('#modalBody', reabrirSep, `SEP paso ${i} (${op})`)) ok++;
  }
  t.eq(ok, PASOS_SEP, `SEP: tras ${PASOS_SEP} cambios remotos aleatorios (compras, boletas de honorarios, proyecciones, ingresos y cortes) el modal reconciliado es idéntico al reconstruido desde cero`);
  await page.keyboard.press('Escape'); await h.waitIdle();

  // ============================================================ Fuentes: General (compras + proyección por concepto) y FAEP (conceptos)
  for (const [fuente, ops] of [['general', ['addCompra', 'delCompra', 'editCompra', 'addConc', 'delConc', 'ingreso', 'rem', 'corte']], ['faep', ['addConc', 'delConc', 'editConc', 'ingreso', 'rem', 'corte']]]) {
    await clickTab(page, 'of-' + fuente);
    const abrir = async () => { await page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="1121"]`); await h.waitIdle(); };
    const reabrir = async () => { await page.keyboard.press('Escape'); await h.waitIdle(); await abrir(); };
    await abrir();
    let okF = 0;
    const lista = fuente === 'general' ? 'bys_proy_items' : 'bys_items';
    for (let i = 0; i < 24; i++) {
      const op = pick(ops);
      const n = Math.floor(rnd() * 1000);
      const conc = pick(['Alimentación', 'Agua/Luz', 'A&B <x>', 'Con "comillas"', 'Traslado ñandú']);
      const mes = pick(MESES);
      const cuerpo = {
        addCompra: `const c = d.otras_fuentes.${fuente}.compras = d.otras_fuentes.${fuente}.compras || {}; c['cA${n}'] = ${compra(n)};`,
        delCompra: `const c = d.otras_fuentes.${fuente}.compras || {}; const ids = Object.keys(c); if (ids.length > 1) delete c[ids[${n} % ids.length]];`,
        editCompra: `const c = d.otras_fuentes.${fuente}.compras || {}; const ids = Object.keys(c); if (ids.length) c[ids[${n} % ids.length]].descripcion = 'Editada ${n} & <i>';`,
        addConc: `const l = d.otras_fuentes.${fuente}.${lista} = d.otras_fuentes.${fuente}.${lista} || {}; l[${JSON.stringify(conc)}] = { concepto: ${JSON.stringify(conc)}, meses: ${meses0(n)}, total: 0 };`,
        delConc: `const l = d.otras_fuentes.${fuente}.${lista} || {}; delete l[${JSON.stringify(conc)}];`,
        editConc: `const l = d.otras_fuentes.${fuente}.${lista} || {}; const ks = Object.keys(l); if (ks.length) l[ks[${n} % ks.length]].meses.${mes} = ${n * 3};`,
        ingreso: `d.otras_fuentes.${fuente}.ingreso.meses.${mes} = ${n * 7};`,
        rem: `d.otras_fuentes.${fuente}.gasto_rem.meses.${mes} = ${n * 13};`,
        corte: `d.otras_fuentes.${fuente}.real_hasta_mes = ${1 + (n % 12)};`,
      }[op];
      await h.remoto('1121', cuerpo);
      if (await comparar('#otrasFuentesModalBody', reabrir, `${fuente} paso ${i} (${op})`)) okF++;
    }
    t.eq(okF, 24, `${fuente}: tras 24 cambios remotos aleatorios el modal reconciliado es idéntico al reconstruido desde cero`);
    await page.keyboard.press('Escape'); await h.waitIdle();
  }
  t.noErrores(h);
  await h.close();
}, { modoBug: 'enforced' });
