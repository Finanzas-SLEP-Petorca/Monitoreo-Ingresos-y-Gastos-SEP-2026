# Arnés contra el SDK REAL de Firestore (`tests/e2e-real`)

Pruebas del panel (`index.html`) **contra el SDK real de Firestore 10.12.0 y el emulador oficial**, en Chromium (Playwright).
Existe porque las 20 pruebas de `tests/` usan un **mock** de Firestore escrito por nosotros (`tests/mockfb/`): demuestran que el panel
hace lo correcto *frente al mock*, no frente al comportamiento real del SDK (orden de los snapshots, cola persistente de IndexedDB,
reglas de seguridad, límites del servidor, detección de red caída…). Este arnés es **opcional** y no reemplaza al principal.

- Nada toca Firebase de producción: todo va a `127.0.0.1` (emulador local). Cualquier otra petición de red se aborta y cuenta como error.
- Las dependencias pesadas (SDK, esbuild, emulador `.jar`) viven **fuera del repo**, en `E2E_HOME` (por defecto `/home/user/.e2e-real`).
- `index.html` no se toca. Los defectos que se encuentran se documentan abajo con evidencia y un parche propuesto (`parches/`, **sin aplicar**).

## Cómo ejecutarlo

```bash
bash tests/e2e-real/setup.sh          # una vez (idempotente): npm install + emulador de Firestore; no re-descarga lo ya instalado
node tests/e2e-real/run.mjs           # los 12 specs contra el index.html del árbol: tabla PASS / BUG / FAIL (≈ 8 min)

node tests/e2e-real/run.mjs --matriz  # árbol + @069f9dd (+ @baseline en los specs 06 y 07) y compara con lo esperado (≈ 15 min)
node tests/e2e-real/run.mjs 01 04     # solo esos specs (prefijo del nombre)
node tests/e2e-real/run.mjs list      # lista los specs
node tests/e2e-real/run.mjs --html @069f9dd        # contra otro HTML (igual que APP_HTML del arnés principal)
node tests/e2e-real/run.mjs --enforce-bugs         # un BUG real documentado cuenta como FAIL
node tests/e2e-real/specs/03_offline_online.mjs    # un spec suelto (lanza su propio emulador)
APP_HTML=@069f9dd node tests/e2e-real/specs/01_tecleo_montos.mjs
```

