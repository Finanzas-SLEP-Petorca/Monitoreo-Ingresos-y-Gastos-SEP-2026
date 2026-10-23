# Monitoreo Ingresos y Gastos 2026 — SLEP Petorca

Panel de seguimiento de Ingresos y Gastos por establecimiento (RBD) y por fuente de
financiamiento, para el Servicio Local de Educación Pública (SLEP) Petorca. Para SEP, compara
el ingreso de cada colegio contra el gasto real en remuneraciones (Subtítulo 21) y en bienes y servicios
(Subtítulos 22 y 29), aplicando la regla de que el 70% del ingreso SEP debe destinarse a
remuneraciones y el 30% a bienes y servicios, e identifica déficit o superávit por
establecimiento.

## Cómo usarlo

Abre [`index.html`](./index.html) directamente en el navegador, o publícalo como página
estática (por ejemplo con GitHub Pages apuntando a este archivo). Necesita conexión a internet
para autenticarse y sincronizar (Firebase); la librería de Excel usada para exportar/importar
sigue viniendo incluida en el propio archivo. Dentro del panel, el botón "❓ Cómo usar" (arriba a
la derecha) tiene una guía rápida pensada para todo el equipo, sin pasos técnicos.

### Estructura de pestañas y Panel principal (dashboard)

La barra de pestañas va en tres grupos, siempre en este orden:

1. **Inicio**: 🏠 **Panel principal** (dashboard, la pestaña que se abre al entrar) y 🎓 **SEP** (lo que antes
   se llamaba "Panel principal": la tabla "Estado por RBD" con la regla 70/30; conserva todo su contenido).
2. **Fuentes de financiamiento** (una pestaña por fuente, sin selector): General, PIE, Mantención,
   Pro-Retención, JUNJI, FAEP, FIGA, Aporte Educ. y Aporte JUNJI.
3. **Análisis**: 📉 % Ejecución y 📈 Reportes (siempre al final).

Los rótulos de las fuentes son cortos para que las 13 pestañas quepan en **una sola fila** desde ~1360 px de
ancho (General, PIE, Mantención, Pro-Retención, JUNJI, FAEP, FIGA, Aporte Educ. y Aporte JUNJI; el nombre
completo está en el `title` de cada botón y en el título de su pestaña). En pantallas más angostas la barra
envuelve por grupos (y el grupo de fuentes se parte en varias líneas si hace falta) y, desde 760 px o menos,
pasa a una sola fila con scroll horizontal propio: el borde que tiene más pestañas ocultas se difumina para
indicarlo.

**Adaptación al ancho de la ventana.** El contenedor principal mide como máximo 1360 px y se contrae con la
ventana (se verifica a 1024, 1280, 1366 y 1440 px, y se degrada a tableta y móvil): no hay scroll horizontal
de la página, el encabezado deja "❓ Cómo usar" y "Cerrar sesión" siempre a la vista (el subtítulo cede ancho
antes de que bajen de fila) y las tablas anchas (SEP, fuentes, Reportes, "Ver datos en tabla" del Panel
principal) hacen scroll horizontal dentro de su propio contenedor, con el encabezado fijo al desplazarse
hacia abajo. A 1440 px o más el diseño es el mismo de siempre.

#### % Ejecución por fuente

La pestaña **% Ejecución** tiene una fila de botones para elegir la fuente: **SEP** (comportamiento de
siempre, contra la meta 70/30), las 9 fuentes y **Consolidado** (SEP + las 9). Para las fuentes que no son
SEP no hay meta ni techo, así que el % de ejecución se define **sobre el Ingreso anual Total (Real+Proy)** de
la selección (suma de sus líneas de ingreso, 3 en JUNJI):

- % Ejec. Remuneraciones acumulado = Σ gasto en Remuneraciones hasta el mes / Ingreso anual Total.
- % Ejec. B&S acumulado = Σ gasto en Bienes y Servicios hasta el mes / Ingreso anual Total.
- % Ejec. Total acumulado = (Remuneraciones + B&S) acumulado / Ingreso anual Total.
- Las tarjetas muestran cada % en **Real** (solo lo ejecutado) y **Real+Proy a diciembre**; el denominador
  es siempre el Ingreso anual Total, así que el % Real nunca supera al de diciembre.
- La tabla mensual marca cada mes **Real / Proy. / Mixto** según el "Real hasta" de cada entidad (Mixto =
  la selección agregada tiene entidades con cortes distintos ese mes); en el gráfico la línea sólida llega
  hasta el menor corte y el resto va punteado. Sin ingreso cargado se muestra "—" y un aviso, nunca NaN.
- Las partes mensuales (`partesMensualesOtraFuente` / `partesMensualesSep`) son las mismas que usa el
  dashboard, así que "Consolidado" cuadra con el panel principal.

El **Panel principal** resume SEP + las 9 fuentes de un vistazo (todo en tiempo real, sin cargar nada aparte):

- **Chips Total (Real+Proy) / Real / Proyectado**: cambian todas las cifras y gráficos de la pantalla.
- **Franja consolidada**: Ingreso, Gasto Remuneraciones, Gasto Bienes y Servicios, Gasto Total, Saldo y
  entidades en déficit (suma de SEP y las 9 fuentes).
- **Una tarjeta por fuente** (10): saldo destacado (verde/rojo con ▲/▼ y etiqueta, nunca solo color), Ingreso
  vs. Gasto en mini barras, % de ejecución (Gasto/Ingreso, con barra de progreso) y "N de M entidades en
  déficit". **Clic (o Enter/Espacio) en una tarjeta abre la pestaña de esa fuente.** Las cifras coinciden
  exactamente con las tarjetas KPI de la pestaña correspondiente en la misma vista (para SEP, "Ingreso" =
  Ingreso SEP + Carrera Docente, el mismo que usa su Saldo, y siguen el selector "Ver resumen hasta el mes").
  Cada tarjeta lleva además sus montos exactos en atributos `data-*`.
- **Ingreso vs. Gasto por fuente** y **Composición del gasto** (Remuneraciones vs. Bienes y Servicios, en %):
  barras con tooltip al pasar el cursor o enfocar y clic para abrir la pestaña. "Ver datos en tabla" muestra
  los mismos números como tabla.
- **Evolución mensual consolidada** (Ingreso vs. Gasto, enero–diciembre): se arma mes a mes con las mismas
  reglas real/proyectado de cada pestaña (corte "Real hasta" por entidad en las fuentes; en SEP, ingreso real
  hasta `DATA.n_meses`, remuneraciones hasta el corte de cada RBD, compras siempre reales y proyección de B&S
  siempre proyectada). Es la serie del año completo: no depende del selector "Ver resumen hasta el mes" de SEP.
  Los tests verifican que su total cuadra con la franja consolidada en las 3 vistas.
- **Atención**: las 8 entidades con el saldo más negativo (según la vista elegida) entre SEP y todas las
  fuentes; clic abre la pestaña y el detalle de esa entidad.
- **🖨 Exportar PDF** del dashboard (mismo mecanismo de impresión del navegador; se ocultan la barra de
  pestañas y los controles).

Funciones: `computeTotalesSepParaDashboard()` (adaptador de SEP con la misma forma que
`computeTotalesOtraFuente`), `irAPestana(tabId)`, `renderDashboard()` y las de gráficos (`renderDashComparativo`,
`renderDashComposicion`, `renderDashMensual`, `renderDashAtencion`). Los gráficos usan la paleta del panel
(Ingreso azul `--series-1`, Gasto naranja `--series-2`, Bienes y Servicios violeta `#7c3aed`), validada con el
validador de paletas del skill `dataviz` (separación para daltonismo y contraste).

### Paleta y formato

