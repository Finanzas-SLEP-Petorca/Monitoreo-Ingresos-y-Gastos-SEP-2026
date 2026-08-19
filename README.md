# Monitoreo Ingresos y Gastos SEP 2026 — SLEP Petorca

Panel de seguimiento de la Subvención Escolar Preferencial (SEP) por establecimiento (RBD),
para el Servicio Local de Educación Pública (SLEP) Petorca. Compara el ingreso SEP de cada
colegio contra el gasto real en remuneraciones (Subtítulo 21) y en bienes y servicios
(Subtítulos 22 y 29), aplicando la regla de que el 70% del ingreso SEP debe destinarse a
remuneraciones y el 30% a bienes y servicios, e identifica déficit o superávit por
establecimiento.

## Cómo usarlo

Abre [`dashboard_sep.html`](./dashboard_sep.html) directamente en el navegador (no requiere
servidor ni conexión a internet: toda la librería de Excel usada para exportar/importar viene
incluida en el archivo). También puede publicarse como página estática, por ejemplo con GitHub
Pages apuntando a este archivo.

Los datos que trae el archivo son un snapshot al momento de la última carga — no se actualizan
solos. Las 4 tablas de detalle (Ingreso SEP, Remuneraciones, Subt. 22 y Subt. 29) son editables
directo en el navegador, mes a mes, para corregir o completar información. Los cambios quedan
solo en esa sesión del navegador; usa el botón "⬇ Descargar carga (JSON)" para guardar lo
editado, o "⬇ Excel" / "⬆ Importar Excel" para llevar y traer los datos en formato planilla.

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

## Estructura del repositorio

```
dashboard_sep.html   Panel autocontenido (HTML + CSS + JS), listo para publicar o abrir local.
scripts/             Pipeline en Python usado para armar los datos que alimentan el panel
                      a partir de los Excel de origen (Estado_RBD_2026.xlsx, remuneraciones
                      SIGFE/CasChile, Liquidación Web Subvenciones, Carrera Docente/CPEIP).
```

Los scripts de `scripts/` esperan los Excel de origen en una carpeta `CARGA/` local (no
incluida en este repositorio: son datos internos de SLEP Petorca). No se publican Excel, CSV
ni JSON con cifras reales por establecimiento — solo el código y el dashboard ya armado.

## Precisión de los datos

Este es un panel de apoyo a la gestión, no un reemplazo del proceso de aprobación presupuestaria
vigente. Los montos y proyecciones deben verificarse contra SIGFE/CasChile y la Liquidación Web
de Subvenciones antes de usarse para decisiones. Cualquier corrección se hace directo en las
celdas editables del panel.
