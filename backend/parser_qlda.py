"""
Module Parser chuyên trách cho Quản Lý Dự Án (QLDA).
- Đọc các file Excel từ thư mục 03.QLDA/
- Lọc bỏ các cột: A, C, D, T đến AI, AS, BB đến hết
- Trích xuất thông tin cấu kiện và tiến độ 5 công đoạn chế tạo:
    1. Gá lắp (Fit-up)
    2. Hàn (Welding)
    3. Tổ hợp thử (Trial Assembly - nếu có)
    4. Nghiệm thu (QC Inspection)
    5. Bàn giao (Handover / Delivery kèm Đơn vị nhận & Số biên bản)
- Tính toán tỷ lệ hoàn thành (%) và ma trận công đoạn phục vụ giao diện web
"""

import os
import glob
from datetime import datetime, date
import openpyxl

def format_date_str(val):
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%d/%m/%Y")
    val_str = str(val).strip()
    if not val_str or val_str == "None" or val_str == "-":
        return None
    # Nếu là chuỗi ISO YYYY-MM-DD
    if len(val_str) >= 10 and val_str[4] == "-" and val_str[7] == "-":
        try:
            parts = val_str[:10].split("-")
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
        except Exception:
            pass
    return val_str

def to_num(val, default=0.0):
    if val is None or val == "":
        return default
    try:
        if isinstance(val, (int, float)):
            return round(float(val), 2)
        v = str(val).replace(",", "").strip()
        return round(float(v), 2)
    except (ValueError, TypeError):
        return default

def determine_assembly_status(item):
    """
    Xác định trạng thái công đoạn hiện tại của cấu kiện:
    - 'BAN_GIAO': Đã bàn giao 100%
    - 'NGHIEM_THU': Đã nghiệm thu xong, chờ bàn giao
    - 'TO_HOP_THU': Đã tổ hợp thử xong (nếu có yêu cầu)
    - 'HAN': Đã hàn xong, chờ nghiệm thu
    - 'GA_LAP': Đã gá lắp xong, đang hàn
    - 'DANG_LAM': Đang thực hiện dở dang một công đoạn
    - 'CHUA_LAM': Chưa bắt đầu công đoạn nào
    """
    tqty = item["tqty"]
    bg_sl = item["ban_giao"]["sl"]
    nt_sl = item["nghiem_thu"]["sl"]
    th_sl = item["to_hop_thu"]["sl"]
    han_sl = item["han"]["sl"]
    ga_sl = item["ga_lap"]["sl"]

    if tqty > 0 and bg_sl >= tqty:
        return "BAN_GIAO"
    if tqty > 0 and nt_sl >= tqty:
        return "NGHIEM_THU"
    if tqty > 0 and th_sl > 0 and th_sl >= tqty:
        return "TO_HOP_THU"
    if tqty > 0 and han_sl >= tqty:
        return "HAN"
    if tqty > 0 and ga_sl >= tqty:
        return "GA_LAP"
    if bg_sl > 0 or nt_sl > 0 or th_sl > 0 or han_sl > 0 or ga_sl > 0:
        return "DANG_LAM"
    return "CHUA_LAM"

