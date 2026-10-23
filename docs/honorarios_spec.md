# Especificación funcional: Libro de Honorarios en el panel

Estado: **PR-1 implementado (Honorarios en SEP: datos + modal + totales); PR-2 y PR-3 pendientes**. Análisis redactado el 2026-10-22
para el repo `Finanzas-SLEP-Petorca/Monitoreo-Ingresos-y-Gastos-SEP-2026` (panel de una sola página `index.html`); las decisiones del
usuario (22-23 oct) están abajo y **prevalecen sobre las recomendaciones por defecto** de las secciones 6 y 7, que se conservan como
registro del análisis.

**Pedido del usuario.** «Es necesario que debajo de Remuneraciones pueda tener la opción de Honorarios,
ya que corresponde a Subtítulo 21, pero no es Remuneración; además ve el manual, ya que el CSV de
Honorarios es diferente.»

**Decisiones ya tomadas por el usuario (incorporadas aquí):**

1. Los honorarios se registran **por boleta**, de forma parecida al «Registro de compras» (no como un
   total mensual agregado). Hay formulario/tabla por RBD, exportación/importación Excel de respaldo,
   columna de acciones XLS/CSV/PDF por fila y el **CSV del Libro de Honorarios exacto del manual**.
2. El usuario **no sabe** si los honorarios cuentan dentro del 70 % de personal de SEP. Se investiga a
   fondo en la sección 5; la decisión queda como pregunta abierta (P1) con recomendación por defecto.

## Decisiones del usuario (22-23 oct 2026; prevalecen sobre lo recomendado más abajo)

Estas diez decisiones cierran las preguntas de la sección 7 (cada una está marcada ahí como **RESUELTA**, salvo P3) y gobiernan la implementación:

1. **Por boleta.** Los honorarios se registran **una fila por boleta** (`honorarios: { <id>: {…} }` en el documento del RBD) más una **proyección mensual por cuenta**
   (`hon_proyeccion`), no como total mensual. Cada boleta se guarda y se mezcla **por su id** (`merge`), igual que las compras.
2. **Sin honorarios en Compras.** Los 5 tipos (BOLH, BHE, BOLHE, BPST, BPSTE) **se quitan** del selector «Tipo de documento» de Compras. **No hay botón de migración**:
   las compras antiguas con esos tipos las mueve el usuario a mano. El panel conserva el mapa nombre ↔ código para leerlas, las sigue sumando en Bienes y Servicios
   (cero cambio de cifras) y avisa «muévelo al registro de Honorarios» (tabla/resumen de compras y aviso previo al CSV de SUPEREDUC).
3. **Solo el bruto.** Monto Gasto = Monto Documento (salvo reparto); **sin retención ni líquido**.
4. **Mes = Fecha de Documento** (como Compras). La Fecha de Pago se exige y se valida (2026) pero no mueve el mes.
5. **70/30, «opción B».** **Todos** los honorarios cuentan del lado del personal (70 %) junto con Remuneraciones, aunque se muestran en su propia línea/tarjeta:
   `gasto_personal = gasto_rem + gasto_hon`; `saldo_rem = meta_rem_70 − gasto_personal`; `pct_ejec_rem = gasto_personal / meta_rem_70`;
   `gasto_total = rem + hon + bys`. Encabezados y leyendas: «% Ejec. Personal (Rem.+Hon.)». No se usan las 4 cuentas manuales de personal.
6. **Datos personales y límites.** RUT y nombre del prestador son visibles para los 19 correos autorizados. **No** hay indicador del tope de 50 % de contrataciones
   ni el tope de 10 % de Administración Central SEP; «AC SEP» no se crea.
7. **Todas las fuentes, pero en PR-3.** Honorarios irá en SEP, General, PIE, Mantención y Pro-Retención. PR-1 es **solo SEP**, con funciones de «contexto» genéricas
   (`ctxHonSep(rbd)`: columna del plan, subvención, atributos, modal, `boletas()/proyeccion()/agregado()`) para que PR-3 las reutilice.
8. **CSV de Honorarios pendiente (PR-2).** No se implementa la descarga CSV del Libro de Honorarios en PR-1 (ni sus validaciones previas).
9. **N° DC en toda boleta.** Cada boleta lleva **N° DC** (`documentoContable`, texto libre de hasta 100 caracteres) en formulario, tabla, Excel y PDF; **nunca** en el CSV.
10. **Boletas positivas.** No hay notas de crédito/débito en honorarios: el monto es siempre > 0.

**Hallazgo de la implementación (PR-1).** El catálogo de cuentas que aceptan honorarios tiene **36 cuentas, no 35**: el texto del manual (MC pág. 100-101) habilita también
**411404 MEJORAS ÚTILES Y NECESARIAS EN LOCAL ESCOLAR ARRENDADO** (BOLH, BOLHE, BPST, BPSTE), cuyo «Libro de Rendición» dice solo «Compras y Otros Gastos». Se incluyó con su
observación; quitarla es borrar una fila de `data/honorarios_cuentas_2026.json` y reinyectar con `scripts/extract_honorarios_cuentas.py --inyectar index.html`.
**411801** (adquisición de bienes inmuebles) queda verificada: solo acepta **BHE** (pág. 124 de la matriz). Detalle en `data/honorarios_cuentas_2026_verificacion.md`.

## 0. Convenciones y fuentes

Cada afirmación va marcada como **[MANUAL …]** (dicho expresamente por un documento SUPEREDUC),
**[CÓDIGO …]** (leído en `index.html`, solo lectura) o **[INTERPRETACIÓN]** (deducción mía; hay que confirmarla).
Cuando el manual calla, se dice **[MANUAL: no lo dice]**.

Abreviaturas y numeración de páginas (se cita siempre el **número impreso** de la cabecera «Página N de M»):

| Sigla | Documento (raíz del repo) | Página PDF = impresa + … |
|---|---|---|
| **Cap. IV** | `…Capitulo-IV-Honorarios-vf.pdf` (fuente principal, 17 págs.) | +1 (la portada es la «página 0») |
| **Cap. III** | `…Capitulo-III-Compras-y-otros-gasto-vf.pdf` | +1 |
| **Cap. I** | `…Capitulo-I-Remuneraciones-vf.pdf` | +1 |
| **Cap. VII** | `…Capitulo-VII-Visualizador-vf.pdf` | +1 |
| **MC** | `Manual-de-Cuentas-2026_baja (5).pdf` (Manual de Cuentas para la Rendición 2026) | 0 (impresa = PDF) |
| **Instr.** | `Instructivo-de-Control-y-Respaldo-de-Gastos-2026_-rev (1).pdf` | +1 |

Cómo se leyó: texto con `pdftotext -layout`. La **plantilla del CSV (Ilustración 09 del Cap. IV, PDF p. 8)
es una imagen**: se renderizó a 400 dpi y se leyó el encabezado a ojo (ver 2.2). La **Sección 12 del MC
(págs. 120-129, matriz cuenta × tipo de documento) también es imagen**: no se transcribió entera; las listas
de documentos por cuenta se tomaron del recuadro «Documentos Habilitados» que trae el texto de cada cuenta en
las secciones 9-10 del MC, y se verificaron visualmente contra la matriz en las págs. 122-123
(cuentas 410304, 410309, 410501-503, 410801-410804, 4109xx).

## 1. Resumen: hallazgos que cambian el diseño

1. **El CSV de Honorarios tiene 12 columnas (A-L)**: es el de Compras sin la columna M «Documento Original»,
   y con solo 5 tipos de documento. No hay columnas de persona, período, bruto/retención/líquido ni tipo de
   servicio. Una fila = una boleta (o la parte de una boleta que se declara). [MANUAL Cap. IV p. 6-8]
2. **El ruteo entre libros se decide por el *tipo de documento*, no por la cuenta.** Los 5 tipos de honorarios
   (BOLH, BHE, BOLHE, BPST, BPSTE) **no existen** en la Tabla 02 del CSV de Compras (14 tipos, ninguno de
   honorarios) [MANUAL Cap. III p. 8] y son los únicos que acepta el CSV de Honorarios [MANUAL Cap. IV p. 8].
   Hoy el panel los acepta en el registro de compras y solo avisa [CÓDIGO ≈ líneas 2301-2328, 2394, 2418].
