// auth_flujo: acceso por correo institucional + enlace mágico (Firebase Auth mockeado) y lista de correos autorizados.
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { EMAIL_AUTORIZADO, EMAIL_AUTORIZADO_NO_ADMIN, EMAIL_NO_AUTORIZADO } from '../lib/config.mjs';

const visible = (page, id) => page.evaluate((i) => !document.getElementById(i).classList.contains('hidden'), id);
const URL_ENLACE = (email, codigo = 'codigo-valido') => `/index.html?mode=signIn&oobCode=${codigo}&apiKey=mock&mockEmail=${encodeURIComponent(email)}`;

await correrSpec('auth_flujo', async (t) => {
  // 1) Usuario autenticado pero NO autorizado: se cierra su sesión y se muestra "Acceso denegado"
  {
    const h = await boot({ user: 'unauthorized', waitReady: false });
    const { page } = h;
    await page.waitForFunction(() => /Acceso denegado/.test(document.getElementById('login-screen').innerText));
    t.ok(await visible(page, 'login-screen') && !(await visible(page, 'app')), 'no autorizado: se ve la pantalla de acceso y NO el panel');
    t.ok(new RegExp(EMAIL_NO_AUTORIZADO.replace('.', '\\.')).test(await page.innerText('#login-screen')), 'no autorizado: la pantalla nombra el correo rechazado');
    t.eq(await page.evaluate(() => window.__mockfb.auth.signOutCalls), 1, 'no autorizado: se llama a signOut()');
    t.eq(await page.evaluate(() => window.__mockfb.listenerCount), 0, 'no autorizado: nunca se abre el listener de Firestore');
    t.eq((await h.writes()).length, 0, 'no autorizado: ninguna escritura');
    t.noErrores(h);
    await h.close();
  }
  // 2) Sin sesión: formulario de acceso y validaciones
  {
    const h = await boot({ user: 'none', waitReady: false });
    const { page } = h;
    await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'));
    t.ok(await visible(page, 'login-form') && !(await visible(page, 'app')), 'sin sesión: se ve el formulario de acceso');
    await page.click('#login-btn');
    t.eq((await page.textContent('#login-error')).trim(), 'Por favor ingresa tu correo electrónico.', 'correo vacío: mensaje de validación');
    await page.fill('#login-email', EMAIL_NO_AUTORIZADO);
    await page.click('#login-btn');
    t.ok(/no está autorizado/.test(await page.textContent('#login-error')), 'correo fuera de la lista: "no está autorizado"');
    t.eq(await page.evaluate(() => window.__mockfb.auth.sentLinks.length), 0, 'correo fuera de la lista: NO se envía enlace');
    await page.fill('#login-email', '  ' + EMAIL_AUTORIZADO.toUpperCase() + ' ');
    await page.click('#login-btn');
    await page.waitForFunction(() => !document.getElementById('login-success').classList.contains('hidden'));
    const enviados = await page.evaluate(() => window.__mockfb.auth.sentLinks);
    t.eq(enviados.length, 1, 'correo autorizado (con mayúsculas y espacios): se envía 1 enlace');
    t.eq(enviados[0].email, EMAIL_AUTORIZADO, 'el correo se normaliza a minúsculas antes de enviar');
    t.ok(enviados[0].handleCodeInApp === true && /^https:\/\/finanzas-slep-petorca\.github\.io\//.test(enviados[0].url), 'el enlace pide handleCodeInApp y vuelve al sitio publicado', enviados[0]);
    t.ok(new RegExp(EMAIL_AUTORIZADO).test(await page.textContent('#login-success-msg')), 'mensaje de éxito nombra el correo');
    t.eq(await page.evaluate(() => localStorage.getItem('emailForSignIn')), EMAIL_AUTORIZADO, 'el correo queda en localStorage para completar el enlace');
    await page.click('#login-back-btn');
    t.ok(await visible(page, 'login-form') && !(await visible(page, 'login-success')), 'el botón "Volver" regresa al formulario');
    // error de red al enviar
    await page.evaluate(() => window.__mockfb.auth.failNextSend('auth/network-request-failed'));
    await page.fill('#login-email', EMAIL_AUTORIZADO);
    await page.click('#login-btn');
    await page.waitForFunction(() => /Error al enviar el enlace/.test(document.getElementById('login-error').textContent));
    t.ok(true, 'si el envío falla se muestra "Error al enviar el enlace"');
    t.eq(await page.evaluate(() => document.getElementById('login-btn').disabled), false, 'el botón de acceso se vuelve a habilitar tras el error');
    t.noErrores(h);
    await h.close();
  }
  // 3) Llegada desde el enlace del correo (correo recordado en localStorage)
  {
    const h = await boot({ user: 'none', waitReady: false, path: URL_ENLACE(EMAIL_AUTORIZADO),
      initScripts: [`localStorage.setItem('emailForSignIn', ${JSON.stringify(EMAIL_AUTORIZADO)});`] });
    const { page } = h;
    await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'), null, { timeout: 15000 });
    await h.waitIdle();
    t.ok(await visible(page, 'app') && !(await visible(page, 'login-screen')), 'enlace válido: entra al panel');
    t.eq((await page.textContent('#user-display-name')).trim(), 'Wilson Rojas', 'enlace válido: muestra el nombre del usuario');
    t.eq(new URL(page.url()).search, '', 'enlace válido: se limpia la URL (history.replaceState)');
    t.eq(await page.evaluate(() => localStorage.getItem('emailForSignIn')), null, 'enlace válido: se borra emailForSignIn');
    t.eq(await page.evaluate(() => window.__mockfb.auth.signInCalls.length), 1, 'enlace válido: una llamada a signInWithEmailLink');
    t.noErrores(h);
    await h.close();
  }
  // 4) Enlace sin correo recordado: el panel pregunta el correo con prompt()
  {
    const h = await boot({ user: 'none', waitReady: false, path: URL_ENLACE(EMAIL_AUTORIZADO_NO_ADMIN),
      onDialog: (d) => (d.type() === 'prompt' ? EMAIL_AUTORIZADO_NO_ADMIN : undefined) });
    const { page } = h;
    await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('green'), null, { timeout: 15000 });
    t.ok(h.dialogs.some(d => d.type === 'prompt' && /confirmar el acceso/.test(d.message)), 'enlace sin correo guardado: se pide confirmar el correo (prompt)', h.dialogs);
    t.eq((await page.textContent('#user-display-name')).trim(), 'Catalina Brito', 'enlace + prompt: entra como el correo confirmado');
    t.eq(await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.contains('hidden')), true, 'un usuario autorizado NO administrador no ve "Revisar duplicados"');
    // cerrar sesión
    await page.click('#signout-btn');
    await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'));
    t.ok(await visible(page, 'login-screen') && !(await visible(page, 'app')), 'cerrar sesión: vuelve a la pantalla de acceso');
    t.eq(await page.evaluate(() => window.__mockfb.listenerCount), 0, 'cerrar sesión: se cancela el listener de Firestore');
    t.noErrores(h);
    await h.close();
  }
  // 5) Enlace inválido / vencido
  {
    const h = await boot({ user: 'none', waitReady: false, path: URL_ENLACE(EMAIL_AUTORIZADO, 'expired'),
      initScripts: [`localStorage.setItem('emailForSignIn', ${JSON.stringify(EMAIL_AUTORIZADO)});`] });
    const { page } = h;
    await page.waitForFunction(() => /no es válido o ya expiró/.test(document.getElementById('login-error').textContent), null, { timeout: 15000 });
    t.ok(await visible(page, 'login-screen') && !(await visible(page, 'app')), 'enlace vencido: sigue en la pantalla de acceso con el mensaje de error');
    t.noErrores(h);
    await h.close();
  }
  // 6) Distintos autorizados ven su nombre (EMAIL_TO_NAME) y el admin ve la herramienta de duplicados
  {
    const h = await boot({ user: 'wilson.rojasabarca@gmail.com' });
    t.eq((await h.page.textContent('#user-display-name')).trim(), 'Wilson Rojas Abarca', 'nombre explícito por correo (Wilson Rojas Abarca)');
    t.eq(await h.page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.contains('hidden')), false, 'el segundo administrador también ve "Revisar duplicados"');
    t.noErrores(h);
    await h.close();
  }
});
