#!/usr/bin/env python3
"""Extrae la matriz "Plan de Cuentas Rendición Recursos 2026" del Manual de Cuentas de SUPEREDUC.

La tabla (sección 11, páginas 112-119 del PDF) es una IMAGEN, no texto: cada fila es una cuenta
con un ✓ en cada subvención/columna donde está habilitada y, a veces, un punto rojo ● que marca
"habilitación sujeta a exigencias de pertinencia" (leyenda de la pág. 112). Este script:

  1. Renderiza las páginas a 300 dpi y detecta la grilla (líneas verticales/horizontales) con numpy.
  2. Lee código, nombre y dependencia con OCR (RapidOCR) POR COLUMNA COMPLETA (mucho más fiable
     que por celda) y los alinea con las filas por su coordenada Y.
  3. Detecta los ✓ y los ● por ANÁLISIS DE PÍXELES de cada celda (tinta oscura / píxeles rojos),
     no por OCR — es lo que decide qué subvención admite qué cuenta.
  4. Corrige los nombres con el texto extraíble de las secciones 9 y 10 del mismo manual (tildes).
  5. Escribe data/plan_cuentas_2026.json (dato de referencia versionado: excepción puntual en .gitignore) y, con --debug-dir,
     imágenes de control superpuestas.
  6. Con --inyectar index.html, reemplaza el bloque PLAN_CUENTAS_2026 de index.html (entre las
     marcas "plan-cuentas-2026:begin/end") por la matriz recién extraída: es la forma en que el
     dashboard (un solo HTML) lleva la matriz, sin leer archivos aparte.

Uso:
    python3 scripts/extract_plan_cuentas.py [--pdf RUTA] [--out data/plan_cuentas_2026.json]
                                            [--debug-dir DIR] [--inyectar index.html]

Dependencias: pymupdf, numpy, pillow, rapidocr-onnxruntime.
La verificación contra el catálogo de SEP y las demás comprobaciones se documentan en
data/plan_cuentas_2026_verificacion.md.
"""
import argparse
import difflib
import json
import os
import re
import sys
import unicodedata

import numpy as np
import pymupdf
from PIL import Image, ImageDraw
from rapidocr_onnxruntime import RapidOCR

Image.MAX_IMAGE_PIXELS = None

DEFAULT_PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Manual-de-Cuentas-2026_baja (5).pdf')
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'plan_cuentas_2026.json')

PAGES = list(range(112, 120))      # 1-indexed: la tabla del plan de cuentas
TEXT_PAGES = range(25, 112)        # secciones 9 y 10: descripción de cuentas (texto extraíble)
DPI = 300

# Orden de las 9 columnas de ✓ (después de número, nombre y dependencia).
COLUMNAS = ['general', 'adm_central_general', 'sep', 'adm_central_sep', 'pie',
            'mantenimiento', 'proretencion', 'internado', 'refuerzo']
DEPENDENCIAS = ['M-CM-PS-SLEP', 'M-CM-SLEP', 'M-CM-PS', 'M-CM', 'PS', 'M', 'CM', 'SLEP']

INK_MIN = 40        # píxeles oscuros mínimos en la celda para considerar que hay un ✓ (un ✓ real tiene 77-115)
RED_MIN = 40        # píxeles rojos mínimos para considerar que hay un ● (un punto real tiene 90-130; el ruido JPEG llega a ~19)


def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.upper().replace('º', 'O').replace('°', 'O').replace('ª', 'A')
    return re.sub(r'[^A-Z0-9]', '', s)


def clusters(idx, gap=3):
    out = []
    for i in idx:
        if out and i - out[-1][-1] <= gap:
            out[-1].append(i)
        else:
            out.append([i])
    return [(int(c[0]), int(c[-1])) for c in out]


def render(doc, page_no):
    pix = doc[page_no - 1].get_pixmap(dpi=DPI)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3].astype(int)


