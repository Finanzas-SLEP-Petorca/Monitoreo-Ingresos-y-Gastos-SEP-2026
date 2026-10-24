// Ayudas compartidas por los specs del corte Real/Proyectado de los ingresos de SEP y del mes de cierre global
// (corte_ingresos.mjs, mes_cierre_global.mjs): cálculo INDEPENDIENTE de lo esperado a partir de los documentos del fixture
// (sin pasar por el código del panel) y lectura de las cifras que muestra la pantalla.
import fs from 'node:fs';
import path from 'node:path';
import { TESTS_DIR } from './config.mjs';
import { cargarFixture } from './boot.mjs';

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
export const MESES_TITULO = MESES.map(m => m.charAt(0) + m.slice(1).toLowerCase());
export const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const RBDS = JSON.parse(fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'rbds.json'), 'utf8'));
export const N_MESES = RBDS.n_meses;                                  // DATA.n_meses (7)
export const RBD_IDS = RBDS.registros.map(r => r.rbd);                // los 55 RBD de DATA.registros
export const GESPARVU_IDS = RBDS.gesparvu.map(g => g.rbd);
export const FUENTES = [
  { key: 'general', label: 'Subvención General', corto: 'Subv. General', universo: 'rbd_ac' },
  { key: 'pie', label: 'PIE', corto: 'PIE', universo: 'rbd_ac' },
  { key: 'mantenimiento', label: 'Subv. Mantención', corto: 'Mantención', universo: 'rbd_ac' },
  { key: 'prorretencion', label: 'Subv. Pro-Retención', corto: 'Pro-Retención', universo: 'rbd_ac' },
  { key: 'junji', label: 'JUNJI', corto: 'JUNJI', universo: 'gesparvu' },
  { key: 'faep', label: 'FAEP', corto: 'FAEP', universo: 'rbd_ac_gesparvu' },
  { key: 'figa', label: 'FIGA', corto: 'FIGA', universo: 'rbd_ac_gesparvu' },
  { key: 'aporte_educ', label: 'Aporte Fiscal Extraord. Educación', corto: 'Aporte Fiscal Educ.', universo: 'rbd_ac' },
  { key: 'aporte_junji', label: 'Aporte Fiscal Extraord. JUNJI', corto: 'Aporte Fiscal JUNJI', universo: 'gesparvu' },
];
// Universos de entidades de las fuentes: 'rbd_ac' (55 RBD + AC), 'gesparvu' (13 jardines) y 'rbd_ac_gesparvu' (los tres, en ese orden: FAEP y FIGA desde «ajustes de fuentes»).
// Es lo que debe listar cada pestaña y de lo que participa cada documento; se calcula aquí, sin pasar por el código del panel.
export const idsDeUniverso = (universo) => (universo === 'gesparvu' ? GESPARVU_IDS : (universo === 'rbd_ac_gesparvu' ? [...RBD_IDS, 'AC', ...GESPARVU_IDS] : [...RBD_IDS, 'AC']));
// Rótulo de una entidad: lo decide su tipo, no la fuente.
export const tituloEntidad = (id) => (id === 'AC' ? 'Administración Central' : (GESPARVU_IDS.includes(id) ? 'GESPARVU ' + id : 'RBD ' + id));
export const clon = (o) => JSON.parse(JSON.stringify(o));
export const docsDe = (fixture = 'default') => clon(cargarFixture(fixture).docs);

// Un corte válido es un entero 1–12 (lo demás = "sin corte").
export const corteValido = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12) ? v : 0;
// Corte efectivo de los ingresos de un RBD: propio > mes de cierre global > DATA.n_meses.
export const corteIngreso = (docs, rbd) => corteValido(docs[rbd] && docs[rbd].ingreso_real_hasta_mes) || corteValido(docs._meta && docs._meta.mes_cierre) || N_MESES;
export const corteRem = (docs, rbd) => (docs[rbd] && docs[rbd].rem && docs[rbd].rem.real_hasta_mes) || N_MESES;
export const corteFuente = (docs, rbd, key) => {
  const n = Math.round(Number(docs[rbd] && docs[rbd].otras_fuentes && docs[rbd].otras_fuentes[key] && docs[rbd].otras_fuentes[key].real_hasta_mes));
  return (n >= 1 && n <= 12) ? n : N_MESES;
};

