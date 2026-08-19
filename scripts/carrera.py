import glob, re, json
from collections import defaultdict
import python_calamine

BASE = "/mnt/user-data/uploads/slep-petorca-finance/CARGA/CARRERA DOCENTE EE"

def periodo_from_path(path):
    m = re.search(r'(20\d{2})(\d{2})\.xlsx$', path)
    if m:
        return m.group(1)+m.group(2)
    return None

def to_f(v):
    try:
        return float(v)
    except Exception:
        return 0.0

carrera_docente = defaultdict(lambda: defaultdict(float))  # [periodo][rbd] = total_mes

for f in glob.glob(f"{BASE}/*.xlsx"):
    periodo = periodo_from_path(f)
    if not periodo:
        continue
    wb = python_calamine.CalamineWorkbook.from_path(f)
    ws = wb.get_sheet_by_index(0)
    data = ws.to_python(skip_empty_area=False)
    if not data:
        continue
    headers = data[0]
    # locate columns by prefix match
    def find_col(prefix):
        for i, h in enumerate(headers):
            if h and str(h).strip().lower().startswith(prefix.lower()):
                return i
        return None
    col_rbd = find_col('Rbd')
    col_asig_directa = find_col('Asignación directa alumnos pri')
    col_transf_tramo = find_col('Transferencia directa tramo')
    col_total_transf_recon = find_col('Total transferencia directa reconocimiento')
    if col_rbd is None:
        print(f"  SKIP (no RBD col): {f}")
        continue
    n_rows = 0
    for row in data[1:]:
        if col_rbd >= len(row) or row[col_rbd] in (None, ''):
            continue
        rbd = row[col_rbd]
        rbd = str(int(rbd)) if isinstance(rbd, float) else str(rbd)
        total = 0.0
        if col_asig_directa is not None and col_asig_directa < len(row):
            total += to_f(row[col_asig_directa])
        if col_transf_tramo is not None and col_transf_tramo < len(row):
            total += to_f(row[col_transf_tramo])
        if col_total_transf_recon is not None and col_total_transf_recon < len(row):
            total += to_f(row[col_total_transf_recon])
        carrera_docente[periodo][rbd] += total
        n_rows += 1
    print(f"{f.split('/')[-1]}: periodo={periodo}, filas={n_rows}")

print("\nPeriodos Carrera Docente:", sorted(carrera_docente.keys()))
for p in sorted(carrera_docente.keys()):
    total = sum(carrera_docente[p].values())
    print(f"  {p}: {len(carrera_docente[p])} RBDs, total = {total:,.0f}")

json.dump({p: dict(v) for p, v in carrera_docente.items()}, open('carrera_docente.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
