# Arnés de pruebas del panel (Playwright + mock local de Firebase)

Pruebas de regresión para `index.html` (panel SEP + 9 fuentes + Panel principal + % Ejecución + Reportes).
Viven **dentro del repo** para que no se pierdan y para detectar regresiones al hacer cambios grandes.

- **Todo es local**: Firebase (Auth + Firestore) se reemplaza por un mock en memoria; cualquier otra petición de red se
  aborta y cuenta como error. Nada toca Firestore real ni la red de producción.
- **Sin dependencias que instalar**: usa el Playwright global y el Chromium ya instalado (`/opt/pw-browsers`).
- **Deterministas**: fecha y `Math.random` congelados, zona `America/Santiago`, locale `es-CL`, fixture sintético con semilla fija.

## Cómo correr

```bash
node tests/run.mjs                       # fixture + todos los specs + golden master; tabla PASS / FAIL / KNOWN_BUG
node tests/run.mjs golden                # solo el golden master (compara contra tests/golden/baseline.json)
node tests/run.mjs golden --update       # REGENERA el baseline (ver advertencia más abajo)
node tests/run.mjs golden --solo sep,dashboard --full   # solo algunas secciones, diff completo
node tests/run.mjs spec persistencia     # un spec (o varios: spec smoke_tabs auth_flujo)
node tests/run.mjs list                  # specs disponibles
node tests/specs/persistencia.mjs        # un spec directamente (sin la tabla)
```

Código de salida: `0` si todo es PASS o KNOWN_BUG; `1` si algo FALLA.
Duración: ≈ 16 min la suite completa (49 pruebas: fixture + 47 specs + golden; golden ≈ 100 s; los specs más largos son `n_dc`, `escritura_modal_tecleo`, `a11y_contraste`, `corte_ingresos`, `modal_equivalencia`, `sync_estado`, `seguridad_xss` y `mes_cierre_global`). `-v` muestra la salida completa de cada prueba; `--jobs N` corre specs en paralelo.

### Qué HTML se prueba (`APP_HTML`)

| `APP_HTML`                    | Qué prueba                                                                                          |
|-------------------------------|------------------------------------------------------------------------------------------------------|
| *(sin definir)*               | `../index.html` del árbol de trabajo (lo que estás editando)                                         |
| `@baseline`                   | `git show 0f16ace:index.html` (origin/main de referencia, ver `BASELINE_REF` en `tests/lib/config.mjs`), extraído a `tests/.cache/` |
| `@<git-ref>` (p. ej. `@HEAD`) | `index.html` de ese commit/rama/tag                                                                  |
| `/ruta/a/copia.html`          | cualquier archivo (útil para probar una copia modificada sin tocar `index.html`)                     |

```bash
APP_HTML=@baseline node tests/run.mjs          # la línea base (0f16ace)
node tests/run.mjs                             # tu versión modificada contra el baseline versionado
```

> **Desde la PR A (correcciones urgentes)** `tests/golden/baseline.json` refleja el `index.html` ya corregido (escape de HTML,
> CSV SUPEREDUC con la plantilla oficial, ids seguros). Por eso `APP_HTML=@baseline` (0f16ace) ahora FALLA a propósito en el golden
> y en los specs nuevos (`seguridad_xss`, `formulas_csv_excel`, `csv_supereduc_formato`, `semilla_cache`, `semilla_offline`,
> `documento_corrupto`, `pagehide_flush`, `login_url`): es la prueba de que esos specs detectan los defectos originales.

> **Desde la PR B (F-01 / F-03 / F-12)** `APP_HTML=@069f9dd` (el `index.html` justo previo a esa PR) FALLA a propósito en `escritura_modal_tecleo`
> (ahora `enforced`), `sync_estado`, `modal_fuentes_remoto` y `claves_invalidas` (y en `persistencia` y `semilla_cache`, cuyas expectativas
> cambiaron con F-03: el rojo persistente con reintento manual y la siembra al confirmar el servidor): son la prueba de que detectan los defectos originales
> (montos alterados al teclear, indicador verde con `permission-denied` y reintentos infinitos, modal de fuentes obsoleto, conceptos `__x__`).

> **Desde la PR C1 (U-01 / U-05 / U-14 / U-15 / U-16 / U-21)** `APP_HTML=@b2c1153` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en
> `layout_anchos`, `teclado_fuentes`, `login_enter_rechazo`, `movil_dashboard`, `impresion_paginas` y `formato_numeros` (y en el golden, cuyo baseline ya trae los
> formatos nuevos): es la prueba de que detectan los defectos de interfaz originales (contenedor de 1360 px que no se contrae, filas de fuente sin teclado,
> Enter/"Acceso denegado" del login, tablas del Panel principal en móvil, PDF con Estado cortado / controles de sesión / hojas en blanco, formatos numéricos mezclados).

> **Desde la PR C2 (U-09 / U-10 / U-11 / U-12 / U-13, accesibilidad)** `APP_HTML=@37275b1` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en
> `a11y_modales`, `a11y_pestanas`, `a11y_nombres`, `a11y_contraste` y `a11y_foco`: es la prueba de que detectan los defectos originales (diálogos sin rol ni gestión de foco,
> pestañas sin ARIA ni flechas y sin `<nav>`/`<main>`, ~775 controles sin nombre accesible, ~185 incumplimientos de contraste, foco sin contorno propio). En el golden, esa PR
> solo cambia el MARCADO (atributos ARIA, tokens de color) y no el texto ni las cifras; su baseline se regeneró con los hashes de marcado nuevos.

> **Desde la PR del N° DC (campo `documentoContable`)** `APP_HTML=@4bf3d93` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en `n_dc` (no existe el campo, la columna, el botón
> "Migrar DC" ni la tolerancia del Excel/CSV al DC legado) y en el golden. En el golden esa PR cambia solo lo que tiene que ver con el campo: el botón admin "🗂 Migrar DC (5)" en la barra de SEP, el texto de ayuda
> y los rótulos del formulario de compras, la columna "N° DC" de las tablas de compras (SEP y fuentes, también en los PDF por fila) y la hoja COMPRAS de los Excel; los CSV, los totales, los % y los gráficos no cambian.

> **Desde la PR del corte de ingresos y el mes de cierre (L-01)** `APP_HTML=@a94c2fb` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en `corte_ingresos` y `mes_cierre_global` (no existe el
> selector "Ingresos reales hasta", el campo `ingreso_real_hasta_mes`, el mes de cierre en `_meta`, el control de la pestaña SEP ni el botón "Aplicar a todas las entidades") y en el golden. Con el fixture
> `default` (sin mes de cierre ni cortes de ingresos) esa PR no cambia ninguna cifra del golden: solo agrega el marcado y el texto del selector del modal, del control de la pestaña SEP y de la línea del Panel
> principal, y los textos que decían "hasta Julio" (ahora salen de los cortes reales). La sección nueva `cierre` del golden (fixture `cierre`) cubre el estado con mes de cierre y cortes propios.

> **Desde la PR D1 (L-03 / L-14 / F-11 / L-05, corrección de compras)** `APP_HTML=@ca7a883` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en `compras_signo_nc`
> (48 comprobaciones fallan: una nota de crédito guardada en positivo SUMABA gasto), `compras_id_cero` (24: reimportar un Excel con ID "0"/vacío duplicaba o colapsaba compras) y `compras_avisos_fecha`
> (46: sin marcas ni resumen de fecha/cuenta, sin "Datos a revisar" por compras con avisos; las comprobaciones de totales por ítem y mes pasan igual con el `index.html` anterior: los totales no cambian). En el golden esa PR **no cambia ninguna cifra ni texto** de las vistas y exportaciones que ya existían
> (el fixture `default` no tiene casos de signo ni de fecha): solo cambia el MARCADO de los 15 modales con formulario de compras (la caja vacía `.compra-form-avisos`, para los avisos en vivo) y
> se agrega la sección `compras` (fixture `compras`, 33 entradas nuevas).

> **Desde la PR D2 (L-07 / L-08 / L-09, consistencia del Estado y rótulos)** `APP_HTML=@3d5b041` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en `estado_unico`, `estado_junji`
> y `ejecucion_rotulos` (y en el golden): es la prueba de que detectan los defectos originales (SEP decidía el Estado con el % redondeado: 99,996 % salía Déficit con saldo positivo, un 100 % exacto con saldo $0 también, recurso $0
> con gasto salía Superávit; JUNJI ignoraba el saldo de Operación para B&S; % Ejecución de SEP rotulaba "Real" todo mes ≤ el selector "hasta el mes", o sea los 12 por defecto). Con el fixture `default` esa PR no cambia ninguna cifra
> monetaria: en el golden solo cambian (1) el Estado del RBD sin marco SEP con gasto (1120: recurso $0, gasto $901.000 → Déficit; antes Superávit) y, por eso, los conteos "RBD en déficit" / "Entidades en déficit" / "N de M entidades en déficit"
> de SEP y del Panel principal (3 → 4, 10 → 11 y "de 52" → "de 53"), (2) los textos de ayuda del Estado y de "Atención" y la causa de JUNJI, (3) en % Ejecución de SEP la columna "Corte" (Real / Mixto / Proy. según los cortes reales), la nota y la línea
> "Corte" del gráfico, y (4) en JUNJI la nota del saldo de Operación; se agrega la sección `estado` (fixture `estado`, 30 entradas nuevas).

