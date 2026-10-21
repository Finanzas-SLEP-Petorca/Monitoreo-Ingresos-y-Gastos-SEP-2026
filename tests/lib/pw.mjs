// Resuelve Playwright y el ejecutable de Chromium sin descargar nada.
//   1) import('playwright')                      -> si está instalado local o en NODE_PATH/ESM
//   2) createRequire(<global>/playwright)        -> /opt/node22/lib/node_modules (entorno cloud)
// Chromium: se usa el que Playwright trae por defecto; si no existe en disco (versión de Playwright
// distinta a la del navegador instalado en /opt/pw-browsers) se busca el chromium más nuevo allí.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Carpeta global de npm (p. ej. en un runner de CI donde se hizo `npm i -g playwright`).
function npmRootGlobal() {
  try { const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 8000 }); return r.status === 0 ? r.stdout.trim() : null; }
  catch (e) { return null; }
}

const RUTAS_GLOBALES = [
  process.env.PLAYWRIGHT_MODULE_PATH,
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright',
  '/usr/local/lib/node_modules/playwright',
].filter(Boolean);

let _pw = null;
export async function cargarPlaywright() {
  if (_pw) return _pw;
  try {
    const m = await import('playwright');
    _pw = m.chromium ? m : (m.default || m);
    return _pw;
  } catch (e) { /* cae a la ruta global */ }
  const candidatas = RUTAS_GLOBALES.slice();
  const raiz = npmRootGlobal();
  if (raiz) candidatas.push(path.join(raiz, 'playwright'));
  for (const ruta of candidatas) {
    try {
      if (!fs.existsSync(ruta)) continue;
      const req = createRequire(path.join(ruta, 'index.js'));
      _pw = req(ruta);
      return _pw;
    } catch (e) { /* siguiente */ }
  }
  throw new Error('No se pudo cargar Playwright (ni import("playwright") ni ' + candidatas.join(', ') + '). Instálalo (npm i -g playwright) o define PLAYWRIGHT_MODULE_PATH.');
}

// Busca un Chromium utilizable en PLAYWRIGHT_BROWSERS_PATH (o /opt/pw-browsers) si el por defecto no existe.
function chromiumDeRespaldo() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base).filter(d => /^chromium(_headless_shell)?-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const candidatos = [
        path.join(base, d, 'chrome-linux/chrome'),
        path.join(base, d, 'chrome-linux/headless_shell'),
        path.join(base, d, 'chrome-linux64/chrome'),
        path.join(base, d, 'chrome-headless-shell-linux64/chrome-headless-shell'),
      ];
      for (const c of candidatos) if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

export async function lanzarChromium(opts = {}) {
  const pw = await cargarPlaywright();
  const base = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], ...opts };
  if (process.env.CHROMIUM_PATH) return pw.chromium.launch({ ...base, executablePath: process.env.CHROMIUM_PATH });
  let porDefecto = null;
  try { porDefecto = pw.chromium.executablePath(); } catch (e) { /* sin ruta */ }
  if (porDefecto && fs.existsSync(porDefecto)) return pw.chromium.launch(base);
  const alt = chromiumDeRespaldo();
  if (!alt) throw new Error('No hay Chromium instalado (ni el de Playwright ni uno en /opt/pw-browsers). Define CHROMIUM_PATH.');
  return pw.chromium.launch({ ...base, executablePath: alt });
}

export async function versionPlaywright() {
  const pw = await cargarPlaywright();
  const raiz = npmRootGlobal();
  for (const ruta of [...RUTAS_GLOBALES, raiz && path.join(raiz, 'playwright')].filter(Boolean)) {
    try { return JSON.parse(fs.readFileSync(path.join(ruta, 'package.json'), 'utf8')).version; } catch (e) { /* sigue */ }
  }
  return pw.version || 'desconocida';
}
