// Arranque del panel (index.html) en Chromium contra el SDK REAL de Firestore 10.12.0 y el EMULADOR local.
//
//   const h = await boot({ fixture: 'default' });       // siembra el emulador, abre el panel y espera el indicador verde
//   await abrirSep(h, '1122');
//   h.red.corta(); ... h.red.restablece();                // corte de red REAL (proxy TCP): el SDK ve el servidor inalcanzable
//   await h.close();
//
// Reutiliza del arnés principal: el servidor estático (tests/lib/serve.mjs), la resolución de APP_HTML (tests/lib/html-source.mjs),
// el lanzador de Chromium (tests/lib/pw.mjs) y los correos de prueba (tests/lib/config.mjs). Lo único que cambia respecto de los mocks:
// los módulos de gstatic se sustituyen por el SDK REAL empaquetado con esbuild (ver lib/bundle.mjs y bundle/*.js) y TODO el tráfico de
// Firestore va a 127.0.0.1 (emulador). Cualquier otra petición de red se aborta y cuenta como error: nada toca producción.
import fs from 'node:fs';
import path from 'node:path';
import { lanzarChromium } from '../../lib/pw.mjs';
import { startServer } from '../../lib/serve.mjs';
import { resolverAppHtml } from '../../lib/html-source.mjs';
import { TESTS_DIR } from '../../lib/config.mjs';
import { DIST_DIR, EMULATOR_HOST, EMAIL_AUTORIZADO, EMAIL_NO_AUTORIZADO, COLLECTION, FIREBASE_VERSION } from './env.mjs';
import { construirBundle } from './bundle.mjs';
import { asegurarEmulador, detenerEmuladorPropio, emuActivo } from './emulator.mjs';
import { crearProxy } from './netproxy.mjs';

const FIREBASE_URL_RE = new RegExp(`^https://www\\.gstatic\\.com/firebasejs/${FIREBASE_VERSION.replace(/\./g, '\\.')}/([\\w.-]+\\.js)(?:\\?.*)?$`);
const FIREBASE_OTRA_VERSION_RE = /^https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\//;

// Colector dentro de la página, instalado ANTES de cargar nada: errores no capturados / promesas rechazadas y "long tasks" (bloqueos del hilo
// principal ≥ 50 ms). Es un segundo canal, independiente del evento pageerror de Playwright (que a veces no llega si el error ocurre mientras
// el hilo principal está bloqueado).
const COLECTOR_EN_PAGINA = `(() => {
  window.__e2e = { errs: [], lt: [] };
  window.addEventListener('error', (e) => window.__e2e.errs.push(String((e.error && (e.error.name + ': ' + e.error.message)) || e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__e2e.errs.push('promesa rechazada: ' + String((e.reason && e.reason.message) || e.reason)));
  try { new PerformanceObserver((l) => l.getEntries().forEach(x => window.__e2e.lt.push(Math.round(x.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* sin longtask */ }
})();`;

let _browser = null;
const _servers = new Map();
const _proxies = new Set();
async function getBrowser() { if (!_browser) _browser = await lanzarChromium(); return _browser; }
async function getServer(htmlPath) {
  if (!_servers.has(htmlPath)) _servers.set(htmlPath, await startServer({ html: htmlPath }));
  return _servers.get(htmlPath);
}
export async function shutdown() {
  try { if (_browser) await _browser.close(); } catch (e) { /* ya cerrado */ }
  for (const s of _servers.values()) { try { await s.close(); } catch (e) { /* ya cerrado */ } }
  for (const p of _proxies) { try { await p.cerrar(); } catch (e) { /* ya cerrado */ } }
  _browser = null; _servers.clear(); _proxies.clear();
  try {
    const emu = await emuActivo();
    if (emu && emu.salida.join('').includes('Cannot find field: expectedCount')) console.log('  AVISO  el emulador no entiende "expectedCount" (SDK 10.12.0 al reanudar desde el caché): use un emulador >= 1.19 (ver README)');
  } catch (e) { /* sin emulador */ }
  try { await detenerEmuladorPropio(); } catch (e) { /* sin emulador */ }
}

