@echo off
title Translator Service :8002
cd /d "%~dp0"
echo.
echo  ================================================
echo   Translator Service  ^|  port 8002
echo  ================================================
echo.
set KMP_DUPLICATE_LIB_OK=TRUE
"%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --port 8002 --host 0.0.0.0
pause
