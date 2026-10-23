// Generador reproducible de los fixtures deterministas (tests/fixtures/default.json, cierre.json, compras.json y estado.json).
//   node tests/fixtures/generate.mjs            -> escribe default.json y cierre.json
//   node tests/fixtures/generate.mjs --check    -> verifica que ambos coinciden con lo que generaría (sin escribir)
//
//   default.json  el fixture de siempre. Su `_meta` NO trae mes de cierre y ningún RBD trae `ingreso_real_hasta_mes`: es el "estado inicial" en que el panel
//                 tiene que verse exactamente como antes de existir el corte de ingresos (los ingresos de SEP son reales hasta DATA.n_meses = julio).
//   cierre.json   default + mes de cierre global definido (septiembre) y cortes propios, para el golden master y los specs del corte de ingresos
//                 (ver más abajo). Los MONTOS son los mismos que los de default.json: solo cambian los cortes Real/Proyectado.
//   compras.json  default + casos de la PR de corrección de compras (L-03 signo de notas de crédito/débito, F-11/L-05 avisos de fecha y de cuenta, L-14 ID "0"):
//                 compras AGREGADAS al final (sin consumir números aleatorios), así que todo lo que ya traía default.json queda igual.
//
//   estado.json   default + casos de borde del Estado de las entidades (PR D2: L-07 Estado único sin redondear, L-08 JUNJI): saldo exactamente 0, 99,996 %, saldo -$1,
//                 89,999 % vs 90,000 %, recurso 0 con y sin gasto, Carrera Docente en el recurso, y GESPARVU de JUNJI con el saldo de Operación para B&S negativo.
//                 Reescribe SOLO los RBD / entidades que nombra (ver más abajo); el resto queda igual que en default.json.
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

// Documento "_meta" (herencia de versiones anteriores del panel): trae items_22/items_29 (que el panel ignora) y, desde el corte de ingresos, puede
// traer el mes de cierre global (mes_cierre / mes_cierre_por / mes_cierre_en). En default.json NO lo trae: el panel arranca "sin definir".
docs._meta = { items_22: [], items_29: [], lastModifiedBy: EMAILS[0], lastModifiedAt: ts('_meta') };

// ---------- variante "cierre": mes de cierre definido + cortes propios (los montos no cambian) ----------
// Imita el estado de uso real después de pulsar "Aplicar a todas las entidades" con septiembre y de que alguien haya movido unos pocos cortes:
//   · _meta.mes_cierre = 9 (septiembre), fijado por EMAILS[0] el 20/10/2026 14:30 UTC;
//   · TODAS las remuneraciones de SEP y TODOS los "Real hasta" de las 9 fuentes (cada entidad en las fuentes de su universo) en 9, salvo 3 RBD de
//     Remuneraciones (1121 → 7, 1123 → 12, 1128 → 5) y 3 entidades de fuentes (General/1121 → 7, FAEP/AC → 12, JUNJI/5402002 → 6);
//   · ingreso_real_hasta_mes propio en 3 RBD: 1121 → 8 (distinto del cierre), 1122 → 9 (igual al cierre) y 1123 → 12 (distinto); los demás no lo traen
//     (siguen al mes de cierre).
// Así el aviso "entidades con corte distinto al cierre global" lista 8 filas (2 de ingresos, 3 de remuneraciones y 3 de fuentes).
const docsCierre = JSON.parse(JSON.stringify(docs));
{
  const KEYS_RBD_AC = ['general', 'pie', 'mantenimiento', 'prorretencion', 'faep', 'figa', 'aporte_educ'];
  const KEYS_GESPARVU = ['junji', 'aporte_junji'];
  const fijaFuentes = (id, keys) => {
    const d = docsCierre[id];
    d.otras_fuentes = d.otras_fuentes || {};
    keys.forEach(k => { d.otras_fuentes[k] = { ...(d.otras_fuentes[k] || {}), real_hasta_mes: 9 }; }); // como queda un documento tras "Aplicar a todas"
  };
  registros.forEach(r => { fijaFuentes(r.rbd, KEYS_RBD_AC); if (docsCierre[r.rbd].rem) docsCierre[r.rbd].rem.real_hasta_mes = 9; });
  fijaFuentes('AC', KEYS_RBD_AC);
  gesparvu.forEach(g => fijaFuentes(g.rbd, KEYS_GESPARVU));
  docsCierre['1121'].rem.real_hasta_mes = 7;
  docsCierre['1123'].rem.real_hasta_mes = 12;
  docsCierre['1128'].rem.real_hasta_mes = 5;
  docsCierre['1121'].otras_fuentes.general.real_hasta_mes = 7;
  docsCierre.AC.otras_fuentes.faep.real_hasta_mes = 12;
  docsCierre['5402002'].otras_fuentes.junji.real_hasta_mes = 6;
  docsCierre['1121'].ingreso_real_hasta_mes = 8;
  docsCierre['1122'].ingreso_real_hasta_mes = 9;
  docsCierre['1123'].ingreso_real_hasta_mes = 12;
  docsCierre._meta = { ...docsCierre._meta, mes_cierre: 9, mes_cierre_por: EMAILS[0], mes_cierre_en: { __ts: Date.UTC(2026, 9, 20, 14, 30) } };
}

