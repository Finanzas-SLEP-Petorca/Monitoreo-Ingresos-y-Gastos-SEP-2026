// a11y_foco — U-13: el foco de teclado se ve en TODOS los controles (WCAG 2.4.7) con un anillo consistente.
//
// Antes: las tarjetas del Panel principal, las filas de barras y los ítems de "Atención" tenían `outline: none` (solo cambiaba un borde/sombra casi invisible) y el resto
// (barra de pestañas, chips, botones, selectores, filtros, modales…) dependía del anillo "auto" del navegador, sin contorno propio. Ahora hay un único :focus-visible
// (outline sólido de 2 px, color #1d4ed8, separación de 2 px) con ≥ 3:1 frente al fondo claro que lo rodea; solo aparece con teclado (el clic del ratón no lo muestra) y los
// estilos de hover no cambian.
//
// Se mide el contorno calculado (outline / box-shadow), su grosor, su contraste y que ningún ancestro con overflow lo recorte, en una muestra de cada TIPO de control de
// cada vista y modal (hasta 2 por firma: etiqueta + tipo + clases), además de un recorrido real con la tecla Tab.
import { boot } from '../lib/boot.mjs';
import { recorrerVistas } from '../lib/a11y-vistas.mjs';
import { medirFoco, medirFocoActivo, motivoFocoInvisible } from '../lib/a11y.mjs';
import { correrSpec } from '../lib/spec.mjs';

async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 4).join(' | ')); }
}

