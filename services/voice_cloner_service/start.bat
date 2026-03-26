@echo off
title Voice Cloner Server
cd /d "%~dp0"

echo.
echo  ================================================
echo   Voice Cloner ^| FastAPI backend on port 8005
echo  ================================================
echo.

"%~dp0.venv\Scripts\python.exe" -m uvicorn server:app --port 8005 --host 0.0.0.0
pause