export function cargarFixture(nombre = 'default') {
  const ruta = path.join(TESTS_DIR, 'fixtures', `${nombre}.json`);
  if (!fs.existsSync(ruta)) throw new Error(`No existe el fixture ${ruta}. Genéralo con: node tests/fixtures/generate.mjs`);
  return JSON.parse(fs.readFileSync(ruta, 'utf8')).docs;
}

// Siembra el emulador con un fixture (los {__ts:n} del fixture se descartan; la auditoría la pone el servidor). Deja el servidor limpio antes.
export async function prepararServidor(emu, docs) {
  await emu.limpiar();
  if (!docs) return;
  const limpio = {};
  Object.entries(docs).forEach(([id, d]) => { const c = JSON.parse(JSON.stringify(d)); delete c.lastModifiedAt; delete c.lastModifiedBy; limpio[id] = c; });
  await emu.sembrar(limpio, { merge: false });
}

/**
 * @param {object} o
 * @param {string|object|null} [o.fixture='default']  nombre de fixture, mapa {id: doc} o null (servidor vacío)
 * @param {boolean} [o.prepararServidor=true]          limpiar y sembrar el emulador (false: no tocarlo, p. ej. segunda sesión)
 * @param {string|null} [o.user]                       correo del usuario autenticado (por defecto el autorizado)
 * @param {object} [o.context]                         reutiliza un BrowserContext (misma IndexedDB = "mismo perfil")
 * @param {object} [o.proxy]                           reutiliza un proxy de red ya creado
 * @param {boolean} [o.cortada=false]                  arranca con la red CORTADA (emulador inalcanzable)
 * @param {boolean} [o.waitReady=true]                 espera el indicador verde
 * @param {Array<RegExp|string>} [o.allowErrors]
 * @param {string} [o.html]                            HTML bajo prueba (por defecto APP_HTML o ../index.html)
 */