Usa la misma paleta y formato que el resto de los paneles de Finanzas SLEP Petorca (Control de
DC y Facturación, Panel Impresora de Pago Proveedores BancoEstado): fondo azul-gris claro,
tarjetas blancas con sombra suave, acento azul, y tarjetas KPI en tonos pastel según el tipo de
dato (azul = ingreso, ámbar = gasto, verde/rojo = saldo según el signo, gris = conteos neutros)
— para que cada número se identifique de un vistazo, pensado para que lo mire más de una persona
a la vez. Las variables de color viven en `:root` (no en una clase particular) justamente para
que tanto la pantalla de login como el panel interno compartan la misma paleta.

### Accesibilidad y teclado (WCAG 2.1 AA)

El panel se puede usar sin ratón y con lector de pantalla. Qué hay y cómo se comprueba:

- **Estructura de la página.** `<header>` (banner), `<nav aria-label="Secciones del panel">` con la barra de pestañas y un único `<main>` que
  contiene los 13 paneles. Los tres diálogos (detalle por RBD, detalle de una fuente y "❓ Cómo usar") cuelgan fuera de la zona principal.
- **Pestañas** (patrón WAI-ARIA *tabs*). Los tres grupos (Inicio / Fuentes de financiamiento / Análisis) son `role="tablist"`; cada pestaña es
  `role="tab"` con `aria-selected` y `aria-controls`, y cada panel `role="tabpanel"` con `aria-labelledby`. Solo la pestaña activa está en el orden de
  **Tab** (las otras 12 tienen `tabindex="-1"`). Con el foco en la barra: **← / →** pasan a la pestaña vecina **y la abren** (las 13 forman una sola
  secuencia aunque estén en tres grupos; del final se vuelve al principio), **Inicio / Fin** van a la primera / última, **Enter** o **Espacio** también
  activan. Al abrir una pestaña desde una tarjeta del Panel principal, el foco pasa a esa pestaña (antes se perdía).
- **Diálogos modales.** Cada uno es `role="dialog" aria-modal="true"` con nombre (su título). Al abrirlo el foco entra al botón **✕ Cerrar**, **Tab /
  Shift+Tab** ciclan solo dentro del diálogo, el resto de la página queda `inert` (ni foco ni lectores de pantalla) y **Escape**, ✕ o un clic en el velo lo
  cierran. Al cerrar, el foco vuelve a lo que lo abrió (la fila o el botón ▸, o "❓ Cómo usar"); si esa fila se repintó por un cambio de otra persona se
  usa la fila vigente de la misma entidad, y si se abrió desde el panel "Atención" (que cambia de pestaña) vuelve a la fila de esa entidad. El contenido del
  diálogo se sigue reconciliando con cada cambio remoto sin mover el foco, el cursor ni lo tecleado.
- **Nombres accesibles.** Toda celda de monto se llama `<concepto>, <mes>, <entidad>` (p. ej. "Remuneraciones (Subt. 21), enero, RBD 1121"); los
  buscadores, filtros y selectores tienen etiqueta; los botones solo-icono (✕, 🗑, ✏️, ⧉, 🖨, 📅, ▸) llevan `aria-label` y las acciones de cada fila dicen
  de qué entidad son ("Descargar PDF del RBD 1121"). Regla: ningún control depende de `title` o `placeholder` como único nombre.
- **Contraste.** Todo texto visible (también en estado *hover*, con foco y en los avisos de sincronización) cumple 4,5:1 (3:1 si mide ≥ 24 px, o ≥ 18,66 px
  en negrita). Los colores están en los tokens de `:root`: `--text-muted`, `--status-good`, `--status-critical`, `--tone-green-fg`, `--tone-amber-fg` y
  `--series-2-btn` (fondo de los botones naranjas con texto blanco) ya salen ≥ 4,5:1 sobre blanco, el fondo de página y las tarjetas tintadas; al agregar un
  color nuevo conviene probarlo con `node tests/run.mjs spec a11y_contraste`. Quedan exentos los controles deshabilitados (p. ej. el selector de entidad de
  % Ejecución cuando no aplica).
- **Foco visible.** Un único `:focus-visible` para todo el panel: contorno sólido de 2 px (`--focus-ring`, #1d4ed8) separado 2 px del control (dentro de las
  tablas con scroll se dibuja hacia adentro para que no lo recorten). Solo aparece al navegar con el teclado: el clic del ratón no lo muestra, y los estilos
  de *hover* no cambian.

Pruebas automáticas (Playwright): `a11y_modales`, `a11y_pestanas`, `a11y_nombres`, `a11y_contraste` y `a11y_foco` (ver `tests/README.md`).

### Formato de números (presentación es-CL)

Todo lo que se **ve** en pantalla, en los modales y en lo que se imprime usa el mismo formato (funciones `fmtCLP`,
`fmtPct` y `fmtMillones` de `index.html`):

| Qué | Formato | Ejemplo |
|---|---|---|
| Pesos | `$` + miles con punto, sin decimales; el signo negativo va **antes** del `$` | `$1.234.567` · `-$1.234.567` · `$5.000` |
| Porcentaje | una decimal con **coma** (también los enteros) y miles con punto | `54,6%` · `100,0%` · `1.234,5%` |
| Millones (gráficos y tarjetas del Panel principal) | coma decimal y miles con punto | `22,1 M` · `5.061 M` |

Los **respaldos y las salidas de intercambio conservan su propio formato (es contrato y no cambia)**: los CSV y Excel
de respaldo (p. ej. el resumen SEP trae `54.6%` y montos sin separadores), el JSON y el CSV de compras para
SUPEREDUC. Las celdas editables de los meses muestran el monto tal como se teclea (`1500000`, con coma para decimales).

### Acceso: correo institucional + enlace mágico

El panel es de acceso restringido. Al abrirlo, ingresa tu correo institucional
(`nombre.apellido@sleppetorca.gob.cl`) y presiona "Enviar enlace de acceso": llega un correo con
un enlace de acceso sin contraseña (*passwordless*) que expira en 1 hora. Al hacer clic en ese
enlace quedas autenticado en el panel. Solo los correos de la whitelist (constante
`ALLOWED_EMAILS` en `index.html`, la misma lista usada en Firestore Rules) pueden entrar — si tu
correo no está autorizado verás "Acceso denegado" y deberás pedirle a Wilson Rojas que lo agregue
en ambos lugares. En el campo de correo, **Enter** envía el enlace (igual que el botón); si el correo no está
autorizado, la pantalla "Acceso denegado" cierra esa sesión y ofrece **"Usar otro correo"**, que vuelve al formulario
limpio sin recargar la página.

**A dónde vuelve el enlace del correo.** El enlace lleva de regreso a la URL **real de la página**
(origen + ruta, sin `?query` ni `#hash`) cuando el panel se sirve por `http`/`https` — en producción
`https://finanzas-slep-petorca.github.io/Monitoreo-Ingresos-y-Gastos-SLEP-Petorca-2026/` (GitHub
Pages). Si el panel se abre desde un archivo local (`file://`), el enlace usa esa URL de producción
como respaldo (constante `URL_PRODUCCION` en `index.html`). Así un cambio de nombre del repositorio
ya no deja el enlace apuntando a una página que da 404; si algún día cambia el dominio, además hay
que agregarlo en Firebase Console → Authentication → Settings → *Authorized domains*. Al completar el
acceso, el panel borra de la barra de direcciones los parámetros del enlace (`apiKey`, `oobCode`…).

### Impresión / PDF

