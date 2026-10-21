// (e) escritura_modal_tecleo — BUG CONOCIDO: al teclear un monto en una celda del modal de detalle, el panel guarda
// ~400 ms después de cada tecla y el eco del snapshot de Firestore hace que el modal se reconstruya (innerHTML); el
// <input> nuevo recupera el foco pero con el cursor al INICIO, así que el siguiente dígito se inserta delante.
// Teclear "1500000" con pausas de 450 ms (> debounce, así que cada tecla dispara un guardado y su eco) deja "51".
//
// Lo correcto: el valor final del campo (y lo guardado) debe ser exactamente lo tecleado: 1500000.
//
// MODO_BUG: 'known-bug' (documenta, no falla) | 'enforced' (la reaparición del bug FALLA). Ver semilla_offline.mjs.
const MODO_BUG = 'known-bug'; // <-- el agente que corrija el bug debe cambiarlo a 'enforced'

import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

const TECLEADO = '1500000';
const PAUSA_MS = 450;

async function teclear(h, abrir, selector, etiqueta, t) {
  const { page } = h;
  await abrir();
  t.eq(await page.inputValue(selector), '', `${etiqueta}: la celda parte vacía`);
  await page.click(selector);
  await page.keyboard.type(TECLEADO, { delay: PAUSA_MS });
  await page.waitForTimeout(1200); // último guardado + eco
  await h.waitIdle();
  return page.inputValue(selector);
}

await correrSpec('escritura_modal_tecleo', async (t) => {
  // SEP: Carrera Docente de agosto del RBD 1122 (parte en 0 en el fixture)
  {
    const h = await boot({ fixture: 'default' });
    const sel = 'input.celda-input[data-rbd="1122"][data-modo="ingreso_item"][data-item="Carrera Docente"][data-mes="AGOSTO"]';
    const valor = await teclear(h, async () => { await clickTab(h.page, 'SEP'); await h.page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1122"]'); await h.waitIdle(); }, sel, 'SEP › Carrera Docente (1122, agosto)', t);
    const guardado = (await h.store())['sep_carga_rbd/1122'].ingreso_items['Carrera Docente'].meses.AGOSTO;
    t.info(`valor final en el campo: "${valor}" — guardado en el servidor: ${guardado} (tecleado: ${TECLEADO})`);
    t.bug('modal-tecleo-mueve-cursor-sep', `teclear "${TECLEADO}" con pausas de ${PAUSA_MS} ms deja "${valor}" en el campo y ${guardado} guardado`, valor !== TECLEADO || guardado !== Number(TECLEADO));
    t.noErrores(h);
    await h.close();
  }
  // Fuente: ingreso de General de octubre del RBD 1122 (también un <input> reconstruido por el eco)
  {
    const h = await boot({ fixture: 'default' });
    const sel = 'input.celda-input[data-rbd="1122"][data-fuente="general"][data-modo="of_gasto_rem"][data-mes="DICIEMBRE"]';
    const valor = await teclear(h, async () => { await clickTab(h.page, 'General'); await h.page.click('#otrasFuentesTbody-general td[data-abrir-otra-fuente="1122"]'); await h.waitIdle(); }, sel, 'General › Remuneraciones (1122, diciembre)', t).catch(e => `ERROR: ${e.message}`);
    t.info(`valor final en el campo de la fuente: "${valor}"`);
    // Informativo: en las fuentes el modal NO se reconstruye al teclear (solo se actualiza el subtítulo), así que debe quedar bien.
    t.ok(valor === TECLEADO, 'fuentes: teclear en una celda del modal de una fuente conserva lo tecleado (el eco no reconstruye ese modal)', valor);
    await h.close();
  }
}, { modoBug: MODO_BUG });
