// Mini-arnés para los specs: aserciones con salida legible, modo "bug conocido" y código de salida.
//
//   import { correrSpec } from '../lib/spec.mjs';
//   const MODO_BUG = 'known-bug';   // 'known-bug' (documenta el bug, no falla) | 'enforced' (el bug reaparece => FALLA)
//   await correrSpec('mi_spec', async (t) => { ... t.ok(cond, 'descripción'); ... }, { modoBug: MODO_BUG });
//
// La última línea impresa es "RESULT: OK | KNOWN_BUG | FALLA" (la lee tests/run.mjs); el proceso termina con
// código 1 solo si hay fallas.
import { shutdown } from './boot.mjs';

// Resuelve el modo de los bugs conocidos: la variable KNOWN_BUG_EXPECTED (1/0) o las banderas
// --expect-known-bugs / --enforce-bugs mandan sobre la constante del spec.
export function resolverModoBug(constante = 'known-bug') {
  const env = process.env.KNOWN_BUG_EXPECTED;
  if (process.argv.includes('--enforce-bugs')) return 'enforced';
  if (process.argv.includes('--expect-known-bugs')) return 'known-bug';
  if (env === '0' || env === 'false') return 'enforced';
  if (env === '1' || env === 'true') return 'known-bug';
  return constante;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const corto = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };

export async function correrSpec(nombre, fn, { modoBug = 'known-bug', timeoutMs = 300000 } = {}) {
  const modo = resolverModoBug(modoBug);
  const estado = { fallas: [], oks: 0, bugsPresentes: [], bugsCorregidos: [], notas: [] };
  console.log(`\n== ${nombre} ==  (modo de bugs conocidos: ${modo})`);
  const t = {
    modo,
    ok(cond, desc, detalle) {
      if (cond) { estado.oks++; console.log(`  ✓ ${desc}`); }
      else { estado.fallas.push(desc); console.log(`  ✗ ${desc}${detalle !== undefined ? '\n      ' + corto(detalle) : ''}`); }
      return !!cond;
    },
    eq(actual, esperado, desc) {
      const c = igual(actual, esperado);
      return t.ok(c, desc, c ? undefined : `esperado: ${corto(esperado)}\n      actual:   ${corto(actual)}`);
    },
    info(msg) { estado.notas.push(msg); console.log(`  · ${msg}`); },
    // Bug conocido: `presente` = true si el bug se reproduce ahora.
    bug(id, descripcion, presente) {
      if (modo === 'known-bug') {
        if (presente) { estado.bugsPresentes.push(id); console.log(`  ⚠ BUG CONOCIDO presente (esperado): ${descripcion}`); }
        else { estado.bugsCorregidos.push(id); console.log(`  ✓ el bug "${id}" YA NO se reproduce. Cambia MODO_BUG a 'enforced' en este spec para que su reaparición falle.`); }
      } else if (presente) { estado.fallas.push(`BUG presente: ${descripcion}`); console.log(`  ✗ BUG presente (modo enforced): ${descripcion}`); }
      else { estado.oks++; console.log(`  ✓ (enforced) el bug "${id}" no se reproduce`); }
    },
    noErrores(h, desc = 'sin errores de consola / página / red') {
      return t.ok(!h.errors.length, desc, h.errors.map(e => `[${e.kind}] ${e.text}`).join('\n      '));
    },
  };
  const watchdog = setTimeout(() => { console.log(`  ✗ tiempo máximo excedido (${timeoutMs} ms)`); console.log('RESULT: FALLA'); process.exit(1); }, timeoutMs);
  try { await fn(t); }
  catch (e) { estado.fallas.push('excepción: ' + e.message); console.log(`  ✗ EXCEPCIÓN: ${e.stack || e.message}`); }
  clearTimeout(watchdog);
  await shutdown();
  const resumen = `${estado.oks} ok, ${estado.fallas.length} fallas, ${estado.bugsPresentes.length} bug(s) conocido(s) presente(s)`;
  let resultado;
  if (estado.fallas.length) resultado = 'FALLA';
  else if (estado.bugsPresentes.length) resultado = 'KNOWN_BUG';
  else resultado = 'OK';
  console.log(`\n${nombre}: ${resultado === 'FALLA' ? 'FALLA' : (resultado === 'KNOWN_BUG' ? 'BUG CONOCIDO presente (esperado)' : 'OK')} — ${resumen}`);
  if (estado.bugsCorregidos.length) console.log(`  AVISO: bug(s) corregido(s) pero el spec sigue en modo known-bug: ${estado.bugsCorregidos.join(', ')}`);
  console.log(`RESULT: ${resultado}`);
  process.exit(resultado === 'FALLA' ? 1 : 0);
}
