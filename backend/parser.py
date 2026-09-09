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

def format_date_val(val: Any) -> Optional[str]:
    """Chuyển đổi giá trị ngày trong Excel thành định dạng chuỗi Ngày/Tháng/Năm (DD/MM/YYYY) chuẩn"""
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        if val.year < 2020 or val.year > 2035:
            return None
        return val.strftime("%d/%m/%Y")
    
    val_str = str(val).strip()
    m = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', val_str)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2020 <= y <= 2035 and 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{d:02d}/{mo:02d}/{y:04d}"
    
    m2 = re.search(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})', val_str)
    if m2:
        d_or_m1, d_or_m2, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        if 2020 <= y <= 2035:
            # Xác định đâu là tháng, đâu là ngày
            if d_or_m1 > 12 >= d_or_m2: # Ngày / Tháng / Năm
                return f"{d_or_m1:02d}/{d_or_m2:02d}/{y:04d}"
            elif d_or_m2 > 12 >= d_or_m1: # Tháng / Ngày / Năm
                return f"{d_or_m2:02d}/{d_or_m1:02d}/{y:04d}"
            else: # Mặc định ngày trước tháng sau: DD/MM/YYYY
                return f"{d_or_m1:02d}/{d_or_m2:02d}/{y:04d}"
        
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
            if fname.endswith(".xlsx") and not fname.startswith("~$"):
                fpath = os.path.join(root, fname)
                try:
                    rel_dir = os.path.relpath(root, data_folder)
                    subfolder_label = "" if rel_dir == "." else f"[{rel_dir}] "
                    
                    # Xác định mã dự án
                    clean_name = fname.replace("PL.xlsx", "").replace(".xlsx", "").strip()
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
            elif "u.weight" in cell_val:
                temp_map["uweight"] = c
            elif "t.weight" in cell_val:
                temp_map["tweight"] = c
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
        row_str = [str(ws.cell(r, c).value or "").strip().lower() for c in range(1, min(35, ws.max_column + 1))]
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
                elif "cutting no" in t or "cp no" in t:
                    col_map["cutting_no"] = c_idx
                elif "qty cutting" in t:
                    col_map["qty_cutting"] = c_idx
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
        "cutting_no": 33,
        "qty_cutting": 34
    }
    for k, v in col_defaults.items():
        if k not in col_map:
            col_map[k] = v

    date_cols: List[Tuple[int, str]] = []
    da_nhan_c = col_map.get("da_nhan", 12)
    start_date_c = da_nhan_c + 2
    
    for c in range(start_date_c, ws.max_column + 1):
        cell_val = ws.cell(header_row, c).value
        if cell_val is None:
            continue
        d_str = format_date_val(cell_val)
        if d_str:
            date_cols.append((c, d_str))
        elif any(stop_word in str(cell_val).upper() for stop_word in ["KO BB", "LẤY DATA", "KTRA", "TÔN", "DVG", "MPR"]):
            break

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
            "dates_received": dates_received,
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
                    
                current_assy = {
                    "id": f"{b_sheet}_{assy_no_str}_{r}",
                    "sheet": b_sheet,
                    "btp_sheet": btp_sheet_name or "Không có",
                    "row_index": r,
                    "assembly_no": assy_no_str,
                    "dwg": dwg_str,
                    "description": desc_str,
                    "size": size_str,
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
                    "uweight": uweight_val,
                    "tweight": tweight_val,
                    "da_nhan": da_nhan,
                    "con_thieu": con_thieu,
                    "dates_received": dates_received,
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

    wb.close()
    
    for d_str, d_data in daily_delivery_summary.items():
        d_data["assemblies_affected"] = sorted(list(d_data["assemblies_affected"]))

    total_assy = len(all_assemblies)
    completed_assy = sum(1 for a in all_assemblies if a["status"] == "completed")
    partial_assy = sum(1 for a in all_assemblies if a["status"] == "partial")
    not_received_assy = sum(1 for a in all_assemblies if a["status"] == "not_received")
    total_shape_issues = sum(1 for a in all_assemblies if a["has_shape_issue"])

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
        "shape_warnings": shape_warnings_list
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
