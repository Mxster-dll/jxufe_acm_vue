@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

:: ============================================================
::  jxufe ACM website - one click deploy (Windows)
::
::  Server : root@47.99.92.213
::  Site   : https://jxufe-acm.cn   (nginx root: /var/www/jxufe_acm_vue/dist)
::
::  Auth   : SSH key .deploy\id_ed25519  (no password needed)
::           If the server is ever rebuilt, re-install the key with:
::             type .deploy\id_ed25519.pub | ssh root@47.99.92.213
::               "mkdir -p /root/.ssh && cat >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"
:: ============================================================

:: ---- Server config ----
set SERVER_IP=47.99.92.213
set SERVER_USER=root
set SERVER_PORT=22
set REMOTE_PATH=/var/www/jxufe_acm_vue
set SITE_URL=https://jxufe-acm.cn

:: ---- Local config (leave as is) ----
:: scripts\gen_hero_wall.mjs 必须上传：package.json 的 prebuild 钩子在服务器上 npm run build
:: 时会跑它，重扫 public/images/excellent_member/ 生成头像墙清单。
:: scripts\gen_group_wall.mjs 同理 —— 它从 group_members.json / duties.json / awards/ 生成
:: 协会成员头像墙的清单与文案（prebuild 也跑它）。**两个都要传**，少一个服务器构建直接失败。
:: （scripts 里的其它文件服务器上用不到，只传这两个。缩略图生成器是 PowerShell 脚本，
::   只在本地跑，不进 UPLOAD_ITEMS。）
set UPLOAD_ITEMS=src public package.json package-lock.json vite.config.js index.html scripts\gen_hero_wall.mjs scripts\gen_group_wall.mjs
set KEY_FILE=%~dp0.deploy\id_ed25519
set TAR_FILE=%TEMP%\jxufe_acm_deploy.tar.gz
set REMOTE_TAR=/tmp/jxufe_acm_deploy.tar.gz
set TARGET=%SERVER_USER%@%SERVER_IP%
set SSH_OPTS=-p %SERVER_PORT% -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o IdentitiesOnly=yes -i "%KEY_FILE%"
set SCP_OPTS=-P %SERVER_PORT% -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o IdentitiesOnly=yes -i "%KEY_FILE%"

cd /d "%~dp0"
title Deploy jxufe ACM to %SERVER_IP%

echo.
echo ============================================
echo   jxufe ACM Deploy Script
echo   Target: %TARGET%:%REMOTE_PATH%
echo ============================================
echo.

:: ---- 1. Local pre-checks ----
echo [1/5] Local pre-checks...
if not exist "%KEY_FILE%" (
    echo [ERROR] Deploy key not found: "%KEY_FILE%"
    goto :fail
)
if not exist "src\main.js" (
    echo [ERROR] "src\main.js" not found. Run this script from the project folder.
    goto :fail
)
if not exist "package.json" (
    echo [ERROR] package.json not found.
    goto :fail
)
where tar >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows 'tar' command not found ^(needs Windows 10 1803+^).
    goto :fail
)

:: ---- 2. Pack project files locally ----
echo [2/5] Packing project files...
if exist "%TAR_FILE%" del /q "%TAR_FILE%"
tar -czf "%TAR_FILE%" %UPLOAD_ITEMS%
if errorlevel 1 (
    echo [ERROR] Failed to create archive.
    goto :fail
)

:: ---- 3. Upload and unpack on server ----
echo [3/5] Uploading to server...
ssh %SSH_OPTS% %TARGET% "mkdir -p %REMOTE_PATH%"
if errorlevel 1 (
    echo [ERROR] Cannot connect to %TARGET% via SSH.
    echo         Check the network, or re-install the deploy key ^(see header^).
    goto :fail
)
scp %SCP_OPTS% "%TAR_FILE%" %TARGET%:%REMOTE_TAR%
if errorlevel 1 (
    echo [ERROR] Upload failed.
    goto :fail
)
ssh %SSH_OPTS% %TARGET% "rm -rf %REMOTE_PATH%/src %REMOTE_PATH%/public && tar -xzf %REMOTE_TAR% -C %REMOTE_PATH% && rm -f %REMOTE_TAR%"
if errorlevel 1 (
    echo [ERROR] Failed to unpack archive on server.
    goto :fail
)
echo [OK] Upload completed
echo.

:: ---- 4. Install deps and build on server ----
echo [4/5] npm install ^&^& npm run build on server...
ssh %SSH_OPTS% %TARGET% "cd %REMOTE_PATH% && npm install --no-audit --no-fund && npm run build"
if errorlevel 1 (
    echo [ERROR] Build failed on server. See npm output above.
    goto :fail
)
ssh %SSH_OPTS% %TARGET% "test -f %REMOTE_PATH%/dist/index.html"
if errorlevel 1 (
    echo [ERROR] Build finished but dist/index.html is missing.
    goto :fail
)
echo [OK] Build completed
echo.

:: ---- 5. Reload nginx and verify site ----
echo [5/5] Reloading nginx...
ssh %SSH_OPTS% %TARGET% "nginx -t && systemctl reload nginx"
if errorlevel 1 (
    echo [ERROR] Nginx test/reload failed.
    goto :fail
)
echo [OK] Nginx reloaded
echo.
echo Verifying %SITE_URL% ...
ssh %SSH_OPTS% %TARGET% "curl -s -o /dev/null -w 'HTTP %%{http_code}\n' -k %SITE_URL%/"

echo.
echo ============================================
echo   Deploy success!
echo   %SITE_URL%
echo ============================================
echo.
if "%DEPLOY_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0

:fail
echo.
echo ============================================
echo   DEPLOY FAILED - see the error above
echo ============================================
echo.
if "%DEPLOY_NO_PAUSE%"=="1" exit /b 1
pause
exit /b 1
