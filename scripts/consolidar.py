"""
Consolidación final del Monitor SEP 70/30 por RBD.

Automatizado (no requiere trabajo manual, se puede re-ejecutar apenas haya nuevos exports):
  - ingreso_sep_rbd.json    <- Ingreso SEP anual por RBD, columna 'TOTAL SEP' de
                               CARGA/Estado_RBD_2026.xlsx (ya es un monto ANUAL, Ley
                               Vigente, no se extrapola). Generado por extract_ingreso_sep.py.
  - gasto_rem_sep.json      <- Remuneraciones SEP reales (FuenteCorregida, PROYECTO SEP)
                               por RBD/mes, generado por remuneraciones.py + apply_manual_map.py.

Manual (se carga a mano en la planilla CARGA_MANUAL_SEP.xlsx, estilo flujo de caja, y se
lee con load_carga_manual.py -> carga_manual_data.json). Si existe, esta fuente REEMPLAZA
a la automatizada para ese RBD (ingreso_por_rbd / rem_por_rbd):
  - Ingreso SEP por RBD, por mes (hoja INGRESO).
  - Gasto Subtítulo 21 / remuneraciones por RBD, por mes (hoja REMUNERACIONES).
  - Gasto Subtítulo 22 y 29 por RBD, por ítem y por mes (hojas SUBT22 / SUBT29).

Nota importante sobre el marco: el marco 70/30 usa SOLO el Ingreso SEP (Prioritarios +
Preferentes), sin sumar Carrera Docente/CPEIP. Se validó así porque el gasto real en
remuneraciones SEP (automatizado) da ~73% de este ingreso — muy cerca del 70% esperado.
Sumar el traspaso CPEIP completo bajaba ese porcentaje a ~33%, señal de que ese traspaso
no corresponde meterlo completo en esta base. Si la definición de "Carrera Docente SEP"
cambia (por ejemplo, tu equipo define un componente específico), este es el punto exacto
del código a ajustar (variable `marco_anual_proy` más abajo).

Este script SIEMPRE debe correrse después de load_carga_manual.py, para tomar la última
versión de los montos que el usuario haya cargado.

Uso: python3 consolidar.py
Salida: consolidado_sep.json, dashboard_sep_data.json
"""
import json

ingreso_sep = json.load(open('ingreso_sep_rbd.json', encoding='utf-8'))
gasto_rem = json.load(open('gasto_rem_sep.json', encoding='utf-8'))
rbd_nombre = json.load(open('rbd_nombre.json', encoding='utf-8'))

try:
    carga_manual = json.load(open('carga_manual_data.json', encoding='utf-8'))
except FileNotFoundError:
    print("ADVERTENCIA: no se encontró carga_manual_data.json — corre primero "
          "'python3 load_carga_manual.py' para leer la planilla de carga manual. "
          "Se continúa con las fuentes 100% automatizadas (sin overrides manuales).")
    carga_manual = {'agregado_por_rbd': {}, 'ingreso_por_rbd': {}, 'rem_por_rbd': {},
                     'fuente_archivo': None, 'fecha_carga': None}

agregado_manual = carga_manual.get('agregado_por_rbd', {})
ingreso_manual = carga_manual.get('ingreso_por_rbd', {})
rem_manual = carga_manual.get('rem_por_rbd', {})

meses = sorted(gasto_rem.keys())
n_meses = len(meses)
factor_anual = 12.0 / n_meses if n_meses else 0
print(f"Meses procesados (remuneraciones reales, automatizado): {meses} ({n_meses} meses)")
print(f"Ingreso SEP: fuente Estado_RBD_2026.xlsx, ya es un monto anual (sin extrapolar)")
print(f"Overrides de carga manual: {len(ingreso_manual)} RBD con ingreso editado, "
      f"{len(rem_manual)} RBD con remuneraciones editadas")

# universo de RBDs: unión de todos los RBD vistos en cualquier fuente, excluyendo
# valores basura (RUTs de sostenedor filtrados, códigos JUNJI de 7+ dígitos sin marco, etc.)
todos_rbds = set(rbd_nombre.keys()) | set(ingreso_sep.keys())
for m in meses:
    todos_rbds |= set(gasto_rem.get(m, {}).keys())
todos_rbds |= set(agregado_manual.keys()) | set(ingreso_manual.keys()) | set(rem_manual.keys())
todos_rbds = {r for r in todos_rbds if r.isdigit() and len(r) <= 6}

