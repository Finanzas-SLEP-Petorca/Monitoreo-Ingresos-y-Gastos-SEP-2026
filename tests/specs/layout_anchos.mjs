// layout_anchos (U-01): el panel se adapta al ancho de la ventana (1024 / 1280 / 1366 / 1440 y degradación a tableta y móvil).
//
// Antes, `.wrap` se quedaba en el ancho MÍNIMO de su contenido (1250–1360 px según la pestaña, por las tablas y el grupo de pestañas)
// aunque la ventana fuera menor: con 1024/1280 px quedaban fuera de la ventana pestañas, "Cerrar sesión" y columnas, y no había scroll de página.
// Por cada ancho y por cada una de las 13 pestañas se exige:
//   - sin scroll horizontal de página (documentElement, body) ni de .wrap;
//   - "Cerrar sesión" y "Cómo usar" dentro de la ventana y alcanzables;
//   - las 13 pestañas alcanzables (≥ 768 px: todas visibles sin desplazar la barra; ≤ 760 px: barra con scroll propio + indicación);
//   - tarjetas KPI sin recortar; ningún elemento recortado por overflow:hidden ni fuera de la ventana (salvo dentro de contenedores con scroll propio);
//   - a ≥ 1440 px el contenedor sigue siendo de 1360 px centrado (el diseño no cambia).
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { medirLayout } from '../lib/layout.mjs';

const ANCHOS = [1024, 1280, 1366, 1440, 768, 390];
const TABS = ['dashboard', 'panel', 'of-general', 'of-pie', 'of-mantenimiento', 'of-prorretencion', 'of-junji', 'of-faep', 'of-figa', 'of-aporte_educ', 'of-aporte_junji', 'ejecucion', 'reportes'];

await correrSpec('layout_anchos', async (t) => {
  for (const w of ANCHOS) {
    const h = await boot({ viewport: { width: w, height: 800 } });
    const problemas = [];
    for (const tab of TABS) {
      await h.clickTab(tab);
      const m = await medirLayout(h.page);
      const p = (msg) => problemas.push(`[${tab}] ${msg}`);
      if (m.docSW > m.vw || m.bodySW > m.vw) p(`scroll horizontal de página: documentElement ${m.docSW} px / body ${m.bodySW} px > ventana ${m.vw} px`);
      if (m.wrapSW > m.wrapCW + 1) p(`.wrap más ancho que su caja (${m.wrapSW} > ${m.wrapCW} px)`);
      Object.entries(m.acciones).forEach(([id, ok]) => { if (!ok) p(`#${id} fuera de la ventana o tapado`); });
      const tabsInalcanzables = Object.entries(m.tabs).filter(([, ok]) => !ok).map(([k]) => k);
      if (tabsInalcanzables.length) p(`pestañas inalcanzables: ${tabsInalcanzables.join(', ')}`);
      if (w >= 768) {
        const ocultas = Object.entries(m.tabsSinScroll).filter(([, ok]) => !ok).map(([k]) => k);
        if (ocultas.length) p(`pestañas que exigen desplazar la barra: ${ocultas.join(', ')}`);
      } else if (m.tabBarScrollPropio && !(m.tabBar.masDer || m.tabBar.masIzq)) {
        p('la barra de pestañas tiene scroll propio pero no muestra indicación (clases tabs-mas-der / tabs-mas-izq)');
      }
      if (m.kpiRecortadas.length) p(`tarjetas KPI recortadas: ${m.kpiRecortadas.slice(0, 4).join(' | ')}`);
      if (m.recortes.length) p(`elementos recortados: ${m.recortes.slice(0, 4).join(' | ')}`);
      if (m.fueraDeVentana.length) p(`elementos fuera de la ventana: ${m.fueraDeVentana.slice(0, 4).join(' | ')}`);
      if (w >= 1440) {
        const esperado = [Math.round((w - 1360) / 2), Math.round((w - 1360) / 2) + 1360];
        if (m.wrapRect[0] !== esperado[0] || m.wrapRect[1] !== esperado[1]) p(`el contenedor debería medir 1360 px centrado ${JSON.stringify(esperado)} y mide ${JSON.stringify(m.wrapRect)}`);
      }
    }
    t.ok(problemas.length === 0, `${w} px · 13 pestañas sin recortes, sin scroll horizontal de página, con "Cerrar sesión" y pestañas alcanzables`);
    problemas.slice(0, 14).forEach((x) => t.info('PROBLEMA ' + x));
    if (problemas.length > 14) t.info(`… ${problemas.length} problemas en total`);
    t.noErrores(h);
    await h.close();
  }
});
