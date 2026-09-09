# HỆ THỐNG MÁY CHỦ TRA CỨU VẬT TƯ & BTP THEO NGÀY (AMECC)

Hệ thống Web Server nội bộ độc lập, khởi chạy trực tiếp trên máy trạm của bạn, **100% MIỄN PHÍ**, không mất phí thuê máy chủ, không phụ thuộc nền tảng đám mây trả phí.

---

## 1. Cấu Trúc Thư Mục Chuẩn Hóa

Hệ thống được phân chia thành các thư mục chức năng rõ ràng:

```text
d:\Tool\Server_Leo_Nguyen/
│
├── backend/                  # Xử lý nghiệp vụ lõi & thuật toán
│   ├── __init__.py
│   ├── parser.py             # Bóc tách cấu kiện AS Symbol 'X', gom BTP con, map ngày nhận
│   ├── shape_analyzer.py     # Phân tích chuyên biệt & cảnh báo chủng loại Thép Hình (Shape)
│   └── cache.py              # Bộ nhớ đệm kép RAM + SQLite chịu tải cao, phản hồi < 2ms
│
├── frontend/                 # Giao diện Web Dashboard người dùng
│   ├── index.html            # Trang chủ hiển thị Dashboard, KPI, Cây cấu kiện
│   ├── style.css             # Giao diện Dark/Modern, thanh tiến độ, badges phân loại
│   └── app.js                # Xử lý lọc ngày, tìm kiếm tức thì, mở rộng BTP con
│
├── server/                   # Máy chủ API & Điều phối kết nối
│   ├── __init__.py
│   ├── app.py                # FastAPI Web Server, nén dữ liệu GZip, phục vụ REST API
│   └── tunnel.py             # Điều phối kết nối mạng ngoài Cloudflare Tunnel (Miễn phí 100%)
│
├── Data/                     # Thư mục chứa các file Excel (.xlsx), hỗ trợ cả thư mục con
│   ├── A290PL.xlsx
│   ├── A320PL.xlsx
│   ├── U324PL.xlsx
│   └── ... (các thư mục con hoặc file Excel mới copy vào)
│
├── run_server.bat            # File khởi chạy nhanh 1-Click (Chỉ cần nhấp đúp chuột)
├── run.py                    # Trình khởi chạy tổng thể All-in-One (Server + Tunnel)
└── README.md                 # Hướng dẫn sử dụng
```

---

## 2. Cách Khởi Động Máy Chủ

### Cách 1: Chạy nhanh bằng 1-Click (Khuyên dùng)
- Nhấp đúp chuột vào file **`run_server.bat`**.
- Màn hình đen (Console) sẽ bật lên và tự động mở trình duyệt web.

### Cách 2: Chạy bằng lệnh Python
```powershell
python run.py
```

---

## 3. Hướng Dẫn Truy Cập Cho Người Dùng

Sau khi khởi động, hệ thống cung cấp 2 phương thức truy cập:

### 1. Truy cập trong Mạng Nội Bộ (LAN / Wi-Fi Công Ty):
- **Trên máy tính của bạn**: `http://localhost:8000`
- **Trên điện thoại, máy tính bảng hoặc máy tính của đồng nghiệp trong cùng mạng Wi-Fi**:
  `http://<IP_MÁY_BẠN>:8000` (Ví dụ: `http://192.168.1.180:8000`)
- *Mẹo*: Trên góc phải của trang web có nút **Sao chép link Wi-Fi**, bạn chỉ cần bấm nút để gửi link cho đồng nghiệp.

### 2. Truy cập từ Mạng Ngoài (4G, Ở Nhà, Chi Nhánh Khác) — MIỄN PHÍ 100%:
- Hệ thống tích hợp sẵn công nghệ **Cloudflare Tunnel** (`cloudflared`).
- Ngay khi khởi động từ 3 đến 5 giây, màn hình và trên giao diện web sẽ xuất hiện một đường link bảo mật HTTPS dạng:
  `https://xxxx.trycloudflare.com`
- Bất kỳ ai ở bên ngoài mạng, dùng điện thoại 4G hay máy tính ở nhà đều có thể truy cập được ngay lập tức thông qua link này mà:
  - **Không cần mở port Modem / Router (NAT)**.
  - **Không cần mua IP tĩnh hay tên miền**.
  - **Không giới hạn băng thông**.

---

## 4. Các Tính Năng Nổi Bật

1. **Bóc tách cấu kiện AS Symbol "X" chuẩn xác**:
   - Quét cột `AS Symbol` trong sheet BOM/PL để nhận diện cấu kiện mẹ.
   - Tự động gom toàn bộ các bán thành phẩm (BTP) con bên dưới cho tới cấu kiện tiếp theo.
2. **Gán tiến độ nhận hàng theo Ngày**:
   - Tự động đối chiếu Part No / Marking Cutting sang sheet `BTP-<Mã_Dự_Án>`.
   - Trích xuất từng cột Ngày (vd: `14/07`, `15/07`...) và số lượng nhận tương ứng.
   - Cho phép chọn 1 ngày bất kỳ để xem hôm đó nhận được những BTP nào, thuộc cấu kiện nào.
3. **Xử lý đặc thù Thép hình (Shape)**:
   - Hiển thị badge màu cam `[SHAPE]` và chiều dài thiết kế (mm).
   - Phát hiện các chi tiết thực tế đã có mã cắt phôi (Cutting No) hoặc đã về kho nhưng chưa cập nhật số lượng do chưa đủ độ dài cây tiêu chuẩn.
4. **Tối ưu hóa chịu tải cao (High Concurrency & High Speed)**:
   - Cơ chế **In-Memory RAM Cache**: Dữ liệu sau khi quét được nạp trực tiếp vào RAM, khi 50 - 100 người đồng thời truy cập, server chỉ đọc từ RAM với độ trễ siêu thấp (< 2ms) mà không phải đọc lại file Excel.
   - Cơ chế **GZip Compression**: Tự động nén dữ liệu truyền tải giảm 85% dung lượng mạng, lướt web mượt mà ngay cả khi dùng sóng 4G yếu.
5. **Hỗ trợ thư mục dữ liệu linh hoạt**:
   - Quét đệ quy toàn bộ thư mục `Data`, hỗ trợ người dùng tạo các thư mục con bên trong `Data` (ví dụ `Data/2026/Du_an_1/`) mà không bị sót file.