3. **El manual no tiene una «cuenta de honorarios» ni usa «Subtítulo 21/22/29»** (la única mención de
   «subtítulo» es el subtítulo 24 de la Ley de Presupuestos, MC p. 25, 41, 87, 110). Son **35 cuentas** del plan
   que aceptan documentos de honorarios (sección 3). Solo **410304 Otros gastos en personal** y **410309 Sala
   cuna** están en la categoría de personal (4103xx, lo que el panel llama Subt. 21); **410803 Talleres
   extraprogramáticos** es la única cuenta cuyo libro es *solo* Honorarios; las otras 32 son cuentas de servicios
   (4105xx-4118xx, Subt. 22/29 del panel). «Honorarios = Subt. 21» es, por tanto, una convención del panel/usuario,
   no del manual. [MANUAL MC p. 61-109] + [INTERPRETACIÓN]
4. **410304 y 410309 hoy no se pueden registrar en el panel**: el catálogo de compras parte en 410500 [CÓDIGO ≈ línea 2190]
   y el de SEP no las incluye [CÓDIGO ≈ líneas 1813-1866].
5. **El 70/30 no aparece en ningún manual.** La única regla de «porcentaje de personal» del MC es el tope de
   **50 %** de los recursos SEP para contrataciones/incrementos/aumentos de horas, y ahí el manual **sí cuenta
   expresamente «las boletas de honorarios» de 4 cuentas** (410304, 410309, 410501, 410803) junto con las remuneraciones
   [MANUAL MC p. 12-14]. Detalle y recomendación en la sección 5.
6. **Retención / bruto / líquido: el manual no dice nada.** El CSV solo tiene Monto Gasto y Monto Documento.
   [MANUAL: no lo dice]. El Instructivo pide, como respaldo (no como dato del CSV), el desglose del F29 con las
   retenciones «Impuesto Único y de Segunda categoría» [MANUAL Instr. p. 7].
7. **Separador:** el Cap. IV dice «planilla delimitada por comas» [MANUAL Cap. IV p. 6]; el panel exporta todos sus CSV con `;`,
   BOM UTF-8 y CRLF [CÓDIGO ≈ líneas 2433-2447, 4786-4795]. Hay que confirmarlo (P3).
8. **Datos personales:** cada boleta lleva RUT y nombre de una persona natural; hoy el panel no guarda datos de personas
   (las remuneraciones son montos por mes). Esos datos quedarían en Firestore, visibles a los 19 correos de `firestore.rules`.

## 2. Qué es el Libro de Honorarios y cómo se carga

### 2.1 Definición y alcance

- Es uno de los libros del Sistema de Rendición de Cuentas: «Libro de Remuneraciones…, Libro de Ingresos FICOM, Libro de
  Compras, **Libro de Honorarios**, Libro de Otros Ingresos, Integración Registro de Cuentas Bancarias, Acreditación de Saldos»
  [MANUAL MC p. 5]. El Cap. IV lo describe como la «declaración de gastos por concepto de honorarios» [Cap. IV p. 2] y la plantilla
  descargable se llama «archivo de **Honorarios Percibidos**» [Cap. IV p. 5].
- Subvenciones que reciben gasto: General, SEP, PIE, Pro-Retención, Internado, Refuerzo Educativo y Anual de Apoyo al
  Mantenimiento [MANUAL Cap. IV p. 2 y Tabla 01, p. 7].
- Cada fila es «un gasto» con su documento tributario. Se declara por **RBD** o por **AC** (Administración Central) [MANUAL Cap. IV p. 7, col. A].
- Etapas: I descarga de plantilla, II carga, III ver resultados (nombre de archivo, cantidad de registros, monto total de
  gastos, descarga del CSV) y IV cierre del libro (con «Reaperturar») [MANUAL Cap. IV p. 3, 14-15].
- Períodos: **no hay columna de mes ni de período**; la rendición es anual y lo único acotado es la Fecha de Pago
  entre 01-01-2026 y 31-12-2026 [MANUAL Cap. IV p. 8, col. G]. (El Libro de Remuneraciones, en cambio, sí es por mes: columnas MES y ANIO,
  clave única RBD+RUT+MES+FUN [MANUAL Cap. I p. 9].)

### 2.2 Por qué no es «remuneración» para el sistema de rendición

- El Libro de Remuneraciones cubre solo las categorías **410100, 410200 y 410400** y a trabajadores «contratados bajo la modalidad
  de contrato a plazo fijo o indefinido» [MANUAL Cap. I p. 2]; el campo TIP del CSV solo admite `CPF` o `CI` [MANUAL Cap. I p. 17].
  Un prestador a honorarios no puede entrar por ahí.
- «Las partidas de remuneraciones no contempladas en las cuentas señaladas… deberán ser rendidas en los libros de compras y
  honorarios, directamente» [MANUAL Cap. I p. 2].
- El MC lista como rubros distintos «pago de remuneraciones, imposiciones previsionales y finiquitos» y «servicios por honorarios»
  [MANUAL MC p. 10]; las contrataciones se rigen por el Estatuto Docente, la Ley 19.464, «las normas aplicables del Código del
  Trabajo **o las disposiciones del Derecho Común (servicios personales)**» [MANUAL MC p. 12-13] → los honorarios son el régimen
  de «servicios personales» con boleta, no el de contrato de trabajo con liquidación. [INTERPRETACIÓN]
- El Instructivo separa el respaldo de «Pago de remuneraciones» (liquidaciones, contratos, cotizaciones, nómina de pago; Instr. p. 14)
  del de «Servicios por honorarios» (factura o boleta de honorarios, contrato de servicios, certificado de conformidad, entrega
  de un producto o servicio verificable; Instr. p. 17). [MANUAL]

### 2.3 Diferencias con los otros dos libros

| Aspecto | Remuneraciones (Cap. I) | Compras y otros gastos (Cap. III) | Honorarios (Cap. IV) |
|---|---|---|---|
| Qué se declara | Pago mensual por trabajador y función (contrato CPF/CI) | Un documento tributario por fila | Un documento (boleta de honorarios) por fila |
| Forma del CSV | Matriz ancha, 3 filas de cabecera (clasificador, ítem, descripción), datos desde la fila 4 [p. 7-8] | 13 columnas A-M, 1 fila de cabecera | **12 columnas A-L**, 1 fila de cabecera [Cap. IV p. 7] |
| Cuentas | 410100, 410200, 410400 [p. 2] | Cuentas cuyo libro es «Compras…» | Cuentas cuyo libro es «Honorarios» o «Compras… – Honorarios» (35, sección 3) |
| Tipos de documento | No aplica | 14: BOL, BOLE, FAC, FACE, ODE, BOLEC, BOLEX, FACEL, FACEX, FIN, DOCEX, NOTACRE, NOTADEB, PLANILLA [Cap. III p. 8] | **5**: BOLH, BHE, BOLHE, BPST, BPSTE [Cap. IV p. 8] |
| Persona | RUT, nombre, contrato, horas, función | Proveedor (RUT, nombre) | Proveedor = quien emite la boleta (RUT, nombre) |
| Notas de crédito/débito | No | Sí, con col. M «Documento Original» | No (no hay col. M ni tipos NOTA…) |
| Período | MES/ANIO por fila | Fecha de pago 2026 | Fecha de pago 2026 |
| Archivo | Uno por RBD | Uno por RBD «y Administración Central si procede» [Cap. III p. 6] | Uno por RBD [Cap. IV p. 6] (AC: ver 2.8) |

### 2.4 Formato exacto del CSV (plantilla «Honorarios Percibidos»)

**Reglas del archivo**

| Tema | Lo que dice el manual | Fuente |
|---|---|---|
| Extensión | Solo `.CSV`; otra cosa da «error en el formato de archivo» (validación inmediata) | Cap. IV p. 9-10 |
| Separador | «Planilla delimitada por comas [(*.CSV)] que se puede abrir con cualquier hoja de cálculo (ej. Excel)». No habla de `;`. | Cap. IV p. 6 |
| Codificación, BOM, fin de línea | **[MANUAL: no lo dice]**. El panel usa UTF-8 con BOM + CRLF en todos sus CSV | — / [CÓDIGO ≈ línea 4786] |
| Encabezado | Sí: la plantilla trae una fila 1 con los nombres de columna (Ilustración 09). «No se pueden eliminar ni agregar columnas» | Cap. IV p. 6-7 |
| Una hoja | «El archivo debe contener sólo una hoja de trabajo» | Cap. IV p. 6 |
| Una fila = un gasto | «Cada gasto que se declare debe ser registrado en una fila única» | Cap. IV p. 6 |
| Celdas obligatorias | «Se deben completar todas las celdas presentadas para cada fila» (no hay columna opcional, a diferencia de Compras) | Cap. IV p. 6 |
| Espacios | «No deben existir espacios en blanco… reconoce los espacios en blanco como datos» | Cap. IV p. 6 |
| Un archivo por | Cada RBD («por cada uno de los establecimientos… es decir, por cada RBD»); en la carga se elige el establecimiento y «debe coincidir con el RBD del archivo». La subvención es una **columna**, así que un mismo archivo de RBD puede mezclar subvenciones | Cap. IV p. 6, 9 |
| Longitudes máximas | **[MANUAL: no lo dice]** para este libro (Compras limita la descripción a 100 caracteres, Cap. III p. 8) | — |
| Decimales / separador de miles | **[MANUAL: no lo dice]**; son montos en pesos | — |

