@echo off
chcp 65001 > nul
title DONG BO DU LIEU SANG NHANH ONLINE 24/24 - AMECC2
cls
cd /d "%~dp0"

echo =======================================================================
echo          AMECC2 - DONG BO DU LIEU SANG NHANH ONLINE 24/24
echo =======================================================================
echo.
echo  Dang tien hanh doc file Excel va dong bo sang Online 24/24...
echo.

python tools\sync_to_branch.py

echo.
echo =======================================================================
echo  Nhan phim bat ky de dong cua so nay...
echo =======================================================================
pause > nul
