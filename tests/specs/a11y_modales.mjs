// a11y_modales — U-09: los 3 diálogos modales del panel (detalle SEP, detalle de una fuente y "Cómo usar") son diálogos de verdad.
//
// Antes: sin role="dialog" / aria-modal / nombre accesible; el foco no entraba al abrir (SEP, "Cómo usar"), Tab salía del diálogo hacia la página que
// queda detrás, y al cerrar el foco no volvía a quien lo abrió (SEP, "Cómo usar", panel "Atención"). Ahora: role="dialog" aria-modal="true" aria-labelledby → título,
// foco inicial en el botón Cerrar, Tab / Shift+Tab ciclan dentro, el resto de la página (.wrap) queda `inert`, Escape / ✕ / clic en el velo cierran y el foco vuelve
// al elemento que lo abrió (o a su equivalente si ese se repintó o quedó oculto). Y el reconciliador del modal (morphContenedor, PR #57) no pierde el foco, el
// cursor ni lo tecleado, ni borra los atributos de rol/aria, ante snapshots remotos.
//
// Inventario (grep de `modal-overlay`, `role=`, `position:fixed`, `confirm(`): exactamente 3 diálogos propios (#rbdModal, #otrasFuentesModal, #helpModal); el panel
// "Atención" del Panel principal es una LISTA (no un modal): abre el detalle de la entidad en el modal de SEP o de la fuente, y eso también se verifica aquí.
import { boot } from '../lib/boot.mjs';
import { axDe } from '../lib/a11y.mjs';
import { correrSpec } from '../lib/spec.mjs';

const MODALES = [
  { id: 'rbdModal', titulo: 'modalTitle', cerrar: 'modalCloseBtn', nombre: 'SEP (detalle por RBD)' },
  { id: 'otrasFuentesModal', titulo: 'otrasFuentesModalTitle', cerrar: 'otrasFuentesModalCloseBtn', nombre: 'fuentes (detalle por entidad)' },
  { id: 'helpModal', titulo: 'helpModalTitle', cerrar: 'helpModalCloseBtn', nombre: 'Cómo usar' },
];

const abierto = (page, id) => page.evaluate((i) => !document.getElementById(i).classList.contains('hidden'), id);
const activo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const ov = a && a.closest ? a.closest('.modal-overlay') : null;
  const fila = a && a.closest ? a.closest('tr.otras-fuentes-row') : null;
  return {
    id: a && a.id, tag: a && a.tagName, cls: a && a.className, enModal: ov ? ov.id : null, esBody: a === document.body,
    rbd: a && a.getAttribute ? (a.getAttribute('data-abrir-rbd') || (fila && fila.getAttribute('data-rbd')) || a.getAttribute('data-rbd') || a.getAttribute('data-atencion-rbd')) : null,
    esFila: !!(a && a.matches && a.matches('tr.otras-fuentes-row')),
  };
});
const paginaInerte = (page) => page.evaluate(() => document.querySelector('#app .wrap').hasAttribute('inert'));
// ¿alcanza el foco a un control del fondo? (con `inert` focus() no hace nada)
const intentaEnfocarFondo = (page) => page.evaluate(() => {
  const previo = document.activeElement;
  const candidatos = ['signout-btn', 'helpBtn'].map((i) => document.getElementById(i)).concat(Array.from(document.querySelectorAll('.tab-btn')));
  const logrados = [];
  candidatos.forEach((el) => { if (!el) return; el.focus(); if (document.activeElement === el) logrados.push(el.id || el.dataset.tab); });
  if (previo && previo.focus) previo.focus();
  return logrados;
});
const enfocables = (page, id) => page.evaluate((i) => {
  const panel = document.querySelector(`#${i} .modal-panel`);
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  return Array.from(panel.querySelectorAll(sel)).filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden').length;
}, id);
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 4).join(' | ')); }
}

