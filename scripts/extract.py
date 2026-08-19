import glob, re, os, json
from collections import defaultdict
from bs4 import BeautifulSoup
import openpyxl
import python_calamine

BASE = "/mnt/user-data/uploads/slep-petorca-finance/CARGA"
MESES_ES = {1:'enero',2:'febrero',3:'marzo',4:'abril',5:'mayo',6:'junio',7:'julio',8:'agosto',9:'septiembre',10:'octubre',11:'noviembre',12:'diciembre'}

def parse_money(s):
    if s is None:
        return 0.0
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).replace('$', '').replace('.', '').replace(',', '.').strip()
    if not s or s == '-':
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0

# ---------- 1. Canonical RBD <-> Nombre crosswalk from SepPrioritario files ----------
rbd_nombre = {}  # rbd(str) -> nombre
for f in glob.glob(f"{BASE}/SUBVENCIONES/*/Listado_Establecimientos_SepPrioritario*.xls"):
    with open(f, 'rb') as fh:
        content = fh.read()
    soup = BeautifulSoup(content, 'lxml')
    tables = soup.find_all('table')
    if not tables:
        continue
    rows = tables[0].find_all('tr')
    for r in rows[1:]:
        cells = [c.get_text(strip=True) for c in r.find_all(['td','th'])]
        if len(cells) >= 2 and cells[0].isdigit():
            rbd_nombre[cells[0]] = cells[1]

print(f"Crosswalk RBD<->Nombre: {len(rbd_nombre)} establecimientos")

# normalize helper
def norm(s):
    s = s.upper().strip()
    s = re.sub(r'[ÁÀÄ]', 'A', s); s = re.sub(r'[ÉÈË]', 'E', s)
    s = re.sub(r'[ÍÌÏ]', 'I', s); s = re.sub(r'[ÓÒÖ]', 'O', s)
    s = re.sub(r'[ÚÙÜ]', 'U', s); s = re.sub(r'Ñ', 'N', s)
    s = re.sub(r'[^A-Z0-9 ]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

nombre_to_rbd = {norm(v): k for k, v in rbd_nombre.items()}
print(f"Nombres normalizados unicos: {len(nombre_to_rbd)}")
json.dump(rbd_nombre, open('/home/claude/sep_pipeline/rbd_nombre.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.dump(nombre_to_rbd, open('/home/claude/sep_pipeline/nombre_to_rbd.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
