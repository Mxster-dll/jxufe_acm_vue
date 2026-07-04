@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  Server Config
:: ============================================================
set SERVER_IP=47.99.92.213
set SERVER_USER=root
set SERVER_PORT=22
set REMOTE_PATH=/var/www/jxufe_acm_vue
:: ============================================================

title Deploy to %SERVER_USER%@%SERVER_IP%

echo.
echo ============================================
echo   jxufe ACM Deploy Script
echo ============================================
echo.

:: ---- 1. Clean & Upload ----
echo [1/3] Cleaning remote and uploading...

:: Clean remote directories
ssh -p %SERVER_PORT% %SERVER_USER%@%SERVER_IP% "rm -rf %REMOTE_PATH%/src %REMOTE_PATH%/public"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to clean remote directories!
    pause
    exit /b 1
)

:: Upload everything
scp -P %SERVER_PORT% -r src public package.json package-lock.json vite.config.js index.html %SERVER_USER%@%SERVER_IP%:%REMOTE_PATH%
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Upload failed! Check network / SSH connection.
    pause
    exit /b 1
)
echo [OK] Upload completed
echo.

:: ---- 2. Build on server ----
echo [2/3] npm install ^&^& npm run build on server...
ssh -p %SERVER_PORT% %SERVER_USER%@%SERVER_IP% "cd %REMOTE_PATH% && npm install && npm run build"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed on server!
    pause
    exit /b 1
)
echo [OK] Build completed
echo.

:: ---- 3. Reload Nginx ----
echo [3/3] Reload Nginx...
ssh -p %SERVER_PORT% %SERVER_USER%@%SERVER_IP% "systemctl reload nginx"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Nginx reload failed! Check server status.
    pause
    exit /b 1
)
echo [OK] Nginx reloaded
echo.

echo ============================================
echo   Deploy success!
echo ============================================
echo.
pause
