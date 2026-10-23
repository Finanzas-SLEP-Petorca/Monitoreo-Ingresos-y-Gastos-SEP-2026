# Cuentas que aceptan Honorarios (Plan de Cuentas 2026): extracción y verificación

Fuente: *Manual de Cuentas para la Rendición de Recursos Destinados a Educación 2026* (SUPEREDUC,
`Manual-de-Cuentas-2026_baja (5).pdf`, en la raíz del repo) y *Manual de Usuario del Sistema de Rendición de Cuentas 2026,
Capítulo IV — Libro de Honorarios* (misma carpeta). El resultado es `data/honorarios_cuentas_2026.json`, un dato de referencia
normativo sin cifras por RBD (por eso tiene una excepción puntual en `.gitignore`, como `plan_cuentas_2026.json`). Lo que viaja con el
dashboard es el bloque `HONORARIOS_CUENTAS_2026` de `index.html` (entre las marcas `honorarios-cuentas-2026:begin/end`), que el mismo script
reescribe con `--inyectar index.html`.

## Qué es una «cuenta de honorarios»

El manual **no tiene una cuenta «Honorarios»**: cada cuenta de gasto declara, en el recuadro **«Documentos Habilitados»** de su descripción
(secciones 9 y 10, págs. 46-111), qué tipos de documento acepta y en qué **Libro de Rendición** va («Compras y Otros Gastos»,
«Honorarios» —solo 410803— o «Compras y Otros Gastos – Honorarios»). Los 5 tipos del Libro de Honorarios son **BOLH, BHE, BOLHE, BPST y BPSTE**
(Cap. IV, Tabla 02). El catálogo son las cuentas cuyo recuadro lista al menos uno de esos 5 tipos, con cuáles acepta cada una.
Qué subvención habilita cada cuenta **no se duplica**: sale de `PLAN_CUENTAS_2026` (`data/plan_cuentas_2026.json`, matriz de las págs. 112-119).

## Cómo se extrajo (`scripts/extract_honorarios_cuentas.py`)

1. `pdftotext -layout` (poppler) del PDF completo; se toman las págs. 46-111 (texto extraíble).
2. Se recorren los encabezados de cuenta (`4xx xxx NOMBRE`) que existen como cuentas de gasto en el plan y, de cada una, el recuadro
   «Subvención Habilitada / Libro de Rendición / Documentos Habilitados» (el recuadro puede ocupar dos líneas y la etiqueta puede estar en una o en dos).
3. Se queda con las que listan al menos uno de los 5 tipos y anota cuáles.
4. Cruza con el plan de cuentas (cada cuenta debe existir y estar habilitada en al menos una columna) y con la lista de 35 cuentas de la investigación previa
   (`docs/honorarios_spec.md`, sección 3). Todo lo que difiera se imprime y queda en `diferencias_con_el_spec` del JSON.
5. `--check` verifica, sin escribir, que el JSON y el bloque de `index.html` coinciden con lo que se extrae hoy (lo usa el spec `honorarios_cuentas` en su
   versión JS: compara el bloque de `index.html` con el JSON versionado).

```bash
python3 scripts/extract_honorarios_cuentas.py --inyectar index.html   # regenera data/honorarios_cuentas_2026.json y el bloque de index.html
python3 scripts/extract_honorarios_cuentas.py --inyectar index.html --check
```

## Resultado: 36 cuentas (35 de la investigación previa + 411404)

| Dato | Valor |
|---|---|
| Cuentas que aceptan al menos un documento de honorarios | **36** |
| De ellas con libro «Compras y Otros Gastos – Honorarios» | 35 |
| Con libro **solo «Honorarios»** | 1: **410803** TALLERES EXTRAPROGRAMÁTICOS |
| Que aceptan los 5 tipos | 410304, 410309, 410501-410503, 410607, 410802, 410803, 410804, 410903, 410910, 411103, 411701-411704 |
| Sin BHE (aceptan BOLH, BOLHE, BPST, BPSTE) | 18: 410608, 410901, 410904, 410908, 410918, 411101, 411102, 411404, 411601-411610 |
| Sin BOLHE | 410801 (acepta BOLH, BHE, BPST, BPSTE) |
| Solo BHE | **411801** ADQUISICIÓN DE BIENES INMUEBLES |

Habilitadas por columna del plan (✓, que incluye las ●): General 35 · Adm. Central General 26 · **SEP 27 (24 con ●)** · Adm. Central SEP 10 (9) · PIE 8 (5) ·
Mantenimiento 13 · Pro-Retención 12 (4) · Internado 26 · Refuerzo 4.

### La diferencia con el spec: 411404

La investigación previa listó 35 cuentas; el texto del manual da **36**. La que faltaba es **411404 MEJORAS ÚTILES Y NECESARIAS EN LOCAL ESCOLAR ARRENDADO**
(MC pág. 100-101): su recuadro dice «Libro de Rendición: Compras y Otros Gastos» (sin «– Honorarios») pero lista `BOLH – BOLE – BOLH- FAC – … – BOLHE – … – BPST – BPSTE`,
y la matriz de la pág. 124 (revisada en imagen) marca BOLH, BOLHE y BPST (la columna BPSTE queda cortada en la captura, el recuadro la lista). Es una incongruencia del manual
(el libro no menciona honorarios, los documentos sí); se **incluye** porque el manual la habilita para esos documentos, con su `observacion` en el JSON. Quitarla es borrar una fila
del JSON y reinyectar. Está habilitada para General, SEP y Mantenimiento (en SEP, con ●).

## Verificación contra la imagen de la matriz (sección 12, págs. 120-124)

La matriz cuenta × tipo de documento es una **imagen**; no se puede reextraer con texto. Se renderizó a 260 dpi y se leyó a ojo:

- **Pág. 123** (4108xx-4110xx): 410801 (BOLH, BHE, BPST; BOLHE sin ✓), 410802, 410803, 410804, 410901 (sin BHE), 410903, 410904 (sin BHE), 410908 (sin BHE), 410910 y 410918: coinciden con el recuadro.
- **Pág. 124** (4111xx-4118xx): 411101/411102 (BOLH, BOLHE, BPST, sin BHE), 411103 (los 5), **411404** (BOLH, BOLHE, BPST), 411601-411610 (BOLH, BOLHE, BPST; sin BHE), 4117xx (los 5) y
  **411801 solo BHE** (más ODE y BOLEX, que no son de honorarios): coinciden con el recuadro. Con esto queda **verificada la duda del spec sobre 411801**.
- Págs. 122-123 (410304, 410309, 410501-410503, 410607, 410608, 410801…) las verificó la investigación previa.

**No verificado:** no se reextrajo la matriz de las págs. 120-124 de forma automática (sin OCR); la lista por cuenta sale del texto del recuadro y se cotejó a ojo con la imagen de las páginas de arriba.
La columna BPSTE queda fuera del recorte de las capturas de algunas filas: se confía en el recuadro.

## Supuestos

- Todas las boletas del panel son **Subt. 21** (decisión del usuario), aunque la cuenta (410501, 4116xx…) sea de Subt. 22/29 en las compras: la cuenta solo dice «para qué» se contrató.
- La fila AC de SEP no existe en el panel; las columnas «Adm. Central» del plan quedan en el JSON (`subvenciones`) para cuando se extienda a las fuentes (PR-3).
- Los códigos y nombres cambian cada año: el catálogo está versionado como `…_2026` y se regenera con el script.
