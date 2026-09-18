"""
Module bóc tách dữ liệu BOM & BTP cho kết cấu thép (AMECC).
- Bóc tách cấu kiện có AS Symbol = 'X'
- Gom toàn bộ bán thành phẩm (BTP) con bên dưới cấu kiện
- Đối chiếu với sheet BTP để gán ngày nhận tương ứng
- Tích hợp bộ phân tích chủng loại Shape (Thép hình)
- Hỗ trợ quét đệ quy thư mục Dữ liệu mẫu và các thư mục con bên trong
"""

import os
import re
import datetime
import openpyxl
from typing import Dict, List, Any, Optional, Tuple
from backend.shape_analyzer import analyze_shape_part

def clean_str(val: Any) -> str:
    """Loại bỏ khoảng trắng thừa và chuẩn hóa chuỗi"""
    if val is None:
        return ""
    return str(val).strip()

def normalize_key(text: str) -> str:
    """Chuẩn hóa khóa để đối soát BTP (bỏ dấu cách, dấu gạch ngang, chuyển chữ hoa)"""
    if not text:
        return ""
    return re.sub(r'[\s\-_#]+', '', str(text)).upper()

def format_date_val(val: Any, default_year: Optional[int] = None) -> Optional[str]:
    """Chuyển đổi giá trị ngày trong Excel thành định dạng chuẩn DD/MM/YYYY.
    Xử lý:
    - datetime.datetime / datetime.date
    - Serial number Excel (ví dụ 45500, 46100)
    - YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
    - 2 chữ số năm: DD/MM/YY, DD-MM-YY (ví dụ 20/08/26 -> 20/08/2026)
    - Chỉ có Ngày/Tháng: DD/MM, DD-MM, DD.MM (ví dụ 20/07, 21-8)
    - Chuỗi có chữ phụ: Ngày 20/07, 15/8 (đợt 1)
    """
    if val is None:
        return None
        
    y_default = default_year or 2026
    
    # 1. datetime / date object
    if isinstance(val, (datetime.datetime, datetime.date)):
        y = val.year
        if y < 2020 or y > 2035:
            y = y_default
        return f"{val.day:02d}/{val.month:02d}/{y:04d}"
        
    # 2. Số Serial Date trong Excel
    if isinstance(val, (int, float)) and 42000 <= val <= 55000:
        try:
            from openpyxl.utils.datetime import from_excel
            dt = from_excel(val)
            y = dt.year if 2020 <= dt.year <= 2035 else y_default
            return f"{dt.day:02d}/{dt.month:02d}/{y:04d}"
        except Exception:
            pass

    val_str = str(val).strip()
    if not val_str:
        return None

    # 3. Dạng YYYY-MM-DD hoặc YYYY/MM/DD
    m = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', val_str)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2020 <= y <= 2035 and 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{d:02d}/{mo:02d}/{y:04d}"

    # 4. Dạng DD-MM-YYYY hoặc DD/MM/YYYY
    m2 = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', val_str)
    if m2:
        p1, p2, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        if 2020 <= y <= 2035:
            d, mo = (p2, p1) if (p2 > 12 >= p1) else (p1, p2)
            if 1 <= d <= 31 and 1 <= mo <= 12:
                return f"{d:02d}/{mo:02d}/{y:04d}"

    # 5. Dạng DD-MM-YY (2 chữ số năm, ví dụ 20/08/26 hoặc 15-7-25)
    m2y = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b', val_str)
    if m2y:
        p1, p2, yy = int(m2y.group(1)), int(m2y.group(2)), int(m2y.group(3))
        y = 2000 + yy
        if 2020 <= y <= 2035 and 1 <= p1 <= 31 and 1 <= p2 <= 12:
            return f"{p1:02d}/{p2:02d}/{y:04d}"

    # 6. Dạng chỉ Ngày/Tháng (DD/MM, DD-MM, DD.MM hoặc có chữ đính kèm như "Ngày 20/7")
    m3 = re.search(r'(?:^|[^\d])(\d{1,2})[-/.](\d{1,2})(?:[^\d]|$)', val_str)
    if m3:
        p1, p2 = int(m3.group(1)), int(m3.group(2))
        y = y_default
        if p1 > 12 >= p2:
            d, mo = p1, p2
        elif p2 > 12 >= p1:
            d, mo = p2, p1
        else:
            d, mo = p1, p2
        if 1 <= d <= 31 and 1 <= mo <= 12:
            return f"{d:02d}/{mo:02d}/{y:04d}"

    return None

def parse_number(val: Any, is_int: bool = False) -> Optional[float]:
    """Chuyển đổi an toàn giá trị sang số float hoặc int"""
    if val is None:
        return None
    try:
        clean_v = str(val).replace(",", "").strip()
        num = float(clean_v)
        if is_int or num.is_integer():
            return int(num)
        return round(num, 3)
    except Exception:
        return None

