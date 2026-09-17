@echo off
chcp 65001 >nul
title ĐỒNG BỘ DỮ LIỆU SANG NHÁNH ONLINE 24/24 (AMECC)
color 0B

echo =======================================================================
echo          AMECC - TRÌNH ĐỒNG BỘ DỮ LIỆU SANG NHÁNH ONLINE 24/24
echo =======================================================================
echo.
echo  Trình đồng bộ sẽ:
echo  1. Tự động đọc toàn bộ file Excel trong thư mục Data
echo  2. Biên dịch dữ liệu cấu kiện, tiến độ ngày, thép hình sang JSON siêu nhẹ
echo  3. Tự động đẩy sang nhánh phụ 'gh-pages' để trang web Online 24/24 tự cập nhật!
echo.
echo =======================================================================
echo.

python tools\sync_to_branch.py

echo.
echo =======================================================================
echo  Hoàn tất quy trình! Nhấn phím bất kỳ để đóng cửa sổ này...
pause >nul