**Columnas, en este orden** (nombres tal como se leen en la Ilustración 09, sin tildes) [MANUAL Cap. IV p. 7-8]

| Col. | Encabezado en la plantilla | Qué debe contener (manual) | Formato / valores válidos | Oblig. |
|---|---|---|---|---|
| A | `RBD` | N° de RBD **sin dígito verificador**, o la sigla `AC` para Administración Central. El RBD debe ser del sostenedor que declara. | Entero, o `AC` | Sí |
| B | `Subvencion` | Código de la subvención que recibe el gasto | `GENERAL`, `SEP`, `PIE`, `MANTENIMIENTO`, `PRORETENCION`, `INTERNADO`, `REFUERZO` (Tabla 01) | Sí |
| C | `Codigo Cuenta` | Código de la cuenta de gasto del Plan de Cuentas 2026; «el sistema sólo aceptará códigos de cuenta asociados a la Subvención según el plan de cuentas» | 6 dígitos, p. ej. `410803`; lista de 35 en la sección 3 | Sí |
| D | `Tipo de Documento` | Tipo de documento «permitido» para esa cuenta | `BOLH` boleta honorario manual; `BHE` boleta honorario exenta; `BOLHE` boleta honorario electrónica; `BPST` boleta honorario prestación de servicios a terceros; `BPSTE` ídem electrónica (Tabla 02). Solo los asociados a la cuenta según el MC (sección 12) | Sí |
| E | `Nro Documento` | «Número correlativo que individualiza el documento tributario» | Texto/número | Sí |
| F | `Fecha Documento` | Fecha de emisión | `dd-mm-aaaa`. Solo documentos **no ingresados en procesos anteriores**, salvo que el monto rendido antes sea menor al total del documento | Sí |
| G | `Fecha Pago` | Fecha efectiva del pago | `dd-mm-aaaa`, entre `01-01-2026` y `31-12-2026` (ej. `04-11-2026`) | Sí |
| H | `Descripcion Gasto` | «Breve descripción del gasto, según el comprobante» | Texto libre; sin tope declarado (ver 2.5) | Sí |
| I | `Rut Proveedor` | RUT de quien emitió el documento | Sin puntos, con dígito verificador: `11111111-1` | Sí |
| J | `Nombre Proveedor` | Razón social o nombre de quien emitió el documento | Texto | Sí |
| K | `Monto Gasto` | Monto total o **parcial** del documento que se declara. Si el gasto se reparte entre RBD y/o subvenciones, la suma declarada no puede superar el valor del documento | Pesos, entero | Sí |
| L | `Monto Documento` | Valor total del documento que respalda el gasto | Pesos, entero | Sí |

**Ejemplo (fila de datos ficticia; separador `;` como el resto de los CSV del panel):**

```
RBD;Subvencion;Codigo Cuenta;Tipo de Documento;Nro Documento;Fecha Documento;Fecha Pago;Descripcion Gasto;Rut Proveedor;Nombre Proveedor;Monto Gasto;Monto Documento
1121;SEP;410803;BOLHE;54;21-01-2026;28-01-2026;Taller de ajedrez enero 2026;11111111-1;Nombre Apellido Apellido;600000;600000
```

### 2.5 Validaciones y causales de rechazo

El sistema valida en tres pasos [MANUAL Cap. IV p. 10]:

1. **Inmediata**: que el archivo sea `.CSV`.
2. **Online**: formato de la plantilla: «cantidad de columnas y su contenido… existencia de datos numéricos donde corresponde y detección de
   celdas vacías». Resultado en el reporte de errores.
3. **Offline**: «integridad y consistencia… set de reglas de negocio». Resultado en el reporte de errores.

Estados posibles: error de validación online, en espera de offline, error offline, guardando datos, cargado exitosamente, archivo eliminado,
cancelado por tiempo de espera [Cap. IV p. 10]. El reporte de errores trae Tipo, Regla, Ubicación (fila y columna) y Ayuda [Cap. IV p. 11].
Si la validación falla, los gastos **no** quedan registrados y el intento **no se puede eliminar** del historial [Cap. IV p. 12].

**Causales de rechazo que el manual deja explícitas** (el listado completo de «reglas» no está en el manual: el sistema las muestra en el reporte):

| # | Regla | Fuente |
|---|---|---|
| R1 | Archivo no `.CSV` | Cap. IV p. 9 |
| R2 | Columnas eliminadas/agregadas, o cantidad de columnas distinta de 12 | Cap. IV p. 6, 10 |
| R3 | Celda vacía en cualquier columna; espacios en blanco como dato | Cap. IV p. 6, 10 |
| R4 | Dato no numérico donde corresponde (RBD, montos) | Cap. IV p. 10 |
| R5 | RBD que no corresponde al sostenedor, o distinto del RBD elegido al cargar | Cap. IV p. 7, 9 |
| R6 | Subvención fuera de los 7 códigos | Cap. IV p. 7 |
| R7 | Cuenta no asociada a la subvención según el plan de cuentas | Cap. IV p. 7 |
| R8 | Tipo de documento fuera de los 5 códigos, o no permitido para esa cuenta | Cap. IV p. 8 |
| R9 | Fecha con formato distinto de `dd-mm-aaaa` | Cap. IV p. 8 |
| R10 | Fecha de pago fuera de 01-01-2026 a 31-12-2026 | Cap. IV p. 8 |
| R11 | Documento ya rendido en un proceso anterior (salvo remanente) | Cap. IV p. 8 |
| R12 | Suma de Monto Gasto (en todos los RBD y subvenciones) mayor que Monto Documento | Cap. IV p. 8 |

**Reglas que el Cap. IV no repite pero que el Cap. III sí dice para el mismo tipo de campo** (el panel ya las controla en Compras; para
Honorarios se recomienda mantenerlas como **advertencias**, no como bloqueos) [INTERPRETACIÓN]: descripción ≤ 100 caracteres (Cap. III p. 8) y
fecha de pago no anterior a la del documento (Cap. III p. 8). Cap. IV exige solo el rango 2026 para la fecha de pago.

### 2.6 Retenciones: bruto, retención, líquido

- **[MANUAL: no lo dice].** El CSV no tiene columnas de retención ni de líquido; «Monto Documento» es «el valor total del documento que respalda
  el gasto declarado» [Cap. IV p. 8, col. L].
- El Instructivo incluye, entre los antecedentes del expediente del egreso, el «Desglose del Formulario N° 29, retenciones Impuesto Único y de Segunda
  categoría e IVA (cuando corresponda)» [MANUAL Instr. p. 7] y, para pagos con vale vista a un honorario, cotejar el cobro en cartola [MANUAL Instr. p. 21]:
  la retención se respalda, no se declara en el CSV.
- **Recomendación** [INTERPRETACIÓN]: `Monto Documento` = monto **bruto** de la boleta (es lo que figura en el documento tributario) y `Monto Gasto` = el
  mismo bruto (o la parte imputada a ese RBD/subvención). El gasto del sostenedor es el bruto: el líquido va al prestador y la retención al SII.
  Si el panel quiere llevar control, puede tener campos **solo del panel** (retención, líquido), que **no** se exportan al CSV. Cuál es la tasa de
  retención 2026 es un dato externo al manual (a verificar con el SII) y no debe codificarse a ciegas.

### 2.7 Cómo se carga

Descargar plantilla → completar (un CSV por RBD) → elegir el establecimiento en «Seleccione Establecimiento» (debe coincidir con el RBD del archivo) →
«Seleccione un CSV» → «subir archivo» → «Refrescar» → revisar estado/reporte → «continuar» → Etapa III (resumen: nombre de archivo, cantidad de registros, monto total
de gastos) → Etapa IV cierre del libro [MANUAL Cap. IV p. 5-15]. Útil para el panel: el resumen de la Etapa III permite conciliar contra la cantidad de filas y
la suma de `Monto Gasto` del CSV generado.

### 2.8 Lo que el manual no aclara (marcar en la UI / confirmar)

- Separador real aceptado (`,` o `;`), codificación y BOM (ver P3).
- Si se admite un archivo para `AC`: la col. A lo permite (`AC`, Cap. IV p. 7) pero el párrafo de «un CSV por cada RBD» no menciona la Administración Central,
  mientras que el Cap. III dice «por cada RBD y Administración Central si procede» (p. 6). [INTERPRETACIÓN]: se carga igual que en Compras (un archivo con RBD = `AC`).