def detect_grid(im):
    """Devuelve (xs, hl): 13 centros de líneas verticales y los clusters (ymin, ymax) de las
    horizontales. Un cluster grueso es la banda azul oscura de título (300000 INGRESOS / 400000 GASTOS)."""
    dark = im.mean(axis=2) < 120
    H, W = dark.shape
    hl = clusters(np.where(dark.sum(axis=1) >= 0.55 * W)[0])
    y0, y1 = hl[0][0], hl[-1][1]
    vl = clusters(np.where(dark[y0:y1 + 1].sum(axis=0) >= 0.90 * (y1 - y0))[0])
    xs = [(a + b) / 2 for a, b in vl]
    if len(xs) != 13:
        raise RuntimeError(f'se esperaban 13 líneas verticales y hay {len(xs)}')
    return xs, hl


def rows_from_grid(hl):
    """Filas (ya, yb, tipo) en orden. tipo: 'header' | 'banda' | 'fila'."""
    rows = []
    for k in range(len(hl) - 1):
        a, b = hl[k], hl[k + 1]
        ya = a[1] + 2
        yb = b[0] - 2
        if a[1] - a[0] > 20:                       # la banda gruesa precede a esta fila
            rows.append((a[0], a[1], 'banda'))
        if b[1] - b[0] > 20:                       # la fila termina donde empieza la banda
            yb = b[0] - 2
        if yb - ya >= 20:
            rows.append((ya, yb, 'fila'))
    if hl[-1][1] - hl[-1][0] > 20:
        rows.append((hl[-1][0], hl[-1][1], 'banda'))
    rows.sort()
    out = []
    for i, (ya, yb, t) in enumerate(rows):
        out.append((ya, yb, 'header' if i == 0 else t))
    return out


_OCR = None


def ocr_column(im, xa, xb, y0, y1, invert=False, scale=2):
    """OCR de toda una columna; devuelve [(ycentro, xmin, texto, conf)]."""
    global _OCR
    if _OCR is None:
        _OCR = RapidOCR()
    crop = im[y0:y1, int(xa) + 3:int(xb) - 3].astype('uint8')
    if invert:
        crop = 255 - crop
    img = Image.fromarray(crop)
    img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
    res, _ = _OCR(np.asarray(img))
    out = []
    for box, txt, conf in (res or []):
        ys = [p[1] for p in box]
        xsb = [p[0] for p in box]
        out.append(((min(ys) + max(ys)) / 2 / scale + y0, min(xsb) / scale, txt, float(conf)))
    return sorted(out)


def ocr_cell_code(im, xs, ya, yb):
    """Relectura de UNA celda de código con relleno blanco y 3x de zoom (más fiable que la columna entera
    cuando el OCR por columna se equivoca en un dígito)."""
    global _OCR
    if _OCR is None:
        _OCR = RapidOCR()
    cell = im[max(0, ya - 6):yb + 6, int(xs[0]) + 3:int(xs[1]) - 3].astype('uint8')
    img = Image.fromarray(cell).resize((cell.shape[1] * 3, cell.shape[0] * 3), Image.LANCZOS)
    pad = Image.new('RGB', (img.width + 80, img.height + 80), (255, 255, 255))
    pad.paste(img, (40, 40))
    res, _ = _OCR(np.asarray(pad))
    return re.sub(r'\D', '', res[0][1]) if res else ''


def texts_for_rows(boxes, rows):
    """Junta los textos OCR cuyo centro Y cae dentro de cada fila (ordenados por X)."""
    res = []
    for ya, yb, _ in rows:
        parts = sorted((b for b in boxes if ya <= b[0] <= yb), key=lambda b: b[1])
        res.append((' '.join(p[2] for p in parts).strip(), min([p[3] for p in parts], default=0.0)))
    return res


def row_kind(im, xs, ya, yb):
    """'categoria' si la fila tiene fondo gris (celda de dependencia vacía y gris); si no, 'cuenta'."""
    patch = im[ya + 3:yb - 3, int(xs[2]) + 6:int(xs[3]) - 6]
    med = np.median(patch.reshape(-1, 3), axis=0)
    if 150 <= med.mean() <= 238 and abs(med[0] - med[2]) < 12:
        return 'categoria'
    return 'cuenta'


