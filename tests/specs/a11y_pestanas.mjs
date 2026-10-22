// a11y_pestanas — U-10: la barra de pestañas sigue el patrón WAI-ARIA "tabs" y la página tiene landmarks.
//
// Antes: 13 <button> sin roles ni estado (los lectores de pantalla no sabían cuál estaba activa), todas en el orden de Tab (13 paradas) y sin flechas; los
// paneles sin role; sin <nav> ni <main> (solo el <header>). Ahora: 3 role="tablist" con aria-label (Inicio / Fuentes de financiamiento / Análisis) dentro de un
// <nav aria-label="Secciones del panel">; cada pestaña es role="tab" con aria-selected y aria-controls → su panel; tabindex itinerante (solo la activa está en el
// orden de Tab); ←/→ mueven Y activan (las 13 forman una sola secuencia entre los 3 grupos, con vuelta al principio), Home / End van a la primera / última;
// cada panel es role="tabpanel" aria-labelledby → su pestaña; los paneles viven dentro de un único <main>. Mouse e irAPestana() (tarjetas del Panel principal)
// siguen funcionando y mantienen aria-selected / tabindex al día.
import { boot } from '../lib/boot.mjs';
import { axDe, landmarks } from '../lib/a11y.mjs';
import { correrSpec } from '../lib/spec.mjs';

const ORDEN = ['dashboard', 'panel', 'of-general', 'of-pie', 'of-mantenimiento', 'of-prorretencion', 'of-junji', 'of-faep', 'of-figa', 'of-aporte_educ', 'of-aporte_junji', 'ejecucion', 'reportes'];

// Estado de las pestañas y de los paneles: debe ser coherente tras CUALQUIER activación.
const estado = (page) => page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const seleccionadas = tabs.filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.dataset.tab);
  const enTab = tabs.filter((b) => b.tabIndex === 0).map((b) => b.dataset.tab);
  const activas = tabs.filter((b) => b.classList.contains('active')).map((b) => b.dataset.tab);
  const visibles = Array.from(document.querySelectorAll('.tab-content')).filter((p) => !p.classList.contains('hidden')).map((p) => ({ id: p.id, lb: p.getAttribute('aria-labelledby') }));
  const a = document.activeElement;
  return { seleccionadas, enTab, activas, visibles, foco: a && a.dataset ? a.dataset.tab || null : null, focoEsTab: !!(a && a.classList && a.classList.contains('tab-btn')), focoEsBody: a === document.body };
});
const coherente = (e, tab) => e.seleccionadas.length === 1 && e.seleccionadas[0] === tab && e.enTab.length === 1 && e.enTab[0] === tab && e.activas.length === 1 && e.activas[0] === tab
  && e.visibles.length === 1 && e.visibles[0].id === 'tab-' + tab && e.visibles[0].lb === 'tabbtn-' + tab;
async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 4).join(' | ')); }
}

