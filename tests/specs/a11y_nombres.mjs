// a11y_nombres — U-11: todo control visible tiene nombre accesible (el que calcula Chromium: árbol de accesibilidad por CDP).
//
// Antes: ~730 celdas de monto de los modales (nombre = su placeholder "0"), el buscador de SEP (solo placeholder), los selectores "Estado", "Real hasta el mes" de las
// 9 fuentes, % Ejecución (entidad), el ítem de proyección y los buscadores de Reportes sin nombre; los botones solo-icono (🖨, 🗑, ✏️, ⧉, 📅, ▸) con el emoji como único
// nombre y las acciones de fila ("⬇ XLS", "🖨") repetidas decenas de veces sin decir de qué entidad. Ahora cada control tiene <label for> o aria-label descriptivo y
// único ("Remuneraciones (Subt. 21), enero, RBD 1121"; "Descargar PDF del RBD 1121"), y ninguno depende de `title` o `placeholder` como único nombre.
//
// Cobertura: las vistas y modales de tests/lib/a11y-vistas.mjs (3 vistas del Panel principal, SEP en 4 estados, las 9 fuentes (+ Real/Proy.), % Ejecución en todas sus
// fuentes, Reportes en sus 2 vistas, 5 modales SEP, 10 modales de fuentes y "Cómo usar"), más la pantalla de acceso en sus 4 estados y el formulario de compra en modo edición.
import { boot } from '../lib/boot.mjs';
import { recorrerVistas, recorrerLogin, recorrerHonorarios } from '../lib/a11y-vistas.mjs';
import { nombresAccesibles, controlesSinNombre } from '../lib/a11y.mjs';
import { correrSpec } from '../lib/spec.mjs';

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
const RE_CELDA = new RegExp(`^.+, (${MESES}), (RBD \\d+|Administración Central|GESPARVU \\d+)$`);

async function escenario(t, nombre, fn) {
  try { await fn(); } catch (e) { t.ok(false, `${nombre}: excepción`, String(e.message).split('\n').slice(0, 4).join(' | ')); }
}
const resumen = (c) => `${c.sel} «${c.texto}» rol=${c.rol} nombre="${c.nombre}" (${c.fuente || 'sin fuente'})`;

