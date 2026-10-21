// Arranque determinista del panel en Chromium con Firebase mockeado.
//
//   const h = await boot({ fixture: 'default', user: 'authorized', freezeTime: true });
//   await clickTab(h.page, 'SEP');
//   ... h.errors (console.error / pageerror / requestfailed / HTTP>=400 / red externa bloqueada) ...
//   await h.close();      // cierra el contexto
//   await shutdown();     // cierra navegador y servidor (al final del proceso)
//
// Todo lo que no sea el servidor local ni los 3 módulos de Firebase (que se sirven desde tests/mockfb/)
// se ABORTA y se registra como error: nada de lo que se prueba puede tocar la red de producción.
import fs from 'node:fs';
import path from 'node:path';
import { lanzarChromium } from './pw.mjs';
import { startServer } from './serve.mjs';
import { resolverAppHtml } from './html-source.mjs';
import {
  TESTS_DIR, FECHA_CONGELADA, TIMEZONE, LOCALE,
  EMAIL_AUTORIZADO, EMAIL_AUTORIZADO_NO_ADMIN, EMAIL_NO_AUTORIZADO,
} from './config.mjs';

const MOCKFB_DIR = path.join(TESTS_DIR, 'mockfb');
const FIREBASE_URL_RE = /^https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-(?:app|auth|firestore))\.js(?:\?.*)?$/;

let _browser = null;
let _server = null;
let _serverHtml = null;

async function getBrowser() {
  if (!_browser) _browser = await lanzarChromium();
  return _browser;
}
async function getServer(htmlPath) {
  if (_server && _serverHtml === htmlPath) return _server;
  if (_server) await _server.close();
  _server = await startServer({ html: htmlPath });
  _serverHtml = htmlPath;
  return _server;
}
export async function shutdown() {
  try { if (_browser) await _browser.close(); } catch (e) { /* ya cerrado */ }
  try { if (_server) await _server.close(); } catch (e) { /* ya cerrado */ }
  _browser = null; _server = null; _serverHtml = null;
}