Los botones "🖨 Exportar PDF" (Panel principal, SEP, cada fuente, % Ejecución, Reportes) y el 🖨 de cada fila usan el
diálogo de impresión del navegador (hoja horizontal Carta o A4). Al imprimir se ocultan las pestañas, los controles
(botones, filtros) y todo lo de sesión ("Cómo usar", "Cerrar sesión", "Conectado como" y el estado de
sincronización). La tabla SEP y la fila del PDF individual de un RBD se compactan (9 px, encabezados en varias líneas)
para que la columna **Estado** entre completa en la hoja, y el espacio sobrante al final del documento se elimina para
que no salga una última hoja en blanco. `tests/specs/impresion_paginas.mjs` lo verifica generando los PDF con Playwright.

### Edición colaborativa en tiempo real

Las tablas de Ingreso SEP y Remuneraciones son editables directo en el navegador, mes a mes. Bienes
y Servicios (Subt. 22 y 29) se carga distinto: en vez de escribir un total mensual a mano, cada RBD
tiene un "Registro de compras" con los mismos campos que exige SUPEREDUC al cargar los gastos
(código de cuenta oficial, tipo y número de documento, fechas, proveedor, montos, documento
original) más el **N° DC** de uso interno (ver abajo) — el ítem y el mes se calculan solos a partir de esas compras, agrupadas por código de
cuenta y por el mes de la Fecha Documento. Cada compra ya cargada se puede editar (✏️, corrige sus
datos sin duplicarla), duplicar (⧉, precarga el formulario con los mismos datos para una compra
parecida) o eliminar (🗑). El botón "⬇ Compras SUPEREDUC (CSV)" descarga todas las
compras de todos los RBD con las columnas de la plantilla de SUPEREDUC; en la columna
"Acciones" de cada fila, el botón "⬇ CSV SEP" descarga ese mismo formato pero solo con las compras
de ese RBD — útil para cargar los gastos de un establecimiento a la vez en la plataforma de
SUPEREDUC, que exige subir por RBD (por eso el archivo con todos los RBD no se puede subir tal cual).

**Cómo se arma el CSV de SUPEREDUC.** Sigue el Manual de Usuario de Rendición de Cuentas 2026
(Cap. III, columnas A–M y Tabla 02), sin cambiar lo que el panel guarda ni lo que muestra:
el *Tipo de documento* sale como **código** (`FACEL`, `BOL`, `NOTACRE`…; las boletas de honorarios,
`BOLH`/`BHE`/`BOLHE`/`BPST`/`BPSTE`, según la Sección 12 del Manual de Cuentas); las fechas salen
**dd-mm-aaaa**; la descripción se recorta a **100** caracteres; el RUT sale **sin puntos y con
guion** (`76123456-7`); y *Documento Original* va **vacío** salvo en notas de crédito/débito, donde
debe ser `número-TIPO` (p. ej. `123-FAC`). Una misma función (`normalizaFilaCompraSupereduc`)
sirve a SEP y a las fuentes. Antes de descargar, el panel **avisa cuántas compras** traen datos que
la plataforma rechazaría y por qué (tipo sin código oficial, fecha inválida, fecha de pago anterior
a la del documento o fuera de 2026, monto gasto mayor que el del documento, descripción de más de
100 caracteres, nota de crédito/débito sin `número-TIPO`; y un aviso informativo para los documentos
de honorarios, que SUPEREDUC recibe en su Libro de Honorarios, Cap. IV); si cancelas el aviso no se
descarga nada. El archivo, si se confirma, se descarga igual con los datos tal como están en el panel.

**N° DC (Documento Contable interno).** Cada compra tiene un campo propio **N° DC** (`documentoContable`, texto
libre de hasta 100 caracteres, p. ej. `DC_344`): el número del documento contable interno, es decir, la
carpeta/SET donde está el respaldo del gasto y la única pista de que ese gasto ya fue registrado. Está en el
formulario y en la tabla de compras (columna siempre visible, junto a *Doc. original*) del modal de SEP y del modal
de las 4 fuentes con registro de compras (General, PIE, Mantención, Pro-Retención, incluida la entidad AC), y sigue
las mismas reglas que el resto de la compra (editar ✏️, duplicar ⧉, eliminar 🗑, guardado en tiempo real: la clave
`documentoContable` va en el mismo mapa de la compra y se fusiona celda a celda).

- **No va al CSV de SUPEREDUC** (las columnas A–M no cambian). Solo está en el Excel de respaldo/importación
  (columna **N° DC**, al final de la hoja COMPRAS; un archivo antiguo sin esa columna se importa igual y no borra los
  N° DC que ya tenían las compras) y en el XLS/PDF de cada fila.
- **Doc. original queda solo para notas de crédito/débito** (`número-TIPO`, p. ej. `123-FAC`), que es lo único que
  usa SUPEREDUC. Con cualquier otro tipo de documento el campo se *atenúa* (rótulo más suave, borde punteado) pero
  **no se deshabilita**: así no se ocultan ni se bloquean los valores que ya tienen las compras existentes.
- **Datos anteriores.** Mientras un DC siga escrito en *Doc. original* (`DC_344`, `DC-33`, `DC_22 - No hay PME`;
  se reconoce con `/^\s*DC[\s_-]*\d+/i`, que no calza con `123-FAC`), la columna N° DC lo **muestra** en cursiva
  (tomado de *Doc. original*) sin tocar lo guardado. En el CSV de SUPEREDUC ese valor **no sale como "Documento
  Original"** (sale vacío; si la compra es nota de crédito/débito cuenta en el aviso previo como "sin Documento
  Original").
- **Botón admin "🗂 Migrar DC (n)"** (junto a "Revisar duplicados", visible solo para `ADMIN_EMAILS`; el contador
  `(n)` aparece solo si hay algo que migrar). Pide confirmación mostrando cuántas compras se verán afectadas (SEP y
  fuentes con compras), mueve el valor **completo** de *Doc. original* a *N° DC* (sin interpretar el comentario) y deja
  *Doc. original* vacío. Solo toca compras con *N° DC* vacío y un DC en *Doc. original*, así que repetirlo no cambia
  nada. Escribe un `set` con `merge:true` por documento en lotes (`writeBatch`) de a lo más 400 operaciones (cada
  documento cuenta como 2: el `set` y la marca de hora de la auditoría; es decir, hasta 200 documentos por lote).
- N° DC es texto libre: se escapa siempre con `escHtml` y, en Excel, `neutralizaFormula` le antepone un apóstrofo si
  empieza con `=`, `+`, `-`, `@` (al importar se quita).

A diferencia de una planilla o de una sesión de navegador aislada, cada cambio (edición de celda,
compra agregada o eliminada) se guarda solo (con un pequeño retraso de ~400ms tras dejar de
escribir, o al instante al agregar/eliminar una compra o salir de una celda) en una base de datos
compartida (Cloud Firestore) y se propaga en segundos a todas las personas que tengan el panel
abierto — sin recargar la página.

**Cómo se escriben los montos.** Las celdas de monto aceptan lo que se teclea o se pega con formato
chileno: `1500000`, `1.500.000`, `1,5`, `1.234,5`, `$ 1.500.000`, `-2.500`. El punto es separador de
miles **solo** si calza con grupos de 3 dígitos (`1.500`, `12.345.678`); una coma, o un punto con otra
cantidad de dígitos detrás, es decimal (`1,5`, `1.5`, `1234.567`); vacío = 0 (sin valor). Un texto que no
es un número (`abc`, `1.2.3`) se **rechaza**: la celda se marca en rojo, no se guarda nada y, al salir de
la celda, vuelve al valor que estaba guardado. Teclear letras no hace nada. Mientras la celda tiene el foco
se muestra exactamente lo que escribiste; al salir se normaliza (`1.500.000` → `1500000`).

