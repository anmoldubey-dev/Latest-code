@echo off
setlocal enabledelayedexpansion
title Voice AI Core -- Launcher
cd /d "%~dp0"

echo.
echo  ========================================
echo   Voice AI Core -- Starting all services
echo  ========================================
echo.

:: ── Kill stale Python processes and free ports ─────────────────
echo  Clearing stale processes...
taskkill /F /IM python.exe   >nul 2>&1
taskkill /F /IM python3.exe  >nul 2>&1
taskkill /F /IM uvicorn.exe  >nul 2>&1
echo  Ports 8000-8005 cleared.
echo.

:: ── Defaults (overridden by services.config) ───────────────────
set LIVEKIT=false
set DIARIZATION=true
set TRANSLATOR=true
set TTS_GLOBAL=true
set TTS_INDIC=true
set VOICE_CLONER=false
set OLLAMA=true
set BACKEND=true
set BACKEND_MODE=web
set ADMIN_CONSOLE=false
set WHISPER_MODEL=large-v3
set STT_LANGUAGE=en

for /f "usebackq tokens=1,* delims== eol=#" %%A in ("services.config") do (
    set "_val=%%B"
    set "_val=!_val: =!"
    set "_val=!_val:	=!"
    for /f "tokens=* delims=" %%V in ("!_val!") do set "%%A=%%V"
)

echo  Config loaded:
echo    LIVEKIT       = %LIVEKIT%
echo    DIARIZATION   = %DIARIZATION%
echo    TRANSLATOR    = %TRANSLATOR%
echo    TTS_GLOBAL    = %TTS_GLOBAL%
echo    TTS_INDIC     = %TTS_INDIC%
echo    VOICE_CLONER  = %VOICE_CLONER%
echo    OLLAMA        = %OLLAMA%
echo    BACKEND       = %BACKEND%
echo    BACKEND_MODE  = %BACKEND_MODE%
echo    ADMIN_CONSOLE = %ADMIN_CONSOLE%
echo    WHISPER_MODEL     = %WHISPER_MODEL%
echo    STT_LANGUAGE  = %STT_LANGUAGE%
echo.

:: ── 1. LiveKit ─────────────────────────────────────────────────
if /i "%LIVEKIT%"=="true" (
    echo [1/9] LiveKit :7880 ...
    start "LiveKit :7880" cmd /k "cd /d "%~dp0" && livekit-server.exe --config livekit.yaml"
    timeout /t 2 /nobreak >nul
) else (
    echo [1/9] LiveKit -- SKIPPED
)

:: ── 2. Ollama ──────────────────────────────────────────────────
if /i "%OLLAMA%"=="true" (
    echo [2/9] Ollama :11434 ...
    start "Ollama :11434" cmd /k "ollama serve"
    timeout /t 3 /nobreak >nul
) else (
    echo [2/9] Ollama -- SKIPPED
)

:: ── 3. Diarization ─────────────────────────────────────────────
if /i "%DIARIZATION%"=="true" (
    echo [3/9] Diarization :8001 ...
    start "Diarization :8001" cmd /k ""%~dp0services\diarization_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [3/9] Diarization -- SKIPPED
)

:: ── 4. Translator ──────────────────────────────────────────────
if /i "%TRANSLATOR%"=="true" (
    echo [4/9] Translator :8002 ...
    start "Translator :8002" cmd /k ""%~dp0services\translator_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [4/9] Translator -- SKIPPED
)

:: ── 5. TTS Global ──────────────────────────────────────────────
if /i "%TTS_GLOBAL%"=="true" (
    echo [5/9] TTS Global :8003 ...
    start "TTS Global :8003" cmd /k ""%~dp0services\tts_service\global_tts\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [5/9] TTS Global -- SKIPPED
)

:: ── 6. TTS Indic ───────────────────────────────────────────────
if /i "%TTS_INDIC%"=="true" (
    echo [6/9] TTS Indic :8004 ...
    start "TTS Indic :8004" cmd /k ""%~dp0services\tts_service\indic_tts\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [6/9] TTS Indic -- SKIPPED
)

:: ── 7. Voice Cloner ────────────────────────────────────────────
if /i "%VOICE_CLONER%"=="true" (
    echo [7/9] Voice Cloner :8005 ...
    start "Voice Cloner :8005" cmd /k ""%~dp0services\voice_cloner_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [7/9] Voice Cloner -- SKIPPED
)

:: ── 8. Backend: web (app.py) or cli (main.py) ─────────────────
if /i "%BACKEND%"=="false" goto :skip_backend
if /i "%BACKEND_MODE%"=="cli" goto :backend_cli

:backend_web
echo [8/9] Backend Web :8000 ...
start "Backend :8000" cmd /k ""%~dp0start_backend.bat""
goto :after_backend

:backend_cli
echo [8/9] Backend CLI - mic pipeline ...
start "Backend CLI" cmd /k "cd /d "%~dp0" && "%~dp0.venv\Scripts\python.exe" -m backend.main"
goto :after_backend

:skip_backend
echo [8/9] Backend -- SKIPPED

:after_backend

:: ── 9. Admin Console (React :5173) ────────────────────────────
if /i "%ADMIN_CONSOLE%"=="true" (
    echo [9/9] Admin Console :5173 ...
    start "Admin Console :5173" cmd /k "cd /d "%~dp0admin-console" && npm run dev"
) else (
    echo [9/9] Admin Console -- SKIPPED
)

echo.
if /i "%BACKEND_MODE%"=="cli" (
    echo  Done. CLI pipeline window is open -- speak into your mic.
) else (
    echo  Done.
    echo    Call UI  -^>  http://localhost:8000
    if /i "%ADMIN_CONSOLE%"=="true" echo    Admin    -^>  http://localhost:5173
)
echo.
pause
