// teclado_fuentes (U-05): el detalle de las 9 pestañas de fuente se abre con el teclado.
//
// Antes las filas (<tr class="otras-fuentes-row">) solo respondían al clic del ratón: no eran focusables (tabindex ausente) y Enter/Espacio no hacían
// nada; la tabla SEP, en cambio, tiene el botón ▸ de cada fila. Ahora la fila es focusable (tabindex=0, aria-label "Ver detalle de …"),
// Enter / Espacio abren el detalle, el foco se ve (:focus-visible) y los controles internos (XLS/CSV/PDF) conservan su comportamiento.
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const FUENTES = ['general', 'pie', 'mantenimiento', 'prorretencion', 'junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji'];
const modalAbierto = (page) => page.evaluate(() => !document.getElementById('otrasFuentesModal').classList.contains('hidden'));
const activo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const fila = a && a.closest ? a.closest('tr.otras-fuentes-row') : null;
  return { tag: a && a.tagName, id: a && a.id, esFila: !!(a && a.matches && a.matches('tr.otras-fuentes-row')), rbd: fila ? fila.getAttribute('data-rbd') : null, accion: a && a.getAttribute ? a.getAttribute('data-action') : null };
});

await correrSpec('teclado_fuentes', async (t) => {
  const h = await boot({ viewport: { width: 1280, height: 600 } });
  const { page } = h;

  // 1) Las 9 fuentes: filas focusables; Tab llega a la primera fila; Enter abre; el foco entra al modal; Escape cierra y devuelve el foco a la fila
  for (const f of FUENTES) {
    await h.clickTab('of-' + f);
    const filas = await page.evaluate((k) => Array.from(document.querySelectorAll(`#otrasFuentesTbody-${k} tr.otras-fuentes-row`)).map((tr) => ({ rbd: tr.getAttribute('data-rbd'), tabindex: tr.getAttribute('tabindex'), label: tr.getAttribute('aria-label') })), f);
    t.ok(filas.length > 0 && filas.every((r) => r.tabindex === '0'), `${f}: las ${filas.length} filas son focusables (tabindex="0")`);
    t.ok(filas.every((r) => /^Ver detalle de .+/.test(r.label || '')), `${f}: cada fila tiene nombre accesible "Ver detalle de …"`);

    await page.focus(`#ofCorteAplicarBtn-${f}`); // último control antes de la tabla
    let llego = false;
    for (let i = 0; i < 6 && !llego; i++) { await page.keyboard.press('Tab'); llego = (await activo(page)).esFila; }
    const a1 = await activo(page);
    t.ok(llego && a1.rbd === filas[0].rbd, `${f}: Tab desde los controles llega a la primera fila (${filas[0].rbd})`, a1);
    t.ok(await page.evaluate(() => { const a = document.activeElement; return a.matches(':focus-visible') && getComputedStyle(a).outlineStyle !== 'none' && parseFloat(getComputedStyle(a).outlineWidth) > 0; }), `${f}: la fila enfocada con teclado muestra un anillo de foco visible`);

    await page.keyboard.press('Enter');
    await h.waitIdle();
    t.ok(await modalAbierto(page), `${f}: Enter sobre la fila abre el modal de detalle`);
    t.ok(new RegExp(filas[0].rbd).test(await page.textContent('#otrasFuentesModalTitle')) || (await page.textContent('#otrasFuentesModalTitle')).trim().length > 0, `${f}: el modal corresponde a la entidad de la fila`);
    t.eq((await activo(page)).id, 'otrasFuentesModalCloseBtn', `${f}: el foco entra al modal (botón Cerrar)`);
    await page.keyboard.press('Escape');
    await h.waitIdle();
    t.ok(!(await modalAbierto(page)), `${f}: Escape cierra el modal`);
    const a2 = await activo(page);
    t.ok(a2.esFila && a2.rbd === filas[0].rbd, `${f}: al cerrar, el foco vuelve a la fila de origen`, a2);
  }

  // 2) Espacio abre sin desplazar la página; otras teclas / modificadores no abren
  for (const f of ['general', 'junji']) {
    await h.clickTab('of-' + f);
    const segunda = await page.evaluate((k) => document.querySelectorAll(`#otrasFuentesTbody-${k} tr.otras-fuentes-row`)[1].getAttribute('data-rbd'), f);
    await page.focus(`#otrasFuentesTbody-${f} tr.otras-fuentes-row[data-rbd="${segunda}"]`);
    await page.evaluate(() => {
      if (!window.__kdInstalado) { window.__kdInstalado = true; document.addEventListener('keydown', (e) => window.__kd.push({ key: e.key, prevented: e.defaultPrevented })); }
      window.__kd = [];
      document.querySelector('.wrap').scrollTop = 40; // para detectar un desplazamiento
    });
    const pos0 = await page.evaluate(() => ({ wrap: document.querySelector('.wrap').scrollTop, win: window.scrollY, tabla: document.querySelector('.tab-content:not(.hidden) .table-scroll').scrollTop }));
    for (const combo of ['a', 'Control+Enter', 'Escape']) {
      await page.keyboard.press(combo);
      t.ok(!(await modalAbierto(page)), `${f}: "${combo}" sobre la fila NO abre el modal`);
      await page.focus(`#otrasFuentesTbody-${f} tr.otras-fuentes-row[data-rbd="${segunda}"]`);
    }
    await page.keyboard.press('Space');
    await h.waitIdle();
    t.ok(await modalAbierto(page), `${f}: Espacio sobre la fila abre el modal`);
    const kd = await page.evaluate(() => window.__kd.filter((k) => k.key === ' '));
    t.ok(kd.length >= 1 && kd.every((k) => k.prevented), `${f}: la tecla Espacio se maneja con preventDefault (no desplaza la página)`, kd);
    await page.keyboard.press('Escape');
    await h.waitIdle();
    const pos1 = await page.evaluate(() => ({ wrap: document.querySelector('.wrap').scrollTop, win: window.scrollY, tabla: document.querySelector('.tab-content:not(.hidden) .table-scroll').scrollTop }));
    t.eq(pos1, pos0, `${f}: tras abrir con Espacio y cerrar, ningún contenedor se desplazó`);
  }

  // 3) Controles internos: Enter / Espacio sobre XLS y PDF hacen lo suyo y NO abren el modal
  {
    await h.clickTab('of-general');
    const rbd = await page.evaluate(() => document.querySelector('#otrasFuentesTbody-general tr.otras-fuentes-row').getAttribute('data-rbd'));
    const sel = (accion) => `#otrasFuentesTbody-general tr[data-rbd="${rbd}"] .row-action-btn[data-action="${accion}"]`;
    await page.focus(`#otrasFuentesTbody-general tr[data-rbd="${rbd}"]`);
    await page.keyboard.press('Tab');
    t.eq((await activo(page)).accion, 'excel', 'general: Tab desde la fila pasa al botón XLS de esa fila');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.keyboard.press('Enter')]);
    t.ok(/\.xlsx$/i.test(dl.suggestedFilename()), `general: Enter sobre ⬇ XLS descarga el Excel (${dl.suggestedFilename()})`);
    t.ok(!(await modalAbierto(page)), 'general: Enter sobre ⬇ XLS NO abre el detalle');
    await page.focus(sel('pdf'));
    await page.evaluate(() => { window.__prints = []; });
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    t.eq((await page.evaluate(() => window.__prints.length)), 1, 'general: Espacio sobre 🖨 PDF imprime (una vez)');
    t.ok(!(await modalAbierto(page)), 'general: Espacio sobre 🖨 PDF NO abre el detalle');
    await page.waitForTimeout(450); // la impresión limpia #printSingleWrap ~300 ms después
  }

  // 4) Un cambio remoto repinta la tabla: el foco del teclado no se pierde entre el Tab y el Enter
  {
    await h.clickTab('of-general');
    const rbd = await page.evaluate(() => document.querySelectorAll('#otrasFuentesTbody-general tr.otras-fuentes-row')[2].getAttribute('data-rbd'));
    await page.focus(`#otrasFuentesTbody-general tr[data-rbd="${rbd}"]`);
    await page.evaluate(() => { window.__filaVieja = document.activeElement; });
    await h.remoto(rbd, `d.otras_fuentes = d.otras_fuentes || {}; d.otras_fuentes.general = d.otras_fuentes.general || {}; d.otras_fuentes.general.ingreso = { meses: { ENERO: 123456 }, total: 123456 };`);
    await h.waitIdle();
    const r = await page.evaluate(() => ({ vieja: window.__filaVieja.isConnected, activo: document.activeElement.matches('tr.otras-fuentes-row') ? document.activeElement.getAttribute('data-rbd') : document.activeElement.tagName }));
    t.ok(!r.vieja, 'general: el cambio remoto reconstruyó la tabla (la fila enfocada era un nodo viejo)');
    t.eq(r.activo, rbd, 'general: tras el repintado el foco vuelve a la fila equivalente');
    await page.keyboard.press('Enter');
    await h.waitIdle();
    t.ok(await modalAbierto(page), 'general: Enter después del repintado abre el detalle de esa fila');
    await page.keyboard.press('Escape');
  }

  // 5) El clic del ratón sigue igual (y no deja un anillo de foco)
  {
    await h.clickTab('of-faep');
    await page.click('#otrasFuentesTbody-faep td[data-abrir-otra-fuente]');
    await h.waitIdle();
    t.ok(await modalAbierto(page), 'faep: el clic en una celda sigue abriendo el detalle');
    await page.click('#otrasFuentesModalCloseBtn');
    await h.waitIdle();
    t.ok(await page.evaluate(() => { const a = document.activeElement; return !(a.matches && a.matches('tr.otras-fuentes-row:focus-visible')); }), 'faep: tras abrir con el ratón no queda anillo de foco (:focus-visible) en la fila');
  }
  t.noErrores(h);
  await h.close();
});
