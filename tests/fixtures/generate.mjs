// Generador reproducible del fixture determinista (tests/fixtures/default.json).
//   node tests/fixtures/generate.mjs            -> escribe default.json
//   node tests/fixtures/generate.mjs --check    -> verifica que default.json coincide con lo que generaría (sin escribir)
//
// Entradas: tests/fixtures/rbds.json (ids/nombres públicos de los 55 RBD de DATA.registros y los 13 GESPARVU).
// Las CIFRAS son sintéticas (PRNG con semilla fija por entidad): no hay montos reales de ningún RBD.
//
// Forma de los documentos (colección sep_carga_rbd, un doc por RBD / "AC" / GESPARVU / "_meta"), tal como los
// lee aplicarSnapshot() de index.html:
//   { rbd, nombre,
//     ingreso_items: { "<item>": { item, meses:{ENERO..DICIEMBRE}, total } },       // Preferente / Prioritario / Carrera Docente
//     rem: { meses, total, real_hasta_mes },
//     bys_proyeccion: { items: { "<codigo SEP>": { meses, total } } },
//     compras: { "<id>": { codigo, tipoDocumento, nroDocumento, fechaDocumento, fechaPago, descripcion,
//                          rutProveedor, nombreProveedor, montoGasto, montoDocumento, documentoOriginal, documentoContable? } },
//     otras_fuentes: { general|pie|mantenimiento|prorretencion: { ingreso, gasto_rem, compras, bys_proy_items, real_hasta_mes },
//                      faep|figa|aporte_educ:               { ingreso, gasto_rem, bys_items, real_hasta_mes },
//                      junji:                               { ingreso_operacion, ingreso_homologacion, ingreso_carrera_docente, gasto_rem, bys_items, real_hasta_mes },
//                      aporte_junji:                        { ingreso, gasto_rem, bys_items, real_hasta_mes } },
//     lastModifiedBy, lastModifiedAt: {__ts: ms} }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, 'default.json');
const { n_meses: N_MESES, registros, gesparvu } = JSON.parse(fs.readFileSync(path.join(AQUI, 'rbds.json'), 'utf8'));

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// ---------- PRNG determinista ----------
function hash(str) { let h = 2166136261 >>> 0; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function prng(seedStr) {
  let s = hash(seedStr) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const redondeaMiles = (n) => Math.round(n / 1000) * 1000;

// ---------- catálogos usados (códigos de cuenta VÁLIDOS según PLAN_CUENTAS_2026 de index.html) ----------
const TIPOS_DOC = ['Boleta', 'Boleta exenta', 'Boleta electrónica', 'Factura', 'Factura electrónica', 'Factura exenta electrónica', 'Boleta de honorarios electrónica', 'Documento extranjero', 'Nota de crédito', 'Nota de débito'];
// SEP: CUENTAS_SEP_22 / CUENTAS_SEP_29 (estos 3 últimos son Subt.29).
const CODIGOS_SEP = ['410605', '410606', '410904', '410906', '411601', '411701', '410501', '410703', '410707', '411802'];
// Otras fuentes con compras: columna del Plan de Cuentas que rige a la entidad (general / pie / mantenimiento / proretencion /
// adm_central_general para la fila AC de Subv. General). OK = habilitada (x), PERT = habilitada sujeta a pertinencia (R),
// NO = NO habilitada (provoca la marca ⚠ en el registro).
const CODIGOS_FUENTE = {
  general: { OK: ['410502', '410503', '410601', '410602', '410603', '410604'], PERT: [], NO: ['410501'] },
  general_ac: { OK: ['410502', '410503', '410703', '410901', '410902', '410903'], PERT: [], NO: ['410501'] },
  pie: { OK: ['410917', '411501', '411504', '411610'], PERT: ['410502', '410503', '410601'], NO: ['410501'] },
  mantenimiento: { OK: ['410601', '410602', '410603', '410604', '410701', '410702'], PERT: [], NO: ['410501'] },
  prorretencion: { OK: ['410503', '410601', '410602', '410603', '410604', '410605'], PERT: ['410804', '410901', '410904'], NO: ['410501'] },
};
const FUENTES_COMPRAS = ['general', 'pie', 'mantenimiento', 'prorretencion'];
const FUENTES_CONCEPTO = ['faep', 'figa', 'aporte_educ'];
const CONCEPTOS = ['Alimentación', 'Material didáctico', 'Servicios básicos', 'Mantención menor', 'Transporte escolar', 'Seguros & garantías'];
const EMAILS = ['wilson.rojas@sleppetorca.gob.cl', 'catalina.brito@sleppetorca.gob.cl', 'juan.bustamante@sleppetorca.gob.cl', 'marcela.ortega@sleppetorca.gob.cl'];
const PROVEEDORES = [
  ['76.123.456-7', 'Librería Central Ltda.'], ['77.654.321-K', 'Comercial Los Andes SpA'], ['96.555.444-3', 'Servicios Integrales Petorca'],
  ['78.901.234-5', 'Ferretería El Roble'], ['76.222.333-1', 'Distribuidora Valle del Aconcagua'], ['12.345.678-5', 'Juan Pérez Soto'],
];

// ---------- helpers de forma ----------
function meses12(valores /* array de 12 o función */) {
  const m = {};
  MESES.forEach((k, i) => { m[k] = Math.round(typeof valores === 'function' ? valores(i) : (valores[i] || 0)); });
  return m;
}
const suma = (m) => Object.values(m).reduce((a, b) => a + b, 0);
function linea(valoresFn) { const meses = meses12(valoresFn); return { meses, total: suma(meses) }; }
// 7 meses reales con ruido + agosto-diciembre = promedio de los reales (igual que la siembra de index.html).
function serieConProyeccion(base, rnd) {
  const reales = Array.from({ length: N_MESES }, () => redondeaMiles(base * (0.85 + rnd() * 0.3)));
  const prom = Math.round(reales.reduce((a, b) => a + b, 0) / N_MESES);
  return MESES.map((_, i) => (i < N_MESES ? reales[i] : prom));
}
function ts(seed) {
  const r = prng('ts:' + seed)();
  // entre 2026-08-01T12:00Z y 2026-08-18T21:00Z
  return { __ts: Date.UTC(2026, 7, 1, 12, 0, 0) + Math.floor(r * 17.375 * 86400 * 1000 / 60000) * 60000 };
}
function pad2(n) { return String(n).padStart(2, '0'); }
function fechaDoc(rnd) { return `2026-${pad2(1 + Math.floor(rnd() * N_MESES))}-${pad2(1 + Math.floor(rnd() * 28))}`; }
function fechaMas(f, dias) { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); }

function compraAleatoria(rnd, codigos, idx, extra = {}) {
  const codigo = codigos[Math.floor(rnd() * codigos.length)];
  const tipo = TIPOS_DOC[Math.floor(rnd() * TIPOS_DOC.length)];
  const [rut, nombreProv] = PROVEEDORES[Math.floor(rnd() * PROVEEDORES.length)];
  const monto = redondeaMiles(30000 + rnd() * 2200000);
  const f = fechaDoc(rnd);
  return {
    codigo, tipoDocumento: tipo, nroDocumento: String(1000 + Math.floor(rnd() * 8999)),
    fechaDocumento: f, fechaPago: fechaMas(f, 5 + Math.floor(rnd() * 20)),
    descripcion: `Gasto de prueba ${idx}`, rutProveedor: rut, nombreProveedor: nombreProv,
    montoGasto: tipo === 'Nota de crédito' ? -Math.round(monto / 4) : monto,
    montoDocumento: tipo === 'Nota de crédito' ? -Math.round(monto / 4) : Math.round(monto * 1.19),
    documentoOriginal: `DOC-${idx}`,
    ...extra,
  };
}

// ---------- construcción de documentos ----------
const docs = {};
const idxDe = {}; registros.forEach((r, i) => { idxDe[r.rbd] = i; });

function otrasFuentesDe(rbd, rnd, k, esAC) {
  const of = {};
  const incluye = (sIdx) => esAC || rbd === '1121' || ((k + sIdx) % 4 === 0);
  FUENTES_COMPRAS.forEach((key, sIdx) => {
    if (!incluye(sIdx)) return;
    const col = (key === 'general' && esAC) ? 'general_ac' : key;
    const cat = CODIGOS_FUENTE[col];
    const base = esAC ? 40000000 : 3000000 + rnd() * 9000000;
    const compras = {};
    const n = esAC ? 4 : 1 + (k % 3);
    for (let n1 = 0; n1 < n; n1++) {
      const pool = n1 === 0 && cat.PERT.length ? cat.PERT : cat.OK; // una compra "sujeta a pertinencia" cuando existe
      compras[`o${key[0]}${key[1]}_${rbd}_${n1 + 1}`] = compraAleatoria(rnd, pool, `${key}-${rbd}-${n1 + 1}`);
    }
    // Una compra con cuenta NO habilitada (⚠) en el AC de cada fuente y en el 1121 de Mantención
    if (esAC || (rbd === '1121' && key === 'mantenimiento')) {
      compras[`o${key[0]}${key[1]}_${rbd}_noh`] = compraAleatoria(rnd, cat.NO, `${key}-${rbd}-noh`, { descripcion: 'Cuenta no habilitada para la subvención', tipoDocumento: 'Factura' });
    }
    of[key] = {
      ingreso: linea(serieConProyeccion(base, rnd)),
      gasto_rem: linea(serieConProyeccion(base * (key === 'mantenimiento' ? 0 : 0.35), rnd)),
      compras,
      bys_proy_items: { [CONCEPTOS[(k + sIdx) % CONCEPTOS.length]]: { concepto: CONCEPTOS[(k + sIdx) % CONCEPTOS.length], ...linea(i => (i >= N_MESES ? redondeaMiles(base * 0.05) : 0)) } },
      real_hasta_mes: [7, 5, 12, 7][(k + sIdx) % 4],
    };
  });
  FUENTES_CONCEPTO.forEach((key, sIdx) => {
    if (!incluye(sIdx + 4)) return;
    const base = esAC ? 25000000 : 1500000 + rnd() * 6000000;
    const bys_items = {};
    for (let c = 0; c < 2; c++) {
      const concepto = CONCEPTOS[(k + sIdx + c * 2) % CONCEPTOS.length];
      bys_items[concepto] = { concepto, ...linea(serieConProyeccion(base * 0.2, rnd)) };
    }
    of[key] = {
      ingreso: linea(serieConProyeccion(base, rnd)),
      gasto_rem: linea(serieConProyeccion(base * 0.4, rnd)),
      bys_items,
      real_hasta_mes: [7, 12, 6][(k + sIdx) % 3],
    };
  });
  return of;
}

registros.forEach((r, k) => {
  const rnd = prng('rbd:' + r.rbd);
  const doc = { rbd: r.rbd, nombre: r.nombre };
  const sinMarco = !!r.sin_marco_sep;
  // Escala del ingreso mensual: entre ~0,5 y ~30 millones, con cola (algunos RBD grandes).
  const escala = Math.round(900000 + Math.pow(rnd(), 2.2) * 28000000);

  if (!sinMarco) {
    const ing = {};
    const pref = serieConProyeccion(escala * 0.09, rnd);
    const prio = serieConProyeccion(escala * 0.91, rnd);
    const carrera = (k % 7 === 0) ? MESES.map((_, i) => (i < 4 ? 0 : redondeaMiles(escala * 0.12))) : new Array(12).fill(0);
    [['Ingreso SEP Preferente', pref], ['Ingreso SEP Prioritario', prio], ['Carrera Docente', carrera]].forEach(([item, vals]) => {
      const meses = meses12(vals);
      ing[item] = { item, meses, total: suma(meses) };
    });
    doc.ingreso_items = ing;
    // Remuneraciones: fracción del ingreso mensual*0.70 que recorre déficit / riesgo / superávit.
    const factor = [0.25, 0.55, 0.9, 1.15, 1.35, 0.7, 1.02][k % 7];
    const rem = serieConProyeccion(escala * 0.7 * factor, rnd);
    if (k % 6 === 5) { doc.rem = { meses: meses12(i => (i < 4 ? rem[i] : 0)), total: 0, real_hasta_mes: 4 }; doc.rem.total = suma(doc.rem.meses); }
    else {
      const m = meses12(rem);
      doc.rem = { meses: m, total: suma(m), real_hasta_mes: [7, 7, 12, 5, 7, 7, 6][k % 7] };
    }
    if (r.rbd === '1128') doc.rem.real_hasta_mes = 5;
    if (r.rbd === '1123') doc.rem.real_hasta_mes = 12;
    // Remuneraciones sin real_hasta_mes (el panel usa DATA.n_meses por defecto)
    if (k === 9) delete doc.rem.real_hasta_mes;

    // Proyección de B&S por ítem
    const items = {};
    if (k % 2 === 0) {
      const cods = k % 4 === 0 ? ['410605', '410904'] : ['411601'];
      cods.forEach((codigo, j) => {
        const meses = meses12(i => (i >= N_MESES ? redondeaMiles(escala * (0.05 + 0.02 * j)) : 0));
        items[codigo] = { meses, total: suma(meses) };
      });
    }
    doc.bys_proyeccion = { items };
  } else {
    doc.ingreso_items = {};
    doc.rem = { meses: {}, total: 0, real_hasta_mes: N_MESES };
    doc.bys_proyeccion = { items: {} };
  }

  // Compras SEP (Subt.22/29). El RBD sin marco 1120 registra una compra => alerta "gasto SEP sin marco".
  const compras = {};
  if (!sinMarco ? (k % 3 !== 0 || r.rbd === '1121') : r.rbd === '1120') {
    const n = r.rbd === '1121' ? 5 : (sinMarco ? 1 : 1 + (k % 4));
    for (let c = 0; c < n; c++) compras[`c${r.rbd}_${c + 1}`] = compraAleatoria(rnd, CODIGOS_SEP, `${r.rbd}-${c + 1}`);
  }
  if (r.rbd === '1121') {
    // Caso especial: caracteres HTML/CSV peligrosos en descripción, proveedor y documento original.
    compras.c1121_especial = {
      codigo: '410606', tipoDocumento: 'Factura', nroDocumento: 'A&B-<7>', fechaDocumento: '2026-03-15', fechaPago: '2026-03-30',
      descripcion: 'Libros "Lenguaje" & <b>Matemática</b>; O\'Higgins, 2° ciclo', rutProveedor: '76.000.111-2',
      nombreProveedor: 'Editorial "El Tío" & Hijos <Ltda>', montoGasto: 1234567, montoDocumento: 1469135,
      documentoOriginal: "Folio <123> & 'A'; \"B\"",
    };
    // Nota de crédito explícita (monto negativo) y un mismo código con dos documentos en el mismo mes.
    compras.c1121_nc = compraAleatoria(rnd, ['410606'], '1121-nc', { tipoDocumento: 'Nota de crédito', fechaDocumento: '2026-03-20', fechaPago: '2026-03-25', montoGasto: -200000, montoDocumento: -238000, descripcion: 'Anula parte de la compra de libros' });
    compras.c1121_mismo_mes = compraAleatoria(rnd, ['410606'], '1121-mm', { fechaDocumento: '2026-03-05', fechaPago: '2026-03-10', montoGasto: 450000, montoDocumento: 535500 });
  }
  doc.compras = compras;

  const esRico = r.rbd === '1121' || (k % 4 === 1);
  doc.otras_fuentes = esRico ? otrasFuentesDe(r.rbd, prng('of:' + r.rbd), k, false) : {};
  doc.lastModifiedBy = EMAILS[k % EMAILS.length];
  doc.lastModifiedAt = ts(r.rbd);
  docs[r.rbd] = doc;
});

// Administración Central ("AC"): participa solo de las fuentes rbd_ac (no de SEP).
{
  const rnd = prng('of:AC');
  docs.AC = {
    rbd: 'AC', nombre: 'Administración Central',
    otras_fuentes: otrasFuentesDe('AC', rnd, 0, true),
    lastModifiedBy: EMAILS[1], lastModifiedAt: ts('AC'),
  };
}

// GESPARVU (jardines JUNJI): junji (3 ingresos) y aporte_junji.
gesparvu.forEach((g, k) => {
  const rnd = prng('g:' + g.rbd);
  const base = 2500000 + rnd() * 5000000;
  const of = {};
  if (k % 5 !== 4) { // 3 de cada 15 sin datos de JUNJI
    const bys_items = {};
    for (let c = 0; c < 2; c++) { const concepto = CONCEPTOS[(k + c * 3) % CONCEPTOS.length]; bys_items[concepto] = { concepto, ...linea(serieConProyeccion(base * 0.12, rnd)) }; }
    of.junji = {
      ingreso_operacion: linea(serieConProyeccion(base * 0.5, rnd)),
      ingreso_homologacion: linea(serieConProyeccion(base * 0.3, rnd)),
      ingreso_carrera_docente: linea(serieConProyeccion(base * 0.2, rnd)),
      gasto_rem: linea(serieConProyeccion(base * [0.55, 0.9, 1.2][k % 3], rnd)),
      bys_items,
      real_hasta_mes: [7, 6, 12][k % 3],
    };
  }
  if (k % 3 === 0) {
    of.aporte_junji = {
      ingreso: linea(serieConProyeccion(base * 0.2, rnd)),
      gasto_rem: linea(serieConProyeccion(base * 0.15, rnd)),
      bys_items: { 'Alimentación': { concepto: 'Alimentación', ...linea(serieConProyeccion(base * 0.03, rnd)) } },
      real_hasta_mes: 7,
    };
  }
  docs[g.rbd] = { rbd: g.rbd, nombre: g.nombre, otras_fuentes: of, lastModifiedBy: EMAILS[k % EMAILS.length], lastModifiedAt: ts(g.rbd) };
});

// N° DC (Documento Contable interno): casos para el golden master y los specs. Se reescriben compras que YA existen (no se agrega
// ninguna ni se consumen números aleatorios), así que montos, totales, fechas y tipos de documento de todo el fixture quedan igual.
//   · DC legado en "Doc. original" (sin documentoContable): se muestra derivado y es lo que migra el botón "Migrar DC" (5 compras).
//   · documentoContable propio (con "Doc. original" vacío), incluida una con caracteres peligrosos.
{
  const sep = docs['1121'].compras;
  sep.c1121_3.documentoOriginal = 'DC_344';
  sep.c1121_4.documentoOriginal = 'DC_22 - No hay PME';
  sep.c1121_mismo_mes.documentoOriginal = 'DC-33';
  sep.c1121_5.documentoOriginal = ''; sep.c1121_5.documentoContable = 'DC_501';
  sep.c1121_especial.documentoContable = "DC_<9> & 'Z'; \"Q\"";
  const of1121 = docs['1121'].otras_fuentes;
  of1121.general.compras.oge_1121_1.documentoOriginal = 'DC_77';
  of1121.pie.compras.opi_1121_1.documentoOriginal = ''; of1121.pie.compras.opi_1121_1.documentoContable = 'DC_88';
  const ac = docs.AC.otras_fuentes.general.compras;
  ac.oge_AC_1.documentoOriginal = ''; ac.oge_AC_1.documentoContable = 'DC_900';
  ac.oge_AC_3.documentoOriginal = 'DC_12 - carpeta azul';
}

// Documento "_meta" (herencia de versiones anteriores del panel): debe ser ignorado por aplicarSnapshot.
docs._meta = { items_22: [], items_29: [], lastModifiedBy: EMAILS[0], lastModifiedAt: ts('_meta') };

// ---------- salida ----------
const ids = Object.keys(docs).sort();
const lineas = ids.map(id => ` ${JSON.stringify(id)}: ${JSON.stringify(docs[id])}`);
const meta = {
  generado_por: 'tests/fixtures/generate.mjs',
  nota: 'Fixture sintético determinista (PRNG con semilla fija). No contiene cifras reales.',
  n_documentos: ids.length, n_rbd: registros.length, n_gesparvu: gesparvu.length,
};
const salida = `{\n"meta": ${JSON.stringify(meta)},\n"docs": {\n${lineas.join(',\n')}\n}\n}\n`;

if (process.argv.includes('--check')) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : '';
  if (actual !== salida) { console.error('default.json NO coincide con lo que genera generate.mjs (regenerar con: node tests/fixtures/generate.mjs)'); process.exit(1); }
  console.log(`default.json OK (${ids.length} documentos)`);
} else {
  fs.writeFileSync(SALIDA, salida);
  console.log(`Escrito ${path.relative(process.cwd(), SALIDA)}: ${ids.length} documentos, ${(salida.length / 1024).toFixed(0)} KB`);
}