> **Desde la PR «ajustes de fuentes» (jardines en FAEP/FIGA + BDL en JUNJI)** `APP_HTML=@ff7a666` (el `index.html` de `main` justo antes de esa PR) FALLA a propósito en `faep_figa_jardines` y `junji_bdl`
> (FAEP/FIGA con 56 filas en vez de 69 y JUNJI sin la línea «Ingreso Bono Desempeño Laboral (BDL)»), en `estado_junji` (el tooltip de la causa dice «Homologación, Carrera Docente ni BDL» y la sección 7 del BDL),
> en `a11y_nombres` (J: nombres de las celdas de los jardines y del BDL), en `roundtrip_excel`, `persistencia` y `seguridad_xss` (sus tramos nuevos) y en el golden. Con el fixture `default` esa PR **no cambia ninguna cifra en pesos**:
> en el golden solo cambian (1) los conteos «de 56 → de 69 entidades» de FAEP y FIGA (tarjetas de las pestañas y del Panel principal, franja «de 471 → de 497») y su encabezado «RBD / GESPARVU», (2) las 13 filas nuevas de
> jardines en $0 de FAEP y FIGA (tabla, Excel con 70 filas por hoja, `META` con el corte) y, por la misma causa, la fila `5402002 RINCONCITO [FAEP] B&S — Alimentación $0` del Reporte personalizado «multifuente» y las 13 opciones
> nuevas del selector de entidad de % Ejecución (57 → 70), (3) la línea «Ingreso Bono Desempeño Laboral (BDL)» en $0 de JUNJI (modal, PDF por entidad, hoja `ING_BDL` del Excel, fila del CSV de detalle, respaldo JSON con la clave
> `ingreso_bdl` y +361 bytes por entidad, concepto nuevo del catálogo del Reporte personalizado: JUNJI 11 → 12 y 184 → 185), y (4) los textos de ayuda (FAEP, FIGA, JUNJI y la nota de «qué entidades genera cada concepto»). Se agrega la
> sección `jardines` (fixture `jardines`, 46 entradas nuevas).

### Flujo recomendado para un cambio grande en `index.html`

1. `node tests/run.mjs` en el árbol limpio → confirma que el arnés está sano (todo PASS).
2. Edita `index.html`.
3. `node tests/run.mjs` → el golden master muestra, vista por vista, qué cifras/textos/exportaciones cambiaron.
4. Si un cambio es **intencional**, revísalo y recién entonces regenera el baseline (ver abajo).

## Estructura

```
tests/
  run.mjs                 agregador (tabla final, código de salida)
  package.json            solo marca el tipo "module" (sin dependencias)
  lib/
    boot.mjs              boot({fixture,user,freezeTime,...}), clickTab, waitIdle, flushWrites, captura de errores
    serve.mjs             servidor HTTP estático mínimo (sirve APP_HTML por http://, no file://)
    html-source.mjs       resuelve APP_HTML (@baseline, @git-ref, ruta)
    pw.mjs                carga Playwright (import o ruta global) y Chromium sin descargar nada
    spec.mjs              mini-arnés de specs (t.ok/t.eq/t.bug, RESULT:, modo de bugs conocidos)
    capture-utils.mjs     texto normalizado de un panel, descargas CSV/xlsx/json, lectura de xlsx con SheetJS
    layout.mjs            medirLayout(page): ancho de página, recortes, alcance de "Cerrar sesión" y de las 13 pestañas, tarjetas KPI (spec layout_anchos)
    a11y.mjs              medidores de accesibilidad (specs a11y_*): analizarContraste (texto visible compuesto sobre su fondo real), nombresAccesibles / axDe / landmarks
                          (árbol de accesibilidad de Chromium por CDP), medirFoco / medirFocoActivo (contorno de foco, contraste y recortes)
    a11y-vistas.mjs      recorrerVistas(h, visitante): todas las vistas, estados y modales; recorrerLogin(): los 4 estados de la pantalla de acceso
    pdf-paginas.mjs       analizarPdf(buf): páginas y hojas en blanco de un PDF de Chromium, sin dependencias; textoPorPagina() usa pdftotext si existe
    pack.mjs              empaquetado (zlib) de listas largas del baseline
    corte.mjs             (specs del corte de ingresos) cálculo INDEPENDIENTE de lo esperado a partir de los documentos del fixture, corte efectivo, entidades con corte distinto al cierre
    estado.mjs            (specs del Estado) oráculo INDEPENDIENTE (BigInt, sin compartir ni el redondeo ni el punto flotante de index.html): Estado esperado de cada RBD de SEP y de cada entidad de las 9 fuentes
                          (incl. el saldo de Operación para B&S de JUNJI) desde los documentos del fixture, y lectores de lo que muestran la tabla SEP (filas y filtro), las tablas de las fuentes, las tarjetas KPI y el Panel principal
    compras.mjs           (specs de compras) fixtureSinCompras(), compraBase(), libroXlsx() / importarLibro() (arma y sube un .xlsx por el <input type=file>), celdaItem(), montosFilaCompra()
    honorarios.mjs        (specs de honorarios) oráculo INDEPENDIENTE (BigInt, sin compartir código con index.html): totales por mes/cuenta/RBD de boletas y proyección desde los documentos del fixture, 70/30 «opción B»
                          (personal = Rem. + Hon.), y lectores de la pantalla (leerCLP, tarjetas, filaSepTexto, filaDetalleMeses, filaProyeccion, llenarFormHon, boleta…)
    config.mjs            constantes (BASELINE_REF, correos de prueba, fecha congelada)
  mockfb/
    core.js               núcleo del mock (window.__mockfb): Firestore en memoria + Auth
    firebase-app.js / firebase-auth.js / firebase-firestore.js   reemplazan a gstatic vía page.route
  fixtures/
    generate.mjs          generador reproducible del fixture      rbds.json   ids/nombres públicos de los RBD y GESPARVU
    default.json          fixture generado (70 documentos)       cierre.json   variante con mes de cierre y cortes propios (ver abajo)
                                                                  compras.json  variante con casos de signo de NC/ND, fechas con avisos e ID "0" (ver abajo)
                                                                  estado.json   variante con los casos de borde del Estado de SEP y de las fuentes, y de JUNJI (ver abajo)
                                                                  honorarios.json  variante con boletas y proyección de Honorarios (Subt. 21) en SEP (ver abajo)
                                                                  jardines.json    variante con FAEP/FIGA en jardines (GESPARVU) y la línea BDL de JUNJI (ver abajo)
  golden/
    capture.mjs           recorrido de todas las vistas y exportaciones     diff.mjs  comparación legible
    golden.mjs            CLI (comparar / --update)                         baseline.json  línea base (≈ 0,7 MB)
  specs/                  pruebas funcionales dirigidas (una por archivo)
```

Lo regenerable queda fuera de git (`tests/.cache/`, `tests/.tmp/`, `tests/out/` en `.gitignore`); `tests/**/*.json` sí se versiona.

## El mock de Firebase (`tests/mockfb/`)

`boot()` intercepta con `page.route` las URLs `https://www.gstatic.com/firebasejs/<versión>/firebase-{app,auth,firestore}.js`
(cualquier versión) y sirve los módulos de `tests/mockfb/`. Toda la lógica está en `core.js`, que se inyecta con `addInitScript`
y deja `window.__mockfb`. Los tres módulos son envoltorios que reexportan su API.

**Semántica de Firestore que imita** (porque el panel depende de ella):

- `setDoc(ref, data, {merge:true})`: fusión **profunda** de mapas anidados; `deleteField()` elimina la clave; `serverTimestamp()` se resuelve a un
  `Timestamp` al confirmar; un mapa vacío `{}` bajo merge **reemplaza** el mapa (como el SDK real); los arreglos reemplazan; `merge:false` reemplaza el documento.
- `deleteField()` fuera de merge/update y valores `undefined` → `invalid-argument`; documentos > 1 MiB → rechazados; batch ≤ 500 ops y no reutilizable.
- `writeBatch` (`set/update/delete/commit`), `updateDoc` (rutas con punto), `deleteDoc`, `getDoc`, `getDocs`, `query/where/orderBy/limit`, `runTransaction`,
  `increment/arrayUnion/arrayRemove`, `Timestamp`, `enableIndexedDbPersistence`, `initializeFirestore`, `persistentLocalCache`, etc.
- `onSnapshot` sobre colección / documento / consulta: `snapshot.docs` (`.id`, `.data()`), `.empty`, `.size`, `.metadata.fromCache`, `.metadata.hasPendingWrites`.
  **Eco asíncrono** (`setTimeout 0`) de cada write propio: primero un snapshot local con `hasPendingWrites:true` y `lastModifiedAt:null`
  (serverTimestamp sin resolver), luego otro al confirmar el "servidor". Un listener normal no recibe snapshots por cambios solo de metadatos
  (sí con `includeMetadataChanges`).