export function cargarFixture(nombre = 'default') {
  const ruta = path.join(TESTS_DIR, 'fixtures', `${nombre}.json`);
  if (!fs.existsSync(ruta)) throw new Error(`No existe el fixture ${ruta}. Genéralo con: node tests/fixtures/generate.mjs`);
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

export function emailDeUsuario(user) {
  if (user === undefined || user === 'authorized') return EMAIL_AUTORIZADO;
  if (user === 'authorized-nonadmin') return EMAIL_AUTORIZADO_NO_ADMIN;
  if (user === 'unauthorized') return EMAIL_NO_AUTORIZADO;
  if (user === null || user === 'none') return null;
  if (typeof user === 'string' && user.includes('@')) return user;
  throw new Error(`Valor de "user" no reconocido: ${user}`);
}

function scriptCongelarTiempo(iso) {
  return `(() => {
    const FIXED = new Date(${JSON.stringify(iso)}).getTime();
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    }
    window.Date = FakeDate;
    window.__FROZEN_NOW = FIXED;
    // Math.random determinista (mulberry32): los ids de compra ("c" + Date.now + random) quedan estables.
    let s = 0x9E3779B9 >>> 0;
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })();`;
}

// Captura de impresión (PDF) y de window.open: el HTML imprimible queda en window.__prints / window.__opens.
const SCRIPT_CAPTURA_IMPRESION = `(() => {
  const txt = (el) => (el ? (el.innerText || '').split('\\n').map(l => l.replace(/\\s+/g, ' ').trim()).filter(Boolean).join('\\n') : '');
  window.__prints = [];
  window.print = function () {
    const visibles = Array.from(document.querySelectorAll('.tab-content')).filter(el => !el.classList.contains('hidden'));
    window.__prints.push({
      bodyClass: document.body.className,
      activeTab: (document.querySelector('.tab-btn.active') || {}).dataset ? document.querySelector('.tab-btn.active').dataset.tab : null,
      printWrap: txt(document.getElementById('printSingleWrap')),
      visibleTabs: visibles.map(el => el.id),
      visibleText: visibles.map(txt).join('\\n'),
    });
  };
  window.__opens = [];
  window.open = function (url, target) {
    const rec = { url: String(url || ''), target: target || '', html: '', printed: false };
    window.__opens.push(rec);
    return { document: { write(h) { rec.html += h; }, writeln(h) { rec.html += h + '\\n'; }, open() {}, close() {} }, focus() {}, print() { rec.printed = true; }, close() {}, closed: false };
  };
})();`;

/**
 * @param {object} o
 * @param {string|object|null} [o.fixture='default']  nombre de fixture en tests/fixtures, un mapa {id: doc}, o null (colección vacía)
 * @param {string|null} [o.user='authorized']          'authorized' | 'authorized-nonadmin' | 'unauthorized' | 'none'/null | correo
 * @param {boolean} [o.freezeTime=true]                congela Date y siembra Math.random
 * @param {boolean} [o.offline=false]                  arranca sin conexión (snapshot de caché)
 * @param {boolean} [o.seedCache=true]                 si el fixture también está en el caché local (false = primer arranque sin datos locales)
 * @param {object} [o.latency]                         { echo, ack, auth } en ms (por defecto 0)
 * @param {string} [o.html]                            HTML bajo prueba (por defecto APP_HTML o ../index.html)
 * @param {string} [o.path='/index.html']              ruta (con query) a cargar
 * @param {boolean} [o.waitReady=true]                 esperar a que el panel esté sincronizado (indicador verde)
 * @param {object} [o.viewport]
 * @param {Array<string|Function>} [o.initScripts]    scripts extra que se inyectan antes de cargar la página
 * @param {Array<RegExp|string>} [o.allowErrors]      errores esperados (no cuentan como fallo)
 * @param {(d:object)=>any} [o.onDialog]               manejador de alert/confirm/prompt (por defecto acepta y registra)
 */
export async function boot(o = {}) {
  const {
    fixture = 'default', user = 'authorized', freezeTime = true, offline = false, seedCache = true,
    latency = {}, path: pagePath = '/index.html', waitReady = true, viewport = { width: 1500, height: 1000 },
    allowErrors = [], onDialog = null, cacheFirst = false,
  } = o;
  const origen = o.html ? { ruta: path.resolve(o.html), etiqueta: o.html } : resolverAppHtml();
  const server = await getServer(origen.ruta);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport, locale: LOCALE, timezoneId: TIMEZONE, acceptDownloads: true,
    serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light',
  });

  const email = emailDeUsuario(user);
  let docs = null;
  if (fixture) docs = typeof fixture === 'string' ? cargarFixture(fixture).docs : (fixture.docs || fixture);
  const config = {
    user: email ? { email } : null,
    seed: docs, seedCache, offline, persist: o.persist !== false,
    echoDelay: latency.echo, ackDelay: latency.ack, authDelay: latency.auth, cacheFirst,
  };
  await context.addInitScript(`window.__MOCKFB_CONFIG = ${JSON.stringify(config)};`);
  for (const extra of (o.initScripts || [])) await context.addInitScript(extra); // p. ej. precargar localStorage
  if (freezeTime) await context.addInitScript(scriptCongelarTiempo(FECHA_CONGELADA));
  await context.addInitScript({ path: path.join(MOCKFB_DIR, 'core.js') });
  await context.addInitScript(SCRIPT_CAPTURA_IMPRESION);

  const errors = [];
  const dialogs = [];
  const blocked = [];
  const firebaseVersions = new Set();
  const permitido = (texto) => allowErrors.some(p => (p instanceof RegExp ? p.test(texto) : texto.includes(p)));

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(server.url + '/')) return route.continue();
    const m = FIREBASE_URL_RE.exec(url);
    if (m) {
      firebaseVersions.add(m[1]);
      const body = fs.readFileSync(path.join(MOCKFB_DIR, `${m[2]}.js`), 'utf8');
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body });
    }
    blocked.push(url);
    errors.push({ kind: 'red-externa-bloqueada', text: url });
    return route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  const registrar = (kind, text, extra = {}) => { if (!permitido(text)) errors.push({ kind, text, ...extra }); };
  page.on('console', (msg) => { if (msg.type() === 'error') registrar('console.error', msg.text(), { loc: msg.location() && msg.location().url ? `${msg.location().url}:${msg.location().lineNumber}` : '' }); });
  page.on('pageerror', (err) => registrar('pageerror', (err && err.message) || String(err)));
  page.on('requestfailed', (req) => { if (!blocked.includes(req.url())) registrar('requestfailed', `${req.method()} ${req.url().slice(0, 200)} — ${req.failure() && req.failure().errorText}`); });
  page.on('response', (res) => { if (res.status() >= 400 && res.url().startsWith(server.url)) registrar('http-error', `${res.status()} ${res.url()}`); });
  page.on('dialog', async (d) => {
    const rec = { type: d.type(), message: d.message(), default: d.defaultValue() };
    dialogs.push(rec);
    try {
      const r = onDialog ? await onDialog(d, rec) : undefined;
      if (r === 'dismiss') await d.dismiss();
      else if (typeof r === 'string') await d.accept(r);
      else await d.accept(d.type() === 'prompt' ? (d.defaultValue() || '') : undefined);
    } catch (e) { /* diálogo ya cerrado */ }
  });

  const h = {
    page, context, server, errors, dialogs, blocked, firebaseVersions, html: origen, email,
    url: server.url,
    close: async () => { try { await context.close(); } catch (e) { /* cerrado */ } },
    // --- mock ---
    mock: (name, ...args) => page.evaluate(([n, a]) => { const v = window.__mockfb[n]; return typeof v === 'function' ? v.apply(window.__mockfb, a) : v; }, [name, args]),
    writes: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mockfb.writes))),
    store: () => page.evaluate(() => window.__mockfb.store),
    view: () => page.evaluate(() => window.__mockfb.view),
    events: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mockfb.events))),
    clearWrites: () => page.evaluate(() => window.__mockfb.clearWrites()),
    prints: () => page.evaluate(() => window.__prints || []),
    opens: () => page.evaluate(() => window.__opens || []),
    waitIdle: (opts) => waitIdle(page, opts),
    flushWrites: () => flushWrites(page),
    clickTab: (name) => clickTab(page, name),
    expectErrors: (...patrones) => { allowErrors.push(...patrones); for (let i = errors.length - 1; i >= 0; i--) if (permitido(errors[i].text)) errors.splice(i, 1); },
    takeErrors: () => errors.splice(0, errors.length),
    assertNoErrors: () => { if (errors.length) throw new Error('Errores no esperados:\n' + errors.map(e => `  [${e.kind}] ${e.text}`).join('\n')); },
  };

  try {
    await page.goto(server.url + pagePath, { waitUntil: 'load' });
    if (waitReady && email && user !== 'unauthorized') await esperarPanelListo(page);
  } catch (e) {
    e.message += '\n(errores capturados hasta ahora: ' + JSON.stringify(errors.slice(0, 5)) + ')';
    await h.close();
    throw e;
  }
  return h;
}