await correrSpec('a11y_foco', async (t) => {
  const h = await boot({ fixture: 'default', viewport: { width: 1500, height: 1000 } });
  const { page } = h;

  // ======================================================================== V) muestra de cada tipo de control en cada vista y modal
  const malos = [];
  let muestreados = 0, vistas = 0;
  const firmas = new Set();
  await escenario(t, 'V', async () => {
    await recorrerVistas(h, async ({ nombre, scope }) => {
      const lista = await medirFoco(page, { scope, porGrupo: 2 });
      vistas++; muestreados += lista.length;
      lista.forEach((c) => { firmas.add(c.firma); if (!c.ok) malos.push({ vista: nombre, ...c }); });
    });
  });
  t.ok(vistas >= 50 && muestreados > 500, `V0) se midieron ${muestreados} controles en ${vistas} vistas/modales (${firmas.size} firmas distintas de control)`, { vistas, muestreados });
  const unicos = new Map();
  malos.forEach((c) => { const k = `${c.sel}|${c.motivo}`; const u = unicos.get(k) || { ...c, n: 0 }; u.n++; unicos.set(k, u); });
  if (process.env.A11Y_VERBOSE) { // diagnóstico: lista completa a un archivo (tests/.tmp está fuera de git)
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(new URL('../.tmp/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../.tmp/a11y_foco_problemas.json', import.meta.url), JSON.stringify([...unicos.values()].map((c) => ({ vista: c.vista, sel: c.sel, texto: c.texto, motivo: c.motivo, n: c.n, offset: c.offset, recorte: c.recorte })), null, 1));
  }
  t.ok(unicos.size === 0, `V1) todo control enfocado con el teclado muestra un contorno visible (2 px, ≥ 3:1, sin recortes) — controles con problema: ${unicos.size}`,
    [...unicos.values()].slice(0, process.env.A11Y_VERBOSE ? Infinity : 10).map((c) => `${c.sel} «${c.texto}» → ${c.motivo} [${c.vista}${c.n > 1 ? ' ×' + c.n : ''}]`).join('\n      '));

  // ======================================================================== T) recorrido real con Tab (encabezado → pestañas → contenido)
  await escenario(t, 'T', async () => {
    const recorrer = async (nombre, pasos) => {
      const paradas = [];
      for (let i = 0; i < pasos; i++) {
        await page.keyboard.press('Tab');
        const m = await medirFocoActivo(page);
        paradas.push({ ...m, motivo: motivoFocoInvisible(m) });
      }
      const sinAnillo = paradas.filter((p) => p.motivo);
      t.ok(sinAnillo.length === 0, `T) ${nombre}: las ${paradas.length} primeras paradas de Tab muestran el foco (${[...new Set(paradas.map((p) => p.sel.split('.')[0]))].slice(0, 6).join(', ')}…)`, sinAnillo.map((p) => `${p.sel} «${p.texto}»: ${p.motivo}`).join('\n      '));
      return paradas;
    };
    await page.focus('body');
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await h.clickTab('Panel principal');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Tab'); // 1.ª parada
    let m = await medirFocoActivo(page);
    t.ok(!motivoFocoInvisible(m), 'T1) primera parada de Tab en el Panel principal con anillo', m);
    await recorrer('Panel principal', 14);
    await h.clickTab('SEP');
    await page.focus('.tab-btn[data-tab="panel"]');
    await recorrer('SEP', 24);
    await h.clickTab('of-junji');
    await page.focus('.tab-btn[data-tab="of-junji"]');
    await recorrer('JUNJI', 24);
    await h.clickTab('Reportes');
    await page.focus('.tab-btn[data-tab="reportes"]');
    await recorrer('Reportes', 20);
    await h.clickTab('Panel principal');
  });

  // ======================================================================== N) los elementos que se mencionan en la auditoría, con sus números
  await escenario(t, 'N', async () => {
    const quien = [
      ['Panel principal', '.tab-btn[data-tab="dashboard"]', 'pestaña activa de la barra'],
      ['Panel principal', '.tab-btn[data-tab="panel"]', 'pestaña inactiva de la barra'],
      ['Panel principal', '#dashCards .dash-card', 'tarjeta de fuente (clicable)'],
      ['Panel principal', '#dashChartCmp .dash-bar-row', 'fila del gráfico de barras'],
      ['Panel principal', '#dashAtencion li', 'ítem de la lista "Atención"'],
      ['Panel principal', '.dash-chips button:not(.active)', 'chip Total / Real / Proyectado'],
      ['SEP', '#tableBody .expand-btn', 'botón ▸ de la fila SEP'],
      ['SEP', '.kpi-section-label', 'título colapsable de las tarjetas KPI'],
      ['JUNJI', '#tab-of-junji tr.otras-fuentes-row', 'fila de una fuente'],
    ];
    for (const [vista, sel, etiqueta] of quien) {
      if (vista === 'Panel principal') await h.clickTab('Panel principal'); else if (vista === 'SEP') await h.clickTab('SEP'); else await h.clickTab('of-junji');
      await page.keyboard.press('Shift+Tab').catch(() => {});
      await page.evaluate((s) => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }, sel);
      const m = await medirFocoActivo(page);
      const motivo = motivoFocoInvisible(m);
      t.ok(!motivo && m.grosor >= 2 && m.contraste.fuera >= 3, `N) ${etiqueta}: anillo ${m.grosor}px ${m.colorAnillo} (${m.tipoAnillo}, separación ${m.offset}px), ${m.contraste.fuera}:1 frente a ${m.fondoFuera}${m.contraste.dentro !== null ? `, ${m.contraste.dentro}:1 frente al relleno` : ''}`, { motivo, m });
    }
  });

  // ======================================================================== M) con el ratón NO aparece el anillo, y el hover sigue igual
  await escenario(t, 'M', async () => {
    await h.clickTab('Panel principal');
    await page.mouse.move(5, 5);
    for (const sel of ['.tab-btn[data-tab="ejecucion"]', '.dash-chips button:not(.active)', '#helpBtn']) {
      await h.clickTab('Panel principal');
      await page.click(sel);
      await h.waitIdle();
      const r = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { id: a.id || a.className, fv: a.matches(':focus-visible'), estilo: cs.outlineStyle, ancho: cs.outlineWidth }; });
      t.ok(!r.fv && r.estilo === 'none', `M1) clic con el ratón en ${sel}: el anillo de foco NO aparece (outline: ${r.estilo})`, r);
      if (sel === '#helpBtn') { await page.keyboard.press('Escape'); await h.waitIdle(); }
    }
    await h.clickTab('Panel principal');
    // hover intacto
    const antes = await page.evaluate(() => { const c = document.querySelector('#dashCards .dash-card'); const cs = getComputedStyle(c); return { borde: cs.borderColor, transform: cs.transform, sombra: cs.boxShadow }; });
    await page.hover('#dashCards .dash-card');
    await page.waitForTimeout(250);
    const hover = await page.evaluate(() => { const c = document.querySelector('#dashCards .dash-card'); const cs = getComputedStyle(c); return { borde: cs.borderColor, transform: cs.transform, sombra: cs.boxShadow, outline: cs.outlineStyle }; });
    t.ok(hover.borde === 'rgb(37, 99, 235)' && hover.transform !== 'none' && hover.sombra !== antes.sombra && hover.outline === 'none', 'M2) hover de la tarjeta: borde azul, elevación y sombra como antes, sin anillo', { antes, hover });
    await page.hover('.tab-btn[data-tab="panel"]');
    const hTab = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.tab-btn[data-tab="panel"]')); return { fondo: cs.backgroundColor, color: cs.color }; });
    t.ok(hTab.fondo === 'rgb(238, 242, 247)' && hTab.color === 'rgb(17, 24, 39)', 'M2) hover de una pestaña: fondo del plano de página y texto principal como antes', hTab);
    await page.hover('#dashAtencion li');
    await page.waitForTimeout(150);
    const hLi = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#dashAtencion li')); return { fondo: cs.backgroundColor, outline: cs.outlineStyle }; });
    t.ok(hLi.fondo === 'rgb(253, 234, 234)' && hLi.outline === 'none', 'M2) hover de un ítem de "Atención": fondo rojo tenue como antes, sin anillo', hLi);
    await page.mouse.move(5, 5);
  });

  // ======================================================================== W) ventana angosta: la barra de pestañas con scroll propio no recorta el anillo
  await escenario(t, 'W', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await h.waitIdle();
    for (const tab of ['dashboard', 'panel', 'of-pie', 'ejecucion', 'reportes']) {
      await page.keyboard.press('Shift+Tab').catch(() => {});
      await page.evaluate((tb) => { const el = document.querySelector(`.tab-btn[data-tab="${tb}"]`); el.scrollIntoView({ block: 'nearest', inline: 'center' }); el.focus({ preventScroll: true }); }, tab);
      const m = await medirFocoActivo(page);
      const motivo = motivoFocoInvisible(m);
      t.ok(!motivo, `W) a 390 px, pestaña ${tab}: anillo ${m && m.grosor}px visible y sin recortar por la barra de pestañas`, { motivo, recorte: m && m.recorte });
    }
    await page.setViewportSize({ width: 1500, height: 1000 });
  });

  t.noErrores(h);
  await h.close();
});
