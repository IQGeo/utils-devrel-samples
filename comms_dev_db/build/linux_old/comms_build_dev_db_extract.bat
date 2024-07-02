@echo off
:: Build Comms Dev Database

setlocal
if "%ProgramFiles(x86)%"=="" set ProgramFiles(x86)=%ProgramFiles%

:: Init environment
set PATH=%~dp0\..\..\..\..\..\Tools;%PATH%
call myw_env

:: Run command
call python %~dpn0.py %*
