/* eslint-disable no-undef */
// Núcleo del mock de Firebase (Auth + Firestore) para las pruebas. Es un script CLÁSICO que se inyecta
// con addInitScript ANTES de cualquier script de la página, y deja todo en `window.__mockfb`.
// Los tres módulos ES que reemplazan a gstatic (firebase-app.js, firebase-auth.js, firebase-firestore.js)
// son envoltorios finos que reexportan `window.__mockfb.api.*`.
//
// Configuración: lo que haya en `window.__MOCKFB_CONFIG` (lo define boot.mjs) antes de cargar este archivo:
//   { user: {email}|null, seed: {id: doc}, seedCache: bool, offline: bool, echoDelay, ackDelay, authDelay, cacheFirst }
//
// Semántica de Firestore que se imita (porque el panel depende de ella):
//   - setDoc(..., {merge:true}): fusión PROFUNDA de mapas anidados; deleteField() borra la clave;
//     serverTimestamp() se resuelve a un Timestamp; un mapa vacío `{}` bajo merge REEMPLAZA el mapa
//     existente (igual que el SDK real, que lo trata como "hoja"); los arreglos reemplazan.
//   - setDoc sin merge reemplaza el documento; deleteField() fuera de merge/update es un error.
//   - `undefined` en un valor es un error (invalid-argument) como en el SDK real.
//   - un nombre de campo (clave de mapa) vacío, "__algo__" o de más de 1500 bytes UTF-8 es invalid-argument y el write ENTERO
//     se rechaza (en el SDK real los dos primeros al llamar a setDoc y el tercero lo rechaza el servidor).
//   - writeBatch: set/update/delete/commit, máx. 500 operaciones, no reutilizable tras commit.
//   - Eco local: cada write se aplica al instante en la vista local, los listeners reciben un snapshot
//     asíncrono con hasPendingWrites=true (y lastModifiedAt=null: serverTimestamp aún sin resolver);
//     después de `ackDelay` el "servidor" lo confirma, el timestamp se resuelve y llega un 2º snapshot.
//   - Sin conexión: los writes quedan en cola (sus promesas NO resuelven) y los listeners reciben la
//     vista del caché con metadata.fromCache=true (vacía si el caché no tiene datos).
//   - Cualquier API no soportada lanza un error ruidoso (MockFirebaseUnsupportedError); un import de un
//     nombre que el mock no exporta falla al enlazar el módulo ("does not provide an export named").
(function () {
  'use strict';
  if (window.__mockfb) return;

  const CFG = window.__MOCKFB_CONFIG || {};
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const COLLECTION_DEFAULT = 'sep_carga_rbd';

  // ---------------------------------------------------------------- errores
  class FirebaseError extends Error {
    constructor(code, message) {
      super(message || `Firebase: ${code}`);
      this.name = 'FirebaseError';
      this.code = code;
    }
  }
  class MockFirebaseUnsupportedError extends Error {
    constructor(api) {
      super(`[mockfb] API de Firebase no soportada por el mock: ${api}. Impleméntala en tests/mockfb/core.js o evita usarla.`);
      this.name = 'MockFirebaseUnsupportedError';
      this.api = api;
    }
  }
  const unsupported = (api) => function () { throw new MockFirebaseUnsupportedError(api); };

  // ---------------------------------------------------------------- Timestamp / FieldValue
  class Timestamp {
    constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
    static now() { return Timestamp.fromMillis(Date.now()); }
    static fromDate(d) { return Timestamp.fromMillis(d.getTime()); }
    static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)); }
    toDate() { return new Date(this.toMillis()); }
    toMillis() { return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6); }
    isEqual(o) { return !!o && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
    valueOf() { return this.toMillis(); }
    toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
  }
  // Marca interna: serverTimestamp aún no confirmado por el "servidor" (se ve como null en data()).
  class PendingServerTimestamp { constructor(estimateMs) { this.estimateMs = estimateMs; } }

  class FieldValue {
    constructor(kind, arg) { this._kind = kind; this._arg = arg; }
  }
  const deleteField = () => new FieldValue('delete');
  const serverTimestamp = () => new FieldValue('serverTimestamp');
  const increment = (n) => { if (typeof n !== 'number') throw new FirebaseError('invalid-argument', 'increment() requiere un número'); return new FieldValue('increment', n); };
  const arrayUnion = (...a) => new FieldValue('arrayUnion', a);
  const arrayRemove = (...a) => new FieldValue('arrayRemove', a);

  // ---------------------------------------------------------------- utilidades de datos
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof FieldValue) && !(v instanceof Timestamp) && !(v instanceof PendingServerTimestamp)
    && !(v instanceof Date) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

  function cloneData(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
    if (v instanceof PendingServerTimestamp) return new PendingServerTimestamp(v.estimateMs);
    if (v instanceof Date) return new Date(v.getTime());
    if (Array.isArray(v)) return v.map(cloneData);
    const o = {};
    Object.keys(v).forEach(k => { o[k] = cloneData(v[k]); });
    return o;
  }

  // Representación JSON-segura (para bitácora, store y firmas). Sentinelas y timestamps quedan marcados.
  function toLoggable(v) {
    if (v === undefined) return { __undefined: true };
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof FieldValue) {
      if (v._kind === 'delete') return { __sentinel: 'deleteField' };
      if (v._kind === 'serverTimestamp') return { __sentinel: 'serverTimestamp' };
      return { __sentinel: v._kind, arg: toLoggable(v._arg) };
    }
    if (v instanceof Timestamp) return { __ts: v.toMillis() };
    if (v instanceof PendingServerTimestamp) return { __pendingServerTimestamp: true };
    if (v instanceof Date) return { __date: v.getTime() };
    if (Array.isArray(v)) return v.map(toLoggable);
    const o = {};
    Object.keys(v).forEach(k => { o[k] = toLoggable(v[k]); });
    return o;
  }
  // Inversa mínima para el fixture: {__ts: ms} -> Timestamp.
  function fromLoggable(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(fromLoggable);
    if (Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    const o = {};
    Object.keys(v).forEach(k => { o[k] = fromLoggable(v[k]); });
    return o;
  }
  function sig(v) { return JSON.stringify(toLoggable(v)); }

  function assertNoUndefined(v, where) {
    if (v === undefined) throw new FirebaseError('invalid-argument', `Function ${where} called with invalid data. Unsupported field value: undefined`);
    if (v === null || typeof v !== 'object' || v instanceof FieldValue || v instanceof Timestamp || v instanceof Date) return;
    if (Array.isArray(v)) { v.forEach(x => assertNoUndefined(x, where)); return; }
    Object.keys(v).forEach(k => assertNoUndefined(v[k], where));
  }

  // Nombres de campo (claves de mapa) que Firestore rechaza: vacíos, "__algo__" (reservados) y de más de 1500 bytes UTF-8.
  // El SDK real lanza los dos primeros al llamar a setDoc y el servidor rechaza el tercero; el mock lanza los tres al
  // llamar (invalid-argument), igual que en producción: un solo concepto inválido hace fallar el write ENTERO del RBD.
  function assertFieldNames(v, where, ruta) {
    if (v === null || typeof v !== 'object' || v instanceof FieldValue || v instanceof Timestamp || v instanceof Date) return;
    if (Array.isArray(v)) { v.forEach(x => assertFieldNames(x, where, ruta)); return; }
    Object.keys(v).forEach(k => {
      const donde = (ruta ? ruta + '.' : '') + k;
      if (k === '') throw new FirebaseError('invalid-argument', `Function ${where} called with invalid data. Document fields must not be empty (found in ${ruta || 'the document root'})`);
      if (/^__.*__$/.test(k)) throw new FirebaseError('invalid-argument', `Function ${where} called with invalid data. Document fields cannot begin and end with "__" (found in field ${donde})`);
      if (new TextEncoder().encode(k).length > 1500) throw new FirebaseError('invalid-argument', `Function ${where} called with invalid data. Field names must be at most 1500 bytes (found in ${ruta || 'the document root'})`);
      assertFieldNames(v[k], where, donde);
    });
  }

  // Resuelve un FieldValue sobre el valor existente (increment/arrayUnion/arrayRemove) o a timestamp.
  function resolveSentinel(fv, existing, tsValue) {
    switch (fv._kind) {
      case 'serverTimestamp': return tsValue;
      case 'increment': return (typeof existing === 'number' ? existing : 0) + fv._arg;
      case 'arrayUnion': {
        const base = Array.isArray(existing) ? existing.slice() : [];
        fv._arg.forEach(x => { if (!base.some(y => sig(y) === sig(x))) base.push(cloneData(x)); });
        return base;
      }
      case 'arrayRemove': {
        const base = Array.isArray(existing) ? existing : [];
        return base.filter(y => !fv._arg.some(x => sig(x) === sig(y)));
      }
      default: throw new MockFirebaseUnsupportedError('FieldValue.' + fv._kind);
    }
  }

  // Fusión profunda estilo setDoc(..., {merge:true}). Devuelve `target` modificado.
  function mergeInto(target, src, tsValue) {
    Object.keys(src).forEach(k => {
      const v = src[k];
      if (v instanceof FieldValue) {
        if (v._kind === 'delete') { delete target[k]; return; }
        target[k] = resolveSentinel(v, target[k], tsValue);
        return;
      }
      if (isPlainObject(v)) {
        if (Object.keys(v).length === 0) { target[k] = {}; return; } // mapa vacío = hoja: reemplaza (como el SDK real)
        const dest = isPlainObject(target[k]) ? target[k] : {};
        target[k] = mergeInto(dest, v, tsValue);
        return;
      }
      target[k] = cloneData(v);
    });
    return target;
  }
  // Reemplazo completo (setDoc sin merge): resuelve sentinelas; deleteField no está permitido.
  function resolveFull(src, tsValue) {
    const out = {};
    Object.keys(src).forEach(k => {
      const v = src[k];
      if (v instanceof FieldValue) {
        if (v._kind === 'delete') throw new FirebaseError('invalid-argument', 'Function setDoc() called with invalid data. FieldValue.delete() can only be used with update() and set() with {merge:true} (found in field ' + k + ')');
        out[k] = resolveSentinel(v, undefined, tsValue);
      } else if (isPlainObject(v)) out[k] = resolveFull(v, tsValue);
      else out[k] = cloneData(v);
    });
    return out;
  }
  // updateDoc: las claves con "." son rutas de campo; los objetos anidados reemplazan el campo completo.
  function applyUpdate(existing, data, tsValue) {
    const doc = cloneData(existing);
    Object.keys(data).forEach(key => {
      const path = key.split('.');
      let cur = doc;
      for (let i = 0; i < path.length - 1; i++) {
        if (!isPlainObject(cur[path[i]])) cur[path[i]] = {};
        cur = cur[path[i]];
      }
      const last = path[path.length - 1];
      const v = data[key];
      if (v instanceof FieldValue) {
        if (v._kind === 'delete') delete cur[last]; else cur[last] = resolveSentinel(v, cur[last], tsValue);
      } else if (isPlainObject(v)) cur[last] = resolveFull(v, tsValue);
      else cur[last] = cloneData(v);
    });
    return doc;
  }
  function applyOp(existing, op, tsValue) {
    // existing: dato actual (o undefined si no existe). Devuelve el nuevo dato o undefined (borrado).
    if (op.kind === 'delete') return undefined;
    if (op.kind === 'update') {
      if (existing === undefined) throw new FirebaseError('not-found', `No document to update: ${op.path}`);
      return applyUpdate(existing, op.data, tsValue);
    }
    if (op.merge) return mergeInto(existing === undefined ? {} : cloneData(existing), op.data, tsValue);
    return resolveFull(op.data, tsValue);
  }

  // ---------------------------------------------------------------- estado
  const S = {
    server: new Map(),   // path -> datos confirmados
    cache: new Map(),    // path -> lo que el cliente tiene en caché local (para vista sin conexión)
    queue: [],           // writes locales aún no confirmados: {id, ops, promise handlers, status}
    online: !CFG.offline,
    listeners: new Set(),
    writes: [],          // bitácora pública
    events: [],          // bitácora de snapshots entregados
    timers: new Set(),
    seq: 0, batchSeq: 0, queueSeq: 0, listenerSeq: 0, autoId: 0,
    echoDelay: Number.isFinite(CFG.echoDelay) ? CFG.echoDelay : 0,
    ackDelay: Number.isFinite(CFG.ackDelay) ? CFG.ackDelay : 0,
    authDelay: Number.isFinite(CFG.authDelay) ? CFG.authDelay : 0,
    cacheFirst: !!CFG.cacheFirst,
    failNext: [],        // [{code, optimistic}]
    everDelivered: false,
    persistenceEnabled: false,
    firestoreSettings: null,
    appConfig: null,
    t0: performance.now(),
  };

  function later(fn, ms) {
    const h = { id: null };
    h.id = realSetTimeout(() => { S.timers.delete(h); fn(); }, ms);
    S.timers.add(h);
    return h;
  }

  // ---------------------------------------------------------------- referencias
  const dbObj = { type: 'firestore', _mockDb: true, get app() { return appObj; } };
  const appObj = { name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false, _mockApp: true };

  function segsOf(path) { return path.split('/').filter(Boolean); }
  function makeCollectionRef(path) {
    const segs = segsOf(path);
    if (segs.length % 2 !== 1) throw new FirebaseError('invalid-argument', `Invalid collection reference. Collection references must have an odd number of segments, but ${path} has ${segs.length}.`);
    const ref = { type: 'collection', _mockRef: true, firestore: dbObj, path: segs.join('/'), id: segs[segs.length - 1] };
    Object.defineProperty(ref, 'parent', { get() { return segs.length > 1 ? makeDocRef(segs.slice(0, -1).join('/')) : null; } });
    return ref;
  }
  function makeDocRef(path) {
    const segs = segsOf(path);
    if (segs.length % 2 !== 0) throw new FirebaseError('invalid-argument', `Invalid document reference. Document references must have an even number of segments, but ${path} has ${segs.length}.`);
    const ref = { type: 'document', _mockRef: true, firestore: dbObj, path: segs.join('/'), id: segs[segs.length - 1] };
    Object.defineProperty(ref, 'parent', { get() { return makeCollectionRef(segs.slice(0, -1).join('/')); } });
    return ref;
  }
  function collection(base, ...segments) {
    if (!base || !(base._mockDb || base._mockRef)) throw new FirebaseError('invalid-argument', 'collection(): primer argumento inválido (se esperaba Firestore o una referencia).');
    segments.forEach(s => { if (typeof s !== 'string' || !s) throw new FirebaseError('invalid-argument', 'collection(): los segmentos deben ser strings no vacíos.'); });
    const prefix = base._mockDb ? '' : base.path + '/';
    if (base.type === 'collection') throw new FirebaseError('invalid-argument', 'collection(): no se puede usar una CollectionReference como base.');
    return makeCollectionRef(prefix + segments.join('/'));
  }
  function doc(base, ...segments) {
    if (!base || !(base._mockDb || base._mockRef)) throw new FirebaseError('invalid-argument', 'doc(): primer argumento inválido (se esperaba Firestore o una referencia).');
    if (base.type === 'collection' && segments.length === 0) {
      return makeDocRef(base.path + '/' + ('mockauto' + String(++S.autoId).padStart(12, '0')));
    }
    segments.forEach(s => { if (typeof s !== 'string' || !s) throw new FirebaseError('invalid-argument', 'doc(): los segmentos deben ser strings no vacíos (¿RBD undefined?).'); });
    if (base.type === 'document') throw new FirebaseError('invalid-argument', 'doc(): no se puede usar una DocumentReference como base.');
    const prefix = base._mockDb ? '' : base.path + '/';
    return makeDocRef(prefix + segments.join('/'));
  }

  // ---------------------------------------------------------------- vista (servidor/caché + cola)
  function baseMap() { return S.online ? S.server : S.cache; }
  function computeView() {
    // Map path -> {data, pending}. Aplica la cola de writes locales (con timestamps pendientes).
    const view = new Map();
    baseMap().forEach((d, p) => view.set(p, { data: cloneData(d), pending: false }));
    S.queue.forEach(w => {
      if (w.status !== 'pending') return;
      w.ops.forEach(op => {
        const cur = view.get(op.path);
        let next;
        try { next = applyOp(cur ? cur.data : undefined, op, new PendingServerTimestamp(Date.now())); } catch (e) { return; }
        if (next === undefined) view.delete(op.path); else view.set(op.path, { data: next, pending: true });
      });
    });
    return view;
  }

  // ---------------------------------------------------------------- snapshots
  function makeDocSnapshot(path, entry, fromCache) {
    const segs = segsOf(path);
    const ref = makeDocRef(path);
    const raw = entry ? entry.data : undefined;
    const snap = {
      id: segs[segs.length - 1],
      ref,
      _sig: entry ? sig(entry.data) : null,
      metadata: { fromCache: !!fromCache, hasPendingWrites: !!(entry && entry.pending), isEqual(o) { return !!o && o.fromCache === this.fromCache && o.hasPendingWrites === this.hasPendingWrites; } },
      exists() { return raw !== undefined; },
      data(options) {
        if (raw === undefined) return undefined;
        const mode = (options && options.serverTimestamps) || 'none';
        const conv = (v) => {
          if (v instanceof PendingServerTimestamp) return mode === 'estimate' ? Timestamp.fromMillis(v.estimateMs) : null;
          if (v === null || typeof v !== 'object') return v;
          if (v instanceof Timestamp) return new Timestamp(v.seconds, v.nanoseconds);
          if (Array.isArray(v)) return v.map(conv);
          const o = {}; Object.keys(v).forEach(k => { o[k] = conv(v[k]); }); return o;
        };
        return conv(raw);
      },
      get(field) {
        const d = this.data();
        if (d === undefined) return undefined;
        return String(field).split('.').reduce((a, k) => (a == null ? undefined : a[k]), d);
      },
    };
    return snap;
  }

  function getByPath(obj, fieldPath) { return String(fieldPath).split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj); }
  function cmpVals(a, b) {
    if (a instanceof Timestamp) a = a.toMillis(); if (b instanceof Timestamp) b = b.toMillis();
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    return a < b ? -1 : 1;
  }
  function matchesWhere(data, c) {
    const v = getByPath(data, c.field);
    const q = c.value;
    switch (c.op) {
      case '==': return sig(v) === sig(q);
      case '!=': return v !== undefined && sig(v) !== sig(q);
      case '<': return v !== undefined && cmpVals(v, q) < 0;
      case '<=': return v !== undefined && cmpVals(v, q) <= 0;
      case '>': return v !== undefined && cmpVals(v, q) > 0;
      case '>=': return v !== undefined && cmpVals(v, q) >= 0;
      case 'in': return Array.isArray(q) && q.some(x => sig(x) === sig(v));
      case 'not-in': return v !== undefined && Array.isArray(q) && !q.some(x => sig(x) === sig(v));
      case 'array-contains': return Array.isArray(v) && v.some(x => sig(x) === sig(q));
      case 'array-contains-any': return Array.isArray(v) && Array.isArray(q) && v.some(x => q.some(y => sig(x) === sig(y)));
      default: throw new MockFirebaseUnsupportedError('where(' + c.op + ')');
    }
  }
  function queryOf(target) {
    // Normaliza collection/query/doc a { collPath, constraints, docPath }
    if (target.type === 'document') return { docPath: target.path };
    if (target.type === 'collection') return { collPath: target.path, constraints: [] };
    if (target.type === 'query') return { collPath: target.collPath, constraints: target.constraints };
    throw new FirebaseError('invalid-argument', 'Destino de snapshot/consulta inválido.');
  }
  function resultDocs(q, view) {
    // Devuelve [[path, entry], ...] ordenados como Firestore (por id salvo orderBy).
    const prefix = q.collPath + '/';
    let rows = [];
    view.forEach((entry, p) => {
      if (!p.startsWith(prefix)) return;
      if (p.slice(prefix.length).includes('/')) return; // subcolecciones no cuentan
      rows.push([p, entry]);
    });
    const wheres = q.constraints.filter(c => c.kind === 'where');
    const orders = q.constraints.filter(c => c.kind === 'orderBy');
    const lim = q.constraints.find(c => c.kind === 'limit');
    rows = rows.filter(([, e]) => wheres.every(c => matchesWhere(e.data, c)));
    rows.sort((a, b) => {
      for (const o of orders) {
        const r = cmpVals(getByPath(a[1].data, o.field), getByPath(b[1].data, o.field));
        if (r) return o.dir === 'desc' ? -r : r;
      }
      return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
    });
    if (lim) rows = rows.slice(0, lim.n);
    return rows;
  }

  function buildQuerySnapshot(q, view, fromCache, prevIds) {
    const rows = resultDocs(q, view);
    const docs = rows.map(([p, e]) => makeDocSnapshot(p, e, fromCache));
    const hasPending = rows.some(([, e]) => e.pending);
    const snap = {
      docs, size: docs.length, empty: docs.length === 0,
      metadata: { fromCache: !!fromCache, hasPendingWrites: hasPending, isEqual(o) { return !!o && o.fromCache === this.fromCache && o.hasPendingWrites === this.hasPendingWrites; } },
      forEach(cb) { docs.forEach(cb); },
      docChanges() {
        const prev = prevIds || new Map();
        const out = [];
        docs.forEach((d, i) => {
          if (!prev.has(d.id)) out.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
          else if (prev.get(d.id) !== d._sig) out.push({ type: 'modified', doc: d, oldIndex: i, newIndex: i });
        });
        prev.forEach((_, id) => { if (!docs.some(d => d.id === id)) out.push({ type: 'removed', doc: null, oldIndex: -1, newIndex: -1 }); });
        return out;
      },
    };
    return snap;
  }
  // Firma de lo que ve un listener: si cambia, hay snapshot nuevo. Con includeMetadataChanges también
  // cuentan los cambios de metadatos (hasPendingWrites / fromCache), como en el SDK real.
  function listenerSignature(q, view, includeMeta, fromCache) {
    const meta = (e) => (includeMeta ? (e.pending ? '|P' : '|C') : '');
    let body;
    if (q.docPath) { const e = view.get(q.docPath); body = e ? 'D:' + sig(e.data) + meta(e) : 'none'; }
    else body = resultDocs(q, view).map(([p, e]) => p + '::' + sig(e.data) + meta(e)).join('\n');
    return body + (includeMeta ? '\n#fromCache=' + !!fromCache : '');
  }

  function deliver(L, view, fromCache, why) {
    const q = L.q;
    let payload;
    if (q.docPath) {
      payload = makeDocSnapshot(q.docPath, view.get(q.docPath), fromCache);
    } else {
      payload = buildQuerySnapshot(q, view, fromCache, L.prevDocs);
      L.prevDocs = new Map(payload.docs.map(d => [d.id, d._sig]));
    }
    L.lastSig = listenerSignature(q, view, L.includeMeta, fromCache);
    L.delivered++;
    S.everDelivered = true;
    S.events.push({ t: Math.round(performance.now() - S.t0), listener: L.id, why, fromCache: !!fromCache, size: payload.size === undefined ? (payload.exists() ? 1 : 0) : payload.size, empty: payload.empty === undefined ? !payload.exists() : payload.empty, hasPendingWrites: payload.metadata.hasPendingWrites });
    if (S.events.length > 1000) S.events.shift();
    if (L.closed) return;
    L.onNext(payload);
  }

  function emitAll(opts = {}) {
    const { force = false, fromCache = null, why = 'change' } = opts;
    const view = computeView();
    S.listeners.forEach(L => {
      if (L.closed || !L.initialDone) return;
      const fc = fromCache === null ? !S.online : fromCache;
      const s = listenerSignature(L.q, view, L.includeMeta, fc);
      if (force || s !== L.lastSig) deliver(L, view, fc, why);
    });
  }
  let echoScheduled = null;
  function scheduleEmit(ms, why) {
    if (echoScheduled) return; // coalesce: varios writes en el mismo tick = un solo snapshot
    echoScheduled = later(() => { echoScheduled = null; emitAll({ why }); }, ms);
  }

  function onSnapshot(target, ...args) {
    const q = queryOf(target);
    let onNext, onError;
    let rest = args;
    let includeMeta = false;
    if (rest.length && rest[0] && typeof rest[0] === 'object' && typeof rest[0] !== 'function' && !rest[0].next && ('includeMetadataChanges' in rest[0])) { includeMeta = !!rest[0].includeMetadataChanges; rest = rest.slice(1); }
    if (rest[0] && typeof rest[0] === 'object' && typeof rest[0].next === 'function') { onNext = rest[0].next.bind(rest[0]); onError = rest[0].error ? rest[0].error.bind(rest[0]) : undefined; }
    else { onNext = rest[0]; onError = rest[1]; }
    if (typeof onNext !== 'function') throw new FirebaseError('invalid-argument', 'onSnapshot(): falta el callback de datos.');
    const L = { id: ++S.listenerSeq, q, onNext, onError, includeMeta, lastSig: null, delivered: 0, closed: false, initialDone: false, prevDocs: null };
    S.listeners.add(L);
    // Entrega inicial asíncrona (como el SDK real).
    later(() => {
      if (L.closed) return;
      L.initialDone = true;
      if (S.online && S.cacheFirst && S.cache.size) {
        const cv = new Map(); S.cache.forEach((d, p) => cv.set(p, { data: cloneData(d), pending: false }));
        deliver(L, cv, true, 'initial-cache');
        later(() => { if (!L.closed) deliver(L, computeView(), false, 'initial-server'); }, S.ackDelay);
        return;
      }
      deliver(L, computeView(), !S.online, 'initial');
    }, S.echoDelay);
    return () => { L.closed = true; S.listeners.delete(L); };
  }

  // ---------------------------------------------------------------- writes
  function logOp(kind, op, extra) {
    const segs = segsOf(op.path);
    const entry = {
      seq: ++S.seq,
      t: Math.round(performance.now() - S.t0),
      op: kind,
      path: op.path,
      collection: segs.slice(0, -1).join('/'),
      id: segs[segs.length - 1],
      payload: op.data === undefined ? null : toLoggable(op.data),
      options: op.kind === 'set' ? { merge: !!op.merge } : null,
      status: 'pending',
      ...extra,
    };
    S.writes.push(entry);
    return entry;
  }

  function takeFailure() { return S.failNext.length ? S.failNext.shift() : null; }

  function docSizeBytes(d) { return JSON.stringify(toLoggable(d)).length; }

  function serverCommit(w) {
    // Aplica las operaciones al "servidor" con timestamps reales. Puede rechazar (p.ej. update sobre doc inexistente).
    const ts = Timestamp.fromMillis(Date.now());
    const staged = new Map();
    w.ops.forEach(op => {
      const cur = staged.has(op.path) ? staged.get(op.path) : (S.server.has(op.path) ? S.server.get(op.path) : undefined);
      const next = applyOp(cur, op, ts);
      staged.set(op.path, next);
      if (next !== undefined && docSizeBytes(next) > 1048576) throw new FirebaseError('invalid-argument', `Document ${op.path} exceeds the maximum size of 1 MiB.`);
    });
    staged.forEach((d, p) => { if (d === undefined) S.server.delete(p); else S.server.set(p, d); });
  }

  function acknowledge(w) {
    if (w.status !== 'pending') return;
    try {
      serverCommit(w);
      w.status = 'acked';
      w.logs.forEach(l => { l.status = 'acked'; });
      S.cache = new Map(); S.server.forEach((d, p) => S.cache.set(p, cloneData(d)));
      S.queue = S.queue.filter(x => x !== w);
      persistir();
      emitAll({ why: 'ack' });
      w.resolve();
    } catch (err) {
      w.status = 'rejected';
      w.logs.forEach(l => { l.status = 'rejected'; l.error = err.code || String(err); });
      S.queue = S.queue.filter(x => x !== w);
      emitAll({ why: 'revert' });
      w.reject(err);
    }
  }

  function enqueueWrite(kind, ops, batchId) {
    const logs = ops.map(op => logOp(kind === 'batch' ? 'batch.' + op.kind : kind, op, batchId ? { batchId } : {}));
    const failure = takeFailure();
    return new Promise((resolve, reject) => {
      const w = { id: ++S.queueSeq, ops, logs, status: 'pending', resolve, reject };
      if (failure && failure.optimistic === false) {
        const err = new FirebaseError(failure.code, `Firebase: simulated ${failure.code} (mockfb.failNextWrite).`);
        w.status = 'rejected';
        logs.forEach(l => { l.status = 'rejected'; l.error = failure.code; });
        later(() => reject(err), S.echoDelay);
        return;
      }
      S.queue.push(w);
      scheduleEmit(S.echoDelay, 'echo');
      if (failure) {
        // Rechazo del servidor tras el eco optimista: la vista local se revierte.
        later(() => {
          if (w.status !== 'pending') return;
          const err = new FirebaseError(failure.code, `Firebase: simulated ${failure.code} (mockfb.failNextWrite).`);
          w.status = 'rejected';
          logs.forEach(l => { l.status = 'rejected'; l.error = failure.code; });
          S.queue = S.queue.filter(x => x !== w);
          emitAll({ why: 'revert' });
          reject(err);
        }, S.echoDelay + S.ackDelay);
        return;
      }
      if (S.online) later(() => acknowledge(w), S.echoDelay + S.ackDelay);
      // sin conexión: queda en la cola hasta setOffline(false)
    });
  }

  function validateData(data, who, mode) {
    if (!isPlainObject(data)) throw new FirebaseError('invalid-argument', `Function ${who}() called with invalid data. Data must be an object, but it was: ${data === null ? 'null' : typeof data}`);
    assertNoUndefined(data, who + '()');
    assertFieldNames(data, who + '()', '');
    void mode;
  }

  function setDoc(ref, data, options) {
    if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'setDoc(): se esperaba una DocumentReference.');
    if (options && (options.mergeFields)) throw new MockFirebaseUnsupportedError('setDoc({mergeFields})');
    validateData(data, 'setDoc');
    const merge = !!(options && options.merge);
    if (!merge) resolveFull(data, new PendingServerTimestamp(0)); // valida deleteField fuera de merge
    return enqueueWrite('setDoc', [{ kind: 'set', path: ref.path, data: cloneForOp(data), merge }]);
  }
  function normalizeUpdateArgs(args) {
    if (args.length === 1 && isPlainObject(args[0])) return args[0];
    if (args.length >= 2 && typeof args[0] === 'string') {
      if (args.length % 2 !== 0) throw new FirebaseError('invalid-argument', 'updateDoc(): pares campo/valor incompletos.');
      const o = {}; for (let i = 0; i < args.length; i += 2) o[args[i]] = args[i + 1]; return o;
    }
    throw new FirebaseError('invalid-argument', 'updateDoc(): argumentos inválidos.');
  }
  function updateDoc(ref, ...args) {
    if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'updateDoc(): se esperaba una DocumentReference.');
    const data = normalizeUpdateArgs(args);
    assertNoUndefined(data, 'updateDoc()');
    return enqueueWrite('updateDoc', [{ kind: 'update', path: ref.path, data: cloneForOp(data) }]);
  }
  function deleteDoc(ref) {
    if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'deleteDoc(): se esperaba una DocumentReference.');
    return enqueueWrite('deleteDoc', [{ kind: 'delete', path: ref.path }]);
  }
  // Copia los datos del write conservando los FieldValue (no se clonan: son inmutables).
  function cloneForOp(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof FieldValue || v instanceof Timestamp || v instanceof Date) return v;
    if (Array.isArray(v)) return v.map(cloneForOp);
    const o = {}; Object.keys(v).forEach(k => { o[k] = cloneForOp(v[k]); }); return o;
  }

  function writeBatch(db) {
    if (!db || !db._mockDb) throw new FirebaseError('invalid-argument', 'writeBatch(): se esperaba Firestore.');
    const state = { ops: [], committed: false, id: ++S.batchSeq };
    const guard = () => { if (state.committed) throw new FirebaseError('failed-precondition', 'A write batch can no longer be used after commit() has been called.'); };
    const batch = {
      set(ref, data, options) {
        guard();
        if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'WriteBatch.set(): se esperaba una DocumentReference.');
        if (options && options.mergeFields) throw new MockFirebaseUnsupportedError('WriteBatch.set({mergeFields})');
        validateData(data, 'WriteBatch.set');
        const merge = !!(options && options.merge);
        if (!merge) resolveFull(data, new PendingServerTimestamp(0));
        state.ops.push({ kind: 'set', path: ref.path, data: cloneForOp(data), merge });
        return batch;
      },
      update(ref, ...args) {
        guard();
        if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'WriteBatch.update(): se esperaba una DocumentReference.');
        const data = normalizeUpdateArgs(args);
        assertNoUndefined(data, 'WriteBatch.update()');
        state.ops.push({ kind: 'update', path: ref.path, data: cloneForOp(data) });
        return batch;
      },
      delete(ref) {
        guard();
        if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'WriteBatch.delete(): se esperaba una DocumentReference.');
        state.ops.push({ kind: 'delete', path: ref.path });
        return batch;
      },
      commit() {
        guard();
        state.committed = true;
        if (state.ops.length > 500) return Promise.reject(new FirebaseError('invalid-argument', `maximum 500 writes allowed per request, but ${state.ops.length} were given.`));
        if (!state.ops.length) return Promise.resolve();
        return enqueueWrite('batch', state.ops, state.id);
      },
    };
    return strictObject(batch, 'WriteBatch');
  }

  // Envuelve un objeto para que acceder a una propiedad inexistente falle ruidosamente.
  function strictObject(obj, name) {
    return new Proxy(obj, {
      get(t, p, r) {
        if (p in t || typeof p === 'symbol' || p === 'then' || p === 'toJSON' || p === 'constructor' || p === 'inspect') return Reflect.get(t, p, r);
        throw new MockFirebaseUnsupportedError(`${name}.${String(p)}`);
      },
    });
  }

  function runTransaction(db, updateFn) {
    if (!db || !db._mockDb) throw new FirebaseError('invalid-argument', 'runTransaction(): se esperaba Firestore.');
    const ops = [];
    const tx = {
      get(ref) { const v = computeView().get(ref.path); return Promise.resolve(makeDocSnapshot(ref.path, v, !S.online)); },
      set(ref, data, options) { validateData(data, 'Transaction.set'); ops.push({ kind: 'set', path: ref.path, data: cloneForOp(data), merge: !!(options && options.merge) }); return tx; },
      update(ref, ...args) { const d = normalizeUpdateArgs(args); assertNoUndefined(d, 'Transaction.update()'); ops.push({ kind: 'update', path: ref.path, data: cloneForOp(d) }); return tx; },
      delete(ref) { ops.push({ kind: 'delete', path: ref.path }); return tx; },
    };
    return Promise.resolve(updateFn(strictObject(tx, 'Transaction'))).then(result => (ops.length ? enqueueWrite('transaction', ops) : Promise.resolve()).then(() => result));
  }

  // ---------------------------------------------------------------- lecturas puntuales
  function getDoc(ref) {
    if (!ref || ref.type !== 'document') throw new FirebaseError('invalid-argument', 'getDoc(): se esperaba una DocumentReference.');
    return new Promise((resolve, reject) => later(() => {
      const view = computeView();
      if (!S.online && !view.has(ref.path)) { reject(new FirebaseError('unavailable', 'Failed to get document because the client is offline.')); return; }
      resolve(makeDocSnapshot(ref.path, view.get(ref.path), !S.online));
    }, S.echoDelay));
  }
  function getDocs(target) {
    const q = queryOf(target);
    if (q.docPath) throw new FirebaseError('invalid-argument', 'getDocs(): se esperaba una colección o consulta.');
    return new Promise(resolve => later(() => resolve(buildQuerySnapshot(q, computeView(), !S.online)), S.echoDelay));
  }
  function query(coll, ...constraints) {
    if (!coll || (coll.type !== 'collection' && coll.type !== 'query')) throw new FirebaseError('invalid-argument', 'query(): se esperaba una colección.');
    const base = coll.type === 'query' ? coll.constraints : [];
    return { type: 'query', _mockRef: true, collPath: coll.type === 'query' ? coll.collPath : coll.path, constraints: base.concat(constraints), firestore: dbObj };
  }
  const where = (field, op, value) => ({ kind: 'where', field, op, value });
  const orderBy = (field, dir) => ({ kind: 'orderBy', field, dir: dir || 'asc' });
  const limit = (n) => ({ kind: 'limit', n });

  // ---------------------------------------------------------------- Auth
  const A = {
    user: null, listeners: new Set(), sentLinks: [], failNextSend: null, failNextSignIn: null, signInCalls: [], signOutCalls: 0,
  };
  function makeUser(email) {
    return {
      uid: 'mock-uid-' + Array.from(email).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16),
      email, emailVerified: true, displayName: null, isAnonymous: false, photoURL: null, phoneNumber: null,
      providerData: [{ providerId: 'password', email, uid: email }],
      getIdToken() { return Promise.resolve('mock-id-token'); },
      toJSON() { return { uid: this.uid, email: this.email }; },
    };
  }
  if (CFG.user && CFG.user.email) A.user = makeUser(CFG.user.email);
  const authObj = {
    _mockAuth: true,
    get app() { return appObj; },
    get currentUser() { return A.user; },
    name: '[DEFAULT]',
    config: { apiKey: 'mock' },
  };
  function notifyAuth() {
    const u = A.user;
    A.listeners.forEach(cb => later(() => { if (A.listeners.has(cb)) cb(u); }, S.authDelay));
  }
  const authApi = {
    getAuth(app) { void app; return authObj; },
    onAuthStateChanged(auth, next, error) {
      void error;
      if (!auth || !auth._mockAuth) throw new FirebaseError('invalid-argument', 'onAuthStateChanged(): se esperaba Auth.');
      const cb = typeof next === 'function' ? next : (next && next.next ? next.next.bind(next) : null);
      if (!cb) throw new FirebaseError('invalid-argument', 'onAuthStateChanged(): callback inválido.');
      A.listeners.add(cb);
      later(() => { if (A.listeners.has(cb)) cb(A.user); }, S.authDelay);
      return () => { A.listeners.delete(cb); };
    },
    isSignInWithEmailLink(auth, link) {
      void auth;
      return typeof link === 'string' && /[?&]oobCode=/.test(link) && /[?&]mode=signIn/.test(link);
    },
    signInWithEmailLink(auth, email, link) {
      A.signInCalls.push({ email, link });
      if (A.failNextSignIn) { const code = A.failNextSignIn; A.failNextSignIn = null; return Promise.reject(new FirebaseError(code, `Firebase: Error (${code}).`)); }
      if (!email) return Promise.reject(new FirebaseError('auth/invalid-email', 'Firebase: Error (auth/invalid-email).'));
      const m = /[?&]oobCode=([^&#]*)/.exec(link || '');
      const code = m ? decodeURIComponent(m[1]) : '';
      if (!code || code === 'invalid' || code === 'expired') return Promise.reject(new FirebaseError('auth/invalid-action-code', 'Firebase: Error (auth/invalid-action-code).'));
      const em = /[?&]mockEmail=([^&#]*)/.exec(link || '');
      if (em && decodeURIComponent(em[1]).toLowerCase() !== String(email).toLowerCase()) return Promise.reject(new FirebaseError('auth/invalid-email', 'Firebase: Error (auth/invalid-email).'));
      return new Promise(resolve => later(() => {
        A.user = makeUser(String(email).toLowerCase());
        resolve({ user: A.user, providerId: null, operationType: 'signIn' });
        notifyAuth();
      }, S.authDelay));
    },
    sendSignInLinkToEmail(auth, email, settings) {
      void auth;
      if (A.failNextSend) { const code = A.failNextSend; A.failNextSend = null; return Promise.reject(new FirebaseError(code, `Firebase: Error (${code}).`)); }
      if (!email) return Promise.reject(new FirebaseError('auth/invalid-email', 'Firebase: Error (auth/invalid-email).'));
      if (!settings || settings.handleCodeInApp !== true || !settings.url) return Promise.reject(new FirebaseError('auth/invalid-continue-uri', 'Firebase: Error (auth/invalid-continue-uri).'));
      A.sentLinks.push({ email, url: settings.url, handleCodeInApp: settings.handleCodeInApp, at: Date.now() });
      return Promise.resolve();
    },
    signOut(auth) {
      void auth;
      A.signOutCalls++;
      return new Promise(resolve => later(() => { A.user = null; resolve(); notifyAuth(); }, S.authDelay));
    },
    setPersistence() { return Promise.resolve(); },
    onIdTokenChanged(auth, next) { return authApi.onAuthStateChanged(auth, next); },
    browserLocalPersistence: { type: 'LOCAL' },
    browserSessionPersistence: { type: 'SESSION' },
    inMemoryPersistence: { type: 'NONE' },
  };

  // ---------------------------------------------------------------- conectividad
  function setOffline(off) {
    off = !!off;
    if (off === !S.online) return;
    if (off) {
      // El caché queda congelado en lo último entregado; si el cliente nunca recibió datos, el caché sigue vacío
      // (o con lo sembrado con {cache:true}).
      if (S.everDelivered) { S.cache = new Map(); S.server.forEach((d, p) => S.cache.set(p, cloneData(d))); }
      S.online = false;
      emitAll({ why: 'offline' });
    } else {
      S.online = true;
      S.cache = new Map(); S.server.forEach((d, p) => S.cache.set(p, cloneData(d)));
      // Reconexión: las escrituras en cola se confirman en orden.
      const pend = S.queue.filter(w => w.status === 'pending');
      pend.forEach(w => later(() => acknowledge(w), S.echoDelay + S.ackDelay));
      later(() => emitAll({ why: 'online' }), S.echoDelay);
    }
  }

  // ---------------------------------------------------------------- persistencia entre recargas de la página
  // El "servidor" vive en memoria de la página; con CFG.persist se guarda en sessionStorage para que
  // page.reload() vea lo que se escribió (como el Firestore real). Solo se persiste lo CONFIRMADO.
  const PKEY = CFG.persist ? '__mockfb_server_v1' : null;
  function persistir() {
    if (!PKEY) return;
    try { sessionStorage.setItem(PKEY, JSON.stringify(storeSnapshot())); } catch (e) { /* sin sessionStorage */ }
  }
  function cargarPersistido() {
    if (!PKEY) return false;
    try {
      const raw = sessionStorage.getItem(PKEY);
      if (!raw) return false;
      const docs = JSON.parse(raw);
      Object.keys(docs).forEach(p => { const d = fromLoggable(docs[p]); S.server.set(p, cloneData(d)); S.cache.set(p, cloneData(d)); });
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- API pública de pruebas
  function seed(docs, opts = {}) {
    const coll = opts.collection || COLLECTION_DEFAULT;
    const cache = opts.cache !== false;
    Object.keys(docs || {}).forEach(k => {
      const path = k.includes('/') ? k : coll + '/' + k;
      const data = fromLoggable(docs[k]);
      S.server.set(path, cloneData(data));
      if (cache) S.cache.set(path, cloneData(data));
    });
    persistir();
    if (opts.emit !== false) later(() => emitAll({ why: 'seed' }), 0);
  }
  function storeSnapshot() {
    const o = {};
    Array.from(S.server.keys()).sort().forEach(p => { o[p] = toLoggable(S.server.get(p)); });
    return o;
  }
  function viewSnapshot() {
    const o = {}; const v = computeView();
    Array.from(v.keys()).sort().forEach(p => { o[p] = toLoggable(v.get(p).data); });
    return o;
  }

  const mock = {
    version: 1,
    get store() { return storeSnapshot(); },        // estado confirmado en el "servidor" (JSON-seguro)
    get view() { return viewSnapshot(); },          // lo que ve el cliente (servidor/caché + escrituras locales)
    get writes() { return S.writes; },              // bitácora viva de todos los writes
    get events() { return S.events; },              // bitácora de snapshots entregados a listeners
    get queueLength() { return S.queue.filter(w => w.status === 'pending').length; },
    get online() { return S.online; },
    get listenerCount() { return Array.from(S.listeners).filter(l => !l.closed).length; },
    get persistenceEnabled() { return S.persistenceEnabled; },
    get appConfig() { return S.appConfig; },
    get firestoreSettings() { return S.firestoreSettings; },
    seed,
    emitSnapshot(opts = {}) { emitAll({ force: true, fromCache: opts.fromCache === undefined ? null : !!opts.fromCache, why: 'manual' }); },
    setOffline,
    failNextWrite(code = 'permission-denied', opts = {}) { S.failNext.push({ code, optimistic: opts.optimistic !== false }); },
    setLatency({ echo, ack, auth } = {}) { if (Number.isFinite(echo)) S.echoDelay = echo; if (Number.isFinite(ack)) S.ackDelay = ack; if (Number.isFinite(auth)) S.authDelay = auth; },
    clearWrites() { S.writes.length = 0; },
    idle() { return S.timers.size === 0; },
    reset() {
      S.server.clear(); S.cache.clear(); S.queue.length = 0; S.writes.length = 0; S.events.length = 0; S.failNext.length = 0;
      S.timers.forEach(h => realClearTimeout(h.id)); S.timers.clear(); echoScheduled = null;
      S.seq = 0; S.batchSeq = 0; S.autoId = 0;
      persistir();
      emitAll({ force: true, why: 'reset' });
    },
    auth: {
      get currentUser() { return A.user ? { email: A.user.email, uid: A.user.uid } : null; },
      setUser(email) { A.user = email ? makeUser(email) : null; notifyAuth(); },
      get sentLinks() { return A.sentLinks; },
      get signInCalls() { return A.signInCalls; },
      get signOutCalls() { return A.signOutCalls; },
      failNextSend(code = 'auth/network-request-failed') { A.failNextSend = code; },
      failNextSignIn(code = 'auth/invalid-action-code') { A.failNextSignIn = code; },
    },
    FirebaseError, Timestamp,
  };

  // ---------------------------------------------------------------- API que reexportan los módulos
  const appApi = {
    initializeApp(config, name) { S.appConfig = config || null; appObj.options = config || {}; if (name) appObj.name = name; return appObj; },
    getApp() { return appObj; },
    getApps() { return S.appConfig ? [appObj] : []; },
    deleteApp() { return Promise.resolve(); },
    setLogLevel() {},
    SDK_VERSION: '10.12.0-mock',
    FirebaseError,
  };
  const firestoreApi = {
    getFirestore(app) { void app; return dbObj; },
    initializeFirestore(app, settings) { void app; S.firestoreSettings = settings || null; return dbObj; },
    collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, writeBatch, runTransaction,
    query, where, orderBy, limit,
    deleteField, serverTimestamp, increment, arrayUnion, arrayRemove, Timestamp, FieldValue,
    enableIndexedDbPersistence(db) { void db; S.persistenceEnabled = true; return Promise.resolve(); },
    enableMultiTabIndexedDbPersistence(db) { void db; S.persistenceEnabled = true; return Promise.resolve(); },
    clearIndexedDbPersistence() { S.cache.clear(); return Promise.resolve(); },
    persistentLocalCache(settings) { S.persistenceEnabled = true; return { kind: 'persistent', settings: settings || {} }; },
    persistentMultipleTabManager() { return { kind: 'multiTab' }; },
    persistentSingleTabManager(s) { return { kind: 'singleTab', settings: s || {} }; },
    memoryLocalCache() { return { kind: 'memory' }; },
    memoryEagerGarbageCollector() { return { kind: 'eager' }; },
    memoryLruGarbageCollector() { return { kind: 'lru' }; },
    disableNetwork() { setOffline(true); return Promise.resolve(); },
    enableNetwork() { setOffline(false); return Promise.resolve(); },
    waitForPendingWrites() { return new Promise(res => { const t = () => (S.queue.some(w => w.status === 'pending') ? realSetTimeout(t, 5) : res()); t(); }); },
    terminate() { return Promise.resolve(); },
    // Conocidas pero NO implementadas: fallan ruidosamente si el panel las usa.
    getCountFromServer: unsupported('getCountFromServer'),
    startAfter: unsupported('startAfter'),
    endBefore: unsupported('endBefore'),
    collectionGroup: unsupported('collectionGroup'),
    loadBundle: unsupported('loadBundle'),
    documentId: unsupported('documentId'),
  };

  window.__mockfb = Object.assign(mock, {
    api: { app: appApi, auth: authApi, firestore: firestoreApi },
    MockFirebaseUnsupportedError,
    _state: S,
  });

  // Al arrancar: si hay estado persistido de una carga anterior de esta misma pestaña, se usa ese; si no, el fixture.
  if (!cargarPersistido() && CFG.seed) seed(CFG.seed, { emit: false, cache: CFG.seedCache !== false });
})();