**Lo que escribes no se altera por lo que hagan otras personas.** El panel recibe un cambio por cada
edición de cualquiera de las ~17 personas conectadas (de cualquier RBD) y el eco de tu propio guardado.
Con el modal de detalle abierto esos cambios se **reconcilian** con lo que ya está en pantalla (no se
reconstruye el modal): la celda que estás tecleando conserva su texto, su cursor y su foco; el
formulario de compra (campos a medias y modo edición "💾 Guardar cambios") no se toca; y solo
aparecen o desaparecen las filas que realmente se agregaron o borraron. Lo que ya tecleaste y aún no
llegó a Firestore se superpone a lo recibido, así que nunca retrocede. El modal de las fuentes
(Otras Fuentes) funciona igual y además refleja los cambios y borrados que hacen otras personas.

### Carga masiva de compras por Excel

Si tienes muchas compras para cargar de una sola vez, no hace falta escribirlas una por una en el
formulario: el botón "⬇ Excel" incluye una hoja **COMPRAS** (una fila por compra, con las mismas
columnas del formulario — RBD, Código, Tipo y N° de documento, Fecha Documento, Fecha Pago,
Descripción, Proveedor, Montos, Documento original, N° DC — más una columna **ID**). Puedes editar esa
hoja o pegar filas nuevas y volver a subirla con "⬆ Importar Excel": las filas con **ID vacío** se
cargan como compras nuevas, y las filas con un **ID ya existente** (el que trae el propio Excel
exportado) actualizan esa misma compra en vez de duplicarla — por eso conviene exportar primero,
editar sobre esa base y volver a importar, en vez de partir de un Excel armado desde cero. Las
fechas se pueden escribir como texto (`2026-03-15`) o como fecha de Excel, ambas se reconocen al
importar.

**Nombres válidos.** Un concepto de B&S, el ID de una compra o el nombre de un ítem de ingreso se usan
como *clave* dentro del documento del RBD, y Firestore rechaza el guardado **completo** de ese RBD si
una clave está vacía, es de la forma `__algo__` o pesa más de 1500 bytes (UTF-8). Por eso se validan
al crear el concepto (aviso claro, no se agrega) y al importar un Excel: las filas con un nombre
inválido se **omiten** y el resumen de la importación las lista (hoja, fila y motivo); el resto de la
importación sigue. La barra `/` es válida en un concepto (`Agua/Luz`); no lo es en el RBD (ID de
documento) de una fila de Excel, que también se valida.

Cada RBD muestra quién hizo la última edición y cuándo ("Última edición en este RBD: ..."), y la
barra bajo el título muestra el estado general de sincronización. El botón "⬇ Descargar carga
(JSON)" y "⬇ Excel" / "⬆ Importar Excel" siguen disponibles, ahora como respaldo manual — ya no
son necesarios para que los cambios queden guardados (la importación de Excel ya no trae hojas
SUBT22/SUBT29, esos gastos se cargan como compras).

El botón "⬇ Excel" descarga la carga completa (Ingreso, Remuneraciones, Compras) lista para
reimportar; es distinto del botón "⬇ Excel (resumen general)", que descarga en una sola hoja el
mismo resumen que se ve en pantalla y que trae "🖨 Exportar PDF (general)" (Ingreso SEP, gastos,
% de ejecución, saldos, Estado) para todos los RBD que cumplan el filtro/búsqueda actual.

### Real vs. proyectado

Cada tabla del detalle por RBD marca sus columnas de mes en verde ("Real") o naranja
("Proyectado"), con una regla distinta para cada una — no depende de un selector único:

- **Ingreso SEP**: enero-julio son reales (vienen de la Liquidación Web Subvenciones Mineduc);
  agosto-diciembre parten como una proyección editable (el promedio de esos 7 meses reales), que
  se puede corregir a mano en cualquier momento.
- **Remuneraciones**: no hay ninguna fuente automática que diga si una remuneración ya es real
  o es una estimación, así que cada RBD tiene su propio selector "Remuneraciones reales hasta:
  [mes]" — los meses hasta ahí se ven verdes, el resto naranjas, y siempre son editables. Se
  ajusta por establecimiento, a medida que se van confirmando los pagos reales de cada mes.
- **Bienes y Servicios**: las compras del "Registro de compras" siempre son reales — son gastos
  ya documentados, con proveedor y N° de documento. Para estimar meses que todavía no tienen
  compras cargadas, existe la sección **"Bienes y Servicios (Proyección) — por ítem"**: se puede
  agregar cualquier cantidad de ítems por RBD eligiéndolos de la misma lista desplegable de
  cuentas oficiales (Subt.22/29) que usa el Registro de compras, cada uno con su propia
  proyección editable mes a mes (siempre naranja) y su botón 🗑 para quitarlo. El total de todos
  los ítems se SUMA al total de compras reales de ese mes (nunca lo reemplaza), así que un mes
  puede tener compras reales y además una o varias proyecciones de gasto adicional sin documentar
  todavía, ya clasificadas por ítem igual que las compras. También se puede cargar/descargar de a
  granel en la hoja "BYS_PROYECCION" del Excel de carga masiva (columnas Código/Item + 12 meses).

El selector "Ver resumen (KPI y % Ejecución) acumulado hasta el mes:" de arriba de la tabla
principal es un control aparte: solo dice hasta qué mes se suman los montos en las tarjetas KPI y
en el gráfico de "% Ejecución" — no tiene ningún efecto sobre el real/proyectado del detalle por
RBD.

Ese mismo desglose real/proyectado se repite arriba de la tabla principal, en tres filas de
tarjetas KPI (sumando los 52 RBD): **"Real (ejecutado)"** (borde verde — Ingreso SEP, Carrera
Docente, Gasto Remuneraciones y Gasto Bienes y Servicios ya ejecutados, con su Saldo), **"Proyectado"**
(borde naranja — las mismas 5 cifras pero solo la parte proyectada) y **"Total (Real +
Proyectado)"** (la tabla de siempre, con RBD en déficit, Datos a revisar y Gasto SEP sin marco).
Sumando la tarjeta de una columna en "Real" más la misma columna en "Proyectado" da exacto el
valor de "Total".

Cada una de esas tres filas de tarjetas se puede colapsar de forma independiente haciendo clic en
su título ("Real (ejecutado)", "Proyectado" o "Total (Real + Proyectado)") — así se puede dejar
solo la vista que interesa y liberar espacio para la tabla "Estado por RBD" de abajo. Por defecto
"Real" y "Proyectado" arrancan colapsadas y "Total" abierta; el estado de cada fila se recuerda en
este navegador (no se comparte con el resto del equipo). El PDF individual de cada RBD (botón 🖨 de
cada fila) incluye este mismo desglose Real / Proyectado / Total.

### Pestaña "Reportes"

Es la última pestaña de la barra y tiene dos vistas, que se eligen con los chips de arriba:
**📊 Visualizador** (por defecto) y **🧮 Reporte personalizado**.

**Visualizador (multi-fuente).** Consolida **todas las fuentes de financiamiento** al estilo del
Visualizador de la plataforma de Rendición de Cuentas de SUPEREDUC (Manual, Cap. VII): filtros por
Fuente (SEP + las 9 fuentes, chips con "Todas / Ninguna") y por Entidad (55 RBD, "AC" y los 13
GESPARVU de JUNJI, con buscador; al elegir solo AC o solo GESPARVU quedan únicamente las fuentes
cuyo universo los incluye), un panel **Saldo disponible** (Ingresos − Gastos) y dos tablas
expandibles, **Ingresos** y **Gastos**, con columnas **Real / Proyectado / Total**:

- **Agrupar por fuente** (por defecto): una fila por fuente que se expande a sus subcategorías
  (Remuneraciones, Bienes y Servicios Subt. 22 / 29, Bienes y Servicios proyectados) y estas a
  sus cuentas/conceptos.
