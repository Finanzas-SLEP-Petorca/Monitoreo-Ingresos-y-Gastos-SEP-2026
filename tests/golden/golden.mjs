// CLI del golden master.
//   node tests/golden/golden.mjs                  compara contra tests/golden/baseline.json (exit 1 si hay diferencias)
//   node tests/golden/golden.mjs --update         regenera el baseline con el HTML bajo prueba (APP_HTML)
//   opciones: --solo dashboard,sep   (secciones)   --full (diff completo)   --out archivo.json (guarda la captura actual)
import fs from 'node:fs';
import path from 'node:path';
import { capturar, SECCIONES } from './capture.mjs';
import { comparar, imprimirInforme } from './diff.mjs';
import { shutdown, cargarFixture } from '../lib/boot.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';
import { versionPlaywright } from '../lib/pw.mjs';
import { sha1 } from '../lib/capture-utils.mjs';
import { TESTS_DIR, BASELINE_REF, TMP_DIR } from '../lib/config.mjs';

const BASELINE = path.join(TESTS_DIR, 'golden', 'baseline.json');

function argumento(nombre) { const i = process.argv.indexOf(nombre); return i >= 0 ? process.argv[i + 1] : null; }

// Los textos se guardan como arreglos de líneas (diffs legibles en git).
function aFormatoBaseline(res) {
  const out = { views: {}, datos: res.datos, exports: {} };
  Object.entries(res.views).forEach(([k, v]) => { out.views[k] = { ...v, text: v.text.split('\n') }; });
  Object.entries(res.exports).forEach(([k, v]) => { out.exports[k] = v.printWrap !== undefined ? { ...v, printWrap: v.printWrap ? v.printWrap.split('\n') : [] } : v; });
  return out;
}

export async function ejecutarGolden({ update = false, full = false, solo = null, out = null, log = console.log } = {}) {
  const origen = resolverAppHtml();
  const htmlSha1 = sha1(fs.readFileSync(origen.ruta));
  const fixtureSha1 = sha1(fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'default.json')));
  log(`Golden master sobre: ${origen.etiqueta}`);
  const t0 = Date.now();
  const res = await capturar({ log, solo });
  const actual = aFormatoBaseline(res);
  log(`Captura completa: ${Object.keys(actual.views).length} vistas, ${Object.keys(actual.datos).length} datos, ${Object.keys(actual.exports).length} exportaciones (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ meta: {}, ...actual }, null, 1)); }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'golden-actual.json'), JSON.stringify(actual, null, 1));

  const existe = fs.existsSync(BASELINE);
  const previo = existe ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  if (solo && update) throw new Error('--solo no se puede combinar con --update (el baseline debe capturarse completo).');

  if (update) {
    const meta = {
      esquema: 1,
      baseline_ref: BASELINE_REF,
      html_bajo_prueba: origen.etiqueta,
      html_sha1: htmlSha1,
      fixture_sha1: fixtureSha1,
      fixture: cargarFixture('default').meta,
      playwright: await versionPlaywright(),
      node: process.version,
      aviso: 'Regenerar SOLO cuando un cambio de cifras/texto sea intencional y esté revisado (ver tests/README.md).',
    };
    if (previo) {
      const inf = comparar(previo, actual, { maxLineas: 10, full });
      if (!inf.ok) { log('\nCambios respecto al baseline anterior:'); imprimirInforme(inf, log); }
      else log('\nEl baseline no cambia (captura idéntica).');
    }
    fs.writeFileSync(BASELINE, JSON.stringify({ meta, ...actual }, null, 1) + '\n');
    log(`\nBaseline escrito: ${path.relative(process.cwd(), BASELINE)} (${(fs.statSync(BASELINE).size / 1024).toFixed(0)} KB)`);
    return { ok: true, actualizado: true };
  }

  if (!existe) { log('\nFALLA: no existe tests/golden/baseline.json. Genéralo con: APP_HTML=@baseline node tests/run.mjs golden --update'); return { ok: false }; }
  if (previo.meta && previo.meta.fixture_sha1 && previo.meta.fixture_sha1 !== fixtureSha1) {
    log('\nAVISO: el fixture (tests/fixtures/default.json) cambió desde que se generó el baseline; las diferencias pueden venir del fixture. Regenera el baseline si fue intencional.');
  }
  if (previo.meta && previo.meta.html_sha1 !== htmlSha1) log(`(El HTML bajo prueba es distinto del usado para generar el baseline: ${previo.meta.html_bajo_prueba})`);
  let base = previo;
  if (solo) { // solo comparar lo que corresponde a las secciones ejecutadas
    const claves = (g) => new Set(Object.keys(actual[g] || {}));
    base = { views: {}, datos: {}, exports: {} };
    ['views', 'datos', 'exports'].forEach(g => Object.keys(previo[g] || {}).forEach(k => { if (claves(g).has(k)) base[g][k] = previo[g][k]; }));
  }
  const informe = comparar(base, actual, { maxLineas: 16, full });
  log('');
  imprimirInforme(informe, log);
  log(informe.ok ? '\nGOLDEN: OK (idéntico a la línea base)' : '\nGOLDEN: FALLA (hay diferencias contra la línea base)');
  return { ok: informe.ok, informe };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const update = process.argv.includes('--update');
  const full = process.argv.includes('--full');
  const solo = argumento('--solo') ? argumento('--solo').split(',') : null;
  const out = argumento('--out');
  if (solo) { const validas = SECCIONES.map(s => s.nombre); const mal = solo.filter(s => !validas.includes(s)); if (mal.length) { console.error('Secciones inválidas: ' + mal.join(',') + '. Válidas: ' + validas.join(', ')); process.exit(2); } }
  let r;
  try { r = await ejecutarGolden({ update, full, solo, out }); }
  catch (e) { console.error('ERROR en golden: ' + (e.stack || e.message)); r = { ok: false }; }
  await shutdown();
  process.exit(r.ok ? 0 : 1);
}
