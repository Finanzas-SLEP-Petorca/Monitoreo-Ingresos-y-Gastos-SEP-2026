// Recorrido de TODAS las vistas y modales del panel para los specs a11y_* (contraste, nombres accesibles, foco).
//
//   await recorrerVistas(h, async ({ nombre, scope, tipo }) => { ... });
//
// `tipo` = 'vista' (el scope es #app con la pestaña activa: encabezado + barra de pestañas + contenido) o 'modal' (el scope es el
// panel del diálogo abierto; el fondo queda tapado por el velo y no se mide). Cada vista se visita en sus estados relevantes
// (chips Total/Real/Proyectado, <details> abiertos, filtros, Reportes en sus dos vistas, % Ejecución por fuente…).
// Cada visita deja la página estable (waitIdle) antes de llamar al visitante.

import { boot } from './boot.mjs';
import { EMAIL_AUTORIZADO } from './config.mjs';

export const FUENTES = ['general', 'pie', 'mantenimiento', 'prorretencion', 'junji', 'faep', 'figa', 'aporte_educ', 'aporte_junji'];
export const CASOS_MODAL_FUENTE = [
  ['general', '1121'], ['general', 'AC'], ['pie', '1121'], ['mantenimiento', '1121'], ['prorretencion', 'AC'],
  ['junji', '5402002'], ['faep', '1121'], ['figa', 'AC'], ['aporte_educ', '1121'], ['aporte_junji', '5402002'],
];
export const RBD_MODAL_SEP = ['1121', '1120', '1128', '1123', '1125'];

async function abrirDetails(page, scope) {
  await page.evaluate((s) => document.querySelectorAll(`${s} details`).forEach((d) => { d.open = true; }), scope);
}
async function cerrarDetails(page, scope) {
  await page.evaluate((s) => document.querySelectorAll(`${s} details`).forEach((d) => { d.open = false; }), scope);
}

/**
 * @param h              resultado de boot()
 * @param visitante      async ({nombre, scope, tipo}) => void
 * @param {object} [o]
 * @param {boolean} [o.modales=true]   visitar también los modales
 * @param {boolean} [o.soloModales=false]
 */