await correrSpec('a11y_pestanas', async (t) => {
  const h = await boot({ fixture: 'default', viewport: { width: 1500, height: 1000 } });
  const { page } = h;

  // ======================================================================== landmarks
  await escenario(t, 'L', async () => {
    const lm = await landmarks(page);
    const cuenta = (r) => lm.filter((x) => x.rol === r).length;
    t.eq(cuenta('banner'), 1, 'L1) exactamente un landmark banner (<header>)', lm);
    t.eq(cuenta('navigation'), 1, 'L1) exactamente un landmark navigation (<nav>)', lm);
    t.eq(cuenta('main'), 1, 'L1) exactamente un landmark main (<main>)', lm);
    t.eq(cuenta('contentinfo'), 0, 'L1) sin contentinfo (el panel no tiene pie) — no se inventan landmarks vacíos', lm);
    t.ok(lm.filter((x) => x.rol === 'navigation').every((x) => x.nombre.length > 3), 'L1) el <nav> tiene nombre ("Secciones del panel")', lm);
    const dom = await page.evaluate(() => ({
      header: document.querySelectorAll('header').length, nav: document.querySelectorAll('nav').length, main: document.querySelectorAll('main, [role="main"]').length,
      rolesBanner: document.querySelectorAll('[role="banner"]').length, navDentroDeWrap: !!document.querySelector('.wrap > nav.tab-bar'), mainDentroDeWrap: !!document.querySelector('.wrap > main'),
      paneles: document.querySelectorAll('main > .tab-content').length, panelesFueraDeMain: document.querySelectorAll('.tab-content').length - document.querySelectorAll('main .tab-content').length,
    }));
    t.ok(dom.header === 1 && dom.nav === 1 && dom.main === 1 && dom.rolesBanner === 0, 'L2) sin landmarks duplicados en el DOM (1 header, 1 nav, 1 main)', dom);
    t.ok(dom.navDentroDeWrap && dom.mainDentroDeWrap && dom.paneles === 13 && dom.panelesFueraDeMain === 0, 'L2) los 13 paneles cuelgan de <main> y <nav>/<main> de .wrap', dom);
  });

  // ======================================================================== estructura ARIA
  await escenario(t, 'S', async () => {
    const r = await page.evaluate(() => {
      const listas = Array.from(document.querySelectorAll('[role="tablist"]')).map((l) => ({ label: l.getAttribute('aria-label'), n: l.querySelectorAll('[role="tab"]').length, orient: l.getAttribute('aria-orientation') }));
      const tabs = Array.from(document.querySelectorAll('.tab-btn')).map((b) => {
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        return { tab: b.dataset.tab, rol: b.getAttribute('role'), id: b.id, sel: b.getAttribute('aria-selected'), ti: b.tabIndex, panelExiste: !!panel, panelRol: panel && panel.getAttribute('role'), panelLb: panel && panel.getAttribute('aria-labelledby'), tablistPadre: !!b.closest('[role="tablist"]') };
      });
      const paneles = Array.from(document.querySelectorAll('.tab-content')).map((p) => ({ id: p.id, rol: p.getAttribute('role'), lb: p.getAttribute('aria-labelledby'), existeLb: !!document.getElementById(p.getAttribute('aria-labelledby')) }));
      return { listas, tabs, paneles };
    });
    t.eq(r.listas.map((l) => l.label), ['Inicio', 'Fuentes de financiamiento', 'Análisis'], 'S1) 3 role="tablist" con aria-label (Inicio / Fuentes de financiamiento / Análisis)');
    t.eq(r.listas.map((l) => l.n), [2, 9, 2], 'S1) con 2 + 9 + 2 pestañas');
    t.ok(r.tabs.length === 13 && r.tabs.every((x) => x.rol === 'tab' && x.tablistPadre && /^tabbtn-/.test(x.id)), 'S2) las 13 pestañas son role="tab" dentro de un tablist y con id', r.tabs.filter((x) => x.rol !== 'tab'));
    t.ok(r.tabs.every((x) => x.panelExiste && x.panelRol === 'tabpanel' && x.panelLb === x.id), 'S2) cada pestaña tiene aria-controls → su role="tabpanel" cuyo aria-labelledby apunta de vuelta a ella', r.tabs.filter((x) => !(x.panelExiste && x.panelRol === 'tabpanel' && x.panelLb === x.id)));
    t.ok(r.paneles.length === 13 && r.paneles.every((p) => p.rol === 'tabpanel' && p.existeLb), 'S3) los 13 paneles son role="tabpanel" con aria-labelledby válido', r.paneles);
    t.eq(r.tabs.filter((x) => x.sel === 'true').map((x) => x.tab), ['dashboard'], 'S4) al cargar solo "Panel principal" tiene aria-selected="true"');
    t.eq(r.tabs.filter((x) => x.ti === 0).map((x) => x.tab), ['dashboard'], 'S4) y solo ella está en el orden de Tab (tabindex itinerante; las otras 12 con tabindex=-1)');
    const ax = await axDe(page, '#tabbtn-dashboard');
    t.ok(ax && ax.rol === 'tab' && ax.nombre === 'Panel principal' && ax.propiedades.selected === true, 'S5) el árbol de accesibilidad ve role=tab "Panel principal" seleccionada (el emoji no entra al nombre)', ax);
    const axp = await axDe(page, '#tab-dashboard');
    t.ok(axp && axp.rol === 'tabpanel' && axp.nombre === 'Panel principal', 'S5) y su tabpanel nombrado por la pestaña', axp);
    const axl = await axDe(page, '[role="tablist"][aria-label="Fuentes de financiamiento"]');
    t.ok(axl && axl.rol === 'tablist' && axl.nombre === 'Fuentes de financiamiento', 'S5) los tablist tienen nombre', axl);
    t.eq(await page.evaluate(() => Array.from(document.querySelectorAll('.tab-btn')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).join(' | ')),
      '🏠 Panel principal | 🎓 SEP | 💰 General | 🧩 PIE | 🔧 Mantención | 📌 Pro-Retención | 🧸 JUNJI | 🏗️ FAEP | 🌐 FIGA | 🏛️ Aporte Educ. | 🍼 Aporte JUNJI | 📉 % Ejecución | 📈 Reportes',
      'S6) el texto visible de las 13 pestañas no cambia');
  });

  // ======================================================================== mouse: sigue igual
  await escenario(t, 'M', async () => {
    for (const tab of ORDEN) {
      await page.click(`.tab-btn[data-tab="${tab}"]`);
      await h.waitIdle();
      const e = await estado(page);
      if (!t.ok(coherente(e, tab), `M1) clic en "${tab}": aria-selected, tabindex, .active y panel visible coherentes`, e)) break;
    }
    await h.clickTab('Panel principal');
  });

  // ======================================================================== teclado
  await escenario(t, 'K', async () => {
    // Tab: una sola parada en la barra
    await page.focus('#signout-btn');
    await page.keyboard.press('Tab');
    let e = await estado(page);
    t.ok(e.focoEsTab && e.foco === 'dashboard', 'K1) Tab desde "Cerrar sesión" cae en la pestaña activa (Panel principal)', e);
    await page.keyboard.press('Tab');
    const salio = await page.evaluate(() => { const a = document.activeElement; return { enBarra: !!a.closest('.tab-bar'), tag: a.tagName, id: a.id, cls: a.className }; });
    t.ok(!salio.enBarra, 'K1) el siguiente Tab SALE de la barra (las otras 12 pestañas no están en el orden de Tab)', salio);
    await page.keyboard.press('Shift+Tab');
    e = await estado(page);
    t.ok(e.focoEsTab && e.foco === 'dashboard', 'K1) Shift+Tab vuelve a la pestaña activa');

    // flechas: recorren las 13 en orden, entre los 3 grupos, activando
    for (let i = 1; i < ORDEN.length; i++) {
      await page.keyboard.press('ArrowRight');
      await h.waitIdle();
      e = await estado(page);
      if (!t.ok(coherente(e, ORDEN[i]) && e.foco === ORDEN[i], `K2) → llega a "${ORDEN[i]}" y la activa (foco, aria-selected, panel)`, e)) break;
    }
    await page.keyboard.press('ArrowRight');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'dashboard') && e.foco === 'dashboard', 'K3) → desde la última (Reportes) da la vuelta a la primera', e);
    await page.keyboard.press('ArrowLeft');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'reportes') && e.foco === 'reportes', 'K3) ← desde la primera va a la última (Reportes)', e);
    await page.keyboard.press('ArrowLeft');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'ejecucion') && e.foco === 'ejecucion', 'K4) ← cruza de grupo (Reportes → % Ejecución)', e);
    await page.keyboard.press('ArrowLeft');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'of-aporte_junji') && e.foco === 'of-aporte_junji', 'K4) ← cruza de grupo (% Ejecución → Aporte JUNJI)', e);
    await page.keyboard.press('Home');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'dashboard') && e.foco === 'dashboard', 'K5) Home va a la primera pestaña y la activa', e);
    await page.keyboard.press('End');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'reportes') && e.foco === 'reportes', 'K5) End va a la última y la activa', e);
    // con Ctrl/Alt/Shift/Meta no se interceptan las flechas
    await page.keyboard.press('Shift+ArrowLeft');
    e = await estado(page);
    t.ok(coherente(e, 'reportes'), 'K6) Shift+← no mueve las pestañas', e);
    // Enter / Espacio sobre una pestaña con foco (patrón nativo del botón)
    await page.keyboard.press('Home');
    await h.waitIdle();
    // el contenido de la pestaña activa se alcanza con Tab: la primera parada tras la barra está DENTRO del panel
    await page.keyboard.press('Tab');
    const dentro = await page.evaluate(() => { const a = document.activeElement; return { enPanel: !!a.closest('.tab-content:not(.hidden)'), id: a.id, cls: a.className }; });
    t.ok(dentro.enPanel, 'K7) tras la barra, Tab entra al contenido del panel activo', dentro);
  });

  // ======================================================================== irAPestana (tarjetas del Panel principal) y botones
  await escenario(t, 'I', async () => {
    await h.clickTab('Panel principal');
    // clic en una tarjeta → irAPestana('of-general')
    await page.click('#dashCards .dash-card[data-fuente="general"]');
    await h.waitIdle();
    let e = await estado(page);
    t.ok(coherente(e, 'of-general'), 'I1) clic en la tarjeta de General: pestaña General activa y aria-selected/tabindex/panel coherentes', e);
    t.ok(e.focoEsTab && e.foco === 'of-general', 'I1) y el foco pasa a la pestaña (no se pierde en <body> al ocultarse la tarjeta)', e);
    // Enter sobre una tarjeta con el teclado
    await h.clickTab('Panel principal');
    await page.focus('#dashCards .dash-card[data-fuente="faep"]');
    await page.keyboard.press('Enter');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'of-faep') && e.focoEsTab && e.foco === 'of-faep', 'I2) Enter sobre la tarjeta de FAEP activa la pestaña FAEP y deja el foco en ella', e);
    // irAPestana directo
    await page.evaluate(() => window.irAPestana('ejecucion'));
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'ejecucion'), 'I3) window.irAPestana("ejecucion") (llamada directa) deja el estado coherente', e);
    await page.evaluate(() => window.irAPestana('inexistente'));
    e = await estado(page);
    t.ok(coherente(e, 'ejecucion'), 'I3) una pestaña inexistente no cambia nada', e);
    // Enter / Espacio en una pestaña enfocada con roving tabindex
    await page.focus('#tabbtn-reportes');
    await page.keyboard.press('Enter');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'reportes'), 'I4) Enter sobre una pestaña enfocada la activa', e);
    await page.focus('#tabbtn-of-pie');
    await page.keyboard.press('Space');
    await h.waitIdle();
    e = await estado(page);
    t.ok(coherente(e, 'of-pie'), 'I4) Espacio también', e);
    await h.clickTab('Panel principal');
  });

  // ======================================================================== ventana angosta: la barra con scroll sigue siendo operable
  await escenario(t, 'N', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await h.waitIdle();
    await page.focus('#tabbtn-dashboard');
    await page.keyboard.press('End');
    await h.waitIdle();
    const e = await estado(page);
    const visible = await page.evaluate(() => { const r = document.getElementById('tabbtn-reportes').getBoundingClientRect(); return { izq: r.left, der: r.right, ancho: window.innerWidth }; });
    t.ok(coherente(e, 'reportes') && visible.izq >= 0 && visible.der <= visible.ancho + 1, 'N1) a 390 px, End lleva a la última pestaña y el foco la deja visible (la barra se desplaza sola)', { e, visible });
    await page.setViewportSize({ width: 1500, height: 1000 });
    await h.clickTab('Panel principal');
  });

  t.noErrores(h);
  await h.close();
});
