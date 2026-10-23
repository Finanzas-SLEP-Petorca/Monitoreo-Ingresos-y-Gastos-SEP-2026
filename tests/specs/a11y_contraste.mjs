// a11y_contraste — U-12: todo el texto visible cumple el contraste WCAG 2.1 AA (1.4.3): 4,5:1 (texto normal) / 3:1 (≥ 24 px, o ≥ 18,66 px en negrita).
//
// Se mide en el navegador (tests/lib/a11y.mjs → analizarContraste): por cada nodo de texto visible, el color calculado compuesto con su alfa y la opacidad acumulada
// de sus ancestros SOBRE el fondo real (fondos con alfa apilados hasta el primero opaco; degradados lineales → peor parada; formas SVG detrás del texto), más los valores
// de <input>/<select> y los placeholders. Se excluyen los controles deshabilitados (WCAG los exime) y el texto con opacidad efectiva 0.
//
// Antes: --text-muted #94a3b8 daba 2,0–2,6:1 (≈ 80 textos distintos: subtítulos, leyendas, etiquetas "Real + Proyectado", ▸, ✕, ejes de los gráficos…), y fallaban el verde
// #0f9d58 de las tarjetas y de "▲ Superávit" (3,2:1), el blanco sobre el naranja #eb6834 (3,2:1) y sobre el verde #1e8a4c (4,38:1), el rojo #d03b3b sobre fondos tintados
// (3,8–4,1:1), el ámbar #a3630a (4,3:1), "Real"/"Proy." de 8,5 px con opacidad .85 (3,4–3,7:1) y el placeholder "0" de las celdas (1,95:1).
import { boot } from '../lib/boot.mjs';
import { recorrerVistas, recorrerLogin, recorrerHonorarios } from '../lib/a11y-vistas.mjs';
import { analizarContraste, formatearFallasContraste } from '../lib/a11y.mjs';
import { correrSpec } from '../lib/spec.mjs';

async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 4).join(' | ')); }
}

