@echo off
setlocal

REM =====================================================================
REM   Animiko Local Launcher
REM   1. Opens Terminal A and starts ComfyUI with --enable-cors-header *
REM   2. Opens Terminal B and starts Animiko (git pull, npm install if
REM      node_modules is missing, npm run dev)
REM   3. Opens http://localhost:5173 in your default browser after 10 s
REM =====================================================================

REM --- Edit these two paths if your folders are somewhere else ---
set "ANIMIKO_DIR=C:\Users\ongcz\Desktop\Jc\Claude\animiko-local"
set "COMFY_DIR=C:\ComfyUI_windows_portable"

echo ============================================================
echo   Animiko Local Launcher
echo ============================================================
echo.

REM --- Sanity checks ---
if not exist "%COMFY_DIR%\python_embeded\python.exe" (
    echo [ERROR] ComfyUI Portable not found at:
    echo         %COMFY_DIR%
    echo.
    echo Edit this .bat file and update COMFY_DIR to point at your
    echo ComfyUI Portable folder.
    pause
    exit /b 1
)
if not exist "%ANIMIKO_DIR%\package.json" (
    echo [ERROR] Animiko folder not found at:
    echo         %ANIMIKO_DIR%
    echo.
    echo Edit this .bat file and update ANIMIKO_DIR, or clone the
    echo project first:
    echo     cd C:\Users\ongcz\Desktop\Jc\Claude
    echo     git clone https://github.com/JPODesign/local-ai-animation-studio.git animiko-local
    pause
    exit /b 1
)

echo [1/3] Starting ComfyUI...
echo       (a separate window titled "ComfyUI" will open)
start "ComfyUI" /D "%COMFY_DIR%" cmd /k python_embeded\python.exe -s ComfyUI\main.py --enable-cors-header *
echo       Wait for: "To see the GUI go to: http://127.0.0.1:8188"
echo.

echo [2/3] Starting Animiko...
echo       (a separate window titled "Animiko" will open)
start "Animiko" /D "%ANIMIKO_DIR%" cmd /k "git pull & if not exist node_modules ( echo Installing dependencies, first run only... & npm install ) & echo Starting Animiko dev server... & npm run dev"
echo       Wait for: "Local:   http://localhost:5173/"
echo.

echo [3/3] Opening Animiko in browser in ~10 seconds...
timeout /t 10 /nobreak >nul
start "" "http://localhost:5173"
echo.

echo ============================================================
echo   Animiko should now be running.
echo ============================================================
echo   Animiko UI:    http://localhost:5173
echo   ComfyUI API:   http://127.0.0.1:8188
echo.
echo   Do NOT close the ComfyUI or Animiko terminal windows
echo   while you're using Animiko.
echo.
echo   To stop everything, use:
echo     "Stop Animiko Local.bat"
echo   Or press Ctrl+C in each of the two terminal windows.
echo ============================================================
echo.
echo This launcher window can be closed any time — the two server
echo windows will keep running on their own.
pause
endlocal
