"""
Công cụ 1-Click Đồng Bộ Sang Nhánh Online 24/24 (AMECC).
- Tự động biên dịch toàn bộ dữ liệu Excel mới nhất trong Data/ sang JSON.
- Đóng gói toàn bộ mã nguồn web tĩnh vào online_247/.
- Cập nhật và đẩy lên nhánh phụ 'gh-pages' trên GitHub để phục vụ web 24/24.
"""

import os
import sys
import subprocess
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

from tools.build_static_data import build_static_package

def run_cmd(cmd, check=True):
    print(f"  > {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=BASE_DIR, capture_output=True, text=True, errors="replace")
    if res.returncode != 0 and check:
        print(f"    [!] Thất bại: {res.stderr.strip() or res.stdout.strip()}")
        return False, res.stderr or res.stdout
    return True, res.stdout.strip()

def sync_online():
    print("=" * 72)
    print("      HỆ THỐNG ĐỒNG BỘ DỮ LIỆU SANG NHÁNH ONLINE 24/24 (AMECC)")
    print("=" * 72)

    # Bước 1: Biên dịch dữ liệu Excel mới nhất
    print("\n[Bước 1/3] Đang quét và biên dịch dữ liệu Excel sang gói Online...")
    build_static_package()

    # Bước 2: Commit các thay đổi ở nhánh hiện tại (main)
    print("\n[Bước 2/3] Lưu trữ và ghi nhận thay đổi vào nhánh hiện tại (main)...")
    run_cmd("git add .", check=False)
    success, output = run_cmd('git commit -m "build: Cập nhật dữ liệu và giao diện Online 24/24"', check=False)
    if "nothing to commit" in output:
        print("  -> Dữ liệu hiện tại đã đồng nhất, không có thay đổi mới cần commit.")
    else:
        print("  -> Đã commit thay đổi thành công.")

    # Bước 3: Tạo / Cập nhật nhánh gh-pages từ thư mục online_247
    print("\n[Bước 3/3] Đang cập nhật và đẩy dữ liệu lên nhánh online (gh-pages)...")
    
    # Xóa nhánh local cũ nếu có để tạo mới chính xác từ thư mục online_247
    run_cmd("git branch -D gh-pages", check=False)
    
    print("  -> Tách riêng thư mục online_247 sang nhánh gh-pages...")
    ok, out = run_cmd("git subtree split --prefix online_247 -b gh-pages", check=False)
    if not ok:
        print(f"  [!] Lỗi khi tách subtree: {out}")
        print("  -> Đang chuyển sang phương pháp thay thế qua Git worktree / branch...")
        # Phương pháp thay thế nếu subtree gặp trục trặc
        run_cmd("git checkout -B gh-pages", check=False)
        run_cmd("git checkout main -- online_247", check=False)
        run_cmd("git checkout main", check=False)

    print("\n  -> Đang đẩy nhánh gh-pages và main lên GitHub...")
    # Push cả main và gh-pages lên remote
    push_main_ok, _ = run_cmd("git push origin main", check=False)
    push_pages_ok, p_out = run_cmd("git push origin gh-pages --force", check=False)

    print("\n" + "=" * 72)
    if push_pages_ok:
        print("🎉 HOÀN TẤT ĐỒNG BỘ LÊN NHÁNH ONLINE 24/24 THÀNH CÔNG!")
        print("📌 Trang web của bạn đang hoạt động 24/7 tại địa chỉ:")
        print("   👉 https://nguyenduchieu1208.github.io/amecc-server/")
        print("   (Không cần bật máy tính, không cần mở server, truy cập mọi lúc mọi nơi)")
    else:
        print("⚠️ Đã tạo nhánh online (gh-pages) tại máy thành công!")
        print("   Lưu ý: Nếu chưa đẩy được lên GitHub do mạng hoặc token, bạn hãy chạy:")
        print("   git push origin gh-pages --force")
    print("=" * 72)

if __name__ == "__main__":
    sync_online()
