// Ayudas compartidas por los specs del Estado de las entidades (PR D2: estado_unico, estado_junji): cálculo INDEPENDIENTE de lo esperado a partir de los
// documentos del fixture (sin pasar por el código del panel; la comparación del 90 % usa BigInt a propósito, para no compartir ni el redondeo ni el punto
// flotante de index.html) y lectura de lo que muestra cada vista.
//
// Regla (L-07 / L-08):
//   · Déficit  ⇔ saldo (recurso − gasto) < 0. Saldo 0 NO es déficit. Recurso 0 con gasto > 0 sí (saldo negativo).
//   · Riesgo   (solo SEP) ⇔ no es déficit y gasto/recurso ≥ 90 % EXACTO (gasto × 10 ≥ recurso × 9, recurso > 0). Los % que se muestran van redondeados a 1 decimal; no deciden.
//   · Superávit en cualquier otro caso. Las fuentes distintas de SEP solo tienen Superávit / Déficit.
//   · JUNJI (4 líneas de ingreso): además es Déficit si Operación − gasto de B&S < 0 (Homologación, Carrera Docente y BDL financian solo Remuneraciones; el BDL suma al saldo total, no al de Operación).
import fs from 'node:fs';
import path from 'node:path';
import { TESTS_DIR } from './config.mjs';
import { MESES, RBD_IDS, GESPARVU_IDS, FUENTES, idsDeUniverso } from './corte.mjs';

// Los RBD de DATA.registros marcados sin marco SEP (se leen de rbds.json, no se repiten aquí).
export const SIN_MARCO = JSON.parse(fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'rbds.json'), 'utf8')).registros.filter(r => r.sin_marco_sep).map(r => r.rbd);

export const ETIQUETA = { deficit: 'Déficit', riesgo: 'En riesgo', superavit: 'Superávit' };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sumaMeses = (o) => MESES.reduce((s, m) => s + num(o && o.meses && o.meses[m]), 0);
// Nota de crédito siempre en negativo y nota de débito siempre en positivo (regla de la PR D1); el resto, como se digitó.
const signo = (tipo, v) => (/^nota de cr[eé]dito/i.test(tipo || '') ? -Math.abs(v) : (/^nota de d[eé]bito/i.test(tipo || '') ? Math.abs(v) : v));
const sumaCompras = (compras) => Object.values(compras || {}).reduce((s, c) => s + signo(c.tipoDocumento, num(c.montoGasto)), 0);

/** Estado con la regla nueva, comparando en enteros (BigInt). `conRiesgo` solo en SEP. */
export function estadoEsperado(recurso, gasto, conRiesgo) {
  const R = BigInt(Math.round(recurso)), G = BigInt(Math.round(gasto));
  if (G > R) return 'deficit';
  if (conRiesgo && R > 0n && G * 10n >= R * 9n) return 'riesgo';
  return 'superavit';
}

/** Estado "antiguo" de SEP (el de 3d5b041): con el % redondeado a 1 decimal. Sirve para decir qué cambia. */
export function estadoAntiguoSep(recurso, gasto) {
  const pct = recurso ? Math.round((gasto / recurso * 100) * 10) / 10 : 0;
  return pct >= 100 ? 'deficit' : (pct >= 90 ? 'riesgo' : 'superavit');
}

/** SEP de un RBD: { recurso, gasto, saldo, estado }. recurso = Preferente + Prioritario + Carrera Docente; gasto = remuneraciones + compras + proyección de B&S. */
export function sepDe(docs, rbd) {
  const d = docs[rbd] || {};
  const recurso = Object.values(d.ingreso_items || {}).reduce((s, it) => s + sumaMeses(it), 0);
  const bysProy = Object.values((d.bys_proyeccion && d.bys_proyeccion.items) || {}).reduce((s, it) => s + sumaMeses(it), 0);
  const gasto = sumaMeses(d.rem) + sumaCompras(d.compras) + bysProy;
  return { recurso: Math.round(recurso), gasto: Math.round(gasto), saldo: Math.round(recurso) - Math.round(gasto), estado: estadoEsperado(recurso, gasto, true) };
}

/** Una entidad en una fuente: { ingreso, gasto, saldo, saldoOp (solo JUNJI), estado, causas }. */
export function fuenteDe(docs, id, key) {
  const f = FUENTES.find(x => x.key === key);
  const of = (docs[id] && docs[id].otras_fuentes && docs[id].otras_fuentes[key]) || {};
  const lineas = key === 'junji' ? [of.ingreso_operacion, of.ingreso_homologacion, of.ingreso_carrera_docente, of.ingreso_bdl] : [of.ingreso];
  const ingreso = Math.round(lineas.reduce((s, l) => s + sumaMeses(l), 0));
  const compras = ['general', 'pie', 'mantenimiento', 'prorretencion'].includes(key);
  const bys = compras
    ? sumaCompras(of.compras) + Object.values(of.bys_proy_items || {}).reduce((s, it) => s + sumaMeses(it), 0)
    : Object.values(of.bys_items || {}).reduce((s, it) => s + sumaMeses(it), 0);
  const gasto = Math.round(sumaMeses(of.gasto_rem) + bys);
  const saldo = ingreso - gasto;
  const saldoOp = key === 'junji' ? Math.round(sumaMeses(of.ingreso_operacion)) - Math.round(bys) : null;
  const causas = [];
  if (estadoEsperado(ingreso, gasto, false) === 'deficit') causas.push('saldo');
  if (saldoOp !== null && saldoOp < 0) causas.push('operacion_bys');
  return { fuente: f, ingreso, gasto, saldo, saldoOp, estado: causas.length ? 'deficit' : 'superavit', causas };
}

