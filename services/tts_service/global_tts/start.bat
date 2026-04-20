@echo off
title TTS Global :8003
cd /d "%~dp0"
echo.
echo  ================================================
echo   TTS Global Service  ^|  port 8003
echo  ================================================
echo.
"%~dp0..\.venv\Scripts\python.exe" -m uvicorn app:app --port 8003 --host 0.0.0.0
pause