def cell_flags(im, xs, ya, yb):
    """Para cada una de las 9 columnas: (ink, red) píxeles dentro de la celda."""
    out = []
    for c in range(9):
        xa, xb = xs[3 + c], xs[4 + c]
        cell = im[ya + 3:yb - 3, int(xa) + 4:int(xb) - 4]
        r, g, b = cell[:, :, 0], cell[:, :, 1], cell[:, :, 2]
        red = int(((r > 170) & (g < 110) & (b < 110)).sum())
        ink = int((((r + g + b) / 3 < 130) & ~((r > 170) & (g < 110) & (b < 110))).sum())
        out.append((ink, red))
    return out


def parse_manual_names(doc):
    """(nombres, codigos_conocidos) a partir del texto de las secciones 9 y 10 y del índice.
    nombres: code -> [líneas candidatas] de TODAS las apariciones ("310 101" + nombre en la línea
    siguiente, o nombre en la misma línea como en el índice). codigos_conocidos: set de códigos."""
    names, known = {}, set()
    for p in range(2, 112):
        lines = [l.strip() for l in doc[p - 1].get_text().split('\n')]
        for i, l in enumerate(lines):
            m = re.match(r'^(\d{3})\s?(\d{3})\b\s*(.*)$', l)
            if not m:
                continue
            code = m.group(1) + m.group(2)
            known.add(code)
            cand = names.setdefault(code, [])
            if m.group(3):
                cand.append(m.group(3))
            if i + 1 < len(lines) and lines[i + 1] and not re.match(r'^\d{3}\s?\d{3}\b', lines[i + 1]):
                cand.append(lines[i + 1])
                if i + 2 < len(lines) and lines[i + 2] and not re.match(r'^\d{3}\s?\d{3}\b', lines[i + 2]):
                    cand.append(lines[i + 1] + ' ' + lines[i + 2])
    return names, known



def build_vocab(doc):
    """norm(palabra) -> forma MAYÚSCULA con tildes más frecuente en el texto del manual."""
    from collections import Counter, defaultdict
    cnt = defaultdict(Counter)
    for p in range(2, 112):
        for w in re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", doc[p - 1].get_text()):
            cnt[norm(w)][w.upper()] += 1
    vocab = {}
    for n, c in cnt.items():
        if not n:
            continue
        # a igualdad de frecuencia, prefiere la forma con tilde
        vocab[n] = sorted(c.items(), key=lambda kv: (-kv[1], kv[0] == norm(kv[0])))[0][0]
    return vocab


def segment(n, vocab):
    """Parte un token pegado ('PAGOBONODEESCOLARIDAD') en palabras del vocabulario (DP, mín. piezas)."""
    best = {0: []}
    for i in range(1, len(n) + 1):
        cand = None
        for j in range(max(0, i - 25), i):
            if j in best and (n[j:i] in vocab) and (i - j >= 2 or n[j:i] in ('Y', 'O', 'A', 'E', 'U')):
                c = best[j] + [n[j:i]]
                if cand is None or len(c) < len(cand):
                    cand = c
        if cand is not None:
            best[i] = cand
    return best.get(len(n))


