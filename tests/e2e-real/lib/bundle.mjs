// Empaqueta (esbuild) el SDK REAL de Firebase 10.12.0 en los módulos que index.html pide a gstatic:
//   firebase-app.js, firebase-firestore.js (+ un chunk compartido, para que ambos usen la MISMA copia de @firebase/app),
//   firebase-auth.js (stub). Salida en E2E_HOME/dist (fuera del repo). Se reconstruye solo si cambian las fuentes.
import fs from 'node:fs';
import path from 'node:path';
import { E2E_DIR, E2E_HOME, DIST_DIR, requireDeps, verificarInstalacion } from './env.mjs';

const FUENTES = ['entry-app.js', 'entry-firestore.js', 'auth-stub.js'].map(f => path.join(E2E_DIR, 'bundle', f));

export async function construirBundle({ forzar = false } = {}) {
  verificarInstalacion();
  const salidaOk = ['firebase-app.js', 'firebase-firestore.js', 'firebase-auth.js'].every(f => fs.existsSync(path.join(DIST_DIR, f)));
  if (salidaOk && !forzar) {
    const tSalida = Math.min(...['firebase-app.js', 'firebase-firestore.js', 'firebase-auth.js'].map(f => fs.statSync(path.join(DIST_DIR, f)).mtimeMs));
    if (FUENTES.every(f => fs.statSync(f).mtimeMs < tSalida)) return DIST_DIR;
  }
  const esbuild = requireDeps('esbuild');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: { 'firebase-app': path.join(E2E_DIR, 'bundle', 'entry-app.js'), 'firebase-firestore': path.join(E2E_DIR, 'bundle', 'entry-firestore.js') },
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', outdir: DIST_DIR,
    nodePaths: [path.join(E2E_HOME, 'node_modules')], minify: false, sourcemap: false, logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  fs.copyFileSync(path.join(E2E_DIR, 'bundle', 'auth-stub.js'), path.join(DIST_DIR, 'firebase-auth.js'));
  return DIST_DIR;
}
