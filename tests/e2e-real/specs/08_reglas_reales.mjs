// 08_reglas_reales — DIAGNÓSTICO de firestore.rules (el archivo REAL del repo) con @firebase/rules-unit-testing contra el emulador.
// Solo describe qué permiten/niegan hoy las reglas para sep_carga_rbd; NO propone cambios. Sirve de base para una futura revisión de reglas.
//
// Aserciones (lo que el panel necesita): un correo de la lista puede leer y escribir (crear y actualizar) sep_carga_rbd; un correo que no
// está en la lista, o una sesión anónima, no pueden leer ni escribir; nadie puede borrar documentos; cualquier otra colección está cerrada.
// "OBSERVACIÓN": comportamientos de las reglas que no son un error del panel pero conviene conocer (se imprimen, no fallan la suite).
import fs from 'node:fs';
import path from 'node:path';
import { asegurarEmulador } from '../lib/emulator.mjs';
import { PROJECT_ID, REPO_DIR, requireDeps } from '../lib/env.mjs';
import { correrSpec } from '../lib/spec.mjs';

const reglas = fs.readFileSync(path.join(REPO_DIR, 'firestore.rules'), 'utf8');
const html = fs.readFileSync(path.join(REPO_DIR, 'index.html'), 'utf8');
const listaDe = (texto, abre) => { const i = texto.indexOf(abre); if (i < 0) return null; const j = texto.indexOf(']', i); return Array.from(texto.slice(i, j).matchAll(/"([^"]+@[^"]+)"/g), m => m[1]); };