await correrSpec('a11y_contraste', async (t) => {
  const h = await boot({ fixture: 'default', viewport: { width: 1500, height: 1000 } });
  const { page } = h;
  h.expectErrors(/permission-denied|insufficient permissions/i); // el write rechazado a propósito en X1
  const acumulado = { vistas: 0, medidos: 0, fallas: [], excluidos: new Map(), minimo: Infinity };
  const registrar = (nombre, r) => {
    acumulado.vistas++; acumulado.medidos += r.medidos;
    if (r.minimo !== null && r.minimo < acumulado.minimo) acumulado.minimo = r.minimo;
    r.fallas.forEach((f) => acumulado.fallas.push({ vista: nombre, ...f }));
    r.excluidos.forEach((e) => acumulado.excluidos.set(`${e.razon} :: ${e.sel}`, (acumulado.excluidos.get(`${e.razon} :: ${e.sel}`) || 0) + 1));
  };
  const medir = async (nombre, scope) => registrar(nombre, await analizarContraste(page, { scope }));

  // ======================================================================== D) el detector detecta (autoprueba con casos conocidos)
  await escenario(t, 'D', async () => {
    const casos = [
      // [html del <p>, fondo del contenedor, ¿debe fallar?, etiqueta]
      ['color:#94a3b8', 'background:#fff', true, 'el viejo --text-muted sobre blanco (2,56:1)'],
      ['color:#767676', 'background:#fff', false, '#767676 sobre blanco (4,54:1)'],
      ['color:#949494; font-size:24px', 'background:#fff', false, 'texto grande de 24 px a 3,03:1 (umbral 3:1)'],
      ['color:#949494; font-size:18px; font-weight:700', 'background:#fff', true, '18 px en negrita NO es "grande" (< 18,66 px): 3,03:1 < 4,5:1'],
      ['color:#949494; font-size:19px; font-weight:700', 'background:#fff', false, '19 px en negrita sí es "grande": 3,03:1 ≥ 3:1'],
      ['color:#000', 'background:#fff; opacity:.5', true, 'opacity .5 del contenedor (negro → gris sobre blanco, 3,9:1)'],
      ['color:#fff', 'background:rgba(0,0,0,.5)', true, 'fondo con alfa compuesto sobre blanco (3,9:1)'],
      ['color:#595959', 'background:linear-gradient(90deg,#ffffff,#808080)', true, 'degradado: se evalúa la peor parada (2,0:1)'],
      ['color:rgba(0,0,0,.4)', 'background:#fff', true, 'texto con alfa .4 sobre blanco (2,1:1)'],
      ['color:#111827', 'background:#fff', false, 'texto del panel (17:1)'],
    ];
    await page.evaluate((cs) => {
      const c = document.createElement('div'); c.id = '__ctest'; c.style.cssText = 'position:fixed; top:0; left:0; width:900px; z-index:99999; background:#fff;';
      cs.forEach(([p, f], i) => { c.insertAdjacentHTML('beforeend', `<div style="${f}; padding:2px"><p data-caso="${i}" style="margin:0; font-size:14px; ${p}">caso ${i} texto de prueba</p></div>`); });
      document.body.appendChild(c);
    }, casos);
    const r = await analizarContraste(page, { scope: '#__ctest' });
    casos.forEach(([, , debeFallar, etiqueta], i) => {
      const fallo = r.fallas.some((f) => f.texto.startsWith(`caso ${i} `));
      t.ok(fallo === debeFallar, `D) ${debeFallar ? 'detecta' : 'acepta'}: ${etiqueta}`, r.fallas.filter((f) => f.texto.startsWith(`caso ${i} `)));
    });
    await page.evaluate(() => document.getElementById('__ctest').remove());
  });

  // ======================================================================== V) todas las vistas y modales
  await escenario(t, 'V', async () => {
    await recorrerVistas(h, async ({ nombre, scope }) => { await medir(nombre, scope); });
  });

  // ======================================================================== H) Honorarios (Subt. 21): detalle con boletas, marcas ⚠, formulario en edición con avisos en vivo y vistas con honorarios en el total
  await escenario(t, 'H', async () => {
    const hh = await boot({ fixture: 'honorarios', viewport: { width: 1500, height: 1000 } });
    await recorrerHonorarios(hh, async ({ nombre, scope }) => { registrar('honorarios.' + nombre, await analizarContraste(hh.page, { scope })); });
    t.noErrores(hh);
    await hh.close();
  });

  // ======================================================================== estados dinámicos (no están en el recorrido base)
  await escenario(t, 'X1', async () => { // sincronización: "Guardando…", "Sin conexión…" y rojo con Reintentar, en el encabezado y dentro del modal
    await h.clickTab('SEP');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1123"]');
    await h.waitIdle();
    const celda = '#modalBody input.celda-input[data-rbd="1123"][data-modo="ingreso_item"][data-item="Carrera Docente"][data-mes="ENERO"]';
    await h.mock('setOffline', true);
    await page.fill(celda, '5000');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('yellow'), null, { timeout: 8000 });
    await medir('sync.sin-conexion.encabezado', '#sync-bar');
    await medir('sync.sin-conexion.modal', '#rbdModal .modal-panel');
    await h.mock('setOffline', false);
    await h.waitIdle();
    await h.mock('failNextWrite', 'permission-denied');
    await page.fill(celda, '6000');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForFunction(() => document.getElementById('sync-indicator').classList.contains('red'), null, { timeout: 8000 });
    await medir('sync.rojo.encabezado', '#sync-bar');
    await medir('sync.rojo.modal', '#rbdModal .modal-panel');
    const rojo = await page.evaluate(() => ({ txt: document.getElementById('sync-text').textContent, retry: !document.getElementById('sync-retry').classList.contains('hidden') }));
    t.ok(/sin guardar/.test(rojo.txt) && rojo.retry, 'X1) el estado rojo con "Reintentar" estaba visible al medir', rojo);
    // celda con valor inválido (borde y texto rojos)
    await page.fill(celda, '12abc');
    await medir('modal.celda-invalida', '#rbdModal .modal-panel');
    await page.fill(celda, '6000');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  await escenario(t, 'X2', async () => { // formulario de compra en modo edición + botón de duplicados (oculto por defecto)
    await h.clickTab('SEP');
    await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.remove('hidden'));
    await medir('sep.boton-duplicados', '#tab-panel .table-controls');
    await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.add('hidden'));
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    await page.click('#rbdModal .compra-edit-btn');
    await h.waitIdle();
    t.ok(await page.evaluate(() => !!document.querySelector('#rbdModal .compra-form-grid.editing')), 'X2) el formulario de compra está en modo edición al medir');
    await medir('modal.compra-edicion', '#rbdModal .modal-panel');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  await escenario(t, 'X3', async () => { // tooltips (se muestran con hover o foco)
    await h.clickTab('Panel principal');
    await page.hover('#dashChartCmp .dash-bar-row');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('dashTooltip')).display !== 'none', null, { timeout: 3000 });
    await medir('tooltip.dashboard', '#dashTooltip');
    await h.clickTab('% Ejecución');
    await page.hover('#ejecChartWrap svg', { position: { x: 300, y: 120 } });
    await page.waitForFunction(() => { const tt = document.querySelector('.ejec-tooltip'); return tt && parseFloat(getComputedStyle(tt).opacity) === 1; }, null, { timeout: 3000 }); // espera a que termine el fundido (a media transición la opacidad < 1 baja el contraste)
    await medir('tooltip.ejecucion', '.ejec-tooltip');
    await page.mouse.move(5, 5);
  });

  await escenario(t, 'X4', async () => { // estado :focus-visible (la fila de una fuente cambia de fondo; la celda de monto también)
    await h.clickTab('of-junji');
    await page.keyboard.press('Shift+Tab').catch(() => {});
    await page.evaluate(() => document.querySelector('#otrasFuentesTbody-junji tr.otras-fuentes-row').focus());
    t.ok(await page.evaluate(() => document.activeElement.matches('tr.otras-fuentes-row:focus-visible')), 'X4) la fila de la fuente tiene el foco de teclado al medir');
    await medir('foco.fila-fuente', '#otrasFuentesTbody-junji tr.otras-fuentes-row');
    await h.clickTab('SEP');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    await page.focus('#modalBody input.celda-input[data-rbd="1121"][data-modo="rem"][data-mes="ENERO"]');
    await medir('foco.celda-monto', '#rbdModal .modal-panel');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  // ======================================================================== H) estado :hover de los controles (el ratón encima también debe cumplir el contraste)
  await escenario(t, 'H', async () => {
    const hovers = { n: 0, firmas: new Set() };
    const probar = async (nombre, scope) => {
      const firmas = await page.evaluate((sc) => {
        const raiz = document.querySelector(sc);
        const vistos = new Set(); const sel = [];
        raiz.querySelectorAll('button, summary, a[href], [role="tab"], [role="link"], [tabindex="0"]').forEach((el) => {
          if (!el.getClientRects().length || el.disabled) return;
          const f = el.tagName + '|' + Array.from(el.classList).filter((c) => c !== 'active').join('.') + '|' + (el.getAttribute('style') || '');
          if (vistos.has(f)) return;
          vistos.add(f); el.setAttribute('data-a11y-hv', String(sel.length)); sel.push(f);
        });
        return sel;
      }, scope);
      for (let i = 0; i < firmas.length; i++) {
        try {
          await page.hover(`[data-a11y-hv="${i}"]`, { timeout: 2000 });
          await page.waitForTimeout(30);
          registrar(`hover.${nombre}.${firmas[i].split('|').slice(0, 2).join('.')}`, await analizarContraste(page, { scope: `[data-a11y-hv="${i}"]` }));
          hovers.n++; hovers.firmas.add(firmas[i]);
        } catch (e) { /* control tapado o fuera de pantalla: no se puede pasar el ratón por encima */ }
      }
      await page.evaluate(() => document.querySelectorAll('[data-a11y-hv]').forEach((el) => el.removeAttribute('data-a11y-hv')));
      await page.mouse.move(2, 2);
    };
    await h.clickTab('Panel principal'); await probar('dashboard', '#tab-dashboard');
    await h.clickTab('SEP'); await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.remove('hidden')); await probar('sep', '#tab-panel');
    await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn').classList.add('hidden'));
    await h.clickTab('of-junji'); await probar('junji', '#tab-of-junji');
    await h.clickTab('% Ejecución'); await probar('ejec', '#tab-ejecucion');
    await h.clickTab('Reportes'); await probar('reportes.viz', '#tab-reportes');
    await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]'); await h.waitIdle(); await probar('reportes.pers', '#tab-reportes');
    await page.click('#reporteVistaChips [data-reporte-vista="visualizador"]'); await h.waitIdle();
    await h.clickTab('SEP'); await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]'); await h.waitIdle();
    await probar('modal.sep', '#rbdModal .modal-panel'); await page.keyboard.press('Escape'); await h.waitIdle();
    await h.clickTab('of-general'); await page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="1121"]'); await h.waitIdle();
    await probar('modal.of', '#otrasFuentesModal .modal-panel'); await page.keyboard.press('Escape'); await h.waitIdle();
    t.ok(hovers.n >= 50, `H0) se midió el estado :hover de ${hovers.n} controles (${hovers.firmas.size} firmas distintas: botones de color, chips, pestañas, filas, enlaces…)`, hovers.n);
  });

  // ======================================================================== acceso y colección vacía
  await escenario(t, 'L', async () => {
    await recorrerLogin(async ({ nombre, scope, h: hh }) => { registrar(nombre, await analizarContraste(hh.page, { scope })); });
  });
  t.noErrores(h);
  await h.close();
  await escenario(t, 'E', async () => { // sin datos (avisos "Todavía no hay datos", filas vacías)
    const e = await boot({ fixture: null, viewport: { width: 1500, height: 1000 } });
    await recorrerVistas(e, async ({ nombre, scope }) => { registrar('vacio.' + nombre, await analizarContraste(e.page, { scope })); }, { modales: false });
    await e.close();
  });

  // ======================================================================== resultado
  t.ok(acumulado.vistas >= 60, `V0) se midieron ${acumulado.vistas} vistas/estados (${acumulado.medidos} textos visibles; contraste mínimo ${acumulado.minimo})`, acumulado.vistas);
  t.ok(acumulado.medidos > 20000, 'V0) más de 20.000 textos medidos (la medición no es vacía)', acumulado.medidos);
  const unicos = new Map();
  acumulado.fallas.forEach((f) => { const k = `${f.sel}|${f.color}|${f.fondo}|${f.tamano}|${f.kind}`; const u = unicos.get(k) || { ...f, vistas: [] }; u.vistas.push(f.vista); unicos.set(k, u); });
  const lista = [...unicos.values()].sort((a, b) => a.ratio - b.ratio);
  if (process.env.A11Y_VERBOSE) { // diagnóstico: lista completa a un archivo (tests/.tmp está fuera de git)
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(new URL('../.tmp/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../.tmp/a11y_contraste_lista.json', import.meta.url), JSON.stringify(lista, null, 1));
  }
  t.ok(lista.length === 0, `V1) ningún texto visible incumple el contraste AA (incumplimientos distintos: ${lista.length})`,
    lista.slice(0, process.env.A11Y_VERBOSE ? Infinity : 12).map((f) => `${f.ratio}:1 (< ${f.requerido}) ${f.sel} «${f.texto}» ${f.color} sobre ${f.fondo} ${f.tamano}px${f.negrita ? ' negrita' : ''} [${f.vistas[0]}${f.vistas.length > 1 ? ' +' + (f.vistas.length - 1) : ''}]`).join('\n      '));
  const exc = [...acumulado.excluidos.entries()];
  t.ok(exc.every(([k]) => /deshabilitad/.test(k)), `V2) las únicas exclusiones son controles deshabilitados (exentos por WCAG 1.4.3): ${exc.map(([k, n]) => `${k} ×${n}`).join('; ') || 'ninguna'}`, exc);
});
