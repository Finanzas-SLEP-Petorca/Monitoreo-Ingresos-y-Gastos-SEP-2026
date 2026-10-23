// compras_id_cero (L-14): reimportar un Excel cuyos IDs de compra son "0" o vacíos ya NO duplica ni pisa compras.
//   Antes: un ID vacío llega como el número 0 y se inventaba un ID nuevo en cada importación (reimportar el mismo archivo duplicaba todas las compras);
//   un "0" en texto (Excel exportado) hacía que todas las filas de un RBD colapsaran en UNA sola compra con la clave "0".
//   Ahora: un ID "0" / vacío / no usable cuenta como SIN ID y la compra recibe una clave DETERMINISTA según su contenido ("imp-<hash>"), así que
//   reimportar el mismo archivo da las mismas claves (idempotente) y compras distintas nunca se pisan.
// Se prueba en el importador de SEP y en el de las fuentes con compras (General). La herramienta admin "Revisar duplicados (ID "0")" no se toca.
import { boot, clickTab, textoDe } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';
import { fixtureSinCompras, compraBase, libroXlsx, importarLibro, filaCompra, ENC_COMPRAS_SEP, ENC_COMPRAS_FUENTE } from '../lib/compras.mjs';

const NOMBRE = 'LICEO PULMAHUE DE LA LIGUA';
const ORIGENES = [
  { etiqueta: 'SEP', tab: 'SEP', input: '#importExcelInput', enc: ENC_COMPRAS_SEP, codigo: '410606',
    compras: (store) => (store['sep_carga_rbd/1121'] || {}).compras || {},
    poner: (docs, mapa) => { docs['1121'].compras = mapa; } },
  { etiqueta: 'General', tab: 'of-general', input: '#importExcelOFInput-general', enc: ENC_COMPRAS_FUENTE, codigo: '410601',
    compras: (store) => (((store['sep_carga_rbd/1121'] || {}).otras_fuentes || {}).general || {}).compras || {},
    poner: (docs, mapa) => { docs['1121'].otras_fuentes.general.compras = mapa; } },
];
const sinImp = (ids) => ids.filter(id => !id.startsWith('imp-'));

