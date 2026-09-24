import os
import sys
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import json
import glob
from backend.parser_qlda import parse_qlda_file, list_available_qlda_projects
from backend.parser import list_available_projects, parse_project_details

os.makedirs('demo_v2/data', exist_ok=True)
os.makedirs('demo_v2/data_qlda', exist_ok=True)

DATA_FOLDER = os.path.join(BASE_DIR, "Data")
QLDA_FOLDER = os.path.join(BASE_DIR, "03.QLDA")

# 1. Projects BOM
print("--- DONG BO DU LIEU BOM ---")
bom_projs = list_available_projects(DATA_FOLDER)
with open('demo_v2/data/projects.json', 'w', encoding='utf-8') as f:
    json.dump({'count': len(bom_projs), 'projects': bom_projs}, f, ensure_ascii=False, indent=2)

for p in bom_projs:
    pid = p['project_id']
    fpath = p['file_path']
    out_path = f'demo_v2/data/{pid}.json'
    out_path_pl = f'demo_v2/data/{pid}PL.json'
    out_path_under = f'demo_v2/data/{pid}_PL.json'
    
    if not os.path.exists(out_path):
        print(f"Bóc tách BOM mới: {pid}...")
        try:
            data = parse_project_details(fpath)
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            print(f"Loi BOM {pid}: {e}")
            continue

    if os.path.exists(out_path):
        with open(out_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if not os.path.exists(out_path_pl):
            with open(out_path_pl, 'w', encoding='utf-8') as f:
                f.write(content)
        if not os.path.exists(out_path_under):
            with open(out_path_under, 'w', encoding='utf-8') as f:
                f.write(content)

print("--- DONG BO DU LIEU QLDA (32 DU AN) ---")
qlda_projs = list_available_qlda_projects(QLDA_FOLDER)
with open('demo_v2/data_qlda/qlda_projects.json', 'w', encoding='utf-8') as f:
    json.dump({'count': len(qlda_projs), 'projects': qlda_projs}, f, ensure_ascii=False, indent=2)

for q in qlda_projs:
    qid = q['project_id']
    qpath = q['file_path']
    out_q = f'demo_v2/data_qlda/{qid}.json'
    try:
        qdata = parse_qlda_file(qpath)
        with open(out_q, 'w', encoding='utf-8') as f:
            json.dump(qdata, f, ensure_ascii=False)
        print(f"Parsed QLDA {qid}: {len(qdata.get('items', []))} cau kien")
    except Exception as e:
        print(f"Loi QLDA {qid}: {e}")

print("=== HOAN TAT DONG BO DU LIEU THAT 100% ===")
