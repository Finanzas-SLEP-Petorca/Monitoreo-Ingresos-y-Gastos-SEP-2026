// Emulador oficial de Firestore (jar v1.15.1): arranque, espera, limpieza, reglas y lectura "del servidor".
//
//   const emu = await asegurarEmulador();     // usa E2E_EMU_PORT_REUSE (lo fija run.mjs) o lanza uno propio
//   await emu.limpiar();                      // borra TODOS los documentos del proyecto y restablece reglas abiertas
//   await emu.reglas(texto)                   // carga reglas de seguridad
//   await emu.leer('1122')                    // lo que el SERVIDOR tiene (REST con token "owner": salta las reglas)
//   await emu.listar()                        // todos los documentos de sep_carga_rbd
//   await emu.sembrar({id: datos})            // escribe documentos con un cliente Node del SDK REAL (segundo "usuario")
import { spawn } from 'node:child_process';
import net from 'node:net';
import { EMULATOR_JAR, EMULATOR_HOST, EMULATOR_PORT, PROJECT_ID, COLLECTION, E2E_HOME, requireDeps, importDep, verificarInstalacion } from './env.mjs';

export const REGLAS_ABIERTAS = `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if true; } } }`;

// Reglas de prueba para el spec de permisos (el panel del navegador no envía token de Auth: ver bundle/auth-stub.js).
export const REGLAS_SOLO_LECTURA = `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /sep_carga_rbd/{id} { allow read: if true; allow write: if false; } } }`;
export const REGLAS_SIN_ESCRITURA_EN = (rbd) => `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /sep_carga_rbd/{id} { allow read: if true; allow write: if id != '${rbd}'; } } }`;
export const REGLAS_SIN_LECTURA = `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /sep_carga_rbd/{id} { allow read: if false; allow write: if true; } } }`;

// ---- (de)serialización de los valores tipados de la API REST de Firestore (para leer lo que el servidor guardó)
export function desdeValorRest(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return { __ts: Date.parse(v.timestampValue), iso: v.timestampValue };
  if ('referenceValue' in v) return { __ref: v.referenceValue };
  if ('geoPointValue' in v) return { __geo: v.geoPointValue };
  if ('bytesValue' in v) return { __bytes: v.bytesValue };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(desdeValorRest);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, desdeValorRest(x)]));
  return { __desconocido: v };
}
const desdeDocRest = (d) => ({ id: d.name.split('/').pop(), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, desdeValorRest(x)])), updateTime: d.updateTime, createTime: d.createTime });

