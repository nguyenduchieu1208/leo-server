"""
Module xuất file Excel chuyên nghiệp:
1. Chế độ "full" (Full Tier): Xuất toàn bộ cây phân cấp Cấu kiện (AS Symbol 'X') & 100% BTP con.
2. Chế độ "missing" (Chỉ chi tiết còn thiếu): Chỉ gom các BTP có con_thieu > 0.
- Chia theo từng hạng mục tên sheet (như T5P1, T5P2, U6T1P1, M4120...).
- Hỗ trợ xuất theo 1 hạng mục được chọn hoặc toàn bộ dự án.
"""

import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from typing import Dict, Any, List, Optional

def clean_sheet_title(title: str) -> str:
    """Rút gọn tên sheet để vừa chuẩn Excel (tối đa 31 ký tự)"""
    t = str(title).replace(":", "_").replace("/", "_").replace("\\", "_").replace("?", "").replace("*", "").replace("[", "").replace("]", "")
    return t[:31]

def export_project_excel(
    project_data: Dict[str, Any], 
    mode: str = "missing", 
    target_sheet: Optional[str] = None
) -> io.BytesIO:
    """
    Xuất file Excel theo chuẩn nghiệp vụ chế tạo kết cấu thép:
    - mode: 'full' (Xuất đầy đủ mọi cấu kiện & chi tiết) hoặc 'missing' (Chỉ xuất chi tiết thiếu)
    - target_sheet: Tên sheet cụ thể (vd: 'T5P1', 'A290T5P1') hoặc None/'all' để xuất tất cả
    """
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    assemblies = project_data.get("assemblies", [])
    sheets_grouped: Dict[str, List[Dict[str, Any]]] = {}

    for assy in assemblies:
        sheet_name = assy.get("sheet", "Khac")
        
        # Lọc theo hạng mục được chọn nếu có
        if target_sheet and target_sheet.lower() != "all":
            s_up = sheet_name.strip().upper()
            t_up = target_sheet.strip().upper()
            if s_up != t_up and t_up not in s_up and s_up not in t_up:
                continue

        # Xác định danh sách chi tiết cần đưa vào
        if mode == "missing":
            parts_to_include = [p for p in assy.get("parts", []) if (p.get("con_thieu") or 0) > 0]
        else:
            parts_to_include = assy.get("parts", [])

        if parts_to_include or mode == "full":
            if sheet_name not in sheets_grouped:
                sheets_grouped[sheet_name] = []
            sheets_grouped[sheet_name].append({
                "assembly": assy,
                "parts": parts_to_include
            })

    if not sheets_grouped:
        ws = wb.create_sheet(title="ThongBao")
        msg = f"Hạng mục {target_sheet} không có chi tiết nào còn thiếu!" if mode == "missing" else "Không có dữ liệu phù hợp."
        ws.cell(1, 1, msg)
        ws.cell(1, 1).font = Font(name="Times New Roman", size=14, bold=True, color="008000")
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    font_header = Font(name="Times New Roman", size=11, bold=True, color="FFFFFF")
    fill_header = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid") # Xanh AMECC
    
    font_assy_title = Font(name="Times New Roman", size=11, bold=True, color="0F172A")
    fill_assy_title = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    
    font_data = Font(name="Times New Roman", size=10)
    font_missing = Font(name="Times New Roman", size=10, bold=True, color="DC2626")
    fill_missing = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    font_completed = Font(name="Times New Roman", size=10, bold=True, color="166534")
    fill_completed = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    
    font_total = Font(name="Times New Roman", size=11, bold=True)
    fill_total = PatternFill(start_color="FEF08A", end_color="FEF08A", fill_type="solid")

    border_thin = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    headers = [
        ("STT", 6, align_center),
        ("Cấu Kiện (Assembly)", 20, align_left),
        ("Bản Vẽ (Drawing)", 22, align_left),
        ("Mã BTP (Part No)", 18, align_left),
        ("Mã Cắt (Cutting Mark)", 24, align_left),
        ("Chủng Loại", 14, align_center),
        ("Quy Cách (Size)", 20, align_left),
        ("Dài (mm)", 12, align_right),
        ("Vật Liệu", 12, align_center),
        ("SL Thiết Kế", 13, align_right),
        ("Đã Nhận", 12, align_right),
        ("Còn Thiếu", 14, align_right),
        ("Kế Hoạch Cắt (CP No)", 20, align_left),
        ("Tình Trạng / Cảnh Báo Shape", 35, align_left),
    ]

    for sheet_name, assy_list in sorted(sheets_grouped.items()):
        ws_title = clean_sheet_title(sheet_name)
        ws = wb.create_sheet(title=ws_title)
        ws.views.sheetView[0].showGridLines = True

        proj_name = project_data.get("project_id", "")
        mode_label = "TOÀN BỘ TẦNG BẬC (FULL TIER)" if mode == "full" else "DANH SÁCH CHI TIẾT CÒN THIẾU"
        
        ws.merge_cells("A1:N1")
        title_cell = ws.cell(1, 1, f"{mode_label} - HẠNG MỤC: {sheet_name.upper()} (DỰ ÁN: {proj_name})")
        title_cell.font = Font(name="Times New Roman", size=13, bold=True, color="1E3A8A")
        title_cell.alignment = align_left
        ws.row_dimensions[1].height = 25

        ws.row_dimensions[2].height = 28
        for col_idx, (h_name, width, align) in enumerate(headers, 1):
            cell = ws.cell(2, col_idx, h_name)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_center
            cell.border = border_thin
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        cur_row = 3
        stt_counter = 1
        total_tqty_sheet = 0
        total_danhan_sheet = 0
        total_missing_sheet = 0

        for assy_group in assy_list:
            assy = assy_group["assembly"]
            p_list = assy_group["parts"]
            assy_no = assy.get("assembly_no", "")
            dwg = assy.get("dwg", "")
            assy_status = "ĐỦ 100%" if assy.get("status") == "completed" else f"HOÀN THÀNH {assy.get('completion_rate', 0)}%"

            ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=14)
            assy_header_cell = ws.cell(cur_row, 1, f"▶ CẤU KIỆN: {assy_no} | BẢN VẼ: {dwg} | {assy_status} ({len(p_list)} BTP)")
            assy_header_cell.font = font_assy_title
            assy_header_cell.fill = fill_assy_title
            assy_header_cell.alignment = align_left
            for c in range(1, 15):
                ws.cell(cur_row, c).border = border_thin
            ws.row_dimensions[cur_row].height = 22
            cur_row += 1

            for p in p_list:
                ws.row_dimensions[cur_row].height = 20
                sa = p.get("shape_analysis", {})
                tqty_val = p.get("tqty", 0)
                da_nhan_val = p.get("da_nhan", 0)
                con_thieu_val = p.get("con_thieu", 0)

                total_tqty_sheet += tqty_val
                total_danhan_sheet += da_nhan_val
                total_missing_sheet += con_thieu_val

                # Format cột còn thiếu
                if con_thieu_val > 0:
                    font_thieu = font_missing
                    fill_thieu = fill_missing
                    status_text = sa.get("message") or f"Còn thiếu {con_thieu_val}"
                else:
                    font_thieu = font_completed
                    fill_thieu = fill_completed
                    status_text = "✓ Đã nhận đủ"

                row_vals = [
                    (stt_counter, align_center, font_data, None),
                    (assy_no, align_left, font_data, None),
                    (dwg, align_left, font_data, None),
                    (p.get("part_no", ""), align_left, font_data, None),
                    (p.get("part_cut", ""), align_left, font_data, None),
                    (p.get("chung_loai", ""), align_center, font_data, None),
                    (p.get("size", ""), align_left, font_data, None),
                    (p.get("length", ""), align_right, font_data, None),
                    (p.get("material", ""), align_center, font_data, None),
                    (tqty_val, align_right, font_data, None),
                    (da_nhan_val, align_right, font_data, None),
                    (con_thieu_val, align_right, font_thieu, fill_thieu),
                    (sa.get("cutting_no", "") or "", align_left, font_data, None),
                    (status_text, align_left, font_data, None),
                ]

                for c_idx, (val, alignment, font, fill) in enumerate(row_vals, 1):
                    c_cell = ws.cell(cur_row, c_idx, val)
                    c_cell.alignment = alignment
                    c_cell.font = font
                    c_cell.border = border_thin
                    if fill:
                        c_cell.fill = fill

                cur_row += 1
                stt_counter += 1

        # Dòng tổng kết ở cuối sheet
        ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=9)
        tot_label_cell = ws.cell(cur_row, 1, "TỔNG CỘNG HẠNG MỤC:")
        tot_label_cell.font = font_total
        tot_label_cell.alignment = Alignment(horizontal="right", vertical="center")
        tot_label_cell.fill = fill_total

        for c in range(1, 10):
            ws.cell(cur_row, c).border = border_thin
            ws.cell(cur_row, c).fill = fill_total

        # Tổng SL Thiết kế
        c_tqty = ws.cell(cur_row, 10, total_tqty_sheet)
        c_tqty.font = font_total
        c_tqty.alignment = align_right
        c_tqty.fill = fill_total
        c_tqty.border = border_thin

        # Tổng Đã nhận
        c_dn = ws.cell(cur_row, 11, total_danhan_sheet)
        c_dn.font = Font(name="Times New Roman", size=11, bold=True, color="166534")
        c_dn.alignment = align_right
        c_dn.fill = fill_total
        c_dn.border = border_thin

        # Tổng Còn thiếu
        tot_val_cell = ws.cell(cur_row, 12, total_missing_sheet)
        tot_val_cell.font = Font(name="Times New Roman", size=11, bold=True, color="DC2626")
        tot_val_cell.alignment = align_right
        tot_val_cell.fill = fill_total
        tot_val_cell.border = border_thin

        for c in [13, 14]:
            ws.cell(cur_row, c).border = border_thin
            ws.cell(cur_row, c).fill = fill_total

        ws.row_dimensions[cur_row].height = 24

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

# Tương thích ngược
export_missing_parts_excel = export_project_excel
