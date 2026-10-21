// Reemplaza a https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js: el SDK REAL de Firestore (10.12.0).
// Se reexporta TODO lo del SDK (así cualquier nombre que index.html importe existe); solo se cambian tres cosas:
//   1) getFirestore() conecta la instancia al EMULADOR local (connectFirestoreEmulator) ANTES de que se use. Nunca producción.
//   2) setDoc / writeBatch / onSnapshot / enableIndexedDbPersistence se envuelven SOLO para dejar una bitácora en window.__fb
//      (writes / eventos de snapshot / resultado de la persistencia). Delegan todo en el SDK real: mismos argumentos, mismas
//      promesas (la que recibe la app ES la del SDK), mismo momento de los callbacks.
//   3) window.__fb expone db y el namespace completo del SDK (disableNetwork, enableNetwork, waitForPendingWrites, …) para las pruebas.
import * as FS from 'firebase/firestore';
export * from 'firebase/firestore';

const cfg = (typeof window !== 'undefined' && window.__E2E) || {};
const fb = (window.__fb = window.__fb || {});
fb.fs = FS;
fb.writes = fb.writes || [];
fb.events = fb.events || [];
fb.persistencia = fb.persistencia || null;
fb.t0 = performance.now();
const ahora = () => Math.round(performance.now() - fb.t0);

const esSentinela = (v) => v && typeof v === 'object' && typeof v._methodName === 'string' && /^(serverTimestamp|deleteField|increment|arrayUnion|arrayRemove)$/.test(v._methodName);
function plano(v) {
  if (esSentinela(v)) return { __sentinel: v._methodName };
  if (v && typeof v === 'object' && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(plano);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).map(k => [k, plano(v[k])]));
  return v;
}
const errPlano = (e) => ({ code: e && e.code, name: e && e.name, message: String((e && e.message) || e).slice(0, 300) });
let nBatch = 0;

export function getFirestore(...args) {
  const db = FS.getFirestore(...args);
  if (!fb.db) {
    FS.connectFirestoreEmulator(db, cfg.emuHost || '127.0.0.1', cfg.emuPort);
    fb.db = db;
    fb.emu = { host: cfg.emuHost || '127.0.0.1', port: cfg.emuPort };
  }
  return db;
}

export async function enableIndexedDbPersistence(...args) {
  try { const r = await FS.enableIndexedDbPersistence(...args); fb.persistencia = { ok: true }; return r; }
  catch (e) { fb.persistencia = { ok: false, ...errPlano(e) }; throw e; }
}

export function setDoc(ref, data, options) {
  const rec = { op: 'setDoc', path: ref.path, payload: plano(data), options: options || null, status: 'pending', t: ahora() };
  fb.writes.push(rec);
  let p;
  try { p = FS.setDoc(ref, data, options); }
  catch (e) { rec.status = 'threw'; rec.error = errPlano(e); throw e; }
  p.then(() => { rec.status = 'acked'; rec.tAck = ahora(); }, (e) => { rec.status = 'rejected'; rec.error = errPlano(e); rec.tAck = ahora(); });
  return p;
}

export function writeBatch(db) {
  const real = FS.writeBatch(db);
  const id = ++nBatch;
  const ops = [];
  const w = {
    set(ref, data, options) {
      const rec = { op: 'batch.set', path: ref.path, payload: plano(data), options: options || null, batchId: id, status: 'queued', t: ahora() };
      fb.writes.push(rec); ops.push(rec);
      try { real.set(ref, data, options); } catch (e) { rec.status = 'threw'; rec.error = errPlano(e); throw e; }
      return w;
    },
    update(ref, ...a) {
      const rec = { op: 'batch.update', path: ref.path, payload: plano(a), batchId: id, status: 'queued', t: ahora() };
      fb.writes.push(rec); ops.push(rec);
      try { real.update(ref, ...a); } catch (e) { rec.status = 'threw'; rec.error = errPlano(e); throw e; }
      return w;
    },
    delete(ref) {
      const rec = { op: 'batch.delete', path: ref.path, batchId: id, status: 'queued', t: ahora() };
      fb.writes.push(rec); ops.push(rec);
      real.delete(ref);
      return w;
    },
    commit() {
      ops.forEach(o => { if (o.status === 'queued') o.status = 'pending'; });
      const p = real.commit();
      p.then(() => ops.forEach(o => { if (o.status === 'pending') { o.status = 'acked'; o.tAck = ahora(); } }),
        (e) => ops.forEach(o => { if (o.status === 'pending') { o.status = 'rejected'; o.error = errPlano(e); o.tAck = ahora(); } }));
      return p;
    },
  };
  return w;
}

export function onSnapshot(...args) {
  // Solo se registran los snapshots de la COLECCIÓN del panel (un listener sobre sep_carga_rbd). El callback original se invoca igual.
  const iCb = args.findIndex(a => typeof a === 'function');
  if (iCb >= 0) {
    const orig = args[iCb];
    args[iCb] = (snap) => {
      try {
        const m = snap.metadata || {};
        const cambios = typeof snap.docChanges === 'function' ? snap.docChanges() : [];
        const ev = { t: ahora(), fromCache: !!m.fromCache, hasPendingWrites: !!m.hasPendingWrites, size: snap.size, empty: !!snap.empty, nCambios: cambios.length, ids: cambios.map(c => c.type + ':' + c.doc.id).slice(0, 12) };
        // Gancho opcional de las pruebas: window.__fb.sonda = (snap) => valor (se guarda en el evento; no altera nada).
        if (typeof fb.sonda === 'function') { try { ev.sonda = fb.sonda(snap); } catch (e) { ev.sonda = 'ERR ' + e.message; } }
        fb.events.push(ev);
      } catch (e) { /* la bitácora nunca debe romper al panel */ }
      return orig(snap);
    };
  }
  return FS.onSnapshot(...args);
}
