// Agregador del arnés contra el SDK REAL de Firestore + emulador. Corre cada spec en su propio proceso (contra UN emulador compartido
// que lanza este script) y muestra una tabla PASS / FAIL / BUG.
//
//   node tests/e2e-real/run.mjs                        # todos los specs contra el index.html del árbol (esperado: PASS o BUG documentado)
//   node tests/e2e-real/run.mjs 01 03                  # solo esos specs (prefijo del nombre)
//   node tests/e2e-real/run.mjs list                   # lista los specs
//   node tests/e2e-real/run.mjs --html @069f9dd        # contra otro HTML (igual que APP_HTML del arnés principal)
//   node tests/e2e-real/run.mjs --matriz               # árbol + @069f9dd (+ @baseline en el spec 06) y compara con lo esperado
//   node tests/e2e-real/run.mjs --enforce-bugs         # los BUG documentados cuentan como FALLA
//   node tests/e2e-real/run.mjs -v                     # muestra la salida completa de cada spec
// Código de salida: 0 si todo es PASS o BUG documentado (en --matriz: si todo coincide con lo esperado); 1 en otro caso.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DIR, CACHE_DIR, EMULATOR_VERSION, verificarInstalacion } from './lib/env.mjs';
import { lanzarEmuladorCompartido } from './lib/emulator.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';

