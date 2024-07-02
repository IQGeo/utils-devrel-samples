@echo off
:: Util to run tests, send output to log file

setlocal
set here=%~dp0

:: Setup environment
call %here%\..\..\..\..\..\Tools\myw_env

python %here%\%~n0.py %*
