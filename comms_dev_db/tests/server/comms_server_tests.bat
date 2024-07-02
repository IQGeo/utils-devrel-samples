@echo off
:: Run a python command

setlocal

:: Set location of INI file
set MYW_APP_ROOT=%~dp0\..\..\..\..\..

:: Init environment
call %MYW_APP_ROOT%\..\Tools\myw_env

:: Run command
call python %~dpn0.py %*
