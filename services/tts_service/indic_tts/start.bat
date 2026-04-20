@echo off
title TTS Indic :8004
cd /d "%~dp0"
echo.
echo  ================================================
echo   TTS Indic Service  ^|  port 8004
echo  ================================================
echo.
"%~dp0..\.venv\Scripts\python.exe" -m uvicorn app:app --port 8004 --host 0.0.0.0
pause
