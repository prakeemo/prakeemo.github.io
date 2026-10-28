@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
echo [푸시] 사진 용량 최적화·컬렉션 동기화 후 Git 푸시...
echo.
node tools/sync-and-push.js
echo.
pause
