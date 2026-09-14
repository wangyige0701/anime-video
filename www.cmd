@echo off

if exist "server/www" (
    rmdir /s /q "server/www"
)

xcopy "web/dist" "server/www" /e /i /q
