@echo off
setlocal enabledelayedexpansion

REM =====================================================================
REM   Animiko Local Launcher  (auto-detect + recursive search)
REM
REM   1. Validates the hardcoded COMFY_DIR; if it's wrong, clears it.
REM   2. Tries a list of known fixed candidate paths.
REM   3. If still not found, recursively scans the user-listed roots.
REM   4. Opens Terminal A for ComfyUI (with --enable-cors-header *).
REM   5. Opens Terminal B for Animiko (git pull, npm install if missing,
REM      npm run dev), then opens http://localhost:5173 in the browser.
REM =====================================================================

REM --- MANUAL OVERRIDE (hardcoded to the user's confirmed install path) ---
REM This wins over auto-detect. If you move ComfyUI, edit this line OR
REM clear it (set "COMFY_DIR=") to let the search below find it.
set "COMFY_DIR=C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"

REM --- Animiko project path (default; auto-detect below replaces it
REM     if it isn't valid, and we'll auto-clone if nothing is found) ---
set "ANIMIKO_DIR=C:\Users\ongcz\Desktop\Jc\Claude\animiko-local"
REM   The default location to clone into if no existing Animiko is found:
set "ANIMIKO_CLONE_DIR=C:\Users\ongcz\Desktop\Jc\Claude\animiko-local"

echo ============================================================
echo   Animiko Local Launcher
echo ============================================================
echo.

REM --- Validate the hardcoded path; clear it if it's not actually valid ---
if defined COMFY_DIR (
    if not exist "!COMFY_DIR!\python_embeded\python.exe" (
        echo [INFO] Hardcoded COMFY_DIR did not validate; running auto-detect...
        set "COMFY_DIR="
    )
    if defined COMFY_DIR if not exist "!COMFY_DIR!\ComfyUI\main.py" (
        echo [INFO] Hardcoded COMFY_DIR did not validate; running auto-detect...
        set "COMFY_DIR="
    )
)

REM --- 1. Try fixed candidate paths ---
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable_nvidia"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Desktop\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Downloads\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Documents\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Desktop\Jc\Claude\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Desktop\Jc\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "D:\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "D:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"

REM --- 2. Recursive search across user-listed roots ---
if not defined COMFY_DIR (
    echo Searching for ComfyUI Portable, this may take a moment...
    for %%S in (
        "C:\Users\%USERNAME%\Desktop"
        "C:\Users\%USERNAME%\Downloads"
        "C:\Users\%USERNAME%\Documents"
        "C:\Users\%USERNAME%\Desktop\Jc"
        "C:\Users\%USERNAME%\Desktop\Jc\Claude"
        "C:\ComfyUI"
    ) do (
        if not defined COMFY_DIR call :deep_search "%%~S"
    )
)

REM --- 3. Last resort: scan C:\ (slow; only if nothing else worked) ---
if not defined COMFY_DIR (
    echo Still searching, scanning C:\ for ComfyUI installations...
    call :deep_search "C:\"
)

echo.

REM --- If nothing was found, give up with a clear message ---
if not defined COMFY_DIR (
    echo [ERROR] ComfyUI Portable was not found anywhere on this PC.
    echo.
    echo Please locate the folder that contains BOTH:
    echo     python_embeded\python.exe
    echo     ComfyUI\main.py
    echo.
    echo Then edit the COMFY_DIR line at the top of this .bat file:
    echo     set "COMFY_DIR=C:\Path\To\Your\ComfyUI_windows_portable"
    pause
    exit /b 1
)

REM --- Final validation ---
if not exist "%COMFY_DIR%\python_embeded\python.exe" (
    echo [ERROR] COMFY_DIR is set to:
    echo         %COMFY_DIR%
    echo but python_embeded\python.exe was not found there.
    pause
    exit /b 1
)
if not exist "%COMFY_DIR%\ComfyUI\main.py" (
    echo [ERROR] COMFY_DIR is set to:
    echo         %COMFY_DIR%
    echo but ComfyUI\main.py was not found there.
    pause
    exit /b 1
)

echo [OK]  ComfyUI Portable detected at:
echo       %COMFY_DIR%
echo.

REM --- Auto-detect Animiko: try the configured path, then known alternates,
REM     then %USERPROFILE% variants. First valid match wins. ---
if not exist "%ANIMIKO_DIR%\package.json" set "ANIMIKO_DIR="

if not defined ANIMIKO_DIR call :find_animiko "C:\Users\ongcz\Desktop\Jc\Claude\animiko-local"
if not defined ANIMIKO_DIR call :find_animiko "%USERPROFILE%\Desktop\Jc\Claude\animiko-local"
if not defined ANIMIKO_DIR call :find_animiko "C:\Users\Charm\Desktop\Jc\Claude\animiko-local"
if not defined ANIMIKO_DIR call :find_animiko "C:\Users\ongcz\Desktop\animiko-local"
if not defined ANIMIKO_DIR call :find_animiko "%USERPROFILE%\Desktop\animiko-local"
if not defined ANIMIKO_DIR call :find_animiko "C:\Users\Charm\Desktop\animiko-local"

REM --- If still nothing, auto-clone into the configured destination ---
if not defined ANIMIKO_DIR (
    echo [INFO] No Animiko clone found; cloning into:
    echo        %ANIMIKO_CLONE_DIR%
    REM   Make sure the parent folder exists.
    for %%X in ("%ANIMIKO_CLONE_DIR%") do set "_animiko_parent=%%~dpX"
    if not exist "!_animiko_parent!" (
        mkdir "!_animiko_parent!" 2>nul
        if errorlevel 1 (
            echo [ERROR] Could not create parent folder:
            echo         !_animiko_parent!
            echo Check that the user profile exists and you have write access,
            echo or edit ANIMIKO_CLONE_DIR at the top of this .bat file.
            pause
            exit /b 1
        )
    )
    REM   Clone the repo.
    git clone https://github.com/JPODesign/local-ai-animation-studio.git "%ANIMIKO_CLONE_DIR%"
    if errorlevel 1 (
        echo [ERROR] git clone failed. Make sure Git is installed and on PATH:
        echo         https://git-scm.com/download/win
        pause
        exit /b 1
    )
    set "ANIMIKO_DIR=%ANIMIKO_CLONE_DIR%"
)

REM --- Final validation ---
if not exist "%ANIMIKO_DIR%\package.json" (
    echo [ERROR] Animiko folder is missing package.json:
    echo         %ANIMIKO_DIR%
    pause
    exit /b 1
)
echo [OK]  Animiko found at:
echo       %ANIMIKO_DIR%
echo.

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

REM :find_comfy <candidate>
REM   Sets COMFY_DIR to %~1 if it contains both python_embeded\python.exe
REM   and ComfyUI\main.py.
:find_comfy
if defined COMFY_DIR goto :eof
if not exist "%~1\python_embeded\python.exe" goto :eof
if not exist "%~1\ComfyUI\main.py" goto :eof
set "COMFY_DIR=%~1"
goto :eof

REM :find_animiko <candidate>
REM   Sets ANIMIKO_DIR to %~1 if it contains package.json.
:find_animiko
if defined ANIMIKO_DIR goto :eof
if not exist "%~1\package.json" goto :eof
set "ANIMIKO_DIR=%~1"
goto :eof

REM :deep_search <root>
REM   Recursively scans <root> for any "ComfyUI\main.py" file and, for each
REM   one found, validates that the grandparent folder also has
REM   python_embeded\python.exe (i.e. is a real ComfyUI Portable install).
REM   Stops at the first valid match.
:deep_search
if defined COMFY_DIR goto :eof
if not exist "%~1" goto :eof
for /f "usebackq delims=" %%F in (`dir /b /s "%~1\main.py" 2^>nul ^| findstr /i /c:"\ComfyUI\main.py"`) do (
    if not defined COMFY_DIR call :promote_to_root "%%F"
)
goto :eof

REM :promote_to_root <path\to\ComfyUI\main.py>
REM   Computes the grandparent directory of the given main.py and feeds it
REM   to :find_comfy.
:promote_to_root
if defined COMFY_DIR goto :eof
REM %~dp1 is "...\ComfyUI\" — strip trailing backslash, then take its parent.
set "_dp=%~dp1"
if "!_dp:~-1!"=="\" set "_dp=!_dp:~0,-1!"
for %%X in ("!_dp!") do set "_root=%%~dpX"
if "!_root:~-1!"=="\" set "_root=!_root:~0,-1!"
call :find_comfy "!_root!"
goto :eof
