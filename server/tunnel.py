"""
Module điều phối kết nối đường hầm mạng ngoài (Internet / 4G) - Miễn phí 100%.
Ưu tiên 1: Ngrok với Tên miền Cố định Vĩnh viễn (Static Domain không bao giờ đổi).
Ưu tiên 2: Cloudflare Quick Tunnel dự phòng.
"""

import os
import re
import sys
import time
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TUNNEL_FILE = os.path.join(BASE_DIR, ".tunnel_url")

# Cấu hình Tên miền cố định Ngrok của bạn
NGROK_AUTH_TOKEN = "3J5wpN3SWwQAXuLCmQqaXjidGq6_7LGEAfD525PXQ65SZeyR2"
NGROK_STATIC_DOMAIN = "emptier-wasp-snout.ngrok-free.dev"

def start_ngrok(port: int = 8000) -> bool:
    try:
        from pyngrok import ngrok, conf
        try:
            subprocess.run("taskkill /F /IM ngrok.exe", shell=True, capture_output=True)
            time.sleep(0.5)
            ngrok.kill()
        except Exception:
            pass
        conf.get_default().auth_token = NGROK_AUTH_TOKEN
        
        print(f"\n🌐 Đang kết nối Tên Miền Cố Định: https://{NGROK_STATIC_DOMAIN}...")
        tunnel = ngrok.connect(port, domain=NGROK_STATIC_DOMAIN)
        public_url = tunnel.public_url
        if public_url.startswith("http://"):
            public_url = public_url.replace("http://", "https://")

        with open(TUNNEL_FILE, "w", encoding="utf-8") as f:
            f.write(public_url)

        print("\n" + "=" * 74)
        print("🎉 KẾT NỐI MẠNG NGOÀI (4G / INTERNET) THÀNH CÔNG VỚI TÊN MIỀN CỐ ĐỊNH!")
        print("📌 ĐÂY LÀ LINK DUY NHẤT - KHÔNG BAO GIỜ BỊ ĐỔI KHI TẮT MỞ MÁY TÍNH:")
        print(f"   \033[92m\033[1m{public_url}\033[0m")
        print("💡 Hãy gửi link này cho Sếp và Đồng nghiệp để họ lưu lại (bookmark) dùng mãi mãi.")
        print("=" * 74 + "\n")
        
        # Giữ tiến trình ngrok sống cùng server
        while True:
            time.sleep(1)
            
    except Exception as e:
        print(f"⚠️ Không thể khởi tạo Ngrok ({e}). Đang chuyển sang Cloudflare Tunnel dự phòng...")
        return False

def start_cloudflare(port: int = 8000):
    print("\n🌐 Đang kết nối Cloudflare Quick Tunnel (Miễn phí 100%)...")
    
    cmd = [
        "cloudflared", "tunnel", "--no-autoupdate",
        "--url", f"http://127.0.0.1:{port}",
        "--protocol", "http2",
        "--edge-ip-version", "4"
    ]
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
    except FileNotFoundError:
        print("❌ Chưa tìm thấy công cụ tunnel.")
        return

    tunnel_url = None
    for line in proc.stdout:
        line_clean = line.strip()
        m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_clean)
        if m:
            tunnel_url = m.group(0)
            with open(TUNNEL_FILE, "w", encoding="utf-8") as f:
                f.write(tunnel_url)
                
            print("\n" + "=" * 74)
            print("🎉 KẾT NỐI MẠNG NGOÀI (4G / INTERNET) QUA CLOUDFLARE THÀNH CÔNG!")
            print(f"   \033[92m\033[1m{tunnel_url}\033[0m")
            print("=" * 74 + "\n")
            break
            
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()

def start_tunnel(port: int = 8000):
    if os.path.exists(TUNNEL_FILE):
        try:
            os.remove(TUNNEL_FILE)
        except Exception:
            pass

    # Ưu tiên 1: Chạy Ngrok với Tên miền cố định vĩnh viễn
    success = start_ngrok(port)
    if not success:
        # Ưu tiên 2: Dự phòng Cloudflare
        start_cloudflare(port)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_tunnel(port)
