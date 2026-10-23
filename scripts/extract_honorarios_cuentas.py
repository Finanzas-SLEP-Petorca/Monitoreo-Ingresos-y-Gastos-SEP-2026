#!/usr/bin/env python3
"""Extrae del Manual de Cuentas 2026 de SUPEREDUC las cuentas que aceptan documentos de HONORARIOS.

Qué dice el manual y por qué no sirve una sola tabla
-----------------------------------------------------
Los 5 tipos de documento del Libro de Honorarios (Cap. IV, Tabla 02) son BOLH, BHE, BOLHE, BPST y BPSTE. El manual
no tiene una «cuenta de honorarios»: cada cuenta de gasto declara, en el recuadro «Documentos Habilitados» de su
descripción (secciones 9 y 10, págs. 46-111 del PDF, que SÍ es texto extraíble), qué tipos de documento acepta y en qué
«Libro de Rendición» van: «Compras y Otros Gastos», «Honorarios» (solo 410803) o «Compras y Otros Gastos – Honorarios».
La matriz cuenta × tipo de documento de la sección 12 (págs. 120-124) es una IMAGEN: no se puede reextraer con texto.

Qué hace este script
--------------------
  1. Lee el texto de las págs. 46-111 con `pdftotext -layout` (poppler; si no está, con PyMuPDF) y, por cada cuenta de gasto del
     Plan de Cuentas 2026 (data/plan_cuentas_2026.json), toma su recuadro «Subvención Habilitada / Libro de Rendición /
     Documentos Habilitados».
  2. Se queda con las cuentas cuyo recuadro lista AL MENOS UNO de los 5 tipos de honorarios y anota cuáles de los 5 acepta.
  3. Cruza el resultado con el plan de cuentas (cada cuenta debe existir, ser de gasto y estar habilitada en al menos una columna) y
     con la lista que dejó la investigación previa (docs/honorarios_spec.md, sección 3: 35 cuentas). Todo lo que difiera se
     imprime y queda en `observaciones` del JSON (hoy: 411404, que el spec no listaba).
  4. Escribe data/honorarios_cuentas_2026.json (dato normativo versionado: excepción puntual en .gitignore) y, con
     --inyectar index.html, reemplaza el bloque HONORARIOS_CUENTAS_2026 (entre las marcas «honorarios-cuentas-2026:begin/end»):
     así el dashboard (un solo HTML) lleva el catálogo sin leer archivos aparte.
  5. Con --check no escribe nada: verifica que el JSON y el bloque de index.html coinciden con lo que se extraería hoy.

Lo que NO se puede verificar con texto (ver data/honorarios_cuentas_2026_verificacion.md): la matriz de la sección 12. Se revisó A OJO,
renderizando las págs. 122-124 a 260 dpi.

Uso:
    python3 scripts/extract_honorarios_cuentas.py [--pdf RUTA] [--plan data/plan_cuentas_2026.json]
                                                  [--out data/honorarios_cuentas_2026.json] [--inyectar index.html] [--check]

Dependencias: `pdftotext` (poppler-utils) o, si falta, pymupdf. Nada más.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PDF = os.path.join(AQUI, '..', 'Manual-de-Cuentas-2026_baja (5).pdf')
DEFAULT_PLAN = os.path.join(AQUI, '..', 'data', 'plan_cuentas_2026.json')
DEFAULT_OUT = os.path.join(AQUI, '..', 'data', 'honorarios_cuentas_2026.json')
DEFAULT_HTML = os.path.join(AQUI, '..', 'index.html')

# Los 5 tipos del Libro de Honorarios (Manual de Usuario, Cap. IV, Tabla 02), en el orden del manual.
TIPOS_HONORARIOS = [
    ('BOLH', 'Boleta de honorarios manual'),
    ('BHE', 'Boleta de honorarios exenta'),
    ('BOLHE', 'Boleta de honorarios electrónica'),
    ('BPST', 'Boleta honorarios prestación de servicios a terceros'),
    ('BPSTE', 'Boleta honorarios prestación de servicios a terceros electrónica'),
]
CODIGOS_HON = [c for c, _ in TIPOS_HONORARIOS]
# Todos los códigos de documento del manual (Cap. III Tabla 02 + Cap. IV Tabla 02): sirve para no leer palabras sueltas como códigos.
CODIGOS_DOC = {'BOL', 'BOLE', 'FAC', 'FACE', 'ODE', 'BOLEC', 'BOLEX', 'FACEL', 'FACEX', 'FIN', 'DOCEX', 'NOTACRE', 'NOTADEB', 'PLANILLA'} | set(CODIGOS_HON)
PAGINAS_TEXTO = (46, 111)   # secciones 9 y 10 del manual: descripción de cada cuenta (texto extraíble)
# Las 35 cuentas que listó la investigación previa (docs/honorarios_spec.md, sección 3).
LISTA_SPEC = ('410304 410309 410501 410502 410503 410607 410608 410801 410802 410803 410804 410901 410903 410904 410908 410910 410918 '
              '411101 411102 411103 411601 411602 411603 411604 411605 411606 411607 411608 411609 411610 411701 411702 411703 411704 411801').split()
# Observaciones sobre cuentas concretas (se copian al JSON junto con la cuenta).
OBSERVACIONES = {
    '411404': ('No figuraba en la lista de 35 del spec. Su recuadro (pág. 101) dice «Libro de Rendición: Compras y Otros Gastos» pero lista '
               'BOLH, BOLHE, BPST y BPSTE entre los documentos habilitados, y la matriz de la pág. 124 los marca (BOLH, BOLHE, BPST; BPSTE en la columna '
               'cortada de la imagen): se incluye porque el manual la habilita para esos documentos. Sin BHE.'),
    '411801': ('El recuadro (pág. 109) y la matriz (pág. 124, revisada en imagen) coinciden: solo acepta BHE entre los 5 tipos de honorarios '
               '(además de ODE y BOLEX, que no son de honorarios).'),
    '410803': 'Única cuenta cuyo Libro de Rendición es solo «Honorarios»: gastos por contratación de personas naturales para talleres.',
}


def leer_paginas(pdf):
    """Texto de cada página (lista; índice 0 = pág. 1). pdftotext -layout; si no existe, PyMuPDF."""
    if shutil.which('pdftotext'):
        out = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True).stdout.decode('utf-8', 'replace')
        return out.split('\f')
    try:
        import pymupdf  # type: ignore
    except ImportError:
        sys.exit('Falta pdftotext (poppler-utils) o pymupdf para leer el PDF.')
    with pymupdf.open(pdf) as doc:
        return [p.get_text() for p in doc]


RE_ENCABEZADO = re.compile(r'^\s{0,12}(4\d{2}) ?(\d{3})\s{2,}(\S.*?)\s*$')
RE_LIBRO = re.compile(r'^\s*Libro de Rendici[oó]n\s+(.+?)\s*$')
RE_SUBV = re.compile(r'^\s*Subvenci[oó]n\s+Habilitada\s+(.+?)\s*$')
RE_DOCS = re.compile(r'^\s*Documentos(?:\s+Habilitados)?\s{2,}(.+?)\s*$')


def extraer_recuadros(paginas, codigos_gasto):
    """{codigo: {pagina, libro, subvenciones, docs}} para cada cuenta de gasto con recuadro de documentos."""
    lineas = []
    for n, txt in enumerate(paginas, start=1):
        if PAGINAS_TEXTO[0] <= n <= PAGINAS_TEXTO[1]:
            lineas.extend((n, ln) for ln in txt.split('\n'))
    cuentas, cur = {}, None
    for i, (pag, ln) in enumerate(lineas):
        m = RE_ENCABEZADO.match(ln)
        if m and (m.group(1) + m.group(2)) in codigos_gasto:
            cur = {'pagina': pag, 'libro': None, 'subvenciones': None, 'docs': None}
            cuentas[m.group(1) + m.group(2)] = cur
        if not cur:
            continue
        if cur['libro'] is None and (ml := RE_LIBRO.match(ln)):
            cur['libro'] = ml.group(1)
        if cur['subvenciones'] is None and (ms := RE_SUBV.match(ln)):
            cur['subvenciones'] = ms.group(1)
        if cur['docs'] is None and (md := RE_DOCS.match(ln)):
            texto, j = md.group(1), i + 1
            # El recuadro sigue en las líneas siguientes mientras sean solo códigos / guiones (y la etiqueta «Habilitados»).
            while j < len(lineas):
                sig = lineas[j][1].strip()
                if sig and re.fullmatch(r'(Habilitados\s+)?[A-ZÑ\s–\-]+', sig):
                    texto += ' ' + re.sub(r'^Habilitados\s+', '', sig)
                    j += 1
                else:
                    break
            cur['docs'] = [c for c in re.findall(r'[A-Z]{3,8}', texto) if c in CODIGOS_DOC]
    return cuentas


def construir(pdf, plan_path):
    plan = json.load(open(plan_path, encoding='utf-8'))
    gasto = {c['codigo']: c for c in plan['cuentas'] if '410000' <= c['codigo'] < '700000'}
    recuadros = extraer_recuadros(leer_paginas(pdf), set(gasto))
    cuentas, problemas = [], []
    for codigo in sorted(recuadros):
        r = recuadros[codigo]
        if not r['docs']:
            continue
        hon = [c for c in CODIGOS_HON if c in r['docs']]
        if not hon:
            continue
        c = gasto[codigo]
        habilitadas = [k for k, v in c['subvenciones'].items() if v]
        if not habilitadas:
            problemas.append(f'{codigo} acepta honorarios pero no está habilitada en ninguna columna del plan de cuentas')
        solo_hon = (r['libro'] or '').strip().lower() == 'honorarios'
        cuentas.append({
            'codigo': codigo,
            'nombre': c['nombre'],
            'libro': 'honorarios' if solo_hon else 'compras+honorarios',
            'libro_manual': r['libro'],
            'docs': hon,                                  # cuáles de los 5 tipos de honorarios acepta
            'docs_manual': r['docs'],                     # todos los documentos del recuadro
            'pagina_manual': r['pagina'],
            'subvenciones': habilitadas,                  # columnas del plan donde está habilitada (copia de plan_cuentas_2026.json)
            'pertinencia': [k for k, v in c['pertinencia'].items() if v],
            **({'observacion': OBSERVACIONES[codigo]} if codigo in OBSERVACIONES else {}),
        })
    encontradas = {c['codigo'] for c in cuentas}
    solo_en_texto = sorted(encontradas - set(LISTA_SPEC))
    solo_en_spec = sorted(set(LISTA_SPEC) - encontradas)
    if solo_en_spec:
        problemas.append('en el spec pero no en el texto del manual: ' + ', '.join(solo_en_spec))
    datos = {
        'fuente': 'Manual de Cuentas para la Rendición de Recursos Destinados a Educación 2026 (SUPEREDUC), recuadros «Documentos Habilitados» '
                  'de las secciones 9 y 10 (págs. 46-111); matriz de la sección 12 (págs. 120-124) revisada en imagen.',
        'tipos_honorarios': [{'codigo': c, 'nombre': n} for c, n in TIPOS_HONORARIOS],
        'columnas': plan['columnas'],
        'n_cuentas': len(cuentas),
        'cuentas': cuentas,
        'diferencias_con_el_spec': {'solo_en_el_texto': solo_en_texto, 'solo_en_el_spec': solo_en_spec},
    }
    return datos, problemas


def fila_js(c):
    libro = 'H' if c['libro'] == 'honorarios' else 'CH'
    return f"  [{json.dumps(c['codigo'])}, {json.dumps(c['nombre'], ensure_ascii=False)}, {json.dumps(libro)}, {json.dumps(' '.join(c['docs']))}],"


def bloque_html(datos):
    filas = '\n'.join(fila_js(c) for c in datos['cuentas'])
    tipos = ', '.join(f"[{json.dumps(t['codigo'])}, {json.dumps(t['nombre'], ensure_ascii=False)}]" for t in datos['tipos_honorarios'])
    return (
        '// <honorarios-cuentas-2026:begin> — bloque generado por scripts/extract_honorarios_cuentas.py --inyectar (no editar a mano)\n'
        '// Cuentas del Plan 2026 que aceptan documentos de honorarios: [código, nombre, libro (H = solo Honorarios, CH = Compras y Honorarios), tipos de honorarios aceptados].\n'
        f'const HONORARIOS_CUENTAS_2026 = {{\n  tipos: [{tipos}],\n  cuentas: [\n{filas}\n  ],\n}};\n'
        '// <honorarios-cuentas-2026:end>'
    )


RE_BLOQUE = re.compile(r'// <honorarios-cuentas-2026:begin>.*?// <honorarios-cuentas-2026:end>', re.S)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pdf', default=DEFAULT_PDF)
    ap.add_argument('--plan', default=DEFAULT_PLAN)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--inyectar', metavar='INDEX_HTML', nargs='?', const=DEFAULT_HTML, default=None)
    ap.add_argument('--check', action='store_true', help='no escribe: verifica que el JSON y index.html coinciden con la extracción')
    a = ap.parse_args()

    datos, problemas = construir(a.pdf, a.plan)
    print(f"{datos['n_cuentas']} cuentas aceptan documentos de honorarios; diferencias con el spec: {datos['diferencias_con_el_spec']}")
    for p in problemas:
        print('PROBLEMA:', p)
    texto_json = json.dumps(datos, ensure_ascii=False, indent=1) + '\n'
    bloque = bloque_html(datos)

    if a.check:
        mal = bool(problemas)
        actual = open(a.out, encoding='utf-8').read() if os.path.exists(a.out) else ''
        if actual != texto_json:
            print('El JSON NO coincide con la extracción:', a.out)
            mal = True
        html_path = a.inyectar or DEFAULT_HTML
        html = open(html_path, encoding='utf-8').read()
        m = RE_BLOQUE.search(html)
        if not m or m.group(0) != bloque:
            print('El bloque HONORARIOS_CUENTAS_2026 de index.html NO coincide con la extracción')
            mal = True
        print('FALLA' if mal else 'OK: el JSON y index.html coinciden con la extracción')
        sys.exit(1 if mal else 0)

    if problemas:
        sys.exit('Hay problemas: no se escribió nada.')
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(texto_json)
    print('Escrito', os.path.relpath(a.out))
    if a.inyectar:
        html = open(a.inyectar, encoding='utf-8').read()
        if not RE_BLOQUE.search(html):
            sys.exit('index.html no tiene las marcas «honorarios-cuentas-2026:begin/end»: agrégalas donde va el bloque y vuelve a correr.')
        nuevo = RE_BLOQUE.sub(lambda _m: bloque, html, count=1)
        with open(a.inyectar, 'w', encoding='utf-8') as f:
            f.write(nuevo)
        print('Inyectado en', os.path.relpath(a.inyectar))


if __name__ == '__main__':
    main()
