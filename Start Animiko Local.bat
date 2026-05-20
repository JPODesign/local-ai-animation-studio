@echo off
setlocal

REM =====================================================================
REM   Animiko Local Launcher
REM
REM   1. Finds ComfyUI Portable automatically (or use the manual
REM      override below).
REM   2. Opens Terminal A and starts ComfyUI with --enable-cors-header *
REM   3. Opens Terminal B and starts Animiko (git pull, npm install
REM      only if node_modules is missing, npm run dev).
REM   4. Opens http://localhost:5173 in the default browser after 10 s.
REM =====================================================================

REM --- MANUAL OVERRIDE (set to your real ComfyUI Portable folder) ---
REM This wins over auto-detect. If you move ComfyUI, edit this line OR
REM clear it (set "COMFY_DIR=") to let auto-detect find it again.
set "COMFY_DIR=C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"

REM --- Animiko project path (edit if your clone is elsewhere) ---
set "ANIMIKO_DIR=C:\Users\ongcz\Desktop\Jc\Claude\animiko-local"

REM --- Auto-detect ComfyUI Portable in common locations ---
REM A folder is valid only if it contains BOTH:
REM     python_embeded\python.exe
REM     ComfyUI\main.py
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Desktop\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Downloads\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Desktop\Jc\Claude\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Desktop\Jc\ComfyUI_windows_portable"
REM --- Nested-zip variants (the NVIDIA Portable extracts into a sub-folder) ---
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable_nvidia"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Desktop\ComfyUI"
if not defined COMFY_DIR call :find_comfy "C:\Users\ongcz\Downloads\ComfyUI"
if not defined COMFY_DIR call :find_comfy "D:\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "D:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"

echo ============================================================
echo   Animiko Local Launcher
echo ============================================================
echo.

if not defined COMFY_DIR (
    echo [ERROR] ComfyUI Portable was not found in any common location:
    echo   C:\ComfyUI_windows_portable
    echo   C:\Users\ongcz\Desktop\ComfyUI_windows_portable
    echo   C:\Users\ongcz\Downloads\ComfyUI_windows_portable
    echo   C:\Users\ongcz\Desktop\Jc\Claude\ComfyUI_windows_portable
    echo   C:\Users\ongcz\Desktop\Jc\ComfyUI_windows_portable
    echo   C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable
    echo   C:\ComfyUI\ComfyUI_windows_portable
    echo   C:\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable
    echo   C:\ComfyUI    (and a few drive-D variants)
    echo.
    echo ComfyUI Portable was not found. Please locate the folder that
    echo contains python_embeded and ComfyUI, then edit COMFY_DIR at the
    echo top of this .bat file.
    echo.
    echo Example:
    echo     set "COMFY_DIR=C:\Path\To\Your\ComfyUI_windows_portable"
    echo.
    pause
    exit /b 1
)

REM --- Validate the chosen ComfyUI folder (handles the manual-override case too) ---
if not exist "%COMFY_DIR%\python_embeded\python.exe" (
    echo [ERROR] COMFY_DIR is set to:
    echo         %COMFY_DIR%
    echo but python_embeded\python.exe was not found there.
    echo Edit COMFY_DIR at the top of this .bat to a valid ComfyUI Portable folder.
    pause
    exit /b 1
)
if not exist "%COMFY_DIR%\ComfyUI\main.py" (
    echo [ERROR] COMFY_DIR is set to:
    echo         %COMFY_DIR%
    echo but ComfyUI\main.py was not found there.
    echo Edit COMFY_DIR at the top of this .bat to a valid ComfyUI Portable folder.
    pause
    exit /b 1
)

echo [OK]  ComfyUI Portable detected at:
echo       %COMFY_DIR%
echo.

REM --- Validate Animiko folder ---
if not exist "%ANIMIKO_DIR%\package.json" (
    echo [ERROR] Animiko folder not found at:
    echo         %ANIMIKO_DIR%
    echo.
    echo Edit ANIMIKO_DIR at the top of this .bat file, or clone the project:
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
echo This launcher window can be closed any time - the two server
echo windows will keep running on their own.
pause
endlocal
exit /b 0

REM ====================== Subroutines ======================

REM Checks if %~1 is a valid ComfyUI Portable folder, and if so sets COMFY_DIR.
:find_comfy
if not exist "%~1\python_embeded\python.exe" goto :eof
if not exist "%~1\ComfyUI\main.py" goto :eof
set "COMFY_DIR=%~1"
goto :eof
