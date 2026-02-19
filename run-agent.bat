@echo off
chcp 65001 >nul

REM =========================================================
REM TERMINAL AGENT LAUNCHER - AUTOMATIC MODE
REM =========================================================

REM Path to Python script - USE ABSOLUTE PATH
set "PYTHON_SCRIPT=C:\Users\MagnusMinds\Desktop\terminal-agent\cli.py"

REM Activate virtual environment - USE ABSOLUTE PATH
call "C:\Users\MagnusMinds\Desktop\terminal-agent\env\Scripts\activate.bat"

REM =========================================================
REM Determine sandbox directory
REM If argument passed from UI, use it. Otherwise use current folder
REM =========================================================
set "CURRENT_DIR=%CD%"
if not "%~1"=="" set "CURRENT_DIR=%~1"

echo 📁 Sandbox folder: %CURRENT_DIR%
echo 🔐 This will be your sandbox boundary
echo.

REM =========================================================
REM Check Python availability
REM =========================================================
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Python not found!
    exit /b 1
)

REM Check if cli.py exists
if not exist "%PYTHON_SCRIPT%" (
    echo ❌ cli.py not found at:
    echo %PYTHON_SCRIPT%
    exit /b 1
)

REM =========================================================
REM Launch Terminal Agent
REM =========================================================
echo 🚀 Starting Terminal Agent...
python "%PYTHON_SCRIPT%" "%CURRENT_DIR%"

REM =========================================================
REM Optional: Pause if launched manually (no argument)
REM =========================================================
if "%~1"=="" (
    echo.
    echo ⏸️  Session ended. Window will close in 5 seconds...
    timeout /t 5 >nul
)
