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
    try:
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

            # Kế hoạch & Nhận phôi
            ke_hoach_thang = str(row[32]).strip() if len(row) > 32 and row[32] is not None else ""
            nhan_phoi_val = row[33] if len(row) > 33 else None
            nhan_phoi_rate = round(to_num(nhan_phoi_val, 0.0) * 100, 1) if nhan_phoi_val is not None and to_num(nhan_phoi_val, 0.0) <= 1.0 and to_num(nhan_phoi_val, 0.0) > 0 else to_num(nhan_phoi_val, 0.0)
            nhan_phoi_kl = to_num(row[34] if len(row) > 34 else 0, 0.0)

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
                "ke_hoach_thang": ke_hoach_thang,
                "nhan_phoi": {
                    "rate": nhan_phoi_rate,
                    "kl": round(nhan_phoi_kl, 2)
                },
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
        # Tổng hợp sản lượng theo từng ngày ghi nhận (dành cho biểu đồ tiến độ)
        daily_prod = {}
        for it in items:
            # Gá lắp
            d_ga = it.get("ga_lap", {}).get("ngay")
            if d_ga:
                if d_ga not in daily_prod:
                    daily_prod[d_ga] = {"ga_sl": 0, "ga_kl": 0.0, "han_sl": 0, "han_kl": 0.0, "th_sl": 0, "th_kl": 0.0, "nt_sl": 0, "nt_kl": 0.0, "bg_sl": 0, "bg_kl": 0.0}
                daily_prod[d_ga]["ga_sl"] += it["ga_lap"]["sl"]
                daily_prod[d_ga]["ga_kl"] += it["ga_lap"]["kl"]
            # Hàn
            d_han = it.get("han", {}).get("ngay")
            if d_han:
                if d_han not in daily_prod:
                    daily_prod[d_han] = {"ga_sl": 0, "ga_kl": 0.0, "han_sl": 0, "han_kl": 0.0, "th_sl": 0, "th_kl": 0.0, "nt_sl": 0, "nt_kl": 0.0, "bg_sl": 0, "bg_kl": 0.0}
                daily_prod[d_han]["han_sl"] += it["han"]["sl"]
                daily_prod[d_han]["han_kl"] += it["han"]["kl"]
            # Tổ hợp thử
            d_th = it.get("to_hop_thu", {}).get("ngay")
            if d_th:
                if d_th not in daily_prod:
                    daily_prod[d_th] = {"ga_sl": 0, "ga_kl": 0.0, "han_sl": 0, "han_kl": 0.0, "th_sl": 0, "th_kl": 0.0, "nt_sl": 0, "nt_kl": 0.0, "bg_sl": 0, "bg_kl": 0.0}
                daily_prod[d_th]["th_sl"] += it["to_hop_thu"]["sl"]
                daily_prod[d_th]["th_kl"] += it["to_hop_thu"]["kl"]
            # Nghiệm thu
            d_nt = it.get("nghiem_thu", {}).get("ngay")
            if d_nt:
                if d_nt not in daily_prod:
                    daily_prod[d_nt] = {"ga_sl": 0, "ga_kl": 0.0, "han_sl": 0, "han_kl": 0.0, "th_sl": 0, "th_kl": 0.0, "nt_sl": 0, "nt_kl": 0.0, "bg_sl": 0, "bg_kl": 0.0}
                daily_prod[d_nt]["nt_sl"] += it["nghiem_thu"]["sl"]
                daily_prod[d_nt]["nt_kl"] += it["nghiem_thu"]["kl"]
            # Bàn giao
            d_bg = it.get("ban_giao", {}).get("ngay")
            if d_bg:
                if d_bg not in daily_prod:
                    daily_prod[d_bg] = {"ga_sl": 0, "ga_kl": 0.0, "han_sl": 0, "han_kl": 0.0, "th_sl": 0, "th_kl": 0.0, "nt_sl": 0, "nt_kl": 0.0, "bg_sl": 0, "bg_kl": 0.0}
                daily_prod[d_bg]["bg_sl"] += it["ban_giao"]["sl"]
                daily_prod[d_bg]["bg_kl"] += it["ban_giao"]["kl"]

        # Làm tròn số liệu khối lượng theo ngày
        for d, p in daily_prod.items():
            p["ga_kl"] = round(p["ga_kl"], 2)
            p["han_kl"] = round(p["han_kl"], 2)
            p["th_kl"] = round(p["th_kl"], 2)
            p["nt_kl"] = round(p["nt_kl"], 2)
        p["bg_kl"] = round(p["bg_kl"], 2)
    finally:
        try:
            wb.close()
        except Exception:
            pass

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
        "daily_production": daily_prod,
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

