// Constantes y resolución de dependencias del arnés contra el SDK REAL de Firestore.
// Las dependencias pesadas (firebase, esbuild, rules-unit-testing, el .jar del emulador) viven FUERA del repo, en E2E_HOME
// (por defecto /home/user/.e2e-real; las instala setup.sh). Nada de esto se versiona.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TESTS_DIR = path.resolve(E2E_DIR, '..');
export const REPO_DIR = path.resolve(TESTS_DIR, '..');
export const E2E_HOME = process.env.E2E_HOME || '/home/user/.e2e-real';
// Por defecto 1.19.8: el emulador 1.15.1 NO entiende el campo `expectedCount` que el SDK web 10.12.0 envía al REANUDAR una escucha
// desde el caché ("Cannot find field: expectedCount in message google.firestore.v1.Target"): toda recarga con caché poblada se queda
// sin respuesta. Con EMULATOR_VERSION=1.15.1 se puede reproducir (ver README).
export const EMULATOR_VERSION = process.env.EMULATOR_VERSION || '1.19.8';
export const EMULATOR_JAR = path.join(E2E_HOME, 'emulator', `cloud-firestore-emulator-v${EMULATOR_VERSION}.jar`);
export const DIST_DIR = path.join(E2E_HOME, 'dist');           // bundle del SDK real (lo genera lib/bundle.mjs)
export const CACHE_DIR = path.join(E2E_DIR, '.cache');          // ignorado por git (HTML de otras versiones, etc.)
export const FIREBASE_VERSION = '10.12.0';
export const FIREBASE_URL_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

// Proyecto Firebase que usa index.html (firebaseConfig.projectId): el emulador separa los datos por proyecto, así que
// los datos y las reglas se cargan con ESTE id para que el panel los vea.
export const PROJECT_ID = 'slep-petorca-finanzas-permisos';
export const COLLECTION = 'sep_carga_rbd';
export const EMULATOR_HOST = '127.0.0.1';
export const EMULATOR_PORT = Number(process.env.E2E_EMU_PORT || 8089);

// Usuarios de prueba (mismos correos que el arnés con mocks, ver tests/lib/config.mjs).
export { EMAIL_AUTORIZADO, EMAIL_AUTORIZADO_NO_ADMIN, EMAIL_NO_AUTORIZADO } from '../../lib/config.mjs';

export function verificarInstalacion() {
  const faltan = [];
  if (!fs.existsSync(path.join(E2E_HOME, 'node_modules', 'firebase', 'package.json'))) faltan.push('firebase');
  if (!fs.existsSync(path.join(E2E_HOME, 'node_modules', 'esbuild', 'package.json'))) faltan.push('esbuild');
  if (!fs.existsSync(path.join(E2E_HOME, 'node_modules', '@firebase', 'rules-unit-testing', 'package.json'))) faltan.push('@firebase/rules-unit-testing');
  if (!fs.existsSync(EMULATOR_JAR)) faltan.push(`emulador (${EMULATOR_JAR})`);
  if (faltan.length) {
    throw new Error(`Faltan dependencias del arnés e2e-real: ${faltan.join(', ')}.\nEjecuta primero: bash tests/e2e-real/setup.sh   (E2E_HOME=${E2E_HOME})`);
  }
}

// require() desde E2E_HOME (CommonJS de esbuild y rules-unit-testing) e import() dinámico de módulos ESM de allí.
export const requireDeps = createRequire(path.join(E2E_HOME, 'package.json'));
export async function importDep(spec) {
  const resuelto = requireDeps.resolve(spec);
  return import(resuelto.startsWith('/') ? 'file://' + resuelto : resuelto);
}
