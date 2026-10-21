// Reemplaza a firebase-auth.js: NO es el SDK real de Auth (el emulador de Auth está fuera de alcance); solo entrega un usuario ya
// autenticado (window.__E2E.user, un correo de ALLOWED_EMAILS de index.html) con la API mínima que usa el panel.
// Las reglas de seguridad reales (firestore.rules) se prueban aparte con @firebase/rules-unit-testing (spec 08), porque el SDK
// de Firestore del navegador no tiene proveedor de Auth y por eso sus requests al emulador van SIN token.
const cfg = window.__E2E || {};
const listeners = new Set();
let usuario = cfg.user ? { email: cfg.user, uid: 'uid-' + cfg.user, emailVerified: true } : null;
const auth = { currentUser: usuario, app: null };
export const getAuth = (app) => { auth.app = app; return auth; };
export const onAuthStateChanged = (_auth, cb) => { listeners.add(cb); setTimeout(() => cb(usuario), 0); return () => listeners.delete(cb); };
export const signOut = async () => { usuario = null; auth.currentUser = null; listeners.forEach(cb => setTimeout(() => cb(null), 0)); };
export const isSignInWithEmailLink = () => false;
export const sendSignInLinkToEmail = async () => {};
export const signInWithEmailLink = async () => { throw Object.assign(new Error('stub'), { code: 'auth/invalid-action-code' }); };
export const setPersistence = async () => {};
export const browserLocalPersistence = {}; export const browserSessionPersistence = {}; export const inMemoryPersistence = {};
export const onIdTokenChanged = onAuthStateChanged;
