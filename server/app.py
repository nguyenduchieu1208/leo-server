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
import json
import socket
import threading
import urllib.parse
import hashlib
import hmac
import secrets
import datetime
import time
from typing import Optional
from fastapi import FastAPI, Request, Query, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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
from backend.parser_qlda import list_available_qlda_projects, parse_qlda_file, generate_qlda_export_excel
from backend.cache import (
    get_cached_project, 
    get_cached_project_json, 
    get_cached_qlda, 
    get_cached_qlda_json, 
    warm_up_cache, 
    clear_all_cache
)
from backend.exporter import export_project_excel, export_project_csv, export_missing_parts_excel

app = FastAPI(title="Server Tra Cứu Vật Tư & BTP Theo Ngày - Amecc2", version="2.5.0")

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_custom_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    # Ngăn trình duyệt cache dữ liệu API và file giao diện khi cập nhật
    path = request.url.path.lower()
    if path.startswith("/api/") or path.endswith((".js", ".css", ".html")) or path in ["/", "/index.html"]:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

DATA_FOLDER = os.path.join(BASE_DIR, "Data")
QLDA_FOLDER = os.path.join(BASE_DIR, "03.QLDA")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

def is_safe_path(target_path: str, allowed_dirs: list) -> bool:
    """Xác thực bảo mật chống Path Traversal: Đảm bảo đường dẫn nằm trong thư mục cho phép"""
    try:
        target_abs = os.path.abspath(target_path)
        for d in allowed_dirs:
            d_abs = os.path.abspath(d)
            if os.path.commonpath([target_abs, d_abs]) == d_abs:
                return True
    except Exception:
        pass
    return False

if os.path.exists(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/style.css")
async def serve_style_css():
    return FileResponse(os.path.join(FRONTEND_DIR, "style.css"), media_type="text/css")

@app.get("/app.js")
async def serve_app_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "app.js"), media_type="application/javascript")

@app.get("/logo.png")
async def serve_logo_png():
    return FileResponse(os.path.join(FRONTEND_DIR, "logo.png"), media_type="image/png")


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

# =========================================================================
# QUẢN TRỊ VIÊN & XÁC THỰC BẢO MẬT (ADMIN AUTHENTICATION)
# =========================================================================

ADMIN_EMAIL = "ndhieu1208@gmail.com"
ADMIN_PASSWORD = "12082003"
USERS_FILE = os.path.join(DATA_FOLDER, "users.json")

def load_system_users() -> list:
    """Tải danh sách tài khoản từ Data/users.json hoặc khởi tạo mặc định"""
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                users = json.load(f)
                if isinstance(users, list) and len(users) > 0:
                    # Loại bỏ hoàn toàn tài khoản admin@amecc.com.vn nếu còn sót lại
                    filtered = [u for u in users if u.get("username", "").strip().lower() != "admin@amecc.com.vn"]
                    if len(filtered) != len(users):
                        save_system_users(filtered)
                    return filtered
        except Exception as e:
            logger.warning(f"Không thể đọc Data/users.json: {e}")
            
    # Mặc định tạo tài khoản Master Owner nếu chưa có
    default_users = [
        {
            "id": "usr_owner",
            "username": ADMIN_EMAIL,
            "name": "Nguyễn Đức Hiệu",
            "role": "owner",
            "role_name": "Chủ Sở Hữu",
            "password": ADMIN_PASSWORD,
            "status": "active",
            "created_at": "21/09/2026"
        }
    ]
    save_system_users(default_users)
    return default_users

def save_system_users(users: list):
    """Lưu danh sách tài khoản vào Data/users.json"""
    try:
        os.makedirs(DATA_FOLDER, exist_ok=True)
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Lỗi khi lưu Data/users.json: {e}")

def find_user_by_username(username: str) -> dict | None:
    users = load_system_users()
    uname = (username or "").strip().lower()
    for u in users:
        if u.get("username", "").strip().lower() == uname:
            return u
    return None

