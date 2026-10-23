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
- La tabla mensual marca cada mes **Real / Proy. / Mixto** según el corte real de lo que se está viendo: el
  "Real hasta" de cada entidad en las fuentes y, en SEP, el corte de ingresos y el de remuneraciones de cada RBD
  (las compras siempre son reales; ver "Rótulo Real / Proy. / Mixto" más abajo); en el gráfico la línea sólida
  llega hasta el menor corte y el resto va punteado. Sin ingreso cargado se muestra "—" y un aviso, nunca NaN.
- Las partes mensuales (`partesMensualesOtraFuente` / `partesMensualesSep`) son las mismas que usa el
  dashboard, así que "Consolidado" cuadra con el panel principal.

**Rótulo Real / Proy. / Mixto (L-09).** En **todas** las vistas de % Ejecución (SEP, cada fuente y Consolidado) el rótulo y el estilo de cada
mes (columna "Corte" de la tabla, tooltip del gráfico, tramo punteado y línea "Corte") salen del **corte real efectivo** de lo que se ve, y
**nunca** del selector "Ver resumen acumulado hasta el mes" de la pestaña SEP (ese selector solo decide hasta qué mes se acumulan las casillas
"a <mes>"). Antes, en SEP, todo mes ≤ el selector salía "Real": con el valor por defecto (diciembre) los 12 meses se veían "Real" aunque el corte
real fuera julio o septiembre. Los cortes que se consideran: ingresos de cada RBD (corte propio `ingreso_real_hasta_mes` > mes de cierre global
> `DATA.n_meses`), remuneraciones (`rem.real_hasta_mes`; `DATA.n_meses` si falta) y, en las fuentes, el "Real hasta" de cada entidad; las compras
siempre son reales y la proyección de B&S siempre proyectada (no tienen corte). Convención cuando hay varios cortes (la misma de las fuentes, del
Consolidado y del Visualizador; función `tipoMesPorCortes`): **Real** si TODOS los cortes cubren el mes (mes ≤ el menor corte), **Proy.** si
NINGUNO (mes > el mayor) y **Mixto** entre medio — es decir, cuando la selección agrega RBD con cortes distintos, o cuando los ingresos y las
remuneraciones de un mismo RBD tienen cortes distintos (p. ej. ingresos hasta agosto y remuneraciones hasta julio: agosto sale "Mixto"). El
Reporte personalizado, que colorea celda por celda, deja sin color la que mezcla ambos tipos.

El **Panel principal** resume SEP + las 9 fuentes de un vistazo (todo en tiempo real, sin cargar nada aparte):

- **Chips Total (Real+Proy) / Real / Proyectado**: cambian todas las cifras y gráficos de la pantalla.
- **Franja consolidada**: Ingreso, Gasto Remuneraciones, Gasto Bienes y Servicios, Gasto Total, Saldo y
  entidades en déficit (suma de SEP y las 9 fuentes; siempre sobre el Total, ver "Estado de una entidad").
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
  hasta el corte de ingresos de cada RBD —ver "Corte de ingresos y mes de cierre" más abajo—, remuneraciones hasta
  el corte de cada RBD, compras siempre reales y proyección de B&S siempre proyectada). Es la serie del año completo: no depende del selector "Ver resumen hasta el mes" de SEP.
  Los tests verifican que su total cuadra con la franja consolidada en las 3 vistas.
