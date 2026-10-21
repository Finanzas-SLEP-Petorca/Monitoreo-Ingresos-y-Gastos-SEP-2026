// Mock de https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js (ver core.js).
const api = window.__mockfb.api.auth;
export const getAuth = api.getAuth;
export const onAuthStateChanged = api.onAuthStateChanged;
export const onIdTokenChanged = api.onIdTokenChanged;
export const isSignInWithEmailLink = api.isSignInWithEmailLink;
export const signInWithEmailLink = api.signInWithEmailLink;
export const sendSignInLinkToEmail = api.sendSignInLinkToEmail;
export const signOut = api.signOut;
export const setPersistence = api.setPersistence;
export const browserLocalPersistence = api.browserLocalPersistence;
export const browserSessionPersistence = api.browserSessionPersistence;
export const inMemoryPersistence = api.inMemoryPersistence;
