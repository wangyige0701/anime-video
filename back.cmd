@echo off
setlocal
chcp 65001 >nul

call pnpm --dir "%~dp0." --filter server run %*

endlocal