- **Agrupar por código / concepto (consolidado)**: una fila por cuenta (p. ej. 411601) que suma
  todas las fuentes y se expande para ver cuánto aporta cada una.
- Cada fila tiene el botón 📅 con el **detalle mensual** (Real / Proyectado / Total por mes). Las
  celdas se pintan verde (real) o naranja (proyectado) con el mismo criterio de corte de cada
  entidad; si en un mes se mezclan entidades con cortes distintos queda en degradé ("mixto").
- Descargas: **⬇ Excel** de Ingresos y de Gastos por separado (hojas Detalle, Mensual Real,
  Mensual Proyectado, Mensual Total, Filtros y, al agrupar por código, Consolidado), **⬇ CSV** y
  **🖨 Exportar PDF** (imprime el árbol completamente expandido, sin el detalle mensual).
- SEP se muestra por **año completo** (no depende del selector "Ver resumen acumulado hasta el
  mes" de la pestaña SEP); con ese selector en Diciembre (el valor por defecto) los totales por
  fuente coinciden con las tarjetas del Panel principal y de cada pestaña.

**Reporte personalizado.** Cruce **entidad × concepto × mes(es)** con coloreo real/proyectado por
celda, ahora para **SEP y las 9 fuentes de financiamiento**:

- **Entidades**: los 55 RBD + "AC — Administración Central" + los 13 GESPARVU, en la misma lista
  (agrupada con encabezados, con buscador y Todos/Ninguno; todas marcadas por defecto). Un par
  entidad × concepto que no corresponde (un GESPARVU con un concepto de SEP, un RBD con un concepto
  de JUNJI) simplemente no genera fila: RBD → SEP y las fuentes por RBD; AC → las fuentes por RBD;
  GESPARVU → JUNJI y Aporte Fiscal JUNJI.
- **Conceptos agrupados por fuente** (un grupo plegable por fuente; SEP abierto por defecto) con
  chips de fuente encima del buscador (solo filtran qué grupos se ven, no lo seleccionado). Los de
  SEP conservan sus keys y etiquetas de siempre (3 ingresos SEP, Remuneraciones, cada ítem de
  compras Subt.22/29, la proyección de B&S total y por ítem). Los de las fuentes llevan prefijo
  `[Fuente]`: Ingreso (o las 3 líneas de JUNJI), Remuneraciones, Bienes y Servicios total
  (Real+Proy) y, en las fuentes con compras, Proyección de B&S total; además, **dinámicos** (solo si
  hay datos): B&S por código de cuenta (compras), B&S por concepto libre y proyección de B&S por
  concepto. Un mismo código en dos fuentes es un concepto distinto por fuente.
- **Real / proyectado por celda**: en SEP, las mismas reglas de siempre (Remuneraciones según el
  corte propio de cada RBD, compras siempre reales, proyección siempre proyectada). En las fuentes,
  Ingreso / Remuneraciones / B&S por concepto: real hasta el "Real hasta" de ESA entidad en ESA
  fuente (por defecto el mismo corte de SEP, editable en cada pestaña); B&S por código (compras):
  siempre real; proyección de B&S: siempre proyectada. "B&S total" suma ambos tipos: si en un mes
  hay monto real y proyectado, la celda es **mixta** y queda sin color (si el mes está en $0 rige
  el corte).
- **Subtotales**: en SEP, la fila "Subtotal" de Remuneraciones nunca se colorea (mezclaría cortes
  distintos). En las fuentes se colorea solo si **todas** las entidades del subtotal coinciden en
  real/proyectado ese mes; si no, queda sin color. Los conceptos dinámicos se reconstruyen al volver
  a la pestaña Reportes.
- CSV, Excel y PDF incluyen las filas de las fuentes (columna RBD con el código de la entidad: AC o
  el código del GESPARVU); archivos `reporte_personalizado_AAAA-MM-DD.*`.

Este coloreado es independiente del selector "Ver resumen
acumulado hasta el mes" de la pestaña SEP, que solo afecta a las tarjetas KPI.

### Pestaña "Otras Fuentes"

Primer paso de una ampliación mayor: hacer el seguimiento de fuentes de financiamiento distintas
de SEP. Hoy son 9: Subvención General, PIE, Subvención de Mantención, Subvención Pro-Retención,
JUNJI, FAEP, FIGA, Aporte Fiscal Extraordinario Educación y Aporte Fiscal Extraordinario JUNJI
(estos dos últimos van como fuentes separadas a pedido del usuario). A diferencia de SEP, estas fuentes **no tienen marco anual ni meta 70/30** —
el seguimiento es simplemente Ingreso vs. Gasto por fuente, con un Estado de solo dos valores
(Superávit/Déficit).

- Cada fuente es su propia pestaña de primer nivel (entre SEP y % Ejecución/Reportes, ver
  "Estructura de pestañas") — sin selector desplegable intermedio, se presiona directo.
- La tabla incluye una fila fija adicional, **"AC" (Administración Central)**, para gasto a
  nivel del sostenedor que no corresponde a un establecimiento puntual — no aparece en el Panel
  principal ni en Reportes de SEP, solo en esta pestaña (excepto en JUNJI, ver más abajo).
- Todo se guarda en tiempo real vía Firestore (mismo documento `sep_carga_rbd/{rbd}` de SEP, bajo
  el campo nuevo `otras_fuentes`), sin requerir cambios en `firestore.rules`.

**Tres dimensiones independientes, combinables.** El catálogo `FUENTES_OTRAS` describe cada fuente
con tres campos en vez de un único flag binario (necesario desde que FAEP/FIGA y los Aportes
Fiscales agregaron combinaciones nuevas):

- `incomeShape`: `'single'` (1 línea de Ingreso) o `'junji3'` (3 líneas — Operación,
  Homologación, Carrera Docente — hoy solo JUNJI). Solo decide cuántas líneas de ingreso hay (y si
  aplica el "Saldo Operación disponible para B&S"); ya no determina el universo de entidades.
- `universo`: `'rbd_ac'` (los 55 RBD + la fila fija "AC") o `'gesparvu'` (los 13 **GESPARVU** —
  jardín infantil / sala cuna —, sin AC). Define qué filas lista la pestaña y de qué fuentes
  participa cada entidad (un mismo GESPARVU puede tener datos en JUNJI y en Aporte Fiscal JUNJI,
  bajo claves distintas de `otras_fuentes`, sin pisarse).
- `bysMode`: `'compras'` (Bienes y Servicios como "Registro de compras" con código de cuenta
  SUPEREDUC + documento/proveedor — General/PIE/Mantención/Pro-Retención) o `'concepto'` (ítems
  por concepto libre, sin código ni documento — JUNJI/FAEP/FIGA/Aportes Fiscales, ninguna es parte
  del sistema de rendición de cuentas de SUPEREDUC).

| Fuente | `incomeShape` | `bysMode` | `universo` | CSV SUPEREDUC |
|---|---|---|---|---|
| General / PIE / Mantención / Pro-Retención | `single` | `compras` | `rbd_ac` | Sí |
| FAEP / FIGA | `single` | `concepto` | `rbd_ac` | No |
| Aporte Fiscal Extraord. Educación | `single` | `concepto` | `rbd_ac` | No |
| JUNJI | `junji3` | `concepto` | `gesparvu` | No |
| Aporte Fiscal Extraord. JUNJI | `single` | `concepto` | `gesparvu` | No |

**JUNJI** (`incomeShape:'junji3'`, `bysMode:'concepto'`): Operación financia Remuneraciones y
Bienes y Servicios; Homologación y Carrera Docente financian solo Remuneraciones — el modal
muestra un "Saldo Operación disponible para B&S" informativo (no bloquea la carga si se excede).

**FAEP y FIGA** (`incomeShape:'single'`, `bysMode:'concepto'`): quedaron pendientes de la PR
anterior porque, igual que JUNJI, ninguna de las dos aparece en los manuales SUPEREDUC revisados
— de hecho, el propio Manual de Cuentas 2026 confirma que los convenios FAEP quedaron excluidos
del sistema de rendición de cuentas desde el periodo 2024 (dictamen N°67 de 2023 de la
Superintendencia de Educación). Usan el mismo universo de entidades que las 4 fuentes "simples"
(55 RBD + "AC").

**Aporte Fiscal Extraordinario Educación y Aporte Fiscal Extraordinario JUNJI**
(`incomeShape:'single'`, `bysMode:'concepto'`): ingresos aparte, que se gastan en Remuneraciones y
Bienes y Servicios y no se rinden por el libro de compras de SUPEREDUC. El de Educación usa el
universo `rbd_ac` (55 RBD + "AC"); el de JUNJI usa el universo `gesparvu` (los 13 GESPARVU, sin
AC) y tiene una sola línea de Ingreso (a diferencia de la fuente JUNJI, que tiene 3).

**Real / Proyectado / Total.** Cada pestaña de fuente distingue lo ejecutado de lo proyectado,
con el mismo criterio que las remuneraciones de SEP:

- Cada entidad × fuente tiene un corte **"Real hasta el mes"** (`otras_fuentes.{fuente}.real_hasta_mes`,
  por defecto el mismo corte de datos reales de SEP). Los meses hasta el corte son **Real** y los
  siguientes **Proyectado**, para el/los ingreso/s, las remuneraciones y — en las fuentes con
  Bienes y Servicios por concepto (JUNJI, FAEP, FIGA, Aportes) — los ítems de B&S. El corte se
  cambia por entidad en el modal, o para todas las entidades de la fuente con el control "Real
  hasta el mes → Aplicar a todas las entidades" de la pestaña.
- En las fuentes con **registro de compras** (General, PIE, Mantención, Pro-Retención) las compras
  son **siempre Real** (gasto ya documentado, no depende del corte) y la proyección de Bienes y
  Servicios se carga aparte en la sección "Proyección Bienes y Servicios (por concepto)" del modal
  (`otras_fuentes.{fuente}.bys_proy_items`, concepto libre, siempre Proyectada).
- Cada pestaña muestra 3 filas de tarjetas KPI colapsables — **Real (ejecutado)**, **Proyectado** y
  **Total (Real + Proyectado)** — con Ingreso, Gasto Remuneraciones, Gasto Bienes y Servicios,
  Gasto Total y Saldo (por defecto solo Total abierta, igual que la pestaña SEP; el estado de cada
  fila se recuerda en este navegador). Los chips "Total / Real / Proyectado" sobre la tabla cambian
  la base de sus columnas numéricas; la columna **Estado** siempre es sobre el Total.
- En el modal, los encabezados de mes llevan la etiqueta Real/Proy. según el corte de esa entidad y
  el subtítulo muestra Saldo Total, Saldo Real y Saldo Proy.
- Para otros módulos (Dashboard, % Ejecución, Reportes) está `computeTotalesOtraFuente(fuenteKey)`,
  que devuelve `{ real, proy, total }` (cada uno `{ ingreso, rem, bys, gasto, saldo }`) más
  `nEntidades / nDeficit / nSuperavit`; por entidad el desglose es `of.rp`.

**Importar / exportar.** Cada una de las 9 pestañas tiene su propia fila de botones, igual
criterio que la pestaña SEP pero leyendo/escribiendo `otras_fuentes` en vez de los datos de SEP:

- **⬇ Compras SUPEREDUC (CSV)** — solo en las 4 fuentes `bysMode:'compras'` (no en JUNJI/FAEP/
  FIGA, que no son parte de ese sistema de rendición): mismas 13 columnas y misma normalización
  (tipo por código, fechas dd-mm-aaaa, descripción ≤ 100, RUT con guion, Documento Original solo en
  NC/ND, aviso previo de filas que se rechazarían) que el de SEP, con el código de Subvención
  oficial de cada una en la columna "Subvencion" (`GENERAL`, `PIE`, `MANTENIMIENTO`, `PRORETENCION`).
- **⬇ Excel / ⬆ Importar Excel** — carga completa de la fuente en hojas (Ingreso, Remuneraciones,
  Compras + `BYS_PROY_ITEMS` para las `bysMode:'compras'`; hojas de Ingreso + Remuneraciones +
  `BYS_ITEMS` por concepto para las `bysMode:'concepto'`) y una hoja `META` con el corte "Real hasta
  el mes" de cada entidad, reimportable tal cual se exporta (el corte y la proyección de B&S
  sobreviven al round-trip; si una hoja falta en el archivo, el import no toca esos datos).