def list_available_projects(data_folder: str) -> List[Dict[str, Any]]:
    """Quét thư mục và tất cả các thư mục con bên trong để tìm các file dự án Excel (.xlsx) hợp lệ"""
    if not os.path.exists(data_folder):
        return []
        
    projects = []
    # Quét đệ quy (os.walk) hỗ trợ cả các thư mục con bên trong thư mục Dữ liệu mẫu
    for root, dirs, files in os.walk(data_folder):
        for fname in sorted(files):
            if fname.lower().endswith((".xlsx", ".xlsm")) and not fname.startswith("~$"):
                fpath = os.path.join(root, fname)
                try:
                    rel_dir = os.path.relpath(root, data_folder)
                    subfolder_label = "" if rel_dir == "." else f"[{rel_dir}] "
                    
                    # Xác định mã dự án
                    clean_name = re.sub(r'[_ -]*pl\.(xlsx|xlsm)$', '', fname, flags=re.IGNORECASE)
                    clean_name = re.sub(r'\.(xlsx|xlsm)$', '', clean_name, flags=re.IGNORECASE).strip()
                    display_code = f"{subfolder_label}{clean_name}"
                    
                    projects.append({
                        "file_name": fname,
                        "project_id": clean_name,
                        "display_name": display_code,
                        "subfolder": "" if rel_dir == "." else rel_dir,
                        "file_path": fpath,
                        "size_bytes": os.path.getsize(fpath),
                    })
                except Exception as e:
                    print(f"Error reading {fname}: {e}")
                
    return projects

def detect_bom_columns(ws, max_scan_rows: int = 15) -> Tuple[int, Dict[str, int]]:
    """Dò tìm dòng tiêu đề và vị trí các cột trong sheet BOM / Part List"""
    header_row = 8
    best_map = {}
    max_matches = 0
    
    for r in range(1, max_scan_rows + 1):
        temp_map = {}
        for c in range(1, min(75, ws.max_column + 1)):
            cell_val = str(ws.cell(r, c).value or "").strip().lower()
            if not cell_val:
                continue
                
            if "drawing number" in cell_val or cell_val == "dwg":
                temp_map["dwg"] = c
            elif "assembly no" in cell_val or "assembly" in cell_val:
                temp_map["assembly"] = c
            elif "description" in cell_val or "mô tả" in cell_val:
                temp_map["description"] = c
            elif "part no" in cell_val or "5a" in cell_val:
                temp_map["part_no"] = c
            elif "marking as cutting" in cell_val or "5b" in cell_val:
                temp_map["mark_cutting"] = c
            elif "size" in cell_val or "kích thước" in cell_val:
                temp_map["size"] = c
            elif "length" in cell_val or "chiều dài" in cell_val:
                temp_map["length"] = c
            elif "material" in cell_val or "vật liệu" in cell_val:
                temp_map["material"] = c
            elif cell_val in ["q'ty", "qty", "sl"] and "qty" not in temp_map:
                temp_map["qty"] = c
            elif cell_val in ["t.q'ty", "t'qty", "t.qty"] and "tqty" not in temp_map:
                temp_map["tqty"] = c
            elif cell_val in ["u.weight", "uweight", "đơn trọng", "don trong"]:
                temp_map["uweight"] = c
            elif cell_val in ["t.weight", "tweight", "tổng trọng", "tong trong"]:
                temp_map["tweight"] = c
            elif cell_val in ["dvg", "dang", "dạng", "đơn vị gc", "đơn vị gia công"]:
                temp_map["dvg"] = c
            elif "phan giao" in cell_val or "phân giao" in cell_val or cell_val in ["to", "tổ", "đơn vị giao", "don vi giao", "nơi giao", "noi giao"]:
                temp_map["don_vi_giao"] = c
            elif "remark" in cell_val or "ghi chú" in cell_val or "ghi chu" in cell_val or "note" in cell_val:
                temp_map["remark"] = c
            elif "as symbol" in cell_val or "as symble" in cell_val or "as_symbol" in cell_val:
                temp_map["as_symbol"] = c

        if len(temp_map) > max_matches:
            max_matches = len(temp_map)
            header_row = r
            best_map = temp_map
            
    defaults = {
        "dwg": 2,
        "assembly": 3,
        "description": 4,
        "part_no": 5,
        "mark_cutting": 6,
        "size": 7,
        "length": 8,
        "material": 9,
        "qty": 10,
        "tqty": 12,
        "uweight": 13,
        "tweight": 14,
        "dvg": 16,
        "don_vi_giao": 17,
        "remark": 30,
        "as_symbol": 31
    }
    for k, v in defaults.items():
        if k not in best_map:
            best_map[k] = v
            
    return header_row, best_map

