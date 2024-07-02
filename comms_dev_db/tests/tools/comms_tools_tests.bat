@echo off
:: Run CLI tools test suite

setlocal

:: Init environment
call %~dp0\..\..\..\..\..\..\Tools\myw_env
set PATH=%~dp0\..\..\..\dev_tools\tools;%PATH%
set PATH=%~dp0\..\..\..\comms\tools;%PATH%

:: Run command
call py %~dpn0.py %*
