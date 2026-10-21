#!/usr/bin/env bash
# Instala (de forma idempotente) lo que necesita el arnés contra el SDK REAL de Firestore, FUERA del repo:
#   $E2E_HOME (por defecto /home/user/.e2e-real)
#     node_modules/            firebase@10.12.0, esbuild, @firebase/rules-unit-testing@3
#     emulator/cloud-firestore-emulator-v1.19.8.jar (el que se usa) y v1.15.1 (solo para reproducir su incompatibilidad)
# Nada de esto va a git. Re-ejecutarlo no vuelve a descargar lo que ya está.
set -euo pipefail

E2E_HOME="${E2E_HOME:-/home/user/.e2e-real}"
FIREBASE_VERSION="${FIREBASE_VERSION:-10.12.0}"
# 1.19.8 es el que usa el arnés por defecto. 1.15.1 (el pedido originalmente) se descarga también, solo para poder reproducir su
# incompatibilidad con el SDK 10.12.0 (ver README): EMULATOR_VERSION=1.15.1 node tests/e2e-real/run.mjs 02
EMULATOR_VERSIONS="${EMULATOR_VERSIONS:-1.19.8 1.15.1}"
EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-https://storage.googleapis.com/firebase-preview-drop/emulator}"

echo "[setup] E2E_HOME=$E2E_HOME"
mkdir -p "$E2E_HOME/emulator"

# ---------------------------------------------------------------- Java
if ! command -v java >/dev/null 2>&1; then
  echo "[setup] ERROR: no hay 'java' en el PATH (el emulador de Firestore lo necesita; Java 11+)." >&2
  exit 1
fi
java -version 2>&1 | grep -v '^Picked up' | head -1

# ---------------------------------------------------------------- npm
if [ ! -f "$E2E_HOME/package.json" ]; then
  printf '{\n  "name": "e2e-real-deps",\n  "private": true,\n  "description": "Dependencias del arnés tests/e2e-real (fuera del repo)"\n}\n' > "$E2E_HOME/package.json"
fi
falta_npm=0
[ -f "$E2E_HOME/node_modules/firebase/package.json" ] || falta_npm=1
[ -f "$E2E_HOME/node_modules/esbuild/package.json" ] || falta_npm=1
[ -f "$E2E_HOME/node_modules/@firebase/rules-unit-testing/package.json" ] || falta_npm=1
if [ "$falta_npm" = 0 ]; then
  instalada="$(node -p "require('$E2E_HOME/node_modules/firebase/package.json').version")"
  if [ "$instalada" != "$FIREBASE_VERSION" ]; then falta_npm=1; fi
fi
if [ "$falta_npm" = 1 ]; then
  echo "[setup] npm install firebase@$FIREBASE_VERSION esbuild @firebase/rules-unit-testing@3 ..."
  (cd "$E2E_HOME" && npm install --no-audit --no-fund --save-exact "firebase@$FIREBASE_VERSION" esbuild "@firebase/rules-unit-testing@3")
else
  echo "[setup] npm: ya instalado (firebase@$FIREBASE_VERSION)"
fi
echo "[setup] firebase    $(node -p "require('$E2E_HOME/node_modules/firebase/package.json').version")"
echo "[setup] esbuild     $(node -p "require('$E2E_HOME/node_modules/esbuild/package.json').version")"
echo "[setup] rules-unit-testing $(node -p "require('$E2E_HOME/node_modules/@firebase/rules-unit-testing/package.json').version")"

# ---------------------------------------------------------------- emulador de Firestore
for EMULATOR_VERSION in $EMULATOR_VERSIONS; do
  JAR="$E2E_HOME/emulator/cloud-firestore-emulator-v${EMULATOR_VERSION}.jar"
  EMULATOR_URL="$EMULATOR_BASE_URL/cloud-firestore-emulator-v${EMULATOR_VERSION}.jar"
  if [ -s "$JAR" ] && unzip -tq "$JAR" >/dev/null 2>&1; then
    echo "[setup] emulador v$EMULATOR_VERSION: ya descargado ($(du -h "$JAR" | cut -f1))"
  else
    echo "[setup] descargando $EMULATOR_URL ..."
    rm -f "$JAR" "$JAR.part"
    curl -fSL --retry 4 --retry-delay 3 -o "$JAR.part" "$EMULATOR_URL"
    mv "$JAR.part" "$JAR"
    unzip -tq "$JAR" >/dev/null || { echo "[setup] ERROR: el .jar descargado está dañado" >&2; rm -f "$JAR"; exit 1; }
    echo "[setup] emulador v$EMULATOR_VERSION descargado ($(du -h "$JAR" | cut -f1))"
  fi
done

# ---------------------------------------------------------------- Playwright (el mismo del arnés principal)
if node -e "import('$(cd "$(dirname "$0")/.." && pwd)/lib/pw.mjs').then(m=>m.lanzarChromium()).then(b=>b.close()).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})" 2>/dev/null; then
  echo "[setup] Playwright/Chromium: OK"
else
  echo "[setup] AVISO: no se pudo lanzar Chromium con tests/lib/pw.mjs (ver tests/README.md: PLAYWRIGHT_MODULE_PATH / CHROMIUM_PATH)" >&2
fi
echo "[setup] listo. Ejecuta: node tests/e2e-real/run.mjs"