def parse_qlda_file(file_path):
    """
    Phân giải 1 file Excel QLDA và trả về cấu trúc dữ liệu chuẩn hóa
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Không tìm thấy file: {file_path}")

    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    sheet = wb.active

    proj_code = os.path.basename(file_path).replace(".xlsx", "").replace(".xlsm", "").strip()
    
    items = []
    hang_muc_set = set()
    phan_giao_set = set()

    # Tổng cộng toàn dự án
    total_qty = 0
    total_weight = 0.0

    # Khối lượng & Số lượng lũy kế của 5 công đoạn
    sum_ga_qty = 0
    sum_ga_weight = 0.0

    sum_han_qty = 0
    sum_han_weight = 0.0

    sum_th_qty = 0
    sum_th_weight = 0.0

    sum_nt_qty = 0
    sum_nt_weight = 0.0

    sum_bg_qty = 0
    sum_bg_weight = 0.0

    # Phân nhóm theo Hạng mục
    by_hang_muc = {}
    # Phân nhóm theo Tổ phân giao
    by_phan_giao = {}

    row_idx = 0
    for row in sheet.iter_rows(min_row=4, values_only=True):
        # Kiểm tra điều kiện kết thúc
        if row is None or (len(row) > 11 and row[1] is None and row[11] is None):
            continue

        # Cột B: Số Dự Án
        du_an_val = str(row[1]).strip() if len(row) > 1 and row[1] is not None else proj_code
        # Cột L: Số chi tiết (Mã cấu kiện)
        so_chi_tiet = str(row[11]).strip() if len(row) > 11 and row[11] is not None else ""
        if not so_chi_tiet and (len(row) <= 1 or row[1] is None):
            continue

        row_idx += 1

        hang_muc = str(row[4]).strip() if len(row) > 4 and row[4] is not None else "CHƯA PHÂN HẠNG MỤC"
        mh = str(row[5]).strip() if len(row) > 5 and row[5] is not None else ""
        ngay_giao_wo = format_date_str(row[6]) if len(row) > 6 else None
        dang_sp = str(row[7]).strip() if len(row) > 7 and row[7] is not None else ""
        phan_loai = str(row[8]).strip() if len(row) > 8 and row[8] is not None else ""
        phan_giao = str(row[9]).strip().upper() if len(row) > 9 and row[9] is not None else "CHƯA PHÂN GIAO"
        if not phan_giao or phan_giao == "-" or phan_giao == "0":
            phan_giao = "CHƯA PHÂN GIAO"

        ten_ban_ve = str(row[10]).strip() if len(row) > 10 and row[10] is not None else ""
        size = str(row[12]).strip() if len(row) > 12 and row[12] is not None else ""
        tqty = int(to_num(row[13] if len(row) > 13 else 0, 0))
        uweight = to_num(row[14] if len(row) > 14 else 0, 0.0)
        tweight = to_num(row[15] if len(row) > 15 else (tqty * uweight), 0.0)
        if tweight == 0 and tqty > 0 and uweight > 0:
            tweight = round(tqty * uweight, 2)

        profile = str(row[16]).strip() if len(row) > 16 and row[16] is not None else ""
        item_id = str(row[17]).strip() if len(row) > 17 and row[17] is not None else ""
        note = str(row[18]).strip() if len(row) > 18 and row[18] is not None else ""

        # 5 Công đoạn
        # 1. Gá lắp: AJ (col 35), AK (col 36), AL (col 37)
        ga_ngay = format_date_str(row[35]) if len(row) > 35 else None
        ga_sl = to_num(row[36] if len(row) > 36 else 0, 0)
        ga_kl = to_num(row[37] if len(row) > 37 else 0, 0.0)

        # 2. Hàn: AM (col 38), AN (col 39), AO (col 40)
        han_ngay = format_date_str(row[38]) if len(row) > 38 else None
        han_sl = to_num(row[39] if len(row) > 39 else 0, 0)
        han_kl = to_num(row[40] if len(row) > 40 else 0, 0.0)

        # 3. Tổ hợp thử: AP (col 41), AQ (col 42), AR (col 43)
        th_ngay = format_date_str(row[41]) if len(row) > 41 else None
        th_sl = to_num(row[42] if len(row) > 42 else 0, 0)
        th_kl = to_num(row[43] if len(row) > 43 else 0, 0.0)

        # 4. Nghiệm thu: AT (col 45), AU (col 46), AV (col 47) - Lưu ý AS là col 44 đã bỏ
        nt_ngay = format_date_str(row[45]) if len(row) > 45 else None
        nt_sl = to_num(row[46] if len(row) > 46 else 0, 0)
        nt_kl = to_num(row[47] if len(row) > 47 else 0, 0.0)

        # 5. Bàn giao: AW (col 48), AX (col 49), AY (col 50), AZ (col 51), BA (col 52)
        bg_ngay = format_date_str(row[48]) if len(row) > 48 else None
        bg_sl = to_num(row[49] if len(row) > 49 else 0, 0)
        bg_kl = to_num(row[50] if len(row) > 50 else 0, 0.0)
        bg_don_vi = str(row[51]).strip() if len(row) > 51 and row[51] is not None else ""
        bg_so_bb = str(row[52]).strip() if len(row) > 52 and row[52] is not None else ""

        # Chuẩn hóa đối tượng cấu kiện
        item = {
            "stt": row_idx,
            "du_an": du_an_val,
            "hang_muc": hang_muc,
            "mh": mh,
            "ngay_giao_wo": ngay_giao_wo,
            "dang_sp": dang_sp,
            "phan_loai": phan_loai,
            "phan_giao": phan_giao,
            "ten_ban_ve": ten_ban_ve,
            "so_chi_tiet": so_chi_tiet,
            "size": size,
            "tqty": tqty,
            "uweight": uweight,
            "tweight": tweight,
            "profile": profile,
            "id": item_id,
            "note": note,
            "ga_lap": {"ngay": ga_ngay, "sl": ga_sl, "kl": ga_kl},
            "han": {"ngay": han_ngay, "sl": han_sl, "kl": han_kl},
            "to_hop_thu": {"ngay": th_ngay, "sl": th_sl, "kl": th_kl},
            "nghiem_thu": {"ngay": nt_ngay, "sl": nt_sl, "kl": nt_kl},
            "ban_giao": {
                "ngay": bg_ngay,
                "sl": bg_sl,
                "kl": bg_kl,
                "don_vi_nhan": bg_don_vi,
                "so_bien_ban": bg_so_bb
            }
        }

        # Trạng thái tổng thể
        item["status"] = determine_assembly_status(item)
        items.append(item)

        # Lũy kế KPI
        total_qty += tqty
        total_weight += tweight
        sum_ga_qty += ga_sl
        sum_ga_weight += ga_kl
        sum_han_qty += han_sl
        sum_han_weight += han_kl
        sum_th_qty += th_sl
        sum_th_weight += th_kl
        sum_nt_qty += nt_sl
        sum_nt_weight += nt_kl
        sum_bg_qty += bg_sl
        sum_bg_weight += bg_kl

        hang_muc_set.add(hang_muc)
        phan_giao_set.add(phan_giao)

        # Tổng hợp theo hạng mục
        if hang_muc not in by_hang_muc:
            by_hang_muc[hang_muc] = {
                "hang_muc": hang_muc,
                "total_items": 0,
                "total_qty": 0,
                "total_weight": 0.0,
                "ga_weight": 0.0,
                "han_weight": 0.0,
                "th_weight": 0.0,
                "nt_weight": 0.0,
                "bg_weight": 0.0
            }
        hm_obj = by_hang_muc[hang_muc]
        hm_obj["total_items"] += 1
        hm_obj["total_qty"] += tqty
        hm_obj["total_weight"] += tweight
        hm_obj["ga_weight"] += ga_kl
        hm_obj["han_weight"] += han_kl
        hm_obj["th_weight"] += th_kl
        hm_obj["nt_weight"] += nt_kl
        hm_obj["bg_weight"] += bg_kl

        # Tổng hợp theo tổ phân giao
        if phan_giao not in by_phan_giao:
            by_phan_giao[phan_giao] = {
                "phan_giao": phan_giao,
                "total_items": 0,
                "total_qty": 0,
                "total_weight": 0.0,
                "ga_weight": 0.0,
                "han_weight": 0.0,
                "th_weight": 0.0,
                "nt_weight": 0.0,
                "bg_weight": 0.0
            }
        pg_obj = by_phan_giao[phan_giao]
        pg_obj["total_items"] += 1
        pg_obj["total_qty"] += tqty
        pg_obj["total_weight"] += tweight
        pg_obj["ga_weight"] += ga_kl
        pg_obj["han_weight"] += han_kl
        pg_obj["th_weight"] += th_kl
        pg_obj["nt_weight"] += nt_kl
        pg_obj["bg_weight"] += bg_kl

    # Tính toán tỷ lệ % hoàn thành từng công đoạn
    total_weight = round(total_weight, 2)
    rate_ga = round((sum_ga_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
    rate_han = round((sum_han_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
    rate_th = round((sum_th_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
    rate_nt = round((sum_nt_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
    rate_bg = round((sum_bg_weight / total_weight * 100), 1) if total_weight > 0 else 0.0

    # Làm tròn các danh sách tổng hợp
    hang_muc_list = sorted(list(by_hang_muc.values()), key=lambda x: x["total_weight"], reverse=True)
    for hm in hang_muc_list:
        hm["total_weight"] = round(hm["total_weight"], 1)
        hm["ga_weight"] = round(hm["ga_weight"], 1)
        hm["han_weight"] = round(hm["han_weight"], 1)
        hm["th_weight"] = round(hm["th_weight"], 1)
        hm["nt_weight"] = round(hm["nt_weight"], 1)
        hm["bg_weight"] = round(hm["bg_weight"], 1)
        hm["rate_bg"] = round((hm["bg_weight"] / hm["total_weight"] * 100), 1) if hm["total_weight"] > 0 else 0.0

    phan_giao_list = sorted(list(by_phan_giao.values()), key=lambda x: x["total_weight"], reverse=True)
    for pg in phan_giao_list:
        pg["total_weight"] = round(pg["total_weight"], 1)
        pg["ga_weight"] = round(pg["ga_weight"], 1)
        pg["han_weight"] = round(pg["han_weight"], 1)
        pg["th_weight"] = round(pg["th_weight"], 1)
        pg["nt_weight"] = round(pg["nt_weight"], 1)
        pg["bg_weight"] = round(pg["bg_weight"], 1)
        pg["rate_bg"] = round((pg["bg_weight"] / pg["total_weight"] * 100), 1) if pg["total_weight"] > 0 else 0.0

    return {
        "project_id": proj_code,
        "file_name": os.path.basename(file_path),
        "total_items": len(items),
        "total_qty": total_qty,
        "total_weight": total_weight,
        "total_tons": round(total_weight / 1000, 2),
        "kpis": {
            "ga_lap": {"sl": sum_ga_qty, "kl": round(sum_ga_weight, 1), "rate": rate_ga},
            "han": {"sl": sum_han_qty, "kl": round(sum_han_weight, 1), "rate": rate_han},
            "to_hop_thu": {"sl": sum_th_qty, "kl": round(sum_th_weight, 1), "rate": rate_th},
            "nghiem_thu": {"sl": sum_nt_qty, "kl": round(sum_nt_weight, 1), "rate": rate_nt},
            "ban_giao": {"sl": sum_bg_qty, "kl": round(sum_bg_weight, 1), "rate": rate_bg}
        },
        "hang_mucs": sorted(list(hang_muc_set)),
        "phan_giaos": sorted(list(phan_giao_set)),
        "summary_by_hang_muc": hang_muc_list,
        "summary_by_phan_giao": phan_giao_list,
        "items": items
    }

def list_available_qlda_projects(qlda_dir):
    """
    Quét danh sách các file Excel trong thư mục 03.QLDA/
    """
    if not os.path.exists(qlda_dir):
        return []

    files = sorted(glob.glob(os.path.join(qlda_dir, "*.xlsx")) + glob.glob(os.path.join(qlda_dir, "*.xlsm")))
    projects = []
    for f in files:
        fname = os.path.basename(f)
        if fname.startswith("~$"):
            continue
        proj_id = fname.replace(".xlsx", "").replace(".xlsm", "").strip()
        fsize = os.path.getsize(f)
        mtime = os.path.getmtime(f)
        projects.append({
            "project_id": proj_id,
            "file_name": fname,
            "file_path": f,
            "file_size": fsize,
            "file_size_mb": round(fsize / (1024 * 1024), 2),
            "updated_at": datetime.fromtimestamp(mtime).strftime("%d/%m/%Y %H:%M")
        })
    return projects
