@echo off
setlocal

pushd "%~dp0\www" || exit /b
call pnpm run %*
popd

endlocal
