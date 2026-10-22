// movil_dashboard (U-14): a 390 px las tablas del Panel principal ("Ver datos en tabla") no desbordan la página y los montos no se parten.
//
// Antes: las dos tablas (por fuente y evolución mensual) medían 702 / 406 px dentro de una columna de 320 px, la página llegaba a 737 px de ancho
// (scroll horizontal del body) y los montos "$5.007.896.595" se partían en dos líneas. Ahora cada tabla vive en un contenedor con
// overflow-x:auto, las celdas son nowrap y la página mantiene el ancho de la ventana. También se revisa la lista "Atención" (a ≤ 360 px
// empujaba la página a 383 px por una columna de grilla que no podía encogerse).
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const ANCHOS = [390, 360, 768];

await correrSpec('movil_dashboard', async (t) => {
  for (const w of ANCHOS) {
    const h = await boot({ viewport: { width: w, height: 844 } });
    const { page } = h;
    await page.evaluate(() => document.querySelectorAll('#tab-dashboard details').forEach((d) => { d.open = true; }));
    await h.waitIdle();
    const m = await page.evaluate(() => {
      const vw = innerWidth;
      const lineas = (nodo) => { const r = document.createRange(); r.selectNodeContents(nodo); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
      const tablas = [...document.querySelectorAll('#tab-dashboard .dash-tabla table')].map((tb) => {
        const cont = tb.parentElement;
        const cs = getComputedStyle(cont);
        const celdas = [...tb.querySelectorAll('th, td')];
        const antes = cont.scrollLeft;
        cont.scrollLeft = cont.scrollWidth; // la última columna tiene que poder verse
        const ultima = tb.querySelector('tr:last-child td:last-child, tr:first-child th:last-child');
        const ur = ultima.getBoundingClientRect(), cr = cont.getBoundingClientRect();
        const ultimaVisible = ur.right <= cr.right + 1 && ur.right <= vw + 1;
        cont.scrollLeft = antes;
        return {
          id: cont.id, overflowX: cs.overflowX, anchoTabla: Math.round(tb.getBoundingClientRect().width), anchoCont: cont.clientWidth,
          celdasPartidas: celdas.filter((c) => lineas(c) > 1).length, celdasWrap: celdas.filter((c) => getComputedStyle(c).whiteSpace !== 'nowrap').length, ultimaVisible,
        };
      });
      // montos del panel ($…, "… M") en una sola línea
      const partidos = [];
      const it = document.createTreeWalker(document.getElementById('tab-dashboard'), NodeFilter.SHOW_TEXT);
      for (let n = it.nextNode(); n; n = it.nextNode()) {
        const tx = n.textContent.trim();
        if (!/^(▼ )?-?\$-?[\d.]+$/.test(tx) && !/^-?[\d.,]+ M$/.test(tx)) continue;
        const el = n.parentElement;
        if (el.closest('details:not([open])') || !el.getClientRects().length) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) partidos.push(tx);
      }
      const ul = document.getElementById('dashAtencion');
      return {
        vw, docSW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth, tablas, partidos,
        atencion: { sw: ul.scrollWidth, cw: ul.clientWidth, n: ul.children.length },
      };
    });
    t.ok(m.docSW <= m.vw && m.bodySW <= m.vw, `${w} px: la página no desborda (documentElement ${m.docSW}, body ${m.bodySW}, ventana ${m.vw})`);
    t.eq(m.tablas.length, 2, `${w} px: las 2 tablas del Panel principal (por fuente, evolución mensual) están en el DOM`);
    m.tablas.forEach((tb) => {
      t.ok(/(auto|scroll)/.test(tb.overflowX), `${w} px: #${tb.id} tiene scroll horizontal propio (overflow-x: ${tb.overflowX})`);
      t.eq(tb.celdasPartidas, 0, `${w} px: #${tb.id} ninguna celda se parte en dos líneas`);
      t.eq(tb.celdasWrap, 0, `${w} px: #${tb.id} todas las celdas con white-space:nowrap`);
      t.ok(tb.ultimaVisible, `${w} px: #${tb.id} la última columna se alcanza desplazando el contenedor`);
      if (w <= 390) t.ok(tb.anchoTabla >= tb.anchoCont, `${w} px: #${tb.id} la tabla (${tb.anchoTabla} px) usa su ancho natural dentro del contenedor (${tb.anchoCont} px)`);
    });
    t.eq(m.partidos, [], `${w} px: ningún monto del panel se parte en dos líneas`);
    t.ok(m.atencion.n > 0 && m.atencion.sw <= m.atencion.cw + 1, `${w} px: la lista "Atención" (${m.atencion.n} filas) cabe en su columna (${m.atencion.sw} <= ${m.atencion.cw})`);
    t.noErrores(h);
    await h.close();
  }
});