- Sin conexión: los writes quedan en cola (sus promesas **no** resuelven) y los listeners reciben la vista del caché con `fromCache:true`
  (**vacía** si el cliente nunca recibió datos). Al reconectar se confirman en orden.
- **Nombres de campo inválidos** (clave de mapa vacía, `__algo__` o de más de 1500 bytes UTF-8): `setDoc` / `batch.set` lanzan `invalid-argument` y el write
  **entero** se rechaza, como pasa en producción cuando un solo concepto tiene una clave inválida.
- Auth: usuario ya autenticado (por defecto `wilson.rojas@sleppetorca.gob.cl`, que está en `ALLOWED_EMAILS` y `ADMIN_EMAILS`), usuario **no** autorizado
  (`user:'unauthorized'`), sin sesión (`user:'none'`) y el flujo de enlace de correo (`sendSignInLinkToEmail`, `isSignInWithEmailLink`,
  `signInWithEmailLink`, `signOut`, `onAuthStateChanged`). Un enlace es válido si trae `?mode=signIn&oobCode=<algo>`; `oobCode=expired|invalid` falla.
- **APIs desconocidas fallan fuerte**: importar un nombre que el mock no exporta rompe el módulo al enlazar (`does not provide an export named …`);
  las funciones conocidas pero no implementadas lanzan `MockFirebaseUnsupportedError`; leer una propiedad inexistente de un batch/transacción también.
  Si el panel empieza a usar una API nueva de Firebase: impleméntala en `core.js` y expórtala en el módulo correspondiente.
- El "servidor" sobrevive a `page.reload()` (se guarda en `sessionStorage`), así que se puede probar "editar → recargar → sigue ahí".

**`window.__mockfb`** (úsalo con `page.evaluate`, o con `h.mock(nombre, ...args)` / `h.writes()` / `h.store()`; para simular
**"otra persona guardó algo en ese RBD"** usa `h.remoto(rbd, "d.rem.meses.ENERO = 5")`: aplica ese código al documento confirmado `d` y lo siembra como cambio remoto
en un solo turno de la página, sin pisar un write propio que se confirme en medio):

| Miembro | Qué hace |
|---|---|
| `store` | estado **confirmado** del servidor, `{ "sep_carga_rbd/1121": {...} }` (timestamps como `{__ts: ms}`) |
| `view` | lo que ve el cliente (servidor/caché + escrituras locales pendientes) |
| `seed(docs, {cache, emit})` | inserta/reemplaza documentos (p. ej. "otro usuario editó") y emite snapshot; `cache:false` = no están en el caché local |
| `emitSnapshot({fromCache})` | fuerza la entrega de un snapshot a todos los listeners |
| `setOffline(bool)` | corta/restablece la conexión (snapshot vacío con `fromCache:true` si el caché no tiene datos) |
| `failNextWrite(codigo, {optimistic})` | el siguiente write se rechaza con `FirebaseError{code}` (por defecto con eco local y reversión) |
| `writes` | bitácora de **todos** los writes: `{op, path, collection, id, payload, options:{merge}, batchId, status, error}`; sentinelas como `{__sentinel:'deleteField'}` / `{__sentinel:'serverTimestamp'}` |
| `events`, `queueLength`, `listenerCount`, `online`, `idle()` | diagnóstico |
| `clearWrites()`, `reset()`, `setLatency({echo,ack,auth})` | utilidades |
| `auth.sentLinks`, `auth.signInCalls`, `auth.signOutCalls`, `auth.setUser(email)`, `auth.failNextSend(code)` | control del Auth mockeado |

## El fixture (`tests/fixtures/`)

`node tests/fixtures/generate.mjs` genera `default.json` (`--check` verifica que coincide con el generador; `run.mjs` lo hace siempre).
Contiene los **55 RBD** de `DATA.registros` (52 con marco SEP + 3 sin marco, uno de ellos con una compra para disparar "⚠ Gasto SEP sin marco"),
la fila **AC**, los **13 GESPARVU** y un `_meta`, con cifras sintéticas (PRNG con semilla por entidad):
`ingreso_items` (Preferente/Prioritario/Carrera Docente), `rem` (`real_hasta_mes` variado), `bys_proyeccion`, `compras` (todos los tipos de documento,
nota de crédito con monto negativo, caso con `& < > " '`), y `otras_fuentes.{general,pie,mantenimiento,prorretencion,junji,faep,figa,aporte_educ,aporte_junji}`
con la forma exacta que lee `aplicarSnapshot()` y códigos de cuenta válidos según el Plan de Cuentas 2026 (incluye compras con cuenta **no habilitada** para ver la marca ⚠).
Para el campo **N° DC** se reescriben (sin agregar compras ni consumir números aleatorios, así que montos, tipos y fechas no cambian) 9 compras que ya existían: en SEP/1121 un DC legado en Doc. original
(`DC_344`, `DC_22 - No hay PME`, `DC-33`), un `documentoContable` propio (`DC_501`) y uno con caracteres peligrosos; en General/1121 y General/AC un DC legado (`DC_77`, `DC_12 - carpeta azul`) y un
`documentoContable` propio (`DC_900`); y en PIE/1121 uno propio (`DC_88`). El botón "Migrar DC" del fixture cuenta 5.
Si cambia el fixture hay que regenerar el baseline del golden master.

**`cierre.json`** (lo escribe el mismo `generate.mjs`; `--check` verifica ambos archivos) es `default.json` con el estado de uso real después de fijar el mes de cierre: `_meta.mes_cierre = 9` (septiembre,
fijado por Wilson Rojas el 20/10/2026 14:30 UTC), la remuneración de TODOS los RBD y el "Real hasta" de TODAS las entidades en las fuentes de su universo en 9 salvo 3 remuneraciones (1121 → 7, 1123 → 12,
1128 → 5) y 3 entidades de fuentes (General/1121 → 7, FAEP/AC → 12, JUNJI/5402002 → 6), y `ingreso_real_hasta_mes` propio en 3 RBD (1121 → 8, 1122 → 9, 1123 → 12; el resto sigue al cierre). Los montos son los mismos
que los de `default.json`: solo cambian los cortes Real/Proyectado. El aviso de entidades con corte distinto lista en él exactamente 8 filas. `default.json` NO trae mes de cierre ni cortes de ingresos (es el
"estado inicial": el panel tiene que verse como antes de existir el corte).

**`compras.json`** (también de `generate.mjs`; `--check` lo verifica) es `default.json` + compras **agregadas al final** (sin tocar ninguna ni consumir números aleatorios, así que todo lo que ya traía `default.json` queda igual):
en SEP/1121 una nota de crédito guardada en POSITIVO (`c1121_nc_pos`), una nota de débito en NEGATIVO (`c1121_nd_neg`), una factura en negativo (`c1121_fac_neg`), una de fecha de 2025 (`c1121_f2025`), una con fecha
`10/03/2026` que no entra en ningún total (`c1121_invalida`), una con pago en 2027 (`c1121_pago27`), una con cuenta `999999` fuera del catálogo (`c1121_cuenta_x`) y una compra bajo la clave `"0"` (rastro del bug antiguo);
en SEP/1122 una de 2025; en General/1121 una NC positiva, una de 2025 y una con fecha `abril 2026`; en General/AC una NC positiva y una ND negativa; y en PIE/1121 una NC positiva.

**`estado.json`** (también de `generate.mjs`; `--check` lo verifica) es `default.json` con casos de borde del Estado (PR D2), en pesos enteros y todos en enero para que el recurso y el gasto sean exactos. SEP (recurso = Preferente + Prioritario + Carrera Docente):
1130 saldo $0 (100,0 %) → Riesgo; 1131 gasto 9.999.600 de 10.000.000 (99,996 %, se muestra 100,0 %) → Riesgo; 1132 saldo -$1 → Déficit; 1133 89,999 % (se muestra 90,0 %) → Superávit; 1134 90,000 % → Riesgo; 1135 recurso 0 sin gasto → Superávit;
1136 recurso 0 con gasto 500.000 → Déficit; 1137 con Carrera Docente (recurso 12.000.000, gasto 12.000.000) → Riesgo; 1139 95 % con proyección de B&S → Riesgo; 1140 50 % → Superávit; y el RBD sin marco 1120 (compra del fixture, gasto $901.000) → Déficit.
Fuentes de una línea: FAEP 1130 saldo $0 → Superávit, 1131 -$1 → Déficit, 1132 99,996 % → Superávit, 1133 ingreso 0 con gasto → Déficit, 1134 nada → Superávit; Subvención General 1130 saldo $0 → Superávit, 1131 -$1 → Déficit. JUNJI (GESPARVU, saldo y saldo de
Operación − B&S): 5402002 +500.000 / -500.000 → Déficit solo por Operación; 5402004 -1.000.000 / +1.500.000 → solo por el saldo total; 5401006 -1.200.000 / -200.000 → ambas; 5401007 $0 / $0 → Superávit; 5401005 +999.999 / -$1 → Déficit solo por Operación;
y Aporte Fiscal JUNJI 5401004 con B&S = 90 % de su única línea → Superávit. El resto de las entidades conserva las cifras de `default.json`.

