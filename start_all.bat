@echo off
title Voice AI Core — Launcher
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Voice AI Core — Starting all services  ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Load services.config ──────────────────────────────────────────
set LIVEKIT=true
set DIARIZATION=true
set TRANSLATOR=true
set TTS_GLOBAL=true
set TTS_INDIC=true
set VOICE_CLONER=true
set BACKEND=true

for /f "usebackq tokens=1,2 delims== eol=#" %%A in ("services.config") do (
    set "%%A=%%B"
)

echo  Config loaded:
echo    LIVEKIT      = %LIVEKIT%
echo    DIARIZATION  = %DIARIZATION%
echo    TRANSLATOR   = %TRANSLATOR%
echo    TTS_GLOBAL   = %TTS_GLOBAL%
echo    TTS_INDIC    = %TTS_INDIC%
echo    VOICE_CLONER = %VOICE_CLONER%
echo    BACKEND      = %BACKEND%
echo.

:: ── Launch services ───────────────────────────────────────────────

if /i "%LIVEKIT%"=="true" (
    echo [1/7] LiveKit Server :7880 ...
    start "LiveKit :7880" cmd /k "cd /d "%~dp0" && livekit-server.exe --config livekit.yaml"
    timeout /t 2 /nobreak >nul
) else (
    echo [1/7] LiveKit Server — SKIPPED
)

if /i "%DIARIZATION%"=="true" (
    echo [2/7] Diarization :8001 ...
    start "Diarization :8001" cmd /k ""%~dp0services\diarization_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [2/7] Diarization — SKIPPED
)

if /i "%TRANSLATOR%"=="true" (
    echo [3/7] Translator :8002 ...
    start "Translator :8002" cmd /k ""%~dp0services\translator_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [3/7] Translator — SKIPPED
)

if /i "%TTS_GLOBAL%"=="true" (
    echo [4/7] TTS Global :8003 ...
    start "TTS Global :8003" cmd /k ""%~dp0services\tts_service\global_tts\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [4/7] TTS Global — SKIPPED
)

if /i "%TTS_INDIC%"=="true" (
    echo [5/7] TTS Indic :8004 ...
    start "TTS Indic :8004" cmd /k ""%~dp0services\tts_service\indic_tts\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [5/7] TTS Indic — SKIPPED
)

if /i "%VOICE_CLONER%"=="true" (
    echo [6/7] Voice Cloner :8005 ...
    start "Voice Cloner :8005" cmd /k ""%~dp0services\voice_cloner_service\start.bat""
    timeout /t 1 /nobreak >nul
) else (
    echo [6/7] Voice Cloner — SKIPPED
)

if /i "%BACKEND%"=="true" (
    echo [7/7] Main Backend :8000 ...
    start "Backend :8000" cmd /k ""%~dp0start_backend.bat""
) else (
    echo [7/7] Backend — SKIPPED
)

echo.
echo  Done. Open http://localhost:5173 for admin console.
echo.
pause