export const idsDeFuente = (key) => idsDeUniverso(FUENTES.find(x => x.key === key).universo);

/** Todo lo esperado a la vez: { sep: {rbd→...}, fuentes: {key→{id→...}}, conteos } */
export function esperadoDe(docs) {
  const sep = {};
  RBD_IDS.forEach(rbd => { sep[rbd] = sepDe(docs, rbd); });
  const fuentes = {};
  FUENTES.forEach(f => { fuentes[f.key] = {}; idsDeFuente(f.key).forEach(id => { fuentes[f.key][id] = fuenteDe(docs, id, f.key); }); });
  return { sep, fuentes };
}

/** Universo del Estado de SEP: los RBD con marco SEP (todos salvo los 3 sin marco) y, además, los sin marco que registraron gasto SEP. */
export function universoSep(docs, esperado) {
  return RBD_IDS.filter(rbd => !SIN_MARCO.includes(rbd) || esperado.sep[rbd].gasto > 0);
}

export function conteoSep(esperado, ids) {
  const c = { deficit: 0, riesgo: 0, superavit: 0 };
  ids.forEach(rbd => { c[esperado.sep[rbd].estado]++; });
  return c;
}
export function conteoFuente(esperado, key) {
  const c = { deficit: 0, riesgo: 0, superavit: 0 };
  Object.values(esperado.fuentes[key]).forEach(e => { c[e.estado]++; });
  return c;
}

// ---------------------------------------------------------------- lectura de la pantalla
/** Estado que muestra cada fila de la tabla de SEP según el filtro por Estado (las filas con alerta "Sin marco SEP" no traen la etiqueta, se leen por filtro). */
export async function sepPorFiltro(page) {
  const out = {};
  for (const ef of ['deficit', 'riesgo', 'superavit']) {
    await page.evaluate((v) => { const s = document.getElementById('estadoFilter'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, ef);
    out[ef] = await page.evaluate(() => Array.from(document.querySelectorAll('#tableBody tr.rbd-row')).map(tr => tr.dataset.rbd));
  }
  await page.evaluate(() => { const s = document.getElementById('estadoFilter'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
  return out;
}
/** Una fila de SEP: { saldo, pct, estado } (texto de las celdas). */
export function filaSep(page, rbd) {
  return page.evaluate((r) => {
    const tr = document.querySelector(`#tableBody tr.rbd-row[data-rbd="${r}"]`);
    if (!tr) return null;
    const t = (campo) => tr.querySelector(`[data-field="${campo}"]`).textContent.trim();
    return { saldo: t('saldo_total'), pct: t('pct_ejec_total'), estado: t('estado') };
  }, rbd);
}
/** Estado de cada fila de una fuente: { id: { saldo, estado, causa, title } } */
export function filasFuente(page, key) {
  return page.evaluate((k) => {
    const out = {};
    document.querySelectorAll(`#otrasFuentesTbody-${k} tr[data-rbd]`).forEach(tr => {
      const td = tr.children[tr.children.length - 2]; // la penúltima columna es Estado (la última es Acciones)
      const tag = td.querySelector('.tag');
      const causa = td.querySelector('.estado-causa');
      out[tr.dataset.rbd] = { saldo: tr.children[tr.children.length - 3].textContent.trim(), estado: tag ? tag.textContent.trim() : '', clase: tag ? tag.className : '', causa: causa ? causa.textContent.trim() : '', title: tag ? (tag.getAttribute('title') || '') : '' };
    });
    return out;
  }, key);
}
/** Valor y texto de una tarjeta KPI por su rótulo dentro de un contenedor. */
export function tarjeta(page, contenedor, rotulo) {
  return page.evaluate(([c, r]) => {
    const card = Array.from(document.querySelectorAll(c + ' .kpi-card')).find(x => x.querySelector('.label').textContent.trim() === r);
    return card ? { valor: card.querySelector('.value').textContent.trim(), nota: card.querySelector('.delta').textContent.trim() } : null;
  }, [contenedor, rotulo]);
}
/** Panel principal: franja, una línea "N de M entidades en déficit" por fuente y panel "Atención". */
export function leerDashboard(page) {
  return page.evaluate(() => {
    const strip = Array.from(document.querySelectorAll('#dashStrip .dash-tile')).find(t => t.querySelector('.t-label').textContent.trim() === 'Entidades en déficit');
    const cards = {};
    document.querySelectorAll('#dashCards .dash-card').forEach(c => { cards[c.dataset.fuente] = { def: c.querySelector('.c-def').textContent.trim(), estado: c.querySelector('.c-estado').textContent.trim() }; });
    const items = Array.from(document.querySelectorAll('#dashAtencion li[data-atencion-rbd]')).map(li => ({
      fuente: li.dataset.atencionFuente, rbd: li.dataset.atencionRbd, saldo: li.querySelector('.a-saldo').textContent.trim(),
      causa: (li.querySelector('.a-causa') || {}).textContent || '',
    }));
    return {
      strip: strip ? { valor: strip.querySelector('.t-value').textContent.trim(), sub: strip.querySelector('.t-sub').textContent.trim() } : null,
      cards, items, nota: document.getElementById('dashNotaAtencion').textContent.trim(),
      vacio: !!document.querySelector('#dashAtencion li.dash-vacio'),
    };
  });
}
/** "N de M entidades en déficit" → { n, m } */
export function nDeM(texto) {
  const m = /(\d+) de (\d+) entidades en déficit/.exec(texto || '');
  return m ? { n: Number(m[1]), m: Number(m[2]) } : null;
}
