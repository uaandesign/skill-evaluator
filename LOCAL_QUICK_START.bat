@echo off
REM ===================================================================
REM Skill Evaluator - Local Quick Start (Windows)
REM ===================================================================

setlocal enabledelayedexpansion

echo.
echo ===================================================================
echo   Skill Evaluator - Local Quick Start (Windows)
echo ===================================================================
echo.

REM Check for Node.js
echo Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo Current version: %NODE_VERSION%
echo.

REM Check .env.local
echo Checking environment configuration...
if not exist ".env.local" (
    echo .env.local not found, copying from .env.example...
    copy .env.example .env.local
    echo.
    echo IMPORTANT: Please edit .env.local and add at least one LLM API Key:
    echo   - OPENAI_API_KEY (Recommended)
    echo   - ANTHROPIC_API_KEY
    echo   - Or other supported API Key
    echo.
    echo .env.local has been created. Please edit it and run this script again.
    pause
    exit /b 1
) else (
    echo .env.local exists
)
echo.

REM Check dependencies
echo Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies (this may take a few minutes)...
    call npm install
    echo Dependencies installed!
) else (
    echo Dependencies already installed
)
echo.

REM Start the app
echo ===================================================================
echo.
echo Starting application...
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo.
echo   Press Ctrl+C to stop
echo.
echo ===================================================================
echo.

call npm run dev
pause