// Verifica el contrato completo de un diálogo ya ABIERTO (sin tocar el contenido): semántica, foco, fondo inerte, trampa de Tab.
async function verificarAbierto(t, h, m, etiqueta, tituloEsperado) {
  const { page } = h;
  const panel = `#${m.id} .modal-panel`;
  const ax = await axDe(page, panel);
  t.ok(ax && ax.rol === 'dialog', `${etiqueta}: el panel se expone como role="dialog"`, ax);
  t.ok(ax && ax.propiedades && ax.propiedades.modal === true, `${etiqueta}: aria-modal="true"`, ax);
  t.ok(ax && ax.nombre.length > 3 && (!tituloEsperado || ax.nombre.includes(tituloEsperado)), `${etiqueta}: nombre accesible = su título ("${ax && ax.nombre}")`, ax);
  const attrs = await page.evaluate((id) => { const p = document.querySelector(`#${id} .modal-panel`); return { rol: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), lb: p.getAttribute('aria-labelledby'), tab: p.getAttribute('tabindex') }; }, m.id);
  t.ok(attrs.rol === 'dialog' && attrs.modal === 'true' && attrs.lb === m.titulo, `${etiqueta}: atributos role/aria-modal/aria-labelledby="${m.titulo}"`, attrs);

  const a0 = await activo(page);
  t.ok(a0.enModal === m.id && a0.id === m.cerrar, `${etiqueta}: el foco inicial está dentro del diálogo (botón Cerrar)`, a0);
  t.ok(await paginaInerte(page), `${etiqueta}: el fondo (.wrap) queda inert`);
  t.eq(await intentaEnfocarFondo(page), [], `${etiqueta}: ningún control del fondo puede recibir el foco`);
  const axFondo = await axDe(page, '#helpBtn');
  t.ok(!axFondo || axFondo.ignorado, `${etiqueta}: el fondo sale del árbol de accesibilidad (los lectores de pantalla no lo recorren)`, axFondo);

  // Trampa de foco: Tab desde el último → primero; Shift+Tab desde el primero → último; y 12 Tab seguidos no salen
  const n = await enfocables(page, m.id);
  t.ok(n >= 2, `${etiqueta}: el diálogo tiene ${n} controles enfocables`);
  await page.evaluate((id) => {
    const panel = document.querySelector(`#${id} .modal-panel`);
    const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    const f = Array.from(panel.querySelectorAll(sel)).filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    window.__a11yPrimero = f[0]; window.__a11yUltimo = f[f.length - 1];
    f[f.length - 1].focus();
  }, m.id);
  await page.keyboard.press('Tab');
  t.ok(await page.evaluate(() => document.activeElement === window.__a11yPrimero), `${etiqueta}: Tab desde el último control vuelve al primero (cicla dentro del diálogo)`, await activo(page));
  await page.keyboard.press('Shift+Tab');
  t.ok(await page.evaluate(() => document.activeElement === window.__a11yUltimo), `${etiqueta}: Shift+Tab desde el primero va al último`, await activo(page));
  await page.keyboard.press('Tab');
  let fuera = null;
  for (let i = 0; i < 12 && !fuera; i++) {
    await page.keyboard.press('Tab');
    const a = await activo(page);
    if (a.enModal !== m.id) fuera = a;
  }
  t.ok(!fuera, `${etiqueta}: 12 Tab seguidos no sacan el foco del diálogo`, fuera);
  await page.evaluate(() => { delete window.__a11yPrimero; delete window.__a11yUltimo; });
  await page.focus(`#${m.cerrar}`);
}

