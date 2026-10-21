// (a) smoke_tabs: todas las pestañas abren, muestran contenido y no producen errores de consola / página / red.
// Se prueba con datos (fixture) y con la colección vacía (primer uso: el panel siembra sus datos iniciales).
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const TABS = [
  ['Panel principal', 'dashboard', 'tab-dashboard'], ['SEP', 'panel', 'tab-panel'],
  ['General', 'of-general', 'tab-of-general'], ['PIE', 'of-pie', 'tab-of-pie'], ['Mantención', 'of-mantenimiento', 'tab-of-mantenimiento'],
  ['Pro-Retención', 'of-prorretencion', 'tab-of-prorretencion'], ['JUNJI', 'of-junji', 'tab-of-junji'], ['FAEP', 'of-faep', 'tab-of-faep'],
  ['FIGA', 'of-figa', 'tab-of-figa'], ['Aporte Educ.', 'of-aporte_educ', 'tab-of-aporte_educ'], ['Aporte JUNJI', 'of-aporte_junji', 'tab-of-aporte_junji'],
  ['% Ejecución', 'ejecucion', 'tab-ejecucion'], ['Reportes', 'reportes', 'tab-reportes'],
];

async function recorrer(t, h, etiqueta) {
  const { page } = h;
  for (const [nombre, clave, id] of TABS) {
    await clickTab(page, nombre);
    const estado = await page.evaluate(([tabId]) => {
      const visibles = Array.from(document.querySelectorAll('.tab-content')).filter(el => !el.classList.contains('hidden')).map(el => el.id);
      const el = document.getElementById(tabId);
      return { visibles, largo: el ? (el.innerText || '').trim().length : -1, activo: (document.querySelector('.tab-btn.active') || {}).dataset.tab };
    }, [id]);
    t.ok(estado.visibles.length === 1 && estado.visibles[0] === id && estado.activo === clave && estado.largo > 100,
      `[${etiqueta}] pestaña "${nombre}" abre (solo #${id} visible, ${estado.largo} caracteres)`, estado);
  }
  // Reportes: las dos vistas
  await clickTab(page, 'Reportes');
  await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
  await h.waitIdle();
  t.ok(await page.evaluate(() => !document.getElementById('reporteVista-personalizado').classList.contains('hidden') && document.querySelectorAll('#reporteTbody tr').length > 0),
    `[${etiqueta}] Reportes › Reporte personalizado muestra filas`);
  await page.click('#reporteVistaChips [data-reporte-vista="visualizador"]');
  await h.waitIdle();
  // % Ejecución: todas las fuentes + consolidado
  await clickTab(page, '% Ejecución');
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#ejecFuenteChips .of-chip')).map(b => b.dataset.ejecFuente));
  t.eq(chips.length, 11, `[${etiqueta}] % Ejecución ofrece SEP + 9 fuentes + Consolidado`);
  for (const key of chips) {
    await page.click(`#ejecFuenteChips .of-chip[data-ejec-fuente="${key}"]`);
    await h.waitIdle();
  }
}

await correrSpec('smoke_tabs', async (t) => {
  // 1) Con datos
  let h = await boot({ fixture: 'default' });
  const { page } = h;
  t.ok(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && document.getElementById('login-screen').classList.contains('hidden')), 'el panel (#app) se muestra con un usuario autorizado');
  t.ok(/Sincronizado/.test(await page.textContent('#sync-text')), 'indicador de sincronización "Sincronizado"', await page.textContent('#sync-text'));
  t.eq((await page.textContent('#user-display-name')).trim(), 'Wilson Rojas', 'nombre del usuario conectado');
  t.eq(await page.evaluate(() => !document.getElementById('limpiarDuplicadosBtn').classList.contains('hidden')), true, 'el administrador ve el botón "Revisar duplicados"');
  await recorrer(t, h, 'con datos');
  // modales
  await clickTab(page, 'SEP');
  await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
  await h.waitIdle();
  t.ok(await page.evaluate(() => !document.getElementById('rbdModal').classList.contains('hidden') && /1121/.test(document.getElementById('modalTitle').textContent)), 'modal de detalle SEP abre (RBD 1121)');
  await page.keyboard.press('Escape');
  await clickTab(page, 'General');
  await page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="AC"]');
  await h.waitIdle();
  t.ok(await page.evaluate(() => !document.getElementById('otrasFuentesModal').classList.contains('hidden') && /Administración Central/.test(document.getElementById('otrasFuentesModalTitle').textContent)), 'modal de detalle de fuente abre (General › AC)');
  await page.keyboard.press('Escape');
  await page.click('#helpBtn');
  t.ok(await page.evaluate(() => !document.getElementById('helpModal').classList.contains('hidden')), 'modal "Cómo usar" abre');
  await page.keyboard.press('Escape');
  t.eq((await h.writes()).length, 0, 'ninguna escritura a Firestore solo por navegar con datos presentes');
  t.ok(h.firebaseVersions.size >= 1, `el panel carga Firebase ${[...h.firebaseVersions].join(', ')} (servido por el mock local, nada sale a la red)`);
  t.eq(h.blocked, [], 'ninguna petición a la red externa (todo lo no local se bloquea)');
  t.noErrores(h, 'sin errores de consola / página / red con datos');
  await h.close();

  // 2) Colección vacía (primer uso): el panel siembra y todo abre igual
  h = await boot({ fixture: null });
  t.ok((await h.writes()).length > 0, 'con colección vacía y servidor confirmado el panel siembra los datos iniciales (migración legítima)');
  await recorrer(t, h, 'colección vacía');
  t.noErrores(h, 'sin errores con la colección vacía');
  await h.close();
});
