// Mini-arnés de specs: una línea "OK / FALLA" por aserción, resumen, "RESULT: OK|FALLA" (lo lee run.mjs) y código de salida 1 si algo falla.
//
//   await correrSpec('nombre', async (t) => { t.ok(cond, 'descripción'); t.eq(a, b, 'descripción'); t.info('texto'); });
import { shutdown } from './harness.mjs';

const corto = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 400 ? s.slice(0, 400) + '…' : s; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// BUG REAL conocido (hallazgo contra el SDK real, documentado en el README): por defecto se informa y el spec termina en KNOWN_BUG
// (no hace fallar la suite); con E2E_ENFORCE_BUGS=1 o --enforce-bugs su presencia FALLA (para cuando se corrija).
const ENFORCE = process.env.E2E_ENFORCE_BUGS === '1' || process.argv.includes('--enforce-bugs');

export async function correrSpec(nombre, fn, { timeoutMs = 600000 } = {}) {
  const fallas = []; let oks = 0; const bugs = [];
  console.log(`\n== ${nombre} ==  (HTML: ${process.env.APP_HTML || 'index.html del árbol'})`);
  const t = {
    ok(cond, desc, detalle) {
      if (cond) { oks++; console.log(`  OK     ${desc}`); }
      else { fallas.push(desc); console.log(`  FALLA  ${desc}${detalle !== undefined ? '\n         ' + corto(detalle) : ''}`); }
      return !!cond;
    },
    eq(actual, esperado, desc) {
      const c = igual(actual, esperado);
      return t.ok(c, desc, c ? undefined : `esperado: ${corto(esperado)}\n         actual:   ${corto(actual)}`);
    },
    info(msg) { console.log(`  ·      ${msg}`); },
    bug(id, descripcion, presente) {
      if (!presente) { oks++; console.log(`  OK     (bug "${id}" no se reprodujo)`); return; }
      if (ENFORCE) { fallas.push(`BUG presente: ${descripcion}`); console.log(`  FALLA  BUG REAL presente [${id}]: ${descripcion}`); }
      else { bugs.push(id); console.log(`  BUG    BUG REAL presente [${id}] (documentado, no falla la suite): ${descripcion}`); }
    },
    async sinErrores(h, desc = 'sin errores de consola / página / red inesperados') {
      const malos = await h.inesperados();
      return t.ok(!malos.length, desc, malos.join('\n         '));
    },
    async escenario(nombreEsc, f) {
      try { await f(); } catch (e) { t.ok(false, `${nombreEsc}: excepción`, String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
    },
  };
  const watchdog = setTimeout(() => { console.log(`  FALLA  tiempo máximo excedido (${timeoutMs} ms)`); console.log('RESULT: FALLA'); process.exit(1); }, timeoutMs);
  try { await fn(t); }
  catch (e) { fallas.push('excepción: ' + e.message); console.log(`  FALLA  EXCEPCIÓN: ${e.stack || e.message}`); }
  clearTimeout(watchdog);
  try { await shutdown(); } catch (e) { /* cierre best-effort */ }
  const resultado = fallas.length ? 'FALLA' : (bugs.length ? 'KNOWN_BUG' : 'OK');
  console.log(`\n${nombre}: ${resultado} — ${oks} OK, ${fallas.length} FALLA, ${bugs.length} bug(s) real(es) documentado(s)${bugs.length ? ' [' + bugs.join(', ') + ']' : ''}`);
  console.log(`RESULT: ${resultado}`);
  process.exit(fallas.length ? 1 : 0);
}