def generate_qlda_export_excel(project_data, filtered_items=None):
    """
    Xuất file Excel tiến độ cấu kiện QLDA đúng chuẩn form mẫu của người dùng:
    - Loại bỏ hoàn toàn các cột: A (TT), C (Group ID), D (Group/Shipment), T đến AI, AS (Số AFI), BB đến hết
    - Giữ lại đầy đủ 5 công đoạn: Gá lắp, Hàn, Tổ hợp thử, Nghiệm thu, Bàn giao
    - Hàng 1: Tiêu đề gộp nhóm phân theo công đoạn với màu sắc nhận diện
    - Hàng 2: Hàng tổng hợp Subtotal tự động co giãn theo bộ lọc
    - Hàng 3: Tên cột chuẩn xác như form gốc
    - Hàng 4+: Dữ liệu chi tiết từng cấu kiện
    """
    import io
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Progress"

    items = filtered_items if filtered_items is not None else project_data.get("items", [])
    proj_id = project_data.get("project_id", "QLDA")

    font_family = "Times New Roman"
    header_font = Font(name=font_family, size=11, bold=True)
    subtotal_font = Font(name=font_family, size=11, bold=True, color="1A202C")
    data_font = Font(name=font_family, size=11)
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E0'),
        right=Side(style='thin', color='CBD5E0'),
        top=Side(style='thin', color='CBD5E0'),
        bottom=Side(style='thin', color='CBD5E0')
    )

    # 33 Cột chuẩn theo form mẫu Quản Lý Dự Án của người dùng (sau khi loại bỏ: A, C, D, T..AI, AS, BB..end)
    columns_def = [
        {"name": "Số Dự Án", "width": 12, "align": "center"},             # 1 (B)
        {"name": "Hạng mục", "width": 24, "align": "left"},               # 2 (E)
        {"name": "MH", "width": 10, "align": "center"},                   # 3 (F)
        {"name": "Ngày giao hàng(WO)", "width": 16, "align": "center"},    # 4 (G)
        {"name": "Dạng sản phẩm", "width": 16, "align": "left"},          # 5 (H)
        {"name": "Phân loại", "width": 14, "align": "left"},              # 6 (I)
        {"name": "Phân giao", "width": 12, "align": "center"},            # 7 (J)
        {"name": "Tên bản vẽ", "width": 24, "align": "left"},             # 8 (K)
        {"name": "Số chi tiết", "width": 16, "align": "left"},            # 9 (L)
        {"name": "Size", "width": 18, "align": "left"},                   # 10 (M)
        {"name": "T'Qty", "width": 10, "align": "right", "format": "#,##0"},   # 11 (N)
        {"name": "U.Weight", "width": 12, "align": "right", "format": "#,##0.0"}, # 12 (O)
        {"name": "T.Weight", "width": 14, "align": "right", "format": "#,##0.0"}, # 13 (P)
        {"name": "Profile", "width": 20, "align": "left"},                # 14 (Q)
        {"name": "ID", "width": 12, "align": "center"},                   # 15 (R)
        {"name": "Note", "width": 16, "align": "left"},                   # 16 (S)
        # 1. Gá lắp (AJ..AL)
        {"name": "Ngày Gá", "width": 13, "align": "center"},              # 17 (AJ)
        {"name": "SL Gá", "width": 10, "align": "right", "format": "#,##0"},   # 18 (AK)
        {"name": "KL Gá", "width": 14, "align": "right", "format": "#,##0.0"}, # 19 (AL)
        # 2. Hàn (AM..AO)
        {"name": "Ngày Hàn", "width": 13, "align": "center"},             # 20 (AM)
        {"name": "SL Hàn", "width": 10, "align": "right", "format": "#,##0"},   # 21 (AN)
        {"name": "KL Hàn", "width": 14, "align": "right", "format": "#,##0.0"}, # 22 (AO)
        # 3. Tổ hợp thử (AP..AR)
        {"name": "Ngày TH", "width": 13, "align": "center"},              # 23 (AP)
        {"name": "SL TH", "width": 10, "align": "right", "format": "#,##0"},   # 24 (AQ)
        {"name": "KL TH", "width": 14, "align": "right", "format": "#,##0.0"}, # 25 (AR)
        # 4. Nghiệm thu (AT..AV)
        {"name": "Ngày NT", "width": 13, "align": "center"},              # 26 (AT)
        {"name": "SL NT", "width": 10, "align": "right", "format": "#,##0"},   # 27 (AU)
        {"name": "KL NT", "width": 14, "align": "right", "format": "#,##0.0"}, # 28 (AV)
        # 5. Bàn giao (AW..BA)
        {"name": "Ngày BG", "width": 13, "align": "center"},              # 29 (AW)
        {"name": "SL BG", "width": 10, "align": "right", "format": "#,##0"},   # 30 (AX)
        {"name": "KL BG", "width": 14, "align": "right", "format": "#,##0.0"}, # 31 (AY)
        {"name": "Đơn vị nhận", "width": 16, "align": "left"},            # 32 (AZ)
        {"name": "Số biên bản", "width": 16, "align": "left"}             # 33 (BA)
    ]

    total_cols = len(columns_def)
    end_row = 3 + len(items)
    if len(items) == 0:
        end_row = 4

    # Đặt độ rộng cột
    for idx, col_cfg in enumerate(columns_def, start=1):
        col_letter = get_column_letter(idx)
        ws.column_dimensions[col_letter].width = col_cfg["width"]

    # Đặt chiều cao dòng
    ws.row_dimensions[1].height = 26
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 26

    # Định nghĩa các nhóm công đoạn ở Hàng 1 (theo đúng nhóm mẫu của người dùng)
    groups = [
        {"title": f"DỰ ÁN:{proj_id}", "start": 1, "end": 16, "fill": "2D3748", "color": "FFFFFF"},
        {"title": "Gá lắp", "start": 17, "end": 19, "fill": "BEE3F8", "color": "2B6CB0"},
        {"title": "Hàn", "start": 20, "end": 22, "fill": "FEEBC8", "color": "C05621"},
        {"title": "Tổ hợp thử", "start": 23, "end": 25, "fill": "E9D8FD", "color": "6B46C1"},
        {"title": "Nghiệm thu", "start": 26, "end": 28, "fill": "C6F6D5", "color": "22543D"},
        {"title": "Bàn giao", "start": 29, "end": 33, "fill": "B2F5EA", "color": "234E52"}
    ]

    for g in groups:
        ws.merge_cells(start_row=1, start_column=g["start"], end_row=1, end_column=g["end"])
        first_cell = ws.cell(1, g["start"], g["title"])
        first_cell.alignment = Alignment(horizontal="center", vertical="center")
        first_cell.font = Font(name=font_family, size=12, bold=True, color=g["color"])
        
        fill_obj = PatternFill(start_color=g["fill"], end_color=g["fill"], fill_type="solid")
        for c in range(g["start"], g["end"] + 1):
            cell = ws.cell(1, c)
            cell.fill = fill_obj
            cell.border = thin_border

    # Hàng 2: Hàng Tổng Hợp Subtotal (theo form mẫu)
    subtotal_fill = PatternFill(start_color="EDF2F7", end_color="EDF2F7", fill_type="solid")
    for c in range(1, total_cols + 1):
        cell = ws.cell(2, c)
        cell.fill = subtotal_fill
        cell.border = thin_border
        cell.font = subtotal_font

    ws.cell(2, 1, "Information ID").alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(2, 8, "Information Item").alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(2, 16, "=IF(WEEKDAY(TODAY()-1)=1,TODAY()-2,TODAY()-1)").alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(2, 33, f'=SUBSTITUTE(A1,"DỰ ÁN:","")&"-"').alignment = Alignment(horizontal="center", vertical="center")
    
    # Subtotal công thức cho các cột số lượng và khối lượng (Col 11=K, 13=M, 18=R, 19=S, 21=U, 22=V, 24=X, 25=Y, 27=AA, 28=AB, 30=AD, 31=AE)
    subtotal_cols = [
        (11, "#,##0"),      # T'Qty (K)
        (13, "#,##0.0"),    # T.Weight (M)
        (18, "#,##0"),      # SL Gá (R)
        (19, "#,##0.0"),    # KL Gá (S)
        (21, "#,##0"),      # SL Hàn (U)
        (22, "#,##0.0"),    # KL Hàn (V)
        (24, "#,##0"),      # SL TH (X)
        (25, "#,##0.0"),    # KL TH (Y)
        (27, "#,##0"),      # SL NT (AA)
        (28, "#,##0.0"),    # KL NT (AB)
        (30, "#,##0"),      # SL BG (AD)
        (31, "#,##0.0"),    # KL BG (AE)
    ]
    for c_idx, num_fmt in subtotal_cols:
        col_let = get_column_letter(c_idx)
        cell = ws.cell(2, c_idx)
        cell.value = f"=SUBTOTAL(9, {col_let}4:{col_let}{end_row})"
        cell.number_format = num_fmt
        cell.alignment = Alignment(horizontal="right", vertical="center")

    # Hàng 3: Tiêu Đề Cột
    h3_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    for idx, col_cfg in enumerate(columns_def, start=1):
        cell = ws.cell(3, idx, col_cfg["name"])
        cell.fill = h3_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border

    # Hàng 4+: Ghi dữ liệu 33 cột
    for r_offset, item in enumerate(items, start=4):
        ws.row_dimensions[r_offset].height = 20

        row_values = [
            item.get("du_an") or proj_id,               # 1: Số Dự Án (B)
            item.get("hang_muc", ""),                   # 2: Hạng mục (E)
            item.get("mh", ""),                         # 3: MH (F)
            item.get("ngay_giao_wo", ""),               # 4: Ngày giao hàng(WO) (G)
            item.get("dang_sp", ""),                    # 5: Dạng sản phẩm (H)
            item.get("phan_loai", ""),                  # 6: Phân loại (I)
            item.get("phan_giao", ""),                  # 7: Phân giao (J)
            item.get("ten_ban_ve", ""),                 # 8: Tên bản vẽ (K)
            item.get("so_chi_tiet", ""),                # 9: Số chi tiết (L)
            item.get("size", ""),                       # 10: Size (M)
            item.get("tqty", 0),                        # 11: T'Qty (N)
            item.get("uweight", 0.0),                   # 12: U.Weight (O)
            item.get("tweight", 0.0),                   # 13: T.Weight (P)
            item.get("profile", ""),                    # 14: Profile (Q)
            item.get("id", ""),                         # 15: ID (R)
            item.get("note", ""),                       # 16: Note (S)
            # 1. Gá lắp
            item.get("ga_lap", {}).get("ngay", ""),     # 17: Ngày Gá (AJ)
            item.get("ga_lap", {}).get("sl", 0),        # 18: SL Gá (AK)
            item.get("ga_lap", {}).get("kl", 0.0),      # 19: KL Gá (AL)
            # 2. Hàn
            item.get("han", {}).get("ngay", ""),        # 20: Ngày Hàn (AM)
            item.get("han", {}).get("sl", 0),           # 21: SL Hàn (AN)
            item.get("han", {}).get("kl", 0.0),         # 22: KL Hàn (AO)
            # 3. Tổ hợp thử
            item.get("to_hop_thu", {}).get("ngay", ""), # 23: Ngày TH (AP)
            item.get("to_hop_thu", {}).get("sl", 0),    # 24: SL TH (AQ)
            item.get("to_hop_thu", {}).get("kl", 0.0),  # 25: KL TH (AR)
            # 4. Nghiệm thu
            item.get("nghiem_thu", {}).get("ngay", ""), # 26: Ngày NT (AT)
            item.get("nghiem_thu", {}).get("sl", 0),    # 27: SL NT (AU)
            item.get("nghiem_thu", {}).get("kl", 0.0),  # 28: KL NT (AV)
            # 5. Bàn giao
            item.get("ban_giao", {}).get("ngay", ""),   # 29: Ngày BG (AW)
            item.get("ban_giao", {}).get("sl", 0),      # 30: SL BG (AX)
            item.get("ban_giao", {}).get("kl", 0.0),    # 31: KL BG (AY)
            item.get("ban_giao", {}).get("don_vi_nhan", ""), # 32: Đơn vị nhận (AZ)
            item.get("ban_giao", {}).get("so_bien_ban", "")  # 33: Số biên bản (BA)
        ]

        for c_idx, val in enumerate(row_values, start=1):
            cell = ws.cell(r_offset, c_idx)
            cell.value = val
            cell.font = data_font
            cell.border = thin_border

            col_cfg = columns_def[c_idx - 1]
            cell.alignment = Alignment(horizontal=col_cfg.get("align", "left"), vertical="center")

            if "format" in col_cfg and isinstance(val, (int, float)):
                cell.number_format = col_cfg["format"]

    # Thiết lập Bộ Lọc Tự Động (AutoFilter) cho toàn bộ bảng bắt đầu từ dòng tiêu đề cột 3
    last_col_letter = get_column_letter(total_cols)
    ws.auto_filter.ref = f"A3:{last_col_letter}{end_row}"

    # Cố định tiêu đề (Freeze Panes) từ dòng 4
    ws.freeze_panes = "A4"

    # Xuất ra bộ nhớ BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