`APP_HTML` funciona como en el arnés principal: sin definir = `index.html` del árbol; `@baseline` = `0f16ace`; `@<ref-git>` = ese commit
(`@069f9dd` es el `index.html` justo anterior a la PR #57); o una ruta a un `.html` cualquiera (así se validaron los parches).
Código de salida de `run.mjs`: `0` si todo es PASS o BUG documentado (en `--matriz`: si todo coincide con lo esperado); `1` si algo FALLA.

Requisitos: Node 22, Java 11+ (`/usr/bin/java`), Playwright + Chromium ya instalados como en `tests/README.md` (se reutiliza `tests/lib/pw.mjs`)
y acceso al registry npm y a `storage.googleapis.com` solo durante `setup.sh`.

### Variables de entorno

| Variable | Efecto |
|---|---|
| `E2E_HOME` | dónde viven las dependencias (por defecto `/home/user/.e2e-real`; **no** usar `/tmp`) |
| `EMULATOR_VERSION` | versión del emulador (por defecto **1.19.8**; ver «Emulador 1.15.1») |
| `APP_HTML` | HTML bajo prueba (ver arriba) |
| `E2E_ENFORCE_BUGS=1` | los BUG reales documentados hacen fallar el spec (igual que `--enforce-bugs`) |
| `E2E_C2_INTENTOS` | nº de intentos de la «tormenta» del spec 01 (por defecto 3) |
| `E2E_CPU_RATE` | factor de CPU lenta del navegador en el spec 01 (por defecto 1) |

## Cómo está armado

```
tests/e2e-real/
  setup.sh            instala en E2E_HOME: firebase@10.12.0, esbuild, @firebase/rules-unit-testing@3, emuladores 1.19.8 y 1.15.1
  run.mjs             agregador: lanza UN emulador compartido, corre cada spec en su proceso, tabla final, --matriz
  bundle/             fuentes del bundle que reemplaza a gstatic: entry-app.js, entry-firestore.js, auth-stub.js
  lib/env.mjs         rutas, puertos, proyecto (slep-petorca-finanzas-permisos, el de firebaseConfig)
  lib/bundle.mjs      esbuild: empaqueta el SDK REAL (app + firestore comparten un chunk) en E2E_HOME/dist
  lib/emulator.mjs    arranque/limpieza/reglas del emulador, lectura «del servidor» (REST con token owner) y 2.º usuario (SDK real de Node)
  lib/netproxy.mjs    proxy TCP navegador→emulador que se puede CORTAR de verdad (resetea las conexiones) y restablecer
  lib/harness.mjs     boot(): servidor estático + Chromium + page.route + instrumentos (indicador, bitácora de writes/snapshots…)
  lib/spec.mjs        mini-arnés de specs (OK / FALLA por aserción, t.bug(), RESULT:, process.exit(1))
  specs/01…12         los casos (abajo)
  parches/            parches PROPUESTOS para index.html (no aplicados; ver «Hallazgos»)
```

- **El SDK es el real.** `lib/bundle.mjs` empaqueta con esbuild `firebase/app` y `firebase/firestore` 10.12.0 y se sirven con `page.route` en lugar
  de `https://www.gstatic.com/firebasejs/10.12.0/firebase-{app,firestore}.js`. Se reexporta **todo** el SDK (así cualquier nombre que importe
  `index.html` existe). Solo tres cosas cambian: `getFirestore()` hace `connectFirestoreEmulator()` antes de cualquier uso; `setDoc`, `writeBatch`,
  `onSnapshot` y `enableIndexedDbPersistence` se envuelven **solo para llevar una bitácora** en `window.__fb` (writes con su estado, eventos de snapshot con
  `fromCache` / `hasPendingWrites` / nº de cambios) y delegan todo en el SDK (misma promesa, mismos momentos); y `window.__fb` expone `db` y el SDK
  completo (`disableNetwork`, `enableNetwork`…). `firebase-auth.js` es un **stub** (usuario autorizado de `ALLOWED_EMAILS`): el emulador de Auth está fuera de alcance.
- **Persistencia real.** El panel llama a `enableIndexedDbPersistence`: una recarga en el *mismo contexto* de Playwright usa la IndexedDB real
  (caché poblada); un contexto nuevo es un «perfil nuevo sin caché».
- **Cortes de red reales** (los tres se usan en el spec 03): `disableNetwork()` del SDK; `context.setOffline()` (navegador sin red, dispara los eventos
  `online`/`offline` del panel); y un **corte TCP** con el proxy `lib/netproxy.mjs` (las conexiones del SDK se resetean, `navigator.onLine` sigue en `true`: lo
  que ve el SDK cuando el servidor deja de ser alcanzable).
- **«El servidor» se lee por otra vía.** Lo que quedó guardado se verifica con REST contra el emulador (token `owner`), independiente del SDK; el
  `updateTime` de cada documento prueba que el panel *no* escribió. El **segundo usuario** es un cliente del SDK real de Node (sus propios streams).
- **Colector en la página.** Además del `pageerror` de Playwright, un colector instalado antes de cargar nada registra errores no capturados,
  promesas rechazadas y *long tasks* (bloqueos del hilo principal): hubo errores reales que el evento de Playwright no entregó.

## Los specs

| Spec | Qué verifica contra el SDK real |
|---|---|
| `01_tecleo_montos` | F-01: teclear `1500000` con pausas de 100/300/450/600 ms, `12`·pausa·`3`, y con OTRO cliente escribiendo celdas del mismo RBD: el campo y lo guardado en el emulador son exactos; ningún nodo del modal se reemplaza; una «tormenta» de escrituras ajenas (~25/s) no hace retroceder lo tecleado mientras está pendiente (ver hallazgo B1) |
| `02_metadata_cache` | `includeMetadataChanges` con IndexedDB poblada: `[fromCache:true]` + `[fromCache:false sin cambios]`; el indicador pasa a verde; se crea el RBD faltante (solo escalares) **después** del evento de servidor; arranque desde caché sin red (corte real) y vuelta; con el modal abierto y foco en una celda los eventos de metadatos no repintan ni mueven el foco; conteo de repintados = 1 por snapshot con cambios, 0 por metadatos |
| `03_offline_online` | corte por `disableNetwork`, `setOffline` y corte TCP: amarillo «Sin conexión…» (nunca rojo), la cola local retiene 2 ediciones + 1 compra, el servidor no recibe nada, al volver llega el ÚLTIMO valor y la compra UNA vez, verde recién cuando el servidor ya tiene todo; la cola sobrevive a una recarga sin red |
| `04_permisos` | reglas que de verdad rechazan: rojo «N cambios sin guardar» + Reintentar (también en el modal), **1 solo intento en 20 s**, edición conservada, aviso al cerrar; al restablecer reglas y Reintentar vuelve el verde; rechazo parcial (un RBD sí, otro no); lectura rechazada; reglas reales del repo sin token |
| `05_claves_invalidas` | `__x__` y similares los rechaza el panel y el emulador no recibe nada (`updateTime` intacto); control: el SDK real lanza `invalid-argument` síncrono y el servidor responde `400 INVALID_ARGUMENT`; claves válidas en el borde; **diferencia real**: el límite de 1500 bytes es de la ruta (hallazgos B2 y B3) |
| `06_siembra` | PR #56: perfil nuevo + emulador inalcanzable al abrir → NO se escribe nada y al volver la red los 70 documentos siguen idénticos (contenido y `updateTime`); servidor realmente vacío → una sola siembra de 55 documentos, sin `{}` |
| `07_documento_envenenado` | PR #56 con tipos reales: `rem.meses.ENERO="1000"` e `ingreso_items:{x:null}` (tolerados); documentos ilegibles (`lastModifiedAt:{toDate:'x'}`) → rojo que los nombra; números enormes (hallazgo B4) |
| `08_reglas_reales` | `firestore.rules` del repo con `@firebase/rules-unit-testing`: todos los correos de la lista leen/escriben `sep_carga_rbd`, uno no permitido y la sesión anónima no, nadie borra, otras colecciones cerradas; consistencia con `ALLOWED_EMAILS`; observaciones (solo diagnóstico, sin proponer cambios) |
| `09_multi_pestana` | (extra) dos pestañas del mismo perfil: la 2.ª recibe `failed-precondition` al activar IndexedDB y el panel avisa al cerrar con lo no enviado solo en ella |
| `10_mes_cierre` | mes de cierre global (`_meta`) y "Aplicar a todas las entidades" con el SDK real: `setDoc` + `merge` de `mes_cierre` / `mes_cierre_por` / `mes_cierre_en` (hora del servidor) sin pisar `items_22` / `items_29` ni tocar otros documentos (`updateTime`), sobrevive a recargar; UN `writeBatch` real de 69 documentos (138 operaciones ≤ 400) confirmado, el servidor queda con `rem.real_hasta_mes` de los 55 RBD y `otras_fuentes.{fuente}.real_hasta_mes` de todas las entidades en 9, ningún otro campo cambia, repetirlo no escribe nada; un lote rechazado por las reglas es atómico (el servidor no recibe nada), el panel avisa y repetir lo guarda; con las `firestore.rules` reales un correo autorizado que NO es admin SÍ puede escribir `_meta` (la restricción a administradores es solo del cliente: riesgo residual) |
| `11_honorarios` | Honorarios (Subt. 21) por boleta en SEP (PR-1) con el SDK real: alta / edición / borrado de UNA boleta = un `setDoc` con `merge:true` confirmado que toca solo `honorarios.<id>` (tipo como código, montos numéricos, N° DC; borrar = `deleteField` de ese id; el resto del documento y los demás documentos intactos, `updateTime`), otra persona agregando y editando SU boleta en el mismo RBD (merge por id: ninguna pisa a la otra, el panel abierto la muestra sin recargar), proyección por cuenta (agregar, teclear un mes, quitar = `deleteField` de la cuenta, otra persona agregando otra cuenta), recarga con IndexedDB real, y documentos con honorarios dañados que el servidor sí guarda (boleta nula / de texto / número / arreglo, monto «abc», fecha numérica, `honorarios` o `hon_proyeccion` del tipo equivocado, meses de texto, cuenta de proyección fuera del catálogo): el panel los tolera, queda verde, los demás RBD se ven idénticos y no escribe nada |
| `12_jardines_bdl` | «Ajustes de fuentes» con el SDK real: FAEP de un jardín (GESPARVU) y el BDL de su JUNJI = dos `setDoc` con `merge:true` confirmados que tocan solo `otras_fuentes.faep…` y `otras_fuentes.junji.ingreso_bdl…` (el documento ya traía `junji` y `aporte_junji`: nada se pisa, `updateTime` de los demás documentos intacto); otra persona escribe otro mes de FAEP en el mismo jardín y el merge anidado conserva ambos; recarga con IndexedDB real sin escribir; documentos de jardines con `ingreso_bdl` dañado (texto, nulo, arreglo, `meses` de texto, meses con basura) tolerados (verde, 13 jardines, 0 writes, `updateTime` intacto); con los 13 documentos de jardines ausentes no se siembra nada y editar uno lo crea con `merge` |

## Resultados

Emulador 1.19.8, SDK 10.12.0, Chromium headless. «PASS» = todas las aserciones OK; «BUG» = pasa lo que debe pasar pero se reproduce un defecto real documentado
(no falla la suite salvo `--enforce-bugs`); «FAIL» = el spec detecta el defecto.

| Spec | PR #57 (árbol) | `@069f9dd` (antes de la PR) | `@baseline` (0f16ace) |
|---|---|---|---|
| 01 Tecleo de montos | **BUG** (B1; las 52 aserciones de F-01 OK) | **FAIL** (15): `51` con 450/600 ms, `312`, `4`/`412`, nodos reemplazados | — |
| 02 includeMetadataChanges + caché | **PASS** | **FAIL** (13): el RBD faltante no se crea tras recargar; verde con la red cortada | — |
| 03 Offline / online | **PASS** | **FAIL** (26): sigue «Sincronizado» sin conexión y dice verde antes de que el servidor tenga los datos | — |
| 04 permission-denied real | **PASS** | **FAIL** (12): verde + **17 reintentos en 20 s** (uno cada 2 s sin fin), el campo parpadea entre `""` y `4242` | — |
| 05 Claves inválidas | **BUG** (B2, B3) | **FAIL** (17): acepta `__x__`, escrituras de todo el RBD rechazadas | — |
| 06 Siembra (PR #56) | **PASS** | **PASS** | **FAIL** (7): siembra 55 RBD sin red y al volver pisa los datos (ver abajo) |
| 07 Documento envenenado | **BUG** (B4) | **BUG** (B4, preexistente) | **FAIL** (2; y B4) |
| 08 firestore.rules reales | **PASS** | **PASS** | — |
| 09 Dos pestañas | **PASS** | **FAIL** (2): no avisa al cerrar con cambios solo en memoria | — |
| 10 Mes de cierre global | **PASS** | **FAIL** (no existe el control; verificado contra `@a94c2fb`) | — |
| 11 Honorarios por boleta (PR-1) | **PASS** | **FAIL** (4: no existe el registro de honorarios; igual contra `@1f0821b`) | — |
| 12 Jardines en FAEP/FIGA y BDL de JUNJI | **PASS** | **FAIL** (verificado también contra `@ff7a666`: 7 aserciones) | — |

Con las cuatro correcciones propuestas (`parches/TODOS_B1_a_B4.patch`, aplicadas **a una copia**, nunca a `index.html`) los 9 specs quedan en PASS sin BUG.
`node tests/run.mjs` (mocks) sobre copias parcheadas: con B1+B2+B4 las 20 pruebas siguen en PASS; con los cuatro parches solo falla `claves_invalidas` (espera que 1500 bytes sea válido: hay que actualizar ese límite a 1400).

**Siembra en `@baseline` (spec 06):** con el perfil nuevo y el emulador inalcanzable el panel encola la siembra de los 55 RBD (snapshot vacío `fromCache:true`); al volver la red
**sobrescribe los 55 documentos reales**: p. ej. 1121 pasa de 8 compras a 0 y cambian `rem.meses` e `ingreso_items`. Con la PR #56/#57 no se escribe nada y los documentos quedan
idénticos (mismo `updateTime`).

**Documentos «envenenados» de la consigna (spec 07, P1):** `rem.meses.ENERO="1000"` e `ingreso_items:{x:null}` **no dejan el estado en rojo** en ninguna versión de la PR: el panel los tolera
por diseño (`num()` convierte `"1000"` a 1000; `objetoPlano()` y los filtros ignoran el nulo), se pintan los 55 RBD, no se reescribe nada. El rojo que nombra el documento solo aparece cuando
la lectura del documento **lanza** (p. ej. `lastModifiedAt` = mapa con un campo `toDate` que no es función): ese caso sí queda en rojo nombrando exactamente los documentos (P2).

## Diferencias entre el mock y el SDK real (lo que el mock modela mal)

Verificadas con este arnés (o con el código fuente del SDK 10.12.0 citado):

1. **Orden de los snapshots tras una escritura.** El mock emite el eco local con `setTimeout(0)` (sincronizado con `setDoc`). El SDK real aplica el write local en su cola asíncrona
   (transacción de IndexedDB) **detrás** de los eventos remotos ya encolados: entre `setDoc()` y el snapshot con `hasPendingWrites:true` puede llegar un snapshot sin el cambio propio.
   Medido: ventana típica 15–60 ms; con ~25 escrituras ajenas por segundo (cola del SDK saturada), de 3,5 s a 15,9 s. El mock nunca intercala ese snapshot (hallazgo B1).
2. **El límite de 1500 bytes es de la ruta completa de la propiedad, y lo aplica solo el servidor.** El mock rechaza una clave > 1500 bytes de forma síncrona en `setDoc`/`batch.set`.
   El SDK web **no** valida el tamaño (solo clave vacía, `__x__` y `undefined`, que sí lanza síncrono con `invalid-argument`); el servidor rechaza después, de forma **asíncrona**, con
   `INVALID_ARGUMENT: property path is longer than 1500 bytes.` cuando `otras_fuentes.faep.bys_items.<clave>.meses.SEPTIEMBRE` supera 1500 bytes: una clave de 1500 bytes pasa el mock y el panel, no el servidor (B3).
3. **Los errores «transitorios» de escritura no existen para el SDK real.** En 10.12.0 `isPermanentWriteError(code) = isPermanentError(code) && code !== ABORTED`: `unavailable`, `deadline-exceeded`,
   `resource-exhausted`, `aborted`, `internal`, `unauthenticated`, `cancelled` y `unknown` **nunca rechazan** la promesa de `setDoc` (el SDK reintenta él mismo y la promesa queda pendiente; spec 03). Solo rechazan
   `invalid-argument`, `not-found`, `already-exists`, `permission-denied`, `failed-precondition`, `out-of-range`, `unimplemented` y `data-loss`. `failNextWrite('unavailable' | 'deadline-exceeded' | 'resource-exhausted' | 'aborted')`
   del mock produce rechazos que el SDK real jamás entrega: la rama de reintentos con espera creciente (2, 4, 8, 16, 30 s) del panel es **inalcanzable** con el SDK real, y `unauthenticated`
   (que el panel trata como permanente) tampoco rechaza.
4. **Detección de red caída.** El mock pasa a «sin conexión» al instante. Con el SDK real: `disableNetwork()` y `context.setOffline()` son inmediatos (≈20 ms hasta el evento `fromCache:true`: el SDK escucha el evento `offline` del navegador);
   en cambio con un corte TCP sin ese evento (`navigator.onLine` sigue en `true`) el SDK tardó **≈33 s** en emitir `fromCache:true` (reintentos de WebChannel) y durante ese tiempo el indicador dice «Guardando…» (si hay escrituras pendientes)
   o «Sincronizado» (si no).
5. **Reconexión.** Con el mock es instantánea; con el SDK real tarda ≈0,6 s (`enableNetwork` / `setOffline(false)`) y de ≈9 a ≈14 s tras un corte TCP (retroceso exponencial).
6. **Perfil nuevo sin caché y sin red.** El mock entrega el snapshot vacío `fromCache:true` al instante; el SDK real tarda ≈1,5 s con conexión rechazada (hasta 10 s con un servidor que no responde), mientras el panel dice «Iniciando…».
7. **IndexedDB de una sola pestaña.** El SDK real devuelve `failed-precondition` a la 2.ª pestaña (spec 09); el mock no lo modela. Sin IndexedDB lo editado sin conexión vive solo en memoria.
8. **Reglas de seguridad y Auth.** El mock no aplica reglas. El SDK real del navegador con el stub de Auth va **sin token**; las reglas con tokens se probaron aparte (spec 08).
9. **Tráfico auxiliar del SDK.** Cuando un canal WebChannel falla, el SDK pide `https://www.google.com/images/cleardot.gif` para sondear la conectividad: tráfico externo que el arnés con mocks trataría como error (aquí se responde según el estado de la red de prueba).
10. **Ruido de consola.** El SDK real escribe `console.error` («Could not reach Cloud Firestore backend…») cuando se queda sin conexión; el mock es silencioso.
11. **Números enormes y tipos.** El servidor guarda lo que se le manda (números de 1e20, `NaN`, textos, mapas con claves `constructor`/`toString`…): permite probar documentos dañados reales (spec 07); un mock que normaliza los valores los esconde.

## Hallazgos en la PR #57 (con evidencia reproducible y parche propuesto)

> **Estado actual:** los cuatro parches (B1 a B4) ya se aplicaron a `index.html` dentro de la misma PR #57, además de bajar `MONTO_ABS_MAX` de 1e15 a 1e13; el spec 07 (P4) y `claves_invalidas` se ajustaron a esos límites (clave de mapa ≤ 1400 bytes, monto < 1e13). Los `.patch` de `parches/` quedan solo como referencia de lo que se encontró y ya no aplican limpios. Lo que sigue describe el estado ANTES de aplicarlos.

Los parches están en `tests/e2e-real/parches/*.patch` (`git apply --check` los acepta; **no se aplicaron**: se validaron sobre copias de `index.html` con `APP_HTML=<copia>`).

### B1 — Lo ya enviado con `setDoc` y aún no reflejado por el SDK no se superpone al pintar (retroceso transitorio)

`superponerEdicionesSinConfirmar()` superpone `pendingWrites` y `escrituraRetenida`, pero `flushRbdSave()` borra `pendingWrites[rbd]` justo antes de `setDoc`. Mientras el SDK no refleje el write
(ver diferencia 1) un snapshot ajeno reconstruye el modelo sin el cambio propio y la tabla/el total (y la celda si ya perdió el foco) muestran el valor **anterior**.

- Reproducción: `node tests/e2e-real/specs/01_tecleo_montos.mjs` (bloque C2; `E2E_C2_INTENTOS=10` da más intentos). La bitácora cruza el instante del `setDoc` con el del primer snapshot `hasPendingWrites:true` y cuenta
  las muestras del DOM con el valor viejo en esa ventana. Ventana típica 15–60 ms (casi sin efecto visible); con ~25 escrituras ajenas por segundo se reprodujo en 1 de 3 intentos en cada una de las corridas del spec
  (ventanas de 4,3 s a 7,7 s) y en 1 de 10 con 10 intentos (15,9 s): el total y la celda ya editada volvían al valor anterior hasta que el SDK reflejaba el cambio. Es probabilístico: queda como BUG documentado, no como FAIL.
- No lo introdujo la PR: ocurre igual en `@069f9dd`. Lo que la PR sí resuelve es la ventana anterior al envío: mientras lo tecleado está pendiente (debounce de 400 ms) ningún snapshot ajeno lo hace retroceder (aserción dura del spec, 0 regresiones en todas las corridas).
- Gravedad: baja (se corrige solo al llegar el snapshot con el cambio local; no se pierde ningún dato).
- Parche (`B1_edicion_en_vuelo.patch`): mantener `enVuelo[rbd]` (copias de lo enviado) y superponerlo; se borra en el `finally` de `flushRbdSave`. Validado: 10 intentos, 0 regresiones incluso con ventanas de 5,6 s y 15,5 s (sin parche: 1 regresión con 15,9 s).

### B2 — Un dato rechazado por el servidor se retiene y se reenvía con cada edición posterior: bloquea todo el RBD

`flushRbdSave()` mezcla `escrituraRetenida[rbd]` en el payload de **cualquier** edición posterior del mismo RBD. Para un error de permisos eso es razonable; para un error de **dato**
(`invalid-argument`: el dato inválido va dentro de lo retenido) hace que *toda* edición válida de ese RBD también sea rechazada hasta recargar (y recargar descarta lo no guardado).

- Reproducción: `05_claves_invalidas` (bloque D): tras el rechazo de un concepto de 1500 bytes, editar OTRA celda válida del mismo RBD → `intentos: ['rejected']` y el servidor conserva el valor viejo.
- Parche (`B2_retenido_por_dato.patch`): `errorRetenido[rbd]`; si el código es `invalid-argument`/`failed-precondition`, lo retenido solo se reenvía con el botón Reintentar. Validado: la edición válida llega al servidor (`acked`) y el rojo se mantiene por lo retenido.

### B3 — `validarClaveMapa` acepta claves que el servidor rechaza (1451–1500 bytes)

Ver diferencia 2. `validarClaveMapa` y el mock aceptan hasta 1500 bytes; el servidor rechaza si la **ruta** supera 1500 bytes (la ruta más larga del panel añade ≈55 bytes). Con un concepto de 1450–1500 bytes el panel lo muestra, el servidor lo rechaza con `invalid-argument` y,
por B2, el RBD queda bloqueado. Gravedad: muy baja (un concepto de más de 1450 caracteres), pero es exactamente la clase de fallo que F-12 quería evitar.

- Reproducción: `05_claves_invalidas` (bloque D) y, con claves de 1400 bytes, el bloque C (el servidor sí las acepta).
- Parche (`B3_clave_ruta_1500.patch`): `MAX_BYTES_CLAVE_MAPA = 1400`. Hay que actualizar `tests/specs/claves_invalidas.mjs` y el mock (`core.js`: 1500 → 1400, o mejor, modelar el límite sobre la ruta completa).

### B4 — Un monto de 15 dígitos (o un documento con un número enorme) congela el navegador de todos / rompe `aplicarSnapshot` (preexistente)

`ejecucionChartSVG` calcula `yMax` sin tope y llena `yTicks` con `for (v = 0; v <= yMax; v += 25) yTicks.push(v)`; `renderTable → renderEjecucion` lo ejecuta en **cada** snapshot, para todos los usuarios conectados.

| Valor en `rem.meses.ENERO` | Efecto medido |
|---|---|
| 1e12 | sin efecto |
| 1e14 | hilo principal bloqueado ≈1,4 s por repintado |
| 999999999999999 (15 dígitos; **el panel lo acepta**: `MONTO_ABS_MAX` = 1e15, estricto) | bloqueado **30–34 s en cada repintado** (2 por guardado), y en cada navegador que reciba el snapshot, también tras recargar |
| 1e16 | ≈17 s y `RangeError: Invalid string length` |
| 1e17 | la página no responde en > 60 s |
| 1e20 | `RangeError: Invalid array length` en `ejecucionChartSVG` → `aplicarSnapshot` se aborta a medias (no se pintan fuentes, dashboard ni visualizador) **fuera del `try/catch` por documento**, no se actualiza el indicador (queda verde «Sincronizado» sin «última edición») y, combinado con un documento ilegible, **se pierde el rojo que lo nombra** |

- Preexistente: el mismo bucle está en `@069f9dd` y en `@baseline` (el spec 07 reproduce el congelamiento en ambos); la PR #57 introdujo `MONTO_ABS_MAX`, que aún admite 15 dígitos.
- Reproducción: `node tests/e2e-real/specs/07_documento_envenenado.mjs` (P3 y P4).
- Parche (`B4_eje_y_sin_limite.patch`): tope de `yMax` (1000) y valores recortados en `y()`. Validado: sin errores y sin bloqueos (96 ms y 64 ms con 999999999999999; 1e20 sin error; el rojo de P3b se conserva).
  Recomendado además: bajar `MONTO_ABS_MAX` (1e15 no tiene sentido para estos presupuestos) y envolver la fase de pintado de `aplicarSnapshot` en un `try/catch` que deje el indicador en rojo.

> Los cuatro parches juntos (`TODOS_B1_a_B4.patch`): los 9 specs de este arnés quedan en PASS; la suite con mocks (`node tests/run.mjs`) sobre la copia con B1+B2+B4 no cambia (los de B3 requieren ajustar el límite de 1500 en `claves_invalidas`).

### Observaciones de `firestore.rules` (spec 08; solo diagnóstico, sin propuestas)

La lista de correos de `firestore.rules` coincide con `ALLOWED_EMAILS` (19 al escribir esto); `ADMIN_EMAILS` ⊆ lista. Todos leen y escriben `sep_carga_rbd`; nadie puede borrar documentos; las demás colecciones están cerradas. Lo que las reglas **no** hacen:
comparan el correo de forma exacta (distingue mayúsculas); no exigen `email_verified`; no validan el contenido ni los tipos (un correo permitido puede escribir `rem:"texto"`, `compras:[1,2]` o un `lastModifiedBy` que no es suyo: origen posible de los documentos del spec 07);
aceptan cualquier id de documento; y no distinguen administradores (`ADMIN_EMAILS` solo existe en el cliente).

## Emulador 1.15.1 (el pedido) frente a 1.19.8 (el usado)

El `.jar` v1.15.1 se descargó y está accesible, pero **no sirve con el SDK 10.12.0** en cuanto hay caché: al reanudar una escucha con *resume token* el SDK envía `expectedCount` en el `Target` y el emulador responde
`WARNING: Failed to consume the event … InvalidProtocolBufferException: Cannot find field: expectedCount in message google.firestore.v1.Target`. La escucha no recibe respuesta (el SDK dice «Backend didn't respond within 10 seconds»
y el panel queda en «Sin conexión»): fallan toda recarga con caché poblada, `enableNetwork()` tras un corte y el 2.º arranque. `EMULATOR_VERSION=1.15.1 node tests/e2e-real/run.mjs 02 06` lo reproduce (spec 02: 4 FALLA;
spec 06: 1 FALLA) y `run.mjs` imprime un aviso si detecta el mensaje. Por eso el valor por defecto es **1.19.8** (misma URL del bucket; `setup.sh` descarga ambos). Con 1.19.8 todo lo que no depende de reanudar desde caché
se comporta igual en ambos. (No se probaron las versiones intermedias 1.16–1.18.)

## Qué no cubre este arnés

- **Firebase Auth real.** El stub no emite tokens: no se probó el enlace de acceso por correo, la normalización del correo del token ni cómo llegan los claims a las reglas en producción (las reglas se probaron con tokens
  sintéticos de `rules-unit-testing`).
- **El backend de producción.** Es el emulador: no reproduce cuotas, latencias, `resource-exhausted`/`unavailable` reales ni diferencias de límites con producción (el límite de ruta de 1500 bytes y el de 1 MiB se confirmaron solo en el emulador).
- **Otros navegadores / transportes.** Solo Chromium con el transporte por defecto (WebChannel/streaming); no se probó Safari/Firefox, redes con proxy que rompan el streaming (long polling) ni equipos lentos reales (solo `E2E_CPU_RATE`).
- **El resto de la interfaz con el SDK real.** Los modales de otras fuentes (salvo alta de conceptos), importación de Excel, borrados (`deleteField()` en `eliminarCompra`), cierre de sesión con cambios pendientes y el flujo de enlace de acceso siguen cubiertos solo por los mocks.
- **Más de dos usuarios** y la carga real de operación (el 2.º usuario es un cliente del SDK de Node, no otro navegador).
- Las aserciones de tiempo (gracia de 3 s, esperas de detección) dependen de la velocidad de la máquina; los topes son holgados, pero un equipo muy cargado puede dar falsos FAIL.
- **Reproducibilidad de B1:** es probabilístico (depende del orden en la cola del SDK); por eso queda como BUG documentado y no como FAIL.
