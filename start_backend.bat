@echo off
setlocal enabledelayedexpansion
title Backend :8000
cd /d "%~dp0"
set KMP_DUPLICATE_LIB_OK=TRUE

:: Load configuration from services.config
set WHISPER_MODEL=large-v3
set STT_LANGUAGE=en
set OLLAMA=false
set SMART_RAG=false
set SMART_RAG_TABLES=vector_store

for /f "usebackq tokens=1,* delims== eol=#" %%A in ("services.config") do (
    set "_val=%%B"
    set "_val=!_val: =!"
    set "_val=!_val:	=!"
    for /f "tokens=* delims=" %%V in ("!_val!") do set "%%A=%%V"
)

echo.
echo  ================================================
echo   Main Backend  ^|  port 8000
echo  ================================================
echo   Configuration loaded from services.config:
echo     WHISPER_MODEL     = %WHISPER_MODEL%
echo     STT_LANGUAGE      = %STT_LANGUAGE%
echo     OLLAMA            = %OLLAMA%
echo     SMART_RAG         = %SMART_RAG%
echo     SMART_RAG_TABLES  = %SMART_RAG_TABLES%
echo.
echo   ^(change these in services.config and restart^)
echo  ================================================
echo.

"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.app:app --port 8000 --host 0.0.0.0
pause