- Clave de unicidad de una fila (la regla de «documento ya ingresado» no dice qué campos compara). [INTERPRETACIÓN]: RUT + tipo + número de documento.
- Máximos de longitud y si Monto Gasto puede ser 0 o negativo.
- Si las columnas deben coincidir letra por letra con el encabezado (se recomienda copiar el de la plantilla tal cual).

## 3. Cuentas contables que aceptan honorarios (cruce con `data/plan_cuentas_2026.json`)

**Reglas de lectura**

- «Libro de Rendición» es un atributo de cada cuenta en el MC (secciones 9-10). Para las cuentas de personal hay tres valores:
  `Remuneraciones` (410101-410131, 410401-410405: documento «No aplica»), `Compras y Otros Gastos` (410120, 410208, 410301-410303, 410306-410308, 410312: documentos ODE/FIN)
  y **`Compras y Otros Gastos – Honorarios`** (solo **410304** y **410309**). [MANUAL MC p. 46-64]
- **No existe una cuenta «Honorarios» dentro de 4101xx-4104xx.** Los honorarios se rinden en la cuenta que describe *para qué* se contrata (talleres, ATE,
  capacitación, mantención, servicios externos…). [MANUAL MC p. 61-109] + [INTERPRETACIÓN]
- Cuando una cuenta dice «Compras y Otros Gastos – Honorarios», el mismo código puede recibir gastos de ambos libros; **qué libro corresponde lo decide
  el tipo de documento** (Cap. III p. 8 vs Cap. IV p. 8). [INTERPRETACIÓN con base en los dos listados de tipos]
- La única cuenta cuyo libro es solo **Honorarios** es **410803 Talleres extraprogramáticos**: «gastos por contratación de personal para el desarrollo de talleres…
  solo por personas naturales», respaldo con «boletas de honorarios, informe de prestación de servicios, nómina de alumnos…»; documentos BOLH, BHE, BOLHE, BPST, BPSTE
  y subvenciones General, SEP, Pro-Retención, Internado [MANUAL MC p. 83-84].
- Pertinencia: ✓ = habilitada; ● = habilitada **sujeta a exigencias de pertinencia** (punto rojo de la matriz, MC p. 112); · = no habilitada. Columnas del
  plan: General, Adm. Central General, SEP, Adm. Central SEP, PIE, Mantenimiento, Pro-Retención, Internado, Refuerzo.
- «Subt. panel» es la clasificación que usa hoy el panel (22/29 por categoría; **21\*** = categoría 4103xx, que el panel trata como personal y excluye del catálogo de compras).
  [CÓDIGO ≈ líneas 1803-1812, 2183-2190]

**Las 35 cuentas del plan 2026 que aceptan al menos un documento de honorarios** (fuentes: MC págs. 61-109 «Documentos Habilitados» por cuenta y plan de cuentas
de las págs. 112-119 ya extraído en `data/plan_cuentas_2026.json`; cuentas y nombres exactos del JSON):

| Cuenta | Nombre (plan 2026) | Libro | Honorarios aceptados | Gen | AC-G | SEP | AC-S | PIE | Man | Pro | Int | Ref | Subt. panel | MC p. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 410304 | OTROS GASTOS EN PERSONAL | Compras+Hon. | las 5 | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ | 21\* | 61 |
| 410309 | SALA CUNA | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | ✓ | · | ✓ | ✓ | ✓ | 21\* | 63 |
| 410501 | ASISTENCIA TÉCNICO PEDAGÓGICA EDUCATIVA (REGISTRO ATE) | Compras+Hon. | las 5 | · | · | ● | ● | · | · | · | · | · | 22 | 67 |
| 410502 | ACCIONES FORMATIVAS Y PERFECCIONAMIENTO DE RR.HH | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | ● | · | · | · | · | 22 | 68 |
| 410503 | ACTIVIDADES PARA EL FORTALECIMIENTO DE LOS OBJETIVOS DE MEJORAMIENTO DE LA CALIDAD EDUCATIVA | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | ● | · | ✓ | · | · | 22 | 70 |
| 410607 | EVENTOS EDUCATIVOS Y CULTURALES | Compras+Hon. | las 5 | ✓ | · | ● | · | · | · | ✓ | ✓ | ✓ | 22 | 75 |
| 410608 | EVALUACIÓN DIAGNÓSTICA | Compras+Hon. | sin BHE | ✓ | · | ✓ | · | ● | · | ✓ | ✓ | ✓ | 22 | 76 |
| 410801 | UNIFORMES Y VESTUARIO | Compras+Hon. | sin BOLHE | ✓ | · | ● | · | · | · | ✓ | ✓ | · | 22 | 82 |
| 410802 | OTROS GASTOS ALUMNOS | Compras+Hon. | las 5 | ✓ | · | ● | · | · | · | ✓ | ✓ | · | 22 | 83 |
| **410803** | **TALLERES EXTRAPROGRAMÁTICOS** | **Solo Honorarios** | las 5 | ✓ | · | ✓ | · | · | · | ✓ | ✓ | · | 22 | 84 |
| 410804 | CONTRATACIÓN DE APOYO DE ESPECIALISTAS | Compras+Hon. | las 5 | ✓ | · | ● | · | ● | · | ● | · | · | 22 | 84-85 |
| 410901 | TRANSPORTE ESCOLAR | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | · | ● | ✓ | · | 22 | 87 |
| 410903 | REPRODUCCIÓN DE DOCUMENTOS | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | ● | · | · | ✓ | · | 22 | 88 |
| 410904 | ALIMENTACIÓN | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | · | ● | ✓ | · | 22 | 89 |
| 410908 | PUBLICIDAD | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | · | · | · | · | 22 | 90 |
| 410910 | OTROS GASTOS DE OPERACIÓN | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | · | · | · | ✓ | · | 22 | 92 |
| 410918 | TRASLADO DE ESTUDIANTES POR ACTIVIDAD ESCOLAR | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | · | ● | · | · | 22 | 95 |
| 411101 | CONTRATACIÓN SERVICIOS DE ASEO Y JARDINERÍA | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | · | · | ✓ | · | 22 | 97 |
| 411102 | CONTRATACIÓN SERVICIOS DE SEGURIDAD | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | · | · | ✓ | · | 22 | 98 |
| 411103 | CONTRATACIÓN OTROS SERVICIOS EXTERNOS | Compras+Hon. | las 5 | ✓ | ✓ | · | ● | · | · | · | · | · | 22 | 98 |
| 411601 | MANTENIMIENTO Y REPARACIÓN DE INFRAESTRUCTURA | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | ✓ | · | ✓ | · | 22 | 104 |
| 411602 | CONSTRUCCIÓN DE INFRAESTRUCTURA (OBRA GRUESA) | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | · | · | ✓ | · | 22 | 104 |
| 411603 | TERMINACIONES DE INFRAESTRUCTURA | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | ✓ | · | ✓ | · | 22 | 105 |
| 411604 | INSTALACIONES ELÉCTRICAS, ILUMINACIÓN Y SISTEMAS DE CALEFACCIÓN | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | ✓ | · | ✓ | · | 22 | 105 |
| 411605 | INSTALACIONES DE GAS | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | ✓ | · | ✓ | · | 22 | 105 |
| 411606 | INSTALACIONES DE AGUA | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | ✓ | · | ✓ | · | 22 | 105 |
| 411607 | ALCANTARILLADOS O POZOS SÉPTICOS | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | ✓ | · | ✓ | · | 22 | 105 |
| 411608 | CIERRES PERIMETRALES Y OBRAS COMPLEMENTARIAS | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | · | ✓ | · | ✓ | · | 22 | 106 |
| 411609 | SERVICIOS HIGIÉNICOS | Compras+Hon. | sin BHE | ✓ | ✓ | · | · | · | ✓ | · | ✓ | · | 22 | 106 |
| 411610 | ELIMINACIÓN DE BARRERAS ARQUITÉCTONICAS DE MENOR ENVERGADURA | Compras+Hon. | sin BHE | ✓ | ✓ | ● | · | ✓ | ✓ | · | ✓ | · | 22 | 107 |
| 411701 | MANTENCIÓN Y REPARACIÓN DE BIENES MUEBLES | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | · | ✓ | · | ✓ | · | 22 | 107 |
| 411702 | REPUESTOS, MANTENIMIENTO Y REPARACIÓN DE VEHÍCULOS | Compras+Hon. | las 5 | ✓ | ✓ | ● | · | · | · | · | · | · | 22 | 108 |
| 411703 | MANTENCIÓN Y REPARACIÓN DE EQUIPOS COMPUTACIONALES | Compras+Hon. | las 5 | ✓ | ✓ | ● | ● | · | ✓ | · | ✓ | · | 22 | 108 |
| 411704 | MANTENCIÓN Y REPARACIÓN DE MOBILIARIO ESCOLAR | Compras+Hon. | las 5 | ✓ | · | ● | · | · | ✓ | · | ✓ | · | 22 | 109 |
| 411801 | ADQUISICIÓN DE BIENES INMUEBLES | Compras+Hon. | **solo BHE** | ✓ | · | · | · | · | · | · | · | · | 29 | 109 |

