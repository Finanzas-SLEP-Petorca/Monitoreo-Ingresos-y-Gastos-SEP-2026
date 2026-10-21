// Comparación legible entre dos capturas del golden master.
// Cada vista / exportación se "canoniza" a una lista de líneas con encabezados de sección ([texto], [campos],
// [hoja X]...), y se compara con un diff de líneas (prefijo/sufijo comunes + LCS en la zona cambiada).
import { desempaquetar } from '../lib/pack.mjs';

const lineas = (v) => (Array.isArray(v) ? v : (typeof v === 'string' ? v.split('\n') : []));

export function canonVista(v) {
  const out = ['[texto]', ...lineas(v.text)];
  if (v.campos) out.push('[campos]', ...v.campos);
  if (v.kpi) out.push('[cifras clave]', ...v.kpi);
  if (v.svg) out.push('[gráficos svg]', ...v.svg);
  return out;
}
export function canonDato(v) { return JSON.stringify(v, null, 1).split('\n'); }

export function canonExport(e) {
  const out = [];
  const cab = (k, v) => { if (v !== undefined) out.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`); };
  cab('tipo', e.kind); cab('archivo', e.filename);
  if (e.dialogos) out.push('[diálogos]', ...e.dialogos);
  switch (e.kind) {
    case 'csv':
      cab('bom', e.bom); cab('fin de línea', e.eol); cab('líneas', e.nLineas);
      out.push('[contenido]', ...desempaquetar(e, 'filas'));
      break;
    case 'xlsx':
      cab('hojas', (e.orden || []).join(', '));
      (e.orden || []).forEach((n) => {
        const h = e.hojas[n];
        out.push(`[hoja ${n}] filas=${h.nFilas} cols=${h.nCols}${h.filasSinCifras ? ` (sin cifras omitidas=${h.filasSinCifras})` : ''}`);
        out.push(...desempaquetar(h, 'filas'));
      });
      break;
    case 'json':
      cab('tamaño', e.size); cab('error', e.error);
      Object.entries(e.claves || {}).forEach(([k, v]) => out.push(`clave ${k}: ${v.tipo} n=${v.n} sha1=${v.sha1}`));
      break;
    case 'impresion':
      cab('window.print()', e.nPrint); cab('window.open()', e.nOpen); cab('body.class', e.bodyClass); cab('pestaña activa', e.activeTab);
      cab('pestañas visibles', (e.visibleTabs || []).join(', ')); cab('líneas visibles', e.visibleLineas); cab('sha1 visible', e.visibleSha1);
      cab('openUrl', e.openUrl);
      out.push('[contenido imprimible individual]', ...lineas(e.printWrap));
      if (e.openHtml) out.push('[window.open html]', ...lineas(e.openHtml));
      break;
    default:
      out.push(JSON.stringify(e));
  }
  return out;
}

// ---------------------------------------------------------------- diff de líneas
export function diffLineas(a, b) {
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fa = a.length, fb = b.length;
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
  const A = a.slice(ini, fa), B = b.slice(ini, fb);
  const ops = []; // {op:'=', a, b} | {op:'-'} | {op:'+'}
  for (let i = 0; i < ini; i++) ops.push({ op: '=', t: a[i] });
  if (A.length * B.length <= 6e6) {
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push({ op: '=', t: A[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ op: '-', t: A[i++] });
      else ops.push({ op: '+', t: B[j++] });
    }
    while (i < n) ops.push({ op: '-', t: A[i++] });
    while (j < m) ops.push({ op: '+', t: B[j++] });
  } else {
    A.forEach(t => ops.push({ op: '-', t })); B.forEach(t => ops.push({ op: '+', t }));
  }
  for (let i = fa; i < a.length; i++) ops.push({ op: '=', t: a[i] });
  return ops;
}

// Convierte ops en bloques con contexto, anteponiendo el último encabezado de sección ([texto], [hoja X]...).
export function formatearDiff(ops, { contexto = 1, maxLineas = 16 } = {}) {
  const esCab = (t) => /^\[[^\]]+\]/.test(t);
  const seccionEn = [];
  let sec = null;
  ops.forEach((o, i) => { if (o.op !== '-' && esCab(o.t)) sec = o.t; seccionEn[i] = sec; });
  const idxCambio = [];
  ops.forEach((o, i) => { if (o.op !== '=') idxCambio.push(i); });
  const rangos = [];
  idxCambio.forEach((i) => {
    const lo = Math.max(0, i - contexto), hi = Math.min(ops.length - 1, i + contexto);
    const ult = rangos[rangos.length - 1];
    if (ult && lo <= ult.hi + 1) ult.hi = Math.max(ult.hi, hi); else rangos.push({ lo, hi });
  });
  const salida = [];
  let impresas = 0, omitidas = 0, ultimaCabecera = null;
  rangos.forEach((r, k) => {
    const cabecera = seccionEn[r.lo];
    const lineasRango = [];
    if (cabecera && ops[r.lo].t !== cabecera && cabecera !== ultimaCabecera) lineasRango.push(`  ${cabecera}`);
    ultimaCabecera = cabecera || ultimaCabecera;
    for (let i = r.lo; i <= r.hi; i++) {
      const o = ops[i];
      lineasRango.push((o.op === '=' ? '    ' : (o.op === '-' ? '  - ' : '  + ')) + o.t);
    }
    if (k > 0) lineasRango.unshift('    ···');
    for (const l of lineasRango) {
      if (impresas >= maxLineas) { if (/^  [-+] /.test(l)) omitidas++; continue; }
      salida.push(l); impresas++;
    }
  });
  const menos = ops.filter(o => o.op === '-').length, mas = ops.filter(o => o.op === '+').length;
  return { texto: salida, cambios: Math.max(menos, mas), omitidas };
}

// ---------------------------------------------------------------- comparación completa
export function comparar(base, actual, { maxLineas = 16, full = false } = {}) {
  const limite = full ? Infinity : maxLineas;
  const informe = { iguales: 0, distintos: [], nuevos: [], faltantes: [], soloMarcado: [], total: 0 };
  const grupos = [
    ['views', canonVista, 'vista'], ['datos', canonDato, 'dato'], ['exports', canonExport, 'export'],
  ];
  grupos.forEach(([g, canon, etiqueta]) => {
    const B = (base && base[g]) || {}, A = (actual && actual[g]) || {};
    const claves = Array.from(new Set([...Object.keys(B), ...Object.keys(A)]));
    claves.forEach((k) => {
      informe.total++;
      const id = `${g}/${k}`;
      if (!(k in B)) { informe.nuevos.push({ id, etiqueta }); return; }
      if (!(k in A)) { informe.faltantes.push({ id, etiqueta }); return; }
      const ops = diffLineas(canon(B[k]), canon(A[k]));
      if (ops.every(o => o.op === '=')) {
        if (g === 'views' && B[k].htmlHash !== A[k].htmlHash) informe.soloMarcado.push({ id });
        informe.iguales++;
        return;
      }
      const d = formatearDiff(ops, { maxLineas: limite });
      informe.distintos.push({ id, etiqueta, cambios: d.cambios, texto: d.texto, omitidas: d.omitidas });
    });
  });
  informe.ok = !informe.distintos.length && !informe.nuevos.length && !informe.faltantes.length;
  return informe;
}

export function imprimirInforme(informe, log = console.log) {
  log(`Golden master: ${informe.total} entradas comparadas — ${informe.iguales} iguales, ${informe.distintos.length} distintas, ${informe.nuevos.length} nuevas, ${informe.faltantes.length} faltantes.`);
  informe.distintos.forEach((d) => {
    log(`\n✗ ${d.id}  (${d.cambios} línea${d.cambios === 1 ? '' : 's'} cambiada${d.cambios === 1 ? '' : 's'})`);
    d.texto.forEach(l => log(l));
    if (d.omitidas) log(`    … ${d.omitidas} cambios más (usa --full para verlos todos)`);
  });
  informe.nuevos.forEach(n => log(`\n+ ${n.id}  (nueva: no está en el baseline)`));
  informe.faltantes.forEach(n => log(`\n- ${n.id}  (faltante: está en el baseline pero ya no se captura)`));
  if (informe.ok && informe.soloMarcado.length) {
    log(`\nNota informativa: ${informe.soloMarcado.length} vista(s) tienen igual texto y cifras pero distinto marcado HTML (cambios de clases/estilos): ${informe.soloMarcado.slice(0, 6).map(m => m.id).join(', ')}${informe.soloMarcado.length > 6 ? ', …' : ''}`);
  }
}
