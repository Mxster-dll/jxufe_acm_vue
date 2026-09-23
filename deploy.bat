@echo off
setlocal enabledelayedexpansion

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
::
::  NOTE: keep this file PURE ASCII. Chinese (or any non-ASCII) text in a
::        .bat combined with the "chcp" command makes cmd.exe resume reading
::        the file at a wrong byte offset and execute a fragment of a comment
::        as a command. Non-ASCII here = flaky script.
:: ============================================================

:: ---- Server config ----
set SERVER_IP=47.99.92.213
set SERVER_USER=root
set SERVER_PORT=22
set REMOTE_PATH=/var/www/jxufe_acm_vue
set SITE_URL=https://jxufe-acm.cn

:: ---- Local config (leave as is) ----
:: The "prebuild" hook in package.json runs these TWO generators on the server
:: during "npm run build":
::   scripts/gen_group_wall.mjs    club member wall (group_wall.*.json + excellent_members.json)
::                                 from group_members.json, duties.json, scholarships.json,
::                                 wall_rules.json, awards/ and the two site rosters.
::   scripts/gen_event_badges.mjs  timeline medal badges (event_badges.json) from awards/ + events/.
:: BOTH must be uploaded - miss one and the server build fails outright
:: (node cannot find the file -> "npm run build" exits non-zero -> deploy stops at step 4).
:: NOT uploaded on purpose:
::   scripts/gen_hero_wall.mjs     the upstream author's 33-avatar wall pipeline. Its product
::                                 (hero_wall.manifest.json) has no consumer left in src/ -
::                                 the home wall reads group_wall.* instead - so it was taken
::                                 out of predev/prebuild as well. Run it by hand if ever needed:
::                                 "npm run data:hero-wall".
::   scripts/*.ps1                 thumbnail generators (PowerShell, Windows only, local only).
set UPLOAD_ITEMS=src public package.json package-lock.json vite.config.js index.html scripts\gen_group_wall.mjs scripts\gen_event_badges.mjs
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

:: Tighten the private key ACL. OpenSSH refuses a key that other accounts can
:: read ("UNPROTECTED PRIVATE KEY FILE") and then the whole deploy fails with
:: "Permission denied (publickey)" - which is what happens when the project is
:: copied to a folder that inherits broad permissions (e.g. another drive).
:: Harmless when the key is already fine.
icacls "%KEY_FILE%" /inheritance:r >nul 2>nul
icacls "%KEY_FILE%" /grant:r "%USERNAME%:R" >nul 2>nul

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
    echo         Check the network. If it says "UNPROTECTED PRIVATE KEY FILE",
    echo         run: icacls ".deploy\id_ed25519" /inheritance:r /grant:r "%%USERNAME%%:R"
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
