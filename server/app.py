"""
FastAPI Server Tra Cứu Tình Trạng Vật Tư & BTP Theo Ngày - AMECC.
- Phục vụ API backend và giao diện frontend
- Xuất file Excel chi tiết còn thiếu chia theo từng hạng mục sheet (T5P1, T5P2, M4120...)
- Phân quyền: Chỉ duy nhất chủ máy (localhost) mới có quyền làm mới dữ liệu
- Tối ưu hóa chịu tải cao với In-Memory RAM Cache + nén GZip
- Hỗ trợ mạng LAN và mạng ngoài Internet/4G
"""

import os
import sys
import socket
import threading
import urllib.parse
from typing import Optional
from fastapi import FastAPI, Request, Query, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware

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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.parser import list_available_projects
from backend.cache import get_cached_project, get_cached_project_json, warm_up_cache, clear_all_cache
from backend.exporter import export_project_excel, export_missing_parts_excel

app = FastAPI(title="Server Tra Cứu Vật Tư & BTP Theo Ngày - AMECC", version="2.5.0")

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_ngrok_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response

DATA_FOLDER = os.path.join(BASE_DIR, "Data")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

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

def is_host_admin(request: Request) -> bool:
    """
    Kiểm tra bảo mật: Chỉ duy nhất người ngồi trực tiếp tại máy chủ (localhost)
    mới có quyền làm mới dữ liệu. Tất cả người dùng từ LAN hoặc Cloudflare Tunnel đều bị từ chối.
    """
    # Nếu có header của Cloudflare Tunnel thì đây là người dùng từ mạng ngoài
    if request.headers.get("cf-connecting-ip") or request.headers.get("cf-ray"):
        return False
    # Nếu có header X-Forwarded-For từ proxy ngoài
    if request.headers.get("x-forwarded-for"):
        return False
        
    client_host = request.client.host if request.client else ""
    return client_host in ["127.0.0.1", "localhost", "::1", "testclient"]

@app.on_event("startup")
async def on_startup():
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER,), daemon=True).start()

@app.get("/")
async def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({
        "status": "online",
        "message": "Server đang chạy..."
    })

@app.get("/api/info")
async def get_server_info(request: Request):
    """Thông tin trạng thái server, địa chỉ mạng và quyền quản trị"""
    lan_ip = get_lan_ip()
    port = request.url.port or 8000
    
    tunnel_url = ""
    tunnel_file = os.path.join(BASE_DIR, ".tunnel_url")
    if os.path.exists(tunnel_file):
        try:
            with open(tunnel_file, "r", encoding="utf-8") as f:
                tunnel_url = f.read().strip()
        except Exception:
            pass

    return {
        "status": "online",
        "local_url": f"http://localhost:{port}",
        "lan_url": f"http://{lan_ip}:{port}",
        "lan_ip": lan_ip,
        "public_url": tunnel_url,
        "is_admin": is_host_admin(request),
        "port": port,
        "data_folder": DATA_FOLDER
    }

@app.get("/api/projects")
async def get_projects():
    projects = list_available_projects(DATA_FOLDER)
    return {
        "count": len(projects),
        "data_folder": DATA_FOLDER,
        "projects": projects
    }

