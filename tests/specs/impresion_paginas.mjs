// impresion_paginas (U-15): impresión / PDF del panel (@media print y los resúmenes que arma el panel en #printSingleWrap).
//
// Defectos corregidos y lo que se exige, con hoja horizontal Carta y A4 (el papel que use cada persona):
//   - la columna Estado (la última) quedaba cortada: la tabla SEP medía 1.436 px y la fila del PDF individual 1.166 px sobre ≈ 975 px útiles de
//     una hoja horizontal → ahora ningún elemento de la página sobrepasa el ancho imprimible (scrollWidth ≤ ancho) y la última columna cabe;
//   - "Cerrar sesión", "Cómo usar", "Conectado como" y el estado de sincronización se imprimían → ahora no se renderizan al imprimir;
//   - había hojas EN BLANCO al final (p. ej. FAEP y Aporte Educ. en A4: el margen/relleno de cierre caía solo en una cuarta hoja) → el PDF real
//     (page.pdf) no tiene ninguna hoja sin texto; el fondo gris de <html> ya no asoma al final.
// Los PDF se generan con `page.pdf()` y se analizan sin dependencias (tests/lib/pdf-paginas.mjs); si `pdftotext` está instalado además se busca
// el texto de sesión dentro del PDF.
import { boot } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { analizarPdf, textoPorPagina } from '../lib/pdf-paginas.mjs';

// Ancho imprimible (px CSS) de una hoja horizontal con márgenes de 8 mm: Carta 11 in, A4 297 mm.
const PAPELES = [
  { nombre: 'Carta', format: 'Letter', ancho: Math.round(11 * 96 - 2 * 8 / 25.4 * 96) },
  { nombre: 'A4', format: 'A4', ancho: Math.round(297 / 25.4 * 96 - 2 * 8 / 25.4 * 96) },
];
const FUENTES = ['general', 'pie', 'mantenimiento', 'prorretencion', 'junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji'];
const LIMITE = Number(process.env.IMPRESION_DETALLE) || 12;
const SESION = ['#signout-btn', '#helpBtn', '.user-box', '.sync-bar', '#sync-indicator', '#sync-text', '#user-display-name', '#user-avatar'];