- **🖨 Exportar PDF** — mismo mecanismo de impresión del navegador que ya usa la pestaña SEP;
  imprime la pestaña de fuente actualmente activa.
- **⬇ Descargar carga (JSON)** — respaldo manual, igual criterio que el de la pestaña SEP.

**Con el teclado.** Cada fila de las tablas de fuente es focusable (Tab; el foco se ve con un anillo azul):
**Enter** o **Espacio** sobre la fila abren el detalle de la entidad (como el botón ▸ de la tabla SEP; Espacio no
desplaza la página), el foco entra al modal, **Escape** lo cierra y devuelve el foco a la fila. En los botones
de **Acciones** de la fila, Enter/Espacio siguen siendo de ese botón (no abren el detalle). Si otra persona guarda
mientras tanto y la tabla se repinta, el foco vuelve a la fila equivalente.

**Acciones por fila.** Cada tabla de fuente tiene al final una columna **Acciones** (igual que la
de SEP) con descargas individuales de esa entidad (RBD, "AC" o GESPARVU), que no salen en el PDF
general:

- **⬇ XLS** — Excel solo de esa entidad, con el mismo formato que el "⬇ Excel" de la pestaña (hojas
  de ingreso, remuneraciones, compras o ítems de B&S, proyección y `META` con el corte), así que se
  puede volver a cargar con "⬆ Importar Excel" de la misma pestaña sin tocar a las demás entidades.
- **⬇ CSV SUPEREDUC** (General, PIE, Mantención, Pro-Retención) — las compras de esa entidad en la
  plantilla de 13 columnas de SUPEREDUC (con la misma normalización y el mismo aviso previo). En las fuentes que no son parte de ese sistema (JUNJI,
  FAEP, FIGA y los dos Aportes Fiscales) el botón es **⬇ CSV** y baja el **detalle mensual** de la
  entidad: una fila por línea (ingresos, remuneraciones, ítems de B&S) con su tipo
  (Real / Proyectado / Mixto), seguida de los totales Real, Proyectado y Total, el Estado y el mes
  de corte "Real hasta".
- **🖨** — PDF individual de esa entidad: encabezado con la fuente y la entidad, las tarjetas Real /
  Proyectado / Total, las tablas mensuales con etiquetas Real/Proy y el registro de compras (o los
  ítems por concepto), en texto de solo lectura; usa el mismo mecanismo que el PDF individual de SEP.

#### Plan de Cuentas SUPEREDUC 2026 en el registro de compras

El selector de **Código de cuenta** del "Registro de compras" de **Subv. General, PIE, Mantención y
Pro-Retención** ya no usa el catálogo completo de SEP: ofrece solo las cuentas que el Manual de
Cuentas SUPEREDUC 2026 (sección 11, matriz «Plan de Cuentas Rendición Recursos 2026») habilita para
esa subvención. Lo que se ve y cómo funciona:

