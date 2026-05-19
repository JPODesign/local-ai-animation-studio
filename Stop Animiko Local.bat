@echo off
setlocal

REM =====================================================================
REM   Animiko Local — Stop Servers
REM   Closes the "ComfyUI" and "Animiko" terminal windows that
REM   Start Animiko Local.bat opened, and any child processes inside.
REM =====================================================================

echo ============================================================
echo   Animiko Local — Stop Servers
echo ============================================================
echo.

echo Closing ComfyUI window...
taskkill /FI "WINDOWTITLE eq ComfyUI*" /F /T >nul 2>&1
if %ERRORLEVEL%==0 (
    echo   [OK] ComfyUI window closed.
) else (
    echo   [INFO] No window titled "ComfyUI" found.
    echo          (Already stopped, or you started it manually.)
)
echo.

echo Closing Animiko window...
taskkill /FI "WINDOWTITLE eq Animiko*" /F /T >nul 2>&1
if %ERRORLEVEL%==0 (
    echo   [OK] Animiko window closed.
) else (
    echo   [INFO] No window titled "Animiko" found.
    echo          (Already stopped, or you started it manually.)
)
echo.

echo ============================================================
echo   Done.
echo ============================================================
echo   If anything still appears to be running:
echo     1. Switch to that terminal window
echo     2. Press Ctrl+C
echo     3. Confirm with Y if it asks
echo.
echo   Tip: open Task Manager (Ctrl+Shift+Esc) and look for any
echo   remaining "python.exe" (ComfyUI) or "node.exe" (Animiko)
echo   processes if you want to be 100%% sure they're gone.
echo ============================================================
pause
endlocal