// ---------- variante "compras": casos de la PR D1 (signo de NC/ND, avisos de fecha/cuenta, ID "0") ----------
// Se AGREGAN compras al final de las de default.json (sin tocar ninguna ni consumir números aleatorios): los RBD/entidades que no reciben casos
// quedan igual y sus cifras del golden no cambian. Lo guardado en Firestore es lo que dejó la persona (con los signos "mal" a propósito).
//   SEP / 1121   · c1121_nc_pos     nota de crédito guardada en POSITIVO (la lectura la normaliza a negativo: resta gasto de abril)
//                · c1121_nd_neg     nota de débito guardada en NEGATIVO (se lee en positivo)
//                · c1121_fac_neg    factura en negativo (se deja tal cual: no se inventan signos)
//                · c1121_f2025      fecha de documento de 2025 ("⚠ fecha fuera de 2026"; se suma en diciembre por su mes)
//                · c1121_invalida   fecha "10/03/2026" ("⚠ fecha no válida: no se contabiliza"; queda fuera de todo total)
//                · c1121_pago27     fecha de pago de 2027 ("⚠ fecha fuera de 2026" en la fecha de pago; sí se suma)
//                · c1121_cuenta_x   código de cuenta 999999 fuera del catálogo ("⚠ cuenta no reconocida: no se contabiliza")
//                · "0"              compra bajo la clave "0" (rastro del bug antiguo que borra "Revisar duplicados"): el Excel la exporta con ID "0"
//   SEP / 1122   · c1122_f2025      fecha de 2025 (un segundo RBD en "Datos a revisar")
//   General / 1121 · ogx_nc_pos, ogx_f2025, ogx_invalida;  General / AC · ogx_ac_nc_pos, ogx_ac_nd_neg;  PIE / 1121 · opx_nc_pos
const docsCompras = JSON.parse(JSON.stringify(docs));
{
  const base = { rutProveedor: '76.123.456-7', nombreProveedor: 'Librería Central Ltda.', documentoOriginal: '' };
  const nota = { documentoOriginal: '1001-FACEL' };
  const sep = docsCompras['1121'].compras;
  sep.c1121_nc_pos = { ...base, ...nota, codigo: '410606', tipoDocumento: 'Nota de crédito', nroDocumento: '5001', fechaDocumento: '2026-04-10', fechaPago: '2026-04-15', descripcion: 'NC cargada en positivo', montoGasto: 150000, montoDocumento: 178500 };
  sep.c1121_nd_neg = { ...base, ...nota, codigo: '410606', tipoDocumento: 'Nota de débito', nroDocumento: '5002', fechaDocumento: '2026-04-12', fechaPago: '2026-04-16', descripcion: 'ND cargada en negativo', montoGasto: -25000, montoDocumento: -29750 };
  sep.c1121_fac_neg = { ...base, codigo: '410605', tipoDocumento: 'Factura', nroDocumento: '5003', fechaDocumento: '2026-04-14', fechaPago: '2026-04-18', descripcion: 'Factura en negativo (se deja como se digitó)', montoGasto: -12000, montoDocumento: -14280 };
  sep.c1121_f2025 = { ...base, codigo: '410605', tipoDocumento: 'Factura', nroDocumento: '5004', fechaDocumento: '2025-12-30', fechaPago: '2026-01-05', descripcion: 'Fecha de documento de 2025', montoGasto: 80000, montoDocumento: 95200 };
  sep.c1121_invalida = { ...base, codigo: '410605', tipoDocumento: 'Factura', nroDocumento: '5005', fechaDocumento: '10/03/2026', fechaPago: '2026-03-20', descripcion: 'Fecha con formato no reconocido', montoGasto: 45000, montoDocumento: 53550 };
  sep.c1121_pago27 = { ...base, codigo: '410605', tipoDocumento: 'Factura', nroDocumento: '5006', fechaDocumento: '2026-06-10', fechaPago: '2027-01-05', descripcion: 'Pago en 2027', montoGasto: 30000, montoDocumento: 35700 };
  sep.c1121_cuenta_x = { ...base, codigo: '999999', tipoDocumento: 'Factura', nroDocumento: '5007', fechaDocumento: '2026-05-05', fechaPago: '2026-05-10', descripcion: 'Cuenta fuera del catálogo', montoGasto: 60000, montoDocumento: 71400 };
  sep['0'] = { ...base, codigo: '410606', tipoDocumento: 'Boleta', nroDocumento: 'S/N', fechaDocumento: '2026-05-20', fechaPago: '2026-05-20', descripcion: 'Rastro del bug antiguo: clave "0"', montoGasto: 5000, montoDocumento: 5000 };
  docsCompras['1122'].compras = { ...(docsCompras['1122'].compras || {}),
    c1122_f2025: { ...base, codigo: '410606', tipoDocumento: 'Factura', nroDocumento: '5101', fechaDocumento: '2025-11-20', fechaPago: '2025-12-01', descripcion: 'Fecha de documento de 2025', montoGasto: 20000, montoDocumento: 23800 } };
  const gen1121 = docsCompras['1121'].otras_fuentes.general.compras;
  gen1121.ogx_nc_pos = { ...base, ...nota, codigo: '410601', tipoDocumento: 'Nota de crédito', nroDocumento: '6001', fechaDocumento: '2026-04-08', fechaPago: '2026-04-12', descripcion: 'NC cargada en positivo (General)', montoGasto: 70000, montoDocumento: 83300 };
  gen1121.ogx_f2025 = { ...base, codigo: '410601', tipoDocumento: 'Factura', nroDocumento: '6002', fechaDocumento: '2025-11-20', fechaPago: '2025-11-28', descripcion: 'Fecha de documento de 2025 (General)', montoGasto: 90000, montoDocumento: 107100 };
  gen1121.ogx_invalida = { ...base, codigo: '410601', tipoDocumento: 'Factura', nroDocumento: '6003', fechaDocumento: 'abril 2026', fechaPago: '2026-04-30', descripcion: 'Fecha con formato no reconocido (General)', montoGasto: 33000, montoDocumento: 39270 };
  const genAC = docsCompras.AC.otras_fuentes.general.compras;
  genAC.ogx_ac_nc_pos = { ...base, ...nota, codigo: '410502', tipoDocumento: 'Nota de crédito', nroDocumento: '6101', fechaDocumento: '2026-05-06', fechaPago: '2026-05-10', descripcion: 'NC cargada en positivo (AC)', montoGasto: 400000, montoDocumento: 476000 };
  genAC.ogx_ac_nd_neg = { ...base, ...nota, codigo: '410502', tipoDocumento: 'Nota de débito', nroDocumento: '6102', fechaDocumento: '2026-05-07', fechaPago: '2026-05-11', descripcion: 'ND cargada en negativo (AC)', montoGasto: -15000, montoDocumento: -17850 };
  docsCompras['1121'].otras_fuentes.pie.compras.opx_nc_pos = { ...base, ...nota, codigo: '410917', tipoDocumento: 'Nota de crédito', nroDocumento: '6201', fechaDocumento: '2026-03-18', fechaPago: '2026-03-22', descripcion: 'NC cargada en positivo (PIE)', montoGasto: 55000, montoDocumento: 65450 };
}

