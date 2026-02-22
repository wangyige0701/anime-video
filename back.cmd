@echo off
setlocal

pushd "%~dp0\server" || exit /b
call pnpm run %*
popd

endlocal