function puertoLibre() {
  return new Promise((ok, fail) => {
    const s = net.createServer();
    s.once('error', fail);
    s.listen(0, EMULATOR_HOST, () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}
async function esperarListo(port, proc, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    if (proc && proc.exitCode !== null) throw new Error(`El emulador terminó con código ${proc.exitCode} antes de estar listo`);
    try {
      const r = await fetch(`http://${EMULATOR_HOST}:${port}/`);
      if (r.ok) return;
    } catch (e) { /* aún no escucha */ }
    if (Date.now() - t0 > timeoutMs) throw new Error('El emulador de Firestore no respondió en 60 s');
    await new Promise(r => setTimeout(r, 150));
  }
}

let _emu = null;
export async function asegurarEmulador() {
  if (_emu) return _emu;
  verificarInstalacion();
  let port = Number(process.env.E2E_EMU_PORT_REUSE || 0); // lo define run.mjs: un emulador compartido por todos los specs
  let proc = null;
  const salida = [];
  if (!port) {
    port = await puertoLibre();
    proc = spawn('java', ['-Duser.language=en', '-jar', EMULATOR_JAR, `--host=${EMULATOR_HOST}`, `--port=${port}`, '--single_project_mode', `--project_id=${PROJECT_ID}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', d => salida.push(String(d)));
    proc.stderr.on('data', d => salida.push(String(d)));
    process.on('exit', () => { try { proc.kill('SIGKILL'); } catch (e) { /* ya terminó */ } });
  }
  try { await esperarListo(port, proc); }
  catch (e) { if (proc) proc.kill('SIGKILL'); throw new Error(e.message + '\n' + salida.join('').slice(-1500)); }
  _emu = crearApi(port, proc, salida);
  return _emu;
}

export async function emuActivo() { return _emu; }

// Detiene el emulador SOLO si lo lanzó este proceso (no el compartido que lanzó run.mjs).
export async function detenerEmuladorPropio() {
  if (_emu && _emu.proc) await _emu.detener();
}

// Lanza un emulador (para run.mjs) y devuelve {port, detener}.
export async function lanzarEmuladorCompartido() {
  const e = await asegurarEmulador();
  return { port: e.port, detener: e.detener, salida: e.salida };
}

function crearApi(port, proc, salida) {
  const base = `http://${EMULATOR_HOST}:${port}`;
  const docsBase = `${base}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const AUTH = { Authorization: 'Bearer owner' }; // el emulador trata "owner" como admin: se salta las reglas
  let cliente = null;
  const api = {
    port, host: EMULATOR_HOST, base, proc, salida,
    async reglas(texto) {
      const r = await fetch(`${base}/emulator/v1/projects/${PROJECT_ID}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: texto }] } }) });
      if (!r.ok) throw new Error(`No se pudieron cargar las reglas: ${r.status} ${await r.text()}`);
    },
    async limpiar({ reglas = true } = {}) {
      const r = await fetch(`${base}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`No se pudo limpiar el emulador: ${r.status}`);
      if (reglas) await api.reglas(REGLAS_ABIERTAS);
    },
    async leer(id, coleccion = COLLECTION) {
      const r = await fetch(`${docsBase}/${coleccion}/${encodeURIComponent(id)}`, { headers: AUTH });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GET ${id}: ${r.status} ${await r.text()}`);
      return desdeDocRest(await r.json());
    },
    async listar(coleccion = COLLECTION) {
      const out = {};
      let token = '';
      do {
        const r = await fetch(`${docsBase}/${coleccion}?pageSize=300${token ? '&pageToken=' + token : ''}`, { headers: AUTH });
        if (!r.ok) throw new Error(`LIST: ${r.status} ${await r.text()}`);
        const j = await r.json();
        (j.documents || []).forEach(d => { const x = desdeDocRest(d); out[x.id] = x; });
        token = j.nextPageToken || '';
      } while (token);
      return out;
    },
    // Borra un documento DEL SERVIDOR (REST con token owner; las reglas del panel prohíben delete al cliente, esto es el "admin").
    async borrar(id, coleccion = COLLECTION) {
      const r = await fetch(`${docsBase}/${coleccion}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: AUTH });
      if (!r.ok && r.status !== 404) throw new Error(`DELETE ${id}: ${r.status} ${await r.text()}`);
    },
    // Instantánea comparable: { id: { data, updateTime } } — si updateTime no cambia, el servidor no recibió ningún write.
    async instantanea(coleccion = COLLECTION) { return api.listar(coleccion); },
    async contar(coleccion = COLLECTION) { return Object.keys(await api.listar(coleccion)).length; },
    // Segundo "usuario": cliente Node del SDK REAL (firebase/firestore, el mismo 10.12.0), con sus propios streams, contra este emulador.
    async cliente() {
      if (cliente) return cliente;
      const [{ initializeApp, deleteApp }, fs] = await Promise.all([importDep('firebase/app'), importDep('firebase/firestore')]);
      const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake' }, 'otro-usuario-' + Math.random().toString(36).slice(2));
      const db = fs.initializeFirestore(app, { experimentalForceLongPolling: false });
      fs.connectFirestoreEmulator(db, EMULATOR_HOST, port);
      cliente = { app, db, fs, async cerrar() { await fs.terminate(db); await deleteApp(app); cliente = null; } };
      return cliente;
    },
    // Escribe (merge:true) documentos completos como "otro usuario". datos: { '1122': {…} }. Marca la auditoría como otra persona.
    async sembrar(docs, { merge = true, coleccion = COLLECTION, autor = 'juan.bustamante@sleppetorca.gob.cl', conAuditoria = true } = {}) {
      const c = await api.cliente();
      const { doc, setDoc, writeBatch, serverTimestamp } = c.fs;
      const ids = Object.keys(docs);
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(c.db);
        ids.slice(i, i + 400).forEach(id => {
          const d = conAuditoria ? { ...docs[id], lastModifiedBy: autor, lastModifiedAt: serverTimestamp() } : docs[id];
          b.set(doc(c.db, coleccion, id), d, { merge });
        });
        await b.commit();
      }
    },
    // Una edición puntual de otro usuario (setDoc merge) — usa rutas anidadas (objeto) tal cual.
    async escribirComoOtro(id, parcial, opts = {}) {
      const c = await api.cliente();
      const { doc, setDoc, serverTimestamp } = c.fs;
      await setDoc(doc(c.db, opts.coleccion || COLLECTION, id), { ...parcial, lastModifiedBy: opts.autor || 'juan.bustamante@sleppetorca.gob.cl', lastModifiedAt: serverTimestamp() }, { merge: true });
    },
    async detener() {
      if (cliente) { try { await cliente.cerrar(); } catch (e) { /* cerrado */ } }
      if (proc) { proc.kill('SIGTERM'); await new Promise(r => { const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) { /* ya */ } r(); }, 3000); proc.once('exit', () => { clearTimeout(t); r(); }); }); }
      _emu = null;
    },
  };
  return api;
}