«las 5» = BOLH, BHE, BOLHE, BPST y BPSTE. «sin X» = las otras cuatro. Rarezas a confirmar contra la imagen de la Sección 12 antes de implementar: **411801** solo lista BHE
(más ODE y BOLEX, que no son de honorarios) [MC p. 109]; en 410801 falta BOLHE; en 410608 y en las cuentas «sin BHE» no se acepta la boleta exenta.

**Resumen por subvención** (cuentas del plan que aceptan honorarios; entre paréntesis las que llevan ● de pertinencia): General 34 (0) · Adm. Central General 26 (0) · **SEP 26 (23)** ·
Adm. Central SEP 10 (9) · PIE 8 (5) · Mantenimiento 12 (0) · Pro-Retención 12 (4) · Internado 26 (0) · Refuerzo 4 (0). Conteo hecho sobre `data/plan_cuentas_2026.json`; las columnas AC del
manual son «Adm. Central General» y «Adm. Central SEP». En SEP casi toda cuenta con honorarios exige pertinencia (PME, alumnos prioritarios…); solo 410304, 410608 y 410803 son ✓ sin ●.

**Las 4 cuentas cuyas «boletas de honorarios» el MC cuenta como contratación de personal SEP:** 410304, 410309, 410501 y 410803 [MANUAL MC p. 14]. Ver sección 5.

## 4. Cómo se trata hoy en el panel (solo lectura de código)

Números de línea aproximados en el árbol de trabajo actual (`index.html`, 8 461 líneas; el archivo se está editando en paralelo, usar los nombres).

| Tema | Hecho | Dónde |
|---|---|---|
| Tipos de documento de honorarios | El desplegable `TIPOS_DOCUMENTO_SEP` incluye los 5 («Boleta de honorarios manual/exenta/electrónica», «…prestación de servicios a terceros [electrónica]»), junto con los 13 tipos de Compras | ≈ 2301-2308 |
| Códigos | `TIPOS_DOCUMENTO_CODIGO` mapea nombre ↔ código (BOLH, BHE, BOLHE, BPST, BPSTE «Sección 12 del Manual de Cuentas / Cap. IV»); `CODIGOS_TIPO_HONORARIOS` es el conjunto de 5 | ≈ 2321-2328 |
| Aviso del CSV | `MOTIVOS_ADVERTENCIA_SUPEREDUC.honorarios` = «documento de honorarios (BOLH, BHE, BOLHE, BPST, BPSTE): SUPEREDUC los recibe en el Libro de Honorarios (Cap. IV), no en el de Compras»; lo agrega `normalizaFilaCompraSupereduc` y `confirmarDescargaComprasSupereduc` pregunta si se descarga igual (el CSV de Compras sale con esas filas) | ≈ 2394, 2418, 2452 |
| CSV de Compras | 13 columnas A-M, `;`, BOM UTF-8, CRLF; `Documento Original` solo en NOTACRE/NOTADEB; `comprasSepCsv` (SEP, `Subvencion`='SEP') y `comprasOtraFuenteCsv` | ≈ 2429-2447, 7149-7177, 4770-4800 |
| Catálogos de cuentas | `CUENTAS_SEP_22/29` (51 códigos, hechos a mano) y `CUENTAS_COMPRAS` (plan 410500-699999): **no incluyen 4103xx** (nota: «410100-410400 … son Subt. 21, que este panel ya carga aparte») | ≈ 1803-1870, 2183-2195 |
| Efecto en totales hoy | Una boleta de honorarios cargada como compra suma en **Bienes y Servicios** (Subt. 22 o 29 según la cuenta, mes de *Fecha Documento*) porque `itemsFromCompras` solo mira código de cuenta y fecha, no el tipo de documento. **No** entra en Remuneraciones. En SEP una boleta de 410304/410309 **no se puede registrar**: la cuenta no está en el selector y la importación Excel de COMPRAS omite en silencio los códigos fuera de `CUENTAS_SEP` (`importComprasSheet`) | ≈ 2585-2606 |
| Remuneraciones | Una sola fila mensual a mano por RBD: `CARGA_MANUAL.rem_por_rbd[rbd] = {meses, total, real_hasta_mes}`; en el modal es la fila «Remuneraciones (Subt. 21)» (`filaSimple`) con el control «Remuneraciones reales hasta» | ≈ 3310-3340, 3466 |
| Modal de detalle SEP | Orden: Ingreso SEP (detalle) → Remuneraciones (Subt. 21) → ítems Subt. 22 → ítems Subt. 29 → B&S Proyección → Registro de compras (`buildDetalleHTML`) | ≈ 3291-3480 |
| 70/30 | `recomputeRegistro`: `gasto_rem_anual_proy = rem.total`; `gasto_bys = Subt22 + Subt29 + proyección B&S`; `meta_rem_70 = 0,70 × (Preferente+Prioritario) + Carrera Docente`; `meta_bys_30 = 0,30 × (Preferente+Prioritario)`; `saldo_rem`, `saldo_bys`, `saldo_total`; `pct_ejec_rem`, `pct_ejec_bys`, `pct_ejec_total`; Estado por `pct_ejec_total` (≥100 déficit, ≥90 riesgo) | ≈ 2886-2955 |
| Otras fuentes | `FUENTES_OTRAS`: General, PIE, Mantención, Pro-Retención (con `codigoSupereduc` y libro de compras) + JUNJI, FAEP, FIGA, Aporte Educ., Aporte JUNJI (`codigoSupereduc: null`, B&S por concepto). Cada entidad×fuente es `otras_fuentes.{fuente}` con `gasto_rem`, `compras` (mapa), `bys_proy_items`, `real_hasta_mes`; la fila `AC` existe solo en esas pestañas (no en SEP) | ≈ 2231-2275, 2726-2765, 2808-2850 |
| Persistencia | Un doc por RBD/AC en `sep_carga_rbd/{id}`; compras en un **mapa** `compras.{id}` (merge por compra); `firestore.rules` solo exige correo permitido: **no valida campos**, no hace falta cambiar reglas | ≈ 7987+, 8204 (`sanitizaCompra`); `firestore.rules` |
| Acciones por fila | SEP: «⬇ XLS», «⬇ CSV SEP», 🖨; fuentes: «⬇ XLS», «⬇ CSV SUPEREDUC», 🖨 | ≈ 3517-3519, 5057-5072 |
| Excel de respaldo | Hojas INGRESO, REMUNERACIONES, SUBT22, SUBT29, COMPRAS, BYS_PROYECCION (+ META en fuentes) y su importación | ≈ 7262-7270, 4870-4890, 7489 |
| Dashboard / Visualizador / Reportes | Todos manejan «rem» y «bys» como dos series (tarjetas «Gasto Remuneraciones», barras apiladas, árbol del Visualizador `grupo:'rem'`, catálogo de conceptos del Reporte `key:'rem'`) | ≈ 5342, 5453-5480, 5775, 6299-6351 |

## 5. ¿Cuentan los honorarios dentro del 70 % de personal de SEP? (investigación)

**Qué se buscó:** el 70/30 y cualquier porcentaje de «personal» en el MC, Cap. I, III, IV, VII, el Instructivo, y el README/código del panel.

### 5.1 Lo que dice el manual