def detect_btp_sheet_data(ws) -> Dict[str, Any]:
    """Đọc và lập chỉ mục dữ liệu trong sheet BTP"""
    header_row = 29
    col_map = {}
    for r in range(15, min(40, ws.max_row + 1)):
        row_str = [str(ws.cell(r, c).value or "").strip().lower() for c in range(1, min(150, ws.max_column + 1))]
        if any("part no" in t for t in row_str) and any("chủng loại" in t or "chung loai" in t for t in row_str):
            header_row = r
            for c_idx, t in enumerate(row_str, 1):
                if "chủng loại" in t or "chung loai" in t:
                    col_map["chung_loai"] = c_idx
                elif "part no" in t:
                    col_map["part_no"] = c_idx
                elif "size" in t:
                    col_map["size"] = c_idx
                elif "description" in t or "mô tả" in t:
                    col_map["desc"] = c_idx
                elif "length" in t or "chiều dài" in t:
                    col_map["length"] = c_idx
                elif "material" in t or "vật liệu" in t:
                    col_map["material"] = c_idx
                elif "t.q'ty" in t or "t'qty" in t:
                    col_map["tqty"] = c_idx
                elif "u.weight" in t:
                    col_map["uweight"] = c_idx
                elif "t.weight" in t:
                    col_map["tweight"] = c_idx
                elif "đã nhận" in t or "da nhan" in t:
                    col_map["da_nhan"] = c_idx
                elif "còn thiếu" in t or "con thieu" in t:
                    col_map["con_thieu"] = c_idx
                elif "dvg" in t or "đơn vị" in t or "gia công" in t:
                    col_map["dvg"] = c_idx
                elif "cutting no" in t or "cp no" in t:
                    col_map["cutting_no"] = c_idx
                elif "qty cutting" in t:
                    col_map["qty_cutting"] = c_idx
                elif "ktra nối" in t or "ktra noi" in t or "kiểm tra nối" in t or "nối" in t:
                    col_map["ktra_noi"] = c_idx
            break

    # Quét bổ sung cột DVG nếu chưa thấy ở hàng tiêu đề
    if "dvg" not in col_map:
        for scan_r in [header_row, header_row - 1]:
            if 1 <= scan_r <= ws.max_row:
                for c in range(1, min(150, ws.max_column + 1)):
                    cv = str(ws.cell(scan_r, c).value or "").strip().upper()
                    if cv == "DVG" or "DVG" in cv or "ĐƠN VỊ GC" in cv:
                        col_map["dvg"] = c
                        break
                if "dvg" in col_map:
                    break

    col_defaults = {
        "chung_loai": 3,
        "part_no": 4,
        "size": 5,
        "desc": 6,
        "length": 7,
        "material": 8,
        "tqty": 9,
        "uweight": 10,
        "tweight": 11,
        "da_nhan": 12,
        "con_thieu": 13,
        "ktra_noi": 27,
        "cutting_no": 33,
        "qty_cutting": 34
    }
    for k, v in col_defaults.items():
        if k not in col_map:
            col_map[k] = v

    date_cols: List[Tuple[int, str]] = []
    da_nhan_c = col_map.get("da_nhan", 12)
    start_date_c = da_nhan_c + 2

    # 1. Tìm năm gốc của sheet / file (quét các dòng tiêu đề nếu có cột hoặc dòng có năm)
    sheet_base_year = 2026
    for r_check in [header_row, header_row - 1, header_row + 1]:
        if 1 <= r_check <= ws.max_row:
            for c in range(start_date_c, min(ws.max_column + 1, start_date_c + 70)):
                cv = ws.cell(r_check, c).value
                if isinstance(cv, (datetime.datetime, datetime.date)) and 2020 <= cv.year <= 2035:
                    sheet_base_year = cv.year
                    break
                elif cv:
                    ym = re.search(r'\b(202[0-9]|203[0-5])\b', str(cv))
                    if ym:
                        sheet_base_year = int(ym.group(1))
                        break
        if sheet_base_year != 2026:
            break

    # 2. Thu thập ứng viên cột ngày và phân tích ngày/tháng/năm
    col_raw_data = []
    consec_empty = 0
    
    for c in range(start_date_c, ws.max_column + 1):
        cell_val = ws.cell(header_row, c).value
        if cell_val is None and header_row > 1:
            cell_val = ws.cell(header_row - 1, c).value
            
        if cell_val is None:
            consec_empty += 1
            if consec_empty > 15:
                break
            continue
            
        consec_empty = 0
        v_str = str(cell_val).strip().upper()
        
        # Kiểm tra nếu là cột tổng kết / thông tin (KO BB, LẤY DATA, DVG, MPR NO, CUTTING NO)
        # Chỉ dừng khi các cột tiếp theo thực sự không còn ngày nào
        is_summary_header = any(v_str == sw or v_str.startswith(sw) for sw in [
            "KO BB", "LẤY DATA", "DVG", "CUTTING NO", "MPR NO", "QTY MPR"
        ])
        if is_summary_header:
            has_future_date = False
            for next_c in range(c + 1, min(ws.max_column + 1, c + 6)):
                next_val = ws.cell(header_row, next_c).value
                if isinstance(next_val, (datetime.datetime, datetime.date)):
                    has_future_date = True
                    break
                elif next_val and any(sep in str(next_val) for sep in ["/", "-"]) and any(ch.isdigit() for ch in str(next_val)):
                    has_future_date = True
                    break
            if not has_future_date:
                break
            else:
                continue

        d_explicit = None
        d_day = None
        d_month = None
        
        if isinstance(cell_val, (datetime.datetime, datetime.date)):
            d_day = cell_val.day
            d_month = cell_val.month
            if 2020 <= cell_val.year <= 2035:
                d_explicit = cell_val.year
        elif isinstance(cell_val, (int, float)) and 42000 <= cell_val <= 55000:
            try:
                from openpyxl.utils.datetime import from_excel
                dt = from_excel(cell_val)
                d_day = dt.day
                d_month = dt.month
                if 2020 <= dt.year <= 2035:
                    d_explicit = dt.year
            except Exception:
                pass
        else:
            val_clean = str(cell_val).strip()
            # YYYY-MM-DD
            m_ymd = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', val_clean)
            if m_ymd:
                y, mo, d = int(m_ymd.group(1)), int(m_ymd.group(2)), int(m_ymd.group(3))
                if 2020 <= y <= 2035 and 1 <= mo <= 12 and 1 <= d <= 31:
                    d_day, d_month, d_explicit = d, mo, y
            else:
                # DD/MM/YYYY
                m_dmy = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', val_clean)
                if m_dmy:
                    p1, p2, y = int(m_dmy.group(1)), int(m_dmy.group(2)), int(m_dmy.group(3))
                    if 2020 <= y <= 2035:
                        d, mo = (p2, p1) if (p2 > 12 >= p1) else (p1, p2)
                        if 1 <= d <= 31 and 1 <= mo <= 12:
                            d_day, d_month, d_explicit = d, mo, y
                else:
                    # DD/MM/YY (2 chữ số năm)
                    m_dmy2 = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b', val_clean)
                    if m_dmy2:
                        p1, p2, yy = int(m_dmy2.group(1)), int(m_dmy2.group(2)), int(m_dmy2.group(3))
                        y = 2000 + yy
                        if 2020 <= y <= 2035 and 1 <= p1 <= 31 and 1 <= p2 <= 12:
                            d_day, d_month, d_explicit = p1, p2, y
                    else:
                        # DD/MM hoặc DD-MM hoặc DD.MM
                        m_dm = re.search(r'(?:^|[^\d])(\d{1,2})[-/.](\d{1,2})(?:[^\d]|$)', val_clean)
                        if m_dm:
                            p1, p2 = int(m_dm.group(1)), int(m_dm.group(2))
                            if 1 <= p1 <= 31 and 1 <= p2 <= 12:
                                d_day, d_month = p1, p2
                            elif 1 <= p2 <= 31 and 1 <= p1 <= 12:
                                d_day, d_month = p2, p1

        if d_day and d_month:
            col_raw_data.append({
                "col": c,
                "day": d_day,
                "month": d_month,
                "year": d_explicit,
                "raw": cell_val
            })

    # 3. Kế thừa năm 2 chiều (Trước -> Sau và Sau -> Trước) + xử lý chuyển năm (Tháng 12 -> Tháng 1)
    # Bước A: Tìm năm khởi điểm từ các cột có năm rõ ràng
    first_known_year = sheet_base_year
    for item in col_raw_data:
        if item["year"]:
            first_known_year = item["year"]
            break

    # Bước B: Quét xuôi (Từ trái sang phải): nếu thiếu năm, lấy năm của cột trước
    running_year = first_known_year
    prev_month = None
    for item in col_raw_data:
        if item["year"] is not None:
            running_year = item["year"]
        else:
            if prev_month is not None and prev_month == 12 and item["month"] == 1:
                running_year += 1
            item["year"] = running_year
        prev_month = item["month"]

    # Bước C: Quét ngược (Từ phải sang trái): nếu các cột đầu tiên chưa có năm rõ ràng
    back_year = running_year
    next_month = None
    for item in reversed(col_raw_data):
        if item["year"] is not None:
            back_year = item["year"]
        else:
            if next_month is not None and next_month == 1 and item["month"] == 12:
                back_year -= 1
            item["year"] = back_year
        next_month = item["month"]

    # 4. Gán danh sách cột ngày chuẩn hoá
    for item in col_raw_data:
        final_d_str = f"{item['day']:02d}/{item['month']:02d}/{item['year']:04d}"
        date_cols.append((item["col"], final_d_str))

    btp_items: Dict[str, Dict[str, Any]] = {}
    normalized_btp: Dict[str, str] = {}
    
    for r in range(header_row + 1, ws.max_row + 1):
        pno_val = ws.cell(r, col_map["part_no"]).value
        if pno_val is None:
            continue
        pno_str = clean_str(pno_val)
        if not pno_str or pno_str.lower() in ["total", "tổng cộng", "sum"]:
            continue
            
        dates_received = {}
        for c_idx, d_str in date_cols:
            q_val = parse_number(ws.cell(r, c_idx).value)
            if q_val and q_val > 0:
                dates_received[d_str] = dates_received.get(d_str, 0) + q_val
                
        da_nhan_num = parse_number(ws.cell(r, col_map["da_nhan"]).value) or 0
        tqty_num = parse_number(ws.cell(r, col_map["tqty"]).value, is_int=True) or 0
        con_thieu_num = parse_number(ws.cell(r, col_map["con_thieu"]).value) or max(0, tqty_num - da_nhan_num)
        
        cutting_val = ws.cell(r, col_map.get("cutting_no", 33)).value
        cutting_str = clean_str(cutting_val) if cutting_val not in ["-", "0", None] else ""
        qty_cutting = parse_number(ws.cell(r, col_map.get("qty_cutting", 34)).value, is_int=True)
        ktra_noi_val = ws.cell(r, col_map["ktra_noi"]).value if "ktra_noi" in col_map else None
        ktra_noi_str = clean_str(ktra_noi_val) if ktra_noi_val not in ["-", "0", None] else ""
        dvg_val = ws.cell(r, col_map["dvg"]).value if "dvg" in col_map else None
        dvg_str = clean_str(dvg_val).upper() if dvg_val not in ["-", "0", None] else ""
        
        item_obj = {
            "row": r,
            "chung_loai": clean_str(ws.cell(r, col_map["chung_loai"]).value),
            "part_no": pno_str,
            "size": clean_str(ws.cell(r, col_map["size"]).value),
            "desc": clean_str(ws.cell(r, col_map["desc"]).value),
            "length": parse_number(ws.cell(r, col_map["length"]).value, is_int=True),
            "material": clean_str(ws.cell(r, col_map["material"]).value),
            "tqty": tqty_num,
            "uweight": parse_number(ws.cell(r, col_map["uweight"]).value),
            "tweight": parse_number(ws.cell(r, col_map["tweight"]).value),
            "da_nhan": da_nhan_num,
            "con_thieu": con_thieu_num,
            "dvg": dvg_str,
            "dates_received": dates_received,
            "ktra_noi": ktra_noi_str,
            "cutting_no": cutting_str,
            "qty_cutting": qty_cutting
        }
        
        btp_items[pno_str.upper()] = item_obj
        normalized_btp[normalize_key(pno_str)] = pno_str.upper()

    return {
        "header_row": header_row,
        "date_cols": [d[1] for d in date_cols],
        "items": btp_items,
        "normalized_map": normalized_btp
    }