export async function boot(o = {}) {
  const { fixture = 'default', user = EMAIL_AUTORIZADO, waitReady = true, allowErrors = [], viewport = { width: 1500, height: 1000 }, cortada = false } = o;
  const origen = o.html ? { ruta: path.resolve(o.html), etiqueta: o.html } : resolverAppHtml();
  await construirBundle();
  const emu = await asegurarEmulador();
  if (o.prepararServidor !== false) await prepararServidor(emu, typeof fixture === 'string' ? cargarFixture(fixture) : fixture);
  const server = await getServer(origen.ruta);
  const browser = await getBrowser();
  const proxy = o.proxy || await crearProxy({ destinoPuerto: emu.port });
  _proxies.add(proxy);
  if (cortada) proxy.corta();
  const context = o.context || await browser.newContext({ viewport, locale: 'es-CL', timezoneId: 'America/Santiago', acceptDownloads: true, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
  const emuOrigen = `http://${EMULATOR_HOST}:${proxy.port}`;
  if (!o.context) {
    await context.addInitScript(`window.__E2E = ${JSON.stringify({ emuHost: EMULATOR_HOST, emuPort: proxy.port, user: user || null })};`);
    await context.addInitScript(COLECTOR_EN_PAGINA);
    for (const extra of (o.initScripts || [])) await context.addInitScript(extra);   // p. ej. un capturador de errores desde el primer instante
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith(server.url + '/') || url.startsWith(emuOrigen + '/')) return route.continue();
      // WebChannel (SDK) sondea la conectividad pidiendo una imagen a google.com cuando un canal falla: se responde como lo haría
      // internet (GIF de 1x1 si la red de prueba está arriba; fallo si está cortada). Es parte del SDK, no un error del panel.
      if (/^https:\/\/www\.google\.com\/images\/cleardot\.gif/.test(url)) {
        if (proxy.cortado || h.sinInternet) return route.abort('internetdisconnected');
        return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
      }
      const m = FIREBASE_URL_RE.exec(url);
      if (m) {
        const archivo = path.join(DIST_DIR, m[1]);
        if (fs.existsSync(archivo)) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: fs.readFileSync(archivo, 'utf8') });
      }
      const v = FIREBASE_OTRA_VERSION_RE.exec(url);
      h.blocked.push(url);
      h.errors.push({ kind: 'red-externa-bloqueada', text: url + (v ? ` (index.html pide Firebase ${v[1]}, el arnés solo sirve ${FIREBASE_VERSION})` : '') });
      return route.abort('blockedbyclient');
    });
  }

  const permitido = (texto) => allowErrors.some(p => (p instanceof RegExp ? p.test(texto) : texto.includes(p)));
  const h = {
    context, proxy, emu, server, html: origen, email: user, url: server.url, emuOrigen,
    errors: [], permitidos: [], erroresRed: [], dialogs: [], blocked: [], page: null, red: proxy,
    esPermitido: permitido,
    expectErrors: (...p) => { allowErrors.push(...p); for (let i = h.errors.length - 1; i >= 0; i--) if (permitido(h.errors[i].text)) h.permitidos.push(...h.errors.splice(i, 1)); },
    close: async () => { try { await context.close(); } catch (e) { /* cerrado */ } },
  };
  Object.assign(h, instrumentos(h));

  async function abrirPagina() {
    const page = await context.newPage();
    h.page = page;
    const registrar = (kind, text, extra = {}) => { (permitido(text) ? h.permitidos : h.errors).push({ kind, text, ...extra }); };
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const loc = msg.location() || {};
      if (loc.url && loc.url.startsWith(emuOrigen)) { h.erroresRed.push(msg.text()); return; } // "Failed to load resource" del emulador cortado
      registrar('console.error', msg.text(), { loc: loc.url ? `${loc.url}:${loc.lineNumber}` : '' });
    });
    page.on('pageerror', (err) => registrar('pageerror', (err && err.message) || String(err)));
    page.on('requestfailed', (req) => {
      if (req.url().startsWith(emuOrigen)) { h.erroresRed.push(`${req.method()} ${req.url().slice(0, 120)} — ${req.failure() && req.failure().errorText}`); return; }
      if (h.blocked.includes(req.url())) return;
      registrar('requestfailed', `${req.method()} ${req.url().slice(0, 200)} — ${req.failure() && req.failure().errorText}`);
    });
    page.on('response', (res) => { if (res.status() >= 400 && res.url().startsWith(server.url)) registrar('http-error', `${res.status()} ${res.url()}`); });
    page.on('dialog', async (d) => {
      const rec = { type: d.type(), message: d.message() };
      h.dialogs.push(rec);
      try { const r = o.onDialog ? await o.onDialog(d, rec) : undefined; if (r === 'dismiss') await d.dismiss(); else await d.accept(d.type() === 'prompt' ? (d.defaultValue() || '') : undefined); } catch (e) { /* ya cerrado */ }
    });
    return page;
  }
  h.nuevaPagina = async () => { try { if (h.page && !h.page.isClosed()) await h.page.close(); } catch (e) { /* ya cerrada */ } const p = await abrirPagina(); await p.goto(server.url + '/index.html', { waitUntil: 'load' }); return p; };
  h.recargar = async () => { await h.page.reload({ waitUntil: 'load' }); };

  await abrirPagina();
  try {
    await h.page.goto(server.url + (o.path || '/index.html'), { waitUntil: 'load' });
    if (waitReady && user && user !== EMAIL_NO_AUTORIZADO) await esperarVerde(h.page, { timeout: 40000 });
  } catch (e) {
    e.message += '\n(errores capturados hasta ahora: ' + JSON.stringify(h.errors.slice(0, 5)) + ')';
    await h.close();
    throw e;
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------------- instrumentos
function instrumentos(h) {
  const ev = (fn, arg) => h.page.evaluate(fn, arg);
  return {
    ev,
    // Errores de la página (colector propio) y bloqueos del hilo principal (ms) desde que se cargó el documento.
    erroresEnPagina: () => ev(() => (window.__e2e ? window.__e2e.errs.slice() : [])),
    tareasLargas: () => ev(() => (window.__e2e ? window.__e2e.lt.slice() : [])),
    limpiarTareasLargas: () => ev(() => { if (window.__e2e) window.__e2e.lt.length = 0; }),
    // Todo lo inesperado: errores de consola/página/red de Playwright + los del colector (salvo los permitidos).
    inesperados: async () => [...h.errors.map(e => `[${e.kind}] ${e.text}`), ...(await h.erroresEnPagina()).filter(x => !h.esPermitido(x)).map(x => `[en-pagina] ${x}`)],
    writes: () => ev(() => JSON.parse(JSON.stringify(window.__fb ? window.__fb.writes : []))),
    events: () => ev(() => JSON.parse(JSON.stringify(window.__fb ? window.__fb.events : []))),
    persistencia: () => ev(() => (window.__fb ? window.__fb.persistencia : null)),
    clearLog: () => ev(() => { window.__fb.writes.length = 0; window.__fb.events.length = 0; }),
    // Corte de red por el SDK (no toca navigator.onLine ni los sockets).
    disableNetwork: () => ev(() => window.__fb.fs.disableNetwork(window.__fb.db)),
    enableNetwork: () => ev(() => window.__fb.fs.enableNetwork(window.__fb.db)),
    // Corte REAL a nivel de red del navegador (navigator.onLine=false + conexiones caídas).
    setOffline: (v) => h.context.setOffline(!!v),
    estado: () => estado(h.page),
    esperarVerde: (opts) => esperarVerde(h.page, opts),
    esperarColor: (color, timeout = 15000) => h.page.waitForFunction((c) => document.getElementById('sync-indicator').classList.contains(c), color, { timeout, polling: 50 }),
    esperarEscriturasListas: (timeout = 15000) => h.page.waitForFunction(() => !window.__fb || window.__fb.writes.every(w => w.status !== 'pending' && w.status !== 'queued'), null, { timeout, polling: 50 }),
    // Fuerza el guardado pendiente (blur) y espera a que el SDK confirme.
    flush: async (timeout = 15000) => { await h.page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }); await h.esperarEscriturasListas(timeout); await h.page.waitForTimeout(80); },
    // Línea de tiempo del indicador de sincronización: cada cambio de color/texto con su instante (ms desde que se llamó).
    vigilarIndicador: () => ev(() => {
      window.__ind = []; const t0 = performance.now();
      const dot = document.getElementById('sync-indicator'), txt = document.getElementById('sync-text'), btn = document.getElementById('sync-retry');
      const tomar = () => { const c = ['green', 'yellow', 'red'].find(x => dot.classList.contains(x)) || '?'; const m = { t: Math.round(performance.now() - t0), color: c, txt: txt.textContent, retry: !!btn && !btn.classList.contains('hidden') }; const u = window.__ind[window.__ind.length - 1]; if (!u || u.color !== m.color || u.txt !== m.txt || u.retry !== m.retry) window.__ind.push(m); };
      tomar(); new MutationObserver(tomar).observe(document.getElementById('sync-indicator').parentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    }),
    leerIndicador: () => ev(() => JSON.parse(JSON.stringify(window.__ind || []))),
    // Documento del servidor (REST con token owner: lo que realmente quedó guardado).
    servidor: (id) => h.emu.leer(id),
    // Vista del panel de una celda: <input> del modal SEP.
    valorCelda: (sel) => h.page.inputValue(sel),
  };
}