| # | Hallazgo | Fuente |
|---|---|---|
| E1 | **No hay ningún «70 %» ni «30 %» como regla de distribución** en los manuales (las únicas apariciones de 30 % son otras cosas: asignaciones sobre la RBMN). El 70/30 es una regla **del panel/SLEP**: «el 70 % del ingreso SEP debe destinarse a remuneraciones y el 30 % a bienes y servicios» | README líneas 6-7 y 533-541; `recomputeRegistro` |
| E2 | Regla legal sobre personal SEP: «las contrataciones, incrementos y aumentos de horas… no podrán superar el **50 %** de los recursos que obtenga por aplicación de esta ley, a menos que en el PME se fundamente un porcentaje mayor» (art. 8° bis, Ley 20.248) | MC p. 12 |
| E3 | El MC lista 15 «subcategorías de gastos remuneracionales» SEP (410101, 410102, 410104, 410105, 410116, 410119, 410121, 410124, 410128, 410129, 410401-410405) **y a continuación**: «Además, **se deben considerar las boletas de honorarios** de las siguientes subcategorías: **410304** Otros gastos en personal, **410309** Sala Cuna, **410501** ATE, **410803** Talleres Extraprogramáticos». Y: «las subcategorías de remuneraciones y honorarios mencionadas… son consideradas en el cálculo del total de gastos por contrataciones, incrementos y aumentos de horas SEP y… no debiesen ser superior al 50 %… a no ser que… esté justificado en el PME» | MC p. 13-14 |
| E4 | Los honorarios entran en «las contrataciones» porque el régimen de contratación incluye «las disposiciones del Derecho Común (servicios personales)» | MC p. 13 |
| E5 | Los especialistas que **implementan** apoyos NEE «deben formar parte del personal del establecimiento, por lo que sus remuneraciones deben ser rendidas en las cuentas correspondientes»; solo los externos de evaluación diagnóstica van a 410804 (honorarios) | MC p. 84-85 |
| E6 | En la Administración Central SEP: hasta 10 % de los recursos SEP; y, para los SLEP, la Ley de Presupuestos 2026 (partida 09, cap. 01, prog. 20, subt. 24, ítem 01, asig. 266, glosa 06) permite destinar recursos SEP a **personal contratado a honorarios** de las unidades internas del Servicio Local para apoyar el PME, con tope de **10 %** de los ingresos anuales SEP; lo contratado bajo Código del Trabajo hasta el 23-12-2023 cuenta dentro de ese 10 % | MC p. 24, 25 (repetido en 110-111) |
| E7 | El Libro de Remuneraciones solo recibe contratos CPF/CI y solo 410100/410200/410400; el resto va a Compras y Honorarios | Cap. I p. 2, 17 |
| E8 | El Visualizador agrupa por «Subcategoría de Cuentas» y cuenta; **no calcula** razones personal/resto | Cap. VII p. 5-7 |
| E9 | El Instructivo distingue «gastos en personal» (remuneraciones de las plantas, más AC) de «servicios por honorarios» | Instr. p. 14, 17 |

### 5.2 Lo que hace hoy el panel [CÓDIGO]

- `gasto_rem_anual_proy` es solo la fila «Remuneraciones» (carga manual). Los honorarios no existen como concepto; si se registran como compra, caen en **B&S** (el 30 %) según la cuenta.
- La meta 70 % incluye el 100 % de Carrera Docente (que solo puede pagar remuneraciones, README). El Estado depende de `pct_ejec_total`, que suma todo el gasto.

### 5.3 Conclusión

1. **[MANUAL] explícito:** para el único límite de personal que el manual define (50 %), SUPEREDUC **sí suma las boletas de honorarios de 410304, 410309, 410501 y 410803 junto con las remuneraciones SEP** (MC p. 13-14). Las boletas de honorarios de las otras 31 cuentas del plan **no** se mencionan en ese cálculo.
2. **[MANUAL] silencio:** el manual **no define** el 70/30 ni dice si los honorarios entran en el 70 % de personal. El 70 % es una regla interna; además es *mayor* que el 50 % legal de contrataciones (que el propio manual deja subir si el PME lo fundamenta), lo que sugiere que el 70 % del panel es una meta de planificación del SLEP.
3. **[INTERPRETACIÓN] mejor ajuste con el manual (opción A, recomendada):** «personal» = Remuneraciones + **boletas de honorarios de las 4 cuentas del MC p. 14**; el resto de las boletas de honorarios (talleres de otras cuentas, mantención, servicios) siguen siendo **bienes y servicios** por la cuenta en que se imputan (Subt. 22/29 del panel). Así el panel replica el criterio de SUPEREDUC y no infla el personal con gasto de servicios.
4. **Alternativas** (dejar a decisión del usuario, pregunta P1):
   - **B – todos los honorarios son personal** (coincide con «honorarios = Subt. 21» del usuario): más simple, pero cuenta como personal gasto que el manual trata como servicio (p. ej., mantención con boleta de honorarios) y sube artificialmente el % de personal.
   - **C – honorarios fuera del 70/30** (solo informativo): no recomendable; el saldo total los descontaría pero ninguna meta los absorbería, y `saldo_rem + saldo_bys ≠ saldo_total`.
   - **D – (adicional, opcional)** indicador informativo «contrataciones SEP / ingreso SEP» con tope 50 % (E2-E3) y, en AC, «honorarios AC SEP / ingreso SEP» con tope 10 % (E6). No reemplaza al 70/30.
5. Para cualquiera de A-C el **total** de gasto (y por tanto Saldo final, % Ejec. Total y Estado) debe incluir todos los honorarios: la regla solo decide en cuál de las dos metas (70 % o 30 %) se mide cada boleta. Debe cumplirse siempre `gasto_total = remuneraciones + honorarios + B&S sin honorarios` (sin doble conteo; ver riesgos).

## 6. Diseño propuesto (sin implementar)

### 6.a Modelo de datos (Firestore, doc `sep_carga_rbd/{rbd|AC}`)

**Recomendación: registro detallado por boleta (mapa) + fila mensual de proyección. No una fila agregada como Remuneraciones.**

Razones:
1. El CSV exige una fila por documento con RUT, nombre, número, fechas, cuenta y dos montos (sección 2.4). Un total mensual no permite generarlo.
2. Cada boleta debe ir contra una cuenta y una subvención (R7, R8) y se debe controlar que la suma por documento ≤ Monto Documento (R12).
3. Es exactamente el patrón de Compras (mapa por id, merge por boleta, sin pisar ediciones simultáneas) que el panel ya sabe sincronizar y probar.
4. La *proyección* (pagos futuros todavía sin boleta) sí es naturalmente mensual: se modela como la de B&S (`bys_proyeccion`).

**SEP (raíz del documento del RBD):**
```
honorarios: { "<id>": { codigo, tipoDocumento, nroDocumento, fechaDocumento, fechaPago,
                        descripcion, rutProveedor, nombreProveedor, montoGasto, montoDocumento } }
hon_proyeccion: { items: { "<codigo cuenta>": { meses: {ENERO..DICIEMBRE}, total } } }
```
- Mismos campos y mismo `id` (`generarCompraId`) que `compras`, **sin** `documentoOriginal`. `tipoDocumento` se guarda como **código** (BOLH…); se muestra con nombre.
  El `montoGasto` puede ser menor que `montoDocumento` (reparto entre RBD/subvenciones).
- Campos opcionales **solo del panel** (no se exportan al CSV): `retencion`, `liquido` (ver P4).
- Se agregan al `sanitizaCompra`/`aplicarSnapshot` equivalentes (`sanitizaHonorario`), a `superponerEdicionesSinConfirmar` y a la exportación JSON de respaldo.
- No hay que tocar `firestore.rules` (no validan campos). Peso estimado ≈ 400 B por boleta; muy por debajo de 1 MiB por documento incluso con cientos de boletas por RBD.

**Otras fuentes (General, PIE, Mantención, Pro-Retención):** dentro de `otras_fuentes.{fuente}`: `honorarios: {id: {...}}` y `hon_proyeccion_items`, junto a `compras` y `bys_proy_items`. La clave `codigoSupereduc` de `FUENTES_OTRAS` ya da el valor de la columna B del CSV. Habilitar solo en las fuentes con `codigoSupereduc`.
**JUNJI, FAEP, FIGA, Aporte Educ., Aporte JUNJI:** **no** aplican: no son subvenciones del sistema SUPEREDUC (sin libro de honorarios); sus gastos de personal a honorarios, si los hubiera, seguirían como concepto libre de B&S (`bys_items`). [INTERPRETACIÓN; P7]
**AC (Administración Central):** la fila `AC` ya existe como documento `sep_carga_rbd/AC` en las pestañas de fuentes (General) y su columna del plan es «Adm. Central General». Honorarios en AC = mismo modelo, `RBD = AC` en el CSV. **SEP AC no existe hoy en el panel** (ver P6): si se quiere el control del tope 10 % hay que crearla; el modelo ya la admite.

**Catálogo nuevo** `HONORARIOS_CUENTAS` (35 filas): `{codigo, nombre, libro:'honorarios'|'compras+hon', docs:[…], columnas por subvención con nivel 0/1/2, subt panel, esPersonal (4 cuentas del MC p. 14)}`. Generarlo con un script (`scripts/extract_honorarios_cuentas.py`, mismo estilo que `extract_plan_cuentas.py`) a partir del recuadro «Documentos Habilitados» de cada cuenta, verificado contra la matriz de la Sección 12; dato normativo versionado como `data/honorarios_cuentas_2026.json` (requiere excepción en `.gitignore`, que ignora `*.json`) e inyectado en `index.html` como `PLAN_CUENTAS_2026`. Reutilizar `planNivelCuenta` para habilitar/deshabilitar cuentas por subvención y AC.

