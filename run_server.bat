@echo off
chcp 65001 > nul
title MAY CHU TRA CUU VAT TU & BTP - AMECC
cls
echo =====================================================================
echo    DANG KHOI DONG HE THONG MAY CHU TRA CUU VAT TU THEO NGAY...
echo =====================================================================
cd /d "%~dp0"

python run.py

pause