registros = []
for rbd in sorted(todos_rbds, key=lambda x: int(x)):
    # Ingreso y remuneraciones: si el RBD tiene override en la planilla de carga manual
    # (hojas INGRESO / REMUNERACIONES), ese total manda. Si no, se usa la fuente automatizada.
    if rbd in ingreso_manual:
        marco_anual_proy = ingreso_manual[rbd]['total']
    else:
        marco_anual_proy = ingreso_sep.get(rbd, 0.0)

    gasto_rem_ytd = sum(gasto_rem.get(m, {}).get(rbd, 0) for m in meses)
    if rbd in rem_manual:
        gasto_rem_anual_proy = rem_manual[rbd]['total']
    else:
        gasto_rem_anual_proy = gasto_rem_ytd * factor_anual

    manual = agregado_manual.get(rbd)
    s22 = manual['gasto_subt22'] if manual else 0
    s29 = manual['gasto_subt29'] if manual else 0

    meta_rem_70 = 0.70 * marco_anual_proy
    meta_bys_30 = 0.30 * marco_anual_proy
    gasto_bys = s22 + s29

    saldo_rem = meta_rem_70 - gasto_rem_anual_proy
    saldo_bys = meta_bys_30 - gasto_bys
    saldo_total = marco_anual_proy - gasto_rem_anual_proy - gasto_bys

    pct_ejec_rem = (gasto_rem_anual_proy / marco_anual_proy * 100) if marco_anual_proy else 0
    pct_ejec_bys = (gasto_bys / marco_anual_proy * 100) if marco_anual_proy else 0
    pct_ejec_total = pct_ejec_rem + pct_ejec_bys

    if pct_ejec_total >= 100:
        estado = 'deficit'
    elif pct_ejec_total >= 90:
        estado = 'riesgo'
    else:
        estado = 'superavit'
    anomalia = marco_anual_proy > 0 and gasto_bys > 3 * marco_anual_proy

    registros.append({
        'rbd': rbd,
        'nombre': rbd_nombre.get(rbd, '(sin nombre)'),
        'marco_anual_proy': round(marco_anual_proy),
        'gasto_rem_ytd': round(gasto_rem_ytd),
        'gasto_rem_anual_proy': round(gasto_rem_anual_proy),
        'gasto_subt22': round(s22),
        'gasto_subt29': round(s29),
        'gasto_bys': round(gasto_bys),
        'meta_rem_70': round(meta_rem_70),
        'meta_bys_30': round(meta_bys_30),
        'saldo_rem': round(saldo_rem),
        'saldo_bys': round(saldo_bys),
        'saldo_total': round(saldo_total),
        'pct_ejec_rem': round(pct_ejec_rem, 1),
        'pct_ejec_bys': round(pct_ejec_bys, 1),
        'pct_ejec_total': round(pct_ejec_total, 1),
        'anomalia': anomalia,
        'estado': estado,
    })

print(f"\nTotal RBDs en el consolidado: {len(registros)}")
activos = [r for r in registros if r['marco_anual_proy'] > 0]
print(f"RBDs con Ingreso SEP > 0 (activos): {len(activos)}")

totales = {
    'marco_anual_proy': sum(r['marco_anual_proy'] for r in activos),
    'gasto_rem_anual_proy': sum(r['gasto_rem_anual_proy'] for r in activos),
    'gasto_subt22': sum(r['gasto_subt22'] for r in activos),
    'gasto_subt29': sum(r['gasto_subt29'] for r in activos),
    'gasto_bys': sum(r['gasto_bys'] for r in activos),
    'saldo_total': sum(r['saldo_total'] for r in activos),
    'n_deficit': sum(1 for r in activos if r['estado'] == 'deficit'),
    'n_riesgo': sum(1 for r in activos if r['estado'] == 'riesgo'),
    'n_superavit': sum(1 for r in activos if r['estado'] == 'superavit'),
    'n_anomalias': sum(1 for r in activos if r['anomalia']),
}
pct_rem_global = (totales['gasto_rem_anual_proy'] / totales['marco_anual_proy'] * 100) if totales['marco_anual_proy'] else 0
print("\nTotales agregados (RBD activos):")
for k, v in totales.items():
    print(f"  {k}: {v:,.0f}" if isinstance(v, (int, float)) and k not in ('n_deficit', 'n_riesgo', 'n_superavit', 'n_anomalias') else f"  {k}: {v}")
print(f"  % ejecución remuneraciones (global, vs meta 70%): {pct_rem_global:.1f}%")

out = {
    'meses': meses,
    'n_meses': n_meses,
    'ultimo_mes': meses[-1] if meses else None,
    'registros': activos,
    'totales': totales,
    'fuente_marco': {
        'tipo': 'Estado_RBD_2026.xlsx (columna TOTAL SEP, monto anual directo); '
                'reemplazado por la hoja INGRESO de la carga manual si el RBD tiene override',
        'incluye_carrera_docente': False,
    },
    'fuente_carga_manual': {
        'archivo': carga_manual.get('fuente_archivo'),
        'fecha_carga': carga_manual.get('fecha_carga'),
        'n_rbd_ingreso_override': len(ingreso_manual),
        'n_rbd_rem_override': len(rem_manual),
    },
}

json.dump(out, open('consolidado_sep.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.dump(out, open('dashboard_sep_data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print("\nGuardado: consolidado_sep.json, dashboard_sep_data.json")