**Compras:** quitar los 5 tipos de honorarios del desplegable de nuevas compras (la Tabla 02 del Cap. III no los tiene). Mantener el mapa nombre↔código y el aviso solo para datos antiguos, cambiando su texto a «muévelo al registro de Honorarios» (P2).

### 6.b Ubicación en la UI

- **Modal de detalle de cada RBD (SEP y de cada fuente):** justo debajo de «Remuneraciones (Subt. 21)», un bloque **«Honorarios (Subt. 21)»** con:
  1. fila mensual de **solo lectura** con el total de boletas por mes (suma de `montoGasto` agrupada por el mes de *Fecha Documento*, igual que Compras) — color «real»;
  2. filas editables de **Proyección de honorarios** (una por cuenta, mismo patrón que «Bienes y Servicios (Proyección)»), siempre «proyectada»;
  3. un `<details>` «Registro de honorarios» con el formulario y la tabla de boletas (columnas A-L + acciones editar/duplicar/eliminar), que reutiliza el formulario de compras.
  El selector `Cuenta` se filtra por subvención (y AC) con el catálogo; `Tipo de documento` solo muestra los 5 de honorarios y se restringe a los permitidos por la cuenta; las filas con cuenta/tipo inválido se marcan con ⚠ como ya se hace en las fuentes (`compra-no-habilitada`).
- **Real vs. proyectado y corte de mes:** las boletas son **reales por definición**; la proyección es siempre proyectada (misma regla que B&S: «las compras siempre son reales y la fila Proyección siempre es proyectada»). No se agrega un «honorarios reales hasta»; el selector global «Ver resumen hasta el mes» sí corta ambas series (sumar boletas + proyección ≤ mes). Regla de la proyección: se **suma** a las boletas (como B&S), con un aviso en el modal si un mes tiene boletas y proyección a la vez, para que no se duplique.
- **Efecto en tarjetas y totales (SEP y Panel principal):**
  - «Gasto Remuneraciones» queda **solo** con la fila de remuneraciones. Tarjeta nueva **«Gasto Honorarios»** (con detalle «personal $X / servicios $Y» si rige la opción A).
  - «Gasto B&S» = compras + proyección B&S + (opción A) honorarios de cuentas no personales.
  - `gasto_total` = rem + hon + B&S (bloque `bloqueRealProy` pasa a llevar `hon`); Saldo, % Ejec. Total y Estado usan ese total.
  - Tabla «Estado por RBD»: sin columna nueva en la 1.ª entrega; el encabezado «% Ejec. Remuneraciones» pasa a «% Ejec. Personal (Rem.+Hon.)» (con la opción A) y se actualiza la leyenda.
  - Barras apiladas del Panel principal: tercera serie «Honorarios» con color propio.
- **Visualizador, Reportes, % Ejecución, PDF individual:** nuevo grupo `hon` («Honorarios») en el árbol del Visualizador; concepto «Honorarios (Subt. 21)» y «Proyección Honorarios» en el catálogo de Reportes; serie en % Ejecución; sección en el PDF por RBD. Es la parte más extensa por la cantidad de sitios que hoy asumen dos series.

### 6.c Exportación e importación

- **CSV Libro de Honorarios** (por RBD y por subvención, como el de Compras): función única `construirCsvHonorariosSupereduc(entradas)` análoga a `construirCsvComprasSupereduc` con encabezado de 12 columnas **idéntico a la plantilla** (`RBD;Subvencion;Codigo Cuenta;Tipo de Documento;Nro Documento;Fecha Documento;Fecha Pago;Descripcion Gasto;Rut Proveedor;Nombre Proveedor;Monto Gasto;Monto Documento`), fechas `dd-mm-aaaa`, RUT `11111111-1`, descripción neutralizada contra fórmulas Excel, `;`+BOM+CRLF por defecto (P3). Nombre de archivo `honorarios_<fuente>_<rbd>_<fecha>.csv`; el RBD de SEP/General/PIE/… va en su pestaña, y se ofrece (opcional, PR-3) un «CSV RBD completo» que une todas las subvenciones del mismo RBD, porque SUPEREDUC sube un archivo por RBD (Cap. IV p. 6, 9).
- **Validación previa a la descarga** (resumen con conteo, igual que `confirmarDescargaComprasSupereduc`): R2-R10 y R12 del cuadro 2.5, más advertencias: descripción > 100, pago anterior al documento, boleta duplicada (RUT+tipo+nro), suma por documento entre todos los RBD/subvenciones > `Monto Documento`, cuenta no habilitada para la subvención, tipo no permitido para la cuenta. Mostrar también **cantidad de filas y suma de Monto Gasto** para conciliar con la Etapa III del sistema (Cap. IV p. 14).
- **Acciones por fila**: «⬇ XLS», «⬇ CSV HON» y 🖨 en SEP; en las fuentes con `codigoSupereduc`, un segundo botón CSV (el de Compras sigue igual). Botón general «⬇ CSV Honorarios (todos los RBD)» como el de compras (no subible tal cual).
- **Excel de respaldo**: hojas nuevas `HONORARIOS` (ID, RBD, Establecimiento, Codigo, TipoDocumento, NroDocumento, FechaDocumento, FechaPago, Descripcion, RutProveedor, NombreProveedor, MontoGasto, MontoDocumento) y `HON_PROYECCION` (como `BYS_PROYECCION`); importación con las mismas reglas de rechazo de filas (`rechazarFilaImportacion`), neutralización de fórmulas y ciclo exportar→reimportar sin pérdida (extender `roundtrip_excel`).

### 6.d Tratamiento en la meta 70/30 (recomendación y alternativa)

**Recomendado (A):** `gasto_personal = gasto_rem + gasto_hon_personal`, donde `gasto_hon_personal` = boletas (y proyección) en `{410304, 410309, 410501, 410803}` (MC p. 14, constante `HON_CUENTAS_PERSONAL` fácil de cambiar). Con eso:
`saldo_rem = meta_rem_70 − gasto_personal`; `pct_ejec_rem = gasto_personal / meta_rem_70`; `gasto_bys` incluye los honorarios de las demás cuentas por su Subt. 22/29. Nada de lo existente cambia para RBD sin honorarios.
**Alternativa (B):** `HON_CUENTAS_PERSONAL = todas`. Es un cambio de una constante; por eso la decisión (P1) no bloquea la implementación.
Detalle: como Carrera Docente solo puede pagar remuneraciones, conviene mostrar en el tooltip que `meta_rem_70` ya la incluye y que los honorarios la consumen solo si la remuneración no la agota. [INTERPRETACIÓN]

### 6.e Pruebas y riesgos

**Pruebas (arnés Playwright con mock de Firebase, `tests/`):**

1. `honorarios_modelo.mjs`: alta/edición/duplicado/eliminación de una boleta → totales del modal, tarjetas, `recomputeRegistro`, Estado; sin doble conteo con Compras; proyección + boletas.
2. `honorarios_7030.mjs`: opciones A y B con fixtures (boleta en 410803 vs 411601); invariante `gasto_total = rem + hon + bys`.
3. `honorarios_csv_formato.mjs` (calco de `csv_supereduc_formato`): encabezado exacto de 12 columnas, orden, `dd-mm-aaaa`, RUT con guion, tipos solo de honorarios, sin columna M, por RBD y subvención, `AC`, neutralización de fórmulas, conteo y suma previos.
4. `honorarios_cuentas.mjs`: el catálogo tiene 35 cuentas; 410803 es «Solo Honorarios»; 411801 acepta solo BHE; filtrado por subvención y AC.
5. Extender `roundtrip_excel` (hojas nuevas), `persistencia` / `sync_estado` (merge por id, `deleteField`), `seguridad_xss` (descripción/nombre/RUT escapados), `formulas_csv_excel`, `modal_equivalencia` y `a11y_*` (formulario nuevo).
6. Regenerar el **golden master** solo con los cambios intencionales (marcado nuevo en el modal; tarjeta/encabezado); verificar con `APP_HTML=@<commit previo>` que los specs nuevos fallan en la versión anterior.