await correrSpec('a11y_nombres', async (t) => {
  // ======================================================================== el panel (todas las vistas y modales)
  const h = await boot({ fixture: 'default', viewport: { width: 1500, height: 1000 } });
  const { page } = h;
  const sinNombre = [];                 // {vista, c}
  const celdasDuplicadas = [];          // {vista, nombre}
  const celdasMalFormadas = [];
  const sinEtiquetaIcono = [];
  const accionesRepetidas = [];
  let vistas = 0, controles = 0, celdas = 0, modales = 0;

  async function medir(nombre, scope, tipo) {
    const lista = await nombresAccesibles(page, { scope });
    vistas++; controles += lista.length; if (tipo === 'modal') modales++;
    controlesSinNombre(lista).forEach((c) => sinNombre.push({ vista: nombre, c }));
    // celdas de monto: formato descriptivo y único dentro de la vista
    const cel = lista.filter((c) => /^input\.celda-input/.test(c.sel));
    celdas += cel.length;
    const vistos = new Map();
    cel.forEach((c) => {
      if (!RE_CELDA.test(c.nombre)) celdasMalFormadas.push({ vista: nombre, nombre: c.nombre });
      vistos.set(c.nombre, (vistos.get(c.nombre) || 0) + 1);
    });
    vistos.forEach((n, nom) => { if (n > 1) celdasDuplicadas.push({ vista: nombre, nombre: nom, n }); });
    // botones solo-icono: deben llevar aria-label (el emoji/símbolo no es un nombre)
    const iconos = await page.evaluate((sc) => Array.from(document.querySelector(sc).querySelectorAll('button')).filter((b) => b.getClientRects().length > 0)
      .filter((b) => !/[\p{L}\p{N}]/u.test(b.textContent.replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, ''))).filter((b) => !b.getAttribute('aria-label'))
      .map((b) => b.outerHTML.slice(0, 120)), scope);
    iconos.forEach((x) => sinEtiquetaIcono.push({ vista: nombre, x }));
    // acciones por fila: una por entidad (nombres no repetidos dentro de la vista)
    const acciones = lista.filter((c) => /row-action-btn/.test(c.sel));
    const cuenta = new Map(); acciones.forEach((c) => cuenta.set(c.nombre, (cuenta.get(c.nombre) || 0) + 1));
    cuenta.forEach((n, nom) => { if (n > 1) accionesRepetidas.push({ vista: nombre, nombre: nom, n }); });
  }

  await escenario(t, 'V', async () => {
    await recorrerVistas(h, async ({ nombre, scope, tipo }) => { await medir(nombre, scope, tipo); });
  });
  t.ok(vistas >= 50 && modales >= 16, `V0) se midieron ${vistas} vistas/estados (${modales} modales), ${controles} controles visibles y ${celdas} celdas de monto`, { vistas, modales });
  t.ok(celdas > 500, 'V0) hay cientos de celdas de monto en los modales medidos (la medición no es vacía)', celdas);
  t.eq(sinNombre.length, 0, 'V1) ningún control visible (input, select, textarea, button, summary, tab, link…) queda sin nombre accesible, ni con `title`/`placeholder` como único nombre', sinNombre.slice(0, 8).map((x) => `${x.vista}: ${resumen(x.c)}`).join('\n      '));
  t.eq(celdasMalFormadas.length, 0, 'V2) toda celda de monto se llama "<concepto>, <mes>, <entidad>" (p. ej. "Remuneraciones (Subt. 21), enero, RBD 1121")', celdasMalFormadas.slice(0, 5));
  t.eq(celdasDuplicadas.length, 0, 'V3) los nombres de las celdas de monto son únicos dentro de cada modal', celdasDuplicadas.slice(0, 5));
  t.eq(sinEtiquetaIcono.length, 0, 'V4) los botones solo-icono (✕, 🗑, ✏️, ⧉, 🖨, 📅, ▸…) tienen aria-label', sinEtiquetaIcono.slice(0, 5));
  t.eq(accionesRepetidas.length, 0, 'V5) las acciones de fila (⬇ XLS / CSV / 🖨) dicen de qué entidad son: sin nombres repetidos dentro de una tabla', accionesRepetidas.slice(0, 5));

  // ======================================================================== H) Honorarios (Subt. 21): bloque del detalle de SEP, formulario en edición y vistas con honorarios
  await escenario(t, 'H', async () => {
    const hh = await boot({ fixture: 'honorarios', viewport: { width: 1500, height: 1000 } });
    const sinNom = [], mal = [], duplicadas = [], iconosSin = [];
    let nVistas = 0, nControlesHon = 0;
    await recorrerHonorarios(hh, async ({ nombre, scope, tipo }) => {
      const lista = await nombresAccesibles(hh.page, { scope });
      nVistas++;
      controlesSinNombre(lista).forEach((c) => sinNom.push(`${nombre}: ${resumen(c)}`));
      const cel = lista.filter((c) => /^input\.celda-input/.test(c.sel));
      const vistos = new Map();
      cel.forEach((c) => { if (!RE_CELDA.test(c.nombre)) mal.push(`${nombre}: ${c.nombre}`); vistos.set(c.nombre, (vistos.get(c.nombre) || 0) + 1); });
      vistos.forEach((n, nom) => { if (n > 1) duplicadas.push(`${nombre}: «${nom}» ×${n}`); });
      if (tipo === 'modal') {
        // los controles del bloque de honorarios (formulario, selector y botones de la proyección, acciones de cada boleta) tienen nombres propios: ninguno se repite entre sí
        // ni coincide con un control del registro de compras del mismo modal (el formulario de compras tiene «Código de cuenta», «Tipo de documento», «N° documento»…).
        const nombres = lista.filter((c) => !/^input\.celda-input/.test(c.sel) && /hon-|honorario|Honorario|prestador|boleta|Cuenta de honorarios|N° boleta|Fecha boleta/i.test(c.sel + ' ' + c.nombre));
        nControlesHon += nombres.length;
        const cuenta = new Map(); nombres.forEach((c) => cuenta.set(c.nombre, (cuenta.get(c.nombre) || 0) + 1));
        cuenta.forEach((n, nom) => { if (n > 1) duplicadas.push(`${nombre}: control «${nom}» ×${n}`); });
        const compras = lista.filter((c) => /compra-input|add-compra-btn|cancelar-edicion-btn/.test(c.sel)).map((c) => c.nombre);
        nombres.filter((c) => /hon-input|add-hon-btn|cancelar-edicion-hon-btn/.test(c.sel)).forEach((c) => { if (compras.includes(c.nombre)) duplicadas.push(`${nombre}: «${c.nombre}» coincide con un control de compras`); });
        const iconos = await hh.page.evaluate(() => Array.from(document.querySelectorAll('#modalBody .hon-block button')).filter((b) => b.getClientRects().length > 0 && !b.getAttribute('aria-label') && !/[\p{L}\p{N}]/u.test(b.textContent.replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, ''))).map((b) => b.outerHTML.slice(0, 100)));
        iconos.forEach((x) => iconosSin.push(`${nombre}: ${x}`));
      }
    });
    t.ok(nVistas >= 5 && nControlesHon > 40, `H0) se midieron ${nVistas} vistas/estados con honorarios y ${nControlesHon} controles del bloque «Honorarios (Subt. 21)»`, { nVistas, nControlesHon });
    t.eq(sinNom, [], 'H1) ningún control del bloque de honorarios (formulario, selectores, botones ✏️ ⧉ 🗑, proyección) queda sin nombre accesible');
    t.eq(mal, [], 'H2) las celdas de la proyección se llaman "<concepto>, <mes>, <entidad>" (p. ej. "Proyección honorarios 410803 · TALLERES EXTRAPROGRAMÁTICOS, enero, RBD 1121")');
    t.eq(duplicadas, [], 'H3) nombres únicos: sin celdas ni controles repetidos en el bloque de honorarios, ni coincidencias con el formulario de compras');
    t.eq(iconosSin, [], 'H4) los botones solo-icono de honorarios (✏️ ⧉ 🗑) tienen aria-label');
    // nombres concretos
    await hh.clickTab('SEP');
    await hh.page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await hh.waitIdle();
    const nom = async (sel) => (await nombresAccesibles(hh.page, { scope: sel }))[0].nombre;
    t.eq((await nom('#modalBody .hon-form-grid select[data-field="codigo"]')).toLowerCase(), 'cuenta de honorarios', 'H5) el selector de cuenta se llama «Cuenta de honorarios»');
    t.eq(await nom('#modalBody .add-hon-btn'), '+ Agregar honorario', 'H5) el botón de alta se llama «+ Agregar honorario» (distinto de «+ Agregar compra»)');
    t.ok(/^Editar honorario BOLHE N° 54 2026-01-21$/.test(await nom('#modalBody tr[data-hon-id="h1121_1"] .hon-edit-btn')), 'H5) «Editar honorario BOLHE N° 54 2026-01-21»', await nom('#modalBody tr[data-hon-id="h1121_1"] .hon-edit-btn'));
    t.ok(/^Quitar cuenta de la proyección de honorarios: 410803 · TALLERES/.test(await nom('#modalBody .honproy-del-btn[data-codigo="410803"]')), 'H5) «Quitar cuenta de la proyección de honorarios: 410803 · …»');
    t.ok(/^Cuenta de proyección de honorarios para agregar, RBD 1121$/.test(await nom('#honproyAddSelect-1121')), 'H5) el selector de la proyección: «Cuenta de proyección de honorarios para agregar, RBD 1121»');
    t.noErrores(hh);
    await hh.close();
  });

  // ---- controles concretos de la lista de la auditoría
  await escenario(t, 'C', async () => {
    const nombreDe = async (sel) => { const l = await nombresAccesibles(page, { scope: sel }); return l.length ? l[0].nombre : null; };
    await h.clickTab('SEP');
    t.ok(/Buscar establecimiento/.test(await nombreDe('#searchInput')), 'C1) buscador de SEP: "Buscar establecimiento por RBD o nombre"');
    t.ok(/estado/i.test(await nombreDe('#estadoFilter')), 'C1) filtro de estado de SEP');
    t.ok(/hasta el mes/.test(await nombreDe('#corteMesSelect')), 'C1) "Ver resumen … hasta el mes" (SEP)');
    await h.clickTab('of-general');
    t.ok(/Real hasta el mes/.test(await nombreDe('#ofCorteSelect-general')), 'C2) "Real hasta el mes" de la fuente (<label for>)');
    await h.clickTab('% Ejecución');
    t.ok(/Entidad/.test(await nombreDe('#ejecRbdSelect')), 'C3) selector de entidad de % Ejecución');
    await h.clickTab('Reportes');
    t.ok(/Buscar entidad/.test(await nombreDe('#vzEntSearch')), 'C4) buscador de entidades del Visualizador');
    await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
    await h.waitIdle();
    t.ok(/Buscar entidad/.test(await nombreDe('#reporteRbdSearch')) && /Buscar concepto/.test(await nombreDe('#reporteConceptoSearch')), 'C4) buscadores del Reporte personalizado');
    const casillas = await nombresAccesibles(page, { scope: '#reporteRbdList' });
    t.ok(casillas.length > 20 && casillas.every((c) => c.nombre.length > 3), `C5) las ${casillas.length} casillas de entidades del Reporte personalizado tienen nombre ("${casillas[0] && casillas[0].nombre}")`);
    await page.click('#reporteVistaChips [data-reporte-vista="visualizador"]');
    await h.waitIdle();
    await h.clickTab('SEP');
    await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
    await h.waitIdle();
    const l = await nombresAccesibles(page, { scope: '#rbdModal .modal-panel' });
    const ejemplo = l.find((c) => /celda-input\[rbd=1121,modo=rem,mes=ENERO\]/.test(c.sel));
    t.eq(ejemplo && ejemplo.nombre, 'Remuneraciones (Subt. 21), enero, RBD 1121', 'C6) la celda de Remuneraciones de enero del RBD 1121 se llama "Remuneraciones (Subt. 21), enero, RBD 1121"');
    const real = l.find((c) => /remRealHasta-1121/.test(c.sel));
    t.ok(real && /Remuneraciones reales hasta/.test(real.nombre), 'C6) "Remuneraciones reales hasta" del modal SEP', real);
    const proy = l.find((c) => /bysproyAddSelect-1121/.test(c.sel));
    t.ok(proy && /proyección.*RBD 1121/i.test(proy.nombre), 'C6) selector de ítem de proyección del modal SEP', proy);
    // formulario de compra en modo edición
    await page.click('#rbdModal .compra-edit-btn');
    await h.waitIdle();
    const edit = await nombresAccesibles(page, { scope: '#rbdModal .modal-panel' });
    t.eq(controlesSinNombre(edit).length, 0, 'C7) el formulario de compra en modo edición (Guardar cambios / Cancelar) también tiene todos sus controles con nombre', controlesSinNombre(edit).map(resumen));
    t.ok(edit.some((c) => /Editar compra/.test(c.nombre)) && edit.some((c) => /Duplicar compra/.test(c.nombre)) && edit.some((c) => /Eliminar compra/.test(c.nombre)), 'C7) las acciones de cada compra dicen cuál ("Editar compra Factura N° …")');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  });

  t.noErrores(h);
  await h.close();

  // ======================================================================== pantalla de acceso (4 estados)
  await escenario(t, 'L', async () => {
    const estados = [];
    await recorrerLogin(async ({ nombre, scope, h: hh }) => {
      const lista = await nombresAccesibles(hh.page, { scope });
      estados.push(nombre);
      t.ok(lista.length >= 1 && controlesSinNombre(lista).length === 0, `${nombre}: ${lista.length} controles visibles, todos con nombre`, lista.map(resumen));
      if (nombre === 'login.formulario') t.ok(lista.some((c) => c.tag === 'input' && /Correo institucional/.test(c.nombre)), 'login.formulario: el campo de correo se llama "Correo institucional" (<label for>)', lista.map(resumen));
    });
    t.eq(estados, ['login.formulario', 'login.error', 'login.enviado', 'login.denegado'], 'L0) se midieron los 4 estados de la pantalla de acceso');
  });
});
