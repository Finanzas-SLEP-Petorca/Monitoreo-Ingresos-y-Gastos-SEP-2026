// login_enter_rechazo (U-21): Enter en el campo de correo envía el formulario y el rechazo de un correo no autorizado ya no destruye el formulario.
//
// Antes: (1) Enter no hacía nada (no había <form> ni manejador de teclado); (2) "Acceso denegado" reemplazaba el innerHTML de #login-screen:
// desaparecían #login-email y #login-btn (y sus manejadores) y la única salida era recargar la página.
// Ahora: Enter = clic en "Enviar enlace de acceso" (sin doble envío), y el rechazo muestra una tarjeta aparte con "Usar otro correo",
// que restablece el formulario limpio con el foco en el correo. La lista de correos y la sesión (signOut) no cambian.
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { EMAIL_AUTORIZADO, EMAIL_NO_AUTORIZADO } from '../lib/config.mjs';

const visible = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, id);
const enlaces = (page) => page.evaluate(() => window.__mockfb.auth.sentLinks.map((l) => l.email));
const URL_ENLACE = (email) => `/index.html?mode=signIn&oobCode=codigo-valido&apiKey=mock&mockEmail=${encodeURIComponent(email)}`;

await correrSpec('login_enter_rechazo', async (t) => {
  // 1) Enter en el campo de correo
  {
    const h = await boot({ user: 'none', waitReady: false });
    const { page } = h;
    await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'));

    await page.focus('#login-email');
    await page.keyboard.press('Enter');
    t.eq((await page.textContent('#login-error')).trim(), 'Por favor ingresa tu correo electrónico.', 'Enter con el correo vacío: mismo mensaje de validación que el botón');
    t.eq((await enlaces(page)).length, 0, 'Enter con el correo vacío: no se envía nada');

    await page.fill('#login-email', EMAIL_NO_AUTORIZADO);
    await page.keyboard.press('Enter');
    t.ok(/no está autorizado/.test(await page.textContent('#login-error')), 'Enter con un correo fuera de la lista: "no está autorizado"');
    t.eq((await enlaces(page)).length, 0, 'Enter con un correo fuera de la lista: NO se envía enlace');

    await page.fill('#login-email', '  ' + EMAIL_AUTORIZADO.toUpperCase() + ' ');
    // dos Enter en el mismo turno (el envío del primero sigue en curso): el segundo no debe enviar otro enlace
    await page.evaluate(() => {
      const i = document.getElementById('login-email');
      for (let k = 0; k < 2; k++) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !document.getElementById('login-success').classList.contains('hidden'));
    t.eq(await enlaces(page), [EMAIL_AUTORIZADO], 'Enter con un correo autorizado: se envía UN enlace (correo normalizado) aunque llegue un segundo Enter mientras se envía');
    t.ok(new RegExp(EMAIL_AUTORIZADO).test(await page.textContent('#login-success-msg')), 'Enter: aparece el mensaje de éxito con el correo');
    t.ok(!(await visible(page, 'login-form')), 'Enter: el formulario se oculta tras el envío (igual que con el botón)');
    t.noErrores(h);
    await h.close();
  }

  // 2) Correo no autorizado ya autenticado: tarjeta de rechazo + "Usar otro correo"
  {
    const h = await boot({ user: 'unauthorized', waitReady: false });
    const { page } = h;
    await page.waitForFunction(() => /Acceso denegado/.test(document.getElementById('login-screen').innerText));
    t.ok(await visible(page, 'login-screen') && !(await visible(page, 'app')), 'rechazo: se ve la pantalla de acceso y NO el panel');
    t.ok(await visible(page, 'login-denied'), 'rechazo: tarjeta "Acceso denegado" visible');
    t.eq((await page.textContent('#login-denied-email')).trim(), EMAIL_NO_AUTORIZADO, 'rechazo: nombra el correo rechazado');
    t.ok(/no está autorizado/.test(await page.innerText('#login-denied')) && /wilson\.rojas@sleppetorca\.gob\.cl/.test(await page.innerText('#login-denied')), 'rechazo: mensaje claro con a quién pedir acceso');
    t.eq(await page.evaluate(() => window.__mockfb.auth.signOutCalls), 1, 'rechazo: la sesión del correo no autorizado se cierra (signOut)');
    t.eq(await page.evaluate(() => window.__mockfb.listenerCount), 0, 'rechazo: nunca se abre el listener de Firestore');
    t.eq((await h.writes()).length, 0, 'rechazo: ninguna escritura');
    t.ok(await page.evaluate(() => !!document.getElementById('login-email') && !!document.getElementById('login-btn') && !!document.getElementById('login-form')), 'rechazo: el formulario NO se destruye (siguen #login-email, #login-btn y #login-form en el DOM)');
    t.ok(!(await visible(page, 'login-form')), 'rechazo: el formulario no se muestra mientras se ve el rechazo');
    t.eq(await page.evaluate(() => document.activeElement && document.activeElement.id), 'login-another-btn', 'rechazo: el foco queda en "Usar otro correo"');
    t.eq((await page.textContent('#login-another-btn')).trim(), 'Usar otro correo', 'rechazo: botón "Usar otro correo"');

    await page.keyboard.press('Enter'); // el botón enfocado se activa con el teclado
    await page.waitForFunction(() => !document.getElementById('login-card-main').classList.contains('hidden'));
    t.ok(await visible(page, 'login-form') && !(await visible(page, 'login-denied')), 'Usar otro correo: vuelve el formulario y se oculta el rechazo');
    t.eq(await page.inputValue('#login-email'), '', 'Usar otro correo: el campo de correo queda vacío');
    t.ok(await page.evaluate(() => document.getElementById('login-error').classList.contains('hidden')), 'Usar otro correo: sin mensajes de error previos');
    t.eq(await page.evaluate(() => document.activeElement && document.activeElement.id), 'login-email', 'Usar otro correo: el foco queda en el campo de correo');
    t.eq(await page.evaluate(() => document.getElementById('login-btn').disabled), false, 'Usar otro correo: el botón de envío está habilitado');
    t.ok(await visible(page, 'login-screen') && !(await visible(page, 'app')), 'Usar otro correo: sigue la pantalla de acceso (no entra al panel)');

    // y el formulario funciona (manejadores vivos): otro correo no autorizado → rechazo del formulario; uno autorizado + Enter → enlace
    await page.fill('#login-email', 'otro.intruso@example.com');
    await page.keyboard.press('Enter');
    t.ok(/no está autorizado/.test(await page.textContent('#login-error')), 'tras el rechazo, el formulario sigue validando la lista de correos');
    await page.fill('#login-email', EMAIL_AUTORIZADO);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('login-success').classList.contains('hidden'));
    t.eq(await enlaces(page), [EMAIL_AUTORIZADO], 'tras el rechazo, un correo autorizado + Enter envía el enlace');
    t.noErrores(h);
    await h.close();
  }

  // 3) Rechazo al volver desde el enlace del correo (el enlace era de un correo no autorizado)
  {
    const h = await boot({ user: 'none', waitReady: false, path: URL_ENLACE(EMAIL_NO_AUTORIZADO),
      initScripts: [`localStorage.setItem('emailForSignIn', ${JSON.stringify(EMAIL_NO_AUTORIZADO)});`] });
    const { page } = h;
    await page.waitForFunction(() => !document.getElementById('login-denied').classList.contains('hidden'), null, { timeout: 15000 });
    t.eq((await page.textContent('#login-denied-email')).trim(), EMAIL_NO_AUTORIZADO, 'enlace de un correo no autorizado: rechazo con su correo');
    t.ok(!(await visible(page, 'login-loading')) && !(await visible(page, 'app')), 'enlace de un correo no autorizado: sin "Verificando acceso..." ni panel');
    t.eq(await page.evaluate(() => window.__mockfb.auth.signOutCalls), 1, 'enlace de un correo no autorizado: se cierra la sesión');
    await page.click('#login-another-btn');
    t.ok(await visible(page, 'login-form') && (await page.inputValue('#login-email')) === '', 'enlace de un correo no autorizado: "Usar otro correo" restablece el formulario');
    t.noErrores(h);
    await h.close();
  }

  // 4) Pantalla angosta: la tarjeta de rechazo y su botón caben (390 px)
  {
    const h = await boot({ user: 'unauthorized', waitReady: false, viewport: { width: 390, height: 800 } });
    const { page } = h;
    await page.waitForFunction(() => !document.getElementById('login-denied').classList.contains('hidden'));
    const caja = await page.evaluate(() => { const b = document.getElementById('login-another-btn').getBoundingClientRect(); return { l: b.left, r: b.right, vw: innerWidth }; });
    t.ok(caja.l >= 0 && caja.r <= caja.vw, `390 px: el botón "Usar otro correo" cabe en la ventana (${Math.round(caja.l)}–${Math.round(caja.r)} de ${caja.vw})`);
    await h.close();
  }
});
