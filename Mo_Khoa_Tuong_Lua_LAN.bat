@echo off
chcp 65001 >nul
title MỞ KHÓA TƯỜNG LỬA CHO MẠNG LAN - AMECC

echo =================================================================
echo   ĐANG TỰ ĐỘNG MỞ CỔNG 8000 TRÊN TƯỜNG LỬA WINDOWS CHO MẠNG LAN
echo =================================================================
echo.

:: Kiem tra quyen Administrator, neu chua co thi tu dong xin quyen
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Đang xin quyền Quản trị viên (Administrator)...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [*] Đang mở cổng TCP 8000 trên Windows Firewall...
netsh advfirewall firewall delete rule name="FastAPI_Server_AMECC_8000" >nul 2>&1
netsh advfirewall firewall add rule name="FastAPI_Server_AMECC_8000" dir=in action=allow protocol=TCP localport=8000 profile=any >nul

echo [*] Đang cấu hình mạng Wi-Fi sang chế độ Riêng tư (Private)...
powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private" >nul 2>&1

echo.
echo =================================================================
echo   🎉 THÀNH CÔNG! ĐÃ MỞ CỔNG 8000 VÀ CẤU HÌNH MẠNG LAN HOÀN TẤT!
echo   Bây giờ điện thoại và máy tính khác trong cùng Wi-Fi đã có thể
echo   truy cập mượt mà vào địa chỉ:
echo.
powershell -Command "$ip = (Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 | Select-Object -First 1).IPAddress; Write-Host \"   👉 http://$ip:8000\" -ForegroundColor Green"
echo.
echo =================================================================
echo.
pause
