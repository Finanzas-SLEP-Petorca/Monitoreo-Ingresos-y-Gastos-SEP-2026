# Plan de Cuentas 2026 (SUPEREDUC): extracción y verificación

Fuente: *Manual de Cuentas para la Rendición de Recursos Destinados a Educación 2026* (SUPEREDUC),
sección 11 «Plan de Cuentas Rendición Recursos 2026», págs. 112-119 del PDF
(`Manual-de-Cuentas-2026_baja (5).pdf`, en la raíz del repo).

La tabla del manual es una **imagen**, no texto: no se puede copiar/pegar. La matriz se extrajo con
`scripts/extract_plan_cuentas.py` y se verificó como se describe abajo. El resultado
(`data/plan_cuentas_2026.json`) es un dato de referencia normativo, sin cifras por RBD, por eso tiene
una excepción puntual en `.gitignore` (`!data/plan_cuentas_2026.json`; el resto de los `*.json` sigue
ignorado). Lo que viaja con el dashboard es el bloque `PLAN_CUENTAS_2026` de `index.html`, que el
mismo script reescribe con `--inyectar index.html`.

## Cómo se extrajo

1. Cada página se renderiza a 300 dpi y la grilla se detecta con numpy (líneas verticales/horizontales).
   Resultado: 278 filas de tabla = **239 cuentas + 37 categorías + 2 bandas de título**
   (300000 INGRESOS en la pág. 112 y 400000 GASTOS en la pág. 116).
2. **Código, nombre y dependencia**: OCR (RapidOCR) sobre la columna completa a 2x, alineado con las
   filas por su coordenada Y. Un OCR celda a celda dio basura; por columna entera los códigos
   salieron correctos salvo 2 (900000/900001 en la pág. 114), que se releyeron celda a celda con
   margen y 3x.
3. **✓ y ● no se leen con OCR**: se deciden por análisis de píxeles de cada celda (tinta oscura =
   ✓, píxeles rojos = ●). Umbrales calibrados con la brecha real entre clases (✓ 77-115 px de tinta;
   ● ≥ 90 px rojos; el ruido JPEG queda en < 20).
4. Los **nombres** se corrigen (tildes, ñ) con el texto extraíble de las secciones 9 y 10 del mismo
   manual cuando coinciden ≥ 85 %; la tabla va en mayúsculas, así que todo se normaliza a mayúsculas.
5. `validar()` exige: códigos únicos de 6 dígitos, cada cuenta dentro de su categoría y códigos
   crecientes dentro de cada categoría. Resultado: **0 errores, 0 filas marcadas para revisión,
   0 códigos corregidos por conjetura**.

## Conteo por columna

Cuentas habilitadas (✓, que incluye las ●) por columna del manual:

| Columna del manual | Ingresos (3xxxxx/8/9) | Gastos (41xxxx/7) | de ellas con ● (gastos) |
|---|---:|---:|---:|
| Subv. General | 94 | 129 | 0 |
| Adm. Central Subv. Gral. | 62 | 83 | 0 |
| SEP | 30 | 71 | 33 |
| Adm. Central SEP | 24 | 40 | 18 |
| PIE | 30 | 46 | 24 |
| Mantenimiento | 27 | 28 | 0 |
| Pro-Retención | 28 | 37 | 6 |
| Internado | 29 | 72 | 0 |
| Refuerzo Educativo | 28 | 29 | 0 |

(106 cuentas de ingreso + 133 de gasto = 239.) En el rango de gastos que sí pasa por el libro de
compras (410500-411899) quedan habilitadas: General 77, PIE 28 (24 con ●), Mantención 28,
Pro-Retención 23 (6 con ●), SEP 52 (32 con ●).

El ● **siempre va junto a un ✓** (0 celdas con ● sin ✓): significa «habilitada, sujeta a exigencias de
pertinencia» (leyenda de la pág. 112), no «no habilitada».

## Verificación

**1. Oráculo SEP.** El dashboard ya trae un catálogo de gastos SEP hecho a mano contra el manual
(`CUENTAS_SEP_22` + `CUENTAS_SEP_29`, 51 códigos). Contra la columna SEP de la matriz extraída:

