import json, re
from collections import defaultdict

def norm(s):
    s = s.upper().strip()
    s = re.sub(r'[ÁÀÄ]', 'A', s); s = re.sub(r'[ÉÈË]', 'E', s)
    s = re.sub(r'[ÍÌÏ]', 'I', s); s = re.sub(r'[ÓÒÖ]', 'O', s)
    s = re.sub(r'[ÚÙÜ]', 'U', s); s = re.sub(r'Ñ', 'N', s)
    s = re.sub(r'[^A-Z0-9 ]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

MANUAL_NAME_MAP = {
    'ESCUELA ARAUCARIA': 14479, 'ESCUELA G-45': 1186, 'ESCUELA LA VIÑA': 1178,
    'ESCUELA SAN LORENZO': 1174, 'ESCUELA VALLE DE ARTIFICIO': 1170,
    'LICEO JOSÉ MANUEL BORGOÑO NUÑEZ': 1148, 'LICEO JOSE MANUEL BORGONO NUNEZ': 1148,
    'ESCUELA BENANCIO PEREZ': 1153, 'ESCUELA CARLOS ARIZTIA RUIZ': 1199,
    'ESCUELA CASAS VIEJAS DE LONGOTOMA': 1131, 'ESCUELA EL CRUCERO': 1185,
    'ESCUELA G-47': 1155, 'ESCUELA HORTENCIA POWELL S.': 1181,
    'ESCUELA LA FRONTERA DE ALICAHUE': 1176, 'ESCUELA LAS CASAS DE HUAQUEN': 1132,
    'ESCUELA LAS PUERTAS': 1172, 'ESCUELA LOS ALAMOS EL SOBRANTE': 1145,
    'ESCUELA LOS ANGELES': 1144, 'ESCUELA LOS HORNOS DE HUAQUEN': 1130,
    'ESCUELA LOS MOLLES': 1190, 'ESCUELA ANEXO PICHILEMU': 12299,
    'ESCUELA NEFTALI REYES BASUALTO': 1150, 'ESCUELA PALQUICO': 1175,
    'ESCUELA PEDEGUA': 1161, 'ESCUELA PICHICUY': 1144, 'ESCUELA POZA VERDE': 1132,
    'ESCUELA PUYANCON': 1136, 'ESCUELA QUEBRADILLA': 1143, 'ESCUELA VILLA SANTA ANA': 1151,
}
# NOTE: original dict has RBD collisions (1132 used for both LAS CASAS DE HUAQUEN and POZA
# VERDE; 1144 used for both LOS ANGELES and PICHICUY) -- these are almost certainly bugs
# in the source map (copy-paste errors), flagged for the user to fix with real RBD codes.

manual_norm = {norm(k): v for k, v in MANUAL_NAME_MAP.items()}

nombre_to_rbd = json.load(open('nombre_to_rbd.json', encoding='utf-8'))
unmatched = json.load(open('unmatched_names.json', encoding='utf-8'))
gasto_sep_raw_dummy = None

# re-run full mapping with manual map added as fallback
gasto_sep_rbd = defaultdict(lambda: defaultdict(float))
still_unmatched = defaultdict(float)

# reload raw per-periodo per-centro (need to recompute since we didn't save raw) -- reuse remuneraciones.py raw structure
import glob, openpyxl
BASE = "/mnt/user-data/uploads/slep-petorca-finance/CARGA/REMUNERACIONES/Educacion P02"
gasto_sep_raw = defaultdict(lambda: defaultdict(float))
files = sorted(glob.glob(f"{BASE}/*/*.xlsx"))
for f in files:
    m = re.search(r'/(20\d{4})/', f)
    periodo = m.group(1) if m else None
    wb = openpyxl.load_workbook(f, data_only=True)
    if 'FuenteCorregida' not in wb.sheetnames:
        continue
    ws = wb['FuenteCorregida']
    headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column+1)]
    try:
        col_centro = headers.index('Centro_Costo') + 1
        col_fuente = headers.index('Fuente') + 1
        col_monto = headers.index('Monto_Corregido') + 1
    except ValueError:
        continue
    for r in range(2, ws.max_row + 1):
        fuente = ws.cell(row=r, column=col_fuente).value
        if fuente != 'PROYECTO SEP':
            continue
        centro = ws.cell(row=r, column=col_centro).value
        monto = ws.cell(row=r, column=col_monto).value or 0
        if centro is None:
            continue
        gasto_sep_raw[periodo][norm(str(centro))] += float(monto)

for periodo, centros in gasto_sep_raw.items():
    for centro_norm, monto in centros.items():
        rbd = nombre_to_rbd.get(centro_norm) or manual_norm.get(centro_norm)
        if rbd:
            gasto_sep_rbd[periodo][str(rbd)] += monto
        else:
            still_unmatched[centro_norm] += monto

print("Periodos:", sorted(gasto_sep_rbd.keys()))
for p in sorted(gasto_sep_rbd.keys()):
    total = sum(gasto_sep_rbd[p].values())
    print(f"  {p}: {len(gasto_sep_rbd[p])} RBDs, total = {total:,.0f}")

print(f"\nAUN sin mapear ({len(still_unmatched)}), monto total:", sum(still_unmatched.values()))
for name, monto in sorted(still_unmatched.items(), key=lambda x:-x[1]):
    print(f"  {name}: {monto:,.0f}")

json.dump({p: dict(v) for p, v in gasto_sep_rbd.items()}, open('gasto_rem_sep.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.dump(dict(still_unmatched), open('still_unmatched.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