@app.get("/api/project-data")
async def get_project_data(
    request: Request,
    file_path: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    force_reload: bool = Query(False)
):
    # Bảo mật: Chỉ chủ máy mới được phép force_reload
    if force_reload and not is_host_admin(request):
        force_reload = False

    target_path = None
    if file_path and os.path.exists(file_path):
        target_path = file_path
    elif project_id:
        projects = list_available_projects(DATA_FOLDER)
        for p in projects:
            if p["project_id"] == project_id or p["file_name"] == project_id:
                target_path = p["file_path"]
                break
                
    if not target_path or not os.path.exists(target_path):
        projects = list_available_projects(DATA_FOLDER)
        if projects:
            target_path = projects[0]["file_path"]
        else:
            raise HTTPException(status_code=404, detail="Không tìm thấy file Excel nào trong thư mục Data")

    try:
        json_bytes = get_cached_project_json(target_path, force_reload=force_reload)
        return Response(content=json_bytes, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file {os.path.basename(target_path)}: {str(e)}")

@app.get("/api/export-excel")
@app.get("/api/export-missing")
async def export_excel_data(
    file_path: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    mode: str = Query("missing"), # 'missing' hoặc 'full'
    sheet_name: Optional[str] = Query(None) # Tên sheet cụ thể (vd: T5P1) hoặc None (tất cả)
):
    """
    Xuất file Excel theo chuẩn:
    - mode='full': Xuất toàn bộ tầng bậc cấu kiện (Full Tier)
    - mode='missing': Chỉ xuất các chi tiết còn thiếu
    - sheet_name: Lọc riêng theo hạng mục (vd: T5P1) hoặc xuất toàn bộ các sheet
    """
    target_path = None
    if file_path and os.path.exists(file_path):
        target_path = file_path
    elif project_id:
        projects = list_available_projects(DATA_FOLDER)
        for p in projects:
            if p["project_id"] == project_id or p["file_name"] == project_id:
                target_path = p["file_path"]
                break
                
    if not target_path or not os.path.exists(target_path):
        projects = list_available_projects(DATA_FOLDER)
        if projects:
            target_path = projects[0]["file_path"]
        else:
            raise HTTPException(status_code=404, detail="Không tìm thấy file Excel")

    try:
        data = get_cached_project(target_path)
        excel_stream = export_project_excel(data, mode=mode, target_sheet=sheet_name)
        
        proj_code = data.get("project_id", "DuAn")
        sheet_suffix = f"_{sheet_name}" if sheet_name and sheet_name.lower() != "all" else "_TatCaHangMuc"
        mode_prefix = "BTP_FullTier" if mode == "full" else "BTP_ConThieu"
        filename = f"{mode_prefix}_{proj_code}{sheet_suffix}.xlsx"
        
        encoded_filename = urllib.parse.quote(filename)
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
        
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xuất Excel: {str(e)}")

@app.post("/api/clear-cache")
async def api_clear_cache(request: Request):
    """Bảo mật: Chỉ người chạy máy chủ (Host / 127.0.0.1) mới có quyền làm mới dữ liệu"""
    if not is_host_admin(request):
        raise HTTPException(
            status_code=403, 
            detail="Bạn không có quyền! Chỉ người quản trị máy chủ (Host) mới có quyền làm mới dữ liệu."
        )
        
    clear_all_cache()
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER,), daemon=True).start()
    return {"status": "success", "message": "Đang làm mới và nạp lại toàn bộ dữ liệu vào RAM..."}

@app.post("/api/upload-excel")
async def upload_excel(file: UploadFile = File(...)):
    """Tải lên file Excel dự án mới trực tiếp từ trình duyệt (tiện lợi khi chạy trên Render/Cloud)"""
    if not file.filename or not file.filename.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel đuôi .xlsx hoặc .xlsm")
    
    os.makedirs(DATA_FOLDER, exist_ok=True)
    dest_path = os.path.join(DATA_FOLDER, file.filename)
    with open(dest_path, "wb") as buffer:
        import shutil
        shutil.copyfileobj(file.file, buffer)
        
    clear_all_cache()
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER,), daemon=True).start()
    return {"status": "success", "message": f"Đã nạp file {file.filename} vào hệ thống thành công!"}

def run_server(port: int = 8000):
    lan_ip = get_lan_ip()
    print("=" * 65)
    print("🚀 SERVER TRA CỨU VẬT TƯ & BTP THEO NGÀY ĐANG KHỞI ĐỘNG...")
    print(f"👉 Truy cập trên máy bạn:    http://localhost:{port}")
    print(f"👉 Cho mạng nội bộ (LAN):    http://{lan_ip}:{port}")
    print("=" * 65)
    uvicorn.run("server.app:app", host="0.0.0.0", port=port, workers=1, loop="asyncio")

if __name__ == "__main__":
    run_server(8000)