**`jardines.json`** (también de `generate.mjs`; `--check` lo verifica; «ajustes de fuentes») es `default.json` con montos **agregados** en jardines (GESPARVU), sin consumir números aleatorios: el resto de los documentos queda igual.
Los jardines son ahora entidades de FAEP y FIGA y JUNJI tiene la línea BDL (`ingreso_bdl`); `default.json` NO trae nada de eso (es el estado anterior: los jardines sin FAEP/FIGA ni BDL parten en $0 y sirven de «documentos antiguos»).
FAEP: 5402002 (ingreso 400.000/mes, Rem. 250.000/mes, B&S «Alimentación» 60.000/mes y «Mantención menor» desde agosto; Real hasta julio → superávit), 5402004 (déficit; concepto con `& < > " '`; Real hasta mayo), 5401006 (enero-junio; Real hasta diciembre),
5404001 y 5403001. FIGA: 5404001 (desde abril; Real hasta septiembre), 5404002 (desde septiembre) y 5401002 (déficit). JUNJI BDL: 5402002 (120.000/mes, corte en julio → 7 meses Real y 5 Proyectados), 5402004 (enero-junio, todo Real), 5401006 (80.000/mes),
5401007 (desde agosto, todo Proyectado), 5403001 (documento SIN JUNJI en `default`: solo `ingreso_bdl` y el corte), **5401002 (BDL ALTO: Operación 1.000.000, BDL 20.000.000, Rem. 3.000.000, B&S 1.500.000 → saldo total positivo pero Operación − B&S = -500.000 → Déficit solo por
Operación)** y **5403002 (el BDL cubre Remuneraciones: Operación 2.000.000, BDL 3.000.000, Rem. 4.000.000, B&S 500.000 → saldo +500.000, Operación − B&S +1.500.000 → Superávit; sin el BDL sería -2.500.000)**. `cierre.json` ahora también trae `real_hasta_mes` = 9 en FAEP y FIGA de los
13 jardines (como los dejaría «Aplicar a todas las entidades» con la nueva regla), para que el aviso de cortes distintos siga listando exactamente 8 filas.

**`honorarios.json`** (también de `generate.mjs`; `--check` lo verifica) es `default.json` con `honorarios` (boletas por id) y `hon_proyeccion` **agregados** a 1120, 1121, 1122, 1123, 1125 y 1128 (sin tocar nada más ni consumir números aleatorios:
los demás RBD y todas las compras quedan igual). SEP/1121 trae 12 boletas: los 5 tipos (BOLH, BHE, BOLHE, BPST, BPSTE), un reparto (Monto Gasto 200.000 de 500.000), N° DC, texto con `& < > " '`, y los casos con aviso: fecha de 2025 (suma en diciembre),
fecha `10/03/2026` (no suma), cuenta `999999` fuera del catálogo (no suma), cuenta `411101` no habilitada para SEP (suma), tipo `FAC` (no es de honorarios) y `BHE` en `410904` (la cuenta no lo acepta); más una proyección de `410803`
(enero, que se SUMA a la boleta de enero, y agosto-diciembre) y de `410304`. SEP/1122 tiene 2 boletas y proyección; 1123 solo proyección; 1125 una boleta de diciembre; 1128 una boleta de 9.000.000 que empuja el saldo; 1120 (sin marco SEP) una boleta
que dispara «⚠ Gasto SEP sin marco». Las compras y las demás fuentes no cambian (los totales de B&S de `default.json` siguen siendo los mismos).

## Golden master (`tests/golden/`)

`capture.mjs` abre el panel con el fixture, recorre cada vista y guarda en `baseline.json`:

- **views**: texto normalizado (`innerText` por línea, espacios colapsados) de Panel principal (Total/Real/Proyectado), SEP (filtros, corte de mes, orden),
  las 9 fuentes, % Ejecución (SEP, cada fuente, consolidado, filtros), Reportes (Visualizador por fuente/por código/subconjunto/sin selección y Reporte personalizado
  con 2 configuraciones) y los **modales de detalle** (5 RBD SEP; 13 entidades de fuentes). Cada vista incluye además las **cifras clave** (tarjetas KPI), los valores de
  `<input>/<select>` marcados (innerText no los ve), hashes de los gráficos SVG y un hash informativo del marcado.
- **exports**: el contenido de cada salida: CSV (compras SEP, compras por fuente, CSV por fila, detalle mensual por entidad, Visualizador, Reporte personalizado),
  libros Excel (hojas → filas con `XLSX.utils.sheet_to_json` dentro de la página; las hojas largas se guardan comprimidas), JSON de respaldo (hash por clave) y lo que
  se habría **impreso/PDF** (`window.print()` y `window.open()` se interceptan y se guarda el HTML imprimible).
