// Mediciones de maquetación (ancho de página, recortes, alcance de acciones y pestañas) para los specs de layout.
//
//   const m = await medirLayout(page);   // se ejecuta dentro de la página, con la pestaña activa que haya
//
// Definiciones (las mismas que usa el spec `layout_anchos`):
//   - desborde de página : documentElement/body/.wrap más anchos que la ventana (scroll horizontal de página).
//   - recorte            : un elemento cuyo borde queda fuera de un ancestro con overflow-x:hidden|clip (se pierde contenido) o
//                          fuera de la ventana sin estar dentro de un contenedor con scroll propio (overflow-x:auto|scroll).
//   - alcanzable         : el elemento está dentro de la ventana y el punto central responde a él (nada lo tapa); en las barras con
//                          scroll propio se mide después de llevarlo a la vista con scrollIntoView.
export async function medirLayout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const de = document.documentElement, body = document.body;
    const wrap = document.querySelector('.wrap');
    const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '');
    const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const alcanzable = (el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) return false;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };

    const out = {
      vw, docSW: de.scrollWidth, bodySW: body.scrollWidth, wrapSW: wrap.scrollWidth, wrapCW: wrap.clientWidth,
      wrapRect: [Math.round(wrap.getBoundingClientRect().left), Math.round(wrap.getBoundingClientRect().right)],
    };

    // Acciones del encabezado
    out.acciones = {};
    ['signout-btn', 'helpBtn'].forEach((id) => { const el = document.getElementById(id); out.acciones[id] = !!el && visible(el) && alcanzable(el); });

    // Pestañas
    const barra = document.querySelector('.wrap > .tab-bar');
    out.tabBar = { sw: barra.scrollWidth, cw: barra.clientWidth, overflowX: getComputedStyle(barra).overflowX, masIzq: barra.classList.contains('tabs-mas-izq'), masDer: barra.classList.contains('tabs-mas-der') };
    const scrollPropio = /(auto|scroll)/.test(out.tabBar.overflowX) && out.tabBar.sw > out.tabBar.cw + 1;
    const posIni = barra.scrollLeft;
    barra.scrollLeft = 0;
    out.tabs = {};
    out.tabsSinScroll = {}; // visibles sin necesidad de desplazar la barra
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const r = b.getBoundingClientRect();
      out.tabsSinScroll[b.dataset.tab] = r.left >= -0.5 && r.right <= vw + 0.5 && r.right <= barra.getBoundingClientRect().right + 0.5;
    });
    document.querySelectorAll('.tab-btn').forEach((b) => { out.tabs[b.dataset.tab] = visible(b) && alcanzable(b); });
    barra.scrollLeft = posIni;
    out.tabBarScrollPropio = scrollPropio;

    // Tarjetas KPI: dentro del contenedor y con el texto completo
    out.kpiRecortadas = [];
    document.querySelectorAll('#app .kpi-card, #app .dash-tile').forEach((c) => {
      if (c.closest('.hidden, .modal-overlay') || !visible(c)) return;
      const r = c.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      const interior = [c, ...c.querySelectorAll('.value, .t-value, .label, .t-label')].some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible');
      const textoFuera = [...c.querySelectorAll('.value, .t-value')].some((e) => { const er = e.getBoundingClientRect(); return er.right > r.right + 1; });
      if (r.left < w.left - 1 || r.right > w.right + 1 || r.right > vw + 1 || interior || textoFuera) out.kpiRecortadas.push(nombre(c) + ' ' + (c.innerText || '').split('\n')[0].slice(0, 30));
    });

    // Recortes de cualquier elemento visible de la aplicación
    const ancestrosConOverflow = (el) => {
      const r = [];
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') r.push([p, ox]);
      }
      return r;
    };
    const recortes = {}, fuera = {};
    document.querySelectorAll('#app *').forEach((el) => {
      if (el.closest('.hidden, .modal-overlay, #printSingleWrap, svg') || el.tagName === 'OPTION' || !visible(el)) return;
      const r = el.getBoundingClientRect();
      let clasificado = false;
      for (const [p, ox] of ancestrosConOverflow(el)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 1 || r.left < pr.left - 1) {
          clasificado = true;
          if (/(hidden|clip)/.test(ox)) { const k = nombre(el) + ' recortado por ' + nombre(p); recortes[k] = (recortes[k] || 0) + 1; }
          break; // dentro de un contenedor con scroll propio (auto|scroll): se alcanza desplazándolo
        }
      }
      if (!clasificado && r.right > vw + 1 && !el.closest('.tab-bar')) { const k = nombre(el); fuera[k] = (fuera[k] || 0) + 1; }
    });
    out.recortes = Object.entries(recortes).map(([k, n]) => `${k} x${n}`);
    out.fueraDeVentana = Object.entries(fuera).map(([k, n]) => `${k} x${n}`);
    return out;
  });
}