const mesesDe = (it) => MESES.map(m => (it && it.meses && Number(it.meses[m])) || 0);
// Ingresos de SEP esperados (con el corte "Ver resumen hasta el mes" en diciembre, el de siempre): Real / Proyectado por concepto y por mes.
export function ingresoEsperado(docs) {
  const r = { prefPrioReal: 0, prefPrioProy: 0, carreraReal: 0, carreraProy: 0, porMesReal: new Array(12).fill(0), porMesProy: new Array(12).fill(0), porRbd: {} };
  RBD_IDS.forEach(rbd => {
    const corte = corteIngreso(docs, rbd);
    const items = (docs[rbd] && docs[rbd].ingreso_items) || {};
    const loc = { prefPrioReal: 0, prefPrioProy: 0, carreraReal: 0, carreraProy: 0 };
    Object.values(items).forEach(it => {
      const esCarrera = it.item === 'Carrera Docente';
      mesesDe(it).forEach((v, i) => {
        const real = i + 1 <= corte;
        (real ? r.porMesReal : r.porMesProy)[i] += v;
        if (esCarrera) loc[real ? 'carreraReal' : 'carreraProy'] += v;
        else if (it.item === 'Ingreso SEP Preferente' || it.item === 'Ingreso SEP Prioritario') loc[real ? 'prefPrioReal' : 'prefPrioProy'] += v;
      });
    });
    r.porRbd[rbd] = loc;
    Object.keys(loc).forEach(k => { r[k] += loc[k]; });
  });
  return r;
}

// "$1.234.567" / "-$1.234" / "1,23 M" → número (solo pesos).
export function parseCLP(txt) {
  const s = String(txt).replace(/\s/g, '');
  const neg = /^-/.test(s);
  const n = Number(s.replace(/[^\d]/g, ''));
  return neg ? -n : n;
}

// Tarjetas KPI de un contenedor: { 'Ingreso SEP (Real)': '$5.007.896', ... }
export async function kpis(page, selector) {
  return page.evaluate((sel) => {
    const out = {};
    document.querySelectorAll(sel + ' .kpi-card').forEach(c => { out[c.querySelector('.label').textContent.trim()] = c.querySelector('.value').textContent.trim(); });
    return out;
  }, selector);
}

// Encabezados de mes de una tabla del detalle SEP (0 = ingresos, 1 = remuneraciones, 2 = Subt.22…): [{ mes:'Ene', tag:'Real', real:true }]
export async function encabezadosMes(page, indiceTabla = 0, modal = '#modalBody') {
  return page.evaluate(([i, m]) => {
    const t = document.querySelectorAll(`${m} table.detalle-table`)[i];
    return Array.from(t.querySelectorAll('thead th.num')).filter(th => th.querySelector('.mes-tag')).map(th => ({
      mes: th.firstChild.textContent.trim(), tag: th.querySelector('.mes-tag').textContent.trim(), real: th.classList.contains('mes-real'), proy: th.classList.contains('mes-proy'),
    }));
  }, [indiceTabla, modal]);
}
// Real/Proy de las celdas de una fila de ingresos del modal: array de 12 booleanos (true = celda Real).
export async function celdasIngresoReal(page, item = 'Ingreso SEP Preferente', rbd = '1121') {
  return page.evaluate(([it, r, meses]) => meses.map(m => {
    const inp = document.querySelector(`#modalBody input.celda-input[data-rbd="${r}"][data-modo="ingreso_item"][data-item="${it}"][data-mes="${m}"]`);
    return inp ? inp.closest('td').classList.contains('mes-real') : null;
  }), [item, rbd, MESES]);
}

// Pasos del encabezado de un modal: ¿hasta qué mes (1–12) llegan las columnas "Real"? (cuenta de encabezados Real consecutivos desde Ene)
export const mesesRealesDe = (enc) => enc.filter(e => e.real).length;

// Entidades × origen cuyo corte efectivo NO coincide con el mes de cierre de `docs._meta` (vacío si no hay mes de cierre válido). Es lo que debe listar el
// aviso "N entidades con corte distinto al cierre global": ingresos y remuneraciones de cada RBD de SEP y el "Real hasta" de cada entidad en cada fuente
// de su universo (RBD + AC; GESPARVU en JUNJI y Aporte JUNJI; RBD + AC + GESPARVU en FAEP y FIGA).
export function cortesDistintosEsperados(docs) {
  const g = corteValido(docs._meta && docs._meta.mes_cierre);
  if (!g) return [];
  const out = [];
  RBD_IDS.forEach(rbd => {
    const ci = corteIngreso(docs, rbd);
    if (ci !== g) out.push({ rbd, origen: 'sep_ingreso', titulo: 'RBD ' + rbd, etiqueta: 'SEP — Ingresos', etiquetaLarga: 'SEP — Ingresos', corte: ci });
    const cr = corteRem(docs, rbd);
    if (cr !== g) out.push({ rbd, origen: 'sep_rem', titulo: 'RBD ' + rbd, etiqueta: 'SEP — Remuneraciones', etiquetaLarga: 'SEP — Remuneraciones', corte: cr });
  });
  FUENTES.forEach(f => {
    idsDeUniverso(f.universo).forEach(id => {
      const c = corteFuente(docs, id, f.key);
      if (c !== g) out.push({ rbd: id, origen: f.key, titulo: tituloEntidad(id), etiqueta: f.corto, etiquetaLarga: f.label, corte: c });
    });
  });
  return out;
}
// Cuántas entidades cambian por origen (para el mensaje de confirmación): { 'SEP — Ingresos': 2, … }
export function porOrigen(filas) {
  const o = {};
  filas.forEach(f => { o[f.etiquetaLarga] = (o[f.etiquetaLarga] || 0) + 1; });
  return o;
}