- **datos**: valores sueltos (p. ej. a qué pestaña lleva una tarjeta).
- Sección **`compras`** (fixture `compras`, entradas `compras.*`): Panel principal (3 vistas), pestaña SEP (KPI con "Datos a revisar" = 2, marcas "revisar"), modales de SEP 1121 (todas las marcas ⚠, el resumen "N compras con avisos;
  $X sin contabilizar", NC/ND con el signo normalizado y el formulario con la ayuda de signo y los avisos de fecha en vivo) y 1122, General (pestaña y modales 1121 y AC) y PIE 1121, % Ejecución (SEP agregado y 1121, General, consolidado),
  Visualizador por código (SEP + General) y Reporte personalizado con sus CSV, y las exportaciones: CSV de compras SEP/General/PIE, Excel de carga de SEP (con la fila de ID `0`) y de General, resumen, JSON, fila 1121 (XLS/CSV/PDF).
- Sección **`estado`** (fixture `estado`, entradas `estado.*`): Panel principal (3 vistas), pestaña SEP (sin filtro y con cada filtro de Estado, búsqueda), modales de SEP 1131 y 1136, las pestañas FAEP, General, JUNJI y Aporte JUNJI, los modales de JUNJI
  (5402002, 5402004, 5401006, 5401005, 5401007) y de FAEP 1131, CSV y Excel de resumen, PDF general y por fila, CSV de detalle (JUNJI y FAEP) y PDF de JUNJI, y % Ejecución de SEP (agregado y 1130).
- Sección **`cierre`** (fixture `cierre`, entradas `cierre.*`): Panel principal (3 vistas), pestaña SEP con el control del mes de cierre y el aviso abierto, modales de 4 RBD (corte propio ≠ cierre, = cierre,
  diciembre y sin corte propio), JSON de respaldo, PDF de dos filas, % Ejecución consolidado, Visualizador (SEP) y Reporte personalizado de ingresos con sus CSV.

- Sección **`jardines`** (fixture `jardines`, entradas `jardines.*`): Panel principal (3 vistas), pestañas FAEP y JUNJI (Total / Real / Proyectado) y FIGA (Total) con los jardines, modales de jardines en FAEP (5402002, 5402004, AC) y FIGA (5404001, 5401002) y de JUNJI con BDL
  (5402002, 5401002, 5403002, 5403001), % Ejecución (FAEP agregado y de un jardín, JUNJI de un jardín y Consolidado), Visualizador y Reporte personalizado con jardines y RBD, Excel (FAEP, FIGA y JUNJI con `ING_BDL`) y JSON de respaldo de las tres,
  XLS / CSV / PDF de la fila de un jardín en FAEP y JUNJI (y CSV de otros), el PDF de FAEP y el del Panel principal.
- Sección **`honorarios`** (fixture `honorarios`, entradas `honorarios.*`): Panel principal (3 vistas), pestaña SEP (tarjetas Real / Proyectado / Total, tabla con «Gasto Hon.» y % de personal, corte a marzo, filtro Déficit), modales de SEP 1121 (todas las marcas ⚠,
  el resumen de avisos, el formulario en edición con los avisos en vivo), 1122, 1123 (solo proyección) y 1120 (sin marco), % Ejecución (SEP agregado, 1121 y Consolidado), Visualizador, Reporte personalizado y las exportaciones de SEP (Excel de carga con `HONORARIOS` y `HON_PROYECCION`,
  resumen, JSON, la fila 1121 en XLS / PDF y el PDF general).

> **Cambios del golden por Honorarios (PR-1).** `baseline.json` se regeneró **después de revisar cada diferencia una por una** (61 vistas y varias exportaciones). Todas las cifras en pesos de las fixtures `default`, `cierre`, `compras` y `estado` quedan **idénticas**; lo que cambia
> es texto y estructura por causa de Honorarios: columna/tarjetas/línea «Gasto Hon.» ($0 sin boletas), encabezados renombrados a «% Ejec. Personal (Rem.+Hon.)», «Saldo post Personal», «% Personal / Ingreso», el bloque de Honorarios del modal de SEP, las columnas nuevas de % Ejecución y Reportes,
> el catálogo del Reporte personalizado de SEP (107 → 109 conceptos), las marcas «⚠ muévelo a Honorarios» de las compras antiguas con tipo de honorarios, y, en las exportaciones, las dos hojas nuevas (solo encabezados en las fixtures sin boletas), las dos claves nuevas del JSON y la columna extra del resumen.

`node tests/run.mjs golden` compara contra el baseline y, por cada vista/exportación distinta, muestra un diff por líneas con contexto
(`-` baseline, `+` actual). El marcado HTML distinto con el mismo texto solo se informa, no falla.

> ### ⚠ Regenerar el baseline SOLO cuando un cambio de cifras sea intencional y esté revisado
> `node tests/run.mjs golden --update` imprime primero qué cambió respecto al baseline anterior y luego lo sobrescribe.
> Un baseline regenerado "para que pase" **borra la protección** del golden master. Antes de regenerar: lee el diff, confirma que cada cambio
> es el esperado del cambio de código, y commitea `baseline.json` junto con ese cambio (los reviewers verán el diff de cifras en el PR).
> La línea base de referencia es `APP_HTML=@baseline` (commit `0f16ace`); para regenerarla desde ahí: `APP_HTML=@baseline node tests/run.mjs golden --update`.
> Los textos dependen de ICU/Chromium (formato `es-CL`): si cambias de versión de Chromium y todo difiere en formato, regenera con la línea base.

## Specs (`tests/specs/*.mjs`)

Cada uno termina con `process.exit(1)` si falla y con una línea final `RESULT: OK | KNOWN_BUG | FALLA`.

| Spec | Qué verifica |
|---|---|
| `smoke_tabs` | las 13 pestañas abren (con datos y con colección vacía), modales, 0 errores de consola/página/red, nada sale a la red |
| `persistencia` | editar ingreso/remuneración/compra/ítems en SEP y fuentes → write correcto (ruta, `merge:true`, payload parcial, auditoría), deep-merge en el servidor, re-emit y recarga, `deleteField` al borrar, error de escritura + reintento, cambio de otro usuario |
| `roundtrip_excel` | exportar → reimportar → exportar: mismas hojas, misma pantalla, mismos documentos (SEP, General, JUNJI, FAEP, Excel individual por fila) |
| `semilla_offline` | con snapshot vacío `fromCache:true` el panel NO siembra y, al reconectar, no pisa datos reales (bug corregido en la PR A; modo `enforced`) |
| `semilla_cache` | siembra solo con vacío confirmado por el servidor; un RBD faltante se crea solo con escalares y solo con snapshot de servidor; ningún write envía `{}` |
| `documento_corrupto` | un documento con valores nulos / no numéricos / de otro tipo (o que lanza al leerse) no rompe al resto: estado rojo, se omite, no se recrea |
| `pagehide_flush` | `pagehide` / `visibilitychange→hidden` guardan al instante lo pendiente (todos los RBD), sin doble escritura y sin cambiar el debounce |
| `seguridad_xss` | texto libre con `<img onerror>`, `<script>`, comillas y `&` en compras (SEP y fuentes), conceptos, ids de compra y `lastModifiedBy`: se ve literal y no se ejecuta nada en modales, tablas, Reportes, dashboard, % Ejecución e impresión; ids raros siguen funcionando |
| `formulas_csv_excel` | apóstrofo solo en texto libre (descripción, proveedor, concepto) de CSV/Excel; nunca en montos, fechas, códigos, RUT ni N° de documento; exportar → reimportar no altera datos |
| `csv_supereduc_formato` | CSV de compras (SEP y fuentes) con tipo por código, fechas dd-mm-aaaa, descripción ≤ 100, RUT con guion, Documento Original solo en NC/ND; aviso con conteo antes de descargar y cancelar no descarga; Firestore, pantalla y Excel de respaldo no cambian |
| `login_url` | el enlace del correo vuelve a origen + ruta (http/https) o a la URL de producción (`file://`); se limpia la URL al completar el enlace |
| `escritura_modal_tecleo` | F-01, modo `enforced`: teclear `1500000` con pausas de 100/300/450/600 ms, `1`,`2`,pausa,`3`, otra persona guardando otra celda del mismo RBD, el cursor en medio de un número, y el modal sin nodos reemplazados; formulario de compra a medias y modo edición ("💾 Guardar cambios") intactos tras snapshots ajenos (sin compras duplicadas); montos pegados (`1.500.000`, `1,5`, `1.234,5`, `$ 1.500.000`…) y texto no numérico rechazado; y el modal de fuentes sigue estable al teclear |
| `sync_estado` | F-03: el indicador (verde / "Guardando…" / "Sin conexión…" / rojo "N cambios sin guardar" + Reintentar, también dentro del modal abierto) con `setLatency`, `setOffline` y `failNextWrite`; errores permanentes (sin bucle, el cambio se conserva en pantalla, el reintento manual lo guarda) y transitorios (backoff 2 s → 4 s); `beforeunload` y "Cerrar sesión" solo avisan con pendientes; arranque con caché y creación del RBD faltante al confirmar el servidor (evento solo de metadatos) |
| `modal_fuentes_remoto` | F-12: el modal de una entidad de una fuente refleja cambios, altas y borrados remotos (celdas, compras, conceptos, corte "Real hasta"), un ítem borrado no "resucita", y la celda con foco, el formulario de compra y el campo de concepto en curso quedan intactos |
| `modal_equivalencia` | el reconciliador de los modales deja exactamente lo mismo que reconstruirlos desde cero: tras 24 cambios remotos aleatorios (semilla fija) en SEP, General y FAEP —compras, ítems, conceptos, montos, corte— el modal reconciliado y el reabierto tienen la misma estructura, textos, atributos y valores |
| `claves_invalidas` | F-03 (c): un concepto `__x__` / vacío / de más de 1500 bytes se rechaza con mensaje claro (modal y Excel de fuentes y de SEP: ítem, ID de compra, RBD), la barra `/` y los bordes válidos se aceptan, y el resto del RBD sigue guardándose sin escrituras rechazadas |
| `auth_flujo` | lista de correos autorizados, "Acceso denegado", enlace de correo (válido, vencido, con prompt), cerrar sesión, administrador |
| `layout_anchos` | U-01: a 1024 / 1280 / 1366 / 1440 / 768 / 390 px y en las 13 pestañas: sin scroll horizontal de página ni de `.wrap`, "Cerrar sesión" y "Cómo usar" dentro de la ventana y alcanzables, las 13 pestañas alcanzables (≥ 768 px todas visibles; ≤ 760 px barra con scroll propio + indicación), tarjetas KPI sin recortar, nada recortado por `overflow:hidden`; a ≥ 1440 px el contenedor sigue siendo de 1360 px centrado |
| `teclado_fuentes` | U-05: en las 9 fuentes las filas son focusables, Tab llega a la primera, Enter abre el detalle, el foco entra al modal y Escape lo devuelve a la fila; Espacio abre sin desplazar nada; Ctrl+Enter / otras teclas no abren; XLS/PDF conservan su Enter/Espacio; el foco sobrevive al repintado por un cambio remoto; el clic sigue igual y sin anillo |
| `login_enter_rechazo` | U-21: Enter en el correo envía (vacío / no autorizado / autorizado, sin doble envío); "Acceso denegado" conserva el formulario, cierra la sesión, enfoca "Usar otro correo", que restablece el formulario limpio y deja el flujo funcionando; también al volver de un enlace de un correo no autorizado y a 390 px |
| `movil_dashboard` | U-14: a 390 / 360 / 768 px las tablas "Ver datos en tabla" del Panel principal tienen scroll propio, celdas `nowrap`, ningún monto partido, la página no desborda y la lista "Atención" cabe |
| `impresion_paginas` | U-15: `page.pdf()` en Carta y A4 horizontal de SEP, PDF de fila, Panel principal, 3 PDF de entidad y las 9 vistas de fuente: tablas dentro de la hoja (columna Estado completa), sin controles de sesión ni texto de sincronización, `<html>` blanco y ninguna hoja sin texto |
| `formato_numeros` | U-16: en las 13 pestañas, modales, % Ejecución (tarjetas, tabla, tooltip, gráfico) y lo impreso: pesos `$1.234` / `-$1.234`, porcentajes `54,6%` (siempre con decimal y coma), millones `1,23 M`; y el CSV de respaldo conserva su formato (`54.6%`) |
| `a11y_modales` | U-09: los 3 diálogos (detalle SEP, detalle de fuente, "Cómo usar") son `role="dialog" aria-modal="true"` con nombre (`aria-labelledby`); el foco entra al botón Cerrar, Tab / Shift+Tab ciclan dentro, el fondo (`.wrap`) queda `inert` y fuera del árbol de accesibilidad, Escape / ✕ / clic en el velo cierran y el foco vuelve al ▸ / fila / "Cómo usar" (también tras repintarse las filas con un cambio remoto y desde el panel "Atención", que cambia de pestaña); el reconciliador no pierde foco, cursor ni atributos ARIA; cerrar sesión con un diálogo abierto no deja la página inert |
| `a11y_pestanas` | U-10: landmarks (1 banner, 1 `<nav>` con nombre, 1 `<main>`, sin duplicados); 3 `tablist` con nombre, 13 `tab` con `aria-selected`/`aria-controls` y 13 `tabpanel` con `aria-labelledby`; tabindex itinerante (una sola parada de Tab en la barra); ←/→ (entre los 3 grupos, con vuelta), Home/End, Enter/Espacio; clic del ratón e `irAPestana` (tarjetas del Panel principal; el foco pasa a la pestaña) dejan estado, panel y foco coherentes; a 390 px la barra con scroll sigue operable |
| `a11y_nombres` | U-11: en las ~52 vistas/estados y 16 modales (5.653 controles visibles, 732 celdas de monto) y en los 4 estados de la pantalla de acceso, ningún control queda sin nombre accesible (calculado por Chromium) ni con `title`/`placeholder` como único nombre; celdas "<concepto>, <mes>, <entidad>" únicas por modal; botones solo-icono con `aria-label`; acciones de fila sin nombres repetidos; casos concretos de la auditoría (buscadores, filtros, "Real hasta", % Ejecución, Reportes, modo edición de compra) |
| `a11y_contraste` | U-12: contraste de TODO el texto visible (≈ 39.000 textos en ≈ 160 vistas/estados: vistas, modales, acceso, avisos de sincronización roja/sin conexión, celda inválida, compra en edición, tooltips, colección vacía, y el estado `:hover` de ≈ 58 controles y `:focus-visible`): ≥ 4,5:1 (3:1 si ≥ 24 px o ≥ 18,66 px en negrita), color compuesto con alfa/opacidad sobre el fondo real (degradados → peor parada, SVG, placeholders); autoprueba del detector con casos conocidos; exclusiones solo de controles deshabilitados |
| `a11y_foco` | U-13: en una muestra de cada tipo de control (≈ 730 controles, 50 firmas) de cada vista y modal, y en un recorrido real con Tab, el foco de teclado muestra un contorno de ≥ 2 px (outline o box-shadow) con ≥ 3:1 frente al fondo (y frente al relleno si queda pegado), sin recortes por `overflow` (también a 390 px); con el ratón no aparece anillo y el hover de tarjetas, pestañas y "Atención" no cambia |
| `n_dc` | campo propio "N° DC" (`documentoContable`, Documento Contable interno) en las compras: formulario (rótulo, ayuda, 100 caracteres, junto a Doc. original) y tabla (columna siempre visible) de SEP y de General / PIE / Mantención / Pro-Retención y la entidad AC; guardado (el write lleva `documentoContable` en el mapa de la compra, `merge:true`, sin tocar `documentoOriginal`), ✏️ / ⧉ / 🗑; "Doc. original (NC/ND)" se atenúa pero NO se deshabilita; escape XSS (escrito y derivado); regla de detección del DC legado (`DC_344`, `DC-33`, `dc 12`, `DC_22 - No hay PME` sí; `123-FAC`, `DCX`, `Folio DC_3` no) y su visualización derivada en cursiva; botón admin "Migrar DC (n)" (oculto para quien no es admin, contador solo si n > 0, confirmación con el conteo, valor completo, `batch.set` con merge, lotes de ≤ 400 operaciones con 450 documentos sintéticos, idempotente, el contador sigue a los cambios remotos); CSV SUPEREDUC idéntico con y sin N° DC (sin la columna, 13 campos), un DC legado no sale como Documento Original y cuenta como `docOrig` en el aviso; Excel (columna "N° DC", `neutralizaFormula`, exportar → importar → exportar sin alterar datos, edición/limpieza desde el Excel, archivo antiguo sin la columna no borra N° DC) en SEP y fuentes; XLS/PDF/CSV por fila |
| `corte_ingresos` | L-01: selector "Ingresos reales hasta" por RBD en el modal de SEP (etiqueta, ubicación y clase igual que Remuneraciones; nota "por defecto / sigue el mes de cierre / corte propio"), guardado (`ingreso_real_hasta_mes` entero 1–12 en el documento del RBD, `merge:true`, solo ese campo + nombre + auditoría), color/etiqueta Real/Proy. de encabezados y celdas, y su efecto en KPI y Saldo Real de SEP, tarjeta SEP y serie mensual del Panel principal, Visualizador, Reporte personalizado (colores por celda; el subtotal solo se colorea donde los RBD coinciden), % Ejecución consolidado, PDF de la fila y respaldo JSON; cálculo esperado independiente desde el fixture; el ingreso anual no cambia; corte efectivo propio > mes de cierre > `DATA.n_meses` (cierre que se mueve por cambio remoto, `mes_cierre` ausente / `null` / `0` / `13` / `"x"` / `7.5`…); valores dañados del corte propio tolerados; sin cambio de cifras definiendo el cierre (o el corte de todos) en julio; recarga y cambios remotos |
| `mes_cierre_global` | mes de cierre global (`_meta`): control en SEP solo lectura para quien no es admin (aun forzando eventos no escribe), selector y botón solo para admin; guarda con `merge` sin pisar `items_22`/`items_29` (`mes_cierre`, `mes_cierre_por`, `mes_cierre_en` = `serverTimestamp`); cambiar el selector no toca cortes explícitos; indicador rojo / Reintentar con un rechazo; mención en el Panel principal; aviso de cortes distintos (lista, enlace "Abrir detalle", singular, se actualiza con cambios remotos, desaparece, solo con cierre definido); "Aplicar a todas las entidades" (confirmación con el conteo por origen, cancelar no escribe, payload exacto por documento, ningún otro campo cambia, un solo lote ≤ 400 operaciones, idempotente) con el fixture `cierre` y con `default`; lotes y reintento con un tope de operaciones reducido en una copia del HTML (4 lotes, uno rechazado, el reintento envía solo ese); `_meta` ausente / vacío / dañado / que lanza al leerse; auditoría dañada y HTML en `mes_cierre_por` sin inyección; la siembra y los RBD faltantes nunca escriben `_meta` |
| `compras_signo_nc` | L-03: nota de crédito en negativo, nota de débito en positivo, otros tipos como se digitaron, en todo el flujo. Lectura de Firestore sin escribir (NC guardada en positivo se ve negativa; el valor guardado no cambia hasta editar), ítem/mes, KPI, tabla, Panel principal, Visualizador y Reporte personalizado restan la NC; ayuda del formulario ("Las notas de crédito se registran con monto negativo; se ajusta automáticamente"); agregar / editar / duplicar en SEP y General (el write lleva el signo correcto); CSV de SUPEREDUC y Excel; exportar → reimportar → exportar sin duplicados y con los signos corregidos; importar un Excel con NC positiva / ND negativa / factura negativa / NC sin ID con el tipo "nota de credito"; y equivalencia: los mismos datos con el signo equivocado o con el correcto se ven idénticos en 10 vistas |
| `compras_id_cero` | L-14, en el importador de SEP y en el de General: 3 compras distintas con ID "0" / "" / 0 dan 3 compras con clave `imp-…` (nada queda en la clave "0"); reimportar el mismo archivo (2 veces y en una sesión nueva) no duplica y deja las mismas claves; un Excel exportado con la fila "0" junto a su copia con ID real no crea compras y no toca la entrada "0"; filas idénticas sin ID = una compra y filas que difieren en la descripción = dos; compra existente idéntica con otro ID se actualiza en su sitio (recibe el N° DC) y una distinta no se pisa; una compra editada después de importarla no se pisa al reimportar (queda aparte con `-2`, sin crecer); "00", "undefined" y espacios cuentan como sin ID y un ID real se respeta; la herramienta "Revisar duplicados" sigue ahí |
| `compras_avisos_fecha` | F-11 / L-05, SOLO avisos: 15 compras (SEP y General) con fecha 2025/2027, día inexistente, mes 13/00, `10/03/2026`, `10-03-2026`, `2026-3-5`, vacía, `marzo`, pago en 2027 y cuenta fuera del catálogo; los totales por ítem y mes son los de siempre (se fija QUÉ entra y QUÉ no); marca por fila con `title`, resumen "N compras con avisos; $X sin contabilizar", "Datos a revisar" (+ marca "revisar" del RBD), el CSV y el PDF por fila sin marcas; formulario con validación en vivo (año ≠ 2026, pago anterior al documento, fecha a medio teclear) que NO impide guardar, y al corregir la fecha desaparecen; fixture limpio sin ningún aviso; las fuentes no tienen "Datos a revisar" |
| `estado_unico` | L-07, fixture `estado`: el Estado de SEP y de las 9 fuentes sale de UNA regla (Déficit ⇔ saldo < 0; Riesgo solo en SEP ⇔ gasto/recurso ≥ 90 % exacto con saldo ≥ 0; si no, Superávit) y todo lugar que cuenta o lista déficit coincide entre sí y con un cálculo independiente (BigInt): bordes (saldo $0, 99,996 %, -$1, 89,999 % vs 90,000 %, recurso 0 con y sin gasto, Carrera Docente en el recurso, RBD sin marco con gasto), filas y filtro de SEP, tarjeta "RBD en déficit" (con su universo), las 9 pestañas de fuente (filas y tarjeta "N de M"), franja y tarjetas por fuente del Panel principal, lista "Atención" (vista Total = todas las entidades en Déficit, en orden; vistas Real / Proyectado por el signo del saldo), CSV y Excel de resumen, PDF general y por fila, CSV de detalle de las fuentes, cambios remotos que cruzan un borde, y que la evolución mensual cuadra con la franja en las 3 vistas |
| `estado_junji` | L-08, fixture `estado`: JUNJI es Déficit si el saldo total < 0 O el saldo de Operación para B&S < 0 (Operación − B&S): las 5 GESPARVU de borde (solo Operación, solo saldo total, ambas, $0 → Superávit, -$1), aviso visible y tooltip con la causa y su monto, tarjeta KPI y del Panel principal, "Atención" con la causa (también cuando el saldo total es grande), subtítulo y saldo de Operación del modal con edición EN VIVO (1.000.000 → Superávit, 1.000.001 → Déficit…), nada derivado se guarda en Firestore, CSV de detalle y PDF de la entidad, y "sin cambio donde no aplica" (las otras 8 fuentes, de una sola línea, siguen Déficit ⇔ saldo < 0; Aporte JUNJI y su modal sin saldo de Operación) |
| `ejecucion_rotulos` | L-09: en % Ejecución de SEP el rótulo y el estilo Real / Proy. / Mixto de cada mes (columna "Corte", tooltip, línea "Corte" y tramo punteado del gráfico) salen de los cortes reales (ingresos: propio > cierre > `DATA.n_meses`; remuneraciones: `rem.real_hasta_mes`) y NO del selector "hasta el mes" (con el defecto —diciembre— antes los 12 meses salían "Real"; con el selector en marzo, de abril en adelante "Proy."); agregado, un RBD con cortes iguales / distintos / sin corte propio, fixture `cierre`, un cambio remoto del mes de cierre, y que cada fuente y el Consolidado siguen rotulándose por su "Real hasta" aunque se mueva el selector |
| `honorarios_cuentas` | Honorarios PR-1: el catálogo (`data/honorarios_cuentas_2026.json`) y el bloque de `index.html` dicen lo mismo; 36 cuentas (las 35 del spec + 411404), 410803 solo Honorarios, 411801 solo BHE, las «sin BHE»; todas existen en el Plan de Cuentas con el mismo nombre; el selector de cuenta de SEP lista las habilitadas (27, 24 con ●) y el de tipo solo los que la cuenta acepta; el selector de compras ya no trae los 5 tipos |
| `honorarios_modelo` | Honorarios PR-1: el modelo por boleta y el bloque «Honorarios (Subt. 21)» de SEP: fila mensual de solo lectura (por Fecha Documento), proyección por cuenta (se SUMA), avisos, N° DC, lo que no entra en los totales; alta/edición/duplicado/eliminación con write de SOLO esa boleta (`honorarios.<id>`, `merge:true`, tipo como código); proyección; varias personas a la vez (formulario a medias, alta/borrado ajeno); documentos dañados; recarga |
| `honorarios_70_30` | Honorarios PR-1: la regla 70/30 «opción B» contra un cálculo independiente: `gasto_personal = rem + hon` (cualquier cuenta), `saldo_rem`, `% Ejec. Personal`, `gasto_total = rem + hon + B&S`, Estado, tarjetas Real/Proy/Total, selector «hasta el mes», encabezados y leyendas; B&S no cambia |
| `honorarios_consistencia` | Honorarios PR-1, invariante: el gasto total y el saldo de SEP son idénticos en la pestaña SEP, Panel principal (tarjeta, franja, serie mensual, «Atención»), % Ejecución (SEP y Consolidado) y Reportes (Visualizador y Reporte personalizado) en Total / Real / Proyectado |
| `honorarios_excel` | Honorarios PR-1: hojas `HONORARIOS` y `HON_PROYECCION` (columnas, una fila por boleta, ID, tipo como código, N° DC, neutralización de fórmulas solo en texto libre), exportar → reimportar → exportar idempotente, claves deterministas sin duplicar, filas rechazadas con motivo, un Excel antiguo no borra nada |
| `honorarios_compras` | Honorarios PR-1: compras sin los 5 tipos en el selector; las antiguas con esos tipos siguen sumando en B&S (cero cambio de cifras), con la marca «⚠ muévelo a Honorarios» y su resumen (SEP y General), sin botón de migración, editar no pierde el tipo, y el aviso previo al CSV de SUPEREDUC dice «muévelo al registro de Honorarios» |
| `faep_figa_jardines` | «Ajustes de fuentes», cambio 1, fixture `jardines`: FAEP y FIGA listan 69 entidades (55 RBD, AC y los 13 jardines, en ese orden) y las demás fuentes conservan su universo (56 / 13); cifras por fila y tarjetas KPI de FAEP y FIGA (Total / Real / Proyectado) contra un cálculo independiente que suma los jardines; Estado y «N de 69 entidades en déficit» (tarjetas de las pestañas, del Panel principal y franja «de 497»); «Atención» rotula «FAEP · GESPARVU 5402004» y abre su modal; títulos de modal y nombres accesibles por TIPO de entidad (GESPARVU / Administración Central / RBD); guardado con `merge:true` solo de `otras_fuentes.faep` (o `.figa`) sin tocar JUNJI ni Aporte JUNJI del mismo documento, incluido un jardín que no tenía FAEP; «Real hasta» de un jardín y «Aplicar a todas las entidades» (69 documentos); % Ejecución (70 opciones), Visualizador y Reporte personalizado (un jardín genera filas en FAEP/FIGA/JUNJI y ninguna en General ni Aporte Educ.); Excel exportar/importar (archivo nuevo con jardines, archivo antiguo solo con RBD y AC —no escribe nada en los jardines— y la fila de un jardín sin FAEP previo); XLS / CSV / PDF por fila de un jardín; respaldo JSON; con los documentos de los jardines ausentes no se siembra nada |
| `junji_bdl` | «Ajustes de fuentes», cambio 2, fixture `jardines`: la línea «Ingreso Bono Desempeño Laboral (BDL)» (`ingreso_bdl`, hoja `ING_BDL`) de JUNJI: 4.ª tabla del modal (orden, ayuda, nombre accesible, 7 meses Real / 5 Proyectados según el corte), filas y tarjetas (Total / Real / Proyectado) contra un cálculo independiente, el BDL NO entra en el saldo de Operación para B&S pero SÍ al saldo total y al Estado (5401002 con BDL alto → Déficit solo por Operación; 5403002: el BDL cubre Remuneraciones, bordes -$1 / $0 / +$1 con edición en vivo; un BDL de $1.000 M no saca del Déficit por Operación), guardado con `merge:true` solo de `ingreso_bdl`, Panel principal (tarjeta JUNJI y franja = total de la serie mensual en las 3 vistas), % Ejecución (el «Ingreso anual Total» incluye el BDL), Visualizador, Reporte personalizado (catálogo, real/proyectado por celda), Excel (hoja `ING_BDL`, round-trip, archivo anterior sin la hoja y archivo con cambios), CSV y PDF por fila, respaldo JSON, Aporte JUNJI sin BDL, «Cómo usar», documentos antiguos sin `ingreso_bdl` (ceros, 0 writes) y documentos con `ingreso_bdl` dañado (texto, nulo, arreglo, `meses` de texto, meses con basura: no tumba nada ni escribe) |
| `mock_semantica` | prueba el propio mock (merge profundo, deleteField, timestamps, batch, offline, errores…) sin el panel |

### Honorarios (PR-1): qué falla contra el panel anterior (`APP_HTML=@1f0821b`)

`1f0821b` es el `index.html` justo antes de Honorarios (merge de la PR #63). Estos specs **fallan** contra él y **pasan** con el árbol (así se comprobó que prueban Honorarios y no algo que ya existía):

```bash
APP_HTML=@1f0821b node tests/run.mjs spec honorarios_cuentas honorarios_modelo honorarios_70_30 honorarios_consistencia honorarios_excel honorarios_compras \
  roundtrip_excel persistencia seguridad_xss formulas_csv_excel modal_equivalencia escritura_modal_tecleo csv_supereduc_formato corte_ingresos a11y_nombres a11y_contraste a11y_foco
# → 17 FAIL, 0 PASS
```

Los 6 `honorarios_*` son nuevos; los otros 11 se **extendieron** con su parte de Honorarios: `roundtrip_excel` y `corte_ingresos` (las 8 hojas del Excel de carga, y exportar → importar de `HONORARIOS` / `HON_PROYECCION`), `persistencia` (alta, edición, borrado y proyección con write parcial `honorarios.<id>` y `deleteField`),
`seguridad_xss` y `formulas_csv_excel` (texto libre de boletas: se ve literal, apóstrofo solo en descripción, nombre del prestador y N° DC), `modal_equivalencia` (40 pasos con boletas y proyección y la comprobación de que el bloque está en el modal), `escritura_modal_tecleo` (teclear en el formulario de honorarios y en la proyección con cambios ajenos),
`csv_supereduc_formato` (aviso «muévelo al registro de Honorarios») y `a11y_nombres` / `a11y_contraste` / `a11y_foco` (el bloque de honorarios en los recorridos de vistas, `recorrerHonorarios` de `tests/lib/a11y-vistas.mjs`).

### Ajustes de fuentes (jardines en FAEP/FIGA + BDL de JUNJI): qué falla contra el panel anterior (`APP_HTML=@ff7a666`)

`ff7a666` es el `index.html` justo antes de esta PR (merge de la PR #64). Estos specs **fallan** contra él y **pasan** con el árbol:

```bash
APP_HTML=@ff7a666 node tests/run.mjs spec faep_figa_jardines junji_bdl estado_junji a11y_nombres roundtrip_excel persistencia seguridad_xss mes_cierre_global
# → 8 FAIL, 0 PASS (y el golden, cuyo baseline ya trae los jardines y el BDL)
APP_HTML=@ff7a666 node tests/e2e-real/run.mjs 12   # el spec 12 del arnés real también FALLA (7 aserciones)
```

`faep_figa_jardines` y `junji_bdl` son nuevos; los otros 6 se **extendieron** o ajustaron: `estado_junji` (texto de la causa «Homologación, Carrera Docente ni BDL» y la sección 7 con el BDL), `a11y_nombres` (escenario J con `recorrerJardines`),
`roundtrip_excel` (FAEP / FIGA con 69 filas, JUNJI con `ING_BDL` y el Excel individual de un jardín), `persistencia` (BDL y FAEP de un jardín con merge), `seguridad_xss` (conceptos con marcado en FAEP/FIGA de un jardín y la línea BDL) y `mes_cierre_global`
(los jardines también son entidades de FAEP y FIGA: «Aplicar a todas» los fija en 69 documentos). Los oráculos (`tests/lib/corte.mjs`, `tests/lib/estado.mjs`) calculan el universo de cada fuente (`idsDeUniverso`) y el rótulo por tipo (`tituloEntidad`)
sin pasar por el código del panel.

### Bugs conocidos: `known-bug` vs `enforced`

Hoy ningún spec está en `'known-bug'`: `semilla_offline.mjs` (PR A) y `escritura_modal_tecleo.mjs` (F-01) ya están en `'enforced'` porque sus bugs se corrigieron.
La constante `MODO_BUG` de un spec nuevo que documente un defecto aún no corregido empieza en `'known-bug'`:

- `known-bug`: si el bug está presente imprime `BUG CONOCIDO presente (esperado)` y la suite **no falla** (estado `KNOWN_BUG`).
  Si el bug ya no se reproduce avisa en la tabla que hay que pasar a `enforced`.
- `enforced`: el bug presente **hace fallar** el spec. Quien corrija el bug debe cambiar la constante a `'enforced'` para que no reaparezca.
- También se puede forzar desde fuera: `KNOWN_BUG_EXPECTED=1` / `0` o `--expect-known-bugs` / `--enforce-bugs` (p. ej. `node tests/run.mjs --enforce-bugs`).

### Agregar una prueba

Crea `tests/specs/mi_prueba.mjs` (se descubre sola):

```js
import { boot, clickTab } from '../lib/boot.mjs';
import { correrSpec } from '../lib/spec.mjs';

await correrSpec('mi_prueba', async (t) => {
  const h = await boot({ fixture: 'default', user: 'authorized' });   // también: offline, seedCache, latency, path, initScripts…
  await clickTab(h.page, 'SEP');
  await h.page.click('#tableBody td.rbd-clickable[data-abrir-rbd="1121"]');
  await h.page.fill('input.celda-input[data-rbd="1121"][data-modo="rem"][data-mes="AGOSTO"]', '1000');
  await h.flushWrites();                                              // blur + espera al eco del mock
  const w = (await h.writes()).filter(x => x.path === 'sep_carga_rbd/1121');
  t.eq(w.length, 1, 'un solo write');
  t.ok(w[0].options.merge === true, 'merge:true');
  t.noErrores(h);                                                     // console.error / pageerror / requestfailed / red externa
  await h.close();
});
```

Para una vista nueva en el golden master, agrega `R.vista('nombre', '#selector')` / `R.descarga(...)` / `R.imprimir(...)` en la sección que corresponda de
`tests/golden/capture.mjs` y regenera el baseline (revisando el diff).
Si un error de consola es esperado: `h.expectErrors(/texto/)`. Los `alert/confirm/prompt` se aceptan solos y quedan en `h.dialogs`.

## Verificación contra el SDK real (`tests/e2e-real/`, opcional)

El mock de arriba es rápido y determinista, pero lo escribimos nosotros: no demuestra cómo se comporta Firestore de verdad.
`tests/e2e-real/` corre el panel contra el **SDK real de Firestore 10.12.0 y el emulador oficial** (necesita Java y red para el
`setup.sh`; las dependencias, unos 280 MB, se instalan fuera del repositorio en `E2E_HOME`, por defecto `/home/user/.e2e-real`).

```bash
bash tests/e2e-real/setup.sh && node tests/e2e-real/run.mjs        # los 12 specs contra el árbol (el 11 es Honorarios por boleta; el 12, jardines en FAEP/FIGA y BDL de JUNJI), ≈ 8 min
node tests/e2e-real/run.mjs --matriz                                # además contra @069f9dd y @baseline, ≈ 15 min
```

Conviene correrlo antes de mergear cambios que toquen `onSnapshot`, el guardado (`flushRbdSave`), el indicador de sincronización o la
siembra. Detalle y lista de lo que el mock modela mal (orden de snapshots, límite de 1500 bytes de la ruta completa, errores
transitorios que el SDK nunca entrega a `setDoc`, tiempos de detección de red) en `tests/e2e-real/README.md`.

## Diagnóstico de accesibilidad con axe-core (opcional, no versionado)

Los specs `a11y_*` miden con helpers propios (sin dependencias). Para cazar cosas que se escapen se puede correr **axe-core** a mano, instalado FUERA del repo:

```bash
mkdir -p /home/user/.a11y && cd /home/user/.a11y && npm init -y && npm install axe-core
# en un script de diagnóstico: boot() + recorrerVistas() de tests/lib/a11y-vistas.mjs y, en cada vista,
#   await page.evaluate(fs.readFileSync('/home/user/.a11y/node_modules/axe-core/axe.min.js', 'utf8'));
#   await page.evaluate(() => axe.run(document.querySelector('#app'), { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] }));
```

Con la PR C2 quedan solo hallazgos del Panel principal que NO son parte de esa PR (ver la descripción de la PR): `label-content-name-mismatch` en las tarjetas y barras
(`aria-label` más corto que el texto visible), `list`/`aria-allowed-role` en la lista "Atención" (`<li role="link">`), y los avisos menores `empty-table-header` (las
columnas de acciones se nombran con `aria-label`, que axe no cuenta como texto visible).

## Limitaciones

- No prueba contra Firebase real ni el envío real del correo; las reglas de seguridad (`firestore.rules`) no se ejecutan.
- Los specs `a11y_*` miden lo que Chromium expone (árbol de accesibilidad, estilos calculados): no sustituyen una prueba con un lector de pantalla real (NVDA / JAWS / VoiceOver) ni con
  zoom/reflow a 400 %. El contraste se calcula sobre el color compuesto de fondos con alfa y degradados lineales simples; no analiza imágenes ni `mix-blend-mode` (el panel no los usa).
- El golden master es de **cobertura amplia, no exhaustiva**: no recorre todas las combinaciones de filtros; el golden no renderiza los PDF (captura el HTML que se iba a imprimir); la
  paginación real la cubre `impresion_paginas` con `page.pdf()` (sin ver el diálogo de impresión de cada navegador ni las impresoras). Las rutas de error de red del SDK real (reintentos, cuotas) se simulan solo con `failNextWrite`/`setOffline`.
- El mock no persiste la cola offline entre recargas (el SDK real sí, vía IndexedDB).
- Los gráficos SVG se comparan por hash (detecta cambios, no dice cuáles).
- Un baseline generado con otra versión de Chromium/ICU puede diferir solo en formato de números/fechas.

## Siguiente paso: integración continua (no incluido, no se pudo probar aquí)

Esqueleto sugerido para `.github/workflows/tests.yml` (hay que probarlo en GitHub: instalar Chromium en el runner, y decidir si la rama protegida exige la suite):

```yaml
name: tests
on:
  pull_request:
    paths: ['index.html', 'tests/**', 'firestore.rules']
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # APP_HTML=@baseline necesita el commit 0f16ace
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install -g playwright@1.56.1
      - run: playwright install --with-deps chromium
      - run: node tests/run.mjs            # sin APP_HTML = el index.html del PR contra el baseline versionado
```

`pw.mjs` encuentra el Playwright global con `npm root -g` (o `PLAYWRIGHT_MODULE_PATH`). Si el baseline difiere por la versión de Chromium del runner, regenerarlo allí.
