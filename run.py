"""
Trình khởi chạy máy chủ tích hợp 1-Click (All-in-One Launcher).
- Chạy Web Server FastAPI (Hiệu năng cao, RAM Cache, nén GZip).
- Tự động phát hiện IP LAN nội bộ (cho anh em trong cùng mạng Wi-Fi/công ty).
- Tự động mở đường truyền Cloudflare Tunnel (cho người dùng mạng ngoài/4G/ở nhà truy cập MIỄN PHÍ).
- Tự động mở trình duyệt web.
"""

import os
import sys
import time
import socket
import webbrowser
import threading
import subprocess

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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if sys.platform == "win32":
    import asyncio
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def free_port(port: int):
    """Tự động tìm và tắt tiến trình cũ đang chiếm cổng nếu có"""
    try:
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True, text=True, errors="replace")
        for line in output.strip().split("\n"):
            if "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid and pid != "0" and int(pid) != os.getpid():
                    print(f"[*] Đang giải phóng cổng {port} từ tiến trình cũ (PID {pid})...")
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                    time.sleep(1)
    except Exception:
        pass

def get_available_port(start_port: int = 8000) -> int:
    """Đảm bảo tìm được cổng trống để không bao giờ bị lỗi WinError 10048"""
    free_port(start_port)
    for p in range(start_port, start_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", p))
                return p
            except OSError:
                continue
    return start_port

def start_fastapi_server(port: int = 8000):
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=port, loop="asyncio", log_level="warning")

def main():
    port = get_available_port(8000)
    lan_ip = get_lan_ip()

    print("=" * 72)
    print("   HỆ THỐNG MÁY CHỦ TRA CỨU VẬT TƯ & BTP THEO NGÀY - AMECC")
    print("   (Chạy trực tiếp trên máy - Tối ưu chịu tải cao - 100% Miễn phí)")
    print("=" * 72)
    print(f"📌 Địa chỉ trên máy này:        http://localhost:{port}")
    print(f"📌 Địa chỉ mạng nội bộ (LAN):  http://{lan_ip}:{port}")
    print("=" * 72)

    # 1. Khởi chạy FastAPI Server trên luồng riêng
    server_thread = threading.Thread(target=start_fastapi_server, args=(port,), daemon=True)
    server_thread.start()

    # Đợi 1.5 giây cho server sẵn sàng
    time.sleep(1.5)

    # 2. Mở trình duyệt trên máy tính hiện tại
    try:
        webbrowser.open(f"http://localhost:{port}")
    except Exception:
        pass

    # 3. Khởi chạy Cloudflare Tunnel cho mạng ngoài (4G, Internet)
    try:
        from server.tunnel import start_tunnel
        tunnel_thread = threading.Thread(target=start_tunnel, args=(port,), daemon=True)
        tunnel_thread.start()
    except Exception as e:
        print(f"Lưu ý kết nối mạng ngoài: {e}")

    print("\n💡 HƯỚNG DẪN TRUY CẬP:")
    print(" 1. Người dùng trong cùng mạng Wi-Fi/LAN: Gửi link mạng nội bộ ở trên.")
    print(" 2. Người dùng mạng ngoài (4G, ở nhà, chi nhánh): Dùng link CỐ ĐỊNH VĨNH VIỄN.")
    print("    (Chỉ cần bấm nút 'Visit Site' lần đầu tiên, link không bao giờ bị đổi).")
    print(" 3. Nhấn Ctrl + C để dừng máy chủ bất kỳ lúc nào.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đang dừng máy chủ...")
        sys.exit(0)

if __name__ == "__main__":
    main()