def fix_ocr_name(txt, vocab):
    """Corrige un nombre leído por OCR: tildes, palabras pegadas y errores de letra, con el vocabulario del manual."""
    out = []
    for part in re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", txt or ''):
        if not re.match(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', part):
            out.append(part)
            continue
        n = norm(part)
        if n in vocab:
            out.append(vocab[n])
        elif len(n) >= 10 and segment(n, vocab):
            out.append(' '.join(vocab[w] for w in segment(n, vocab)))
        else:
            m = difflib.get_close_matches(n, list(vocab), n=1, cutoff=0.85)
            out.append(vocab[m[0]] if m else part.upper())
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def plausible(d, prev, known):
    """Un código OCR es plausible si tiene 6 dígitos, parte con 3/4/7/8/9 y es conocido por el manual
    o continúa la familia (mismos 4 primeros dígitos, mayor) del código anterior de la página."""
    if len(d) != 6 or d[0] not in '34789':
        return False
    if d in known:
        return True
    return prev is not None and d > prev and d[:4] == prev[:4]


def fix_codes(raws, known):
    """Revisa los códigos OCR de una página (en orden). Solo corrige los que NO son plausibles: elige el
    código conocido con hamming <= 2, mayor que el anterior y lo más cercano por debajo del siguiente
    código plausible. Devuelve (codigos, [(desde, hasta)])."""
    out, corr, prev = [], [], None
    for i, raw in enumerate(raws):
        if raw is None:                       # banda de título: no participa
            out.append(None)
            continue
        if plausible(raw, prev, known):
            out.append(raw)
            prev = raw
            continue
        nxt = next((r for r in raws[i + 1:] if r and len(r) == 6 and r[0] in '34789'), None)
        cands = []
        if len(raw) == 6:
            for k in known:
                h = sum(x != y for x, y in zip(raw, k))
                if h <= 2 and k[0] in '34789' and (prev is None or k > prev) and (nxt is None or k < nxt):
                    cands.append((h, k))
        if cands:
            best_h = min(h for h, _ in cands)
            fixed = max(k for h, k in cands if h == best_h)
            out.append(fixed)
            corr.append((raw, fixed))
            prev = fixed
        else:
            out.append(raw)                   # se deja tal cual; validar() lo marcará
            corr.append((raw, None))
    return out, corr


def best_name(ocr_name, code, manual):
    """Devuelve (nombre, origen, ratio). Prefiere el texto del manual (con tildes) si coincide."""
    cands = manual.get(code, [])
    n_ocr = norm(ocr_name)
    if not n_ocr and cands:
        # el OCR no leyó nada: se toma la línea de nombre más repetida entre las apariciones del código
        from collections import Counter
        top = Counter(c.strip().rstrip('.').strip() for c in cands if len(norm(c)) >= 6).most_common(1)
        if top:
            return top[0][0].upper(), 'manual', 0.5
    best = (ocr_name, 'ocr', 0.0)
    for c in cands:
        r = difflib.SequenceMatcher(None, n_ocr, norm(c)).ratio()
        if r > best[2]:
            best = (c.strip().rstrip('.').strip(), 'manual', r)
    if best[1] == 'manual' and best[2] >= 0.85:
        # la tabla del PDF va en mayúsculas; el manual (texto) mezcla mayúsculas/minúsculas
        return best[0].upper(), best[1], best[2]
    return (ocr_name, 'ocr', best[2])


def snap_dependencia(txt):
    t = re.sub(r'[^A-Z\-]', '', (txt or '').upper().replace(' ', '').replace('–', '-'))
    if t in DEPENDENCIAS:
        return t, True
    best = max(DEPENDENCIAS, key=lambda d: difflib.SequenceMatcher(None, t, d).ratio())
    return best, difflib.SequenceMatcher(None, t, best).ratio() >= 0.8


def extract(pdf, debug_dir=None):
    doc = pymupdf.open(pdf)
    manual, known = parse_manual_names(doc)
    vocab = build_vocab(doc)
    corregidos, reread = [], []
    categorias, cuentas, titulos, problemas = [], [], [], []
    stats = {}
    cat_actual = None
    for page in PAGES:
        im = render(doc, page)
        xs, hl = detect_grid(im)
        rows = rows_from_grid(hl)
        ytop, ybot = rows[1][0] if rows[0][2] == 'header' else rows[0][0], rows[-1][1]
        body = [r for r in rows if r[2] != 'header']
        codes = texts_for_rows(ocr_column(im, xs[0], xs[1], ytop, ybot), body)
        names = texts_for_rows(ocr_column(im, xs[1], xs[2], ytop, ybot), body)
        deps = texts_for_rows(ocr_column(im, xs[2], xs[3], ytop, ybot), body)
        n_cuentas = n_cat = 0
        raws, prev_ok = [], None
        for r, c in zip(body, codes):
            if r[2] == 'banda':
                raws.append(None)
                continue
            raw = re.sub(r'\D', '', c[0])
            if not plausible(raw, prev_ok, known):
                raw2 = ocr_cell_code(im, xs, r[0], r[1])
                if plausible(raw2, prev_ok, known):
                    reread.append((page, raw, raw2))
                    raw = raw2
            raws.append(raw)
            if plausible(raw, prev_ok, known):
                prev_ok = raw
        fixed_codes, corr = fix_codes(raws, known)
        corregidos.extend((page, d, h) for d, h in corr)
        dbg = Image.fromarray(im.astype('uint8')) if debug_dir else None
        draw = ImageDraw.Draw(dbg) if dbg else None
        for (ya, yb, tipo), (ctxt, cconf), (ntxt, nconf), (dtxt, dconf), fcode in zip(body, codes, names, deps, fixed_codes):
            if tipo == 'banda':
                # banda azul oscura: texto blanco -> se lee invirtiendo los colores
                cb = texts_for_rows(ocr_column(im, xs[0], xs[1], ya, yb, invert=True), [(ya, yb, 'banda')])[0][0]
                nb = texts_for_rows(ocr_column(im, xs[1], xs[2], ya, yb, invert=True), [(ya, yb, 'banda')])[0][0]
                titulos.append({'codigo': re.sub(r'\D', '', cb), 'nombre': nb.strip(), 'pagina': page})
                continue
            code = fcode
            kind = row_kind(im, xs, ya, yb)
            flags = cell_flags(im, xs, ya, yb)
            nombre, origen, ratio = best_name(ntxt, code, manual)
            if origen == 'ocr':
                nombre = fix_ocr_name(ntxt, vocab)
            rec_problem = []
            if len(code) != 6:
                rec_problem.append(f'código OCR no válido: {ctxt!r}')
            if kind == 'categoria':
                n_cat += 1
                if any(i >= INK_MIN for i, _ in flags):
                    rec_problem.append('categoría con ✓ detectados')
                categorias.append({'codigo': code, 'nombre': nombre, 'pagina': page,
                                   **({'revisar': True} if rec_problem else {})})
                cat_actual = code
                if rec_problem:
                    problemas.append((page, code, rec_problem))
                continue
            n_cuentas += 1
            dep, dep_ok = snap_dependencia(dtxt)
            if not dep_ok:
                rec_problem.append(f'dependencia dudosa: {dtxt!r} -> {dep}')
            if not nombre:
                rec_problem.append('nombre vacío (OCR no pudo leerlo)')
            sub = {k: flags[i][0] >= INK_MIN for i, k in enumerate(COLUMNAS)}
            per = {k: flags[i][1] >= RED_MIN for i, k in enumerate(COLUMNAS)}
            for i, k in enumerate(COLUMNAS):
                ink, red = flags[i]
                if per[k] and not sub[k]:
                    rec_problem.append(f'● sin ✓ en {k}')
                if 5 <= ink < 60 or 20 <= red < 60:
                    rec_problem.append(f'medición ambigua en {k}: tinta={ink}, rojo={red}')
            rec = {'codigo': code, 'nombre': nombre, 'categoria': cat_actual, 'dependencia': dep,
                   'subvenciones': sub, 'pertinencia': per, 'pagina': page}
            if origen == 'ocr':
                rec['nombre_ocr'] = True
            if rec_problem:
                rec['revisar'] = True
                problemas.append((page, code, rec_problem))
            cuentas.append(rec)
            if draw is not None:
                draw.text((int(xs[0]) + 4, ya + 4), code, fill=(0, 0, 255))
                for i, k in enumerate(COLUMNAS):
                    if sub[k]:
                        xa, xb = xs[3 + i], xs[4 + i]
                        col = (255, 0, 0) if per[k] else (0, 160, 0)
                        draw.rectangle([int(xa) + 3, ya + 2, int(xb) - 3, yb - 2], outline=col, width=3)
        stats[page] = {'filas': len(body), 'categorias': n_cat, 'cuentas': n_cuentas}
        if dbg is not None:
            os.makedirs(debug_dir, exist_ok=True)
            dbg.resize((dbg.width // 2, dbg.height // 2)).save(os.path.join(debug_dir, f'control_p{page}.png'))
    return categorias, cuentas, titulos, stats, problemas, corregidos, reread


def validar(categorias, cuentas):
    errores = []
    vistos = set()
    ult = {}
    for c in cuentas:
        if c['codigo'] in vistos:
            errores.append(f"código duplicado {c['codigo']}")
        vistos.add(c['codigo'])
        cat = c['categoria']
        if cat and c['codigo'][:4] != cat[:4] and not (cat[:1] in '89' and c['codigo'][:3] == cat[:3]):
            errores.append(f"{c['codigo']} no pertenece a su categoría {cat}")
        if cat in ult and c['codigo'] <= ult[cat]:
            errores.append(f"{c['codigo']} no es creciente dentro de {cat}")
        ult[cat] = c['codigo']
    return errores


MARCA_INI = '// <plan-cuentas-2026:begin> — bloque generado por scripts/extract_plan_cuentas.py --inyectar (no editar a mano)'
MARCA_FIN = '// <plan-cuentas-2026:end>'


def bloque_js(out):
    """Literal JS compacto de la matriz: una cuenta por línea [codigo, nombre, dependencia, flags].

    flags = 1 carácter por columna (en el orden de `columnas`): 'x' = ✓ habilitada,
    'R' = ✓ con punto rojo ● (sujeta a pertinencia), '.' = no habilitada. La categoría de cada
    cuenta se deduce del código (primeros 4 dígitos + '00'; lo comprueba validar()).
    """
    j = lambda v: json.dumps(v, ensure_ascii=False)
    lineas = [MARCA_INI, 'const PLAN_CUENTAS_2026 = {',
              f"  fuente: {j(out['fuente'])},",
              f"  columnas: {j(out['columnas'])},",
              '  // código de categoría -> nombre (la categoría de una cuenta es codigo.slice(0, 4) + "00")',
              '  categorias: {']
    lineas += [f"    {j(c['codigo'])}: {j(c['nombre'])}," for c in out['categorias']]
    lineas += ['  },',
               '  // [código, nombre, dependencia, flags por columna: x = ✓, R = ✓ + ● (pertinencia), . = no]',
               '  cuentas: [']
    for c in out['cuentas']:
        fl = ''.join('R' if c['pertinencia'][k] else ('x' if c['subvenciones'][k] else '.') for k in out['columnas'])
        lineas.append(f"    [{j(c['codigo'])}, {j(c['nombre'])}, {j(c['dependencia'])}, {j(fl)}],")
    lineas += ['  ],', '};', MARCA_FIN]
    return '\n'.join(lineas)


def inyectar(html_path, out):
    with open(html_path, encoding='utf-8') as f:
        html = f.read()
    i = html.find('// <plan-cuentas-2026:begin>')
    j = html.find(MARCA_FIN)
    if i < 0 or j < 0 or j < i:
        sys.exit(f'{html_path}: faltan las marcas plan-cuentas-2026:begin/end')
    nuevo = html[:i] + bloque_js(out) + html[j + len(MARCA_FIN):]
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    print(f'{html_path}: bloque PLAN_CUENTAS_2026 actualizado ({len(out["cuentas"])} cuentas)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf', default=DEFAULT_PDF)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--debug-dir', default=None, help='carpeta para imágenes de control superpuestas')
    ap.add_argument('--inyectar', default=None, metavar='INDEX_HTML',
                    help='reemplaza el bloque PLAN_CUENTAS_2026 de este index.html por la matriz extraída')
    args = ap.parse_args()
    categorias, cuentas, titulos, stats, problemas, corregidos, reread = extract(args.pdf, args.debug_dir)
    errores = validar(categorias, cuentas)
    out = {
        'fuente': 'Manual de Cuentas para la Rendición de Recursos Destinados a Educación 2026 (SUPEREDUC), sección 11, págs. 112-119',
        'columnas': COLUMNAS,
        'leyenda': {'subvenciones': '✓ cuenta habilitada para esa subvención/columna',
                    'pertinencia': '● (punto rojo) habilitación sujeta a exigencias de pertinencia y consideraciones señaladas en la descripción de cada cuenta (secciones 9 y 10 del manual)'},
        'titulos': titulos, 'categorias': categorias, 'cuentas': cuentas,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    if not errores and args.inyectar:
        inyectar(args.inyectar, out)
    print('por página:', json.dumps(stats))
    print(f'categorías: {len(categorias)} | cuentas: {len(cuentas)} | títulos: {[t["codigo"] for t in titulos]}')
    print(f'códigos releídos celda a celda (página, columna->celda): {reread}')
    print(f'códigos corregidos por conjetura contra el manual: {corregidos}')
    print(f'filas a revisar: {len(problemas)}')
    for p in problemas:
        print('  ', p)
    if errores:
        print('ERRORES DE VALIDACIÓN:')
        for e in errores:
            print('  ', e)
        sys.exit(1)


if __name__ == '__main__':
    main()
