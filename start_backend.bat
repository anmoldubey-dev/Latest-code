@echo off
title Backend :8000
cd /d "%~dp0"
set KMP_DUPLICATE_LIB_OK=TRUE
echo.
echo  ================================================
echo   Main Backend  ^|  port 8000
echo  ================================================
echo.
"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.app:app --port 8000 --host 0.0.0.0
pause