export async function recorrerVistas(h, visitante, { modales = true, soloModales = false } = {}) {
  const { page } = h;
  const vista = async (nombre, scope = '#app') => { await h.waitIdle(); await visitante({ nombre, scope, tipo: 'vista' }); };
  const modal = async (nombre, scope) => { await h.waitIdle(); await visitante({ nombre, scope, tipo: 'modal' }); };

  if (!soloModales) {
    // ---- Panel principal ----
    await h.clickTab('Panel principal');
    for (const v of ['total', 'real', 'proy']) {
      await page.click(`.dash-chips button[data-dash-vista="${v}"]`);
      await h.waitIdle();
      await abrirDetails(page, '#tab-dashboard');
      await vista(`dashboard.${v}`);
    }
    await page.click('.dash-chips button[data-dash-vista="total"]');
    await cerrarDetails(page, '#tab-dashboard');

    // ---- SEP ----
    await h.clickTab('SEP');
    await vista('sep.default');
    await abrirDetails(page, '#tab-panel');
    await vista('sep.notas-abiertas');
    await cerrarDetails(page, '#tab-panel');
    await page.selectOption('#estadoFilter', 'deficit');
    await vista('sep.filtro-deficit');
    await page.selectOption('#estadoFilter', '');
    await page.fill('#searchInput', 'zzzz-sin-resultados');
    await vista('sep.busqueda-vacia');
    await page.fill('#searchInput', '');
    await h.waitIdle();

    // ---- fuentes ----
    for (const k of FUENTES) {
      await h.clickTab('of-' + k);
      await vista(`of.${k}.total`);
      if (['general', 'junji', 'faep'].includes(k)) {
        for (const v of ['real', 'proy']) {
          await page.click(`#tab-of-${k} .of-chip[data-of-vista="${v}"]`);
          await vista(`of.${k}.${v}`);
        }
        await page.click(`#tab-of-${k} .of-chip[data-of-vista="total"]`);
      }
    }

    // ---- % Ejecución ----
    await h.clickTab('% Ejecución');
    await vista('ejec.sep');
    await page.selectOption('#ejecRbdSelect', '1121');
    await vista('ejec.sep.1121');
    const chips = await page.$$eval('#ejecFuenteChips button', (bs) => bs.map((b) => b.getAttribute('data-ejec-fuente')));
    for (const c of chips.slice(1)) {
      await page.click(`#ejecFuenteChips button[data-ejec-fuente="${c}"]`);
      await vista(`ejec.${c}`);
    }

    // ---- Reportes ----
    await h.clickTab('Reportes');
    await abrirDetails(page, '#tab-reportes');
    await vista('reportes.visualizador');
    await page.click('#reporteVistaChips [data-reporte-vista="personalizado"]');
    await h.waitIdle();
    await abrirDetails(page, '#tab-reportes');
    await vista('reportes.personalizado');
    await page.click('#reporteVistaChips [data-reporte-vista="visualizador"]');
    await h.waitIdle();
  }

  if (!modales) return;

  // ---- modales de detalle SEP ----
  await h.clickTab('SEP');
  for (const rbd of RBD_MODAL_SEP) {
    await page.click(`#tableBody td.rbd-clickable[data-abrir-rbd="${rbd}"]`);
    await h.waitIdle();
    await modal(`modal.sep.${rbd}`, '#rbdModal .modal-panel');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  // ---- modales de detalle de las fuentes ----
  for (const [fuente, id] of CASOS_MODAL_FUENTE) {
    await h.clickTab('of-' + fuente);
    await page.click(`#otrasFuentesTbody-${fuente} td[data-abrir-otra-fuente="${id}"]`);
    await h.waitIdle();
    await modal(`modal.of.${fuente}.${id}`, '#otrasFuentesModal .modal-panel');
    await page.keyboard.press('Escape');
    await h.waitIdle();
  }
  // ---- modal "Cómo usar" ----
  await h.clickTab('Panel principal');
  await page.click('#helpBtn');
  await h.waitIdle();
  await modal('modal.ayuda', '#helpModal .modal-panel');
  await page.keyboard.press('Escape');
  await h.waitIdle();
}

/**
 * Pantalla de acceso en sus estados: formulario, formulario con error, "revisa tu bandeja" y "Acceso denegado" (correo ya autenticado pero no autorizado).
 * Arranca sus propias páginas; `visitante({nombre, scope:'#login-screen', tipo:'login', h})`.
 */
export async function recorrerLogin(visitante) {
  {
    const h = await boot({ fixture: 'default', user: 'none', waitReady: false });
    const { page } = h;
    await page.waitForSelector('#login-email');
    await page.mouse.move(2, 2);
    await visitante({ nombre: 'login.formulario', scope: '#login-screen', tipo: 'login', h });
    await page.click('#login-btn'); // correo vacío → mensaje de validación
    await page.waitForSelector('#login-error:not(.hidden)');
    await page.mouse.move(2, 2);
    await visitante({ nombre: 'login.error', scope: '#login-screen', tipo: 'login', h });
    await page.fill('#login-email', EMAIL_AUTORIZADO);
    await page.click('#login-btn');
    await page.waitForSelector('#login-success:not(.hidden)');
    await page.mouse.move(2, 2);
    await visitante({ nombre: 'login.enviado', scope: '#login-screen', tipo: 'login', h });
    h.expectErrors(/./);
    await h.close();
  }
  {
    const h = await boot({ fixture: 'default', user: 'unauthorized', waitReady: false });
    await h.page.waitForSelector('#login-denied:not(.hidden)');
    await visitante({ nombre: 'login.denegado', scope: '#login-screen', tipo: 'login', h });
    h.expectErrors(/./);
    await h.close();
  }
}

/**
 * Honorarios (Subt. 21), con el fixture `honorarios` ya arrancado en `h`: la pestaña SEP con la columna «Gasto Hon.», el detalle del RBD 1121 con boletas, marcas ⚠ y proyección, el formulario en modo
 * edición con avisos en vivo (fecha de 2025, pago anterior al documento, gasto mayor que el documento) y el Panel principal / % Ejecución (Consolidado) con honorarios dentro del total.
 * `visitante({nombre, scope, tipo})` como en recorrerVistas.
 */
export async function recorrerHonorarios(h, visitante) {
  const { page } = h;
  const vista = async (nombre) => { await h.waitIdle(); await visitante({ nombre, scope: '#app', tipo: 'vista' }); };
  const modal = async (nombre) => { await h.waitIdle(); await visitante({ nombre, scope: '#rbdModal .modal-panel', tipo: 'modal' }); };
  await h.clickTab('Panel principal');
  await abrirDetails(page, '#tab-dashboard');
  await vista('hon.dashboard.total');
  await h.clickTab('SEP');
  await vista('hon.sep');
  await page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
  await h.waitIdle();
  await modal('hon.modal.sep.1121');
  await page.click('#modalBody tr[data-hon-id="h1121_1"] .hon-edit-btn');
  await page.fill('#modalBody .hon-form-grid [data-field="fechaDocumento"]', '2025-12-30');
  await page.fill('#modalBody .hon-form-grid [data-field="fechaPago"]', '2025-12-01');
  await page.fill('#modalBody .hon-form-grid [data-field="montoGasto"]', '900.000');
  await page.fill('#modalBody .hon-form-grid [data-field="montoDocumento"]', '100.000');
  await modal('hon.modal.sep.1121.edicion-con-avisos');
  await page.click('#modalBody .cancelar-edicion-hon-btn');
  await page.keyboard.press('Escape');
  await h.waitIdle();
  await h.clickTab('% Ejecución');
  await page.click('#ejecFuenteChips button[data-ejec-fuente="consolidado"]');
  await vista('hon.ejec.consolidado');
}