- **Selector acotado** por subvención (Subt. 22 y 29): Subv. General 77 cuentas, PIE 28,
  Mantención 28, Pro-Retención 23 (SEP, que no cambia, sigue con sus 51). Las cuentas **●**
  (habilitadas *sujetas a exigencias de pertinencia*, secciones 9 y 10 del manual) llevan el punto
  junto al nombre: se pueden usar, pero hay que poder justificar la pertinencia.
- **Fila AC (Administración Central)**: en **Subv. General** usa la columna «Adm. Central Subv.
  Gral.» del manual (52 cuentas). El manual no trae columna de Adm. Central para PIE, Mantención ni
  Pro-Retención, así que ahí la fila AC usa la misma columna de la fuente (decisión de producto, no
  del manual).
- **Nota del registro**: bajo el título dice cuántas cuentas están habilitadas y, si la subvención
  no admite personal (Mantención: ninguna cuenta 4101xx-4104xx), lo avisa — y marca con ⚠ si ya hay
  Remuneraciones cargadas.
- **Validación al agregar**: una cuenta no habilitada para esa subvención (o inexistente) se
  rechaza con un aviso, sin guardar nada.
- **⚠ en compras ya cargadas**: las compras que se registraron con el catálogo antiguo, o que
  entran por Excel, con una cuenta no habilitada **no se borran ni se pierden** (siguen sumando en
  Bienes y Servicios): quedan con la fila resaltada en ⚠, un resumen sobre la tabla y una línea en el
  mensaje de importación, porque SUPEREDUC las rechazaría al rendir. Se corrigen reclasificando la
  cuenta o eliminando la compra.
- Los códigos de cuenta que no estaban en el catálogo SEP (p. ej. 410801 Uniformes, 411001-411008
  servicios básicos, 411605 instalaciones de gas) se agregaron al libro de compras; como el manual no
  indica el subtítulo en esa tabla, **se infirió por categoría**: 4107xx y 4118xx → Subt. 29, el
  resto → Subt. 22 (supuesto documentado en `data/plan_cuentas_2026_verificacion.md`).

La matriz está embebida en `index.html` (bloque `PLAN_CUENTAS_2026`, 239 cuentas × 9 columnas) y se
extrajo del PDF —la tabla es una imagen— con `scripts/extract_plan_cuentas.py`; la comparación contra
el catálogo SEP, la coherencia de Adm. Central y la revisión visual de las 8 páginas están en
`data/plan_cuentas_2026_verificacion.md`. Para regenerarla:
`python3 scripts/extract_plan_cuentas.py --debug-dir /tmp/pc --inyectar index.html`.

**Pendiente**: el tipo de documento por código de cuenta (Manual de Cuentas, sección 12, págs.
120-124) todavía no restringe el selector «Tipo de documento».

## Fuentes de datos

- **Ingreso SEP (Preferente y Prioritario)**: Excel "Listado de Establecimientos" de
  Liquidación Web Subvenciones (Mineduc), por RBD y por mes — columna "Total a Pago" en ambos
  reportes (Preferente y Prioritario).
- **Carrera Docente**: ingreso de uso exclusivo en remuneraciones; no se carga automáticamente,
  se completa a mano mes a mes.
- **Gasto Remuneraciones (Subt. 21)** y **Gasto Bienes y Servicios (Subt. 22 / 29)**: se
  completan a mano en el panel; no vienen precargados desde ningún sistema.

## Regla 70/30

- Meta remuneraciones = 70% de (Ingreso SEP Preferente + Prioritario) + 100% de Carrera Docente
  (ese ingreso solo puede gastarse en remuneraciones).
- Meta bienes y servicios = 30% de (Ingreso SEP Preferente + Prioritario) — Carrera Docente no
  cuenta para este 30%.
- Saldo post Remuneraciones = meta remuneraciones − gasto real en remuneraciones.
- Saldo final = (Ingreso SEP + Carrera Docente) − gasto remuneraciones − gasto bienes y
  servicios.

### Dos familias de columnas "%" — no confundir

La tabla tiene tres grupos de columnas de porcentaje:

- **% Ejec. Remuneraciones / % Ejec. B&S** (fondo blanco): gasto / **meta** del 70% o 30%
  respectivamente. 100% = gastó justo lo que la regla le permite. Pueden pasar de 100% (indican
  que ese RBD ya superó su tope) aunque el establecimiento gaste poco en términos absolutos, si
  su ingreso SEP también es bajo. Son solo informativos: no definen el Estado.
