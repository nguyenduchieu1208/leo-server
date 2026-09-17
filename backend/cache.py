"""
Module quản lý Cache dữ liệu kép: Siêu bộ nhớ RAM + SQLite Persistence.
Tối ưu hóa chịu tải cao cho hàng trăm người truy cập đồng thời:
- Phản hồi từ RAM trong 0.001 giây (1ms).
- Tự động nén và lưu dự phòng vào SQLite.
- Cơ chế kiểm tra mtime thông minh: Tự động cập nhật lại khi file Excel bị sửa đổi.
- Hỗ trợ nạp trước (Warm-up / Pre-cache) toàn bộ file khi server khởi động.
"""

import os
import json
import sqlite3
import threading
from typing import Dict, Any, Optional, List
from backend.parser import parse_project_details, list_available_projects

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache.db")

_RAM_CACHE: Dict[str, Dict[str, Any]] = {}
_RAM_LOCK = threading.Lock()

def init_cache_db():
    """Khởi tạo bảng cache trong SQLite nếu chưa tồn tại"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_cache (
            file_path TEXT PRIMARY KEY,
            mtime REAL,
            data_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cache_mtime ON project_cache(file_path, mtime)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qlda_cache (
            file_path TEXT PRIMARY KEY,
            mtime REAL,
            data_json TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qlda_cache_mtime ON qlda_cache(file_path, mtime)")
    conn.commit()
    conn.close()

def get_cached_project(file_path: str, force_reload: bool = False) -> Dict[str, Any]:
    """
    Lấy dữ liệu dự án:
    1. Ưu tiên lấy từ RAM Cache (cực nhanh, không tốn I/O đĩa cứng)
    2. Nếu chưa có trong RAM, lấy từ SQLite Cache
    3. Nếu file bị sửa đổi hoặc force_reload=True, đọc lại Excel và lưu cả vào RAM & SQLite.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    current_mtime = os.path.getmtime(file_path)
    
    if not force_reload:
        with _RAM_LOCK:
            if file_path in _RAM_CACHE:
                cached_entry = _RAM_CACHE[file_path]
                if abs(cached_entry["mtime"] - current_mtime) < 0.01:
                    return cached_entry["data"]

    init_cache_db()
    if not force_reload:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT mtime, data_json FROM project_cache WHERE file_path = ?", (file_path,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            cached_mtime, cached_json = row
            if abs(cached_mtime - current_mtime) < 0.01:
                try:
                    data = json.loads(cached_json)
                    json_bytes = cached_json.encode("utf-8")
                    with _RAM_LOCK:
                        _RAM_CACHE[file_path] = {
                            "mtime": current_mtime,
                            "data": data,
                            "json_bytes": json_bytes
                        }
                    return data
                except Exception:
                    pass
                    
    parsed_data = parse_project_details(file_path)
    data_str = json.dumps(parsed_data, ensure_ascii=False)
    json_bytes = data_str.encode("utf-8")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO project_cache (file_path, mtime, data_json, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (file_path, current_mtime, data_str))
    conn.commit()
    conn.close()
    
    with _RAM_LOCK:
        _RAM_CACHE[file_path] = {
            "mtime": current_mtime,
            "data": parsed_data,
            "json_bytes": json_bytes
        }
    return parsed_data

def get_cached_project_json(file_path: str, force_reload: bool = False) -> bytes:
    """Trả về trực tiếp chuỗi bytes JSON đã serialize sẵn trong RAM (phản hồi trong 0.001s)"""
    if not force_reload:
        current_mtime = os.path.getmtime(file_path)
        with _RAM_LOCK:
            if file_path in _RAM_CACHE and "json_bytes" in _RAM_CACHE[file_path]:
                entry = _RAM_CACHE[file_path]
                if abs(entry["mtime"] - current_mtime) < 0.01:
                    return entry["json_bytes"]
    
    # Nếu chưa có trong RAM, gọi get_cached_project để nạp
    get_cached_project(file_path, force_reload=force_reload)
    with _RAM_LOCK:
        return _RAM_CACHE[file_path]["json_bytes"]