SECRET_FILE = os.path.join(BASE_DIR, ".admin_secret")
if os.path.exists(SECRET_FILE):
    try:
        with open(SECRET_FILE, "r", encoding="utf-8") as f:
            ADMIN_SECRET_KEY = f.read().strip()
    except Exception:
        ADMIN_SECRET_KEY = secrets.token_hex(32)
else:
    ADMIN_SECRET_KEY = secrets.token_hex(32)
    try:
        with open(SECRET_FILE, "w", encoding="utf-8") as f:
            f.write(ADMIN_SECRET_KEY)
    except Exception:
        pass

def generate_admin_token(username: str) -> str:
    """Tạo token phiên HMAC có thời hạn 7 ngày cho tài khoản"""
    expire_ts = int(time.time()) + 7 * 86400
    msg = f"{username}:{expire_ts}"
    sig = hmac.new(ADMIN_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{sig}"

def verify_admin_token(token: str) -> bool:
    """Xác minh tính hợp lệ và thời hạn của token phiên"""
    if not token or not isinstance(token, str):
        return False
    parts = token.split(":")
    if len(parts) != 3:
        return False
    username, expire_ts_str, sig = parts
    try:
        expire_ts = int(expire_ts_str)
        import time as _t
        if _t.time() > expire_ts:
            return False
    except ValueError:
        return False
    msg = f"{username}:{expire_ts_str}"
    expected_sig = hmac.new(ADMIN_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return False
    user = find_user_by_username(username)
    if not user or user.get("status") != "active":
        return False
    return True

def is_host_admin(request: Request) -> bool:
    """
    Kiểm tra bảo mật máy chủ cục bộ (localhost)
    """
    # Nếu có header từ Cloudflare hoặc Ngrok Tunnel
    if request.headers.get("cf-connecting-ip") or request.headers.get("cf-ray") or request.headers.get("ngrok-trace-id"):
        return False
    # Nếu có header X-Forwarded-For từ proxy ngoài
    if request.headers.get("x-forwarded-for"):
        return False
        
    client_host = (request.client.host if request.client else "").lower()
    if client_host.startswith("::ffff:"):
        client_host = client_host.replace("::ffff:", "")
    return client_host in ["127.0.0.1", "localhost", "::1", "testclient"] or client_host.startswith("127.")

def get_current_user_from_request(request: Request) -> dict | None:
    token = request.cookies.get("admin_session")
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    if token and verify_admin_token(token):
        parts = token.split(":")
        if len(parts) == 3:
            return find_user_by_username(parts[0])
    if is_host_admin(request):
        return find_user_by_username(ADMIN_EMAIL)
    return None

def is_authenticated_admin(request: Request) -> bool:
    """
    Kiểm tra quyền Admin:
    1. Kiểm tra cookie 'admin_session' hoặc header Bearer hợp lệ
    2. Hoặc người dùng trực tiếp trên máy chủ localhost
    """
    user = get_current_user_from_request(request)
    if user and user.get("status") == "active":
        return True
    return is_host_admin(request)

@app.on_event("startup")
async def on_startup():
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER, QLDA_FOLDER), daemon=True).start()

@app.get("/")
async def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({
        "status": "online",
        "message": "Server đang chạy..."
    })