// esperado: resultado esperado por versión del panel. PASS | BUG (bug real documentado, no falla) | FAIL (el spec debe detectar el defecto original)
const SPECS = [
  { id: '01', archivo: '01_tecleo_montos.mjs', titulo: 'Tecleo de montos (F-01)', esperado: { tree: 'BUG', '@069f9dd': 'FAIL' } },
  { id: '02', archivo: '02_metadata_cache.mjs', titulo: 'includeMetadataChanges + caché', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
  { id: '03', archivo: '03_offline_online.mjs', titulo: 'Offline / online', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
  { id: '04', archivo: '04_permisos.mjs', titulo: 'permission-denied real', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
  { id: '05', archivo: '05_claves_invalidas.mjs', titulo: 'Claves de mapa inválidas', esperado: { tree: 'BUG', '@069f9dd': 'FAIL' } },
  { id: '06', archivo: '06_siembra.mjs', titulo: 'Siembra (PR #56)', esperado: { tree: 'PASS', '@069f9dd': 'PASS', '@baseline': 'FAIL' }, tambien: ['@baseline'] },
  { id: '07', archivo: '07_documento_envenenado.mjs', titulo: 'Documento envenenado (PR #56)', esperado: { tree: 'BUG', '@069f9dd': 'BUG', '@baseline': 'FAIL' }, tambien: ['@baseline'] },
  { id: '08', archivo: '08_reglas_reales.mjs', titulo: 'firestore.rules reales', esperado: { tree: 'PASS', '@069f9dd': 'PASS' } },
  { id: '09', archivo: '09_multi_pestana.mjs', titulo: 'Dos pestañas (IndexedDB)', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
  { id: '10', archivo: '10_mes_cierre.mjs', titulo: 'Mes de cierre global y "Aplicar a todas"', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
  { id: '11', archivo: '11_honorarios.mjs', titulo: 'Honorarios por boleta (PR-1)', esperado: { tree: 'PASS', '@069f9dd': 'FAIL' } },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valorDe = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const verbose = flag('-v') || flag('--verbose');
const enforce = flag('--enforce-bugs');
const matriz = flag('--matriz');
const htmlArg = valorDe('--html');
const filtros = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '--html' && a !== 'list');

if (flag('list') || args[0] === 'list') {
  SPECS.forEach(s => console.log(`${s.id}  ${s.archivo.padEnd(32)} ${s.titulo}`));
  process.exit(0);
}
verificarInstalacion();

const seleccion = SPECS.filter(s => !filtros.length || filtros.some(f => s.id === f || s.archivo.startsWith(f)));
if (!seleccion.length) { console.error('Ningún spec coincide con: ' + filtros.join(' ')); process.exit(2); }

function correrSpec(spec, apphtml, env) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const e = { ...process.env, ...env };
    if (apphtml) e.APP_HTML = apphtml; else delete e.APP_HTML;
    const hijo = spawn(process.execPath, [path.join(E2E_DIR, 'specs', spec.archivo), ...(enforce ? ['--enforce-bugs'] : [])], { env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout.on('data', d => { salida += d; if (verbose) process.stdout.write(d); });
    hijo.stderr.on('data', d => { const s = String(d); if (!/Picked up JAVA_TOOL_OPTIONS/.test(s)) { salida += s; if (verbose) process.stderr.write(d); } });
    const limite = setTimeout(() => { try { hijo.kill('SIGKILL'); } catch (x) { /* ya terminó */ } salida += '\nRESULT: FALLA (tiempo máximo del spec: 20 min)\n'; }, 20 * 60 * 1000);
    hijo.on('close', (codigo) => {
      clearTimeout(limite);
      const m = /RESULT:\s*(\w+)/.exec(salida);
      const res = m ? m[1] : 'FALLA';
      const bugs = Array.from(salida.matchAll(/BUG REAL presente \[([^\]]+)\]/g), x => x[1]);
      const fallas = Array.from(salida.matchAll(/^ {2}FALLA {2}(.+)$/gm), x => x[1]);
      ok({ spec, resultado: res === 'OK' ? 'PASS' : res === 'KNOWN_BUG' ? 'BUG' : 'FAIL', bugs, fallas, segundos: Math.round((Date.now() - t0) / 1000), codigo, salida });
    });
  });
}

const etiquetaVersion = (v) => v === 'tree' ? 'PR (árbol)' : v;
const pad = (s, n) => String(s).padEnd(n);

const emu = await lanzarEmuladorCompartido();
process.env.E2E_EMU_PORT_REUSE = String(emu.port);
console.log(`Emulador de Firestore v${EMULATOR_VERSION} en 127.0.0.1:${emu.port} (compartido por todos los specs)`);
let salidaCodigo = 0;
const resultados = []; // { version, ...resultado }
try {
  const versiones = matriz ? ['tree', '@069f9dd', '@baseline'] : [htmlArg || 'tree'];
  for (const v of versiones) {
    const apphtml = v === 'tree' ? null : v;
    let etiqueta; try { etiqueta = resolverAppHtml(apphtml || undefined).etiqueta; } catch (e) { console.error(`No se pudo resolver ${v}: ${e.message}`); continue; }
    console.log(`\n######## ${etiquetaVersion(v)}: ${etiqueta}`);
    for (const spec of seleccion) {
      if (matriz && v === '@baseline' && !(spec.tambien || []).includes('@baseline')) continue;
      process.stdout.write(`  ${spec.id} ${pad(spec.titulo, 36)} ... `);
      const r = await correrSpec(spec, apphtml, {});
      r.version = v;
      resultados.push(r);
      try { const d = path.join(CACHE_DIR, 'logs', v.replace(/[^\w.@-]/g, '_')); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, spec.archivo.replace(/\.mjs$/, '.log')), r.salida); } catch (e) { /* solo informativo */ }
      console.log(`${pad(r.resultado, 5)} ${String(r.segundos).padStart(4)} s${r.bugs.length ? '  [bug real: ' + r.bugs.join(', ') + ']' : ''}${r.resultado === 'FAIL' ? `  (${r.fallas.length} aserciones FALLA)` : ''}`);
      if (!verbose && r.resultado === 'FAIL' && !matriz) console.log(r.salida.split('\n').filter(l => /FALLA/.test(l)).slice(0, 12).map(l => '      ' + l.trim()).join('\n'));
    }
  }
} finally {
  var avisoEmulador = emu.salida.join('').includes('Cannot find field: expectedCount')
    ? `\nAVISO: el emulador v${EMULATOR_VERSION} no entiende el campo "expectedCount" que el SDK web 10.12.0 envía al reanudar una escucha desde el caché\n       ("Cannot find field: expectedCount in message google.firestore.v1.Target"): toda recarga con caché poblada se queda sin respuesta.\n       Usa un emulador >= 1.19 (el valor por defecto es 1.19.8; ver README).` : '';
  await emu.detener();
}

// ---------------------------------------------------------------------------------------------------------------- tabla final
console.log('\n================ RESUMEN ================');
if (!matriz) {
  console.log(pad('Spec', 38) + pad('Resultado', 11) + 'Detalle');
  for (const r of resultados) console.log(pad(`${r.spec.id} ${r.spec.titulo}`, 38) + pad(r.resultado, 11) + (r.bugs.length ? 'BUG real documentado: ' + r.bugs.join(', ') : '') + (r.resultado === 'FAIL' ? `${r.fallas.length} aserciones FALLA` : ''));
  const hayFalla = resultados.some(r => r.resultado === 'FAIL');
  const hayBug = resultados.some(r => r.resultado === 'BUG');
  console.log(`\n${resultados.filter(r => r.resultado === 'PASS').length} PASS, ${resultados.filter(r => r.resultado === 'BUG').length} BUG documentado, ${resultados.filter(r => r.resultado === 'FAIL').length} FAIL`);
  if (hayBug && !hayFalla) console.log('(BUG = hallazgo real contra el SDK real, documentado en README.md; con --enforce-bugs cuenta como FAIL)');
  salidaCodigo = hayFalla ? 1 : 0;
} else {
  const versiones = ['tree', '@069f9dd', '@baseline'];
  console.log(pad('Spec', 38) + versiones.map(v => pad(etiquetaVersion(v) + ' (obtenido / esperado)', 32)).join(''));
  let desajustes = 0;
  for (const spec of seleccion) {
    let fila = pad(`${spec.id} ${spec.titulo}`, 38);
    for (const v of versiones) {
      const r = resultados.find(x => x.version === v && x.spec.id === spec.id);
      const esp = spec.esperado[v];
      if (!r) { fila += pad('—', 32); continue; }
      const coincide = !esp || r.resultado === esp;
      if (!coincide) desajustes++;
      fila += pad(`${r.resultado} / ${esp || '?'}${coincide ? '' : '  <-- NO COINCIDE'}`, 32);
    }
    console.log(fila);
  }
  console.log(`\n${desajustes ? desajustes + ' resultado(s) no coinciden con lo esperado' : 'Todo coincide con lo esperado'}`);
  salidaCodigo = desajustes ? 1 : 0;
}
if (avisoEmulador) console.log(avisoEmulador);
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(path.join(CACHE_DIR, 'ultimo-resultado.json'), JSON.stringify(resultados.map(r => ({ version: r.version, spec: r.spec.id, resultado: r.resultado, bugs: r.bugs, fallas: r.fallas, segundos: r.segundos })), null, 2)); } catch (e) { /* solo informativo */ }
process.exit(salidaCodigo);
