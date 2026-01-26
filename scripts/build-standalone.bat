@echo off
REM Build ThermoRaw as a standalone executable for Windows
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
set FRONTEND_DIR=%ROOT_DIR%\apps\frontend
set BACKEND_DIR=%ROOT_DIR%\apps\backend

echo === ThermoRaw Standalone Build ===
echo.

REM Check for required tools
where node >nul 2>&1 || (echo Error: node is required but not installed. && exit /b 1)
where npm >nul 2>&1 || (echo Error: npm is required but not installed. && exit /b 1)
where python >nul 2>&1 || (echo Error: python is required but not installed. && exit /b 1)

REM Step 1: Build frontend
echo [1/4] Building frontend...
cd /d "%FRONTEND_DIR%"
call npm ci
if errorlevel 1 (echo Frontend npm ci failed && exit /b 1)
call npm run build
if errorlevel 1 (echo Frontend build failed && exit /b 1)
echo Frontend built successfully.
echo.

REM Step 2: Copy frontend build to backend static folder
echo [2/4] Copying frontend to backend static folder...
if exist "%BACKEND_DIR%\src\thermo_raw\static" rmdir /s /q "%BACKEND_DIR%\src\thermo_raw\static"
mkdir "%BACKEND_DIR%\src\thermo_raw\static"
xcopy /E /I /Q "%FRONTEND_DIR%\dist\*" "%BACKEND_DIR%\src\thermo_raw\static\"
echo Frontend copied to backend.
echo.

REM Step 3: Check for ThermoRawFileParser
echo [3/4] Checking for ThermoRawFileParser...
set PARSER_ZIP=%BACKEND_DIR%\vendor\ThermoRawFileParser.zip

if exist "%PARSER_ZIP%" (
    echo ThermoRawFileParser found at %PARSER_ZIP%
) else (
    echo WARNING: ThermoRawFileParser not found at %PARSER_ZIP%
    echo Download from: https://github.com/compomics/ThermoRawFileParser/releases
    echo Place the zip file in: %BACKEND_DIR%\vendor\
    echo.
    echo Continuing build without ThermoRawFileParser...
    echo ^(The app will work but won't convert .raw files^)
)
echo.

REM Step 4: Build executable with PyInstaller
echo [4/4] Building executable with PyInstaller...
cd /d "%BACKEND_DIR%"

REM Create virtual environment if needed
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate venv and install dependencies
call .venv\Scripts\activate.bat
pip install -q --upgrade pip
pip install -q pyinstaller

REM Install project dependencies with GUI extras (using pyproject.toml)
pip install -q -e ".[gui]"

REM Run PyInstaller
pyinstaller thermoraw.spec --clean --noconfirm

echo.
echo === Build Complete ===
echo Executable: %BACKEND_DIR%\dist\ThermoRaw.exe
echo.
echo To run: %BACKEND_DIR%\dist\ThermoRaw.exe
echo.
echo The app will:
echo   1. Open a native window with the ThermoRaw interface
echo   2. Store data in %%USERPROFILE%%\ThermoRaw\data\

endlocal
