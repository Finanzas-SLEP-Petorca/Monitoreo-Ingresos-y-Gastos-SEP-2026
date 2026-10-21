// mock_semantica: prueba el PROPIO mock de Firebase (tests/mockfb/) con una página en blanco, sin el panel.
// Si el mock se desvía de la semántica real de Firestore que el panel necesita (merge profundo, deleteField,
// serverTimestamp, batch, ecos, offline, errores), esta prueba lo detecta antes de que genere falsos positivos.
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

await correrSpec('mock_semantica', async (t) => {
  const h = await boot({ fixture: null, user: 'none', waitReady: false, path: '/__blank.html' });
  const { page } = h;
  const resultados = await page.evaluate(async () => {
    const R = [];
    const check = (nombre, cond, detalle) => R.push([nombre, !!cond, cond ? undefined : JSON.stringify(detalle === undefined ? null : detalle)]);
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    const base = 'https://www.gstatic.com/firebasejs/10.12.0/';
    const app = await import(base + 'firebase-app.js');
    const fs = await import(base + 'firebase-firestore.js');
    const au = await import(base + 'firebase-auth.js');
    const mock = window.__mockfb;
    const db = fs.getFirestore(app.initializeApp({ projectId: 'x' }));
    const lanza = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
    const store = () => mock.store;
    const C = 'sep_carga_rbd';
    const d1 = fs.doc(db, C, '1');
    const drain = async () => { for (let i = 0; i < 100 && !mock.idle(); i++) await esperar(5); await esperar(5); };

    // ---- referencias
    check('collection/doc: rutas', fs.collection(db, C).path === C && d1.path === `${C}/1` && d1.id === '1' && d1.parent.path === C);
    check('doc con segmento no-string lanza invalid-argument (RBD number)', (await lanza(() => fs.doc(db, C, 1121)))?.code === 'invalid-argument');
    check('doc con segmento vacío/undefined lanza', (await lanza(() => fs.doc(db, C, undefined))) !== null);

    // ---- setDoc merge:true: fusión profunda, deleteField, serverTimestamp
    await fs.setDoc(d1, { rbd: '1', rem: { meses: { ENERO: 1, FEBRERO: 2 }, total: 3 }, compras: { a: { m: 1 }, b: { m: 2 } } });
    await fs.setDoc(d1, { rem: { meses: { FEBRERO: 20, MARZO: 3 }, total: 23 }, lastModifiedAt: fs.serverTimestamp() }, { merge: true });
    let s = store()[`${C}/1`];
    check('merge:true fusiona mapas anidados (no pisa ENERO)', s.rem.meses.ENERO === 1 && s.rem.meses.FEBRERO === 20 && s.rem.meses.MARZO === 3 && s.rem.total === 23, s);
    check('merge:true conserva claves no mencionadas (compras)', s.compras.a.m === 1 && s.compras.b.m === 2, s);
    check('serverTimestamp() se resuelve a un Timestamp tras confirmar', s.lastModifiedAt && typeof s.lastModifiedAt.__ts === 'number', s.lastModifiedAt);
    await fs.setDoc(d1, { compras: { a: fs.deleteField() }, rem: { meses: { ENERO: fs.deleteField() } } }, { merge: true });
    s = store()[`${C}/1`];
    check('deleteField() elimina la clave (a nivel profundo y anidado)', !('a' in s.compras) && s.compras.b.m === 2 && !('ENERO' in s.rem.meses) && s.rem.meses.FEBRERO === 20, s);
    await fs.setDoc(d1, { rem: { meses: {} } }, { merge: true });
    s = store()[`${C}/1`];
    check('merge:true con mapa vacío REEMPLAZA el mapa (igual que el SDK real)', JSON.stringify(s.rem.meses) === '{}' && s.rem.total === 23, s.rem);
    await fs.setDoc(d1, { solo: 1 });
    s = store()[`${C}/1`];
    check('setDoc sin merge reemplaza el documento completo', JSON.stringify(s) === '{"solo":1}', s);
    check('deleteField() fuera de merge/update lanza invalid-argument', (await lanza(() => fs.setDoc(d1, { a: fs.deleteField() })))?.code === 'invalid-argument');
    check('valor undefined lanza invalid-argument', (await lanza(() => fs.setDoc(d1, { a: undefined }, { merge: true })))?.code === 'invalid-argument');
    // nombres de campo que Firestore rechaza (un solo concepto así hace fallar el write ENTERO del RBD)
    const campoMalo = async (data, merge = true) => (await lanza(() => fs.setDoc(d1, data, { merge })))?.code === 'invalid-argument';
    check('un nombre de campo "__x__" (anidado) lanza invalid-argument', await campoMalo({ otras: { bys: { '__x__': { meses: {} } } } }));
    check('un nombre de campo vacío lanza invalid-argument', await campoMalo({ bys: { '': 1 } }));
    check('un nombre de campo de más de 1500 bytes (UTF-8) lanza invalid-argument', await campoMalo({ ['ñ'.repeat(751)]: 1 }) && await campoMalo({ ['a'.repeat(1501)]: 1 }));
    check('nombres válidos al borde: "__", "__a", "a__", "a/b" y 1500 bytes', !(await campoMalo({ '__': 1, '__a': 1, 'a__': 1, 'a/b': 1, ['ñ'.repeat(750)]: 1 })));
    check('un write con un nombre inválido no cambia el documento (se rechaza entero)', !('otras' in store()[`${C}/1`]) && !('bys' in store()[`${C}/1`]), store()[`${C}/1`]);
    check('setDoc con merge sobre doc inexistente lo crea', await (async () => { await fs.setDoc(fs.doc(db, C, 'nuevo'), { x: { y: 1 } }, { merge: true }); return store()[`${C}/nuevo`].x.y === 1; })());
    check('increment / arrayUnion / arrayRemove', await (async () => {
      const r = fs.doc(db, C, 'f'); await fs.setDoc(r, { n: 1, arr: [1, 2] });
      await fs.setDoc(r, { n: fs.increment(4), arr: fs.arrayUnion(2, 3) }, { merge: true });
      const a = store()[`${C}/f`]; await fs.setDoc(r, { arr: fs.arrayRemove(1) }, { merge: true });
      return a.n === 5 && JSON.stringify(a.arr) === '[1,2,3]' && JSON.stringify(store()[`${C}/f`].arr) === '[2,3]';
    })());
    check('arrays se reemplazan (no se fusionan) con merge:true', await (async () => { const r = fs.doc(db, C, 'g'); await fs.setDoc(r, { arr: [1, 2, 3] }); await fs.setDoc(r, { arr: [9] }, { merge: true }); return JSON.stringify(store()[`${C}/g`].arr) === '[9]'; })());

    // ---- updateDoc / deleteDoc
    const du = fs.doc(db, C, 'u'); await fs.setDoc(du, { a: { b: 1, c: 2 }, z: 1 });
    await fs.updateDoc(du, { 'a.b': 10, z: fs.deleteField() });
    check('updateDoc con ruta "a.b" cambia solo ese campo y deleteField() borra', JSON.stringify(store()[`${C}/u`]) === '{"a":{"b":10,"c":2}}', store()[`${C}/u`]);
    await fs.updateDoc(du, { a: { solo: true } });
    check('updateDoc con objeto reemplaza el mapa (no fusiona)', JSON.stringify(store()[`${C}/u`].a) === '{"solo":true}');
    check('updateDoc sobre doc inexistente rechaza not-found', (await lanza(() => fs.updateDoc(fs.doc(db, C, 'nadie'), { a: 1 })))?.code === 'not-found');
    await fs.deleteDoc(du);
    check('deleteDoc elimina el documento', !(`${C}/u` in store()));

    // ---- writeBatch
    const b = fs.writeBatch(db);
    b.set(fs.doc(db, C, 'b1'), { v: 1 }); b.set(fs.doc(db, C, 'b2'), { v: 2 }, { merge: true }); b.update(fs.doc(db, C, 'b1'), { w: 5 }); b.delete(fs.doc(db, C, 'nuevo'));
    check('batch: nada se escribe antes de commit()', !(`${C}/b1` in store()));
    await b.commit();
    check('batch: set/update/delete se aplican al confirmar', store()[`${C}/b1`].v === 1 && store()[`${C}/b1`].w === 5 && store()[`${C}/b2`].v === 2 && !(`${C}/nuevo` in store()), store());
    check('batch: no se puede reutilizar tras commit()', (await lanza(() => b.set(fs.doc(db, C, 'x'), { a: 1 })))?.code === 'failed-precondition');
    const grande = fs.writeBatch(db); for (let i = 0; i < 501; i++) grande.set(fs.doc(db, C, 'g' + i), { i });
    check('batch con más de 500 operaciones rechaza invalid-argument', (await lanza(() => grande.commit()))?.code === 'invalid-argument');
    check('batch: propiedad inexistente falla ruidosamente', (await lanza(() => b.noExiste))?.name === 'MockFirebaseUnsupportedError');
    check('API conocida pero no implementada lanza MockFirebaseUnsupportedError', (await lanza(() => fs.getCountFromServer()))?.name === 'MockFirebaseUnsupportedError');
    check('documento > 1 MiB es rechazado por el servidor (invalid-argument)', (await lanza(() => fs.setDoc(fs.doc(db, C, 'big'), { blob: 'x'.repeat(1100000) })))?.code === 'invalid-argument' && !(`${C}/big` in store()));

    // ---- onSnapshot: datos, metadatos, eco asíncrono, pendiente -> confirmado
    mock.reset();
    mock.seed({ b: { n: 'b' }, a: { n: 'a' }, c: { n: 'c' } });
    const eventos = [];
    const unsub = fs.onSnapshot(fs.collection(db, C), (snap) => eventos.push({ ids: snap.docs.map(d => d.id), size: snap.size, empty: snap.empty, fromCache: snap.metadata.fromCache, pend: snap.metadata.hasPendingWrites, data: snap.docs.map(d => d.data()) }));
    check('onSnapshot: no entrega de forma síncrona', eventos.length === 0);
    await drain();
    check('onSnapshot: snapshot inicial ordenado por id, con size/empty/metadata', eventos.length === 1 && JSON.stringify(eventos[0].ids) === '["a","b","c"]' && eventos[0].size === 3 && eventos[0].empty === false && eventos[0].fromCache === false && eventos[0].pend === false, eventos[0]);
    const sinc = []; fs.setDoc(fs.doc(db, C, 'a'), { n: 'A2', lastModifiedAt: fs.serverTimestamp() }, { merge: true }).then(() => sinc.push('resuelto'));
    check('setDoc: el eco NO es síncrono', eventos.length === 1);
    await drain();
    check('write propio: llega eco con hasPendingWrites=true y lastModifiedAt=null, luego confirmación con Timestamp', eventos.length === 3 && eventos[1].pend === true && eventos[1].data[0].lastModifiedAt === null && eventos[2].pend === false && eventos[2].data[0].lastModifiedAt && typeof eventos[2].data[0].lastModifiedAt.toDate === 'function' && sinc.length === 1, eventos.slice(1).map(e => [e.pend, e.data[0]]));
    mock.emitSnapshot({ fromCache: true });
    check('emitSnapshot({fromCache:true}) entrega un snapshot de caché', eventos[eventos.length - 1].fromCache === true);
    unsub();
    const n0 = eventos.length; await fs.setDoc(fs.doc(db, C, 'zz'), { n: 1 }); await drain();
    check('tras cancelar la suscripción no llegan más snapshots', eventos.length === n0);

    // ---- seed() desde fuera (otro usuario) se entrega a los listeners
    const ev2 = []; const un2 = fs.onSnapshot(fs.collection(db, C), (snap) => ev2.push(snap.docs.map(d => d.id).join(',')));
    await drain(); mock.seed({ zzz: { otra: 'persona' } }); await drain();
    check('seed() de otro usuario emite un snapshot con el documento nuevo', ev2.length === 2 && /zzz/.test(ev2[1]), ev2);
    un2();

    // ---- sin conexión
    mock.reset(); mock.setOffline(true);
    const ev3 = []; const un3 = fs.onSnapshot(fs.collection(db, C), (snap) => ev3.push({ empty: snap.empty, fromCache: snap.metadata.fromCache, size: snap.size, pend: snap.metadata.hasPendingWrites }));
    const ev3m = []; const un3m = fs.onSnapshot(fs.collection(db, C), { includeMetadataChanges: true }, (snap) => ev3m.push({ fromCache: snap.metadata.fromCache, pend: snap.metadata.hasPendingWrites, size: snap.size }));
    await drain();
    check('offline sin datos: snapshot vacío con fromCache:true', ev3.length === 1 && ev3[0].empty === true && ev3[0].fromCache === true, ev3);
    let resuelto = false; const pOff = fs.setDoc(fs.doc(db, C, 'off'), { v: 1 }, { merge: true }).then(() => { resuelto = true; });
    await drain();
    check('offline: el write se aplica localmente (eco con hasPendingWrites) pero NO se confirma', ev3.length === 2 && ev3[1].size === 1 && ev3[1].pend === true && resuelto === false && !(`${C}/off` in store()) && mock.queueLength === 1, [ev3, resuelto, mock.queueLength]);
    mock.setOffline(false); await pOff; await drain();
    check('al reconectar el write pendiente se confirma y el servidor lo tiene', resuelto === true && store()[`${C}/off`].v === 1 && mock.queueLength === 0);
    check('al reconectar, un listener normal NO recibe snapshot si solo cambian los metadatos (como el SDK real)', ev3.length === 2, ev3);
    check('al reconectar, un listener con includeMetadataChanges recibe fromCache:false / hasPendingWrites:false', ev3m.length >= 3 && ev3m[ev3m.length - 1].fromCache === false && ev3m[ev3m.length - 1].pend === false && ev3m[ev3m.length - 1].size === 1, ev3m);
    // getDoc sin conexión y sin caché
    mock.setOffline(true);
    check('getDoc offline de un doc que no está en caché rechaza unavailable', (await lanza(() => fs.getDoc(fs.doc(db, C, 'jamas'))))?.code === 'unavailable');
    mock.setOffline(false); un3(); un3m();

    // ---- failNextWrite
    mock.reset();
    const ev4 = []; const un4 = fs.onSnapshot(fs.collection(db, C), (snap) => ev4.push(snap.size));
    await drain();
    mock.failNextWrite('permission-denied');
    const err = await lanza(() => fs.setDoc(fs.doc(db, C, 'p'), { a: 1 }));
    check('failNextWrite: setDoc rechaza con FirebaseError{code}', err && err.name === 'FirebaseError' && err.code === 'permission-denied', err && [err.name, err.code]);
    await drain();
    check('failNextWrite (optimista): hubo eco local y luego se revirtió; el servidor no lo tiene', ev4.join(',') === '0,1,0' && !(`${C}/p` in store()), ev4);
    check('failNextWrite: el write queda en la bitácora como rechazado', mock.writes[mock.writes.length - 1].status === 'rejected' && mock.writes[mock.writes.length - 1].error === 'permission-denied');
    mock.failNextWrite('unavailable', { optimistic: false });
    const err2 = await lanza(() => fs.setDoc(fs.doc(db, C, 'p2'), { a: 1 }));
    check('failNextWrite({optimistic:false}): rechaza sin eco local', err2 && err2.code === 'unavailable' && ev4.join(',') === '0,1,0', [err2 && err2.code, ev4]);
    un4();

    // ---- bitácora de writes
    mock.reset();
    await fs.setDoc(fs.doc(db, C, 'w1'), { a: { b: 1 }, ts: fs.serverTimestamp(), d: fs.deleteField() }, { merge: true });
    const wb = fs.writeBatch(db); wb.set(fs.doc(db, C, 'w2'), { z: 1 }); await wb.commit();
    const W = mock.writes;
    check('bitácora: ruta, payload con sentinelas y opciones', W[0].path === `${C}/w1` && W[0].options.merge === true && W[0].payload.ts.__sentinel === 'serverTimestamp' && W[0].payload.d.__sentinel === 'deleteField' && W[0].op === 'setDoc', W[0]);
    check('bitácora: las operaciones de batch quedan identificadas', W[1].op === 'batch.set' && typeof W[1].batchId === 'number' && W[1].options.merge === false, W[1]);

    // ---- consultas
    mock.reset(); mock.seed({ q1: { k: 1, t: 'x' }, q2: { k: 2, t: 'y' }, q3: { k: 3, t: 'x' } });
    const qs = await fs.getDocs(fs.query(fs.collection(db, C), fs.where('t', '==', 'x'), fs.orderBy('k', 'desc'), fs.limit(5)));
    check('query: where + orderBy desc + limit', JSON.stringify(qs.docs.map(d => d.id)) === '["q3","q1"]', qs.docs.map(d => d.id));
    const one = await fs.getDoc(fs.doc(db, C, 'q2'));
    check('getDoc: exists()/data()/id', one.exists() && one.data().k === 2 && one.id === 'q2');

    // ---- Auth
    const auth = au.getAuth(); const cambios = []; au.onAuthStateChanged(auth, (u) => cambios.push(u && u.email));
    await drain(); await esperar(5);
    check('Auth: onAuthStateChanged entrega null sin sesión', cambios.length === 1 && cambios[0] === null, cambios);
    check('Auth: isSignInWithEmailLink', au.isSignInWithEmailLink(auth, 'http://x/?mode=signIn&oobCode=a') === true && au.isSignInWithEmailLink(auth, 'http://x/') === false);
    await au.signInWithEmailLink(auth, 'Alguien@Example.com', 'http://x/?mode=signIn&oobCode=a'); await esperar(10);
    check('Auth: signInWithEmailLink inicia sesión y notifica', auth.currentUser && auth.currentUser.email === 'alguien@example.com' && cambios[cambios.length - 1] === 'alguien@example.com', cambios);
    check('Auth: código vencido rechaza auth/invalid-action-code', (await lanza(() => au.signInWithEmailLink(auth, 'a@b.c', 'http://x/?mode=signIn&oobCode=expired')))?.code === 'auth/invalid-action-code');
    check('Auth: sendSignInLinkToEmail sin handleCodeInApp rechaza', (await lanza(() => au.sendSignInLinkToEmail(auth, 'a@b.c', { url: 'http://x' })))?.code === 'auth/invalid-continue-uri');
    await au.signOut(auth); await esperar(10);
    check('Auth: signOut limpia la sesión y notifica null', auth.currentUser === null && cambios[cambios.length - 1] === null);

    // ---- imports no exportados fallan al enlazar el módulo
    const errImport = await lanza(() => import('data:text/javascript,import { noExisteEnElMock } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"; export default noExisteEnElMock;'));
    check('importar un nombre que el mock no exporta falla (SyntaxError al enlazar)', errImport && /does not provide an export named/.test(errImport.message), errImport && errImport.message);
    return R;
  });
  resultados.forEach(([nombre, ok, detalle]) => t.ok(ok, nombre, detalle));
  t.noErrores(h);
  await h.close();
});
