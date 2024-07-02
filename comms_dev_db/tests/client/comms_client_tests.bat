@echo off
:: Run client test suite

setlocal

:: Init environment
call %~dp0\..\..\..\..\..\..\Tools\myw_env

:: Make selenium drivers accessible
set PATH=c:\Program_Files\Selenium\drivers;%PATH%

:: Run command
call python %~dpn0.py %*