await correrSpec('08_reglas_reales', async (t) => {
  const emu = await asegurarEmulador();
  const { initializeTestEnvironment, assertSucceeds, assertFails } = requireDeps('@firebase/rules-unit-testing');
  const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: emu.host, port: emu.port, rules: reglas } });
  const ok = async (p) => { try { await assertSucceeds(p); return true; } catch (e) { return false; } };
  const no = async (p) => { try { await assertFails(p); return true; } catch (e) { return false; } };
  const obs = (msg) => console.log(`  OBS    OBSERVACIÓN: ${msg}`);
  try {
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('sep_carga_rbd/1121').set({ rbd: '1121', nombre: 'LICEO', rem: { meses: { ENERO: 5 } } }); });

    // ---- consistencia de las listas de correos (reglas vs. index.html)
    const enReglas = listaDe(reglas, 'request.auth.token.email in [');
    const enHtml = listaDe(html, 'const ALLOWED_EMAILS = [');
    const enAdmin = listaDe(html, 'const ADMIN_EMAILS = [');
    t.ok(enReglas && enReglas.length >= 10, `lista de correos de firestore.rules leída (${enReglas && enReglas.length})`);
    t.eq([...enReglas].sort(), [...enHtml].sort(), 'la lista de correos de firestore.rules coincide con ALLOWED_EMAILS de index.html', { soloEnReglas: enReglas.filter(x => !enHtml.includes(x)), soloEnHtml: enHtml.filter(x => !enReglas.includes(x)) });
    t.ok(enAdmin.every(x => enReglas.includes(x)), 'ADMIN_EMAILS ⊆ lista de las reglas', enAdmin.filter(x => !enReglas.includes(x)));

    // ---- correos permitidos: se prueban TODOS los de la lista
    let lecturasOk = 0, escriturasOk = 0;
    for (const email of enReglas) {
      const db = env.authenticatedContext('u-' + email, { email }).firestore();
      if (await ok(db.doc('sep_carga_rbd/1121').get())) lecturasOk++;
      if (await ok(db.doc('sep_carga_rbd/1121').set({ lastModifiedBy: email }, { merge: true }))) escriturasOk++;
    }
    t.eq([lecturasOk, escriturasOk], [enReglas.length, enReglas.length], `los ${enReglas.length} correos de la lista pueden LEER y ESCRIBIR (merge) sep_carga_rbd/1121`);
    const dbOk = env.authenticatedContext('uid-w', { email: 'wilson.rojas@sleppetorca.gob.cl' }).firestore();
    t.ok(await ok(dbOk.collection('sep_carga_rbd').get()), 'permitido: puede LISTAR la colección sep_carga_rbd (lo que hace el onSnapshot del panel)');
    t.ok(await ok(dbOk.doc('sep_carga_rbd/9999').set({ rbd: '9999', nombre: 'NUEVO' }, { merge: true })), 'permitido: puede CREAR un documento nuevo (setDoc con merge sobre un id inexistente: la siembra y los RBD faltantes)');
    t.ok(await ok(dbOk.doc('sep_carga_rbd/_meta').set({ items_22: [] })), 'permitido: el documento "_meta" sigue la misma regla (cualquier id)');
    t.ok(await ok(dbOk.doc('sep_carga_rbd/no_existe_aun').get()), 'permitido: leer un documento inexistente no falla (devuelve "no existe")');
    {
      const b = dbOk.batch(); for (let i = 0; i < 60; i++) b.set(dbOk.doc('sep_carga_rbd/lote' + i), { rbd: 'lote' + i }, { merge: true });
      t.ok(await ok(b.commit()), 'permitido: un batch de 60 documentos (como la siembra de 55 RBD) pasa las reglas');
    }
    t.ok(await no(dbOk.doc('sep_carga_rbd/1121').delete()), 'NADIE puede borrar: ni siquiera un correo permitido (allow delete: if false)');

    // ---- correo NO permitido
    const dbNo = env.authenticatedContext('uid-x', { email: 'intruso@example.com' }).firestore();
    t.ok(await no(dbNo.doc('sep_carga_rbd/1121').get()), 'NO permitido (intruso@example.com): no puede LEER un documento');
    t.ok(await no(dbNo.collection('sep_carga_rbd').get()), 'NO permitido: no puede LISTAR la colección');
    t.ok(await no(dbNo.doc('sep_carga_rbd/1121').set({ x: 1 }, { merge: true })), 'NO permitido: no puede ACTUALIZAR');
    t.ok(await no(dbNo.doc('sep_carga_rbd/7777').set({ x: 1 })), 'NO permitido: no puede CREAR');
    t.ok(await no(dbNo.doc('sep_carga_rbd/1121').delete()), 'NO permitido: no puede BORRAR');
    // ---- sin sesión
    const dbAnon = env.unauthenticatedContext().firestore();
    t.ok(await no(dbAnon.doc('sep_carga_rbd/1121').get()), 'sin sesión: no puede leer');
    t.ok(await no(dbAnon.doc('sep_carga_rbd/1121').set({ x: 1 }, { merge: true })), 'sin sesión: no puede escribir');
    // ---- sesión sin claim de correo (p. ej. anónima de Firebase Auth)
    const dbSinEmail = env.authenticatedContext('uid-anon', {}).firestore();
    t.ok(await no(dbSinEmail.doc('sep_carga_rbd/1121').get()), 'con sesión pero SIN claim de correo: no puede leer');
    // ---- el resto de colecciones del proyecto
    t.ok(await no(dbOk.doc('otra_coleccion/x').get()), 'colecciones no declaradas están cerradas incluso para un correo permitido (catch-all: false)');

    // ---- OBSERVACIONES (diagnóstico; no fallan)
    const dbMay = env.authenticatedContext('uid-m', { email: 'Wilson.Rojas@sleppetorca.gob.cl' }).firestore();
    obs(`el correo se compara EXACTO (distingue mayúsculas): "Wilson.Rojas@…" en el token ${(await no(dbMay.doc('sep_carga_rbd/1121').get())) ? 'es RECHAZADO' : 'es aceptado'} (el panel normaliza a minúsculas al iniciar sesión)`);
    const dbNoVerif = env.authenticatedContext('uid-nv', { email: 'wilson.rojas@sleppetorca.gob.cl', email_verified: false }).firestore();
    obs(`las reglas no exigen email_verified: un token con email_verified:false ${(await ok(dbNoVerif.doc('sep_carga_rbd/1121').get())) ? 'SÍ puede leer' : 'no puede leer'}`);
    const dbSpoof = env.authenticatedContext('uid-s', { email: 'catalina.brito@sleppetorca.gob.cl' }).firestore();
    obs(`las reglas no validan el contenido: un correo permitido ${(await ok(dbSpoof.doc('sep_carga_rbd/1122').set({ lastModifiedBy: 'otra.persona@sleppetorca.gob.cl', rem: 'texto', compras: [1, 2], nombre: { a: 1 } }, { merge: true }))) ? 'PUEDE escribir tipos mezclados y una auditoría (lastModifiedBy) que no es suya' : 'no puede'} (de ahí los documentos "envenenados" del spec 07)`);
    obs(`las reglas no limitan el tamaño ni el id: un permitido ${(await ok(dbOk.doc('sep_carga_rbd/id-cualquiera-' + 'x'.repeat(40)).set({ a: 1 }))) ? 'PUEDE crear documentos con cualquier id en sep_carga_rbd (no solo RBD válidos)' : 'no puede'}`);
    obs('las reglas se aplican a la colección sep_carga_rbd completa: no distinguen entre roles (ADMIN_EMAILS solo existe en el cliente: un permitido que no es admin puede hacer por consola lo mismo que un admin salvo borrar)');
  } finally {
    await env.cleanup();
    await emu.limpiar();
  }
});
