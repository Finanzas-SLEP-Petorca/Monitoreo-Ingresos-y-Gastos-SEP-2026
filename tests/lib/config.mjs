// Constantes compartidas del arnés.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(TESTS_DIR, '..');
export const CACHE_DIR = path.join(TESTS_DIR, '.cache'); // ignorado por git
export const TMP_DIR = path.join(TESTS_DIR, '.tmp');     // ignorado por git (descargas, etc.)

// Commit de origin/main que se usa como "línea base" del golden master (index.html de ese commit).
export const BASELINE_REF = '0f16ace';

// URLs de Firebase que el panel importa (módulos ES) y que el arnés reemplaza por mocks locales.
export const FIREBASE_VERSION = '10.12.0';
export const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
export const FIREBASE_MODULES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'];

// Colección Firestore del panel.
export const COLLECTION = 'sep_carga_rbd';

// Correo que SÍ está en ALLOWED_EMAILS de index.html (y también en ADMIN_EMAILS).
export const EMAIL_AUTORIZADO = 'wilson.rojas@sleppetorca.gob.cl';
// Correo autorizado pero NO admin (no ve "Revisar duplicados").
export const EMAIL_AUTORIZADO_NO_ADMIN = 'catalina.brito@sleppetorca.gob.cl';
// Correo que NO está en ALLOWED_EMAILS.
export const EMAIL_NO_AUTORIZADO = 'intruso@example.com';

// Fecha congelada para todo el arnés (mediodía hora Chile ≈ 15:00 UTC, dentro del mes "ultimo_mes" de DATA).
export const FECHA_CONGELADA = '2026-08-19T15:00:00.000Z';
export const TIMEZONE = 'America/Santiago';
export const LOCALE = 'es-CL';
