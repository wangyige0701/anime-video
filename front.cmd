@echo off
setlocal

call pnpm --dir "%~dp0." --filter web run %*

endlocal