- **Atención**: las 8 entidades **en Déficit** con el saldo más negativo (según la vista elegida) entre SEP y todas las
  fuentes; clic abre la pestaña y el detalle de esa entidad. Usa la misma noción de Déficit que el resto del panel (ver "Estado de una
  entidad"): en la vista Total son exactamente las entidades con Estado Déficit —las mismas que cuenta la franja— y, en JUNJI, las que lo están
  por el saldo de Operación para B&S llevan su causa; en las vistas Real y Proyectado, las de saldo negativo en esa vista (el Estado se
  calcula siempre sobre el Total).
- **Mes de cierre** (solo lectura): bajo el título hay una línea "📅 Mes de cierre: Septiembre · ⚠ N entidades con corte
  distinto al cierre global" con un enlace a la pestaña SEP, donde está el control (ver abajo).
- **🖨 Exportar PDF** del dashboard (mismo mecanismo de impresión del navegador; se ocultan la barra de
  pestañas y los controles).

Funciones: `computeTotalesSepParaDashboard()` (adaptador de SEP con la misma forma que
`computeTotalesOtraFuente`), `irAPestana(tabId)`, `renderDashboard()` y las de gráficos (`renderDashComparativo`,
`renderDashComposicion`, `renderDashMensual`, `renderDashAtencion`). Los gráficos usan la paleta del panel
(Ingreso azul `--series-1`, Gasto naranja `--series-2`, Bienes y Servicios violeta `#7c3aed`). El contraste de todo
el texto está verificado por `tests/specs/a11y_contraste.mjs`; la separación para daltonismo se revisó con el validador de paletas del skill
`dataviz` (esa revisión no se puede reproducir desde este repositorio).

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

**Signo de las notas de crédito y de débito.** SUPEREDUC espera la nota de **crédito en negativo**, así que el signo ya no
depende de lo que escriba la persona: una **nota de crédito** (`NOTACRE`) siempre tiene `montoGasto` y `montoDocumento`
**negativos** (−|monto|), una **nota de débito** (`NOTADEB`) siempre **positivos** (+|monto|) y cualquier otro tipo se deja
**como se digitó** (una factura en negativo sigue en negativo; no se inventan signos). Una nota de crédito cargada en
positivo ya no suma gasto: lo resta. La regla se aplica en todo el flujo con las mismas funciones (`signoDeTipoDocumento`,
`montoGastoCompra` / `montoDocumentoCompra`, `conSignoDeNota`):
- **Lectura de Firestore** (`sanitizaCompra`): el signo se normaliza **en memoria**, así que tabla, cálculos y exportaciones
  ven siempre el signo correcto aunque en Firestore haya una NC guardada en positivo. Leer **no escribe nada**: el valor
  guardado se corrige solo la próxima vez que se edite esa compra (✏️ → "💾 Guardar cambios") o se vuelva a importar.
- **Formulario** (SEP y las 4 fuentes con compras, al agregar, editar y duplicar): se guarda ya normalizado. Con el tipo
  "Nota de crédito" / "Nota de débito" el formulario muestra una ayuda ("Las notas de crédito se registran con monto negativo;
  se ajusta automáticamente").
- **Importar Excel** (hoja COMPRAS de SEP y de las fuentes): igual, fila por fila.
- **Cálculos y vistas**: `itemsFromCompras` (y por lo tanto el ítem/mes de cada RBD, Real/Proyectado, KPI, Visualizador, Reporte
  personalizado, Panel principal y % Ejecución) suma `montoGastoCompra(c)`; las tablas de compras, el CSV de SUPEREDUC y los
  Excel/PDF por fila muestran el valor normalizado. La comprobación "monto gasto mayor que el documento" del aviso previo al
  CSV sigue comparando en **valor absoluto**.

**Importar sin duplicar: ID vacío o "0".** En la hoja COMPRAS, una fila con un **ID real** actualiza esa compra. Un ID **vacío**
(la celda vacía llega como el número `0`), `0`, `"0"`, `"00"` (cualquier cantidad de ceros), `"undefined"`, `"null"`, `"NaN"`, `"#N/A"`, `"#REF!"`,
`"#VALUE!"`, uno o más guiones (`-`) o solo espacios **cuenta como sin ID**: antes cada importación inventaba un ID nuevo (reimportar el mismo archivo duplicaba todas las compras) o, con el texto
`"0"`, todas las filas de un RBD colapsaban en una sola compra con la clave `"0"`. Ahora la compra recibe una **clave determinista
según su contenido** (`imp-<hash de 53 bits>`), de modo que reimportar el mismo archivo da las mismas claves (también en otra
sesión o al otro día) y compras distintas nunca se pisan. La **composición** (`firmaContenidoCompra`): código de cuenta + tipo de
documento (por código SUPEREDUC) + N° de documento + fecha documento + fecha pago + monto gasto y monto documento (ya con el signo
por tipo y redondeados a pesos, como los exporta el Excel) + RUT normalizado + descripción + nombre del proveedor (sin mayúsculas ni
espacios repetidos). Se incluyen descripción y proveedor porque dos boletas sin N° ni RUT del mismo día y monto pero de cosas
distintas son compras distintas; **no** entran N° DC ni Documento Original (anotaciones que pueden completarse después sin que la
compra deje de ser la misma). Decisiones: (1) filas **idénticas** sin ID (en el mismo archivo, o iguales a una compra ya guardada con
cualquier ID real) se tratan como **una sola** compra: la fila actualiza esa compra en vez de crear otra; si difieren en algo de lo
anterior, son compras distintas; (2) una compra guardada bajo la clave `"0"` (rastro del bug antiguo) nunca se une a una fila sin
ID: la fila se une a su copia con ID real o recibe una clave `imp-…` — esa entrada no se toca (la limpia la herramienta admin
"Revisar duplicados (ID "0")", que no cambió); (3) si la clave `imp-…` la ocupa **otra** compra (colisión de hash, o una compra que
se editó después de importarla), la fila nueva usa `imp-…-2`, `-3`… y no pisa nada. Aplica al importador de SEP y al de las fuentes
con compras.

**Avisos de fecha y de gasto "sin contabilizar" (solo avisos: no cambian ningún total).** El mes de un gasto se cuenta por la
**Fecha Documento** (no por la Fecha Pago). `itemsFromCompras` solo mira el mes de esa fecha, así que:
- **Quedan EXCLUIDAS de todos los totales** (por ítem, por mes, Real/Proyectado, Visualizador, Reportes, Panel principal, % Ejecución):
  (1) una compra cuyo **código de cuenta no está en el catálogo** (SEP: cuentas Subt. 22/29 de SEP; fuentes: plan de cuentas 2026), y
  (2) una compra cuya **Fecha Documento no empieza con `aaaa-mm-dd`** (`10/03/2026`, `10-03-2026`, `2026-3-5`, `marzo`, vacía) **o cuyo mes
  no existe** (`2026-13-01`, `2026-00-10`).
- **SÍ entran**, por su mes y **sin mirar el año**: `2025-12-30` (se suma en diciembre), `2027-01-15` (en enero), un día que no existe
  (`2026-02-31`, `2026-04-99`) y cualquier texto detrás de la fecha (`2026-05-10T00:00:00`). La Fecha Pago nunca se usa. Una compra
  con cuenta no habilitada para la subvención (⚠ del plan de cuentas) también entra: solo se marca.
- **Formulario** (SEP y fuentes): validación en vivo de las fechas (formato; "la fecha está fuera de 2026" si el año ≠ 2026; fecha de
  pago anterior a la del documento). **No impide guardar**, solo avisa.
- **Tabla de compras** (SEP y fuentes, no en los PDF): insignia por fila con `title` explicativo — "⚠ fecha fuera de 2026" (fecha
  de documento o de pago de otro año), "⚠ fecha no válida: no se contabiliza" (formato no reconocido o mes inexistente), "⚠ fecha no válida"
  (día que no existe: sí se cuenta) y "⚠ cuenta no reconocida: no se contabiliza" — y un resumen sobre la tabla: "N compras con avisos;
  $X sin contabilizar" (X es el monto neto, con el signo por tipo, de las compras que quedaron fuera de los totales).
- **"Datos a revisar"** (SEP) suma los RBD con compras con avisos a los de siempre (gasto B&S > 3 × el marco = "posible error de
  imputación"); la tarjeta aclara cuántos RBD se agregaron por esta causa, la fila del RBD muestra la marca "revisar" (con su motivo en el
  `title`) y la columna "Alerta" del Excel/CSV de resumen dice "Revisar". Las fuentes no tienen un contador "Datos a revisar": ahí los
  avisos se ven en las filas y en el resumen del registro de compras.

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
la celda, vuelve al valor que estaba guardado. Un monto de valor absoluto igual o mayor a 10 billones (`1e13`) también se rechaza. Teclear letras no hace nada. Mientras la celda tiene el foco
se muestra exactamente lo que escribiste; al salir se normaliza (`1.500.000` → `1500000`).

**Lo que escribes no se altera por lo que hagan otras personas.** El panel recibe un cambio por cada
edición de cualquiera de las personas conectadas (hay 19 correos autorizados en `ALLOWED_EMAILS`; de cualquier RBD) y el eco de tu propio guardado.
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
hoja o pegar filas nuevas y volver a subirla con "⬆ Importar Excel": las filas con **ID vacío (o `0`)**
se cargan como compras nuevas —con una clave calculada según su contenido, así que volver a subir el
mismo archivo no las duplica (ver arriba "Importar sin duplicar")—, y las filas con un **ID ya existente**
(el que trae el propio Excel exportado) actualizan esa misma compra en vez de duplicarla — por eso
conviene exportar primero, editar sobre esa base y volver a importar, en vez de partir de un Excel armado
desde cero. Las notas de crédito/débito se normalizan al importar (NC en negativo, ND en positivo). Las
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
SUBT22/SUBT29, esos gastos se cargan como compras; el Excel que se exporta todavía trae esas dos hojas, derivadas de las compras y solo de
consulta, y el importador las ignora).

El botón "⬇ Excel" descarga la carga completa (hojas `INGRESO`, `REMUNERACIONES`, `SUBT22` y `SUBT29` —estas dos solo de consulta—, `COMPRAS` y
`BYS_PROYECCION`) lista para reimportar; es distinto del botón "⬇ Excel (resumen general)", que descarga en una sola hoja el
mismo resumen que se ve en pantalla y que trae "🖨 Exportar PDF (general)" (Ingreso SEP, gastos,
% de ejecución, saldos, Estado) para todos los RBD que cumplan el filtro/búsqueda actual.

### Real vs. proyectado

Cada tabla del detalle por RBD marca sus columnas de mes en verde ("Real") o naranja
("Proyectado"), con una regla distinta para cada una — no depende de un selector único:

- **Ingreso SEP**: enero-julio vienen de la Liquidación Web Subvenciones Mineduc;
  agosto-diciembre parten como una proyección editable (el promedio de esos 7 meses reales), que
  se puede corregir a mano en cualquier momento. Desde la auditoría L-01 ("Ingreso real de SEP clavado en julio;
  Saldo Real mezcla períodos") **el corte real/proyectado del ingreso ya no es fijo**: cada RBD tiene su propio
  selector **"Ingresos reales hasta: [mes]"**, arriba de la tabla de ingresos del detalle y con la misma apariencia que el
  de Remuneraciones (ver "Corte de ingresos y mes de cierre").
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

#### Corte de ingresos y mes de cierre

- **Corte propio de ingresos por RBD** (`ingreso_real_hasta_mes`, entero 1–12, campo raíz del documento del RBD,
  igual que `rem.real_hasta_mes`). El selector del detalle cambia el color y la etiqueta Real / Proy. de las columnas de
  la tabla de ingresos y **todas las cifras de ingreso Real / Proyectado de ese RBD**: tarjetas KPI y Saldo Real de SEP,
  tarjeta SEP, serie mensual y "Atención" del Panel principal, Visualizador, Reporte personalizado, % Ejecución
  consolidado y el PDF de la fila (que dice "Ingresos reales hasta: …"). Una nota junto al selector dice si el corte es
  propio, si sigue al mes de cierre o si es el valor por defecto. El ingreso anual (Real + Proyectado) no cambia: solo se
  reparte distinto.
- **Mes de cierre global** (documento `sep_carga_rbd/_meta`, campos `mes_cierre` 1–12, `mes_cierre_por` y `mes_cierre_en`
  con la hora del servidor): es el mes hasta el que los datos son reales en todo el panel (lo fija un administrador; p. ej. Septiembre, y
  pasa a Octubre cuando termina el pago de remuneraciones de octubre; el valor vigente está en Firestore, no en el código). Se guarda con `merge`, así que no pisa los
  `items_22` / `items_29` que ese documento traía; un `_meta` ausente, sin el campo o con un valor dañado (`"x"`, `0`,
  `13`, `null`, `7,5`…) equivale a "sin definir".
- **Corte efectivo del ingreso de un RBD** = su `ingreso_real_hasta_mes` si es válido → el mes de cierre global si está
  definido → `DATA.n_meses` (hoy 7 = julio, constante embebida en `index.html`). **Mientras no se defina nada, las cifras son exactamente las de antes.**
  Remuneraciones y las 9 fuentes mantienen su propio corte (por defecto `DATA.n_meses`): el mes de cierre solo mueve el
  default de los **ingresos de SEP** sin corte propio.
- **Control en la pestaña SEP** (arriba de las tarjetas KPI): "📅 Mes de cierre: Septiembre · fijado por … el …" (o "sin definir" mientras nadie lo fije). Solo quien
  está en `ADMIN_EMAILS` ve además el selector **"Cambiar a:"** y el botón **"Aplicar a todas las entidades"**; el resto
  lo ve como texto de solo lectura. Cambiar el selector guarda en `_meta` y **no toca ningún corte explícito** de una entidad.
- **"Aplicar a todas las entidades"** (solo admin, como "Migrar DC"): pide confirmación mostrando cuántas entidades
  cambian y por origen (SEP — Ingresos, SEP — Remuneraciones y cada fuente) y fija el mes de cierre en todas: `ingreso_real_hasta_mes`
  y `rem.real_hasta_mes` de SEP y `otras_fuentes.{fuente}.real_hasta_mes` de las 9 fuentes (cada entidad en las fuentes de su
  universo: RBD + AC; GESPARVU en JUNJI y Aporte JUNJI). Solo escribe lo que cambia (un ingreso sin corte propio ya sigue
  al cierre, así que no recibe campo), un `set` con `merge:true` por documento, en `writeBatch` de a lo más 400 operaciones
  (cada documento cuenta 2: el `set` y el `serverTimestamp` de la auditoría; hasta 200 documentos por lote); la pantalla se
  actualiza al instante; repetirlo no escribe nada; si un lote falla, se avisa y repetir solo reintenta lo que falta.
- **Aviso "N entidades con corte distinto al cierre global"** (visible para todos, bajo el control y en el Panel principal): cuenta los
  ingresos y remuneraciones de SEP y el "Real hasta" de cada fuente cuyo corte efectivo ≠ mes de cierre; es un desplegable con
  la lista (entidad, fuente, corte actual) y un enlace "Abrir detalle" a cada una; solo cuenta cuando hay mes de cierre
  definido y desaparece cuando todo coincide. N cuenta pares entidad × origen (un RBD con su ingreso y su remuneración distintos
  cuenta 2).
- **⚠ Riesgo residual — la restricción a administradores es solo del cliente.** `firestore.rules` (compartido con otras dos
  aplicaciones, no se modifica en esta PR) solo comprueba que el correo esté en la lista autorizada: no distingue administradores.
  Cualquier correo autorizado que use otro cliente (consola, script) podría escribir `_meta.mes_cierre` o los cortes. Es la misma
  situación que ya tenían "Revisar duplicados" y "Migrar DC". Decisión abierta: si se quiere una restricción real hay que
  añadir una regla específica para `sep_carga_rbd/_meta` (p. ej. con una lista de administradores en las reglas) o un
  backend. El spec `10_mes_cierre` del arnés contra el SDK real lo deja demostrado.
- **Excel de respaldo de SEP**: no cambia. Sus hojas nunca llevaron los cortes (ni `rem.real_hasta_mes`: al importar se conserva el
  que ya había), así que tampoco llevan `ingreso_real_hasta_mes`; los archivos antiguos se importan igual. El respaldo JSON sí
  trae `ingreso_items_por_rbd.{rbd}.real_hasta_mes` en los RBD que tienen corte propio. Las hojas `META` de las fuentes
  (`RealHastaMes`) siguen igual.

El selector "Ver resumen (KPI y % Ejecución) acumulado hasta el mes:" de arriba de la tabla
principal es un control aparte: solo dice hasta qué mes se suman los montos en las tarjetas KPI (y en la tarjeta SEP del Panel
principal) y en las casillas "a <mes>" de "% Ejecución" de SEP — no tiene ningún efecto sobre el real/proyectado del detalle por
RBD ni sobre cómo se rotula cada mes de "% Ejecución" (Real / Proy. / Mixto sale de los cortes reales; ver "Rótulo Real / Proy. / Mixto").

Ese mismo desglose real/proyectado se repite arriba de la tabla principal, en tres filas de
tarjetas KPI (sumando los 55 RBD de la tabla: 52 con marco SEP y 3 sin marco): **"Real (ejecutado)"** (borde verde — Ingreso SEP, Carrera
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
- **Real / proyectado por celda**: en SEP, las mismas reglas de siempre (Ingresos según el corte de
  ingresos de cada RBD y Remuneraciones según su corte propio, compras siempre reales, proyección
  siempre proyectada). En las fuentes,
  Ingreso / Remuneraciones / B&S por concepto: real hasta el "Real hasta" de ESA entidad en ESA
  fuente (por defecto `DATA.n_meses`, editable en cada pestaña y fijable en todas con el mes de cierre); B&S por código (compras):
  siempre real; proyección de B&S: siempre proyectada. "B&S total" suma ambos tipos: si en un mes
  hay monto real y proyectado, la celda es **mixta** y queda sin color (si el mes está en $0 rige
  el corte).
- **Subtotales**: en SEP, la fila "Subtotal" de Remuneraciones nunca se colorea (mezclaría cortes
  distintos) y la de Ingresos solo se colorea en los meses en que todos los RBD coinciden. En las fuentes se colorea solo si **todas** las entidades del subtotal coinciden en
  real/proyectado ese mes; si no, queda sin color. Los conceptos dinámicos se reconstruyen al volver
  a la pestaña Reportes.
- CSV, Excel y PDF incluyen las filas de las fuentes (columna RBD con el código de la entidad: AC o
  el código del GESPARVU); archivos `reporte_personalizado_AAAA-MM-DD.*`.

Este coloreado es independiente del selector "Ver resumen
acumulado hasta el mes" de la pestaña SEP, que solo afecta a las tarjetas KPI (y a las casillas "a <mes>" de % Ejecución).

### Pestaña "Otras Fuentes"

Primer paso de una ampliación mayor: hacer el seguimiento de fuentes de financiamiento distintas
de SEP. Hoy son 9: Subvención General, PIE, Subvención de Mantención, Subvención Pro-Retención,
JUNJI, FAEP, FIGA, Aporte Fiscal Extraordinario Educación y Aporte Fiscal Extraordinario JUNJI
(estos dos últimos van como fuentes separadas a pedido del usuario). A diferencia de SEP, estas fuentes **no tienen marco anual ni meta 70/30** —
el seguimiento es simplemente Ingreso vs. Gasto por fuente, con un Estado de solo dos valores
(Superávit/Déficit; ver "Estado de una entidad").

- Cada fuente es su propia pestaña de primer nivel (entre SEP y % Ejecución/Reportes, ver
  "Estructura de pestañas") — sin selector desplegable intermedio, se presiona directo.
- Las fuentes con universo `rbd_ac` incluyen una fila fija adicional, **"AC" (Administración Central)**, para gasto a
  nivel del sostenedor que no corresponde a un establecimiento puntual — no participa de SEP (no está en la tabla ni en los totales
  de SEP), pero sí cuenta en cada una de esas fuentes: en sus tarjetas del Panel principal ("N de 56 entidades"), en % Ejecución y en Reportes.
  Las fuentes con universo `gesparvu` (JUNJI y Aporte JUNJI) no tienen fila AC.
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
muestra un "Saldo Operación disponible para B&S" (Operación − gasto de B&S; no bloquea la carga si se excede) y **ese saldo entra al Estado**: una
entidad de JUNJI está en Déficit si su saldo total es negativo **o** si su saldo de Operación para B&S es negativo (B&S no puede pagarse con
fondos solo-remuneraciones). La fila, el modal, "Atención" y el tooltip dicen la causa (ver "Estado de una entidad").

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
  por defecto `DATA.n_meses`, el último mes con datos reales de Mineduc; el botón "Aplicar a todas las entidades" del mes
  de cierre de SEP también lo fija en todas). Los meses hasta el corte son **Real** y los
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

### Estado de una entidad: una sola regla (L-07 / L-08)

Una única función, `estadoDeEntidad(recurso, gasto, conRiesgo)`, decide el Estado de **SEP y de las 9 fuentes** (antes SEP lo decidía con el % ya
redondeado a 1 decimal y las fuentes con el signo del saldo, así que un mismo caso salía distinto). Trabaja con montos en pesos enteros y **sin
redondear ningún porcentaje**: los % que se muestran siguen redondeados a 1 decimal, pero no deciden nada.

| Estado | Regla | Dónde existe |
|---|---|---|
| **Déficit** | el saldo es negativo (gasto total > recurso total). Un saldo de exactamente $0 **no** es déficit; recurso $0 con gasto > $0 sí | SEP y las 9 fuentes |
| **Riesgo** | no es déficit y gasto / recurso ≥ 90 % **exacto** (se compara `gasto × 10 ≥ recurso × 9`, sin punto flotante); sin recurso no hay cociente | solo SEP |
| **Superávit** | todo lo demás (también recurso $0 sin gasto) | SEP y las 9 fuentes |

- **SEP**: recurso = Ingreso SEP (Preferente + Prioritario) + Carrera Docente; gasto = remuneraciones + Bienes y Servicios (compras + proyección), año completo
  (Real + Proy). Un 99,996 % se muestra "100,0 %" pero es **Riesgo** (no Déficit); un 89,999 % se muestra "90,0 %" y es **Superávit**; un 100 % exacto (saldo $0)
  es **Riesgo**; saldo -$1 es **Déficit**. Un RBD sin marco SEP con gasto SEP tiene recurso $0, así que su Estado es Déficit (la etiqueta sigue diciendo
  "⚠ Sin marco SEP") y cuenta como tal en el filtro, la tarjeta "RBD en déficit" ("de 53 (52 con marco SEP activo + 1 sin marco con gasto SEP)") y el Panel principal.
- **Fuentes**: solo Superávit / Déficit, siempre sobre el Total (Real + Proy). Saldo $0 → Superávit; ingreso $0 con gasto → Déficit.
- **JUNJI (L-08)**: `incomeShape:'junji3'` tiene 3 líneas de ingreso. Operación puede financiar Bienes y Servicios y Remuneraciones; Homologación y Carrera
  Docente financian **solo** Remuneraciones (decisión de negocio). Por eso JUNJI es Déficit si el saldo total < 0 **o** si `saldo_operacion_bys` =
  Operación − gasto de B&S < 0, y la fila (aviso visible + tooltip), el subtítulo del modal, "Atención" y el PDF de la entidad dicen cuál es la causa (saldo total,
  saldo de Operación para B&S, o ambas). La regla vive en `causasDeficitOtraFuente` y está atada a `incomeShape:'junji3'`, así que cualquier fuente futura
  con líneas restringidas la hereda; hoy **ninguna otra fuente** tiene líneas de ingreso restringidas (las otras 8 son `single`).
- **Todo lugar que cuenta o lista "entidades en déficit" lee el mismo Estado**: tarjetas KPI de SEP y de cada fuente, tarjetas por fuente y franja del Panel principal,
  la lista "Atención" (vista Total), el filtro por Estado de la tabla SEP, el CSV y el Excel de resumen, el PDF general y los PDF por fila, y el CSV de detalle de las fuentes
  ("Estado (Total)"). Lo derivado (Estado, causa, saldo de Operación) nunca se guarda en Firestore. El spec `estado_unico` lo comprueba contra un cálculo independiente.
- Fuera de alcance (hallazgo L-17, sin cambios): en SEP la Carrera Docente también es de uso exclusivo en remuneraciones, pero hoy solo se suma a la meta de
  remuneraciones y el Estado usa el saldo total; no existe un equivalente al "saldo de Operación para B&S".

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
  futuras y Bienes y Servicios Proyección) se cumplen tal cual. El Estado de cada RBD se lee con
  estas dos columnas (Déficit = Saldo Final negativo; Riesgo = % Ejec. Total de 90 % o más sin ser déficit; el resto, Superávit), pero se decide con el
  saldo y el cociente **exactos**, no con el % redondeado que se ve (ver "Estado de una entidad") — ambas se destacan aparte de las demás para que quede
  claro de un vistazo por qué un RBD quedó en ese estado.

## Alerta: establecimientos sin marco SEP con gasto SEP

Tres establecimientos no tienen marco SEP asignado (Preferente/Prioritario/Carrera Docente =
$0), pero de todas formas pueden registrar gasto SEP por error de imputación:

- RBD 1120 — Centro de Educación de Adultos La Ligua
- RBD 11196 — Ctro.Rec.Atenc.Divers.CRAD Paul Percy Harris
- RBD 1126 — Escuela Especial Sol Naciente

Se incluyen en el panel igual que cualquier otro RBD (mismas tablas editables, mismo
exportar/importar Excel), pero si alguna vez registran gasto en remuneraciones, Subt. 22/29 o
Carrera Docente, el panel los marca con una alerta crítica bien visible: fila resaltada en rojo,
tag "⚠ GASTO SEP INDEBIDO" junto al nombre, la etiqueta de "Estado" pasa a "⚠ Sin marco SEP" (su Estado real es Déficit: recurso $0 y gasto > 0), un banner rojo en
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
                       y fixtures sintéticos (default, cierre, compras, estado). Ver tests/README.md.
                       Se corre con `node tests/run.mjs` (≈ 12 min la suite completa).
tests/e2e-real/       Arnés opcional contra el SDK real de Firestore y su emulador (ver tests/e2e-real/README.md).
*.pdf (raíz)          Manuales oficiales de SUPEREDUC 2026 de referencia (Manual de Cuentas y capítulos del Manual de
                       Usuario de Rendición de Cuentas); el panel no los lee.
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

- **Modelo de datos**: un documento por entidad en `sep_carga_rbd/{id}` —cada RBD de `DATA.registros` (55), `AC` (Administración Central) y cada GESPARVU
  (13)— con los campos `rbd`, `nombre`, `ingreso_items` (Preferente / Prioritario / Carrera Docente, cada uno `{item, meses, total}`),
  `ingreso_real_hasta_mes` (corte propio de ingresos, opcional), `rem` (`meses`, `total`, `real_hasta_mes`), `bys_proyeccion.items.{código}`
  (proyección de B&S por cuenta), `compras.{id}` (Subt. 22/29 de SEP), `otras_fuentes.{fuente}` (las 9 fuentes: ingreso/s, `gasto_rem`, `compras` o `bys_items`,
  `bys_proy_items`, `real_hasta_mes`), `lastModifiedBy` y `lastModifiedAt`. El antiguo `agregado.items` ya no se guarda (el B&S por ítem y mes se deriva de
  las compras); los totales nunca se leen de Firestore, siempre se recalculan. Más un documento `sep_carga_rbd/_meta`
  con la lista compartida de conceptos de gasto (`items_22`, `items_29`, que el panel ignora) y el **mes de cierre global**
  (`mes_cierre`, `mes_cierre_por`, `mes_cierre_en`; ver "Corte de ingresos y mes de cierre"). `_meta` solo se escribe con `merge`
  y únicamente cuando un administrador mueve el mes de cierre; la siembra inicial y la creación de RBD que faltan nunca lo tocan.
- **Reglas de seguridad**: ver [`firestore.rules`](./firestore.rules) — debe pegarse
  manualmente en Firebase Console → Firestore Database → Reglas → Publicar (esto no se puede
  automatizar desde el repositorio). Solo los correos de la whitelist (la lista de `isAllowed()`, igual a `ALLOWED_EMAILS`) pueden leer/escribir, y
  ningún RBD puede borrarse desde el cliente.
- **Migración inicial (una sola vez)**: la primera vez que alguien entra al panel con la
  colección `sep_carga_rbd` vacía, el propio `index.html` sube automáticamente los datos que hoy
  vienen embebidos en el archivo (el ingreso real Preferente/Prioritario de cada RBD, con su proyección de agosto a diciembre = promedio de los meses reales, Carrera
  Docente en $0 y las remuneraciones en $0 con su `real_hasta_mes`) — un `batch.set` con `merge:true` por cada RBD de `DATA.registros`, todos en un solo `writeBatch`. Esa migración está en una función claramente
  marcada como "EJECUTAR UNA SOLA VEZ" dentro de `index.html`; una vez confirmada la carga de
  los 55 RBD (52 con marco y 3 sin marco) en Firebase Console, ese bloque puede eliminarse del código con seguridad. Está
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
| Amarillo | `Sin conexión con el servidor — esperando datos (no se escribió nada)` | el primer snapshot vino vacío del caché y el servidor todavía no confirmó qué hay: no se siembra ni se crea nada |
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
