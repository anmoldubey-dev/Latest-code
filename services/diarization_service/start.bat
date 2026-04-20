@echo off
title Diarization Service :8001
cd /d "%~dp0"
echo.
echo  ================================================
echo   Diarization Service  ^|  port 8001
echo  ================================================
echo.
"%~dp0.venv_diarization\Scripts\python.exe" -m uvicorn server:app --port 8001 --host 0.0.0.0
pause
