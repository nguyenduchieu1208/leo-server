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

DATA_DIR = os.path.join(BASE_DIR, "Data")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
OUTPUT_DIR = os.path.join(BASE_DIR, "online_247")
DATA_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "data")

def build_static_package():
    start_time = time.time()
    print("=" * 70)
    print("   BẮT ĐẦU BIÊN DỊCH GÓI DỮ LIỆU TĨNH ONLINE 24/24 (AMECC)")
    print("=" * 70)

    # 1. Tạo thư mục output nếu chưa có
    os.makedirs(DATA_OUTPUT_DIR, exist_ok=True)

    # 2. Sao chép các file frontend sang online_247
    print("[1/3] Đóng gói giao diện Frontend...")
    for filename in ["index.html", "style.css", "app.js"]:
        src = os.path.join(FRONTEND_DIR, filename)
        dst = os.path.join(OUTPUT_DIR, filename)
        if os.path.exists(src):
            with open(src, "r", encoding="utf-8") as f:
                content = f.read()
            # Đảm bảo đường dẫn tài nguyên trong index.html là relative để chạy được trên GitHub Pages / Vercel
            if filename == "index.html":
                content = content.replace('href="/frontend/style.css', 'href="style.css')
                content = content.replace('src="/frontend/app.js', 'src="app.js')
                # Tích hợp thêm SheetJS CDN để xuất Excel trực tiếp trên trình duyệt
                if "xlsx.full.min.js" not in content:
                    content = content.replace('</head>', '    <!-- SheetJS Client-side Export -->\n    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>\n</head>')
            with open(dst, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  -> Đã đóng gói: {filename}")

    # 3. Quét danh sách file Excel
    print("\n[2/3] Quét và trích xuất dữ liệu các dự án từ thư mục Data/...")
    projects = list_available_projects(DATA_DIR)
    if not projects:
        print("  [!] Cảnh báo: Không tìm thấy file Excel nào trong Data/")
        return

    processed_projects = []
    for idx, p in enumerate(projects, 1):
        fpath = p["file_path"]
        proj_id = p["project_id"]
        fname = p["file_name"]
        print(f"  [{idx}/{len(projects)}] Đang xử lý {fname} ({proj_id})...", end="", flush=True)

        try:
            data = get_cached_project(fpath, force_reload=False)
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

    # 4. Ghi file danh mục projects.json
    print("\n[3/3] Tạo chỉ mục danh mục projects.json...")
    catalog = {
        "count": len(processed_projects),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "projects": processed_projects
    }
    with open(os.path.join(DATA_OUTPUT_DIR, "projects.json"), "w", encoding="utf-8") as jf:
        json.dump(catalog, jf, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    print("=" * 70)
    print(f"✅ ĐÃ HOÀN TẤT BIÊN DỊCH GÓI ONLINE 24/24 TRONG {elapsed:.1f} GIÂY!")
    print(f"📁 Thư mục gói web tĩnh: {OUTPUT_DIR}")
    print(f"🌐 Bạn có thể mở trực tiếp hoặc đưa lên GitHub Pages / Vercel / Cloudflare.")
    print("=" * 70)

if __name__ == "__main__":
    build_static_package()
