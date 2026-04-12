@echo off
setlocal

pushd "%~dp0\web" || exit /b
call pnpm run %*
popd

endlocal
