// 05_claves_invalidas — validación de claves de mapa de Firestore contra el SDK REAL y el servidor (emulador).
//
//   A) El panel rechaza `__x__`, `____`, `__concepto__`, vacío, solo espacios, >1500 bytes con un mensaje claro y el emulador NUNCA recibe
//      el write inválido (ni una escritura del cliente ni un cambio en el documento: su updateTime no se mueve).
//   B) Control: lo MISMO enviado directo (sin la validación del panel) falla de verdad con `invalid-argument`:
//        - el SDK web lo rechaza SÍNCRONO, antes de salir del navegador ("Document fields cannot begin and end with "__"");
//        - el servidor (REST contra el emulador) también: 400 INVALID_ARGUMENT "field name '__x__' is reserved".
//      => el mock modela bien el nombre reservado y el vacío.
//   C) Claves válidas en el borde: "/", "__" a secas, "__solo", "solo__" y 1400 bytes se aceptan Y las acepta el servidor real.
//   D) DIFERENCIA REAL con el mock: el servidor limita la RUTA de la propiedad (otras_fuentes.faep.bys_items.<clave>.meses.SEPTIEMBRE),
//      no la clave suelta. Un concepto de exactamente 1500 bytes pasa la validación del panel (y la del mock) pero el servidor lo
//      rechaza con invalid-argument "property path is longer than 1500 bytes". Se documenta como BUG REAL de bajo impacto.
import { boot, clickTab, estado } from '../lib/harness.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { PROJECT_ID } from '../lib/env.mjs';

const MODAL = '#otrasFuentesModalBody';
const esperar = async (cond, timeout = 15000, paso = 100) => { const t0 = Date.now(); for (;;) { const r = await cond(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, paso)); } };