- Los **51 códigos del catálogo están habilitados en SEP en la matriz** (0 faltantes).
- La matriz habilita 52 códigos SEP en el rango 410500-699999: el extra es **410917 DEVOLUCIONES DE
  FONDOS PÚBLICOS** (✓ en General, Adm. Central General, SEP, PIE, Mantención, Pro-Retención,
  Internado y Refuerzo). Se comprobó contra la imagen (pág. 118): el ✓ está. Es una discrepancia del
  catálogo SEP existente, **no se modificó** (queda como hallazgo; el catálogo SEP sigue igual).

**2. Coherencia Adm. Central vs. columna base.** En el manual las columnas «Adm. Central» son un
subconjunto de su columna base salvo estas excepciones, todas confirmadas contra la imagen:

| Cuenta | Hallazgo |
|---|---|
| 310712 INGRESOS POR PLANES DE SUPERACIÓN PROFESIONAL | ✓ solo en Adm. Central General |
| 800001 INGRESOS POR RECURSOS CENTRALIZADOS | ✓ solo en Adm. Central General y Adm. Central SEP |
| 411402 ARRIENDO DE OFICINAS Y/O DEPENDENCIAS DE ADMINISTRACIÓN | ✓ Adm. Central General; ● Adm. Central SEP; sin ✓ en General ni SEP |
| 410902 MATERIALES DE OFICINA | ● Adm. Central SEP sin ✓ en SEP |
| 411103 CONTRATACIÓN OTROS SERVICIOS EXTERNOS | ● Adm. Central SEP sin ✓ en SEP |
| 411804 ADQUISICIÓN DE OTROS BIENES MUEBLES NO PEDAGÓGICOS | ● Adm. Central SEP sin ✓ en SEP |

Son cuentas de administración (oficinas, materiales de oficina, recursos centralizados): coherente
con que las pueda usar la Administración Central sin que las use el establecimiento.

**3. Verificación visual.** Se generaron imágenes de control con los ✓ (verde) y ● (rojo) detectados
dibujados sobre cada página y se compararon a ojo contra la matriz extraída:

- Pág. 112, 113, 114, 115, 116 y 119: **todas las filas** (≈ 163 cuentas) cotejadas columna por
  columna; **0 diferencias**.
- Págs. 117 y 118: se revisó la página completa en imagen y **30 filas aleatorias** (semilla 7,
  repartidas en todas las páginas) más las filas de excepciones Adm. Central y 410917, que
  coinciden con la imagen; **0 diferencias**.

**4. Nombres.** 26 nombres del texto del manual venían en minúsculas mixtas; se normalizaron a
mayúsculas como en la tabla. Los nombres del catálogo SEP existente (sin tildes) no se tocan: en las
pestañas de SEP sigue valiendo ese catálogo.

## Supuestos (no están en el manual)

- **Subtítulo 22/29** de cada cuenta de compras: el manual no lo indica en esta tabla. Se mantiene el
  del catálogo SEP para los 51 códigos que ya existen y se infiere para el resto por categoría:
  4107xx (equipamiento) y 4118xx (adquisición de bienes muebles e inmuebles) = Subt. 29; el resto =
  Subt. 22. Afecta a 411801, 411803 y 411804 (→ 29) y a las cuentas nuevas de 4108xx-4117xx (→ 22).
- **Fila «AC» (Administración Central)** de las fuentes con compras: la matriz solo tiene columna
  Adm. Central para Subv. General y SEP. Para **Subv. General** la fila AC usa «Adm. Central Subv.
  Gral.». Para **PIE, Mantención y Pro-Retención** no existe columna propia de AC en el manual; la
  fila AC usa la misma columna de la fuente (PIE, Mantenimiento, Pro-Retención). Es una decisión de
  producto, no del manual.
- Las columnas **Internado** y **Refuerzo Educativo** quedan extraídas pero el dashboard no tiene
  esas fuentes todavía.
