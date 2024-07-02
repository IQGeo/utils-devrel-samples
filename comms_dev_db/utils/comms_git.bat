@echo off
:: Run git command %* on the comms modules
::
setlocal

set modules=%~dp0\..\..

pushd %modules%
git %*
popd
echo.
