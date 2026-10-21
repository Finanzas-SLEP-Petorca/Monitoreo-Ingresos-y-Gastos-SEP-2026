#!/usr/bin/env node
// Agregador del arnés de pruebas.
//
//   node tests/run.mjs                      fixture + golden master + todos los specs; tabla final PASS / FAIL / KNOWN_BUG
//   node tests/run.mjs golden               solo el golden master            (--update regenera el baseline, --full diff completo, --solo dashboard,sep)
//   node tests/run.mjs spec persistencia    uno o varios specs por nombre    (node tests/run.mjs spec smoke_tabs auth_flujo)
//   node tests/run.mjs list                 lista los specs disponibles
//
// Opciones: --expect-known-bugs | --enforce-bugs   (modo de los bugs conocidos; ver tests/specs/semilla_offline.mjs)
//           --jobs N     specs en paralelo (por defecto 1: es lo más estable)
//           -v           muestra la salida completa de cada prueba
// HTML bajo prueba: variable APP_HTML (ruta | @baseline | @<git-ref>); por defecto ../index.html.
// Código de salida: 0 si todo PASS/KNOWN_BUG; 1 si algo FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TESTS_DIR } from './lib/config.mjs';
import { resolverAppHtml } from './lib/html-source.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const verbose = flag('-v') || flag('--verbose');
const jobs = Math.max(1, Number(valor('--jobs')) || 1);

const SPECS_DIR = path.join(TESTS_DIR, 'specs');
const todosLosSpecs = () => fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.mjs')).map(f => f.replace(/\.mjs$/, '')).sort();

function ejecutar(nombre, script, extraArgs = []) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const salida = [];
    const child = spawn(process.execPath, [script, ...extraArgs], { cwd: path.dirname(TESTS_DIR), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { salida.push(d); if (verbose) process.stdout.write(d); });
    child.stderr.on('data', (d) => { salida.push(d); if (verbose) process.stderr.write(d); });
    child.on('close', (codigo) => {
      const texto = Buffer.concat(salida).toString('utf8');
      const m = /^RESULT:\s*(\w+)\s*$/m.exec(texto);
      let estado;
      if (m) estado = m[1] === 'OK' ? 'PASS' : (m[1] === 'KNOWN_BUG' ? 'KNOWN_BUG' : 'FAIL');
      else estado = codigo === 0 ? 'PASS' : 'FAIL';
      if (codigo !== 0 && estado !== 'FAIL') estado = 'FAIL';
      const corregido = /AVISO: bug\(s\) corregido\(s\)/.test(texto);
      resolve({ nombre, estado, codigo, segundos: (Date.now() - t0) / 1000, texto, corregido });
    });
  });
}

async function enPool(tareas, n) {
  const res = new Array(tareas.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, async () => {
    while (i < tareas.length) { const k = i++; res[k] = await tareas[k](); }
  }));
  return res;
}

function tabla(resultados) {
  const w1 = Math.max(8, ...resultados.map(r => r.nombre.length));
  const linea = (a, b, c) => `  ${a.padEnd(w1)}  ${b.padEnd(10)}  ${c}`;
  const out = [linea('prueba', 'resultado', 'tiempo'), linea('-'.repeat(w1), '-'.repeat(10), '------')];
  resultados.forEach(r => out.push(linea(r.nombre, r.estado, r.segundos.toFixed(1) + ' s' + (r.corregido ? "   <- el bug conocido YA NO se reproduce: cambia MODO_BUG a 'enforced'" : ''))));
  return out.join('\n');
}

function resumenFalla(r) {
  const lineas = r.texto.split('\n');
  // Spec: solo las líneas ✗ y su detalle; golden: el informe completo desde "Golden master:".
  const idx = lineas.findIndex(l => /^Golden master: /.test(l));
  if (idx >= 0) return lineas.slice(idx).join('\n');
  const malas = [];
  lineas.forEach((l, i) => { if (/^\s+✗/.test(l) || /EXCEPCIÓN|ERROR/.test(l)) { malas.push(l); for (let k = 1; k <= 3 && lineas[i + k] && /^\s{6}/.test(lineas[i + k]); k++) malas.push(lineas[i + k]); } });
  return malas.length ? malas.join('\n') : lineas.slice(-25).join('\n');
}

async function main() {
  const comando = args[0] && !args[0].startsWith('-') ? args[0] : 'todo';
  const origen = resolverAppHtml();
  const modoBugs = flag('--enforce-bugs') ? ['--enforce-bugs'] : (flag('--expect-known-bugs') ? ['--expect-known-bugs'] : []);

  if (comando === 'list') { todosLosSpecs().forEach(s => console.log(s)); return 0; }

  console.log(`HTML bajo prueba: ${origen.etiqueta}${process.env.APP_HTML ? '' : '  (APP_HTML sin definir: se usa ../index.html del árbol de trabajo)'}`);

  const resultados = [];
  const golden = () => ejecutar('golden', path.join(TESTS_DIR, 'golden', 'golden.mjs'), args.filter(a => ['--update', '--full'].includes(a)).concat(valor('--solo') ? ['--solo', valor('--solo')] : []));
  const fixture = () => ejecutar('fixture', path.join(TESTS_DIR, 'fixtures', 'generate.mjs'), ['--check']);
  const spec = (n) => () => ejecutar('spec:' + n, path.join(SPECS_DIR, n + '.mjs'), modoBugs);

  if (comando === 'golden') {
    resultados.push(await golden());
  } else if (comando === 'spec') {
    const pedidos = args.slice(1).filter(a => !a.startsWith('-') && a !== valor('--jobs'));
    const validos = todosLosSpecs();
    if (!pedidos.length) { console.error('Indica el spec: node tests/run.mjs spec <nombre>. Disponibles: ' + validos.join(', ')); return 2; }
    const malos = pedidos.filter(p => !validos.includes(p));
    if (malos.length) { console.error('Spec(s) desconocido(s): ' + malos.join(', ') + '. Disponibles: ' + validos.join(', ')); return 2; }
    resultados.push(...await enPool(pedidos.map(spec), jobs));
  } else if (comando === 'todo') {
    resultados.push(await fixture());
    console.log(`  fixture: ${resultados[0].estado}`);
    resultados.push(...await enPool(todosLosSpecs().map(n => () => ejecutar('spec:' + n, path.join(SPECS_DIR, n + '.mjs'), modoBugs).then(r => { console.log(`  ${r.nombre}: ${r.estado} (${r.segundos.toFixed(1)} s)`); return r; })), jobs));
    const g = await golden();
    console.log(`  golden: ${g.estado} (${g.segundos.toFixed(1)} s)`);
    resultados.push(g);
  } else {
    console.error(`Comando desconocido: ${comando}. Usa: (sin argumentos) | golden | spec <nombre> | list`);
    return 2;
  }

  console.log('\n' + tabla(resultados));
  const fallas = resultados.filter(r => r.estado === 'FAIL');
  const bugs = resultados.filter(r => r.estado === 'KNOWN_BUG');
  fallas.forEach((r) => { console.log(`\n--- ${r.nombre}: detalle de la falla ---\n${resumenFalla(r)}`); });
  console.log(`\nTotal: ${resultados.filter(r => r.estado === 'PASS').length} PASS, ${bugs.length} KNOWN_BUG, ${fallas.length} FAIL`);
  if (bugs.length) console.log(`KNOWN_BUG = bug conocido presente y esperado (no falla la suite): ${bugs.map(b => b.nombre).join(', ')}`);
  return fallas.length ? 1 : 0;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