// ---------- variante "estado": casos de borde del Estado (PR D2: L-07 / L-08) ----------
// Montos en pesos enteros, todos en ENERO (real: el corte por defecto es julio) para que el recurso y el gasto sean EXACTOS y se puedan razonar a mano.
// El oráculo de los specs (tests/lib/estado.mjs) los recalcula desde estos documentos sin pasar por el código del panel.
//   SEP (Estado con Riesgo: Déficit ⇔ saldo < 0; Riesgo ⇔ gasto/recurso ≥ 90 % sin redondear y saldo ≥ 0; si no, Superávit). recurso = Preferente + Prioritario + Carrera Docente.
//     1130  recurso 10.000.000 · gasto 10.000.000  (saldo 0, 100,0 %)                      → Riesgo      (antes: Déficit, por el % ≥ 100)
//     1131  recurso 10.000.000 · gasto  9.999.600  (99,996 %, se muestra 100,0 %)           → Riesgo      (antes: Déficit con saldo positivo)
//     1132  recurso 10.000.000 · gasto 10.000.001  (saldo -$1)                               → Déficit
//     1133  recurso 10.000.000 · gasto  8.999.900  (89,999 %, se muestra 90,0 %)             → Superávit   (antes: Riesgo)
//     1134  recurso 10.000.000 · gasto  9.000.000  (90,000 %)                                → Riesgo
//     1135  recurso 0 · gasto 0                                                              → Superávit
//     1136  recurso 0 · gasto 500.000 (remuneraciones sin ingreso)                           → Déficit     (antes: Superávit, el % se forzaba a 0)
//     1137  recurso 12.000.000 (10.000.000 + Carrera Docente 2.000.000) · gasto 12.000.000   → Riesgo      (antes: Déficit)
//     1139  recurso 10.000.000 · gasto 9.500.000 (rem 6.000.000 + proyección B&S 3.500.000)  → Riesgo
//     1140  recurso 10.000.000 · gasto 5.000.000                                              → Superávit
//     1120 (sin marco SEP, con una compra del fixture) · recurso 0 · gasto > 0               → Déficit     (antes: Superávit)
//   Fuentes (Estado de 2 niveles: Déficit ⇔ saldo total < 0), FAEP y Subvención General (1 línea de ingreso):
//     FAEP 1130 ingreso 5.000.000 · gasto 5.000.000 (saldo 0) → Superávit;  FAEP 1131 gasto 5.000.001 (-$1) → Déficit;  FAEP 1132 gasto 4.999.800 (99,996 %) → Superávit;
//     FAEP 1133 ingreso 0 · gasto 100.000 → Déficit;  FAEP 1134 ingreso 0 · gasto 0 → Superávit;  General 1130 ingreso 3.000.000 · gasto 3.000.000 → Superávit;  General 1131 gasto 3.000.001 → Déficit.
//   JUNJI (3 líneas; Déficit ⇔ saldo total < 0 O saldo de Operación para B&S = Operación − B&S < 0), cada una con sus montos en ENERO:
//     5402002  Op 1.000.000 · Hom 2.000.000 · CD 1.000.000 · Rem 2.000.000 · B&S 1.500.000  (saldo +500.000; Op − B&S = -500.000)   → Déficit SOLO por Operación
//     5402004  Op 2.000.000 · Rem 2.500.000 · B&S 500.000                                     (saldo -1.000.000; Op − B&S = +1.500.000) → Déficit SOLO por el saldo total
//     5401006  Op 1.000.000 · Hom 500.000 · Rem 1.500.000 · B&S 1.200.000                      (saldo -1.200.000; Op − B&S = -200.000)   → Déficit por AMBAS
//     5401007  Op 1.000.000 · Hom 1.000.000 · Rem 1.000.000 · B&S 1.000.000                    (saldo 0; Op − B&S = 0)                   → Superávit
//     5401005  Op 1.000.000 · Hom 3.000.000 · Rem 2.000.000 · B&S 1.000.001                    (saldo +999.999; Op − B&S = -1)           → Déficit SOLO por Operación (-$1)
//   Aporte Fiscal JUNJI (1 línea, sin restricción de líneas): 5401004 ingreso 1.000.000 · Rem 0 · B&S 900.000 → Superávit (NO es déficit aunque B&S sea el 90 % del ingreso).
const docsEstado = JSON.parse(JSON.stringify(docs));
{
  const enero = (v) => { const m = meses12(() => 0); m.ENERO = v; return m; };
  const lineaEnero = (v) => ({ meses: enero(v), total: v });
  const sep = (rbd, { pref = 0, prio = 0, carrera = 0, rem = 0, bys = 0 }) => {
    const d = docsEstado[rbd];
    const ing = {};
    [['Ingreso SEP Preferente', pref], ['Ingreso SEP Prioritario', prio], ['Carrera Docente', carrera]].forEach(([item, v]) => { ing[item] = { item, meses: enero(v), total: v }; });
    d.ingreso_items = ing;
    d.rem = { ...lineaEnero(rem), real_hasta_mes: N_MESES };
    d.bys_proyeccion = { items: bys ? { '411601': lineaEnero(bys) } : {} };
    d.compras = {};
  };
  const par = (total, pref = 4000000) => ({ pref, prio: total - pref });
  sep('1130', { ...par(10000000), rem: 10000000 });
  sep('1131', { ...par(10000000), rem: 9999600 });
  sep('1132', { ...par(10000000), rem: 10000001 });
  sep('1133', { ...par(10000000), rem: 8999900 });
  sep('1134', { ...par(10000000), rem: 9000000 });
  sep('1135', {});
  sep('1136', { rem: 500000 });
  sep('1137', { ...par(10000000), carrera: 2000000, rem: 12000000 });
  sep('1139', { ...par(10000000), rem: 6000000, bys: 3500000 });
  sep('1140', { ...par(10000000), rem: 5000000 });
  // Fuentes con una línea: se reemplaza lo que hubiera de esa fuente en la entidad.
  const fuente1 = (id, key, { ingreso = 0, rem = 0 }) => {
    const d = docsEstado[id];
    d.otras_fuentes = d.otras_fuentes || {};
    const base = { ingreso: lineaEnero(ingreso), gasto_rem: lineaEnero(rem), real_hasta_mes: N_MESES };
    d.otras_fuentes[key] = key === 'general' ? { ...base, compras: {}, bys_proy_items: {} } : { ...base, bys_items: {} };
  };
  fuente1('1130', 'faep', { ingreso: 5000000, rem: 5000000 });
  fuente1('1131', 'faep', { ingreso: 5000000, rem: 5000001 });
  fuente1('1132', 'faep', { ingreso: 5000000, rem: 4999800 });
  fuente1('1133', 'faep', { rem: 100000 });
  fuente1('1134', 'faep', {});
  fuente1('1130', 'general', { ingreso: 3000000, rem: 3000000 });
  fuente1('1131', 'general', { ingreso: 3000000, rem: 3000001 });
  // JUNJI (GESPARVU): 3 líneas de ingreso + remuneraciones + un concepto de B&S.
  const junji = (id, { op = 0, hom = 0, cd = 0, rem = 0, bys = 0 }) => {
    const d = docsEstado[id];
    d.otras_fuentes = d.otras_fuentes || {};
    d.otras_fuentes.junji = {
      ingreso_operacion: lineaEnero(op), ingreso_homologacion: lineaEnero(hom), ingreso_carrera_docente: lineaEnero(cd),
      gasto_rem: lineaEnero(rem), bys_items: { 'Alimentación': { concepto: 'Alimentación', ...lineaEnero(bys) } }, real_hasta_mes: N_MESES,
    };
  };
  junji('5402002', { op: 1000000, hom: 2000000, cd: 1000000, rem: 2000000, bys: 1500000 });
  junji('5402004', { op: 2000000, rem: 2500000, bys: 500000 });
  junji('5401006', { op: 1000000, hom: 500000, rem: 1500000, bys: 1200000 });
  junji('5401007', { op: 1000000, hom: 1000000, rem: 1000000, bys: 1000000 });
  junji('5401005', { op: 1000000, hom: 3000000, rem: 2000000, bys: 1000001 });
  docsEstado['5401004'].otras_fuentes.aporte_junji = {
    ingreso: lineaEnero(1000000), gasto_rem: lineaEnero(0),
    bys_items: { 'Alimentación': { concepto: 'Alimentación', ...lineaEnero(900000) } }, real_hasta_mes: N_MESES,
  };
}

