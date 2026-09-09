"""
Module phân tích chuyên sâu tình trạng vật tư/BTP chủng loại Thép Hình (Shape).
Xử lý trường hợp: Cấu kiện có thể nhận nhưng phần đã nhận chưa cập nhật
do không đủ độ dài phôi của sản phẩm chủng loại Shape.
"""

from typing import Dict, Any, Optional

def is_shape_type(chung_loai: str, size: str, desc: str) -> bool:
    """Kiểm tra xem chi tiết có thuộc chủng loại thép hình (Shape) hay không"""
    cl = (chung_loai or "").strip().upper()
    sz = (size or "").strip().upper()
    ds = (desc or "").strip().upper()
    
    if cl == "SHAPE":
        return True
    
    # Nhận diện theo Profile quy cách
    shape_prefixes = ("H", "I", "U", "V", "L", "PIPE", "Ø", "TUBE", "C")
    for pref in shape_prefixes:
        if sz.startswith(pref) and not sz.startswith("PL"):
            return True
            
    if any(k in ds for k in ["BEAM", "CHANNEL", "ANGLE", "PIPE", "TUBE", "H-BEAM"]):
        return True
        
    return False

def analyze_shape_part(part: Dict[str, Any], btp_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Phân tích chi tiết một BTP chủng loại Shape để phát hiện tình trạng:
    - Đã nhận đủ hay còn thiếu
    - Đã có mã cắt (Cutting No) hoặc số lượng phôi cắt chưa
    - Chiều dài thiết kế yêu cầu
    - Cảnh báo: có thể nhận nhưng chưa cập nhật do thiếu độ dài phôi
    """
    chung_loai = ""
    da_nhan = 0
    tqty = part.get("tqty") or part.get("qty") or 1
    length = part.get("length") or 0
    cutting_no = ""
    qty_cutting = None
    
    if btp_info:
        chung_loai = btp_info.get("chung_loai") or ""
        da_nhan = btp_info.get("da_nhan") or 0
        cutting_no = btp_info.get("cutting_no") or ""
        qty_cutting = btp_info.get("qty_cutting")
        if not length:
            length = btp_info.get("length") or 0
            
    pno = (part.get("part_no") or "").upper()
    pcut = (part.get("part_cut") or "").upper()
    desc = (part.get("desc") or "").upper()
    size = (part.get("size") or "").upper()
    
    is_bh = "BH" in pno or "BH" in pcut or "BUILT-UP" in desc
    is_shape = is_shape_type(chung_loai, size, desc)
    
    if not is_shape and not is_bh:
        return {
            "is_shape": False,
            "is_bh": False,
            "has_length_issue": False,
            "status": "normal",
            "message": ""
        }
        
    # Nghiệp vụ dầm tổ hợp BH: người dùng thường nhập 1
    # Nếu chi tiết BH có da_nhan >= 1 thì xem như đã hoàn thành
    if is_bh and da_nhan >= 1:
        con_thieu = 0
    else:
        con_thieu = max(0, tqty - da_nhan)
        
    has_length_issue = False
    status = "shape_ok"
    message = ""
    
    # Kiểm tra đoạn dài cần tính công thức (chiều dài dầm lớn >= 10.000mm)
    is_long_section = (length >= 10000)
    
    if con_thieu > 0:
        if is_bh:
            # Đối với dầm BH: chỉ đoạn dài có công thức mới cảnh báo gắt gao
            if is_long_section:
                has_length_issue = True
                status = "shape_bh_long_section"
                message = (
                    f"Dầm BH đoạn dài ({length}mm): Cần tính toán công thức phôi nối dầm dài "
                    f"(mã cắt: {cutting_no or 'chờ sơ đồ'})."
                )
            else:
                # Các đoạn BH thông thường: cho phép chênh lệch 1 ít theo quy chuẩn A290
                has_length_issue = False
                status = "shape_bh_normal"
                message = (
                    f"Chi tiết BH ({length}mm): Thường nhập 1 khi nhận dầm "
                    f"(cho phép dung sai chênh lệch gia công theo chuẩn A290)."
                )
        else:
            # Đối với thép hình Shape chuẩn (H, I, U, V...)
            has_length_issue = True
            if cutting_no and cutting_no not in ["-", "0", ""]:
                status = "shape_cutting_in_progress"
                message = (
                    f"Đã có mã kế hoạch cắt phôi ({cutting_no}), chiều dài {length}mm "
                    f"(cho phép dung sai chênh lệch gia công như BH 290)."
                )
            else:
                status = "shape_waiting_length"
                message = (
                    f"Thép hình cần chiều dài tối thiểu {length}mm (SL thiếu: {con_thieu}). "
                    f"Chưa cập nhật nhận do chờ phôi đủ chiều dài."
                )
    else:
        status = "shape_completed"
        message = "Đã nhận đủ chi tiết (cho phép dung sai chênh lệch như BH 290)."
        
    return {
        "is_shape": True,
        "is_bh": is_bh,
        "is_long_section": is_long_section,
        "has_length_issue": has_length_issue,
        "length_mm": length,
        "cutting_no": cutting_no,
        "qty_cutting": qty_cutting,
        "con_thieu": con_thieu,
        "status": status,
        "message": message
    }
