import glob, re, json
from collections import defaultdict
from bs4 import BeautifulSoup

BASE = "/mnt/user-data/uploads/slep-petorca-finance/CARGA"

def norm(s):
    s = s.upper().strip()
    s = re.sub(r'[ÁÀÄ]', 'A', s); s = re.sub(r'[ÉÈË]', 'E', s)
    s = re.sub(r'[ÍÌÏ]', 'I', s); s = re.sub(r'[ÓÒÖ]', 'O', s)
    s = re.sub(r'[ÚÙÜ]', 'U', s); s = re.sub(r'Ñ', 'N', s)
    s = re.sub(r'[^A-Z0-9 ]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def parse_money(s):
    if s is None: return 0.0
    if isinstance(s, (int, float)): return float(s)
    s = str(s).replace('$', '').replace('.', '').replace(',', '.').strip()
    if not s or s == '-': return 0.0
    try: return float(s)
    except Exception: return 0.0

def periodo_from_path(path):
    m = re.search(r'(20\d{4})', path)
    return m.group(1) if m else None

# marco_sep[periodo][rbd] = {'prioritario':..., 'preferente':...}
marco_sep = defaultdict(lambda: defaultdict(lambda: {'prioritario':0.0, 'preferente':0.0}))

for f in glob.glob(f"{BASE}/SUBVENCIONES/*/Listado_Establecimientos_Sep*.xls"):
    periodo = periodo_from_path(f)
    tipo = 'prioritario' if 'SepPrioritario' in f else 'preferente'
    with open(f, 'rb') as fh:
        content = fh.read()
    soup = BeautifulSoup(content, 'lxml')
    tables = soup.find_all('table')
    if not tables:
        continue
    rows = tables[0].find_all('tr')
    for r in rows[1:]:
        cells = [c.get_text(strip=True) for c in r.find_all(['td','th'])]
        if len(cells) >= 3 and cells[0].isdigit():
            rbd = cells[0]
            monto = parse_money(cells[2])
            marco_sep[periodo][rbd][tipo] += monto

print("Periodos SEP marco encontrados:", sorted(marco_sep.keys()))
for p in sorted(marco_sep.keys()):
    total = sum(v['prioritario']+v['preferente'] for v in marco_sep[p].values())
    print(f"  {p}: {len(marco_sep[p])} RBDs, total = {total:,.0f}")

json.dump({p: dict(v) for p, v in marco_sep.items()}, open('marco_sep.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