@app.get("/admin")
@app.get("/admin/")
async def serve_admin():
    admin_file = os.path.join(FRONTEND_DIR, "admin.html")
    if os.path.exists(admin_file):
        return FileResponse(admin_file)
    return JSONResponse({
        "status": "error",
        "message": "Không tìm thấy file frontend/admin.html"
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
        "is_admin": is_authenticated_admin(request),
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
    if file_path:
        if not is_safe_path(file_path, [DATA_FOLDER]):
            raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ hoặc nằm ngoài thư mục Data")
        if os.path.exists(file_path):
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

# Cache bộ nhớ cho QLDA
_qlda_cache = {}

@app.get("/api/qlda/projects")
async def get_qlda_projects():
    """Lấy danh sách các dự án QLDA kèm thông tin kích thước và ngày cập nhật"""
    projects = list_available_qlda_projects(QLDA_FOLDER)
    return {
        "count": len(projects),
        "data_folder": QLDA_FOLDER,
        "projects": projects
    }

@app.get("/api/qlda/project-data")
async def get_qlda_project_data(
    request: Request,
    project_id: Optional[str] = Query(None),
    file_path: Optional[str] = Query(None),
    force_reload: bool = Query(False)
):
    """
    Trả về toàn bộ dữ liệu tiến độ 5 công đoạn của 1 dự án QLDA (phản hồi trong 0.001s từ RAM/SQLite)
    """
    target_path = None
    if file_path:
        if not is_safe_path(file_path, [QLDA_FOLDER]):
            raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ hoặc nằm ngoài thư mục 03.QLDA")
        if os.path.exists(file_path):
            target_path = file_path
    elif project_id:
        projects = list_available_qlda_projects(QLDA_FOLDER)
        for p in projects:
            if p["project_id"].lower() == project_id.lower() or p["file_name"].lower() == project_id.lower():
                target_path = p["file_path"]
                break
                
    if not target_path or not os.path.exists(target_path):
        projects = list_available_qlda_projects(QLDA_FOLDER)
        if projects:
            target_path = projects[0]["file_path"]
        else:
            raise HTTPException(status_code=404, detail="Không tìm thấy file Excel nào trong thư mục 03.QLDA")

    try:
        json_bytes = get_cached_qlda_json(target_path, force_reload=force_reload)
        return Response(content=json_bytes, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file QLDA {os.path.basename(target_path)}: {str(e)}")

@app.get("/api/qlda/export-excel")
async def export_qlda_excel_endpoint(
    request: Request,
    project_id: Optional[str] = Query(None),
    file_path: Optional[str] = Query(None),
    hang_muc: Optional[str] = Query(None),
    phan_giao: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None)
):
    """
    Xuất file Excel đúng chuẩn form mẫu gốc của người dùng:
    - Loại bỏ hoàn toàn các cột: A, C, D, T đến AI, AS, BB đến hết
    - Giữ trọn vẹn 5 công đoạn (Gá lắp, Hàn, Tổ hợp thử, Nghiệm thu, Bàn giao)
    - Định dạng tiêu đề gộp nhóm, hàng Subtotal tự động co giãn, phông chữ Times New Roman chuẩn form
    """
    target_path = None
    if file_path:
        if not is_safe_path(file_path, [QLDA_FOLDER]):
            raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ hoặc nằm ngoài thư mục 03.QLDA")
        if os.path.exists(file_path):
            target_path = file_path
    elif project_id:
        projects = list_available_qlda_projects(QLDA_FOLDER)
        for p in projects:
            if p["project_id"].lower() == project_id.lower() or p["file_name"].lower() == project_id.lower():
                target_path = p["file_path"]
                break
                
    if not target_path or not os.path.exists(target_path):
        projects = list_available_qlda_projects(QLDA_FOLDER)
        if projects:
            target_path = projects[0]["file_path"]
        else:
            raise HTTPException(status_code=404, detail="Không tìm thấy file Excel nào trong thư mục 03.QLDA")

    try:
        project_data = get_cached_qlda(target_path)
        items = project_data.get("items", [])
        
        filtered_items = items
        if hang_muc and hang_muc != "all":
            filtered_items = [it for it in filtered_items if it.get("hang_muc") == hang_muc]
        if phan_giao and phan_giao != "all":
            filtered_items = [it for it in filtered_items if it.get("phan_giao") == phan_giao]
        if status and status != "all":
            filtered_items = [it for it in filtered_items if it.get("status") == status]
        if q:
            q_lower = q.lower().strip()
            filtered_items = [it for it in filtered_items if (
                q_lower in (it.get("so_chi_tiet") or "").lower() or
                q_lower in (it.get("ten_ban_ve") or "").lower() or
                q_lower in (it.get("hang_muc") or "").lower() or
                q_lower in (it.get("size") or "").lower() or
                q_lower in (it.get("profile") or "").lower()
            )]

        excel_io = generate_qlda_export_excel(project_data, filtered_items)
        pid = project_data.get("project_id", "QLDA")
        filename = f"QLDA_{pid}_TienDoCongDoan.xlsx"
        quoted_filename = urllib.parse.quote(filename)
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{quoted_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
        return StreamingResponse(
            excel_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xuất file Excel QLDA: {str(e)}")

@app.get("/api/export-excel")
@app.get("/api/export-missing")
@app.get("/api/export-csv")
async def export_data_endpoint(
    request: Request,
    file_path: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    mode: str = Query("missing"), # 'missing' hoặc 'full'
    sheet_name: Optional[str] = Query(None), # Tên sheet cụ thể (vd: T5P1) hoặc None (tất cả)
    format: str = Query("xlsx") # 'xlsx' hoặc 'csv'
):
    """
    Xuất file Excel (.xlsx) hoặc CSV (.csv):
    - format: 'xlsx' hoặc 'csv' (nếu gọi /api/export-csv thì tự động là csv)
    - mode: 'full' (Toàn bộ tầng bậc) hoặc 'missing' (Chỉ chi tiết còn thiếu)
    - sheet_name: Lọc riêng theo hạng mục hoặc xuất toàn bộ
    """
    if request.url.path.endswith("export-csv"):
        format = "csv"

    target_path = None
    if file_path:
        if not is_safe_path(file_path, [DATA_FOLDER]):
            raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ hoặc nằm ngoài thư mục Data")
        if os.path.exists(file_path):
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
        proj_code = data.get("project_id", "DuAn")
        sheet_suffix = f"_{sheet_name}" if sheet_name and sheet_name.lower() != "all" else "_TatCaHangMuc"
        mode_prefix = "BTP_FullTier" if mode == "full" else "BTP_ConThieu"

        if format.lower() == "csv":
            csv_stream = export_project_csv(data, mode=mode, target_sheet=sheet_name)
            filename = f"{mode_prefix}_{proj_code}{sheet_suffix}.csv"
            encoded_filename = urllib.parse.quote(filename)
            headers = {
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
            return StreamingResponse(
                csv_stream,
                media_type="text/csv; charset=utf-8",
                headers=headers
            )
        else:
            excel_stream = export_project_excel(data, mode=mode, target_sheet=sheet_name)
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
        raise HTTPException(status_code=500, detail=f"Lỗi xuất file: {str(e)}")

@app.post("/api/clear-cache")
async def api_clear_cache(request: Request):
    """Bảo mật: Chỉ Quản Trị Viên mới có quyền làm mới dữ liệu"""
    if not is_authenticated_admin(request):
        raise HTTPException(
            status_code=403, 
            detail="Bạn không có quyền! Yêu cầu đăng nhập tài khoản Quản Trị Viên."
        )
        
    clear_all_cache()
    projects = list_available_projects(DATA_FOLDER)
    qlda_projects = list_available_qlda_projects(QLDA_FOLDER)
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER, QLDA_FOLDER), daemon=True).start()
    return {
        "status": "success",
        "count": len(projects),
        "count_qlda": len(qlda_projects),
        "message": f"Đã quét và nạp lại toàn bộ {len(projects)} file PL và {len(qlda_projects)} file QLDA vào RAM thành công!",
        "projects": [p["file_name"] for p in projects]
    }

@app.post("/api/upload-excel")
async def upload_excel(request: Request, file: UploadFile = File(...)):
    """Bảo mật: Chỉ Quản Trị Viên mới được phép tải lên file Excel PL"""
    if not is_authenticated_admin(request):
        raise HTTPException(
            status_code=403, 
            detail="Bạn không có quyền! Yêu cầu đăng nhập tài khoản Quản Trị Viên."
        )

    safe_fname = os.path.basename(file.filename or "")
    if not safe_fname or not safe_fname.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel đuôi .xlsx hoặc .xlsm")
    
    os.makedirs(DATA_FOLDER, exist_ok=True)
    dest_path = os.path.join(DATA_FOLDER, safe_fname)
    with open(dest_path, "wb") as buffer:
        import shutil
        shutil.copyfileobj(file.file, buffer)
        
    clear_all_cache()
    threading.Thread(target=warm_up_cache, args=(DATA_FOLDER, QLDA_FOLDER), daemon=True).start()
    return {"status": "success", "message": f"Đã nạp file {safe_fname} vào hệ thống thành công!"}

@app.post("/api/upload-qlda-excel")
async def upload_qlda_excel(request: Request, file: UploadFile = File(...)):
    """Bảo mật: Chỉ Quản Trị Viên mới được phép tải lên file Excel QLDA"""
    if not is_authenticated_admin(request):
        raise HTTPException(
            status_code=403, 
            detail="Bạn không có quyền! Yêu cầu đăng nhập tài khoản Quản Trị Viên."
        )

    safe_fname = os.path.basename(file.filename or "")
    if not safe_fname or not safe_fname.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel đuôi .xlsx hoặc .xlsm")
    
    os.makedirs(QLDA_FOLDER, exist_ok=True)
    dest_path = os.path.join(QLDA_FOLDER, safe_fname)
    with open(dest_path, "wb") as buffer:
        import shutil
        shutil.copyfileobj(file.file, buffer)
        
    # Nạp và lưu vĩnh viễn vào SQLite & RAM ngay lập tức
    try:
        get_cached_qlda(dest_path, force_reload=True)
    except Exception as e:
        print(f"[-] Loi pre-cache file QLDA vua tai len: {e}")

    return {"status": "success", "message": f"Đã nạp và lưu trữ file QLDA {safe_fname} vào hệ thống thành công!"}

ANNOUNCEMENTS_FILE = os.path.join(DATA_FOLDER, "announcements.json")
ONLINE_ANNOUNCEMENTS_FILE = os.path.join(BASE_DIR, "online_247", "data", "announcements.json")

@app.get("/api/announcements")
async def get_announcements():
    """Lấy danh sách thông báo tiến độ và các bản tin cập nhật trang web"""
    for a_path in [ANNOUNCEMENTS_FILE, os.path.join(BASE_DIR, "data", "announcements.json")]:
        if os.path.exists(a_path):
            try:
                with open(a_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[-] Lỗi đọc announcements.json: {e}")
    return {
        "last_updated": "18/09/2026",
        "badge": "Thông Báo Quan Trọng",
        "title": "Kế Hoạch Cập Nhật Tiến Độ Công Đoạn & Bản Tin Trang Web",
        "schedule_notice": {
            "frequency": "Kế hoạch tiến độ công đoạn sẽ cập nhật 1 tuần 1 lần",
            "contact_person": "Anh Cường (AMC2)",
            "contact_note": "Số liệu hằng ngày xin liên hệ anh Cường (AMC2) để được hỗ trợ kịp thời.",
            "hotline": ""
        },
        "web_updates": []
    }

@app.post("/api/announcements")
async def save_announcements(request: Request):
    """Cập nhật nội dung bảng thông báo (Chỉ Quản Trị Viên mới được phép)"""
    if not is_authenticated_admin(request):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền! Yêu cầu đăng nhập tài khoản Quản Trị Viên."
        )
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu JSON không hợp lệ.")
    
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Dữ liệu thông báo phải là đối tượng JSON.")
    
    os.makedirs(os.path.dirname(ANNOUNCEMENTS_FILE), exist_ok=True)
    with open(ANNOUNCEMENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Đồng bộ tức thì sang thư mục online_247 nếu tồn tại
    try:
        os.makedirs(os.path.dirname(ONLINE_ANNOUNCEMENTS_FILE), exist_ok=True)
        with open(ONLINE_ANNOUNCEMENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[-] Không thể ghi sang online_247: {e}")
        
    return {"status": "success", "message": "Đã cập nhật bảng thông báo thành công!", "data": data}

# =========================================================================
# API QUẢN TRỊ VIÊN RIÊNG BIỆT (ADMIN PORTAL APIS)
# =========================================================================

@app.post("/api/admin/login")
async def api_admin_login(request: Request, response: Response):
    """Đăng nhập tài khoản quản trị viên / người dùng hệ thống"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu JSON đăng nhập không hợp lệ.")
    
    username = str(body.get("email") or body.get("username") or "").strip()
    password = str(body.get("password") or "").strip()
    
    user = find_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản hoặc mật khẩu không chính xác!")
        
    if user.get("status") == "locked":
        raise HTTPException(status_code=403, detail="Tài khoản này hiện đang bị tạm khóa!")
        
    if user.get("password") != password:
        raise HTTPException(status_code=401, detail="Tài khoản hoặc mật khẩu không chính xác!")
        
    token = generate_admin_token(user.get("username"))
    res = JSONResponse({
        "status": "success",
        "message": "Đăng nhập thành công!",
        "token": token,
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "name": user.get("name"),
            "role": user.get("role", "admin"),
            "role_name": user.get("role_name", "Quản Trị Viên")
        }
    })
    res.set_cookie(
        key="admin_session",
        value=token,
        max_age=7 * 86400,
        httponly=True,
        samesite="lax",
        path="/"
    )
    return res

@app.post("/api/admin/logout")
async def api_admin_logout(response: Response):
    """Đăng xuất tài khoản Quản Trị Viên"""
    res = JSONResponse({"status": "success", "message": "Đã đăng xuất thành công."})
    res.delete_cookie(key="admin_session", path="/")
    return res

@app.get("/api/admin/check")
async def api_admin_check(request: Request):
    """Kiểm tra trạng thái đăng nhập của Quản Trị Viên"""
    curr = get_current_user_from_request(request)
    return {
        "authenticated": curr is not None,
        "email": curr.get("username") if curr else None,
        "user": {
            "id": curr.get("id"),
            "username": curr.get("username"),
            "name": curr.get("name"),
            "role": curr.get("role")
        } if curr else None,
        "is_localhost": is_host_admin(request)
    }

@app.get("/api/admin/users")
async def get_system_users_api(request: Request):
    """Lấy danh sách người dùng hệ thống (ẩn mật khẩu)"""
    curr = get_current_user_from_request(request)
    if not curr:
        raise HTTPException(status_code=401, detail="Chưa xác thực.")
    users = load_system_users()
    safe_users = []
    for u in users:
        safe_users.append({
            "id": u.get("id"),
            "username": u.get("username"),
            "name": u.get("name"),
            "role": u.get("role"),
            "role_name": u.get("role_name"),
            "status": u.get("status"),
            "created_at": u.get("created_at")
        })
    return {"status": "success", "data": safe_users}

@app.post("/api/admin/users")
async def create_user_api(request: Request):
    """Cấp tài khoản mới (Chỉ dành cho Chủ sở hữu)"""
    curr = get_current_user_from_request(request)
    if not curr or (curr.get("role") != "owner" and not is_host_admin(request)):
        raise HTTPException(status_code=403, detail="Chỉ Chủ Sở Hữu mới có quyền cấp tài khoản!")
    
    body = await request.json()
    username = str(body.get("username") or "").strip()
    name = str(body.get("name") or "").strip()
    password = str(body.get("password") or "").strip()
    role = str(body.get("role") or "viewer").strip()
    
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Tên tài khoản tối thiểu 3 ký tự.")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu tối thiểu 6 ký tự.")
        
    users = load_system_users()
    if any(u.get("username", "").lower() == username.lower() for u in users):
        raise HTTPException(status_code=400, detail="Tên tài khoản đã tồn tại!")
        
    role_map = {"admin": "Quản Trị Viên", "editor": "Biên Tập Viên", "viewer": "Chỉ Xem"}
    new_user = {
        "id": f"usr_{int(time.time() * 1000)}",
        "username": username,
        "name": name or username,
        "role": role,
        "role_name": role_map.get(role, "Người dùng"),
        "password": password,
        "status": "active",
        "created_at": datetime.datetime.now().strftime("%d/%m/%Y")
    }
    users.append(new_user)
    save_system_users(users)
    return {"status": "success", "message": "Đã cấp tài khoản mới thành công!", "user": new_user}

@app.put("/api/admin/users/{user_id}")
async def update_user_api(user_id: str, request: Request):
    """Chỉnh sửa thông tin/mật khẩu tài khoản (Chỉ dành cho Chủ sở hữu)"""
    curr = get_current_user_from_request(request)
    if not curr or (curr.get("role") != "owner" and not is_host_admin(request)):
        raise HTTPException(status_code=403, detail="Chỉ Chủ Sở Hữu mới có quyền chỉnh sửa tài khoản!")
        
    body = await request.json()
    users = load_system_users()
    target = next((u for u in users if u.get("id") == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
        
    if "name" in body and body["name"]:
        target["name"] = str(body["name"]).strip()
    if "password" in body and body["password"]:
        pwd = str(body["password"]).strip()
        if len(pwd) >= 6:
            target["password"] = pwd
    if target.get("role") != "owner":
        if "role" in body and body["role"]:
            target["role"] = body["role"]
            role_map = {"admin": "Quản Trị Viên", "editor": "Biên Tập Viên", "viewer": "Chỉ Xem"}
            target["role_name"] = role_map.get(body["role"], "Người dùng")
        if "status" in body and body["status"]:
            target["status"] = body["status"]
            
    save_system_users(users)
    return {"status": "success", "message": "Đã cập nhật tài khoản thành công!"}

@app.delete("/api/admin/users/{user_id}")
async def delete_user_api(user_id: str, request: Request):
    """Xóa tài khoản (Chỉ dành cho Chủ sở hữu, không thể xóa Master Owner)"""
    curr = get_current_user_from_request(request)
    if not curr or (curr.get("role") != "owner" and not is_host_admin(request)):
        raise HTTPException(status_code=403, detail="Chỉ Chủ Sở Hữu mới có quyền xóa tài khoản!")
        
    users = load_system_users()
    target = next((u for u in users if u.get("id") == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản Chủ Sở Hữu Tối Cao!")
        
    users = [u for u in users if u.get("id") != user_id]
    save_system_users(users)
    return {"status": "success", "message": "Đã xóa tài khoản thành công!"}

@app.get("/api/admin/files")
async def get_admin_files(request: Request):
    """Lấy danh sách các file Excel trong Data/ và 03.QLDA/"""
    if not is_authenticated_admin(request):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Quản Trị Viên.")
    
    files_list = []
    
    def scan_dir(folder_path: str, category_name: str, folder_key: str):
        if not os.path.exists(folder_path):
            return
        for f in os.listdir(folder_path):
            if f.startswith("~$") or not f.lower().endswith((".xlsx", ".xlsm")):
                continue
            fp = os.path.join(folder_path, f)
            if not os.path.isfile(fp):
                continue
            try:
                st = os.stat(fp)
                size_bytes = st.st_size
                mtime = st.st_mtime
                mtime_str = datetime.datetime.fromtimestamp(mtime).strftime("%d/%m/%Y %H:%M:%S")
                
                if size_bytes > 1024 * 1024:
                    size_str = f"{size_bytes / (1024 * 1024):.2f} MB"
                else:
                    size_str = f"{size_bytes / 1024:.1f} KB"
                
                files_list.append({
                    "name": f,
                    "category": category_name,
                    "folder": folder_key,
                    "file_path": fp,
                    "size_bytes": size_bytes,
                    "size_formatted": size_str,
                    "mtime": mtime,
                    "mtime_formatted": mtime_str
                })
            except Exception:
                pass
                
    scan_dir(QLDA_FOLDER, "Tiến Độ Công Đoạn (QLDA)", "03.QLDA")
    scan_dir(DATA_FOLDER, "Vật Tư & BTP (Packing List)", "Data")
    
    # Sắp xếp file mới nhất lên đầu
    files_list.sort(key=lambda x: x["mtime"], reverse=True)
    return {
        "status": "success",
        "count": len(files_list),
        "files": files_list
    }

@app.post("/api/admin/delete-file")
async def delete_admin_file(request: Request):
    """Xóa 1 file Excel khỏi hệ thống"""
    if not is_authenticated_admin(request):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Quản Trị Viên.")
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu JSON không hợp lệ.")
        
    filename = os.path.basename(str(body.get("name") or "").strip())
    folder_type = str(body.get("folder") or body.get("category") or "").strip()
    
    if not filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ.")
        
    target_dir = QLDA_FOLDER if "qlda" in folder_type.lower() or "03" in folder_type.lower() else DATA_FOLDER
    target_path = os.path.join(target_dir, filename)
    
    if not is_safe_path(target_path, [DATA_FOLDER, QLDA_FOLDER]):
        raise HTTPException(status_code=400, detail="Đường dẫn file không an toàn.")
        
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="File không tồn tại trên hệ thống.")
        
    try:
        os.remove(target_path)
        clear_all_cache()
        threading.Thread(target=warm_up_cache, args=(DATA_FOLDER, QLDA_FOLDER), daemon=True).start()
        return {"status": "success", "message": f"Đã xóa file {filename} và làm mới bộ nhớ cache thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể xóa file: {str(e)}")

@app.get("/api/admin/download-file")
async def download_admin_file(request: Request, name: str = Query(...), folder: str = Query(...)):
    """Tải file Excel từ hệ thống về máy tính"""
    if not is_authenticated_admin(request):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Quản Trị Viên.")
    
    filename = os.path.basename(name.strip())
    target_dir = QLDA_FOLDER if "qlda" in folder.lower() or "03" in folder.lower() else DATA_FOLDER
    target_path = os.path.join(target_dir, filename)

    if not is_safe_path(target_path, [DATA_FOLDER, QLDA_FOLDER]) or not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file trên hệ thống.")

    return FileResponse(
        target_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.post("/api/admin/change-password")
async def change_admin_password(request: Request):
    """Đổi mật khẩu Quản Trị Viên"""
    global ADMIN_PASSWORD
    if not is_authenticated_admin(request):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Quản Trị Viên.")
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu JSON không hợp lệ.")
        
    old_pwd = str(body.get("old_password") or "").strip()
    new_pwd = str(body.get("new_password") or "").strip()

    if old_pwd != ADMIN_PASSWORD:
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")
    if len(new_pwd) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có tối thiểu 6 ký tự.")

    ADMIN_PASSWORD = new_pwd
    return {"status": "success", "message": "Đã đổi mật khẩu quản trị viên thành công."}

@app.post("/api/admin/sync-online")
async def admin_sync_online(request: Request):
    """Kích hoạt biên dịch và đồng bộ dữ liệu sang bản Online 24/24"""
    if not is_authenticated_admin(request):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Quản Trị Viên.")
    try:
        from tools.build_static_data import build_static_package
        build_static_package()
        return {"status": "success", "message": "Đã biên dịch và đồng bộ toàn bộ dữ liệu tĩnh sang online_247 thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đồng bộ online: {str(e)}")

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