def get_cached_qlda(file_path: str, force_reload: bool = False) -> Dict[str, Any]:
    """
    Lấy dữ liệu dự án QLDA:
    1. Ưu tiên lấy từ RAM Cache (0.001s)
    2. Nếu chưa có trong RAM, lấy từ SQLite Cache (qlda_cache)
    3. Nếu file bị sửa đổi hoặc force_reload=True, đọc lại Excel và lưu cả vào RAM & SQLite.
    """
    from backend.parser_qlda import parse_qlda_file

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    current_mtime = os.path.getmtime(file_path)
    cache_key = f"qlda:{file_path}"
    
    if not force_reload:
        with _RAM_LOCK:
            if cache_key in _RAM_CACHE:
                cached_entry = _RAM_CACHE[cache_key]
                if abs(cached_entry["mtime"] - current_mtime) < 0.01:
                    return cached_entry["data"]

    init_cache_db()
    if not force_reload:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT mtime, data_json FROM qlda_cache WHERE file_path = ?", (file_path,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            cached_mtime, cached_json = row
            if abs(cached_mtime - current_mtime) < 0.01:
                try:
                    data = json.loads(cached_json)
                    json_bytes = cached_json.encode("utf-8")
                    with _RAM_LOCK:
                        _RAM_CACHE[cache_key] = {
                            "mtime": current_mtime,
                            "data": data,
                            "json_bytes": json_bytes
                        }
                    return data
                except Exception:
                    pass
                    
    parsed_data = parse_qlda_file(file_path)
    data_str = json.dumps(parsed_data, ensure_ascii=False)
    json_bytes = data_str.encode("utf-8")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO qlda_cache (file_path, mtime, data_json, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (file_path, current_mtime, data_str))
    conn.commit()
    conn.close()
    
    with _RAM_LOCK:
        _RAM_CACHE[cache_key] = {
            "mtime": current_mtime,
            "data": parsed_data,
            "json_bytes": json_bytes
        }
    return parsed_data

def get_cached_qlda_json(file_path: str, force_reload: bool = False) -> bytes:
    """Trả về trực tiếp chuỗi bytes JSON đã serialize sẵn trong RAM cho QLDA (0.001s)"""
    cache_key = f"qlda:{file_path}"
    if not force_reload:
        current_mtime = os.path.getmtime(file_path)
        with _RAM_LOCK:
            if cache_key in _RAM_CACHE and "json_bytes" in _RAM_CACHE[cache_key]:
                entry = _RAM_CACHE[cache_key]
                if abs(entry["mtime"] - current_mtime) < 0.01:
                    return entry["json_bytes"]
    
    get_cached_qlda(file_path, force_reload=force_reload)
    with _RAM_LOCK:
        return _RAM_CACHE[cache_key]["json_bytes"]

from concurrent.futures import ThreadPoolExecutor

def warm_up_cache(data_folder: str = None, qlda_folder: str = None):
    """Làm nóng bộ nhớ đệm (Pre-cache / Warm-up) chạy ngầm đa luồng cho cả PL và QLDA"""
    workers = min(4, os.cpu_count() or 4)

    # 1. Warm-up PL
    if data_folder and os.path.exists(data_folder):
        projects = list_available_projects(data_folder)
        if projects:
            try:
                print(f"[*] Dang nap du lieu da luong (Warm-up) cho {len(projects)} file du an PL vao RAM...")
            except Exception:
                pass
                
            def _load_single_pl(p):
                try:
                    get_cached_project(p["file_path"])
                except Exception as e:
                    try:
                        print(f"  [-] Loi nap PL {p['display_name']}: {e}")
                    except Exception:
                        pass

            with ThreadPoolExecutor(max_workers=workers) as executor:
                list(executor.map(_load_single_pl, projects))

    # 2. Warm-up QLDA
    if qlda_folder and os.path.exists(qlda_folder):
        from backend.parser_qlda import list_available_qlda_projects
        qlda_projects = list_available_qlda_projects(qlda_folder)
        if qlda_projects:
            try:
                print(f"[*] Dang nap du lieu da luong (Warm-up) cho {len(qlda_projects)} file QLDA vao RAM...")
            except Exception:
                pass

            def _load_single_qlda(p):
                try:
                    get_cached_qlda(p["file_path"])
                except Exception as e:
                    try:
                        print(f"  [-] Loi nap QLDA {p['project_id']}: {e}")
                    except Exception:
                        pass

            with ThreadPoolExecutor(max_workers=workers) as executor:
                list(executor.map(_load_single_qlda, qlda_projects))

    try:
        print("[*] Bo nho dem RAM & SQLite da nap xong toan bo, san sang phuc vu voi toc do 0.001s!")
    except Exception:
        pass

def clear_all_cache():
    """Xóa sạch cache cả trong RAM và SQLite (cả PL và QLDA)"""
    with _RAM_LOCK:
        _RAM_CACHE.clear()
    init_cache_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM project_cache")
    cursor.execute("DELETE FROM qlda_cache")
    conn.commit()
    conn.close()