export async function esperarPanelListo(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    const dot = document.getElementById('sync-indicator');
    return app && !app.classList.contains('hidden') && dot && dot.classList.contains('green');
  }, null, { timeout });
  await waitIdle(page);
}

// Espera a que el mock no tenga ecos/acks pendientes y a que el DOM se estabilice (dos frames + sin snapshots nuevos).
export async function waitIdle(page, { timeout = 20000, settleMs = 60 } = {}) {
  const t0 = Date.now();
  let previo = -1;
  for (;;) {
    await page.waitForFunction(() => window.__mockfb && window.__mockfb.idle(), null, { timeout, polling: 20 });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
    const n = await page.evaluate(() => window.__mockfb.events.length + window.__mockfb.writes.length);
    const idle = await page.evaluate(() => window.__mockfb.idle());
    if (idle && n === previo) return;
    previo = n;
    await page.waitForTimeout(settleMs);
    if (Date.now() - t0 > timeout) throw new Error('waitIdle: el panel no se estabilizó');
  }
}

// Fuerza el guardado pendiente del campo editado: el panel guarda ~400 ms después de la última tecla (debounce) o
// al instante cuando el campo pierde el foco (focusout), así que se hace blur() y se espera a que el mock termine
// el eco/confirmación. Sin depender del reloj de pared (estable aunque la máquina vaya lenta).
export async function flushWrites(page) {
  await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && typeof a.blur === 'function') a.blur(); });
  await waitIdle(page);
}

const NOMBRES_TAB = {
  'panel principal': 'dashboard', dashboard: 'dashboard', inicio: 'dashboard',
  sep: 'panel', panel: 'panel',
  general: 'of-general', pie: 'of-pie', 'mantención': 'of-mantenimiento', mantencion: 'of-mantenimiento', mantenimiento: 'of-mantenimiento',
  'pro-retención': 'of-prorretencion', 'pro-retencion': 'of-prorretencion', prorretencion: 'of-prorretencion',
  junji: 'of-junji', faep: 'of-faep', figa: 'of-figa',
  'aporte educ.': 'of-aporte_educ', aporte_educ: 'of-aporte_educ', 'aporte educ': 'of-aporte_educ',
  'aporte junji': 'of-aporte_junji', aporte_junji: 'of-aporte_junji',
  '% ejecución': 'ejecucion', '% ejecucion': 'ejecucion', ejecucion: 'ejecucion', 'ejecución': 'ejecucion',
  reportes: 'reportes',
};
export function claveTab(nombre) {
  const n = String(nombre).trim().toLowerCase();
  if (NOMBRES_TAB[n]) return NOMBRES_TAB[n];
  if (/^(of-)?[a-z_]+$/.test(n)) return n;
  throw new Error(`Pestaña desconocida: ${nombre}`);
}
export async function clickTab(page, nombre) {
  const clave = claveTab(nombre);
  await page.click(`.tab-btn[data-tab="${clave}"]`);
  await waitIdle(page);
  return clave;
}

// Texto normalizado (innerText por líneas, espacios colapsados, sin líneas vacías) de un selector.
export async function textoDe(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return (el.innerText || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }, selector);
}
