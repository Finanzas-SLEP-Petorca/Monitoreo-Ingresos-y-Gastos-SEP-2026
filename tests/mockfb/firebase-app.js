// Mock de https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js (lo sirve boot.mjs vía page.route).
// Toda la lógica vive en core.js (window.__mockfb). Si el panel importa un nombre que NO está aquí,
// el módulo falla al enlazar ("does not provide an export named ...") y la prueba falla: añádelo.
const api = window.__mockfb.api.app;
export const initializeApp = api.initializeApp;
export const getApp = api.getApp;
export const getApps = api.getApps;
export const deleteApp = api.deleteApp;
export const setLogLevel = api.setLogLevel;
export const SDK_VERSION = api.SDK_VERSION;
export const FirebaseError = api.FirebaseError;