**Riesgos:**
- *Doble conteo / pérdida:* boletas ya cargadas como compra (B&S) y las de 410304/410309 que hoy se descartan en silencio. Mitigar con el aviso de P2 y una prueba de invariante.
- *Cambio de significado de «% Ejec. Remuneraciones»* con la opción A: comunicar en leyenda/README y en «Cómo usar».
- *Pérdida silenciosa en la importación Excel de compras existente* (omite cuentas fuera del catálogo): en el import de HONORARIOS informar cada fila rechazada con `rechazarFilaImportacion`.
- *Reglas de SUPEREDUC no cubiertas por el manual* (separador, AC, clave de unicidad, longitudes): el CSV puede ser rechazado aunque el panel no advierta nada; probar con un archivo real antes de cerrar el PR-2.
- *Datos personales:* RUT y nombre de personas naturales quedan en Firestore y en Excel/CSV exportados; el acceso es por lista de 19 correos. Confirmar que es aceptable; no se puede omitir (el CSV los exige).
- *Vigencia anual:* códigos de cuenta y tipos de documento cambian cada año; el catálogo debe versionarse (`…_2026`) y regenerarse con el script.
- *Tamaño y conflicto de edición:* `index.html` es un solo archivo de 8 461 líneas editado en paralelo; hacer ramas cortas y rebase frecuente.
- *Mes de imputación:* usar *Fecha Documento* (como Compras) puede diferir del mes de pago que ve SUPEREDUC (P5).

### 6.f Estimación y orden de implementación (S/M/L)

| Parte | Esfuerzo |
|---|---|
| Catálogo de 35 cuentas + script de extracción/verificación + `.gitignore` | S |
| Modelo de datos, `sanitizaHonorario`, recompute, 70/30 (SEP) | M |
| UI del modal SEP (fila, proyección, formulario, tabla, avisos) | M |
| Compras: quitar tipos de honorarios, aviso de migración | S |
| Exportador CSV + validaciones + acciones por fila + resumen previo | M |
| Excel exportar/importar (HONORARIOS, HON_PROYECCION) + roundtrip | S-M |
| Otras fuentes (General, PIE, Mantención, Pro-Retención) y AC | M |
| Panel principal, Visualizador, Reportes, % Ejecución, PDF (tercera serie) | L |
| Pruebas nuevas + golden | M |
| README, «Cómo usar», leyendas | S |
| **Total** | **L (≈ 3 PR)** |

**Orden sugerido:**
- **PR-1 — Honorarios en SEP (datos + modal + totales) — IMPLEMENTADO:** catálogo, modelo, formulario/tabla por boleta, proyección, 70/30 (A/B), tarjetas SEP, Excel SEP, cambio en Compras, pruebas 1, 2, 4 y golden. Entrega visible y autocontenida.
- **PR-2 — CSV del Libro de Honorarios + acciones:** exportador exacto del manual, validaciones, botones por fila y general, PDF individual, prueba 3 y validación con un archivo subido de verdad a SUPEREDUC.
- **PR-3 — Fuentes, AC y analítica:** General/PIE/Mantención/Pro-Retención y AC (reusando el exportador), Panel principal, Visualizador, Reportes, % Ejecución, «CSV RBD completo», README.

## 7. Preguntas abiertas para el usuario (máx. 8)

| # | Pregunta | Recomendación por defecto | Estado |
|---|---|---|---|
| **P1** | **¿Los honorarios cuentan dentro del 70 % de personal de SEP?** El manual no define el 70/30; solo cuenta «boletas de honorarios» de 410304, 410309, 410501 y 410803 en el tope de 50 % de contrataciones (MC p. 14). ¿De dónde sale el 70 %? | **Opción A:** personal = Remuneraciones + honorarios de esas 4 cuentas; los demás honorarios quedan en B&S por su cuenta. Alternativa B: todos como personal. No usar C (fuera del 70/30). | **RESUELTA (opción B):** todos los honorarios cuentan del lado del personal (70 %); ver decisión 5. La constante `HON_CUENTAS_PERSONAL` no se creó: no hay lista de cuentas de personal. |
| **P2** | Hay compras ya cargadas con tipo de documento de honorarios (en B&S): ¿se mueven al nuevo registro? | **No migrar solas.** Aviso por RBD con botón «Mover a Honorarios»; confirmar antes de borrar de Compras. | **RESUELTA:** se quitan los 5 tipos del selector de Compras y **no** hay botón de migración; las compras antiguas se avisan con «muévelo al registro de Honorarios» (decisión 2). |
| **P3** | El manual dice «delimitada por comas» y el panel exporta `;` con BOM/CRLF: ¿el CSV de Compras con `;` ya se subió con éxito a SUPEREDUC? | **Mismo formato que Compras** (`;`, UTF-8 con BOM, CRLF). Si fue rechazado, cambiar a `,` en un solo punto del exportador. | **PENDIENTE (PR-2):** separador y formato del CSV de Honorarios; no se implementa en PR-1 (decisión 8). Se resuelve con la respuesta de SUPEREDUC sobre el CSV de Compras con `;`. |
| **P4** | Retención: ¿se registra solo el bruto de la boleta o también retención y líquido? | **Bruto = Monto Gasto = Monto Documento** (salvo reparto); sin campos de retención en la primera entrega (el CSV no los usa). | **RESUELTA:** solo bruto, sin retención ni líquido (decisión 3). |
| **P5** | ¿A qué mes se imputa una boleta: *Fecha Documento* o *Fecha Pago*? | **Fecha Documento**, igual que Compras; la Fecha de Pago se exige y valida (2026) pero no mueve el mes. | **RESUELTA:** *Fecha de Documento* (decisión 4). |
| **P6** | ¿Se necesita Administración Central? En especial honorarios de AC SEP (10 %, glosa 06 de los SLEP; MC p. 24-25), que hoy el panel no tiene. | **AC General sí** (la fila AC ya existe en las fuentes). **AC SEP:** fuera de la primera entrega; el modelo la admite y se puede sumar un indicador del tope 10 % después. | **RESUELTA:** «AC SEP» no se crea y no hay tope de 10 % (decisión 6); la fila AC de las demás fuentes llega con PR-3 (decisión 7). |
| **P7** | ¿En qué fuentes va Honorarios? | **SEP + General, PIE, Mantención, Pro-Retención** (las que tienen código SUPEREDUC). No JUNJI, FAEP, FIGA ni los Aportes; Internado y Refuerzo no tienen pestaña. | **RESUELTA:** todas las fuentes con código SUPEREDUC, pero **en PR-3**; PR-1 es solo SEP (decisión 7). |
| **P8** | ¿Se acepta guardar RUT y nombre de las personas (datos personales) en el panel, con acceso de los 19 correos de la lista? ¿Y se quiere el indicador informativo del tope de 50 % de contrataciones SEP (opción D)? | **Sí a los datos** (el CSV los exige) con la lista de acceso actual. **Indicador del 50 %:** dejar para una entrega posterior. | **RESUELTA:** sí a RUT y nombre visibles para los 19 autorizados; **no** hay indicador de 50 % (decisión 6). |

## 8. Anexo: verificación y límites de este análisis

- **Hecho:** lectura completa del Cap. IV; lectura de los capítulos I, III y VII en lo pertinente (estructura del CSV, tipos de documento, alcance, visualizador); lectura del MC págs. 4-25 (marco general, SEP, AC, saldos), 61-64 (cuentas de personal), 67-70, 75-76, 82-85, 87-109 (cuentas con honorarios) y 120-123 (matriz); búsqueda de «honorario», «70 %», «30 %», «retención», «subtítulo», «bruto/líquido» en todos los PDF; lectura del Instructivo págs. 7, 11, 14, 17, 19, 21.
- **Leído como imagen:** encabezado de la plantilla del CSV (Cap. IV, PDF p. 8, Ilustración 09) y matriz de la Sección 12 (MC p. 120-123). No se transcribió la matriz completa; las págs. **124-129** (cuentas 4110xx-4118xx) no se revisaron visualmente: la lista de documentos de esas cuentas sale del texto de cada cuenta. Mirar esas páginas antes de fijar el catálogo (en especial 411801). **Actualización (PR-1):** la pág. 124 (4111xx-4118xx) se revisó en imagen y 411801 queda confirmada como solo BHE; apareció además 411404 (ver «Decisiones del usuario»). Ver `data/honorarios_cuentas_2026_verificacion.md`.
- **No pude ver:** los reportes de errores reales de SUPEREDUC (las «reglas» exactas); el archivo `Plantilla_Honorarios.csv` descargable (solo su captura); ni los datos reales de Firestore (si existen compras con tipos de honorarios).
- **Contraste con el repositorio:** `data/plan_cuentas_2026.json` y `data/plan_cuentas_2026_verificacion.md` (matriz del plan de cuentas, págs. 112-119) coinciden con los flags de subvención leídos del texto de cada cuenta para las 35 cuentas de la sección 3.