- **% Rem. / Ingreso, % B&S / Ingreso** (fondo celeste claro, "% sobre Ingreso Total
  (informativo)"): gasto / **Ingreso Total** (SEP + Carrera Docente) — la fracción real del
  ingreso ya gastada, sin pasar por el filtro del 70/30. También son solo informativos.
- **Saldo Final (Real+Proy) y % Ejec. Total (Real+Proy)** (fondo celeste oscuro y en negrita,
  justo al lado de "Estado"): Ingreso Total − Gasto Total y (Gasto Remuneraciones + Gasto B&S) /
  Ingreso Total respectivamente — ambos ya incluyen tanto lo ejecutado como lo proyectado para lo
  que falta del año, así se ve cómo quedaría ese RBD si las proyecciones cargadas (Remuneraciones
  futuras y Bienes y Servicios Proyección) se cumplen tal cual. El % Ejec. Total es la única
  columna que realmente define el Estado de cada RBD: ≥100% Déficit, ≥90% Riesgo, el resto
  Superávit — ambas se destacan aparte de las demás para que quede claro de un vistazo por qué un
  RBD quedó en ese estado.

## Alerta: establecimientos sin marco SEP con gasto SEP

Tres establecimientos no tienen marco SEP asignado (Preferente/Prioritario/Carrera Docente =
$0), pero de todas formas pueden registrar gasto SEP por error de imputación:

- RBD 1120 — Centro de Educación de Adultos La Ligua
- RBD 11196 — Ctro.Rec.Atenc.Divers.CRAD Paul Percy Harris
- RBD 1126 — Escuela Especial Sol Naciente

Se incluyen en el panel igual que cualquier otro RBD (mismas tablas editables, mismo
exportar/importar Excel), pero si alguna vez registran gasto en remuneraciones, Subt. 22/29 o
Carrera Docente, el panel los marca con una alerta crítica bien visible: fila resaltada en rojo,
tag "⚠ GASTO SEP INDEBIDO" junto al nombre, "Estado" pasa a "⚠ Sin marco SEP", un banner rojo en
su detalle explicando el problema, y se suman a la tarjeta KPI "⚠ Gasto SEP sin marco" en la
parte superior. Esto es siempre un error a corregir o justificar, nunca un estado normal.

## Estructura del repositorio

```
index.html           Panel autocontenido (HTML + CSS + JS), listo para publicar o abrir local.
firestore.rules       Reglas de seguridad de Firestore (pegar manualmente en Firebase Console).
scripts/              Pipeline en Python usado para armar los datos que alimentan el panel
                       a partir de los Excel de origen (Estado_RBD_2026.xlsx, remuneraciones
                       SIGFE/CasChile, Liquidación Web Subvenciones, Carrera Docente/CPEIP), y
                       extract_plan_cuentas.py (matriz del Plan de Cuentas 2026 desde el PDF).
data/                 plan_cuentas_2026.json (matriz de cuentas por subvención, dato normativo
                       sin cifras) y plan_cuentas_2026_verificacion.md (cómo se verificó).
tests/                Arnés de pruebas (Playwright + mock local de Firebase): specs, golden master
                       y fixture sintético. Ver tests/README.md. Se corre con `node tests/run.mjs`.
```

Los scripts de `scripts/` esperan los Excel de origen en una carpeta `CARGA/` local (no
incluida en este repositorio: son datos internos de SLEP Petorca). No se publican Excel, CSV
ni JSON con cifras reales por establecimiento — solo el código, el dashboard ya armado y la
matriz normativa del Plan de Cuentas (excepción puntual en `.gitignore`).

## Firebase (acceso y sincronización en tiempo real)

El panel usa el mismo proyecto Firebase que
[Calendariopermisos](https://github.com/Finanzas-SLEP-Petorca/Calendariopermisos)
(`slep-petorca-finanzas-permisos`): Authentication (correo + enlace mágico) y Cloud Firestore,
en una colección propia y separada (`sep_carga_rbd`) que no comparte datos con la colección
`events` de Calendariopermisos.

- **Modelo de datos**: un documento por RBD en `sep_carga_rbd/{rbd}` (`ingreso_items`, `rem`,
  `agregado.items`, `lastModifiedBy`, `lastModifiedAt`), más un documento `sep_carga_rbd/_meta`
  con la lista compartida de conceptos de gasto (`items_22`, `items_29`).
- **Reglas de seguridad**: ver [`firestore.rules`](./firestore.rules) — debe pegarse
  manualmente en Firebase Console → Firestore Database → Reglas → Publicar (esto no se puede
  automatizar desde el repositorio). Solo los correos de la whitelist (la lista de `isAllowed()`, igual a `ALLOWED_EMAILS`) pueden leer/escribir, y
  ningún RBD puede borrarse desde el cliente.
- **Migración inicial (una sola vez)**: la primera vez que alguien entra al panel con la
  colección `sep_carga_rbd` vacía, el propio `index.html` sube automáticamente los datos que hoy
  vienen embebidos en el archivo (marco SEP por RBD, ítems de gasto, ingreso real
  Preferente/Prioritario) — un `setDoc` por RBD. Esa migración está en una función claramente
  marcada como "EJECUTAR UNA SOLA VEZ" dentro de `index.html`; una vez confirmada la carga de
  los 52 RBD en Firebase Console, ese bloque puede eliminarse del código con seguridad. Está
  protegido para no pisar datos: **solo se dispara con un snapshot vacío confirmado por el
  servidor** (`fromCache = false`); un snapshot vacío que viene del caché local (navegador sin caché
  o sin conexión) **no escribe nada**. Ni la siembra ni la creación de RBD que faltan envían mapas
  vacíos (`{}`): con `merge:true` el SDK los usaría para reemplazar lo que ya existe en el servidor.
  Un RBD que falta se crea solo con `{rbd, nombre, lastModifiedBy, lastModifiedAt}`, y únicamente
  con un snapshot de servidor.

### Estado de sincronización y fallos de escritura

El indicador bajo el título (y, cuando hay un problema, una réplica dentro del modal abierto, que es
donde se edita) refleja la verdad, usando `snapshot.metadata.hasPendingWrites` / `fromCache`
(el listener usa `includeMetadataChanges`) y el resultado de cada guardado:

| Color | Texto | Cuándo |
|---|---|---|
| Verde | `Sincronizado · última edición por …` | el servidor confirmó todo y hay conexión |
| Amarillo | `Guardando…` | hay escrituras sin confirmar, o se está reintentando tras un error transitorio |
| Amarillo | `Sin conexión: los cambios se guardan en este navegador y se enviarán al reconectar` | el snapshot viene del caché (`fromCache`) o el navegador no tiene red; lo editado se envía al reconectar |
| Rojo (persistente) | `N cambios sin guardar — <motivo>` + **Reintentar** | error **permanente** del servidor |

- **Errores transitorios** (`unavailable`, `deadline-exceeded`, `resource-exhausted`, `aborted`): se
  reintenta solo con espera creciente (2, 4, 8, 16 y 30 s como tope) y el estado queda amarillo.
- **Errores permanentes** (`permission-denied`, `unauthenticated`, `invalid-argument`,
  `failed-precondition` y cualquier error desconocido): **no** se reintenta en bucle. El indicador queda
  rojo con un mensaje claro (p. ej. "No tienes permiso para guardar estos cambios…"), el cambio se
  conserva en memoria y **se sigue viendo en pantalla**, y el botón *Reintentar* lo reenvía (también lo
  reenvía cualquier edición posterior del mismo RBD).
- Un evento del listener que solo cambia metadatos (p. ej. `fromCache` pasa a `false`) actualiza el
  indicador **sin repintar** y, si el servidor ya confirmó, crea los RBD que falten (antes eso solo
  ocurría si llegaba otro snapshot con cambios de documentos).
- **Aviso al cerrar o recargar** (`beforeunload`): solo si hay cambios que no están a salvo (sin
  enviar, a la espera de un reintento o rechazados por el servidor). Lo enviado y pendiente de
  confirmar sin conexión vive en la cola persistente de IndexedDB y no dispara el aviso (salvo que el
  navegador no haya podido activar esa persistencia). "Cerrar sesión" con cambios sin guardar también
  pide confirmación y, si se acepta, los descarta para que nunca se reenvíen bajo otra sesión.

### Robustez ante datos dañados y cierre de la pestaña

- **Documentos "envenenados".** Firestore no valida tipos: un valor nulo, de otro tipo o no numérico
  en un documento (editado a mano en la consola, un script, otro panel del mismo proyecto) no puede
  romper a los demás. Los montos se leen con una conversión tolerante (`num()`: números y textos
  numéricos valen su valor; `null`, `NaN`, `true`, `"abc"` valen 0), cada documento se procesa dentro
  de su propio `try/catch`, y si uno no se puede leer se omite, el indicador de sincronización queda
  en **rojo** nombrando el RBD, y nunca se recrea ni se pisa ese documento.
- **Ediciones pendientes al cerrar.** El guardado sigue siendo con ~400 ms de retraso tras dejar de
  escribir, pero al ocultarse o cerrarse la pestaña (`visibilitychange` oculto, `pagehide`) se envía
  de inmediato todo lo pendiente, para no perder la última edición al cerrar o recargar.

## Seguridad del texto libre y de los archivos exportados

- **Escape de HTML.** Todo texto que escribe una persona, que llega de Firestore o que viene de un
  Excel importado (descripción, nombre y RUT del proveedor, N° de documento, documento original,
  conceptos de B&S y de proyección, correo de quien editó…) se inserta con un único helper
  (`escHtml`, que escapa `&`, `<`, `>`, las comillas dobles y simples y el acento grave) en tablas, modales, Reportes, % Ejecución e impresión/PDF.
  Un `&` o un `<` se ven tal cual, una sola vez escapados, y nada se interpreta como HTML (se cierra
  el XSS almacenado). Los `id`/`data-*` construidos con texto libre usan un identificador seguro
  (`idSeguro`) y los selectores no concatenan texto.
- **Inyección de fórmulas en CSV/Excel.** En las columnas de **texto libre** (descripción, proveedor,
  concepto) un texto que empieza con `=`, `+`, `-`, `@` (o tabulador/CR) se exporta con un
  apóstrofo (`'`) delante para que Excel no lo evalúe como fórmula. Nunca se toca un monto, una fecha,
  un código, un RUT ni un N° de documento, y tampoco un texto que ya es un número (`-1500`). Al
  **importar** un Excel se quita ese único apóstrofo inicial, así que exportar y reimportar no altera
  los datos. Nota: en el CSV de SUPEREDUC ese apóstrofo solo aparecería en Descripción o Nombre del
  proveedor de una compra cuyo texto empieza con uno de esos caracteres (caso excepcional); está
  pendiente confirmar con SUPEREDUC que su plataforma lo acepta.

## Precisión de los datos

Este es un panel de apoyo a la gestión, no un reemplazo del proceso de aprobación presupuestaria
vigente. Los montos y proyecciones deben verificarse contra SIGFE/CasChile y la Liquidación Web
de Subvenciones antes de usarse para decisiones. Cualquier corrección se hace directo en las
celdas editables del panel.
