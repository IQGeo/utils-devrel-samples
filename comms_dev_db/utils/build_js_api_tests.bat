@echo off
:: Start the JS API Test watch process

pushd %~dp0\..\..\..

echo Building build-applications-dev
echo Target: %CD%
echo.

:: Find a way to pass --no-progress --no-colo
call npm run build-applications-dev 2>&1 | find /v "%%"
