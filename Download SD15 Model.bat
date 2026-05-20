@echo off
setlocal enabledelayedexpansion

REM =====================================================================
REM   Download Stable Diffusion 1.5 (emaonly) for Animiko / ComfyUI
REM
REM   Auto-detects your ComfyUI Portable folder, downloads
REM     v1-5-pruned-emaonly.safetensors  (~4.27 GB)
REM   from Hugging Face into <ComfyUI>\models\checkpoints\, and
REM   verifies the size before reporting success.
REM
REM   Uses curl.exe, which ships with Windows 10/11 by default.
REM =====================================================================

set "MODEL_FILE=v1-5-pruned-emaonly.safetensors"
set "MODEL_URL=https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors"
set "EXPECTED_BYTES=4265146304"
set "MIN_BYTES=1000000000"

REM --- Manual override (paste your ComfyUI Portable folder if auto-detect fails) ---
set "COMFY_DIR=C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"

REM --- Auto-detect candidates (same list as Start Animiko Local.bat) ---
if defined COMFY_DIR (
    if not exist "!COMFY_DIR!\python_embeded\python.exe" set "COMFY_DIR="
    if defined COMFY_DIR if not exist "!COMFY_DIR!\ComfyUI\main.py" set "COMFY_DIR="
)
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Desktop\ComfyUI_windows_portable"
if not defined COMFY_DIR call :find_comfy "C:\Users\%USERNAME%\Downloads\ComfyUI_windows_portable"

echo ============================================================
echo   Download SD 1.5 (emaonly) for ComfyUI
echo ============================================================
echo.

if not defined COMFY_DIR (
    echo [ERROR] ComfyUI Portable was not found.
    echo Edit COMFY_DIR at the top of this .bat file to point at
    echo the folder that contains python_embeded\ and ComfyUI\.
    pause
    exit /b 1
)

set "CHECKPOINT_DIR=%COMFY_DIR%\ComfyUI\models\checkpoints"
set "TARGET=%CHECKPOINT_DIR%\%MODEL_FILE%"

echo ComfyUI:    %COMFY_DIR%
echo Target dir: %CHECKPOINT_DIR%
echo Target file:%TARGET%
echo Model URL:  %MODEL_URL%
echo Expected:   %EXPECTED_BYTES% bytes (~4.27 GB)
echo.

REM --- Make sure curl.exe is available ---
where curl.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] curl.exe was not found on PATH.
    echo Windows 10 build 17063+ and Windows 11 ship with curl by default.
    echo If yours is older, install it from https://curl.se/windows/ or use Chocolatey:
    echo     choco install curl
    pause
    exit /b 1
)

REM --- Make sure the checkpoints folder exists ---
if not exist "%CHECKPOINT_DIR%" (
    mkdir "%CHECKPOINT_DIR%" 2>nul
    if errorlevel 1 (
        echo [ERROR] Could not create %CHECKPOINT_DIR%
        pause
        exit /b 1
    )
)

REM --- Skip if already present and the right size ---
if exist "%TARGET%" (
    for %%A in ("%TARGET%") do set "EXIST_BYTES=%%~zA"
    if !EXIST_BYTES! GEQ %MIN_BYTES% (
        echo [SKIP] Model already installed:
        echo        %TARGET%
        echo        Size: !EXIST_BYTES! bytes
        echo.
        goto :done
    ) else (
        echo [WARN] An incomplete file is already there ^(!EXIST_BYTES! bytes^).
        echo        Deleting and re-downloading.
        del "%TARGET%" 2>nul
    )
)

echo Downloading... ^(this is a ~4 GB file, expect 5-20 minutes^)
echo Progress bar below; one '#' = ~2%% complete.
echo.

REM curl flags:
REM   -L         follow redirects (HuggingFace redirects to CDN)
REM   --fail     non-zero exit on HTTP 4xx/5xx
REM   --retry 3  retry transient network errors
REM   --retry-delay 3
REM   -#         simple progress bar
REM   -o <file>  output to file
REM   -C -       resume partial download (in case bat is re-run after a fail)
curl.exe -L --fail --retry 3 --retry-delay 3 -C - -# -o "%TARGET%" "%MODEL_URL%"
set "CURL_EXIT=%ERRORLEVEL%"

echo.
if not "%CURL_EXIT%"=="0" (
    echo [ERROR] curl exited with code %CURL_EXIT%.
    echo Common causes: no internet, HuggingFace temporarily down, disk full,
    echo or the URL has moved.  You can re-run this script — partial downloads
    echo will resume automatically.
    pause
    exit /b 1
)

if not exist "%TARGET%" (
    echo [ERROR] Download finished but the file is missing:
    echo         %TARGET%
    pause
    exit /b 1
)

for %%A in ("%TARGET%") do set "FINAL_BYTES=%%~zA"
echo Downloaded size: !FINAL_BYTES! bytes
if !FINAL_BYTES! LSS %MIN_BYTES% (
    echo [ERROR] File is much smaller than expected ^(under 1 GB^).
    echo         The download may have hit an error page. Delete the file
    echo         and re-run this script.
    pause
    exit /b 1
)

:done
echo.
echo ============================================================
echo   Done!  SD 1.5 model is installed.
echo ============================================================
echo   File: %TARGET%
echo.
echo   Next steps inside Animiko:
echo     1. If ComfyUI is running, restart it so it picks up the new model.
echo        (Stop the ComfyUI terminal window and re-run Start Animiko Local.bat.)
echo     2. Local AI Setup -^> Test Connection -^> badge should turn emerald.
echo     3. The 'Installed checkpoints' card should show 1+ models.
echo     4. Click 'Create Test Workflow' -^> it will auto-use this model.
echo     5. Studio panel: AI Model = Local ComfyUI Workflow
echo        type a prompt, click Generate Animation.
echo     6. ComfyUI terminal should print 'got prompt' within ~1 second.
echo ============================================================
pause
endlocal
exit /b 0

REM ====================== Subroutines ======================
:find_comfy
if defined COMFY_DIR goto :eof
if not exist "%~1\python_embeded\python.exe" goto :eof
if not exist "%~1\ComfyUI\main.py" goto :eof
set "COMFY_DIR=%~1"
goto :eof