def find_matching_btp_sheet(wb, bom_sheet_name: str) -> Optional[str]:
    """Tìm sheet BTP tương ứng với sheet BOM đã cho"""
    all_sheets = wb.sheetnames
    
    direct_candidates = [
        f"BTP-{bom_sheet_name}",
        f"BTP_{bom_sheet_name}",
        f"BTP {bom_sheet_name}"
    ]
    for c in direct_candidates:
        for s in all_sheets:
            if s.strip().upper() == c.strip().upper():
                return s
                
    for s in all_sheets:
        if s.strip().upper().startswith("BTP") and bom_sheet_name.strip().upper() in s.strip().upper():
            return s
            
    btp_sheets = [s for s in all_sheets if s.strip().upper().startswith("BTP")]
    if len(btp_sheets) == 1:
        return btp_sheets[0]
        
    return None

def parse_project_details(file_path: str) -> Dict[str, Any]:
    """
    Hàm xử lý chính: Bóc tách toàn bộ Cấu kiện (AS Symbol = 'X') và BTP con,
    gán tiến độ theo ngày và phân tích Shape.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    wb = openpyxl.load_workbook(file_path, data_only=True)
    try:
        all_sheets = wb.sheetnames
    
        bom_sheets = [
            s for s in all_sheets 
            if not s.strip().upper().startswith("BTP") 
            and s.strip().upper() != "COVER"
            and "NHAS" not in s.strip().upper()
        ]
    
        project_code = os.path.basename(file_path).replace("PL.xlsx", "").replace(".xlsx", "").strip()
        all_assemblies: List[Dict[str, Any]] = []
        all_dates_set = set()
        daily_delivery_summary: Dict[str, Dict[str, Any]] = {}
        shape_warnings_list: List[Dict[str, Any]] = []
    
        for b_sheet in bom_sheets:
            ws_bom = wb[b_sheet]
            btp_sheet_name = find_matching_btp_sheet(wb, b_sheet)
        
            btp_data = None
            if btp_sheet_name and btp_sheet_name in wb.sheetnames:
                btp_data = detect_btp_sheet_data(wb[btp_sheet_name])
                for d in btp_data["date_cols"]:
                    all_dates_set.add(d)
                
            header_row, col_map = detect_bom_columns(ws_bom)
        
            current_assy = None
            for r in range(header_row + 1, ws_bom.max_row + 1):
                as_sym_val = ws_bom.cell(r, col_map.get("as_symbol", 31)).value
                as_sym_str = clean_str(as_sym_val).lower()
            
                assy_no_val = ws_bom.cell(r, col_map.get("assembly", 3)).value
                assy_no_str = clean_str(assy_no_val)
                dwg_str = clean_str(ws_bom.cell(r, col_map.get("dwg", 2)).value)
                desc_str = clean_str(ws_bom.cell(r, col_map.get("description", 4)).value)
                size_str = clean_str(ws_bom.cell(r, col_map.get("size", 7)).value)
            
                if as_sym_str == "x":
                    if current_assy is not None:
                        _finalize_assembly_metrics(current_assy, shape_warnings_list)
                        all_assemblies.append(current_assy)
                    
                    assy_giao_val = ws_bom.cell(r, col_map.get("don_vi_giao", 17)).value
                    assy_don_vi_giao = clean_str(assy_giao_val).upper() if assy_giao_val else ""
                    if assy_don_vi_giao in ["-", "0", "NONE", "NULL"]:
                        assy_don_vi_giao = ""

                    current_assy = {
                        "id": f"{b_sheet}_{assy_no_str}_{r}",
                        "sheet": b_sheet,
                        "btp_sheet": btp_sheet_name or "Không có",
                        "row_index": r,
                        "assembly_no": assy_no_str,
                        "dwg": dwg_str,
                        "description": desc_str,
                        "size": size_str,
                        "don_vi_giao": assy_don_vi_giao,
                        "parts": [],
                        "total_parts_count": 0,
                        "received_parts_count": 0,
                        "total_tqty": 0,
                        "total_da_nhan": 0,
                        "completion_rate": 0.0,
                        "status": "not_received",
                        "has_shape_issue": False,
                        "shape_issues_count": 0,
                        "daily_received": {}
                    }
                elif current_assy is not None:
                    part_no_val = ws_bom.cell(r, col_map.get("part_no", 5)).value
                    part_cut_val = ws_bom.cell(r, col_map.get("mark_cutting", 6)).value
                    part_no = clean_str(part_no_val)
                    part_cut = clean_str(part_cut_val)
                
                    if not part_no and not part_cut and not desc_str and not size_str:
                        continue
                    
                    tqty_val = parse_number(ws_bom.cell(r, col_map.get("tqty", 12)).value, is_int=True) or 1
                    qty_val = parse_number(ws_bom.cell(r, col_map.get("qty", 10)).value, is_int=True) or 1
                    len_val = parse_number(ws_bom.cell(r, col_map.get("length", 8)).value, is_int=True)
                    mat_val = clean_str(ws_bom.cell(r, col_map.get("material", 9)).value)
                    uweight_val = parse_number(ws_bom.cell(r, col_map.get("uweight", 13)).value)
                    tweight_val = parse_number(ws_bom.cell(r, col_map.get("tweight", 14)).value)
                
                    btp_info = None
                    if btp_data:
                        if part_cut and part_cut.upper() in btp_data["items"]:
                            btp_info = btp_data["items"][part_cut.upper()]
                        elif part_no and part_no.upper() in btp_data["items"]:
                            btp_info = btp_data["items"][part_no.upper()]
                        else:
                            norm_k = normalize_key(part_cut) or normalize_key(part_no)
                            if norm_k in btp_data["normalized_map"]:
                                orig_k = btp_data["normalized_map"][norm_k]
                                btp_info = btp_data["items"].get(orig_k)
                            
                    part_raw = {
                        "part_no": part_no,
                        "part_cut": part_cut,
                        "size": size_str,
                        "desc": desc_str,
                        "length": len_val,
                        "tqty": tqty_val
                    }
                    shape_analysis = analyze_shape_part(part_raw, btp_info)
                
                    da_nhan = btp_info.get("da_nhan", 0) if btp_info else 0
                    con_thieu = btp_info.get("con_thieu", tqty_val) if btp_info else tqty_val
                    chung_loai = btp_info.get("chung_loai", "") if btp_info else ""
                    dates_received = btp_info.get("dates_received", {}) if btp_info else {}
                    ktra_noi = btp_info.get("ktra_noi", "") if btp_info else ""
                    bom_remark = clean_str(ws_bom.cell(r, col_map.get("remark", 30)).value)

                    # Cột ktra nối, vướng mắc thép hình và ghi chú BOM đưa vào phần ghi chú
                    note_items = []
                    if ktra_noi:
                        note_items.append(f"Ktra nối: {ktra_noi}")
                    if shape_analysis.get("has_length_issue"):
                        note_items.append("Chưa đủ chiều dài")
                    if bom_remark:
                        note_items.append(bom_remark)
                    ghi_chu = " | ".join(note_items)
                
                    # 1. Xác định Đơn vị gia công (DVG)
                    dvg_candidate = ""
                    if btp_info and btp_info.get("dvg"):
                        dvg_candidate = btp_info.get("dvg")
                    if not dvg_candidate and "dvg" in col_map:
                        dvg_candidate = clean_str(ws_bom.cell(r, col_map["dvg"]).value)

                    dvg_clean = dvg_candidate.strip().upper() if dvg_candidate else ""
                    if not dvg_clean or dvg_clean in ["-", "0", "NONE", "NULL"]:
                        dvg_clean = "KHÁC"

                    # 2. Xác định Đơn vị giao (Phân giao tổ)
                    giao_candidate = ""
                    if btp_info and btp_info.get("don_vi_giao"):
                        giao_candidate = btp_info.get("don_vi_giao")
                    if not giao_candidate and "don_vi_giao" in col_map:
                        giao_candidate = clean_str(ws_bom.cell(r, col_map["don_vi_giao"]).value)
                    if not giao_candidate and current_assy.get("don_vi_giao"):
                        giao_candidate = current_assy.get("don_vi_giao")

                    giao_clean = giao_candidate.strip().upper() if giao_candidate else ""
                    if not giao_clean or giao_clean in ["-", "0", "NONE", "NULL"]:
                        giao_clean = "CHƯA PHÂN GIAO"

                    # Tính toán trọng lượng
                    uweight = uweight_val if uweight_val is not None else 0.0
                    tweight = tweight_val if tweight_val is not None else round(tqty_val * uweight, 2)
                    da_nhan_weight = round(min(da_nhan, tqty_val) * uweight, 2) if uweight else 0.0
                    con_thieu_weight = round(max(0.0, con_thieu * uweight), 2) if uweight else 0.0

                    part_entry = {
                        "row_index": r,
                        "part_no": part_no,
                        "part_cut": part_cut,
                        "display_name": part_cut if part_cut else part_no,
                        "description": desc_str,
                        "chung_loai": chung_loai,
                        "size": size_str,
                        "length": len_val,
                        "material": mat_val,
                        "qty": qty_val,
                        "tqty": tqty_val,
                        "uweight": uweight,
                        "tweight": tweight,
                        "da_nhan_weight": da_nhan_weight,
                        "con_thieu_weight": con_thieu_weight,
                        "da_nhan": da_nhan,
                        "con_thieu": con_thieu,
                        "dvg": dvg_clean,
                        "don_vi_giao": giao_clean,
                        "dates_received": dates_received,
                        "ktra_noi": ktra_noi,
                        "remark": bom_remark,
                        "ghi_chu": ghi_chu,
                        "shape_analysis": shape_analysis,
                        "is_fully_received": da_nhan >= tqty_val and tqty_val > 0
                    }
                
                    current_assy["parts"].append(part_entry)
                
                    for d_str, q_rec in dates_received.items():
                        if d_str not in daily_delivery_summary:
                            daily_delivery_summary[d_str] = {
                                "date": d_str,
                                "total_items_count": 0,
                                "total_qty": 0,
                                "assemblies_affected": set(),
                                "parts_list": []
                            }
                        daily_delivery_summary[d_str]["total_items_count"] += 1
                        daily_delivery_summary[d_str]["total_qty"] += q_rec
                        daily_delivery_summary[d_str]["assemblies_affected"].add(current_assy["assembly_no"])
                        daily_delivery_summary[d_str]["parts_list"].append({
                            "assembly_no": current_assy["assembly_no"],
                            "dwg": current_assy["dwg"],
                            "part_name": part_entry["display_name"],
                            "size": size_str,
                            "qty_received": q_rec,
                            "chung_loai": chung_loai
                        })

            if current_assy is not None:
                _finalize_assembly_metrics(current_assy, shape_warnings_list)
                all_assemblies.append(current_assy)
    finally:
        try:
            wb.close()
        except Exception:
            pass
    
    for d_str, d_data in daily_delivery_summary.items():
        d_data["assemblies_affected"] = sorted(list(d_data["assemblies_affected"]))

    total_assy = len(all_assemblies)
    completed_assy = sum(1 for a in all_assemblies if a["status"] == "completed")
    partial_assy = sum(1 for a in all_assemblies if a["status"] == "partial")
    not_received_assy = sum(1 for a in all_assemblies if a["status"] == "not_received")
    total_shape_issues = sum(1 for a in all_assemblies if a["has_shape_issue"])

    # Tổng hợp phân tích song song: Cả Đơn vị gia công (DVG) và Đơn vị giao (Phân giao tổ)
    dvg_summary_dict: Dict[str, Dict[str, Any]] = {}
    giao_summary_dict: Dict[str, Dict[str, Any]] = {}

    for assy in all_assemblies:
        for p in assy["parts"]:
            # 1. Nhóm theo Đơn vị gia công (DVG: MCC, KHO, PMC, WTC...)
            dvg_code = p.get("dvg") or "KHÁC"
            if dvg_code not in dvg_summary_dict:
                dvg_summary_dict[dvg_code] = {
                    "dvg": dvg_code,
                    "name": dvg_code,
                    "total_qty": 0,
                    "da_nhan_qty": 0,
                    "con_thieu_qty": 0,
                    "total_weight": 0.0,
                    "da_nhan_weight": 0.0,
                    "con_thieu_weight": 0.0,
                    "parts_count": 0,
                    "missing_parts_count": 0,
                    "missing_parts": []
                }
            d = dvg_summary_dict[dvg_code]
            d["total_qty"] += p["tqty"]
            d["da_nhan_qty"] += p["da_nhan"]
            d["con_thieu_qty"] += p["con_thieu"]
            d["total_weight"] = round(d["total_weight"] + (p.get("tweight") or 0.0), 2)
            d["da_nhan_weight"] = round(d["da_nhan_weight"] + (p.get("da_nhan_weight") or 0.0), 2)
            d["con_thieu_weight"] = round(d["con_thieu_weight"] + (p.get("con_thieu_weight") or 0.0), 2)
            d["parts_count"] += 1
            if p["con_thieu"] > 0:
                d["missing_parts_count"] += 1
                d["missing_parts"].append({
                    "assembly_no": assy["assembly_no"],
                    "dwg": assy["dwg"],
                    "sheet": assy["sheet"],
                    "part_name": p["display_name"],
                    "part_no": p["part_no"],
                    "size": p["size"],
                    "material": p["material"],
                    "tqty": p["tqty"],
                    "da_nhan": p["da_nhan"],
                    "con_thieu": p["con_thieu"],
                    "uweight": p["uweight"],
                    "con_thieu_weight": p.get("con_thieu_weight", 0.0),
                    "cutting_no": p.get("shape_analysis", {}).get("cutting_no") or p.get("cutting_no", ""),
                    "ktra_noi": p.get("ktra_noi", ""),
                    "don_vi_giao": p.get("don_vi_giao", "")
                })

            # 2. Nhóm theo Đơn vị giao (Tổ/Xưởng phân giao: S1, S2, S3...)
            giao_code = p.get("don_vi_giao") or "CHƯA PHÂN GIAO"
            if giao_code not in giao_summary_dict:
                giao_summary_dict[giao_code] = {
                    "don_vi_giao": giao_code,
                    "dvg": giao_code,
                    "name": giao_code,
                    "total_qty": 0,
                    "da_nhan_qty": 0,
                    "con_thieu_qty": 0,
                    "total_weight": 0.0,
                    "da_nhan_weight": 0.0,
                    "con_thieu_weight": 0.0,
                    "parts_count": 0,
                    "missing_parts_count": 0,
                    "missing_parts": []
                }
            g = giao_summary_dict[giao_code]
            g["total_qty"] += p["tqty"]
            g["da_nhan_qty"] += p["da_nhan"]
            g["con_thieu_qty"] += p["con_thieu"]
            g["total_weight"] = round(g["total_weight"] + (p.get("tweight") or 0.0), 2)
            g["da_nhan_weight"] = round(g["da_nhan_weight"] + (p.get("da_nhan_weight") or 0.0), 2)
            g["con_thieu_weight"] = round(g["con_thieu_weight"] + (p.get("con_thieu_weight") or 0.0), 2)
            g["parts_count"] += 1
            if p["con_thieu"] > 0:
                g["missing_parts_count"] += 1
                g["missing_parts"].append({
                    "assembly_no": assy["assembly_no"],
                    "dwg": assy["dwg"],
                    "sheet": assy["sheet"],
                    "part_name": p["display_name"],
                    "part_no": p["part_no"],
                    "size": p["size"],
                    "material": p["material"],
                    "tqty": p["tqty"],
                    "da_nhan": p["da_nhan"],
                    "con_thieu": p["con_thieu"],
                    "uweight": p["uweight"],
                    "con_thieu_weight": p.get("con_thieu_weight", 0.0),
                    "cutting_no": p.get("shape_analysis", {}).get("cutting_no") or p.get("cutting_no", ""),
                    "ktra_noi": p.get("ktra_noi", ""),
                    "dvg": p.get("dvg", "")
                })

    for d in dvg_summary_dict.values():
        d["completion_rate_qty"] = round(d["da_nhan_qty"] / d["total_qty"] * 100, 1) if d["total_qty"] > 0 else 0.0
        d["completion_rate_weight"] = round(d["da_nhan_weight"] / d["total_weight"] * 100, 1) if d["total_weight"] > 0 else 0.0
        d["missing_parts"].sort(key=lambda x: x["con_thieu_weight"], reverse=True)

    for g in giao_summary_dict.values():
        g["completion_rate_qty"] = round(g["da_nhan_qty"] / g["total_qty"] * 100, 1) if g["total_qty"] > 0 else 0.0
        g["completion_rate_weight"] = round(g["da_nhan_weight"] / g["total_weight"] * 100, 1) if g["total_weight"] > 0 else 0.0
        g["missing_parts"].sort(key=lambda x: x["con_thieu_weight"], reverse=True)

    dvg_list = sorted(list(dvg_summary_dict.values()), key=lambda x: x["total_weight"], reverse=True)
    giao_list = sorted(list(giao_summary_dict.values()), key=lambda x: x["total_weight"], reverse=True)

    project_dvg_totals = {
        "total_weight": round(sum(d["total_weight"] for d in dvg_list), 2),
        "da_nhan_weight": round(sum(d["da_nhan_weight"] for d in dvg_list), 2),
        "con_thieu_weight": round(sum(d["con_thieu_weight"] for d in dvg_list), 2),
        "total_qty": sum(d["total_qty"] for d in dvg_list),
        "da_nhan_qty": sum(d["da_nhan_qty"] for d in dvg_list),
        "con_thieu_qty": sum(d["con_thieu_qty"] for d in dvg_list),
        "completion_rate_weight": 0.0,
        "completion_rate_qty": 0.0
    }
    if project_dvg_totals["total_weight"] > 0:
        project_dvg_totals["completion_rate_weight"] = round(
            project_dvg_totals["da_nhan_weight"] / project_dvg_totals["total_weight"] * 100, 1
        )
    if project_dvg_totals["total_qty"] > 0:
        project_dvg_totals["completion_rate_qty"] = round(
            project_dvg_totals["da_nhan_qty"] / project_dvg_totals["total_qty"] * 100, 1
        )

    dvg_analytics = {
        "by_dvg": dvg_list,
        "by_giao": giao_list,
        "totals": project_dvg_totals
    }

    return {
        "project_id": project_code,
        "file_path": file_path,
        "bom_sheets": bom_sheets,
        "total_assemblies": total_assy,
        "completed_assemblies": completed_assy,
        "partial_assemblies": partial_assy,
        "not_received_assemblies": not_received_assy,
        "total_shape_issues": total_shape_issues,
        "all_delivery_dates": sorted(
            list(all_dates_set), 
            key=lambda x: [int(p) for p in reversed(x.split("/"))] if "/" in x else ([int(p) for p in x.split("-")] if "-" in x else [0])
        ),
        "assemblies": all_assemblies,
        "daily_delivery": daily_delivery_summary,
        "shape_warnings": shape_warnings_list,
        "dvg_analytics": dvg_analytics
    }

def _finalize_assembly_metrics(assy: Dict[str, Any], shape_warnings_list: List[Dict[str, Any]]):
    """Tính toán tỷ lệ hoàn thành, trạng thái đồng bộ và tổng hợp Shape của cấu kiện"""
    parts = assy["parts"]
    assy["total_parts_count"] = len(parts)
    
    if not parts:
        assy["completion_rate"] = 0.0
        assy["status"] = "not_received"
        return
        
    received_parts = sum(1 for p in parts if p["is_fully_received"])
    assy["received_parts_count"] = received_parts
    
    total_tqty = sum(p["tqty"] for p in parts)
    total_da_nhan = sum(p["da_nhan"] for p in parts)
    assy["total_tqty"] = total_tqty
    assy["total_da_nhan"] = total_da_nhan
    
    rate = round((total_da_nhan / total_tqty * 100), 1) if total_tqty > 0 else 0.0
    assy["completion_rate"] = min(100.0, rate)
    
    if received_parts == len(parts) and len(parts) > 0:
        assy["status"] = "completed"
    elif total_da_nhan > 0:
        assy["status"] = "partial"
    else:
        assy["status"] = "not_received"
        
    daily_rec = {}
    shape_issues_count = 0
    for p in parts:
        sa = p.get("shape_analysis", {})
        if sa.get("has_length_issue"):
            shape_issues_count += 1
            shape_warnings_list.append({
                "assembly_no": assy["assembly_no"],
                "dwg": assy["dwg"],
                "part_name": p["display_name"],
                "size": p["size"],
                "length_mm": sa.get("length_mm"),
                "con_thieu": sa.get("con_thieu"),
                "cutting_no": sa.get("cutting_no"),
                "status": sa.get("status"),
                "message": sa.get("message")
            })
            
        for d_str, q in p.get("dates_received", {}).items():
            daily_rec[d_str] = daily_rec.get(d_str, 0) + q
            
    assy["daily_received"] = daily_rec
    assy["has_shape_issue"] = shape_issues_count > 0
    assy["shape_issues_count"] = shape_issues_count
