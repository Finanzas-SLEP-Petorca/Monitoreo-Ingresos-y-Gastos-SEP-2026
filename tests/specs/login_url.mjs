// login_url (A1): el enlace de acceso que se manda por correo vuelve a la URL REAL de la página (origen + ruta,
// sin query ni hash) cuando se sirve por http/https, y a la constante de producción cuando se abre desde file://.
// Además: el nombre antiguo del repositorio ya no aparece en el HTML y, al completar el enlace, se limpia la URL.
import fs from 'node:fs';
import { boot } from '../lib/boot.mjs';
import { resolverAppHtml } from '../lib/html-source.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { EMAIL_AUTORIZADO } from '../lib/config.mjs';

const URL_PRODUCCION = 'https://finanzas-slep-petorca.github.io/Monitoreo-Ingresos-y-Gastos-SLEP-Petorca-2026/';
const enlacesEnviados = (page) => page.evaluate(() => window.__mockfb.auth.sentLinks);
async function pedirEnlace(page) {
  await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'));
  await page.fill('#login-email', EMAIL_AUTORIZADO);
  await page.click('#login-btn');
  await page.waitForFunction(() => !document.getElementById('login-success').classList.contains('hidden'));
}

await correrSpec('login_url', async (t) => {
  // 0) el HTML no conserva el nombre antiguo del repositorio ni la URL antigua
  {
    const html = fs.readFileSync(resolverAppHtml().ruta, 'utf8');
    t.ok(!html.includes('Monitoreo-Ingresos-y-Gastos-SEP-2026'), 'el HTML ya no menciona el nombre antiguo del repositorio (…-SEP-2026)');
    t.ok(html.includes(URL_PRODUCCION), 'el HTML trae la URL de producción nueva como respaldo');
  }
  // 1) http: origen + ruta, sin query ni hash
  {
    const h = await boot({ user: 'none', waitReady: false, path: '/index.html?utm=1&mode=x#seccion' });
    await pedirEnlace(h.page);
    const [e] = await enlacesEnviados(h.page);
    t.eq(e.url, h.url + '/index.html', 'servido por http: el enlace vuelve a origen + ruta (sin ?query ni #hash)');
    t.ok(e.handleCodeInApp === true, 'handleCodeInApp:true');
    t.noErrores(h);
    await h.close();
  }
  // 2) http en la raíz "/": la ruta es "/"
  {
    const h = await boot({ user: 'none', waitReady: false, path: '/' });
    await pedirEnlace(h.page);
    const [e] = await enlacesEnviados(h.page);
    t.eq(e.url, h.url + '/', 'servido en "/": el enlace vuelve a origen + "/"');
    await h.close();
  }
  // 3) file://: respaldo con la URL de producción
  {
    const h = await boot({ user: 'none', waitReady: false });
    const p2 = await h.context.newPage();
    const errores = [];
    p2.on('pageerror', e => errores.push(e.message));
    await p2.route(/^file:/, route => route.continue()); // el contexto bloquea todo lo que no sea el servidor local; file:// se deja pasar solo en esta página
    await p2.goto('file://' + h.html.ruta + '?x=1#y', { waitUntil: 'load' });
    await pedirEnlace(p2);
    const [e] = await enlacesEnviados(p2);
    t.eq(e.url, URL_PRODUCCION, 'abierto desde file://: el enlace usa la URL de producción nueva');
    t.eq(errores, [], 'file://: sin errores de página');
    await p2.close();
    await h.close();
  }
  // 4) al completar el enlace se limpia la URL (apiKey/oobCode/mode) con history.replaceState
  {
    const h = await boot({ user: 'none', waitReady: false, path: `/index.html?mode=signIn&oobCode=codigo-valido&apiKey=mock&mockEmail=${encodeURIComponent(EMAIL_AUTORIZADO)}#frag`,
      initScripts: [`localStorage.setItem('emailForSignIn', ${JSON.stringify(EMAIL_AUTORIZADO)});`] });
    await h.page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'), null, { timeout: 15000 });
    const u = new URL(h.page.url());
    t.ok(u.search === '' && u.hash === '' && u.pathname === '/index.html', 'enlace completado: la URL queda sin query ni hash', u.href);
    t.eq(await h.page.evaluate(() => window.__mockfb.auth.signInCalls.length), 1, 'se llamó una vez a signInWithEmailLink');
    t.noErrores(h);
    await h.close();
  }
});
