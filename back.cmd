@echo off
setlocal
chcp 65001 >nul

if /i "%~1"=="cli" (
	call node "%~dp0server\cli-launcher.mjs" %*
) else (
	call pnpm --dir "%~dp0." --filter server run %*
)

set "exitCode=%errorlevel%"
endlocal & exit /b %exitCode%
