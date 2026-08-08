@echo off
setlocal
chcp 65001 >nul

pushd "%~dp0\server" || exit /b
call pnpm run %*
popd

endlocal