await correrSpec('05_claves_invalidas', async (t) => {
  const h = await boot({ fixture: 'default', allowErrors: [/Error guardando RBD/, /INVALID_ARGUMENT/, /invalid-argument/, /longer than 1500/] });
  const { page } = h;
  await clickTab(page, 'of-faep');
  await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente="1121"]');
  await page.waitForSelector(`${MODAL} #juncon-1121-faep`);
  const filas = () => page.evaluate(() => Array.from(document.querySelectorAll('#otrasFuentesModalBody input.celda-input[data-modo="of_bys_item"][data-mes="ENERO"]')).map(e => e.dataset.concepto));
  const agregar = async (texto) => {
    const antes = h.dialogs.length;
    await page.fill(`${MODAL} #juncon-1121-faep`, texto);
    await page.click(`${MODAL} .of-add-bysitem-btn`);
    await page.waitForTimeout(150);
    return h.dialogs.slice(antes).map(d => d.message).join('\n');
  };
  const base = await filas();
  const docAntes = await h.servidor('1121');
  await h.clearLog();

  // ---------------------------------------------------------------- A) el panel los rechaza y el emulador no recibe nada
  await t.escenario('A', async () => {
    const casos = [['__x__', /__/], ['____', /__/], ['__concepto__', /__/], ['', /Escribe un concepto/], ['   ', /Escribe un concepto/], ['a'.repeat(1501), /demasiado largo/], ['ñ'.repeat(751), /demasiado largo/]];
    for (const [texto, esperado] of casos) {
      const msg = await agregar(texto);
      const et = texto.length > 20 ? `"${texto.slice(0, 6)}…" (${new TextEncoder().encode(texto).length} bytes)` : JSON.stringify(texto);
      t.ok(esperado.test(msg), `A) ${et}: el panel lo rechaza con un mensaje claro`, msg);
      t.eq((await filas()).length, base.length, `A) ${et}: no se agrega ninguna fila`);
    }
    await page.waitForTimeout(800);
    t.eq((await h.writes()).filter(w => w.path === 'sep_carga_rbd/1121').length, 0, 'A) el SDK real no recibió NINGUNA escritura sobre 1121 (ni siquiera intentada)');
    const docDespues = await h.servidor('1121');
    t.eq(docDespues.updateTime, docAntes.updateTime, 'A) el servidor (emulador) no recibió nada: el updateTime de 1121 no cambió');
    const e = await estado(page);
    t.ok(e.color === 'green', 'A) el indicador sigue verde', e);
  });

  // ---------------------------------------------------------------- B) control: lo mismo sin la validación del panel
  await t.escenario('B', async () => {
    const r = await page.evaluate(async () => {
      const { doc, setDoc, writeBatch, serverTimestamp } = window.__fb.fs;
      const out = {};
      const prueba = (nombre, fn) => { try { const p = fn(); out[nombre] = { sincrono: false, p }; } catch (e) { out[nombre] = { sincrono: true, code: e.code, msg: e.message }; } };
      prueba('setDoc __x__', () => window.__fb.fs.setDoc(doc(window.__fb.db, 'sep_carga_rbd', '1121'), { otras_fuentes: { faep: { bys_items: { __x__: { concepto: '__x__' } } } } }, { merge: true }));
      prueba('batch.set __x__', () => writeBatch(window.__fb.db).set(doc(window.__fb.db, 'sep_carga_rbd', '1121'), { a: { __x__: 1 } }, { merge: true }));
      prueba('setDoc vacío', () => window.__fb.fs.setDoc(doc(window.__fb.db, 'sep_carga_rbd', '1121'), { a: { '': 1 } }, { merge: true }));
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.sincrono ? v : { sincrono: false }]));
    });
    t.ok(r['setDoc __x__'].sincrono && r['setDoc __x__'].code === 'invalid-argument' && /cannot begin and end with "__"/.test(r['setDoc __x__'].msg), 'B) SDK real: setDoc con la clave __x__ LANZA síncronamente FirestoreError invalid-argument ("cannot begin and end with "__"")', r['setDoc __x__']);
    t.ok(r['batch.set __x__'].sincrono && r['batch.set __x__'].code === 'invalid-argument', 'B) SDK real: batch.set con __x__ también lanza síncronamente invalid-argument', r['batch.set __x__']);
    t.ok(r['setDoc vacío'].sincrono && r['setDoc vacío'].code === 'invalid-argument' && /must not be empty/.test(r['setDoc vacío'].msg), 'B) SDK real: una clave vacía lanza invalid-argument ("must not be empty")', r['setDoc vacío']);
    const rest = await fetch(`${h.emu.base}/v1/projects/${PROJECT_ID}/databases/(default)/documents/sep_carga_rbd/1121?updateMask.fieldPaths=a`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { a: { mapValue: { fields: { __x__: { integerValue: '1' } } } } } }) });
    const cuerpo = await rest.text();
    t.ok(rest.status === 400 && /INVALID_ARGUMENT/.test(cuerpo) && /reserved/.test(cuerpo), 'B) servidor (REST al emulador): 400 INVALID_ARGUMENT "field name \'__x__\' is reserved"', { status: rest.status, cuerpo: cuerpo.slice(0, 160) });
    t.eq((await h.servidor('1121')).updateTime, docAntes.updateTime, 'B) y el documento sigue intacto en el servidor');
    t.eq((await h.writes()).filter(w => w.status === 'pending' || w.status === 'acked').length, 0, 'B) el SDK no dejó ninguna escritura viva');
  });

  // ---------------------------------------------------------------- C) bordes válidos: los acepta el panel Y el servidor real
  await t.escenario('C', async () => {
    await h.clearLog();
    for (const valido of ['Agua/Luz', '__solo_al_inicio', 'solo_al_final__', '__', 'ñ'.repeat(700)]) {
      const msg = await agregar(valido);
      t.eq(msg, '', `C) "${valido.slice(0, 24)}"${valido.length > 24 ? '…' : ''} (${new TextEncoder().encode(valido).length} bytes): el panel lo acepta sin avisos`);
      t.ok((await filas()).includes(valido), `C) "${valido.slice(0, 24)}": se agregó la fila`);
    }
    await h.flush();
    const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121');
    t.ok(w.length === 5 && w.every(x => x.status === 'acked'), 'C) los 5 conceptos válidos fueron ACEPTADOS por el servidor real', w.map(x => x.status));
    const d = await h.servidor('1121');
    const claves = Object.keys(d.data.otras_fuentes.faep.bys_items);
    t.ok(['Agua/Luz', '__solo_al_inicio', 'solo_al_final__', '__', 'ñ'.repeat(700)].every(k => claves.includes(k)), 'C) y quedaron guardados en el servidor con esas claves exactas');
    const e = await estado(page);
    t.ok(e.color === 'green', 'C) el indicador queda verde', e);
  });

  // ---------------------------------------------------------------- D) 1500 bytes: pasa el panel, no pasa el servidor
  let rechazado = false, bloqueaOtrasEdiciones = null, detalleD = {};
  await t.escenario('D', async () => {
    await h.clearLog();
    const largo = 'ñ'.repeat(750); // exactamente 1500 bytes: el límite que valida el panel (y que modela el mock)
    const msg = await agregar(largo);
    const panelLoAcepta = msg === '';
    if (panelLoAcepta) t.info('D) el panel acepta un concepto de exactamente 1500 bytes (el límite que valida; el mock tampoco lo rechazaría)');
    else t.ok(/demasiado largo/.test(msg), 'D) el panel rechaza un concepto de 1500 bytes con un mensaje claro (deja margen para la ruta completa): el defecto está corregido', msg);
    await page.waitForTimeout(2500);
    const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121');
    const e = await estado(page);
    rechazado = w.length > 0 && w.every(x => x.status === 'rejected') && w[0].error && w[0].error.code === 'invalid-argument';
    detalleD = { estado: e, intentos: w.map(x => ({ status: x.status, error: x.error })) };
    t.info('D) servidor real → ' + JSON.stringify(detalleD));
    if (!panelLoAcepta) t.eq(w.length, 0, 'D) y el servidor no recibió ninguna escritura');
    if (rechazado) {
      t.ok(/invalid-argument|longer than 1500/.test(w[0].error.message), 'D) el servidor real rechazó el write con invalid-argument ("property path is longer than 1500 bytes")', w[0].error);
      t.ok(e.color === 'red' && /rechazó un dato/.test(e.txt), 'D) el panel lo clasifica como error permanente: rojo "El servidor rechazó un dato…"', e);
      // ¿bloquea el resto de ediciones del MISMO RBD? Lo rechazado se retiene y se reenvía junto con cada edición posterior.
      await h.clearLog();
      const otra = `${MODAL} input.celda-input[data-modo="of_bys_item"][data-concepto="Agua/Luz"][data-mes="ENERO"]`;
      await page.fill(otra, '4321');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(2500);
      const dd = await h.servidor('1121');
      const v = dd.data.otras_fuentes.faep.bys_items['Agua/Luz'].meses.ENERO;
      bloqueaOtrasEdiciones = v !== 4321;
      detalleD.otraEdicion = { valorEnServidor: v, intentos: (await h.writes()).map(x => x.status) };
      t.info('D) una edición válida de OTRA celda del mismo RBD tras el rechazo → servidor tiene ' + v + ' (esperado 4321); intentos: ' + JSON.stringify((await h.writes()).map(x => x.status)));
    }
  });
  t.bug('clave-1500-bytes-rechazada-por-el-servidor', 'el panel acepta claves de hasta 1500 bytes pero el servidor limita la RUTA completa de la propiedad a 1500 bytes (otras_fuentes.faep.bys_items.<clave>.meses.SEPTIEMBRE suma 46 bytes más): un concepto de 1500 bytes se acepta en pantalla y el servidor lo rechaza con invalid-argument', rechazado);
  t.bug('retenido-bloquea-ediciones-validas', 'tras un rechazo por DATO (invalid-argument) lo retenido viaja junto con cada edición posterior del MISMO RBD: una edición válida de otra celda también es rechazada (el servidor conserva el valor viejo) hasta recargar la página y perder lo no guardado', bloqueaOtrasEdiciones === true);
  await h.close();
});
