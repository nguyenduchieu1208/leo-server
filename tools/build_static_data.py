"""
Công cụ biên dịch dữ liệu tĩnh (Static Data Builder) cho bản Web Online 24/24.
- Quét toàn bộ file Excel (.xlsx) trong thư mục Data/
- Bóc tách cấu kiện, tiến độ nhận hàng, kiểm tra nối, phân tích thép hình
- Xuất dữ liệu ra các file JSON chuẩn hóa vào thư mục online_247/data/
- Sao chép và đóng gói toàn bộ giao diện web (HTML/CSS/JS) sang online_247/
"""

import os
import sys
import json
import shutil
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from backend.parser import list_available_projects, parse_project_details
from backend.cache import get_cached_project
from backend.parser_qlda import list_available_qlda_projects, parse_qlda_file

DATA_DIR = os.path.join(BASE_DIR, "Data")
QLDA_DIR = os.path.join(BASE_DIR, "03.QLDA")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
OUTPUT_DIR = os.path.join(BASE_DIR, "online_247")
DATA_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "data")
QLDA_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "data_qlda")

def build_static_package():
    start_time = time.time()
    print("=" * 70)
    print("   BẮT ĐẦU BIÊN DỊCH GÓI DỮ LIỆU TĨNH ONLINE 24/24 (AMECC)")
    print("=" * 70)

    # 1. Tạo thư mục output nếu chưa có
    os.makedirs(DATA_OUTPUT_DIR, exist_ok=True)
    os.makedirs(QLDA_OUTPUT_DIR, exist_ok=True)

    # 2. Sao chép các file frontend sang online_247
    print("[1/4] Đóng gói giao diện Frontend...")
    for filename in ["index.html", "style.css", "app.js", "logo.png"]:
        src = os.path.join(FRONTEND_DIR, filename)
        dst = os.path.join(OUTPUT_DIR, filename)
        if os.path.exists(src):
            if filename.endswith((".html", ".css", ".js")):
                with open(src, "r", encoding="utf-8") as f:
                    content = f.read()
                # Đảm bảo đường dẫn tài nguyên trong index.html là relative để chạy được trên GitHub Pages / Vercel
                if filename == "index.html":
                    v_tag = int(time.time())
                    content = re.sub(r'href="[^"]*style\.css[^"]*"', f'href="style.css?v={v_tag}"', content)
                    content = re.sub(r'src="[^"]*app\.js[^"]*"', f'src="app.js?v={v_tag}"', content)
                    if "xlsx.bundle.js" not in content and "xlsx.full.min.js" not in content:
                        content = content.replace('</head>', '    <!-- xlsx-js-style Export -->\n    <script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>\n</head>')
                with open(dst, "w", encoding="utf-8") as f:
                    f.write(content)
            else:
                shutil.copyfile(src, dst)
            print(f"  -> Đã đóng gói: {filename}")

    # 3. Quét danh sách file Excel trong Data/
    print("\n[2/4] Quét và trích xuất dữ liệu các dự án từ thư mục Data/...")
    projects = list_available_projects(DATA_DIR)
    processed_projects = []
    if not projects:
        print("  [!] Cảnh báo: Không tìm thấy file Excel nào trong Data/")
    else:
        for idx, p in enumerate(projects, 1):
            fpath = p["file_path"]
            proj_id = p["project_id"]
            fname = p["file_name"]
            print(f"  [{idx}/{len(projects)}] Đang xử lý {fname} ({proj_id})...", end="", flush=True)

            try:
                data = get_cached_project(fpath, force_reload=True)
                json_file_name = f"{proj_id}.json"
                json_path = os.path.join(DATA_OUTPUT_DIR, json_file_name)
                
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(data, jf, ensure_ascii=False)

                # Tạo thêm bản sao với tên gốc (vd: A290PL.json) để tương thích tuyệt đối
                alt_name = fname.replace(".xlsx", ".json").replace(".xlsm", ".json")
                if alt_name != json_file_name:
                    alt_path = os.path.join(DATA_OUTPUT_DIR, alt_name)
                    with open(alt_path, "w", encoding="utf-8") as jf:
                        json.dump(data, jf, ensure_ascii=False)

                p_entry = {
                    "project_id": proj_id,
                    "display_name": p.get("display_name", proj_id),
                    "file_name": fname,
                    "file_path": f"data/{json_file_name}",
                    "size_bytes": p.get("size_bytes", 0),
                    "total_assemblies": data.get("total_assemblies", 0),
                    "completed_assemblies": data.get("completed_assemblies", 0),
                    "partial_assemblies": data.get("partial_assemblies", 0),
                    "not_received_assemblies": data.get("not_received_assemblies", 0)
                }
                processed_projects.append(p_entry)
                print(f" Hoàn tất ({data.get('total_assemblies', 0)} cấu kiện)")
            except Exception as e:
                print(f" LỖI: {e}")

    # Ghi file danh mục projects.json
    catalog = {
        "count": len(processed_projects),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "projects": processed_projects
    }
    with open(os.path.join(DATA_OUTPUT_DIR, "projects.json"), "w", encoding="utf-8") as jf:
        json.dump(catalog, jf, ensure_ascii=False, indent=2)

    # 4. Quét và trích xuất dữ liệu Quản Lý Dự Án (03.QLDA/)
    print("\n[3/4] Quét và trích xuất dữ liệu Quản Lý Dự Án (03.QLDA/)...")
    qlda_projects = list_available_qlda_projects(QLDA_DIR)
    processed_qlda = []
    if not qlda_projects:
        print("  [!] Cảnh báo: Không tìm thấy file Excel nào trong 03.QLDA/")
    else:
        for idx, qp in enumerate(qlda_projects, 1):
            fpath = qp["file_path"]
            proj_id = qp["project_id"]
            fname = qp["file_name"]
            print(f"  [{idx}/{len(qlda_projects)}] Đang bóc tách tiến độ 5 công đoạn {fname}...", end="", flush=True)

            try:
                qlda_data = parse_qlda_file(fpath)
                qlda_json_file = f"{proj_id}.json"
                qlda_json_path = os.path.join(QLDA_OUTPUT_DIR, qlda_json_file)

                with open(qlda_json_path, "w", encoding="utf-8") as jf:
                    json.dump(qlda_data, jf, ensure_ascii=False)

                q_entry = {
                    "project_id": proj_id,
                    "file_name": fname,
                    "data_path": f"data_qlda/{qlda_json_file}",
                    "total_items": qlda_data.get("total_items", 0),
                    "total_qty": qlda_data.get("total_qty", 0),
                    "total_weight": qlda_data.get("total_weight", 0.0),
                    "total_tons": qlda_data.get("total_tons", 0.0),
                    "kpis": qlda_data.get("kpis", {}),
                    "hang_mucs": qlda_data.get("hang_mucs", []),
                    "phan_giaos": qlda_data.get("phan_giaos", []),
                    "updated_at": qp.get("updated_at", "")
                }
                processed_qlda.append(q_entry)
                kpi_bg = qlda_data.get("kpis", {}).get("ban_giao", {})
                print(f" Hoàn tất ({qlda_data.get('total_items', 0)} cấu kiện, {qlda_data.get('total_tons', 0)} tấn, Bàn giao: {kpi_bg.get('rate', 0)}%)")
            except Exception as e:
                print(f" LỖI: {e}")

    # Ghi file danh mục qlda_projects.json
    print("\n[4/4] Tạo chỉ mục qlda_projects.json...")
    qlda_catalog = {
        "count": len(processed_qlda),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "projects": processed_qlda
    }
    with open(os.path.join(DATA_OUTPUT_DIR, "qlda_projects.json"), "w", encoding="utf-8") as jf:
        json.dump(qlda_catalog, jf, ensure_ascii=False, indent=2)

    # Sao chép announcements.json sang thư mục web tĩnh
    ann_src = os.path.join(BASE_DIR, "data", "announcements.json")
    if os.path.exists(ann_src):
        shutil.copyfile(ann_src, os.path.join(DATA_OUTPUT_DIR, "announcements.json"))
        print("  -> Đã đồng bộ thông báo: announcements.json")

    elapsed = time.time() - start_time
    print("=" * 70)
    print(f"✅ ĐÃ HOÀN TẤT BIÊN DỊCH GÓI ONLINE 24/24 TRONG {elapsed:.1f} GIÂY!")
    print(f"📁 Thư mục gói web tĩnh: {OUTPUT_DIR}")
    print(f"📁 Thư mục dữ liệu QLDA: {QLDA_OUTPUT_DIR}")
    print(f"🌐 Bạn có thể mở trực tiếp hoặc đưa lên GitHub Pages / Vercel / Cloudflare.")
    print("=" * 70)

if __name__ == "__main__":
    build_static_package()