await correrSpec('a11y_modales', async (t) => {
  const h = await boot({ fixture: 'default', viewport: { width: 1400, height: 900 } });
  const { page } = h;

  // ======================================================================== 0) marcado estático de los 3 diálogos
  await escenario(t, 'E0', async () => {
    for (const m of MODALES) {
      const r = await page.evaluate((mm) => {
        const p = document.querySelector(`#${mm.id} .modal-panel`);
        const ov = document.getElementById(mm.id);
        return { rol: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), lb: p.getAttribute('aria-labelledby'), tituloExiste: !!document.getElementById(mm.titulo), dentroDeWrap: !!ov.closest('.wrap'), tabindex: p.getAttribute('tabindex') };
      }, m);
      t.ok(r.rol === 'dialog' && r.modal === 'true' && r.lb === m.titulo && r.tituloExiste, `E0) ${m.nombre}: role="dialog" aria-modal="true" aria-labelledby="${m.titulo}" (el título existe)`, r);
      t.ok(!r.dentroDeWrap, `E0) ${m.nombre}: el diálogo está FUERA de .wrap (para poder inertizar el fondo sin inertizarlo a él)`, r);
    }
    t.eq(await page.evaluate(() => document.querySelectorAll('.modal-overlay').length), 3, 'E0) inventario: exactamente 3 diálogos modales propios (.modal-overlay)');
    t.eq(await page.evaluate(() => document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog').length), 3, 'E0) y ningún otro role="dialog" / <dialog> en la página');
    t.eq(await page.evaluate(() => document.querySelector('#app .wrap').hasAttribute('inert')), false, 'E0) con todos cerrados la página NO está inert');
  });

  // ======================================================================== A) modal de detalle SEP
  const sep = MODALES[0];
  await escenario(t, 'A', async () => {
    await h.clickTab('SEP');
    // abrir con el teclado desde el botón ▸ de la fila
    await page.focus('#tableBody .expand-btn[data-abrir-rbd="1121"]');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // modalidad de teclado
    await page.keyboard.press('Enter');
    await h.waitIdle();
    t.ok(await abierto(page, sep.id), 'A1) Enter sobre ▸ abre el detalle SEP');
    await verificarAbierto(t, h, sep, 'A1) SEP', 'RBD 1121');
    await page.keyboard.press('Escape');
    await h.waitIdle();
    t.ok(!(await abierto(page, sep.id)), 'A2) Escape cierra el detalle SEP');
    t.ok(!(await paginaInerte(page)), 'A2) y la página deja de estar inert');
    const a = await activo(page);
    t.ok(a.rbd === '1121' && /expand-btn/.test(a.cls), 'A2) el foco vuelve al botón ▸ de la fila que lo abrió', a);
    t.eq(await page.evaluate(() => document.querySelectorAll('.modal-overlay:not(.hidden)').length), 0, 'A2) no queda ningún diálogo abierto (Escape no se duplica en otro modal)');

    // abrir con el ratón (clic en el RBD) y cerrar con ✕: el foco vuelve a la fila (botón ▸ equivalente)
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1120"]');
    await h.waitIdle();
    t.ok((await activo(page)).id === sep.cerrar, 'A3) con clic también entra el foco al diálogo');
    await page.click(`#${sep.cerrar}`);
    await h.waitIdle();
    const a3 = await activo(page);
    t.ok(!(await abierto(page, sep.id)) && a3.rbd === '1120' && /expand-btn/.test(a3.cls), 'A3) ✕ cierra y el foco vuelve a la fila de ese RBD (▸)', a3);

    // clic en el velo cierra y devuelve el foco
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1123"]');
    await h.waitIdle();
    await page.mouse.click(5, 450); // fuera del panel (sobre el velo)
    await h.waitIdle();
    const a4 = await activo(page);
    t.ok(!(await abierto(page, sep.id)) && a4.rbd === '1123', 'A4) el clic en el velo cierra y devuelve el foco a la fila', a4);
  });

  // ======================================================================== B) reconciliación (snapshots remotos) con el modal SEP abierto
  await escenario(t, 'B', async () => {
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1122"]');
    await h.waitIdle();
    const celda = '#modalBody input.celda-input[data-rbd="1122"][data-modo="rem"][data-mes="ENERO"]';
    await page.click(celda);
    await page.keyboard.press('End');
    await page.keyboard.type('77');
    const antes = await page.evaluate((s) => { const el = document.querySelector(s); return { v: el.value, pos: el.selectionStart, nombre: el.getAttribute('aria-label') }; }, celda);
    await h.remoto('1125', 'd.rem.meses.ENERO = 31313');            // snapshot de otro RBD
    await h.remoto('1122', 'd.rem.meses.MARZO = 424242');           // y de este mismo RBD
    await h.waitIdle();
    const despues = await page.evaluate((s) => { const el = document.querySelector(s); return { v: el.value, pos: el.selectionStart, foco: document.activeElement === el, nombre: el.getAttribute('aria-label') }; }, celda);
    t.ok(despues.foco && despues.v === antes.v && despues.pos === antes.pos, 'B1) tras snapshots remotos la celda conserva foco, texto y cursor', { antes, despues });
    t.ok(!!despues.nombre && despues.nombre === antes.nombre, `B1) y su nombre accesible ("${despues.nombre}")`);
    const attrs = await page.evaluate(() => { const p = document.querySelector('#rbdModal .modal-panel'); return { rol: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), lb: p.getAttribute('aria-labelledby'), inert: document.querySelector('#app .wrap').hasAttribute('inert'), abierto: !document.getElementById('rbdModal').classList.contains('hidden') }; });
    t.ok(attrs.rol === 'dialog' && attrs.modal === 'true' && attrs.lb === 'modalTitle' && attrs.inert && attrs.abierto, 'B1) role/aria-modal/aria-labelledby, fondo inert y modal abierto se conservan tras los snapshots', attrs);
    const marzo = await page.evaluate(() => document.querySelector('#modalBody input.celda-input[data-rbd="1122"][data-modo="rem"][data-mes="MARZO"]').value);
    t.ok(/424\.?242/.test(marzo), 'B1) y el cambio remoto de otra celda sí se refleja (el reconciliador sigue actuando)', marzo);
    t.eq((await activo(page)).id, '', 'B1) el foco sigue en la celda (no se movió al botón Cerrar)');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== C) detalle de una fuente (por teclado, desde la fila)
  const fuentes = MODALES[1];
  await escenario(t, 'C', async () => {
    await h.clickTab('of-general');
    await page.focus('#otrasFuentesTbody-general tr.otras-fuentes-row[data-rbd="1121"]');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await h.waitIdle();
    t.ok(await abierto(page, fuentes.id), 'C1) Enter sobre la fila abre el detalle de la fuente');
    await verificarAbierto(t, h, fuentes, 'C1) fuentes', 'RBD 1121');
    await page.keyboard.press('Escape');
    await h.waitIdle();
    const a = await activo(page);
    t.ok(!(await abierto(page, fuentes.id)) && a.esFila && a.rbd === '1121', 'C2) Escape cierra y el foco vuelve a la fila (comportamiento de la PR #58 intacto)', a);
    t.ok(!(await paginaInerte(page)), 'C2) página libre');

    // un snapshot remoto repinta las filas mientras el modal está abierto: el foco vuelve a la fila NUEVA de la misma entidad
    await page.focus('#otrasFuentesTbody-general tr.otras-fuentes-row[data-rbd="1121"]');
    await page.evaluate(() => { window.__filaVieja = document.querySelector('#otrasFuentesTbody-general tr[data-rbd="1121"]'); });
    await page.keyboard.press('Enter');
    await h.waitIdle();
    await h.remoto('1121', 'd.otras_fuentes.general.gasto_rem.meses.ENERO = 7654321');
    await h.waitIdle();
    const repintada = await page.evaluate(() => !window.__filaVieja.isConnected);
    await page.click('#otrasFuentesModalCloseBtn');
    await h.waitIdle();
    const b = await activo(page);
    t.ok(repintada, 'C3) un snapshot remoto repinta las filas de la tabla con el modal abierto (la fila original ya no está en el DOM)');
    t.ok(b.esFila && b.rbd === '1121', 'C3) y aun así el foco vuelve a la fila vigente de esa entidad', b);

    // reconciliación del modal de fuentes: foco/cursor/atributos intactos
    await page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="1121"]');
    await h.waitIdle();
    const celda = '#otrasFuentesModalBody input.celda-input[data-rbd="1121"][data-fuente="general"][data-modo="of_gasto_rem"][data-mes="FEBRERO"]';
    await page.click(celda);
    await page.keyboard.press('End');
    await page.keyboard.type('55');
    const antes = await page.evaluate((s) => { const el = document.querySelector(s); return { v: el.value, pos: el.selectionStart }; }, celda);
    await h.remoto('1121', 'd.otras_fuentes.general.gasto_rem.meses.MARZO = 999000');
    await h.waitIdle();
    const despues = await page.evaluate((s) => { const el = document.querySelector(s); return { v: el.value, pos: el.selectionStart, foco: document.activeElement === el }; }, celda);
    t.ok(despues.foco && despues.v === antes.v && despues.pos === antes.pos, 'C4) modal de fuentes: tras un snapshot remoto la celda conserva foco, texto y cursor', { antes, despues });
    const attrs = await page.evaluate(() => { const p = document.querySelector('#otrasFuentesModal .modal-panel'); return { rol: p.getAttribute('role'), lb: p.getAttribute('aria-labelledby'), inert: document.querySelector('#app .wrap').hasAttribute('inert') }; });
    t.ok(attrs.rol === 'dialog' && attrs.lb === 'otrasFuentesModalTitle' && attrs.inert, 'C4) y el rol/nombre del diálogo y el fondo inert se conservan', attrs);
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== D) "Cómo usar"
  const ayuda = MODALES[2];
  await escenario(t, 'D', async () => {
    await h.clickTab('Panel principal');
    await page.focus('#helpBtn');
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await h.waitIdle();
    t.ok(await abierto(page, ayuda.id), 'D1) "Cómo usar" abre');
    await verificarAbierto(t, h, ayuda, 'D1) ayuda', 'Cómo usar');
    await page.keyboard.press('Escape');
    await h.waitIdle();
    const a = await activo(page);
    t.ok(!(await abierto(page, ayuda.id)) && a.id === 'helpBtn', 'D2) Escape cierra y el foco vuelve al botón "Cómo usar"', a);
    t.ok(!(await paginaInerte(page)), 'D2) página libre');
    await page.click('#helpBtn');
    await h.waitIdle();
    await page.click(`#${ayuda.cerrar}`);
    await h.waitIdle();
    t.eq((await activo(page)).id, 'helpBtn', 'D3) ✕ cierra y el foco vuelve a "Cómo usar"');
  });

  // ======================================================================== E) panel "Atención" (lista del Panel principal → detalle de la entidad)
  await escenario(t, 'E', async () => {
    await h.clickTab('Panel principal');
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('#dashAtencion li[data-atencion-rbd]')).map((li) => ({ f: li.dataset.atencionFuente, r: li.dataset.atencionRbd })));
    t.ok(items.length >= 2, `E1) el panel "Atención" lista ${items.length} entidades`, items);
    const sepItem = items.find((i) => i.f === 'sep');
    const ofItem = items.find((i) => i.f !== 'sep');
    for (const it of [ofItem, sepItem].filter(Boolean)) {
      const esSep = it.f === 'sep';
      await page.focus(`#dashAtencion li[data-atencion-rbd="${it.r}"][data-atencion-fuente="${it.f}"]`);
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await h.waitIdle();
      const id = esSep ? sep.id : fuentes.id;
      t.ok(await abierto(page, id), `E1) Enter sobre ${it.f} ${it.r} abre su detalle (${esSep ? 'modal SEP' : 'modal de la fuente'})`);
      const a0 = await activo(page);
      t.ok(a0.enModal === id, 'E1) con el foco dentro del diálogo', a0);
      await page.keyboard.press('Escape');
      await h.waitIdle();
      const a = await activo(page);
      const esperado = esSep ? /expand-btn/.test(a.cls) && a.rbd === it.r : a.esFila && a.rbd === it.r;
      t.ok(!(await abierto(page, id)) && esperado, `E2) Escape cierra y el foco vuelve a la fila de ${it.f} ${it.r} en la pestaña ahora activa (el ítem de "Atención" quedó oculto)`, a);
      t.ok(!a.esBody, 'E2) el foco no se pierde en <body>');
      await h.clickTab('Panel principal');
    }
  });

  // ======================================================================== F) la sesión termina con un diálogo abierto
  await escenario(t, 'F', async () => {
    await h.clickTab('SEP');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    t.ok(await paginaInerte(page), 'F1) con el detalle abierto, la página está inert');
    await page.evaluate(() => window.__mockfb.auth.setUser(null)); // la sesión se cierra (p. ej. vence) con el detalle abierto
    await page.waitForFunction(() => !document.getElementById('login-screen').classList.contains('hidden'), null, { timeout: 5000 });
    t.ok(!(await abierto(page, sep.id)), 'F1) al mostrarse la pantalla de acceso el diálogo queda cerrado');
    t.ok(!(await paginaInerte(page)), 'F1) y la página no queda inert (al volver a entrar no estaría bloqueada)');
  });

  t.noErrores(h);
  await h.close();
});