await correrSpec('impresion_paginas', async (t) => {
  const h = await boot({ viewport: { width: 1366, height: 768 } });
  const { page } = h;
  // El panel limpia #printSingleWrap 300 ms después de imprimir: se congela esa limpieza para poder medir y generar el PDF del estado de impresión.
  await page.evaluate(() => { window.__setTimeout = window.setTimeout; window.setTimeout = (fn, ms, ...a) => (ms === 300 ? 0 : window.__setTimeout(fn, ms, ...a)); });
  const limpiar = () => page.evaluate(() => { document.body.classList.remove('print-single-rbd'); document.getElementById('printSingleWrap').innerHTML = ''; });

  const escenarios = [
    { id: 'SEP (vista)', preparar: async () => { await h.clickTab('panel'); } },
    { id: 'RBD (PDF de una fila)', preparar: async () => { await h.clickTab('panel'); await page.evaluate(() => document.querySelector('#tableBody .row-action-btn[data-action="pdf"]').click()); } },
    { id: 'Panel principal (vista)', preparar: async () => { await h.clickTab('dashboard'); } },
    ...['general', 'junji', 'faep'].map((f) => ({ id: `entidad ${f} (PDF de una fila)`, preparar: async () => { await h.clickTab('of-' + f); await page.evaluate((k) => document.querySelector(`#otrasFuentesTbody-${k} .row-action-btn[data-action="pdf"]`).click(), f); } })),
    ...FUENTES.map((f) => ({ id: `fuente ${f} (vista)`, preparar: async () => { await h.clickTab('of-' + f); } })),
  ];

  for (const papel of PAPELES) {
    const problemas = [];
    for (const esc of escenarios) {
      await limpiar();
      await esc.preparar();
      await page.setViewportSize({ width: papel.ancho, height: 700 });
      await page.emulateMedia({ media: 'print' });
      const m = await page.evaluate((sesion) => {
        const vw = innerWidth;
        const visibles = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        const tablas = visibles('table').filter((tb) => !tb.closest('.modal-overlay'));
        const anchoDoc = document.documentElement.scrollWidth;
        const fueraDeHoja = tablas.map((tb) => { const r = tb.getBoundingClientRect(); return { cls: (tb.id || tb.className || 'table').toString().split(' ')[0], right: Math.round(r.right) }; }).filter((x) => x.right > vw + 0.5);
        // la última columna (Estado en SEP / fila del PDF individual) debe caber en la hoja
        const ultimas = [];
        tablas.filter((tb) => tb.matches('table.data-table')).forEach((tb) => {
          const th = Array.from(tb.querySelectorAll('thead th')).filter((c) => c.getClientRects().length > 0).pop();
          if (th) ultimas.push({ texto: th.textContent.trim().slice(0, 20), right: Math.round(th.getBoundingClientRect().right) });
          tb.querySelectorAll('td[data-field="estado"], td:last-child .tag').forEach((c) => ultimas.push({ texto: 'celda estado', right: Math.round(c.getBoundingClientRect().right) }));
        });
        const sesionVisible = sesion.filter((sel) => visibles(sel).length > 0);
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        return { vw, anchoDoc, fueraDeHoja, ultimasFuera: ultimas.filter((u) => u.right > vw + 0.5), sesionVisible, htmlBg, alturaHtml: getComputedStyle(document.documentElement).height };
      }, SESION);
      const marco = { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' };
      const buf = await page.pdf({ format: papel.format, landscape: true, printBackground: true, margin: marco });
      await page.emulateMedia({ media: 'screen' });
      await page.setViewportSize({ width: 1366, height: 768 });
      const pdf = analizarPdf(buf);
      const textos = textoPorPagina(buf, pdf.paginas);

      const p = (msg) => problemas.push(`[${esc.id}] ${msg}`);
      if (m.anchoDoc > m.vw) p(`la página es más ancha que la hoja (${m.anchoDoc} px > ${m.vw} px imprimibles)`);
      if (m.fueraDeHoja.length) p(`tablas fuera de la hoja: ${m.fueraDeHoja.map((x) => `${x.cls} hasta ${x.right} px`).join(', ')}`);
      if (m.ultimasFuera.length) p(`columna Estado / última columna cortada: ${m.ultimasFuera.slice(0, 3).map((x) => `${x.texto} hasta ${x.right} px`).join(', ')}`);
      if (m.sesionVisible.length) p(`controles de sesión visibles al imprimir: ${m.sesionVisible.join(', ')}`);
      if (pdf.enBlanco.length) p(`hojas en blanco en el PDF: ${pdf.enBlanco.join(', ')} de ${pdf.paginas}`);
      if (textos && textos.some((tx) => /Cerrar sesi|Conectado como|C[oó]mo usar|Sincronizado|Guardando|Sin conexi/.test(tx))) p('el PDF contiene texto de sesión / sincronización');
      if (m.htmlBg !== 'rgb(255, 255, 255)') p(`el fondo de <html> al imprimir es ${m.htmlBg} (debe ser blanco)`);
    }
    t.ok(problemas.length === 0, `${papel.nombre} horizontal (${papel.ancho} px útiles) · ${escenarios.length} impresiones sin cortes, sin controles de sesión y sin hojas en blanco`);
    problemas.slice(0, LIMITE).forEach((x) => t.info('PROBLEMA ' + x));
    if (problemas.length > LIMITE) t.info(`… ${problemas.length} problemas en total (IMPRESION_DETALLE=N muestra más)`);
  }
  await limpiar();
  t.noErrores(h);
  await h.close();
});