await correrSpec('compras_id_cero', async (t) => {
  for (const o of ORIGENES) {
    const E = o.etiqueta;
    const c = (extra) => compraBase({ codigo: o.codigo, ...extra });
    const fila = (id, extra) => filaCompra(id, 1121, NOMBRE, c(extra));
    const libroDe = (page, filas) => libroXlsx(page, { COMPRAS: [o.enc, ...filas] });
    const A = { nroDocumento: '1', descripcion: 'Resmas de papel', montoGasto: 100000, montoDocumento: 119000 };
    const B = { nroDocumento: '2', descripcion: 'Tinta de impresora', montoGasto: 250000, montoDocumento: 297500, fechaDocumento: '2026-04-12', fechaPago: '2026-04-20' };
    const C = { nroDocumento: '3', descripcion: 'Cuadernos', montoGasto: 40000, montoDocumento: 47600, fechaDocumento: '2026-05-03', fechaPago: '2026-05-09' };

    // ============================================================ a) tres compras DISTINTAS con ID "0" (texto), "" (texto) y 0 (número)
    {
      const h = await boot({ fixture: fixtureSinCompras() });
      const { page } = h;
      await clickTab(page, o.tab);
      const libro = await libroDe(page, [fila('0', A), fila('', B), fila(0, C)]);
      const m1 = await importarLibro(h, o.input, libro);
      t.ok(new RegExp('COMPRAS: 3 filas').test(m1[0] || ''), `${E}: el resumen informa las 3 filas`, m1);
      const k1 = Object.keys(o.compras(await h.store()));
      t.eq(k1.length, 3, `${E}: 3 compras distintas con ID "0" / vacío / 0 dan 3 compras (antes colapsaban o se duplicaban)`);
      t.ok(!k1.includes('0'), `${E}: ninguna compra queda con la clave "0"`, k1);
      t.ok(k1.every(id => id.startsWith('imp-')), `${E}: la clave determinista lleva el prefijo "imp-" (${k1.join(', ')})`);
      const guardadas = o.compras(await h.store());
      t.eq(Object.values(guardadas).map(x => x.nroDocumento).sort(), ['1', '2', '3'], `${E}: se conservan las 3 compras (N° de documento 1, 2 y 3)`);

      // reimportar el MISMO archivo, dos veces más: ni duplica ni cambia las claves
      const m2 = await importarLibro(h, o.input, libro);
      const m3 = await importarLibro(h, o.input, libro);
      t.ok(/COMPRAS: 3 filas/.test(m2[0] || '') && /COMPRAS: 3 filas/.test(m3[0] || ''), `${E}: las reimportaciones informan las mismas 3 filas`);
      t.eq(Object.keys(o.compras(await h.store())).sort(), k1.slice().sort(), `${E}: reimportar el mismo archivo (2 veces) no crea compras nuevas y deja las mismas claves`);
      t.eq(o.compras(await h.store()), guardadas, `${E}: el contenido de las compras queda idéntico tras reimportar`);

      // también tras recargar la página (la clave depende solo del contenido, no del reloj ni de números aleatorios)
      const docsGuardados = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(await h.store()).map(([ruta, v]) => [ruta.split('/')[1], v]))));
      await h.close();
      const h2 = await boot({ fixture: docsGuardados });
      await clickTab(h2.page, o.tab);
      await importarLibro(h2, o.input, libro);
      t.eq(Object.keys(o.compras(await h2.store())).sort(), k1.slice().sort(), `${E}: en una sesión nueva (otra persona, otro día) reimportar el archivo da las mismas claves y no duplica`);
      t.noErrores(h2);
      await h2.close();
    }

    // ============================================================ b) un Excel EXPORTADO con IDs "0" (rastro del bug antiguo) y reimportado
    {
      const docs = fixtureSinCompras();
      // Firestore con el rastro: la compra A guardada bajo la clave "0" (copia corrupta) Y bajo su ID real; B solo con ID real.
      o.poner(docs, { '0': c(A), cReal1: c(A), cReal2: c(B) });
      const h = await boot({ fixture: docs });
      const { page } = h;
      await clickTab(page, o.tab);
      const antes = JSON.parse(JSON.stringify(o.compras(await h.store())));
      const libro = await libroDe(page, [fila('0', A), fila('cReal1', A), fila('cReal2', B)]); // lo que exporta el panel: el "0" también sale
      await importarLibro(h, o.input, libro);
      const despues = o.compras(await h.store());
      t.eq(Object.keys(despues).sort(), Object.keys(antes).sort(), `${E}: reimportar un Excel con la fila "0" no crea compras nuevas (la fila "0" se une a su copia con ID real)`);
      t.eq(despues['0'], antes['0'], `${E}: la entrada "0" de Firestore no se toca (la limpia la herramienta admin "Revisar duplicados")`);
      t.eq(await page.evaluate(() => document.getElementById('limpiarDuplicadosBtn') ? true : false), true, `${E}: la herramienta "Revisar duplicados (ID "0")" sigue presente`);
      t.noErrores(h);
      await h.close();
    }

    // ============================================================ c) dos filas IDÉNTICAS sin ID = UNA sola compra; distintas por la descripción = DOS
    {
      const h = await boot({ fixture: fixtureSinCompras() });
      const { page } = h;
      await clickTab(page, o.tab);
      const libro = await libroDe(page, [fila('', A), fila('0', A), fila(0, { ...A, descripcion: 'Resmas de papel carta' }), fila('', { ...A, nroDocumento: '' }), fila('', { ...A, nroDocumento: '' })]);
      const m = await importarLibro(h, o.input, libro);
      t.ok(/COMPRAS: 5 filas/.test(m[0] || ''), `${E}: el resumen cuenta las 5 filas leídas`, m);
      const ids = Object.keys(o.compras(await h.store()));
      t.eq(ids.length, 3, `${E}: filas con contenido idéntico y sin ID se tratan como UNA sola compra (5 filas → 3 compras: A, A con otra descripción, A sin N° de documento)`);
      t.eq(Object.values(o.compras(await h.store())).map(x => x.descripcion).sort(), ['Resmas de papel', 'Resmas de papel', 'Resmas de papel carta'], `${E}: la que difiere solo en la descripción es otra compra`);
      await h.close();
    }

    // ============================================================ d) compras ya existentes: misma clave, mismo contenido con otro ID y compras distintas
    {
      const docs = fixtureSinCompras();
      o.poner(docs, { cViejo: c({ ...A, documentoContable: '' }), cOtro: c(B) });
      const h = await boot({ fixture: docs });
      const { page } = h;
      await clickTab(page, o.tab);
      // A idéntica a la que ya existe con otro ID (se actualiza esa, con su N° DC); C es nueva; una compra B' distinta a cOtro (otro monto) NO la pisa
      const a = fila('', A); a[14] = 'DC_77'; // N° DC en el archivo
      const libro = await libroDe(page, [a, fila('0', C), fila('', { ...B, montoGasto: 251000, montoDocumento: 298690 })]);
      await importarLibro(h, o.input, libro);
      const g = o.compras(await h.store());
      t.eq(Object.keys(g).length, 4, `${E}: compra idéntica a una existente (otro ID) = la misma; la nueva y la "parecida" se agregan (2 + 2 = 4)`);
      t.eq(g.cViejo.documentoContable, 'DC_77', `${E}: la compra existente idéntica se actualiza en su sitio (recibe el N° DC del archivo)`);
      t.eq([g.cOtro.montoGasto, g.cOtro.nroDocumento], [250000, '2'], `${E}: una compra existente DISTINTA (otro monto en el archivo) no se pisa`);
      t.eq(sinImp(Object.keys(g)).sort(), ['cOtro', 'cViejo'], `${E}: las dos compras nuevas llevan clave "imp-…"`);

      // e) una compra importada sin ID y EDITADA después: reimportar el archivo original no pisa la edición
      const claveC = Object.keys(g).find(id => id.startsWith('imp-') && g[id].nroDocumento === '3');
      if (!claveC) t.ok(false, `${E}: no hay una compra "imp-…" con el N° de documento 3 para editar (el importador antiguo no genera claves deterministas)`);
      else {
        await h.remoto('1121', o.etiqueta === 'SEP' ? `d.compras["${claveC}"].descripcion = "Cuadernos (corregido)"; return 1;` : `d.otras_fuentes.general.compras["${claveC}"].descripcion = "Cuadernos (corregido)"; return 1;`);
        await h.waitIdle();
        await importarLibro(h, o.input, libro);
        const g2 = o.compras(await h.store());
        t.eq(g2[claveC].descripcion, 'Cuadernos (corregido)', `${E}: la compra editada después de importarla no se pisa al reimportar el archivo original`);
        const nC = Object.values(g2).filter(x => x.nroDocumento === '3').length;
        t.eq(nC, 2, `${E}: el archivo original vuelve a traer su fila (no pisa la editada): queda como compra aparte con clave "-2"`);
        await importarLibro(h, o.input, libro);
        t.eq(Object.keys(o.compras(await h.store())).length, Object.keys(g2).length, `${E}: y a partir de ahí reimportar de nuevo ya no agrega nada`);
      }
      t.noErrores(h);
      await h.close();
    }

    // ============================================================ f) el ID "no usable" también cubre otros valores basura
    {
      const h = await boot({ fixture: fixtureSinCompras() });
      const { page } = h;
      await clickTab(page, o.tab);
      const libro = await libroDe(page, [fila('00', A), fila('undefined', B), fila('  ', C), fila('c-real-9', { ...C, nroDocumento: '9', descripcion: 'con ID real' })]);
      await importarLibro(h, o.input, libro);
      const ids = Object.keys(o.compras(await h.store()));
      t.eq(ids.length, 4, `${E}: "00", "undefined" y solo espacios cuentan como sin ID (4 compras)`);
      t.eq(sinImp(ids), ['c-real-9'], `${E}: un ID real se respeta tal cual y los otros 3 reciben clave "imp-…"`);
      await h.close();
    }
  }
});