export async function esperarVerde(page, { timeout = 30000 } = {}) {
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    const dot = document.getElementById('sync-indicator');
    return app && !app.classList.contains('hidden') && dot && dot.classList.contains('green');
  }, null, { timeout, polling: 50 });
}
export const estado = (page) => page.evaluate(() => {
  const b = document.getElementById('sync-retry');
  const dot = document.getElementById('sync-indicator');
  return { txt: document.getElementById('sync-text').textContent, color: ['green', 'yellow', 'red'].find(c => dot.classList.contains(c)) || '?', retry: !!b && !b.classList.contains('hidden') };
});

// ---------------------------------------------------------------------------------------------------------------- navegación y selectores
export async function clickTab(page, clave) {
  await page.click(`.tab-btn[data-tab="${clave}"]`);
  await page.waitForTimeout(60);
}
export async function abrirSep(h, rbd) {
  await clickTab(h.page, 'panel');
  await h.page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
  await h.page.waitForSelector(`#modalBody input.celda-input[data-rbd="${rbd}"]`, { timeout: 10000 });
}
export async function cerrarModal(h) { await h.page.keyboard.press('Escape'); await h.page.waitForTimeout(60); }
export const celdaIng = (rbd, mes, item = 'Carrera Docente') => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="ingreso_item"][data-item="${item}"][data-mes="${mes}"]`;
export const celdaRem = (rbd, mes) => `#modalBody input.celda-input[data-rbd="${rbd}"][data-modo="rem"][data-mes="${mes}"]`;
export { COLLECTION };
