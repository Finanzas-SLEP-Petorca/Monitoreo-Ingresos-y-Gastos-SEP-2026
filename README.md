# Monitoreo Ingresos y Gastos SEP 2026 — SLEP Petorca

Panel de seguimiento de la Subvención Escolar Preferencial (SEP) por establecimiento (RBD),
para el Servicio Local de Educación Pública (SLEP) Petorca. Compara el ingreso SEP de cada
colegio contra el gasto real en remuneraciones (Subtítulo 21) y en bienes y servicios
(Subtítulos 22 y 29), aplicando la regla de que el 70% del ingreso SEP debe destinarse a
remuneraciones y el 30% a bienes y servicios, e identifica déficit o superávit por
establecimiento.

## Cómo usarlo

Abre [`index.html`](./index.html) directamente en el navegador, o publícalo como página
estática (por ejemplo con GitHub Pages apuntando a este archivo). Necesita conexión a internet
para autenticarse y sincronizar (Firebase); la librería de Excel usada para exportar/importar
sigue viniendo incluida en el propio archivo.

### Acceso: correo institucional + enlace mágico

El panel es de acceso restringido. Al abrirlo, ingresa tu correo institucional
(`nombre.apellido@sleppetorca.gob.cl`) y presiona "Enviar enlace de acceso": llega un correo con
un enlace de acceso sin contraseña (*passwordless*) que expira en 1 hora. Al hacer clic en ese
enlace quedas autenticado en el panel. Solo los correos de la whitelist (constante
`ALLOWED_EMAILS` en `index.html`, la misma lista usada en Firestore Rules) pueden entrar — si tu
correo no está autorizado verás "Acceso denegado" y deberás pedirle a Wilson Rojas que lo agregue
en ambos lugares.

### Edición colaborativa en tiempo real

Las tablas de Ingreso SEP y Remuneraciones son editables directo en el navegador, mes a mes. Bienes
y Servicios (Subt. 22 y 29) se carga distinto: en vez de escribir un total mensual a mano, cada RBD
tiene un "Registro de compras" con los mismos campos que exige SUPEREDUC al cargar los gastos
(código de cuenta oficial, tipo y número de documento, fechas, proveedor, montos, documento
original) — el ítem y el mes se calculan solos a partir de esas compras, agrupadas por código de
cuenta y por el mes de la Fecha Documento. Cada compra ya cargada se puede editar (✏️, corrige sus
datos sin duplicarla), duplicar (⧉, precarga el formulario con los mismos datos para una compra
parecida) o eliminar (🗑). El botón "⬇ Compras SUPEREDUC (CSV)" descarga todas las
compras de todos los RBD ya en el formato exacto de la plantilla de SUPEREDUC; en la columna
"Acciones" de cada fila, el botón "⬇ CSV SEP" descarga ese mismo formato pero solo con las compras
de ese RBD — útil para cargar los gastos de un establecimiento a la vez en la plataforma de
SUPEREDUC, que exige subir por RBD.

A diferencia de una planilla o de una sesión de navegador aislada, cada cambio (edición de celda,
compra agregada o eliminada) se guarda solo (con un pequeño retraso de ~400ms tras dejar de
escribir, o al instante al agregar/eliminar una compra o salir de una celda) en una base de datos
compartida (Cloud Firestore) y se propaga en segundos a todas las personas que tengan el panel
abierto — sin recargar la página.

### Carga masiva de compras por Excel

Si tienes muchas compras para cargar de una sola vez, no hace falta escribirlas una por una en el
formulario: el botón "⬇ Excel" incluye una hoja **COMPRAS** (una fila por compra, con las mismas
columnas del formulario — RBD, Código, Tipo y N° de documento, Fecha Documento, Fecha Pago,
Descripción, Proveedor, Montos, Documento original — más una columna **ID**). Puedes editar esa
hoja o pegar filas nuevas y volver a subirla con "⬆ Importar Excel": las filas con **ID vacío** se
cargan como compras nuevas, y las filas con un **ID ya existente** (el que trae el propio Excel
exportado) actualizan esa misma compra en vez de duplicarla — por eso conviene exportar primero,
editar sobre esa base y volver a importar, en vez de partir de un Excel armado desde cero. Las
fechas se pueden escribir como texto (`2026-03-15`) o como fecha de Excel, ambas se reconocen al
importar.

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
  compras cargadas, existe la fila **"Bienes y Servicios (Proyección)"**, editable mes a mes,
  siempre naranja — se SUMA al total de compras reales de ese mes (nunca lo reemplaza), así que
  un mes puede tener compras reales y además una proyección de gasto adicional sin documentar
  todavía.

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

La tabla tiene dos grupos de columnas de porcentaje, con un fondo celeste que marca el segundo
grupo para diferenciarlos a simple vista:

- **% Ejec. Remuneraciones / % Ejec. B&S** (fondo blanco): gasto / **meta** del 70% o 30%
  respectivamente. 100% = gastó justo lo que la regla le permite. Pueden pasar de 100% (indican
  que ese RBD ya superó su tope) aunque el establecimiento gaste poco en términos absolutos, si
  su ingreso SEP también es bajo.
- **% Rem. / Ingreso, % B&S / Ingreso, % Total / Ingreso** (fondo celeste, columnas "sobre
  Ingreso Total"): gasto / **Ingreso Total** (SEP + Carrera Docente) — la fracción real del
  ingreso ya gastada, sin pasar por el filtro del 70/30. Por diseño, % Rem./Ingreso +
  % B&S/Ingreso = % Total/Ingreso. Son solo informativos: el estado (Déficit/En riesgo/Superávit)
  de cada RBD se sigue definiendo por el cumplimiento de la meta 70/30, no por estas columnas.

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
                       SIGFE/CasChile, Liquidación Web Subvenciones, Carrera Docente/CPEIP).
```

Los scripts de `scripts/` esperan los Excel de origen en una carpeta `CARGA/` local (no
incluida en este repositorio: son datos internos de SLEP Petorca). No se publican Excel, CSV
ni JSON con cifras reales por establecimiento — solo el código y el dashboard ya armado.

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
  automatizar desde el repositorio). Solo los 9 correos de la whitelist pueden leer/escribir, y
  ningún RBD puede borrarse desde el cliente.
- **Migración inicial (una sola vez)**: la primera vez que alguien entra al panel con la
  colección `sep_carga_rbd` vacía, el propio `index.html` sube automáticamente los datos que hoy
  vienen embebidos en el archivo (marco SEP por RBD, ítems de gasto, ingreso real
  Preferente/Prioritario) — un `setDoc` por RBD. Esa migración está en una función claramente
  marcada como "EJECUTAR UNA SOLA VEZ" dentro de `index.html`; una vez confirmada la carga de
  los 52 RBD en Firebase Console, ese bloque puede eliminarse del código con seguridad (aunque,
  al estar protegido por el chequeo de colección vacía, no vuelve a dispararse aunque se deje).

## Precisión de los datos

Este es un panel de apoyo a la gestión, no un reemplazo del proceso de aprobación presupuestaria
vigente. Los montos y proyecciones deben verificarse contra SIGFE/CasChile y la Liquidación Web
de Subvenciones antes de usarse para decisiones. Cualquier corrección se hace directo en las
celdas editables del panel.