// ---------- salida ----------
function serializar(docsX, extra = {}) {
  const ids = Object.keys(docsX).sort();
  const lineas = ids.map(id => ` ${JSON.stringify(id)}: ${JSON.stringify(docsX[id])}`);
  const meta = {
    generado_por: 'tests/fixtures/generate.mjs',
    nota: 'Fixture sintético determinista (PRNG con semilla fija). No contiene cifras reales.',
    ...extra,
    n_documentos: ids.length, n_rbd: registros.length, n_gesparvu: gesparvu.length,
  };
  return { ids, texto: `{\n"meta": ${JSON.stringify(meta)},\n"docs": {\n${lineas.join(',\n')}\n}\n}\n` };
}
const SALIDAS = [
  { archivo: SALIDA, ...serializar(docs) },
  { archivo: path.join(AQUI, 'cierre.json'), ...serializar(docsCierre, { variante: 'cierre' }) },
  { archivo: path.join(AQUI, 'compras.json'), ...serializar(docsCompras, { variante: 'compras' }) },
  { archivo: path.join(AQUI, 'estado.json'), ...serializar(docsEstado, { variante: 'estado' }) },
];

if (process.argv.includes('--check')) {
  let mal = false;
  for (const o of SALIDAS) {
    const actual = fs.existsSync(o.archivo) ? fs.readFileSync(o.archivo, 'utf8') : '';
    const nombre = path.basename(o.archivo);
    if (actual !== o.texto) { console.error(`${nombre} NO coincide con lo que genera generate.mjs (regenerar con: node tests/fixtures/generate.mjs)`); mal = true; }
    else console.log(`${nombre} OK (${o.ids.length} documentos)`);
  }
  if (mal) process.exit(1);
} else {
  for (const o of SALIDAS) {
    fs.writeFileSync(o.archivo, o.texto);
    console.log(`Escrito ${path.relative(process.cwd(), o.archivo)}: ${o.ids.length} documentos, ${(o.texto.length / 1024).toFixed(0)} KB`);
  }
}
